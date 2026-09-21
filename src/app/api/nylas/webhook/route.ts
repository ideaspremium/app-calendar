import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { updateEventTitle } from "@/lib/nylas";

type Json = Record<string, unknown>;

/** Convierte epoch en segundos o fecha ISO a ISO; null si no es utilizable. */
function toIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Nylas usa segundos; si alguna vez llegan milisegundos, el año saldría absurdo.
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

/**
 * Último recurso: busca una clave por todo el aviso, a cualquier profundidad.
 * Existe porque el esquema de Nylas ya nos ha movido las horas de sitio una vez;
 * así un cambio suyo deja de costar un ciclo de despliegue.
 */
function deepFind(value: unknown, key: string, depth = 0): unknown {
  if (depth > 6 || !value || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    const obj = value as Json;
    if (key in obj && obj[key] != null) return obj[key];
  }
  for (const child of Object.values(value as Json)) {
    const found = deepFind(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Nombres de campos y tipos, sin valores: sirve para diagnosticar sin volcar datos personales. */
function describeShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.length ? [describeShape(value[0], depth + 1)] : [];
  if (value && typeof value === "object") {
    if (depth >= 3) return "objeto";
    return Object.fromEntries(
      Object.entries(value as Json).map(([k, v]) => [k, describeShape(v, depth + 1)])
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
  const d: Json = evt.data?.object ?? {};
  const db = supabaseAdmin();

  if (type.startsWith("booking.")) {
    // Nylas envía los datos de la reserva dentro de `booking_info`, no sueltos en el objeto.
    // Los otros dos caminos son por si el esquema vuelve a cambiar.
    const bi: Json = (d.booking_info as Json) ?? (d.event as Json) ?? (d.when as Json) ?? {};

    const configId = (d.configuration_id ?? bi.configuration_id) as string | undefined;
    const { data: et, error: etError } = configId
      ? await db
          .from("event_types")
          .select("id, client_id, calendar_connection_id, name")
          .eq("nylas_configuration_id", configId)
          .maybeSingle()
      : { data: null, error: null };
    if (!et) {
      console.error(
        "[webhook] no encuentro el tipo de cita.",
        "configuration_id:", configId ?? "(ausente)",
        "| error:", etError?.message ?? "ninguno"
      );
    }

    // La conexión nos da el correo del anfitrión, que es lo que permite distinguir
    // al invitado dentro de `participants` (ahí están los dos).
    const { data: conn } = et?.calendar_connection_id
      ? await db
          .from("calendar_connections")
          .select("nylas_grant_id, external_calendar_id, account_email")
          .eq("id", et.calendar_connection_id)
          .maybeSingle()
      : { data: null };

    const status =
      type === "booking.cancelled" ? "cancelled" :
      type === "booking.rescheduled" ? "rescheduled" :
      type === "booking.pending" ? "pending" : "confirmed";

    const start = toIso(bi.start_time) ?? toIso(d.start_time) ?? toIso(deepFind(d, "start_time"));
    const end = toIso(bi.end_time) ?? toIso(d.end_time) ?? toIso(deepFind(d, "end_time"));

    if (!start || !end) {
      console.error(
        "[webhook] el aviso no trae horas utilizables. Estructura recibida:",
        JSON.stringify(describeShape(d))
      );
    }

    const participants = Array.isArray(bi.participants) ? (bi.participants as Json[]) : [];
    const hostEmail = (conn?.account_email ?? "").toLowerCase();
    const extra = (bi.additional_fields as Json) ?? {};
    // El invitado es el participante que no es el anfitrión. Si no hay forma de
    // distinguirlos, el primero; y si no hay participantes, lo que traiga el formulario.
    const guest =
      participants.find((p) => String(p.email ?? "").toLowerCase() !== hostEmail && p.email) ??
      participants[0] ??
      ((d.guest as Json) ?? {});

    const eventId = (bi.event_id ?? d.event_id ?? deepFind(d, "event_id")) as string | undefined;
    const location = typeof bi.location === "string" ? bi.location : "";
    const bookingId = (d.booking_id ?? d.id) as string | undefined;

    if (et && start && end && bookingId) {
      const guestName = String(guest.name ?? extra.name ?? "");
      const { error: saveError } = await db.from("bookings").upsert(
        {
          nylas_booking_id: bookingId,
          client_id: et.client_id,
          event_type_id: et.id,
          calendar_connection_id: et.calendar_connection_id,
          start_at: start,
          end_at: end,
          invitee_name: guestName,
          invitee_email: String(guest.email ?? extra.email ?? ""),
          invitee_phone: (extra.phone as string) ?? null,
          invitee_timezone: String(bi.guest_timezone ?? d.timezone ?? "UTC"),
          answers: extra,
          status,
          external_event_id: eventId ?? null,
          meeting_url: location.startsWith("http") ? location : null,
          cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
          cancel_reason:
            status === "cancelled"
              ? ((d.cancellation_reason ?? bi.cancellation_reason ?? null) as string | null)
              : null,
          source: "web",
        },
        { onConflict: "nylas_booking_id" }
      );
      if (saveError) {
        console.error("[webhook] no se pudo guardar la reserva:", saveError.message, "|", saveError.details ?? "");
      } else {
        console.log("[webhook] reserva guardada:", bookingId, "|", start, "→", end);
      }

      // El título del evento lo pone Nylas sin el nombre de quien reserva, así que
      // lo añadimos aquí: en la agenda del cliente se distingue una cita de otra.
      if (status !== "cancelled" && eventId && guestName && conn?.nylas_grant_id) {
        try {
          await updateEventTitle(
            conn.nylas_grant_id,
            conn.external_calendar_id ?? "primary",
            eventId,
            `${et.name} — ${guestName}`
          );
        } catch (e) {
          // Nunca romper el webhook por esto: la cita ya está guardada.
          console.error("[webhook] no se pudo renombrar el evento:", (e as Error).message);
        }
      }
    } else if (et && start && end && !bookingId) {
      console.error("[webhook] el aviso no trae booking_id; no se puede guardar sin clave.");
    }
  }

  if (type === "grant.expired" || type === "grant.deleted") {
    const grantId = (d.grant_id ?? d.id ?? evt.data?.grant_id) as string | undefined;
    if (grantId) {
      await db
        .from("calendar_connections")
        .update({ status: type === "grant.deleted" ? "revoked" : "expired", grant_status: "invalid" })
        .eq("nylas_grant_id", grantId);
    }
  }

  return NextResponse.json({ ok: true });
}
