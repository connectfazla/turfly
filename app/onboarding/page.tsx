/**
 * ROUTE: /onboarding — signed-in Clerk users only (middleware enforces).
 *
 * Redeems a registration code into a working business. If the visitor already
 * has one, they are sent to it rather than shown a form that would refuse
 * them.
 */
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Set up your turf', robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const existing = await prisma.tenant.findUnique({
    where: { ownerClerkUserId: userId },
    select: { venues: { select: { id: true }, take: 1, orderBy: { createdAt: 'asc' } } },
  });
  if (existing?.venues[0]) redirect('/admin');

  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-12 sm:py-20">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-accent text-caption font-semibold text-white"
          >
            T
          </span>
          <span className="text-subheading font-semibold tracking-tight text-text">Turfly</span>
        </div>

        <h1 className="mt-8 text-display text-text">Set up your turf</h1>
        <p className="mt-2 text-body text-text-muted">
          This takes a minute. You can change any of it later from your dashboard.
        </p>

        <div className="mt-8 rounded-(--radius-card) border border-border bg-surface p-6">
          <OnboardingForm />
        </div>
      </main>
    </div>
  );
}
