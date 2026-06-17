/**
 * Workspace module — REST handlers for /workspaces.
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { gqlRequest } from '../../infra/graphql/client.js';
import { LIST_WORKSPACES, GET_WORKSPACE } from '../../infra/graphql/queries.js';
import type {
  ListWorkspacesResponse,
  GetWorkspaceResponse,
  AffineWorkspace,
} from '../../infra/affine/types.js';
import { NotFoundError } from '../../utils/errors.js';

export const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/workspaces
  fastify.get(
    '/workspaces',
    {
      schema: {
        response: {
          200: z.object({
            workspaces: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                avatarUrl: z.string().nullable(),
                createdAt: z.string(),
                memberCount: z.number(),
              }),
            ),
          }),
        },
      },
    },
    async (_request, reply) => {
      const data = await gqlRequest<ListWorkspacesResponse>(LIST_WORKSPACES);

      const workspaces: AffineWorkspace[] = data.workspaces.map(w => ({
        id: w.id,
        name: w.name,
        avatarUrl: w.avatarUrl,
        createdAt: w.createdAt,
        memberCount: w.memberCount,
      }));

      return reply.send({ workspaces });
    },
  );

  // GET /api/v1/workspaces/:workspaceId
  fastify.get(
    '/workspaces/:workspaceId',
    {
      schema: {
        params: z.object({
          workspaceId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            workspace: z.object({
              id: z.string(),
              name: z.string(),
              avatarUrl: z.string().nullable(),
              createdAt: z.string(),
              memberCount: z.number(),
              initialized: z.boolean().optional(),
              enableSharing: z.boolean().optional(),
              enableAi: z.boolean().optional(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };

      const data = await gqlRequest<GetWorkspaceResponse>(GET_WORKSPACE, {
        id: workspaceId,
      });

      if (!data.workspace) {
        throw new NotFoundError('Workspace', workspaceId);
      }

      return reply.send({ workspace: data.workspace });
    },
  );
};
