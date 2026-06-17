/**
 * Shared test helpers and mocks.
 *
 * IMPORTANT: always use `vi.stubGlobal('fetch', mockFetch)` instead of
 * `global.fetch = mockFetch` — vitest needs the stub mechanism to properly
 * intercept global references in ESM modules.
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fetch (affine responses)
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
// Use stubGlobal so that all ESM module imports of `fetch` see the mock
vi.stubGlobal('fetch', mockFetch);

export { mockFetch };

export function mockAffineFetch(body: unknown, options: {
  status?: number;
  setCookieHeaders?: string[];
} = {}) {
  const {
    status = 200,
    setCookieHeaders = [
      'affine_session=mock-session; HttpOnly',
      'affine_csrf_token=mock-csrf; HttpOnly',
    ],
  } = options;

  const headerMap = new Headers();
  for (const cookie of setCookieHeaders) {
    headerMap.append('set-cookie', cookie);
  }

  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: headerMap,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

// ---------------------------------------------------------------------------
// Mock Socket.IO client helpers
// ---------------------------------------------------------------------------

export function createMockSocketClient() {
  return {
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
}

// ---------------------------------------------------------------------------
// API key constants
// ---------------------------------------------------------------------------

export const TEST_API_KEY = 'test-secret-key-32-chars-min!!';
export const TEST_JWT = 'eyJmock.token.signature';
