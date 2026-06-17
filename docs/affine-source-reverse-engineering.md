# AFFiNE Source Code — Reverse Engineering Report

**Source:** `https://github.com/toeverything/AFFiNE` (cloned at `~/Documents/04_Notas_Aplicaciones/affine-source`)
**Date:** 2026-06-17
**Scope:** Backend server architecture, all API protocols, auth flows, and real-time communication

---

## 1. Architecture Overview

AFFiNE is a **NestJS monorepo** with three distinct communication channels between frontend and backend:

| Channel | Purpose | Protocol |
|---|---|---|
| **GraphQL** | Metadata queries/mutations (workspace, doc, user, permissions, etc.) | HTTP POST `/graphql` |
| **REST** | Binary blobs (doc content, images, avatars) and auth flows | HTTP + Socket.IO |
| **Socket.IO** | Real-time doc sync (Yjs updates) + live query subscriptions | WebSocket/polling at `/socket.io/` |

**Key packages:**
- `packages/backend/server/` — NestJS server (auth, GraphQL, REST, Socket.IO gateways)
- `packages/common/realtime/` — Type definitions for Socket.IO RPC protocol (`RealtimeRequestMap`, `RealtimeTopicMap`)
- `packages/common/nbstore/` — Client-side doc storage, includes `impls/cloud/socket.ts` (Socket.IO client)
- `packages/common/graphql/` — GraphQL client utilities

---

## 2. REST Endpoints

### 2.1 Auth Controller (`/api/auth`)

Located: `packages/backend/server/src/core/auth/controller.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/preflight` | Public | Check available login methods for an email. Returns `{ registered, methods: { password, magicLink, oauth, passkey } }` |
| `GET` | `/api/auth/methods` | Required | Get bound auth methods for current user |
| `POST` | `/api/auth/sign-in` | Public | Sign in. Body: `{ email, password?, callbackUrl?, client_nonce? }`. Sets `affine_session` + `affine_csrf_token` cookies |
| `POST` | `/api/auth/sign-out` | Required | Sign out. Requires CSRF token via `x-affine-csrf-token` header |
| `GET` | `/api/auth/session` | Public* | Get current session user. Returns `{ user: { id, name, email, ... } }` |
| `POST` | `/api/auth/magic-link` | Public | Magic link sign-in. Body: `{ email, token, client_nonce? }` |
| `POST` | `/api/auth/open-app/sign-in-code` | Required | Generate one-time sign-in code for desktop app |
| `POST` | `/api/auth/open-app/sign-in` | Public | Sign in with code. Body: `{ code }` |
| `POST` | `/api/auth/native/exchange` | Public | Exchange session for JWT. Body: `{ code }` |

**Sign-in flow (password):**
```
POST /api/auth/sign-in
Body: { email: string, password: string }

Response (200): {
  id: string,           // user ID
  email: string,
  name: string,
  emailVerified: boolean,
  hasPassword: boolean,
  avatarUrl: string | null,
  feature: string[],
  exchangeCode?: string  // for native app exchange
}
Headers Set-Cookie: affine_session, affine_csrf_token
```

### 2.2 Workspaces Controller (`/api/workspaces`)

Located: `packages/backend/server/src/core/workspaces/controller.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/blobs/:name` | Public* | Get workspace blob (image, file attachment). Requires workspace read permission |
| `GET` | `/api/workspaces/:id/docs/:guid` | Public* | **Get doc binary** (Yjs snapshot). Requires doc read permission. Returns `application/octet-stream` |
| `HEAD` | `/api/workspaces/:id/public-docs/:docId` | Public | Check if public doc exists |
| `GET` | `/api/workspaces/:id/public-docs/:docId` | Public | Get public doc binary (for published pages) |
| `GET` | `/api/workspaces/:id/public-docs/:docId/root-doc` | Public | Get workspace root doc with public docs injected |
| `GET` | `/api/workspaces/:id/docs/:docId/histories/:timestamp` | Required | Get historical snapshot of a doc (ISO timestamp) |
| `GET` | `/api/workspaces/:id/docs/:docId/comment-attachments/:key` | Required | Get comment attachment |

**Doc binary format:** Raw Yjs binary snapshot (application/octet-stream). For workspace root doc, the guid equals the workspace ID.

**Doc history:** Returns historical Yjs snapshot as `application/octet-stream` with `cache-control: private, max-age=2592000, immutable`.

### 2.3 User Avatar Controller (`/api/avatars`)

Located: `packages/backend/server/src/core/user/controller.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/avatars/:id` | Public | Get user avatar by user ID. Only works when storage provider is `fs` |

### 2.4 Doc RPC Controller (`/rpc`)

