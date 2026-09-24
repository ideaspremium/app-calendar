import { createHash } from "crypto";
import { canonicalJson, parseAttributionField, parseExternalRef } from "@/lib/api/attribution";
import { authenticate, type ApiKey } from "@/lib/api/auth";
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
import { bookingTarget, loadCalendar, loadContexts, resolveService, type CalendarCtx } from "@/lib/api/calendars";
import { ApiError, handler, isUuid, json, optString, readJson, type Ctx } from "@/lib/api/http";
import { MINUTE_MS, parseInstant } from "@/lib/api/time";
import { scheduleBookingEvent } from "@/lib/api/webhooks";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EventType } from "@/lib/types";

export const dynamic = "force-dynamic";
// Crear en Nylas puede tardar; el límite por defecto de Vercel se queda corto.
export const maxDuration = 30;

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
  const requestHash = createHash("sha256").update(canonicalJson(payload)).digest("hex");

  // Validación de formato: no depende del momento ni de la agenda.
  const start = parseInstant(body.start, "start");
  const endIn = body.end !== undefined && body.end !== null && body.end !== "" ? parseInstant(body.end, "end") : null;
  if (endIn && endIn <= start) {
    throw new ApiError("invalid_request", "«end» debe ser posterior a «start».", { details: { field: "end" } });
  }
  const attendee = parseAttendee(body.attendee);
  const notes = optString(body, "notes", 2000);
  const externalRef = parseExternalRef(body.external_ref);
  const attribution = parseAttributionField(body.attribution);

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
    attribution,
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
      if (data) scheduleBookingEvent(row.id, "booking.created", "api");
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

/**
 * Dos modos:
 *  - `?external_ref=…`: citas de una referencia del integrador (máx. 50, recientes primero).
 *  - `?updated_since=<ISO con desfase>&limit=<1..200>&cursor=<opaco>`: listado
 *    incremental (CONTRATO_CONVERSIONES §3.1.3) para sincronizar por pull.
 */
export const GET = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  const params = new URL(req.url).searchParams;
  if (params.has("external_ref")) return byExternalRef(ctx, key, params.get("external_ref"));
  return incremental(ctx, key, params);
});

/** Ids de los calendarios que ve la clave (también los desactivados); null = todos. */
async function visibleClientIds(key: ApiKey): Promise<string[] | null> {
  if (!key.agency_id) return null;
  const { data, error } = await supabaseAdmin().from("clients").select("id").eq("agency_id", key.agency_id);
  if (error) throw new Error(`visibleClientIds: ${error.message}`);
  return (data ?? []).map((c) => c.id);
}

async function serializeRows(rows: BookingRow[]) {
  const ctxs = await loadContexts(rows.map((r) => r.client_id));
  return rows.flatMap((r) => {
    const cal = ctxs.get(r.client_id);
    return cal ? [serializeBooking(cal, r)] : [];
  });
}

async function byExternalRef(ctx: Ctx, key: ApiKey, raw: string | null) {
  let ref = raw?.trim() ?? "";
  if (!ref) {
    throw new ApiError("invalid_request", "Indica «external_ref».", { details: { field: "external_ref" } });
  }
  // Una referencia en forma de objeto se guarda como JSON canónico: se busca igual.
  if (ref.startsWith("{")) {
    try {
      const v = JSON.parse(ref);
      if (v && typeof v === "object" && !Array.isArray(v)) ref = parseExternalRef(v) ?? ref;
    } catch {
      /* texto normal */
    }
  }
  const visible = await visibleClientIds(key);
  if (visible && !visible.length) return json(ctx, { data: [] });
  let q = supabaseAdmin().from("bookings").select("*").eq("external_ref", ref).order("created_at", { ascending: false }).limit(50);
  if (visible) q = q.in("client_id", visible);
  const { data, error } = await q;
  if (error) throw new Error(`bookings by external_ref: ${error.message}`);
  return json(ctx, { data: await serializeRows((data ?? []) as BookingRow[]) });
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

/** Instante de la base con toda su precisión (microsegundos), en UTC con «Z». */
function rawInstant(v: string) {
  return v.replace(/\+00(:?00)?$/, "Z");
}

function encodeCursor(r: BookingRow) {
  return Buffer.from(JSON.stringify([rawInstant(r.updated_at), r.id])).toString("base64url");
}

function decodeCursor(raw: string): { at: string; id: string } {
  const bad = () =>
    new ApiError("invalid_request", "«cursor» no es válido: usa el next_cursor de la respuesta anterior tal cual.", {
      details: { field: "cursor" },
    });
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(v) || v.length !== 2) throw bad();
    const [at, id] = v;
    if (typeof at !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(at) || Number.isNaN(Date.parse(at)) || !isUuid(id)) throw bad();
    return { at, id };
  } catch {
    throw bad();
  }
}

/**
 * Listado incremental. Orden (updated_at, id), paginado por cursor (sin saltos ni
 * repeticiones entre páginas). Incluye citas confirmadas, reprogramadas y canceladas;
 * no incluye las que se están creando (`pending`): aparecen cuando se confirman, porque
 * confirmarlas cambia su updated_at.
 *
 * `updated_since` es inclusivo (>=). Recomendación para quien sincroniza: guardar el
 * mayor `updated_at` recibido y pedir desde ahí menos un margen (p. ej. 2 minutos); con
 * idempotencia por id, repetir alguna cita no cuesta nada y cubre transacciones que
 * confirmen con un instante ligeramente anterior.
 */
async function incremental(ctx: Ctx, key: ApiKey, params: URLSearchParams) {
  const cursorRaw = params.get("cursor")?.trim() || null;
  const sinceRaw = params.get("updated_since")?.trim() || null;
  if (!sinceRaw && !cursorRaw) {
    throw new ApiError("invalid_request", "Indica «updated_since» (ISO 8601 con desfase) o «external_ref».", {
      details: { field: "updated_since" },
    });
  }
  const since = sinceRaw ? parseInstant(sinceRaw, "updated_since") : null;
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;

  const limitRaw = params.get("limit");
  const limit = limitRaw === null || limitRaw === "" ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError("invalid_request", `«limit» debe ser un entero entre 1 y ${MAX_LIMIT}.`, { details: { field: "limit" } });
  }

  const visible = await visibleClientIds(key);
  if (visible && !visible.length) return json(ctx, { data: [], next_cursor: null });

  // Se pide uno de más para saber si hay otra página sin hacer otra consulta.
  let q = supabaseAdmin()
    .from("bookings")
    .select("*")
    .neq("status", "pending")
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);
  if (visible) q = q.in("client_id", visible);
  if (since) q = q.gte("updated_at", since.toISOString());
  if (cursor) q = q.or(`updated_at.gt."${cursor.at}",and(updated_at.eq."${cursor.at}",id.gt.${cursor.id})`);
  const { data, error } = await q;
  if (error) throw new Error(`bookings incremental: ${error.message}`);

  const rows = (data ?? []) as BookingRow[];
  const page = rows.slice(0, limit);
  const next = rows.length > limit ? encodeCursor(page[page.length - 1]) : null;
  return json(ctx, { data: await serializeRows(page), next_cursor: next });
}
