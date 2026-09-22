import { authenticate } from "@/lib/api/auth";
import { findSlots, serializeSlot } from "@/lib/api/availability";
import { loadCalendar, resolveService } from "@/lib/api/calendars";
import { ApiError, handler, isUuid, json } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  addDaysToLocalDate,
  DAY_MS,
  isValidTimeZone,
  parseInstant,
  parseLocalDate,
  startOfLocalDay,
  toIsoInZone,
} from "@/lib/api/time";

export const dynamic = "force-dynamic";

function intParam(sp: URLSearchParams, name: string, min: number, max: number): number | null {
  const v = sp.get(name);
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ApiError("invalid_request", `«${name}» debe ser un entero entre ${min} y ${max}.`, { details: { field: name } });
  }
  return n;
}

/**
 * Huecos reservables. Todo viene resuelto: horario de atención, duración, márgenes,
 * citas existentes en el calendario, cierres, antelación mínima y horizonte.
 *
 * Rango, por orden de preferencia:
 *   date=AAAA-MM-DD [&days=N]  días naturales en `timezone` (o en la zona del calendario)
 *   start / end                instantes ISO 8601 con zona explícita
 *   nada                       desde ahora; 7 días, o hasta el horizonte si hay `limit`
 */
export const GET = handler<{ calendarId: string }>(async (req, ctx, { calendarId }) => {
  const key = await authenticate(req);
  const sp = new URL(req.url).searchParams;
  const cal = await loadCalendar(key, calendarId);

  const duration = intParam(sp, "duration_minutes", 1, 24 * 60);
  const limit = intParam(sp, "limit", 1, 100);
  const days = intParam(sp, "days", 1, 62);
  const service = resolveService(cal, sp.get("service_id"), duration);

  const tzParam = sp.get("timezone");
  if (tzParam && !isValidTimeZone(tzParam)) {
    throw new ApiError("invalid_request", "«timezone» debe ser una zona IANA, p. ej. Europe/Madrid.", { details: { field: "timezone" } });
  }
  const tz = tzParam || cal.client.timezone;

  const now = new Date();
  let from: Date;
  let to: Date;
  const date = sp.get("date");
  if (date) {
    const d = parseLocalDate(date, "date");
    from = startOfLocalDay(d, tz);
    to = startOfLocalDay(addDaysToLocalDate(d, days ?? 1), tz);
  } else {
    from = sp.get("start") ? parseInstant(sp.get("start"), "start") : now;
    to = sp.get("end")
      ? parseInstant(sp.get("end"), "end")
      : limit
        ? new Date(now.getTime() + service.max_days_ahead * DAY_MS)
        : new Date(from.getTime() + 7 * DAY_MS);
  }
  if (to <= from) {
    throw new ApiError("invalid_request", "«end» debe ser posterior a «start».", { details: { field: "end" } });
  }

  const bookingId = sp.get("booking_id");
  let excludeBookingId: string | null = null;
  if (bookingId) {
    // Al reprogramar: el hueco que ocupa la propia cita cuenta como libre.
    if (!isUuid(bookingId)) throw new ApiError("booking_not_found", "No existe esa cita.");
    const { data } = await supabaseAdmin()
      .from("bookings")
      .select("nylas_booking_id")
      .eq("id", bookingId)
      .eq("client_id", cal.client.id)
      .maybeSingle();
    if (!data) throw new ApiError("booking_not_found", "No existe esa cita en este calendario.");
    excludeBookingId = data.nylas_booking_id;
  }

  const { slots, window, searched } = await findSlots(cal, service, { from, to, limit: limit ?? undefined, excludeBookingId, now });

  // Rango vacío por la ventana de reserva: se dice por qué, con el mismo código que al reservar.
  const reason = searched ? null : to <= window.earliest ? "too_soon" : from >= window.latest ? "too_far_ahead" : null;

  return json(ctx, {
    calendar_id: cal.client.id,
    service_id: service.id,
    duration_minutes: service.duration_minutes,
    timezone: tz,
    calendar_timezone: cal.client.timezone,
    booking_window: { earliest: toIsoInZone(window.earliest, tz), latest: toIsoInZone(window.latest, tz) },
    range: searched ? { start: toIsoInZone(searched.from, tz), end: toIsoInZone(searched.to, tz) } : null,
    ...(reason ? { reason } : {}),
    slots: slots.map((s) => serializeSlot(cal, s, tz)),
  });
});
