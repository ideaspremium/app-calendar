import Link from "next/link";
import { requireAgency } from "@/lib/admin/context";
import { agencyClients, LIVE_STATUSES, readiness } from "@/lib/admin/data";
import { zl } from "@/lib/admin/time";
import { isValidZone } from "@/lib/zones";
import { ClientTile, Empty } from "@/components/admin/bits";
import { I } from "@/components/admin/icons";

export const metadata = { title: "Negocios · Premium Calendar" };

export default async function Negocios() {
  const ctx = await requireAgency();
  const clients = await agencyClients(ctx);
  const ids = clients.map((c) => c.id);
  const { data: next } = ids.length
    ? await ctx.sb.from("bookings").select("client_id").in("client_id", ids).in("status", LIVE_STATUSES).gte("start_at", new Date().toISOString())
    : { data: [] as { client_id: string }[] };
  const upcoming = new Map<string, number>();
  for (const b of next ?? []) upcoming.set(b.client_id, (upcoming.get(b.client_id) ?? 0) + 1);

  return (
    <>
      <div className="hd">
        <div>
          <h1>Negocios</h1>
          <p>Cada negocio tiene su calendario, sus servicios y su propia imagen.</p>
        </div>
        {ctx.canManage && (
          <Link className="btn pri" href="/admin/clients/new">
            {I.plus}Nuevo negocio
          </Link>
        )}
      </div>

      {clients.length === 0 ? (
        <Empty
          title="Todavía no hay negocios"
          action={ctx.canManage ? <Link className="btn pri" href="/admin/clients/new">{I.plus}Crear el primero</Link> : null}
        >
          Un negocio es cada empresa para la que gestionas citas: tiene su página de reservas, su calendario y sus servicios.
          {!ctx.canManage && " Pide a un admin de la agencia que lo cree."}
        </Empty>
      ) : (
        <div className="cl">
          {clients.map((c) => {
            const r = readiness(c);
            return (
              <Link key={c.id} href={`/admin/clients/${c.id}`} className="card cc">
                <div className="top">
                  <ClientTile name={c.name} branding={c.branding} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2>{c.name}</h2>
                    <div className="sl">/{c.slug}</div>
                  </div>
                  {!c.is_active && <span className="pill p-n">Pausado</span>}
                  <span className={`pill ${c.branding.style === "vidrio" ? "p-v" : "p-n"}`}>{c.branding.style === "vidrio" ? "Vidrio" : "Clásico"}</span>
                </div>
                <div className="rows">
                  <div>
                    <span className="k">Calendario</span>
                    {r.calendar === "ok" ? (
                      <span className="pill p-ok">{I.check}Conectado</span>
                    ) : r.calendar === "reconnect" ? (
                      <span className="pill p-bad">{I.warn}Reconectar</span>
                    ) : (
                      <span className="pill p-bad">{I.warn}Sin conectar</span>
                    )}
                  </div>
                  <div>
                    <span className="k">Servicios</span>
                    {r.services ? `${r.published} de ${r.services} publicados` : "Ninguno todavía"}
                  </div>
                  <div>
                    <span className="k">Zona</span>
                    {isValidZone(c.timezone) ? zl(c.timezone) : <span style={{ color: "var(--bad)" }}>{c.timezone} (no válida)</span>}
                  </div>
                  <div>
                    <span className="k">Próximas citas</span>
                    {upcoming.get(c.id) ?? "—"}
                  </div>
                </div>
              </Link>
            );
          })}
          {ctx.canManage && (
            <Link href="/admin/clients/new" className="card cc new">
              <span>{I.plus}Nuevo negocio</span>
            </Link>
          )}
        </div>
      )}
    </>
  );
}
