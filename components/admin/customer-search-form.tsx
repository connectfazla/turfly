'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function CustomerSearchForm({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();

  return (
    <form
      action={(formData) => {
        const q = String(formData.get('q') ?? '').trim();
        router.push(q ? `/admin/customers?q=${encodeURIComponent(q)}` : '/admin/customers');
      }}
      className="flex items-end gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customerQ">Search by name or phone</Label>
        <Input id="customerQ" name="q" defaultValue={defaultValue} className="w-64 rounded-(--radius-input)" />
      </div>
      <Button type="submit">Search</Button>
    </form>
  );
}
