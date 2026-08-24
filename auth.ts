import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loginSchema } from '@/lib/schemas/auth';
import { clientIpFromHeaders, isRateLimited } from '@/lib/auth/rate-limit';

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours — CLAUDE.md §5

/**
 * Auth.js v5, credentials provider, JWT session strategy (CLAUDE.md §3) —
 * no database adapter, since JWT sessions don't need Account/Session
 * tables. The cookie itself is HttpOnly + SameSite=Lax by default, and
 * Secure whenever served over https (Auth.js decides this from AUTH_URL /
 * request protocol) — nothing to hand-configure there.
 *
 * middleware.ts is the first gate on /admin/*, but it is not
 * authorization by itself — every staff Server Action re-checks the role
 * via lib/auth/require-role.ts (CLAUDE.md §7).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const ip = clientIpFromHeaders(request.headers);
        if (await isRateLimited(`login:${ip}`)) {
          throw new Error('RATE_LIMITED');
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      // The `JWT` interface augmentation in types/next-auth.d.ts doesn't
      // reliably merge here (pnpm hoists @auth/core to more than one
      // location), so these two fields are asserted rather than inferred.
      // They are always set together in the jwt() callback above.
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
