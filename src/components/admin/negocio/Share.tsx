"use client";
import { useState } from "react";
import { CopyButton } from "../ui";

/** El mismo cálculo que embed.js: texto blanco o casi negro, el que más contraste tenga. */
function textOn(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
  if (!/^[0-9a-f]{6}$/i.test(h)) return "#ffffff";
  const L = [0, 2, 4]
    .map((i) => { const v = parseInt(h.substr(i, 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0556 ? "#ffffff" : "#111111";
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export default function Share({ base, pageUrl, client, services }: {
  base: string;
  pageUrl: string;
  client: { slug: string; brand: string };
  services: { name: string; slug: string }[];
}) {
  const [mode, setMode] = useState<"inline" | "popup">("inline");
  const [svc, setSvc] = useState(services.length === 1 ? services[0].slug : "");
  const [label, setLabel] = useState("Reservar cita");

  if (!services.length) {
    return (
      <div className="card">
        <div className="cb" style={{ color: "var(--muted)" }}>
          Publica un servicio para tener enlaces y código para la web.
        </div>
      </div>
    );
  }

  const code =
    `<script src="${base}/embed.js" data-client="${client.slug}"${svc ? ` data-event="${svc}"` : ""}` +
    (mode === "popup" ? ` data-mode="popup" data-label="${attr(label || "Reservar cita")}" data-color="${client.brand}"` : "") +
    `></script>`;

  return (
    <div className="grid2">
      <div className="stack">
        <section className="card">
          <div className="ch">
            <div>
              <h2>Enlaces</h2>
              <p>Para mandar por correo, WhatsApp o redes.</p>
            </div>
          </div>
          <div className="cb stack" style={{ gap: 10 }}>
            <div className="fl">
              <span className="lbl">{services.length > 1 ? "Todos los servicios" : "Página del negocio"}</span>
              <div className="copyrow">
                <span className="inp">{pageUrl}</span>
                <CopyButton text={pageUrl} />
              </div>
              {services.length === 1 && <small>Con un solo servicio, esta dirección abre directamente su calendario.</small>}
            </div>
            {services.map((s) => (
              <div className="fl" key={s.slug}>
                <span className="lbl">{s.name}</span>
                <div className="copyrow">
                  <span className="inp">{pageUrl}/{s.slug}</span>
                  <CopyButton text={`${pageUrl}/${s.slug}`} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="ch">
            <div>
              <h2>En la web del negocio</h2>
              <p>Pega una línea donde quieras el calendario.</p>
            </div>
          </div>
          <div className="cb stack" style={{ gap: 12 }}>
            <div className="row2">
              <span className="seg2" role="radiogroup" aria-label="Cómo se ve en la web">
                <button type="button" role="radio" aria-checked={mode === "inline"} className={mode === "inline" ? "on" : ""} onClick={() => setMode("inline")}>Dentro de la página</button>
                <button type="button" role="radio" aria-checked={mode === "popup"} className={mode === "popup" ? "on" : ""} onClick={() => setMode("popup")}>Botón flotante</button>
              </span>
              {services.length > 1 && (
                <select className="inp" value={svc} onChange={(e) => setSvc(e.target.value)} aria-label="Servicio">
                  <option value="">Todos los servicios</option>
                  {services.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
              )}
            </div>
            <pre className="code">{code}</pre>
            <div className="row2">
              <CopyButton text={code} label="Copiar código" className="btn pri sm" />
              <span className="small">
                {mode === "inline" ? "Se ajusta solo al alto y al estilo del negocio." : "Abre el calendario encima de la web; en el móvil, a pantalla completa."}
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="ch"><h2>Así se ve el botón flotante</h2></div>
        <div className="cb">
          <div className="fakesite" aria-hidden="true">
            <i style={{ width: "40%" }} />
            <i style={{ width: "70%" }} />
            <i style={{ width: "55%" }} />
            <i style={{ width: "62%" }} />
            <span className="float" style={{ background: client.brand, color: textOn(client.brand) }}>
              {label || "Reservar cita"}
            </span>
          </div>
          <div className="fl" style={{ marginTop: 12 }}>
            <label htmlFor="sh-label">Texto del botón</label>
            <input id="sh-label" className="inp" value={label} maxLength={40} onChange={(e) => { setLabel(e.target.value); setMode("popup"); }} />
            <small>El color del texto se elige solo para que se lea sobre el color del negocio.</small>
          </div>
        </div>
      </section>
    </div>
  );
}
