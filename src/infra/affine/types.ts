/**
 * TypeScript types for the Affine GraphQL API.
 * Generated manually from schema.gql (canary, 2026-06-17).
 * See docs/api-map.md for the mapping.
 */

export interface AffineWorkspace {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  memberCount: number;
  initialized?: boolean;
  enableSharing?: boolean;
  enableAi?: boolean;
}

export interface AffineDoc {
  id: string;
  title: string;
  createDate: string;
  updatedAt: string;
  mode: 'Page' | 'Edgeless';
}

export interface AffineCollection {
  id: string;
  name: string;
  description?: string | null;
  docCount?: number;
}

export interface PaginatedEdges<T> {
  edges: Array<{ node: T }>;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount: number;
}

export interface ListPagesResponse {
  workspace: {
    docs: PaginatedEdges<AffineDoc>;
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

export interface ListCollectionsResponse {
  workspace: {
    collections: AffineCollection[];
  } | null;
}

// GraphQL error response shape
export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[]; locations?: unknown[] }>;
}
