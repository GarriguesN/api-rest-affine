/**
 * Smoke tests — run against the compiled dist/ using the actual app.
 * Tests the FULL stack against notes.nglab.es.
 *
 * Run with:
 *   API_KEY=your-api-key node tests/smoke.mjs
 *
 * Env vars:
 *   TEST_BASE_URL      (default: http://localhost:3002)
 *   TEST_WORKSPACE_ID  (default: real workspace id for hermes@nglab.es)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(__dirname, '../dist/server.js');

// Check build exists
try {
  readFileSync(distPath);
} catch {
  console.error('❌ Build not found. Run: npm run build');
  process.exit(1);
}

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3002';
const API_KEY = process.env.API_KEY ?? (() => {
  console.error('❌ API_KEY env var is required');
  process.exit(1);
})();

// Real workspaces from garriguesnacho@gmail.com on notes.nglab.es
const WS = process.env.TEST_WORKSPACE_ID ?? '58cb2776-ec01-4242-824e-a930aa35671d';
const WS2 = '5ac4e67f-0c4e-44e4-a9b6-e8d2ffda8504';

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function assert(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

console.log('🧪 Smoke tests — api-rest-affine');
console.log(`   Base URL: ${BASE_URL}\n`);

await assert('GET /health — 200 (no auth)', async () => {
  const { status } = await request('GET', '/health');
  eq(status, 200, 'status');
});

await assert('GET /health — has affine field', async () => {
  const { data } = await request('GET', '/health');
  if (!('affine' in data)) throw new Error('missing affine field');
});

await assert('GET /api/v1/workspaces — 401 without key', async () => {
  const res = await fetch(`${BASE_URL}/api/v1/workspaces`);
  eq(res.status, 401, 'status');
});

await assert('GET /api/v1/workspaces — 200 with auth', async () => {
  const { status } = await request('GET', '/api/v1/workspaces');
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces — returns workspaces array', async () => {
  const { data } = await request('GET', '/api/v1/workspaces');
  if (!Array.isArray(data.workspaces)) throw new Error('workspaces not an array');
  if (data.workspaces.length === 0) throw new Error('expected at least 1 workspace');
  const ws = data.workspaces[0];
  if (!ws.id) throw new Error('workspace missing id');
  if (!ws.owner?.name) throw new Error('workspace missing owner.name');
  if (typeof ws.memberCount !== 'number') throw new Error('workspace missing memberCount');
});

await assert('GET /api/v1/workspaces/:id — 200 with valid uuid', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${WS}`);
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces/:id — workspace has owner', async () => {
  const { data } = await request('GET', `/api/v1/workspaces/${WS}`);
  if (!data.workspace?.owner?.name) throw new Error('workspace missing owner.name');
});

await assert('GET /api/v1/workspaces/:id/collections — 200 (returns empty)', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${WS}/collections`);
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces/:id/collections — returns empty array', async () => {
  const { data } = await request('GET', `/api/v1/workspaces/${WS}/collections`);
  if (!Array.isArray(data.collections)) throw new Error('collections not an array');
  if (data.totalCount !== 0) throw new Error('expected totalCount=0');
});

await assert('GET /api/v1/workspaces/:id/collections — 400 for bad uuid', async () => {
  const { status } = await request('GET', '/api/v1/workspaces/not-a-uuid/collections');
  eq(status, 400, 'status');
});

await assert('GET /api/v1/workspaces/:id/pages — 200', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${WS}/pages`);
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces/:id/pages — has pages, totalCount, pageInfo', async () => {
  const { data } = await request('GET', `/api/v1/workspaces/${WS}/pages`);
  if (!Array.isArray(data.pages)) throw new Error('pages not an array');
  if (typeof data.totalCount !== 'number') throw new Error('missing totalCount');
  if (!data.pageInfo) throw new Error('missing pageInfo');
  if (typeof data.pages[0]?.id !== 'string') throw new Error('page missing id');
});

await assert('GET /api/v1/workspaces/:id/pages — 200 with pagination', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${WS}/pages?first=5&offset=0`);
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces/:id/pages — 400 when first > 100', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${WS}/pages?first=200`);
  eq(status, 400, 'status');
});

await assert('GET /api/v1/workspaces/:id/pages — 400 when offset < 0', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${WS}/pages?offset=-1`);
  eq(status, 400, 'status');
});

await assert('GET /api/v1/workspaces — returns at least 2 workspaces', async () => {
  const { data } = await request('GET', '/api/v1/workspaces');
  if (data.workspaces.length < 2) throw new Error(`expected >= 2 workspaces, got ${data.workspaces.length}`);
});

await assert('GET /api/v1/workspaces/:id (second workspace) — 200 with pages', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${WS2}`);
  eq(status, 200, 'status');
  const { data } = await request('GET', `/api/v1/workspaces/${WS2}/pages`);
  if (!Array.isArray(data.pages)) throw new Error('pages not an array');
});

console.log('\n✅ Smoke tests complete');
