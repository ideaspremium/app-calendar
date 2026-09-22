import { after } from "next/server";
import { createSchedulerBooking, getEvent, NylasApiError, updateEvent } from "@/lib/nylas";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EventType } from "@/lib/types";
import { findSlots, nearest, serializeSlot, type Slot } from "./availability";
import { bookingTarget, bookingWindow, fitsOpenHours, isBlocked, type CalendarCtx } from "./calendars";
import { ApiError } from "./http";
import { addDaysToLocalDate, DAY_MS, localParts, startOfLocalDay, toIsoInZone } from "./time";
import type { Attendee, BookingRow } from "./bookings";

/** Cuánto esperamos antes de retomar una creación que no terminó (con la misma clave). */
export const STALE_PENDING_MS = 30_000;
/** Pasado esto, una fila `pending` sin cita en Nylas se considera abandonada. */
const ABANDONED_PENDING_MS = 2 * 60_000;

/**
 * Borra filas `pending` de la API que nunca llegaron a Nylas y que solapan con el tramo.
 * Si una creación se quedó a medias y nadie la reintentó, su fila seguiría bloqueando
 * el hueco en la base de datos (restricción de exclusión) aunque en el calendario esté
 * libre, y rechazaría reservas legítimas de la web o del chat.
 * Si Nylas sí la creó, el webhook la habría enlazado en segundos: pasados dos minutos
 * sin enlace, es seguro liberarla.
 */
export async function releaseAbandonedPending(clientId: string, start: Date, end: Date) {
  const { data } = await supabaseAdmin()
    .from("bookings")
    .delete()
    .eq("client_id", clientId)
    .eq("source", "api")
    .eq("status", "pending")
    .is("nylas_booking_id", null)
    .lt("updated_at", new Date(Date.now() - ABANDONED_PENDING_MS).toISOString())
    .lt("start_at", end.toISOString())
    .gt("end_at", start.toISOString())
    .select("id");
  if (data?.length) console.warn("[api] liberadas filas pending abandonadas:", data.map((r) => r.id).join(", "));
  return data?.length ?? 0;
}

const NYLAS_LANGUAGES = ["en", "es", "fr", "de", "nl", "sv", "ja", "zh"];
export function emailLanguage(...candidates: (string | null | undefined)[]) {
  for (const c of candidates) {
    const two = c?.slice(0, 2).toLowerCase();
    if (two && NYLAS_LANGUAGES.includes(two)) return two;
  }
  return "es";
}

/** Huecos cercanos a la hora pedida: desde el principio de ese día local, una semana. */
async function slotsAround(ctx: CalendarCtx, s: EventType, at: Date, excludeBookingId?: string | null) {
  const w = bookingWindow(s);
  const day = localParts(at, ctx.client.timezone).date;
  const from = new Date(Math.max(startOfLocalDay(day, ctx.client.timezone).getTime(), w.earliest.getTime()));
  const to = new Date(Math.min(startOfLocalDay(addDaysToLocalDate(day, 7), ctx.client.timezone).getTime(), w.latest.getTime()));
  if (from >= to) return [];
  return (await findSlots(ctx, s, { from, to, excludeBookingId })).slots;
}

export async function alternativesFor(
  ctx: CalendarCtx,
  s: EventType,
  at: Date,
  tz: string,
  opts: { excludeBookingId?: string | null; nearby?: Slot[] } = {}
) {
  try {
    let pool = opts.nearby ?? (await slotsAround(ctx, s, at, opts.excludeBookingId));
    if (!pool.length) {
      // Nada esa semana: los primeros que haya a partir de ahí.
      pool = (await findSlots(ctx, s, { from: at, to: new Date(at.getTime() + s.max_days_ahead * DAY_MS), limit: 3, excludeBookingId: opts.excludeBookingId })).slots;
    }
    return nearest(pool, at, 3, at).map((x) => serializeSlot(ctx, x, tz));
  } catch {
    // Las alternativas son un extra: si Nylas falla aquí, el error principal sigue siendo válido.
    return [];
  }
}

/**
 * Comprueba que el intervalo se puede reservar ahora mismo y, si no, dice por qué con
 * el código exacto y propone huecos cercanos. Es la misma comprobación para crear y
 * para reprogramar.
 */
