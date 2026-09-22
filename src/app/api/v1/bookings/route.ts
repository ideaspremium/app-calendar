import { createHash } from "crypto";
import { authenticate } from "@/lib/api/auth";
import {
  alternativesFor,
  assertSlotBookable,
  createAtProvider,
  releaseAbandonedPending,
  STALE_PENDING_MS,
} from "@/lib/api/booking-flow";
import {
  buildAnswers,
  parseAttendee,
  professionalFor,
  serializeBooking,
  type BookingRow,
} from "@/lib/api/bookings";
import { bookingTarget, loadCalendar, resolveService, type CalendarCtx } from "@/lib/api/calendars";
import { ApiError, handler, json, optString, readJson, type Ctx } from "@/lib/api/http";
import { MINUTE_MS, parseInstant } from "@/lib/api/time";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EventType } from "@/lib/types";

export const dynamic = "force-dynamic";
// Crear en Nylas puede tardar; el límite por defecto de Vercel se queda corto.
export const maxDuration = 30;

/** JSON con las claves ordenadas: el mismo cuerpo da siempre el mismo hash. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const PG_UNIQUE = "23505";
const PG_EXCLUSION = "23P01";

/**
 * Crear cita.
 *
 * La idempotencia la garantiza la base de datos: la fila se inserta en `pending` con la
 * restricción única (client_id, idempotency_key) ANTES de llamar a Nylas. Dos
 * peticiones con la misma clave no pueden crear dos citas aunque lleguen a la vez, y
 * la restricción de exclusión por tramo horario impide dos citas solapadas en el mismo
 * calendario aunque las claves sean distintas.
 */
export const POST = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  const body = await readJson(req);

  const idem = (req.headers.get("idempotency-key") ?? (typeof body.idempotency_key === "string" ? body.idempotency_key : "")).trim();
  if (!idem) {
    throw new ApiError("idempotency_key_required", "Falta la cabecera «Idempotency-Key»: un valor único por intento de reserva.");
  }
  if (idem.length > 255) {
    throw new ApiError("invalid_request", "«Idempotency-Key» admite como mucho 255 caracteres.", { details: { field: "Idempotency-Key" } });
  }
  const { idempotency_key: _ignored, ...payload } = body;
  const requestHash = createHash("sha256").update(canonical(payload)).digest("hex");

  // Validación de formato: no depende del momento ni de la agenda.
  const start = parseInstant(body.start, "start");
  const endIn = body.end !== undefined && body.end !== null && body.end !== "" ? parseInstant(body.end, "end") : null;
  if (endIn && endIn <= start) {
    throw new ApiError("invalid_request", "«end» debe ser posterior a «start».", { details: { field: "end" } });
  }
  const attendee = parseAttendee(body.attendee);
  const notes = optString(body, "notes", 2000);
  const externalRef = optString(body, "external_ref", 255);

  const cal = await loadCalendar(key, body.calendar_id);
  const durationIn = endIn ? Math.round((endIn.getTime() - start.getTime()) / MINUTE_MS) : null;
  const service = resolveService(cal, body.service_id, durationIn);
  const end = endIn ?? new Date(start.getTime() + service.duration_minutes * MINUTE_MS);
  if (Math.round((end.getTime() - start.getTime()) / MINUTE_MS) !== service.duration_minutes) {
    throw new ApiError("invalid_duration", `El servicio «${service.name}» dura ${service.duration_minutes} minutos.`, {
      details: { duration_minutes: service.duration_minutes },
    });
  }
  const answers = buildAnswers(service, attendee, body.answers);
  const conn = professionalFor(cal, service, body.professional_id);
  const tz = attendee.timezone ?? cal.client.timezone;
  const db = supabaseAdmin();

  // ¿Reintento de una petición ya vista?
  const existing = await findByKey(cal.client.id, idem);
  if (existing) return replay(ctx, cal, service, existing, requestHash, attendee, answers, tz);

  bookingTarget(cal, service);
  const { nearby } = await assertSlotBookable(cal, service, start, end, tz);

  const row = {
    client_id: cal.client.id,
    event_type_id: service.id,
    calendar_connection_id: conn?.id ?? null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    invitee_name: attendee.name,
    invitee_email: attendee.email,
    invitee_phone: attendee.phone,
    invitee_timezone: tz,
    invitee_locale: (attendee.language ?? cal.client.locale ?? "es").slice(0, 10),
    answers,
    notes,
    status: "pending",
    source: "api",
    api_key_id: key.id,
    idempotency_key: idem,
    request_hash: requestHash,
    external_ref: externalRef,
  };
  const insert = () => db.from("bookings").insert(row).select("*").single();
  let { data: inserted, error } = await insert();
  // Solapa con una fila a medias abandonada: se libera y se intenta una vez más.
  if (error?.code === PG_EXCLUSION && (await releaseAbandonedPending(cal.client.id, start, end))) {
    ({ data: inserted, error } = await insert());
  }

  if (error) {
    if (error.code === PG_UNIQUE && /idempotency/.test(error.message)) {
      // Otra petición con la misma clave ganó la carrera por milisegundos.
      const again = await findByKey(cal.client.id, idem);
      if (again) return replay(ctx, cal, service, again, requestHash, attendee, answers, tz);
    }
    if (error.code === PG_EXCLUSION) {
      throw new ApiError("slot_taken", "Ese hueco acaba de ocuparse.", {
        alternatives: await alternativesFor(cal, service, start, tz, {
          nearby: nearby.filter((x) => x.start.getTime() !== start.getTime()),
        }),
      });
    }
    throw new Error(`insert booking: ${error.message}`);
  }

  const saved = await createAtProvider(cal, service, inserted as BookingRow, attendee, answers, tz, nearby);
  return json(ctx, serializeBooking(cal, saved), 201);
});

