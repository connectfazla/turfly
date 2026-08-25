'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The venue's own public booking-page URL, with a copy button — the thing
 * an owner actually wants to hand a customer or paste into a Facebook post,
 * not a link they're expected to click and copy from the address bar. */
export function BookingLink({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'group flex items-center gap-1.5 rounded-(--radius-input) text-left transition-colors',
        className,
      )}
      title="Copy booking link"
    >
      <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-accent" strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <Copy className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      )}
      <span className="sr-only">{copied ? 'Copied' : 'Copy booking link'}</span>
    </button>
  );
}
