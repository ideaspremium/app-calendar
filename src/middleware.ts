import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const sb = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => all.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  );
  const { data: { user } } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;
  if (path.startsWith("/admin") && !path.startsWith("/admin/login") && !user) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
