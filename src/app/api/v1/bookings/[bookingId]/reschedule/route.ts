import { authenticate } from "@/lib/api/auth";
import { alternativesFor, assertSlotBookable } from "@/lib/api/booking-flow";
import { bookingTarget } from "@/lib/api/calendars";
import { isActive, loadBooking, serializeBooking, type BookingRow } from "@/lib/api/bookings";
import { ApiError, handler, json, readJson } from "@/lib/api/http";
import { MINUTE_MS, parseInstant } from "@/lib/api/time";
import { MIN_CANCELLATION_NOTICE_MINUTES, NylasApiError, rescheduleSchedulerBooking } from "@/lib/nylas";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Reprogramar a otro hueco del mismo servicio. Mismas comprobaciones y mismos códigos
 * que al crear. Pedir la hora que ya tiene no es un error: devuelve la cita sin tocarla.
 */
export const POST = handler<{ bookingId: string }>(async (req, ctx, { bookingId }) => {
  const key = await authenticate(req);
  const body = await readJson(req);
  const start = parseInstant(body.start, "start");
  const { row, ctx: cal, service } = await loadBooking(key, bookingId);

  if (!isActive(row)) {
    throw new ApiError("booking_cancelled", "La cita está cancelada: crea una nueva en lugar de reprogramarla.");
  }
  if (!row.nylas_booking_id) {
    throw new ApiError("request_in_progress", "La cita aún se está creando. Reintenta en unos segundos.", { retryAfterSeconds: 5 });
  }
  if (!service) throw new ApiError("service_not_bookable", "El servicio de esta cita ya no está activo.");

  const duration = service.duration_minutes;
  const end = body.end ? parseInstant(body.end, "end") : new Date(start.getTime() + duration * MINUTE_MS);
  if (Math.round((end.getTime() - start.getTime()) / MINUTE_MS) !== duration) {
    throw new ApiError("invalid_duration", `El servicio «${service.name}» dura ${duration} minutos.`, {
      details: { duration_minutes: duration },
    });
  }
  if (start.getTime() === Date.parse(row.start_at) && end.getTime() === Date.parse(row.end_at)) {
    return json(ctx, serializeBooking(cal, row));
  }

  const minutesLeft = (Date.parse(row.start_at) - Date.now()) / MINUTE_MS;
  if (minutesLeft < MIN_CANCELLATION_NOTICE_MINUTES) {
    throw new ApiError(
      "too_late_to_change",
      minutesLeft <= 0
        ? "La cita ya ha empezado o ha pasado."
        : `Solo se puede cambiar hasta ${MIN_CANCELLATION_NOTICE_MINUTES} minutos antes de la cita.`,
      { details: { min_cancellation_notice_minutes: MIN_CANCELLATION_NOTICE_MINUTES } }
    );
  }

  const { configurationId } = bookingTarget(cal, service);
  const tz = row.invitee_timezone || cal.client.timezone;
  const { nearby } = await assertSlotBookable(cal, service, start, end, tz, { excludeBookingId: row.nylas_booking_id });

  // Primero la base de datos (la restricción de exclusión vigila los solapes) y así el
  // aviso booking.rescheduled de Nylas no se reenvía como un cambio hecho fuera.
  const db = supabaseAdmin();
  const { data: moved, error } = await db
    .from("bookings")
    .update({ start_at: start.toISOString(), end_at: end.toISOString(), status: "rescheduled" })
    .eq("id", row.id)
    .select("*")
    .single();
  const slotTaken = async () =>
    new ApiError("slot_taken", "Ese hueco acaba de ocuparse.", {
      alternatives: await alternativesFor(cal, service, start, tz, {
        excludeBookingId: row.nylas_booking_id,
        nearby: nearby.filter((x) => x.start.getTime() !== start.getTime()),
      }),
    });
  if (error) {
    if (error.code === "23P01") throw await slotTaken();
    throw new Error(`reschedule update: ${error.message}`);
  }

  try {
    await rescheduleSchedulerBooking(configurationId, row.nylas_booking_id, start.getTime() / 1000, end.getTime() / 1000);
  } catch (e) {
    await db.from("bookings").update({ start_at: row.start_at, end_at: row.end_at, status: row.status }).eq("id", row.id);
    console.error("[api] Nylas reprogramar:", (e as Error).message);
    if (e instanceof NylasApiError && e.isTimeslotUnavailable) throw await slotTaken();
    const ambiguous = !(e instanceof NylasApiError) || e.isAmbiguous;
    throw new ApiError("provider_error", "El proveedor de calendario no pudo cambiar la cita. Reintenta.", {
      retryable: ambiguous,
      ...(e instanceof NylasApiError && !ambiguous ? { details: { provider_status: e.status, provider_message: e.detail } } : {}),
    });
  }
  return json(ctx, serializeBooking(cal, moved as BookingRow));
});
