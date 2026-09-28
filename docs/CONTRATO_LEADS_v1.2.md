# Contrato · Leads — Premium Chatbots → Xtrategy360

**Versión 1.2.1** · 28 de septiembre de 2026 · Ideas Premium Solutions
**Emisor:** Premium Chatbots (capta el lead). **Consumidor:** Xtrategy360 (lo registra, lo atribuye y lo mide).

> Única fuente de verdad sobre cómo Premium Chatbots entrega leads a Xtrategy360. Debe estar, idéntico, en los proyectos de Premium Chatbots y Xtrategy360 y en el repositorio de ambas apps (`/docs/`). Sustituye íntegramente a las versiones anteriores. Si cambia, se cambia aquí primero y se sube la versión. Se apoya en `XTRATEGY360_Decisiones_Cerradas_v1` y `CONTRATO_BUSINESS_ID` v1.1.

> **Nombres (sept. 2026):** Premium Calendar pasa a llamarse **Calendars360** (`calendars360.ai`) y Premium Chatbots **Chatbots360** (`chatbots360.ai`). Los identificadores internos de este contrato no cambian.

---

## 1. Vocabulario

| Término | Significado |
|---|---|
| **Negocio** | El cliente de la agencia; en Chatbots es el `tenant`. Identificado en la suite por `business_id` |
| **Lead** | La **persona** que el bot captó en una conversación. Pertenece a un negocio. Identificado por `leads.id` |
| **Agencia** | Quien opera el bot y gestiona comercialmente el lead. Identificada por `agency_slug` |

Un lead **nunca** lleva `business_id` propio: lleva el del negocio al que pertenece.

## 2. Reparto de responsabilidades

| Premium Chatbots | Xtrategy360 |
|---|---|
| Crea el lead (agente en n8n) | Nunca inserta ni borra en `leads` |
| Gestiona su estado comercial (`status`) desde el panel de la agencia | Nunca toca `status` |
| Expone la vista `leads_para_sincronizar_v1` | Lee solo esa vista, nunca la tabla |
| Filtra leads de prueba (`is_test`) y ya entregados | No intenta ver más de lo que la vista expone |
| Captura la atribución en el widget (§5) | Atribuye el lead a campaña y activo |
| Expone dos funciones RPC para marcar el resultado (§4.3) | Marca cada lead como `synced` o `error` mediante esas funciones |

## 3. Qué se entrega: la vista `leads_para_sincronizar_v1`

Sustituye a `leads_para_sincronizar` (que se mantiene hasta que Xtrategy360 confirme el cambio y luego se retira). Versionar la vista permite evolucionar la tabla sin romper al consumidor.

```sql
create or replace view public.leads_para_sincronizar_v1
with (security_invoker = false)   -- la lee un rol dedicado; ver §4
as
select
  l.id,
  l.tenant_id,
  t.slug                          as tenant_slug,
  t.business_id,                  -- nuevo (CONTRATO_BUSINESS_ID 1.1); puede ser null en transición
  l.conversation_id,
  l.channel,
  l.first_name, l.last_name, l.email, l.phone, l.company, l.role_title,
  l.country, l.language, l.need,
  l.contact_channel_authorized,
  l.appointment_type, l.booking_link_shared, l.phone_verified,
  l.summary,
  l.status,
  l.metadata -> 'attribution'     as attribution,   -- ver §5
  l.sync_status,                  -- 1.1: 'pending' | 'error'
  l.sync_error,                   -- 1.1: motivo del último fallo, si lo hubo
  l.created_at,
  l.updated_at
from public.leads l
join public.tenants t on t.id = l.tenant_id
where not l.is_test
  and l.sync_status in ('pending','error')
  and (t.lead_destination ->> 'type') = 'xtrategy360';

-- 1.1: la vista no usa security_invoker, así que se cierra a los usuarios del panel
revoke all on public.leads_para_sincronizar_v1 from anon, authenticated;
```

Reglas:
- **`not is_test`**: los leads de **enlaces de prueba o de tenants en modo prueba** (`tenants.is_test = true`) nunca salen. Los tenants nuevos nacen en modo prueba y la agencia lo desactiva al pasar el bot a producción; lo creado durante la configuración no se reclasifica. No desactivar el filtro "para ver más datos".
- **`sync_status in ('pending','error')`** *(1.1)*: lo no entregado y lo que falló. Al marcarse `synced` desaparece de la vista. Un lead en `error` sigue visible con su `sync_error` para que Xtrategy360 lo reintente con espera creciente y la agencia vea el motivo en su panel.
- **`lead_destination.type = 'xtrategy360'`**: permite que un tenant envíe sus leads a otro destino sin tocar la vista.
- `updated_at` se expone para que Xtrategy360 pueda ordenar y paginar de forma estable.

