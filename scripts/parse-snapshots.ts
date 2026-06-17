/**
 * Parse AFFiNE IndexedDB snapshots to extract doc titles.
 */
import * as Y from 'yjs';
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('/Users/ngarrigues/Downloads/affine-indexeddb-export.json', 'utf-8'));

function bytesFromJson(obj) {
  if (typeof obj !== 'object' || obj === null) return null;
  if (Array.isArray(obj)) return Buffer.from(obj);
  if (!Object.keys(obj).every(k => !isNaN(parseInt(k)))) return null;
  return Buffer.from(Object.keys(obj).sort((a,b) => a-b).map(k => obj[k]));
}

function parseSnapshot(binary) {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, binary);
  } catch(e) {
    return { error: e.message };
  }

  const blocks = doc.getMap('blocks');
  const lines = [];
  const allBlocks = {};

  for (const [bid, block] of blocks.entries()) {
    if (!(block instanceof Y.Map)) continue;
    allBlocks[bid] = {};
    const flavour = block.get('sys:flavour');
    if (flavour === 'affine:page' || flavour === 'affine:note') {
      const title = block.get('prop:title');
      if (title instanceof Y.Text) {
        const t = title.toString().trim();
        if (t) lines.push(`TITLE: ${t}`);
      }
    }
    const text = block.get('prop:text');
    if (text instanceof Y.Text) {
      const t = text.toString().trim();
      if (t) lines.push(t.slice(0, 150));
    }
    // Check nested Y.Map format for text
    if (text instanceof Y.Map) {
      const yt = text.get('$yText');
      if (yt instanceof Y.Text) {
        const t = yt.toString().trim();
        if (t) lines.push(t.slice(0, 150));
      }
    }
    // Check for collection/folder metadata
    for (const [k, v] of block.entries()) {
      if (typeof v === 'string' && v.length < 200) {
        allBlocks[bid][k] = v;
      }
    }
  }

  return {
    blocks: [...blocks.keys()].length,
    text: lines.join('\n').slice(0, 400),
    allBlocks,
  };
}

const workspaces = {
  '5ac4e67f-0c4e-44e4-a9b6-e8d2ffda8504': 'WS1',
  'aa0118e1-0f1f-4050-bbde-c76ae9e43993': 'WS2',
};

for (const [wsId, wsName] of Object.entries(workspaces)) {
  const dbKey = `affine-cloud:workspace:${wsId}`;
  if (!raw[dbKey]) continue;

  const snapshots = raw[dbKey].snapshots || [];
  const clocks = {};
  for (const c of (raw[dbKey].clocks || [])) {
    clocks[c.docId] = c.timestamp;
  }

  console.log(`\n=== Workspace: ${wsId} ===`);
  for (const snap of snapshots) {
    const docId = snap.docId;
    const binary = bytesFromJson(snap.bin);
    const ts = clocks[docId] || '?';
    if (!binary || binary.length === 0) continue;

    // Special: show all content from system docs
    if (docId.startsWith('db$') || docId.startsWith('userdata$') || docId === snap.docId.split('$')[0]) {
      console.log(`  [${docId}] special doc`);
      const result = parseSnapshot(binary);
      if (result.error) {
        console.log(`    ERROR: ${result.error}`);
      } else {
        for (const [bid, content] of Object.entries(result.allBlocks || {})) {
          const filtered = Object.fromEntries(
            Object.entries(content).filter(([k,v]) => typeof v === 'string' && v.length > 0 && v.length < 500)
          );
          if (Object.keys(filtered).length > 0) {
            console.log(`    ${bid}: ${JSON.stringify(filtered)}`);
          }
        }
        if (result.text) console.log(`    text: "${result.text.slice(0,300)}"`);
      }
      continue;
    }

    const result = parseSnapshot(binary);
    if (result.error) {
      console.log(`  ${docId} [${ts}] — ERROR: ${result.error}`);
    } else {
      const title = result.text.split('\n').find(l => l.startsWith('TITLE:')) || '';
      const firstText = result.text.split('\n').find(l => !l.startsWith('TITLE:')) || '';
      console.log(`  ${docId} [${ts}]`);
      console.log(`    title: "${title.replace('TITLE: ', '')}"`);
      if (firstText) console.log(`    preview: "${firstText.slice(0, 120)}"`);
    }
  }
}

console.log('\nDone');
