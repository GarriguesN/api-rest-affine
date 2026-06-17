/**
 * AFFiNE Realtime Gateway — typed wrappers for all Socket.IO realtime RPC operations.
 *
 * These are one-shot requests (not subscriptions) that proxy directly to AFFiNE's
 * RealtimeGateway via Socket.IO.
 *
 * Auth: requires a valid JWT token (obtained via POST /auth/token/exchange).
 *
 * Operations (15 total):
 *  - workspace.access.get       → workspace role + permissions
 *  - workspace.config.get        → workspace feature flags
 *  - workspace.members.get       → paginated member list
 *  - workspace.invite-link.get   → invite link
 *  - doc.share-state.get         → doc public share state
 *  - doc.grants.get              → doc-level permission grants
 *  - user.profile.get            → current user profile
 *  - user.settings.get           → user notification settings
 *  - user.access-tokens.get       → personal access tokens
 *  - notification.count.get      → unread notification count
 *  - comment.changes.get         → comment history (with cursor pagination)
 *  - workspace.embedding.progress.get → AI embedding progress
 *  - copilot.transcript.task.get  → copilot transcript task
 *  - user.quota-state.get         → user storage quota
 *  - workspace.quota-state.get    → workspace storage quota
 */

import { realtimeRequest } from '../../infra/socket/client.js';
import type {
  RealtimeRequestName,
  RealtimeRequestInputOf,
  RealtimeRequestOutputOf,
} from '../../types/realtime.js';

// ---------------------------------------------------------------------------
// Generic execute helper
// ---------------------------------------------------------------------------

