"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, switchAgency } from "@/app/admin/actions";
import { I, initials } from "./icons";
import { cityName, isValidZone } from "@/lib/zones";
import LinkPending, { FormPending } from "./LinkPending";

type AgencyItem = { id: string; name: string; timezone: string };

type Props = {
  children: React.ReactNode;
  email: string;
  agencies: AgencyItem[];
  current: (AgencyItem & { clients: number }) | null;
  isPlatform: boolean;
  roleLabel: string;
  upcoming: number;
  deviceTz: string | null;
};

const NAV = [
  { href: "/admin", label: "Inicio", icon: I.home, match: (p: string) => p === "/admin" },
  { href: "/admin/citas", label: "Citas", icon: I.cal, match: (p: string) => p.startsWith("/admin/citas") },
  { href: "/admin/clients", label: "Negocios", icon: I.brief, match: (p: string) => p.startsWith("/admin/clients") },
  { href: "/admin/equipo", label: "Equipo", icon: I.users, match: (p: string) => p.startsWith("/admin/equipo") },
  { href: "/admin/ajustes", label: "Ajustes", icon: I.cog, match: (p: string) => p.startsWith("/admin/ajustes") || p.startsWith("/admin/agencias") },
];

/**
 * Guarda en una cookie la zona del dispositivo para que el servidor (que corre en UTC)
 * pueda enseñar las horas «en mi zona». Solo refresca si cambia.
 */
function TzSync({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let tz: string | null = null;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* sin zona: se usa la de la agencia */
    }
    if (tz && isValidZone(tz) && tz !== current) {
      document.cookie = `pc_tz=${tz}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [current, router]);
  return null;
}

function AgencySwitch({ agencies, current, isPlatform, compact = false }: { agencies: AgencyItem[]; current: Props["current"]; isPlatform: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!current) return null;
  const many = agencies.length > 1 || isPlatform;
  return (
    <div className="ag" ref={root}>
      <button type="button" onClick={() => many && setOpen((o) => !o)} aria-haspopup={many ? "menu" : undefined} aria-expanded={open}>
        <span className="av">{initials(current.name)}</span>
        <span className="nm">
          <span>{current.name}</span>
          {!compact && (
            <small>
              {current.clients} {current.clients === 1 ? "negocio" : "negocios"} · {isValidZone(current.timezone) ? cityName(current.timezone) : current.timezone}
            </small>
          )}
        </span>
        {many && I.down}
      </button>
      {open && (
        <div className="menu" role="menu">
          <form action={switchAgency}>
            {agencies.map((a) => (
              <button key={a.id} name="agency_id" value={a.id} role="menuitem">
                <span className="av">{initials(a.name)}</span>
                <span style={{ flex: 1 }}>{a.name}</span>
                {a.id === current.id && I.check}
              </button>
            ))}
            <FormPending />
          </form>
          {isPlatform && (
            <>
              <hr />
              <Link href="/admin/agencias/nueva" className="new" role="menuitem" onClick={() => setOpen(false)}>
                {I.plus} Crear agencia <span className="pill p-v xs" style={{ marginLeft: "auto" }}>plataforma</span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Shell({ children, email, agencies, current, isPlatform, roleLabel, upcoming, deviceTz }: Props) {
  const path = usePathname() || "/admin";
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  const name = email.split("@")[0];

  return (
    <div className="adm">
      <div className="mesh" aria-hidden="true" />
      <TzSync current={deviceTz} />

      <aside className="side" aria-label="Menú del panel">
        <div className="brand">
          <span className="lg">{I.logo}</span>
          <div>
            <b>Premium Calendar</b>
            <small>Panel de agencia</small>
          </div>
        </div>
        <AgencySwitch agencies={agencies} current={current} isPlatform={isPlatform} />
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={n.match(path) ? "on" : ""} aria-current={n.match(path) ? "page" : undefined}>
              {n.icon}
              {n.label}
              {n.href === "/admin/citas" && upcoming > 0 && <span className="cnt" title="Próximas citas en 7 días">{upcoming}</span>}
              <LinkPending />
            </Link>
          ))}
        </nav>
        <div className="me">
          <span className="avm">{(name[0] || "·").toUpperCase()}</span>
          <div className="t">
            {roleLabel}
            <small title={email}>{email}</small>
          </div>
          <form action={signOut}>
            <button type="submit">Salir</button>
            <FormPending />
          </form>
        </div>
      </aside>

      <header className="mtop">
        <span className="brand">
          <span className="lg">{I.logo}</span>
        </span>
        <AgencySwitch agencies={agencies} current={current} isPlatform={isPlatform} compact />
      </header>

      <main className="main" id="contenido">
        {children}
      </main>

      <nav className="mbar" aria-label="Menú del panel">
        {NAV.slice(0, 3).map((n) => (
          <Link key={n.href} href={n.href} className={n.match(path) ? "on" : ""} aria-current={n.match(path) ? "page" : undefined}>
            {n.icon}
            {n.label}
            <LinkPending />
          </Link>
        ))}
        <button type="button" className={more || NAV.slice(3).some((n) => n.match(path)) ? "on" : ""} onClick={() => setMore((m) => !m)} aria-expanded={more}>
          {I.more}
          Más
        </button>
      </nav>
      {more && (
        <>
          <div className="scrim" style={{ background: "transparent", backdropFilter: "none", zIndex: 24 }} onClick={() => setMore(false)} />
          <div className="msheet" role="menu">
            {NAV.slice(3).map((n) => (
              <Link key={n.href} href={n.href} role="menuitem">
                {n.icon}
                {n.label}
                <LinkPending />
              </Link>
            ))}
            <form action={signOut}>
              <button type="submit" role="menuitem">
                {I.out}
                Salir · <span className="small">{email}</span>
              </button>
              <FormPending />
            </form>
          </div>
        </>
      )}
    </div>
  );
}
