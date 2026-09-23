/**
 * Fechas del panel. El servidor corre en UTC (Vercel), así que todo cálculo de «hoy»,
 * «este mes» o «este día» se hace en una zona explícita, y toda hora que se enseña va
 * con su zona (zoneLabelL). Nada de toLocaleString() sin zona.
 */
import { formatInTimeZone } from "@/lib/datetime";
import { offsetMinutes, zoneLabelL } from "@/lib/zones";

export const LOCALE = "es-ES";

/** Instante UTC de una hora de reloj en una zona (maneja el cambio de hora). */
export function zonedToUtc(tz: string, y: number, m: number, d: number, h = 0, mi = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMinutes(tz, new Date(guess)) * 60_000;
  const again = guess - offsetMinutes(tz, new Date(t)) * 60_000;
  if (again !== t) t = again;
  return new Date(t);
}

/** Año, mes y día de un instante en una zona. */
export function partsIn(tz: string, at: Date = new Date()): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: g("year"), m: g("month"), d: g("day") };
}

/** «2026-09-23» en esa zona. */
export function isoDayIn(tz: string, at: Date = new Date()): string {
  const { y, m, d } = partsIn(tz, at);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function monthStartUtc(tz: string, at: Date = new Date()): Date {
  const { y, m } = partsIn(tz, at);
  return zonedToUtc(tz, y, m, 1);
}

export const cap = (s: string) => (s ? s[0].toLocaleUpperCase("es") + s.slice(1) : s);

export const hm = (at: string | Date, tz: string) => formatInTimeZone(at, tz, { hour: "2-digit", minute: "2-digit" }, LOCALE);
export const dayLong = (at: string | Date, tz: string) =>
  cap(formatInTimeZone(at, tz, { weekday: "long", day: "numeric", month: "long" }, LOCALE));
export const dayShort = (at: string | Date, tz: string) =>
  cap(formatInTimeZone(at, tz, { weekday: "short", day: "numeric", month: "short" }, LOCALE)).replace(/\./g, "");
export const dateShort = (at: string | Date, tz: string) =>
  formatInTimeZone(at, tz, { day: "numeric", month: "short" }, LOCALE).replace(/\./g, "");
export const zl = (tz: string, at?: string | Date) => zoneLabelL(tz, "es", at ? new Date(at) : new Date());

/** Una fecha de calendario (AAAA-MM-DD, sin zona) para enseñarla: se formatea en UTC a propósito. */
export function calendarDay(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)).replace(/\./g, "");
}

/** Días entre dos fechas de calendario, ambos incluidos. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return out;
  for (let t = a; t <= b && out.length < 400; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
