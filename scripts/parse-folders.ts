/**
 * Download and parse folders structure from accessible personal workspace.
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';
import * as Y from 'yjs';

const SESSION = 'dd372e2b-0965-4c8f-8c9a-0d889514051d';
const WS = 'caf05c39-b46a-44bf-a180-fbea6dc0a7f2';

const client = new AffineSocketClient({ sessionToken: SESSION });
await client.connect();
console.error('Connected');

await client.spaceJoin('workspace', WS);
console.error('Joined');

// Load the folders doc
const FOLDERS_DOC = `db$${WS}$folders`;
const { missing } = await client.spaceLoadDoc('workspace', WS, FOLDERS_DOC);
const doc = new Y.Doc();
if (missing.length > 0) Y.applyUpdate(doc, missing);

const blocks = doc.getMap('blocks');
console.log(`\nFolders doc — ${blocks.size} blocks:`);

for (const [bid, block] of blocks.entries()) {
  if (!(block instanceof Y.Map)) continue;

  // Show ALL properties for each block
  const props: Record<string, string> = {};
  for (const [k, v] of block.entries()) {
    if (v instanceof Y.Text) {
      props[k] = v.toString();
    } else if (v instanceof Y.Array) {
      const items: string[] = [];
      v.forEach((item, i) => {
        if (item instanceof Y.Text) items.push(`${i}="${item.toString()}"`);
        else if (item instanceof Y.Map) {
          const inner: string[] = [];
          item.forEach((val, key) => {
            if (val instanceof Y.Text) inner.push(`${key}="${val.toString()}"`);
            else inner.push(`${key}=${typeof val}:${String(val).slice(0,50)}`);
          });
          items.push(`${i}=Y.Map{${inner.join(',')}}`);
        }
        else items.push(`${i}=${typeof v}:${String(v).slice(0,50)}`);
      });
      props[k] = `Y.Array[${v.length}]: [${items.slice(0,10).join(', ')}]`;
    } else if (v instanceof Y.Map) {
      const inner: string[] = [];
      v.forEach((val, key) => {
        if (val instanceof Y.Text) inner.push(`${key}="${val.toString()}"`);
        else inner.push(`${key}=${typeof val}:${String(val).slice(0,30)}`);
      });
      props[k] = `Y.Map{${inner.join(', ')}}`;
    } else if (v instanceof Uint8Array) {
      props[k] = `Uint8Array[${v.length}]`;
    } else if (typeof v === 'string') {
      props[k] = v;
    } else {
      props[k] = `${typeof v}: ${String(v).slice(0,50)}`;
    }
  }

  const flavour = props['sys:flavour'] || '(root)';
  console.log(`\n  Block "${bid}" [${flavour}]:`);
  for (const [k, v] of Object.entries(props)) {
    if (k !== 'sys:flavour') {
      const display = v.length > 200 ? v.slice(0, 200) + '...' : v;
      console.log(`    ${k}: ${display}`);
    }
  }
}

client.disconnect();
console.error('\nDone.');
