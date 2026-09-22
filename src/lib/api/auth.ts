import { createHash, randomBytes } from "crypto";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ApiError } from "./http";

export type ApiKey = {
  id: string;
  name: string;
  /** null = clave de plataforma: ve los calendarios de todas las agencias. */
  agency_id: string | null;
};

export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Clave nueva: `pc_live_` + 32 bytes aleatorios. Solo se guarda su sha256. */
export function generateKey() {
  const raw = `pc_live_${randomBytes(32).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 12), hash: hashKey(raw) };
}

// Caché por instancia: la consulta de disponibilidad va dentro de un turno de chat y
// cada viaje a la base de datos cuenta. Una clave revocada deja de valer en ≤ 60 s.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { key: ApiKey; lastUsed: number; at: number }>();

function readRawKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key")?.trim() || null;
}

export async function authenticate(req: Request): Promise<ApiKey> {
  const raw = readRawKey(req);
  if (!raw) {
    throw new ApiError("unauthorized", "Falta la clave de API: cabecera «Authorization: Bearer <clave>».");
  }
  const hash = hashKey(raw);
  const now = Date.now();
  const hit = cache.get(hash);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    touch(hit.key.id, hit.lastUsed, now);
    return hit.key;
  }

  const { data } = await supabaseAdmin()
    .from("api_keys")
    .select("id, name, agency_id, last_used_at, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at) {
    cache.delete(hash);
    throw new ApiError("unauthorized", "Clave de API no válida o revocada.");
  }
  const key: ApiKey = { id: data.id, name: data.name, agency_id: data.agency_id };
  const lastUsed = data.last_used_at ? Date.parse(data.last_used_at) : 0;
  cache.set(hash, { key, lastUsed, at: now });
  touch(key.id, lastUsed, now);
  return key;
}

/** Marca el último uso como mucho cada 10 minutos, después de responder. */
function touch(id: string, lastUsed: number, now: number) {
  if (now - lastUsed < 10 * 60_000) return;
  for (const v of cache.values()) if (v.key.id === id) v.lastUsed = now;
  after(async () => {
    await supabaseAdmin().from("api_keys").update({ last_used_at: new Date(now).toISOString() }).eq("id", id);
  });
}

/** ¿Puede esta clave ver un calendario de esta agencia? */
export function canAccessAgency(key: ApiKey, agencyId: string) {
  return key.agency_id === null || key.agency_id === agencyId;
}
