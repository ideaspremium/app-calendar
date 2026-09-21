import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import SubmitButton from "@/components/SubmitButton";
import { zoneLabel } from "@/lib/datetime";
import { updateAgencyTimezone } from "./actions";

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const sb = await supabaseServer();
  const { data: agencies } = await sb.from("agencies").select("id,name,slug,timezone").order("name");
  const { data: clients } = await sb
    .from("clients")
    .select("id,name,slug,agency_id,is_active,timezone")
    .order("name");

  if (!agencies?.length) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Tu usuario aún no pertenece a ninguna agencia</h1>
        <p className="mt-2 opacity-70">Pide al administrador de la plataforma que te añada en <code>agency_members</code>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {saved === "zona" && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Zona horaria de la agencia guardada.</p>
      )}

      {agencies.map((a) => (
        <section key={a.id}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{a.name}</h2>
            <Link href={`/admin/clients/new?agency=${a.id}`} className="rounded-lg bg-black px-3 py-1.5 text-sm text-white">Nuevo cliente</Link>
          </div>

          <form action={updateAgencyTimezone} className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border bg-neutral-50 p-4">
            <input type="hidden" name="id" value={a.id} />
            <div className="min-w-[260px] flex-1">
              <TimezoneSelect value={a.timezone} label="Zona horaria de la agencia" />
            </div>
            <SubmitButton className="rounded-lg border bg-white px-4 py-2 text-sm">Guardar zona</SubmitButton>
            <p className="w-full text-xs opacity-60">
              Es el valor por defecto de los clientes nuevos de esta agencia. Cada cliente puede tener la suya.
            </p>
          </form>

          <ul className="divide-y rounded-xl border bg-white">
            {clients?.filter((c) => c.agency_id === a.id).map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <Link href={`/admin/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                <span className="text-sm opacity-60">/{c.slug} · {zoneLabel(c.timezone)}</span>
              </li>
            ))}
            {!clients?.some((c) => c.agency_id === a.id) && <li className="px-4 py-3 text-sm opacity-60">Sin clientes todavía.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
