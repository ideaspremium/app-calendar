import { NylasApiError, schedulerAvailability } from "@/lib/nylas";
import type { EventType } from "@/lib/types";
import { bookingTarget, bookingWindow, isBlocked, professionalOf, type CalendarCtx } from "./calendars";
import { ApiError } from "./http";
import { DAY_MS, toIsoInZone } from "./time";

export type Slot = { start: Date; end: Date; professionalIds: string[] };

/** Tamaño máximo de cada consulta a Nylas: la página pública pide un mes cada vez. */
const MAX_CHUNK_MS = 31 * DAY_MS;

function providerError(e: unknown): never {
  if (e instanceof NylasApiError) {
    console.error("[api] Nylas availability:", e.message);
    throw new ApiError("provider_error", "El proveedor de calendario no respondió. Reintenta en unos segundos.", {
      retryable: true,
      retryAfterSeconds: 2,
    });
  }
  throw e;
}

/**
 * Huecos reservables del servicio entre `from` y `to`, ya recortados a la ventana de
 * reserva (antelación mínima y horizonte) y sin los cierres del calendario.
 * Con `limit`, consulta por tramos crecientes y para en cuanto tiene bastantes: pedir
 * «los tres primeros» no barre los 60 días.
 */
export async function findSlots(
  ctx: CalendarCtx,
  s: EventType,
  opts: { from: Date; to: Date; limit?: number; excludeBookingId?: string | null; now?: Date }
): Promise<{ slots: Slot[]; window: { earliest: Date; latest: Date }; searched: { from: Date; to: Date } | null }> {
  const { configurationId, connection } = bookingTarget(ctx, s);
  const window = bookingWindow(s, opts.now);
  const from = new Date(Math.max(opts.from.getTime(), window.earliest.getTime()));
  const to = new Date(Math.min(opts.to.getTime(), window.latest.getTime()));
  if (from >= to) return { slots: [], window, searched: null };

  const emailToConn = new Map(ctx.connections.map((c) => [c.account_email.toLowerCase(), c.id]));
  const collect = (raw: Awaited<ReturnType<typeof schedulerAvailability>>): Slot[] =>
    raw
      .map((t) => ({
        start: new Date(t.start_time * 1000),
        end: new Date(t.end_time * 1000),
        professionalIds: [
          ...new Set((t.emails ?? []).map((e) => emailToConn.get(e.toLowerCase())).filter((x): x is string => !!x)),
        ],
      }))
      .map((x) => (x.professionalIds.length ? x : { ...x, professionalIds: [connection.id] }))
      .filter((x) => x.start >= from && x.end <= to && !isBlocked(ctx, s, x.start, x.end));

  const fetchRange = (a: Date, b: Date) =>
    schedulerAvailability(configurationId, a.getTime() / 1000, b.getTime() / 1000, {
      bookingId: opts.excludeBookingId ?? undefined,
    }).then(collect, providerError);

  let slots: Slot[] = [];
  let searchedTo = from;
  if (opts.limit) {
    // 7 días, luego hasta un mes, luego de mes en mes.
    const steps = [7 * DAY_MS, 24 * DAY_MS];
    let cursor = from;
    let i = 0;
    while (cursor < to && slots.length < opts.limit) {
      const size = steps[i++] ?? MAX_CHUNK_MS;
      const end = new Date(Math.min(cursor.getTime() + size, to.getTime()));
      slots = slots.concat(await fetchRange(cursor, end));
      searchedTo = end;
      cursor = end;
    }
  } else {
    const ranges: [Date, Date][] = [];
    for (let a = from.getTime(); a < to.getTime(); a += MAX_CHUNK_MS) {
      ranges.push([new Date(a), new Date(Math.min(a + MAX_CHUNK_MS, to.getTime()))]);
    }
    slots = (await Promise.all(ranges.map(([a, b]) => fetchRange(a, b)))).flat();
    searchedTo = to;
  }

  const seen = new Set<number>();
  slots = slots
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .filter((x) => (seen.has(x.start.getTime()) ? false : (seen.add(x.start.getTime()), true)));
  if (opts.limit) slots = slots.slice(0, opts.limit);
  return { slots, window, searched: { from, to: searchedTo } };
}

/** Formato público de un hueco, con las horas en la zona pedida. */
export function serializeSlot(ctx: CalendarCtx, slot: Slot, tz: string) {
  return {
    start: toIsoInZone(slot.start, tz),
    end: toIsoInZone(slot.end, tz),
    professionals: slot.professionalIds
      .map((id) => professionalOf(ctx, ctx.connections.find((c) => c.id === id) ?? null))
      .filter(Boolean),
  };
}

/** Los `n` huecos más cercanos a la hora pedida, en orden cronológico. Para «tengo estos otros». */
export function nearest(slots: Slot[], target: Date, n = 3, exclude?: Date) {
  return slots
    .filter((x) => !exclude || x.start.getTime() !== exclude.getTime())
    .map((x) => ({ x, d: Math.abs(x.start.getTime() - target.getTime()) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(({ x }) => x)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
