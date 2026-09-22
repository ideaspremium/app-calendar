import { authenticate } from "@/lib/api/auth";
import { loadCalendar, serializeCalendar } from "@/lib/api/calendars";
import { handler, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = handler<{ calendarId: string }>(async (req, ctx, { calendarId }) => {
  const key = await authenticate(req);
  const cal = await loadCalendar(key, calendarId);
  return json(ctx, serializeCalendar(cal));
});
