'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { CheckInButton } from '@/components/admin/check-in-button';
import { cancelBookingStaffAction, markNoShowAction } from '@/app/actions/admin-bookings';
import type { BookingStatus } from '@prisma/client';

export interface BookingActionsProps {
  bookingId: string;
  reference: string;
  status: BookingStatus;
  checkedInAt: string | null;
  slotHasStarted: boolean;
}

/** Every destructive action here restates the affected booking's
 * reference in the ConfirmDialog (BUILD_PLAN.md step 6). */
export function BookingActions({ bookingId, reference, status, checkedInAt, slotHasStarted }: BookingActionsProps) {
  const router = useRouter();

  if (status !== 'CONFIRMED') return null;

  return (
    <div className="flex flex-wrap gap-2">
      {!checkedInAt && slotHasStarted ? <CheckInButton bookingId={bookingId} /> : null}

      {slotHasStarted ? (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline">
              Mark no-show
            </Button>
          }
          title="Mark as no-show?"
          description={`${reference} will be marked as a no-show. This counts against the customer's record.`}
          confirmLabel="Mark no-show"
          destructive
          onConfirm={async () => {
            const result = await markNoShowAction({ bookingId });
            router.refresh();
            return result;
          }}
        />
      ) : null}

      <ConfirmDialog
        trigger={
          <Button size="sm" variant="destructive">
            Cancel booking
          </Button>
        }
        title="Cancel this booking?"
        description={`${reference} will be cancelled immediately. This can't be undone.`}
        confirmLabel="Cancel booking"
        destructive
        onConfirm={async () => {
          const result = await cancelBookingStaffAction({ bookingId });
          router.refresh();
          return result;
        }}
      />
    </div>
  );
}
