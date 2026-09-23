import { NextRequest } from "next/server";
import { requireAgency } from "@/lib/admin/context";
import { agencyClients, bookingsQuery, STATUS, type BookingRow } from "@/lib/admin/data";
import { LOCALE, zl } from "@/lib/admin/time";
import { formatInTimeZone } from "@/lib/datetime";
import { isValidZone } from "@/lib/zones";

/**
 * CSV de las citas con los mismos filtros que la lista. Cada hora va con su zona escrita
 * en la columna de al lado, y además en UTC (ISO 8601) para quien lo cruce con otras cosas.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAgency();
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const clients = await agencyClients(ctx);
  const { data, error } = await bookingsQuery(ctx, clients.map((c) => c.id), { ...sp, periodo: sp.periodo ?? "proximas" }).limit(5000);
  if (error) return new Response(error.message, { status: 500 });

  const me = ctx.viewerTz;
  const byBiz = sp.zona === "negocio";
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    "Fecha", "Hora de inicio", "Hora de fin", "Zona de estas horas", "Negocio", "Servicio", "Persona", "Correo", "Teléfono",
    "Estado", "Origen", "Referencia", "Zona de la persona", "Hora para la persona", "Respuestas", "Inicio (UTC)", "Reservada (UTC)",
  ];
  const lines = [head.map(esc).join(",")];
  for (const b of (data ?? []) as unknown as BookingRow[]) {
    const biz = isValidZone(b.clients?.timezone) ? b.clients!.timezone : me;
    const tz = byBiz ? biz : me;
    const guest = isValidZone(b.invitee_timezone) ? b.invitee_timezone : biz;
    const qs = b.event_types?.questions ?? [];
    const answers = Object.entries(b.answers ?? {})
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => `${qs.find((q) => q.key === k)?.label ?? k}: ${v}`)
      .join("; ");
    lines.push(
      [
        formatInTimeZone(b.start_at, tz, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA"),
        formatInTimeZone(b.start_at, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, LOCALE),
        formatInTimeZone(b.end_at, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, LOCALE),
        `${tz} · ${zl(tz, b.start_at)}`,
        b.clients?.name ?? "",
        b.event_types?.name ?? "",
        b.invitee_name,
        b.invitee_email,
        b.invitee_phone ?? "",
        STATUS[b.status]?.label ?? b.status,
        b.source === "api" ? "API" : "Web",
        b.external_ref ?? "",
        guest,
        formatInTimeZone(b.start_at, guest, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, LOCALE),
        answers,
        new Date(b.start_at).toISOString(),
        new Date(b.created_at).toISOString(),
      ].map(esc).join(","),
    );
  }
  const stamp = formatInTimeZone(new Date(), me, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA");
  // BOM para que Excel abra bien las tildes.
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="citas-${ctx.agency.slug}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
