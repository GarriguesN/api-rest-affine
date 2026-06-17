/**
 * Blobs module — REST proxy for AFFiNE workspace blob storage.
 *
 * Endpoints:
 *   GET /api/v1/blobs/:workspaceId/:key — download a blob (image, file, etc.)
 *
 * Upload is done via GraphQL mutations (setBlob / createBlobUpload) which
 * require graphql-upload and multipart form handling. This module focuses on
 * download (REST) which is straightforward.
 *
 * Auth:
 *   - x-api-key: bridge API key
 *   - User must have read access to the workspace
 *   - Auth cookies (affine_session / affine_csrf_token) are proxied to Affine
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { NotFoundError, ForbiddenError, ServiceUnavailableError } from '../../utils/errors.js';

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const blobRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/blobs/:workspaceId/:key
  // Downloads a blob from the workspace. Proxies to Affine's REST endpoint.
  fastify.get(
    '/blobs/:workspaceId/:key',
    {
      schema: {
        params: z.object({
          workspaceId: z.string(),
          key: z.string(),
        }),
        response: {
          200: z.any(), // binary data
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, key } = z
        .object({
          workspaceId: z.string(),
          key: z.string(),
        })
        .parse(request.params);

      // Extract session cookies from the request
      const session = request.cookies['affine_session'];
      const csrf = request.cookies['affine_csrf_token'];

      if (!session || !csrf) {
        throw new ForbiddenError('No Affine session cookies — please log in first');
      }

      // Build the Affine blob URL
      const blobUrl = `${env.AFFINE_BASE_URL}/api/workspaces/${workspaceId}/blobs/${encodeURIComponent(key)}`;

      try {
        const response = await fetch(blobUrl, {
          method: 'GET',
          headers: {
            Cookie: `affine_session=${session}; affine_csrf_token=${csrf}`,
            'x-affine-csrf-token': csrf,
          },
          credentials: 'include',
        });

        if (response.status === 404) {
          throw new NotFoundError('Blob', `${workspaceId}/${key}`);
        }

        if (response.status === 403) {
          throw new ForbiddenError(`No access to blob ${workspaceId}/${key}`);
        }

        if (!response.ok) {
          throw new ServiceUnavailableError(
            'Affine',
            `blob download failed: ${response.status}`,
          );
        }

        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
        const contentLength = response.headers.get('content-length');
        const lastModified = response.headers.get('last-modified');

        reply.header('Content-Type', contentType);
        if (contentLength) reply.header('Content-Length', contentLength);
        if (lastModified) reply.header('Last-Modified', lastModified);
        reply.header('Cache-Control', 'public, max-age=2592000, immutable');

        const buffer = await response.arrayBuffer();
        return reply.send(Buffer.from(buffer));
      } catch (err) {
        if (
          err instanceof NotFoundError ||
          err instanceof ForbiddenError ||
          err instanceof ServiceUnavailableError
        ) {
          throw err;
        }
        throw new ServiceUnavailableError('Affine', `blob fetch error: ${String(err)}`);
      }
    },
  );
}
