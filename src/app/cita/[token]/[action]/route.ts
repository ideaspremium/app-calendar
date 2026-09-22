import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/lib/config";
import { bookingByToken } from "@/lib/manage";
import { bookingRef } from "@/lib/nylas";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, "cancel" | "reschedule"> = {
  cancelar: "cancel",
  cancel: "cancel",
  reprogramar: "reschedule",
  reschedule: "reschedule",
};

/**
 * Enlace estable de cancelar/reprogramar: resuelve el token y redirige a la página de
 * Nylas con el slug actual del cliente y del servicio. Si alguien renombra el cliente,
 * los enlaces ya entregados por el chat siguen funcionando.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; action: string }> }) {
  const { token, action } = await params;
  const kind = ACTIONS[action];
  const found = kind ? await bookingByToken(token) : null;
  const fallback = NextResponse.redirect(new URL(`/cita/${encodeURIComponent(token)}`, appUrl()));
  if (!found || !found.service?.nylas_configuration_id || !found.booking.nylas_booking_id) return fallback;
  if (found.booking.status === "cancelled") return fallback;
  const ref = bookingRef(found.service.nylas_configuration_id, found.booking.nylas_booking_id);
  return NextResponse.redirect(new URL(`/${found.client.slug}/${found.service.slug}/${kind}/${ref}`, appUrl()));
}
