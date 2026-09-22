import { headers } from "next/headers";
import { notFound } from "next/navigation";
import BookingWidget from "@/components/BookingWidget";
import ClientFrame from "@/components/ClientFrame";
import { NYLAS_SCHEDULER_API_URL } from "@/lib/nylas";
import { getPublicClient, getPublicEventType } from "@/lib/public";

export default async function Page({ params }: { params: Promise<{ client: string; event: string; ref: string }> }) {
  const { client: slug, event, ref } = await params;
  const host = (await headers()).get("host");
  const client = await getPublicClient(slug, host);
  if (!client) notFound();
  const et = await getPublicEventType(client.id, event);
  if (!et?.nylas_configuration_id) notFound();
  return (
    <ClientFrame branding={client.branding} name={client.name} embedded={false}>
      <BookingWidget
        configurationId={et.nylas_configuration_id}
        schedulerApiUrl={NYLAS_SCHEDULER_API_URL}
        branding={client.branding}
        locale={client.locale}
        businessTimezone={client.timezone}
        cancelBookingRef={ref}
      />
    </ClientFrame>
  );
}
