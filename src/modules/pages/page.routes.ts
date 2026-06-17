/**
 * Pages module — REST handlers for /workspaces/:workspaceId/pages and /pages/:pageId.
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { gqlRequest } from '../../infra/graphql/client.js';
import { LIST_PAGES, GET_PAGE } from '../../infra/graphql/queries.js';
import type { ListPagesResponse, GetPageResponse } from '../../infra/affine/types.js';
import { NotFoundError } from '../../utils/errors.js';
import { buildPageUrl } from '../../utils/url.js';

export const pageRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/workspaces/:workspaceId/pages
  fastify.get(
    '/workspaces/:workspaceId/pages',
    {
      schema: {
        params: z.object({
          workspaceId: z.string().uuid(),
        }),
        querystring: z.object({
          first: z.coerce.number().int().min(1).max(100).optional().default(20),
          offset: z.coerce.number().int().min(0).optional().default(0),
        }),
        response: {
          200: z.object({
            pages: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                createDate: z.string(),
                updatedAt: z.string(),
                mode: z.enum(['Page', 'Edgeless']),
                url: z.string(),
              }),
            ),
            totalCount: z.number(),
            pageInfo: z.object({
              hasNextPage: z.boolean(),
              hasPreviousPage: z.boolean(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const { first, offset } = request.query as { first: number; offset: number };

      const data = await gqlRequest<ListPagesResponse>(LIST_PAGES, {
        workspaceId,
        first,
        offset,
      });

      if (!data.workspace) {
        throw new NotFoundError('Workspace', workspaceId);
      }

      const pages = data.workspace.docs.edges.map(({ node }) => ({
        id: node.id,
        title: node.title,
        createDate: node.createDate,
        updatedAt: node.updatedAt,
        mode: node.mode,
        url: buildPageUrl(node.id, workspaceId),
      }));

      return reply.send({
        pages,
        totalCount: data.workspace.docs.totalCount,
        pageInfo: {
          hasNextPage: data.workspace.docs.pageInfo.hasNextPage,
          hasPreviousPage: data.workspace.docs.pageInfo.hasPreviousPage,
        },
      });
    },
  );

  // GET /api/v1/pages/:pageId?workspaceId=xxx
  fastify.get(
    '/pages/:pageId',
    {
      schema: {
        params: z.object({
          pageId: z.string(),
        }),
        querystring: z.object({
          workspaceId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            id: z.string(),
            title: z.string(),
            createDate: z.string(),
            updatedAt: z.string(),
            mode: z.enum(['Page', 'Edgeless']),
            url: z.string(),
            workspaceId: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { pageId } = request.params as { pageId: string };
      const { workspaceId } = request.query as { workspaceId: string };

      const data = await gqlRequest<GetPageResponse>(GET_PAGE, {
        workspaceId,
        docId: pageId,
      });

      if (!data.workspace?.doc) {
        throw new NotFoundError('Page', pageId);
      }

      const { doc } = data.workspace;

      return reply.send({
        id: doc.id,
        title: doc.title,
        createDate: doc.createDate,
        updatedAt: doc.updatedAt,
        mode: doc.mode,
        url: buildPageUrl(doc.id, workspaceId),
        workspaceId,
      });
    },
  );
};
