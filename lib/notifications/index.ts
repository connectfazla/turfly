import { ConsoleNotifier } from './console-notifier';
import { NoopNotifier } from './noop-notifier';
import { ResendNotifier } from './resend-notifier';
import type { Notifier } from './types';

export type { BookingNotificationPayload, Notifier, RescheduledNotificationPayload } from './types';

let cached: Notifier | null = null;

/** NOTIFICATIONS_ENABLED=false -> Noop. Otherwise Console in dev, Resend in
 * production (BUILD_PLAN.md step 7). */
export function getNotifier(): Notifier {
  if (cached) return cached;

  if (process.env.NOTIFICATIONS_ENABLED === 'false') {
    cached = new NoopNotifier();
  } else if (process.env.NODE_ENV === 'production' && process.env.RESEND_API_KEY) {
    cached = new ResendNotifier(process.env.RESEND_API_KEY);
  } else {
    cached = new ConsoleNotifier();
  }

  return cached;
}