async function findByKey(clientId: string, idem: string) {
  const { data } = await supabaseAdmin()
    .from("bookings")
    .select("*")
    .eq("client_id", clientId)
    .eq("idempotency_key", idem)
    .maybeSingle();
  return data as BookingRow | null;
}

/**
 * Misma clave otra vez:
 *   - con otros datos           → idempotency_key_reused
 *   - cita ya creada            → la misma respuesta (200, Idempotent-Replayed: true)
 *   - creación aún en curso     → request_in_progress
 *   - creación que se quedó a medias hace rato → se retoma con la misma fila
 */
async function replay(
  ctx: Ctx,
  cal: CalendarCtx,
  service: EventType,
  row: BookingRow,
  requestHash: string,
  attendee: ReturnType<typeof parseAttendee>,
  answers: Record<string, string>,
  tz: string
) {
  const db = supabaseAdmin();
  if (row.request_hash && row.request_hash !== requestHash) {
    throw new ApiError("idempotency_key_reused", "Esa Idempotency-Key ya se usó con otros datos. Usa una clave nueva para otra reserva.", {
      details: { booking_id: row.id },
    });
  }
  if (row.status !== "pending" || row.nylas_booking_id) {
    let current = row;
    if (row.status === "pending" && row.nylas_booking_id) {
      // El webhook de Nylas la enlazó mientras esta petición no llegaba a confirmarla.
      const { data } = await db.from("bookings").update({ status: "confirmed" }).eq("id", row.id).eq("status", "pending").select("*").maybeSingle();
      current = (data as BookingRow | null) ?? { ...row, status: "confirmed" };
    }
    return json(ctx, serializeBooking(cal, current), 200, { "Idempotent-Replayed": "true" });
  }
  if (Date.now() - Date.parse(row.updated_at) < STALE_PENDING_MS) {
    throw new ApiError("request_in_progress", "Esta reserva se está creando todavía. Reintenta con la misma clave en unos segundos.", {
      retryAfterSeconds: 5,
      details: { booking_id: row.id },
    });
  }
  // Retomar: solo una petición puede quedarse con la fila (compara updated_at).
  const { data: claimed } = await db
    .from("bookings")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .is("nylas_booking_id", null)
    .select("*")
    .maybeSingle();
  if (!claimed) {
    throw new ApiError("request_in_progress", "Esta reserva se está creando todavía. Reintenta con la misma clave en unos segundos.", {
      retryAfterSeconds: 5,
      details: { booking_id: row.id },
    });
  }
  const saved = await createAtProvider(cal, service, claimed as BookingRow, attendee, answers, tz);
  return json(ctx, serializeBooking(cal, saved), 201);
}

/** Buscar citas por la referencia externa del integrador. */
export const GET = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  const ref = new URL(req.url).searchParams.get("external_ref")?.trim();
  if (!ref) {
    throw new ApiError("invalid_request", "Indica «external_ref».", { details: { field: "external_ref" } });
  }
  const db = supabaseAdmin();
  let q = db.from("bookings").select("*").eq("external_ref", ref).order("created_at", { ascending: false }).limit(50);
  if (key.agency_id) {
    const { data: own } = await db.from("clients").select("id").eq("agency_id", key.agency_id);
    q = q.in("client_id", (own ?? []).map((c) => c.id));
  }
  const { data, error } = await q;
  if (error) throw new Error(`bookings by external_ref: ${error.message}`);
  const rows = (data ?? []) as BookingRow[];

  const calendars = new Map<string, CalendarCtx>();
  const out = [];
  for (const r of rows) {
    let cal = calendars.get(r.client_id);
    if (!cal) {
      cal = await loadCalendar(key, r.client_id);
      calendars.set(r.client_id, cal);
    }
    out.push(serializeBooking(cal, r));
  }
  return json(ctx, { data: out });
});
