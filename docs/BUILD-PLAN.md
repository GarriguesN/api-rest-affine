# api-rest-affine — Build Plan

## Objetivo
Construir un bridge REST API completo sobre la API GraphQL + Socket.IO de Affine (self-hosted en notes.nglab.es), en Node.js/TypeScript con Fastify.

## Repositorio
`~/Documents/04_Notas_Aplicaciones/affine-rest-bridge`

## Arquitectura General

```
External REST API (Bridge)
    │
    ├── HTTP REST (Fastify)
    │   ├── Auth: sign-in, sign-out, session
    │   ├── Workspaces: list, get, create, update, delete
    │   ├── Docs: list, get, create, update, delete
    │   ├── Members: invite, list, grant, revoke
    │   ├── Blobs: upload, download, list, delete
    │   └── Pages: bulk title enrichment
    │
    ├── GraphQL (existing — queries/mutations)
    │
    └── Socket.IO Client
        ├── Gateway A: Realtime Live Queries
        │   └── Workspace members, config, quota, notifications (subscribe/unsubscribe)
        └── Gateway B: Doc Sync
            ├── load-doc (snapshot/diff)
            ├── push-doc-update (create/edit pages!)
            └── delete-doc
```

## Strategy de Commits

Commits pequeños, atómicos, con mensajes claros. Cada feature nueva = commit separado.

## Fases de Desarrollo

---

### Fase 0 — Plan y preparación ✅

- [x] Repository exists with Fastify + TypeScript
- [x] GraphQL integration working (17/17 tests pass)
- [x] Auth via cookies working
- [x] Reverse engineering del repo AFFiNE guardado en `docs/affine-source-reverse-engineering.md`

---

### Fase 1 — Auth REST (Commit temprano)

**Objetivo:** Authentication completa via REST, sin depender del GraphQL `currentUser`.

**Work items:**
1. Module `auth-rest`: `POST /api/auth/sign-in` → Affine, set cookies
2. Module `auth-rest`: `POST /api/auth/sign-out` → clear cookies
3. Module `auth-rest`: `GET /api/auth/session` → current user info
4. Middleware `auth.ts`: validate session from cookies
5. Replace GraphQL `currentUser` queries with REST calls
6. Tests para auth flow

**API resultante:**
```
POST /api/auth/login     → { email, password } → session cookie + user
POST /api/auth/logout    → clear session
GET  /api/auth/me        → current user info
```

**Commit:** `feat: auth REST module — login, logout, session`

---

### Fase 2 — Socket.IO Client Infrastructure

**Objetivo:** Client genérico de Socket.IO reusable para todas las operaciones.

**Work items:**
1. Package `socket.io-client` instalado (ya en frontend, instalamos para backend)
2. Module `infra/socket/client.ts`:
   - Connection manager con reconnect automático
   - Auth via session token
   - Client version header
   - Emitters con acknowledgment
3. Type definitions copiadas de `@affine/realtime` → `src/types/realtime.ts`
4. Tests de conexión al Socket.IO de Affine

**Commit:** `feat: Socket.IO client infrastructure`
**Commit:** `types: realtime type definitions from @affine/realtime`

---

### Fase 3 — Socket.IO Gateway A: Realtime Live Queries

**Objetivo:** Exponer las 15 operaciones RPC y 15 topics como endpoints REST con subscribe/unsubscribe.

**Work items:**
1. Module `infra/socket/realtime-requests.ts`:
   - `realtimeRequest<T>(op, input)` genérico
   - Las 15 operaciones: `workspace.access.get`, `workspace.members.get`, `user.quota-state.get`, etc.
2. Module `infra/socket/realtime-subscriptions.ts`:
   - Subscribe to topic (room join)
   - Event listener registration
   - Unsubscribe
3. Module `modules/realtime/`:
   - `GET /realtime/:workspaceId/members` → via Socket.IO
   - `GET /realtime/:workspaceId/quota` → via Socket.IO
   - `GET /realtime/me/quota` → via Socket.IO
   - `WS /ws/realtime` → WebSocket endpoint para subscriptions en tiempo real
4. Tests de realtime queries

**Commit:** `feat: Socket.IO realtime requests (15 operations)`
**Commit:** `feat: Socket.IO realtime subscriptions with WS endpoint`

---

### Fase 4 — Socket.IO Gateway B: Doc Sync (CRUD!)

**Objetivo:** Crear, leer, actualizar, eliminar páginas — el holy grail.

**Work items:**
1. Module `infra/socket/doc-sync.ts`:
   - `joinSpace(workspaceId)` → join room
   - `loadDoc(workspaceId, docId, stateVector?)` → get snapshot/diff
   - `pushDocUpdate(workspaceId, docId, update)` → **crear/editar!**
   - `deleteDoc(workspaceId, docId)`
   - `getDocTimestamps(workspaceId)` → list all docs with timestamps
