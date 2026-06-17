/**
 * TypeScript types for the Affine GraphQL API.
 * Updated from live introspection (2026-06-17) against notes.nglab.es.
 *
 * Key schema findings:
 * - WorkspaceType: id, createdAt, initialized, enableAi, enableSharing,
 *                  role (string), public (bool), memberCount, owner {id, name, email}
 *                  NO workspace.name, NO workspace.avatarUrl
 * - DocType: id, title (nullable), createdAt, updatedAt, mode
 * - PaginatedDocType.edges[].node = DocType
 * - No collections field on WorkspaceType
 */

export interface AffineUser {
  id: string;
  name: string;
  email: string;
}

export interface AffineWorkspace {
  id: string;
  createdAt: string;
  memberCount: number;
  initialized: boolean;
  enableSharing: boolean;
  enableAi: boolean;
  role: string;
  public: boolean;
  owner: AffineUser;
}

export interface AffineDoc {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  mode: 'Page' | 'Edgeless';
}

export interface PageEdge {
  node: AffineDoc;
  cursor: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface PaginatedDocs {
  edges: PageEdge[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface ListPagesResponse {
  workspace: {
    docs: PaginatedDocs;
  } | null;
}

export interface ListWorkspacesResponse {
  workspaces: AffineWorkspace[];
}

export interface GetWorkspaceResponse {
  workspace: AffineWorkspace | null;
}

export interface GetPageResponse {
  workspace: {
    doc: AffineDoc | null;
  } | null;
}

// GraphQL error response shape
export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[]; locations?: unknown[] }>;
}
