"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveAvailability } from "@/app/admin/actions";
import { I } from "../icons";
import { Notice, RepublishNote, Switch, useRepublish } from "../ui";

type Range = { start: string; end: string };
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Horas de 15 en 15 en formato de 24 h (el campo nativo de hora sale en 12 h en navegadores en inglés y se corta). */
const STEPS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`).concat("23:59");

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const list = STEPS.includes(value) ? STEPS : [...STEPS, value].sort();
  return (
    <select className="tsel" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {list.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

const plus = (t: string, min: number) => {
  const [h, m] = t.split(":").map(Number);
  const x = Math.min(23 * 60 + 45, h * 60 + m + min);
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

/**
 * Horario semanal en la hora local del negocio (hora de reloj, sin zona: así sigue
 * valiendo con el cambio de hora). Cada día puede tener varios tramos.
 */
export default function HoursEditor({ clientId, zoneLabel, initial }: { clientId: string; zoneLabel: string; initial: { weekday: number; start: string; end: string }[] }) {
  const [week, setWeek] = useState<Range[][]>(() => {
    const w: Range[][] = [[], [], [], [], [], [], []];
    for (const r of initial) w[r.weekday].push({ start: r.start, end: r.end });
    return w;
  });
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const pub = useRepublish();
  const router = useRouter();

  const edit = (d: number, fn: (r: Range[]) => Range[]) => {
    setDirty(true);
    setMsg(null);
    setWeek((w) => w.map((r, i) => (i === d ? fn(r) : r)));
  };

  function save() {
    setMsg(null);
    start(async () => {
      const ranges = week.flatMap((rs, weekday) => rs.map((r) => ({ weekday, ...r })));
      const r = await saveAvailability(clientId, ranges);
      if (!r.ok) return setMsg({ kind: "bad", text: r.error });
      setDirty(false);
      setMsg({ kind: "ok", text: r.republish.length ? "Horario guardado. Los servicios publicados se actualizan con el horario nuevo." : "Horario guardado." });
      router.refresh();
      await pub.run(r.republish);
    });
  }

  return (
    <section className="card">
      <div className="ch">
        <div>
          <h2>Horario de atención</h2>
          <p>Horas de {zoneLabel}, la zona del negocio.</p>
        </div>
        <button type="button" className="btn pri sm" onClick={save} disabled={pending || pub.running}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <div className="cb">
        <div className="week">
          {ORDER.map((d) => {
            const rs = week[d];
            return (
              <div className="d" key={d}>
                <Switch
                  checked={rs.length > 0}
                  label={`Abierto el ${DAYS[d].toLowerCase()}`}
                  onChange={(on) => edit(d, () => (on ? [{ start: "09:00", end: "14:00" }] : []))}
                />
                <span className="dn">{DAYS[d]}</span>
                <div className="rg">
                  {rs.length === 0 && <span className="closedd">Cerrado</span>}
                  {rs.map((r, i) => (
                    <span className={`chip${r.end <= r.start ? " bad" : ""}`} key={i}>
                      <TimeSelect value={r.start} label={`${DAYS[d]}, tramo ${i + 1}, desde`}
                        onChange={(t) => edit(d, (x) => x.map((y, j) => (j === i ? { ...y, start: t } : y)))} />
                      –
                      <TimeSelect value={r.end} label={`${DAYS[d]}, tramo ${i + 1}, hasta`}
                        onChange={(t) => edit(d, (x) => x.map((y, j) => (j === i ? { ...y, end: t } : y)))} />
                      <button type="button" className="del" aria-label="Quitar este tramo" onClick={() => edit(d, (x) => x.filter((_, j) => j !== i))}>
                        {I.x}
                      </button>
                    </span>
                  ))}
                  {rs.length > 0 && rs.length < 4 && (
                    <button type="button" className="add" onClick={() => edit(d, (x) => {
                      const last = x[x.length - 1];
                      const s = plus(last.end, 60);
                      return [...x, { start: s, end: plus(s, 180) }];
                    })}>
                      + tramo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {(msg || pub.running || pub.done.length > 0 || dirty) && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <RepublishNote running={pub.running} done={pub.done} />
            {dirty && !msg && <span className="small">Hay cambios sin guardar.</span>}
          </div>
        )}
      </div>
    </section>
  );
}
