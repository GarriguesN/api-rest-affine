/**
 * Explore personal workspace (userspace) via Socket.IO.
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';

const SESSION = 'cb2ec00e-84c2-469f-9e2b-4fe92ceadb25';
const USER_ID = 'f15aaf23-f698-4164-98d8-e0599ad95385';

const client = new AffineSocketClient({ sessionToken: SESSION });
await client.connect();
console.error('Connected');

// Try joining userspace with user ID
console.error(`Trying userspace join with userId: ${USER_ID}`);
try {
  const clientId = await client.spaceJoin('userspace', USER_ID);
  console.error(`Joined userspace, clientId: ${clientId}`);

  // Get timestamps for all docs in userspace
  const timestamps = await client.spaceLoadDocTimestamps('userspace', USER_ID);
  console.log(JSON.stringify(Object.fromEntries(
    Object.entries(timestamps).slice(0, 20)
  ), null, 2));

  // Load first doc
  const docIds = Object.keys(timestamps).slice(0, 3);
  for (const docId of docIds) {
    console.error(`\nLoading doc: ${docId}`);
    try {
      const { state, missing } = await client.spaceLoadDoc('userspace', USER_ID, docId);
      console.log(`  state=${state.length}B  missing=${missing.length}B`);

      // Apply updates
      const { Y } = await import('yjs');
      const doc = new Y.Doc();
      if (missing.length > 0) Y.applyUpdate(doc, missing);

      const blocks = doc.getMap('blocks');
      const keys = [...blocks.keys()].slice(0, 5);
      console.log(`  blocks (first 5): ${keys.join(', ')}`);

      // Find page title
      for (const k of keys) {
        const block = blocks.get(k);
        if (!(block instanceof Y.Map)) continue;
        const flavour = block.get('sys:flavour');
        const title = block.get('prop:title');
        if (flavour === 'affine:page' && title instanceof Y.Text) {
          console.log(`  title: "${title.toString()}"`);
        }
      }
    } catch(e) {
      console.log(`  error: ${e}`);
    }
  }
} catch(e) {
  console.error(`userspace error: ${e}`);
}

client.disconnect();
console.error('\nDone.');
