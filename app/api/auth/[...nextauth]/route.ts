/**
 * ROUTE: /api/auth/* — Auth.js v5's own handler.
 *
 * Wires up sign-in, sign-out, session, and CSRF endpoints (e.g.
 * /api/auth/callback/credentials, /api/auth/session). All the actual
 * behavior (credentials provider, JWT session, rate limiting) is
 * configured once in auth.ts at the project root; this file just exposes
 * it as GET/POST route handlers.
 */
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
