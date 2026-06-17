/**
 * Test setup — runs BEFORE any module is loaded.
 * Mocks process.env so env.ts validation passes in tests.
 */

import { vi } from 'vitest';

process.env = {
  ...process.env,
  NODE_ENV: 'test',
  API_KEY: 'test-secret-key-32-chars-min!!',
  PORT: '3002',
  HOST: '0.0.0.0',
  LOG_LEVEL: 'info',
  AFFINE_BASE_URL: 'https://notes.nglab.es',
  AFFINE_GRAPHQL_URL: 'https://notes.nglab.es/graphql',
  AFFINE_EMAIL: 'test@test.com',
  AFFINE_PASSWORD: 'test',
};
