import { appUrl } from "@/lib/config";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Field } from "@/components/Field";
import CopyBlock from "@/components/CopyBlock";
import SyncButton from "@/components/SyncButton";
import SubmitButton from "@/components/SubmitButton";
import QuestionsEditor from "@/components/QuestionsEditor";
import { TimezoneSelect, isValidTimezone } from "@/components/TimezoneSelect";
import { zoneLabel } from "@/lib/datetime";
import { supabaseServer } from "@/lib/supabase/server";
import type { AvailabilityRule, CalendarConnection, Client, EventType } from "@/lib/types";
import { deleteEventType, saveAvailability, saveEventType, updateBranding } from "../../actions";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const SAVED_NOTICES: Record<string, string> = {
  horario: "Horario de atención guardado.",
  cita_nueva: "Tipo de cita creado. Pulsa «Publicar» para aplicarlo en Nylas.",
  cita: "Cambios del tipo de cita guardados. Pulsa «Publicar» para aplicarlos en Nylas.",
  desactivada: "Tipo de cita desactivado.",
  datos: "Datos e imagen del cliente guardados.",
};

export default async function ClientDetail({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ connected?: string; edit?: string; saved?: string }> }) {
  const { id } = await params;
  const { connected, edit, saved } = await searchParams;
  const sb = await supabaseServer();
  const { data: client } = await sb.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();
  const c = client as Client;

  const [{ data: conns }, { data: types }, { data: rules }] = await Promise.all([
    sb.from("calendar_connections").select("*").eq("client_id", id).order("created_at"),
    sb.from("event_types").select("*").eq("client_id", id).eq("is_active", true).order("name"),
    sb.from("availability_rules").select("weekday,start_time,end_time").eq("client_id", id).is("event_type_id", null).order("weekday"),
  ]);
  const connections = (conns ?? []) as CalendarConnection[];
  const eventTypes = (types ?? []) as EventType[];
  const byDay = new Map<number, AvailabilityRule[]>();
  (rules as AvailabilityRule[] | null)?.forEach((r) => byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]));
  const editing = eventTypes.find((t) => t.id === edit);
  const base = appUrl();
  const publicUrl = c.custom_domain ? `https://${c.custom_domain}` : `${base}/${c.slug}`;

  return (
    <div className="space-y-10">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm opacity-60 hover:underline">← Clientes</Link>
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          <p className="text-xs opacity-60">
            ID de calendario para la API: <code className="select-all">{c.id}</code>
          </p>
        </div>
        <a href={publicUrl} target="_blank" className="rounded-lg border px-3 py-1.5 text-sm">Ver página pública</a>
      </header>

      {connected && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Calendario conectado correctamente.</p>}
      {saved && SAVED_NOTICES[saved] && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{SAVED_NOTICES[saved]}</p>
      )}

      {/* 1. Calendarios conectados */}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">1. Calendario conectado</h2>
        <p className="mb-4 text-sm opacity-70">La cuenta de Google, Microsoft u otra donde se crearán las citas y se consultará la disponibilidad.</p>
        <ul className="mb-4 divide-y">
          {connections.map((k) => (
            <li key={k.id} className="flex items-center justify-between py-2 text-sm">
              <span><strong>{k.account_email}</strong> <span className="opacity-60">({k.provider})</span></span>
              <span className={k.status === "active" ? "text-green-700" : "text-red-600"}>{k.status === "active" ? "Activo" : "Requiere reconexión"}</span>
            </li>
          ))}
        </ul>
        <form action="/api/nylas/connect" method="get" className="flex gap-2">
          <input type="hidden" name="client_id" value={c.id} />
          <input name="email" type="email" placeholder="correo de la cuenta a conectar (opcional)" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
          <button className="rounded-lg bg-black px-4 py-2 text-sm text-white">Conectar calendario</button>
        </form>
      </section>

      {/* 2. Horario */}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">2. Horario de atención</h2>
        <p className="mb-4 text-sm opacity-70">
          Estas horas son la hora local de <strong>{zoneLabel(c.timezone)}</strong>, la zona del cliente. Puedes añadir un segundo tramo (por ejemplo, tarde).
        </p>
        {!isValidTimezone(c.timezone) && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            «{c.timezone}» no es una zona horaria válida, así que Nylas la ignora y trata estas horas como UTC:
            los horarios y los correos saldrán desplazados. Corrígela en la sección 4 y vuelve a pulsar «Actualizar en Nylas».
          </p>
        )}
        <form action={saveAvailability} className="space-y-2">
          <input type="hidden" name="client_id" value={c.id} />
          {ORDER.map((d) => {
            const r = byDay.get(d) ?? [];
            return (
              <div key={d} className="grid grid-cols-[110px_auto_auto_auto_auto_auto] items-center gap-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name={`on_${d}`} defaultChecked={r.length > 0} /> {DAYS[d]}</label>
                <input type="time" name={`start_${d}`} defaultValue={r[0]?.start_time.slice(0, 5) ?? "09:00"} className="rounded border px-2 py-1" />
                <input type="time" name={`end_${d}`} defaultValue={r[0]?.end_time.slice(0, 5) ?? "14:00"} className="rounded border px-2 py-1" />
                <span className="opacity-50">y</span>
                <input type="time" name={`start2_${d}`} defaultValue={r[1]?.start_time.slice(0, 5) ?? ""} className="rounded border px-2 py-1" />
                <input type="time" name={`end2_${d}`} defaultValue={r[1]?.end_time.slice(0, 5) ?? ""} className="rounded border px-2 py-1" />
              </div>
            );
          })}
          <div className="mt-2"><SubmitButton>Guardar horario</SubmitButton></div>
        </form>
      </section>

      {/* 3. Tipos de cita */}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">3. Tipos de cita</h2>
        <p className="mb-4 text-sm opacity-70">Cada tipo de cita tiene su propia página y su propio código de embed. Tras guardar o cambiar el horario, pulsa «Publicar» para que Nylas lo aplique.</p>
        <ul className="mb-6 divide-y">
          {eventTypes.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{t.name}</span> <span className="text-sm opacity-60">{t.duration_minutes} min · /{t.slug}</span>
                  <span className="ml-2 text-xs opacity-50">ID: <code className="select-all">{t.id}</code></span>
                  {!t.nylas_configuration_id && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Sin publicar</span>}
                </div>
                <div className="flex items-center gap-2">
                  <SyncButton eventTypeId={t.id} hasConfig={!!t.nylas_configuration_id} />
                  <Link href={`?edit=${t.id}`} className="rounded-lg border px-3 py-1.5 text-sm">Editar</Link>
                  <form action={deleteEventType}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="client_id" value={c.id} />
                    <SubmitButton pendingLabel="Desactivando…" className="rounded-lg border px-3 py-1.5 text-sm text-red-700">Desactivar</SubmitButton></form>
                </div>
              </div>
              {t.nylas_configuration_id && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer opacity-70">Link y código de embed</summary>
                  <div className="mt-2 space-y-2">
                    <p>Link para compartir: <a className="underline" href={`${publicUrl}/${t.slug}`} target="_blank">{publicUrl}/{t.slug}</a></p>
                    <p className="opacity-70">Embebido en la web (inline):</p>
                    <CopyBlock code={`<script src="${base}/embed.js" data-client="${c.slug}" data-event="${t.slug}"></script>`} />
                    <p className="opacity-70">Botón flotante que abre el calendario:</p>
                    <CopyBlock code={`<script src="${base}/embed.js" data-client="${c.slug}" data-event="${t.slug}" data-mode="popup" data-label="Reservar cita" data-color="${c.branding.primary_color ?? "#2563eb"}"></script>`} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>

        <form action={saveEventType} className="grid gap-3 rounded-lg bg-neutral-50 p-4 sm:grid-cols-2">
          <h3 className="font-medium sm:col-span-2">{editing ? `Editar: ${editing.name}` : "Nuevo tipo de cita"}</h3>
          <input type="hidden" name="client_id" value={c.id} />
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Nombre" name="name" required defaultValue={editing?.name} />
          <Field label="Slug (URL)" name="slug" defaultValue={editing?.slug} placeholder="auto" />
          <label className="block text-sm sm:col-span-2">Descripción
            <textarea name="description" defaultValue={editing?.description ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2" rows={2} />
          </label>
          <label className="block text-sm sm:col-span-2">Calendario donde se crea la cita
            <select name="calendar_connection_id" defaultValue={editing?.calendar_connection_id ?? connections[0]?.id ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2" required>
              {connections.map((k) => <option key={k.id} value={k.id}>{k.account_email}</option>)}
            </select>
          </label>
          <Field label="Duración (min)" name="duration_minutes" type="number" defaultValue={editing?.duration_minutes ?? 30} />
          <Field label="Intervalo entre horas ofrecidas (min)" name="slot_interval_minutes" type="number" defaultValue={editing?.slot_interval_minutes ?? 30} />
          <Field label="Margen antes (min)" name="buffer_before_minutes" type="number" defaultValue={editing?.buffer_before_minutes ?? 0} />
          <Field label="Margen después (min)" name="buffer_after_minutes" type="number" defaultValue={editing?.buffer_after_minutes ?? 0} />
          <Field label="Antelación mínima (horas)" name="min_notice_hours" type="number" defaultValue={editing ? editing.min_notice_minutes / 60 : 2} />
          <Field label="Reservas hasta (días adelante)" name="max_days_ahead" type="number" defaultValue={editing?.max_days_ahead ?? 60} />
          <label className="block text-sm">Modalidad
            <select name="location_type" defaultValue={editing?.location_type ?? "in_person"} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="in_person">Presencial</option><option value="phone">Teléfono</option><option value="video">Videollamada</option><option value="custom">Otra</option>
            </select>
          </label>
          <Field label="Dirección / detalle de ubicación" name="location_details" defaultValue={editing?.location_details ?? ""} />
          <QuestionsEditor key={editing?.id ?? "nueva"} initial={editing?.questions} />
          <div className="flex items-center gap-2 sm:col-span-2">
            <SubmitButton>{editing ? "Guardar cambios" : "Crear tipo de cita"}</SubmitButton>
            {editing && <Link href={`/admin/clients/${c.id}`} className="rounded-lg border px-4 py-2 text-sm">Cancelar</Link>}
          </div>
        </form>
      </section>

      {/* 4. Imagen */}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">4. Datos e imagen del cliente</h2>
        <form action={updateBranding} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={c.id} />
          <Field label="Nombre" name="name" defaultValue={c.name} />
          <TimezoneSelect value={c.timezone} />
          <Field label="Correo de contacto" name="contact_email" defaultValue={(client as { contact_email?: string }).contact_email ?? ""} />
          <Field label="Web del cliente" name="website_url" defaultValue={(client as { website_url?: string }).website_url ?? ""} />
          <Field label="Dominio propio (citas.cliente.com)" name="custom_domain" defaultValue={c.custom_domain ?? ""} />
          <Field label="URL del logo" name="logo_url" defaultValue={c.branding.logo_url ?? ""} />
          <Field label="Color principal" name="primary_color" type="color" defaultValue={c.branding.primary_color ?? "#2563eb"} />
          <Field label="Fondo" name="background" type="color" defaultValue={c.branding.background ?? "#ffffff"} />
          <Field label="Texto" name="text_color" type="color" defaultValue={c.branding.text_color ?? "#17181c"} />
          <Field label="Tipografía (CSS)" name="font_family" defaultValue={c.branding.font_family ?? ""} />
          <div className="flex items-center sm:col-span-2"><SubmitButton>Guardar</SubmitButton>
            <span className="ml-3 text-sm opacity-60">Los cambios de imagen se aplican al instante; el nombre y el logo también van a Nylas al volver a publicar.</span></div>
        </form>
      </section>
    </div>
  );
}
