/**
 * Explore the new workspace via Socket.IO.
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';
import * as Y from 'yjs';

const SESSION = 'dd372e2b-0965-4c8f-8c9a-0d889514051d';

const client = new AffineSocketClient({ sessionToken: SESSION });
await client.connect();
console.error('Connected');

// Try the new workspace
const WS = 'caf05c39-b46a-44bf-a180-fbea6dc0a7f2';
console.error(`Joining workspace ${WS}...`);

try {
  const cid = await client.spaceJoin('workspace', WS);
  console.error(`  Joined! clientId: ${cid}`);
  const ts = await client.spaceLoadDocTimestamps('workspace', WS);
  console.log(`Docs in ${WS}:`);
  for (const [docId, t] of Object.entries(ts)) {
    console.error(`  ${docId}: ${new Date(Number(t)).toISOString()}`);
  }

  // Load and parse each doc
  for (const docId of Object.keys(ts)) {
    try {
      const { missing } = await client.spaceLoadDoc('workspace', WS, docId);
      const doc = new Y.Doc();
      if (missing.length > 0) Y.applyUpdate(doc, missing);

      const blocks = doc.getMap('blocks');
      let title = '', preview = '';

      for (const [, block] of blocks.entries()) {
        if (!(block instanceof Y.Map)) continue;
        const flavour = block.get('sys:flavour');
        if (flavour === 'affine:page') {
          const t = block.get('prop:title');
          if (t instanceof Y.Text) title = t.toString();
        }
        const text = block.get('prop:text');
        if (text instanceof Y.Text) {
          const t = text.toString().trim();
          if (t && !preview) preview = t.slice(0, 100);
        }
      }
      console.log(`${docId}: title="${title}" preview="${preview}"`);
    } catch(e: any) {
      console.log(`${docId}: ERROR ${e.message}`);
    }
  }
} catch(e: any) {
  console.log(`Workspace error: ${e.message}`);
}

client.disconnect();
console.error('\nDone.');
