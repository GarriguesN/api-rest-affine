/**
 * Environment validation with Zod.
 * Fails fast at startup if required vars are missing.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Microservice auth
  API_KEY: z.string().min(20, 'API_KEY must be at least 20 chars'),

  // Affine
  AFFINE_BASE_URL: z.string().url(),
  AFFINE_GRAPHQL_URL: z.string().url(),
  AFFINE_EMAIL: z.string().email(),
  AFFINE_PASSWORD: z.string().min(1, 'AFFINE_PASSWORD is required'),

  // Optional: pre-set session cookies (skip login at startup if provided)
  AFFINE_SESSION_COOKIE: z.string().optional(),
  AFFINE_CSRF_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`);
  console.error('❌ Invalid environment variables:\n' + errors.join('\n'));
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;
