import { appUrl } from "@/lib/config";
import type { AvailabilityRule, CalendarConnection, Client, EventType } from "./types";

const API = process.env.NYLAS_API_URL ?? "https://api.eu.nylas.com";
export const NYLAS_SCHEDULER_API_URL = `${API}/v3/scheduling`;

/**
 * Error de una llamada a Nylas con lo necesario para clasificarlo: la API pública
 * responde distinto a «hueco ocupado» que a «Nylas no contesta».
 * `status` 0 = no hubo respuesta (red o tiempo agotado): no se sabe si la operación se hizo.
 */
export class NylasApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type: string | null,
    readonly detail: string | null
  ) {
    super(message);
    this.name = "NylasApiError";
  }
  /** Nylas rechazó la hora porque ya no está libre. */
  get isTimeslotUnavailable() {
    return (
      this.type === "timeslot_not_available" ||
      /time ?slot.*(unavailable|not available)|no longer available|not available for booking/i.test(this.detail ?? "")
    );
  }
  /** Sin respuesta o error del lado de Nylas: la operación puede haberse hecho o no. */
  get isAmbiguous() {
    return this.status === 0 || this.status >= 500;
  }
}

async function nylas<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(rest.headers ?? {}),
      },
      cache: "no-store",
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
  } catch (e) {
    throw new NylasApiError(`Nylas sin respuesta ${path}: ${(e as Error).message}`, 0, null, (e as Error).message);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: { type?: string; message?: string } }).error;
    throw new NylasApiError(
      `Nylas ${res.status} ${path}: ${JSON.stringify(json)}`,
      res.status,
      err?.type ?? null,
      err?.message ?? null
    );
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

/**
 * Antelación mínima para cancelar o cambiar una cita, en minutos. Es la misma regla
 * para la página pública (Nylas) y para la API: si difieren, el chat prometería algo
 * que la web no deja hacer, o al revés.
 */
export const MIN_CANCELLATION_NOTICE_MINUTES = 120;

/**
 * Traduce nuestro modelo a una Scheduler Configuration de Nylas.
 * `blockedDates` son días completos cerrados (festivos, vacaciones) en formato
 * AAAA-MM-DD, hora local del cliente: van a `exdates`.
 */
export function buildConfiguration(
  client: Client,
  et: EventType,
  conn: CalendarConnection,
  rules: AvailabilityRule[],
  blockedDates: string[] = []
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
      exdates: blockedDates,
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
        timezone: client.timezone,
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
      // Nylas no sustituye variables en el título: lo que se escriba aquí sale literal.
      title: et.name,
      // Zona horaria con la que Nylas muestra las horas en los correos y recordatorios.
      // Sin esto los correos salen en UTC.
      timezone: client.timezone,
      booking_type: "booking",
      disable_emails: false,
      // Nylas rechaza algunos campos opcionales si van vacíos: mejor omitirlos.
      ...(et.description ? { description: et.description } : {}),
      ...(et.location_details ? { location: et.location_details } : {}),
    },
    scheduler: {
      available_days_in_future: et.max_days_ahead,
      min_booking_notice: et.min_notice_minutes,
      min_cancellation_notice: MIN_CANCELLATION_NOTICE_MINUTES,
      // Enlaces de los correos: no llevan la dirección del negocio ni del servicio, así
      // siguen valiendo aunque se renombren (/r/… resuelve la dirección actual). La
      // referencia va en la consulta: en base64 estándar puede traer «//», que la ruta
      // normalizaría y rompería.
      rescheduling_url: `${base}/r/reprogramar?ref=:booking_ref`,
      cancellation_url: `${base}/r/cancelar?ref=:booking_ref`,
      additional_fields: Object.fromEntries(
        et.questions.map((q, i) => [
          q.key,
          { label: q.label, type: q.type || "text", required: q.required, order: i + 1 },
        ])
      ),
      email_template: {
        // Identidad del negocio en el correo de confirmación: su logo en lugar del de
        // Nylas, sin el pie «Powered by Nylas» y en el idioma del negocio. El remitente
        // (no-reply@notify.nyl.as) y la maquetación son de Nylas y no se pueden cambiar.
        ...(client.branding.logo_url ? { logo: client.branding.logo_url } : {}),
        show_nylas_branding: false,
        organizer_locale: client.locale === "en" ? "en" : "es",
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
    participants: [
      { email: p.email, availability: p.availability, booking: p.booking, is_organizer: true, timezone: p.timezone },
    ],
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

/**
 * Renombra un evento ya creado en el calendario del cliente.
 * Nylas no sustituye variables en el título, así que el nombre de quien reserva
 * se añade aquí, al recibir el aviso de la reserva.
 */
export async function updateEventTitle(grantId: string, calendarId: string, eventId: string, title: string) {
  // Sin avisar a los invitados: si no, Google manda un «Invitación actualizada» por un
  // cambio que solo es nuestro (el nombre en la agenda del profesional).
  const qs = new URLSearchParams({ calendar_id: calendarId, notify_participants: "false" });
  return nylas<{ data: { id: string } }>(`/v3/grants/${grantId}/events/${eventId}?${qs}`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  });
}

export async function deleteConfiguration(grantId: string, configId: string) {
  return nylas(configurationsPath(grantId, configId), { method: "DELETE" });
}

/* ------------------------------------------------------------------------------------
 * Scheduler: disponibilidad y reservas por configuración.
 * Son los mismos endpoints que usa la página pública (nylas-scheduling), así que la API
 * ofrece exactamente los mismos huecos que ve un visitante en la web: horario, duración,
 * márgenes y citas del calendario los resuelve Nylas con la configuración publicada.
 * Las horas viajan en segundos epoch.
 * ---------------------------------------------------------------------------------- */

export type SchedulerTimeSlot = { emails: string[]; start_time: number; end_time: number };

export async function schedulerAvailability(
  configurationId: string,
  startSec: number,
  endSec: number,
  opts: { bookingId?: string; timeoutMs?: number } = {}
): Promise<SchedulerTimeSlot[]> {
  const qs = new URLSearchParams({
    configuration_id: configurationId,
    start_time: String(Math.floor(startSec)),
    end_time: String(Math.floor(endSec)),
  });
  // Al reprogramar, Nylas trata el hueco de la propia cita como libre.
  if (opts.bookingId) qs.set("booking_id", opts.bookingId);
  const r = await nylas<{ data?: { time_slots?: SchedulerTimeSlot[] } }>(`/v3/scheduling/availability?${qs}`, {
    timeoutMs: opts.timeoutMs ?? 8000,
  });
  return r.data?.time_slots ?? [];
}

export type SchedulerBooking = { booking_id: string; event_id?: string; status?: string; title?: string };

export async function createSchedulerBooking(
  configurationId: string,
  body: {
    start_time: number;
    end_time: number;
    guest: { name: string; email: string };
    timezone: string;
    email_language?: string;
    additional_fields?: Record<string, string>;
  }
) {
  const qs = new URLSearchParams({ configuration_id: configurationId });
  const r = await nylas<{ data: SchedulerBooking }>(`/v3/scheduling/bookings?${qs}`, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 20000,
  });
  return r.data;
}

