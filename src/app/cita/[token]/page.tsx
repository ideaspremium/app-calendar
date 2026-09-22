import { notFound } from "next/navigation";
import ClientFrame from "@/components/ClientFrame";
import { formatInTimeZone, zoneLabel } from "@/lib/datetime";
import { bookingByToken } from "@/lib/manage";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/** Página de gestión de una cita: la hora en la zona del visitante y los dos botones. */
export default async function ManageBooking({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await bookingByToken(token);
  if (!found) notFound();
  const { booking, client, service } = found;
  const tz = booking.invitee_timezone || client.timezone;
  const start = new Date(booking.start_at);
  const locale = client.locale || "es";
  const cancelled = booking.status === "cancelled";
  const past = start.getTime() <= Date.now();
  const canManage = !cancelled && !past && !!booking.nylas_booking_id && !!service?.nylas_configuration_id;

  return (
    <ClientFrame branding={client.branding} name={client.name} embedded={false}>
      <div className="space-y-6 p-6">
        <div>
          <p className="text-sm opacity-70">{service?.name ?? "Cita"}</p>
          <h1 className="text-2xl font-semibold capitalize">
            {formatInTimeZone(start, tz, { dateStyle: "full", timeStyle: "short" }, locale)}
          </h1>
          <p className="text-sm opacity-70">{zoneLabel(tz, start, locale)}</p>
        </div>
        {cancelled && <p className="rounded-lg bg-neutral-100 p-3 text-sm">Esta cita está cancelada.</p>}
        {!cancelled && past && <p className="rounded-lg bg-neutral-100 p-3 text-sm">Esta cita ya ha pasado.</p>}
        {canManage && (
          <div className="flex flex-wrap gap-3">
            <a
              href={`/cita/${token}/reprogramar`}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--brand)" }}
            >
              Cambiar fecha u hora
            </a>
            <a href={`/cita/${token}/cancelar`} className="rounded-lg border px-4 py-2 text-sm">
              Cancelar cita
            </a>
          </div>
        )}
      </div>
    </ClientFrame>
  );
}