2. Module `modules/docs/`:
   - `GET /workspaces/:id/docs/:docId` → already exists (REST)
   - `GET /workspaces/:id/pages` → list all pages with titles (via doc-sync)
   - `PUT /workspaces/:id/docs/:docId` → **create/update doc** (via Socket.IO push)
   - `DELETE /workspaces/:id/docs/:docId` → delete doc
3. Type definitions para doc update format (Yjs binary)

**Commit:** `feat: Socket.IO doc sync — join, load, push, delete`
**Commit:** `feat: doc CRUD endpoints via Socket.IO`

---

### Fase 5 — Doc Binary Parser

**Objetivo:** Extraer texto, títulos y estructura de los Yjs binary blobs.

**Work items:**
1. Module `utils/yjs-parser.ts`:
   - Parse Yjs binary → extract readable text
   - Extract `prop:title` fields
   - Extract block structure
2. Endpoint `GET /workspaces/:id/docs/:docId/text` → plain text content
3. Endpoint `GET /workspaces/:id/docs/:docId/titles` → extract all titles
4. Batch title enrichment: `POST /workspaces/:id/pages/titles` → fetch titles for all pages at once

**Commit:** `feat: Yjs binary parser — extract text, titles, structure`
**Commit:** `feat: batch page title enrichment endpoint`

---

### Fase 6 — Blob Management

**Objetivo:** Upload, download, list y delete blobs (imágenes, archivos).

**Work items:**
1. Module `modules/blobs/`:
   - `GET /workspaces/:id/blobs` → list blobs (via GraphQL `workspace.blobs`)
   - `POST /workspaces/:id/blobs` → upload blob (multipart)
   - `GET /workspaces/:id/blobs/:name` → download blob (already exists via REST proxy)
   - `DELETE /workspaces/:id/blobs/:name` → delete blob (GraphQL mutation)
2. Blob upload flow: multipart → GraphQL `setBlob` mutation
3. Tests de blob operations

**Commit:** `feat: blob management — list, upload, delete`

---

### Fase 7 — Workspace Management (GraphQL)

**Objetivo:** Completar endpoints de workspace (create, update, delete).

**Work items:**
1. Module `modules/workspaces/`:
   - `POST /workspaces` → create workspace
   - `PATCH /workspaces/:id` → update (enable/disable AI, sharing)
   - `DELETE /workspaces/:id` → delete
2. Members endpoints:
   - `GET /workspaces/:id/members`
   - `POST /workspaces/:id/members/invite`
   - `DELETE /workspaces/:id/members/:userId`
   - `PATCH /workspaces/:id/members/:userId/role`
3. Share endpoints:
   - `POST /workspaces/:id/docs/:docId/share` → publish
   - `DELETE /workspaces/:id/docs/:docId/share` → revoke

**Commit:** `feat: workspace CRUD endpoints`
**Commit:** `feat: members management endpoints`
**Commit:** `feat: doc sharing endpoints`

---

### Fase 8 — Tests, Docs y Merge

**Objetivo:** Dejar todo listo para producción.

**Work items:**
1. Tests para cada nuevo módulo (vitest)
2. Swagger/OpenAPI docs generados (Fastify swagger plugin)
3. README.md actualizado con todos los endpoints
4. Postman/Thunder Client collection exportable
5. `develop → main` merge
6. GitHub release notes

**Commit:** `test: auth REST tests`
**Commit:** `test: Socket.IO realtime tests`
**Commit:** `test: doc sync tests`
**Commit:** `docs: API reference and examples`
**Commit:** `chore: merge develop → main`

---

## Commit Schedule

| Cada... | Hacer commit con mensaje |
|---|---|
| Cada feature pequeña (1-3 archivos) | `feat: ...` o `fix: ...` |
| Cada conjunto de tests | `test: ...` |
| Cada documentación | `docs: ...` |
| Cada refactor | `refactor: ...` |
| Máximo esperar | 30 min sin commit |

**Antes de cada commit:**
```
git add -p  # review changes
git commit -m "feat: <description>"
git push origin develop
```

## GitHub Activity Target

- ~15-20 commits por sesión de trabajo
- 1 merge request de develop → main al final
- Commits pequeños y descriptivos = historial limpio y útil

## Progress Tracker

| Fase | Status | Commits |
|---|---|---|
| Fase 0 — Plan y preparación | ✅ Done | 5 |
| Fase 1 — Auth REST | ⏳ Pending | ~1 |
| Fase 2 — Socket.IO Infrastructure | ⏳ Pending | ~2 |
| Fase 3 — Realtime Live Queries | ⏳ Pending | ~2 |
| Fase 4 — Doc Sync (CRUD) | ⏳ Pending | ~2 |
| Fase 5 — Doc Binary Parser | ⏳ Pending | ~2 |
| Fase 6 — Blob Management | ⏳ Pending | ~1 |
| Fase 7 — Workspace Management | ⏳ Pending | ~3 |
| Fase 8 — Tests y Docs | ⏳ Pending | ~5 |
| **TOTAL** | | **~23 commits** |
