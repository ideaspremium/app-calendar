# Contrato · Conversiones → Xtrategy360

**Versión 1.0** · 23 de septiembre de 2026 · Ideas Premium Solutions
**Emisores:** Premium Calendar (reservas) · SaaS de landing pages (formularios) · Premium Chatbots (reservas creadas por bots, vía Calendar) · futuros (CRM, comercio).
**Consumidor:** Xtrategy360.

> Única fuente de verdad sobre cómo llegan las conversiones a Xtrategy360. Debe estar, idéntico, en los proyectos de Premium Calendar, Premium Chatbots y Xtrategy360 y en sus repositorios (`/docs/`). Se apoya en `XTRATEGY360_Decisiones_Cerradas_v1` y `CONTRATO_BUSINESS_ID` v1.1.

---

## 1. Qué es una conversión

Un hecho medible que el negocio considera resultado: una reserva, un formulario enviado, una compra, una llamada. En Xtrategy360 toda conversión se guarda en `conversions` con `source`, `source_id` (únicos), `type`, `status`, `occurred_at`, `business_id`, y los enlaces de atribución (`lead_id`, `campaign_id`, `asset_id`, `utm`).

**Regla de identidad:** `(source, source_id)` es la clave. Volver a recibir el mismo par actualiza; nunca duplica.

## 2. Convención de atribución (común a todos los emisores)

Dos mecanismos, complementarios:

| Mecanismo | Cuándo | Qué se transporta |
|---|---|---|
| **UTM** | El visitante llega a una página (landing, web del negocio, página pública de Calendar) con parámetros `utm_*` | `utm_source, utm_medium, utm_campaign (= code de campaña), utm_content (= utm_content del activo), utm_term`, más `page_url` y `referrer` |
| **`external_ref`** | Un sistema (bot, landing, CRM) crea la conversión por API en nombre de un lead ya conocido | JSON con los identificadores de la suite |

Formato de `external_ref` (jsonb) que todo emisor debe respetar cuando cree una conversión por API:

```json
{
  "suite": "ips",
  "contract": "conversiones-1.0",
  "business_id": "uuid",
  "lead_id": "uuid del lead en Premium Chatbots, si lo hay",
  "campaign_id": "code de campaña de Xtrategy360, si se conoce",
  "asset_id": "utm_content del activo, si se conoce",
  "origin_app": "chatbots | landing | crm | xtrategy360"
}
```

Claves ausentes se omiten; no se envían vacías. `utm.campaign` y `external_ref.campaign_id` llevan el `code` en minúsculas tal cual (`feeling-lafocaccia-202610-001`).

## 3. Premium Calendar → Xtrategy360 (reservas)

### 3.1 Cambios en Premium Calendar

1. **`clients.business_id uuid`** (nullable en transición) — `CONTRATO_BUSINESS_ID` 1.1.
2. **`bookings.attribution jsonb`** — capturada por el widget/página pública en reservas `source = web` (mismo esquema que §5 de `CONTRATO_LEADS`: `page_url`, `referrer`, `utm`, `captured_at`). El script `embed.js` lee los `utm_*` de la página anfitriona (y de la cookie de primera parte, 30 días) y los pasa a la página de reserva; la página los persiste al crear la cita. En reservas `source = api`, `attribution` puede venir en el cuerpo de `POST /bookings` (opcional).
3. **Listado incremental** en la API v1: `GET /bookings?updated_since=<ISO 8601 con desfase>&limit=<1..200>&cursor=<opaco>`, ordenado por `updated_at, id`, que devuelve **todas** las citas de los calendarios visibles para la clave (activas, canceladas, reprogramadas). Respuesta `{ data: [...], next_cursor }`. Hoy solo existe `GET /bookings?external_ref=`; se añade este modo.
4. **Webhook saliente para todos los eventos.** Hoy solo avisa de cambios hechos fuera de la API. Para la clave de Xtrategy360 debe avisar de `booking.created | rescheduled | cancelled` **con independencia del origen** (web, API, panel). Se añade el flag `notify_all_sources: true` en `PUT /webhook`.
5. **Clave de API por agencia para Xtrategy360**, con prefijo `pc_live_` y alcance de lectura + webhook. Se crea desde la pantalla de claves (pendiente en Calendar) o por SQL mientras no exista.

### 3.2 Objeto de reserva (lo que Xtrategy360 recibe)

Tanto el listado como el webhook entregan el mismo objeto:

```json
{
  "id": "uuid",
  "status": "confirmed | cancelled | rescheduled",
  "source": "web | api",
  "client_id": "uuid",
  "client_slug": "lafocaccia",
  "business_id": "uuid | null",
  "event_type_id": "uuid",
  "event_type_name": "Reserva de mesa",
  "start_at": "2026-10-04T20:30:00+01:00",
  "end_at":   "2026-10-04T22:00:00+01:00",
  "timezone": "Atlantic/Canary",
  "invitee": { "name": "…", "email": "…", "phone": "… | null", "timezone": "Europe/Madrid" },
  "answers": { "…": "…" },
  "external_ref": { "…": "…" },
  "attribution": { "page_url": "…", "referrer": "…", "utm": { "…": "…" }, "captured_at": "…" },
  "created_at": "…", "updated_at": "…", "cancelled_at": "… | null",
  "manage_url": "https://…/cita/<token>"
}
```

