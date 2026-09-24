import { authenticate } from "@/lib/api/auth";
import { ApiError, handler, json, readJson } from "@/lib/api/http";
import { generateWebhookSecret } from "@/lib/api/webhooks";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Configuración del aviso saliente de esta clave: una URL https a la que se envían los
 * avisos de citas.
 *  - Por defecto (`notify_all_sources: false`): booking.cancelled y booking.rescheduled
 *    cuando una cita creada con esta clave cambia fuera de la API (enlace del correo).
 *  - Con `notify_all_sources: true`: booking.created, booking.rescheduled y
 *    booking.cancelled de todos los calendarios que ve la clave, sea cual sea el origen
 *    (web, API o enlace del correo). Es lo que usa Xtrategy360.
 */
export const GET = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  const { data } = await supabaseAdmin()
    .from("api_keys")
    .select("webhook_url, webhook_secret, webhook_notify_all_sources")
    .eq("id", key.id)
    .single();
  return json(ctx, {
    url: data?.webhook_url ?? null,
    has_secret: !!data?.webhook_secret,
    notify_all_sources: !!data?.webhook_notify_all_sources,
  });
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
  if (body.notify_all_sources !== undefined && typeof body.notify_all_sources !== "boolean") {
    throw new ApiError("invalid_request", "«notify_all_sources» debe ser true o false.", { details: { field: "notify_all_sources" } });
  }
  const db = supabaseAdmin();
  const { data: current } = await db
    .from("api_keys")
    .select("webhook_secret, webhook_notify_all_sources")
    .eq("id", key.id)
    .single();
  const secret = !current?.webhook_secret || body.rotate_secret === true ? generateWebhookSecret() : current.webhook_secret;
  // Sin el campo, se conserva lo que hubiera: cambiar la URL no cambia el alcance.
  const notifyAll = typeof body.notify_all_sources === "boolean" ? body.notify_all_sources : !!current?.webhook_notify_all_sources;
  const { error } = await db
    .from("api_keys")
    .update({ webhook_url: url, webhook_secret: secret, webhook_notify_all_sources: notifyAll })
    .eq("id", key.id);
  if (error) throw new Error(`webhook config: ${error.message}`);
  return json(ctx, { url, secret, notify_all_sources: notifyAll });
});

export const DELETE = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  await supabaseAdmin().from("api_keys").update({ webhook_url: null, webhook_secret: null }).eq("id", key.id);
  const { data } = await supabaseAdmin().from("api_keys").select("webhook_notify_all_sources").eq("id", key.id).single();
  return json(ctx, { url: null, has_secret: false, notify_all_sources: !!data?.webhook_notify_all_sources });
});
