import type { Branding } from "./types";

/**
 * Paleta de la página pública a partir de la imagen del cliente.
 *
 * Todo sale de tres colores (principal, fondo y texto) y se calcula aquí, en el
 * servidor, para que la página y el componente de Nylas usen exactamente los mismos
 * valores. Dos reglas:
 *  - El texto siempre se lee: si el color principal no da 4,5:1 sobre el fondo (el rosa
 *    pastel de un cliente daba 1,5:1), se usa un «tono de texto» de la misma familia,
 *    más oscuro, para textos, bordes y botones. El color original queda para fondos suaves.
 *  - El fondo del estilo vidrio nunca inventa tonos: o el color principal en varias luces,
 *    o los colores que haya elegido el cliente, suavizados.
 */

export type PageStyle = "clasico" | "vidrio";
export const PAGE_STYLES: PageStyle[] = ["clasico", "vidrio"];

export const DEFAULTS = { primary: "#2563eb", background: "#ffffff", text: "#17181c" };

/* ---------- color: sRGB, OKLab, contraste ---------- */

type RGB = [number, number, number];

export function parseHex(input: string | undefined | null): string | null {
  if (!input) return null;
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null;
}

const hexToRgb = (hex: string): RGB => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const rgbToHex = (c: RGB) =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function toOklab(hex: string): RGB {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c: RGB) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** L, croma y tono (en grados) en OKLCH. */
export function toLch(hex: string): [number, number, number] {
  const [L, a, b] = toOklab(hex);
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180) / Math.PI];
}

/** De OKLCH a hex, bajando el croma lo justo para que quepa en sRGB. */
export function fromLch(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  for (let c = C; c >= 0; c -= 0.002) {
    const rgb = fromOklab([L, c * Math.cos(h), c * Math.sin(h)]);
    if (inGamut(rgb)) return rgbToHex(rgb.map(fromLinear) as RGB);
  }
  return rgbToHex(fromOklab([L, 0, 0]).map(fromLinear) as RGB);
}

