import { ATTR_PARAM } from "./attribution-params";

/**
 * Atribución en el navegador (página pública de reserva), según la «Atribución común de
 * la suite» (CONVERSIONES 1.3 / LEADS 1.2).
 *
 * De dónde sale:
 *  1. Embebida: `pc_attr` en la URL, que pone embed.js con los datos de la web que embebe
 *     (su URL, su referrer, sus UTM o los de su cookie `ips_utm`, y `first_touch_at`).
 *  2. Enlace directo: los `utm_*` de la propia URL; si no hay, los de la cookie `ips_utm` de
 *     calendars360.ai. La cookie se escribe solo si no existe y nunca se sobrescribe.
 * `captured_at` aquí es orientativo: el servidor lo fija al instante de la reserva.
 * Se guarda en sessionStorage para no perderla al navegar entre pantallas; una visita con
 * UTM sustituye a una sin UTM, nunca al revés.
 */
export type ClientAttribution = {
  page_url: string | null;
  referrer: string | null;
  utm: Record<"source" | "medium" | "campaign" | "content" | "term", string | null>;
  captured_at: string;
  first_touch_at: string | null;
};

const KEYS = ["source", "medium", "campaign", "content", "term"] as const;
const STORE = "pc_attribution";
const COOKIE = "ips_utm";

const hasUtm = (a: ClientAttribution | null) => !!a && KEYS.some((k) => a.utm?.[k]);
const clean = (v: unknown) => {
  const t = typeof v === "string" ? v.trim().slice(0, 200) : "";
  return t || null;
};

/** Instante con el desfase del navegador: 2026-09-28T10:05:00-04:00. */
export function isoWithOffset(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  let o = -d.getTimezoneOffset();
  const sign = o >= 0 ? "+" : "-";
  o = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(o / 60))}:${p(o % 60)}`;
}

type CookieValue = { utm: ClientAttribution["utm"]; captured_at: string | null };

/** Lee `ips_utm`: formato `{utm, captured_at}` y el plano antiguo del widget 1.1.0. */
function readCookie(): CookieValue | null {
  try {
    const m = document.cookie.match(/(?:^|; )ips_utm=([^;]*)/);
    if (!m) return null;
    const v = JSON.parse(decodeURIComponent(m[1])) as Record<string, unknown>;
    if (!v || typeof v !== "object") return null;
    const src = (v.utm && typeof v.utm === "object" ? v.utm : v) as Record<string, unknown>;
    const utm = Object.fromEntries(KEYS.map((k) => [k, clean(src[k] ?? src[`utm_${k}`])])) as ClientAttribution["utm"];
    return { utm, captured_at: typeof v.captured_at === "string" ? v.captured_at : null };
  } catch {
    return null;
  }
}

function writeCookie(value: CookieValue) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(value))}; max-age=2592000; path=/; SameSite=Lax${secure}`;
  } catch {
    /* cookies bloqueadas: se sigue sin primer contacto */
  }
}

function fromBase64Url(v: string): unknown {
  const b64 = v.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Quita de una URL los parámetros internos (no son de la página del visitante). */
function publicUrl(href: string) {
  try {
    const u = new URL(href);
    for (const k of [ATTR_PARAM, "embed", "estilo", "lang"]) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return href;
  }
}

function fromEmbed(params: URLSearchParams): ClientAttribution | null {
  const raw = params.get(ATTR_PARAM);
  if (!raw) return null;
  try {
    const v = fromBase64Url(raw) as Partial<ClientAttribution> & { utm?: Record<string, unknown> };
    if (!v || typeof v !== "object") return null;
    const utm = Object.fromEntries(KEYS.map((k) => [k, clean(v.utm?.[k])])) as ClientAttribution["utm"];
    return {
      page_url: typeof v.page_url === "string" ? v.page_url : null,
      referrer: typeof v.referrer === "string" && v.referrer ? v.referrer : null,
      utm,
      captured_at: isoWithOffset(),
      first_touch_at: typeof v.first_touch_at === "string" ? v.first_touch_at : null,
    };
  } catch {
    return null;
  }
}

function fromDirectVisit(params: URLSearchParams): ClientAttribution {
  const now = isoWithOffset();
  let utm = Object.fromEntries(KEYS.map((k) => [k, clean(params.get(`utm_${k}`))])) as ClientAttribution["utm"];
  const fromUrl = KEYS.some((k) => utm[k]);
  let cookie = readCookie();
  if (fromUrl) {
    // Primer contacto: se escribe solo si no existe; unos UTM en la URL mandan en esta visita.
    if (!cookie) {
      cookie = { utm, captured_at: now };
      writeCookie(cookie);
    }
  } else if (cookie) {
    utm = cookie.utm;
  }
  return {
    page_url: publicUrl(window.location.href),
    referrer: document.referrer || null,
    utm,
    captured_at: now,
    first_touch_at: cookie?.captured_at ?? null,
  };
}

function readStored(): ClientAttribution | null {
  try {
    const v = sessionStorage.getItem(STORE);
    return v ? (JSON.parse(v) as ClientAttribution) : null;
  } catch {
    return null;
  }
}

/** Llamar al cargar la página de reserva. Devuelve la atribución vigente. */
export function captureAttribution(): ClientAttribution | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fresh = fromEmbed(params) ?? fromDirectVisit(params);
    const stored = readStored();
    const chosen = stored && !hasUtm(fresh) && hasUtm(stored) ? stored : fresh;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(chosen));
    } catch {
      /* navegación privada o almacenamiento bloqueado: se usa en memoria */
    }
    return chosen;
  } catch {
    return null;
  }
}

/** Tras reservar: la manda al servidor con el id de reserva de Nylas. Nunca falla. */
export function sendAttribution(bookingId: string, attribution: ClientAttribution | null) {
  const a = attribution ?? readStored();
  if (!a || !bookingId) return;
  try {
    void fetch("/api/public/attribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_id: bookingId, attribution: { ...a, captured_at: isoWithOffset() } }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* sin atribución, la reserva sigue siendo válida */
  }
}
