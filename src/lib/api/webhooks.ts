import { createHmac, randomBytes, randomUUID } from "crypto";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadContexts } from "./calendars";
import { serializeBooking, type BookingRow } from "./bookings";
import { toIsoInZone } from "./time";

export type OutboundType = "booking.created" | "booking.rescheduled" | "booking.cancelled";

/** Quién hizo el cambio: la propia API (con cualquier clave) o alguien fuera de ella. */
export type ChangeOrigin = "api" | "external";

export const generateWebhookSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

/**
 * Firma como Stripe: `t=<epoch>,v1=<hex>` con HMAC-SHA256 de `${t}.${cuerpo}`.
 * Meter la marca de tiempo en lo firmado impide reenviar un aviso viejo.
 */
export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

type Target = { id: string; webhook_url: string; webhook_secret: string };

/** Espera entre intentos: 1.º inmediato, 2.º a 1 s, 3.º a 3 s (cada uno con 5 s de espera). */
const BACKOFF_MS = [0, 1000, 3000];
const ATTEMPT_TIMEOUT_MS = 5000;

/**
 * A quién se avisa de un cambio en una cita:
 *  - Claves con `webhook_notify_all_sources = true` que ven ese calendario (su agencia, o
 *    de plataforma): siempre, sea cual sea el origen. Es el caso de Xtrategy360.
 *  - La clave que creó la cita, si el cambio vino de fuera de la API: el comportamiento de
 *    siempre (cancelar o cambiar desde el enlace del correo). Solo cancelada/reprogramada.
 * Una misma clave nunca recibe el aviso dos veces.
 */
async function targetsFor(row: BookingRow, agencyId: string, type: OutboundType, origin: ChangeOrigin) {
  const db = supabaseAdmin();
  const { data: all } = await db
    .from("api_keys")
    .select("id, agency_id, webhook_url, webhook_secret")
    .eq("webhook_notify_all_sources", true)
    .is("revoked_at", null)
    .not("webhook_url", "is", null);
  const targets = new Map<string, Target>();
  for (const k of all ?? []) {
    if (!k.webhook_url || !k.webhook_secret) continue;
    if (k.agency_id !== null && k.agency_id !== agencyId) continue;
    targets.set(k.id, { id: k.id, webhook_url: k.webhook_url, webhook_secret: k.webhook_secret });
  }
  if (origin === "external" && type !== "booking.created" && row.api_key_id && !targets.has(row.api_key_id)) {
    const { data: creator } = await db
      .from("api_keys")
      .select("id, webhook_url, webhook_secret, revoked_at")
      .eq("id", row.api_key_id)
      .maybeSingle();
    if (creator?.webhook_url && creator.webhook_secret && !creator.revoked_at) {
      targets.set(creator.id, { id: creator.id, webhook_url: creator.webhook_url, webhook_secret: creator.webhook_secret });
    }
  }
  return [...targets.values()];
}

async function deliver(target: Target, type: OutboundType, body: string, bookingId: string) {
  let status = "failed";
  let error: string | null = null;
  let attempts = 0;
  for (const wait of BACKOFF_MS) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    attempts += 1;
    try {
      const res = await fetch(target.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "PremiumCalendar-Webhook/1",
          "X-PremiumCalendar-Event": type,
          // Se firma en cada intento: la marca de tiempo es la del envío.
          "X-PremiumCalendar-Signature": sign(target.webhook_secret, body),
        },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (res.ok) {
        status = "sent";
        error = null;
        break;
      }
      error = `HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  if (status === "failed") console.error("[webhook saliente]", type, bookingId, "→", target.webhook_url, error);
  await supabaseAdmin()
    .from("notifications")
    .insert({
      booking_id: bookingId,
      channel: "webhook",
      kind: type,
      recipient: target.webhook_url,
      status,
      error: error ? `${error} (intentos: ${attempts})` : null,
      provider_ref: target.id,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
}

function occurredAt(row: BookingRow, type: OutboundType) {
  if (type === "booking.cancelled" && row.cancelled_at) return row.cancelled_at;
  if (type === "booking.created") return row.created_at;
  return row.updated_at;
}

/**
 * Avisa de un cambio en una cita. Nunca lanza: un fallo aquí no debe tumbar la reserva ni
 * el webhook de Nylas. Cada envío queda en `notifications` (channel = 'webhook').
 *
 * Sobre (CONTRATO_CONVERSIONES §3.4 + compatibilidad): `event` y `occurred_at` del
 * contrato, y `id`, `type`, `created_at` de siempre; `data` es el objeto de cita.
 */
export async function dispatchBookingEvent(
  bookingId: string,
  type: OutboundType,
  origin: ChangeOrigin,
  opts: { delayMs?: number } = {}
) {
  try {
    // En las reservas web, el navegador manda la atribución justo después de reservar:
    // esperar un poco permite que el aviso ya la lleve. Si no llega a tiempo, el listado
    // incremental la recoge (cambia updated_at).
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    const db = supabaseAdmin();
    const { data } = await db.from("bookings").select("*").eq("id", bookingId).maybeSingle();
    const row = data as BookingRow | null;
    if (!row || row.status === "pending") return;
    const ctxs = await loadContexts([row.client_id]);
    const cal = ctxs.get(row.client_id);
    if (!cal) return;
    const targets = await targetsFor(row, cal.client.agency_id, type, origin);
    if (!targets.length) return;
    const now = new Date().toISOString();
    const body = JSON.stringify({
      id: randomUUID(),
      event: type,
      type,
      occurred_at: toIsoInZone(new Date(occurredAt(row, type)), cal.client.timezone),
      created_at: now,
      data: serializeBooking(cal, row),
    });
    await Promise.all(targets.map((t) => deliver(t, type, body, row.id)));
  } catch (e) {
    console.error("[webhook saliente] no se pudo enviar:", type, bookingId, (e as Error).message);
  }
}

/** Lo mismo, después de responder: no hace esperar a quien reserva ni a Nylas. */
export function scheduleBookingEvent(bookingId: string, type: OutboundType, origin: ChangeOrigin, opts: { delayMs?: number } = {}) {
  after(() => dispatchBookingEvent(bookingId, type, origin, opts));
}
