import { ApiError } from "./http";

/**
 * Fechas de la API: siempre ISO 8601 con zona explícita, de entrada y de salida.
 * Una hora sin desfase («2026-10-01T10:00») no se acepta: el servidor corre en UTC,
 * el cliente en su zona y el visitante en la suya, y adivinar cuál quería es justo
 * el fallo que ya nos desplazó huecos cuatro horas.
 */
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== "string" || !ISO_WITH_OFFSET.test(value.trim())) {
    throw new ApiError(
      "invalid_datetime",
      `«${field}» debe ser una fecha ISO 8601 con zona explícita, p. ej. 2026-10-01T10:00:00+02:00.`,
      { details: { field, received: typeof value === "string" ? value : typeof value } }
    );
  }
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) {
    throw new ApiError("invalid_datetime", `«${field}» no es una fecha real.`, { details: { field, received: value } });
  }
  return d;
}

export function parseLocalDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) {
    throw new ApiError("invalid_datetime", `«${field}» debe tener el formato AAAA-MM-DD.`, { details: { field } });
  }
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new ApiError("invalid_datetime", `«${field}» no es una fecha real.`, { details: { field, received: value } });
  }
  return value;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "longOffset",
    });
    formatters.set(tz, f);
  }
  return f;
}

type Local = { year: number; month: number; day: number; hour: number; minute: number; second: number; offset: string };

function local(date: Date, tz: string): Local {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  // «GMT-04:00», o «GMT» a secas cuando el desfase es cero.
  const name = parts.timeZoneName ?? "GMT";
  const offset = name === "GMT" ? "+00:00" : name.replace("GMT", "");
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    offset,
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** «2026-10-01T10:00:00+02:00»: el instante tal como se lee en la zona indicada. */
export function toIsoInZone(date: Date, tz: string): string {
  const l = local(date, tz);
  return `${pad(l.year, 4)}-${pad(l.month)}-${pad(l.day)}T${pad(l.hour)}:${pad(l.minute)}:${pad(l.second)}${l.offset}`;
}

/** Fecha local (AAAA-MM-DD), día de la semana (0 = domingo) y minuto del día en la zona. */
export function localParts(date: Date, tz: string) {
  const l = local(date, tz);
  const ymd = `${pad(l.year, 4)}-${pad(l.month)}-${pad(l.day)}`;
  const weekday = new Date(Date.UTC(l.year, l.month - 1, l.day)).getUTCDay();
  return { date: ymd, weekday, minutes: l.hour * 60 + l.minute + l.second / 60 };
}

/** Minutos que la zona va por delante de UTC en ese instante. */
function offsetMinutes(date: Date, tz: string) {
  const l = local(date, tz);
  const asUtc = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Instante en que empieza el día local `ymd` en la zona (tiene en cuenta el horario de verano). */
export function startOfLocalDay(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMinutes(new Date(guess), tz) * 60000;
  const second = offsetMinutes(new Date(t), tz);
  t = guess - second * 60000;
  return new Date(t);
}

export function addDaysToLocalDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** «09:30:00» → 570. «00:00» como final de tramo se entiende medianoche (1440). */
export function timeToMinutes(t: string, isEnd = false): number {
  const [h, m] = t.split(":").map(Number);
  const v = h * 60 + (m || 0);
  return isEnd && v === 0 ? 1440 : v;
}

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;
