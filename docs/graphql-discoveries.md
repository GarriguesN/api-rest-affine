# Campos GraphQL descubiertos — notes.nglab.es

Generado via live introspection (2026-06-17).

## ✅ Campos CONFIRMADOS disponibles

### WorkspaceType
```graphql
workspace {
  id, createdAt, initialized, enableAi, enableSharing
  public, role, memberCount, team
  owner { id, name, email, avatarUrl }  # ← name del owner, NO del workspace
  quota {
    name          # "Pro"
    memberLimit   # 10
    storageQuota  # bytes
    usedStorageQuota
    overcapacityMemberCount
    historyPeriod # ms
    blobLimit
  }
  subscription { plan, status, recurring, provider }  # null en self-hosted
  members { id, name, email }
  blobsSize  # bytes
}
```

### DocType (página individual con GET /doc)
```graphql
doc(docId: "...") {
  id, title, createdAt, updatedAt, mode
  public
  analytics {
    generatedAt
    summary { totalViews, uniqueViews, guestViews, lastAccessedAt }
    series { date, totalViews, uniqueViews, guestViews }
    window { bucket, effectiveSize, requestedSize, timezone, from, to }
  }
  permissions {
    Doc_Read, Doc_Update, Doc_Delete, Doc_Duplicate
    Doc_Comments_*
    Doc_Properties_*
    Doc_Users_Read, Doc_Users_Manage
    Doc_Trash, Doc_Restore, Doc_Copy, Doc_Publish, Doc_TransferOwner
  }
  grantedUsersList(pagination: {first:N}) {
    totalCount
    edges { node { user { id, name, email }, role } }
  }
}
```

### recentlyUpdatedDocs — CON títulos (bulk, limit 20)
```graphql
recentlyUpdatedDocs(pagination: {first: 20}) {
  totalCount
  edges { node { id, title, updatedAt, mode, createdAt } }
}
```
> A diferencia de `docs`, ESTE campo SÍ devuelve títulos. Limitado a ~20 resultados ordenados por updatedAt.

## ❌ Campos CONFIRMADOS AUSENTES

| Campo | Nota |
|-------|------|
| `workspace.name` | No existe en GraphQL para usuarios no-admin |
| `workspace.avatarUrl` | No existe en WorkspaceType |
| `workspace.collections` | No existe |
| `DocType.title` en bulk (`docs`) | Es null en paginación; requiere fetch individual |
| `DocTypeEdge.pageInfo` | pageInfo está en PaginatedDocType, no en el edge |

## 🔒 Requieren permisos especiales

| Campo / Query | Requisito |
|---------------|-----------|
| `AdminWorkspace.name` | Rol admin |
| `adminWorkspaces` / `adminWorkspace` | Rol admin |
| `searchDocs` | AI embedding configurado ("Search provider not found." si no) |

## REST API

Todos los endpoints REST (`/api/workspace/*`, `/api/user/*`) devuelven HTML del SPA.
Solo funcionan como JSON: `/graphql` y `/api/auth/sign-in`.

## Soluciones de contorno

1. **Nombre del workspace** → usar `workspace.owner.name`
2. **Títulos de páginas en bulk** → `recentlyUpdatedDocs(first: 20)` con títulos, o fetch individual por página
3. **Colecciones** → no disponible via API GraphQL/REST
4. **Títulos en lista completa** → no hay forma vía GraphQL; habría que hacer N requests individuales
