/** Valores públicos (no secretos). Pueden sobrescribirse por variables de entorno. */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ttdbqismzlolphdwcxnu.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0ZGJxaXNtemxvbHBoZHdjeG51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NDI4NjIsImV4cCI6MjEwNTAxODg2Mn0.je5U9cXQufFtkAApG-OuqkeLudHwOcC19gE4BEPD3n4";

/** URL pública de la app, sin barra final. Prioridad: APP_URL > dominio de producción de Vercel > URL del despliegue. */
export function appUrl(): string {
  const explicit = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const dep = process.env.VERCEL_URL;
  if (dep) return `https://${dep}`;
  return "http://localhost:3000";
}
