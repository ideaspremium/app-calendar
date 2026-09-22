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
  }, []);

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

  return (
    <div style={style} className="w-full" ref={box}>
      {booked && (
        <div className="mb-4 rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 text-sm">
          <p className="font-medium">Cita confirmada</p>
          <p className="mt-1">
            {formatInTimeZone(booked.start, guestTimezone, { dateStyle: "full", timeStyle: "short" }, locale)}
            {" · "}
            <span className="opacity-70">tu hora, {zoneLabel(guestTimezone, booked.start, locale)}</span>
          </p>
          {differentZones && (
            <p className="mt-0.5">
              {formatInTimeZone(booked.start, businessTimezone, { dateStyle: "full", timeStyle: "short" }, locale)}
              {" · "}
              <span className="opacity-70">hora de {zoneLabel(businessTimezone, booked.start, locale)}</span>
            </p>
          )}
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
