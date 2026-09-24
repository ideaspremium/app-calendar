# Ficha de cambio PC-01 · Premium Calendar → integración con Xtrategy360

**Fecha:** 23 de septiembre de 2026 · **Solicita:** Xtrategy360 (Ideas Premium Solutions) · **Prioridad:** alta

> Instrucciones para la sesión de Claude responsable de Premium Calendar. Los contratos adjuntos son la especificación; esta ficha es el orden de trabajo. Si algo contradice un contrato, manda el contrato y se avisa.

---

## 0. Antes de empezar

1. Subir al proyecto y a `/docs/` del repo `app-calendar`: `XTRATEGY360_Decisiones_Cerradas_v1.md`, `CONTRATO_BUSINESS_ID_v1.1.md`, `CONTRATO_CONVERSIONES_v1.md`.
2. Si existe alguna copia de `CONTRATO_BUSINESS_ID_v1.md`, **eliminarla**.
3. Leer los tres antes de tocar nada.

## 1. Contexto en una frase

Cada reserva es una **conversión** para Xtrategy360. Calendar debe llevar el `business_id` del negocio, capturar la atribución (UTM, página, referrer) en las reservas web, permitir listar reservas de forma incremental y avisar por webhook de todos los eventos, con independencia de su origen.

## 2. Decisiones de la suite que afectan a esta app
- `agency_slug` canónico: `ideas-premium`, `feeling`, `minty-lab`. `agencies.slug` ya existe y es inmutable: solo alinear valores (`ideas-premium` está bien; `feeling` está bien).
- Zona horaria de Feeling: fijar `agencies.timezone = 'Atlantic/Canary'` (hoy `UTC`, pendiente en el dosier).
- La app de Google OAuth en estado de Prueba **bloquea** a los tres negocios de Feeling: hay que iniciar la verificación en paralelo a esta ficha.

## 3. Cambios en base de datos (migraciones con nombre descriptivo)

### 3.1 `business_id_en_clients`
- `clients.business_id uuid unique` (nullable en transición). Trigger de inmutabilidad (rechaza cambiar un valor no nulo).
- Rellenar para los calendarios de Feeling con los valores que entregue Xtrategy360 (punto 8).

### 3.2 `bookings_attribution`
- `bookings.attribution jsonb` con el esquema de `CONTRATO_CONVERSIONES` §3.1 punto 2 (`page_url`, `referrer`, `utm{source,medium,campaign,content,term}`, `captured_at`).
- Índice GIN opcional; no es necesario en Fase 1.

### 3.3 `api_keys_webhook_notify_all`
- `api_keys.webhook_notify_all_sources boolean default false`. Cuando es `true`, el webhook saliente de esa clave avisa de `booking.created | rescheduled | cancelled` **aunque el cambio se haya hecho por la propia API** (hoy solo avisa de cambios externos).

## 4. Cambios en la página pública y `embed.js`
- `embed.js` (inline y popup) lee los `utm_*` de la página anfitriona y, si no hay, de la cookie de primera parte `ips_utm` (JSON, 30 días) que escribe la primera vez que ve UTM en ese dominio. Los pasa a la página de reserva como parámetros o `postMessage`.
- La página de reserva conserva `attribution` en estado y la persiste en `bookings.attribution` al crear la cita (`source = web`). También se captura `document.referrer` de la página anfitriona cuando el embed lo permita.
- Sin UTM ni cookie: `attribution.utm` con valores `null`, pero `page_url` y `referrer` siempre.

## 5. Cambios en la API v1 (`src/lib/api/` y `docs/api-v1.md`)

### 5.1 Listado incremental
`GET /bookings?updated_since=<ISO 8601 con desfase>&limit=<1..200>&cursor=<opaco>`
- Ordena por `updated_at, id`; devuelve **todas** las citas de los calendarios visibles para la clave, incluidas canceladas y reprogramadas.
- Respuesta `{ data: [...], next_cursor }`; `next_cursor` es `null` cuando no hay más.
- El objeto de cita es el de `CONTRATO_CONVERSIONES` §3.2 (añade `client_slug`, `business_id`, `event_type_name`, `attribution`, `updated_at`, `cancelled_at`, `manage_url` a lo que ya se devuelve). Fechas ISO 8601 con desfase, como siempre.
- Sin `updated_since` → `invalid_request`. Mantener el modo existente `?external_ref=`.

### 5.2 `POST /bookings`
Aceptar `attribution` opcional en el cuerpo (mismo esquema). Documentar en `docs/api-v1.md` la convención de `external_ref` de `CONTRATO_CONVERSIONES` §2 como **recomendada** para integradores.

### 5.3 Webhook saliente
- `PUT /webhook` acepta `notify_all_sources: boolean`.
- El payload del webhook es el mismo objeto de cita de §3.2, envuelto en `{ event: "booking.created|rescheduled|cancelled", occurred_at, data: {...} }`.
- Firma como hasta ahora: `t=<epoch>,v1=HMAC-SHA256(secreto, "t.cuerpo")`. Reintentos con backoff (3 intentos) si el receptor no responde `2xx`.

### 5.4 Clave para Xtrategy360
Crear una clave `pc_live_…` para la agencia `feeling` con `webhook_notify_all_sources = true`. Mientras no exista la pantalla de claves, por SQL. Entregar el valor a Alejandro por Google Drive, **nunca en el chat**.

## 6. Panel (mínimo para esta ficha)
- Campo `business_id` editable en la ficha del calendario (solo `agency_admin`), con validación de UUID.
- Opcional: mostrar `attribution.utm.campaign` en la futura vista de citas (pendiente 2 del dosier).

## 7. Verificación antes de dar por terminado
- [ ] Una reserva hecha desde una página con `?utm_source=test&utm_campaign=feeling-test-202609-001` guarda `bookings.attribution.utm.campaign = 'feeling-test-202609-001'`.
- [ ] `GET /bookings?updated_since=<ayer>` con la clave de Xtrategy360 devuelve esa reserva con `business_id`, `attribution` y `updated_at`; una segunda llamada con el `next_cursor` devuelve vacío.
- [ ] Cancelar la reserva desde el panel y desde la API dispara **ambas** veces el webhook a la URL de prueba, con firma válida.
- [ ] Una clave sin `notify_all_sources` sigue comportándose como antes.
- [ ] `agencies.timezone` de Feeling es `Atlantic/Canary` y la validación IANA lo acepta.
- [ ] `npx tsc --noEmit` y `next build` sin errores; `docs/api-v1.md` actualizado.

## 8. Qué debe devolver esta sesión a Xtrategy360
1. Nombres de las migraciones aplicadas.
2. Lista de `clients` de Feeling: `id`, `slug`, `name` (para que Xtrategy360 asigne el `business_id` de cada uno y lo devuelva).
3. Confirmación de que la clave `pc_live_…` de Xtrategy360 está en Drive, y la URL base de la API.
4. Un objeto de cita real (anonimizado) devuelto por `GET /bookings?updated_since=` para validar el esquema del lado de Xtrategy360.
5. Estado de la verificación de la app de Google OAuth (iniciada / fecha estimada).
6. Cualquier desviación respecto al contrato, con motivo.

## 9. Ida y vuelta pendiente
Xtrategy360 devolverá los `business_id` de cada calendario de Feeling (punto 8.2) para rellenar `clients.business_id`, y la URL del webhook receptor (`POST /api/webhooks/calendar`) con su secreto para configurar `PUT /webhook`. Hasta entonces Xtrategy360 resuelve por `client_id` y funciona solo con pull.
