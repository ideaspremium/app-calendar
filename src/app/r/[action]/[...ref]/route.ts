import { NextRequest } from "next/server";
import { redirectForRef } from "@/lib/booking-ref-redirect";

export const dynamic = "force-dynamic";

/** Variante con la referencia en la ruta (/r/cancelar/<ref>), para base64url. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string; ref: string[] }> }) {
  const { action, ref } = await params;
  return redirectForRef(req, action, ref.join("/"));
}
