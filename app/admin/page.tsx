import { auth } from '@/auth';

interface Props {
  searchParams: Promise<{ forbidden?: string }>;
}

export default async function AdminDashboardPage({ searchParams }: Props) {
  const { forbidden } = await searchParams;
  const session = await auth();

  return (
    <div>
      {forbidden ? (
        <div className="mb-6 rounded-(--radius-card) border border-danger/30 bg-surface-muted px-4 py-3 text-body text-danger">
          You don&apos;t have permission to view that page.
        </div>
      ) : null}
      <h1 className="text-display text-text">Dashboard</h1>
      <p className="mt-1 text-body text-text-muted">
        Signed in as {session?.user.email} ({session?.user.role})
      </p>
      <p className="mt-4 text-body text-text-muted">
        The full day timeline lands in BUILD_PLAN.md step 6.
      </p>
    </div>
  );
}
