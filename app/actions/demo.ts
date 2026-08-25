/**
 * Signs a visitor into the public demo — no password, no signup.
 *
 * SECURITY SHAPE, read this before touching it: the only input from the
 * browser is `role`, a 3-way enum. Which USER that becomes is resolved
 * entirely server-side via lib/demo.ts, which itself only ever returns the
 * accounts belonging to the one Venue flagged Tenant.isDemo. There is no
 * parameter here a request could widen into "log me in as anyone" — that is
 * what makes an unauthenticated login action safe to publish.
 */
'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { clientIpFromHeaders, isRateLimited } from '@/lib/auth/rate-limit';
import { createSession } from '@/lib/auth/session';
import { getDemoVenue, type DemoRole } from '@/lib/demo';

type ActionResult = { ok: true } | { ok: false; error: string };

const roleSchema = z.enum(['OWNER', 'MANAGER', 'BOOKIE']);

export async function startDemoSessionAction(role: DemoRole): Promise<ActionResult> {
  const ip = clientIpFromHeaders(await headers());
  // Same shape as every other unauthenticated write in this app
  // (lib/auth/rate-limit.ts) — a public, no-password login action is
  // exactly the kind of endpoint worth throttling by default.
  if (await isRateLimited(`demo:${ip}`)) {
    return { ok: false, error: 'Too many attempts. Please wait a moment and try again.' };
  }

  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { ok: false, error: 'Choose a role to explore.' };

  const demo = await getDemoVenue();
  if (!demo) {
    return {
      ok: false,
      error: 'The demo is not set up on this environment yet.',
    };
  }

  await createSession(demo.accounts[parsed.data].userId);
  return { ok: true };
}
