import { STATUS } from "@/lib/admin/data";
import type { Branding } from "@/lib/types";
import { I, initials } from "./icons";

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "p-n", icon: "clock" as const };
  return (
    <span className={`pill ${s.cls}`}>
      {I[s.icon]}
      {s.label}
    </span>
  );
}

/** Logo del negocio, o sus iniciales con su color. */
export function ClientTile({ name, branding, size = 44 }: { name: string; branding: Branding; size?: number }) {
  const brand = branding.primary_color || "#5b3fe0";
  return (
    <span
      className="tile"
      style={{ width: size, height: size, borderRadius: Math.round(size / 3.2), background: branding.logo_url ? "#fff" : `color-mix(in srgb, ${brand} 16%, #fff)`, color: `color-mix(in srgb, ${brand} 75%, #000)` }}
    >
      {branding.logo_url ? <img src={branding.logo_url} alt="" /> : initials(name)}
    </span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="cb" style={{ textAlign: "center", padding: "44px 24px" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 17 }}>{title}</h2>
        {children && <p style={{ color: "var(--muted)", margin: "0 auto 16px", maxWidth: 520 }}>{children}</p>}
        {action}
      </div>
    </div>
  );
}
