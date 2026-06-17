# Affine GraphQL — Mapeo API

> Basado en: `packages/backend/server/src/schema.gql`, commit canary (junio 2026).
> Última revisión: 2026-06-17.

---

## Endpoints REST del bridge → Queries GraphQL

| Endpoint REST | Query GraphQL | Notas |
|---|---|---|
| `GET /api/v1/workspaces` | `workspaces` | Lista todos los workspaces del usuario |
| `GET /api/v1/workspaces/:id` | `workspace(id: $id)` | Metadata de un workspace |
| `GET /api/v1/workspaces/:id/collections` | `workspace(id: $id).collections` | ⚠️ Ver nota bajo la tabla |
| `GET /api/v1/workspaces/:id/pages` | `workspace(id: $id).docs(pagination)` | Paginación con `first` + `offset` |
| `GET /api/v1/pages/:pageId` | `workspace(id: $workspaceId).doc(docId: $pageId)` | Metadata de una página |

---

## ⚠️ Sobre Collections

El campo `collections` en `WorkspaceType` devuelve `[CopilotContextCategory!]!` —
un tipo orientado a la funcionalidad **Copilot/AI context**, no a "smart folders"
como se describe en la documentación pública.

**Acciones posibles:**
1. **Usar `workspace.collections`** tal cual, exponiendo `CopilotContextCategory`
   (id, name, icon, description, docCount, etc.) aunque no sea la semántica
   ideal de "colecciones del sidebar".
2. **Usar `workspace.docs` con filtro** — si existe un campo `filter` en la
   query `docs`, se puede emular la lista de páginas organizadas.

**Decisión provisional:** usamos la opción 1 en MVP. Si resulta que las
collections no son lo que el cliente espera, se ajusta en v2.

---

## GraphQL — Queries confirmadas

```graphql
# Lista workspaces del usuario
query ListWorkspaces {
  workspaces {
    id
    name
    avatarUrl
    createdAt
    memberCount
  }
}

# Metadata de un workspace
query GetWorkspace($id: String!) {
  workspace(id: $id) {
    id
    name
    avatarUrl
    createdAt
    memberCount
    initialized
    enableSharing
    enableAi
  }
}

# Lista docs (páginas) de un workspace
query ListPages($workspaceId: String!, $first: Int, $offset: Int) {
  workspace(id: $workspaceId) {
    docs(pagination: { first: $first, offset: $offset }) {
      totalCount
      edges {
        node {
          id
          title
          createDate
          updatedAt
          mode
          # owner { id name avatarUrl }  # puede fallar si no está en schema
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
}

# Metadata de una página concreta
query GetPage($workspaceId: String!, $docId: String!) {
  workspace(id: $workspaceId) {
    doc(docId: $docId) {
      id
      title
      createDate
      updatedAt
      mode
      # blocks — NO se expone en GraphQL, es Yjs binario
    }
  }
}

# Collections (CopilotContext)
query ListCollections($workspaceId: String!) {
  workspace(id: $workspaceId) {
    collections {
      id
      name
      description
      docCount
      # Los campos exactos de CopilotContextCategory se leen del schema.gql
    }
  }
}
```

---

## GraphQL — Mutations confirmadas

⚠️ **Hallazgo crítico:** El schema GraphQL de Affine **NO tiene mutaciones para
crear, editar o eliminar docs/páginas.** Todas las operaciones de escritura
pasan por:

1. **Socket.IO sync** (`space:push-doc-update`) — requiere cliente Yjs.
2. **REST directo** (`PUT /api/workspaces/:id/docs/:guid`) — mismo requisito Yjs.

**Para el MVP:** las Fazes 1-3 cubren solo endpoints de **lectura**. La
creación de páginas (POST /pages/create) se implementará en una versión
posterior mediante Socket.IO + Yjs mínimo (sin manipular bloques).

---

## API REST de Affine (información)

Según la guía de la comunidad (discussion #6052), existen endpoints REST:

| Método | Path | Uso |
|---|---|---|
| GET | `/api/workspaces/:id/docs/:guid` | Leer binario Yjs del doc |
| GET | `/api/workspaces/:id/blobs/:name` | Leer blob del workspace |
| GET | `/info` | Info del servidor |

**Ninguno de estos se usa en el MVP** (son binarios Yjs).

---

## Auth

- **Sign-in:** `POST /api/auth/sign-in` → devuelve cookies `affine_session` y `affine_csrf_token`.
- **GraphQL:** pasa ambas cookies en el header `Cookie`.
- **CSRF extra:** algunas mutaciones requieren el header `xcsrf-token` además de la cookie.

---

## Versión y actualización

- Schema reference: commit `canary` de `toeverything/AFFiNE`
- Si tu instancia es una versión específica, compara contra el schema.gql de ese tag/branch.
- Para actualizar: `curl -s "https://raw.githubusercontent.com/toeverything/AFFiNE/canary/packages/backend/server/src/schema.gql" -o docs/affine-schema.gql`
