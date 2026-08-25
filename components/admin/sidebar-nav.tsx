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
  History,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StaffRole } from '@/lib/auth/constants';

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Who may see this link. Cosmetic only — each route enforces its own
   * access with requireRole(). If the two ever disagree, the route wins and
   * the nav is the bug. */
  roles: readonly StaffRole[];
}

const ALL: readonly StaffRole[] = ['OWNER', 'MANAGER', 'BOOKIE'];
const MONEY: readonly StaffRole[] = ['OWNER', 'MANAGER'];
const OWNER_ONLY: readonly StaffRole[] = ['OWNER'];

/** Everyone who can work the counter. */
const STAFF_LINKS: NavLink[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
  { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays, roles: ALL },
  { href: '/admin/bookings', label: 'Bookings', icon: ClipboardList, roles: ALL },
  { href: '/admin/blackouts', label: 'Blackouts', icon: Ban, roles: ALL },
  { href: '/admin/customers', label: 'Customers', icon: Users, roles: MONEY },
];

/** Money and administration. A Bookie sees none of it — that restriction is
 * the whole point of the role, so it must hold in the nav as well as in the
 * routes, or the product promise ("staff who cannot see your revenue") is
 * only half true. */
const ADMIN_LINKS: NavLink[] = [
  { href: '/admin/pricing', label: 'Pricing', icon: Tag, roles: OWNER_ONLY },
  { href: '/admin/staff', label: 'Staff', icon: UserCog, roles: OWNER_ONLY },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, roles: MONEY },
  { href: '/admin/audit', label: 'Audit', icon: History, roles: MONEY },
];

function isLinkActive(pathname: string, href: string): boolean {
  // '/admin' would otherwise match every /admin/* route as a prefix.
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

function NavLinkItem({ link, active, vertical }: { link: NavLink; active: boolean; vertical: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex shrink-0 items-center gap-2.5 rounded-(--radius-input) px-2.5 py-1.5 text-body transition-colors',
        active ? 'bg-accent-soft/60 font-medium text-accent' : 'text-text-muted hover:bg-surface-muted hover:text-text',
      )}
    >
      {/* A thin left accent bar reads as "current page" without the
       * heavier full-pill treatment - CLAUDE.md's "state is never colour-
       * only" is still satisfied by aria-current + font-weight. */}
      {vertical ? (
        <span
          className={cn(
            'absolute -left-3 h-4 w-0.5 rounded-full bg-accent transition-opacity',
            active ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden="true"
        />
      ) : null}
      <Icon className="size-[18px] shrink-0" aria-hidden="true" strokeWidth={2} />
      <span className={vertical ? undefined : 'text-caption'}>{link.label}</span>
    </Link>
  );
}

/** Shared by both the desktop sidebar and the mobile top nav - `vertical`
 * switches between a stacked icon+label list (sidebar) and a horizontal
 * icon-only-on-narrow scroller (mobile), same link set and active-state
 * logic either way. Split out as a Client Component because active-link
 * highlighting needs the current pathname (usePathname()), which isn't
 * available in the Server Component layout around it. */
export function SidebarNav({ role, vertical }: { role: StaffRole; vertical: boolean }) {
  const pathname = usePathname();
  const staffLinks = STAFF_LINKS.filter((l) => l.roles.includes(role));
  const adminLinks = ADMIN_LINKS.filter((l) => l.roles.includes(role));

  // Grouped into two sections only for the vertical sidebar, and only when
  // there is a second group to show - the horizontal mobile scroller stays
  // one flat row, a group header would just eat space with nothing to say.
  if (vertical && adminLinks.length > 0) {
    return (
      <nav className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5 pl-3">
          {staffLinks.map((link) => (
            <NavLinkItem key={link.href} link={link} active={isLinkActive(pathname, link.href)} vertical />
          ))}
        </div>
        <div>
          {/* Full-opacity text-text-muted, not /80 — the faded version measured
            * 3.29:1 against the white sidebar (axe: color-contrast), under
            * WCAG AA's 4.5:1 floor for 12px text. Found by
            * e2e/accessibility-admin.spec.ts, present on every /admin route
            * since this label is in the shared layout. */}
          <p className="px-2.5 pb-1 pl-[26px] text-caption font-medium tracking-wide text-text-muted uppercase">
            Manage
          </p>
          <div className="flex flex-col gap-0.5 pl-3">
            {adminLinks.map((link) => (
              <NavLinkItem key={link.href} link={link} active={isLinkActive(pathname, link.href)} vertical />
            ))}
          </div>
        </div>
      </nav>
    );
  }

  const links = [...staffLinks, ...adminLinks];
  return (
    <nav className={cn('flex gap-1', vertical ? 'flex-col gap-0.5 pl-3' : 'flex-row overflow-x-auto')}>
      {links.map((link) => (
        <NavLinkItem key={link.href} link={link} active={isLinkActive(pathname, link.href)} vertical={vertical} />
      ))}
    </nav>
  );
}
