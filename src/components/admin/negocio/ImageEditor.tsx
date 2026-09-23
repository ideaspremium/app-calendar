"use client";
// Las mismas tipografías que la página pública, para ver cada botón y la vista previa con su letra.
import "@fontsource-variable/outfit";
import "@fontsource-variable/montserrat";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/lora";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateClientImage, type ImageInput } from "@/app/admin/actions";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { FONTS, fontKey, type FontKey } from "@/lib/fonts";
import { contrast, inkFor, parseHex, type PageStyle } from "@/lib/theme";
import type { Branding, EventType } from "@/lib/types";
import { I, initials } from "../icons";
import { Notice } from "../ui";
import MiniPreview from "./MiniPreview";

const MAX = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function initial(b: Branding): ImageInput {
  return {
    style: b.style === "vidrio" ? "vidrio" : "clasico",
    logo_url: b.logo_url ?? "",
    primary_color: parseHex(b.primary_color) ?? "#5b3fe0",
    background: parseHex(b.background) ?? "#ffffff",
    text_color: parseHex(b.text_color) ?? "#1c1b22",
    font: fontKey(b.font_family) ?? "inter",
    glass_mode: b.glass?.mode === "custom" ? "custom" : "brand",
    glass_colors: (b.glass?.colors ?? []).map((c) => parseHex(c)).filter((c): c is string => !!c),
    glass_intensity: b.glass?.intensity === "vivid" ? "vivid" : "soft",
  };
}

const toBranding = (v: ImageInput): Branding => ({
  style: v.style,
  logo_url: v.logo_url || undefined,
  primary_color: parseHex(v.primary_color) ?? "#5b3fe0",
  background: parseHex(v.background) ?? "#ffffff",
  text_color: parseHex(v.text_color) ?? "#1c1b22",
  font_family: FONTS[v.font as FontKey]?.label ?? "Inter",
  glass: { mode: v.glass_mode, colors: v.glass_colors, intensity: v.glass_intensity },
});

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (hex: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText((t) => (parseHex(t) === value ? t : value));
  }, [value]);
  const hex = parseHex(value) ?? "#000000";
  return (
    <div className="cw">
      <span className="sw2" style={{ background: hex }}>
        <input type="color" value={hex} disabled={disabled} aria-label={`${label}: elegir color`} onChange={(e) => { setText(e.target.value); onChange(e.target.value); }} />
      </span>
      <div>
        <b>{label}</b>
        <input className="hex" value={text} disabled={disabled} aria-label={`${label}: código hexadecimal`} spellCheck={false}
          onChange={(e) => { setText(e.target.value); const h = parseHex(e.target.value); if (h) onChange(h); }}
          onBlur={() => setText(parseHex(text) ?? value)} />
      </div>
    </div>
  );
}

