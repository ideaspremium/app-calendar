import type { Branding } from "@/lib/types";

/** Marco visual de la página pública de un cliente: logo, colores, tipografía. */
export default function ClientFrame({
  branding, name, children, embedded,
}: { branding: Branding; name: string; children: React.ReactNode; embedded: boolean }) {
  const style = {
    "--brand": branding.primary_color ?? "#2563eb",
    "--brand-bg": branding.background ?? "#ffffff",
    "--brand-text": branding.text_color ?? "#17181c",
    fontFamily: branding.font_family,
  } as React.CSSProperties;

  return (
    <main
      style={style}
      className={embedded ? "bg-transparent" : "min-h-screen"}
      data-embedded={embedded}
    >
      <div className={embedded ? "" : "mx-auto max-w-4xl px-4 py-10"}>
        {!embedded && (
          <header className="mb-8 flex items-center gap-4">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={name} className="h-12 w-auto object-contain" />
            ) : (
              <span className="text-xl font-semibold" style={{ color: "var(--brand)" }}>{name}</span>
            )}
          </header>
        )}
        <section
          className={embedded ? "" : "rounded-2xl p-2 shadow-sm ring-1 ring-black/5"}
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
        >
          {children}
        </section>
      </div>
    </main>
  );
}
