import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The reference design's signature control: a pill with a circular arrow
 * badge tucked at its right edge. Marketing surface only — the app keeps
 * shadcn's Button, because a screen full of pills reads as a landing page,
 * not a tool.
 *
 * Renders an <a> for external/mailto targets and a <Link> otherwise, so
 * mailto: never goes through the client router.
 */
export function PillButton({
  href,
  children,
  variant = 'solid',
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'solid' | 'light' | 'outline';
  className?: string;
}) {
  const base =
    'group inline-flex items-center gap-2 rounded-full py-2 pr-2 pl-5 text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';
  const styles = {
    solid: 'bg-accent text-white hover:bg-accent/90 focus-visible:outline-accent',
    light: 'bg-white text-text hover:bg-white/90 focus-visible:outline-white',
    outline: 'border border-border bg-surface text-text hover:bg-surface-muted focus-visible:outline-accent',
  }[variant];
  const badge = {
    solid: 'bg-white/20 text-white',
    light: 'bg-accent text-white',
    outline: 'bg-surface-muted text-text',
  }[variant];

  const inner = (
    <>
      {children}
      <span
        aria-hidden="true"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5',
          badge,
        )}
      >
        <ArrowUpRight className="size-4" strokeWidth={2.25} />
      </span>
    </>
  );

  if (href.startsWith('mailto:') || href.startsWith('http')) {
    return (
      <a href={href} className={cn(base, styles, className)}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cn(base, styles, className)}>
      {inner}
    </Link>
  );
}
