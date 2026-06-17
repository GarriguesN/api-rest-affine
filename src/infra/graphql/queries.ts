/**
 * GraphQL queries and mutations for Affine.
 *
 * Schema source: live introspection against notes.nglab.es (2026-06-17).
 * - WorkspaceType has: id, createdAt, initialized, enableAi, enableSharing,
 *   role, public, memberCount, owner { id, name, email }
 * - No workspace.name, no workspace.avatarUrl
 * - DocType has: id, title (nullable), createdAt, updatedAt, mode, workspaceId
 * - PaginatedDocType has: edges, pageInfo, totalCount
 * - DocTypeEdge has: cursor, node (NOT pageInfo)
 * - No collections field on WorkspaceType — /collections endpoint returns empty
 *
 * ⚠️ Mutations (create/update pages) do NOT exist in GraphQL — implemented
 *    via Socket.IO + Yjs in a future release.
 */

import type { ListWorkspacesResponse, GetWorkspaceResponse, ListPagesResponse, PageEdge, GetPageResponse } from '../affine/types.js';

// Re-export for convenience
export type { ListWorkspacesResponse, GetWorkspaceResponse, ListPagesResponse, PageEdge, GetPageResponse };

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all workspaces accessible to the authenticated user. */
export const LIST_WORKSPACES = /* GraphQL */ `
  query ListWorkspaces {
    workspaces {
      id
      createdAt
      initialized
      enableAi
      enableSharing
      role
      public
      memberCount
      owner {
        id
        name
        email
      }
    }
  }
`;

/** Get a single workspace by ID. */
export const GET_WORKSPACE = /* GraphQL */ `
  query GetWorkspace($id: String!) {
    workspace(id: $id) {
      id
      createdAt
      initialized
      enableAi
      enableSharing
      role
      public
      memberCount
      owner {
        id
        name
        email
      }
    }
  }
`;

/** List pages (docs) inside a workspace with pagination. */
export const LIST_PAGES = /* GraphQL */ `
  query ListPages($workspaceId: String!, $first: Int, $offset: Int) {
    workspace(id: $workspaceId) {
      docs(pagination: { first: $first, offset: $offset }) {
        totalCount
        edges {
          node {
            id
            title
            createdAt
            updatedAt
            mode
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
`;

/** Get metadata for a single page/doc. */
export const GET_PAGE = /* GraphQL */ `
  query GetPage($workspaceId: String!, $docId: String!) {
    workspace(id: $workspaceId) {
      doc(docId: $docId) {
        id
        title
        createdAt
        updatedAt
        mode
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Placeholder mutations (no doc mutations exist in GraphQL)
// ---------------------------------------------------------------------------

/**
 * Placeholder — creating docs requires Socket.IO + Yjs.
 * See docs/api-map.md for details.
 */
export const PLACEHOLDER_CREATE_PAGE = /* GraphQL */ `
  query __placeholder {
    __typename
  }
`;

// ---------------------------------------------------------------------------
// Workspace mutations
// ---------------------------------------------------------------------------

/** Delete a workspace. Requires Owner role. */
export const DELETE_WORKSPACE = /* GraphQL */ `
  mutation DeleteWorkspace($id: String!) {
    deleteWorkspace(id: $id)
  }
`;

/** Invite members to a workspace by email. */
export const INVITE_MEMBERS = /* GraphQL */ `
  mutation InviteMembers($workspaceId: String!, $emails: [String!]!) {
    inviteMembers(workspaceId: $workspaceId, emails: $emails) {
      email
      inviteId
      error
    }
  }
`;

/** Leave a workspace. */
export const LEAVE_WORKSPACE = /* GraphQL */ `
  mutation LeaveWorkspace($workspaceId: String!) {
    leaveWorkspace(workspaceId: $workspaceId)
  }
`;
