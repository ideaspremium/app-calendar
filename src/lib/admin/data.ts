import type { AdminContext, Agency } from "./context";
import type { Branding } from "@/lib/types";
import { isValidZone } from "@/lib/zones";

export type ClientSummary = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  branding: Branding;
  is_active: boolean;
  custom_domain: string | null;
  event_types: { id: string; name: string; slug: string; is_active: boolean; nylas_configuration_id: string | null }[];
  calendar_connections: { id: string; status: string; account_email: string; provider: string }[];
  availability_rules: { weekday: number }[];
};

/** Negocios de la agencia elegida, con lo necesario para saber si están listos. */
export async function agencyClients(ctx: AdminContext & { agency: Agency }): Promise<ClientSummary[]> {
  const { data, error } = await ctx.sb
    .from("clients")
    .select(
      "id,name,slug,timezone,locale,branding,is_active,custom_domain," +
        "event_types(id,name,slug,is_active,nylas_configuration_id)," +
        "calendar_connections(id,status,account_email,provider)," +
        "availability_rules(weekday)",
    )
    .eq("agency_id", ctx.agency.id)
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ClientSummary[]).map((c) => ({
    ...c,
    branding: (c.branding ?? {}) as Branding,
    event_types: (c.event_types ?? []).filter((t) => t.is_active),
  }));
}

export type Readiness = {
  calendar: "ok" | "missing" | "reconnect";
  hours: boolean;
  services: number;
  published: number;
  zoneOk: boolean;
  ready: boolean;
};

export function readiness(c: Pick<ClientSummary, "calendar_connections" | "availability_rules" | "event_types" | "timezone">): Readiness {
  const conns = c.calendar_connections ?? [];
  const calendar = conns.some((k) => k.status === "active") ? "ok" : conns.length ? "reconnect" : "missing";
  const hours = (c.availability_rules ?? []).length > 0;
  const services = c.event_types.length;
  const published = c.event_types.filter((t) => t.nylas_configuration_id).length;
  const zoneOk = isValidZone(c.timezone);
  return { calendar, hours, services, published, zoneOk, ready: calendar === "ok" && hours && published > 0 && zoneOk };
}

export type BookingRow = {
  id: string;
  client_id: string;
  event_type_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  invitee_name: string;
  invitee_email: string;
  invitee_phone: string | null;
  invitee_timezone: string;
  answers: Record<string, unknown>;
  notes: string | null;
  external_ref: string | null;
  manage_token: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  event_types: { name: string; duration_minutes: number; questions: { key: string; label: string }[] } | null;
  clients: { name: string; slug: string; timezone: string } | null;
};

export const BOOKING_SELECT =
  "id,client_id,event_type_id,start_at,end_at,status,source,invitee_name,invitee_email,invitee_phone,invitee_timezone," +
  "answers,notes,external_ref,manage_token,created_at,cancelled_at,cancel_reason," +
  "event_types(name,duration_minutes,questions),clients(name,slug,timezone)";

export const STATUS: Record<string, { label: string; cls: string; icon: "check" | "swap" | "x" | "clock" }> = {
  confirmed: { label: "Confirmada", cls: "p-ok", icon: "check" },
  rescheduled: { label: "Cambiada", cls: "p-warn", icon: "swap" },
  cancelled: { label: "Cancelada", cls: "p-n", icon: "x" },
  pending: { label: "Pendiente", cls: "p-info", icon: "clock" },
  completed: { label: "Hecha", cls: "p-n", icon: "check" },
  no_show: { label: "No vino", cls: "p-bad", icon: "x" },
};

/** Estados que ocupan hueco (los mismos que la restricción de solapes de la tabla). */
export const LIVE_STATUSES = ["pending", "confirmed", "rescheduled"];

export const LOCATION_LABEL: Record<string, string> = {
  in_person: "Presencial",
  phone: "Teléfono",
  video: "Videollamada",
  custom: "Otro lugar",
};

/** Filtros de la lista de citas (vienen de la URL). */
export type BookingFilters = { q?: string; negocio?: string; servicio?: string; periodo?: string; estado?: string };

export function bookingsQuery(ctx: AdminContext & { agency: Agency }, clientIds: string[], f: BookingFilters, now = new Date()) {
  let q = ctx.sb.from("bookings").select(BOOKING_SELECT).in("client_id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
  if (f.negocio && clientIds.includes(f.negocio)) q = q.eq("client_id", f.negocio);
  if (f.servicio) q = q.eq("event_type_id", f.servicio);
  if (f.estado && STATUS[f.estado]) q = q.eq("status", f.estado);
  const periodo = f.periodo ?? "proximas";
  if (periodo === "proximas") q = q.gte("end_at", now.toISOString());
  if (periodo === "pasadas") q = q.lt("end_at", now.toISOString());
  const term = (f.q ?? "").replace(/[,()*%\\:"']/g, " ").trim();
  if (term) q = q.or(`invitee_name.ilike.*${term}*,invitee_email.ilike.*${term}*,external_ref.ilike.*${term}*`);
  q = q.order("start_at", { ascending: periodo !== "pasadas" });
  return q;
}
