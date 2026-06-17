/**
 * GraphQL client for Affine.
 *
 * Two modes:
 * - Bridge session (default): uses the service account's session from env/startup.
 * - User session: uses the authenticated user's session cookies (for proxied requests).
 *
 * Both modes support automatic re-auth on 401.
 */

import { env } from '../../config/env.js';
import { getSession, buildCookieHeader, refreshSession } from '../affine/auth.js';
import { GraphQLError } from '../../utils/errors.js';
import type { GraphQLResponse } from '../affine/types.js';

let retryInFlight = false;
let retryQueue: Array<() => Promise<unknown>> = [];

interface SessionCookies {
  session: string;
  csrf: string;
}

/**
 * Execute a GraphQL query or mutation using the bridge's service session.
 * Used for internal bridge operations.
 */
export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return gqlRequestWithSession(query, variables, await getSession());
}

/**
 * Execute a GraphQL query or mutation using a user's session cookies.
 * Used when proxying requests on behalf of an authenticated user.
 *
 * @param cookies - The user's affine_session and affine_csrf_token cookies.
 */
export async function gqlRequestForUser<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  cookies: SessionCookies,
): Promise<T> {
  return gqlRequestWithSession(query, variables, cookies);
}

async function gqlRequestWithSession<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  { session, csrf }: SessionCookies,
): Promise<T> {
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

  // 401 — only retry for bridge session (not user sessions)
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
