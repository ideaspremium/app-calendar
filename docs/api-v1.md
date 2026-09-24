# API v1 de Premium Calendar

API servidor a servidor para que un agente (Premium Chatbots en n8n, por ejemplo) consulte huecos y gestione citas en los calendarios de los clientes. Premium Calendar es el único interlocutor: el integrador nunca habla con Google, Outlook ni Nylas.

- **URL base:** `https://app-calendar-gold.vercel.app/api/v1`
- **Formato:** JSON en UTF-8.
- **Versión:** los códigos de error, los nombres de campo y los identificadores son contrato. Se pueden añadir campos y códigos nuevos; los existentes no cambian.

## Autenticación

Clave de API en cada petición:

```
Authorization: Bearer pc_live_…
```

También se acepta la cabecera `X-API-Key`. Cada clave pertenece a una agencia y solo ve los calendarios de esa agencia; una clave de plataforma ve todos. Premium Calendar solo guarda el sha256 de la clave: si se pierde, se emite otra. No hay OAuth ni nada por usuario final.

## Reglas comunes

**Fechas.** Siempre ISO 8601 con zona explícita, de entrada y de salida: `2026-10-01T10:00:00-04:00` o `2026-10-01T14:00:00Z`. Una hora sin desfase (`2026-10-01T10:00`) se rechaza con `invalid_datetime`. Cada calendario declara su zona IANA (`timezone`); las respuestas dan las horas con el desfase de esa zona, o de la que se pida con `timezone`.

**Identificadores.** `calendar_id`, `service_id`, `professional_id` y el `id` de cada cita son uuid estables: no cambian aunque se renombre el cliente, el servicio o su URL. Se pueden guardar.

**Vocabulario.**

| API | Qué es |
|---|---|
| calendario | El negocio (cliente de la agencia), con su zona y su horario. |
| servicio | Un tipo de cita: duración, márgenes, antelación mínima, horizonte y preguntas. |
| profesional | La agenda conectada que atiende el servicio. Hoy hay una por servicio; la API ya devuelve una lista. |

**Errores.** Siempre con esta forma y un código estable:

```json
{
  "error": {
    "code": "slot_taken",
    "message": "Ese hueco acaba de ocuparse.",
    "retryable": false,
    "alternatives": [
      { "start": "2026-10-01T10:30:00-04:00", "end": "2026-10-01T11:00:00-04:00", "professionals": [{ "id": "…", "name": "…" }] }
    ]
  },
  "request_id": "5d0c…"
}
```

`message` es para personas y puede cambiar; el agente decide con `code`. `retryable: true` significa que la misma petición puede salir bien más tarde (si hay `Retry-After`, esperar esos segundos). Cada respuesta lleva `X-Request-Id`.

| Código | HTTP | Qué significa | Qué debería hacer el agente |
|---|---|---|---|
| `unauthorized` | 401 | Falta la clave o no vale. | Revisar la credencial. |
| `invalid_request` | 400 | Un campo falta o tiene mal formato (`details.field`). | Corregir la petición. |
| `invalid_datetime` | 400 | Fecha sin zona o inválida. | Enviar ISO 8601 con desfase. |
| `idempotency_key_required` | 400 | Crear cita sin `Idempotency-Key`. | Añadir la cabecera. |
| `calendar_not_found` | 404 | No existe o la clave no lo ve. | Revisar el id guardado. |
| `service_not_found` | 404 | El servicio no es de ese calendario (`details.services` lista los válidos). | Revisar el id guardado. |
| `booking_not_found` | 404 | No existe la cita o no es de esta agencia. | — |
| `service_required` | 422 | El calendario tiene varios servicios y no se indicó cuál (`details.services`). | Preguntar al visitante o indicar `service_id`. |
| `service_not_bookable` | 409 | El servicio no está publicado o no tiene agenda asignada. | Avisar: es configuración del panel. |
| `calendar_disconnected` | 409 | La agenda del profesional perdió la conexión. | Decir que no se puede agendar ahora y avisar a la agencia. |
| `invalid_duration` | 422 | `end − start` no es la duración del servicio. | Omitir `end` o usar la duración correcta. |
| `missing_required_fields` | 422 | Falta un dato obligatorio (`details.fields`, p. ej. `answers.q3_nombre_de_empresa` o `attendee.email`). | Preguntarlo y reintentar. |
| `outside_hours` | 422 | Fuera del horario de atención o en un día cerrado. Trae `alternatives`. | Ofrecer las alternativas. |
| `too_soon` | 422 | Antes de la antelación mínima (`details.booking_window`). Trae `alternatives`. | Ofrecer las alternativas. |
| `too_far_ahead` | 422 | Más allá del horizonte de reserva (`details.booking_window`). | Pedir una fecha más cercana. |
| `slot_taken` | 409 | El hueco no está libre: se ocupó entre que se ofreció y se confirmó. Trae hasta 3 `alternatives` cercanas. | «Ese acaba de ocuparse, tengo estos otros». |
| `too_late_to_change` | 422 | Cancelar o reprogramar con menos de 120 min de margen, o una cita ya pasada. | Explicarlo. |
| `booking_cancelled` | 409 | Se intentó reprogramar una cita cancelada. | Crear una nueva. |
| `idempotency_key_reused` | 422 | La clave de idempotencia ya se usó con otros datos. | Usar una clave nueva para la nueva reserva. |
| `request_in_progress` | 409 | La misma creación sigue en curso. `retryable`, con `Retry-After`. | Reintentar igual pasados unos segundos. |
| `provider_error` | 502 | El proveedor de calendario falló. Si `retryable`, reintentar igual (con la misma clave al crear). Si no, `details.provider_message` dice por qué lo rechazó. | Reintentar o avisar. |
| `internal_error` | 500 | Fallo nuestro. Reintentable. | Reintentar; si persiste, avisar con el `request_id`. |

