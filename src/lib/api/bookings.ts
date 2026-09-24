import { appUrl } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EventType } from "@/lib/types";
import type { ApiKey } from "./auth";
import { connectionOf, loadCalendar, professionalOf, questionSource, type CalendarCtx } from "./calendars";
import { externalRefOut, type Attribution } from "./attribution";
import { ApiError, isUuid, optString } from "./http";
import { isValidTimeZone, toIsoInZone } from "./time";

export type BookingRow = {
  id: string;
  client_id: string;
  event_type_id: string | null;
  calendar_connection_id: string | null;
  start_at: string;
  end_at: string;
  invitee_name: string;
  invitee_email: string;
  invitee_phone: string | null;
  invitee_timezone: string;
  invitee_locale: string;
  answers: Record<string, string>;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled" | "rescheduled" | "no_show" | "completed";
  manage_token: string;
  nylas_booking_id: string | null;
  external_event_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  source: string;
  api_key_id: string | null;
  idempotency_key: string | null;
  request_hash: string | null;
  external_ref: string | null;
  attribution: Attribution | null;
  created_at: string;
  updated_at: string;
};

/**
 * Estado público. `rescheduled` se expone tal cual desde CONTRATO_CONVERSIONES v1.0
 * (la cita sigue en pie, en otra hora): Xtrategy360 lo usa para medir reprogramaciones.
 */
export function publicStatus(r: Pick<BookingRow, "status">) {
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "pending") return "pending";
  if (r.status === "rescheduled") return "rescheduled";
  if (r.status === "completed" || r.status === "no_show") return r.status;
  return "confirmed";
}

export const isActive = (r: Pick<BookingRow, "status">) =>
  r.status === "pending" || r.status === "confirmed" || r.status === "rescheduled";

/**
 * Enlaces para el visitante. Van por el token de la cita, no por el slug del cliente:
 * así siguen valiendo aunque se renombre el cliente o el servicio.
 */
export function manageLinks(r: Pick<BookingRow, "manage_token" | "nylas_booking_id">) {
  if (!r.nylas_booking_id) return null;
  const base = `${appUrl()}/cita/${r.manage_token}`;
  return { manage_url: base, reschedule_url: `${base}/reprogramar`, cancel_url: `${base}/cancelar` };
}

/**
 * Objeto de cita de la API. Es un superconjunto: los campos de siempre (`start`,
 * `attendee`, `manage`…) y, desde CONTRATO_CONVERSIONES v1.0 §3.2, los que consume
 * Xtrategy360 (`start_at`, `invitee`, `client_slug`, `business_id`, `attribution`,
 * `manage_url`…). Mismo objeto en GET, POST, el listado incremental y el aviso saliente.
 */
export function serializeBooking(ctx: CalendarCtx, r: BookingRow) {
  const tz = ctx.client.timezone;
  const attendeeTz = isValidTimeZone(r.invitee_timezone) ? r.invitee_timezone : tz;
  const conn = ctx.connections.find((c) => c.id === r.calendar_connection_id) ?? null;
  const start = toIsoInZone(new Date(r.start_at), tz);
  const end = toIsoInZone(new Date(r.end_at), tz);
  const links = manageLinks(r);
  const attendee = {
    name: r.invitee_name,
    email: r.invitee_email || null,
    phone: r.invitee_phone,
    timezone: attendeeTz,
  };
  const eventTypeName = r.event_type_id
    ? ctx.services.find((s) => s.id === r.event_type_id)?.name ?? ctx.eventTypeNames?.[r.event_type_id] ?? null
    : null;
  return {
    id: r.id,
    status: publicStatus(r),
    source: r.source === "api" ? "api" : "web",
    // Identidad del calendario y del negocio
    calendar_id: r.client_id,
    client_id: r.client_id,
    client_slug: ctx.client.slug,
    business_id: ctx.client.business_id ?? null,
    service_id: r.event_type_id,
    event_type_id: r.event_type_id,
    event_type_name: eventTypeName,
    professional: professionalOf(ctx, conn),
    timezone: tz,
    start,
    end,
    start_at: start,
    end_at: end,
    attendee: {
      ...attendee,
      // El mismo instante leído en la zona del visitante: lo que el chat le dice.
      local_start: toIsoInZone(new Date(r.start_at), attendeeTz),
      local_end: toIsoInZone(new Date(r.end_at), attendeeTz),
    },
    invitee: attendee,
    answers: r.answers ?? {},
    notes: r.notes,
    external_ref: externalRefOut(r.external_ref),
    attribution: r.attribution ?? null,
    manage: links,
    manage_url: links?.manage_url ?? null,
    cancelled_at: r.cancelled_at ? toIsoInZone(new Date(r.cancelled_at), tz) : null,
    cancel_reason: r.cancel_reason,
    created_at: toIsoInZone(new Date(r.created_at), tz),
    updated_at: toIsoInZone(new Date(r.updated_at), tz),
  };
}

