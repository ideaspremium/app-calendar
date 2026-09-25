import Link from "next/link";
import { requireAgency } from "@/lib/admin/context";
import { agencyClients, BOOKING_SELECT, bookingsQuery, type BookingRow, type BookingFilters } from "@/lib/admin/data";
import { dayLong, hm, LOCALE, zl } from "@/lib/admin/time";
import { formatInTimeZone } from "@/lib/datetime";
import { appUrl } from "@/lib/config";
import { cityName, isValidZone } from "@/lib/zones";
import AutoForm from "@/components/admin/AutoForm";
import { StatusPill } from "@/components/admin/bits";
import { CopyButton } from "@/components/admin/ui";
import { I } from "@/components/admin/icons";
import LinkPending from "@/components/admin/LinkPending";

export const metadata = { title: "Citas · Calendars360" };

type SP = BookingFilters & { zona?: string; cita?: string };
const LIMIT = 300;

function href(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, String(v));
  const s = p.toString();
  return `/admin/citas${s ? `?${s}` : ""}`;
}

const safeTz = (tz: string | null | undefined, fallback: string) => (isValidZone(tz) ? tz : fallback);

export default async function Citas({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireAgency();
  const clients = await agencyClients(ctx);
  const ids = clients.map((c) => c.id);
  const periodo = sp.periodo === "pasadas" || sp.periodo === "todas" ? sp.periodo : "proximas";
  const zona = sp.zona === "negocio" ? "negocio" : "mia";
  const me = ctx.viewerTz;

  const { data, error } = await bookingsQuery(ctx, ids, { ...sp, periodo }).limit(LIMIT + 1);
  const rows = ((data ?? []) as unknown as BookingRow[]).slice(0, LIMIT);
  const more = (data?.length ?? 0) > LIMIT;

  let open: BookingRow | null = null;
  if (sp.cita && /^[0-9a-f-]{36}$/i.test(sp.cita)) {
    open = rows.find((r) => r.id === sp.cita) ?? null;
    if (!open) {
      const { data: one } = await ctx.sb.from("bookings").select(BOOKING_SELECT).eq("id", sp.cita).in("client_id", ids.length ? ids : [sp.cita]).maybeSingle();
      open = (one as unknown as BookingRow) ?? null;
    }
  }

  const services = clients.flatMap((c) => c.event_types.map((t) => ({ id: t.id, label: clients.length > 1 ? `${t.name} · ${c.name}` : t.name, client: c.id })))
    .filter((s) => !sp.negocio || s.client === sp.negocio);
  const exportQs = new URLSearchParams(Object.entries({ q: sp.q, negocio: sp.negocio, servicio: sp.servicio, periodo, estado: sp.estado, zona }).filter(([, v]) => v) as [string, string][]).toString();

  let lastDay = "";
  const body: React.ReactNode[] = [];
  for (const b of rows) {
    const biz = safeTz(b.clients?.timezone, me);
    const shown = zona === "negocio" ? biz : me;
    const day = dayLong(b.start_at, shown);
    const key = `${day}|${zona === "negocio" ? biz : ""}`;
    if (key !== lastDay) {
      lastDay = key;
      body.push(
        <tr className="day" key={`d-${b.id}`}>
          <td colSpan={5}>
            {day}
            {zona === "negocio" && clients.length > 1 && <span style={{ fontWeight: 500, color: "var(--muted)" }}> · {zl(biz, b.start_at)}</span>}
          </td>
        </tr>,
      );
    }
    const other = zona === "negocio" ? me : biz;
    body.push(
      <tr className="row" key={b.id} style={{ position: "relative" }}>
        <td className="t" style={{ width: 190 }}>
          <Link href={href(sp, { cita: b.id })} scroll={false} style={{ position: "absolute", inset: 0 }} aria-label={`Ver la cita de ${b.invitee_name}`}><LinkPending /></Link>
          {hm(b.start_at, shown)} – {hm(b.end_at, shown)}
          <small>
            {zona === "negocio" ? zl(shown, b.start_at) : null}
            {other !== shown && (
              <>
                {zona === "negocio" ? " · " : ""}
                {hm(b.start_at, other)} {zona === "negocio" ? "para ti" : `en ${cityName(other)}`}
              </>
            )}
          </small>
        </td>
        <td className="n">
          <b>{b.invitee_name}</b>
          <small>{b.invitee_email}</small>
        </td>
        <td className="n">
          <b style={{ fontWeight: 500 }}>{b.clients?.name}</b>
          <small>{b.event_types?.name ?? "Servicio eliminado"}</small>
        </td>
        <td>
          <StatusPill status={b.status} />
        </td>
        <td>
          <span className="src">
            {b.source === "api" ? <>{I.api}API</> : <>{I.web}Web</>}
            {b.external_ref && <code>{b.external_ref}</code>}
          </span>
        </td>
      </tr>,
    );
  }

  return (
    <>
      <div className="hd">
        <div>
          <h1>Citas</h1>
          <p>Todas las citas de tus negocios, hechas desde su página o por la API.</p>
        </div>
        <a className="btn sec" href={`/admin/citas/export?${exportQs}`}>
          {I.download}Exportar CSV
        </a>
      </div>

      <AutoForm action="/admin/citas" className="filters">
        <input type="hidden" name="periodo" value={periodo} />
        {sp.estado && <input type="hidden" name="estado" value={sp.estado} />}
        {zona !== "mia" && <input type="hidden" name="zona" value={zona} />}
        <label className="inp" style={{ width: 260 }}>
          {I.search}
          <span className="sr">Buscar</span>
          <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Nombre, correo o referencia" />
        </label>
        {clients.length > 1 && (
          <select className="inp" name="negocio" defaultValue={sp.negocio ?? ""} aria-label="Negocio">
            <option value="">Todos los negocios</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select className="inp" name="servicio" defaultValue={sp.servicio ?? ""} aria-label="Servicio">
          <option value="">Todos los servicios</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <span className="seg2" role="group" aria-label="Período">
          {[["proximas", "Próximas"], ["pasadas", "Pasadas"], ["todas", "Todas"]].map(([k, l]) => (
            <Link key={k} href={href(sp, { periodo: k, cita: undefined })} className={periodo === k ? "on" : ""} scroll={false}>{l}<LinkPending /></Link>
          ))}
        </span>
        <span className="seg2" role="group" aria-label="Estado">
          {[["", "Todos los estados"], ["confirmed", "Confirmadas"], ["rescheduled", "Cambiadas"], ["cancelled", "Canceladas"]].map(([k, l]) => (
            <Link key={k || "all"} href={href(sp, { estado: k || undefined, cita: undefined })} className={(sp.estado ?? "") === k ? "on" : ""} scroll={false}>{l}<LinkPending /></Link>
          ))}
        </span>
        <span className="zoneTag">
          Horas en
          <span className="seg2" role="group" aria-label="Zona de las horas">
            <Link href={href(sp, { zona: undefined, cita: undefined })} className={zona === "mia" ? "on" : ""} scroll={false}>
              {ctx.viewerTzSource === "device" ? "Mi zona" : "Zona de la agencia"} · {zl(me)}
              <LinkPending />
            </Link>
            <Link href={href(sp, { zona: "negocio", cita: undefined })} className={zona === "negocio" ? "on" : ""} scroll={false}>Zona de cada negocio<LinkPending /></Link>
          </span>
        </span>
      </AutoForm>

      {error && <div className="notice bad">{I.warn}<div>No se pudieron cargar las citas: {error.message}</div></div>}

      <div className="card tbw">
        <table className="tb">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Persona</th>
              <th>Negocio y servicio</th>
              <th>Estado</th>
              <th>Origen</th>
            </tr>
          </thead>
          <tbody>
            {body.length ? body : (
              <tr>
                <td colSpan={5} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>
                  {sp.q || sp.estado || sp.servicio || sp.negocio ? "No hay citas con estos filtros." : periodo === "proximas" ? "No hay citas próximas." : "No hay citas."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {more && <div className="more">Se muestran las {LIMIT} primeras. Afina los filtros o exporta el CSV para verlas todas.</div>}
      </div>

      {open && <Drawer b={open} me={me} closeHref={href(sp, { cita: undefined })} />}
    </>
  );
}

function Drawer({ b, me, closeHref }: { b: BookingRow; me: string; closeHref: string }) {
  const biz = safeTz(b.clients?.timezone, me);
  const guest = safeTz(b.invitee_timezone, biz);
  const first = b.invitee_name.split(/\s+/)[0];
  const sameDay = (tz: string) => formatInTimeZone(b.start_at, tz, { dateStyle: "short" }, LOCALE) === formatInTimeZone(b.start_at, biz, { dateStyle: "short" }, LOCALE);
  const at = (tz: string) => (sameDay(tz) ? hm(b.start_at, tz) : `${formatInTimeZone(b.start_at, tz, { weekday: "short", day: "numeric", month: "short" }, LOCALE)}, ${hm(b.start_at, tz)}`);
  const qs = b.event_types?.questions ?? [];
  const answers = Object.entries(b.answers ?? {}).filter(([k, v]) => v !== null && v !== "" && !/correo|email/i.test(qs.find((q) => q.key === k)?.label ?? k));
  const phone = b.invitee_phone || (answers.find(([k]) => /tel|phone/i.test(k))?.[1] as string | undefined);
  const duration = Math.round((Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000);
  const link = b.manage_token ? `${appUrl()}/cita/${b.manage_token}` : null;

  return (
    <>
      <Link className="scrim" href={closeHref} scroll={false} aria-label="Cerrar" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Cita de ${b.invitee_name}`}>
        <Link className="x" href={closeHref} scroll={false} aria-label="Cerrar">{I.x}</Link>
        <StatusPill status={b.status} />
        <h2>{b.invitee_name}</h2>
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          {b.clients?.name} · {b.event_types?.name ?? "Servicio"} · {duration} min
        </div>

        <div className="box" style={{ marginTop: 18 }}>
          <div className="eyebrow">Cuándo</div>
          <b>
            {dayLong(b.start_at, biz)}, {hm(b.start_at, biz)} – {hm(b.end_at, biz)}
          </b>{" "}
          · {zl(biz, b.start_at)}, la zona del negocio
          {guest !== biz && (
            <>
              <br />
              Para {first}: <b>{at(guest)}</b> · {zl(guest, b.start_at)}
            </>
          )}
          {me !== biz && me !== guest && (
            <>
              <br />
              Para ti: <b>{at(me)}</b> · {zl(me, b.start_at)}
            </>
          )}
        </div>

        <dl className="dl">
          <dt>Correo</dt>
          <dd><a href={`mailto:${b.invitee_email}`} style={{ color: "var(--ink)" }}>{b.invitee_email}</a></dd>
          {phone && (<><dt>Teléfono</dt><dd>{String(phone)}</dd></>)}
          {answers.filter(([k]) => !/tel|phone/i.test(k)).map(([k, v]) => (
            <FragmentRow key={k} label={qs.find((q) => q.key === k)?.label ?? k.replace(/^q\d+_/, "").replace(/_/g, " ")} value={String(v)} />
          ))}
          {b.notes && (<><dt>Notas</dt><dd>{b.notes}</dd></>)}
          <dt>Origen</dt>
          <dd>{b.source === "api" ? <>API{b.external_ref && <> · <code>{b.external_ref}</code></>}</> : "Página de reservas"}</dd>
          <dt>Reservada</dt>
          <dd>{formatInTimeZone(b.created_at, me, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, LOCALE)} · {cityName(me)}</dd>
          {b.status === "cancelled" && b.cancelled_at && (
            <>
              <dt>Cancelada</dt>
              <dd>
                {formatInTimeZone(b.cancelled_at, me, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, LOCALE)} · {cityName(me)}
                {b.cancel_reason && <><br /><span className="small">«{b.cancel_reason}»</span></>}
              </dd>
            </>
          )}
        </dl>

        <div className="foot">
          {link && b.status !== "cancelled" && <CopyButton text={link} label="Copiar enlace para la persona" title="Enlace para que la persona cambie o cancele su cita" />}
          <a className="btn sec sm" href={`mailto:${b.invitee_email}`}>{I.mail}Escribir</a>
        </div>
        <p className="small" style={{ marginTop: 18 }}>
          Cambiar o cancelar desde el panel queda para la siguiente fase; de momento lo hace la persona con su enlace, o el negocio en su calendario.
        </p>
      </aside>
    </>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

