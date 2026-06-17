# Plan: `affine-rest-bridge` — MVP de API REST para Affine

> Microservicio Node.js + TypeScript que expone una API REST limpia sobre la
> API GraphQL de `https://notes.nglab.es/graphql`. **Prohibido** tocar
> Blocksuite/Yjs desde el backend — todo se hace vía mutaciones/queries
> estándar.
>
> 🎯 **Enfoque: MVP que funcione primero, escalar después.**
> Este plan cubre **únicamente** el alcance del brief original (workspaces,
> collections, pages, create page) usando **solo el API GraphQL** de Affine.
> Socket.IO sync, lectura/escritura de binario Yjs, manipulación de bloques
> y todo lo que huela a CRDT queda **explícitamente fuera** del MVP. Si
> después se necesita, se hace en una segunda iteración.
>
> 📍 **Sobre la "falta de docs oficiales":** la doc pública de Affine
> ([docs.affine.pro](https://docs.affine.pro)) **no expone la API** (solo
> conceptos), pero el schema GraphQL **sí existe** y está en el código
> fuente: `packages/backend/server/src/schema.gql` en
> [github.com/toeverything/AFFiNE](https://github.com/toeverything/AFFiNE).
> También hay una guía técnica útil de la comunidad en
> [discussion #6052](https://github.com/toeverything/AFFiNE/discussions/6052).
> El plan añade una **Fase 0** que mapea el schema contra el brief antes de
> tirar código.

---

## 0. TL;DR y decisiones clave

| Decisión | Elección | Por qué |
|---|---|---|
| Framework HTTP | **Fastify 5** | "Ligero" del brief + mejor perf/arranque en frío que Express, schema validation nativa, ideal para Proxmox con poca RAM. Express sigue siendo válido; te lo cambio en 5 min si prefieres. |
| Lenguaje | **TypeScript estricto** (`strict: true`, `noUncheckedIndexedAccess: true`) | Brief lo pide, evita bugs tontos con GraphQL responses. |
| GraphQL client | **`graphql-request`** (cliente minimalista) | Solo necesitamos POST + headers. Sin caché, sin subscriptions, sin peso muerto. Si más adelante hace falta, migramos a `urql` o `graphql-ws`. |
| Validación | **Zod** con `fastify-type-provider-zod` | Validación de inputs + tipado automático en handlers. Una sola fuente de verdad. |
| Logger | **Pino** (incluido en Fastify) | Structured JSON logs, listo para Promtail/Loki/Docker. |
| Tests | **Vitest** | Estándar moderno, compatible ESM, arranque rápido. |
| Auth microservicio | Header `x-api-key` con `crypto.timingSafeEqual` | Evita timing attacks. |
| Auth Affine | Cookie `affine_session` + `affine_csrf_token` reusadas entre peticiones (login al arrancar + refresh on 401) | Ya conocido del trabajo previo en tu instancia. |
| Puerto por defecto | `3002` | El viejo bridge usaba `3001`; reservamos el rango. |
| Nombre del proyecto | `affine-rest-bridge` | Distinto del viejo `affine-api-bridge` para evitar colisión de ideas. |
| Ubicación | `/Users/ngarrigues/Documents/04_Notas_Aplicaciones/affine-rest-bridge/` | Mismo nivel que el viejo, separado. |
| Node target | **22 LTS** (Alpine en Docker) | LTS actual, ya estable. |

**Si discrepas en algo de lo de arriba, dímelo antes de implementar.** Todo lo demás se puede cambiar sobre la marcha.

> 💡 **Regla de oro del MVP:** si una decisión agrega complejidad sin
> desbloquear funcionalidad del brief, se deja para una v2. El objetivo es
> que el bridge funcione end-to-end con los 4 endpoints del brief antes de
> añadir nada.

---

## 1. Estructura del proyecto

Clean architecture ligera, sin sobreingeniería. `src/` separado de `dist/`.

```
affine-rest-bridge/
├── .env.example                  # plantilla de variables
├── .gitignore
├── .dockerignore
├── Dockerfile                    # multi-stage
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── server.ts                 # bootstrap: carga env, crea app, listen
│   ├── app.ts                    # buildApp(): instancia Fastify + plugins + rutas (testable)
│   ├── config/
│   │   └── env.ts                # Zod schema de env, export tipado
│   ├── infra/
│   │   ├── graphql/
│   │   │   ├── client.ts         # cliente graphql-request con cookies
│   │   │   └── queries.ts        # strings GraphQL (queries + mutations)
│   │   ├── affine/
│   │   │   ├── auth.ts           # signIn, refresh de sesión, store de cookies
│   │   │   └── types.ts          # tipos generados a mano (sin codegen por ahora)
│   │   └── http/
│   │       └── auth-guard.ts     # preHandler que valida x-api-key
│   ├── modules/                  # un folder por dominio
│   │   ├── workspaces/
│   │   │   ├── workspace.controller.ts   # handlers HTTP
│   │   │   ├── workspace.service.ts      # lógica de negocio
│   │   │   └── workspace.schema.ts       # Zod schemas (params/response)
│   │   ├── collections/
│   │   │   ├── collection.controller.ts
│   │   │   ├── collection.service.ts
│   │   │   └── collection.schema.ts
│   │   ├── pages/
│   │   │   ├── page.controller.ts
│   │   │   ├── page.service.ts
│   │   │   └── page.schema.ts
│   │   └── sdk-future/           # Fase 5 — interfaces vacías, comentadas
│   │       └── README.md
│   ├── plugins/                  # plugins Fastify
│   │   └── error-handler.ts      # mapea errores a respuestas JSON consistentes
│   └── utils/
│       ├── url.ts                # helper para construir URLs de Affine
│       └── errors.ts             # clases de error tipadas
└── tests/
    ├── helpers/
    │   └── build-test-app.ts
    ├── workspaces.test.ts
    ├── pages.test.ts
    └── auth-guard.test.ts
```

**Convención de naming:** kebab-case en archivos, camelCase en funciones, PascalCase en clases. Respuestas JSON en `camelCase` (consistente con Affine) pero las rutas en `kebab-case` (`/api/v1/workspaces/...`).

---

## 2. Dependencias

### Producción
- `fastify@^5`
- `@fastify/cors` — CORS por si el bot o front quieren llamarlo desde navegador
- `@fastify/helmet` — cabeceras seguras (no estorba y es buena higiene)
- `fastify-type-provider-zod` — integra Zod con el routing de Fastify
- `zod@^3`
- `graphql-request@^7` — cliente GraphQL minimalista
- `graphql@^16` — peer de graphql-request
- `dotenv@^16` — cargar `.env` (solo en dev; en Docker se inyecta por env vars)
- `pino-pretty` (devDependency) — logs legibles en consola local

### Desarrollo
- `typescript@^5.5`
- `tsx` — ejecutar TS directamente en `npm run dev`
- `@types/node`
- `vitest@^2`
- `supertest` (o `fastify.inject` nativo — preferimos el nativo)
- `eslint` + `@typescript-eslint/*` + `prettier`

**Sin `yjs`, sin `lib0`, sin nada de Blocksuite.** Esto es deliberado y se reflejará en el `package.json`.

---

## 3. Variables de entorno (`.env.example`)

```env
# Server
PORT=3002
HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=development

# Auth del microservicio (x-api-key)
API_KEY=change-me-to-a-long-random-string

# Affine
AFFINE_BASE_URL=https://notes.nglab.es
AFFINE_GRAPHQL_URL=https://notes.nglab.es/graphql
AFFINE_EMAIL=hermes@nglab.es
AFFINE_PASSWORD=__set_in_real_env__

# Sesión: si quieres saltarte el login programático (ej. scraping de cookie
# del navegador), puedes pegar aquí el valor de affine_session + csrf.
# Si no, se hace login automático al arrancar.
AFFINE_SESSION_COOKIE=
AFFINE_CSRF_TOKEN=
```

**Importante:** `AFFINE_PASSWORD` y `API_KEY` NUNCA van al repo. El `.env` va al `.gitignore`. En Proxmox se inyectan vía variables de entorno del container.

---

## 4. Plan por fases

### Fase 0 — Mapeo del schema GraphQL (concreta, no exploratoria)

**Entregable:** tenemos el `schema.gql` de Affine en `docs/`, sabemos
**exactamente** qué queries/mutations usar, y las strings GraphQL están
listas para pegar en `src/infra/graphql/queries.ts`.

Razón de ser: la doc pública no expone el schema, pero **el schema es
código fuente abierto**. Vamos a leerlo en vez de adivinar.

Tareas:
1. **Descargar el schema GraphQL** del último commit de
   [github.com/toeverything/AFFiNE](https://github.com/toeverything/AFFiNE):
   ```
   https://raw.githubusercontent.com/toeverything/AFFiNE/canary/packages/backend/server/src/schema.gql
   ```
   Guardar en `docs/affine-schema.gql` (referencia viva, no se modifica).
2. **Cruzar contra la guía de la comunidad** en
   [discussion #6052](https://github.com/toeverything/AFFiNE/discussions/6052)
   para confirmar endpoints REST y prefijos.
3. **Identificar y anotar en `docs/api-map.md`:**
   - **Query** `workspaces` → para `GET /api/v1/workspaces`.
   - **Query** `workspace(id).docs(paginator: ...)` → para listar pages.
   - **Query** `workspace(id).collections` o similar → para listar collections.
   - **Mutation** candidata para crear página: leer el schema y encontrar la
     firma exacta (probablemente `createDoc` con un argumento `type: "page"`
     o similar, no `createPage` literalmente).
   - **Mutation** para título: `updateDoc` con un input de título, o
     `updateDocTitle` si existe.
4. **Verificación contra instancia real**: hacer un `curl` simple a
   `https://notes.nglab.es/graphql` con un introspection query mínima
   (`{ __schema { queryType { name } mutationType { name } } }`) y
   comprobar que la instancia responde. Si está bloqueado, no es bloqueante:
   el `schema.gql` del repo es la spec.
5. **Documentar cualquier desviación**: si la versión de tu Affine difiere
   del commit `canary`, anotar las diferencias en `docs/api-map.md`.

**Output de esta fase:**
- `docs/affine-schema.gql` (copia del schema oficial).
- `docs/api-map.md` (mapeo: endpoint REST → query/mutation GraphQL exacta).
- `src/infra/graphql/queries.ts` con las strings listas para usar.

---

### Fase 1 — Conexión, autenticación y estructura (andamiaje)

**Entregable:** servidor arranca, `/health` responde 200, login contra Affine funciona, todas las rutas devuelven 401 sin `x-api-key`.

Tareas:
1. `npm init` + `tsconfig.json` estricto + estructura de carpetas vacía.
2. Instalar deps de la sección 2.
3. `src/config/env.ts` con Zod: parsea `process.env`, falla rápido si falta algo crítico, exporta objeto tipado.
4. `src/infra/affine/auth.ts`:
   - `signIn(email, password)` → llama `POST /api/auth/sign-in` y guarda cookies.
   - `getCookies()` → devuelve `Cookie:` header listo para GraphQL.
   - `ensureSession()` → si no hay sesión, intenta con env vars; si tampoco, hace login.
   - Refresco: si una request GraphQL devuelve 401, reintenta una vez tras re-login.
5. `src/infra/graphql/client.ts`: wrapper sobre `graphql-request` que añade automáticamente el header `Cookie`.
6. `src/infra/http/auth-guard.ts`: preHandler de Fastify. Lee `x-api-key`, compara con `crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))`. Si falla, lanza `AppError('UNAUTHORIZED', 401)`.
7. `src/plugins/error-handler.ts`: un único lugar que mapea errores a `{ error: { code, message } }` con el status correcto.
8. `src/app.ts` con `buildApp()` (testable) + `src/server.ts` con `app.listen()`.
9. Endpoint `GET /health` (sin auth) que devuelve `{ status: 'ok', affine: 'connected' | 'disconnected' }`.
10. Registrar rutas `/api/v1/...` con `addHook('onRequest', authGuard)` global al prefijo `/api/v1`.

**Verificación específica adicional:** hacer un `curl` directo a
`https://notes.nglab.es/workspace/<workspaceId>/<docId>` con un docId real
(el workspace `58cb2776-...` que ya tienes) para **confirmar el formato
exacto de URL de página** que devolveremos en Fase 3. Sin doc oficial,
esto se valida en runtime.

**Verificación:** `curl localhost:3002/health` → 200 con `affine: 'connected'`. `curl -X POST localhost:3002/api/v1/pages/create` → 401.

---

### Fase 2 — Core de lectura (Quick wins)

**Entregable:** los 3 endpoints GET funcionando contra la instancia real.

Tareas por endpoint (mismo patrón, replicar):

1. `workspace.schema.ts`: Zod para `params` (UUID) y `response`.
2. `workspace.service.ts`: función pura que recibe el cliente GraphQL y devuelve el JSON limpio. **Mapea** la respuesta de Affine a nuestro formato (solo lo que el cliente necesita).
3. `workspace.controller.ts`: handler que inyecta el servicio, llama, responde.

**Queries GraphQL a usar** (las descubriste en tu sesión previa, aquí van las que necesitamos):

- `workspaces`: para `GET /api/v1/workspaces` — devuelve `id`, `name`.
- `workspace(id).collections` (o `workspace(id).docs(filter: "collections")`): para `/collections`.
- `workspace(id).docs(filter: "pages")` con `paginator { first, offset }`: para `/pages`.

**Decisión (ya resuelta con la doc oficial):** Las **collections en Affine
son smart folders con reglas**, no carpetas del sistema de archivos. La doc
oficial lo dice explícitamente:

> "Collections are basically 'smart folders' for docs in current AFFiNE, with
> which you can use rules to select from tags and other properties from Doc
> info"

Implicaciones para la API:
- `GET /workspaces/:id/collections` devuelve **lista plana de colecciones
  con sus reglas**, NO jerarquía padre/hijo.
- El body de cada item expondrá: `id`, `name`, `rules` (array de reglas que
  define la colección), `mode` (manual/auto).
- Si más adelante quieres navegación jerárquica de docs, eso se hace con
  otra query (`workspace(id).docs` con filtros de `subPageOf`), no con
  collections.

**Verificación:** los 3 endpoints devuelven JSON con la estructura prometida. Pruebas con curl + el workspace `58cb2776-ec01-4242-824e-a930aa35671d` que ya tienes.

---

### Fase 3 — Creación de páginas (método seguro)

**Entregable:** `POST /api/v1/pages/create` crea una página vacía y devuelve `{ id, url }`.

Diseño:

```
POST /api/v1/pages/create
Headers: x-api-key, Content-Type: application/json
Body: {
  "workspaceId": "uuid",
  "title": "Mi nota" (opcional, default: "Untitled"),
  "pageMode": "paper" | "edgeless" (opcional, default: "paper")
}
→ 201 {
  "id": "uuid",
  "workspaceId": "uuid",
  "title": "Mi nota",
  "pageMode": "paper",
  "url": "https://notes.nglab.es/workspace/<workspaceId>/<docId>"
}
```

`pageMode` viene de la doc oficial (cada doc puede ser `paper` o `edgeless`).
Lo exponemos opcional para que el cliente controle si quiere un doc en modo
libreta o pizarra desde el primer momento. Si la mutation de creación no
acepta `pageMode` como argumento, lo creamos en `paper` por defecto (que
es lo natural) y lo cambiamos con una segunda mutation si el usuario lo
pidió.

**Mutación GraphQL a usar:** `createDoc` (la mutación estándar de Affine para crear un doc nuevo). Si requiere `addPage` después, encadenamos ambas:
1. `createDoc(workspaceId, { type: "page" })` → devuelve docId.
2. Si hay título, `updateDocTitle(docId, title)` (o lo que Affine exponga).

**Helper `buildPageUrl(docId)`:** Affine sirve las páginas en `https://notes.nglab.es/workspace/<workspaceId>/<docId>`. Lo confirmo al implementar; está sujeto al routing real de tu instancia.

**Verificación:** `curl -X POST ...` con body válido → 201 con `url` que se abre en el navegador mostrando la página nueva (vacía o con título).

---

### Fase 4 — Validación con Zod y Dockerfile

**Zod (cubierto en cada fase, pero formalizado aquí):**
- Schemas en `*.schema.ts` por módulo.
- Schemas de params, query, body y response.
- `fastify-type-provider-zod` los aplica al routing → 400 automático con detalle de qué campo falló y por qué.
- Validación de ENV en `config/env.ts` con `.parse()` al arranque.

**Dockerfile multi-stage** (objetivo: imagen <100MB, <80MB RAM en reposo):

```dockerfile
# ---- Stage 1: deps + build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build             # tsc → dist/
RUN npm prune --omit=dev      # limpiamos devDeps del node_modules

# ---- Stage 2: runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Usuario no root (seguridad + Proxmox-friendly)
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "dist/server.js"]
```

**`.dockerignore`** para evitar copiar `node_modules`, `.env`, `.git`, etc.

**Tamaño esperado:** ~70-90MB. **RAM en reposo:** ~50-70MB.

**Verificación:** `docker build -t affine-rest-bridge .` → imagen pequeña. `docker run -e API_KEY=... -e AFFINE_PASSWORD=... -p 3002:3002 affine-rest-bridge` → funciona idéntico al local.

---

### Fase 5 — Backlog (interfaces preparadas, sin implementar)

En `src/modules/sdk-future/`:
- `README.md` explicando qué falta (SDK oficial de `@affine/server`).
- `block-manipulation.interface.ts` con firmas comentadas tipo:
  ```ts
  // export interface BlockManipulationService {
  //   appendBlock(docId: string, block: Block): Promise<void>;
  //   updateBlock(docId: string, blockId: string, patch: Patch): Promise<void>;
  // }
  ```
- Marcado como `// @experimental` y un test placeholder que `it.skip()` hasta que el SDK exista.

Esto deja la puerta abierta sin meter código muerto que rompa builds.

---

## 5. Pruebas

- **Unit (servicios):** mockear el cliente GraphQL, validar mapeos de respuesta.
- **Integración (controladores):** usar `app.inject()` de Fastify — sin red, sin puerto real, rapidísimo.
- **E2E (manual):** un `scripts/smoke.sh` que hace las 4 operaciones reales contra `notes.nglab.es` con un `curl` cada una. Pensado para correr en CI o tras un deploy.
- **Auth guard:** test que prueba que sin `x-api-key` → 401, con clave incorrecta → 401, con clave correcta → pasa al handler.

No vamos a hacer unit tests de cada línea en el MVP (sería sobreingeniería), pero sí cubrir los caminos críticos: auth guard, los 3 GETs, el POST create, y el mapeo de errores de GraphQL.

**Smoke test de Fase 0**: un test que falla si la instancia de Affine
devuelve algo distinto al schema esperado. Es ruido-preventivo barato.

---

## 6. Orden de ejecución

Si apruebas, voy en este orden:

1. **Fase 0 — Mapeo del schema GraphQL** (½ sesión) — descargar
   `schema.gql` del canary, identificar mutations exactas, verificar con
   un curl de introspection mínimo. Sin esto, Fase 1+ trabajan a ciegas.
2. **Esqueleto + Fase 1** (1 sesión de trabajo) — el "hello world
   autenticado" tiene que funcionar antes que nada.
3. **Fase 2** (1 sesión) — los 3 GETs, son los más rápidos.
4. **Fase 3** (media sesión) — el POST, depende de tener Fase 1 sólida.
5. **Fase 4 Zod + Dockerfile** (1 sesión) — Zod va entrelazado, el Dockerfile
   al final para tener algo que empaquetar.
6. **Fase 5** (15 min) — es boilerplate, no implementación.

Total estimado: **2-3 días** de trabajo tranquilo, MVP listo y desplegable en Proxmox.

---

## 7. Riesgos y cosas a confirmar contigo

**Riesgos materiales del proyecto:**

- 🟡 **Schema GraphQL no documentado oficialmente.** La doc pública no
  expone la API, pero el schema está en
  `packages/backend/server/src/schema.gql` del repo. **Mitigación:** Fase 0
  mapea el schema contra el brief antes de tirar código. Si tu versión de
  Affine difiere del `canary`, ajustamos en `docs/api-map.md`.
- 🟡 **Posibles breaking changes entre versiones.** AFFiNE no da garantías
  de estabilidad del API. **Mitigación:** versionamos la instancia de
  Affine contra la que trabajamos en el README, y tests de integración
  fallan ruidosamente si cambia la firma de una mutation.
- 🟢 **`createPage` puede no existir literalmente** — probablemente sea
  `createDoc` con tipo. **Resuelto en Fase 0.**

**Alcance del MVP (recordatorio, no nos movemos de aquí en v1):**

- ✅ Incluido: workspaces (list), collections (list), pages (list), create
  page. Auth con cookies Affine + x-api-key en el bridge.
- ❌ **Fuera del MVP (explícitamente):** lectura/escritura de binario Yjs,
  Socket.IO sync, manipulación de bloques, edición de contenido, sync
  local, server-side rendering, AI, webhooks. Todo eso va en versiones
  posteriores si el negocio lo pide.

**Cosas que necesitan tu input** (la mayoría ya resueltas con tu mensaje
anterior y la doc oficial):

1. ✅ **Versión de Affine.** Confirmado: v0.26+ (reciente). Usamos el
   `schema.gql` del branch `canary` como referencia.
2. ✅ **Prefijo URL.** Confirmado: en la raíz (`/graphql`). Sin subpath
   global, simplifica el cliente.
3. ✅ **Endpoint binario Yjs.** Confirmado: **fuera del MVP**. Solo
   GraphQL, sin tocar el formato interno.
4. ✅ **Cuenta de Affine.** `hermes@nglab.es` confirmado como cuenta válida
   con permisos. La usamos para MVP. (Nota: para producción sigue siendo
   buena idea una cuenta bot dedicada, pero lo dejamos para cuando el MVP
   esté validado.)
5. ✅ **Semántica de collections.** Confirmado en la doc oficial: son
   **smart folders con reglas**, no carpetas. El endpoint expone
   `id + name + rules + mode`.
6. 🟡 **Formato de URL de página.** Sin doc oficial, lo verifico en runtime
   durante Fase 1 con un docId real.
7. 🟡 **Persistencia de sesión.** Recomiendo **en memoria + refresh on 401**.
   Es lo más simple y seguro para MVP. Si prefieres persistir cookie en
   volumen Docker (sobrevive a reinicios), me lo dices y lo añado.

Si los puntos 🟡 van según mis recomendaciones, arranco sin más preguntas.

---

## 8. Siguiente paso

Con tus respuestas (v0.26+, raíz, sin Yjs) el plan queda **cerrado y listo
para implementar**. Todo lo abierto está en 🟡 y son verificaciones de
runtime que se hacen solas en Fase 0/1.

**Para arrancar**, dame luz verde con un "dale" o similar y empiezo por
**Fase 0** (mapeo del schema GraphQL). En media sesión tienes:

- `docs/affine-schema.gql` descargado del canary
- `docs/api-map.md` con las queries/mutations exactas que vamos a usar
- Las strings GraphQL listas en `src/infra/graphql/queries.ts`

Si en cambio quieres tocar algo (Fastify → Express, otra ubicación, más
tests, etc.), dímelo y ajusto el plan antes de tocar una línea de código.
