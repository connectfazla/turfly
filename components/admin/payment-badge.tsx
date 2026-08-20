import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PaymentStatus } from '@prisma/client';

const LABEL: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

const CLASS: Record<PaymentStatus, string> = {
  PAID: 'border-accent/30 bg-accent-soft text-accent',
  PARTIAL: 'border-warning/30 bg-surface-muted text-warning',
  REFUNDED: 'border-border bg-surface-muted text-text-muted',
  UNPAID: 'border-danger/30 bg-surface-muted text-danger',
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={cn('rounded-(--radius-input)', CLASS[status])}>
      {LABEL[status]}
    </Badge>
  );
}
