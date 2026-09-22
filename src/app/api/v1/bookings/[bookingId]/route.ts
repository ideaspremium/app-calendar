import { authenticate } from "@/lib/api/auth";
import { loadBooking, serializeBooking } from "@/lib/api/bookings";
import { handler, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = handler<{ bookingId: string }>(async (req, ctx, { bookingId }) => {
  const key = await authenticate(req);
  const { row, ctx: cal } = await loadBooking(key, bookingId);
  return json(ctx, serializeBooking(cal, row));
});