### 3.1 Campo por campo

Los marcados con \* los rellena el agente solo si la conversación da pie: pueden llegar vacíos.

| Campo | Tipo | Notas para Xtrategy360 |
|---|---|---|
| `id` | uuid | **Clave de deduplicación.** Mismo `id` = mismo lead, siempre |
| `tenant_id` / `tenant_slug` | uuid / text | El negocio, en clave interna de Chatbots. `tenant_slug` es inmutable |
| `business_id` | uuid | El negocio, en clave de la suite. Si es `null`, Xtrategy360 resuelve por `tenant_slug` en `business_links` y avisa |
| `conversation_id` | uuid | Puede ser `null` |
| `channel` | text | `web` \| `whatsapp` \| `messenger` \| `instagram`. Hoy siempre `web` |
| `first_name`, `last_name` \* | text | Tal como lo dijo el visitante |
| `email` \* | text | **Sin verificar.** Validar en destino; no descartar el lead |
| `phone` \* | text | **Sin normalizar.** Normalizar a E.164 en destino; no descartar el lead |
| `company`, `role_title`, `country`, `language` \* | text | |
| `need` \* | text | Lo que el visitante quiere. El campo más valioso. Texto libre en el idioma del visitante |
| `contact_channel_authorized` \* | text | `whatsapp` \| `phone` \| `email`. **Es consentimiento**, no preferencia. Respetarlo |
| `appointment_type` \* | text | `virtual` \| `phone` |
| `booking_link_shared` | bool | El bot dio el enlace de agenda. No implica reserva |
| `phone_verified` | bool | Hoy siempre `false` |
| `summary` \* | text | Resumen de la conversación por el agente |
| `status` | text | Estado comercial de la agencia (`new`, `contacted`, `qualified`, `discarded`). Solo lectura |
| `attribution` | jsonb | Ver §5. Puede ser `null` en conversaciones anteriores al despliegue |
| `sync_status` | text | `pending` \| `error` *(1.1)* |
| `sync_error` | text | Motivo legible del último fallo; `null` si nunca falló *(1.1)* |
| `created_at`, `updated_at` | timestamptz | |

## 4. Acceso: rol dedicado servido por PostgREST

Regla de la suite: lecturas por vista + rol dedicado **servido por PostgREST**, nunca conexión directa a Postgres, nunca `service_role`.

### 4.1 En Premium Chatbots (migración)

```sql
-- Rol sin login: solo se usa vía JWT
create role xtrategy360 nologin;
grant xtrategy360 to authenticator;           -- permite que PostgREST asuma el rol
grant usage on schema public to xtrategy360;
grant select on public.leads_para_sincronizar_v1 to xtrategy360;
-- Nada más: ni tablas, ni otras vistas, ni update directo.
```

La vista se crea **sin** `security_invoker` (o con `security_definer` según la versión), porque el rol `xtrategy360` no tiene acceso a `leads` ni `tenants`: solo a la vista. Comprobar tras la migración que `select * from tenants` con ese rol falla.

### 4.2 Credencial

Un **JWT firmado con el secreto JWT del proyecto de Chatbots**, con `role: "xtrategy360"` y caducidad larga (12 meses), generado por el equipo de Chatbots y entregado por canal seguro. Xtrategy360 lo guarda en variables de entorno de Vercel (`CHATBOTS_PG_JWT`) junto con la URL REST del proyecto (`CHATBOTS_REST_URL`). Se rota anualmente o ante sospecha; revocar = cambiar el secreto JWT del rol o eliminar el rol.

Petición de lectura (paginada, estable):

```
GET {CHATBOTS_REST_URL}/rest/v1/leads_para_sincronizar_v1
    ?order=updated_at.asc,id.asc&limit=200
Authorization: Bearer {CHATBOTS_PG_JWT}
apikey: {CHATBOTS_ANON_KEY}
```

### 4.3 Escritura de vuelta: dos funciones RPC

Xtrategy360 **no** tiene `update` sobre `leads`. Marca el resultado llamando a funciones `security definer` que solo pueden tocar las cuatro columnas de sincronización:

