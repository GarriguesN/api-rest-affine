/**
 * Integration tests for Space Sync Gateway REST routes.
 *
 * Tests doc sync endpoints (join, load, push, delete).
 * Socket.IO calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { TEST_API_KEY, TEST_JWT, createMockSocketClient } from './helpers/common.js';

// ---------------------------------------------------------------------------
// Mock AffineSocketClient
// ---------------------------------------------------------------------------

const mockSocket = createMockSocketClient();

vi.mock('../src/infra/socket/client.js', () => ({
  AffineSocketClient: vi.fn(() => mockSocket),
  createAffineSocket: vi.fn(() => mockSocket),
  realtimeRequest: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const API_KEY_HEADER = 'x-api-key';
const AUTH_HEADER = 'authorization';
const WS = '58cb2776-ec01-4242-824e-a930aa35671d';
const DOC = 'abc12340-0000-0000-0000-000000000001';

function authHeaders(extra: Record<string, string> = {}) {
  return { [API_KEY_HEADER]: TEST_API_KEY, [AUTH_HEADER]: `Bearer ${TEST_JWT}`, ...extra };
}

describe('sync routes — workspace room', () => {
  beforeEach(() => {
    mockSocket.spaceJoin.mockClear();
    mockSocket.spaceLeave.mockClear();
    vi.clearAllMocks();
  });

  it('POST /sync/workspaces/:id/join — joins workspace room', async () => {
    mockSocket.spaceJoin.mockResolvedValueOnce('client-abc-123');

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sync/workspaces/${WS}/join`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.clientId).toBe('client-abc-123');
    expect(mockSocket.spaceJoin).toHaveBeenCalledWith('workspace', WS);
    await app.close();
  });

  it('DELETE /sync/workspaces/:id/join — leaves workspace room', async () => {
    mockSocket.spaceLeave.mockResolvedValueOnce(undefined);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/sync/workspaces/${WS}/join`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(mockSocket.spaceLeave).toHaveBeenCalledWith('workspace', WS);
    await app.close();
  });
});

describe('sync routes — doc timestamps', () => {
  beforeEach(() => mockSocket.spaceLoadDocTimestamps.mockClear());

  it('GET /sync/workspaces/:id/docs/timestamps — returns doc timestamps', async () => {
    const timestamps = {
      'doc-1': 1718000000000,
      'doc-2': 1718100000000,
    };
    mockSocket.spaceLoadDocTimestamps.mockResolvedValueOnce(timestamps);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/workspaces/${WS}/docs/timestamps`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(timestamps);
    await app.close();
  });

  it('GET /sync/workspaces/:id/docs/timestamps?since=... — filters by timestamp', async () => {
    mockSocket.spaceLoadDocTimestamps.mockResolvedValueOnce({});

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/workspaces/${WS}/docs/timestamps?since=1718000000`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(mockSocket.spaceLoadDocTimestamps).toHaveBeenCalledWith(
      'workspace',
      WS,
      1718000000,
    );
    await app.close();
  });
});

describe('sync routes — load doc binary', () => {
  beforeEach(() => mockSocket.spaceLoadDoc.mockClear());

  it('GET /sync/workspaces/:id/docs/:docId — returns base64 Yjs state', async () => {
    // Simulate a minimal Yjs binary (valid but empty doc)
    const yjsBinary = Buffer.from([1, 6, 102, 108, 97, 103, 115]);
    mockSocket.spaceLoadDoc.mockResolvedValueOnce({
      state: yjsBinary,
      missing: new Uint8Array(0),
      timestamp: 1718200000000,
    });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/workspaces/${WS}/docs/${DOC}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.docId).toBe(DOC);
    expect(body.timestamp).toBe(1718200000000);
    expect(typeof body.state).toBe('string'); // base64
    await app.close();
  });

  it('GET /sync/workspaces/:id/docs/:docId?stateVector=... — returns missing updates', async () => {
    const missingBinary = Buffer.from([2, 3, 4, 5]);
    mockSocket.spaceLoadDoc.mockResolvedValueOnce({
      state: Buffer.from([1, 2, 3]),
      missing: missingBinary,
      timestamp: 1718300000000,
    });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/workspaces/${WS}/docs/${DOC}?stateVector=abc123`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.missing).toBeDefined();
    expect(typeof body.missing).toBe('string'); // base64
    await app.close();
  });
});

describe('sync routes — extract doc text', () => {
  it('GET /sync/workspaces/:id/docs/:docId/text — parses Yjs and returns text', async () => {
    // Build a minimal Yjs doc with a title
    // Y.Doc header + struct + update with text
    const { Doc, applyUpdate, Text } = await import('yjs');
    const doc = new Doc();
    const meta = doc.getMap('meta');
    const title = new Text();
    title.insert(0, 'My Test Page');
    meta.set('title', title);
    const blocks = doc.getMap('blocks');
    const rootBlock = new (await import('yjs')).Map();
    rootBlock.set('sys:flavour', 'affine:page');
    const text = new Text();
    text.insert(0, 'Hello world content');
    rootBlock.set('prop:text', text);
    blocks.set('block-root', rootBlock);

    const { encodeStateAsUpdate } = await import('yjs');
    const binary = encodeStateAsUpdate(doc);

    mockSocket.spaceLoadDoc.mockResolvedValueOnce({
      state: binary,
      missing: new Uint8Array(0),
      timestamp: Date.now(),
    });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/workspaces/${WS}/docs/${DOC}/text`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.docId).toBe(DOC);
    expect(body.plainText).toContain('Hello world content');
    expect(body.blockCount).toBeGreaterThanOrEqual(1);
    await app.close();
  });
});

describe('sync routes — push doc update', () => {
  beforeEach(() => mockSocket.spacePushDocUpdate.mockClear());

  it('PUT /sync/workspaces/:id/docs/:docId — pushes Yjs update', async () => {
    const updateBase64 = Buffer.from([1, 2, 3, 4]).toString('base64');
    mockSocket.spacePushDocUpdate.mockResolvedValueOnce(1718400000000);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/sync/workspaces/${WS}/docs/${DOC}`,
      headers: {
        ...authHeaders(),
        'content-type': 'application/json',
      },
      payload: { update: updateBase64 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.docId).toBe(DOC);
    expect(body.timestamp).toBe(1718400000000);
    expect(mockSocket.spacePushDocUpdate).toHaveBeenCalledWith(
      'workspace',
      WS,
      DOC,
      expect.any(Uint8Array),
    );
    await app.close();
  });

  it('PUT /sync/workspaces/:id/docs/:docId — rejects empty update', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/sync/workspaces/${WS}/docs/${DOC}`,
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      payload: { update: '' },
    });

    // Fastify validation rejects empty string (min 1)
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('sync routes — delete doc', () => {
  beforeEach(() => mockSocket.spaceDeleteDoc.mockClear());

  it('DELETE /sync/workspaces/:id/docs/:docId — deletes doc', async () => {
    mockSocket.spaceDeleteDoc.mockResolvedValueOnce(undefined);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/sync/workspaces/${WS}/docs/${DOC}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(mockSocket.spaceDeleteDoc).toHaveBeenCalledWith('workspace', WS, DOC);
    await app.close();
  });
});

describe('sync routes — auth guards', () => {
  it('rejects requests without JWT', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sync/workspaces/${WS}/join`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects requests without API key', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sync/workspaces/${WS}/join`,
      headers: { [AUTH_HEADER]: `Bearer ${TEST_JWT}` },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
