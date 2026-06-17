/**
 * Collections module — REST handlers for /workspaces/:workspaceId/collections.
 *
 * Note: Uses `workspace.collections` which returns CopilotContextCategory,
 * not traditional "smart folders". See docs/api-map.md for details.
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { gqlRequest } from '../../infra/graphql/client.js';
import { LIST_COLLECTIONS } from '../../infra/graphql/queries.js';
import type { ListCollectionsResponse } from '../../infra/affine/types.js';
import { NotFoundError } from '../../utils/errors.js';

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
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };

      const data = await gqlRequest<ListCollectionsResponse>(LIST_COLLECTIONS, {
        workspaceId,
      });

      if (!data.workspace) {
        throw new NotFoundError('Workspace', workspaceId);
      }

      const collections = data.workspace.collections.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description ?? null,
        docCount: c.docCount ?? 0,
      }));

      return reply.send({
        collections,
        totalCount: collections.length,
      });
    },
  );
};
