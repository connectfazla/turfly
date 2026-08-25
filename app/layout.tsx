import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://turfly.xyz';

/**
 * Site-wide defaults. Individual pages override `title` and `description`;
 * the template means a page setting `title: 'Rules'` renders as
 * "Rules — Turfly" without every page having to repeat the brand.
 *
 * metadataBase is what turns the relative image paths in each page's
 * openGraph block into the absolute URLs the crawlers require.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Turfly — turf booking software for Bangladesh',
    template: '%s — Turfly',
  },
  description:
    'Booking software for turf owners in Bangladesh. Take bookings online and at the counter, verify bKash deposits, and know what every slot earned.',
  applicationName: 'Turfly',
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
