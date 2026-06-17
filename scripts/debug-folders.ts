/**
 * Debug folders parsing - check types and methods.
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

const dbKey = 'affine-cloud:workspace:58cb2776-ec01-4242-824e-a930aa35671d';
const foldersDoc = raw[dbKey].snapshots.find((s: any) => s.docId === 'db$folders');
const binary = bytesFromJson(foldersDoc.bin);

const doc = new Y.Doc();
Y.applyUpdate(doc, binary);

const [firstKey] = doc.share.keys();
const firstVal = doc.share.get(firstKey);

console.log('Doc share keys:', [...doc.share.keys()]);
console.log('First val type:', typeof firstVal);
console.log('First val constructor:', (firstVal as any).constructor?.name);
console.log('First val toJSON exists:', typeof (firstVal as any).toJSON);
console.log('First val forEach exists:', typeof (firstVal as any).forEach);
console.log('First val keys exists:', typeof (firstVal as any).keys);
console.log('First val entries exists:', typeof (firstVal as any).entries);

if (typeof (firstVal as any).toJSON === 'function') {
  try {
    const json = (firstVal as any).toJSON();
    console.log('toJSON result:', JSON.stringify(json).slice(0, 500));
  } catch(e) {
    console.log('toJSON error:', e);
  }
}

if (typeof (firstVal as any).forEach === 'function') {
  console.log('forEach entries:');
  (firstVal as any).forEach((v: unknown, k: string) => {
    console.log(`  ${k}: ${typeof v} / ${(v as any)?.constructor?.name || ''} = ${JSON.stringify(v).slice(0,100)}`);
  });
}

// Cast to Y.Map and try methods
const mapVal = firstVal as Y.Map<unknown>;
console.log('\nAs Y.Map:');
console.log('mapVal.forEach:', typeof mapVal.forEach);
console.log('mapVal.size:', (mapVal as any).size);
console.log('mapVal.length:', (mapVal as any).length);

try {
  mapVal.forEach((v, k) => {
    console.log(`  ${k}: ${inspectVal(v)}`);
  });
} catch(e) {
  console.log('forEach error:', e);
}

// Also try doc.getMap(key)
const directMap = doc.getMap(firstKey);
console.log('\nVia doc.getMap():');
console.log('size:', directMap.size);
directMap.forEach((v, k) => {
  console.log(`  ${k}: ${inspectVal(v)}`);
});

function inspectVal(v: unknown): string {
  if (!v) return String(v);
  if (v instanceof Y.Text) return `Text:"${v.toString().slice(0,50)}"`;
  if (v instanceof Y.Map) return `Map{${[...v.keys()].slice(0,5).join(',')}}`;
  if (v instanceof Y.Array) return `Array[${v.length}]`;
  if (v instanceof Uint8Array) return `U8[${v.length}]`;
  if (typeof v === 'string') return `"${v.slice(0,50)}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const ctor = (v as any).constructor?.name;
  if (ctor) return `${ctor}:${JSON.stringify(v).slice(0,50)}`;
  return JSON.stringify(v).slice(0,50);
}
