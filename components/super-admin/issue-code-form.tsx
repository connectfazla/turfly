'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { issueRegistrationCodeAction } from '@/app/actions/super-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function IssueCodeForm() {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The freshly issued code. Shown once, prominently — the operator has to
   * actually send this to somebody, and hunting for it in the table below
   * immediately after generating it is a needless step. */
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await issueRegistrationCodeAction({
      label,
      issuedToEmail: email,
      expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIssued(result.data.display);
    setLabel('');
    setEmail('');
    setCopied(false);
    router.refresh();
  }

  async function copy() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-(--radius-card) border border-border bg-surface p-5">
      <h2 className="text-subheading text-text">Issue a code</h2>
      <p className="mt-1 text-caption text-text-muted">
        One code registers one business. Send it to the owner directly.
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="label">Who is this for?</Label>
          <Input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Rakib — Dhanmondi turf"
            className="rounded-(--radius-input)"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="email">Their email (optional)</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="rakib@example.com"
            className="rounded-(--radius-input)"
          />
        </div>
        <div className="flex w-32 flex-col gap-1.5">
          <Label htmlFor="expiresInDays">Expires in</Label>
          <div className="flex items-center gap-2">
            <Input
              id="expiresInDays"
              type="number"
              min="1"
              max="365"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              className="rounded-(--radius-input)"
            />
            <span className="text-caption text-text-muted">days</span>
          </div>
        </div>
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? 'Issuing…' : 'Issue code'}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-caption text-danger">
          {error}
        </p>
      ) : null}

      {issued ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-(--radius-input) border border-accent/30 bg-accent-soft/50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-caption text-text-muted">New code — send this to the owner</p>
            <p className="truncate font-mono text-subheading tabular-nums text-text">{issued}</p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="flex shrink-0 items-center gap-1.5 rounded-(--radius-input) border border-border bg-surface px-3 py-1.5 text-caption text-text transition-colors hover:bg-surface-muted"
          >
            {copied ? <Check className="size-4 text-accent" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
