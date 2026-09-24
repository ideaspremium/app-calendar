import { NextRequest } from "next/server";
import { redirectForRef } from "@/lib/booking-ref-redirect";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return redirectForRef(req, action, req.nextUrl.searchParams.get("ref"));
}
