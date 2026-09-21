import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { updateEventTitle } from "@/lib/nylas";

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
  console.log("[webhook] recibido:", type);
  const d = evt.data?.object ?? {};
  const db = supabaseAdmin();

  if (type.startsWith("booking.")) {
    const configId: string | undefined = d.configuration_id;
    const { data: et } = configId
      ? await db.from("event_types").select("id, client_id, calendar_connection_id, name").eq("nylas_configuration_id", configId).maybeSingle()
      : { data: null };

    const status =
      type === "booking.cancelled" ? "cancelled" :
      type === "booking.rescheduled" ? "rescheduled" : "confirmed";

    const guest = d.guest ?? {};
    const start = d.start_time ? new Date(d.start_time * 1000).toISOString() : null;
    const end = d.end_time ? new Date(d.end_time * 1000).toISOString() : null;

    if (et && start && end) {
      await db.from("bookings").upsert(
        {
          nylas_booking_id: d.booking_id ?? d.id,
          client_id: et.client_id,
          event_type_id: et.id,
          calendar_connection_id: et.calendar_connection_id,
          start_at: start,
          end_at: end,
          invitee_name: guest.name ?? "",
          invitee_email: guest.email ?? "",
          invitee_timezone: guest.timezone ?? d.timezone ?? "UTC",
          answers: d.additional_fields ?? {},
          status,
          external_event_id: d.event_id ?? null,
          cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
          source: "web",
        },
        { onConflict: "nylas_booking_id" }
      );

      // El título del evento lo pone Nylas sin el nombre de quien reserva, así que
      // lo añadimos aquí: en la agenda del cliente se distingue una cita de otra.
      if (status !== "cancelled" && d.event_id && guest.name && et.calendar_connection_id) {
        const { data: conn } = await db
          .from("calendar_connections")
          .select("nylas_grant_id, external_calendar_id")
          .eq("id", et.calendar_connection_id)
          .maybeSingle();
        if (conn?.nylas_grant_id) {
          try {
            await updateEventTitle(
              conn.nylas_grant_id,
              conn.external_calendar_id ?? "primary",
              d.event_id,
              `${et.name} — ${guest.name}`
            );
          } catch (e) {
            // Nunca romper el webhook por esto: la cita ya está guardada.
            console.error("[webhook] no se pudo renombrar el evento:", (e as Error).message);
          }
        }
      }
    }
  }

  if (type === "grant.expired" || type === "grant.deleted") {
    await db.from("calendar_connections")
      .update({ status: type === "grant.deleted" ? "revoked" : "expired", grant_status: "invalid" })
      .eq("nylas_grant_id", d.grant_id ?? d.id);
  }

  return NextResponse.json({ ok: true });
}
