import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Verificación inicial del webhook (Nylas envía ?challenge=...). */
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  return new NextResponse(challenge ?? "", { status: 200 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-nylas-signature") ?? "";
  const expected = createHmac("sha256", process.env.NYLAS_WEBHOOK_SECRET!).update(raw).digest("hex");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  const evt = JSON.parse(raw);
  const type: string = evt.type ?? "";
  const d = evt.data?.object ?? {};
  const db = supabaseAdmin();

  if (type.startsWith("booking.")) {
    const configId: string | undefined = d.configuration_id;
    const { data: et } = configId
      ? await db.from("event_types").select("id, client_id, calendar_connection_id").eq("nylas_configuration_id", configId).maybeSingle()
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
    }
  }

  if (type === "grant.expired" || type === "grant.deleted") {
    await db.from("calendar_connections")
      .update({ status: type === "grant.deleted" ? "revoked" : "expired", grant_status: "invalid" })
      .eq("nylas_grant_id", d.grant_id ?? d.id);
  }

  return NextResponse.json({ ok: true });
}