Located: `packages/backend/server/src/core/doc-service/controller.ts`

Internal endpoints (require `x-access-token` header with specific path/method nonce):

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/rpc/workspaces/:workspaceId/docs/:docId` | Internal | Get doc binary with timestamp header |
| `GET` | `/rpc/workspaces/:workspaceId/docs/:docId/markdown` | Internal | Get doc as markdown |
| `POST` | `/rpc/workspaces/:workspaceId/docs/:docId/diff` | Internal | Get Yjs diff from state vector. Body: raw state vector bytes |
| `GET` | `/rpc/workspaces/:workspaceId/docs/:docId/content` | Internal | Get doc plain text content |
| `GET` | `/rpc/workspaces/:workspaceId/content` | Internal | Get workspace all docs content |

### 2.5 Selfhost Setup Controller (`/api/setup`)

Located: `packages/backend/server/src/core/selfhost/controller.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/setup/create-admin-user` | Public | Create first admin on self-hosted instance |

### 2.6 App Controller (`/info`)

Located: `packages/backend/server/src/app.controller.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/info` | Public | Server info. Returns `{ compatibility, message, type, flavor }` |

---

## 3. Socket.IO Protocol

### 3.1 Connection

- **Endpoint:** `https://notes.nglab.es/socket.io/` (root namespace only)
- **Transports:** For self-hosted: `['polling', 'websocket']`; for cloud: `['websocket']`
- **Auth:** Passed via `auth` callback in Socket.IO handshake. Auth method is configured client-side via `configureSocketAuthMethod()`. For web clients, auth comes from cookies. For native, JWT token.
- **Client version header:** `x-affine-client-version` (required, must be `>=0.25.0`)

### 3.2 Two Socket.IO Gateways

The server has **two separate Socket.IO gateways** (both at root namespace `/`):

#### Gateway A: `RealtimeGateway` (`@SubscribeMessage('realtime:...')`)
Purpose: Live query subscriptions (workspace/doc/user metadata)

#### Gateway B: `SpaceSyncGateway` (`@SubscribeMessage('space:...')`)
Purpose: Yjs doc sync (binary updates)

---

## 4. Socket.IO Gateway A: Realtime Live Queries

Located: `packages/backend/server/src/core/realtime/gateway.ts`

### 4.1 Client → Server Messages

All messages are emitted with acknowledgment (acked).

#### RPC Requests (`realtime:request`)

Emitted with:
```typescript
socket.emit('realtime:request', {
  requestId?: string;
  op: RealtimeRequestName;
  input: RealtimeRequestInputOf<Op>;
  clientVersion?: string;
})
```

Response: `{ data: T } | { error: { name, message, code? } }`

**All operations:**

| Op Name | Input | Output |
|---|---|---|
| `workspace.access.get` | `{ workspaceId }` | `{ access: { role, permissions, team } }` |
| `workspace.config.get` | `{ workspaceId }` | `{ config: { enableAi, enableSharing, enableUrlPreview, enableDocEmbedding } }` |
| `workspace.members.get` | `{ workspaceId, skip?, take?, query? }` | `{ members: WorkspaceMemberSnapshot[], memberCount }` |
| `workspace.invite-link.get` | `{ workspaceId }` | `{ inviteLink: { link, expireTime } | null }` |
| `doc.share-state.get` | `{ workspaceId, docId }` | `{ state: { public, mode, defaultRole } | null }` |
| `doc.grants.get` | `{ workspaceId, docId, pagination: { first, offset?, after? } }` | `{ totalCount, pageInfo, edges: [{ node: { role, user: { id, name, email, avatarUrl } } }] }` |
| `user.profile.get` | `{}` | `{ user: { id, name, email, emailVerified, hasPassword, avatarUrl, features } | null }` |
| `user.settings.get` | `{}` | `{ settings: { receiveInvitationEmail, receiveMentionEmail, receiveCommentEmail } }` |
| `user.access-tokens.get` | `{}` | `{ tokens: [{ id, name, createdAt, expiresAt }] }` |
| `notification.count.get` | `{}` | `{ count: number }` |
| `comment.changes.get` | `{ workspaceId, docId, after?, first? }` | `{ changes, startCursor, endCursor, hasNextPage }` |
| `workspace.embedding.progress.get` | `{ workspaceId }` | `{ total, embedded }` |
| `copilot.transcript.task.get` | `{ workspaceId, blobId?, taskId? }` | `{ task: unknown | null }` |
| `user.quota-state.get` | `{}` | `{ state: UserQuotaStateSnapshot }` |
| `workspace.quota-state.get` | `{ workspaceId }` | `{ state: WorkspaceQuotaStateSnapshot }` |

