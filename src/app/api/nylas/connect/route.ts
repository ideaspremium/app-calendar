import { NextRequest, NextResponse } from "next/server";
import { hostedAuthUrl } from "@/lib/nylas";
import { supabaseServer } from "@/lib/supabase/server";

/** Inicia la conexión de una cuenta de calendario para un cliente. GET /api/nylas/connect?client_id=...&email=... */
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/admin/login", req.url));

  const clientId = req.nextUrl.searchParams.get("client_id");
  const email = req.nextUrl.searchParams.get("email") ?? undefined;
  if (!clientId) return NextResponse.json({ error: "client_id requerido" }, { status: 400 });

  // RLS garantiza que el usuario pertenece a la agencia del cliente
  const { data: client } = await sb.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const state = Buffer.from(JSON.stringify({ c: clientId, u: user.id })).toString("base64url");
  return NextResponse.redirect(hostedAuthUrl(state, email));
}
