import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BookingStatus } from '@prisma/client';

const LABEL: Record<BookingStatus, string> = {
  HELD: 'Held',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  NO_SHOW: 'No-show',
};

const CLASS: Record<BookingStatus, string> = {
  HELD: 'border-warning/30 bg-surface-muted text-warning',
  CONFIRMED: 'border-accent/30 bg-accent-soft text-accent',
  COMPLETED: 'border-border bg-surface-muted text-text',
  CANCELLED: 'border-border bg-surface-muted text-text-muted',
  EXPIRED: 'border-border bg-surface-muted text-text-muted',
  NO_SHOW: 'border-danger/30 bg-surface-muted text-danger',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge variant="outline" className={cn('rounded-(--radius-input)', CLASS[status])}>
      {LABEL[status]}
    </Badge>
  );
}
