/**
 * Todas las horas absolutas (reservas) se guardan en UTC y NUNCA se muestran en UTC:
 * cada pantalla las traduce a una zona declarada explícitamente. Usa siempre estas
 * funciones en lugar de toLocaleString() sin zona, que toma la del servidor o la del
 * navegador y produce horas distintas según dónde se ejecute.
 *
 * Ojo con la distinción: una reserva es un instante (timestamptz, UTC en base de datos);
 * un horario de atención semanal es una hora de reloj local (time sin zona) y se
 * interpreta en la zona del cliente. Convertir el horario semanal a UTC sería un error:
 * se rompería con los cambios de horario de verano.
 */

const DEFAULT_LOCALE = "es-ES";

export function formatInTimeZone(
  instant: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  locale: string = DEFAULT_LOCALE
): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
}

/** Solo la hora, para listados compactos. */
export function formatTimeInTimeZone(instant: string | Date, timeZone: string, locale = DEFAULT_LOCALE) {
  return formatInTimeZone(instant, timeZone, { timeStyle: "short" }, locale);
}

/**
 * Etiqueta corta para acompañar una hora: «Madrid (GMT+2)».
 * Sin esto, una hora suelta es ambigua en cuanto hay agencias en husos distintos.
 */
export function zoneLabel(timeZone: string, at: Date = new Date(), locale = DEFAULT_LOCALE): string {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  try {
    const offset = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return offset ? `${city} (${offset})` : city;
  } catch {
    return city;
  }
}
