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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
  const open_hours = [...groups.entries()].map(([key, days]) => {
    const [start, end] = key.split("-");
    return { days: days.map((d) => DAY_NAMES[d]), timezone: client.timezone, start, end };
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
      description: et.description ?? "",
      location: et.location_details ?? "",
      booking_type: "booking",
      disable_emails: false,
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
      company_logo_url: client.branding.logo_url ?? "",
      color: client.branding.primary_color ?? "#2563eb",
    },
  };
}

export async function upsertConfiguration(configId: string | null, body: object) {
  if (configId) {
    return nylas<{ data: { id: string } }>(`/v3/scheduling/configurations/${configId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  return nylas<{ data: { id: string } }>(`/v3/scheduling/configurations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteConfiguration(configId: string) {
  return nylas(`/v3/scheduling/configurations/${configId}`, { method: "DELETE" });
}
