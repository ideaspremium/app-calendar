"use client";
import { NylasScheduling } from "@nylas/react";
import type { Branding } from "@/lib/types";

type Props = {
  configurationId: string;
  schedulerApiUrl: string;
  branding: Branding;
  locale: string;
  timezone: string;
  rescheduleBookingRef?: string;
  cancelBookingRef?: string;
};

export default function BookingWidget({
  configurationId, schedulerApiUrl, branding, locale, timezone, rescheduleBookingRef, cancelBookingRef,
}: Props) {
  const primary = branding.primary_color ?? "#2563eb";
  const style = {
    "--nylas-primary": primary,
    "--nylas-base-0": branding.background ?? "#ffffff",
    "--nylas-base-900": branding.text_color ?? "#17181c",
    "--nylas-font-family": branding.font_family ?? "inherit",
    "--nylas-border-radius": branding.radius ?? "8px",
    "--nylas-border-radius-2x": branding.radius ? `calc(${branding.radius} * 2)` : "16px",
  } as React.CSSProperties;

  return (
    <div style={style} className="w-full">
      <NylasScheduling
        configurationId={configurationId}
        schedulerApiUrl={schedulerApiUrl}
        mode="app"
        nylasBranding={false}
        rescheduleBookingRef={rescheduleBookingRef}
        cancelBookingRef={cancelBookingRef}
        defaultSchedulerState={{ selectedLanguage: locale, selectedTimezone: timezone } as never}
        eventOverrides={{
          bookedEventInfo: async (e) => {
            // Avisa a la página padre (embed) para analítica o redirección
            window.parent?.postMessage({ type: "premium-calendar:booked", detail: e.detail }, "*");
          },
        }}
      />
    </div>
  );
}
