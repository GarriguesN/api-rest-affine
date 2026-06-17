/**
 * Download and analyze AFFiNE doc structure via Socket.IO.
 * Usage: AFFINE_BASE_URL=... API_KEY=... node --import tsx --no-warnings scripts/fetch-doc.ts
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';
import { writeFileSync } from 'node:fs';
import * as Y from 'yjs';

const SESSION = 'cb2ec00e-84c2-469f-9e2b-4fe92ceadb25';
const WORKSPACE = '58cb2776-ec01-4242-824e-a930aa35671d';

const client = new AffineSocketClient({ sessionToken: SESSION });
await client.connect();
console.error('Connected');

await client.spaceJoin('workspace', WORKSPACE);
console.error('Joined workspace');

const docIds = [
  'test-api-doc-49228',
  'iu2GWNpX0W',
  'EbNRn2tHjB',
  '0AwKW7_enx',
  // pick one with actual content
];

for (const docId of docIds) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DOC: ${docId}`);
  console.log('='.repeat(60));

  try {
    const { state: sv, missing } = await client.spaceLoadDoc('workspace', WORKSPACE, docId);

    // Build full doc by applying missing updates to empty doc
    const fullDoc = new Y.Doc();
    if (missing.length > 0) Y.applyUpdate(fullDoc, missing);

    const meta    = fullDoc.getMap('meta');
    const blocks  = fullDoc.getMap('blocks');
    const space   = fullDoc.getMap('space');
    const extras  = [...fullDoc.share.keys()].filter(k => !['meta','blocks','space'].includes(k));

    console.log(`sv=${sv.length}B  missing=${missing.length}B  timestamp=${''}`);
    console.log(`Top-level Y.Map keys: ${[...fullDoc.share.keys()].join(', ')}`);
    console.log(`meta keys: [${[...meta.keys()].join(', ')}]`);
    console.log(`blocks keys (${blocks.size}): [${[...blocks.keys()].slice(0,20).join(', ')}]`);
    if (space.size > 0) console.log(`space keys: [${[...space.keys()].join(', ')}]`);
    if (extras.length > 0) console.log(`extra keys: [${extras.join(', ')}]`);

    // Meta values
    for (const [k, v] of meta.entries()) {
      if (v instanceof Y.Text) console.log(`  meta.${k} = Y.Text("${v.toString().slice(0,120)}")`);
      else if (v instanceof Y.Map) {
        const inner: string[] = [];
        (v as Y.Map<unknown>).forEach((val, key) => {
          if (val instanceof Y.Text) inner.push(`${key}=Y.Text("${val.toString().slice(0,40)}")`);
          else if (val instanceof Uint8Array) inner.push(`${key}=Uint8Array[${val.length}]`);
          else inner.push(`${key}=${typeof val}:${String(val).slice(0,40)}`);
        });
        console.log(`  meta.${k} = Y.Map {${inner.join(', ')}}`);
      }
      else if (v instanceof Y.Array) {
        const items: string[] = [];
        (v as Y.Array<unknown>).forEach((item, i) => {
          if (item instanceof Y.Text) items.push(`[${i}]="${item.toString().slice(0,40)}"`);
          else items.push(`[${i}]=${typeof item}:${String(item).slice(0,40)}`);
        });
        console.log(`  meta.${k} = Y.Array[${v.length}]: ${items.slice(0,5).join(', ')}`);
      }
      else if (v instanceof Uint8Array) console.log(`  meta.${k} = Uint8Array[${v.length}]`);
      else console.log(`  meta.${k} = ${typeof v}: "${String(v).slice(0,120)}"`);
    }

    // Blocks — show first 5
    const blockKeys = [...blocks.keys()].slice(0, 5);
    for (const bid of blockKeys) {
      const block = blocks.get(bid);
      if (!(block instanceof Y.Map)) { console.log(`  block[${bid}] = ${typeof block}`); continue; }
      console.log(`\n  Block "${bid}":`);
      for (const [k, v] of block.entries()) {
        if (v instanceof Y.Text) console.log(`    ${k} = Y.Text("${v.toString().slice(0,120)}")`);
        else if (v instanceof Y.Map) {
          const inner: string[] = [];
          (v as Y.Map<unknown>).forEach((val, key) => {
            if (val instanceof Y.Text) inner.push(`${key}=Y.Text("${val.toString().slice(0,40)}")`);
            else if (val instanceof Uint8Array) inner.push(`${key}=Uint8Array[${val.length}]`);
            else inner.push(`${key}=${typeof val}:${String(val).slice(0,40)}`);
          });
          console.log(`    ${k} = Y.Map {${inner.join(', ')}}`);
        }
        else if (v instanceof Y.Array) {
          const items: string[] = [];
          (v as Y.Array<unknown>).forEach((item, i) => {
            if (item instanceof Y.Text) items.push(`[${i}]="${item.toString().slice(0,40)}"`);
            else items.push(`[${i}]=${typeof item}:${String(item).slice(0,40)}`);
          });
          console.log(`    ${k} = Y.Array[${v.length}]: ${items.slice(0,5).join(', ')}`);
        }
        else if (v instanceof Uint8Array) console.log(`    ${k} = Uint8Array[${v.length}]`);
        else console.log(`    ${k} = ${typeof v}: "${String(v).slice(0,120)}"`);
      }
    }

    // Plain text extraction
    const texts: string[] = [];
    for (const bk of blocks.keys()) {
      const block = blocks.get(bk);
      if (!(block instanceof Y.Map)) continue;
      for (const [k, v] of block.entries()) {
        if (k.startsWith('prop:') && v instanceof Y.Text) {
          texts.push(v.toString());
        }
        if (k.startsWith('prop:') && v instanceof Y.Map) {
          const vt = (v as Y.Map<unknown>).get('$yText');
          if (vt instanceof Y.Text) texts.push(vt.toString());
          const arr = (v as Y.Map<unknown>).get('arr');
          if (arr instanceof Y.Array) {
            arr.forEach(d => {
              if (d && typeof d === 'object' && 'insert' in d) texts.push(String((d as {insert:unknown}).insert));
            });
          }
        }
        if (k === 'prop:title' && v instanceof Y.Text) {
          texts.unshift(`TITLE: ${v.toString()}`);
        }
      }
    }
    console.log(`\nPlain text:\n${texts.join('\n').slice(0, 500)}`);

    // Save
    writeFileSync(`/tmp/doc_${docId}_missing.b64`, Buffer.from(missing).toString('base64'));

  } catch (err) {
    console.log(`Error: ${err}`);
  }
}

client.disconnect();
console.error('\nDone.');