```sql
create or replace function public.marcar_lead_sincronizado(
  p_lead_id uuid, p_external_ref jsonb)
returns void language sql security definer set search_path = public as $$
  update public.leads
     set sync_status = 'synced', synced_at = now(),
         external_ref = p_external_ref, sync_error = null
   where id = p_lead_id and sync_status <> 'synced';
$$;

create or replace function public.marcar_lead_error(
  p_lead_id uuid, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.leads
     set sync_status = 'error', sync_error = left(p_error, 500)
   where id = p_lead_id and sync_status <> 'synced';
$$;

revoke all on function public.marcar_lead_sincronizado(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.marcar_lead_error(uuid, text) from public, anon, authenticated;
grant execute on function public.marcar_lead_sincronizado(uuid, jsonb) to xtrategy360;
grant execute on function public.marcar_lead_error(uuid, text) to xtrategy360;
```

`external_ref` que escribe Xtrategy360:

```json
{ "xtrategy360_lead_id": "uuid", "business_id": "uuid", "url": "https://…/leads/uuid", "synced_by": "xtrategy360", "contract": "1.0" }
```

`sync_error` se muestra en el panel de la agencia: escribir motivos legibles ("business_id sin correspondencia en Xtrategy360"), no trazas.

*(1.1)* `marcar_lead_error` deja el lead en `sync_status = 'error'`; como la vista incluye ese estado, el lead **sigue siendo visible y se reintenta**. `marcar_lead_sincronizado` limpia `sync_error` al resolverse.

## 5. Atribución capturada en origen

El **widget** de Chatbots360 captura la atribución al **iniciar la conversación** y la propaga al lead en `leads.metadata.attribution`, según la **Atribución común de la suite** (sección al final de este contrato). `captured_at` es el inicio de la conversación; `first_touch_at`, el primer contacto guardado en la cookie. `utm.campaign` es el `code` de campaña de Xtrategy360. Los canales no web (WhatsApp, Messenger, Instagram) enviarán, cuando existan, el identificador de entrada de la plataforma en `attribution.entry_point`.

## 6. Ciclo de sincronización (lado Xtrategy360)

1. Cron cada **5 minutos**. Lee la vista en lotes de 200, orden `updated_at, id`. Los leads con `sync_status = 'error'` se reintentan con espera creciente según el número de fallos (5 min, 30 min, 2 h, 24 h), que Xtrategy360 lleva en su propia tabla; los `pending` se procesan siempre.
2. Por cada fila: `upsert` en `public.leads` de Xtrategy360 por `(source='chatbots', source_id=id)`. Si ya existe, actualiza; no duplica.
3. Resuelve el negocio: `business_id` → si es `null`, busca `business_links(app='chatbots', external_slug=tenant_slug)`. Si no hay correspondencia, llama a `marcar_lead_error` con motivo claro; el lead queda en `error`, visible en la vista y en el panel de la agencia, y se reintenta en ciclos posteriores.
4. Normaliza contacto (`email` minúsculas, `phone_e164`), valida y **conserva** el lead aunque falle la validación.
5. Atribuye: por `utm.campaign` → `campaigns.code`; si no, por `referrer` → canal inferido (`attribution_method = inferred`); si no, `none`.
6. Llama a `marcar_lead_sincronizado`. Registra la corrida en `ingest_runs`.
7. Un error en un lead **no** detiene el lote.

Idempotencia total: repetir un ciclo entero no produce cambios.

## 7. Transición y compatibilidad

- Mientras `tenants.business_id` esté vacío para algún tenant, Xtrategy360 resuelve por `tenant_slug`. Cuando todos los tenants activos tengan `business_id`, se declara cerrada la transición y `business_id` pasará a `not null` en la vista, en una versión futura de este contrato.
- `leads_para_sincronizar` (sin sufijo) se retira una vez que Xtrategy360 confirme que lee la `_v1`.
- **Push** (trigger + `pg_net` hacia un webhook de Xtrategy360) queda como acelerador opcional para Fase 2; el pull se mantiene siempre como red de seguridad.
- *(1.1)* Existe un **tenant de integración** `xtrategy-integracion` (sin modo prueba) para probar la ingesta de extremo a extremo sin tocar tenants reales. Sus leads se enlazan en Xtrategy360 a un negocio de pruebas.

## 8. Lo que este contrato no cubre

