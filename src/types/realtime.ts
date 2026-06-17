/**
 * AFFiNE Realtime Socket.IO type definitions.
 * Derived from `packages/common/realtime/src/index.ts` in the AFFiNE source.
 *
 * These types define the RPC protocol between the client and AFFiNE's
 * Socket.IO gateways:
 * - RealtimeGateway: live query subscriptions (realtime:request / realtime:subscribe)
 * - SpaceSyncGateway: Yjs doc sync (space:join/load-doc/push-doc-update)
 */

import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

export type WorkspaceRoleSnapshot =
  | 'Owner'
  | 'Admin'
  | 'Collaborator'
  | 'External'
  | string;

export type DocRoleSnapshot =
  | 'Owner'
  | 'Manager'
  | 'Editor'
  | 'Commenter'
  | 'Reader'
  | 'External'
  | string;

export type PublicDocModeSnapshot = 'Page' | 'Edgeless' | string;

export interface PaginationInput {
  first: number;
  offset?: number;
  after?: string;
}

export interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

// ---------------------------------------------------------------------------
// Realtime Request/Response (realtime:request / realtime:response)
// ---------------------------------------------------------------------------

export interface RealtimeRequestMap {
  'workspace.access.get': {
    input: { workspaceId: string };
    output: { access: WorkspaceAccessSnapshot };
  };
  'workspace.config.get': {
    input: { workspaceId: string };
    output: { config: WorkspaceConfigSnapshot };
  };
  'workspace.members.get': {
    input: {
      workspaceId: string;
      skip?: number;
      take?: number;
      query?: string;
    };
    output: { members: WorkspaceMemberSnapshot[]; memberCount: number };
  };
  'workspace.invite-link.get': {
    input: { workspaceId: string };
    output: { inviteLink: WorkspaceInviteLinkSnapshot | null };
  };
  'doc.share-state.get': {
    input: { workspaceId: string; docId: string };
    output: { state: DocShareStateSnapshot | null };
  };
  'doc.grants.get': {
    input: { workspaceId: string; docId: string; pagination: PaginationInput };
    output: PaginatedDocGrantedUsersSnapshot;
  };
  'user.profile.get': {
    input: Record<string, never>;
    output: { user: CurrentUserProfileSnapshot | null };
  };
  'user.settings.get': {
    input: Record<string, never>;
    output: { settings: UserSettingsSnapshot };
  };
  'user.access-tokens.get': {
    input: Record<string, never>;
    output: { tokens: AccessTokenSnapshot[] };
  };
  'notification.count.get': {
    input: Record<string, never>;
    output: { count: number };
  };
  'comment.changes.get': {
    input: {
      workspaceId: string;
      docId: string;
      after?: string;
      first?: number;
    };
    output: {
      changes: CommentChangeSnapshot[];
      startCursor: string;
      endCursor: string;
      hasNextPage: boolean;
    };
  };
  'workspace.embedding.progress.get': {
    input: { workspaceId: string };
    output: { total: number; embedded: number };
  };
  'copilot.transcript.task.get': {
    input: { workspaceId: string; blobId?: string; taskId?: string };
    output: { task: unknown | null };
  };
  'user.quota-state.get': {
    input: Record<string, never>;
    output: { state: UserQuotaStateSnapshot };
  };
  'workspace.quota-state.get': {
    input: { workspaceId: string };
    output: { state: WorkspaceQuotaStateSnapshot };
  };
}

// ---------------------------------------------------------------------------
// Realtime Topic subscriptions (realtime:subscribe / realtime:event)
// ---------------------------------------------------------------------------

