/**
 * ROUTE: /admin/users — ADMIN-only.
 *
 * Create staff accounts, enable/disable them, and change role between
 * ADMIN and MODERATOR. Every control here guards against an admin
 * locking themselves out (disabling or demoting their own account is
 * refused - see app/actions/users.ts).
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreateUserForm } from '@/components/admin/create-user-form';
import { UserRowControls } from '@/components/admin/user-row-controls';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await auth();
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Users</h1>
        <p className="mt-1 text-body text-text-muted">Staff accounts: counter staff and owners.</p>
      </div>

      <CreateUserForm />

      <div className="overflow-x-auto rounded-(--radius-card) border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Role / status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  {u.name}
                  {u.id === session?.user.id ? <span className="ml-2 text-caption text-text-muted">(you)</span> : null}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell className="text-caption text-text-muted">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-GB') : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  <UserRowControls
                    userId={u.id}
                    userName={u.name}
                    role={u.role}
                    isActive={u.isActive}
                    isSelf={u.id === session?.user.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
