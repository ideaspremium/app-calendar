import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Attribution } from "@/lib/api/attribution";

/**
 * Atribución de las reservas hechas en la página pública.
 *
 * La cita la crea Nylas desde el navegador y nos llega por su webhook; la atribución la
 * manda el navegador aparte, justo después de reservar (POST /api/public/attribution).
 * Las dos cosas pueden llegar en cualquier orden, así que:
 *  - si la cita ya está guardada, se escribe en ella;
 *  - si no, espera en `booking_attribution_pending` y el webhook la recoge al guardar.
 * Cada lado vuelve a mirar después de escribir, para que ningún cruce la pierda.
 * Solo se escribe una vez: nunca se sobrescribe una atribución ya guardada.
 */

/** Ventana en la que se acepta atribución para una cita recién creada. */
const WINDOW_MS = 30 * 60_000;

async function applyToBooking(nylasBookingId: string, attribution: Attribution) {
  const { data } = await supabaseAdmin()
    .from("bookings")
    .update({ attribution })
    .eq("nylas_booking_id", nylasBookingId)
    .eq("source", "web")
    .is("attribution", null)
    .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString())
    .select("id");
  return (data ?? []).length > 0;
}

async function bookingExists(nylasBookingId: string) {
  const { data } = await supabaseAdmin().from("bookings").select("id").eq("nylas_booking_id", nylasBookingId).maybeSingle();
  return !!data;
}

/** Desde el navegador. */
export async function recordAttribution(nylasBookingId: string, attribution: Attribution) {
  const db = supabaseAdmin();
  if (await bookingExists(nylasBookingId)) {
    await applyToBooking(nylasBookingId, attribution);
    return;
  }
  await db
    .from("booking_attribution_pending")
    .upsert({ nylas_booking_id: nylasBookingId, attribution }, { onConflict: "nylas_booking_id", ignoreDuplicates: true });
  // ¿Llegó la cita mientras tanto? Entonces el webhook ya no mirará la tabla de espera.
  if (await bookingExists(nylasBookingId)) await takePendingAttribution(nylasBookingId);
  // Limpieza de lo que nunca llegó a tener cita (un día de margen).
  await db.from("booking_attribution_pending").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
}

/** Desde el webhook de Nylas, justo después de guardar una reserva web. */
export async function takePendingAttribution(nylasBookingId: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("booking_attribution_pending")
    .select("attribution")
    .eq("nylas_booking_id", nylasBookingId)
    .maybeSingle();
  if (!data) return false;
  const applied = await applyToBooking(nylasBookingId, data.attribution as Attribution);
  await db.from("booking_attribution_pending").delete().eq("nylas_booking_id", nylasBookingId);
  return applied;
}
