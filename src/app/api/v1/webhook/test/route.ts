import { randomUUID } from "crypto";
import { authenticate } from "@/lib/api/auth";
import { ApiError, handler, json } from "@/lib/api/http";
import { sign } from "@/lib/api/webhooks";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Envía un aviso `ping` firmado a la URL configurada, para probar la verificación de firma. */
export const POST = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  const { data } = await supabaseAdmin().from("api_keys").select("webhook_url, webhook_secret").eq("id", key.id).single();
  if (!data?.webhook_url || !data.webhook_secret) {
    throw new ApiError("invalid_request", "No hay URL de aviso configurada: usa PUT /api/v1/webhook primero.");
  }
  const now = new Date().toISOString();
  const body = JSON.stringify({ id: randomUUID(), event: "ping", type: "ping", occurred_at: now, created_at: now, data: {} });
  let status: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(data.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PremiumCalendar-Webhook/1",
        "X-PremiumCalendar-Event": "ping",
        "X-PremiumCalendar-Signature": sign(data.webhook_secret, body),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    status = res.status;
  } catch (e) {
    error = (e as Error).message;
  }
  return json(ctx, { delivered: status !== null && status < 300, status, error });
});
