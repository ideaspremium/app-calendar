"use client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}
