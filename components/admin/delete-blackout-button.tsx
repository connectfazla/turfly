'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { deleteBlackoutAction } from '@/app/actions/blackouts';

export function DeleteBlackoutButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline">
          Remove
        </Button>
      }
      title="Remove this blackout?"
      description={`${label} will become bookable again immediately.`}
      confirmLabel="Remove"
      destructive
      onConfirm={async () => {
        const result = await deleteBlackoutAction({ id });
        router.refresh();
        return result;
      }}
    />
  );
}
