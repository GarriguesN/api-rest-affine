# Campos adicionales descubiertos del GraphQL de Affine

Generado via introspección en `notes.nglab.es` (2026-06-17).

## WorkspaceType — más campos disponibles

```graphql
workspace {
  id createdAt initialized enableAi enableSharing
  public role memberCount team
  owner { id name email avatarUrl }
  quota {
    name           # "Pro"
    memberLimit    # 10
    storageQuota   # 107374182400 (bytes)
    usedStorageQuota # 852038
    overcapacityMemberCount
    historyPeriod  # 2592000000 (ms = 30 días)
    blobLimit      # 104857600
  }
  subscription { plan status recurring provider }   # null en self-hosted
  members { id name email }
  blobsSize      # bytes usados en blobs
  # NOTA: no workspace.name ni workspace.avatarUrl
}
```

## DocType — campos extra (además de id, title, createdAt, updatedAt, mode)

```graphql
doc(docId: "...") {
  id title createdAt updatedAt mode public
  workspaceId creatorId lastUpdaterId
  defaultRole permissions
  public grantedUsersList(pagination: {first: N}) {
    totalCount
    edges { node { user { id name email } role } }
  }
  analytics {
    generatedAt       # timestamp de generación del informe
    summary {
      totalViews     # vistas totales
      uniqueViews    # vistas únicas
      guestViews     # visitas de invitados
      lastAccessedAt # última vez accedido
    }
    series {         # serie temporal (Daily por defecto)
      date           # "2026-06-11T00:00:00.000Z"
      totalViews
      uniqueViews
      guestViews
    }
    window {
      bucket          # "Day"
      effectiveSize
      requestedSize
      timezone        # "UTC"
      from to         # rango de fechas
    }
  }
}
```

## DocPermissions — campos booleanos

```
Doc_Read, Doc_Update, Doc_Delete, Doc_Duplicate
Doc_Comments_Read, Doc_Comments_Create, Doc_Comments_Delete, Doc_Comments_Resolve
Doc_Properties_Read, Doc_Properties_Update
Doc_Users_Read, Doc_Users_Manage
Doc_Trash, Doc_Restore, Doc_Copy, Doc_Publish, Doc_TransferOwner
```

## Campos NO disponibles (confirmados ausentes)

- `workspace.name` — no existe
- `workspace.avatarUrl` — no existe (owner sí tiene)
- `workspace.collections` — no existe
- `DocType.title` en bulk list — es null; se necesita fetch individual
- `DocTypeEdge.pageInfo` — pageInfo está en PaginatedDocType, no en el edge
