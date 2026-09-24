import { authenticate } from "@/lib/api/auth";
import { bookingTarget } from "@/lib/api/calendars";
import { loadBooking, serializeBooking, type BookingRow } from "@/lib/api/bookings";
import { ApiError, handler, json, optString, readJson } from "@/lib/api/http";
import { MINUTE_MS } from "@/lib/api/time";
import { cancelSchedulerBooking, MIN_CANCELLATION_NOTICE_MINUTES, NylasApiError } from "@/lib/nylas";
import { scheduleBookingEvent } from "@/lib/api/webhooks";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cancelar. Es idempotente por naturaleza: cancelar una cita ya cancelada devuelve la
 * cita tal cual, sin error, para que un reintento del agente no se convierta en un fallo.
 */
export const POST = handler<{ bookingId: string }>(async (req, ctx, { bookingId }) => {
  const key = await authenticate(req);
  const body = await readJson(req);
  const reason = optString(body, "reason", 500);
  const { row, ctx: cal, service } = await loadBooking(key, bookingId);

  if (row.status === "cancelled") return json(ctx, serializeBooking(cal, row));
  if (!row.nylas_booking_id) {
    throw new ApiError("request_in_progress", "La cita aún se está creando. Reintenta en unos segundos.", { retryAfterSeconds: 5 });
  }
  const minutesLeft = (Date.parse(row.start_at) - Date.now()) / MINUTE_MS;
  if (minutesLeft < MIN_CANCELLATION_NOTICE_MINUTES) {
    throw new ApiError(
      "too_late_to_change",
      minutesLeft <= 0
        ? "La cita ya ha empezado o ha pasado."
        : `Solo se puede cancelar hasta ${MIN_CANCELLATION_NOTICE_MINUTES} minutos antes de la cita.`,
      { details: { min_cancellation_notice_minutes: MIN_CANCELLATION_NOTICE_MINUTES } }
    );
  }
  if (!service) throw new ApiError("service_not_bookable", "El servicio de esta cita ya no está activo.");
  const { configurationId } = bookingTarget(cal, service);

  // Primero la base de datos: cuando llegue el aviso booking.cancelled de Nylas no habrá
  // cambio que notificar, porque lo ha hecho la propia API.
  const db = supabaseAdmin();
  const cancelledAt = new Date().toISOString();
  const { data: updated } = await db
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: cancelledAt, cancel_reason: reason })
    .eq("id", row.id)
    .neq("status", "cancelled")
    .select("*")
    .maybeSingle();
  if (!updated) {
    const { data: now } = await db.from("bookings").select("*").eq("id", row.id).single();
    return json(ctx, serializeBooking(cal, now as BookingRow));
  }

  try {
    await cancelSchedulerBooking(configurationId, row.nylas_booking_id, reason);
  } catch (e) {
    // 404 de Nylas: ya no existe allí; nuestra fila cancelada es lo correcto.
    if (!(e instanceof NylasApiError) || e.status !== 404) {
      await db
        .from("bookings")
        .update({ status: row.status, cancelled_at: row.cancelled_at, cancel_reason: row.cancel_reason })
        .eq("id", row.id);
      console.error("[api] Nylas cancelar:", (e as Error).message);
      const ambiguous = !(e instanceof NylasApiError) || e.isAmbiguous;
      throw new ApiError("provider_error", "El proveedor de calendario no pudo cancelar la cita. Reintenta.", {
        retryable: ambiguous,
        ...(e instanceof NylasApiError && !ambiguous ? { details: { provider_status: e.status, provider_message: e.detail } } : {}),
      });
    }
  }
  scheduleBookingEvent(row.id, "booking.cancelled", "api");
  return json(ctx, serializeBooking(cal, updated as BookingRow));
});
