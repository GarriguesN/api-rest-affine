/**
 * Affine authentication — manages session cookies across requests.
 *
 * Strategy:
 * - If AFFINE_SESSION_COOKIE + AFFINE_CSRF_TOKEN are set in env, use them.
 * - Otherwise, perform programmatic sign-in at startup and cache cookies.
 * - On 401 from GraphQL, re-authenticate once automatically.
 */

import { env } from '../../config/env.js';
import { ServiceUnavailableError } from '../../utils/errors.js';

interface SessionCookies {
  session: string;
  csrf: string;
}

let cookies: SessionCookies | null = null;

/** Sign in to Affine and return the session + CSRF cookies. */
async function signIn(): Promise<SessionCookies> {
  const signInUrl = `${env.AFFINE_BASE_URL}/api/auth/sign-in`;

  const response = await fetch(signInUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: env.AFFINE_EMAIL,
      password: env.AFFINE_PASSWORD,
    }),
    credentials: 'include',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new ServiceUnavailableError('Affine', `sign-in failed: ${response.status} ${text}`);
  }

  // Extract cookies from Set-Cookie headers
  const setCookie = response.headers.getSetCookie();
  const session = extractCookie(setCookie, 'affine_session');
  const csrf = extractCookie(setCookie, 'affine_csrf_token');

  if (!session || !csrf) {
    throw new ServiceUnavailableError(
      'Affine',
      'sign-in succeeded but missing expected cookies in response',
    );
  }

  return { session, csrf };
}

function extractCookie(setCookieHeaders: string[], name: string): string | null {
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1]!;
  }
  return null;
}

/** Build the Cookie header value for GraphQL requests. */
export function buildCookieHeader(session: string, csrf: string): string {
  return `affine_session=${session}; affine_csrf_token=${csrf}`;
}

/**
 * Get or refresh session cookies.
 * If refresh is true, forces a new sign-in (used on 401).
 */
export async function getSession(refresh = false): Promise<SessionCookies> {
  // Use pre-set cookies from env if available
  if (!refresh && env.AFFINE_SESSION_COOKIE && env.AFFINE_CSRF_TOKEN) {
    return { session: env.AFFINE_SESSION_COOKIE, csrf: env.AFFINE_CSRF_TOKEN };
  }

  if (!refresh && cookies) {
    return cookies;
  }

  cookies = await signIn();
  return cookies;
}

/**
 * Force a re-authentication (e.g. after receiving 401 from GraphQL).
 */
export async function refreshSession(): Promise<SessionCookies> {
  return getSession(true);
}
