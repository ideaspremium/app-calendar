"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { deactivateService, saveService, type ServiceInput } from "@/app/admin/actions";
import { LOCATION_LABEL } from "@/lib/admin/data";
import type { EventType } from "@/lib/types";
import { I } from "../icons";
import { CopyButton, Notice } from "../ui";

type Conn = { id: string; email: string; active: boolean };
type Q = { key?: string; label: string; type: string; required: boolean };

const QTYPES = [
  { value: "text", label: "Texto corto" },
  { value: "multi_line_text", label: "Texto largo" },
  { value: "phone_number", label: "Teléfono" },
  { value: "email", label: "Correo" },
];
const DURATIONS = [15, 20, 30, 45, 60, 90, 120];
const INTERVALS = [10, 15, 20, 30, 45, 60, 90, 120];
const NOTICE_H = [0, 1, 2, 4, 12, 24, 48, 72];
const AHEAD = [7, 14, 30, 60, 90, 180, 365];
const slugOf = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
const withCurrent = (list: number[], v: number) => (list.includes(v) ? list : [...list, v].sort((a, b) => a - b));
const isEmailQ = (q: Q) => q.type === "email" || /\b(correo|e-?mail)\b/i.test(q.label);

type Pub = { state: "idle" | "loading" | "ok" | "error"; msg?: string; diag?: string };

