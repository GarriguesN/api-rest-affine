/**
 * Try realtime ops AFTER spaceJoin - maybe they need a space context.
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';

const SESSION = 'dd372e2b-0965-4c8f-8c9a-0d889514051d';
const WS = 'caf05c39-b46a-44bf-a180-fbea6dc0a7f2';

const client = new AffineSocketClient({ sessionToken: SESSION });
await client.connect();
console.error('Connected');

// First join the workspace (this works)
await client.spaceJoin('workspace', WS);
console.error('Space joined');

// Now try realtime ops after joining
const ops = [
  'user.profile.get',
  'user.settings.get',
  'workspace.access.get',
  'workspace.config.get',
  'notification.count.get',
];

for (const op of ops) {
  try {
    const result = await client.realtimeRequest(op as any, op.startsWith('workspace') ? { workspaceId: WS } : {});
    console.log(`✅ ${op}: ${JSON.stringify(result).slice(0, 200)}`);
  } catch(e: any) {
    const msg = e.message || String(e);
    console.log(`${msg.includes('timeout') ? '⏱️' : '❌'} ${op}: ${msg.slice(0, 100)}`);
  }
}

client.disconnect();
console.error('\nDone.');
