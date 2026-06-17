/**
 * Server bootstrap — loads env, starts Fastify, listens.
 */

import 'dotenv/config';
import { env } from './config/env.js';
import { buildApp } from './app.js';
import { getSession } from './infra/affine/auth.js';

const app = buildApp({ logger: true });

// Verify Affine session on startup
try {
  await getSession();
  app.log.info('Affine session established');
} catch (err) {
  app.log.error({ err }, 'Failed to authenticate with Affine at startup');
  process.exit(1);
}

await app.listen({ port: env.PORT, host: env.HOST });
app.log.info(`Server listening on http://${env.HOST}:${env.PORT}`);
