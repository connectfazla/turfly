'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inviteStaffAction } from '@/app/actions/venue-staff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function InviteStaffForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MANAGER' | 'BOOKIE'>('BOOKIE');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await inviteStaffAction({ name, email, role });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Distinguishes the two outcomes honestly: an email actually went out, or
    // the grant exists and they need to sign up themselves.
    setNotice(
      result.data.emailed
        ? `Invitation emailed to ${result.data.email}.`
        : `${result.data.email} was added. Ask them to sign up with that exact address.`,
    );
    setName('');
    setEmail('');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="staff-name">Name</Label>
        <Input
          id="staff-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Karim Ahmed"
          className="rounded-(--radius-input)"
          required
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="staff-email">Email</Label>
        <Input
          id="staff-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="karim@example.com"
          className="rounded-(--radius-input)"
          required
        />
      </div>
      <div className="flex w-36 flex-col gap-1.5">
        <Label htmlFor="staff-role">Role</Label>
        <select
          id="staff-role"
          value={role}
          onChange={(e) => setRole(e.target.value as 'MANAGER' | 'BOOKIE')}
          className="h-9 rounded-(--radius-input) border border-border bg-surface px-2 text-body text-text"
        >
          <option value="BOOKIE">Bookie</option>
          <option value="MANAGER">Manager</option>
        </select>
      </div>
      <Button type="submit" disabled={pending} className="shrink-0">
        {pending ? 'Adding…' : 'Add staff'}
      </Button>

      {error ? (
        <p role="alert" className="w-full text-caption text-danger sm:w-auto">
          {error}
        </p>
      ) : null}
      {notice ? <p className="w-full text-caption text-accent sm:w-auto">{notice}</p> : null}
    </form>
  );
}
