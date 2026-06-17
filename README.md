# api-rest-affine

> **REST API bridge for self-hosted Affine instances** — expose your Affine data through a clean, documented REST interface.

[![CI](https://github.com/GarriguesN/api-rest-affine/actions/workflows/ci.yml/badge.svg)](https://github.com/GarriguesN/api-rest-affine/actions)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue)](https://www.typescriptlang.org)

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Navigation Tree](#navigation-tree)
- [Endpoints Reference](#endpoints-reference)
  - [Health & System](#health--system)
  - [Authentication](#authentication-1)
  - [Workspaces](#workspaces)
  - [Docs / Pages](#docs--pages)
  - [Collections](#collections)
  - [Blobs](#blobs)
  - [Sync (SpaceSyncGateway)](#sync-spacesyncgateway)
  - [RealtimeGateway ⚠️](#realtimegateway-)
- [Error Codes](#error-codes)
- [Rate Limiting](#rate-limiting)
- [Architecture](#architecture)
- [Development](#development)

---

## Overview

`api-rest-affine` is a lightweight microservice that wraps your self-hosted Affine instance's APIs (GraphQL + Socket.IO) behind a clean REST interface.

**Why?** Building integrations with Affine — Telegram bots, automations, external dashboards, scripts — requires dealing with:
- Cookie-based authentication and CSRF tokens
- GraphQL queries and mutations
- Socket.IO connections for real-time data
- Yjs binary encoding for document manipulation

This bridge handles all of that. You get JSON over HTTP.

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| Auth proxy | ✅ Stable | Login, logout, session, preflight via REST |
| Workspace CRUD | ✅ Stable | List, get, create, delete workspaces |
| Workspace membership | ✅ Stable | Invite, leave workspaces |
| Doc metadata | ✅ Stable | List and get doc/page metadata via GraphQL |
| Blob download | ✅ Stable | Download workspace blobs |
| SpaceSync (Socket.IO) | ✅ Stable | Yjs doc sync — load, push, text extraction |
| RealtimeGateway | ⚠️ Unavailable | Live queries via Socket.IO — **not available on self-hosted** |
| Doc deletion | ⚠️ Limited | GraphQL `deleteDoc` unavailable; Socket.IO `space:delete-doc` not implemented on self-hosted |

### Instance Compatibility

| Instance Type | Status | Notes |
|---|---|---|
| Self-hosted (`notes.nglab.es`) | ✅ Fully tested | Full feature support except RealtimeGateway |
| Affine Cloud | ⚠️ Untested | `tokenType: 'jwt'` may be needed instead of `'session'` |

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/GarriguesN/api-rest-affine.git
cd api-rest-affine
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your values
```

Required environment variables:

```env
# Server
PORT=3002
HOST=0.0.0.0
API_KEY=your-32-char-random-key   # openssl rand -hex 32

# Affine instance
AFFINE_BASE_URL=https://notes.nglab.es
AFFINE_GRAPHQL_URL=https://notes.nglab.es/graphql
AFFINE_EMAIL=your-affine-email@example.com
AFFINE_PASSWORD=your-affine-password
```

### 3. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Server starts at `http://localhost:3002`.

### 4. Verify

```bash
curl http://localhost:3002/health
# {"status":"ok","version":"0.1.0","affine":"connected"}
```

---

## Authentication

### Bridge Authentication (`x-api-key`)

Every request to protected endpoints must include the bridge API key:

```http
x-api-key: eb6da8f0d1bea4b124484ff9b6f39f7e7a2476d0d4c1e8fa41267d9a82db41eb
```

> **Public endpoints** (no `x-api-key` required): `/health`, `/auth/*`

### Affine User Authentication

Protected endpoints also require an active Affine user session. There are two ways to establish one:

#### Option A — Bridge login (`/auth/login`)

```bash
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt

# Response includes sessionCookie + csrfToken
```

#### Option B — External cookies

If you already have `affine_session` and `affine_csrf_token` cookies from the Affine web app, pass them directly:

```bash
curl http://localhost:3002/api/v1/workspaces \
  -H "x-api-key: $API_KEY" \
  -b "affine_session=xxx; affine_csrf_token=yyy"
```

### Socket.IO Endpoints (`Authorization: Bearer <token>`)

Sync and realtime endpoints use a session token (from `/auth/login`):

```http
Authorization: Bearer eb807e91-e401-4beb-b322-747cffb0fade
```

---

## Navigation Tree

```
/
├── health                                    GET
│
├── auth/
│   ├── login                                POST        (public)
│   ├── logout                               POST        (public)
│   ├── preflight                            POST        (public)
│   ├── me                                   GET
│   └── token/exchange                       POST        (public)
│
└── api/v1/
    ├── workspaces                            GET
    │   └── /{workspaceId}                   GET   DELETE
    │       ├── /invite                      POST
    │       ├── /leave                      POST
    │       ├── /collections                 GET
    │       └── /pages                      GET
    │
    ├── pages/{pageId}                      GET
    │
    ├── blobs/{workspaceId}/{key}            GET
    │
    ├── sync/workspaces/{workspaceId}/
    │   ├── /join                           POST   DELETE
    │   └── /docs/
    │       ├── /timestamps                 GET
    │       └── /{docId}                    GET   PUT   DELETE
    │           └── /text                   GET
    │
    └── realtime/
        ├── user/me/
        │   ├── /profile                    GET
        │   ├── /settings                  GET
        │   ├── /access-tokens             GET
        │   ├── /notifications/count       GET
        │   └── /quota                     GET
        │
        └── workspaces/{workspaceId}/
            ├── /access                     GET
            ├── /config                     GET
            ├── /members                    GET
            ├── /invite-link                GET
            ├── /quota                      GET
            ├── /embedding-progress         GET
            ├── /copilot/transcript         GET
            └── /docs/{docId}/
                ├── /share-state            GET
                ├── /grants                 GET
                └── /comments               GET
```

---

## Endpoints Reference

> **Base URL:** `http://localhost:3002`
>
> **Headers (protected):** `x-api-key: <your-api-key>` + user session cookie
>
> **Content-Type:** `application/json` for all POST/PUT/PATCH requests

---

### Health & System

#### `GET /health`

Health check — no authentication required.

**Response** `200 OK`
```json
{
  "status": "ok",
  "version": "0.1.0",
  "affine": "connected"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` when healthy |
| `version` | string | Bridge version |
| `affine` | string | `"connected"` if Affine session is valid |

---

### Authentication

All `/auth/*` endpoints are **public** — no `x-api-key` required.

---

#### `POST /auth/login`

Authenticate with Affine and establish a user session.

**Request body**
```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Response** `200 OK`
```json
{
  "user": {
    "id": "f15aaf23-f698-4164-98d8-e0599ad95385",
    "name": "naxtio",
    "email": "user@example.com",
    "emailVerified": false,
    "hasPassword": true,
    "avatarUrl": null
  },
  "sessionCookie": "eb807e91-e401-4beb-b322-747cffb0fade",
  "csrfToken": "45245517-b68e-4bd2-878c-1e640411d51f",
  "jwtToken": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `user` | object | User profile |
| `sessionCookie` | string | **Use this as `Authorization: Bearer <token>`** for Sync/Realtime endpoints |
| `csrfToken` | string | CSRF token for form actions |
| `jwtToken` | null | JWT exchange not available on self-hosted |

---

#### `GET /auth/me`

Get the current authenticated user.

**Headers:** `x-api-key`, session cookie (`affine_session`)

**Response** `200 OK`
```json
{
  "user": {
    "id": "f15aaf23-f698-4164-98d8-e0599ad95385",
    "name": "naxtio",
    "email": "user@example.com",
    "emailVerified": false,
    "hasPassword": true,
    "avatarUrl": null
  }
}
```

**Response** `401 Unauthorized` — invalid or expired session

---

#### `POST /auth/preflight`

Check if an email is registered on the Affine instance.

**Request body**
```json
{
  "email": "user@example.com"
}
```

**Response** `200 OK` — registered user
```json
{
  "registered": true,
  "hasPassword": true
}
```

**Response** `200 OK` — unregistered user
```json
{
  "registered": false,
  "hasPassword": false
}
```

---

#### `POST /auth/logout`

End the current user session.

**Headers:** `x-api-key`, session cookie

**Response** `200 OK`
```json
{
  "ok": true
}
```

---

#### `POST /auth/token/exchange`

Exchange an Affine exchange code for a JWT token.

> ⚠️ **Note:** This endpoint is for Affine Cloud compatibility. On self-hosted instances, the `sessionCookie` from `/auth/login` can be used directly as the Socket.IO auth token.

**Request body**
```json
{
  "code": "exchange-code-from-affine"
}
```

**Response** `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Workspaces

**Base path:** `/api/v1/workspaces`

**Auth:** `x-api-key` + session cookie

---

#### `GET /api/v1/workspaces`

List all workspaces accessible to the authenticated user.

**Response** `200 OK`
```json
{
  "workspaces": [
    {
      "id": "58cb2776-ec01-4242-824e-a930aa35671d",
      "createdAt": "2026-06-17T07:37:22.924Z",
      "memberCount": 2,
      "initialized": true,
      "enableSharing": true,
      "enableAi": false,
      "role": "Owner",
      "public": false,
      "owner": {
        "id": "f15aaf23-f698-4164-98d8-e0599ad95385",
        "name": "naxtio",
        "email": "user@example.com"
      }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Workspace identifier |
| `role` | string | Your role: `"Owner"` or `"Collaborator"` |
| `public` | boolean | Whether the workspace is publicly accessible |
| `enableAi` | boolean | Whether Affine AI features are enabled |
| `memberCount` | number | Total number of members |

---

#### `GET /api/v1/workspaces/{workspaceId}`

Get a single workspace by ID.

**Path parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspaceId` | UUID | Workspace identifier |

**Response** `200 OK`
```json
{
  "workspace": {
    "id": "58cb2776-ec01-4242-824e-a930aa35671d",
    "createdAt": "2026-06-17T07:37:22.924Z",
    "memberCount": 2,
    "initialized": true,
    "enableSharing": true,
    "enableAi": false,
    "role": "Owner",
    "public": false,
    "owner": {
      "id": "f15aaf23-f698-4164-98d8-e0599ad95385",
      "name": "naxtio",
      "email": "user@example.com"
    }
  }
}
```

---

#### `DELETE /api/v1/workspaces/{workspaceId}`

Delete a workspace. **Requires Owner role.**

**Response** `200 OK`
```json
{
  "ok": true
}
```

**Response** `403 Forbidden` — insufficient permissions

---

#### `POST /api/v1/workspaces/{workspaceId}/invite`

Invite members to a workspace by email.

> ⚠️ **Restriction:** Affine may require the workspace to be older than 24 hours before invitations can be sent.

**Request body**
```json
{
  "emails": [
    "colleague@example.com",
    "partner@example.com"
  ]
}
```

**Response** `200 OK`
```json
{
  "invitations": [
    {
      "email": "colleague@example.com",
      "inviteId": "inv-abc123",
      "error": null
    },
    {
      "email": "partner@example.com",
      "inviteId": "inv-def456",
      "error": null
    }
  ]
}
```

**Response** `403 Forbidden` — invitations not yet available (new workspace)

**Response** `400 Bad Request` — validation error

---

#### `POST /api/v1/workspaces/{workspaceId}/leave`

Leave a workspace.

> ⚠️ **Note:** Workspace owners cannot leave. Transfer ownership first or delete the workspace.

**Response** `200 OK`
```json
{
  "ok": true
}
```

**Response** `403 Forbidden` — `Owner can not leave the workspace`

---

#### `GET /api/v1/workspaces/{workspaceId}/pages`

List all pages (docs) in a workspace with pagination.

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `first` | integer | 20 | Number of results per page (max 100) |
| `offset` | integer | 0 | Number of results to skip |

**Response** `200 OK`
```json
{
  "pages": {
    "edges": [
      {
        "cursor": "YXJyYXljb20uY3Vyc29yIDE=",
        "node": {
          "id": "YgxO9m7Cga",
          "title": "Getting Started",
          "createdAt": "2026-06-17T07:38:22.000Z",
          "updatedAt": "2026-06-17T14:12:00.000Z",
          "mode": "Page"
        }
      }
    ],
    "pageInfo": {
      "hasNextPage": true,
      "hasPreviousPage": false,
      "startCursor": "YXJyYXljb20uY3Vyc29yIDE=",
      "endCursor": "YXJyYXljb20uY3Vyc29yIDEwMA=="
    },
    "totalCount": 21
  }
}
```

---

#### `GET /api/v1/workspaces/{workspaceId}/collections`

List collections in a workspace.

**Response** `200 OK`
```json
{
  "collections": {
    "edges": [],
    "pageInfo": { "hasNextPage": false },
    "totalCount": 0
  }
}
```

> ⚠️ **Note:** Collections may not be available on all Affine versions.

---

### Docs / Pages

#### `GET /api/v1/pages/{pageId}`

Get metadata for a single page/doc.

**Response** `200 OK`
```json
{
  "page": {
    "id": "YgxO9m7Cga",
    "title": "Getting Started",
    "createdAt": "2026-06-17T07:38:22.000Z",
    "updatedAt": "2026-06-17T14:12:00.000Z",
    "mode": "Page"
  }
}
```

---

### Blobs

#### `GET /api/v1/blobs/{workspaceId}/{key}`

Download a binary blob from a workspace.

> ⚠️ **Note:** Blob upload is not supported via REST. Use the GraphQL `setBlob` mutation with `graphql-upload` multipart encoding.

**Path parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspaceId` | UUID | Workspace identifier |
| `key` | string | Blob key (from doc content references) |

**Response** `200 OK`
```
Content-Type: application/octet-stream
Content-Length: 123456
[binary data]
```

**Response** `404 Not Found` — blob does not exist

---

### Sync (SpaceSyncGateway)

**Base path:** `/api/v1/sync/workspaces/{workspaceId}`

**Auth:** `x-api-key` + `Authorization: Bearer <sessionToken>` (from `/auth/login`)

Uses Affine's Socket.IO SpaceSyncGateway for Yjs document synchronization. Each request creates a temporary Socket.IO connection, executes the operation, and closes.

---

#### `POST /api/v1/sync/workspaces/{workspaceId}/join`

Join a workspace room to receive doc update broadcasts.

**Request body:** `{}` (empty)

**Response** `200 OK`
```json
{
  "clientId": "fYB0ZBw_cx1WOb8lAABh"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clientId` | string | Your Socket.IO client ID in this workspace |

---

#### `DELETE /api/v1/sync/workspaces/{workspaceId}/join`

Leave a workspace room.

**Response** `200 OK`
```json
{
  "ok": true
}
```

---

#### `GET /api/v1/sync/workspaces/{workspaceId}/docs/timestamps`

Get the last-modified timestamp for every document in a workspace.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `since` | integer | Unix timestamp (ms) — filter docs modified after this time |

**Response** `200 OK`
```json
{
  "C9Rs42EsT2": 1781681844109,
  "YgxO9m7Cga": 1781682326634,
  "Y_4PQeZBtd": 1781688526381,
  "WHhrdpWHjm": 1781688589425,
  "db$58cb2776-ec01-4242-824e-a930aa35671d$folders": 1781689504081
}
```

Returns a map of `docId → lastModifiedTimestamp` (Unix ms). Internal/system docs (prefixed with `db$`, `userdata$`) are included.

---

#### `GET /api/v1/sync/workspaces/{workspaceId}/docs/{docId}`

Load the full Yjs binary state of a document.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `stateVector` | string (base64) | Optional Yjs state vector — if provided, server returns only missing updates instead of full state |

**Response** `200 OK`
```json
{
  "docId": "YgxO9m7Cga",
  "timestamp": 1781682326634,
  "state": "A+78+8bdxe8FkAGR7cDl6aLQBOYBpZrs...",
  "missing": "Awru/PvG3cXvBQChpZrs+PufowHpMQG..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `docId` | string | Document identifier |
| `timestamp` | number | Server-side last modification timestamp (Unix ms) |
| `state` | string (base64) | Yjs binary state (when no `stateVector` provided) |
| `missing` | string (base64) | Yjs binary updates since your `stateVector` (when `stateVector` is provided) |

> **Note:** When fetching without `stateVector`, AFFiNE returns a minimal state vector in `state` and the full document in `missing`. Apply only `missing` to a fresh Y.Doc to reconstruct the document.

---

#### `GET /api/v1/sync/workspaces/{workspaceId}/docs/{docId}/text`

Load a document and extract its plain text content.

**Response** `200 OK`
```json
{
  "docId": "YgxO9m7Cga",
  "title": "Getting Started ",
  "mode": null,
  "plainText": "Getting Started \nWelcome to AFFiNE! \nYou can start with a normal page...",
  "blockCount": 111
}
```

| Field | Type | Description |
|-------|------|-------------|
| `docId` | string | Document identifier |
| `title` | string\|null | Document title (from `prop:title` in root block) |
| `mode` | string\|null | `"Page"` or `"Edgeless"` (may be null) |
| `plainText` | string | Full text content extracted from all blocks |
| `blockCount` | number | Total number of blocks in the document |

---

#### `PUT /api/v1/sync/workspaces/{workspaceId}/docs/{docId}`

Create or update a document by pushing a Yjs update.

**Request body**
```json
{
  "update": "A+78+8bdxe8FkAGR7cDl6aLQBOYBpZrs+PufowHtMQ=="
}
```

> `update` must be a base64-encoded Yjs binary update (from `Y.encodeStateAsUpdate(doc)`).

**Response** `200 OK`
```json
{
  "docId": "test-api-doc",
  "timestamp": 1781729099748
}
```

---

#### `DELETE /api/v1/sync/workspaces/{workspaceId}/docs/{docId}`

Permanently delete a document.

**Response** `501 Not Implemented`

```json
{
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "space:delete-doc is not available on this AFFiNE instance. The RealtimeGateway delete-doc operation is not implemented on self-hosted AFFiNE."
  }
}
```

> ⚠️ **Limitation:** Document deletion via Socket.IO (`space:delete-doc`) is not implemented on self-hosted AFFiNE instances. No GraphQL alternative exists. This is an AFFiNE server limitation, not the bridge.

---

### RealtimeGateway ⚠️

**Base path:** `/api/v1/realtime`

**Auth:** `x-api-key` + `Authorization: Bearer <sessionToken>`

> ⚠️ **Availability Notice:** The RealtimeGateway (live query subscriptions via Socket.IO) is **not available on self-hosted AFFiNE instances**. All endpoints in this section return `501 Not Implemented` or time out.
>
> The underlying AFFiNE server does not respond to `realtime:request` events on self-hosted deployments. All data these endpoints would provide is already accessible via GraphQL (workspaces, pages, etc.).

---

#### `GET /api/v1/realtime/user/me/profile`

Get the current user's profile with feature flags.

**Response** `501 Not Implemented`
```json
{
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "RealtimeGateway is not available on self-hosted AFFiNE instances"
  }
}
```

---

#### `GET /api/v1/realtime/user/me/settings`

Get notification settings.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/user/me/access-tokens`

List personal access tokens.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/user/me/notifications/count`

Get unread notification count.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/user/me/quota`

Get user storage quota state.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/access`

Get user's role and permissions in a workspace.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/config`

Get workspace feature flags (AI, sharing, URL preview, doc embedding).

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/members`

Get paginated member list for a workspace.

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `skip` | integer | 0 | Number to skip |
| `take` | integer | 20 | Number to return (max 100) |
| `query` | string | — | Filter by name/email |

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/invite-link`

Get the workspace invite link.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/quota`

Get workspace storage quota state.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/embedding-progress`

Get AI embedding progress.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/copilot/transcript`

Get copilot transcript task.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `blobId` | string | Blob identifier |
| `taskId` | string | Task identifier |

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/docs/{docId}/share-state`

Get document public share state.

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/docs/{docId}/grants`

Get document-level permission grants with cursor pagination.

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `first` | integer | 20 | Results per page (max 100) |
| `after` | string | — | Cursor for pagination |

**Response** `501 Not Implemented`

---

#### `GET /api/v1/realtime/workspaces/{workspaceId}/docs/{docId}/comments`

Get comment history with cursor pagination.

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `after` | string | — | Cursor |
| `first` | integer | 20 | Results per page (max 100) |

**Response** `501 Not Implemented`

---

## Error Codes

All errors follow a consistent JSON structure:

```json
{
  "error": {
    "code": "GRAPHQL_ERROR",
    "message": "Human-readable description",
    "graphqlErrors": []
  }
}
```

### Bridge Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body, query, or params failed Zod validation |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing or invalid `x-api-key` |
| `JWT_MISSING` | 401 | Missing `Authorization: Bearer` header |
| `JWT_INVALID` | 401 | Invalid or expired session token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `NOT_IMPLEMENTED` | 501 | Feature not available on this AFFiNE instance |
| `GRAPHQL_ERROR` | 502 | AFFiNE GraphQL returned an error |
| `SERVICE_UNAVAILABLE` | 503 | AFFiNE is unreachable or session expired |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected bridge error |

### GraphQL Error Extensions

When `code` is `GRAPHQL_ERROR`, the `graphqlErrors` array contains detailed AFFiNE error information:

```json
{
  "error": {
    "code": "GRAPHQL_ERROR",
    "message": "Owner can not leave the workspace.",
    "graphqlErrors": [
      {
        "message": "Owner can not leave the workspace.",
        "extensions": {
          "status": 403,
          "type": "ACTION_FORBIDDEN",
          "name": "OWNER_CAN_NOT_LEAVE_WORKSPACE"
        }
      }
    ]
  }
}
```

### Common AFFiNE Restrictions

| Error | Cause | Solution |
|-------|-------|----------|
| `ACTION_FORBIDDEN` — "24 hours after signup" | Workspace or account too new | Wait 24 hours |
| `OWNER_CAN_NOT_LEAVE_WORKSPACE` | Owner tried to leave | Transfer ownership or delete |
| RealtimeGateway timeout | Self-hosted limitation | Use GraphQL equivalents instead |

---

## Rate Limiting

Currently **no rate limiting** is enforced. The bridge proxies requests directly to AFFiNE — respect AFFiNE's own rate limits.

Recommended: max **10 concurrent requests** per client session.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                                │
│  (Telegram bot, script, dashboard, mobile app, etc.)        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   api-rest-affine (:3002)                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Auth Module │  │  GraphQL Module   │  │  Socket.IO   │  │
│  │  /auth/*     │  │  /api/v1/*       │  │  /sync/*     │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────┬───────┘  │
│         │                   │                    │            │
│         └───────────────────┼────────────────────┘            │
│                             ▼                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                  Affine Instance                         │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │   │
│  │  │  REST API   │  │   GraphQL    │  │  Socket.IO   │  │   │
│  │  │ /api/auth/* │  │  /graphql   │  │  /socket.io  │  │   │
│  │  └─────────────┘  └──────────────┘  └───────────────┘  │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Module Breakdown

| Module | Protocol | Description |
|--------|----------|-------------|
| `auth` | REST → Affine REST | Login, logout, session management |
| `workspaces` | REST → GraphQL | Workspace CRUD and membership |
| `pages` | REST → GraphQL | Page/doc metadata |
| `blobs` | REST → Affine Blob API | Blob download |
| `sync` | REST → Socket.IO SpaceSyncGateway | Yjs document sync |
| `realtime` | REST → Socket.IO RealtimeGateway | Live queries (unavailable self-hosted) |

---

## Development

### Scripts

```bash
npm run dev        # Development with hot-reload (tsx watch)
npm run build      # Compile TypeScript
npm start          # Run production server
npm test           # Run tests
npm run lint       # ESLint
npm run typecheck  # TypeScript type check
```

### Environment

```bash
# Copy and edit
cp .env.example .env

# Required
API_KEY=                          # Bridge API key (openssl rand -hex 32)
AFFINE_BASE_URL=                  # Your AFFiNE instance URL
AFFINE_GRAPHQL_URL=              # GraphQL endpoint
AFFINE_EMAIL=                    # AFFiNE account email
AFFINE_PASSWORD=                 # AFFiNE account password
PORT=3002
```

### Testing

```bash
npm test           # Run all tests (Vitest)
npm run test:watch # Watch mode
```

### Project Structure

```
src/
├── server.ts              # Entry point
├── app.ts                 # Fastify app builder
├── config/
│   └── env.ts             # Environment variables (Zod)
├── infra/
│   ├── affine/            # Affine REST auth session
│   ├── graphql/           # GraphQL client + queries
│   ├── http/              # Auth guard middleware
│   └── socket/            # Socket.IO client
├── modules/
│   ├── auth/              # /auth/* routes
│   ├── workspaces/         # /api/v1/workspaces/*
│   ├── pages/             # /api/v1/pages/*
│   ├── blobs/             # /api/v1/blobs/*
│   ├── sync/              # /api/v1/sync/* (SpaceSyncGateway)
│   ├── realtime/          # /api/v1/realtime/* (RealtimeGateway)
│   └── health/            # /health
├── plugins/
│   └── error-handler.ts   # Centralized error formatting
├── types/
│   └── realtime.ts        # Socket.IO type definitions
└── utils/
    ├── errors.ts         # Typed error classes
    └── yjs-parser.ts     # Yjs binary → plain text parser
```

---

## License

MIT — GarriguesNacho
