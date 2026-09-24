import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import ClientFrame, { publicTheme } from "@/components/ClientFrame";
import BookingShell from "./BookingShell";
import { keepAttributionParams } from "@/lib/attribution-params";
import { NYLAS_SCHEDULER_API_URL } from "@/lib/nylas";
import { asLang } from "@/lib/public-texts";
import { getBookingForRef, getPublicClient, getPublicEventType, getPublicEventTypes, resolveBookingRef } from "@/lib/public";

export type BookingSearch = { embed?: string; estilo?: string; lang?: string; [param: string]: string | string[] | undefined };

/**
 * Las tres páginas de reserva (reservar, cambiar, cancelar) comparten todo menos el modo.
 * `?estilo=clasico|vidrio` enseña el otro estilo sin guardarlo (para enseñárselo a un
 * cliente) y `?lang=es|en` abre en otro idioma.
 */
export default async function BookingPage({
  slug, event, search, mode, bookingRef,
}: {
  slug: string;
  event: string;
  search: BookingSearch;
  mode: "book" | "reschedule" | "cancel";
  bookingRef?: string;
}) {
  const host = (await headers()).get("host");
  const client = await getPublicClient(slug, host);
  const et = client ? await getPublicEventType(client.id, event) : null;
  if (!client || !et?.nylas_configuration_id) {
    // Enlaces de cancelar/reprogramar enviados antes de renombrar el negocio o el
    // servicio: la referencia de la cita dice cuál es, así que se lleva a su dirección actual.
    if (bookingRef && mode !== "book") {
      const target = await resolveBookingRef(bookingRef);
      if (target && (target.clientSlug !== slug || target.eventSlug !== event)) {
        const keepQs = new URLSearchParams();
        for (const [k, v] of Object.entries(search)) if (typeof v === "string") keepQs.set(k, v);
        const q = keepQs.toString();
        redirect(`/${target.clientSlug}/${target.eventSlug}/${mode}/${target.ref}${q ? `?${q}` : ""}`);
      }
    }
    notFound();
  }

  const embedded = search.embed === "1";
  const theme = publicTheme(client.branding, search.estilo);
  const [services, current] = await Promise.all([
    mode === "book" ? getPublicEventTypes(client.id) : Promise.resolve([]),
    bookingRef ? getBookingForRef(client.id, bookingRef) : Promise.resolve(null),
  ]);
  const keep = new URLSearchParams();
  if (embedded) keep.set("embed", "1");
  if (search.estilo) keep.set("estilo", search.estilo);
  if (search.lang) keep.set("lang", search.lang);
  keepAttributionParams(search, keep);
  const qs = keep.toString() ? `?${keep}` : "";

  return (
    <ClientFrame branding={client.branding} name={client.name} embedded={embedded} theme={theme} bare>
      <BookingShell
        client={{ name: client.name, logoUrl: client.branding.logo_url ?? null, timezone: client.timezone }}
        event={{
          name: et.name,
          durationMinutes: et.duration_minutes,
          locationType: et.location_type,
          locationDetails: et.location_details,
          description: et.description,
        }}
        mode={mode}
        current={current}
        backHref={services.length > 1 ? `/${client.slug}${qs}` : null}
        initialLang={asLang(search.lang ?? client.locale)}
        nylas={{
          configurationId: et.nylas_configuration_id,
          schedulerApiUrl: NYLAS_SCHEDULER_API_URL,
          themeConfig: theme.nylas,
          rescheduleBookingRef: mode === "reschedule" ? bookingRef : undefined,
          cancelBookingRef: mode === "cancel" ? bookingRef : undefined,
        }}
      />
    </ClientFrame>
  );
}
