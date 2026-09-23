import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Protege /admin. Corre en el borde de Vercel, cerca de quien usa el panel (en EE. UU.),
 * mientras que Supabase está en París: por eso la sesión se comprueba con getClaims, que
 * verifica la firma del token aquí mismo con la clave pública del proyecto (se descarga una
 * vez y se guarda 10 minutos), en vez de getUser, que cruzaba el Atlántico en cada clic.
 * La comprobación fuerte (getUser) la sigue haciendo el servidor de la página, en París,
 * y los permisos los sigue poniendo la base (RLS).
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        // Si la sesión se renueva aquí, la página de esta misma petición ya ve el token nuevo.
        all.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        all.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const path = req.nextUrl.pathname;
  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, req.url));
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };
  if (path.startsWith("/admin") && !path.startsWith("/admin/login") && !signedIn) return redirect("/admin/login");
  // Con sesión, la pantalla de acceso no tiene nada que hacer (y saldría dentro del panel).
  if (path.startsWith("/admin/login") && signedIn) return redirect("/admin");
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
