/**
 * Try personal workspaces with fresh session.
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';

const SESSION = 'dd372e2b-0965-4c8f-8c9a-0d889514051d';

const client = new AffineSocketClient({ sessionToken: SESSION });
await client.connect();
console.error('Connected');

// First check workspaces via GraphQL
const personalWs = [
  '5ac4e67f-0c4e-44e4-a9b6-e8d2ffda8504',
  'aa0118e1-0f1f-4050-bbde-c76ae9e43993',
];

for (const wsId of personalWs) {
  console.error(`\nTrying workspace ${wsId}...`);
  try {
    const cid = await client.spaceJoin('workspace', wsId);
    console.error(`  Joined! clientId: ${cid}`);
    const ts = await client.spaceLoadDocTimestamps('workspace', wsId);
    console.log(`${wsId}: ${Object.keys(ts).length} docs`);
    for (const [docId, t] of Object.entries(ts)) {
      console.log(`  ${docId}: ${new Date(Number(t)).toISOString()}`);
    }
  } catch(e: any) {
    console.log(`${wsId}: ${e.message}`);
  }
}

client.disconnect();
console.error('\nDone.');