Fechas siempre ISO 8601 con desfase (regla ya vigente en Calendar). `business_id` puede ser `null` en transición: Xtrategy360 resuelve por `business_links(app='calendar', external_id=client_id)`.

### 3.3 Mapeo en Xtrategy360

| Calendar | `conversions` |
|---|---|
| `id` | `source_id` (con `source = 'calendar'`) |
| `status` | `status` (`confirmed`, `cancelled`, `rescheduled`; `completed`/`no_show` quedan para cuando Calendar marque asistencia) |
| `start_at` | `occurred_at` |
| `external_ref.lead_id` | `lead_id` (busca `leads(source='chatbots', source_id=…)`) |
| `external_ref.campaign_id` o `attribution.utm.campaign` | `campaign_id` (por `campaigns.code`) |
| `external_ref.asset_id` o `attribution.utm.content` | `asset_id` (por `assets.utm_content` dentro de la campaña) |
| objeto completo | `raw` |

`type = 'booking'`. `attribution_method`: `external_ref` si vino por ahí, `utm` si vino por UTM, `inferred` si solo hay referrer, `none` en otro caso.

### 3.4 Transporte

- **Pull** cada 5 minutos con `updated_since = cursor` (guardado en `ingest_cursors(source='calendar_bookings')`), red de seguridad.
- **Webhook** como acelerador: Xtrategy360 expone `POST /api/webhooks/calendar`, verifica la firma `t=<epoch>,v1=HMAC-SHA256(secreto, "t.cuerpo")` y rechaza si `t` supera 5 minutos. Procesa con el mismo `upsert` que el pull. Responde `200` en menos de 5 s; el trabajo pesado va en cola.
- Una reserva que llega por webhook y luego por pull es la misma fila: idempotencia por `(source, source_id)`.

### 3.5 Bots que reservan (Chatbots → Calendar, Fase 2)

Cuando Premium Chatbots reserve por la API de Calendar en nombre de un lead, **debe** enviar `external_ref` con `lead_id`, `business_id` y, si el lead trae atribución, `campaign_id`/`asset_id`. Así la cadena campaña → lead → reserva queda cerrada sin inferencias. Se documenta aquí para que Chatbots lo implemente cuando llegue el momento.

## 4. Landing pages y otros emisores → Xtrategy360 (endpoint genérico)

Para fuentes sin contrato propio (SaaS de landings, formularios, integraciones n8n), Xtrategy360 expone un endpoint de ingesta:

```
POST https://<xtrategy360>/api/v1/conversions
Authorization: Bearer xt_live_…          (clave de api_keys, con scope conversions:write)
Idempotency-Key: <uuid generado por el emisor>
Content-Type: application/json
```

```json
{
  "source": "landing",
  "source_id": "id estable de la conversión en el emisor",
  "type": "form | purchase | call | whatsapp | signup | other",
  "status": "confirmed",
  "occurred_at": "2026-10-04T18:02:00+01:00",
  "business_id": "uuid",
  "value": 45.00, "currency": "EUR",
  "contact": { "name": "…", "email": "…", "phone": "…" },
  "attribution": { "page_url": "…", "referrer": "…", "utm": { "…": "…" } },
  "external_ref": { "…": "…" },
  "raw": { "…": "…" }
}
```

Reglas:
- `source` + `source_id` obligatorios y estables. `business_id` obligatorio (el SaaS de landings lo llevará configurado por página/negocio).
- Respuesta `201 { conversion_id, attribution_method }`; repetición con la misma `Idempotency-Key` devuelve `200` con `Idempotent-Replayed: true`.
- Errores con `{ error: { code, message, retryable }, request_id }`; códigos estables: `unauthorized`, `invalid_request`, `business_not_found`, `campaign_not_found` (no bloquea: se guarda con `attribution_method = none` y se avisa), `idempotency_key_reused`, `internal_error`.
- Si el emisor solo sabe hacer webhooks con formato fijo (caso típico de un SaaS), n8n **traduce** al formato anterior y firma; la lógica de negocio sigue en Xtrategy360.
- Criterio para elegir el SaaS de landings: debe conservar los `utm_*` de entrada y enviarlos en el webhook de conversión, y aceptar un campo oculto o configuración por página para `business_id`.

## 5. Reglas de consumo para Xtrategy360

1. Nunca inferir `business_id` por nombre de negocio: solo por `business_id` o por `business_links`.
2. No descartar una conversión por contacto inválido; validar y conservar.
3. `occurred_at` es el instante del hecho (inicio de la cita, envío del formulario), no el de la ingesta.
4. Una cancelación no borra: cambia `status` y conserva la fila para medir tasa de cancelación.
5. El `value` solo se rellena si el emisor lo envía; nunca se estima.
6. Toda conversión sin `campaign_id` cuenta igualmente en `conversions_total`; la atribución es progresiva, no una condición de registro.

## 6. Evolución

Cambios menores → 1.x. Cambios de forma del objeto o de la ruta → 2.0, con periodo de convivencia.

### Registro de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 23 sept. 2026 | Contrato inicial: convención de atribución, listado incremental y webhook total en Calendar, endpoint genérico de conversiones |
