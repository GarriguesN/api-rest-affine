/**
 * GraphQL queries and mutations for Affine.
 *
 * Schema source: packages/backend/server/src/schema.gql, commit canary.
 * Map: docs/api-map.md
 *
 * ⚠️ Mutations de docs/páginas NO existen en GraphQL — se implementarán
 *    via Socket.IO + Yjs en una versión posterior.
 */

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all workspaces accessible to the authenticated user. */
export const LIST_WORKSPACES = /* GraphQL */ `
  query ListWorkspaces {
    workspaces {
      id
      name
      avatarUrl
      createdAt
      memberCount
    }
  }
`;

/** Get a single workspace by ID. */
export const GET_WORKSPACE = /* GraphQL */ `
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
            createDate
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
        createDate
        updatedAt
        mode
      }
    }
  }
`;

/** List collections (CopilotContextCategory) inside a workspace. */
export const LIST_COLLECTIONS = /* GraphQL */ `
  query ListCollections($workspaceId: String!) {
    workspace(id: $workspaceId) {
      collections {
        id
        name
        description
        docCount
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Mutations (placeholder — no doc mutations in GraphQL yet)
// ---------------------------------------------------------------------------

/** Placeholder: creating docs requires Socket.IO + Yjs (future work). */
export const PLACEHOLDER_CREATE_PAGE = /* GraphQL */ `
  # createPage mutation does not exist in Affine GraphQL.
  # It is implemented via Socket.IO space:push-doc-update.
  # See docs/api-map.md for details.
  query __placeholder {
    __typename
  }
`;
