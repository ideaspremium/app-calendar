import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AdminHome() {
  const sb = await supabaseServer();
  const { data: agencies } = await sb.from("agencies").select("id,name,slug").order("name");
  const { data: clients } = await sb.from("clients").select("id,name,slug,agency_id,is_active").order("name");

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
      {agencies.map((a) => (
        <section key={a.id}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{a.name}</h2>
            <Link href={`/admin/clients/new?agency=${a.id}`} className="rounded-lg bg-black px-3 py-1.5 text-sm text-white">Nuevo cliente</Link>
          </div>
          <ul className="divide-y rounded-xl border bg-white">
            {clients?.filter((c) => c.agency_id === a.id).map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <Link href={`/admin/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                <span className="text-sm opacity-60">/{c.slug}</span>
              </li>
            ))}
            {!clients?.some((c) => c.agency_id === a.id) && <li className="px-4 py-3 text-sm opacity-60">Sin clientes todavía.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
