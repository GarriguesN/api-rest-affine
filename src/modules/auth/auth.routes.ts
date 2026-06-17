/**
 * Auth module — public REST endpoints for Affine authentication.
 *
 * These routes bypass the x-api-key guard.
 * They proxy to Affine's REST auth endpoints and manage session cookies.
 *
 * Auth flow:
 * 1. POST /auth/login  → sign in to Affine, return user + set bridge session cookie
 * 2. GET  /auth/me     → return current user (from Affine session cookie)
 * 3. POST /auth/logout → sign out of Affine, clear bridge session cookie
 */

import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { ServiceUnavailableError, BadRequestError } from '../../utils/errors.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const loginResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  hasPassword: z.boolean().nullable(),
  avatarUrl: z.string().nullable(),
  features: z.array(z.string()),
  token: z.string().optional(), // exchange code for native apps
});

const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    hasPassword: z.boolean().nullable(),
    avatarUrl: z.string().nullable(),
    features: z.array(z.string()),
  }).nullable(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCookie(setCookieHeaders: string[], name: string): string | null {
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1]!;
  }
  return null;
}

function extractCookiesFromResponse(response: Response): {
  session: string | null;
  csrf: string | null;
  rawCookies: string[];
} {
  const setCookieHeaders = response.headers.getSetCookie();
  const session = extractCookie(setCookieHeaders, 'affine_session');
  const csrf = extractCookie(setCookieHeaders, 'affine_csrf_token');
  return { session, csrf, rawCookies: setCookieHeaders };
}

function buildCookieHeader(session: string, csrf: string): string {
  return `affine_session=${session}; affine_csrf_token=${csrf}`;
}

/**
 * Proxy to Affine's auth endpoint and return user + set bridge session cookie.
 */
async function proxyToAffineAuth(
  email: string,
  password: string,
): Promise<{ user: z.infer<typeof loginResponseSchema>; session: string; csrf: string }> {
  const url = `${env.AFFINE_BASE_URL}/api/auth/sign-in`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include', // receive cookies from Affine
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new BadRequestError(`Affine sign-in failed: ${response.status} ${text}`);
  }

  const { session, csrf, rawCookies } = extractCookiesFromResponse(response);

  if (!session || !csrf) {
    throw new ServiceUnavailableError(
      'Affine',
      'sign-in returned no session cookies',
    );
  }

  // The response body contains user info
  const user = loginResponseSchema.parse(await response.json());

  return { user, session, csrf };
}

/**
 * Get current user from Affine using the session cookie.
 */
async function getAffineSessionUser(
  session: string,
  csrf: string,
): Promise<z.infer<typeof sessionResponseSchema>['user']> {
  const url = `${env.AFFINE_BASE_URL}/api/auth/session`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: buildCookieHeader(session, csrf),
      'x-affine-csrf-token': csrf,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    // Treat 401/403 as "no session" rather than an error
    if (response.status === 401 || response.status === 403) {
      return null;
    }
    throw new ServiceUnavailableError('Affine', `session check failed: ${response.status}`);
  }

  const data = sessionResponseSchema.parse(await response.json());
  return data.user;
}

/**
 * Sign out from Affine.
 */
async function proxyToAffineLogout(session: string, csrf: string): Promise<void> {
  const url = `${env.AFFINE_BASE_URL}/api/auth/sign-out`;

  await fetch(url, {
    method: 'POST',
    headers: {
      Cookie: buildCookieHeader(session, csrf),
      'x-affine-csrf-token': csrf,
    },
    credentials: 'include',
  });
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/login — Sign in to Affine and create bridge session
  fastify.post(
    '/auth/login',
    {
      schema: {
        body: loginBodySchema,
        response: {
          200: z.object({
            user: loginResponseSchema,
            // Expose cookies so the client can store them and use for GraphQL requests
            sessionCookie: z.string(),
            csrfToken: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = loginBodySchema.parse(request.body);

      const { user, session, csrf } = await proxyToAffineAuth(email, password);

      // Set cookies on the bridge response (bridge session = Affine session)
      reply.setCookie('affine_session', session, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      reply.setCookie('affine_csrf_token', csrf, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        user,
        sessionCookie: session,
        csrfToken: csrf,
      });
    },
  );

  // GET /auth/me — Get current user from Affine session
  fastify.get(
    '/auth/me',
    {
      schema: {
        response: {
          200: sessionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.cookies['affine_session'];
      const csrf = request.cookies['affine_csrf_token'];

      if (!session || !csrf) {
        return reply.send({ user: null });
      }

      const user = await getAffineSessionUser(session, csrf);
      return reply.send({ user });
    },
  );

  // POST /auth/logout — Sign out from Affine and clear bridge session
  fastify.post(
    '/auth/logout',
    {
      schema: {
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const session = request.cookies['affine_session'];
      const csrf = request.cookies['affine_csrf_token'];

      if (session && csrf) {
        await proxyToAffineLogout(session, csrf).catch(() => {
          // Ignore errors — logout should always succeed from client perspective
        });
      }

      // Clear cookies
      reply.clearCookie('affine_session', { path: '/' });
      reply.clearCookie('affine_csrf_token', { path: '/' });

      return reply.send({ ok: true });
    },
  );

  // POST /auth/preflight — Check if email is registered on Affine
  fastify.post(
    '/auth/preflight',
    {
      schema: {
        body: z.object({ email: z.string().email() }),
        response: {
          // Affine returns: { registered: boolean, hasPassword: boolean }
          200: z.object({
            registered: z.boolean(),
            hasPassword: z.boolean().optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { email } = z.object({ email: z.string().email() }).parse(request.body);

      const url = `${env.AFFINE_BASE_URL}/api/auth/preflight`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new ServiceUnavailableError('Affine', `preflight failed: ${response.status}`);
      }

      const data = await response.json() as { registered?: unknown; hasPassword?: unknown };
      return reply.send({
        registered: Boolean(data.registered),
        hasPassword: data.hasPassword == null ? null : Boolean(data.hasPassword),
      });
    },
  );
};
