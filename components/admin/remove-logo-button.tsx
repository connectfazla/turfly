'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { removeVenueLogoAction } from '@/app/actions/venue-branding';

export function RemoveLogoButton() {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline">
          Remove logo
        </Button>
      }
      title="Remove your logo?"
      description="Your booking page will show your venue name only, the same as before you added one."
      confirmLabel="Remove"
      destructive
      onConfirm={async () => {
        const result = await removeVenueLogoAction();
        router.refresh();
        return result;
      }}
    />
  );
}
