import { createHmac, timingSafeEqual } from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { releaseAbandonedPending } from "@/lib/api/booking-flow";
import type { BookingRow } from "@/lib/api/bookings";
import { scheduleBookingEvent, type OutboundType } from "@/lib/api/webhooks";
import { takePendingAttribution } from "@/lib/booking-attribution";
import { handleCalendarEventChange } from "@/lib/calendar-sync";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { updateEventTitle } from "@/lib/nylas";

type Json = Record<string, unknown>;

/** Convierte epoch en segundos o fecha ISO a ISO; null si no es utilizable. */
function toIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Nylas usa segundos; si alguna vez llegan milisegundos, el año saldría absurdo.
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

/**
 * Último recurso: busca una clave por todo el aviso, a cualquier profundidad.
 * Existe porque el esquema de Nylas ya nos ha movido las horas de sitio una vez;
 * así un cambio suyo deja de costar un ciclo de despliegue.
 */
function deepFind(value: unknown, key: string, depth = 0): unknown {
  if (depth > 6 || !value || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    const obj = value as Json;
    if (key in obj && obj[key] != null) return obj[key];
  }
  for (const child of Object.values(value as Json)) {
    const found = deepFind(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Nombres de campos y tipos, sin valores: sirve para diagnosticar sin volcar datos personales. */
function describeShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.length ? [describeShape(value[0], depth + 1)] : [];
  if (value && typeof value === "object") {
    if (depth >= 3) return "objeto";
    return Object.fromEntries(
      Object.entries(value as Json).map(([k, v]) => [k, describeShape(v, depth + 1)])
    );
  }
  return typeof value;
}

/** Verificación inicial del webhook (Nylas envía ?challenge=...). */
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  return new NextResponse(challenge ?? "", { status: 200 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.NYLAS_WEBHOOK_SECRET;
  if (!secret) {
    // Sin esto la firma no se puede verificar y todas las reservas se pierden en silencio.
    console.error("[webhook] falta la variable de entorno NYLAS_WEBHOOK_SECRET");
    return NextResponse.json({ error: "NYLAS_WEBHOOK_SECRET no configurado" }, { status: 500 });
  }
  const sig = req.headers.get("x-nylas-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    console.error("[webhook] firma inválida: revisa que el secreto de Vercel sea el del webhook de Nylas");
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  const evt = JSON.parse(raw);
  const type: string = evt.type ?? "";
  if (!type.startsWith("event.")) console.log("[webhook] recibido:", type);
  const d: Json = evt.data?.object ?? {};
  const db = supabaseAdmin();

  if (type.startsWith("booking.")) {
    // Nylas envía los datos de la reserva dentro de `booking_info`, no sueltos en el objeto.
    // Los otros dos caminos son por si el esquema vuelve a cambiar.
    const bi: Json = (d.booking_info as Json) ?? (d.event as Json) ?? (d.when as Json) ?? {};

    const configId = (d.configuration_id ?? bi.configuration_id) as string | undefined;
    const { data: et, error: etError } = configId
      ? await db
          .from("event_types")
          .select("id, client_id, calendar_connection_id, name, questions")
          .eq("nylas_configuration_id", configId)
          .maybeSingle()
      : { data: null, error: null };
    if (!et) {
      console.error(
        "[webhook] no encuentro el tipo de cita.",
        "configuration_id:", configId ?? "(ausente)",
        "| error:", etError?.message ?? "ninguno"
      );
    }

    // La conexión nos da el correo del anfitrión, que es lo que permite distinguir
    // al invitado dentro de `participants` (ahí están los dos).
    const { data: conn } = et?.calendar_connection_id
      ? await db
          .from("calendar_connections")
          .select("nylas_grant_id, external_calendar_id, account_email")
          .eq("id", et.calendar_connection_id)
          .maybeSingle()
      : { data: null };

    const status =
      type === "booking.cancelled" ? "cancelled" :
      type === "booking.rescheduled" ? "rescheduled" :
      type === "booking.pending" ? "pending" : "confirmed";

    const start = toIso(bi.start_time) ?? toIso(d.start_time) ?? toIso(deepFind(d, "start_time"));
    const end = toIso(bi.end_time) ?? toIso(d.end_time) ?? toIso(deepFind(d, "end_time"));

    if (!start || !end) {
      console.error(
        "[webhook] el aviso no trae horas utilizables. Estructura recibida:",
        JSON.stringify(describeShape(d))
      );
    }

    const participants = Array.isArray(bi.participants) ? (bi.participants as Json[]) : [];
    const hostEmail = (conn?.account_email ?? "").toLowerCase();
    const extra = (bi.additional_fields as Json) ?? {};
    // El invitado es el participante que no es el anfitrión. Si no hay forma de
    // distinguirlos, el primero; y si no hay participantes, lo que traiga el formulario.
    const guest =
      participants.find((p) => String(p.email ?? "").toLowerCase() !== hostEmail && p.email) ??
      participants[0] ??
      ((d.guest as Json) ?? {});

    // Las respuestas llegan con la clave que la agencia dio a cada pregunta
    // (q1_telefono, q2_correo...), no con nombres fijos. El tipo de la pregunta
    // es lo único estable, así que es por ahí por donde se localizan.
    const questions = Array.isArray(et?.questions) ? (et.questions as Json[]) : [];
    const answerOfType = (kind: string): string | null => {
      const q = questions.find((x) => x.type === kind);
      const key = typeof q?.key === "string" ? q.key : null;
      const value = key ? extra[key] : undefined;
      return typeof value === "string" && value.trim() ? value : null;
    };

    const eventId = (bi.event_id ?? d.event_id ?? deepFind(d, "event_id")) as string | undefined;
    const location = typeof bi.location === "string" ? bi.location : "";
    const bookingId = (d.booking_id ?? d.id) as string | undefined;

    if (et && start && end && bookingId) {
      const guestName = String(guest.name ?? extra.name ?? "");
      const guestEmail = String(guest.email ?? answerOfType("email") ?? extra.email ?? "");
      const cancelReason =
        status === "cancelled" ? ((d.cancellation_reason ?? bi.cancellation_reason ?? null) as string | null) : null;

      // Citas creadas por la API v1: tienen su propio camino (ver syncApiBooking).
      const handledByApi = await syncApiBooking(db, {
        type,
        status,
        bookingId,
        clientId: et.client_id,
        start,
        end,
        guestEmail,
        eventId: eventId ?? null,
        cancelReason,
      });

      if (!handledByApi) {
        // Cómo estaba antes, para saber qué ha cambiado (Nylas puede repetir un aviso).
        const { data: before } = await db
          .from("bookings")
          .select("id, status, start_at, end_at, cancelled_at, cancel_reason")
          .eq("nylas_booking_id", bookingId)
          .maybeSingle();
        const upsert = () =>
          db.from("bookings").upsert(
            {
              nylas_booking_id: bookingId,
              client_id: et.client_id,
              event_type_id: et.id,
              calendar_connection_id: et.calendar_connection_id,
              start_at: start,
              end_at: end,
              invitee_name: guestName,
              invitee_email: guestEmail,
              invitee_phone: answerOfType("phone_number") ?? (extra.phone as string) ?? null,
              invitee_timezone: String(bi.guest_timezone ?? d.timezone ?? "UTC"),
              answers: extra,
              status,
              external_event_id: eventId ?? null,
              meeting_url: location.startsWith("http") ? location : null,
              // Si ya estaba cancelada (p. ej. por un rechazo en el calendario), se conservan
              // la hora y el motivo de esa cancelación: el aviso de Nylas es solo el eco.
              cancelled_at:
                status === "cancelled"
                  ? (before?.status === "cancelled" && before.cancelled_at) || new Date().toISOString()
                  : null,
              cancel_reason:
                status === "cancelled" ? cancelReason ?? (before?.status === "cancelled" ? before.cancel_reason : null) : cancelReason,
              source: "web",
            },
            { onConflict: "nylas_booking_id" }
          ).select("id").single();
        let { data: savedRow, error: saveError } = await upsert();
        // Solape con otra fila (restricción de exclusión): casi siempre es una reserva del
        // chat para ese mismo hueco que todavía está en curso y que Nylas va a rechazar
        // porque ha ganado la web. Se le da tiempo a liberarse antes de rendirse.
        for (let attempt = 0; saveError?.code === "23P01" && attempt < 3; attempt++) {
          const released = await releaseAbandonedPending(et.client_id, new Date(start), new Date(end));
          if (!released) await new Promise((r) => setTimeout(r, 1500));
          ({ data: savedRow, error: saveError } = await upsert());
        }
        if (saveError) {
          console.error("[webhook] no se pudo guardar la reserva:", saveError.message, "|", saveError.details ?? "");
        } else {
          console.log("[webhook] reserva guardada:", bookingId, "|", start, "→", end);
          // La atribución que mandó el navegador, si llegó antes que este aviso.
          await takePendingAttribution(bookingId);
          const outbound = webEventType(before, status, start, end);
          if (outbound && savedRow?.id) {
            // Al crear, un momento de espera para que el aviso ya lleve la atribución.
            scheduleBookingEvent(savedRow.id, outbound, "external", { delayMs: outbound === "booking.created" ? 4000 : 0 });
          }
        }

        // El título del evento lo pone Nylas sin el nombre de quien reserva, así que
        // lo añadimos aquí: en la agenda del cliente se distingue una cita de otra.
        // (Las de la API las anota la propia API al crearlas.)
        if (status !== "cancelled" && eventId && guestName && conn?.nylas_grant_id) {
          try {
            await updateEventTitle(
              conn.nylas_grant_id,
              conn.external_calendar_id ?? "primary",
              eventId,
              `${et.name} — ${guestName}`
            );
          } catch (e) {
            // Nunca romper el webhook por esto: la cita ya está guardada.
            console.error("[webhook] no se pudo renombrar el evento:", (e as Error).message);
          }
        }
      }
    } else if (et && start && end && !bookingId) {
      console.error("[webhook] el aviso no trae booking_id; no se puede guardar sin clave.");
    }
  }

  // Cambios hechos directamente en el calendario (el invitado rechaza la invitación, el
  // profesional borra o mueve el evento). Llegan por cada evento de los calendarios
  // conectados: se responde enseguida y se procesa después.
  if (type === "event.updated" || type === "event.deleted") {
    after(() => handleCalendarEventChange(type, d));
  }

  if (type === "grant.expired" || type === "grant.deleted") {
    const grantId = (d.grant_id ?? d.id ?? evt.data?.grant_id) as string | undefined;
    if (grantId) {
      await db
        .from("calendar_connections")
        .update({ status: type === "grant.deleted" ? "revoked" : "expired", grant_status: "invalid" })
        .eq("nylas_grant_id", grantId);
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Refleja en la fila de una cita creada por la API lo que avisa Nylas. Devuelve true si
 * la cita es de la API (y por tanto no debe pasar por el upsert genérico, que la
 * sobrescribiría como «web» y borraría su clave de idempotencia).
 *
 *  - booking.created de una cita que la API acaba de crear y aún no ha enlazado: se
 *    enlaza la fila `pending` (mismo cliente, misma hora, mismo email) con el id de Nylas.
 *  - Cualquier aviso sobre una cita de la API ya enlazada: se actualizan hora y estado.
 *    Si eso cambia algo, el cambio vino de fuera de la API (enlace del correo, por
 *    ejemplo) y se avisa al integrador. Si no cambia nada, lo hizo la propia API.
 */
async function syncApiBooking(
  db: ReturnType<typeof supabaseAdmin>,
  a: {
    type: string;
    status: "cancelled" | "rescheduled" | "pending" | "confirmed";
    bookingId: string;
    clientId: string;
    start: string;
    end: string;
    guestEmail: string;
    eventId: string | null;
    cancelReason: string | null;
  }
): Promise<boolean> {
  const { data: existing } = await db.from("bookings").select("*").eq("nylas_booking_id", a.bookingId).maybeSingle();
  let row = existing as BookingRow | null;

  if (!row && a.type === "booking.created" && a.guestEmail) {
    const { data: claimed } = await db
      .from("bookings")
      .update({ nylas_booking_id: a.bookingId, external_event_id: a.eventId, status: "confirmed" })
      .eq("client_id", a.clientId)
      .eq("source", "api")
      .eq("status", "pending")
      .is("nylas_booking_id", null)
      .eq("start_at", a.start)
      .eq("end_at", a.end)
      .eq("invitee_email", a.guestEmail.toLowerCase())
      .select("*")
      .maybeSingle();
    if (claimed) {
      console.log("[webhook] cita de la API enlazada:", (claimed as BookingRow).id, "←", a.bookingId);
      // La respuesta de Nylas a la API se perdió, pero la cita existe: se confirma aquí.
      scheduleBookingEvent((claimed as BookingRow).id, "booking.created", "api");
      return true;
    }
  }
  if (!row || row.source !== "api") return false;

  const moved = Date.parse(row.start_at) !== Date.parse(a.start) || Date.parse(row.end_at) !== Date.parse(a.end);
  const cancelledNow = a.status === "cancelled" && row.status !== "cancelled";
  if (!moved && !cancelledNow) {
    if (!row.external_event_id && a.eventId) {
      await db.from("bookings").update({ external_event_id: a.eventId }).eq("id", row.id);
    }
    return true;
  }

  const patch: Record<string, unknown> = { start_at: a.start, end_at: a.end };
  if (cancelledNow) {
    Object.assign(patch, { status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: a.cancelReason });
  } else if (moved && row.status !== "cancelled") {
    patch.status = "rescheduled";
  }
  if (a.eventId) patch.external_event_id = a.eventId;
  const { data: updated, error } = await db.from("bookings").update(patch).eq("id", row.id).select("*").single();
  if (error || !updated) {
    console.error("[webhook] no se pudo actualizar la cita de la API:", error?.message);
    return true;
  }
  row = updated as BookingRow;
  console.log("[webhook] cita de la API cambiada fuera de la API:", row.id, a.type);

  scheduleBookingEvent(row.id, cancelledNow ? "booking.cancelled" : "booking.rescheduled", "external");
  return true;
}

/**
 * Qué aviso saliente corresponde a un cambio en una reserva web, comparando con cómo
 * estaba. Null si no ha cambiado nada (aviso repetido de Nylas).
 */
function webEventType(
  before: { status: string; start_at: string; end_at: string } | null,
  status: "cancelled" | "rescheduled" | "pending" | "confirmed",
  start: string,
  end: string
): OutboundType | null {
  if (status === "pending") return null;
  if (!before) return status === "cancelled" ? "booking.cancelled" : "booking.created";
  if (status === "cancelled") return before.status === "cancelled" ? null : "booking.cancelled";
  const moved = Date.parse(before.start_at) !== Date.parse(start) || Date.parse(before.end_at) !== Date.parse(end);
  return moved ? "booking.rescheduled" : null;
}
