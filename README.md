# Calendars360 (app-calendar)

Plataforma multi-agencia de reserva de citas 1 a 1 (antes «Premium Calendar»). Next.js 15 + Supabase (eu-west-3) + Nylas Scheduler (región EU), desplegada en Vercel.

- **Dominio:** `https://calendars360.ai` (`APP_URL`). El antiguo `app-calendar-gold.vercel.app` sigue activo en la transición; con `LEGACY_HOST_REDIRECT=1` redirige (301) al nuevo, salvo `/api/…`.
- **Sitio público:** `/` (inicio), `/privacidad` y `/terminos`. Los datos del titular están en `src/lib/legal.ts`.

## Estructura
- `/[client]` y `/[client]/[event]` — páginas públicas de reserva con branding por cliente. `?embed=1` quita el marco para uso en iframe.
- `/embed.js` — script de una línea para embeber (inline o popup) en la web del cliente.
- `/admin` — panel de agencia (en la interfaz, los `clients` se llaman **negocios**):
  - Inicio (resumen y pendientes), Citas (filtros, horas en tu zona o en la de cada negocio, ficha y CSV).
  - Negocios, con pestañas Resumen, Datos, Calendario y horario (días cerrados incluidos), Servicios, Imagen (estilo clásico o vidrio, logo subido) y Compartir.
  - Equipo (invitar por correo, papeles) y Ajustes de la agencia.
  - Necesita la migración [`docs/migraciones/2026-09-23-panel-agencias.sql`](docs/migraciones/2026-09-23-panel-agencias.sql) (funciones del equipo y espacio `logos`).
- `/api/nylas/connect|callback` — OAuth vía Nylas.
- `/api/nylas/webhook` — recibe `booking.*` y `grant.*` y los refleja en Supabase.
- `/api/event-types/[id]/sync` — crea/actualiza la Scheduler Configuration en Nylas.
- `/api/v1/*` — API servidor a servidor para integradores (Chatbots360): disponibilidad, crear, cancelar y reprogramar citas. Referencia completa en [`docs/api-v1.md`](docs/api-v1.md).
- `/cita/[token]` — enlace estable para que el visitante cancele o reprograme una cita creada por la API.

## Puesta en marcha
1. `npm install`
2. Copia `.env.example` a `.env.local` y completa las claves (Supabase anon + service role, Nylas API key, webhook secret).
3. En Supabase → Authentication → URL Configuration: añade `https://TU_DOMINIO/auth/callback` a Redirect URLs.
4. En Nylas → Application → Hosted Authentication: añade `https://TU_DOMINIO/api/nylas/callback` como callback URI.
5. En Nylas → Webhooks: crea uno hacia `https://TU_DOMINIO/api/nylas/webhook` con los triggers `booking.created`, `booking.cancelled`, `booking.rescheduled`, `grant.expired`, `grant.deleted`, `event.updated` y `event.deleted`. Copia el secret a `NYLAS_WEBHOOK_SECRET`.
6. Crea la primera agencia y añade tu usuario:
   ```sql
   insert into agencies (name, slug) values ('Ideas Premium', 'ideas-premium');
   insert into agency_members (agency_id, user_id, role)
     select id, '<TU_USER_ID_DE_AUTH>', 'owner' from agencies where slug='ideas-premium';
   ```
   Para ser super admin de todas las agencias: en Auth → Users → tu usuario → `app_metadata` añade `{"platform_admin": true}`.
7. `npm run dev` y entra en `/admin/login`.

## Flujo por negocio
Conectar calendario → definir horario → crear servicio → Publicar → copiar enlace o embed.

`GOOGLE_OAUTH_VERIFIED=1` en Vercel quita el aviso de «app de Google en modo de prueba» que ve la plataforma en Inicio.