export interface RealtimeTopicMap {
  'workspace.access.changed': {
    input: { workspaceId: string };
    event: { changed: true; reason: string };
  };
  'workspace.config.changed': {
    input: { workspaceId: string };
    event: { changed: true; reason: string };
  };
  'workspace.members.changed': {
    input: { workspaceId: string };
    event: { changed: true; reason: string };
  };
  'workspace.invite-link.changed': {
    input: { workspaceId: string };
    event: { changed: true; reason: string };
  };
  'doc.share-state.changed': {
    input: { workspaceId: string; docId: string };
    event: { changed: true; reason: string };
  };
  'doc.grants.changed': {
    input: { workspaceId: string; docId: string };
    event: { changed: true; reason: string };
  };
  'user.profile.changed': {
    input: Record<string, never>;
    event: { changed: true };
  };
  'user.settings.changed': {
    input: Record<string, never>;
    event: { changed: true };
  };
  'user.access-tokens.changed': {
    input: Record<string, never>;
    event: { changed: true };
  };
  'notification.count.changed': {
    input: Record<string, never>;
    event: { count: number; reason: NotificationCountChangedReason };
  };
  'comment.changed': {
    input: { workspaceId: string; docId: string };
    event: { changed: true; cursor?: string };
  };
  'workspace.embedding.progress.changed': {
    input: { workspaceId: string };
    event: { total?: number; embedded?: number; reason: WorkspaceEmbeddingProgressReason };
  };
  'copilot.transcript.task.changed': {
    input: { workspaceId: string; taskId: string };
    event: { taskId: string; status: string; error?: string };
  };
  'user.quota-state.changed': {
    input: Record<string, never>;
    event: { changed: true };
  };
  'workspace.quota-state.changed': {
    input: { workspaceId: string };
    event: { changed: true };
  };
}

// ---------------------------------------------------------------------------
// Space Sync (space:join/load-doc/push-doc-update)
// ---------------------------------------------------------------------------

export interface SpaceSyncRequestMap {
  'space:join': {
    input: { spaceType: 'workspace' | 'userspace'; spaceId: string; clientVersion: string };
    output: { clientId: string; success: boolean };
  };
  'space:leave': {
    input: { spaceType: 'workspace' | 'userspace'; spaceId: string };
    output: { clientId: string; success: true };
  };
  'space:load-doc': {
    input: { spaceType: 'workspace' | 'userspace'; spaceId: string; docId: string; stateVector?: string };
    output: { missing: string; state: string; timestamp: number };
  };
  'space:load-doc-timestamps': {
    input: { spaceType: 'workspace' | 'userspace'; spaceId: string; timestamp?: number };
    output: Record<string, number>;
  };
  'space:push-doc-update': {
    input: { spaceType: 'workspace' | 'userspace'; spaceId: string; docId: string; update: string };
    output: { accepted: true; timestamp?: number };
  };
  'space:delete-doc': {
    input: { spaceType: 'workspace' | 'userspace'; spaceId: string; docId: string };
    output: { success: true };
  };
}

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

export interface WorkspaceAccessSnapshot {
  role: WorkspaceRoleSnapshot;
  permissions: Record<string, boolean>;
  team: boolean;
}

export interface WorkspaceConfigSnapshot {
  enableAi: boolean;
  enableSharing: boolean;
  enableUrlPreview: boolean;
  enableDocEmbedding: boolean;
}

export interface WorkspaceMemberSnapshot {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  permission: WorkspaceRoleSnapshot;
  role: WorkspaceRoleSnapshot;
  inviteId: string;
  emailVerified: boolean | null;
  status: string;
}

export interface WorkspaceInviteLinkSnapshot {
  link: string;
  expireTime: string;
}

export interface DocShareStateSnapshot {
  public: boolean;
  mode: PublicDocModeSnapshot;
  defaultRole: DocRoleSnapshot;
}

