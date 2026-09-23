import { buildTheme, type PageStyle } from "@/lib/theme";
import { fontStack } from "@/lib/fonts";
import type { Branding } from "@/lib/types";
import { initials } from "../icons";

/**
 * Vista en miniatura de la página de reservas con los colores que salen del mismo motor
 * que la página real (buildTheme): tono de texto con contraste, grises y malla del vidrio.
 */
export default function MiniPreview({ branding, style, name, service }: { branding: Branding; style: PageStyle; name: string; service: string }) {
  const th = buildTheme(branding, style, fontStack(branding.font_family));
  const v = th.vars;
  const glass = style === "vidrio";
  const bg = glass
    ? `radial-gradient(42% 55% at 12% 18%, ${v["--pc-mesh-b1"]} 0%, transparent 70%), radial-gradient(38% 50% at 88% 12%, ${v["--pc-mesh-b2"]} 0%, transparent 72%), radial-gradient(45% 60% at 78% 92%, ${v["--pc-mesh-b3"]} 0%, transparent 70%), radial-gradient(40% 50% at 20% 95%, ${v["--pc-mesh-b4"]} 0%, transparent 70%), linear-gradient(135deg, ${v["--pc-mesh-c0"]}, ${v["--pc-mesh-c1"]})`
    : v["--pc-canvas"];
  const pane: React.CSSProperties = glass
    ? { background: "linear-gradient(160deg, rgba(255,255,255,.62), rgba(255,255,255,.34))", backdropFilter: "blur(10px)", boxShadow: "inset 0 1px 0 #fff, inset 0 0 0 1px rgba(255,255,255,.6), 0 14px 30px -16px rgba(40,30,60,.3)", borderRadius: 14 }
    : { background: v["--pc-bg"], borderRadius: 10, boxShadow: `0 0 0 1px ${v["--pc-n100"]}, 0 6px 14px -8px rgba(0,0,0,.15)` };
  const control = glass ? { background: "rgba(255,255,255,.88)", boxShadow: "0 2px 4px -2px rgba(0,0,0,.18)" } : { background: v["--pc-tint"] };
  const selected = glass ? { background: v["--pc-sel-bg"], boxShadow: `inset 0 0 0 1px ${v["--pc-sel-rim"]}` } : { background: v["--pc-ink"] };
  const r = glass ? "50%" : "4px";

  return (
    <div className="mini" style={{ background: bg, fontFamily: v["--pc-font"], color: v["--pc-text"] }} aria-hidden="true">
      <div className="pane" style={pane}>
        <div className="colA">
          <span className="mt" style={{ background: glass ? "rgba(255,255,255,.85)" : v["--pc-tint"], color: v["--pc-ink"] }}>
            {branding.logo_url ? <img src={branding.logo_url} alt="" /> : initials(name)}
          </span>
          <div className="nm">{service}</div>
          <span className="tag" style={{ background: glass ? "rgba(255,255,255,.85)" : v["--pc-n50"], color: v["--pc-text"], boxShadow: glass ? "none" : `inset 0 0 0 1px ${v["--pc-n100"]}` }}>30 min</span>
          <i className="ln" style={{ width: "80%", background: v["--pc-n200"], marginTop: 3 }} />
          <i className="ln" style={{ width: "60%", background: v["--pc-n200"] }} />
        </div>
        <div className="cal">
          {Array.from({ length: 21 }, (_, i) => {
            const open = i > 9 && i % 7 > 0 && i % 7 < 6;
            const sel = i === 15;
            return <i key={i} style={{ borderRadius: r, ...(sel ? selected : open ? control : {}) }} />;
          })}
        </div>
        <div className="sl">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} style={{ borderRadius: glass ? 99 : 4, ...(i === 1 ? (glass ? selected : { boxShadow: `inset 0 0 0 1.5px ${v["--pc-ink"]}`, background: v["--pc-bg"] }) : glass ? control : { background: v["--pc-bg"], boxShadow: `inset 0 0 0 1px ${v["--pc-n200"]}` }) }} />
          ))}
          <i className="go" style={{ borderRadius: glass ? 99 : 4, background: glass ? `linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,0) 50%), linear-gradient(180deg, ${v["--pc-ink-light"]}, ${v["--pc-ink"]})` : v["--pc-ink"] }} />
        </div>
      </div>
    </div>
  );
}
