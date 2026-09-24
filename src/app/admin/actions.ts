"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { appUrl, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { AGENCY_COOKIE, getAdminContext, requireAgency, type Role } from "@/lib/admin/context";
import { daysBetween } from "@/lib/admin/time";
import { FONTS, type FontKey } from "@/lib/fonts";
import { parseHex } from "@/lib/theme";
import type { Branding } from "@/lib/types";
import { isValidZone } from "@/lib/zones";

/**
 * Acciones del panel. Los permisos los pone la base (RLS y funciones con comprobación de
 * papel): aquí solo se valida la entrada y se traducen los errores. La service role solo
 * se usa para enviar correos de invitación y para comprobar que una dirección no la usa
 * otro negocio de otra agencia.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function dbError(e: { code?: string; message: string } | null, fallback = "No se pudo guardar."): string {
  if (!e) return fallback;
  if (e.code === "23505") {
    if (/custom_domain/.test(e.message)) return "Ese dominio ya lo usa otro negocio.";
    if (/slug/.test(e.message)) return "Esa dirección ya la usa otro negocio o servicio.";
    return "Ya existe uno igual.";
  }
  if (e.code === "42501" || /row-level security/.test(e.message)) return "Tu papel en la agencia no permite este cambio.";
  if (/Zona horaria no valida/.test(e.message)) return "La zona horaria no es válida.";
  return e.message || fallback;
}

const str = (v: unknown) => String(v ?? "").trim();
const opt = (v: unknown) => str(v) || null;
const slugOf = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
const RESERVED = new Set(["admin", "api", "auth", "cita", "embed.js", "_next", "favicon.ico", "robots.txt"]);

/** La página pública busca el negocio solo por su dirección: tiene que ser única entre todas las agencias. */
async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  if (RESERVED.has(slug)) return true;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  let q = supabaseAdmin().from("clients").select("id").eq("slug", slug);
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q.limit(1);
  return !!data?.length;
}

/* ------------------------------------------------------------------ sesión y agencia */

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/admin/login");
}