export interface DocGrantedUserSnapshot {
  role: DocRoleSnapshot;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface PaginatedDocGrantedUsersSnapshot {
  totalCount: number;
  pageInfo: PageInfo;
  edges: { node: DocGrantedUserSnapshot }[];
}

export interface CurrentUserProfileSnapshot {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean | null;
  avatarUrl: string | null;
  features: string[];
}

export interface UserSettingsSnapshot {
  receiveInvitationEmail: boolean;
  receiveMentionEmail: boolean;
  receiveCommentEmail: boolean;
}

export interface AccessTokenSnapshot {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
}

export type CommentChangeActionSnapshot = 'update' | 'delete';

export interface CommentChangeSnapshot {
  id: string;
  action: CommentChangeActionSnapshot;
  item: object;
  commentId: string | null;
}

export interface UserQuotaStateSnapshot {
  userId: string;
  plan: string;
  blobLimit: number;
  storageQuota: number;
  usedStorageQuota: number;
  historyPeriodSeconds: number;
  copilotActionLimit: number | null;
  flags: Record<string, unknown>;
  known: boolean;
  stale: boolean;
}

export interface WorkspaceQuotaStateSnapshot {
  workspaceId: string;
  plan: string;
  seatLimit: number;
  memberCount: number;
  overcapacityMemberCount: number;
  blobLimit: number;
  storageQuota: number;
  usedStorageQuota: number;
  historyPeriodSeconds: number;
  readonly: boolean;
  readonlyReasons: string[];
  flags: Record<string, unknown>;
}

export type NotificationCountChangedReason =
  | 'created'
  | 'read'
  | 'read-all'
  | 'expired-cleanup'
  | 'resync';

export type WorkspaceEmbeddingProgressReason =
  | 'queued'
  | 'progress'
  | 'finished'
  | 'failed'
  | 'resync';

// ---------------------------------------------------------------------------
// Envelope types (Socket.IO messages)
// ---------------------------------------------------------------------------

export type RealtimeRequestName = keyof RealtimeRequestMap;
export type RealtimeTopicName = keyof RealtimeTopicMap;
export type SpaceSyncRequestName = keyof SpaceSyncRequestMap;

export type RealtimeRequestInputOf<Op extends RealtimeRequestName> =
  RealtimeRequestMap[Op]['input'];
export type RealtimeRequestOutputOf<Op extends RealtimeRequestName> =
  RealtimeRequestMap[Op]['output'];
export type RealtimeTopicInputOf<Topic extends RealtimeTopicName> =
  RealtimeTopicMap[Topic]['input'];
export type RealtimeTopicEventOf<Topic extends RealtimeTopicName> =
  RealtimeTopicMap[Topic]['event'];

export type SpaceSyncInputOf<Op extends SpaceSyncRequestName> =
  SpaceSyncRequestMap[Op]['input'];
export type SpaceSyncOutputOf<Op extends SpaceSyncRequestName> =
  SpaceSyncRequestMap[Op]['output'];

export interface RealtimeError {
  name: string;
  message: string;
  code?: string;
}

export type RealtimeAck<T> = { data: T } | { error: RealtimeError };

export type RealtimeRequestEnvelope<Op extends RealtimeRequestName = RealtimeRequestName> = {
  requestId?: string;
  op: Op;
  input: RealtimeRequestInputOf<Op>;
  clientVersion?: string;
};

export type RealtimeSubscribeEnvelope<Topic extends RealtimeTopicName = RealtimeTopicName> = {
  subscriptionId?: string;
  topic: Topic;
  input: RealtimeTopicInputOf<Topic>;
  clientVersion?: string;
};

export interface RealtimeEvent<Topic extends RealtimeTopicName = RealtimeTopicName> {
  topic: Topic;
  inputKey: string;
  seq?: number;
  sentAt: number;
  event: RealtimeTopicEventOf<Topic>;
}

export type RealtimeReadyEvent = { type: 'ready'; snapshot?: unknown };

export type RealtimeTopicEvent<Topic extends RealtimeTopicName> =
  RealtimeTopicEventOf<Topic> | RealtimeReadyEvent;

// ---------------------------------------------------------------------------
// Utility: generate input key for room identification
// ---------------------------------------------------------------------------

export function getRealtimeInputKey(input: unknown): string {
  if (
    input === undefined ||
    typeof input === 'function' ||
    typeof input === 'symbol'
  ) {
    return 'null';
  }
  if (input === null || typeof input !== 'object') {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map(getRealtimeInputKey).join(',')}]`;
  }
  if (input instanceof Date) {
    return JSON.stringify(input.toJSON());
  }
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => {
      const property = record[key];
      return (
        property !== undefined &&
        typeof property !== 'function' &&
        typeof property !== 'symbol'
      );
    })
    .sort()
    .map(key => `${JSON.stringify(key)}:${getRealtimeInputKey(record[key])}`)
    .join(',')}}`;
}