export default function ImageEditor({ client, sample, previewUrl, canEdit }: {
  client: { id: string; name: string; branding: Branding };
  sample: EventType | null;
  previewUrl: string;
  canEdit: boolean;
}) {
  const saved = initial(client.branding);
  const [v, setV] = useState<ImageInput>(saved);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ImageInput>(k: K, val: ImageInput[K]) => { setV((s) => ({ ...s, [k]: val })); setMsg(null); };
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  const branding = toBranding(v);
  const bgForInk = v.style === "vidrio" ? "#ffffff" : branding.background!;
  const ink = inkFor(branding.primary_color!, bgForInk);
  const textContrast = contrast(branding.text_color!, bgForInk);
  const service = sample?.name ?? "Tu servicio";

  async function upload(f: File) {
    setMsg(null);
    if (!TYPES.includes(f.type)) return setMsg({ kind: "bad", text: "El logo tiene que ser PNG, JPG, WebP o SVG." });
    if (f.size > MAX) return setMsg({ kind: "bad", text: "El logo pesa más de 2 MB. Prueba con una versión más ligera." });
    setUploading(true);
    try {
      const sb = supabaseBrowser();
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" }[f.type];
      const path = `${client.id}/logo-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("logos").upload(path, f, { contentType: f.type, upsert: false, cacheControl: "31536000" });
      if (error) throw error;
      const url = sb.storage.from("logos").getPublicUrl(path).data.publicUrl;
      set("logo_url", url);
      setMsg({ kind: "warn", text: "Logo subido. Pulsa «Guardar imagen» para usarlo en la página." });
    } catch (e) {
      const m = (e as Error).message || "";
      setMsg({ kind: "bad", text: /row-level security|Unauthorized/i.test(m) ? "Tu papel en la agencia no permite subir el logo." : `No se pudo subir el logo: ${m}` });
    } finally {
      setUploading(false);
    }
  }

  function save() {
    start(async () => {
      const r = await updateClientImage(client.id, v);
      if (!r.ok) return setMsg({ kind: "bad", text: r.error });
      setMsg({ kind: "ok", text: "Imagen guardada. La página ya la usa." });
    });
  }

  return (
    <div className="split3">
      <div className="stack">
        {!canEdit && <Notice kind="info">Solo dueño/a o admin de la agencia pueden cambiar la imagen.</Notice>}
        <section className="card">
          <div className="ch">
            <div>
              <h2>Estilo de la página</h2>
              <p>Se puede cambiar cuando quieras. Con <code>?estilo=</code> en la dirección se prueba el otro sin guardar.</p>
            </div>
          </div>
          <div className="cb styles" role="radiogroup" aria-label="Estilo de la página">
            {([["clasico", "Clásico", "Tarjeta limpia, colores planos"], ["vidrio", "Vidrio", "Fondo de color, vidrio y brillos"]] as [PageStyle, string, string][]).map(([k, l, sub]) => (
              <button key={k} type="button" className="sty" role="radio" aria-checked={v.style === k} disabled={!canEdit} onClick={() => set("style", k)}>
                <div className="pv"><MiniPreview branding={{ ...branding, style: k }} style={k} name={client.name} service={service} /></div>
                <div className="lb">
                  <div>{l}<small>{sub}</small></div>
                  {v.style === k && <span className="ck">{I.check}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="ch"><h2>Logo</h2></div>
          <div className="cb">
            <div
              className={`drop${over ? " over" : ""}`}
              onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && canEdit) upload(f); }}
            >
              <span className="lgp" style={{ color: ink }}>{v.logo_url ? <img src={v.logo_url} alt="" /> : initials(client.name)}</span>
              <div className="tx">
                <b style={{ fontSize: 14 }}>{uploading ? "Subiendo…" : "Arrastra el logo aquí o pulsa «Subir»"}</b>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>PNG, SVG, JPG o WebP · hasta 2 MB · mejor con fondo transparente</div>
              </div>
              <div className="row2">
                <input ref={file} type="file" accept={TYPES.join(",")} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                <button type="button" className="btn sec sm" onClick={() => file.current?.click()} disabled={!canEdit || uploading}>{I.up}Subir</button>
                {v.logo_url && <button type="button" className="btn ghost sm" onClick={() => set("logo_url", "")} disabled={!canEdit}>Quitar</button>}
              </div>
            </div>
            <div className="fl" style={{ marginTop: 12 }}>
              <label htmlFor="logo-url">O la dirección de un logo que ya esté en internet</label>
              <input id="logo-url" className="inp" value={v.logo_url} onChange={(e) => set("logo_url", e.target.value.trim())} placeholder="https://…" disabled={!canEdit} />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="ch"><h2>Colores y tipografía</h2></div>
          <div className="cb stack" style={{ gap: 16 }}>
            <div className="colors">
              <ColorField label="Principal" value={v.primary_color} onChange={(h) => set("primary_color", h)} disabled={!canEdit} />
              {v.style === "clasico" && <ColorField label="Fondo" value={v.background} onChange={(h) => set("background", h)} disabled={!canEdit} />}
              <ColorField label="Texto" value={v.text_color} onChange={(h) => set("text_color", h)} disabled={!canEdit} />
            </div>
            {ink.toLowerCase() !== branding.primary_color!.toLowerCase() && (
              <div className="box" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <i style={{ width: 22, height: 22, borderRadius: 6, background: ink, flex: "none" }} />
                <span>
                  El color principal es muy claro para escribir encima, así que en textos y botones usamos <b>{ink}</b>, de la misma familia. Se calcula solo.
                </span>
              </div>
            )}
            {textContrast < 4.5 && (
              <Notice kind="warn">
                El texto se lee con dificultad sobre el fondo (contraste {textContrast.toFixed(1)}:1; lo recomendable es al menos 4,5:1). Oscurece el texto o aclara el fondo.
              </Notice>
            )}
            {v.style === "vidrio" && <small className="hint" style={{ marginTop: -8 }}>En vidrio el fondo es la malla de color: el color de fondo solo se usa en el estilo clásico.</small>}
            <div className="fl">
              <span className="lbl">Tipografía</span>
              <div className="fonts" role="radiogroup" aria-label="Tipografía">
                {(Object.keys(FONTS) as FontKey[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={v.font === k} style={{ fontFamily: FONTS[k].stack }} disabled={!canEdit} onClick={() => set("font", k)}>
                    {FONTS[k].label}
                  </button>
                ))}
              </div>
              <small>Alojadas en la app: no se llama a Google.</small>
            </div>
          </div>
        </section>

        {v.style === "vidrio" && (
          <section className="card">
            <div className="ch">
              <div>
                <h2>Fondo del vidrio</h2>
                <p>Solo con colores del negocio, suavizados para que el texto se lea.</p>
              </div>
            </div>
            <div className="cb stack" style={{ gap: 14 }}>
              <span className="seg2" role="radiogroup" aria-label="Colores del fondo">
                {[["brand", "Solo el color principal"], ["custom", "Colores elegidos"]].map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={v.glass_mode === k} className={v.glass_mode === k ? "on" : ""} disabled={!canEdit}
                    onClick={() => { set("glass_mode", k as ImageInput["glass_mode"]); if (k === "custom" && !v.glass_colors.length) set("glass_colors", [branding.primary_color!]); }}>
                    {l}
                  </button>
                ))}
              </span>
              {v.glass_mode === "custom" && (
                <div className="dots">
                  {v.glass_colors.map((c, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span className="dot" style={{ background: c }}>
                        <input type="color" value={c} aria-label={`Color ${i + 1} del fondo`} disabled={!canEdit} onChange={(e) => set("glass_colors", v.glass_colors.map((x, j) => (j === i ? e.target.value : x)))} />
                      </span>
                      {v.glass_colors.length > 1 && (
                        <button type="button" className="del" aria-label={`Quitar el color ${i + 1}`} disabled={!canEdit} onClick={() => set("glass_colors", v.glass_colors.filter((_, j) => j !== i))}>{I.x}</button>
                      )}
                    </span>
                  ))}
                  {v.glass_colors.length < 3 && (
                    <button type="button" className="dot addd" aria-label="Añadir un color" disabled={!canEdit} onClick={() => set("glass_colors", [...v.glass_colors, branding.text_color!])}>{I.plus}</button>
                  )}
                  <small className="small">hasta 3 colores</small>
                </div>
              )}
              <div className="fl">
                <span className="lbl">Intensidad</span>
                <span className="seg2" role="radiogroup" aria-label="Intensidad">
                  {[["soft", "Suave"], ["vivid", "Viva"]].map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={v.glass_intensity === k} className={v.glass_intensity === k ? "on" : ""} disabled={!canEdit}
                      onClick={() => set("glass_intensity", k as ImageInput["glass_intensity"])}>
                      {l}
                    </button>
                  ))}
                </span>
              </div>
            </div>
          </section>
        )}

        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {canEdit && (
          <div className="foot">
            <button type="button" className="btn pri" onClick={save} disabled={pending || !dirty}>{pending ? "Guardando…" : "Guardar imagen"}</button>
            <button type="button" className="btn sec" onClick={() => { setV(saved); setMsg(null); }} disabled={pending || !dirty}>Descartar</button>
            {dirty && <span className="small">Hay cambios sin guardar.</span>}
          </div>
        )}
      </div>

      <div className="stick">
        <section className="card">
          <div className="ch">
            <h2>Vista previa</h2>
            <span className="pill p-n">se actualiza al cambiar</span>
          </div>
          <div className="cb">
            <div className="preview">
              <MiniPreview branding={branding} style={v.style} name={client.name} service={service} />
            </div>
            <a className="btn sec sm" style={{ marginTop: 12, width: "100%" }} href={`${previewUrl}?estilo=${v.style}`} target="_blank" rel="noreferrer">
              {I.ext}Abrir la página real con este estilo
            </a>
            <small className="hint">La página real usa los colores guardados; el estilo se puede probar sin guardar.</small>
          </div>
        </section>
      </div>
    </div>
  );
}