async function sync(id: string, diagnose = false): Promise<{ ok: boolean; text: string }> {
  try {
    const r = await fetch(`/api/event-types/${id}/sync${diagnose ? "?diagnose=1" : ""}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (diagnose) return { ok: true, text: JSON.stringify(j, null, 2) };
    return r.ok ? { ok: true, text: "" } : { ok: false, text: j.error ?? `Error ${r.status}` };
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
}

function PublishButton({ service, onDone, primary }: { service: EventType; onDone: () => void; primary?: boolean }) {
  const [p, setP] = useState<Pub>({ state: "idle" });
  const published = !!service.nylas_configuration_id;
  return (
    <>
      <button
        type="button"
        className={`btn ${published && !primary ? "sec" : "pri"} sm`}
        disabled={p.state === "loading" || !service.calendar_connection_id}
        title={!service.calendar_connection_id ? "Elige primero el calendario del servicio (Editar)" : undefined}
        onClick={async () => {
          setP({ state: "loading" });
          const r = await sync(service.id);
          setP(r.ok ? { state: "ok" } : { state: "error", msg: r.text });
          if (r.ok) onDone();
        }}
      >
        {p.state === "loading" ? "Publicando…" : published ? "Actualizar en Nylas" : "Publicar"}
      </button>
      {p.state === "ok" && <span className="pubmsg ok">Publicado</span>}
      {p.state === "error" && (
        <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="pubmsg bad" style={{ whiteSpace: "pre-wrap" }}>{p.msg}</span>
          <div>
            <button type="button" className="btn ghost sm" onClick={async () => setP({ ...p, diag: (await sync(service.id, true)).text })}>Diagnosticar</button>
          </div>
          {p.diag && <textarea readOnly className="inp" rows={10} value={p.diag} style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }} onFocus={(e) => e.currentTarget.select()} />}
        </div>
      )}
    </>
  );
}

export default function Services({
  client, connections, services, editId, startNew,
}: {
  client: { id: string; slug: string; brand: string; pageUrl: string };
  connections: Conn[];
  services: EventType[];
  editId: string | null;
  startNew: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EventType | "new" | null>(() => (startNew ? "new" : services.find((s) => s.id === editId) ?? null));
  const [flash, setFlash] = useState<string | null>(null);

  const close = () => {
    setEditing(null);
    if (editId || startNew) router.replace("?tab=servicios", { scroll: false });
  };

  return (
    <>
      {flash && <Notice kind="ok">{flash}</Notice>}
      {connections.length === 0 && (
        <Notice kind="warn">
          Este negocio aún no tiene calendario conectado: puedes crear servicios, pero no se podrán publicar hasta conectarlo en «Calendario y horario».
        </Notice>
      )}

      {services.length === 0 ? (
        <div className="card">
          <div className="cb" style={{ textAlign: "center", padding: 44 }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 17 }}>Todavía no hay servicios</h2>
            <p style={{ color: "var(--muted)", margin: "0 auto 16px", maxWidth: 520 }}>
              Un servicio es cada tipo de cita que ofrece el negocio: su duración, su lugar y las preguntas del formulario.
            </p>
            <button type="button" className="btn pri" onClick={() => setEditing("new")}>{I.plus}Crear el primero</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "-6px 0 12px" }}>
            <button type="button" className="btn pri sm" onClick={() => setEditing("new")}>{I.plus}Nuevo servicio</button>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            {services.map((s) => (
              <div className="card" key={s.id}>
                <div className="cb svc">
                  <span className="bar" style={{ background: client.brand }} />
                  <div className="nm">
                    <b>{s.name}</b>
                    <div>
                      {s.duration_minutes} min · {LOCATION_LABEL[s.location_type] ?? s.location_type} · /{client.slug}/{s.slug}
                    </div>
                  </div>
                  <div className="acts">
                    {s.nylas_configuration_id ? <span className="pill p-ok">{I.check}Publicado</span> : <span className="pill p-warn">{I.warn}Sin publicar</span>}
                    <PublishButton service={s} onDone={() => router.refresh()} />
                    <button type="button" className="btn sec sm" onClick={() => setEditing(s)}>Editar</button>
                    {s.nylas_configuration_id && <CopyButton text={`${client.pageUrl}/${s.slug}`} label="" className="btn sec sm ico" title="Copiar el enlace del servicio" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && (
        <Editor
          key={editing === "new" ? "new" : editing.id}
          clientId={client.id}
          connections={connections}
          service={editing === "new" ? null : editing}
          onClose={close}
          onSaved={(text) => {
            setFlash(text);
            close();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Editor({ clientId, connections, service, onClose, onSaved }: {
  clientId: string; connections: Conn[]; service: EventType | null; onClose: () => void; onSaved: (text: string) => void;
}) {
  const [v, setV] = useState({
    name: service?.name ?? "",
    slug: service?.slug ?? "",
    description: service?.description ?? "",
    calendar_connection_id: service?.calendar_connection_id ?? connections.find((c) => c.active)?.id ?? connections[0]?.id ?? "",
    duration_minutes: service?.duration_minutes ?? 30,
    slot_interval_minutes: service?.slot_interval_minutes ?? 30,
    buffer_before_minutes: service?.buffer_before_minutes ?? 0,
    buffer_after_minutes: service?.buffer_after_minutes ?? 0,
    min_notice_minutes: service?.min_notice_minutes ?? 120,
    max_days_ahead: service?.max_days_ahead ?? 60,
    location_type: service?.location_type ?? "in_person",
    location_details: service?.location_details ?? "",
  });
  const [slugTouched, setSlugTouched] = useState(!!service);
  const [qs, setQs] = useState<Q[]>(service?.questions?.length ? service.questions : service ? [] : [{ label: "Teléfono", type: "phone_number", required: true }]);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const num = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => set(k, Number(e.target.value) as never);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(publish: boolean) {
    setErr(null);
    start(async () => {
      const input: ServiceInput = { ...v, id: service?.id, client_id: clientId, slug: v.slug || slugOf(v.name), questions: qs };
      const r = await saveService(input);
      if (!r.ok) return setErr(r.error);
      if (publish && v.calendar_connection_id) {
        const p = await sync(r.id);
        if (!p.ok) return setErr(`Guardado, pero Nylas no lo aceptó: ${p.text}`);
        return onSaved(`«${v.name}» guardado y publicado.`);
      }
      onSaved(`«${v.name}» guardado.${v.calendar_connection_id ? " Recuerda publicarlo para que cambie en su página." : ""}`);
    });
  }

  function deactivate() {
    if (!service) return;
    if (!sure) return setSure(true);
    start(async () => {
      const r = await deactivateService(clientId, service.id);
      if (!r.ok) return setErr(r.error);
      onSaved(`«${service.name}» desactivado.`);
    });
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer wide" role="dialog" aria-modal="true" aria-label={service ? `Editar ${service.name}` : "Nuevo servicio"}>
        <button type="button" className="x" onClick={onClose} aria-label="Cerrar">{I.x}</button>
        <div className="eyebrow">{service ? "Editar servicio" : "Nuevo servicio"}</div>
        <h2>{v.name || "Sin nombre"}</h2>
        <form className="form" style={{ marginTop: 18 }} onSubmit={(e) => { e.preventDefault(); submit(true); }}>
          <div className="fl full">
            <label htmlFor="s-name">Nombre</label>
            <input id="s-name" className="inp" required value={v.name} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugOf(e.target.value)); }} />
          </div>
          <div className="fl full">
            <label htmlFor="s-slug">Dirección del servicio</label>
            <input id="s-slug" className="inp" value={v.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} placeholder="se crea del nombre" />
            {service && v.slug !== service.slug && <small className="warn">Los enlaces que ya se hayan compartido de este servicio dejarán de funcionar.</small>}
          </div>
          <div className="fl full">
            <label htmlFor="s-desc">Descripción</label>
            <textarea id="s-desc" className="inp" rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="Lo que verá la persona antes de reservar (opcional)" />
          </div>
          <div className="fl full">
            <label htmlFor="s-cal">Calendario donde se crea la cita</label>
            {connections.length ? (
              <select id="s-cal" className="inp" value={v.calendar_connection_id} onChange={(e) => set("calendar_connection_id", e.target.value)}>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.email}{c.active ? "" : " (requiere reconexión)"}</option>)}
              </select>
            ) : (
              <div className="inp ro">Sin calendario conectado</div>
            )}
          </div>
          <div className="fl">
            <label htmlFor="s-dur">Duración</label>
            <select id="s-dur" className="inp" value={v.duration_minutes} onChange={num("duration_minutes")}>
              {withCurrent(DURATIONS, v.duration_minutes).map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
          <div className="fl">
            <label htmlFor="s-int">Horas cada</label>
            <select id="s-int" className="inp" value={v.slot_interval_minutes} onChange={num("slot_interval_minutes")}>
              {withCurrent(INTERVALS, v.slot_interval_minutes).map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
          <div className="fl">
            <span className="lbl">Margen antes / después</span>
            <div className="row2" style={{ flexWrap: "nowrap" }}>
              <input className="inp" type="number" min={0} max={240} step={5} value={v.buffer_before_minutes} onChange={num("buffer_before_minutes")} aria-label="Margen antes, en minutos" />
              <span className="small">/</span>
              <input className="inp" type="number" min={0} max={240} step={5} value={v.buffer_after_minutes} onChange={num("buffer_after_minutes")} aria-label="Margen después, en minutos" />
              <span className="small">min</span>
            </div>
          </div>
          <div className="fl">
            <label htmlFor="s-not">Antelación mínima</label>
            <select id="s-not" className="inp" value={v.min_notice_minutes} onChange={num("min_notice_minutes")}>
              {withCurrent(NOTICE_H.map((h) => h * 60), v.min_notice_minutes).map((m) => (
                <option key={m} value={m}>{m === 0 ? "Sin mínimo" : m % 60 ? `${m} min` : m / 60 === 1 ? "1 hora" : `${m / 60} horas`}</option>
              ))}
            </select>
          </div>
          <div className="fl">
            <label htmlFor="s-ahead">Reservas hasta</label>
            <select id="s-ahead" className="inp" value={v.max_days_ahead} onChange={num("max_days_ahead")}>
              {withCurrent(AHEAD, v.max_days_ahead).map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
          </div>
          <div className="fl">
            <label htmlFor="s-loc">Lugar</label>
            <select id="s-loc" className="inp" value={v.location_type} onChange={(e) => set("location_type", e.target.value)}>
              {Object.entries(LOCATION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="fl full">
            <label htmlFor="s-locd">{v.location_type === "in_person" ? "Dirección" : v.location_type === "video" ? "Enlace o plataforma" : v.location_type === "phone" ? "Detalle (quién llama a quién)" : "Detalle del lugar"}</label>
            <input id="s-locd" className="inp" value={v.location_details} onChange={(e) => set("location_details", e.target.value)} placeholder="opcional" />
          </div>

          <div className="fl full">
            <span className="lbl">Preguntas del formulario</span>
            <small style={{ marginTop: -2, marginBottom: 8 }}>El nombre y el correo de quien reserva se piden siempre. Añade solo lo que necesites además.</small>
            <div className="qs">
              {qs.map((q, i) => (
                <div key={i}>
                  <div className={`q${isEmailQ(q) ? " dup" : ""}`}>
                    <input className="inp" value={q.label} placeholder="Pregunta" aria-label={`Pregunta ${i + 1}`} onChange={(e) => setQs((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                    <select className="inp" value={q.type} aria-label="Tipo de respuesta" onChange={(e) => setQs((x) => x.map((y, j) => (j === i ? { ...y, type: e.target.value } : y)))}>
                      {QTYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <label className="req">
                      <input type="checkbox" checked={q.required} onChange={(e) => setQs((x) => x.map((y, j) => (j === i ? { ...y, required: e.target.checked } : y)))} />
                      Obligatoria
                    </label>
                    <button type="button" className="del" aria-label="Quitar esta pregunta" onClick={() => setQs((x) => x.filter((_, j) => j !== i))}>{I.x}</button>
                  </div>
                  {isEmailQ(q) && <small className="hint warn">El correo ya se pide siempre: esta pregunta sale repetida.</small>}
                </div>
              ))}
              <div>
                <button type="button" className="add" onClick={() => setQs((x) => [...x, { label: "", type: "text", required: false }])}>+ Añadir pregunta</button>
              </div>
            </div>
          </div>

          {err && <div className="full"><Notice kind="bad">{err}</Notice></div>}
          <div className="full foot" style={{ marginTop: 4 }}>
            {v.calendar_connection_id ? (
              <>
                <button className="btn pri" disabled={pending}>{pending ? "Guardando…" : "Guardar y publicar"}</button>
                <button type="button" className="btn sec" disabled={pending} onClick={() => submit(false)}>Guardar sin publicar</button>
              </>
            ) : (
              <button type="button" className="btn pri" disabled={pending} onClick={() => submit(false)}>{pending ? "Guardando…" : "Guardar"}</button>
            )}
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            {service && (
              <button type="button" className="btn dan sm" style={{ marginLeft: "auto" }} onClick={deactivate} disabled={pending} onBlur={() => setSure(false)}>
                {sure ? "Sí, desactivar" : "Desactivar"}
              </button>
            )}
          </div>
          {sure && <p className="small full" style={{ margin: 0, color: "var(--bad)" }}>Deja de aparecer en su página; las citas ya hechas se quedan. Pulsa otra vez para confirmar.</p>}
          {service && <p className="small full" style={{ margin: 0 }}>ID para la API: <code>{service.id}</code></p>}
        </form>
      </aside>
    </>
  );
}