/** Cita por id, comprobando que la clave ve su calendario. 404 en cualquier otro caso. */
export async function loadBooking(key: ApiKey, bookingId: unknown) {
  const notFound = () => new ApiError("booking_not_found", "No existe esa cita.", { details: { booking_id: bookingId ?? null } });
  if (!isUuid(bookingId)) throw notFound();
  const { data, error } = await supabaseAdmin().from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (error) throw new Error(`loadBooking: ${error.message}`);
  if (!data) throw notFound();
  const row = data as BookingRow;
  let ctx: CalendarCtx;
  try {
    ctx = await loadCalendar(key, row.client_id);
  } catch (e) {
    if (e instanceof ApiError && e.code === "calendar_not_found") throw notFound();
    throw e;
  }
  const service = ctx.services.find((s) => s.id === row.event_type_id) ?? null;
  return { row, ctx, service };
}

/* ------------------------------------ asistente ------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type Attendee = { name: string; email: string; phone: string | null; timezone: string | null; language: string | null };

export function parseAttendee(v: unknown): Attendee {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new ApiError("invalid_request", "Falta «attendee» con al menos nombre y email.", { details: { field: "attendee" } });
  }
  const a = v as Record<string, unknown>;
  const name = optString(a, "name", 200, "attendee.name");
  if (!name) throw new ApiError("invalid_request", "Falta el nombre del asistente.", { details: { field: "attendee.name" } });
  const email = optString(a, "email", 254, "attendee.email");
  if (!email) {
    throw new ApiError("missing_required_fields", "El email del asistente es obligatorio.", {
      details: { fields: [{ key: "attendee.email", label: "Email", type: "email" }] },
    });
  }
  if (!EMAIL_RE.test(email)) {
    throw new ApiError("invalid_request", "El email del asistente no es válido.", { details: { field: "attendee.email" } });
  }
  const phone = optString(a, "phone", 40, "attendee.phone");
  const timezone = optString(a, "timezone", 64, "attendee.timezone");
  if (timezone && !isValidTimeZone(timezone)) {
    throw new ApiError("invalid_request", "«attendee.timezone» debe ser una zona IANA, p. ej. Europe/Madrid.", {
      details: { field: "attendee.timezone" },
    });
  }
  const language = optString(a, "language", 10, "attendee.language");
  return { name, email: email.toLowerCase(), phone, timezone, language };
}

/**
 * Respuestas para las preguntas del servicio, como las espera Nylas (clave → texto).
 * Email y teléfono salen del asistente; el resto, de `answers`. Si falta una obligatoria
 * se dice cuál: el agente puede preguntarla y reintentar.
 */
export function buildAnswers(s: EventType, attendee: Attendee, answersIn: unknown) {
  if (answersIn !== undefined && answersIn !== null && (typeof answersIn !== "object" || Array.isArray(answersIn))) {
    throw new ApiError("invalid_request", "«answers» debe ser un objeto { clave: texto }.", { details: { field: "answers" } });
  }
  const given = (answersIn ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  const missing: { key: string; label: string; type: string }[] = [];
  for (const q of s.questions ?? []) {
    const type = q.type || "text";
    const src = questionSource(type);
    const raw = src === "attendee.email" ? attendee.email : src === "attendee.phone" ? attendee.phone : given[q.key];
    const value = typeof raw === "string" ? raw.trim().slice(0, 2000) : typeof raw === "number" ? String(raw) : "";
    if (value) out[q.key] = value;
    else if (q.required) missing.push({ key: src === "answers" ? `answers.${q.key}` : src, label: q.label, type });
  }
  if (missing.length) {
    throw new ApiError("missing_required_fields", "Faltan datos obligatorios para este servicio.", { details: { fields: missing } });
  }
  return out;
}

export function professionalFor(ctx: CalendarCtx, s: EventType, requested: unknown) {
  const conn = connectionOf(ctx, s);
  if (requested !== undefined && requested !== null && requested !== "" && requested !== conn?.id) {
    throw new ApiError("invalid_request", "Ese profesional no atiende este servicio.", {
      details: { field: "professional_id", professionals: conn ? [professionalOf(ctx, conn)] : [] },
    });
  }
  return conn;
}
