"use client";
import { useMemo, useState, useTransition } from "react";
import { addClosedDays, removeClosedDays } from "@/app/admin/actions";
import { calendarDay, daysBetween } from "@/lib/admin/time";
import { I } from "../icons";
import { Notice, RepublishNote, useRepublish } from "../ui";

type Item = { id: string; date: string; note: string | null };
type Group = { ids: string[]; from: string; to: string; note: string | null };

const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Días seguidos con la misma nota se enseñan como un solo cierre («Vacaciones, del 24 al 26 dic»). */
function group(items: Item[]): Group[] {
  const out: Group[] = [];
  for (const it of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    const g = out[out.length - 1];
    if (g && g.note === it.note && nextDay(g.to) === it.date) {
      g.to = it.date;
      g.ids.push(it.id);
    } else out.push({ ids: [it.id], from: it.date, to: it.date, note: it.note });
  }
  return out;
}

/**
 * Días cerrados del negocio (festivos, vacaciones). Van a `exdates` de Nylas al publicar,
 * así que al añadir o quitar uno se vuelven a publicar solos los servicios.
 */
export default function ClosedDays({ clientId, today, items }: { clientId: string; today: string; items: Item[] }) {
  const groups = useMemo(() => group(items), [items]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const pub = useRepublish();
  const count = from ? daysBetween(from, to || from).length : 0;

  function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await addClosedDays(clientId, { from, to: to || from, note });
      if (!r.ok) return setMsg({ kind: "bad", text: r.error });
      setFrom("");
      setTo("");
      setNote("");
      setMsg({ kind: "ok", text: count === 1 ? "Día cerrado añadido." : `${count} días cerrados añadidos.` });
      await pub.run(r.republish);
    });
  }

  function remove(g: Group) {
    setMsg(null);
    start(async () => {
      const r = await removeClosedDays(clientId, g.ids);
      if (!r.ok) return setMsg({ kind: "bad", text: r.error });
      setMsg({ kind: "ok", text: "Cierre quitado: esos días vuelven a tener horas." });
      await pub.run(r.republish);
    });
  }

  return (
    <section className="card">
      <div className="ch">
        <div>
          <h2>Días cerrados</h2>
          <p>Festivos, vacaciones o un día libre. Al guardar se vuelven a publicar los servicios.</p>
        </div>
      </div>
      <div className="cb">
        <div className="closed">
          {groups.length === 0 && <p className="empty">No hay días cerrados próximos.</p>}
          {groups.map((g) => {
            const n = g.ids.length;
            return (
              <div className="it" key={g.ids[0]}>
                <span className="calx">
                  <b>{calendarDay(g.from, { day: "numeric" })}</b>
                  <small>{calendarDay(g.from, { month: "short" })}</small>
                </span>
                <div className="who">
                  <b>{g.note || (n === 1 ? "Día cerrado" : "Días cerrados")}</b>
                  <small>
                    {n === 1
                      ? `${calendarDay(g.from, { weekday: "long" })} · todo el día`
                      : `Del ${calendarDay(g.from, { day: "numeric", month: "short" })} al ${calendarDay(g.to, { day: "numeric", month: "short" })} · ${n} días`}
                  </small>
                </div>
                <button type="button" className="del" aria-label="Quitar este cierre" onClick={() => remove(g)} disabled={pending}>
                  {I.x}
                </button>
              </div>
            );
          })}
        </div>

        <form className="panel form" style={{ marginTop: 14 }} onSubmit={add}>
          <div className="fl">
            <label htmlFor="cd-from">Desde</label>
            <input id="cd-from" type="date" className="inp" required min={today} value={from} onChange={(e) => { setFrom(e.target.value); if (to && e.target.value > to) setTo(""); }} />
          </div>
          <div className="fl">
            <label htmlFor="cd-to">Hasta</label>
            <input id="cd-to" type="date" className="inp" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} placeholder="el mismo día" />
          </div>
          <div className="fl full">
            <label htmlFor="cd-note">Nota (solo la ve tu equipo)</label>
            <input id="cd-note" className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: congreso" maxLength={200} />
            <small>Se cierra el día completo, en la hora local del negocio.</small>
          </div>
          <div className="full foot">
            <button className="btn pri sm" disabled={pending || !from}>
              {I.plus}
              {count > 1 ? `Cerrar ${count} días` : "Añadir"}
            </button>
          </div>
        </form>

        {(msg || pub.running || pub.done.length > 0) && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <RepublishNote running={pub.running} done={pub.done} />
          </div>
        )}
      </div>
    </section>
  );
}