Estado comercial del lead (es de la agencia, en Chatbots), verificación telefónica, canales Meta, agendado desde el bot (irá contra Premium Calendar y se documentará en `CONTRATO_CONVERSIONES`), y cualquier envío del lead a un CRM externo (Fase 2, desde Xtrategy360).

## Atribución común de la suite *(sección idéntica en CONTRATO_LEADS 1.2.1 y CONTRATO_CONVERSIONES 1.3.1)*

Todo emisor que capture atribución web (widget de Chatbots360, `embed.js` y página pública de Calendars360, landings) sigue esta regla:

**Objeto `attribution`**
```json
{
  "page_url": "https://…",
  "referrer": "https://… | null",
  "utm": { "source": "…|null", "medium": "…|null", "campaign": "…|null", "content": "…|null", "term": "…|null" },
  "captured_at": "2026-10-03T17:42:11+01:00",
  "first_touch_at": "2026-09-29T10:05:00+01:00 | null",
  "widget_version": "opcional"
}
```

1. **Valores UTM:** se aplica `trim()`, sin cambiar mayúsculas ni minúsculas, y se recortan a 200 caracteres. Un valor vacío tras `trim()` es `null`. Xtrategy360 compara en minúsculas al atribuir (`campaigns.code`, `assets.utm_content`).
2. **`captured_at`:** instante del **evento** que genera el registro (inicio de la conversación en Chatbots360, creación de la reserva en Calendars360), en ISO 8601 **con desfase explícito**. Xtrategy360 acepta `Z` como equivalente a `+00:00`, pero los emisores envían desfase.
3. **`first_touch_at`:** el `captured_at` guardado en la cookie `ips_utm` (primer contacto con UTM en ese dominio). Si la cookie no existía y el emisor la escribe en esta visita, `first_touch_at` es el `captured_at` que acaba de guardar en ella. `null` solo si no hay cookie ni UTM que la creen, o si el dato no se puede conocer (registros anteriores a esta regla, o `first_touch_at` recibido por API sin zona horaria).
3-bis. **Registros creados por API:** `captured_at` es siempre el instante de creación en el emisor (si el integrador lo envía, se ignora); `first_touch_at` se respeta si viene en ISO 8601 con zona, y es `null` si viene sin zona.
4. **Origen de los `utm`:** si la URL de la visita trae `utm_*`, mandan esos; si no, los de la cookie; si no hay ninguno, todos `null`. `page_url` y `referrer` se envían siempre.
5. **Cookie `ips_utm`** (compartida entre apps en el mismo dominio): valor JSON `{"utm": {…}, "captured_at": "<ISO con desfase>"}`, atributos `max-age=2592000; path=/; SameSite=Lax` y `Secure` en https. **Se escribe solo si no existe** (primer contacto) y **nunca se sobrescribe**; unos UTM en la URL mandan en esa visita sin tocarla. Los emisores leen también el formato plano antiguo del widget 1.1.0 por compatibilidad.

## 9. Evolución

Cambios menores (campos nuevos opcionales) → 1.x, compatibles. Cambios mayores (renombrar, eliminar, cambiar tipo) → nueva vista `_v2` y contrato 2.0, conviviendo con `_v1` hasta que el consumidor migre.

### Registro de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.2.1 | 28 sept. 2026 | Aclaración de `first_touch_at` en la visita que crea la cookie (misma regla que ya aplican Chatbots360 y Calendars360); erratas de cabecera y §7 |
| 1.2 | 28 sept. 2026 | Atribución común de la suite (idéntica en CONVERSIONES 1.3): normalización UTM (`trim`, ≤200), `captured_at` = evento con desfase, nuevo `first_touch_at`, cookie `ips_utm` compartida de primer contacto. Cierre CB-02: widget 1.2.0 en `chatbots360.ai` |
| 1.0 | 23 sept. 2026 | Contrato inicial: vista versionada, rol servido por PostgREST, RPC de marcado, atribución en origen |
| 1.1 | 23 sept. 2026 | Vista incluye `sync_status in ('pending','error')` y expone `sync_status`/`sync_error` (resuelve la contradicción §4.3/§6.3); reintento con espera creciente; `is_test` cubre tenants en modo prueba; `revoke` de vista y RPC a `anon`/`authenticated`; tenant de integración `xtrategy-integracion` |


**Regla de verificación:** las pruebas que deban aparecer en la vista se hacen desde una página con el snippet pegado y el tenant `xtrategy-integracion` (sin modo prueba), nunca desde la página de prueba del panel, que marca todo como `is_test`.
