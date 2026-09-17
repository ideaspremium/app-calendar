import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, listCalendars } from "@/lib/nylas";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return NextResponse.json({ error: "Faltan code/state" }, { status: 400 });

  const { c: clientId } = JSON.parse(Buffer.from(state, "base64url").toString());
  const token = await exchangeCode(code);

  const calendars = await listCalendars(token.grant_id);
  const primary = calendars.find((c) => c.is_primary) ?? calendars.find((c) => !c.read_only) ?? calendars[0];

  const db = supabaseAdmin();
  const providerMap: Record<string, string> = { google: "google", microsoft: "microsoft", icloud: "icloud", imap: "imap", ews: "ews" };
  await db.from("calendar_connections").upsert(
    {
      client_id: clientId,
      provider: providerMap[token.provider] ?? "other",
      account_email: token.email,
      nylas_grant_id: token.grant_id,
      external_calendar_id: primary?.id ?? null,
      check_calendar_ids: calendars.filter((c) => !c.read_only).map((c) => c.id),
      status: "active",
      grant_status: "valid",
      scopes: token.scope ? token.scope.split(" ") : [],
      nylas_region: "eu",
    },
    { onConflict: "nylas_grant_id" }
  );

  return NextResponse.redirect(new URL(`/admin/clients/${clientId}?connected=1`, process.env.NEXT_PUBLIC_APP_URL));
}
