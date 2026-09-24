import { ATTR_PARAM } from "./attribution-params";

/**
 * Atribución en el navegador (página pública de reserva).
 *
 * De dónde sale, por orden:
 *  1. `pc_attr` en la URL: lo pone embed.js con los datos de la web que embebe (su URL,
 *     su referrer y sus UTM, o los de la cookie `ips_utm` de 30 días de esa web).
 *  2. Enlace directo: los `utm_*` de la propia URL, la URL y `document.referrer`.
 * Se guarda en sessionStorage para no perderla al navegar entre pantallas; una visita
 * con UTM sustituye a una sin UTM, nunca al revés.
 */
export type ClientAttribution = {
  page_url: string | null;
  referrer: string | null;
  utm: Record<"source" | "medium" | "campaign" | "content" | "term", string | null>;
  captured_at: string;
};

const KEYS = ["source", "medium", "campaign", "content", "term"] as const;
const STORE = "pc_attribution";

const hasUtm = (a: ClientAttribution | null) => !!a && KEYS.some((k) => a.utm?.[k]);

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
    const v = fromBase64Url(raw) as Partial<ClientAttribution>;
    if (!v || typeof v !== "object") return null;
    const utm = Object.fromEntries(KEYS.map((k) => [k, typeof v.utm?.[k] === "string" ? v.utm[k] : null])) as ClientAttribution["utm"];
    return {
      page_url: typeof v.page_url === "string" ? v.page_url : null,
      referrer: typeof v.referrer === "string" && v.referrer ? v.referrer : null,
      utm,
      captured_at: typeof v.captured_at === "string" ? v.captured_at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function fromDirectVisit(params: URLSearchParams): ClientAttribution {
  const utm = Object.fromEntries(KEYS.map((k) => [k, params.get(`utm_${k}`)?.trim() || null])) as ClientAttribution["utm"];
  return {
    page_url: publicUrl(window.location.href),
    referrer: document.referrer || null,
    utm,
    captured_at: new Date().toISOString(),
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
      body: JSON.stringify({ booking_id: bookingId, attribution: a }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* sin atribución, la reserva sigue siendo válida */
  }
}
