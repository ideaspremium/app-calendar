import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isValidZone } from "@/lib/zones";

export type Role = "owner" | "admin" | "member";
export type AgencySettings = { default_locale?: "es" | "en"; default_style?: "clasico" | "vidrio" };
export type Agency = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  contact_email: string | null;
  settings: AgencySettings | null;
};

/** Agencia elegida en el selector de la barra lateral. */
export const AGENCY_COOKIE = "pc_agency";
/** Zona del dispositivo de quien usa el panel, para «Mi zona». La pone TzSync. */
export const TZ_COOKIE = "pc_tz";

export type AdminContext = {
  sb: Awaited<ReturnType<typeof supabaseServer>>;
  user: { id: string; email: string; name: string | null };
  isPlatform: boolean;
  agencies: Agency[];
  agency: Agency | null;
  role: Role;
  /** Si pertenece a la agencia elegida (la plataforma ve todas sin pertenecer). */
  member: boolean;
  /** Dueño/a o admin: crea y edita negocios, su imagen, e invita. */
  canManage: boolean;
  /** Dueño/a (o la plataforma): cambia papeles y quita personas. */
  isOwner: boolean;
  /** Zona en la que se enseñan «mis» horas y si viene del dispositivo o es la de la agencia. */
  viewerTz: string;
  viewerTzSource: "device" | "agency";
  deviceTz: string | null;
};

/** Nombre para el saludo: el del perfil o, si el correo empieza por un nombre, ese nombre. */
function displayName(meta: Record<string, unknown> | undefined, email?: string): string | null {
  const n = String(meta?.full_name ?? meta?.name ?? "").trim();
  if (n) return n.split(/\s+/)[0];
  const first = (email ?? "").split("@")[0].split(/[._+-]/)[0];
  return /^[a-záéíóúñü]{3,}$/i.test(first) ? first[0].toUpperCase() + first.slice(1).toLowerCase() : null;
}

/** Contexto del panel para esta petición: sesión, agencias visibles, papel y zona. */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const isPlatform = (user.app_metadata as Record<string, unknown> | undefined)?.platform_admin === true;

  const [{ data: agencyRows }, { data: memberships }] = await Promise.all([
    sb.from("agencies").select("id,name,slug,timezone,contact_email,settings").order("name"),
    sb.from("agency_members").select("agency_id,role").eq("user_id", user.id),
  ]);
  const agencies = (agencyRows ?? []) as Agency[];
  const mine = new Map((memberships ?? []).map((m) => [m.agency_id as string, m.role as Role]));

  const jar = await cookies();
  const wanted = jar.get(AGENCY_COOKIE)?.value;
  let agency = agencies.find((a) => a.id === wanted) ?? null;
  if (!agency && agencies.length) {
    // Sin elección guardada: la agencia propia con más negocios (la de trabajo diario).
    const candidates = agencies.filter((a) => mine.has(a.id));
    const pool = candidates.length ? candidates : agencies;
    if (pool.length > 1) {
      const { data: owned } = await sb.from("clients").select("agency_id").in("agency_id", pool.map((a) => a.id));
      const n = new Map<string, number>();
      for (const c of owned ?? []) n.set(c.agency_id as string, (n.get(c.agency_id as string) ?? 0) + 1);
      agency = [...pool].sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0))[0];
    } else agency = pool[0];
  }

  const role: Role = (agency && mine.get(agency.id)) || (isPlatform ? "owner" : "member");
  const canManage = isPlatform || role === "owner" || role === "admin";
  const isOwner = isPlatform || role === "owner";

  const cookieTz = jar.get(TZ_COOKIE)?.value ?? null;
  const deviceTz = isValidZone(cookieTz) ? cookieTz : null;
  const agencyTz = agency && isValidZone(agency.timezone) ? agency.timezone : "UTC";

  return {
    sb,
    user: { id: user.id, email: user.email ?? "", name: displayName(user.user_metadata, user.email) },
    isPlatform,
    agencies,
    agency,
    role,
    member: !!(agency && mine.has(agency.id)),
    canManage,
    isOwner,
    viewerTz: deviceTz ?? agencyTz,
    viewerTzSource: deviceTz ? "device" : "agency",
    deviceTz,
  };
});

/** Para páginas del panel: sin sesión, al acceso; sin agencia, a Inicio (que lo explica). */
export async function requireAgency(): Promise<AdminContext & { agency: Agency }> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  if (!ctx.agency) redirect("/admin");
  return ctx as AdminContext & { agency: Agency };
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Dueño/a", admin: "Admin", member: "Miembro" };
