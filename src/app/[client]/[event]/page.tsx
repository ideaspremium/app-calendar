import { headers } from "next/headers";
import { notFound } from "next/navigation";
import BookingWidget from "@/components/BookingWidget";
import ClientFrame from "@/components/ClientFrame";
import { NYLAS_SCHEDULER_API_URL } from "@/lib/nylas";
import { getPublicClient, getPublicEventType } from "@/lib/public";

export default async function EventPage({
  params, searchParams,
}: { params: Promise<{ client: string; event: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { client: slug, event } = await params;
  const { embed } = await searchParams;
  const host = (await headers()).get("host");
  const client = await getPublicClient(slug, host);
  if (!client) notFound();
  const et = await getPublicEventType(client.id, event);
  if (!et?.nylas_configuration_id) notFound();

  return (
    <ClientFrame branding={client.branding} name={client.name} embedded={embed === "1"}>
      <BookingWidget
        configurationId={et.nylas_configuration_id}
        schedulerApiUrl={NYLAS_SCHEDULER_API_URL}
        branding={client.branding}
        locale={client.locale}
        timezone={client.timezone}
      />
    </ClientFrame>
  );
}
