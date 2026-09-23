/**
 * Presentación de zonas horarias: nombres de ciudad, desfases y grupos.
 * La lista es siempre la completa de `Intl.supportedValuesOf("timeZone")` (418 en los
 * navegadores actuales). No se recorta: las zonas no van por país sino por historia de
 * reglas de reloj, y recortar es lo que provocó el fallo de «Miami».
 */

export type Lang = "es" | "en";

const CITY_ES: Record<string, string> = {
  "America/New_York": "Nueva York",
  "America/Los_Angeles": "Los Ángeles",
  "America/Mexico_City": "Ciudad de México",
  "America/Bogota": "Bogotá",
  "America/Sao_Paulo": "São Paulo",
  "America/Havana": "La Habana",
  "America/Panama": "Panamá",
  "America/Asuncion": "Asunción",
  "America/Argentina/Buenos_Aires": "Buenos Aires",
  "America/Puerto_Rico": "Puerto Rico",
  "America/Santo_Domingo": "Santo Domingo",
  "America/Costa_Rica": "Costa Rica",
  "America/El_Salvador": "El Salvador",
  "Europe/London": "Londres",
  "Europe/Paris": "París",
  "Europe/Berlin": "Berlín",
  "Europe/Rome": "Roma",
  "Europe/Lisbon": "Lisboa",
  "Europe/Brussels": "Bruselas",
  "Europe/Amsterdam": "Ámsterdam",
  "Europe/Zurich": "Zúrich",
  "Europe/Moscow": "Moscú",
  "Europe/Athens": "Atenas",
  "Europe/Stockholm": "Estocolmo",
  "Europe/Warsaw": "Varsovia",
  "Europe/Vienna": "Viena",
  "Europe/Prague": "Praga",
  "Asia/Tokyo": "Tokio",
  "Asia/Shanghai": "Shanghái",
  "Asia/Singapore": "Singapur",
  "Asia/Seoul": "Seúl",
  "Asia/Dubai": "Dubái",
  "Asia/Kolkata": "Calcuta",
  "Africa/Cairo": "El Cairo",
  "Atlantic/Canary": "Canarias",
};

/** Grupos que van arriba del selector. El resto de zonas va después, completo. */
export const TOP_GROUPS: { label: Record<Lang, string>; zones: { tz: string; note: Record<Lang, string> }[] }[] = [
  {
    label: { es: "España", en: "Spain" },
    zones: [
      { tz: "Europe/Madrid", note: { es: "Península y Baleares", en: "Mainland and Balearic Islands" } },
      { tz: "Atlantic/Canary", note: { es: "Canarias", en: "Canary Islands" } },
      { tz: "Africa/Ceuta", note: { es: "Ceuta y Melilla", en: "Ceuta and Melilla" } },
    ],
  },
  {
    label: { es: "Estados Unidos", en: "United States" },
    zones: [
      { tz: "America/New_York", note: { es: "Este", en: "Eastern" } },
      { tz: "America/Chicago", note: { es: "Centro", en: "Central" } },
      { tz: "America/Denver", note: { es: "Montaña", en: "Mountain" } },
      { tz: "America/Phoenix", note: { es: "Arizona, sin horario de verano", en: "Arizona, no daylight saving" } },
      { tz: "America/Los_Angeles", note: { es: "Pacífico", en: "Pacific" } },
      { tz: "America/Anchorage", note: { es: "Alaska", en: "Alaska" } },
      { tz: "Pacific/Honolulu", note: { es: "Hawái", en: "Hawaii" } },
    ],
  },
];

export function isValidZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function allZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

export function cityName(tz: string, lang: Lang = "es"): string {
  if (lang === "es" && CITY_ES[tz]) return CITY_ES[tz];
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ");
}

function tzPart(tz: string, style: "shortOffset" | "longOffset" | "longGeneric", lang: Lang, at: Date): string {
  try {
    return (
      new Intl.DateTimeFormat(lang, { timeZone: tz, timeZoneName: style })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/** «GMT-04:00» (nunca «GMT» a secas). */
export function longOffset(tz: string, at: Date = new Date()): string {
  const v = tzPart(tz, "longOffset", "en", at);
  return v === "GMT" || !v ? "GMT+00:00" : v;
}

/** Minutos respecto a UTC, para ordenar. */
export function offsetMinutes(tz: string, at: Date = new Date()): number {
  const m = longOffset(tz, at).match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** «hora oriental», «hora estándar de Japón»… Sirve para buscar. */
export function genericName(tz: string, lang: Lang = "es", at: Date = new Date()): string {
  return tzPart(tz, "longGeneric", lang, at);
}

/** Etiqueta corta para acompañar una hora: «Nueva York (GMT-4)». */
export function zoneLabelL(tz: string, lang: Lang = "es", at: Date = new Date()): string {
  const off = tzPart(tz, "shortOffset", lang, at);
  return off ? `${cityName(tz, lang)} (${off})` : cityName(tz, lang);
}

/** Etiqueta del selector: «(GMT-04:00) Nueva York». */
export function pickerLabel(tz: string, lang: Lang = "es", at: Date = new Date()): string {
  return `(${longOffset(tz, at)}) ${cityName(tz, lang)}`;
}

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