export async function switchAgency(form: FormData) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  const id = str(form.get("agency_id"));
  if (ctx.agencies.some((a) => a.id === id)) {
    (await cookies()).set(AGENCY_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/admin");
}

export async function createAgency(input: { name: string; timezone: string }): Promise<Result<{ id: string }>> {
  const ctx = await getAdminContext();
  if (!ctx?.isPlatform) return fail("Solo la plataforma puede crear agencias.");
  const name = str(input.name);
  if (!name) return fail("Escribe el nombre de la agencia.");
  if (!isValidZone(input.timezone)) return fail("Elige una zona horaria.");
  const { data, error } = await ctx.sb
    .from("agencies")
    .insert({ name, slug: `${slugOf(name) || "agencia"}-${Math.random().toString(36).slice(2, 6)}`, timezone: input.timezone })
    .select("id")
    .single();
  if (error || !data) return fail(dbError(error));
  await ctx.sb.from("agency_members").insert({ agency_id: data.id, user_id: ctx.user.id, role: "owner" });
  (await cookies()).set(AGENCY_COOKIE, data.id, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/admin", "layout");
  return { ok: true, id: data.id };
}

export async function updateAgency(input: {
  name: string; contact_email: string; timezone: string; default_locale: string; default_style: string;
}): Promise<Result> {
  const ctx = await requireAgency();
  if (!ctx.canManage) return fail("Solo dueño/a o admin pueden cambiar los ajustes de la agencia.");
  const name = str(input.name);
  if (!name) return fail("El nombre no puede quedar vacío.");
  if (!isValidZone(input.timezone)) return fail("Elige una zona horaria de la lista.");
  const settings = {
    ...(ctx.agency.settings ?? {}),
    default_locale: input.default_locale === "en" ? "en" : "es",
    default_style: input.default_style === "vidrio" ? "vidrio" : "clasico",
  };
  const { data, error } = await ctx.sb
    .from("agencies")
    .update({ name, contact_email: opt(input.contact_email), timezone: input.timezone, settings })
    .eq("id", ctx.agency.id)
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Tu papel en la agencia no permite este cambio.");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/* ------------------------------------------------------------------ negocios */

export async function createClient(form: FormData) {
  const ctx = await requireAgency();
  const name = str(form.get("name"));
  const back = (msg: string) => redirect(`/admin/clients/new?error=${encodeURIComponent(msg)}&name=${encodeURIComponent(name)}`);
  if (!ctx.canManage) back("Solo dueño/a o admin pueden crear negocios.");
  if (!name) back("Escribe el nombre del negocio.");
  const slug = slugOf(str(form.get("slug")) || name);
  if (!slug) back("La dirección solo puede tener letras, números y guiones.");
  if (await slugTaken(slug)) back(`La dirección «${slug}» ya la usa otro negocio. Elige otra.`);
  const timezone = str(form.get("timezone")) || ctx.agency.timezone;
  if (!isValidZone(timezone)) back("Elige una zona horaria de la lista.");
  const settings = ctx.agency.settings ?? {};

  const { data, error } = await ctx.sb
    .from("clients")
    .insert({
      agency_id: ctx.agency.id,
      name,
      slug,
      timezone,
      locale: settings.default_locale === "en" ? "en" : "es",
      contact_email: opt(form.get("contact_email")),
      website_url: opt(form.get("website_url")),
      branding: { style: settings.default_style === "vidrio" ? "vidrio" : "clasico", primary_color: "#5b3fe0", background: "#ffffff", text_color: "#1c1b22", font_family: "Inter" },
    })
    .select("id")
    .single();
  if (error || !data) back(dbError(error));
  revalidatePath("/admin", "layout");
  redirect(`/admin/clients/${data!.id}?creado=1`);
}

export async function updateClientData(input: {
  id: string; name: string; slug: string; timezone: string; locale: string;
  contact_email: string; website_url: string; custom_domain: string;
}): Promise<Result<{ slug: string }>> {
  const ctx = await requireAgency();
  if (!ctx.canManage) return fail("Solo dueño/a o admin pueden cambiar los datos del negocio.");
  const name = str(input.name);
  if (!name) return fail("El nombre no puede quedar vacío.");
  const slug = slugOf(input.slug);
  if (!slug) return fail("La dirección solo puede tener letras, números y guiones.");
  if (await slugTaken(slug, input.id)) return fail(`La dirección «${slug}» ya la usa otro negocio.`);
  if (!isValidZone(input.timezone)) return fail("Elige una zona horaria de la lista.");
  const domain = str(input.custom_domain).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return fail("El dominio no parece válido (por ejemplo: citas.negocio.com).");

  const { data, error } = await ctx.sb
    .from("clients")
    .update({
      name, slug, timezone: input.timezone, locale: input.locale === "en" ? "en" : "es",
      contact_email: opt(input.contact_email), website_url: opt(input.website_url), custom_domain: domain,
    })
    .eq("id", input.id)
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Tu papel en la agencia no permite este cambio.");
  revalidatePath(`/admin/clients/${input.id}`);
  return { ok: true, slug };
}

const BUSINESS_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Asigna el business_id del negocio (CONTRATO_BUSINESS_ID v1.2). Lo emite Xplore360: aquí
 * solo se copia. Una sola vez: la base de datos rechaza cambiarlo después.
 */
export async function setClientBusinessId(clientId: string, businessId: string): Promise<Result<{ business_id: string }>> {
  const ctx = await requireAgency();
  if (!ctx.canManage) return fail("Solo dueño/a o admin pueden asignar el business_id.");
  const value = str(businessId).toLowerCase();
  if (!BUSINESS_ID_RE.test(value)) {
    return fail("No es un business_id válido: debe ser un UUID v4 (36 caracteres, p. ej. b91e4ae2-7464-4975-b65f-e3d13fb6485a).");
  }
  const { data, error } = await ctx.sb
    .from("clients")
    .update({ business_id: value })
    .eq("id", clientId)
    .is("business_id", null)
    .select("id");
  if (error) {
    if (error.code === "23505") return fail("Ese business_id ya está asignado a otro negocio.");
    if (/inmutable/.test(error.message)) return fail("Este negocio ya tiene business_id y no se puede cambiar.");
    return fail(dbError(error));
  }
  if (!data?.length) return fail("Este negocio ya tiene business_id, o tu papel no permite el cambio.");
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true, business_id: value };
}

export type ImageInput = {
  style: "clasico" | "vidrio";
  logo_url: string;
  primary_color: string;
  background: string;
  text_color: string;
  font: string;
  glass_mode: "brand" | "custom";
  glass_colors: string[];
  glass_intensity: "soft" | "vivid";
};

export async function updateClientImage(clientId: string, input: ImageInput): Promise<Result> {
  const ctx = await requireAgency();
  if (!ctx.canManage) return fail("Solo dueño/a o admin pueden cambiar la imagen.");
  const primary = parseHex(input.primary_color), background = parseHex(input.background), text = parseHex(input.text_color);
  if (!primary || !background || !text) return fail("Los colores tienen que ser hexadecimales, por ejemplo #5b3fe0.");
  const logo = str(input.logo_url);
  if (logo && !/^https:\/\//i.test(logo) && !logo.startsWith(`${SUPABASE_URL}/storage/`)) return fail("El logo tiene que ser una dirección https.");
  const font = (Object.keys(FONTS) as FontKey[]).includes(input.font as FontKey) ? FONTS[input.font as FontKey].label : "Inter";
  const colors = (input.glass_colors ?? []).map((c) => parseHex(c)).filter((c): c is string => !!c).slice(0, 3);

  const { data: current } = await ctx.sb.from("clients").select("branding").eq("id", clientId).maybeSingle();
  const branding: Branding = {
    ...((current?.branding as Branding | null) ?? {}),
    style: input.style === "vidrio" ? "vidrio" : "clasico",
    logo_url: logo || undefined,
    primary_color: primary,
    background,
    text_color: text,
    font_family: font,
    glass: {
      mode: input.glass_mode === "custom" && colors.length ? "custom" : "brand",
      colors: colors.length ? colors : undefined,
      intensity: input.glass_intensity === "vivid" ? "vivid" : "soft",
    },
  };
  const { data, error } = await ctx.sb.from("clients").update({ branding }).eq("id", clientId).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Tu papel en la agencia no permite este cambio.");
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true };
}

/** Servicios ya publicados de un negocio: se vuelven a publicar tras cambiar horario o días cerrados. */
async function publishedServices(sb: Awaited<ReturnType<typeof supabaseServer>>, clientId: string) {
  const { data } = await sb.from("event_types").select("id,name").eq("client_id", clientId).eq("is_active", true).not("nylas_configuration_id", "is", null);
  return (data ?? []) as { id: string; name: string }[];
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveAvailability(clientId: string, ranges: { weekday: number; start: string; end: string }[]): Promise<Result<{ republish: { id: string; name: string }[] }>> {
  const ctx = await requireAgency();
  const rows = [];
  for (const r of ranges) {
    if (!(r.weekday >= 0 && r.weekday <= 6) || !TIME.test(r.start) || !TIME.test(r.end)) return fail("Hay una hora con formato no válido.");
    if (r.end <= r.start) return fail("Cada tramo tiene que acabar después de empezar.");
    rows.push({ client_id: clientId, weekday: r.weekday, start_time: r.start, end_time: r.end });
  }
  for (let d = 0; d < 7; d++) {
    const day = rows.filter((r) => r.weekday === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let i = 1; i < day.length; i++) if (day[i].start_time < day[i - 1].end_time) return fail("Hay dos tramos que se pisan en el mismo día.");
  }
  const { error: delErr } = await ctx.sb.from("availability_rules").delete().eq("client_id", clientId).is("event_type_id", null);
  if (delErr) return fail(dbError(delErr));
  if (rows.length) {
    const { error } = await ctx.sb.from("availability_rules").insert(rows);
    if (error) return fail(dbError(error));
  }
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true, republish: await publishedServices(ctx.sb, clientId) };
}

export async function addClosedDays(clientId: string, input: { from: string; to: string; note: string }): Promise<Result<{ republish: { id: string; name: string }[] }>> {
  const ctx = await requireAgency();
  const to = input.to || input.from;
  const days = daysBetween(input.from, to);
  if (!days.length) return fail("Revisa las fechas: «hasta» no puede ser antes que «desde».");
  if (days.length > 366) return fail("Como mucho un año seguido.");
  const note = str(input.note).slice(0, 200) || null;
  const { data: existing } = await ctx.sb.from("availability_overrides").select("date").eq("client_id", clientId).is("event_type_id", null).in("date", days);
  const have = new Set((existing ?? []).map((r) => r.date as string));
  const rows = days.filter((d) => !have.has(d)).map((date) => ({ client_id: clientId, date, is_blocked: true, note }));
  if (rows.length) {
    const { error } = await ctx.sb.from("availability_overrides").insert(rows);
    if (error) return fail(dbError(error));
  }
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true, republish: await publishedServices(ctx.sb, clientId) };
}

export async function removeClosedDays(clientId: string, ids: string[]): Promise<Result<{ republish: { id: string; name: string }[] }>> {
  const ctx = await requireAgency();
  if (!ids.length) return { ok: true, republish: [] };
  const { error } = await ctx.sb.from("availability_overrides").delete().eq("client_id", clientId).in("id", ids);
  if (error) return fail(dbError(error));
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true, republish: await publishedServices(ctx.sb, clientId) };
}

