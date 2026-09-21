import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { updateEventTitle } from "@/lib/nylas";

/** Convierte epoch en segundos o fecha ISO a ISO; null si no es utilizable. */
function toIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Nylas usa segundos; si alguna vez llegan milisegundos, el año saldría absurdo.
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

/** Nombres de campos y tipos, sin valores: sirve para diagnosticar sin volcar datos personales. */
function describeShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.length ? [describeShape(value[0], depth + 1)] : [];
  if (value && typeof value === "object") {
    if (depth >= 2) return "objeto";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, describeShape(v, depth + 1)])
    );
  }
  return typeof value;
}

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
    const { data: et, error: etError } = configId
      ? await db.from("event_types").select("id, client_id, calendar_connection_id, name").eq("nylas_configuration_id", configId).maybeSingle()
      : { data: null, error: null };
    if (!et) {
      console.error(
        "[webhook] no encuentro el tipo de cita.",
        "configuration_id:", configId ?? "(ausente)",
        "| error:", etError?.message ?? "ninguno",
        "| campos del aviso:", Object.keys(d).join(", ")
      );
    }

    const status =
      type === "booking.cancelled" ? "cancelled" :
      type === "booking.rescheduled" ? "rescheduled" : "confirmed";

    const guest = d.guest ?? d.guests?.[0] ?? {};
    // Las horas pueden venir sueltas o dentro de `when`, según el aviso.
    const when = d.when ?? d.event?.when ?? d.booking?.when ?? {};
    const start =
      toIso(d.start_time) ?? toIso(when.start_time) ?? toIso(when.startTime) ?? toIso(d.event?.start_time);
    const end =
      toIso(d.end_time) ?? toIso(when.end_time) ?? toIso(when.endTime) ?? toIso(d.event?.end_time);

    if (!start || !end) {
      console.error(
        "[webhook] el aviso no trae horas utilizables. Estructura recibida:",
        JSON.stringify(describeShape(d))
      );
    }

    if (et && start && end) {
      const { error: saveError } = await db.from("bookings").upsert(
        {
          nylas_booking_id: d.booking_id ?? d.bookingId ?? d.id,
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
          external_event_id: d.event_id ?? d.eventId ?? d.event?.id ?? null,
          cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
          source: "web",
        },
        { onConflict: "nylas_booking_id" }
      );
      if (saveError) {
        console.error("[webhook] no se pudo guardar la reserva:", saveError.message, "|", saveError.details ?? "");
      } else {
        console.log("[webhook] reserva guardada:", d.booking_id ?? d.id);
      }

      // El título del evento lo pone Nylas sin el nombre de quien reserva, así que
      // lo añadimos aquí: en la agenda del cliente se distingue una cita de otra.
      const eventId = d.event_id ?? d.eventId ?? d.event?.id;
      if (status !== "cancelled" && eventId && guest.name && et.calendar_connection_id) {
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
              eventId,
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
