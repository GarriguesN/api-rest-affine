/**
 * HTTP auth guard — validates x-api-key header with timing-safe comparison.
 * Applied globally to /api/v1/* routes via onRequest hook.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../utils/errors.js';

/** Header name for the API key. */
export const API_KEY_HEADER = 'x-api-key';

export async function authGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const received = request.headers[API_KEY_HEADER];

  if (!received || typeof received !== 'string') {
    throw new UnauthorizedError('Missing x-api-key header');
  }

  const receivedBuf = Buffer.from(received, 'utf8');
  const expectedBuf = Buffer.from(env.API_KEY, 'utf8');

  const valid =
    receivedBuf.length === expectedBuf.length &&
    timingSafeEqual(receivedBuf, expectedBuf);

  if (!valid) {
    throw new UnauthorizedError('Invalid API key');
  }
}