export type ServiceInput = {
  id?: string;
  client_id: string;
  calendar_connection_id: string;
  name: string;
  slug: string;
  description: string;
  duration_minutes: number;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  location_type: string;
  location_details: string;
  questions: { key?: string; label: string; type: string; required: boolean }[];
};

const QTYPES = new Set(["text", "multi_line_text", "phone_number", "email"]);
const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

export async function saveService(input: ServiceInput): Promise<Result<{ id: string; published: boolean }>> {
  const ctx = await requireAgency();
  const name = str(input.name);
  if (!name) return fail("Escribe el nombre del servicio.");
  const slug = slugOf(input.slug || name);
  if (!slug) return fail("La dirección del servicio solo puede tener letras, números y guiones.");
  const used = new Set<string>();
  const questions = (input.questions ?? [])
    .filter((q) => str(q.label))
    .map((q, i) => {
      const label = str(q.label).slice(0, 120);
      // La clave de una pregunta ya existente no cambia: las respuestas guardadas la usan.
      let key = q.key && /^[a-z0-9_]{1,64}$/.test(q.key) ? q.key : `q${i + 1}_${slugOf(label).replace(/-/g, "_") || "campo"}`;
      while (used.has(key)) key = `${key}_${i + 1}`;
      used.add(key);
      return { key, label, type: QTYPES.has(q.type) ? q.type : "text", required: !!q.required };
    });
  const payload = {
    client_id: input.client_id,
    calendar_connection_id: str(input.calendar_connection_id) || null,
    name,
    slug,
    description: opt(input.description),
    duration_minutes: int(input.duration_minutes, 5, 720, 30),
    slot_interval_minutes: int(input.slot_interval_minutes, 5, 720, 30),
    buffer_before_minutes: int(input.buffer_before_minutes, 0, 240, 0),
    buffer_after_minutes: int(input.buffer_after_minutes, 0, 240, 0),
    min_notice_minutes: int(input.min_notice_minutes, 0, 60 * 24 * 60, 120),
    max_days_ahead: int(input.max_days_ahead, 1, 730, 60),
    location_type: ["in_person", "phone", "video", "custom"].includes(input.location_type) ? input.location_type : "in_person",
    location_details: opt(input.location_details),
    questions,
    is_active: true,
  };
  const q = input.id
    ? ctx.sb.from("event_types").update(payload).eq("id", input.id).select("id,nylas_configuration_id").single()
    : ctx.sb.from("event_types").insert(payload).select("id,nylas_configuration_id").single();
  const { data, error } = await q;
  if (error || !data) return fail(dbError(error));
  revalidatePath(`/admin/clients/${input.client_id}`);
  return { ok: true, id: data.id as string, published: !!data.nylas_configuration_id };
}

