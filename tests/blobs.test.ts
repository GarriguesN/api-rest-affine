/**
 * Integration tests for blob routes.
 * Fetch calls are mocked — no real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { mockFetch, TEST_API_KEY } from './helpers/common.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const API_KEY_HEADER = 'x-api-key';
const WS = '58cb2776-ec01-4242-824e-a930aa35671d';
const BLOB_KEY = 'some-image-abc123.png';

function sessionCookies() {
  return {
    cookies: {
      affine_session: 'mock-session',
      affine_csrf_token: 'mock-csrf',
    },
  };
}

describe('blob routes — download', () => {
  beforeEach(() => mockFetch.mockReset());

  it('GET /blobs/:workspaceId/:key — returns binary blob', async () => {
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const headerMap = new Headers();
    headerMap.set('content-type', 'image/png');
    headerMap.set('content-length', String(imageData.length));
    headerMap.set('last-modified', 'Wed, 01 Jan 2025 00:00:00 GMT');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: headerMap,
      arrayBuffer: async () => imageData.buffer,
    });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/blobs/${WS}/${BLOB_KEY}`,
      headers: {
        [API_KEY_HEADER]: TEST_API_KEY,
        ...sessionCookies(),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe(String(imageData.length));
    expect(res.headers['cache-control']).toBe('public, max-age=2592000, immutable');
    await app.close();
  });

  it('GET /blobs/:workspaceId/:key — 404 when blob not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
    });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/blobs/${WS}/${BLOB_KEY}`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY, ...sessionCookies() },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /blobs/:workspaceId/:key — 403 when no access', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers(),
    });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/blobs/${WS}/${BLOB_KEY}`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY, ...sessionCookies() },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('GET /blobs/:workspaceId/:key — 403 without session cookies', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/blobs/${WS}/${BLOB_KEY}`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('session');
    await app.close();
  });

  it('GET /blobs/:workspaceId/:key — 401 without API key', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/blobs/${WS}/${BLOB_KEY}`,
      headers: { ...sessionCookies() },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
