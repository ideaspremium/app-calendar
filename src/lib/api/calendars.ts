import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EventType } from "@/lib/types";
import { canAccessAgency, type ApiKey } from "./auth";
import { ApiError, isUuid } from "./http";
import { addDaysToLocalDate, DAY_MS, localParts, MINUTE_MS, startOfLocalDay, timeToMinutes } from "./time";

/**
 * Vocabulario de la API frente al modelo interno:
 *   calendario  = cliente (`clients`): el negocio con su zona horaria y su horario.
 *   servicio    = tipo de cita (`event_types`): duración, márgenes, antelación, preguntas.
 *   profesional = calendario conectado (`calendar_connections`). Hoy cada servicio tiene
 *                 uno; el contrato ya devuelve una lista para cuando haya varios.
 * Los identificadores son los uuid de esas tablas: no cambian aunque cambie el nombre o el slug.
 */

export type Connection = {
  id: string;
  account_email: string;
  status: string;
  nylas_grant_id: string;
  external_calendar_id: string | null;
};
type Rule = { weekday: number; start_time: string; end_time: string; event_type_id: string | null };
type Override = { date: string; is_blocked: boolean; start_time: string | null; end_time: string | null; event_type_id: string | null };

export type CalendarCtx = {
  client: { id: string; agency_id: string; name: string; slug: string; timezone: string; locale: string };
  services: EventType[];
  connections: Connection[];
  rules: Rule[];
  overrides: Override[];
};

type ClientRow = CalendarCtx["client"] & { is_active: boolean };

const CLIENT_COLS = "id, agency_id, name, slug, timezone, locale, is_active";

/** Un día antes de hoy en UTC: cubre cualquier zona sin traer festivos de años pasados. */
const overridesFrom = () => new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

/**
 * Servicios, calendarios conectados, horario y cierres de varios clientes a la vez.
 * Son consultas planas en paralelo (una sola espera) en lugar de un select con
 * relaciones embebidas: event_types, bookings y availability_* enlazan clients con
 * otras tablas por más de un camino y PostgREST exige desambiguar cada relación.
 */
async function loadParts(clientIds: string[]) {
  const db = supabaseAdmin();
  const [services, connections, rules, overrides] = await Promise.all([
    db.from("event_types").select("*").in("client_id", clientIds).eq("is_active", true).order("name"),
    db
      .from("calendar_connections")
      .select("id, client_id, account_email, status, nylas_grant_id, external_calendar_id")
      .in("client_id", clientIds),
    db.from("availability_rules").select("client_id, weekday, start_time, end_time, event_type_id").in("client_id", clientIds),
    db
      .from("availability_overrides")
      .select("client_id, date, is_blocked, start_time, end_time, event_type_id")
      .in("client_id", clientIds)
      .gte("date", overridesFrom()),
  ]);
  for (const r of [services, connections, rules, overrides]) {
    if (r.error) throw new Error(`loadCalendar: ${r.error.message}`);
  }
  const by = <T extends { client_id: string }>(rows: T[] | null, id: string) => (rows ?? []).filter((x) => x.client_id === id);
  return (c: ClientRow): CalendarCtx => ({
    client: { id: c.id, agency_id: c.agency_id, name: c.name, slug: c.slug, timezone: c.timezone, locale: c.locale },
    services: by(services.data as EventType[] | null, c.id),
    connections: by(connections.data as (Connection & { client_id: string })[] | null, c.id),
    rules: by(rules.data as (Rule & { client_id: string })[] | null, c.id),
    overrides: by(overrides.data as (Override & { client_id: string })[] | null, c.id),
  });
}

