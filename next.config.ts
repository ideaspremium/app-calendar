import type { NextConfig } from "next";

/** Dominio antiguo de Vercel (Premium Calendar): sigue activo durante la transición. */
const LEGACY_HOST = "app-calendar-gold.vercel.app";
const CANONICAL = (process.env.APP_URL || "https://calendars360.ai").replace(/\/$/, "");

const nextConfig: NextConfig = {
  /**
   * Ficha PC-02. Redirecciones permanentes (301) al dominio canónico:
   *  - www.calendars360.ai → calendars360.ai, siempre.
   *  - app-calendar-gold.vercel.app → calendars360.ai, solo con LEGACY_HOST_REDIRECT=1 en
   *    Vercel (se activa cuando todo esté verificado en el dominio nuevo).
   * Nunca se redirige /api/…: la API sigue respondiendo en los dos dominios durante la
   * transición y los avisos de Nylas (POST) no siguen redirecciones.
   * Los parámetros de la URL se conservan.
   */
  async redirects() {
    const rules = [
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host" as const, value: "www.calendars360.ai" }],
        destination: `${CANONICAL}/:path`,
        statusCode: 301 as const,
      },
    ];
    if (process.env.LEGACY_HOST_REDIRECT === "1") {
      rules.push({
        source: "/:path((?!api/).*)",
        has: [{ type: "host" as const, value: LEGACY_HOST }],
        destination: `${CANONICAL}/:path`,
        statusCode: 301 as const,
      });
    }
    return rules;
  },
  async headers() {
    return [
      {
        // La página pública debe poder cargarse en iframes de las webs de los clientes
        source: "/:client/:event*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
