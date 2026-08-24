import Link from 'next/link';
import { SignInButton, SignUpButton, Show, UserButton } from '@clerk/nextjs';
import { getVenueName } from '@/lib/venue';

/** The venue name is read from the database, not hard-coded, so this
 * same codebase can be redeployed for a different venue owner by
 * changing one VenueSetting row instead of a code change - see
 * app/page.tsx, which already did this; the rest of the site's chrome
 * (this header, the footer, the admin nav, the login page) previously
 * didn't, which meant the brand name only actually changed on the
 * homepage. */
export async function SiteHeader() {
  const venueName = await getVenueName();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-4">
        <Link href="/" className="shrink-0 text-subheading font-semibold text-text sm:text-heading">
          {venueName}
        </Link>
        <nav className="flex items-center gap-3 text-caption text-text-muted sm:gap-6 sm:text-body">
          <Link href="/book" className="hover:text-text">
            Book
          </Link>
          <Link href="/booking/lookup" className="hover:text-text">
            My booking
          </Link>
          <Link href="/rules" className="hover:text-text">
            Rules
          </Link>
          {/* Clerk covers the new tenant/customer-facing account layer -
           * staff/admin login is unrelated and still lives at /login
           * (Auth.js), unaffected by this. Nothing here is enforced yet;
           * these controls are the visible entry point while that layer
           * is built out. */}
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="hover:text-text">Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-(--radius-input) bg-accent px-3 py-1.5 text-white hover:bg-accent/90">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            {/* Sign-out redirect is configured in the Clerk dashboard in
             * this SDK version, not as a per-component prop. */}
            <UserButton />
          </Show>
        </nav>
      </div>
    </header>
  );
}
