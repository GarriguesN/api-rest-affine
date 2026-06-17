/**
 * Integration tests for auth routes.
 * Uses the full app builder to avoid setup complexity with ESM + vitest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';

// ---------------------------------------------------------------------------
// Mock fetch for Affine
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockAffineResponse(body: unknown, options: {
  status?: number;
  setCookieHeaders?: string[];
} = {}) {
  const {
    status = 200,
    setCookieHeaders = [
      'affine_session=mock-session-token; HttpOnly; Secure',
      'affine_csrf_token=mock-csrf-token; HttpOnly; Secure',
    ],
  } = options;

  // Build a proper Headers object with getSetCookie
  const headerMap = new globalThis.Headers();
  for (const cookie of setCookieHeaders) {
    headerMap.append('set-cookie', cookie);
  }

  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: headerMap,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth routes', () => {
  beforeEach(() => mockFetch.mockReset());
  afterEach(() => mockFetch.mockReset());

  // -------------------------------------------------------------------------
  // POST /auth/preflight
  // -------------------------------------------------------------------------

  describe('POST /auth/preflight', () => {
    it('200 — returns preflight data from Affine', async () => {
      mockAffineResponse({
        registered: true,
        hasPassword: true,
      });

      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/preflight',
        payload: { email: 'user@example.com' },
      });
      await app.close();

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.registered).toBe(true);
      expect(body.hasPassword).toBe(true);
    });

    it('400 — invalid email', async () => {
      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/preflight',
        payload: { email: 'not-an-email' },
      });
      await app.close();

      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/login
  // -------------------------------------------------------------------------

  describe('POST /auth/login', () => {
    it('200 — returns user and session cookies on success', async () => {
      mockAffineResponse({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: true,
        hasPassword: true,
        avatarUrl: null,
        features: ['free'],
      });

      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'test@example.com', password: 'secret123' },
      });
      await app.close();

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.id).toBe('user-123');
      expect(body.user.name).toBe('Test User');
      expect(body.sessionCookie).toBe('mock-session-token');
      expect(body.csrfToken).toBe('mock-csrf-token');
    });

    it('400 — missing password', async () => {
      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'test@example.com' },
      });
      await app.close();

      expect(res.statusCode).toBe(400);
    });

    it('400 — invalid email', async () => {
      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'not-email', password: 'pass' },
      });
      await app.close();

      expect(res.statusCode).toBe(400);
    });

    it('400 — Affine rejects credentials', async () => {
      mockAffineResponse({ message: 'Wrong credentials' }, { status: 401 });

      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'bad@example.com', password: 'wrong' },
      });
      await app.close();

      expect(res.statusCode).toBe(400);
    });

    it('sets httpOnly session cookies on the response', async () => {
      mockAffineResponse({
        id: 'user-123',
        name: 'Test',
        email: 'test@test.com',
        emailVerified: true,
        hasPassword: null,
        avatarUrl: null,
        features: [],
      });

      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'test@test.com', password: 'pass' },
      });
      await app.close();

      const cookies = res.cookies;
      const sessionCookie = cookies.find((c: { name: string }) => c.name === 'affine_session');
      const csrfCookie = cookies.find((c: { name: string }) => c.name === 'affine_csrf_token');

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie!.httpOnly).toBe(true);
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie!.httpOnly).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // GET /auth/me
  // -------------------------------------------------------------------------

  describe('GET /auth/me', () => {
    it('200 — returns null user when no session cookies', async () => {
      const app = buildApp();
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/auth/me' });
      await app.close();

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user).toBeNull();
    });

    it('200 — returns user from Affine when session cookies present', async () => {
      mockAffineResponse({
        user: {
          id: 'user-456',
          name: 'Jane Doe',
          email: 'jane@example.com',
          emailVerified: true,
          hasPassword: true,
          avatarUrl: null,
          features: ['pro'],
        },
      });

      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { affine_session: 'my-session', affine_csrf_token: 'my-csrf' },
      });
      await app.close();

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user?.id).toBe('user-456');
      expect(body.user?.name).toBe('Jane Doe');
    });

    it('200 — user=null on 401 from Affine', async () => {
      mockAffineResponse({ message: 'Unauthorized' }, { status: 401 });

      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { affine_session: 'bad', affine_csrf_token: 'bad' },
      });
      await app.close();

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/logout
  // -------------------------------------------------------------------------

  describe('POST /auth/logout', () => {
    it('200 — clears cookies', async () => {
      mockAffineResponse({}, { status: 200 });

      const app = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { affine_session: 'tok', affine_csrf_token: 'csrf' },
      });
      await app.close();

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);

      const cookies = res.cookies;
      const sessionCookie = cookies.find((c: { name: string }) => c.name === 'affine_session');
      expect(sessionCookie?.value).toBe('');
    });

    it('200 — succeeds without session cookies', async () => {
      const app = buildApp();
      await app.ready();
      const res = await app.inject({ method: 'POST', url: '/auth/logout' });
      await app.close();

      expect(res.statusCode).toBe(200);
    });
  });
});
