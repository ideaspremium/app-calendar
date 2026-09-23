"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  allZones, cityName, genericName, longOffset, normalize, offsetMinutes, TOP_GROUPS, zoneLabelL, type Lang,
} from "@/lib/zones";
import { T } from "@/lib/public-texts";
import { Icon } from "./icons";

type Option = { tz: string; name: string; sub: string; search: string };

/**
 * Selector de zona para quien reserva. Muestra arriba su zona detectada, luego España y
 * EE. UU., y después la lista completa de `Intl` ordenada por desfase. Busca sin tildes
 * por ciudad, por el nombre de la zona en el idioma elegido («oriental», «Japón») y por
 * el identificador IANA.
 */
export default function ZonePicker({
  value, detected, lang, onChange,
}: { value: string; detected: string | null; lang: Lang; onChange: (tz: string) => void }) {
  const t = T[lang];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const groups = useMemo(() => {
    const now = new Date();
    const make = (tz: string, name: string, note?: string): Option => {
      const gen = genericName(tz, lang, now);
      const sub = [note, gen].filter(Boolean).join(" · ");
      return { tz, name, sub, search: normalize(`${name} ${sub} ${tz.replace(/_/g, " ")} ${cityName(tz, "en")}`) };
    };
    const mine = detected ? [make(detected, cityName(detected, lang))] : [];
    const top = TOP_GROUPS.map((g) => ({
      label: g.label[lang],
      options: g.zones.map((z) => make(z.tz, cityName(z.tz, lang), z.note[lang])),
    }));
    const rest = allZones()
      .map((tz) => make(tz, cityName(tz, lang), tz))
      .sort((a, b) => offsetMinutes(a.tz, now) - offsetMinutes(b.tz, now) || a.name.localeCompare(b.name, lang));
    return { mine, top, rest };
  }, [lang, detected]);

  const nq = normalize(q.trim());
  const match = (o: Option) => !nq || o.search.includes(nq);
  const sections = [
    { label: t.zoneGroupMine, options: groups.mine.filter(match) },
    ...groups.top.map((g) => ({ label: g.label, options: g.options.filter(match) })),
    { label: t.allZones(groups.rest.filter(match).length), options: groups.rest.filter(match) },
  ].filter((s) => s.options.length);
  const flat = sections.flatMap((s) => s.options);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    input.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => setActive(0), [q]);

  const choose = (tz: string) => {
    setOpen(false);
    setQ("");
    if (tz !== value) onChange(tz);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      choose(flat[active].tz);
    }
  };

  let index = -1;
  return (
    <div className="pc-zwrap" ref={root}>
      <button
        type="button"
        className="pc-zbtn pc-g2"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pc-ic">{Icon.globe}</span>
        <span className="pc-grow">{zoneLabelL(value, lang)}</span>
        <span className="pc-chev">{Icon.down}</span>
      </button>
      {open && (
        <div className="pc-zp" onKeyDown={onKey}>
          <div className="pc-zsearch pc-g2">
            {Icon.search}
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.searchZone}
              aria-controls={listId}
              aria-label={t.searchZone}
            />
          </div>
          <div className="pc-zlist" id={listId} role="listbox" aria-label={t.yourZone}>
            {sections.length === 0 && <div className="pc-zgroup">{t.noResults}</div>}
            {sections.map((s) => (
              <div key={s.label} role="group" aria-label={s.label}>
                <div className="pc-zgroup">{s.label}</div>
                {s.options.map((o) => {
                  index += 1;
                  const i = index;
                  return (
                    <div
                      key={`${s.label}-${o.tz}`}
                      role="option"
                      aria-selected={o.tz === value}
                      className={`pc-zopt${i === active ? " is-active" : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o.tz)}
                      ref={(el) => {
                        if (el && i === active) el.scrollIntoView({ block: "nearest" });
                      }}
                    >
                      <span className="pc-zoff">({longOffset(o.tz)})</span>
                      <span className="pc-zname">
                        {o.name}
                        <small>{o.sub}</small>
                      </span>
                      {o.tz === value && <span className="pc-zok">✓</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
