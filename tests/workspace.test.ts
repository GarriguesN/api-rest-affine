/**
 * Integration tests for workspace routes (CRUD + mutations).
 * GraphQL calls are mocked via vi.mock at the module level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../../src/app.js';
import { TEST_API_KEY } from '../helpers/common.js';

// ---------------------------------------------------------------------------
// Mock GraphQL client — intercepts module imports before app.ts loads
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.mock('../../src/infra/graphql/client.js', () => ({
  gqlRequest: vi.fn((query: string, variables?: Record<string, unknown>) =>
    mockFetch(),
  ),
  gqlRequestForUser: vi.fn(),
}));

// Make mockFetch available to test setup helpers
export { mockFetch };

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const API_KEY_HEADER = 'x-api-key';
const WS = '58cb2776-ec01-4242-824e-a930aa35671d';

function gqlResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ data }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workspace routes — delete workspace', () => {
  beforeEach(() => mockFetch.mockClear());

  it('DELETE /workspaces/:id — deletes workspace', async () => {
    gqlResponse({ deleteWorkspace: true });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${WS}`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    const gqlCall = mockFetch.mock.calls[0]!;
    expect(gqlCall[0]).toContain('deleteWorkspace');
    await app.close();
  });
});

describe('workspace routes — invite members', () => {
  beforeEach(() => mockFetch.mockClear());

  it('POST /workspaces/:id/invite — sends invitations', async () => {
    const invitations = [
      { email: 'alice@example.com', status: 'pending' },
      { email: 'bob@example.com', status: 'pending' },
    ];
    gqlResponse({ inviteMembers: invitations });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${WS}/invite`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY, 'content-type': 'application/json' },
      payload: { emails: ['alice@example.com', 'bob@example.com'] },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ invitations });
    await app.close();
  });

  it('POST /workspaces/:id/invite — 400 for invalid email', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${WS}/invite`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY, 'content-type': 'application/json' },
      payload: { emails: ['not-an-email'] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /workspaces/:id/invite — 400 for empty emails array', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${WS}/invite`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY, 'content-type': 'application/json' },
      payload: { emails: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('workspace routes — leave workspace', () => {
  beforeEach(() => mockFetch.mockClear());

  it('POST /workspaces/:id/leave — leaves workspace', async () => {
    gqlResponse({ leaveWorkspace: true });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${WS}/leave`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    await app.close();
  });
});

describe('workspace routes — existing list/get still work', () => {
  beforeEach(() => mockFetch.mockClear());

  it('GET /workspaces — returns workspace list', async () => {
    gqlResponse({
      workspaces: [
        {
          id: WS,
          createdAt: '2025-01-01T00:00:00Z',
          initialized: true,
          enableAi: true,
          enableSharing: true,
          role: 'Owner',
          public: false,
          memberCount: 1,
          owner: { id: 'u1', name: 'Test', email: 'test@test.com' },
        },
      ],
    });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
      headers: { [API_KEY_HEADER]: TEST_API_KEY },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0]!.id).toBe(WS);
    await app.close();
  });

  it('GET /workspaces/:id — returns single workspace', async () => {
    gqlResponse({
      workspace: {
        id: WS,
        createdAt: '2025-01-01T00:00:00Z',
        initialized: true,
        enableAi: true,
        enableSharing: true,
        role: 'Owner',
        public: false,
        memberCount: 1,
        owner: { id: 'u1', name: 'Test', email: 'test@test.com' },
      },
    });

    const app = buildApp({ logger: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${WS}`,
      headers: { [API_KEY_HEADER]: TEST_API_KEY },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.workspace.id).toBe(WS);
    await app.close();
  });
});