## Calendarios

### `GET /calendars`

Calendarios que ve la clave, con sus servicios. Sirve para dar de alta un cliente en la tabla del chatbot.

### `GET /calendars/{calendar_id}`

```json
{
  "id": "eaf658b5-b7a0-4eae-aab4-bdce5001e5a1",
  "name": "Test 1 Alejandra",
  "timezone": "America/New_York",
  "locale": "es",
  "services": [
    {
      "id": "9c8e50f9-097f-42ef-85d2-e0aa25e4b0c0",
      "name": "Design Consultation",
      "description": null,
      "duration_minutes": 30,
      "bookable": true,
      "min_notice_minutes": 120,
      "max_days_ahead": 60,
      "professionals": [{ "id": "465798f5-120f-40bc-a930-63226c559ec8", "name": "Test 1 Alejandra" }],
      "questions": [
        { "key": "q1_telefono", "label": "Teléfono", "type": "phone_number", "required": true, "source": "attendee.phone" },
        { "key": "q2_correo", "label": "Correo", "type": "email", "required": true, "source": "attendee.email" },
        { "key": "q3_nombre_de_empresa", "label": "Nombre de Empresa", "type": "text", "required": true, "source": "answers" }
      ]
    }
  ]
}
```

`questions[].source` dice de dónde sale cada respuesta al crear la cita: las de email y teléfono se rellenan solas con los datos del asistente; las demás van en `answers` con su `key`.

## Disponibilidad

### `GET /calendars/{calendar_id}/availability`

Huecos reservables, ya resueltos: horario de atención, duración del servicio, márgenes entre citas, citas y eventos que ya hay en la agenda, días cerrados, antelación mínima y horizonte. Son exactamente los mismos huecos que ve un visitante en la página pública.

| Parámetro | | |
|---|---|---|
| `service_id` | opcional | Si se omite: el único servicio reservable del calendario; si hay varios, el que dure `duration_minutes`; si sigue habiendo duda, `service_required`. |
| `duration_minutes` | opcional | Elige servicio por duración. Si se indica con `service_id` y no coincide, `invalid_duration`. |
| `date` | opcional | Día natural `AAAA-MM-DD` en la zona de `timezone` (o del calendario). Con `days=N`, N días desde ese. Evita que el agente tenga que calcular desfases. |
| `start`, `end` | opcional | Rango con instantes ISO 8601. Sin `end`: 7 días. |
| `limit` | opcional | Como mucho N huecos. Sin rango, busca desde ahora hasta el horizonte y para en cuanto los tiene: `?limit=3` = «los tres primeros huecos». |
| `timezone` | opcional | Zona IANA en la que se devuelven las horas (p. ej. la del visitante). Por defecto, la del calendario. |
| `booking_id` | opcional | Al reprogramar: el hueco de esa cita cuenta como libre. |

```
GET /calendars/eaf658b5-…/availability?limit=3&timezone=Europe/Madrid
```

