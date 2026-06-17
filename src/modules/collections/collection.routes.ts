/**
 * Collections module — REST handlers for /workspaces/:workspaceId/collections.
 *
 * NOTE: The Affine GraphQL API does NOT expose a `collections` field on
 * WorkspaceType. There is no equivalent query in the current schema.
 * This endpoint intentionally returns an empty list.
 *
 * If you need grouped/organized docs, consider using Affine's built-in
 * workspace features via the web UI or the Socket.IO channel.
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';

export const collectionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/workspaces/:workspaceId/collections
  fastify.get(
    '/workspaces/:workspaceId/collections',
    {
      schema: {
        params: z.object({
          workspaceId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            collections: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                description: z.string().nullable().optional(),
                docCount: z.number().optional(),
              }),
            ),
            totalCount: z.number(),
          }),
        },
      },
    },
    async (_request, reply) => {
      // No GraphQL equivalent exists in the current Affine schema.
      return reply.send({
        collections: [],
        totalCount: 0,
      });
    },
  );
};
