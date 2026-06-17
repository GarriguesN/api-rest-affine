# api-rest-affine

> REST API bridge for self-hosted Affine instances.
> GraphQL-first, no Yjs manipulation. Built for Node.js 22+.

## What is this?

A lightweight microservice that exposes your self-hosted Affine data through a clean
REST API. The bridge handles authentication with Affine and translates GraphQL queries
into JSON responses.

**Why?** If you want to build integrations with Affine (Telegram bots, automations,
external dashboards) without dealing with cookies, CSRF tokens, or the Affine GraphQL
schema directly — this is the layer in between.

## Architecture

```
Client (bot, script, dashboard)
  → REST API (this bridge, :3002)
    → Affine GraphQL (notes.nglab.es/graphql)
```

The bridge is **read-only** in this version. Writing content (creating pages,
editing blocks) requires Socket.IO + Yjs and is planned for a future release.

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/GarriguesN/api-rest-affine.git
cd api-rest-affine
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Generate a long random key: openssl rand -hex 32
API_KEY=your-long-random-api-key

# Your Affine instance
AFFINE_BASE_URL=https://notes.nglab.es
AFFINE_GRAPHQL_URL=https://notes.nglab.es/graphql

# Account with access to the workspaces you want to query
AFFINE_EMAIL=your-email@domain.com
AFFINE_PASSWORD=your-password
```

### 3. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Server starts on `http://0.0.0.0:3002`.

### 4. Test

```bash
# Health check (no auth)
curl http://localhost:3002/health

# List workspaces (requires auth)
curl -H "x-api-key: your-api-key" \
  http://localhost:3002/api/v1/workspaces
```

## API reference

All `/api/v1/*` endpoints require the header `x-api-key: <your-key>`.

### Public

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | ❌ | Server status + Affine connectivity |

### Workspaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/workspaces` | List all workspaces |
| GET | `/api/v1/workspaces/:id` | Get workspace metadata |

### Collections

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/workspaces/:id/collections` | List collections in a workspace |

> **Note:** These are Copilot context categories, not traditional folders.
> See [docs/api-map.md](docs/api-map.md) for details.

### Pages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/workspaces/:id/pages` | List pages with pagination |
| GET | `/api/v1/pages/:pageId?workspaceId=` | Get single page metadata |

Pagination params (all optional):

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `first` | 20 | 100 | Number of results |
| `offset` | 0 | — | Skip N results |

Example:

```bash
curl -H "x-api-key: your-key" \
  "http://localhost:3002/api/v1/workspaces/UUID/pages?first=10&offset=0"
```

## Response format

All responses are JSON.

**Success:**
```json
{
  "pages": [...],
  "totalCount": 42,
  "pageInfo": {
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Error:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Workspace 'xyz' not found"
  }
}
```

Error codes: `UNAUTHORIZED` (401), `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `GRAPHQL_ERROR` (502), `INTERNAL_SERVER_ERROR` (500).

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | ✅ | — | Long random string for bridge auth |
| `AFFINE_BASE_URL` | ✅ | — | Base URL of your Affine instance |
| `AFFINE_GRAPHQL_URL` | ✅ | — | GraphQL endpoint URL |
| `AFFINE_EMAIL` | ✅ | — | Affine account email |
| `AFFINE_PASSWORD` | ✅ | — | Affine account password |
| `AFFINE_SESSION_COOKIE` | ❌ | — | Pre-set session cookie (skip login at startup) |
| `AFFINE_CSRF_TOKEN` | ❌ | — | Pre-set CSRF token |
| `PORT` | ❌ | 3002 | Server port |
| `HOST` | ❌ | 0.0.0.0 | Server host |
| `LOG_LEVEL` | ❌ | info | Pino log level |
| `NODE_ENV` | ❌ | development | `development` or `production` |

## Docker

```bash
# Build
docker build -t api-rest-affine .

# Run
docker run -d \
  -p 3002:3002 \
  -e API_KEY=your-key \
  -e AFFINE_EMAIL=your@email.com \
  -e AFFINE_PASSWORD=your-password \
  -e AFFINE_BASE_URL=https://notes.nglab.es \
  -e AFFINE_GRAPHQL_URL=https://notes.nglab.es/graphql \
  --name affine-bridge \
  api-rest-affine
```

Image size: ~80MB. RAM usage at rest: ~50-70MB.

## Development

```bash
npm run dev          # Dev server with hot reload (tsx)
npm run build         # Compile TypeScript
npm run test          # Run tests (Vitest)
npm run lint          # ESLint
npm run typecheck     # TypeScript check without emit
```

## Project structure

```
src/
├── config/env.ts              # Zod schema validation
├── infra/
│   ├── affine/
│   │   ├── auth.ts           # Affine sign-in, session cookies
│   │   └── types.ts         # TypeScript types from GraphQL schema
│   ├── graphql/
│   │   ├── client.ts        # GraphQL client with auto-retry on 401
│   │   └── queries.ts       # GraphQL query strings
│   └── http/
│       └── auth-guard.ts    # x-api-key validation
├── modules/
│   ├── health/              # GET /health
│   ├── workspaces/          # GET /workspaces
│   ├── collections/         # GET /workspaces/:id/collections
│   └── pages/              # GET /workspaces/:id/pages, /pages/:id
├── plugins/
│   └── error-handler.ts     # Consistent JSON error responses
├── utils/
│   ├── errors.ts           # Typed error classes
│   └── url.ts              # Affine URL builders
├── app.ts                  # Fastify app builder
└── server.ts               # Bootstrap
```

## Known limitations

- **Read-only** in this version. Creating/editing pages requires Socket.IO + Yjs
  (see [docs/api-map.md](docs/api-map.md) for technical context).
- `workspace.collections` returns Copilot context categories, not traditional
  folder hierarchies.
- API stability is not guaranteed — the Affine GraphQL API is not publicly
  documented. Test against your specific Affine version.

## Roadmap

- [ ] `POST /api/v1/pages/create` — create empty pages via Socket.IO
- [ ] Block content read/write (requires Yjs integration)
- [ ] Webhook support for Affine events
- [ ] Rate limiting per API key
- [ ] Metrics endpoint (Prometheus-compatible)

## License

MIT
