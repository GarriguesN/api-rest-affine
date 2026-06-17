/**
 * Yjs binary parser for AFFiNE documents.
 *
 * AFFiNE stores doc content as Yjs binary snapshots. Each doc is a Y.Doc
 * with two top-level maps:
 *
 *   doc.getMap('meta')   → page metadata (title, mode, etc.)
 *   doc.getMap('blocks') → block tree (Y.Map<blockId, Y.Map<prop, value>>)
 *
 * Block properties are stored in a Y.Map with string keys like:
 *   'sys:flavour'   → block type ('affine:page', 'affine:paragraph', etc.)
 *   'prop:title'    → page title as Y.Text
 *   'prop:text'     → text content as Y.Text
 *   'prop:children' → child block IDs as Y.Array
 *
 * This module provides utilities to extract plain text from AFFiNE doc binaries
 * using only the `yjs` library.
 */

import * as Y from 'yjs';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ParsedDoc {
  docId: string;
  title: string | null;
  mode: string | null;
  plainText: string;
  blockCount: number;
}

/**
 * Parse an AFFiNE doc binary (Yjs snapshot) and extract:
 * - Title (from meta.title)
 * - Plain text content (recursively from all text-bearing blocks)
 * - Block count
 */
export function parseDocBinary(
  binary: Uint8Array,
  docId?: string,
): ParsedDoc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, binary);

  const meta = doc.getMap('meta');
  const blocks = doc.getMap('blocks');

  const title = extractTitle(meta);
  const mode = extractMode(meta);
  const { text, blockCount } = extractBlocks(blocks);

  return {
    docId: docId ?? '',
    title,
    mode,
    plainText: text.trim(),
    blockCount,
  };
}

/**
 * Extract the title from a doc's meta map.
 * Returns null if no title is found.
 */
export function extractTitle(meta: Y.Map<unknown>): string | null {
  const titleValue = meta.get('title');
  if (!titleValue) return null;
  return extractYValue(titleValue);
}

/**
 * Extract the page mode from a doc's meta map ('Page' or 'Edgeless').
 */
export function extractMode(meta: Y.Map<unknown>): string | null {
  const mode = meta.get('mode');
  if (!mode) return null;
  return extractYValue(mode);
}

// ---------------------------------------------------------------------------
// Block extraction
// ---------------------------------------------------------------------------

interface BlockResult {
  text: string;
  blockCount: number;
}

/**
 * Recursively extract plain text from all blocks in the blocks map.
 * Handles Y.Text, Y.Array, Y.Map, and plain values.
 */
function extractBlocks(blocks: Y.Map<unknown>): BlockResult {
  let text = '';
  let blockCount = 0;

  for (const block of blocks.values()) {
    if (!(block instanceof Y.Map)) continue;
    blockCount++;

    const flavour = block.get('sys:flavour');
    if (typeof flavour !== 'string') continue;

    // Extract text from 'prop:text' (paragraphs, headings, etc.)
    const textProp = block.get('prop:text');
    if (textProp) {
      const extracted = extractYValue(textProp);
      if (extracted) text += extracted + '\n';
    }

    // Extract title from 'prop:title' (page root blocks)
    const titleProp = block.get('prop:title');
    if (titleProp) {
      const extracted = extractYValue(titleProp);
      if (extracted) text += extracted + '\n';
    }

    // Recurse into children
    const childrenProp = block.get('prop:children');
    if (childrenProp) {
      const childResult = extractYArrayAsText(childrenProp, blocks);
      text += childResult;
    }
  }

  return { text, blockCount };
}

/**
 * Recursively extract text from a Y.Array of block IDs.
 */
function extractYArrayAsText(
  arrayValue: unknown,
  blocks: Y.Map<unknown>,
): string {
  if (!(arrayValue instanceof Y.Array)) return '';
  let text = '';

  arrayValue.forEach((blockId: unknown) => {
    if (typeof blockId !== 'string') return;
    const block = blocks.get(blockId);
    if (!(block instanceof Y.Map)) return;

    const textProp = block.get('prop:text');
    if (textProp) {
      const extracted = extractYValue(textProp);
      if (extracted) text += extracted + '\n';
    }

    const titleProp = block.get('prop:title');
    if (titleProp) {
      const extracted = extractYValue(titleProp);
      if (extracted) text += extracted + '\n';
    }

    const childrenProp = block.get('prop:children');
    if (childrenProp) {
      text += extractYArrayAsText(childrenProp, blocks);
    }
  });

  return text;
}

// ---------------------------------------------------------------------------
// Yjs value extraction
// ---------------------------------------------------------------------------

/**
 * Extract a human-readable string from any Yjs value.
 * Handles: Y.Text, Y.Map, Y.Array, Uint8Array (skip), primitives.
 */
function extractYValue(value: unknown): string {
  if (value instanceof Y.Text) {
    return value.toString();
  }
  if (value instanceof Y.Map) {
    // If the map has a '$yText' property (AFFiNE stores Y.Text this way sometimes)
    const yText = value.get('$yText');
    if (yText instanceof Y.Text) {
      return yText.toString();
    }
    // If the map has an 'arr' property (delta format)
    const arr = value.get('arr');
    if (arr instanceof Y.Array) {
      return yTextDeltaToString(arr);
    }
    return '';
  }
  if (value instanceof Y.Array) {
    return yTextDeltaToString(value);
  }
  if (value instanceof Uint8Array) {
    // Binary data — skip
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

/**
 * Convert a Y.Array (delta format: [{insert: string}, ...]) to a plain string.
 * This is the format used by Y.Text.toDelta().
 */
function yTextDeltaToString(deltaArray: Y.Array<unknown>): string {
  let text = '';
  deltaArray.forEach(delta => {
    if (
      delta !== null &&
      typeof delta === 'object' &&
      !Array.isArray(delta) &&
      'insert' in delta
    ) {
      const d = delta as { insert: unknown };
      if (typeof d.insert === 'string') {
        text += d.insert;
      }
    }
  });
  return text;
}