export async function deactivateService(clientId: string, id: string): Promise<Result> {
  const ctx = await requireAgency();
  const { error } = await ctx.sb.from("event_types").update({ is_active: false }).eq("id", id).eq("client_id", clientId);
  if (error) return fail(dbError(error));
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ equipo */

const ROLES: Role[] = ["owner", "admin", "member"];

function rpcError(e: { message: string } | null) {
  return e?.message || "No se pudo completar.";
}

export async function inviteMember(input: { email: string; role: string }): Promise<Result<{ status: "invited" | "added" | "already_member"; mailError?: string }>> {
  const ctx = await requireAgency();
  const email = str(input.email).toLowerCase();
  const role = (ROLES.includes(input.role as Role) ? input.role : "member") as Role;
  const { data, error } = await ctx.sb.rpc("agency_invite", { p_agency: ctx.agency.id, p_email: email, p_role: role });
  if (error) return fail(rpcError(error));
  const status = data as "invited" | "added" | "already_member";
  let mailError: string | undefined;
  if (status === "invited") {
    // El correo lo manda Supabase. Al crearse el usuario, el disparador handle_new_user_invite
    // lo mete en la agencia con el papel elegido.
    const { error: mErr } = await supabaseAdmin().auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl()}/auth/callback` });
    if (mErr) mailError = mErr.message;
  }
  revalidatePath("/admin/equipo");
  return { ok: true, status, mailError };
}

export async function resendInvite(email: string): Promise<Result> {
  const ctx = await requireAgency();
  if (!ctx.canManage) return fail("Solo dueño/a o admin pueden reenviar invitaciones.");
  const { data: team } = await ctx.sb.rpc("agency_team", { p_agency: ctx.agency.id });
  const person = ((team ?? []) as { email: string; last_sign_in_at: string | null }[]).find((p) => p.email.toLowerCase() === email.toLowerCase());
  if (!person) return fail("Esa persona no está en la agencia.");
  if (person.last_sign_in_at) return fail("Ya ha entrado alguna vez: puede pedir su enlace en la pantalla de acceso.");
  // Enlace de acceso normal (sin crear usuario). Con flujo implícito: el enlace funciona
  // en el dispositivo de quien lo recibe, no depende de este navegador.
  const anon = createSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, flowType: "implicit" } });
  const { error } = await anon.auth.signInWithOtp({ email: person.email, options: { shouldCreateUser: false, emailRedirectTo: `${appUrl()}/auth/callback` } });
  if (error) return fail(error.message);
  return { ok: true };
}

export async function setMemberRole(userId: string, role: string): Promise<Result> {
  const ctx = await requireAgency();
  if (!ROLES.includes(role as Role)) return fail("Papel no válido.");
  const { error } = await ctx.sb.rpc("agency_set_role", { p_agency: ctx.agency.id, p_user: userId, p_role: role });
  if (error) return fail(rpcError(error));
  revalidatePath("/admin/equipo");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<Result> {
  const ctx = await requireAgency();
  const { error } = await ctx.sb.rpc("agency_remove_member", { p_agency: ctx.agency.id, p_user: userId });
  if (error) return fail(rpcError(error));
  revalidatePath("/admin/equipo");
  return { ok: true };
}
