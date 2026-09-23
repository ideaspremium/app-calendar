import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Vuelta de los enlaces de acceso.
 * - ?code=…  enlace mágico pedido desde /admin/login (PKCE).
 * - ?token_hash=…&type=…  plantillas de correo que usen el hash del token.
 * - Nada: invitaciones de Supabase, que traen la sesión en el fragmento (#access_token=…).
 *   El fragmento no llega al servidor pero el navegador lo conserva en la redirección, y
 *   /admin/login lo recoge.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const sb = await supabaseServer();
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/admin/login?error=enlace", req.url));
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return NextResponse.redirect(new URL("/admin/login?error=enlace", req.url));
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  return NextResponse.redirect(new URL("/admin/login", req.url));
}
