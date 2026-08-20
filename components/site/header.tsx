import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-4">
        <Link href="/" className="shrink-0 text-subheading font-semibold text-text sm:text-heading">
          Greenfield Turf
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
        </nav>
      </div>
    </header>
  );
}
