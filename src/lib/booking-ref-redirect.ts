import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/lib/config";
import { resolveBookingRef } from "@/lib/public";

const ACTIONS: Record<string, "cancel" | "reschedule"> = {
  cancelar: "cancel",
  cancel: "cancel",
  reprogramar: "reschedule",
  reschedule: "reschedule",
};

/**
 * Enlaces de cancelar y reprogramar de los correos de Nylas: `/r/cancelar?ref=…` y
 * `/r/reprogramar?ref=…` (`cancellation_url` y `rescheduling_url` de la configuración).
 * No llevan la dirección del negocio ni del servicio: se resuelve aquí la actual a partir
 * de la referencia de la cita, así que siguen valiendo aunque se renombren.
 * En la consulta, un «+» del base64 puede llegar como espacio: decodeBookingRef lo repara.
 * También se acepta la referencia en la ruta (/r/cancelar/<ref>), ver [...ref].
 */
export async function redirectForRef(req: NextRequest, action: string, ref: string | null) {
  const kind = ACTIONS[action];
  const target = kind && ref ? await resolveBookingRef(ref) : null;
  if (!kind || !target) return NextResponse.redirect(new URL("/cita/no-encontrada", appUrl()));
  const url = new URL(`/${target.clientSlug}/${target.eventSlug}/${kind}/${target.ref}`, appUrl());
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k !== "ref") url.searchParams.set(k, v);
  });
  return NextResponse.redirect(url);
}
