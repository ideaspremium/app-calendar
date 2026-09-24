import { appUrl } from "@/lib/config";
import { supabaseAdmin } from "./supabase/admin";
import { bookingRef, decodeBookingRef } from "./nylas";
import type { Client, EventType } from "./types";

/** Resuelve cliente por slug o por dominio propio (host). */
export async function getPublicClient(slug: string, host?: string | null): Promise<Client | null> {
  const db = supabaseAdmin();
  let q = db.from("clients").select("*").eq("is_active", true);
  q = host && !host.includes(appUrl().replace(/^https?:\/\//, ""))
    ? q.eq("custom_domain", host)
    : q.eq("slug", slug);
  const { data } = await q.maybeSingle();
  return data as Client | null;
}

/**
 * Servicios que se pueden reservar: activos y publicados en Nylas. Uno sin publicar
 * no tiene página (daba 404 desde la lista), así que no se enseña.
 */
export async function getPublicEventTypes(clientId: string): Promise<EventType[]> {
  const db = supabaseAdmin();
  const { data } = await db.from("event_types").select("*")
    .eq("client_id", clientId).eq("is_active", true).not("nylas_configuration_id", "is", null).order("name");
  return (data ?? []) as EventType[];
}

export async function getPublicEventType(clientId: string, slug: string): Promise<EventType | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("event_types").select("*")
    .eq("client_id", clientId).eq("slug", slug).eq("is_active", true).maybeSingle();
  return data as EventType | null;
}

/**
 * El `booking_ref` de los enlaces de cambiar y cancelar es base64 (o base64url) de
 * 16 bytes del id de configuración + 16 del id de reserva (+ una sal). Es lo mismo que
 * hace `compactStringToUUIDs` en el componente de Nylas.
 */
export function bookingIdFromRef(ref: string): string | null {
  try {
    const raw = decodeURIComponent(ref).replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(raw, "base64");
    if (buf.length < 32) return null;
    const hex = buf.subarray(16, 32).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

/** La cita a la que apunta un enlace de cambiar o cancelar, para enseñarla en la columna. */
export async function getBookingForRef(clientId: string, ref: string): Promise<{ start: string; end: string } | null> {
  const id = bookingIdFromRef(ref);
  if (!id) return null;
  const db = supabaseAdmin();
  const { data } = await db.from("bookings").select("start_at, end_at, status")
    .eq("client_id", clientId).eq("nylas_booking_id", id).maybeSingle();
  if (!data || data.status === "cancelled") return null;
  return { start: data.start_at as string, end: data.end_at as string };
}

/**
 * A dónde lleva hoy una referencia de reserva de Nylas: dirección actual del negocio y
 * del servicio. Sirve a los enlaces de los correos (/r/…) y a los ya enviados con una
 * dirección antigua. Null si la referencia no es de ningún servicio nuestro.
 */
export async function resolveBookingRef(ref: string): Promise<{ clientSlug: string; eventSlug: string; ref: string } | null> {
  const decoded = decodeBookingRef(ref);
  if (!decoded) return null;
  const db = supabaseAdmin();
  const { data: et } = await db
    .from("event_types")
    .select("slug, client_id")
    .eq("nylas_configuration_id", decoded.configurationId)
    .maybeSingle();
  if (!et) return null;
  const { data: client } = await db.from("clients").select("slug").eq("id", et.client_id).maybeSingle();
  if (!client) return null;
  return { clientSlug: client.slug, eventSlug: et.slug, ref: bookingRef(decoded.configurationId, decoded.bookingId) };
}
