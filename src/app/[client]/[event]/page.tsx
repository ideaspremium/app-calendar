import BookingPage, { type BookingSearch } from "@/components/public/BookingPage";

export default async function EventPage({
  params, searchParams,
}: { params: Promise<{ client: string; event: string }>; searchParams: Promise<BookingSearch> }) {
  const { client, event } = await params;
  return <BookingPage slug={client} event={event} search={await searchParams} mode="book" />;
}
