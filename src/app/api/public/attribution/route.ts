import { NextResponse } from "next/server";
import { sanitizeAttribution } from "@/lib/api/attribution";
import { isUuid } from "@/lib/api/http";
import { recordAttribution } from "@/lib/booking-attribution";

export const dynamic = "force-dynamic";

/**
 * La página pública manda aquí la atribución (UTM, página, referrer) justo después de
 * reservar, con el booking_id que devuelve Nylas. Sin autenticación: el id de reserva de
 * Nylas es un uuid aleatorio que solo conoce quien acaba de reservar, solo se acepta
 * durante los primeros minutos y nunca sobrescribe una atribución ya guardada.
 * Responde siempre 204 (salvo formato inválido): no revela si la cita existe.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 10_000) return NextResponse.json({ error: "demasiado grande" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const bookingId = body?.booking_id;
  if (!isUuid(bookingId)) return NextResponse.json({ error: "booking_id inválido" }, { status: 400 });
  const attribution = sanitizeAttribution(body.attribution);
  if (attribution) {
    try {
      await recordAttribution(bookingId.toLowerCase(), attribution);
    } catch (e) {
      console.error("[atribución] no se pudo guardar:", (e as Error).message);
    }
  }
  return new NextResponse(null, { status: 204 });
}
