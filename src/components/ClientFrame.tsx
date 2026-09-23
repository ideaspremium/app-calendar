import "@fontsource-variable/inter";
import "@fontsource-variable/outfit";
import "@fontsource-variable/montserrat";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/lora";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@/styles/public.css";
import EmbedResizer from "@/components/public/EmbedResizer";
import { fontStack } from "@/lib/fonts";
import { buildTheme, resolveStyle, type PublicTheme } from "@/lib/theme";
import type { Branding } from "@/lib/types";

export function publicTheme(branding: Branding, styleOverride?: string | null): PublicTheme {
  return buildTheme(branding, resolveStyle(branding, styleOverride), fontStack(branding.font_family));
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/**
 * Marco de todas las páginas que ve quien reserva: fondo, tarjeta, colores, tipografía y
 * estilo (clásico o vidrio). Las páginas de reserva pintan su propia cabecera dentro de la
 * tarjeta (`bare`); el resto recibe el logo y el nombre del cliente arriba.
 */
export default function ClientFrame({
  branding, name, children, embedded, theme, bare = false, width = "wide",
}: {
  branding: Branding;
  name: string;
  children: React.ReactNode;
  embedded: boolean;
  theme?: PublicTheme;
  bare?: boolean;
  width?: "wide" | "narrow";
}) {
  const th = theme ?? publicTheme(branding);
  const vars = th.vars as React.CSSProperties;

  return (
    <main className="pc" data-style={th.style} data-embedded={embedded ? "true" : "false"} style={vars}>
      {th.style === "vidrio" && (
        <div className="pc-mesh" aria-hidden="true">
          <i className="pc-blob pc-blob-1" />
          <i className="pc-blob pc-blob-2" />
          <i className="pc-blob pc-blob-3" />
          <i className="pc-beams" />
        </div>
      )}
      <div className={`pc-page pc-${width}`}>
        <section className="pc-card">
          {!bare && (
            <header className="pc-cardhead">
              <div className="pc-brandrow">
                <span className="pc-tile pc-g2">
                  {branding.logo_url ? <img src={branding.logo_url} alt={name} /> : <span className="pc-mono">{initials(name)}</span>}
                </span>
                <span className="pc-cname">{name}</span>
              </div>
            </header>
          )}
          {children}
        </section>
      </div>
      {embedded && <EmbedResizer />}
    </main>
  );
}
