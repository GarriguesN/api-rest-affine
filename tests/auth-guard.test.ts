/**
 * Auth guard — unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { authGuard, API_KEY_HEADER } from '../src/infra/http/auth-guard.js';

// process.env is mocked by tests/setup.ts

const TEST_KEY = 'test-secret-key-32-chars-min!!';

describe('authGuard', () => {
  function buildApp() {
    const app = Fastify({ logger: false });
    app.setErrorHandler((err, _req, reply) => {
      reply.status(err.statusCode ?? 500).send({
        error: { code: (err as { code?: string }).code ?? 'ERROR', message: err.message },
      });
    });
    app.addHook('onRequest', authGuard);
    app.get('/test', async () => 'ok');
    return app;
  }

  it('returns 401 when x-api-key header is missing', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
    await app.close();
  });

  it('returns 401 when x-api-key is incorrect', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { [API_KEY_HEADER]: 'wrong-key-32-chars-minimum!!!!' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('passes through when x-api-key is correct', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { [API_KEY_HEADER]: TEST_KEY },
    });
    expect(response.statusCode).toBe(200);
    // Fastify serializes the string return as plain text (not JSON)
    expect(response.body).toBe('ok');
    await app.close();
  });

  it('returns 401 for short key (length check before timing compare)', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { [API_KEY_HEADER]: 'too-short' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
