import { scheduleBookingEvent, type OutboundType } from "@/lib/api/webhooks";
import { cancelSchedulerBooking, deleteEvent, getEvent, NylasApiError, type NylasEvent } from "@/lib/nylas";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Cambios hechos fuera de Calendars360 sobre el evento de una cita, que Nylas avisa
 * con `event.updated` / `event.deleted` (no generan `booking.*`):
 *
 *  - El **invitado rechaza** la invitación de Google Calendar («No»): la cita se cancela,
 *    como si hubiera usado el enlace «Cancelar». Se cancela también en Nylas, lo que quita
 *    el evento de la agenda del profesional, libera el hueco y envía el correo de
 *    cancelación. Un «No» es definitivo: si luego cambia de idea, tiene que reservar de nuevo.
 *    «Quizás» no cambia nada.
 *  - El **profesional borra** el evento de su calendario: la cita se da por cancelada.
 *  - El **profesional mueve** el evento de hora: la cita pasa a la hora nueva (reprogramada).
 *
 * Cada caso deja la cita como corresponde en la base y envía el aviso saliente
 * (booking.cancelled / booking.rescheduled) como un cambio externo a la API.
 *
 * Nylas avisa de todos los cambios de los calendarios conectados; solo interesan los
 * eventos de nuestras citas, que se reconocen por `bookings.external_event_id`. Como los
 * avisos pueden llegar repetidos o desordenados, se actúa sobre el estado actual del
 * evento (se vuelve a pedir a Nylas), no sobre lo que traiga el aviso.
 */

export const REASON_GUEST_DECLINED = "El invitado rechazó la invitación del calendario";
export const REASON_HOST_DELETED = "El profesional eliminó el evento de su calendario";

type Json = Record<string, unknown>;
type Row = {
  id: string;
  client_id: string;
  event_type_id: string | null;
  calendar_connection_id: string | null;
  status: string;
  start_at: string;
  end_at: string;
  invitee_email: string;
  nylas_booking_id: string | null;
  external_event_id: string;
};

const ACTIVE = ["confirmed", "rescheduled"];

async function currentEvent(grantId: string, calendarId: string, eventId: string): Promise<NylasEvent | "gone"> {
  try {
    const ev = await getEvent(grantId, calendarId, eventId);
    return ev?.status === "cancelled" ? "gone" : ev;
  } catch (e) {
    if (e instanceof NylasApiError && (e.status === 404 || e.status === 410)) return "gone";
    throw e;
  }
}

/** Marca la cita cancelada. Devuelve true solo si ha cambiado (para avisar una sola vez). */
async function markCancelled(row: Row, reason: string) {
  const { data } = await supabaseAdmin()
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason })
    .eq("id", row.id)
    .in("status", ACTIVE)
    .select("id");
  return (data ?? []).length > 0;
}

/**
 * El invitado dijo «No»: se cancela en Nylas para quitar el evento de la agenda del
 * profesional. Si el Scheduler no lo permite (p. ej. dentro del margen mínimo de
 * cancelación), se borra el evento directamente, sin volver a escribir al invitado.
 */
async function cancelAtProvider(row: Row, grantId: string, calendarId: string) {
  const db = supabaseAdmin();
  const { data: et } = row.event_type_id
    ? await db.from("event_types").select("nylas_configuration_id").eq("id", row.event_type_id).maybeSingle()
    : { data: null };
  const configId = et?.nylas_configuration_id as string | undefined;
  if (configId && row.nylas_booking_id) {
    try {
      await cancelSchedulerBooking(configId, row.nylas_booking_id, REASON_GUEST_DECLINED);
      return;
    } catch (e) {
      console.warn("[calendario] el Scheduler no canceló; se borra el evento:", (e as Error).message);
    }
  }
  try {
    await deleteEvent(grantId, calendarId, row.external_event_id, false);
  } catch (e) {
    if (!(e instanceof NylasApiError && (e.status === 404 || e.status === 410))) {
      console.error("[calendario] no se pudo quitar el evento de la agenda:", row.id, (e as Error).message);
    }
  }
}

function guestStatus(ev: NylasEvent, email: string) {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  return ev.participants?.find((p) => (p.email ?? "").trim().toLowerCase() === want)?.status ?? null;
}

async function handleOne(row: Row, type: string, grantId: string, calendarId: string) {
  // Una cita que ya pasó no se toca: rechazar o borrar después no cambia lo que ocurrió.
  if (Date.parse(row.end_at) < Date.now()) return;

  const ev = type === "event.deleted" ? "gone" : await currentEvent(grantId, calendarId, row.external_event_id);
  let outbound: OutboundType | null = null;

  if (ev === "gone") {
    if (await markCancelled(row, REASON_HOST_DELETED)) outbound = "booking.cancelled";
  } else if (guestStatus(ev, row.invitee_email) === "no") {
    if (await markCancelled(row, REASON_GUEST_DECLINED)) {
      outbound = "booking.cancelled";
      await cancelAtProvider(row, grantId, calendarId);
    }
  } else if (ev.when?.start_time && ev.when?.end_time) {
    const start = new Date(ev.when.start_time * 1000).toISOString();
    const end = new Date(ev.when.end_time * 1000).toISOString();
    if (Date.parse(start) !== Date.parse(row.start_at) || Date.parse(end) !== Date.parse(row.end_at)) {
      const { data, error } = await supabaseAdmin()
        .from("bookings")
        .update({ start_at: start, end_at: end, status: "rescheduled" })
        .eq("id", row.id)
        .in("status", ACTIVE)
        .eq("start_at", row.start_at)
        .select("id");
      if (error) {
        // Choca con otra cita del negocio (restricción de solapes): se deja como estaba.
        console.error("[calendario] no se pudo mover la cita a la hora nueva:", row.id, error.message);
      } else if ((data ?? []).length) {
        outbound = "booking.rescheduled";
      }
    }
  }

  if (outbound) {
    console.log("[calendario]", outbound, row.id, "←", type);
    scheduleBookingEvent(row.id, outbound, "external");
  }
}

export async function handleCalendarEventChange(type: string, obj: Json) {
  const eventId = typeof obj.id === "string" ? obj.id : null;
  const grantId = typeof obj.grant_id === "string" ? obj.grant_id : null;
  if (!eventId || !grantId) return;

  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("bookings")
    .select("id, client_id, event_type_id, calendar_connection_id, status, start_at, end_at, invitee_email, nylas_booking_id, external_event_id")
    .eq("external_event_id", eventId)
    .in("status", ACTIVE);
  if (!rows?.length) return; // la inmensa mayoría: eventos que no son citas nuestras

  for (const row of rows as Row[]) {
    // El evento tiene que ser de la agenda con la que se hizo la cita.
    const { data: conn } = row.calendar_connection_id
      ? await db.from("calendar_connections").select("nylas_grant_id, external_calendar_id").eq("id", row.calendar_connection_id).maybeSingle()
      : { data: null };
    if (!conn || conn.nylas_grant_id !== grantId) continue;
    const calendarId = (conn.external_calendar_id as string | null) ?? (typeof obj.calendar_id === "string" ? obj.calendar_id : "primary");
    try {
      await handleOne(row, type, grantId, calendarId);
    } catch (e) {
      console.error("[calendario] no se pudo procesar", type, "de la cita", row.id, (e as Error).message);
    }
  }
}
