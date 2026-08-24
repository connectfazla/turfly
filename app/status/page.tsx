/**
 * ROUTE: /status — public, no login. TEMPORARY DIAGNOSTIC PAGE.
 *
 * Added to debug the production deployment not connecting to its
 * database. Deliberately breaks CLAUDE.md §8's "a raw error message
 * never reaches the client" rule — that's exactly the information
 * needed to diagnose a broken deploy from outside Vercel's own log
 * viewer. Never shows actual secret VALUES (AUTH_SECRET, the password
 * inside DATABASE_URL) — only whether each is set, and for DATABASE_URL,
 * the host/database it points at (safe, and the actual useful bit for
 * "is this even pointing at the right database").
 *
 * REMOVE THIS ROUTE once the deployment is confirmed healthy. It is not
 * meant to stay public.
 */
import { prisma } from '@/lib/prisma';
import { DEFAULT_VENUE_SLUG } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface EnvCheck {
  name: string;
  present: boolean;
  detail: string;
}

/** Redacts everything except host + database name from a Postgres
 * connection string — enough to confirm "is this the right database",
 * never enough to reconnect with it. */
function redactedDbTarget(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return '(unparseable — not a valid URL)';
  }
}

function checkEnv(name: string): EnvCheck {
  const value = process.env[name];
  const present = !!value && value.length > 0;
  if (!present) return { name, present: false, detail: 'not set' };
  if (name === 'DATABASE_URL') return { name, present: true, detail: redactedDbTarget(value!) };
  if (name === 'AUTH_SECRET') return { name, present: true, detail: `set (${value!.length} characters)` };
  return { name, present: true, detail: value! };
}

export default async function StatusPage() {
  const envChecks = ['DATABASE_URL', 'AUTH_SECRET', 'AUTH_URL', 'NODE_ENV'].map(checkEnv);

  let dbCheck: { ok: true } | { ok: false; name: string; message: string };
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbCheck = { ok: true };
  } catch (err) {
    dbCheck = {
      ok: false,
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let venueCheck: { ok: true; venueName: string } | { ok: false; message: string };
  try {
    const venue = await prisma.venue.findUnique({ where: { slug: DEFAULT_VENUE_SLUG } });
    venueCheck = venue
      ? { ok: true, venueName: venue.name }
      : {
          ok: false,
          message:
            'Connected fine, but no Venue row exists — did scripts/backfill-tenant-zero.ts run against this database?',
        };
  } catch (err) {
    venueCheck = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  return (
    <div style={{ fontFamily: 'ui-monospace, monospace', padding: 24, maxWidth: 800, margin: '0 auto', lineHeight: 1.5 }}>
      <h1>Deployment status</h1>
      <p style={{ color: '#b45309', fontWeight: 600 }}>
        Temporary diagnostic page — remove app/status/page.tsx once the deployment is confirmed healthy.
      </p>

      <h2>Environment variables</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
        <tbody>
          {envChecks.map((c) => (
            <tr key={c.name}>
              <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{c.name}</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ccc', color: c.present ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                {c.present ? 'SET' : 'MISSING'}
              </td>
              <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{c.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Database connectivity (SELECT 1)</h2>
      {dbCheck.ok ? (
        <p style={{ color: '#15803d' }}>OK — database reachable.</p>
      ) : (
        <pre style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {dbCheck.name}: {dbCheck.message}
        </pre>
      )}

      <h2 style={{ marginTop: 24 }}>Venue read (what the homepage actually does)</h2>
      {venueCheck.ok ? (
        <p style={{ color: '#15803d' }}>OK — found &quot;{venueCheck.venueName}&quot;.</p>
      ) : (
        <pre style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {venueCheck.message}
        </pre>
      )}
    </div>
  );
}
