/**
 * GraphQL client for Affine.
 *
 * Wraps the native fetch API with:
 * - Cookie-based auth injected on every request.
 * - Automatic re-auth on 401 (one retry).
 * - Typed responses.
 */

import { env } from '../../config/env.js';
import { getSession, buildCookieHeader, refreshSession } from '../affine/auth.js';
import { GraphQLError } from '../../utils/errors.js';
import type { GraphQLResponse } from '../affine/types.js';

let retryInFlight = false;
let retryQueue: Array<() => Promise<unknown>> = [];

/** Execute a GraphQL query or mutation against Affine. */
export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const { session, csrf } = await getSession();
  const cookieHeader = buildCookieHeader(session, csrf);

  const response = await fetch(env.AFFINE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xcsrf-token': csrf,
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ query, variables }),
    credentials: 'include',
  });

  // 401 — try to re-authenticate once
  if (response.status === 401) {
    if (!retryInFlight) {
      retryInFlight = true;
      try {
        await refreshSession();
      } finally {
        retryInFlight = false;
        const pending = retryQueue.splice(0);
        pending.forEach(fn => fn());
      }
    }

    // Wait for the retry to complete, then retry this request
    return new Promise<T>((resolve, reject) => {
      retryQueue.push(async () => {
        try {
          const result = await gqlRequest<T>(query, variables);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new GraphQLError(`GraphQL HTTP error: ${response.status} ${text}`);
  }

  const json = await response.json() as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new GraphQLError(
      json.errors.map(e => e.message).join('; '),
      json.errors,
    );
  }

  if (!json.data) {
    throw new GraphQLError('GraphQL response missing data field');
  }

  return json.data;
}
