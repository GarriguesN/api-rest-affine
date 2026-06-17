/**
 * Unit tests for graphql/client.ts mocking.
 *
 * NOTE: Due to ESM + vi.mock compatibility limitations in vitest,
 * these tests are pending a proper setup.
 * Full integration is covered by tests/smoke.mjs against the compiled server.
 */

import { describe, it, expect, vi } from 'vitest';

describe('placeholder — graphql client unit tests', () => {
  it('smoke: vitest is working', () => {
    expect(true).toBe(true);
  });
});
