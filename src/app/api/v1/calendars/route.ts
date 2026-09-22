import { authenticate } from "@/lib/api/auth";
import { listCalendars, serializeCalendar } from "@/lib/api/calendars";
import { handler, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** Calendarios que ve la clave, con sus servicios. Sirve para dar de alta un cliente en el chatbot. */
export const GET = handler<Record<string, never>>(async (req, ctx) => {
  const key = await authenticate(req);
  const calendars = await listCalendars(key);
  return json(ctx, { data: calendars.map(serializeCalendar) });
});