**Data types:**

```typescript
interface WorkspaceMemberSnapshot {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  permission: 'Owner' | 'Admin' | 'Collaborator' | 'External';
  role: 'Owner' | 'Admin' | 'Collaborator' | 'External';
  inviteId: string;
  emailVerified: boolean | null;
  status: string; // 'Pending' | 'Accepted' | 'UnderReview' | etc.
}

interface UserQuotaStateSnapshot {
  userId: string;
  plan: string;
  blobLimit: number;
  storageQuota: number;
  usedStorageQuota: number;
  historyPeriodSeconds: number;
  copilotActionLimit: number | null;
  flags: Record<string, unknown>;
  known: boolean;
  stale: boolean;
}

interface WorkspaceQuotaStateSnapshot {
  workspaceId: string;
  plan: string;
  seatLimit: number;
  memberCount: number;
  overcapacityMemberCount: number;
  blobLimit: number;
  storageQuota: number;
  usedStorageQuota: number;
  historyPeriodSeconds: number;
  readonly: boolean;
  readonlyReasons: string[];
  flags: Record<string, unknown>;
}
```

#### Subscriptions (`realtime:subscribe`)

Emitted with:
```typescript
socket.emit('realtime:subscribe', {
  subscriptionId?: string;
  topic: RealtimeTopicName;
  input: RealtimeTopicInputOf<Topic>;
  clientVersion?: string;
})
```

Response: `{ data: { subscriptionId: string } }`

**Server → Client events** (via `realtime:event`):
```typescript
socket.on('realtime:event', (event: {
  topic: RealtimeTopicName;
  inputKey: string;
  seq?: number;
  sentAt: number;
  event: RealtimeTopicEventOf<Topic>;
}) => { ... })
```

**Topics available:**

| Topic | Input | Event |
|---|---|---|
| `workspace.access.changed` | `{ workspaceId }` | `{ changed: true, reason: string }` |
| `workspace.config.changed` | `{ workspaceId }` | `{ changed: true, reason: string }` |
| `workspace.members.changed` | `{ workspaceId }` | `{ changed: true, reason: string }` |
| `workspace.invite-link.changed` | `{ workspaceId }` | `{ changed: true, reason: string }` |
| `doc.share-state.changed` | `{ workspaceId, docId }` | `{ changed: true, reason: string }` |
| `doc.grants.changed` | `{ workspaceId, docId }` | `{ changed: true, reason: string }` |
| `user.profile.changed` | `{}` | `{ changed: true }` |
| `user.settings.changed` | `{}` | `{ changed: true }` |
| `user.access-tokens.changed` | `{}` | `{ changed: true }` |
| `notification.count.changed` | `{}` | `{ count: number, reason: 'created'|'read'|'read-all'|'expired-cleanup'|'resync' }` |
| `comment.changed` | `{ workspaceId, docId }` | `{ changed: true, cursor?: string }` |
| `workspace.embedding.progress.changed` | `{ workspaceId }` | `{ total?, embedded?, reason: 'queued'|'progress'|'finished'|'failed'|'resync' }` |
| `copilot.transcript.task.changed` | `{ workspaceId, taskId }` | `{ taskId, status, error? }` |
| `user.quota-state.changed` | `{}` | `{ changed: true }` |
| `workspace.quota-state.changed` | `{ workspaceId }` | `{ changed: true }` |

---

## 5. Socket.IO Gateway B: Space Sync (Yjs Doc Sync)

Located: `packages/backend/server/src/core/sync/gateway.ts`

**Requires joining a space first:**

### 5.1 Join Space
```typescript
socket.emit('space:join', {
  spaceType: 'workspace' | 'userspace',
  spaceId: string,  // workspace ID or user ID (for userspace)
  clientVersion: string  // e.g. "0.26.0"
})
// Response: { data: { clientId, success } }
```

Then the client is in rooms:
- `workspace:{workspaceId}:sync-026` — for protocol >= 0.26.0
- `workspace:{workspaceId}:sync-025` — for protocol < 0.26.0

### 5.2 Load Doc (Yjs snapshot/diff)

```typescript
// Load full doc
socket.emit('space:load-doc', {
  spaceType: 'workspace' | 'userspace',
  spaceId: string,
  docId: string,
  stateVector?: string  // base64-encoded state vector for diff
})
// Response: { data: { missing: string, state: string, timestamp: number } }
// missing = base64(Yjs state vector of what's missing)
// state = base64(Yjs state of the doc)
// For diff: both missing+state returned. For full: missing is full doc, state is empty.
```

### 5.3 Push Doc Update (write)

