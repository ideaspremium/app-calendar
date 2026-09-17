import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ClientFrame from "@/components/ClientFrame";
import { getPublicClient, getPublicEventTypes } from "@/lib/public";

export default async function ClientPage({
  params, searchParams,
}: { params: Promise<{ client: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { client: slug } = await params;
  const { embed } = await searchParams;
  const host = (await headers()).get("host");
  const client = await getPublicClient(slug, host);
  if (!client) notFound();
  const types = await getPublicEventTypes(client.id);

  return (
    <ClientFrame branding={client.branding} name={client.name} embedded={embed === "1"}>
      <div className="p-6">
        <h1 className="mb-1 text-2xl font-semibold">Reserva tu cita</h1>
        <p className="mb-6 opacity-70">Elige el tipo de cita para ver los horarios disponibles.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {types.map((t) => (
            <li key={t.id}>
              <Link
                href={`/${client.slug}/${t.slug}${embed === "1" ? "?embed=1" : ""}`}
                className="block rounded-xl border p-4 transition hover:shadow-sm"
                style={{ borderColor: "var(--brand)" }}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-sm opacity-70">{t.duration_minutes} min{t.description ? ` · ${t.description}` : ""}</div>
              </Link>
            </li>
          ))}
        </ul>
        {types.length === 0 && <p>No hay citas disponibles por el momento.</p>}
      </div>
    </ClientFrame>
  );
}
