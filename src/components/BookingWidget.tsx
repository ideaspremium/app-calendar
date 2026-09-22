"use client";
import { useEffect, useRef, useState } from "react";
import { NylasScheduling } from "@nylas/react";
import type { Branding } from "@/lib/types";
import { formatInTimeZone, zoneLabel } from "@/lib/datetime";

type Props = {
  configurationId: string;
  schedulerApiUrl: string;
  branding: Branding;
  locale: string;
  /**
   * Zona del negocio. NO es la zona en la que se muestran los huecos: solo es el
   * respaldo para cuando no se puede averiguar la del visitante, y el segundo
   * horario que se enseña al confirmar. Antes se usaba como zona de partida, y
   * eso hacía que alguien de viaje viera las horas del negocio creyendo que eran
   * las suyas.
   */
  businessTimezone: string;
  rescheduleBookingRef?: string;
  cancelBookingRef?: string;
};

/** Una zona IANA que el navegador no reconozca hace que Nylas lo calcule todo en UTC. */
function isValidTimezone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function detectTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(tz) ? tz : null;
  } catch {
    return null;
  }
}

type Slot = { start: Date; end: Date };

export default function BookingWidget({
  configurationId, schedulerApiUrl, branding, locale, businessTimezone,
  rescheduleBookingRef, cancelBookingRef,
}: Props) {
  // La zona del visitante solo se puede saber en el navegador. El componente lee
  // `defaultSchedulerState` una única vez al montarse, así que hay que esperar a
  // tenerla antes de pintarlo: si se monta con la del negocio, ya no se corrige.
  const [guestTimezone, setGuestTimezone] = useState<string | null>(null);
  const [booked, setBooked] = useState<Slot | null>(null);
  // El hueco elegido se guarda en una ref porque llega por eventos del componente
  // antes de que se confirme la reserva.
  const slot = useRef<Slot | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGuestTimezone(detectTimezone() ?? businessTimezone);
  }, [businessTimezone]);

  // Escuchamos los eventos en el contenedor en vez de sustituirlos con
  // `eventOverrides`: así, si alguno dejara de emitirse, lo único que pasa es que
  // no se enseña el resumen de horas; la reserva sigue funcionando igual.
  useEffect(() => {
    const el = box.current;
    if (!el) return;

    const readSlot = (detail: unknown): Slot | null => {
      const d = detail as Record<string, unknown> | null;
      if (!d) return null;
      const start = d.start_time ?? d.startTime;
      const end = d.end_time ?? d.endTime;
      if (!start || !end) return null;
      const s = new Date(start as string | number | Date);
      const e = new Date(end as string | number | Date);
      return Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) ? null : { start: s, end: e };
    };

    const onSlot = (e: Event) => {
      const found = readSlot((e as CustomEvent).detail);
      if (found) slot.current = found;
    };
    const onTimezone = (e: Event) => {
      const tz = (e as CustomEvent).detail;
      if (typeof tz === "string" && isValidTimezone(tz)) setGuestTimezone(tz);
    };

    el.addEventListener("timeslotSelected", onSlot);
    el.addEventListener("detailsConfirmed", onSlot);
    el.addEventListener("timezoneChanged", onTimezone);
    return () => {
      el.removeEventListener("timeslotSelected", onSlot);
      el.removeEventListener("detailsConfirmed", onSlot);
      el.removeEventListener("timezoneChanged", onTimezone);
    };
    // Depende de `guestTimezone` a propósito: mientras no se resuelve, lo que hay
    // montado es el placeholder, que no lleva el ref. Con dependencias vacías el
    // efecto se ejecutaba una sola vez, encontraba el ref vacío y no volvía nunca.
  }, [guestTimezone]);

  const primary = branding.primary_color ?? "#2563eb";
  const style = {
    "--nylas-primary": primary,
    "--nylas-base-0": branding.background ?? "#ffffff",
    "--nylas-base-900": branding.text_color ?? "#17181c",
    "--nylas-font-family": branding.font_family ?? "inherit",
    "--nylas-border-radius": branding.radius ?? "8px",
    "--nylas-border-radius-2x": branding.radius ? `calc(${branding.radius} * 2)` : "16px",
  } as React.CSSProperties;

  // Mientras no sepamos la zona del visitante no montamos el componente.
  if (!guestTimezone) {
    return <div style={style} className="w-full min-h-[24rem] animate-pulse rounded-lg bg-black/5" />;
  }

  const differentZones = guestTimezone !== businessTimezone;
  // Con husos lejanos la cita puede caer en días distintos según la zona (22:00 en
  // Madrid son las 4:00 del día siguiente en Hong Kong). Si pasa, hay que repetir la
  // fecha en la nota o parece que la agencia la tiene otro día.
  const sameCalendarDay =
    !!booked &&
    formatInTimeZone(booked.start, guestTimezone, { dateStyle: "short" }, locale) ===
      formatInTimeZone(booked.start, businessTimezone, { dateStyle: "short" }, locale);

  return (
    <div style={style} className="w-full" ref={box}>
      {/* La tarjeta de Nylas ya da la fecha y la hora en grande y en la zona del
          invitado, así que aquí solo falta la equivalencia en la del negocio.
          Repetir la fecha arriba haría que la página dijera «confirmada» dos veces
          con la misma hora dos veces, que es justo la confusión que se quería evitar. */}
      {booked && differentZones && (
        <div className="mb-3 rounded-md border border-black/10 bg-black/[0.04] px-3 py-2 text-xs opacity-80">
          La misma cita en la zona de la agencia:{" "}
          <span className="font-medium tabular-nums">
            {sameCalendarDay
              ? formatInTimeZone(booked.start, businessTimezone, { timeStyle: "short" }, locale)
              : formatInTimeZone(
                  booked.start,
                  businessTimezone,
                  { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" },
                  locale
                )}
          </span>{" "}
          · {zoneLabel(businessTimezone, booked.start, locale)}
        </div>
      )}

      {!booked && differentZones && (
        <p className="mb-3 text-xs opacity-70">
          Horarios en tu zona: {zoneLabel(guestTimezone, new Date(), locale)}. Si vas a estar en otro sitio
          ese día, cámbiala antes de elegir hueco.
        </p>
      )}

      <NylasScheduling
        configurationId={configurationId}
        schedulerApiUrl={schedulerApiUrl}
        mode="app"
        nylasBranding={false}
        rescheduleBookingRef={rescheduleBookingRef}
        cancelBookingRef={cancelBookingRef}
        defaultSchedulerState={{ selectedLanguage: locale, selectedTimezone: guestTimezone } as never}
        eventOverrides={{
          bookedEventInfo: async (e) => {
            if (slot.current) setBooked(slot.current);
            // Avisa a la página padre (embed) para analítica o redirección
            window.parent?.postMessage({ type: "premium-calendar:booked", detail: e.detail }, "*");
          },
        }}
      />
    </div>
  );
}
