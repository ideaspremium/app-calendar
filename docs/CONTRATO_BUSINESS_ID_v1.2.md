# Contrato · `business_id` — Identidad compartida de la suite

**Versión 1.2** · 24 de septiembre de 2026 · Ideas Premium Solutions
**Emisor:** Xplore360 (primera app que conoce al negocio). **Consumidores:** Xtrategy360 (hub de correspondencias), Premium Chatbots, Premium Calendar y cualquier app futura.

> Este documento es la única fuente de verdad del `business_id`. Debe estar, idéntico, en los cuatro proyectos y en el repositorio de cada app. Sustituye íntegramente a las versiones anteriores.

---

## 1. Qué identifica

El `business_id` identifica a un **negocio**: la empresa prospecto o cliente de una agencia (una clínica, un taller, una gestora de fondos). Es la clave que hace que ese negocio sea el mismo en Xplore360, Xtrategy360, Premium Chatbots y Premium Calendar.

**No identifica** a los leads del negocio (las personas que capta un chatbot o reservan una cita). Un lead lleva el `business_id` del negocio al que pertenece, nunca uno propio.

Xplore360 emite el id en la **primera auditoría**, antes de que el negocio compre nada. La mayoría de los negocios con `business_id` nunca serán clientes de pago. Cada app gestiona su propio estado comercial; **ningún `business_id` implica cliente activo**.

## 2. Formato

| Campo | Valor |
|---|---|
| Nombre del campo | **`business_id`** (minúsculas, guion bajo), en todas las apps |
| Tipo | **UUID v4**, 36 caracteres, minúsculas |
| Ejemplo | `b91e4ae2-7464-4975-b65f-e3d13fb6485a` |
| Inmutable | **Sí.** No cambia ni se reutiliza jamás. En Xplore360 lo garantiza un trigger; cada consumidor debe replicar la inmutabilidad en su columna |
| Separado de la clave interna | **Sí.** Cada app conserva su propia PK; `business_id` es una columna aparte |

## 3. Un negocio pertenece a una sola agencia *(nuevo en 1.1)*

Regla no reabrible de la suite: **dos agencias no pueden auditar ni trabajar el mismo negocio**.

- Xplore360 añade **`negocios.agencia_id`** (propietaria) y **`negocios.agency_slug`** (ver §4). Se asignan en la primera auditoría y no cambian salvo traspaso manual por IPS.
- El rechazo de una auditoría sobre un negocio de otra agencia se hace en **dos controles** *(1.2)*:
  1. **Previo, antes de crear la auditoría.** La función `comprobar_propiedad_negocio` compara dominio y alias, y después nombre+zona. Si el negocio pertenece a otra agencia, el webhook responde **HTTP 409** `{ ok: false, error: "negocio_de_otra_agencia", business_id, agency_slug_propietaria }` y no se crea ninguna fila.
  2. **Posterior, en `resolver_negocio`**, cuando el negocio solo se reconoce por `place_id` (negocios sin web o con web distinta). La auditoría ya ejecutada queda en `estado = 'rechazada'` con `motivo_rechazo`, sin `business_id`, sin dossier, sin informe y sin PDF. `motivo_rechazo` **no** nombra a la agencia propietaria.
  Ambos controles registran el intento en `intentos_rechazados` (`payload.momento` = `previo` | `posterior`), tabla que ningún usuario del panel lee. IPS resuelve manualmente.
- Aislamiento *(1.2)*: `negocios` y `negocio_dominios` solo son visibles para la agencia propietaria; IPS (`es_ips`) ve todos.
- Consecuencia para los consumidores: el par `(business_id, agency_slug)` es estable. Un consumidor que reciba un `business_id` con un `agency_slug` distinto al que conoce debe tratarlo como error de configuración, no como cambio de propietario.

## 4. `agency_slug`: identidad canónica de la agencia *(nuevo en 1.1)*

Cada agencia tiene un **slug canónico**, idéntico en las cuatro apps, inmutable: `ideas-premium`, `feeling`, `minty-lab`. Reglas: minúsculas, ASCII, guiones; máximo 40 caracteres.

| App | Dónde vive hoy | Acción |
|---|---|---|
| Premium Calendar | `agencies.slug` (ya existe, ya inmutable) | Alinear valores con el canon |
| Premium Chatbots | `agencies.slug` (ya existe) | Alinear valores; hacerlo inmutable por trigger |
| Xplore360 | No existe | Añadir `agencias.slug` único e inmutable |
| Xtrategy360 | `agencies.slug` | Nace con él |

