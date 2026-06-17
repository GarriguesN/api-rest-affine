/**
 * Smoke tests — run against the compiled dist/ using the actual app.
 * These test the FULL stack (no mocks except env) and need a real Affine
 * instance to pass. Ideal for CI/CD.
 *
 * Run with:  AFFINE_EMAIL=... AFFINE_PASSWORD=... API_KEY=... node tests/smoke.mjs
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
  console.error('❌ TEST_API_KEY env var is required');
  process.exit(1);
})();

const ws = process.env.TEST_WORKSPACE_ID ?? '00000000-0000-0000-0000-000000000000';

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
  const { status, data } = await request('GET', '/health');
  eq(status, 200, 'status');
  if (!data.status === 'ok') throw new Error('expected status=ok');
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
});

await assert('GET /api/v1/workspaces/:id — 200 with valid uuid', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${ws}`);
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces/:id/collections — 200', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${ws}/collections`);
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces/:id/collections — 400 for bad uuid', async () => {
  const { status } = await request('GET', '/api/v1/workspaces/not-a-uuid/collections');
  eq(status, 400, 'status');
});

await assert('GET /api/v1/workspaces/:id/pages — 200', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${ws}/pages`);
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces/:id/pages — 200 with pagination', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${ws}/pages?first=5&offset=0`);
  eq(status, 200, 'status');
});

await assert('GET /api/v1/workspaces/:id/pages — 400 when first > 100', async () => {
  const { status } = await request('GET', `/api/v1/workspaces/${ws}/pages?first=200`);
  eq(status, 400, 'status');
});

console.log('\n✅ Smoke tests complete');