/** Carga el calendario con todo lo necesario. 404 si no existe o la clave no lo ve. */
export async function loadCalendar(key: ApiKey, calendarId: unknown): Promise<CalendarCtx> {
  if (!isUuid(calendarId)) {
    throw new ApiError("calendar_not_found", "No existe ese calendario.", { details: { calendar_id: calendarId ?? null } });
  }
  // El cliente y sus piezas a la vez: si resulta que no existe, las piezas vienen vacías.
  const [clientRes, build] = await Promise.all([
    supabaseAdmin().from("clients").select(CLIENT_COLS).eq("id", calendarId).maybeSingle(),
    loadParts([calendarId]),
  ]);
  if (clientRes.error) throw new Error(`loadCalendar: ${clientRes.error.message}`);
  const row = clientRes.data as ClientRow | null;
  // Mismo error si no existe o si es de otra agencia: no se revela qué ids existen.
  if (!row || !row.is_active || !canAccessAgency(key, row.agency_id)) {
    throw new ApiError("calendar_not_found", "No existe ese calendario.", { details: { calendar_id: calendarId } });
  }
  return build(row);
}

export async function listCalendars(key: ApiKey): Promise<CalendarCtx[]> {
  let q = supabaseAdmin().from("clients").select(CLIENT_COLS).eq("is_active", true);
  if (key.agency_id) q = q.eq("agency_id", key.agency_id);
  const { data, error } = await q.order("name");
  if (error) throw new Error(`listCalendars: ${error.message}`);
  const rows = (data ?? []) as ClientRow[];
  if (!rows.length) return [];
  const build = await loadParts(rows.map((r) => r.id));
  return rows.map(build);
}

/* ---------------------------------- servicios --------------------------------- */

/**
 * Servicio de la petición. Si no se indica: el único servicio reservable del calendario;
 * si hay varios, el único con esa duración; si sigue habiendo duda, service_required.
 */
export function resolveService(ctx: CalendarCtx, serviceId: unknown, durationMinutes?: number | null): EventType {
  if (serviceId !== undefined && serviceId !== null && serviceId !== "") {
    const s = isUuid(serviceId) ? ctx.services.find((x) => x.id === serviceId) : undefined;
    if (!s) {
      throw new ApiError("service_not_found", "Ese servicio no existe en este calendario.", {
        details: { service_id: serviceId, services: ctx.services.map(serviceSummary) },
      });
    }
    if (durationMinutes && durationMinutes !== s.duration_minutes) {
      throw new ApiError("invalid_duration", `El servicio «${s.name}» dura ${s.duration_minutes} minutos.`, {
        details: { duration_minutes: s.duration_minutes, requested: durationMinutes },
      });
    }
    return s;
  }
  let candidates = ctx.services.filter((s) => isBookable(ctx, s));
  if (!candidates.length) candidates = ctx.services;
  if (durationMinutes) candidates = candidates.filter((s) => s.duration_minutes === durationMinutes);
  if (candidates.length === 1) return candidates[0];
  throw new ApiError(
    "service_required",
    candidates.length
      ? "Este calendario tiene varios servicios: indica service_id."
      : "No hay ningún servicio con esa duración en este calendario.",
    { details: { services: ctx.services.map(serviceSummary) } }
  );
}

const serviceSummary = (s: EventType) => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes });

export function connectionOf(ctx: CalendarCtx, s: EventType) {
  return ctx.connections.find((c) => c.id === s.calendar_connection_id) ?? null;
}

function isBookable(ctx: CalendarCtx, s: EventType) {
  const conn = connectionOf(ctx, s);
  return !!s.nylas_configuration_id && conn?.status === "active";
}

/** Lo que hace falta para reservar ese servicio, o el motivo concreto por el que no se puede. */
export function bookingTarget(ctx: CalendarCtx, s: EventType) {
  const conn = connectionOf(ctx, s);
  if (!s.nylas_configuration_id || !conn) {
    throw new ApiError("service_not_bookable", `El servicio «${s.name}» no está publicado o no tiene calendario asignado.`, {
      details: { service_id: s.id },
    });
  }
  if (conn.status !== "active") {
    throw new ApiError(
      "calendar_disconnected",
      "El calendario del profesional está desconectado: hay que volver a conectarlo desde el panel.",
      { details: { service_id: s.id, professional_id: conn.id } }
    );
  }
  return { configurationId: s.nylas_configuration_id, connection: conn };
}