/** Mezcla en OKLab: p = peso de `a`. */
export function mix(a: string, b: string, p: number): string {
  const A = toOklab(a);
  const B = toOklab(b);
  return rgbToHex(fromOklab(A.map((v, i) => v * p + B[i] * (1 - p)) as RGB).map(fromLinear) as RGB);
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Color resultante de pintar `hex` con opacidad `alpha` sobre `under`. */
function over(hex: string, alpha: number, under = "#ffffff"): string {
  const t = hexToRgb(hex);
  const u = hexToRgb(under);
  return rgbToHex(t.map((v, i) => v * alpha + u[i] * (1 - alpha)) as RGB);
}

/**
 * «Tono de texto»: el color de marca, oscurecido (o aclarado sobre fondos oscuros)
 * en OKLCH hasta alcanzar `target` de contraste con el fondo. Al oscurecer un pastel
 * se refuerza un poco el croma para que siga pareciendo de la marca y no un gris.
 */
export function inkFor(brand: string, bg: string, target = 4.5): string {
  if (contrast(brand, bg) >= target) return brand;
  const [L, C, H] = toLch(brand);
  const towardDark = luminance(bg) > 0.18;
  const chroma = C < 0.02 ? C : Math.max(C, Math.min(0.16, C * 1.6));
  for (let i = 1; i <= 100; i++) {
    const l = towardDark ? L - i * 0.01 : L + i * 0.01;
    if (l < 0 || l > 1) break;
    const candidate = fromLch(l, chroma, H);
    if (contrast(candidate, bg) >= target) return candidate;
  }
  return towardDark ? "#000000" : "#ffffff";
}

/** Blanco o negro, el que mejor se lea sobre `fill`. */
export function onColor(fill: string): string {
  return contrast("#ffffff", fill) >= contrast("#111111", fill) ? "#ffffff" : "#111111";
}

/* ---------- tema de la página pública ---------- */

export type GlassOptions = {
  mode: "brand" | "custom";
  colors: string[];
  intensity: "soft" | "vivid";
};

export type PublicTheme = {
  style: PageStyle;
  /** Variables CSS que usa nuestro marco (columna, selector de zona, notas…). */
  vars: Record<string, string>;
  /** Lo que se pasa a Nylas por `themeConfig`: la vía oficial para colorear su componente. */
  nylas: Record<string, string>;
};

export function resolveStyle(branding: Branding, override?: string | null): PageStyle {
  const o = override === "vidrio" || override === "clasico" ? override : null;
  if (o) return o;
  return branding.style === "vidrio" ? "vidrio" : "clasico";
}

function glassOptions(branding: Branding): GlassOptions {
  const g = branding.glass ?? {};
  const colors = (g.colors ?? []).map(parseHex).filter((c): c is string => !!c).slice(0, 3);
  return {
    mode: g.mode === "custom" && colors.length ? "custom" : "brand",
    colors,
    intensity: g.intensity === "vivid" ? "vivid" : "soft",
  };
}

/** Suaviza un color para usarlo de fondo sin que compita con el texto. */
function soften(hex: string, vivid: boolean, lift = 0): string {
  const [l, c, h] = toLch(hex);
  return fromLch(Math.min(0.97, Math.max(l, (vivid ? 0.78 : 0.85) + lift)), Math.min(c, vivid ? 0.13 : 0.09), h);
}

export function buildTheme(branding: Branding, style: PageStyle, font: string): PublicTheme {
  const brand = parseHex(branding.primary_color) ?? DEFAULTS.primary;
  const text = parseHex(branding.text_color) ?? DEFAULTS.text;
  const radius = /^\d+(\.\d+)?px$/.test(branding.radius ?? "") ? branding.radius! : "8px";
  const glass = style === "vidrio";
  // En vidrio las superficies son blanco translúcido: el contraste se mide contra blanco.
  const bg = glass ? "#ffffff" : parseHex(branding.background) ?? DEFAULTS.background;

  const ink = inkFor(brand, bg);
  const onInk = contrast(bg, ink) >= 4.5 ? bg : onColor(ink);
  const n = (p: number) => mix(text, bg, p);
  const tint = mix(brand, bg, 0.16);
  const [, brandC, brandH] = toLch(brand);

  // Botón principal: degradado alrededor del tono de texto, sin bajar de 4,5:1.
  const [kl, kc, kh] = toLch(ink);
  let inkLight = ink;
  for (let i = 1; i <= 12; i++) {
    const t = fromLch(Math.min(1, kl + i * 0.012), kc, kh + 8);
    if (contrast(onInk, t) >= 4.5) inkLight = t;
    else break;
  }
  const inkDark = fromLch(Math.max(0, kl - 0.07), kc, kh);

  // Texto sobre el tono de texto al `alpha` % sobre blanco, oscurecido hasta 4,5:1.
  const inkOver = (alpha: number) => {
    const under = over(ink, alpha);
    let out = ink;
    let [l] = toLch(ink);
    for (let i = 0; i < 40 && contrast(out, under) < 4.5; i++) {
      l -= 0.01;
      out = fromLch(l, kc, kh);
    }
    return out;
  };
  // Seleccionado en vidrio: el tono de texto al 14 %.
  const selInk = inkOver(0.14);

  const vars: Record<string, string> = {
    "--pc-brand": brand,
    "--pc-bg": bg,
    "--pc-text": text,
    "--pc-ink": ink,
    "--pc-on-ink": onInk,
    "--pc-ink-light": inkLight,
    "--pc-ink-dark": inkDark,
    "--pc-tint": tint,
    "--pc-n50": n(0.035),
    "--pc-n100": n(0.07),
    "--pc-n200": n(0.13),
    "--pc-n300": n(0.25),
    "--pc-n400": n(0.4),
    "--pc-n500": n(0.55),
    "--pc-n600": n(0.68),
    "--pc-n700": n(0.8),
    "--pc-n800": n(0.9),
    "--pc-radius": radius,
    "--pc-font": font,
    "--pc-canvas": mix(brand, mix(text, bg, 0.03), 0.1),
    "--pc-glow": rgba(fromLch(0.35, Math.min(brandC, 0.12), brandH), 0.26),
    "--pc-glow-ink": rgba(ink, 0.5),
    "--pc-sel-bg": rgba(ink, 0.14),
    "--pc-sel-ink": selInk,
    "--pc-sel-rim": rgba(ink, 0.55),
    "--pc-sel-halo": rgba(ink, 0.12),
    "--pc-tint-a": rgba(fromLch(0.86, Math.min(brandC, 0.12), brandH), 0.55),
    "--pc-ring": rgba(ink, 0.55),
    // Días del calendario en vidrio: los libres casi blancos con un borde de color, para que
    // se distingan del vidrio claro; el elegido, más teñido (su texto va ajustado a ese fondo).
    "--pc-day-bg": rgba(ink, 0.1),
    "--pc-day-rim": rgba(ink, 0.3),
    "--pc-day-lift": rgba(fromLch(0.35, Math.min(brandC, 0.12), brandH), 0.38),
    "--pc-day-sel-bg": rgba(ink, 0.3),
    "--pc-day-sel-rim": rgba(ink, 0.75),
    "--pc-day-sel-halo": rgba(ink, 0.16),
    "--pc-day-sel-ink": inkOver(0.3),
    "--pc-slot-rim": rgba(ink, 0.24),
    "--pc-muted": glass ? mix(text, "#ffffff", 0.72) : n(0.68),
    "--pc-faint": glass ? mix(text, "#ffffff", 0.38) : n(0.3),
  };

  if (glass) {
    const g = glassOptions(branding);
    const vivid = g.intensity === "vivid";
    let mesh: Record<string, string>;
    if (g.mode === "custom") {
      const [x, y = x, z = y] = g.colors;
      mesh = {
        b1: soften(x, vivid),
        b2: soften(y, vivid, 0.04),
        b3: soften(z, vivid, 0.02),
        b4: soften(x, vivid, 0.06),
        c0: mix(soften(y, false, 0.1), "#ffffff", 0.5),
        c1: mix(soften(z, false, 0.08), "#ffffff", 0.6),
      };
    } else {
      const cm = Math.min(brandC, vivid ? 0.13 : 0.085);
      const lb = vivid ? 0.8 : 0.87;
      mesh = {
        b1: fromLch(lb, cm, brandH),
        b2: fromLch(lb + 0.06, cm * 0.55, brandH),
        b3: fromLch(0.93, 0.006, brandH),
        b4: fromLch(lb - 0.03, cm, brandH),
        c0: fromLch(0.975, 0.008, brandH),
        c1: fromLch(0.95, 0.018, brandH),
      };
    }
    for (const [k, v] of Object.entries(mesh)) vars[`--pc-mesh-${k}`] = v;
  }

  const nylas: Record<string, string> = {
    "--nylas-primary": ink,
    "--nylas-base-0": bg,
    "--nylas-base-25": n(0.02),
    "--nylas-base-50": n(0.035),
    "--nylas-base-100": n(0.07),
    "--nylas-base-200": n(0.13),
    "--nylas-base-300": n(0.25),
    "--nylas-base-400": n(0.4),
    "--nylas-base-500": n(0.55),
    "--nylas-base-600": inkDark,
    "--nylas-base-700": n(0.8),
    "--nylas-base-800": n(0.9),
    "--nylas-base-900": text,
    "--nylas-base-950": mix(text, "#000000", 0.8),
    "--nylas-font-family": font,
    "--nylas-border-radius": glass ? "12px" : radius,
    "--nylas-border-radius-2x": glass ? "24px" : `calc(${radius} * 2)`,
    "--nylas-border-radius-3x": glass ? "28px" : `calc(${radius} * 3)`,
  };

  return { style, vars, nylas };
}
