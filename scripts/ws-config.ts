/**
 * Get workspace config for personal workspace to understand folder/collection structure.
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';

const SESSION = 'dd372e2b-0965-4c8f-8c9a-0d889514051d';
const WS = 'caf05c39-b46a-44bf-a180-fbea6dc0a7f2';

const client = new AffineSocketClient({ sessionToken: SESSION });
await client.connect();
console.error('Connected');

// Get workspace access
try {
  const access = await client.realtimeRequest('workspace.access.get', { workspaceId: WS });
  console.log('Access:', JSON.stringify(access, null, 2));
} catch(e) { console.log('access error:', e.message); }

// Get workspace config
try {
  const config = await client.realtimeRequest('workspace.config.get', { workspaceId: WS });
  console.log('Config:', JSON.stringify(config, null, 2));
} catch(e) { console.log('config error:', e.message); }

// Get workspace members
try {
  const members = await client.realtimeRequest('workspace.members.get', { workspaceId: WS });
  console.log('Members:', JSON.stringify(members, null, 2));
} catch(e) { console.log('members error:', e.message); }

client.disconnect();
console.error('\nDone.');