```typescript
socket.emit('space:push-doc-update', {
  spaceType: 'workspace' | 'userspace',
  spaceId: string,
  docId: string,
  update: string  // base64(Yjs update)
})
// Response: { data: { accepted: true, timestamp: number } }
```

### 5.4 Delete Doc

```typescript
socket.emit('space:delete-doc', {
  spaceType: 'workspace' | 'userspace',
  spaceId: string,
  docId: string
})
// Response: { data: { success: true } }
```

### 5.5 Get Doc Timestamps

```typescript
socket.emit('space:load-doc-timestamps', {
  spaceType: 'workspace' | 'userspace',
  spaceId: string,
  timestamp?: number  // only docs updated after this
})
// Response: { data: Record<docId: string, timestamp: number> }
```

### 5.6 Awareness (cursor/selection sync)

```typescript
// Join awareness
socket.emit('space:join-awareness', {
  spaceType, spaceId, docId, clientVersion
})

// Update awareness
socket.emit('space:update-awareness', {
  spaceType, spaceId, docId, awarenessUpdate: string  // base64(Yjs awareness update)
})

// Server broadcasts to other clients in awareness room
socket.on('space:broadcast-awareness-update', (msg) => { ... })
socket.on('space:collect-awareness', (msg) => { ... })
```

### 5.7 Leave Space

```typescript
socket.emit('space:leave', {
  spaceType: 'workspace' | 'userspace',
  spaceId: string
})
```

### 5.8 Server → Client Broadcasts

When any client pushes a doc update, server broadcasts to all clients in the sync room:

```typescript
// Protocol >= 0.26.0 (batch)
socket.on('space:broadcast-doc-updates', (msg: {
  spaceType: string;
  spaceId: string;
  docId: string;
  updates: string[];  // base64(Yjs updates)
  timestamp: number;
  editor?: string;
  compressed?: boolean;
}) => { ... })

// Protocol < 0.26.0 (single update per event)
socket.on('space:broadcast-doc-update', (msg: {
  spaceType: string;
  spaceId: string;
  docId: string;
  update: string;  // base64(Yjs update)
  timestamp: number;
  editor: string;
}) => { ... })
```

---

## 6. Authentication System

### 6.1 Session Types

The server supports **4 session types**:

1. **Cookie session** — `affine_session` cookie + CSRF via `affine_csrf_token` cookie or `x-affine-csrf-token` header
2. **JWT Bearer** — `Authorization: Bearer <jwt>` header
3. **Legacy Bearer** — old opaque session IDs as bearer tokens
4. **Access token** — `x-api-key` style header

### 6.2 Cookie-based Auth (what we've been using)

Sign in flow:
```
POST /api/auth/sign-in
Content-Type: application/json
Body: { "email": "...", "password": "..." }

Response cookies set:
- affine_session=<session-token>; HttpOnly; Secure; SameSite=Lax
- affine_csrf_token=<csrf-token>; Secure
```

All subsequent requests must include:
- Cookie: `affine_session=<token>`
- Header: `x-affine-csrf-token: <csrf-token>` (for POST/PUT/DELETE)

### 6.3 Socket.IO Auth

For Socket.IO connections, auth is passed in the handshake `auth` callback:

```typescript
// Client configures auth method
configureSocketAuthMethod((endpoint, callback) => {
  callback({ token: jwtToken });  // or session token
});
```

On the server side (`guard.ts`), the Socket.IO auth handler:
1. Reads `handshake.auth.token`
2. If `tokenType === 'jwt'`, sets `Authorization: Bearer <token>` header
3. Calls `guard.signIn(upgradeReq)` to resolve session
4. Returns `true` if session resolved

### 6.4 Client Version

All requests (HTTP and Socket.IO) should include:
```
x-affine-client-version: >=0.26.0
```

Minimum required: `>=0.25.0`. Version check can be disabled in config.

---

## 7. GraphQL API Summary

### 7.1 Key Queries

```graphql
# Get all workspaces for current user
query { workspaces { id, name?, createdAt, public, role, enableAi, ... } }

# Get workspace by ID
query { workspace(id: "...") { id, name, owner { name email }, docs(...), members(...) } }

# Get docs (metadata only, no content)
query {
  workspace(id: "...") {
    docs(pagination: { first: 20 }) {
      edges { node { id, title } }  # title often null
      pageInfo { hasNextPage, endCursor }
    }
  }
}

# Get recently updated docs (with titles)
query {
  workspace(id: "...") {
    recentlyUpdatedDocs(pagination: { first: 20 }) {
      edges { node { id, title, updatedAt } }
    }
  }
}
```

