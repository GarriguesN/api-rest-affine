/**
 * Workspace module — REST handlers for /api/v1/workspaces.
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { gqlRequest } from '../../infra/graphql/client.js';
import { LIST_WORKSPACES, GET_WORKSPACE } from '../../infra/graphql/queries.js';
import type { ListWorkspacesResponse, GetWorkspaceResponse } from '../../infra/graphql/queries.js';
import { NotFoundError } from '../../utils/errors.js';

const ownerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

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
                createdAt: z.string(),
                memberCount: z.number(),
                initialized: z.boolean(),
                enableSharing: z.boolean(),
                enableAi: z.boolean(),
                role: z.string(),
                public: z.boolean(),
                owner: ownerSchema,
              }),
            ),
          }),
        },
      },
    },
    async (_request, reply) => {
      const data = await gqlRequest<ListWorkspacesResponse>(LIST_WORKSPACES);
      return reply.send({ workspaces: data.workspaces });
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
              createdAt: z.string(),
              memberCount: z.number(),
              initialized: z.boolean(),
              enableSharing: z.boolean(),
              enableAi: z.boolean(),
              role: z.string(),
              public: z.boolean(),
              owner: ownerSchema,
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
