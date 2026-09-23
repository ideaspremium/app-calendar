"use client";
import { useEffect, useState } from "react";
import ZonePicker from "@/components/public/ZonePicker";
import { isValidZone } from "@/lib/zones";
import { I } from "./icons";

export function CopyButton({ text, label = "Copiar", className = "btn sec sm", title }: { text: string; label?: string; className?: string; title?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={className}
      title={title ?? "Copiar"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? I.check : I.copy}
      {label && (ok ? "Copiado" : label)}
    </button>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "bad" | "warn" | "info"; children: React.ReactNode }) {
  const icon = kind === "ok" ? I.checkL : kind === "info" ? I.info : I.warn;
  return (
    <div className={`notice ${kind}`} role={kind === "bad" ? "alert" : "status"}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

/**
 * Selector de zona para formularios: el mismo de la página pública (lista completa de
 * `Intl`, búsqueda, España y EE. UU. arriba) con un campo oculto para enviar el valor.
 */
export function ZoneField({ name, value, onChange, disabled }: { name?: string; value: string; onChange?: (tz: string) => void; disabled?: boolean }) {
  const [tz, setTz] = useState(value);
  const [device, setDevice] = useState<string | null>(null);
  useEffect(() => setTz(value), [value]);
  useEffect(() => {
    try {
      const d = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (isValidZone(d)) setDevice(d);
    } catch {
      /* nada */
    }
  }, []);
  const valid = isValidZone(tz);
  return (
    <div className="zfield" aria-disabled={disabled}>
      {name && <input type="hidden" name={name} value={tz} />}
      {disabled ? (
        <div className="inp ro" style={{ width: "100%" }}>{I.globe}{tz}</div>
      ) : (
        <ZonePicker
          value={valid ? tz : device ?? "UTC"}
          detected={device}
          lang="es"
          onChange={(v) => {
            setTz(v);
            onChange?.(v);
          }}
        />
      )}
      {!valid && (
        <small className="hint bad">
          «{tz}» no es una zona horaria válida: mientras no elijas una de la lista, Nylas calcula las horas en UTC.
        </small>
      )}
    </div>
  );
}

export type Republish = { id: string; name: string }[];
type PubState = { running: boolean; done: { name: string; ok: boolean; error?: string }[] };

/**
 * Vuelve a publicar en Nylas los servicios de un negocio (lo mismo que el botón
 * «Actualizar en Nylas» de cada servicio, uno detrás de otro).
 */
export function useRepublish() {
  const [state, setState] = useState<PubState>({ running: false, done: [] });
  async function run(list: Republish) {
    if (!list.length) return;
    setState({ running: true, done: [] });
    const done: PubState["done"] = [];
    for (const s of list) {
      try {
        const r = await fetch(`/api/event-types/${s.id}/sync`, { method: "POST" });
        const j = await r.json().catch(() => ({}));
        done.push(r.ok ? { name: s.name, ok: true } : { name: s.name, ok: false, error: j.error ?? `Error ${r.status}` });
      } catch (e) {
        done.push({ name: s.name, ok: false, error: (e as Error).message });
      }
      setState({ running: true, done: [...done] });
    }
    setState({ running: false, done });
  }
  return { ...state, run };
}

export function RepublishNote({ running, done }: PubState) {
  if (!running && !done.length) return null;
  if (running) return <span className="pubmsg">Publicando en Nylas… {done.length ? `(${done.length})` : ""}</span>;
  const bad = done.filter((d) => !d.ok);
  if (!bad.length)
    return (
      <span className="pubmsg ok">
        Publicado en {done.length === 1 ? `«${done[0].name}»` : `${done.length} servicios`}.
      </span>
    );
  return (
    <span className="pubmsg bad">
      No se pudo publicar {bad.map((b) => `«${b.name}» (${b.error})`).join(", ")}. Vuelve a intentarlo desde Servicios.
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="sw" disabled={disabled} onClick={() => onChange(!checked)} />
  );
}
