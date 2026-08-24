'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyPaymentAction, rejectPaymentAction } from '@/app/actions/admin-bookings';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBDT } from '@/lib/format';

export interface VerifyPaymentFormProps {
  bookingId: string;
  reference: string;
  trxId: string;
  amount: string;
  bkashNumber: string;
}

/** Shown only on a PENDING_VERIFICATION booking (CLAUDE.md's payment-
 * verification invariant). Staff check the TRXN against their own bKash
 * statement — this app has no merchant API to do that automatically —
 * then either verify (CONFIRMED, money folded into amountPaid) or reject
 * (CANCELLED, slot released, reason required so it's traceable). */
export function VerifyPaymentForm({ bookingId, reference, trxId, amount, bkashNumber }: VerifyPaymentFormProps) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReject() {
    setError(null);
    if (reason.trim().length < 3) {
      setError('Enter a reason (why the TRXN did not check out).');
      return;
    }
    setRejecting(true);
    const result = await rejectPaymentAction({ bookingId, reason });
    setRejecting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-(--radius-input) bg-surface-muted p-3 text-body text-text">
        <div className="flex justify-between">
          <span className="text-text-muted">Claimed advance</span>
          <span className="tabular-nums">{formatBDT(amount)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-text-muted">Submitted TRXN ID</span>
          <span className="select-all font-mono tracking-wide">{trxId}</span>
        </div>
      </div>
      <p className="text-caption text-text-muted">
        Check your bKash statement for {bkashNumber || 'the venue number'} for a Received Money entry
        matching this TRXN ID and amount before verifying.
      </p>

      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          trigger={<Button size="sm">Verify &amp; confirm</Button>}
          title="Verify this payment?"
          description={`${reference} will be marked CONFIRMED and ${formatBDT(amount)} recorded as received. Only do this after checking your bKash statement.`}
          confirmLabel="Verify & confirm"
          onConfirm={async () => {
            const result = await verifyPaymentAction({ bookingId });
            router.refresh();
            return result;
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <Label htmlFor="reject-reason">Reject reason</Label>
        <Input
          id="reject-reason"
          placeholder="e.g. TRXN not found in bKash statement"
          className="rounded-(--radius-input)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        ) : null}
        <Button size="sm" variant="destructive" className="w-fit" disabled={rejecting} onClick={handleReject}>
          {rejecting ? 'Rejecting…' : 'Reject & cancel booking'}
        </Button>
      </div>
    </div>
  );
}
