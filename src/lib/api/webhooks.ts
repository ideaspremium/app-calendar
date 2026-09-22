import { createHmac, randomBytes, randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CalendarCtx } from "./calendars";
import { serializeBooking, type BookingRow } from "./bookings";

export type OutboundType = "booking.cancelled" | "booking.rescheduled";

export const generateWebhookSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

/**
 * Firma como Stripe: `t=<epoch>,v1=<hex>` con HMAC-SHA256 de `${t}.${cuerpo}`.
 * Meter la marca de tiempo en lo firmado impide reenviar un aviso viejo.
 */
export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/**
 * Avisa al integrador que creó la cita de que ha cambiado fuera de la API
 * (el visitante canceló o reprogramó desde el enlace del correo, por ejemplo).
 * Nunca lanza: un fallo aquí no debe tumbar el webhook de Nylas. Cada intento queda
 * en `notifications` para poder revisarlo.
 */
export async function notifyIntegrator(ctx: CalendarCtx, row: BookingRow, type: OutboundType) {
  if (!row.api_key_id) return;
  const db = supabaseAdmin();
  const { data: key } = await db
    .from("api_keys")
    .select("webhook_url, webhook_secret, revoked_at")
    .eq("id", row.api_key_id)
    .maybeSingle();
  if (!key?.webhook_url || !key.webhook_secret || key.revoked_at) return;

  const body = JSON.stringify({
    id: randomUUID(),
    type,
    created_at: new Date().toISOString(),
    data: serializeBooking(ctx, row),
  });

  let status = "sent";
  let error: string | null = null;
  try {
    const res = await fetch(key.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PremiumCalendar-Webhook/1",
        "X-PremiumCalendar-Event": type,
        "X-PremiumCalendar-Signature": sign(key.webhook_secret, body),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      status = "failed";
      error = `HTTP ${res.status}`;
    }
  } catch (e) {
    status = "failed";
    error = (e as Error).message;
  }
  if (status === "failed") console.error("[webhook saliente]", type, row.id, error);

  await db.from("notifications").insert({
    booking_id: row.id,
    channel: "webhook",
    kind: type,
    recipient: key.webhook_url,
    status,
    error,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  });
}
