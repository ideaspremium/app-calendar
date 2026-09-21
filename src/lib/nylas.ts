import { appUrl } from "@/lib/config";
import type { AvailabilityRule, CalendarConnection, Client, EventType } from "./types";

const API = process.env.NYLAS_API_URL ?? "https://api.eu.nylas.com";
export const NYLAS_SCHEDULER_API_URL = `${API}/v3/scheduling`;

async function nylas<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Nylas ${res.status} ${path}: ${JSON.stringify(json)}`);
  }
  return json as T;
}

/** URL de Hosted Auth para conectar la cuenta de un cliente. */
export function hostedAuthUrl(state: string, loginHint?: string) {
  const p = new URLSearchParams({
    client_id: process.env.NYLAS_CLIENT_ID!,
    redirect_uri: `${appUrl()}/api/nylas/callback`,
    response_type: "code",
    access_type: "offline",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${API}/v3/connect/auth?${p.toString()}`;
}

export async function exchangeCode(code: string) {
  return nylas<{ grant_id: string; email: string; provider: string; scope?: string }>(
    "/v3/connect/token",
    {
      method: "POST",
      body: JSON.stringify({
        client_id: process.env.NYLAS_CLIENT_ID,
        client_secret: process.env.NYLAS_API_KEY,
        grant_type: "authorization_code",
        redirect_uri: `${appUrl()}/api/nylas/callback`,
        code,
      }),
    }
  );
}

export async function listCalendars(grantId: string) {
  const r = await nylas<{ data: { id: string; name: string; is_primary?: boolean; read_only?: boolean }[] }>(
    `/v3/grants/${grantId}/calendars`
  );
  return r.data;
}

const hhmm = (t: string) => t.slice(0, 5);

/** Traduce nuestro modelo a una Scheduler Configuration de Nylas. */
export function buildConfiguration(
  client: Client,
  et: EventType,
  conn: CalendarConnection,
  rules: AvailabilityRule[]
) {
  // Agrupa reglas con mismo horario en una sola entrada de open_hours
  const groups = new Map<string, number[]>();
  for (const r of rules) {
    const key = `${hhmm(r.start_time)}-${hhmm(r.end_time)}`;
    groups.set(key, [...(groups.get(key) ?? []), r.weekday]);
  }
  // Nylas espera los días como enteros 0-6 (0 = domingo), no como nombres.
  const open_hours = [...groups.entries()].map(([key, days]) => {
    const [start, end] = key.split("-");
    return {
      days: [...new Set(days)].sort((a, b) => a - b),
      timezone: client.timezone,
      start,
      end,
      exdates: [] as string[],
    };
  });

  const base = appUrl();
  const bookingCalendar = conn.external_calendar_id ?? "primary";
  const checkCalendars = conn.check_calendar_ids.length ? conn.check_calendar_ids : [bookingCalendar];

  return {
    requires_session_auth: false,
    name: `${client.name} · ${et.name}`,
    participants: [
      {
        name: client.name,
        email: conn.account_email,
        is_organizer: true,
        availability: { calendar_ids: checkCalendars, open_hours },
        booking: { calendar_id: bookingCalendar },
      },
    ],
    availability: {
      duration_minutes: et.duration_minutes,
      interval_minutes: et.slot_interval_minutes,
      availability_rules: {
        availability_method: "collective",
        buffer: { before: et.buffer_before_minutes, after: et.buffer_after_minutes },
        default_open_hours: open_hours,
      },
    },
    event_booking: {
      title: `${et.name} — {{invitee_name}}`,
      booking_type: "booking",
      disable_emails: false,
      // Nylas rechaza algunos campos opcionales si van vacíos: mejor omitirlos.
      ...(et.description ? { description: et.description } : {}),
      ...(et.location_details ? { location: et.location_details } : {}),
    },
    scheduler: {
      available_days_in_future: et.max_days_ahead,
      min_booking_notice: et.min_notice_minutes,
      min_cancellation_notice: 120,
      rescheduling_url: `${base}/${client.slug}/${et.slug}/reschedule/:booking_ref`,
      cancellation_url: `${base}/${client.slug}/${et.slug}/cancel/:booking_ref`,
      additional_fields: Object.fromEntries(
        et.questions.map((q, i) => [
          q.key,
          { label: q.label, type: q.type || "text", required: q.required, order: i + 1 },
        ])
      ),
      email_template: {
        booking_confirmed: {
          title: `Cita confirmada — ${client.name}`,
          body: "Tu cita ha quedado registrada. Recibirás un recordatorio antes de la fecha.",
        },
      },
    },
    appearance: {
      company_name: client.name,
      color: client.branding.primary_color ?? "#2563eb",
      ...(client.branding.logo_url ? { company_logo_url: client.branding.logo_url } : {}),
    },
  };
}

/**
 * Descompone la configuración en capas acumulativas, de la mínima a la completa.
 * Sirve para localizar qué bloque hace que Nylas devuelva 400 «Invalid request»,
 * porque la API no indica el campo culpable.
 */
export function configurationVariants(full: ReturnType<typeof buildConfiguration>) {
  const p = full.participants[0];
  const { additional_fields, email_template, ...schedulerBase } = full.scheduler;

  const a = {
    participants: [{ email: p.email, availability: p.availability, booking: p.booking, is_organizer: true }],
    availability: {
      duration_minutes: full.availability.duration_minutes,
      interval_minutes: full.availability.interval_minutes,
    },
    event_booking: { title: full.event_booking.title },
  };
  const b = { ...a, availability: full.availability };
  const c = { ...b, event_booking: full.event_booking };
  const d = { ...c, scheduler: schedulerBase };
  const e = { ...d, scheduler: { ...schedulerBase, email_template } };
  const f = { ...e, scheduler: { ...schedulerBase, email_template, additional_fields } };
  const g = { ...f, appearance: full.appearance, name: full.name, requires_session_auth: full.requires_session_auth };

  return [
    { label: "A · participante + duración", body: a as object },
    { label: "B · + reglas de disponibilidad", body: b as object },
    { label: "C · + datos del evento", body: c as object },
    { label: "D · + ajustes del scheduler", body: d as object },
    { label: "E · + plantilla de correo", body: e as object },
    { label: "F · + preguntas adicionales", body: f as object },
    { label: "G · + apariencia y nombre", body: g as object },
  ];
}

/**
 * Las configuraciones del Scheduler viven bajo el grant, no en la raíz:
 * /v3/grants/{grant_id}/scheduling/configurations
 */
const configurationsPath = (grantId: string, configId?: string) =>
  `/v3/grants/${grantId}/scheduling/configurations${configId ? `/${configId}` : ""}`;

export async function upsertConfiguration(grantId: string, configId: string | null, body: object) {
  return nylas<{ data: { id: string } }>(configurationsPath(grantId, configId ?? undefined), {
    method: configId ? "PUT" : "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteConfiguration(grantId: string, configId: string) {
  return nylas(configurationsPath(grantId, configId), { method: "DELETE" });
}
