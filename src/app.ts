/**
 * Fastify application builder — creates and configures the app.
 * Exported for testability (app.inject() without binding to a port).
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { errorHandler } from './plugins/error-handler.js';
import { authGuard } from './infra/http/auth-guard.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { workspaceRoutes } from './modules/workspaces/workspace.routes.js';
import { collectionRoutes } from './modules/collections/collection.routes.js';
import { pageRoutes } from './modules/pages/page.routes.js';

export type App = ReturnType<typeof buildApp>;

export function buildApp(opts: { logger?: boolean } = {}) {
  const fastify = Fastify({
    logger: opts.logger ?? false,
  });

  // Wire fastify-type-provider-zod
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Plugins
  fastify.setErrorHandler(errorHandler);
  fastify.register(cors, { origin: false });
  fastify.register(helmet, { contentSecurityPolicy: false });

  // Public routes
  fastify.register(healthRoutes);

  // API v1 — protected by x-api-key
  fastify.register(async (api) => {
    api.addHook('onRequest', authGuard);
    api.register(workspaceRoutes);
    api.register(collectionRoutes);
    api.register(pageRoutes);
  }, { prefix: '/api/v1' });

  return fastify;
}
