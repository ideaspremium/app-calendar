"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAgency, updateAgency } from "@/app/admin/actions";
import { Notice, ZoneField } from "./ui";

type Agency = { name: string; contact_email: string; timezone: string; default_locale: string; default_style: string };

function Seg({ label, value, options, onChange, disabled }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <span className="seg2" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "on" : ""} disabled={disabled} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </span>
  );
}

export function AgencySettings({ agency, canEdit }: { agency: Agency; canEdit: boolean }) {
  const [v, setV] = useState(agency);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Agency) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  return (
    <form
      className="card"
      style={{ maxWidth: 820 }}
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await updateAgency(v);
          // La acción ya devuelve la página actualizada (revalidatePath): no hace falta recargar.
          if (r.ok) setMsg({ kind: "ok", text: "Ajustes guardados." });
          else setMsg({ kind: "bad", text: r.error });
        });
      }}
    >
      <div className="cb form">
        {!canEdit && (
          <div className="full"><Notice kind="info">Solo dueño/a o admin pueden cambiar los ajustes de la agencia.</Notice></div>
        )}
        <div className="fl">
          <label htmlFor="a-name">Nombre de la agencia</label>
          <input id="a-name" className="inp" value={v.name} onChange={(e) => set("name")(e.target.value)} disabled={!canEdit} required />
        </div>
        <div className="fl">
          <label htmlFor="a-mail">Correo de contacto</label>
          <input id="a-mail" type="email" className="inp" value={v.contact_email} onChange={(e) => set("contact_email")(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="fl">
          <span className="lbl">Zona horaria por defecto</span>
          <ZoneField value={v.timezone} onChange={set("timezone")} disabled={!canEdit} />
          <small>La de los negocios nuevos. Cada negocio puede tener la suya.</small>
        </div>
        <div className="fl">
          <span className="lbl">Idioma por defecto</span>
          <Seg label="Idioma por defecto" value={v.default_locale} options={[["es", "Español"], ["en", "English"]]} onChange={set("default_locale")} disabled={!canEdit} />
          <small>El de la página de reservas de los negocios nuevos.</small>
        </div>
        <div className="fl full">
          <span className="lbl">Estilo por defecto de las páginas</span>
          <Seg label="Estilo por defecto" value={v.default_style} options={[["clasico", "Clásico"], ["vidrio", "Vidrio"]]} onChange={set("default_style")} disabled={!canEdit} />
          <small>Solo para los negocios nuevos; el de cada negocio se cambia en su pestaña Imagen.</small>
        </div>
        {msg && <div className="full"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
        {canEdit && (
          <div className="full foot">
            <button className="btn pri" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
          </div>
        )}
      </div>
    </form>
  );
}

export function NewAgency({ timezone }: { timezone: string }) {
  const [name, setName] = useState("");
  const [tz, setTz] = useState(timezone);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="card"
      style={{ maxWidth: 640 }}
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const r = await createAgency({ name, timezone: tz });
          if (!r.ok) return setErr(r.error);
          router.push("/admin/equipo");
        });
      }}
    >
      <div className="cb form one">
        <div className="fl">
          <label htmlFor="na-name">Nombre de la agencia</label>
          <input id="na-name" className="inp" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo: Feeling Comunicación" />
        </div>
        <div className="fl">
          <span className="lbl">Zona horaria</span>
          <ZoneField value={tz} onChange={setTz} />
        </div>
        {err && <Notice kind="bad">{err}</Notice>}
        <div className="foot">
          <button className="btn pri" disabled={pending}>{pending ? "Creando…" : "Crear agencia"}</button>
          <span className="small">Entras como dueña; después invita a su equipo desde Equipo.</span>
        </div>
      </div>
    </form>
  );
}
