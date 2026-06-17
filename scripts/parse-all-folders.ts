/**
 * Check all workspaces' folder structures.
 */
import * as Y from 'yjs';
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('/Users/ngarrigues/Downloads/affine-indexeddb-export.json', 'utf-8'));

function bytesFromJson(obj: unknown): Buffer | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const keys = Object.keys(obj as Record<string, number>);
  if (!keys.every(k => !isNaN(parseInt(k)))) return null;
  return Buffer.from(keys.map(Number).sort((a, b) => a - b).map(k => (obj as Record<string, number>)[k]));
}

function inspectMap(m: Y.Map<unknown>): string {
  const entries: string[] = [];
  m.forEach((v, k) => {
    if (v instanceof Y.Text) entries.push(`${k}=Text("${v.toString().slice(0,80)}")`);
    else if (v instanceof Y.Array) entries.push(`${k}=Array[${v.length}]`);
    else if (v instanceof Uint8Array) entries.push(`${k}=U8[${v.length}]`);
    else if (typeof v === 'string') entries.push(`${k}="${v.slice(0,80)}"`);
    else if (typeof v === 'number' || typeof v === 'boolean') entries.push(`${k}=${v}`);
    else entries.push(`${k}=${JSON.stringify(v).slice(0,80)}`);
  });
  return `{${entries.join(', ')}}`;
}

const workspaces = [
  ['58cb2776-ec01-4242-824e-a930aa35671d', 'TEAM'],
  ['5ac4e67f-0c4e-44e4-a9b6-e8d2ffda8504', 'PERSONAL-1'],
  ['aa0118e1-0f1f-4050-bbde-c76ae9e43993', 'PERSONAL-2'],
];

for (const [wsId, wsName] of workspaces) {
  const dbKey = `affine-cloud:workspace:${wsId}`;
  if (!raw[dbKey]) continue;

  const snapshots = raw[dbKey].snapshots || [];
  const foldersDoc = snapshots.find((s: any) => s.docId === 'db$folders');
  if (!foldersDoc) { console.log(`\n${wsName}: no folders doc`); continue; }

  const binary = bytesFromJson(foldersDoc.bin);
  if (!binary || binary.length === 0) continue;

  const doc = new Y.Doc();
  Y.applyUpdate(doc, binary);

  console.log(`\n=== ${wsName} ===`);
  console.log(`Snapshot: ${binary.length}B, ${[...doc.share.keys()].length} top-level entries`);

  // Check all top-level entries using doc.getMap
  let deletedCount = 0;
  let activeCount = 0;
  for (const key of doc.share.keys()) {
    const m = doc.getMap(key);
    const hasDeleted = (m as any).get('$$DELETED');
    if (hasDeleted) {
      deletedCount++;
    } else {
      activeCount++;
      const mapStr = inspectMap(m);
      console.log(`  ACTIVE "${key}": ${mapStr}`);
    }
  }
  console.log(`  Deleted: ${deletedCount}, Active: ${activeCount}`);
}
