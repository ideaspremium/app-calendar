import { SUPABASE_URL } from "@/lib/config";
import { createClient } from "@supabase/supabase-js";

/** Cliente con service role. Solo en servidor (webhooks, reservas públicas). */
export function supabaseAdmin() {
  return createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
