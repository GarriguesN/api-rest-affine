/**
 * Health check routes (no auth required).
 */

import type { FastifyPluginAsync } from 'fastify';
import { gqlRequest } from '../../infra/graphql/client.js';
import { LIST_WORKSPACES } from '../../infra/graphql/queries.js';
import type { ListWorkspacesResponse } from '../../infra/affine/types.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    let affineStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      await gqlRequest<ListWorkspacesResponse>(LIST_WORKSPACES, {});
      affineStatus = 'connected';
    } catch {
      affineStatus = 'disconnected';
    }

    return reply.send({
      status: 'ok',
      version: '0.1.0',
      affine: affineStatus,
    });
  });
};
