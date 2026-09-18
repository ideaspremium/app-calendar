import { appUrl } from "@/lib/config";
import { supabaseAdmin } from "./supabase/admin";
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

export async function getPublicEventTypes(clientId: string): Promise<EventType[]> {
  const db = supabaseAdmin();
  const { data } = await db.from("event_types").select("*")
    .eq("client_id", clientId).eq("is_active", true).order("name");
  return (data ?? []) as EventType[];
}

export async function getPublicEventType(clientId: string, slug: string): Promise<EventType | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("event_types").select("*")
    .eq("client_id", clientId).eq("slug", slug).eq("is_active", true).maybeSingle();
  return data as EventType | null;
}
