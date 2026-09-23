import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin/context";
import { agencyClients, BOOKING_SELECT, LIVE_STATUSES, readiness, type BookingRow } from "@/lib/admin/data";
import { dayShort, hm, LOCALE, monthStartUtc, zl } from "@/lib/admin/time";
import { formatInTimeZone } from "@/lib/datetime";
import { ClientTile, StatusPill } from "@/components/admin/bits";
import { I } from "@/components/admin/icons";
import LinkPending from "@/components/admin/LinkPending";

type Todo = { tone: "bad" | "warn" | "info"; title: React.ReactNode; sub: string; href?: string; cta?: string };

export default async function Inicio() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  if (!ctx.agency) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="cb">
          <h1 style={{ margin: "0 0 6px", fontSize: 20 }}>Tu usuario aún no pertenece a ninguna agencia</h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Pide a quien gestiona tu agencia que te invite desde <b>Equipo</b>. Entraste como {ctx.user.email}.
          </p>
        </div>
      </div>
    );
  }
  const agency = ctx.agency;
  const tz = ctx.viewerTz;
  const now = new Date();
  const monthStart = monthStartUtc(tz, now);
  const monthName = formatInTimeZone(now, tz, { month: "long" }, LOCALE);

  const clients = await agencyClients({ ...ctx, agency });
  const ids = clients.map((c) => c.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [{ data: next }, { count: week }, { data: month }, { count: cancelled }] = await Promise.all([
    ctx.sb.from("bookings").select(BOOKING_SELECT).in("client_id", ids.length ? ids : none).in("status", LIVE_STATUSES)
      .gte("start_at", now.toISOString()).order("start_at").limit(6),
    ctx.sb.from("bookings").select("id", { count: "exact", head: true }).in("client_id", ids.length ? ids : none).in("status", LIVE_STATUSES)
      .gte("start_at", now.toISOString()).lt("start_at", new Date(now.getTime() + 7 * 86_400_000).toISOString()),
    ctx.sb.from("bookings").select("source").in("client_id", ids.length ? ids : none).gte("created_at", monthStart.toISOString()),
    ctx.sb.from("bookings").select("id", { count: "exact", head: true }).in("client_id", ids.length ? ids : none).eq("status", "cancelled")
      .gte("cancelled_at", monthStart.toISOString()),
  ]);
  const upcoming = (next ?? []) as unknown as BookingRow[];
  const made = month ?? [];
  const api = made.filter((b) => b.source === "api").length;
  const ready = clients.filter((c) => readiness(c).ready).length;
  const active = clients.filter((c) => c.is_active).length;

  const todos: Todo[] = [];
  for (const c of clients) {
    const r = readiness(c);
    const href = (tab: string, extra = "") => `/admin/clients/${c.id}?tab=${tab}${extra}`;
    if (!r.zoneOk) todos.push({ tone: "bad", title: <><b>{c.name}</b> tiene una zona horaria no válida</>, sub: "Las horas saldrían en UTC hasta corregirla.", href: href("datos"), cta: "Corregir" });
    if (r.calendar === "missing") todos.push({ tone: "bad", title: <><b>{c.name}</b> no tiene calendario conectado</>, sub: "Sin calendario no se ofrecen horas.", href: href("calendario"), cta: "Conectar" });
    if (r.calendar === "reconnect") todos.push({ tone: "bad", title: <>El calendario de <b>{c.name}</b> necesita reconexión</>, sub: "Mientras tanto no se crean citas nuevas.", href: href("calendario"), cta: "Reconectar" });
    if (!r.hours) todos.push({ tone: "warn", title: <><b>{c.name}</b> no tiene horario de atención</>, sub: "Define qué días y horas atiende.", href: href("calendario"), cta: "Definir" });
    if (!r.services) todos.push({ tone: "warn", title: <><b>{c.name}</b> no tiene servicios</>, sub: "Crea al menos uno para tener página de reservas.", href: href("servicios", "&nuevo=1"), cta: "Crear" });
    for (const s of c.event_types.filter((t) => !t.nylas_configuration_id))
      todos.push({ tone: "warn", title: <><b>{s.name}</b> de {c.name} está sin publicar</>, sub: "No aparece en su página hasta publicarlo.", href: href("servicios"), cta: "Publicar" });
  }
  if (ctx.isPlatform && process.env.GOOGLE_OAUTH_VERIFIED !== "1") {
    todos.push({
      tone: "info",
      title: "La app de Google está en modo de prueba",
      sub: "Solo lo ves tú, como administradora de la plataforma: los calendarios de Google se desconectan cada 7 días hasta verificarla.",
    });
  }

  const hour = Number(formatInTimeZone(now, tz, { hour: "2-digit", hourCycle: "h23" }, "en-GB"));
  const hello = hour < 6 ? "Buenas noches" : hour < 13 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const byId = new Map(clients.map((c) => [c.id, c]));

  return (
    <>
      <div className="hd">
        <div>
          <h1>
            {hello}
            {ctx.user.name ? `, ${ctx.user.name}` : ""}
          </h1>
          <p>
            {agency.name} · {formatInTimeZone(now, tz, { weekday: "long", day: "numeric", month: "long" }, LOCALE)}
          </p>
        </div>
        {ctx.canManage && (
          <Link className="btn pri" href="/admin/clients/new">
            {I.plus}Nuevo negocio
            <LinkPending />
          </Link>
        )}
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="l">Próximas citas · 7 días</div>
          <div className="v">{week ?? 0}</div>
          <div className="d">
            {upcoming[0]
              ? `la siguiente, ${formatInTimeZone(upcoming[0].start_at, tz, { weekday: "long" }, LOCALE)} a las ${hm(upcoming[0].start_at, tz)}`
              : "ninguna por ahora"}
          </div>
        </div>
        <div className="kpi">
          <div className="l">Reservas en {monthName}</div>
          <div className="v">{made.length}</div>
          <div className="d">{made.length ? `${made.length - api} por la web · ${api} por la API` : "todavía ninguna"}</div>
        </div>
        <div className="kpi">
          <div className="l">Cancelaciones en {monthName}</div>
          <div className="v">{cancelled ?? 0}</div>
          <div className="d">{made.length ? `${cancelled ?? 0} de ${made.length} reservas` : "—"}</div>
        </div>
        <div className="kpi">
          <div className="l">Negocios activos</div>
          <div className="v">{active}</div>
          <div className="d">{clients.length ? `${ready} con todo listo para reservar` : "crea el primero"}</div>
        </div>
      </div>

      <div className="grid2">
        <section className="card">
          <div className="ch">
            <div>
              <h2>Próximas citas</h2>
              <p>
                Horas en {zl(tz)}, {ctx.viewerTzSource === "device" ? "tu zona" : "la zona de la agencia"}
              </p>
            </div>
            <Link className="btn ghost sm" href="/admin/citas">
              Ver todas {I.right}
              <LinkPending />
            </Link>
          </div>
          <div className="cb list">
            {upcoming.length === 0 && <p className="empty">No hay citas próximas.</p>}
            {upcoming.slice(0, 5).map((b) => (
              <Link className="it" key={b.id} href={`/admin/citas?cita=${b.id}`}>
                <div className="when">
                  <b>{hm(b.start_at, tz)}</b>
                  <small>{dayShort(b.start_at, tz)}</small>
                </div>
                <div className="who">
                  <b>{b.invitee_name}</b>
                  <small>
                    {b.clients?.name ?? byId.get(b.client_id)?.name} · {b.event_types?.name ?? "Servicio"}
                  </small>
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
              <h2>Pendientes</h2>
              <p>Lo que falta para que todos tus negocios puedan recibir reservas</p>
            </div>
          </div>
          <div className="cb todo">
            {todos.filter((t) => t.tone !== "info").length === 0 && (
              <div className="it">
                <span className="alldone">
                  {I.checkL}
                  {clients.length ? "Todo listo: tus negocios pueden recibir reservas." : "Crea tu primer negocio para empezar."}
                </span>
              </div>
            )}
            {todos.map((t, i) => (
              <div className="it" key={i}>
                <span className={`ic ${t.tone}`}>{t.tone === "info" ? I.globe : I.warn}</span>
                <div className="tx">
                  {t.title}
                  <small>{t.sub}</small>
                </div>
                {t.href && (
                  <Link className="btn sec sm" href={t.href}>
                    {t.cta}
                    <LinkPending />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {clients.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          {clients.map((c) => (
            <Link key={c.id} href={`/admin/clients/${c.id}`} className="btn sec" style={{ height: 44, paddingLeft: 6 }}>
              <ClientTile name={c.name} branding={c.branding} size={32} />
              {c.name}
              <LinkPending />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
