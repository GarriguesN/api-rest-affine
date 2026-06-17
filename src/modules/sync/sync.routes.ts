/**
 * Space Sync Gateway REST routes.
 *
 * Manages Yjs document sync over AFFiNE's Socket.IO SpaceSyncGateway.
 * All routes require:
 *   - x-api-key: bridge API key
 *   - Authorization: Bearer <jwt> — JWT token from /auth/token/exchange
 *
 * Route structure:
 *   /sync/workspaces/:workspaceId/join       → join workspace room
 *   /sync/workspaces/:workspaceId/docs     → list doc timestamps
 *   /sync/workspaces/:workspaceId/docs/:docId      → load doc binary
 *   /sync/workspaces/:workspaceId/docs/:docId      → push doc update (PUT)
 *   /sync/workspaces/:workspaceId/docs/:docId      → delete doc (DELETE)
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { JwtMissingError, JwtInvalidError } from '../../utils/errors.js';
import { AffineSocketClient } from '../../infra/socket/client.js';
import { parseDocBinary } from '../../utils/yjs-parser.js';

// ---------------------------------------------------------------------------
// JWT extraction
// ---------------------------------------------------------------------------

function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) throw new JwtMissingError();
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]!.toLowerCase() !== 'bearer') {
    throw new JwtInvalidError('Expected: Bearer <token>');
  }
  return parts[1]!;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const docParams = z.object({
  workspaceId: z.string().uuid(),
  docId: z.string().uuid(),
});

/**
 * Create a connected socket client, execute a callback, then disconnect.
 */
async function withSocket<T>(
  jwtToken: string,
  fn: (client: AffineSocketClient) => Promise<T>,
): Promise<T> {
  const client = new AffineSocketClient({ jwtToken });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    client.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Routes: /sync/workspaces/:workspaceId
// ---------------------------------------------------------------------------

const workspaceSyncRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /sync/workspaces/:workspaceId/join
  // Join a workspace room (subscribe to doc updates for that workspace)
  fastify.post(
    '/join',
    {
      schema: {
        params: workspaceParams,
        response: { 200: z.object({ clientId: z.string() }) },
      },
    },
    async (request) => {
      const jwt = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParams.parse(request.params);

      return withSocket(jwt, async (client) => ({
        clientId: await client.spaceJoin('workspace', workspaceId),
      }));
    },
  );

  // DELETE /sync/workspaces/:workspaceId/join
  // Leave a workspace room
  fastify.delete(
    '/join',
    {
      schema: {
        params: workspaceParams,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const jwt = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParams.parse(request.params);

      await withSocket(jwt, async (client) => {
        await client.spaceLeave('workspace', workspaceId);
      });
      return { ok: true };
    },
  );

  // GET /sync/workspaces/:workspaceId/docs/timestamps
  // Get last-modified timestamps for all docs in a workspace
  fastify.get(
    '/docs/timestamps',
    {
      schema: {
        params: workspaceParams,
        querystring: z.object({
          since: z.coerce.number().int().positive().optional(),
        }),
        response: {
          200: z.record(z.string(), z.number()),
        },
      },
    },
    async (request) => {
      const jwt = extractBearerToken(request.headers.authorization);
      const { workspaceId } = workspaceParams.parse(request.params);
      const { since } = request.query as { since?: number };

      return withSocket(jwt, async (client) =>
        client.spaceLoadDocTimestamps('workspace', workspaceId, since),
      );
    },
  );

  // GET /sync/workspaces/:workspaceId/docs/:docId
  // Load doc binary snapshot (full Yjs state as base64)
  fastify.get(
    '/docs/:docId',
    {
      schema: {
        params: docParams,
        querystring: z.object({
          // Optional stateVector as base64 — if provided, server returns only missing updates
          stateVector: z.string().optional(),
        }),
        response: {
          200: z.object({
            docId: z.string(),
            timestamp: z.number(),
            // Base64-encoded Yjs binary state
            state: z.string(),
            // Base64-encoded missing updates (if stateVector was provided)
            missing: z.string().optional(),
          }),
        },
      },
    },
    async (request) => {
      const jwt = extractBearerToken(request.headers.authorization);
      const { workspaceId, docId } = docParams.parse(request.params);
      const { stateVector } = request.query as { stateVector?: string };

      const result = await withSocket(jwt, async (client) =>
        client.spaceLoadDoc('workspace', workspaceId, docId, stateVector),
      );

      return {
        docId,
        timestamp: result.timestamp,
        state: uint8ArrayToBase64(result.state),
        missing: result.missing.length > 0 ? uint8ArrayToBase64(result.missing) : undefined,
      };
    },
  );

  // GET /sync/workspaces/:workspaceId/docs/:docId/text
  // Load doc binary and extract plain text + metadata via Yjs parser
  fastify.get(
    '/docs/:docId/text',
    {
      schema: {
        params: docParams,
        response: {
          200: z.object({
            docId: z.string(),
            title: z.string().nullable(),
            mode: z.string().nullable(),
            plainText: z.string(),
            blockCount: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const jwt = extractBearerToken(request.headers.authorization);
      const { workspaceId, docId } = docParams.parse(request.params);

      const result = await withSocket(jwt, async (client) =>
        client.spaceLoadDoc('workspace', workspaceId, docId),
      );

      const parsed = parseDocBinary(result.state, docId);
      return {
        docId: parsed.docId || docId,
        title: parsed.title,
        mode: parsed.mode,
        plainText: parsed.plainText,
        blockCount: parsed.blockCount,
      };
    },
  );

  // PUT /sync/workspaces/:workspaceId/docs/:docId
  // Push a Yjs update to create or update a doc
  // Body: { update: base64-encoded Yjs binary update }
  fastify.put(
    '/docs/:docId',
    {
      schema: {
        params: docParams,
        body: z.object({
          update: z.string().min(1),
        }),
        response: {
          200: z.object({
            docId: z.string(),
            timestamp: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const jwt = extractBearerToken(request.headers.authorization);
      const { workspaceId, docId } = docParams.parse(request.params);
      const { update } = z.object({ update: z.string().min(1) }).parse(request.body);

      const binaryUpdate = base64ToUint8Array(update);
      const timestamp = await withSocket(jwt, async (client) =>
        client.spacePushDocUpdate('workspace', workspaceId, docId, binaryUpdate),
      );

      return { docId, timestamp };
    },
  );

  // DELETE /sync/workspaces/:workspaceId/docs/:docId
  // Permanently delete a doc from the workspace
  fastify.delete(
    '/docs/:docId',
    {
      schema: {
        params: docParams,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const jwt = extractBearerToken(request.headers.authorization);
      const { workspaceId, docId } = docParams.parse(request.params);

      await withSocket(jwt, async (client) => {
        await client.spaceDeleteDoc('workspace', workspaceId, docId);
      });
      return { ok: true };
    },
  );
};

// ---------------------------------------------------------------------------
// Root plugin
// ---------------------------------------------------------------------------

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(workspaceSyncRoutes, { prefix: '/sync/workspaces' });
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function uint8ArrayToBase64(array: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(array).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]!);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