### 7.2 Key Mutations

```graphql
mutation { createWorkspace: WorkspaceType! }
mutation { updateWorkspace(input: { id, enableAi?, enableSharing?, public? }): WorkspaceType! }
mutation { deleteWorkspace(id: String!): Boolean! }
mutation { inviteMembers(emails: [String!]!, workspaceId: String!): [InviteResult!]! }
mutation { grantMember(permission: Permission!, userId: String!, workspaceId: String!): Boolean! }
mutation { revokeMember(userId: String!, workspaceId: String!): Boolean! }
mutation { publishDoc(docId: String!, workspaceId: String!): DocType! }
mutation { revokePublicDoc(docId: String!, workspaceId: String!): DocType! }
mutation { setBlob(blob: Upload!, workspaceId: String!): String! }  # GraphQL upload
mutation { deleteBlob(key: String!, workspaceId: String!, permanently: Boolean!): Boolean! }
```

---

## 8. Blob Storage

### 8.1 REST Download (what we've been using)

```
GET /api/workspaces/{workspaceId}/blobs/{blobName}
```

Returns binary blob. Auth: public (if workspace is readable) or requires session.

### 8.2 REST Upload

Blobs can be uploaded via:
- GraphQL `mutation { setBlob(blob: Upload!, workspaceId: String!): String! }` — multipart upload
- **Multipart upload flow** (for large files):
  1. `mutation { createBlobUpload(key, mime, size, workspaceId) }` → returns `{ uploadId, urls }`
  2. PUT to each URL (AWS S3 presigned)
  3. `mutation { completeBlobUpload(key, uploadId, parts) }`
  4. Abort with `mutation { abortBlobUpload(key, uploadId, workspaceId) }`

### 8.3 List Blobs

```
query { workspace(id: "...") { blobs } }
// Returns: [{ key, mime, size, createdAt }]
```

---

## 9. File: Key Source Locations

| File | Description |
|---|---|
| `packages/backend/server/src/core/auth/controller.ts` | Auth REST endpoints |
| `packages/backend/server/src/core/auth/guard.ts` | Auth guard (session resolution, Socket.IO auth) |
| `packages/backend/server/src/core/workspaces/controller.ts` | REST doc/blob endpoints |
| `packages/backend/server/src/core/user/controller.ts` | Avatar endpoint |
| `packages/backend/server/src/core/doc-service/controller.ts` | Internal RPC doc endpoints |
| `packages/backend/server/src/core/selfhost/controller.ts` | Selfhost setup |
| `packages/backend/server/src/core/realtime/gateway.ts` | Realtime live query gateway |
| `packages/backend/server/src/core/sync/gateway.ts` | Yjs sync gateway (988 lines!) |
| `packages/common/realtime/src/index.ts` | All Socket.IO RPC type definitions |
| `packages/common/nbstore/src/impls/cloud/socket.ts` | Socket.IO client implementation |
| `packages/common/nbstore/src/impls/cloud/doc.ts` | Cloud doc storage (Socket.IO-backed) |
| `packages/backend/server/src/schema.gql` | Full GraphQL schema (2950 lines) |
| `packages/backend/server/src/models/` | Data models (workspace, doc, user) |
| `packages/backend/server/src/core/permission/` | Permission access control |
| `packages/backend/server/src/core/doc/` | Doc storage adapters |

---

## 10. Key Findings for Our Bridge

### What we confirmed works:
- **Cookie-based auth** with `affine_session` + CSRF token
- **GraphQL** at `https://notes.nglab.es/graphql`
- **Doc binary downloads** at `GET /api/workspaces/{id}/docs/{guid}` (Yjs binary)
- **Workspace blob** at `GET /api/workspaces/{id}/blobs/{name}` (images/files)
- **Page titles** can be extracted from the binary Yjs blob (readable UTF-8 strings contain `prop:title` fields)

### What we now understand but haven't implemented:
- **Socket.IO live queries** — `realtime:request` and `realtime:subscribe` for metadata
- **Socket.IO doc sync** — `space:join/load-doc/push-doc-update` for Yjs updates
- **Auth REST endpoints** — `/api/auth/sign-in`, `/api/auth/sign-out`, `/api/auth/session`
- **Blob upload** — multipart upload flow
- **Session exchange** — JWT exchange via `/api/auth/native/exchange`
- **Doc content extraction** — plain text from binary Yjs

### Client version to use:
- `x-affine-client-version: 0.26.0` (or compatible semver)

### Auth flow for bridge:
1. Sign in → get `affine_session` cookie + CSRF token
2. Include both in all subsequent requests
3. For Socket.IO: use session token in handshake auth callback
