"use client";
import { useState, useTransition } from "react";
import { setClientBusinessId, updateClientData } from "@/app/admin/actions";
import { Notice, ZoneField } from "../ui";

type Data = { id: string; name: string; slug: string; timezone: string; locale: string; contact_email: string; website_url: string; custom_domain: string };

export default function DataForm({
  client, host, canEdit, businessId,
}: { client: Data; host: string; canEdit: boolean; businessId: string | null }) {
  const [v, setV] = useState(client);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Data) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const slugChanged = v.slug.trim() !== client.slug;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await updateClientData(v);
      if (r.ok) {
        setMsg({ kind: "ok", text: "Datos guardados." });
        setV((s) => ({ ...s, slug: r.slug }));
      } else setMsg({ kind: "bad", text: r.error });
    });
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="cb form">
        {!canEdit && (
          <div className="full">
            <Notice kind="info">Solo dueño/a o admin de la agencia pueden cambiar estos datos.</Notice>
          </div>
        )}
        <div className="fl">
          <label htmlFor="d-name">Nombre</label>
          <input id="d-name" className="inp" value={v.name} onChange={set("name")} disabled={!canEdit} required />
        </div>
        <div className="fl">
          <label htmlFor="d-slug">Dirección de su página</label>
          <div className="pre">
            <span>{host}/</span>
            <input id="d-slug" className="inp" value={v.slug} onChange={set("slug")} disabled={!canEdit} required />
          </div>
          <small className={slugChanged ? "warn" : undefined}>
            {slugChanged ? "Al cambiarla dejan de funcionar los enlaces y el código de la web que ya se hayan compartido." : "Cambiarla rompe los enlaces que ya se hayan compartido."}
          </small>
        </div>
        <div className="fl">
          <span className="lbl">Zona horaria</span>
          <ZoneField value={v.timezone} onChange={(tz) => setV((s) => ({ ...s, timezone: tz }))} disabled={!canEdit} />
          <small>El horario de atención se escribe en esta zona. Tras cambiarla, vuelve a publicar los servicios.</small>
        </div>
        <div className="fl">
          <span className="lbl">Idioma de la página</span>
          <span className="seg2" role="radiogroup" aria-label="Idioma de la página">
            {[["es", "Español"], ["en", "English"]].map(([k, l]) => (
              <label key={k}>
                <input type="radio" name="locale" value={k} checked={v.locale === k} disabled={!canEdit} onChange={() => setV((s) => ({ ...s, locale: k }))} />
                {l}
              </label>
            ))}
          </span>
          <small>La persona que reserva puede cambiarlo.</small>
        </div>
        <div className="fl">
          <label htmlFor="d-mail">Correo de contacto</label>
          <input id="d-mail" type="email" className="inp" value={v.contact_email} onChange={set("contact_email")} disabled={!canEdit} placeholder="contacto@negocio.com" />
        </div>
        <div className="fl">
          <label htmlFor="d-web">Web del negocio</label>
          <input id="d-web" className="inp" value={v.website_url} onChange={set("website_url")} disabled={!canEdit} placeholder="https://negocio.com" />
        </div>
        <div className="fl full">
          <label htmlFor="d-dom">Dominio propio (opcional)</label>
          <input id="d-dom" className="inp" value={v.custom_domain} onChange={set("custom_domain")} disabled={!canEdit} placeholder="citas.negocio.com" />
          <small>Apunta un CNAME de ese dominio a la app y escribe aquí el dominio.</small>
        </div>
        <BusinessIdField clientId={client.id} initial={businessId} canEdit={canEdit} />
        {msg && (
          <div className="full">
            <Notice kind={msg.kind}>{msg.text}</Notice>
          </div>
        )}
        {canEdit && (
          <div className="full foot">
            <button className="btn pri" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
          </div>
        )}
      </div>
    </form>
  );
}

/**
 * business_id de la suite (lo emite Xplore360). Se escribe una sola vez: después queda
 * de solo lectura, porque la base de datos no deja cambiarlo.
 */
function BusinessIdField({ clientId, initial, canEdit }: { clientId: string; initial: string | null; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

  function assign() {
    setMsg(null);
    start(async () => {
      const r = await setClientBusinessId(clientId, value);
      if (r.ok) {
        setSaved(r.business_id);
        setMsg({ kind: "ok", text: "business_id asignado." });
      } else setMsg({ kind: "bad", text: r.error });
    });
  }

  return (
    <div className="fl full">
      <label htmlFor="d-bid">Identificador del negocio en la suite (business_id)</label>
      {saved ? (
        <>
          <input id="d-bid" className="inp" value={saved} readOnly />
          <small>Lo emite Xplore360. No se puede cambiar.</small>
        </>
      ) : canEdit ? (
        <>
          <div className="pre">
            <input
              id="d-bid"
              className="inp"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="b91e4ae2-7464-4975-b65f-e3d13fb6485a"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" className="btn sec" onClick={assign} disabled={!valid || pending}>
              {pending ? "Asignando…" : "Asignar"}
            </button>
          </div>
          <small className={value && !valid ? "warn" : undefined}>
            {value && !valid
              ? "Debe ser un UUID v4 (36 caracteres)."
              : "Lo emite Xplore360 en la primera auditoría. Revísalo bien: una vez asignado no se puede cambiar."}
          </small>
        </>
      ) : (
        <>
          <input id="d-bid" className="inp" value="Sin asignar" readOnly disabled />
          <small>Solo dueño/a o admin de la agencia pueden asignarlo.</small>
        </>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}