export async function rescheduleSchedulerBooking(
  configurationId: string,
  bookingId: string,
  startSec: number,
  endSec: number
) {
  const qs = new URLSearchParams({ configuration_id: configurationId });
  const r = await nylas<{ data?: SchedulerBooking }>(`/v3/scheduling/bookings/${bookingId}?${qs}`, {
    method: "PATCH",
    body: JSON.stringify({ start_time: startSec, end_time: endSec }),
    timeoutMs: 20000,
  });
  return r.data ?? null;
}

export async function cancelSchedulerBooking(configurationId: string, bookingId: string, reason?: string | null) {
  const qs = new URLSearchParams({ configuration_id: configurationId });
  await nylas(`/v3/scheduling/bookings/${bookingId}?${qs}`, {
    method: "DELETE",
    body: JSON.stringify({ action: "cancel", ...(reason ? { cancellation_reason: reason } : {}) }),
    timeoutMs: 20000,
  });
}

/**
 * Referencia de reserva que entienden las páginas de cancelar y reprogramar:
 * los 16 bytes del id de configuración seguidos de los 16 del id de reserva, en base64.
 * Es el formato que decodifica `compactStringToUUIDs` en @nylas/web-elements
 * (la sal final solo se usa para confirmaciones del organizador). Va en base64url para
 * poder ir en una ruta sin escapar; el decodificador acepta los dos alfabetos.
 */
export function bookingRef(configurationId: string, bookingId: string): string {
  const bytes = (uuid: string) => Buffer.from(uuid.replace(/-/g, ""), "hex");
  return Buffer.concat([bytes(configurationId), bytes(bookingId)]).toString("base64url");
}

const UUID_HEX = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

/**
 * Lo contrario de `bookingRef`: saca el id de configuración y el de reserva de una
 * referencia de Nylas (base64 o base64url, con o sin la sal final). Null si no cuadra.
 */
export function decodeBookingRef(ref: string): { configurationId: string; bookingId: string } | null {
  try {
    const clean = decodeURIComponent(ref).trim().replace(/ /g, "+");
    const bytes = Buffer.from(clean.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (bytes.length < 32) return null;
    const hex = bytes.subarray(0, 32).toString("hex");
    return { configurationId: UUID_HEX(hex.slice(0, 32)), bookingId: UUID_HEX(hex.slice(32, 64)) };
  } catch {
    return null;
  }
}

export type NylasEventParticipant = { email?: string; name?: string; status?: "yes" | "no" | "maybe" | "noreply" | string };
export type NylasEvent = {
  id: string;
  title?: string;
  description?: string | null;
  status?: "confirmed" | "tentative" | "cancelled" | string;
  participants?: NylasEventParticipant[];
  when?: { start_time?: number; end_time?: number; object?: string };
};

export async function getEvent(grantId: string, calendarId: string, eventId: string) {
  const qs = new URLSearchParams({ calendar_id: calendarId });
  const r = await nylas<{ data: NylasEvent }>(`/v3/grants/${grantId}/events/${eventId}?${qs}`);
  return r.data;
}

/** Borra un evento del calendario del profesional (respaldo si el Scheduler no deja cancelar). */
export async function deleteEvent(grantId: string, calendarId: string, eventId: string, notifyParticipants = false) {
  const qs = new URLSearchParams({ calendar_id: calendarId, notify_participants: String(notifyParticipants) });
  await nylas(`/v3/grants/${grantId}/events/${eventId}?${qs}`, { method: "DELETE" });
}

export async function updateEvent(
  grantId: string,
  calendarId: string,
  eventId: string,
  patch: { title?: string; description?: string }
) {
  // Sin avisar a los invitados: es una anotación interna, no un cambio de la cita.
  const qs = new URLSearchParams({ calendar_id: calendarId, notify_participants: "false" });
  return nylas<{ data: { id: string } }>(`/v3/grants/${grantId}/events/${eventId}?${qs}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
