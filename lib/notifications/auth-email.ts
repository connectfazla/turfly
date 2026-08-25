/**
 * Transactional email for the auth flows, via Loops.
 *
 * Separate from lib/notifications/* (the booking notifier) on purpose. Those
 * are business notifications that may be disabled wholesale by
 * NOTIFICATIONS_ENABLED, or routed to a console notifier in dev. These are
 * not optional in the same way: a verification link that silently vanishes
 * means an account nobody can ever sign into. Different guarantees, so
 * different module.
 *
 * Loops sends transactional email by TEMPLATE ID — the body lives in their
 * dashboard, not here. That means each kind below needs a template created
 * once and its id put in the matching env var. Until then this logs the link
 * to the server console, so local development and a half-configured staging
 * environment both still work rather than silently failing.
 */

const LOOPS_ENDPOINT = 'https://app.loops.so/api/v1/transactional';

export type AuthEmailKind = 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'INVITE' | 'DUPLICATE_SIGNUP';

/** Which env var carries each template's Loops transactionalId. */
const TEMPLATE_ENV: Record<AuthEmailKind, string> = {
  EMAIL_VERIFY: 'LOOPS_TXN_EMAIL_VERIFY',
  PASSWORD_RESET: 'LOOPS_TXN_PASSWORD_RESET',
  INVITE: 'LOOPS_TXN_INVITE',
  DUPLICATE_SIGNUP: 'LOOPS_TXN_DUPLICATE_SIGNUP',
};

export interface AuthEmailInput {
  to: string;
  kind: AuthEmailKind;
  name: string;
  /** The action link. Absent for DUPLICATE_SIGNUP, which points at the reset page. */
  url: string;
  /** Extra template variables — e.g. the venue and role on an invite. */
  data?: Record<string, string>;
}

/**
 * Sends one transactional email.
 *
 * NEVER throws. Callers already treat email as best-effort (`.catch()` at
 * every call site), because an unreachable email provider must not prevent a
 * password reset from being recorded or a staff member from being granted
 * access. What it does instead is log loudly, so a misconfiguration is
 * visible rather than silent.
 */
export async function sendAuthEmail(input: AuthEmailInput): Promise<void> {
  const apiKey = process.env.LOOPS_API_KEY;
  const transactionalId = process.env[TEMPLATE_ENV[input.kind]];

  if (!apiKey || !transactionalId) {
    // The deliberate fallback. In dev this is how you complete a signup
    // without configuring Loops at all: copy the link out of the terminal.
    console.info(
      `[auth-email] ${input.kind} for ${input.to} — not sent (${
        !apiKey ? 'LOOPS_API_KEY unset' : `${TEMPLATE_ENV[input.kind]} unset`
      }).\n  Link: ${input.url}`,
    );
    return;
  }

  try {
    const response = await fetch(LOOPS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionalId,
        email: input.to,
        dataVariables: { name: input.name, url: input.url, ...input.data },
      }),
      // Without a timeout a hung provider holds the request open for as long
      // as the platform allows, turning "email is slow" into "sign-up is
      // broken".
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[auth-email] Loops rejected ${input.kind} for ${input.to}: ${response.status} ${body}`);
    }
  } catch (err) {
    console.error(`[auth-email] Loops request failed for ${input.kind}:`, err);
  }
}
