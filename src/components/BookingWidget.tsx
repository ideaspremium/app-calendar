"use client";
import { useEffect, useRef } from "react";
import { NylasScheduling } from "@nylas/react";
import { NYLAS_TEXTS } from "@/lib/public-texts";
import type { Lang } from "@/lib/zones";

export type Slot = { start: Date; end: Date };

type Props = {
  configurationId: string;
  schedulerApiUrl: string;
  /** Zona en la que se muestran los huecos: la del visitante. Solo se lee al montar. */
  timezone: string;
  language: Lang;
  /** Colores, radios y tipografía por la vía oficial de Nylas (`themeConfig`). */
  themeConfig: Record<string, string>;
  rescheduleBookingRef?: string;
  cancelBookingRef?: string;
  onSlot?: (slot: Slot) => void;
  /** `bookingId` es el id de reserva de Nylas (sirve para asociarle la atribución). */
  onBooked?: (slot: Slot | null, bookingId: string | null) => void;
  onTimezone?: (tz: string) => void;
};

/** Las horas llegan sueltas, en camelCase o dentro de `timeslot`, según el evento. */
function readSlot(detail: unknown): Slot | null {
  const d = detail as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  const src = (d.timeslot as Record<string, unknown>) ?? d;
  const start = src.start_time ?? src.startTime;
  const end = src.end_time ?? src.endTime;
  if (!start || !end) return null;
  const s = new Date(start as string | number | Date);
  const e = new Date(end as string | number | Date);
  return Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) ? null : { start: s, end: e };
}

/**
 * Estilos que no se pueden poner desde fuera porque esas piezas no tienen `part`:
 * la barra de zona e idioma de Nylas (la sustituye nuestro selector), el pie vacío que
 * queda sin la marca de Nylas, el aviso de «elige otra hora» y la altura de los paneles
 * del calendario. No es una vía oficial: si Nylas cambia su estructura, estas reglas
 * dejan de aplicarse y se ve su diseño por defecto, pero la reserva sigue funcionando.
 */
const SHADOW_CSS = `
nylas-locale-switch { display: none !important; }
.footer { display: none !important; }
.message-banner { text-align: left; margin: 0; padding: 12px 20px; font-size: 14px; color: var(--nylas-base-800);
  background: var(--pc-banner-bg, transparent); border-bottom: 1px solid var(--nylas-base-200); }
@media (min-width: 769px) {
  .select-date-page .left-panel, .select-date-page .right-panel { height: var(--pc-panel-h, 560px); }
}
@media (max-width: 768px) {
  .select-date-page .left-panel { height: auto; }
}
`;

function injectShadowStyles(host: Element | null): boolean {
  const root = (host as HTMLElement | null)?.shadowRoot;
  if (!root) return false;
  try {
    const marker = "__pcStyles";
    const r = root as ShadowRoot & { [marker]?: CSSStyleSheet };
    if (r[marker]) {
      if (!root.adoptedStyleSheets.includes(r[marker]!)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, r[marker]!];
      return true;
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(SHADOW_CSS);
    r[marker] = sheet;
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    return true;
  } catch {
    return false;
  }
}

/**
 * Envoltorio del componente de reserva de Nylas.
 *
 * Los eventos se escuchan en el contenedor con addEventListener y no con
 * `eventOverrides`: así, si Nylas cambia alguno, se pierde como mucho la nota con la
 * hora del negocio, pero la reserva sigue funcionando. `bookedEventInfo` además solo
 * llega por aquí (lo emite el componente padre y burbujea).
 */
export default function BookingWidget({
  configurationId, schedulerApiUrl, timezone, language, themeConfig,
  rescheduleBookingRef, cancelBookingRef, onSlot, onBooked, onTimezone,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const slot = useRef<Slot | null>(null);
  const handlers = useRef({ onSlot, onBooked, onTimezone });
  handlers.current = { onSlot, onBooked, onTimezone };

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    const takeSlot = (e: Event) => {
      const found = readSlot((e as CustomEvent).detail);
      if (!found) return;
      slot.current = found;
      handlers.current.onSlot?.(found);
    };
    const onTz = (e: Event) => {
      const tz = (e as CustomEvent).detail;
      if (typeof tz === "string") handlers.current.onTimezone?.(tz);
    };
    const onBookedEv = (e: Event) => {
      const detail = (e as CustomEvent).detail as { data?: { booking_id?: unknown } } | null;
      const bookingId = typeof detail?.data?.booking_id === "string" ? detail.data.booking_id : null;
      handlers.current.onBooked?.(slot.current, bookingId);
      // Aviso a la página que embebe (analítica o redirección).
      try {
        window.parent?.postMessage({ type: "premium-calendar:booked", detail: (e as CustomEvent).detail ?? null }, "*");
      } catch {
        /* el detalle no siempre se puede clonar: no es imprescindible */
      }
    };
    // En el móvil las horas salen debajo del calendario: al elegir día, se baja hasta ellas.
    const onDate = () => {
      if (!window.matchMedia("(max-width: 768px)").matches) return;
      window.setTimeout(() => {
        const host = el.querySelector("nylas-scheduling") as HTMLElement | null;
        host?.shadowRoot?.querySelector(".right-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    };

    el.addEventListener("timeslotSelected", takeSlot);
    el.addEventListener("timeslotConfirmed", takeSlot);
    el.addEventListener("detailsConfirmed", takeSlot);
    el.addEventListener("timezoneChanged", onTz);
    el.addEventListener("bookedEventInfo", onBookedEv);
    el.addEventListener("dateSelected", onDate);

    // El shadowRoot aparece cuando Stencil termina de cargar el componente. En ese momento
    // se le dice también el idioma: el componente solo lo fija desde su barra de zona e
    // idioma, que está oculta y que en la página de cancelar ni siquiera existe (salía en inglés).
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const host = el.querySelector("nylas-scheduling");
      if (injectShadowStyles(host)) {
        host?.dispatchEvent(new CustomEvent("languageChanged", { detail: language }));
        window.clearInterval(timer);
      } else if (tries > 80) window.clearInterval(timer);
    }, 100);

    return () => {
      window.clearInterval(timer);
      el.removeEventListener("timeslotSelected", takeSlot);
      el.removeEventListener("timeslotConfirmed", takeSlot);
      el.removeEventListener("detailsConfirmed", takeSlot);
      el.removeEventListener("timezoneChanged", onTz);
      el.removeEventListener("bookedEventInfo", onBookedEv);
      el.removeEventListener("dateSelected", onDate);
    };
    // El componente se vuelve a montar (key) al cambiar de zona o idioma: no hace falta
    // repetir esto con cada cambio de `language`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={box} className="pc-nylas">
      <NylasScheduling
        configurationId={configurationId}
        schedulerApiUrl={schedulerApiUrl}
        mode="app"
        nylasBranding={false}
        enableUserFeedback={false}
        rescheduleBookingRef={rescheduleBookingRef}
        cancelBookingRef={cancelBookingRef}
        themeConfig={themeConfig as never}
        localization={NYLAS_TEXTS as never}
        defaultSchedulerState={{ selectedLanguage: language, selectedTimezone: timezone } as never}
      />
    </div>
  );
}
