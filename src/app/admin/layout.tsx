import "@fontsource-variable/inter";
import "@/styles/admin.css";
import type { Metadata } from "next";
import Shell from "@/components/admin/Shell";
import { getAdminContext, ROLE_LABEL } from "@/lib/admin/context";
import { LIVE_STATUSES } from "@/lib/admin/data";

export const metadata: Metadata = { title: "Panel · Premium Calendar", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminContext();
  // Sin sesión solo se llega a la pantalla de acceso (el middleware manda ahí el resto).
  if (!ctx) return <div className="adm">{children}</div>;

  let clients = 0;
  let upcoming = 0;
  if (ctx.agency) {
    const now = new Date();
    const [{ count: nClients }, { count: nUpcoming }] = await Promise.all([
      ctx.sb.from("clients").select("id", { count: "exact", head: true }).eq("agency_id", ctx.agency.id),
      ctx.sb
        .from("bookings")
        .select("id, clients!inner(agency_id)", { count: "exact", head: true })
        .eq("clients.agency_id", ctx.agency.id)
        .in("status", LIVE_STATUSES)
        .gte("start_at", now.toISOString())
        .lt("start_at", new Date(now.getTime() + 7 * 86_400_000).toISOString()),
    ]);
    clients = nClients ?? 0;
    upcoming = nUpcoming ?? 0;
  }

  return (
    <Shell
      email={ctx.user.email}
      agencies={ctx.agencies.map((a) => ({ id: a.id, name: a.name, timezone: a.timezone }))}
      current={ctx.agency ? { id: ctx.agency.id, name: ctx.agency.name, timezone: ctx.agency.timezone, clients } : null}
      isPlatform={ctx.isPlatform}
      roleLabel={ctx.member ? ROLE_LABEL[ctx.role] : "Plataforma"}
      upcoming={upcoming}
      deviceTz={ctx.deviceTz}
    >
      {children}
    </Shell>
  );
}
