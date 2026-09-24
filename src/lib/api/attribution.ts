import { ApiError } from "./http";

/**
 * Atribución de una reserva, según CONTRATO_CONVERSIONES v1.0 §3.1.2:
 *   { page_url, referrer, utm: { source, medium, campaign, content, term }, captured_at }
 *
 * - Sin UTM, los cinco valores de `utm` van a null; `page_url` y `referrer` se guardan
 *   siempre que se conozcan (null si no).
 * - Los valores se guardan tal como llegan (recortados). `utm.campaign` es el `code` de la
 *   campaña de Xtrategy360 en minúsculas: lo pone quien genera el enlace, aquí no se toca.
 */
export type Attribution = {
  page_url: string | null;
  referrer: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null };
  captured_at: string;
};

export const UTM_KEYS = ["source", "medium", "campaign", "content", "term"] as const;

const MAX_URL = 2000;
const MAX_UTM = 200;

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function cleanUrl(v: unknown): string | null {
  const t = clean(v, MAX_URL);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? t : null;
  } catch {
    return null;
  }
}

function cleanInstant(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return null;
  // Una fecha del navegador absurda (reloj mal puesto) no se guarda como verdad.
  const now = Date.now();
  if (ms > now + 5 * 60_000 || ms < now - 400 * 86_400_000) return null;
  return new Date(ms).toISOString();
}

/**
 * Normaliza lo que llegue (del navegador o de un integrador) a la forma del contrato.
 * Acepta `utm` como objeto { source, … } o claves sueltas `utm_source`, …
 * Devuelve null si no hay nada utilizable.
 */
export function sanitizeAttribution(input: unknown): Attribution | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const a = input as Record<string, unknown>;
  const utmIn = a.utm && typeof a.utm === "object" && !Array.isArray(a.utm) ? (a.utm as Record<string, unknown>) : {};
  const utm = Object.fromEntries(
    UTM_KEYS.map((k) => [k, clean(utmIn[k] ?? a[`utm_${k}`], MAX_UTM)])
  ) as Attribution["utm"];
  const out: Attribution = {
    page_url: cleanUrl(a.page_url),
    referrer: cleanUrl(a.referrer),
    utm,
    captured_at: cleanInstant(a.captured_at) ?? new Date().toISOString(),
  };
  const empty = !out.page_url && !out.referrer && UTM_KEYS.every((k) => !out.utm[k]);
  return empty ? null : out;
}

/** Para la API: `attribution` opcional en el cuerpo; si viene con otra forma, error. */
export function parseAttributionField(v: unknown): Attribution | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ApiError("invalid_request", "«attribution» debe ser un objeto { page_url, referrer, utm: {…} }.", {
      details: { field: "attribution" },
    });
  }
  return sanitizeAttribution(v);
}

/* ------------------------------------ external_ref ------------------------------------ */

/** JSON con las claves ordenadas: el mismo objeto da siempre la misma cadena. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const MAX_EXTERNAL_REF = 2000;

/**
 * `external_ref` admite texto libre (como hasta ahora, hasta 255) o el objeto de la
 * convención de CONTRATO_CONVERSIONES §2 ({ suite, contract, business_id, lead_id, … }).
 * En la base es una sola columna de texto: el objeto se guarda como JSON canónico.
 */
export function parseExternalRef(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.length > 255) {
      throw new ApiError("invalid_request", "«external_ref» (texto) supera 255 caracteres.", { details: { field: "external_ref" } });
    }
    return t || null;
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    // Claves vacías se omiten, como pide el contrato.
    const obj = Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== undefined && x !== "")
    );
    if (!Object.keys(obj).length) return null;
    const s = canonicalJson(obj);
    if (s.length > MAX_EXTERNAL_REF) {
      throw new ApiError("invalid_request", `«external_ref» supera ${MAX_EXTERNAL_REF} caracteres.`, { details: { field: "external_ref" } });
    }
    return s;
  }
  throw new ApiError("invalid_request", "«external_ref» debe ser texto o un objeto JSON.", { details: { field: "external_ref" } });
}

/** Al devolverlo: objeto si se guardó como objeto JSON; si no, el texto tal cual. */
export function externalRefOut(stored: string | null): unknown {
  if (!stored) return null;
  if (stored.startsWith("{")) {
    try {
      const v = JSON.parse(stored);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      /* texto que empieza por llave: se devuelve como texto */
    }
  }
  return stored;
}
