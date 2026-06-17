/**
 * Realtime Gateway REST routes.
 *
 * Proxies to AFFiNE's Socket.IO RealtimeGateway for live query data.
 * All routes require:
 *   - x-api-key: bridge API key (standard auth guard)
 *   - Authorization: Bearer <sessionToken> — session token from /auth/login
 *
 * These routes are stateless: each request opens a temporary Socket.IO
 * connection, executes the RPC, and closes.
 *
 * Route structure:
 *   /realtime/user/me/*          → user-level queries
 *   /realtime/workspaces/:id/*   → workspace-level queries
 *   /realtime/workspaces/:wid/docs/:did/* → doc-level queries
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { JwtMissingError, JwtInvalidError } from '../../utils/errors.js';
import * as gateway from './realtime.gateway.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filter undefined values — required for exactOptionalPropertyTypes */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

// ---------------------------------------------------------------------------
// JWT extraction helper
// ---------------------------------------------------------------------------

function extractBearerToken(
  authHeader: string | undefined,
): string {
  if (!authHeader) {
    throw new JwtMissingError();
  }
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]!.toLowerCase() !== 'bearer') {
    throw new JwtInvalidError('Invalid Authorization header format. Expected: Bearer <token>');
  }
  return parts[1]!;
}

// ---------------------------------------------------------------------------
// Route: /realtime/user/me
// ---------------------------------------------------------------------------

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /realtime/user/me — current user profile
  fastify.get(
    '/profile',
    {
      schema: {
        response: {
          200: z.object({
            user: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
              emailVerified: z.boolean(),
              hasPassword: z.boolean().nullable(),
              avatarUrl: z.string().nullable(),
              features: z.array(z.string()),
            }).nullable(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      return gateway.getUserProfile(sessionToken);
    },
  );

  // GET /realtime/user/me/settings — notification settings
  fastify.get(
    '/settings',
    {
      schema: {
        response: {
          200: z.object({
            receiveInvitationEmail: z.boolean(),
            receiveMentionEmail: z.boolean(),
            receiveCommentEmail: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      return gateway.getUserSettings(sessionToken);
    },
  );

  // GET /realtime/user/me/access-tokens — personal access tokens
  fastify.get(
    '/access-tokens',
    {
      schema: {
        response: {
          200: z.object({
            tokens: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                createdAt: z.string(),
                expiresAt: z.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      return gateway.getUserAccessTokens(sessionToken);
    },
  );

  // GET /realtime/user/me/notifications/count — unread notification count
  fastify.get(
    '/notifications/count',
    {
      schema: {
        response: {
          200: z.object({ count: z.number() }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      return gateway.getNotificationCount(sessionToken);
    },
  );

  // GET /realtime/user/me/quota — user storage quota
  fastify.get(
    '/quota',
    {
      schema: {
        response: {
          200: z.object({
            userId: z.string(),
            plan: z.string(),
            blobLimit: z.number(),
            storageQuota: z.number(),
            usedStorageQuota: z.number(),
            historyPeriodSeconds: z.number(),
            copilotActionLimit: z.number().nullable(),
            flags: z.record(z.unknown()),
            known: z.boolean(),
            stale: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      return gateway.getUserQuotaState(sessionToken);
    },
  );
};

// ---------------------------------------------------------------------------
// Route: /realtime/workspaces/:workspaceId
// ---------------------------------------------------------------------------

const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  const workspaceParamsSchema = z.object({
    workspaceId: z.string().uuid(),
  });

  // GET /realtime/workspaces/:id/access — workspace access
  fastify.get(
    '/access',
    {
      schema: {
        params: workspaceParamsSchema,
        response: {
          200: z.object({
            access: z.object({
              role: z.string(),
              permissions: z.record(z.boolean()),
              team: z.boolean(),
            }),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      return gateway.getWorkspaceAccess(workspaceId, sessionToken);
    },
  );

  // GET /realtime/workspaces/:id/config — workspace feature flags
  fastify.get(
    '/config',
    {
      schema: {
        params: workspaceParamsSchema,
        response: {
          200: z.object({
            config: z.object({
              enableAi: z.boolean(),
              enableSharing: z.boolean(),
              enableUrlPreview: z.boolean(),
              enableDocEmbedding: z.boolean(),
            }),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      return gateway.getWorkspaceConfig(workspaceId, sessionToken);
    },
  );

  // GET /realtime/workspaces/:id/members — paginated member list
  fastify.get(
    '/members',
    {
      schema: {
        params: workspaceParamsSchema,
        querystring: z.object({
          skip: z.coerce.number().int().min(0).optional(),
          take: z.coerce.number().int().min(1).max(100).optional(),
          query: z.string().optional(),
        }),
        response: {
          200: z.object({
            members: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
                avatarUrl: z.string().nullable(),
                permission: z.string(),
                role: z.string(),
                inviteId: z.string(),
                emailVerified: z.boolean().nullable(),
                status: z.string(),
              }),
            ),
            memberCount: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      const { skip, take, query } = request.query as {
        skip?: number; take?: number; query?: string;
      };
      return gateway.getWorkspaceMembers(workspaceId, sessionToken, clean({ skip, take, query }));
    },
  );

  // GET /realtime/workspaces/:id/invite-link — workspace invite link
  fastify.get(
    '/invite-link',
    {
      schema: {
        params: workspaceParamsSchema,
        response: {
          200: z.object({
            inviteLink: z.object({
              link: z.string(),
              expireTime: z.string(),
            }).nullable(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      return gateway.getWorkspaceInviteLink(workspaceId, sessionToken);
    },
  );

  // GET /realtime/workspaces/:id/quota — workspace storage quota
  fastify.get(
    '/quota',
    {
      schema: {
        params: workspaceParamsSchema,
        response: {
          200: z.object({
            workspaceId: z.string(),
            plan: z.string(),
            seatLimit: z.number(),
            memberCount: z.number(),
            overcapacityMemberCount: z.number(),
            blobLimit: z.number(),
            storageQuota: z.number(),
            usedStorageQuota: z.number(),
            historyPeriodSeconds: z.number(),
            readonly: z.boolean(),
            readonlyReasons: z.array(z.string()),
            flags: z.record(z.unknown()),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      return gateway.getWorkspaceQuotaState(workspaceId, sessionToken);
    },
  );

  // GET /realtime/workspaces/:id/embedding-progress — AI embedding progress
  fastify.get(
    '/embedding-progress',
    {
      schema: {
        params: workspaceParamsSchema,
        response: {
          200: z.object({
            total: z.number(),
            embedded: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      return gateway.getWorkspaceEmbeddingProgress(workspaceId, sessionToken);
    },
  );

  // GET /realtime/workspaces/:id/copilot/transcript — copilot transcript
  fastify.get(
    '/copilot/transcript',
    {
      schema: {
        params: workspaceParamsSchema,
        querystring: z.object({
          blobId: z.string().optional(),
          taskId: z.string().optional(),
        }),
        response: {
          200: z.object({
            task: z.unknown().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      const { blobId, taskId } = request.query as { blobId?: string; taskId?: string };
      return gateway.getCopilotTranscriptTask(workspaceId, sessionToken, clean({ blobId, taskId }));
    },
  );

  // -------------------------------------------------------------------------
  // Nested: /realtime/workspaces/:id/docs/:docId/*
  // -------------------------------------------------------------------------

  const docParamsSchema = z.object({
    workspaceId: z.string().uuid(),
    docId: z.string().uuid(),
  });

  fastify.get(
    '/docs/:docId/share-state',
    {
      schema: {
        params: docParamsSchema,
        response: {
          200: z.object({
            state: z.object({
              public: z.boolean(),
              mode: z.string(),
              defaultRole: z.string(),
            }).nullable(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId, docId } = docParamsSchema.parse(request.params);
      return gateway.getDocShareState(workspaceId, docId, sessionToken);
    },
  );

  fastify.get(
    '/docs/:docId/grants',
    {
      schema: {
        params: docParamsSchema,
        querystring: z.object({
          first: z.coerce.number().int().min(1).max(100).optional(),
          after: z.string().optional(),
        }),
        response: {
          200: z.object({
            totalCount: z.number(),
            pageInfo: z.object({
              endCursor: z.string().nullable(),
              hasNextPage: z.boolean(),
            }),
            edges: z.array(
              z.object({
                node: z.object({
                  role: z.string(),
                  user: z.object({
                    id: z.string(),
                    name: z.string(),
                    email: z.string(),
                    avatarUrl: z.string().nullable(),
                  }),
                }),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId, docId } = docParamsSchema.parse(request.params);
      const { first, after } = request.query as { first?: number; after?: string };
      return gateway.getDocGrants(workspaceId, docId, sessionToken, {
        first: first ?? 20,
        ...(after !== undefined ? { after } : {}),
      });
    },
  );

  fastify.get(
    '/docs/:docId/comments',
    {
      schema: {
        params: docParamsSchema,
        querystring: z.object({
          after: z.string().optional(),
          first: z.coerce.number().int().min(1).max(100).optional(),
        }),
        response: {
          200: z.object({
            changes: z.array(z.object({
              id: z.string(),
              action: z.string(),
              item: z.object({}),
              commentId: z.string().nullable(),
            })),
            startCursor: z.string(),
            endCursor: z.string(),
            hasNextPage: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const { workspaceId, docId } = docParamsSchema.parse(request.params);
      const { after, first } = request.query as { after?: string; first?: number };
      return gateway.getCommentChanges(workspaceId, docId, sessionToken, clean({ after, first }));
    },
  );
};

// ---------------------------------------------------------------------------
// Root plugin
// ---------------------------------------------------------------------------

export const realtimeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(userRoutes, { prefix: '/realtime/user/me' });
  fastify.register(workspaceRoutes, { prefix: '/realtime/workspaces' });
};