Xtrategy360 relaciona los `agency_id` internos de cada app a través de este slug. Es el único dato de agencia que viaja entre apps.

## 5. Columna `business_id` en cada consumidor *(nuevo en 1.1)*

| App | Tabla | Columna | Estado |
|---|---|---|---|
| Premium Chatbots | `tenants` | `business_id uuid unique` | Añadir (nullable en transición; `not null` al cerrar) |
| Premium Calendar | `clients` | `business_id uuid unique` | Añadir (idem) |
| Xtrategy360 | `businesses` | `business_id uuid unique not null` | Nace con ella |

En los tres casos: inmutable por trigger; único (un negocio no puede ser dos tenants ni dos calendarios). Durante la transición, Xtrategy360 resuelve por `tenant_slug` / `client_id` mediante su tabla `business_links` y avisa de los registros sin `business_id`.

**Cómo se rellena en Chatbots y Calendar:** el operador de la agencia introduce el `business_id` al dar de alta el tenant/calendario, o la app lo consulta con el endpoint de §7 a partir del dominio del negocio. Xtrategy360 puede además proponer la correspondencia desde su pantalla de enlaces.

## 6. Cómo se resuelve un negocio (evitar duplicados)

Antes de emitir un id nuevo, Xplore360 busca si el negocio **ya existe**, en cascada, parándose en el primer criterio que da resultado:

| Orden | Criterio | Fiabilidad | Nota |
|---|---|---|---|
| 1 | **Dominio web normalizado** (propio o alias) | Alta | Clave natural principal |
| 2 | **`place_id` de Google** de la sede principal | Alta | Cubre negocios sin web |
| 3 | **Nombre normalizado + zona** | Baja | Último recurso; queda `resuelto_por = 'nombre'` para revisión |
| — | Ninguno coincide → **negocio nuevo**, se genera el UUID y se asigna la agencia solicitante | | |

En cascada y no combinado, a propósito: exigir todos los criterios a la vez crearía duplicados ante cualquier dato distinto.

**Enriquecimiento:** al reconocer un negocio, los datos nuevos de la auditoría se guardan (web nueva → alias; `place_id` que faltaba → se completa).

**Alias:** varios dominios pueden resolver al mismo `business_id`.

## 7. Normalización del dominio — la misma regla en todas las apps

1. Minúsculas; quitar espacios en los extremos.
2. Quitar el protocolo (`https://`, `http://`).
3. Quitar el prefijo `www.`.
4. Quitar todo desde la primera `/`, `?`, `#` o `:`.
5. Quitar puntos finales.
6. Conservar subdominios reales: `tienda.marca.com` y `marca.com` son claves distintas.
7. Si el resultado es una **plataforma compartida**, no es clave válida (nulo; resolver por `place_id`). Lista: `wixsite.com`, `wix.com`, `wixstudio.com`, `editorx.io`, `linktr.ee`, `facebook.com`, `instagram.com`, `tiktok.com`, `sites.google.com`, `business.site`, `blogspot.com`, `wordpress.com`, `squarespace.com`, `weebly.com`, `jimdo.com`, `jimdosite.com`, `webnode.es`, `webnode.com`, `godaddysites.com`, `carrd.co`, `notion.site`, `canva.site`, `strikingly.com`, `mystrikingly.com`, `webflow.io`, `netlify.app`, `vercel.app`, `github.io`, `yolasite.com`, `tumblr.com` (y subdominios).

Ejemplos: `https://www.DGMracingchip.com/talleres?x=1` → `dgmracingchip.com` · `lafocacciatf.com/` → `lafocacciatf.com` · `https://tienda.marca.com` → `tienda.marca.com` · `https://negocio.wixsite.com/inicio` → *nulo*.

**Normalización del nombre** (solo respaldo): minúsculas, sin tildes, sin apóstrofos ni puntos (`G's` → `gs`, `S.L.` → `sl`), otros signos → espacio, se eliminan formas jurídicas (`sl`, `slu`, `sa`, `sau`, `ltd`, `llc`, `inc`, `corp`, `gmbh`, `sociedad limitada`, `sociedad anónima`), espacios colapsados.

