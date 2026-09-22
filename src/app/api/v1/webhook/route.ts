import { authenticate } from "@/lib/api/auth";
import { ApiError, handler, json, readJson } from "@/lib/api/http";
import { generateWebhookSecret } from "@/lib/api/webhooks";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Configuración del aviso saliente de esta clave: una URL https a la que se envían
 * booking.cancelled y booking.rescheduled cuando una cita creada con esta clave cambia
 * fuera de la API (por ejemplo, desde el enlace del correo del visitante).
 */
export const GET = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  const { data } = await supabaseAdmin().from("api_keys").select("webhook_url, webhook_secret").eq("id", key.id).single();
  return json(ctx, { url: data?.webhook_url ?? null, has_secret: !!data?.webhook_secret });
});

export const PUT = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  const body = await readJson(req);
  const url = typeof body.url === "string" ? body.url.trim() : "";
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {}
  if (!parsed || parsed.protocol !== "https:" || url.length > 2000) {
    throw new ApiError("invalid_request", "«url» debe ser una URL https válida.", { details: { field: "url" } });
  }
  const db = supabaseAdmin();
  const { data: current } = await db.from("api_keys").select("webhook_secret").eq("id", key.id).single();
  const secret = !current?.webhook_secret || body.rotate_secret === true ? generateWebhookSecret() : current.webhook_secret;
  const { error } = await db.from("api_keys").update({ webhook_url: url, webhook_secret: secret }).eq("id", key.id);
  if (error) throw new Error(`webhook config: ${error.message}`);
  return json(ctx, { url, secret });
});

export const DELETE = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  await supabaseAdmin().from("api_keys").update({ webhook_url: null, webhook_secret: null }).eq("id", key.id);
  return json(ctx, { url: null, has_secret: false });
});