export async function assertSlotBookable(
  ctx: CalendarCtx,
  s: EventType,
  start: Date,
  end: Date,
  tz: string,
  opts: { excludeBookingId?: string | null } = {}
) {
  const w = bookingWindow(s);
  const window = { earliest: toIsoInZone(w.earliest, tz), latest: toIsoInZone(w.latest, tz) };

  if (start < w.earliest) {
    const alternatives = (
      await findSlots(ctx, s, { from: w.earliest, to: w.latest, limit: 3, excludeBookingId: opts.excludeBookingId }).catch(() => ({ slots: [] }))
    ).slots.map((x) => serializeSlot(ctx, x, tz));
    throw new ApiError("too_soon", `Hay que reservar con al menos ${s.min_notice_minutes} minutos de antelación.`, {
      details: { min_notice_minutes: s.min_notice_minutes, booking_window: window },
      alternatives,
    });
  }
  if (start >= w.latest) {
    throw new ApiError("too_far_ahead", `Solo se puede reservar hasta ${s.max_days_ahead} días vista.`, {
      details: { max_days_ahead: s.max_days_ahead, booking_window: window },
    });
  }
  if (!fitsOpenHours(ctx, s, start, end) || isBlocked(ctx, s, start, end)) {
    throw new ApiError("outside_hours", "Esa hora está fuera del horario de atención.", {
      alternatives: await alternativesFor(ctx, s, start, tz, opts),
    });
  }

  const nearby = await slotsAround(ctx, s, start, opts.excludeBookingId);
  const exact = nearby.find((x) => x.start.getTime() === start.getTime() && x.end.getTime() === end.getTime());
  if (!exact) {
    throw new ApiError("slot_taken", "Ese hueco ya no está disponible.", {
      alternatives: await alternativesFor(ctx, s, start, tz, { ...opts, nearby }),
    });
  }
  return { nearby };
}

/**
 * Crea la reserva en Nylas para una fila `pending` ya guardada (que es la que garantiza
 * la idempotencia) y la confirma. Si Nylas dice que el hueco está ocupado o rechaza la
 * petición, la fila se borra y la clave queda libre. Si no sabemos qué pasó (sin
 * respuesta, 5xx), la fila se queda `pending`: un reintento con la misma clave, pasados
 * unos segundos, lo resuelve (el webhook de Nylas la enlaza si la cita sí se creó).
 */
export async function createAtProvider(
  ctx: CalendarCtx,
  s: EventType,
  row: BookingRow,
  attendee: Attendee,
  answers: Record<string, string>,
  tz: string,
  nearby?: Slot[]
): Promise<BookingRow> {
  const db = supabaseAdmin();
  const { configurationId, connection } = bookingTarget(ctx, s);
  const start = new Date(row.start_at);
  const end = new Date(row.end_at);
  const release = () => db.from("bookings").delete().eq("id", row.id).is("nylas_booking_id", null);

  let nb;
  try {
    nb = await createSchedulerBooking(configurationId, {
      start_time: start.getTime() / 1000,
      end_time: end.getTime() / 1000,
      guest: { name: attendee.name, email: attendee.email },
      timezone: attendee.timezone ?? ctx.client.timezone,
      email_language: emailLanguage(attendee.language, ctx.client.locale),
      additional_fields: answers,
    });
  } catch (e) {
    if (!(e instanceof NylasApiError)) throw e;
    console.error("[api] Nylas crear reserva:", e.message);
    if (e.isTimeslotUnavailable) {
      await release();
      throw new ApiError("slot_taken", "Ese hueco acaba de ocuparse.", {
        alternatives: await alternativesFor(ctx, s, start, tz, { nearby: nearby?.filter((x) => x.start.getTime() !== start.getTime()) }),
      });
    }
    if (!e.isAmbiguous) {
      await release();
      throw new ApiError("provider_error", "El proveedor de calendario rechazó la reserva.", {
        retryable: false,
        details: { provider_status: e.status, provider_message: e.detail },
      });
    }
    throw new ApiError(
      "provider_error",
      "El proveedor de calendario no respondió y no sabemos si la cita se creó. Reintenta con la misma Idempotency-Key en unos segundos.",
      { retryable: true, retryAfterSeconds: Math.ceil(STALE_PENDING_MS / 1000) }
    );
  }

  const { data, error } = await db
    .from("bookings")
    .update({ nylas_booking_id: nb.booking_id, external_event_id: nb.event_id ?? null, status: "confirmed" })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error || !data) {
    // La cita existe en Nylas; el webhook la enlazará igualmente.
    console.error("[api] no se pudo confirmar la fila tras crear en Nylas:", error?.message);
  }
  const saved = (data as BookingRow | null) ?? { ...row, nylas_booking_id: nb.booking_id, status: "confirmed" as const };

  // El título con el nombre y la nota del visitante, en la agenda del profesional.
  // Después de responder: no hace esperar al chat.
  const eventId = nb.event_id;
  if (eventId) {
    after(async () => {
      try {
        const calendarId = connection.external_calendar_id ?? "primary";
        const ev = await getEvent(connection.nylas_grant_id, calendarId, eventId).catch(() => null);
        const extra = [
          "Reserva hecha desde el chat.",
          attendee.phone ? `Teléfono: ${attendee.phone}` : null,
          saved.notes ? `Nota del visitante: ${saved.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        const description = [ev?.description?.trim(), extra].filter(Boolean).join("\n\n");
        await updateEvent(connection.nylas_grant_id, calendarId, eventId, {
          title: `${s.name} — ${attendee.name}`,
          description,
        });
      } catch (e) {
        console.error("[api] no se pudo anotar el evento:", (e as Error).message);
      }
    });
  }
  return saved;
}
