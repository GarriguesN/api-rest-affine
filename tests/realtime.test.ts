/**
 * Integration tests for Realtime Gateway REST routes.
 *
 * Uses vi.hoisted() for shared mock singletons and vi.spyOn() for
 * per-test overrides. This avoids vi.mock hoisting conflicts between test files.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { TEST_API_KEY, TEST_JWT } from './helpers/common.js';

// ---------------------------------------------------------------------------
// Shared mock — hoisted to avoid module-hoisting conflicts
// ---------------------------------------------------------------------------

const { mockSocket } = vi.hoisted(() => {
  const socket = {
    connected: true,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    isConnected: true,
    realtimeRequest: vi.fn(),
    realtimeSubscribe: vi.fn(),
    realtimeUnsubscribe: vi.fn(),
    spaceJoin: vi.fn(),
    spaceLeave: vi.fn(),
    spaceLoadDoc: vi.fn(),
    spaceLoadDocTimestamps: vi.fn(),
    spacePushDocUpdate: vi.fn(),
    spaceDeleteDoc: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  return { mockSocket: socket };
});

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

function authHeaders(extra: Record<string, string> = {}) {
  return { [API_KEY_HEADER]: TEST_API_KEY, [AUTH_HEADER]: `Bearer ${TEST_JWT}`, ...extra };
}

describe('realtime routes — user profile', () => {
  beforeEach(() => mockSocket.realtimeRequest.mockClear());
  afterEach(() => mockSocket.realtimeRequest.mockClear());

  it('GET /realtime/user/me/profile — returns user profile', async () => {
    const mockProfile = {
      user: {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: true,
        hasPassword: true,
        avatarUrl: null,
        features: ['copilot'],
      },
    };

    mockSocket.realtimeRequest.mockResolvedValueOnce(mockProfile);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/realtime/user/me/profile',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual(mockProfile);
    expect(mockSocket.realtimeRequest).toHaveBeenCalledWith(
      'user.profile.get',
      {},
      expect.objectContaining({ jwtToken: TEST_JWT }),
    );
    await app.close();
  });

  it('GET /realtime/user/me/profile — 401 without JWT', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/realtime/user/me/profile',
      headers: { [API_KEY_HEADER]: TEST_API_KEY },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /realtime/user/me/profile — 401 without API key', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/realtime/user/me/profile',
      headers: { [AUTH_HEADER]: `Bearer ${TEST_JWT}` },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /realtime/user/me/profile — rejects invalid Bearer format', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/realtime/user/me/profile',
      headers: {
        [API_KEY_HEADER]: TEST_API_KEY,
        [AUTH_HEADER]: `Token ${TEST_JWT}`, // wrong prefix
      },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('realtime routes — workspace access', () => {
  const wsId = '58cb2776-ec01-4242-824e-a930aa35671d';

  beforeEach(() => mockSocket.realtimeRequest.mockClear());
  afterEach(() => mockSocket.realtimeRequest.mockClear());

  it('GET /realtime/workspaces/:id/access — returns access data', async () => {
    const mockAccess = {
      access: {
        role: 'Owner',
        permissions: { 'Workspace.Update': true, 'Workspace.Delete': true },
        team: false,
      },
    };

    mockSocket.realtimeRequest.mockResolvedValueOnce(mockAccess);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/realtime/workspaces/${wsId}/access`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(mockAccess);
    expect(mockSocket.realtimeRequest).toHaveBeenCalledWith(
      'workspace.access.get',
      { workspaceId: wsId },
      expect.any(Object),
    );
    await app.close();
  });

  it('GET /realtime/workspaces/:id/config — returns workspace config', async () => {
    const mockConfig = {
      config: {
        enableAi: true,
        enableSharing: true,
        enableUrlPreview: true,
        enableDocEmbedding: false,
      },
    };

    mockSocket.realtimeRequest.mockResolvedValueOnce(mockConfig);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/realtime/workspaces/${wsId}/config`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(mockConfig);
    await app.close();
  });

  it('GET /realtime/workspaces/:id/members — paginated member list', async () => {
    const mockMembers = {
      members: [
        {
          id: 'user-1',
          name: 'Alice',
          email: 'alice@example.com',
          avatarUrl: null,
          permission: 'Owner',
          role: 'Owner',
          inviteId: 'inv-1',
          emailVerified: true,
          status: 'active',
        },
      ],
      memberCount: 1,
    };

    mockSocket.realtimeRequest.mockResolvedValueOnce(mockMembers);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/realtime/workspaces/${wsId}/members`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(mockMembers);
    await app.close();
  });

  it('GET /realtime/workspaces/:id/quota — returns quota state', async () => {
    const mockQuota = {
      state: {
        workspaceId: wsId,
        plan: 'pro',
        seatLimit: 10,
        memberCount: 3,
        overcapacityMemberCount: 0,
        blobLimit: 5_000_000_000,
        storageQuota: 10_000_000_000,
        usedStorageQuota: 2_000_000_000,
        historyPeriodSeconds: 2592000,
        readonly: false,
        readonlyReasons: [],
        flags: {},
      },
    };

    mockSocket.realtimeRequest.mockResolvedValueOnce(mockQuota);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/realtime/workspaces/${wsId}/quota`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ workspaceId: wsId });
    await app.close();
  });
});

describe('realtime routes — doc-level', () => {
  const wsId = '58cb2776-ec01-4242-824e-a930aa35671d';
  const docId = 'abc12340-0000-0000-0000-000000000001';

  beforeEach(() => mockSocket.realtimeRequest.mockClear());
  afterEach(() => mockSocket.realtimeRequest.mockClear());

  it('GET /realtime/workspaces/:wid/docs/:did/share-state — returns share state', async () => {
    const mockState = {
      state: { public: true, mode: 'Page', defaultRole: 'Reader' },
    };

    mockSocket.realtimeRequest.mockResolvedValueOnce(mockState);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/realtime/workspaces/${wsId}/docs/${docId}/share-state`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(mockState);
    expect(mockSocket.realtimeRequest).toHaveBeenCalledWith(
      'doc.share-state.get',
      { workspaceId: wsId, docId },
      expect.any(Object),
    );
    await app.close();
  });

  it('GET /realtime/workspaces/:wid/docs/:did/grants — paginated grants', async () => {
    const mockGrants = {
      totalCount: 1,
      pageInfo: { endCursor: 'cursor-1', hasNextPage: false },
      edges: [
        {
          node: {
            role: 'Editor',
            user: { id: 'u1', name: 'Bob', email: 'bob@test.com', avatarUrl: null },
          },
        },
      ],
    };

    mockSocket.realtimeRequest.mockResolvedValueOnce(mockGrants);

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/realtime/workspaces/${wsId}/docs/${docId}/grants?first=20`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(mockGrants);
    await app.close();
  });
});
