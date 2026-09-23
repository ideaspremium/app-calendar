import BookingPage, { type BookingSearch } from "@/components/public/BookingPage";

export const metadata = { robots: { index: false } };

export default async function CancelPage({
  params, searchParams,
}: { params: Promise<{ client: string; event: string; ref: string }>; searchParams: Promise<BookingSearch> }) {
  const { client, event, ref } = await params;
  return <BookingPage slug={client} event={event} search={await searchParams} mode="cancel" bookingRef={ref} />;
}
