# Xtrategy360 · Decisiones cerradas de arquitectura (v1.2)

**Fecha:** 22 de septiembre de 2026 · **Propietario:** Ideas Premium Solutions (IPS)
**Alcance:** Xtrategy360 y las reglas de la suite que afectan a Xplore360, Premium Chatbots y Premium Calendar.

> Este documento recoge las **reglas no reabribles**: decisiones tomadas por la dirección del proyecto que ninguna sesión de Claude, Claude Code ni desarrollador debe cuestionar ni cambiar durante la construcción, salvo que Alejandro (IPS) las reabra expresamente. Debe estar presente en los cuatro proyectos de la suite y en el repositorio de cada app. Si una regla cambia, se cambia aquí primero y se sube la versión.

---

## 1. Qué es Xtrategy360

Plataforma central de **inteligencia, estrategia, medición y optimización de marketing** de la suite de IPS. Comprende el negocio del cliente (Marketing Brain), cruza el diagnóstico de Xplore360 con los datos reales de desempeño, formula una estrategia priorizada y versionada, la convierte en campañas medibles y aprende de los resultados.

Producto de **IPS**, con **marca blanca por agencia**. Feeling Comunicación es la agencia piloto, con **3 negocios a activar de inmediato**.

Xtrategy360 **posee la inteligencia** (Marketing Brain, Strategy Engine, priorización, Campaign Planning, Insights & Optimization, Strategy Review). Las capacidades estandarizadas se compran o las prestan las demás apps de la suite.

## 1-bis. Nombres y dominios de la suite *(1.2)*

| App | Nombre comercial | Dominio | Nombre anterior (interno en dosieres y código) |
|---|---|---|---|
| Diagnóstico | **Xplore360** | `xplore360.ai` (front en `auditorias.xplore360.ai`) | — |
| Plataforma central | **Xtrategy360** | `xtrategy360.ai` (por reservar) | — |
| Reservas | **Calendars360** | `calendars360.ai` | Premium Calendar |
| Chatbots | **Chatbots360** | `chatbots360.ai` | Premium Chatbots |
| Contenidos (Fase 2) | **Creators360** | `creators360.ai` (por reservar) | Generador de contenidos |

Reglas: los nombres comerciales cambian; **no cambian** los identificadores internos (`app` en `business_links`: `calendar`, `chatbots`; prefijos de clave `pc_live_`, `xt_live_`, `xp_live_`; slugs; `business_id`). Los dominios se activan **antes** de instalar widgets o embeds en las webs de los negocios, para no tener que volver a tocarlas. La verificación de Google OAuth de Calendars360 se hace sobre `calendars360.ai`; una vez enviada, el dominio no se cambia.

## 2. Vocabulario de la suite

| Término | Significado | Identificador |
|---|---|---|
| **Plataforma** | IPS, dueña de todas las apps | rol `platform_admin` |
| **Agencia** | Quien usa la suite para sus clientes (Feeling, The Minty Lab…) | `agency_slug` canónico (ver §5) |
| **Negocio** | La empresa prospecto o cliente de una agencia (clínica, taller, restaurante) | `business_id` |
| **Lead** | La **persona** que capta un chatbot o reserva una cita; pertenece a un negocio | `leads.id` (Chatbots), `booking.id` (Calendar) |
| **Campaña** | Unidad de ejecución y atribución en Xtrategy360 | `campaign_id` |
| **Activo** | Post, anuncio, landing, email u otro elemento de una campaña | `asset_id` |

No usar "lead" para referirse a un negocio prospecto de la agencia, ni "cliente" sin aclarar si es el de la agencia (negocio) o el del negocio (lead/consumidor final).

## 3. Modelo de tenant