/** Formato público de un profesional. Hoy el nombre es el del negocio. */
export function professionalOf(ctx: CalendarCtx, conn: Connection | null) {
  return conn ? { id: conn.id, name: ctx.client.name } : null;
}

/** Cómo se rellena cada pregunta del servicio desde la petición de reserva. */
export function questionSource(type: string) {
  if (type === "email") return "attendee.email";
  if (type === "phone_number") return "attendee.phone";
  return "answers";
}

export function serializeService(ctx: CalendarCtx, s: EventType) {
  const conn = connectionOf(ctx, s);
  const prof = professionalOf(ctx, conn);
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    duration_minutes: s.duration_minutes,
    bookable: isBookable(ctx, s),
    min_notice_minutes: s.min_notice_minutes,
    max_days_ahead: s.max_days_ahead,
    professionals: prof ? [prof] : [],
    questions: (s.questions ?? []).map((q) => ({
      key: q.key,
      label: q.label,
      type: q.type || "text",
      required: !!q.required,
      source: questionSource(q.type || "text"),
    })),
  };
}

export function serializeCalendar(ctx: CalendarCtx) {
  return {
    id: ctx.client.id,
    name: ctx.client.name,
    timezone: ctx.client.timezone,
    locale: ctx.client.locale,
    services: ctx.services.map((s) => serializeService(ctx, s)),
  };
}

/* --------------------------- reglas de disponibilidad -------------------------- */

/** Horario del servicio si tiene uno propio; si no, el general del calendario (como en la publicación). */
export function effectiveRules(ctx: CalendarCtx, s: EventType) {
  const own = ctx.rules.filter((r) => r.event_type_id === s.id);
  return own.length ? own : ctx.rules.filter((r) => r.event_type_id === null);
}

function overridesFor(ctx: CalendarCtx, s: EventType) {
  return ctx.overrides.filter((o) => o.is_blocked && (o.event_type_id === null || o.event_type_id === s.id));
}

/** Días completos cerrados, para `exdates` de Nylas. */
export function blockedDates(ctx: CalendarCtx, s: EventType) {
  return [...new Set(overridesFor(ctx, s).filter((o) => !o.start_time || !o.end_time).map((o) => o.date))].sort();
}

/** ¿Cae el intervalo en un cierre (día completo o tramo) del calendario? */
export function isBlocked(ctx: CalendarCtx, s: EventType, start: Date, end: Date) {
  const tz = ctx.client.timezone;
  for (const o of overridesFor(ctx, s)) {
    const dayStart = startOfLocalDay(o.date, tz);
    let from = dayStart;
    let to = startOfLocalDay(addDaysToLocalDate(o.date, 1), tz);
    if (o.start_time && o.end_time) {
      from = new Date(dayStart.getTime() + timeToMinutes(o.start_time) * MINUTE_MS);
      to = new Date(dayStart.getTime() + timeToMinutes(o.end_time, true) * MINUTE_MS);
    }
    if (start < to && end > from) return true;
  }
  return false;
}

/**
 * ¿Cabe el intervalo entero dentro de un tramo del horario de atención, en la hora
 * local del calendario? Sirve para distinguir outside_hours de slot_taken.
 */
export function fitsOpenHours(ctx: CalendarCtx, s: EventType, start: Date, end: Date) {
  const tz = ctx.client.timezone;
  const a = localParts(start, tz);
  const b = localParts(end, tz);
  let endMin: number;
  if (b.date === a.date) endMin = b.minutes;
  else if (b.date === addDaysToLocalDate(a.date, 1) && b.minutes === 0) endMin = 1440;
  else return false;
  return effectiveRules(ctx, s).some(
    (r) => r.weekday === a.weekday && timeToMinutes(r.start_time) <= a.minutes && endMin <= timeToMinutes(r.end_time, true)
  );
}

/** Ventana reservable ahora mismo: [ahora + antelación mínima, ahora + horizonte]. */
export function bookingWindow(s: EventType, now = new Date()) {
  return {
    earliest: new Date(now.getTime() + s.min_notice_minutes * MINUTE_MS),
    latest: new Date(now.getTime() + s.max_days_ahead * DAY_MS),
  };
}