## 8. Cómo consultarlo desde otra app

Servidor a servidor. **Solo lectura**: consulta sin crear.

```
POST https://ideaspremium.app.n8n.cloud/webhook/negocios/resolver
```

**Autenticación** *(cambia en 1.1)*: cabecera **`x-api-key`** con una **clave por app**, prefijo `xp_live_`, emitida por Xplore360 y almacenada como hash SHA-256 en su tabla `api_keys` (`key_prefix`, `app`, `revoked_at`, `last_used_at`). La cabecera `x-feeling-secret` se acepta durante la transición (validada por un webhook interno, sin copiar el secreto a ningún sitio) y se retira cuando el front de Xplore360 use su clave `front-xplore360`. *(1.2)* `api_keys` en Xplore360 tiene RLS activa y sin políticas: solo `service_role` la lee. Las claves se entregan por canal seguro, nunca en código ni en el navegador.

**Cuerpo (JSON)** — al menos uno de los tres:
```json
{ "dominio": "https://www.dgmracingchip.com/", "nombre": "Taller DGM", "place_id": "ChIJ..." }
```

**Respuesta — encontrado** *(añade `agency_slug`)*:
```json
{
  "encontrado": true,
  "business_id": "b91e4ae2-7464-4975-b65f-e3d13fb6485a",
  "agency_slug": "feeling",
  "nombre": "Taller Mecánica DGM",
  "dominio": "dgmracingchip.com",
  "place_id": "ChIJU5kmh5iUQAwR6ViEPBQ6fUA",
  "zona": "Gran Canaria",
  "pais": "España",
  "origen": "xplore360",
  "encontrado_por": "dominio",
  "alias": []
}
```

**Respuesta — no encontrado:** `{ "encontrado": false }`

**Reglas de consumo:**
- `encontrado_por = "nombre"` es una coincidencia débil: confirmar antes de vincular.
- Comparar `agency_slug` con la agencia que hace la consulta; si difiere, no vincular y avisar.
- Si no se encuentra, **no inventar un id**: pedir que se audite el negocio.

## 9. `business_id` externo (transición a CRM) — *aplazado*

La emisión del `business_id` por un CRM de agencia queda **descartada por ahora** (decisión de septiembre de 2026). El mecanismo se conserva por si se reabre: Xplore360 acepta `business_id` en la solicitud de auditoría; si el negocio no existe, lo crea con ese id y `origen = 'crm'`; si existe con otro id, conserva el de Xplore360 y responde `conflicto: true`. Nunca sobrescribe en silencio.

## 10. Xtrategy360 como hub de correspondencias *(nuevo en 1.1)*

Xtrategy360 mantiene la tabla `business_links(business_id, app, external_id, external_slug)` que relaciona cada `business_id` con el `negocio.id` de Xplore360, el `tenant_id`/`tenant_slug` de Chatbots, el `client_id`/`slug` de Calendar y las cuentas de proveedores externos. Es la única app que ve a un negocio desde todas las fuentes; las demás no necesitan conocerse entre sí.

## 11. Dónde está en Xplore360

- `public.negocios` (una fila por negocio, con `business_id`, `agencia_id`, `agency_slug`) y `public.negocio_dominios` (alias).
- Cada fila de `public.auditorias` lleva su `business_id`.
- El dossier (`CONTRATO_DOSSIER` 1.1) lo incluye en `negocio.business_id`.

---

### Registro de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | sept. 2026 | Contrato inicial |
| 1.2 | 24 sept. 2026 | §3: rechazo en dos controles (previo con `comprobar_propiedad_negocio` → HTTP 409 sin crear fila; posterior por `place_id` → `estado = 'rechazada'` con `motivo_rechazo`), registro en `intentos_rechazados`; aislamiento de `negocios` por agencia. §8: autenticación con `x-api-key` validada por `comprobar_api_key`; transición del secreto antiguo sin copiarlo |
| 1.1 | 23 sept. 2026 | Un negocio pertenece a una sola agencia (`negocios.agencia_id`, rechazo de auditorías de otra agencia); `agency_slug` canónico en las cuatro apps; columna `business_id` obligatoria en Chatbots y Calendar; autenticación del endpoint por clave por app (`x-api-key`) en lugar de `x-feeling-secret`; respuesta con `agency_slug`; emisión por CRM aplazada; Xtrategy360 como hub de correspondencias |