- Tres niveles en todas las apps: **plataforma → agencias → negocios**. Xtrategy360 nace multi-agencia aunque empiece con una.
- **Un negocio pertenece a una sola agencia.** Dos agencias no pueden auditar ni trabajar el mismo `business_id`. Xplore360 registra la agencia propietaria del negocio y bloquea o marca en conflicto cualquier auditoría de otra agencia.
- Roles de Xtrategy360: `platform_admin`, `agency_admin`, `strategist`, `client_admin`, `client_viewer`.
- **IPS tiene dos papeles distintos.** Como plataforma es el rol `platform_admin`, sin pertenecer a ninguna agencia (en Chatbots, `profile` con `agency_id` nulo; en Xtrategy360, claim en `app_metadata`). Como agencia, cuando opera negocios propios, existe con el slug `ideas-premium` **solo en las apps donde tiene negocios**; no es obligatorio crearla en todas.
- **RLS en todas las tablas desde la primera migración**, con helpers `security definer`, claim `platform_admin` en `app_metadata` y `pending_invites` con trigger sobre `auth.users` (patrones ya probados en Premium Calendar).
- La **marca blanca** aplica solo a lo que llega al cliente final (informes de Xplore360, dashboards, correos, vista cliente). Los paneles internos llevan marca IPS.

## 4. Identidad del negocio: `business_id`

- Lo **emite Xplore360** en la primera auditoría, antes de que el negocio compre nada. Xtrategy360 y las demás apps **consumen**, nunca emiten.
- Formato y resolución según `CONTRATO_BUSINESS_ID` (UUID v4, inmutable, cascada dominio → alias → `place_id` → nombre+zona).
- **Xtrategy360 es el hub de correspondencias**: relaciona `business_id` con `chatbots.tenant_id`, `calendar.client_id` y las auditorías de Xplore360. Chatbots y Calendar añaden la columna `business_id` a `tenants` y `clients` respectivamente.
- La emisión por un CRM de agencia queda **descartada por ahora**. El contrato conserva el mecanismo de aceptar un id externo por si se reabre.
- **Única excepción documentada:** el negocio de pruebas de integración `integracion` (agencia `ideas-premium`) usa el `business_id` reservado `00000000-0000-4000-8000-000000000001`, no emitido por Xplore360. Existe solo para probar la ingesta de extremo a extremo con el tenant `xtrategy-integracion` de Premium Chatbots. Ningún otro negocio puede crearse así.

## 5. Identidad de la agencia: `agency_slug`

Cada agencia tiene un **slug canónico** idéntico en las cuatro apps (`ideas-premium`, `feeling`, `minty-lab`). Inmutable. Es la clave con la que Xtrategy360 relaciona los `agency_id` internos de cada app.

## 6. Región y cumplimiento

- **Todo en Europa**: Supabase `eu-west-3` (París), funciones de Vercel fijadas en `cdg1`, proveedores de IA con endpoints/regiones europeas cuando existan. Confirmado el 23/09/2026 que los cuatro proyectos Supabase de la suite (Xplore360, Premium Chatbots, Premium Calendar y Xtrategy360) están o estarán en `eu-west-3`.
- Todo proveedor externo que reciba datos de clientes (Windsor, AgencyAnalytics, Metricool, Anthropic…) requiere DPA firmado y verificación de dónde aloja los datos.

## 7. Patrón de acceso entre apps

Cada app tiene su **propio proyecto Supabase**. Ninguna app accede a las tablas de otra.

| Tipo de operación | Mecanismo | Ejemplos |
|---|---|---|
| **Lecturas y marcado de sincronización** | Vista versionada (`_v1`) + rol Postgres dedicado con permisos mínimos, **servida por PostgREST** (HTTPS). Nunca conexión directa a Postgres | Leads pendientes de Chatbots; auditorías y dossier de Xplore360 |
| **Acciones y escrituras con reglas de negocio** | API HTTP propia de la app, con clave por consumidor, idempotencia y errores con código estable | Crear/cancelar reserva en Calendar; resolver negocio en Xplore360 |
| **Orquestación** | n8n dispara, programa y notifica. **No es vía de datos entre apps** ni repositorio de lógica de negocio | Cron, reintentos, avisos |

- **Nunca** se comparte la `service_role` de un proyecto con otra app.
- Una credencial por consumidor, revocable, guardada en variables de entorno del consumidor (Vercel) o Supabase Vault. Nunca en Airtable, ni en código, ni en chats.
- Secretos compartidos tipo `x-feeling-secret` se migran a **claves por app** (hash SHA-256, prefijo, `revoked_at`), modelo ya implementado en Premium Calendar.
- Webhooks entrantes a Xtrategy360: firma **HMAC-SHA256** con timestamp (`t=<epoch>,v1=<firma>`), rechazo si `t` supera 5 minutos. Formato ya usado por Premium Calendar.

