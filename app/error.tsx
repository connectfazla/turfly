'use client';

/**
 * ROUTE: catches any uncaught error thrown while rendering under the root
 * layout — public, renders regardless of auth state.
 *
 * Error boundaries are a required client component by Next.js convention
 * (the `reset()` prop only makes sense as an event handler). Deliberately
 * shows nothing about the actual error to the visitor — CLAUDE.md §8's
 * "a raw error message or stack trace never reaches the client" applies
 * here exactly as much as it does to a Server Action's catch block; only
 * `console.error` sees the real thing, for whoever is watching server
 * logs.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app error boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-caption font-medium text-text-muted">Something went wrong</p>
      <h1 className="mt-2 text-display text-text">We hit a snag</h1>
      <p className="mt-2 max-w-[46ch] text-body text-text-muted">
        That wasn&apos;t supposed to happen. Try again, or head back to booking a slot — nothing
        you were doing has been lost.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/book">Book a slot</Link>
        </Button>
      </div>
    </div>
  );
}
