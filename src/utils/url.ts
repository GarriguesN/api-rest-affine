import { env } from '../config/env.js';

/**
 * Build the Affine page URL from workspaceId + docId.
 */
export function buildPageUrl(docId: string, workspaceId: string): string {
  return `${env.AFFINE_BASE_URL}/workspace/${workspaceId}/${docId}`;
}

/**
 * Extract workspace ID and doc ID from an Affine page URL.
 * Returns null if the URL doesn't match the expected pattern.
 */
export function parsePageUrl(url: string): { workspaceId: string; docId: string } | null {
  const match = url.match(/workspace\/([^/]+)\/([^/?#]+)/);
  if (!match) return null;
  return { workspaceId: match[1]!, docId: match[2]! };
}