## 8. Flujo de datos hacia Xtrategy360

- **Pull idempotente** desde Xtrategy360 (cron de Vercel cada 5 minutos) para leads (Chatbots) y reservas (Calendar), con cursor por fuente y clave única `(source, source_id)`. Los webhooks de Calendar actúan como acelerador; el pull es la red de seguridad.
- El **dossier estructurado** de Xplore360 (`CONTRATO_DOSSIER` v1.1) es la **única** entrada del diagnóstico. Xtrategy360 **no interpreta `informe_md`** con IA en ningún caso. El dossier se genera en todas las auditorías e incluye `business_id`.
- Datos de plataformas publicitarias y analítica: **Windsor.ai Standard → PostgreSQL de Xtrategy360** (Supabase). Fuentes iniciales: Google Ads, Meta Ads, GA4, Search Console, Google Business Profile, herramienta de email marketing (por definir). Séptimo hueco reservado (LinkedIn, pendiente).
- Analítica orgánica de redes (Instagram, Facebook, TikTok, LinkedIn, YouTube): **Metricool** (cuenta de Feeling en Fase 1) → Supabase vía n8n.
- Los datos de los leads no llegan validados (email, teléfono). Xtrategy360 valida y normaliza (E.164) **sin descartar** ningún lead.
- Ninguna hora se muestra sin declarar zona. Instantes en `timestamptz`, horarios de reloj en `time`. Módulo único de formateo de fechas.

## 9. Atribución

- La **campaña** es la unidad de atribución. Toda acción nace con `campaign_id`, objetivo y al menos un KPI.
- Identificadores mínimos: `campaign_id`, `asset_id`, UTM (`source, medium, campaign, content, term`), `lead_id`, `conversion_id`, timestamps, `source/platform`, `value`.
- **Captura en origen** (aprobada): Chatbots guarda URL de página, referrer y UTM en `leads.metadata`; Calendar acepta UTM/`campaign_id` en reservas web y `external_ref = lead_id` en reservas por API; el SaaS de landing pages debe aceptar UTM y notificar conversiones por webhook.
- Sin SaaS de atribución. Atribución progresiva: primero identificadores; first/last/multi-touch cuando el volumen lo justifique.

## 10. Inteligencia artificial

- **Híbrido**: el razonamiento (prompts, esquemas de salida, validación, persistencia) vive en el **código de Xtrategy360**, versionado en Git. n8n orquesta procesos largos o programados llamando a esos módulos por HTTP.
- Toda salida de IA se valida contra un esquema **antes** de persistirse. Ninguna estrategia, recomendación o insight se guarda como texto libre.
- Cada ejecución registra: modelo, versión de prompt, inputs, output estructurado, fecha, negocio y estado de validación (tabla `model_runs`).
- La recuperación semántica (pgvector) del Marketing Brain **filtra siempre por negocio en la consulta**, además de la RLS.
- Los hallazgos del dossier con `confianza = inferida | por_confirmar` **nunca** se tratan como hechos. `severidad` no es prioridad: la prioridad la calcula Xtrategy360.

## 11. Estrategia y versionado

- Las estrategias **no se sobrescriben**: cada cambio crea una versión nueva con el motivo (hallazgo o resultado que lo provocó) y las prioridades añadidas, modificadas o retiradas.
- Roadmap en ventanas de 30/60/90 días, iniciativas clasificadas como Quick Wins, Growth Initiatives o Strategic Projects.
- Los sistemas de ejecución (contenidos, chatbots, landings, email) reciben **briefing estructurado** de Xtrategy360; no deciden la dirección del marketing.

## 12. Reporting y GEO

- **Fase 1:** AgencyAnalytics Core (por negocio) es la **única superficie de reporting numérico** para el cliente final. La vista cliente de Xtrategy360 muestra objetivos, estrategia, campañas y próximos pasos, y enlaza al dashboard; no repite gráficas.
- Los insights de Xtrategy360 se calculan **solo** con los datos de Windsor y Metricool en Supabase. AgencyAnalytics es escaparate, no fuente.
- **GEO** (visibilidad en motores de IA) es dimensión prioritaria. Xplore360 aporta la foto por auditoría; AgencyAnalytics AI Tracker la serie temporal. Ambas se guardan como KPI de `visibilidad_ia`.
- La continuidad de AgencyAnalytics se **revisa en Fase 2**. Alternativa registrada: modo reducido "GEO check" mensual en Xplore360.

