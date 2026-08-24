'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Ban,
  Users,
  Tag,
  BarChart3,
  UserCog,
  History,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Every staff account (ADMIN or MODERATOR) sees these. */
const STAFF_LINKS: NavLink[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
  { href: '/admin/blackouts', label: 'Blackouts', icon: Ban },
  { href: '/admin/customers', label: 'Customers', icon: Users },
];

/** The four ADMIN-only routes (CLAUDE.md §7) - the layout only renders
 * these when isAdmin is true, but the route itself is the real guard
 * (middleware.ts + each action's requireRole('ADMIN')), not this list. */
const ADMIN_LINKS: NavLink[] = [
  { href: '/admin/pricing', label: 'Pricing', icon: Tag },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: UserCog },
  { href: '/admin/audit', label: 'Audit', icon: History },
];

/** Shared by both the desktop sidebar and the mobile top nav - `vertical`
 * switches between a stacked icon+label list (sidebar) and a horizontal
 * icon-only-on-narrow scroller (mobile), same link set and active-state
 * logic either way. Split out as a Client Component because active-link
 * highlighting needs the current pathname (usePathname()), which isn't
 * available in the Server Component layout around it. */
export function SidebarNav({ isAdmin, vertical }: { isAdmin: boolean; vertical: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...STAFF_LINKS, ...ADMIN_LINKS] : STAFF_LINKS;

  return (
    <nav className={cn('flex gap-1', vertical ? 'flex-col' : 'flex-row overflow-x-auto')}>
      {links.map((link) => {
        // '/admin' would otherwise match every /admin/* route as a prefix.
        const isActive = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-3 rounded-(--radius-input) px-3 py-2 text-body transition-colors',
              isActive ? 'bg-accent-soft text-accent font-medium' : 'text-text-muted hover:bg-surface-muted hover:text-text',
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className={vertical ? undefined : 'text-caption'}>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
