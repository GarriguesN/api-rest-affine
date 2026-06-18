/**
 * Try ALL realtime gateway ops to find workspace listing.
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';

const SESSION = 'dd372e2b-0965-4c8f-8c9a-0d889514051d';

const client = new AffineSocketClient({ sessionToken: SESSION });
await client.connect();
console.error('Connected');

// Try all ops that might list workspaces
const ops = [
  ['workspace.all', {}],
  ['workspace.list', {}],
  ['workspace.getAll', {}],
  ['workspace.my', {}],
  ['workspace.personal', {}],
  ['workspace.getPersonal', {}],
  ['user.workspaces', {}],
  ['user.getWorkspaces', {}],
  ['user.workspace.list', {}],
  ['app.config', {}],
  ['app.workspaces', {}],
  ['workspace.root', {}],
  ['workspace.default', {}],
  ['workspace.primary', {}],
];

for (const [op, input] of ops) {
  try {
    const result = await client.realtimeRequest(op as any, input);
    console.log(`✅ ${op}: ${JSON.stringify(result).slice(0, 300)}`);
  } catch(e: any) {
    const msg = e.message || String(e);
    if (msg.includes('timeout')) {
      console.log(`⏱️  ${op}: TIMEOUT`);
    } else if (msg.includes('UNKNOWN')) {
      console.log(`❓ ${op}: UNKNOWN_OP`);
    } else {
      console.log(`❌ ${op}: ${msg.slice(0, 100)}`);
    }
  }
}

client.disconnect();
console.error('\nDone.');