## 13. Build vs Buy (corregido)

| Capacidad | Decisión | Implementación |
|---|---|---|
| Diagnóstico | BUILD (existe) | Xplore360 |
| Chatbots / captación | BUILD (existe) | Premium Chatbots |
| Booking | BUILD (existe) | Premium Calendar |
| Marketing Brain, Strategy Engine, Campaign Planning, Optimization | BUILD | Xtrategy360 |
| Generador de contenidos | BUILD, **Fase 2** | App separada que recibe briefing de Xtrategy360 |
| Conectores de datos | BUY | Windsor.ai Standard |
| Redes (publicación y analítica orgánica) | BUY | Metricool |
| Dashboard / AI Tracker | BUY (revisable en Fase 2) | AgencyAnalytics Core |
| Landing pages | BUY temporal → BUILD | SaaS con UTM y webhook de conversión; app propia después |
| Reviews | **Fase 2** | Por decidir |
| CRM | Xtrategy360 autónomo en Fase 1; integraciones con CRM del cliente vía n8n en Fase 2 | — |
| Atribución avanzada | DEFER | Tracking propio progresivo |
| Airtable | **Eliminado** del modelo | — |

## 14. Alcance de Fase 1 (urgente: 3 negocios de Feeling)

**Entra:** tenant multi-agencia con RLS y roles · Marketing Brain (onboarding + tabla estructurada) · registro de negocios con `business_id` y correspondencias · ingesta de leads y reservas · ingesta del dossier · Windsor y Metricool → Supabase · Strategy Engine v1 (diagnóstico, estrategia, roadmap 30/60/90, versionado) · Campaign Planning básico con `campaign_id` y generación de UTM · canal email · vista agencia funcional · AgencyAnalytics por negocio.

**Fase 2:** vista cliente propia · Insights & Optimization automáticos · integraciones CRM · generador de contenidos · reviews · dashboard propio · secuencias de email/nurturing · observabilidad avanzada de LLM · UX y diseño.

## 15. Stack y forma de trabajo

- Next.js (App Router, TypeScript) · Supabase (Postgres, Auth, RLS, Storage, pgvector) · Vercel · n8n Cloud · GitHub · Anthropic.
- Cambios de base de datos **siempre como migración** con nombre descriptivo.
- Prompts, esquemas y reglas del Strategy Engine se versionan como parte del producto.
- Cada app se modifica **solo desde su propio proyecto Claude / Claude Code**. Los cambios que Xtrategy360 requiera en otra app se entregan como **ficha de cambio** acompañada del contrato actualizado. Los contratos se copian **idénticos** a todos los proyectos; nunca se resumen ni adaptan.
- Documentos que gobiernan la suite: este documento · `CONTRATO_BUSINESS_ID` · `CONTRATO_DOSSIER` · `CONTRATO_LEADS` · `CONTRATO_CONVERSIONES`.

## 16. Pendientes que no bloquean el diseño

- Herramienta de email marketing de Feeling (define la fuente 6 de Windsor).
- Selección del SaaS de landing pages.
- Reservar `xtrategy360.ai` y `creators360.ai`; apuntar `calendars360.ai` y `chatbots360.ai` a Vercel (fichas PC-02 y CB-02).
- Verificación del plan y API de Metricool.
- Estado de la app de Google OAuth de Premium Calendar (en Prueba: bloquea clientes reales).

---

### Registro de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 22 sept. 2026 | Documento inicial, consolidando las decisiones de las sesiones de análisis |
| 1.0.1 | 23 sept. 2026 | Confirmada región `eu-west-3` de Xplore360; retirado del listado de pendientes |
| 1.2 | 24 sept. 2026 | §1-bis: nombres comerciales y dominios de la suite (Calendars360, Chatbots360, Creators360); regla de que los identificadores internos no cambian |
| 1.1 | 23 sept. 2026 | §3: los dos papeles de IPS (plataforma vs. agencia `ideas-premium`). §4: excepción documentada del `business_id` de pruebas `00000000-0000-4000-8000-000000000001` |
