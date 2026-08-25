import Link from 'next/link';

/** The frame every auth page shares. Kept plain and centred — these pages
 * have exactly one job and nothing should compete with the form. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-accent text-caption font-semibold text-white"
          >
            T
          </span>
          <span className="text-subheading font-semibold tracking-tight text-text">Turfly</span>
        </Link>

        <div className="mt-6 rounded-(--radius-card) border border-border bg-surface p-6">
          <h1 className="text-heading text-text">{title}</h1>
          {subtitle ? <p className="mt-1 text-body text-text-muted">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>

        {footer ? <div className="mt-4 text-center text-caption text-text-muted">{footer}</div> : null}
      </div>
    </div>
  );
}
