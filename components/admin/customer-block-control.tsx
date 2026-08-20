'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { blockCustomerAction, unblockCustomerAction } from '@/app/actions/customers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';

export function CustomerBlockControl({
  customerId,
  customerName,
  isBlocked,
}: {
  customerId: string;
  customerName: string;
  isBlocked: boolean;
}) {
  const router = useRouter();

  if (isBlocked) {
    return (
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="outline">
            Unblock
          </Button>
        }
        title="Unblock this customer?"
        description={`${customerName} will be able to book online again.`}
        confirmLabel="Unblock"
        onConfirm={async () => {
          const result = await unblockCustomerAction({ customerId });
          router.refresh();
          return result;
        }}
      />
    );
  }

  return <BlockDialog customerId={customerId} customerName={customerName} />;
}

function BlockDialog({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBlock() {
    if (reason.trim().length < 3) {
      setError('Enter a reason (at least 3 characters).');
      return;
    }
    setPending(true);
    setError(null);
    const result = await blockCustomerAction({ customerId, reason });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setReason('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Block
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-(--radius-card) sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-heading text-text">Block {customerName}?</DialogTitle>
          <DialogDescription className="text-body text-text-muted">
            They won&apos;t be able to book online until unblocked. Staff can still book for them at
            the counter.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blockReason">Reason</Label>
          <Input id="blockReason" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-(--radius-input)" />
        </div>
        {error ? (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="destructive" disabled={pending} onClick={handleBlock}>
            {pending ? 'Blocking…' : 'Block customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