async function execute<Op extends RealtimeRequestName>(
  op: Op,
  input: RealtimeRequestInputOf<Op>,
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<Op>> {
  return realtimeRequest(op, input, { jwtToken, timeoutMs: 20_000 });
}

// ---------------------------------------------------------------------------
// Workspace operations
// ---------------------------------------------------------------------------

/**
 * GET /workspace/:id/access
 * Returns the current user's role and permissions within a workspace.
 */
export async function getWorkspaceAccess(
  workspaceId: string,
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'workspace.access.get'>> {
  return execute('workspace.access.get', { workspaceId }, jwtToken);
}

/**
 * GET /workspace/:id/config
 * Returns workspace feature flags (AI, sharing, url preview, doc embedding).
 */
export async function getWorkspaceConfig(
  workspaceId: string,
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'workspace.config.get'>> {
  return execute('workspace.config.get', { workspaceId }, jwtToken);
}

/**
 * GET /workspace/:id/members
 * Returns paginated list of workspace members with roles.
 */
export async function getWorkspaceMembers(
  workspaceId: string,
  jwtToken: string,
  options?: { skip?: number; take?: number; query?: string },
): Promise<RealtimeRequestOutputOf<'workspace.members.get'>> {
  const input = { workspaceId };
  if (options?.skip !== undefined) (input as Record<string, unknown>).skip = options.skip;
  if (options?.take !== undefined) (input as Record<string, unknown>).take = options.take;
  if (options?.query !== undefined) (input as Record<string, unknown>).query = options.query;
  return execute('workspace.members.get', input as RealtimeRequestInputOf<'workspace.members.get'>, jwtToken);
}

/**
 * GET /workspace/:id/invite-link
 * Returns the workspace invite link if one exists.
 */
export async function getWorkspaceInviteLink(
  workspaceId: string,
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'workspace.invite-link.get'>> {
  return execute('workspace.invite-link.get', { workspaceId }, jwtToken);
}

// ---------------------------------------------------------------------------
// Document operations
// ---------------------------------------------------------------------------

/**
 * GET /workspace/:wid/docs/:did/share-state
 * Returns whether a doc is publicly shared and with what mode/role.
 */
export async function getDocShareState(
  workspaceId: string,
  docId: string,
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'doc.share-state.get'>> {
  return execute('doc.share-state.get', { workspaceId, docId }, jwtToken);
}

/**
 * GET /workspace/:wid/docs/:did/grants
 * Returns paginated doc-level permission grants.
 */
export async function getDocGrants(
  workspaceId: string,
  docId: string,
  jwtToken: string,
  pagination?: { first: number; after?: string },
): Promise<RealtimeRequestOutputOf<'doc.grants.get'>> {
  const input: RealtimeRequestInputOf<'doc.grants.get'> = {
    workspaceId,
    docId,
    pagination: pagination
      ? { first: pagination.first, ...(pagination.after !== undefined ? { after: pagination.after } : {}) }
      : { first: 20 },
  };
  return execute('doc.grants.get', input, jwtToken);
}

// ---------------------------------------------------------------------------
// Comment operations
// ---------------------------------------------------------------------------

/**
 * GET /workspace/:wid/docs/:did/comments
 * Returns comment history with cursor-based pagination.
 */
export async function getCommentChanges(
  workspaceId: string,
  docId: string,
  jwtToken: string,
  options?: { after?: string; first?: number },
): Promise<RealtimeRequestOutputOf<'comment.changes.get'>> {
  const input: RealtimeRequestInputOf<'comment.changes.get'> = {
    workspaceId,
    docId,
    ...(options?.after !== undefined ? { after: options.after } : {}),
    first: options?.first ?? 20,
  };
  return execute('comment.changes.get', input, jwtToken);
}

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

/**
 * GET /user/me
 * Returns the current user's profile.
 */
export async function getUserProfile(
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'user.profile.get'>> {
  return execute('user.profile.get', {}, jwtToken);
}

/**
 * GET /user/me/settings
 * Returns the current user's notification settings.
 */
export async function getUserSettings(
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'user.settings.get'>> {
  return execute('user.settings.get', {}, jwtToken);
}

/**
 * GET /user/me/access-tokens
 * Returns the user's personal access tokens (for API access).
 */
export async function getUserAccessTokens(
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'user.access-tokens.get'>> {
  return execute('user.access-tokens.get', {}, jwtToken);
}

// ---------------------------------------------------------------------------
// Notification operations
// ---------------------------------------------------------------------------

/**
 * GET /user/me/notifications/count
 * Returns the unread notification count.
 */
export async function getNotificationCount(
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'notification.count.get'>> {
  return execute('notification.count.get', {}, jwtToken);
}

// ---------------------------------------------------------------------------
// AI / Embedding operations
// ---------------------------------------------------------------------------

/**
 * GET /workspace/:id/embedding-progress
 * Returns AI embedding progress (total docs vs embedded docs).
 */
export async function getWorkspaceEmbeddingProgress(
  workspaceId: string,
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'workspace.embedding.progress.get'>> {
  return execute('workspace.embedding.progress.get', { workspaceId }, jwtToken);
}

/**
 * GET /workspace/:id/copilot/transcript
 * Returns copilot transcript task status.
 */
export async function getCopilotTranscriptTask(
  workspaceId: string,
  jwtToken: string,
  options?: { blobId?: string; taskId?: string },
): Promise<RealtimeRequestOutputOf<'copilot.transcript.task.get'>> {
  const input: RealtimeRequestInputOf<'copilot.transcript.task.get'> = { workspaceId };
  if (options?.blobId !== undefined) input.blobId = options.blobId;
  if (options?.taskId !== undefined) input.taskId = options.taskId;
  return execute('copilot.transcript.task.get', input, jwtToken);
}

// ---------------------------------------------------------------------------
// Quota operations
// ---------------------------------------------------------------------------

/**
 * GET /user/me/quota
 * Returns the current user's storage quota state.
 */
export async function getUserQuotaState(
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'user.quota-state.get'>> {
  return execute('user.quota-state.get', {}, jwtToken);
}

/**
 * GET /workspace/:id/quota
 * Returns workspace-level storage quota and member seat state.
 */
export async function getWorkspaceQuotaState(
  workspaceId: string,
  jwtToken: string,
): Promise<RealtimeRequestOutputOf<'workspace.quota-state.get'>> {
  return execute('workspace.quota-state.get', { workspaceId }, jwtToken);
}