```json
{
  "calendar_id": "eaf658b5-b7a0-4eae-aab4-bdce5001e5a1",
  "service_id": "9c8e50f9-097f-42ef-85d2-e0aa25e4b0c0",
  "duration_minutes": 30,
  "timezone": "Europe/Madrid",
  "calendar_timezone": "America/New_York",
  "booking_window": { "earliest": "2026-09-23T02:40:00+02:00", "latest": "2026-11-22T00:40:00+01:00" },
  "range": { "start": "2026-09-23T02:40:00+02:00", "end": "2026-09-30T02:40:00+02:00" },
  "slots": [
    { "start": "2026-09-23T15:00:00+02:00", "end": "2026-09-23T15:30:00+02:00",
      "professionals": [{ "id": "465798f5-…", "name": "Test 1 Alejandra" }] }
  ]
}
```

Si el rango cae entero fuera de la ventana de reserva, `slots` viene vacío y `reason` es `too_soon` o `too_far_ahead`.

## Citas

### `POST /bookings` — crear

Cabecera obligatoria: `Idempotency-Key`, hasta 255 caracteres, **una por intento de reserva** (por ejemplo `<id de conversación>:<start>`). Ver [Idempotencia](#idempotencia).

```json
{
  "calendar_id": "eaf658b5-b7a0-4eae-aab4-bdce5001e5a1",
  "service_id": "9c8e50f9-097f-42ef-85d2-e0aa25e4b0c0",
  "start": "2026-10-01T10:00:00-04:00",
  "attendee": {
    "name": "Ana López",
    "email": "ana@example.com",
    "phone": "+34600111222",
    "timezone": "Europe/Madrid",
    "language": "es"
  },
  "answers": { "q3_nombre_de_empresa": "Acme" },
  "notes": "Quiere presupuesto para una web",
  "external_ref": "lead_42"
}
```

- `start`: el `start` de un hueco devuelto por disponibilidad. `end` es opcional (se calcula con la duración).
- `service_id`: opcional con las mismas reglas que en disponibilidad.
- `attendee.email` es **obligatorio** (el proveedor lo exige para enviar la confirmación). `phone`, `timezone` (IANA, para los correos del visitante) y `language` son opcionales.
- `notes` (hasta 2000 caracteres) queda en la cita y en la descripción del evento de la agenda del profesional, junto con el teléfono.
- `external_ref`: texto libre (hasta 255: vuestro id de lead o de conversación) **o** un objeto JSON. Para los integradores de la suite se **recomienda** el objeto de la convención de `CONTRATO_CONVERSIONES` §2, que cierra la cadena campaña → lead → reserva sin inferencias:
  ```json
  { "suite": "ips", "contract": "conversiones-1.0", "business_id": "uuid", "lead_id": "uuid del lead en Premium Chatbots",
    "campaign_id": "code de campaña", "asset_id": "utm_content del activo", "origin_app": "chatbots" }
  ```
  Las claves sin valor se omiten. Se devuelve tal como se envió (objeto → objeto, texto → texto).
- `attribution` (opcional): `{ "page_url", "referrer", "utm": { "source", "medium", "campaign", "content", "term" }, "captured_at" }`. Si falta algún UTM se guarda `null`. En las reservas hechas en la página pública se captura sola (ver «Atribución»).
- `professional_id`: opcional; hoy solo puede ser el profesional del servicio.

Respuesta `201`:

```json
{
  "id": "0b6f2a4e-…",
  "status": "confirmed",
  "calendar_id": "eaf658b5-…",
  "service_id": "9c8e50f9-…",
  "professional": { "id": "465798f5-…", "name": "Test 1 Alejandra" },
  "timezone": "America/New_York",
  "start": "2026-10-01T10:00:00-04:00",
  "end": "2026-10-01T10:30:00-04:00",
  "attendee": {
    "name": "Ana López", "email": "ana@example.com", "phone": "+34600111222",
    "timezone": "Europe/Madrid",
    "local_start": "2026-10-01T16:00:00+02:00",
    "local_end": "2026-10-01T16:30:00+02:00"
  },
  "notes": "Quiere presupuesto para una web",
  "external_ref": "lead_42",
  "source": "api",
  "manage": {
    "manage_url": "https://app-calendar-gold.vercel.app/cita/3f9c…",
    "reschedule_url": "https://app-calendar-gold.vercel.app/cita/3f9c…/reprogramar",
    "cancel_url": "https://app-calendar-gold.vercel.app/cita/3f9c…/cancelar"
  },
  "cancelled_at": null,
  "cancel_reason": null,
  "created_at": "2026-09-22T18:40:12-04:00",
  "updated_at": "2026-09-22T18:40:13-04:00"
}
```

Además de estos campos, cada cita lleva los del objeto de `CONTRATO_CONVERSIONES` §3.2 (mismos datos, otros nombres; ninguno de los anteriores cambia): `client_id`, `client_slug`, `business_id` (o `null` mientras el negocio no lo tenga), `event_type_id`, `event_type_name`, `start_at`, `end_at`, `invitee` (`name`, `email`, `phone`, `timezone`), `answers`, `attribution` y `manage_url`.

`start`/`end` van en la zona del calendario; `attendee.local_start`/`local_end` son el mismo instante en la zona del visitante, listo para decírselo. Los enlaces de `manage` son para el visitante: dejan cancelar o cambiar la cita sin pasar por el chat y siguen valiendo aunque se renombre el cliente. El visitante recibe además el correo de confirmación con esos mismos enlaces.

### `GET /bookings/{id}` · `GET /bookings?external_ref=…`

Una cita por id, o todas las de una referencia externa (máx. 50, las más recientes primero). Una referencia en forma de objeto se busca pasando el objeto en JSON (el orden de las claves da igual).

`status`: `pending` (creándose), `confirmed`, `rescheduled` (sigue en pie, en otra hora) o `cancelled`. *Desde el 24/09/2026 `rescheduled` se devuelve tal cual; antes se mostraba como `confirmed`.*

### `GET /bookings?updated_since=…` — listado incremental

Para sincronizar por pull (lo usa Xtrategy360 cada 5 minutos).

| Parámetro | | |
|---|---|---|
| `updated_since` | obligatorio (salvo con `cursor`) | ISO 8601 con desfase. Inclusivo: citas con `updated_at >= updated_since`. |
| `limit` | opcional | 1 a 200. Por defecto, 100. |
| `cursor` | opcional | El `next_cursor` de la respuesta anterior, tal cual. |

```json
{ "data": [ { …cita… } ], "next_cursor": "WyIyMDI2LTA5…" }
```

- Orden por `updated_at` y después `id`; el cursor no repite ni salta citas entre páginas.
- Devuelve **todas** las citas de los calendarios que ve la clave, también las canceladas y reprogramadas y las de negocios desactivados. No incluye las que aún se están creando (`pending`): aparecen al confirmarse.
- `next_cursor` es `null` cuando no hay más.
- Recomendación: guardar el mayor `updated_at` recibido y pedir desde ahí menos un margen (p. ej. 2 minutos). Con idempotencia por `id`, repetir alguna cita no cuesta nada.
- Sin `updated_since` ni `cursor`: `invalid_request`. `limit` fuera de rango o `cursor` alterado: `invalid_request`.

### `POST /bookings/{id}/reschedule`

```json
{ "start": "2026-10-02T11:00:00-04:00" }
```

Mismas comprobaciones y códigos que al crear (`slot_taken` con alternativas, `outside_hours`, `too_soon`…). Para consultar huecos antes, usar disponibilidad con `booking_id={id}`. Pedir la hora que ya tiene devuelve la cita sin cambios. Con menos de 120 min para la cita: `too_late_to_change`.

### `POST /bookings/{id}/cancel`

```json
{ "reason": "No puede venir" }
```

Cancelar una cita ya cancelada devuelve `200` con la cita tal cual: los reintentos son seguros. Con menos de 120 min para la cita: `too_late_to_change`.

## Idempotencia

La garantía está en la base de datos, no en el código: la cita se guarda con una restricción única `(calendario, Idempotency-Key)` **antes** de pedirla al proveedor, y otra restricción impide dos citas solapadas en el mismo calendario. Dos peticiones con la misma clave no crean dos citas aunque lleguen a la vez.

| Situación al repetir la misma clave | Respuesta |
|---|---|
| Mismos datos, cita ya creada | `200` con la misma cita y cabecera `Idempotent-Replayed: true`. |
| Mismos datos, la primera aún en curso | `409 request_in_progress`, `Retry-After: 5`. |
| Datos distintos | `422 idempotency_key_reused`. |
| La primera terminó en error de negocio (`slot_taken`, `outside_hours`…) | La clave queda libre: se puede reutilizar. |
| La primera terminó en `provider_error` reintentable | Reintentar con la misma clave: si el proveedor sí la creó, se devuelve esa; si no, se crea. |

Regla práctica para el agente: generar la clave cuando el visitante dice «sí» a un hueco y reutilizarla en todos los reintentos de esa confirmación.

## Avisos salientes (webhook)

Premium Calendar hace un `POST` a vuestra URL cuando cambia una cita. Qué se avisa depende de `notify_all_sources`:

| `notify_all_sources` | Qué avisos llegan |
|---|---|
| `false` (por defecto) | `booking.cancelled` y `booking.rescheduled` de las citas creadas con vuestra clave, cuando cambian **fuera de la API** (el visitante usa el enlace del correo o los de `manage`). Los cambios hechos por la propia API no generan aviso. |
| `true` | `booking.created`, `booking.rescheduled` y `booking.cancelled` de **todos** los calendarios que ve la clave, **sea cual sea el origen**: página pública, API (con cualquier clave, también la vuestra) o enlace del correo. |

- `PUT /webhook` con `{ "url": "https://…", "notify_all_sources": true }` — configura la URL y devuelve el `secret` de firma. `notify_all_sources` es opcional: si no se envía, se conserva el que había. Cambiar la URL conserva el secreto; `"rotate_secret": true` genera uno nuevo.
- `GET /webhook` — URL actual y `notify_all_sources` (sin el secreto). `DELETE /webhook` — lo desactiva.
- `POST /webhook/test` — envía un aviso `ping` firmado para probar.

```
POST <vuestra url>
X-PremiumCalendar-Event: booking.cancelled
X-PremiumCalendar-Signature: t=1790120000,v1=5f2c…
Content-Type: application/json

{
  "event": "booking.cancelled",
  "occurred_at": "2026-09-22T18:40:00-04:00",
  "data": { …la cita, mismo objeto que GET /bookings/{id}… },
  "id": "b1c0…", "type": "booking.cancelled", "created_at": "2026-09-22T22:40:01.000Z"
}
```

- `event` y `occurred_at` son los del contrato de conversiones; `id` (único por aviso), `type` (= `event`) y `created_at` (cuándo se envió) se mantienen por compatibilidad.
- Firma: `v1 = HMAC-SHA256(secret, t + "." + cuerpo_en_bruto)` en hexadecimal; rechazar si `t` tiene más de 5 minutos.
- Hasta **3 intentos** si no se responde `2xx`: inmediato, a 1 s y a 3 s, cada uno con 5 s de espera. Cada envío queda registrado. El aviso es un acelerador: con `notify_all_sources`, el listado incremental es la red de seguridad.
- Un `booking.created` de la página pública sale unos 4 s después de reservar, para llevar ya la atribución.

## Atribución de las reservas web

En las reservas hechas en la página pública, `attribution` se rellena sola:

- **Embebida con `embed.js`**: el script lee los `utm_*` de la página que embebe; si no hay, los de la cookie de primera parte `ips_utm` (JSON, 30 días), que escribe la primera vez que ve UTM en ese dominio. Pasa a la reserva la URL de esa página, su `document.referrer` y esos UTM.
- **Enlace directo**: los `utm_*` de la propia URL de reserva, la URL y el `document.referrer`.
- Sin UTM ni cookie: los cinco UTM van a `null`, pero `page_url` y `referrer` se guardan siempre que se conozcan.

## Flujo recomendado para el agente

1. Al dar de alta el cliente: `GET /calendars` y guardar `calendar_id` y `service_id`.
2. En la conversación: `GET /calendars/{id}/availability?limit=3&timezone=<zona del visitante>` (o `date=` si pide un día concreto). Ofrecer los huecos.
3. El visitante elige: `POST /bookings` con el `start` del hueco y una `Idempotency-Key` nueva.
4. `slot_taken`, `outside_hours` o `too_soon`: ofrecer `error.alternatives`. `missing_required_fields`: preguntar lo que falta.
5. Dar al visitante `attendee.local_start` y los enlaces de `manage`.

## Límites conocidos

- El email del visitante es obligatorio.
- Un profesional por servicio. El contrato ya devuelve listas de profesionales para cuando haya varios.
- Si el profesional borra o mueve el evento directamente en Google Calendar, no llega ningún aviso: el proveedor solo avisa de cambios hechos por sus enlaces o por esta API.
- Los correos de confirmación salen todavía con la marca del proveedor de calendario.
- La antelación mínima para cancelar o cambiar es de 120 minutos, igual para la web y para la API.
