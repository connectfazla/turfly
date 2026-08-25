/** The small pill label that sits above a section heading. Borrowed from the
 * reference design's "OUR SERVICES" / "WHO WE ARE" chips — it gives each
 * section a quiet label without spending a heading level on it. */
export function Eyebrow({ children, tone = 'light' }: { children: React.ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <span
      className={
        tone === 'dark'
          ? 'inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-caption font-medium tracking-wide text-white/90 uppercase backdrop-blur-sm'
          : 'inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-caption font-medium tracking-wide text-text-muted uppercase'
      }
    >
      <span aria-hidden="true" className={tone === 'dark' ? 'size-1.5 rounded-full bg-white/70' : 'size-1.5 rounded-full bg-accent'} />
      {children}
    </span>
  );
}
