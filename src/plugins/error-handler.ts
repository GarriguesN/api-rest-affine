/**
 * Global Fastify error handler plugin.
 * Maps AppError instances and unexpected errors to consistent JSON responses.
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Zod validation errors from fastify-type-provider-zod
  if (error.validation) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      },
    });
    return;
  }

  // AppError instances — pass through statusCode and code
  if (error instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: error.code,
        message: error.message,
      },
    };
    if (error instanceof AppError && 'graphqlErrors' in error) {
      (body.error as Record<string, unknown>)['graphqlErrors'] =
        (error as unknown as { graphqlErrors: unknown[] }).graphqlErrors;
    }
    reply.status(error.statusCode).send(body);
    return;
  }

  // Unknown errors — log and return 500
  request.log.error(error);

  reply.status(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
    },
  });
}
