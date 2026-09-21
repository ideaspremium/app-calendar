"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/admin/login");
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

type Question = { key: string; label: string; type: string; required: boolean };

const questionKey = (label: string, i: number) =>
  `q${i + 1}_${slugify(label).replace(/-/g, "_") || "campo"}`;

/**
 * Lee las preguntas del editor visual (`questions_json`).
 * Mantiene como respaldo el formato antiguo de texto "Etiqueta | tipo | *".
 */
function parseQuestions(form: FormData): Question[] {
  const json = String(form.get("questions_json") || "").trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as { label?: string; type?: string; required?: boolean }[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((q) => String(q?.label ?? "").trim())
        .map((q, i) => {
          const label = String(q.label).trim();
          return { key: questionKey(label, i), label, type: q.type || "text", required: !!q.required };
        });
    } catch {
      return [];
    }
  }
  const raw = String(form.get("questions") || "").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      const [label, type = "text", req = ""] = line.split("|").map((x) => x.trim());
      return { key: questionKey(label, i), label, type: type || "text", required: req === "*" };
    })
    .filter((q) => q.label);
}

/** Cambia la zona horaria de una agencia: es el valor por defecto de sus clientes nuevos. */
export async function updateAgencyTimezone(form: FormData) {
  const sb = await supabaseServer();
  const id = String(form.get("id"));
  const { data, error } = await sb
    .from("agencies")
    .update({ timezone: String(form.get("timezone")) })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No se pudo cambiar la zona horaria de la agencia: tu usuario no tiene permiso.");
  revalidatePath("/admin");
  redirect("/admin?saved=zona");
}

export async function createClient(form: FormData) {
  const sb = await supabaseServer();
  const name = String(form.get("name"));
  const agencyId = String(form.get("agency_id"));
  // La zona nace de la agencia; el formulario la trae preseleccionada y esto es el respaldo.
  let timezone = String(form.get("timezone") || "").trim();
  if (!timezone) {
    const { data: agency } = await sb.from("agencies").select("timezone").eq("id", agencyId).maybeSingle();
    timezone = agency?.timezone || "UTC";
  }
  const { data, error } = await sb.from("clients").insert({
    agency_id: agencyId,
    name,
    slug: String(form.get("slug") || slugify(name)),
    timezone,
    locale: String(form.get("locale") || "es"),
    contact_email: String(form.get("contact_email") || "") || null,
    website_url: String(form.get("website_url") || "") || null,
    branding: {
      logo_url: String(form.get("logo_url") || "") || undefined,
      primary_color: String(form.get("primary_color") || "") || undefined,
      background: String(form.get("background") || "") || undefined,
      text_color: String(form.get("text_color") || "") || undefined,
      font_family: String(form.get("font_family") || "") || undefined,
    },
  }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(`/admin/clients/${data.id}`);
}

export async function updateBranding(form: FormData) {
  const sb = await supabaseServer();
  const id = String(form.get("id"));
  const { error } = await sb.from("clients").update({
    name: String(form.get("name")),
    timezone: String(form.get("timezone")),
    contact_email: String(form.get("contact_email") || "") || null,
    website_url: String(form.get("website_url") || "") || null,
    custom_domain: String(form.get("custom_domain") || "") || null,
    branding: {
      logo_url: String(form.get("logo_url") || "") || undefined,
      primary_color: String(form.get("primary_color") || "") || undefined,
      background: String(form.get("background") || "") || undefined,
      text_color: String(form.get("text_color") || "") || undefined,
      font_family: String(form.get("font_family") || "") || undefined,
    },
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/clients/${id}`);
  redirect(`/admin/clients/${id}?saved=datos`);
}

export async function saveAvailability(form: FormData) {
  const sb = await supabaseServer();
  const clientId = String(form.get("client_id"));
  const rows: { client_id: string; weekday: number; start_time: string; end_time: string }[] = [];
  for (let d = 0; d < 7; d++) {
    if (form.get(`on_${d}`)) {
      rows.push({ client_id: clientId, weekday: d, start_time: String(form.get(`start_${d}`)), end_time: String(form.get(`end_${d}`)) });
      // Segundo tramo (p. ej. tarde) opcional
      const s2 = String(form.get(`start2_${d}`) || ""), e2 = String(form.get(`end2_${d}`) || "");
      if (s2 && e2) rows.push({ client_id: clientId, weekday: d, start_time: s2, end_time: e2 });
    }
  }
  await sb.from("availability_rules").delete().eq("client_id", clientId).is("event_type_id", null);
  if (rows.length) {
    const { error } = await sb.from("availability_rules").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(`/admin/clients/${clientId}?saved=horario`);
}

export async function saveEventType(form: FormData) {
  const sb = await supabaseServer();
  const clientId = String(form.get("client_id"));
  const id = String(form.get("id") || "");
  const name = String(form.get("name"));
  const questions = parseQuestions(form);
  const payload = {
    client_id: clientId,
    calendar_connection_id: String(form.get("calendar_connection_id") || "") || null,
    name,
    slug: String(form.get("slug") || slugify(name)),
    description: String(form.get("description") || "") || null,
    duration_minutes: Number(form.get("duration_minutes") || 30),
    buffer_before_minutes: Number(form.get("buffer_before_minutes") || 0),
    buffer_after_minutes: Number(form.get("buffer_after_minutes") || 0),
    min_notice_minutes: Number(form.get("min_notice_hours") || 2) * 60,
    max_days_ahead: Number(form.get("max_days_ahead") || 60),
    slot_interval_minutes: Number(form.get("slot_interval_minutes") || 30),
    location_type: String(form.get("location_type") || "in_person"),
    location_details: String(form.get("location_details") || "") || null,
    questions,
    is_active: true,
  };
  const q = id ? sb.from("event_types").update(payload).eq("id", id) : sb.from("event_types").insert(payload);
  const { error } = await q;
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(`/admin/clients/${clientId}?saved=${id ? "cita" : "cita_nueva"}`);
}

export async function deleteEventType(form: FormData) {
  const sb = await supabaseServer();
  const id = String(form.get("id")), clientId = String(form.get("client_id"));
  await sb.from("event_types").update({ is_active: false }).eq("id", id);
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(`/admin/clients/${clientId}?saved=desactivada`);
}
