"use client";
import { useEffect, useState } from "react";
import BookingWidget, { type Slot } from "@/components/BookingWidget";
import ZonePicker from "./ZonePicker";
import { Icon, locationIcon } from "./icons";
import { formatInTimeZone } from "@/lib/datetime";
import { T } from "@/lib/public-texts";
import { isValidZone, zoneLabelL, type Lang } from "@/lib/zones";

export type ShellProps = {
  client: { name: string; logoUrl: string | null; timezone: string };
  event: {
    name: string;
    durationMinutes: number;
    locationType: string;
    locationDetails: string | null;
    description: string | null;
  };
  mode: "book" | "reschedule" | "cancel";
  /** Cita actual, en las páginas de cambiar y cancelar. */
  current?: { start: string; end: string } | null;
  backHref?: string | null;
  initialLang: Lang;
  nylas: {
    configurationId: string;
    schedulerApiUrl: string;
    themeConfig: Record<string, string>;
    rescheduleBookingRef?: string;
    cancelBookingRef?: string;
  };
};

function detectTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/**
 * La tarjeta de reserva: columna con qué se reserva y en qué zona, y el componente de Nylas.
 *
 * La zona del visitante solo se puede saber en el navegador, y el componente lee
 * `defaultSchedulerState` una única vez al montarse: por eso no se monta hasta tenerla.
 * Si la persona elige otra zona o idioma, el componente se vuelve a montar (key).
 */
export default function BookingShell({ client, event, mode, current, backHref, initialLang, nylas }: ShellProps) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [detected, setDetected] = useState<string | null>(null);
  const [mountTz, setMountTz] = useState<string | null>(null);
  const [shownTz, setShownTz] = useState<string | null>(null);
  const [chosen, setChosen] = useState(false);
  const [booked, setBooked] = useState<Slot | null>(null);
  const t = T[lang];

  useEffect(() => {
    const tz = detectTimezone();
    setDetected(tz);
    const start = tz ?? (isValidZone(client.timezone) ? client.timezone : "UTC");
    setMountTz(start);
    setShownTz(start);
  }, [client.timezone]);

  const pickZone = (tz: string) => {
    setChosen(true);
    setMountTz(tz);
    setShownTz(tz);
  };

  const guestTz = shownTz ?? client.timezone;
  const bizTz = client.timezone;
  const differentZones = !!shownTz && isValidZone(bizTz) && shownTz !== bizTz;
  const locationText = event.locationDetails || t.location[event.locationType] || t.location.in_person;

  const sameDay =
    !!booked &&
    formatInTimeZone(booked.start, guestTz, { dateStyle: "short" }, lang) ===
      formatInTimeZone(booked.start, bizTz, { dateStyle: "short" }, lang);

  return (
    <div className="pc-split">
      <aside className="pc-info">
        <div className="pc-info-main">
          {backHref && mode === "book" && !booked && (
            <a className="pc-back pc-g2" href={backHref}>
              <span className="pc-ic">{Icon.left}</span>
              {t.allServices}
            </a>
          )}
          <div className="pc-brandrow">
            <span className="pc-tile pc-g2">
              {client.logoUrl ? (
                <img src={client.logoUrl} alt={client.name} />
              ) : (
                <span className="pc-mono">{initials(client.name)}</span>
              )}
            </span>
            <span className="pc-cname">{client.name}</span>
          </div>
          {mode !== "book" && <div className="pc-eyebrow">{mode === "reschedule" ? t.rescheduleEyebrow : t.cancelEyebrow}</div>}
          <h1 className="pc-ename">{event.name}</h1>
          <div className="pc-chips">
            <span className="pc-chip pc-g2">
              <span className="pc-ic">{Icon.clock}</span>
              {t.minutes(event.durationMinutes)}
            </span>
            <span className="pc-chip pc-g2">
              <span className="pc-ic">{locationIcon(event.locationType)}</span>
              {locationText}
            </span>
          </div>
          {event.description && <p className="pc-desc">{event.description}</p>}
        </div>

        <div className="pc-info-side">
          {current && shownTz && (
            <div className="pc-current">
              <div className="pc-label">{t.currentBooking}</div>
              <div className="pc-current-day">
                {formatInTimeZone(current.start, guestTz, { weekday: "long", day: "numeric", month: "long" }, lang)}
              </div>
              <div className="pc-current-time">
                {formatInTimeZone(current.start, guestTz, { hour: "2-digit", minute: "2-digit" }, lang)} –{" "}
                {formatInTimeZone(current.end, guestTz, { hour: "2-digit", minute: "2-digit" }, lang)} ·{" "}
                {zoneLabelL(guestTz, lang, new Date(current.start))}
              </div>
            </div>
          )}

          {booked ? (
            <div className="pc-booked" role="status">
              <div className="pc-status">
                {Icon.check}
                {t.confirmed}
              </div>
              {differentZones && (
                <div className="pc-note">
                  {t.sameInBiz(client.name)}{" "}
                  <b>
                    {sameDay
                      ? formatInTimeZone(booked.start, bizTz, { timeStyle: "short" }, lang)
                      : formatInTimeZone(
                          booked.start,
                          bizTz,
                          { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" },
                          lang,
                        )}
                  </b>{" "}
                  · {zoneLabelL(bizTz, lang, booked.start)}
                </div>
              )}
            </div>
          ) : (
            mode !== "cancel" &&
            shownTz && (
              <div className="pc-zone">
                <div className="pc-label">{t.yourZone}</div>
                <ZonePicker value={shownTz} detected={detected} lang={lang} onChange={pickZone} />
                <div className="pc-znote">
                  {chosen ? t.chosen : t.detected} {differentZones && t.bizZone(client.name, zoneLabelL(bizTz, lang))}
                </div>
              </div>
            )
          )}

          <div className="pc-lang" role="group" aria-label={t.language}>
            {(["es", "en"] as Lang[]).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} disabled={!!booked}>
                {l === "es" ? "Español" : "English"}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="pc-widget">
        {mountTz ? (
          <BookingWidget
            key={`${mountTz}|${lang}`}
            configurationId={nylas.configurationId}
            schedulerApiUrl={nylas.schedulerApiUrl}
            timezone={mountTz}
            language={lang}
            themeConfig={nylas.themeConfig}
            rescheduleBookingRef={nylas.rescheduleBookingRef}
            cancelBookingRef={nylas.cancelBookingRef}
            onTimezone={(tz) => isValidZone(tz) && setShownTz(tz)}
            onBooked={(s) => s && setBooked(s)}
          />
        ) : (
          <div className="pc-skeleton" aria-hidden="true">
            <div className="pc-sk-cal" />
            <div className="pc-sk-slots">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
