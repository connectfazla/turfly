/**
 * Placeholder notification hooks. The real Notifier interface — Resend,
 * Console (dev), Noop (NOTIFICATIONS_ENABLED=false) — is built in
 * BUILD_PLAN.md step 7. Server Actions already call these functions so
 * that call sites won't need to change when that lands; for now they are
 * no-ops. Deliberately fire-and-forget from the caller: a notification
 * failure must never affect a booking that has already committed
 * (CLAUDE.md §4).
 */
export async function notifyBookingConfirmed(_bookingId: string): Promise<void> {
  // no-op until step 7
}

export async function notifyBookingCancelled(_bookingId: string): Promise<void> {
  // no-op until step 7
}

export async function notifyBookingRescheduled(_bookingId: string): Promise<void> {
  // no-op until step 7
}
