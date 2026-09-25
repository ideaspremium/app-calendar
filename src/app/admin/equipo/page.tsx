import { requireAgency } from "@/lib/admin/context";
import { InviteForm, TeamTable, type Person } from "@/components/admin/Team";
import { Notice } from "@/components/admin/ui";

export const metadata = { title: "Equipo · Calendars360" };

function ago(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`;
}

export default async function Equipo() {
  const ctx = await requireAgency();
  const { data, error } = await ctx.sb.rpc("agency_team", { p_agency: ctx.agency.id });
  const rows = (data ?? []) as { user_id: string; email: string; role: Person["role"]; joined_at: string; last_sign_in_at: string | null; invited_at: string | null }[];
  const people: Person[] = rows.map((r) => ({
    user_id: r.user_id,
    email: r.email,
    role: r.role,
    pending: !r.last_sign_in_at,
    me: r.user_id === ctx.user.id,
    since: r.last_sign_in_at ? `En la agencia desde ${ago(r.joined_at)}` : `Invitación enviada ${ago(r.invited_at ?? r.joined_at)}`,
  }));

  return (
    <>
      <div className="hd">
        <div>
          <h1>Equipo</h1>
          <p>Las personas de {ctx.agency.name} que usan el panel.</p>
        </div>
      </div>
      {error && (
        <Notice kind="bad">
          No se pudo cargar el equipo ({error.message}). Si acabas de actualizar la app, falta aplicar la migración del panel en Supabase.
        </Notice>
      )}
      {!ctx.member && ctx.isPlatform && <Notice kind="info">Ves esta agencia como administradora de la plataforma: no estás en su equipo.</Notice>}
      <div className="grid2 g14">
        <TeamTable people={people} isOwner={ctx.isOwner} canManage={ctx.canManage} />
        <div className="stack">
          {ctx.canManage ? (
            <InviteForm canInviteOwner={ctx.isOwner} />
          ) : (
            <Notice kind="info">Para invitar a alguien, pídeselo a un dueño/a o admin de la agencia.</Notice>
          )}
          <div className="roles">
            <div className="role"><b>Dueño/a</b>Todo, incluido cambiar papeles y quitar personas.</div>
            <div className="role"><b>Admin</b>Crea y edita negocios, cambia su imagen e invita al equipo.</div>
            <div className="role"><b>Miembro</b>Ve las citas y edita horarios, servicios y días cerrados de los negocios que ya existen.</div>
          </div>
        </div>
      </div>
    </>
  );
}
