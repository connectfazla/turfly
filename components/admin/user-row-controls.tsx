'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { changeUserRoleAction, setUserActiveAction } from '@/app/actions/users';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Role } from '@prisma/client';

export function UserRowControls({
  userId,
  userName,
  role,
  isActive,
  isSelf,
}: {
  userId: string;
  userName: string;
  role: Role;
  isActive: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleActiveChange(next: boolean) {
    setError(null);
    const result = await setUserActiveAction({ userId, isActive: next });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleRoleChange(next: string) {
    setError(null);
    const result = await changeUserRoleAction({ userId, role: next as Role });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <Select value={role} onValueChange={handleRoleChange} disabled={isSelf}>
          <SelectTrigger className="w-32 rounded-(--radius-input)" aria-label={`Role for ${userName}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MODERATOR">Moderator</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            checked={isActive}
            onCheckedChange={handleActiveChange}
            disabled={isSelf && isActive}
            aria-label={`${isActive ? 'Disable' : 'Enable'} ${userName}`}
          />
          <span className="text-caption text-text-muted">{isActive ? 'Active' : 'Disabled'}</span>
        </div>
      </div>
      {error ? <span className="text-caption text-danger">{error}</span> : null}
    </div>
  );
}
