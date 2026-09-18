import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente con la sesión del usuario (RLS aplica). Para el panel admin. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try {
            all.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );
}
