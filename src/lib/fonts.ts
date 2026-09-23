/**
 * Tipografías de la página pública. Van alojadas en la propia app (paquetes
 * @fontsource, importados en ClientFrame): no se llama a Google en ningún momento, ni
 * al compilar ni al visitar la página. El navegador solo descarga la que se usa.
 *
 * `branding.font_family` es texto libre (hoy hay valores como «"Outfit Medium"» o
 * «sans»). Se reconoce la familia por su nombre, ignorando comillas y pesos; si no es
 * ninguna de estas, se respeta lo escrito con Inter de respaldo.
 */

export type FontKey = "inter" | "outfit" | "poppins" | "montserrat" | "dm-sans" | "lato" | "playfair-display" | "lora";

export const FONTS: Record<FontKey, { label: string; stack: string }> = {
  inter: { label: "Inter", stack: '"Inter Variable", "Inter", system-ui, sans-serif' },
  outfit: { label: "Outfit", stack: '"Outfit Variable", "Outfit", system-ui, sans-serif' },
  poppins: { label: "Poppins", stack: '"Poppins", system-ui, sans-serif' },
  montserrat: { label: "Montserrat", stack: '"Montserrat Variable", "Montserrat", system-ui, sans-serif' },
  "dm-sans": { label: "DM Sans", stack: '"DM Sans Variable", "DM Sans", system-ui, sans-serif' },
  lato: { label: "Lato", stack: '"Lato", system-ui, sans-serif' },
  "playfair-display": { label: "Playfair Display", stack: '"Playfair Display Variable", "Playfair Display", Georgia, serif' },
  lora: { label: "Lora", stack: '"Lora Variable", "Lora", Georgia, serif' },
};

const WEIGHT_WORDS = /\b(thin|hairline|extra ?light|ultra ?light|light|regular|normal|book|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|black|heavy|variable)\b/g;

export function fontKey(fontFamily: string | undefined | null): FontKey | null {
  if (!fontFamily) return null;
  const first = fontFamily.split(",")[0].replace(/["']/g, "").toLowerCase();
  const name = first.replace(WEIGHT_WORDS, "").replace(/\s+/g, " ").trim().replace(/ /g, "-");
  return (Object.keys(FONTS) as FontKey[]).find((k) => k === name) ?? null;
}

/** La pila CSS que se usa en la página y en el componente de Nylas. */
export function fontStack(fontFamily: string | undefined | null): string {
  const key = fontKey(fontFamily);
  if (key) return FONTS[key].stack;
  const raw = (fontFamily ?? "").trim();
  // Valores genéricos o vacíos («sans») y cualquier cosa con caracteres raros: Inter.
  if (!raw || /^(sans|sans-serif|serif|system|default)$/i.test(raw) || /[;{}<>]/.test(raw)) return FONTS.inter.stack;
  return `${raw}, ${FONTS.inter.stack}`;
}
