import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgency } from "@/lib/admin/context";
import { BOOKING_SELECT, LIVE_STATUSES, readiness, type BookingRow } from "@/lib/admin/data";
import { dayShort, hm, isoDayIn, zl } from "@/lib/admin/time";
import { appUrl } from "@/lib/config";
import type { AvailabilityRule, CalendarConnection, Client, EventType } from "@/lib/types";
import { isValidZone } from "@/lib/zones";
import { StatusPill } from "@/components/admin/bits";
import { CopyButton, Notice } from "@/components/admin/ui";
import { I } from "@/components/admin/icons";
import DataForm from "@/components/admin/negocio/DataForm";
import HoursEditor from "@/components/admin/negocio/HoursEditor";
import ClosedDays from "@/components/admin/negocio/ClosedDays";
import Services from "@/components/admin/negocio/Services";
import ImageEditor from "@/components/admin/negocio/ImageEditor";
import Share from "@/components/admin/negocio/Share";
import LinkPending from "@/components/admin/LinkPending";

const TABS = [
  ["resumen", "Resumen"],
  ["datos", "Datos"],
  ["calendario", "Calendario y horario"],
  ["servicios", "Servicios"],
  ["imagen", "Imagen"],
  ["compartir", "Compartir"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function Negocio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; connected?: string; creado?: string; edit?: string; nuevo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireAgency();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: row } = await ctx.sb.from("clients").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const c = { ...(row as Client), branding: (row as Client).branding ?? {} } as Client & { contact_email: string | null; website_url: string | null };
  const tz = isValidZone(c.timezone) ? c.timezone : "UTC";
  const today = isoDayIn(tz);

  const [{ data: conns }, { data: types }, { data: rules }, { data: overrides }, { data: next }] = await Promise.all([
    ctx.sb.from("calendar_connections").select("*").eq("client_id", id).order("created_at"),
    ctx.sb.from("event_types").select("*").eq("client_id", id).eq("is_active", true).order("name"),
    ctx.sb.from("availability_rules").select("weekday,start_time,end_time").eq("client_id", id).is("event_type_id", null).order("weekday").order("start_time"),
    ctx.sb.from("availability_overrides").select("id,date,note,start_time,end_time,event_type_id").eq("client_id", id).gte("date", today).order("date"),
    ctx.sb.from("bookings").select(BOOKING_SELECT).eq("client_id", id).in("status", LIVE_STATUSES).gte("start_at", new Date().toISOString()).order("start_at").limit(5),
  ]);
  const connections = (conns ?? []) as CalendarConnection[];
  const services = (types ?? []) as EventType[];
  const hours = (rules ?? []) as AvailabilityRule[];
  const closed = (overrides ?? []) as { id: string; date: string; note: string | null; start_time: string | null; event_type_id: string | null }[];
  const upcoming = (next ?? []) as unknown as BookingRow[];
  const r = readiness({ calendar_connections: connections, availability_rules: hours, event_types: services, timezone: c.timezone });

  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "resumen") as Tab;
  const base = appUrl();
  const pageUrl = c.custom_domain ? `https://${c.custom_domain}` : `${base}/${c.slug}`;
  const pageLabel = pageUrl.replace(/^https?:\/\//, "");

  return (
    <>
      <Link className="crumb" href="/admin/clients">{I.left}Negocios<LinkPending /></Link>
      <div className="hd" style={{ marginBottom: 14 }}>
        <div>
          <h1>{c.name}</h1>
          <p>{pageLabel}</p>
        </div>
        <div className="acts">
          <CopyButton text={pageUrl} label="Copiar enlace" className="btn sec" />
          <a className="btn sec" href={pageUrl} target="_blank" rel="noreferrer">{I.ext}Ver página</a>
        </div>
      </div>

      {sp.connected && <Notice kind="ok">Calendario conectado. Si ya tenías servicios publicados, vuelve a publicarlos para que usen esta cuenta.</Notice>}
      {sp.creado && <Notice kind="ok">Negocio creado. Siguiente paso: conectar su calendario y poner su horario.</Notice>}
      {!isValidZone(c.timezone) && (
        <Notice kind="bad">
          «{c.timezone}» no es una zona horaria válida, así que Nylas la ignora y calcula las horas en UTC. Corrígela en <Link href="?tab=datos" style={{ textDecoration: "underline" }}>Datos</Link>.
        </Notice>
      )}

      <nav className="tabs" aria-label="Secciones del negocio">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`?tab=${k}`} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} scroll={false}>
            {l}
            <LinkPending />
          </Link>
        ))}
      </nav>

      {tab === "resumen" && (
        <div className="stack">
          <section className="card">
            <div className="ch">
              <div>
                <h2>Puesta en marcha</h2>
                <p>Cuando los cuatro estén en verde, el negocio puede recibir reservas.</p>
              </div>
            </div>
            <div className="cb steps">
              <Step ok={r.calendar === "ok"} title="Calendario" sub={r.calendar === "ok" ? `${connections.find((k) => k.status === "active")?.provider === "microsoft" ? "Outlook" : "Google"} · activo` : r.calendar === "reconnect" ? "Necesita reconexión" : "Sin conectar"} href="?tab=calendario" />
              <Step ok={r.hours} title="Horario" sub={r.hours ? summaryHours(hours) : "Sin definir"} href="?tab=calendario" />
              <Step ok={r.published > 0} title="Servicios" sub={r.services ? `${r.published} de ${r.services} publicados` : "Ninguno"} href="?tab=servicios" />
              <Step ok title="Imagen" sub={c.branding.style === "vidrio" ? "Estilo vidrio" : "Estilo clásico"} href="?tab=imagen" />
            </div>
          </section>
          <div className="grid2">
            <section className="card">
              <div className="ch">
                <div>
                  <h2>Próximas citas</h2>
                  <p>Horas de {zl(tz)}, la zona del negocio</p>
                </div>
                <Link className="btn ghost sm" href={`/admin/citas?negocio=${c.id}`}>Ver todas {I.right}<LinkPending /></Link>
              </div>
              <div className="cb list">
                {upcoming.length === 0 && <p className="empty">Todavía no hay citas próximas.</p>}
                {upcoming.map((b) => (
                  <Link className="it" key={b.id} href={`/admin/citas?cita=${b.id}&negocio=${c.id}&zona=negocio`}>
                    <div className="when">
                      <b>{hm(b.start_at, tz)}</b>
                      <small>{dayShort(b.start_at, tz)}</small>
                    </div>
                    <div className="who">
                      <b>{b.invitee_name}</b>
                      <small>{b.event_types?.name}</small>
                    </div>
                    <StatusPill status={b.status} />
                    <LinkPending />
                  </Link>
                ))}
              </div>
            </section>
            <section className="card">
              <div className="ch">
                <div>
                  <h2>Para la API</h2>
                  <p>Identificadores que usa Premium Chatbots.</p>
                </div>
              </div>
              <div className="cb ids">
                <div>
                  <label>ID de calendario del negocio</label>
                  <div className="copyrow">
                    <span className="inp mono">{c.id}</span>
                    <CopyButton text={c.id} label="" className="btn sec sm ico" />
                  </div>
                </div>
                {services.map((s) => (
                  <div key={s.id}>
                    <label>Servicio «{s.name}»</label>
                    <div className="copyrow">
                      <span className="inp mono">{s.id}</span>
                      <CopyButton text={s.id} label="" className="btn sec sm ico" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === "datos" && (
        <DataForm
          canEdit={ctx.canManage}
          businessId={c.business_id ?? null}
          host={base.replace(/^https?:\/\//, "")}
          client={{
            id: c.id, name: c.name, slug: c.slug, timezone: c.timezone, locale: c.locale,
            contact_email: c.contact_email ?? "", website_url: c.website_url ?? "", custom_domain: c.custom_domain ?? "",
          }}
        />
      )}

      {tab === "calendario" && (
        <div className="grid2 g12">
          <div className="stack">
            <section className="card">
              <div className="ch">
                <div>
                  <h2>Calendario conectado</h2>
                  <p>Donde se crean las citas y se miran los huecos ocupados.</p>
                </div>
              </div>
              <div className="cb stack" style={{ gap: 14 }}>
                {connections.map((k) => (
                  <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", boxShadow: "inset 0 0 0 1px var(--line)", flex: "none" }}>
                      {k.provider === "google" ? I.google : I.cal}
                    </span>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <b>{k.provider === "google" ? "Google Calendar" : k.provider === "microsoft" ? "Outlook" : k.provider}</b>
                      <div style={{ fontSize: 13, color: "var(--muted)", overflowWrap: "anywhere" }}>{k.account_email}</div>
                    </div>
                    {k.status === "active" ? <span className="pill p-ok">{I.check}Activo</span> : <span className="pill p-bad">{I.warn}Requiere reconexión</span>}
                    <form action="/api/nylas/connect" method="get">
                      <input type="hidden" name="client_id" value={c.id} />
                      <input type="hidden" name="email" value={k.account_email} />
                      <button className="btn sec sm">Reconectar</button>
                    </form>
                  </div>
                ))}
                <form action="/api/nylas/connect" method="get" className="row2">
                  <input type="hidden" name="client_id" value={c.id} />
                  {connections.length === 0 && (
                    <input name="email" type="email" className="inp" style={{ flex: "1 1 220px" }} placeholder="Correo de la cuenta (opcional)" aria-label="Correo de la cuenta a conectar" />
                  )}
                  <button className={connections.length ? "btn ghost sm" : "btn pri"}>
                    {connections.length ? <>{I.plus}Conectar otra cuenta</> : <>{I.google}Conectar Google</>}
                  </button>
                </form>
                {connections.length === 0 && <small className="hint">Se abre la pantalla de Google para dar permiso. Outlook, más adelante.</small>}
              </div>
            </section>
            <HoursEditor clientId={c.id} zoneLabel={zl(tz)} initial={hours.map((h) => ({ weekday: h.weekday, start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) }))} />
          </div>
          <ClosedDays clientId={c.id} today={today} items={closed.filter((o) => !o.event_type_id && !o.start_time).map((o) => ({ id: o.id, date: o.date, note: o.note }))} />
        </div>
      )}

      {tab === "servicios" && (
        <Services
          client={{ id: c.id, slug: c.slug, brand: c.branding.primary_color || "#5b3fe0", pageUrl }}
          connections={connections.map((k) => ({ id: k.id, email: k.account_email, active: k.status === "active" }))}
          services={services}
          editId={sp.edit ?? null}
          startNew={!!sp.nuevo}
        />
      )}

      {tab === "imagen" && (
        <ImageEditor
          canEdit={ctx.canManage}
          client={{ id: c.id, name: c.name, branding: c.branding }}
          sample={services.find((s) => s.nylas_configuration_id) ?? services[0] ?? null}
          previewUrl={services.find((s) => s.nylas_configuration_id) ? `${pageUrl}/${services.find((s) => s.nylas_configuration_id)!.slug}` : pageUrl}
        />
      )}

      {tab === "compartir" && (
        <Share
          base={base}
          pageUrl={pageUrl}
          client={{ slug: c.slug, brand: c.branding.primary_color || "#5b3fe0" }}
          services={services.filter((s) => s.nylas_configuration_id).map((s) => ({ name: s.name, slug: s.slug }))}
        />
      )}
    </>
  );
}

function Step({ ok, title, sub, href }: { ok: boolean; title: string; sub: string; href: string }) {
  return (
    <Link className="step" href={href} scroll={false}>
      <span className={`ic ${ok ? "ok" : "warn"}`}>{ok ? I.check : I.warn}</span>
      <div>
        {title}
        <small>{sub}</small>
      </div>
      <LinkPending />
    </Link>
  );
}

const SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
/** «Lun–Vie · 09:00–15:00» o, si no es tan regular, los días que abre. */
function summaryHours(rules: AvailabilityRule[]): string {
  const byDay = new Map<number, string>();
  for (const r of rules) byDay.set(r.weekday, `${byDay.get(r.weekday) ? byDay.get(r.weekday) + ", " : ""}${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`);
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => byDay.has(d));
  if (!days.length) return "Sin definir";
  const first = byDay.get(days[0])!;
  const same = days.every((d) => byDay.get(d) === first);
  const run = days.length > 1 && days.every((d, i) => i === 0 || [1, 2, 3, 4, 5, 6, 0].indexOf(d) === [1, 2, 3, 4, 5, 6, 0].indexOf(days[i - 1]) + 1);
  const label = run ? `${SHORT[days[0]]}–${SHORT[days[days.length - 1]]}` : days.map((d) => SHORT[d]).join(", ");
  return same ? `${label} · ${first}` : `${label} · horario variable`;
}
