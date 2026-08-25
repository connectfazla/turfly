/**
 * ROUTE: / (home) — public, no login. The PRODUCT marketing site.
 *
 * Audience: turf owners, not players. Turfly is sold to the people who run
 * the pitch; players reach their own venue's booking pages, which live on
 * that venue's subdomain. This page used to be a booking page for the single
 * pre-SaaS venue — that framing stopped being right the moment the product
 * grew tenants and registration codes. A small "Players" path is kept in the
 * footer and in the hero for anyone who lands here by mistake.
 *
 * Static by design: nothing here reads the database, so it prerenders and
 * stays fast. (The old version was force-dynamic only to print one venue's
 * name.) That matters for SEO as much as for speed.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarCheck, ShieldCheck, Wallet, Users2, ClipboardList, TrendingUp } from 'lucide-react';
import { MarketingHeader } from '@/components/marketing/marketing-header';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow } from '@/components/marketing/eyebrow';
import { PillButton } from '@/components/marketing/pill-button';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://turfly.app';
const TITLE = 'Turfly — turf booking software for Bangladesh';
const DESCRIPTION =
  'Booking software for turf owners in Bangladesh. Take bookings online and at the counter, verify bKash deposits, control what each staff member can see, and know what every slot earned.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'turf booking software',
    'football turf management',
    'turf booking system Bangladesh',
    'sports venue booking software',
    'bKash booking payments',
    'pitch booking software Dhaka',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Turfly',
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
    images: [{ url: '/images/hero-pitch.jpg', width: 1200, height: 630, alt: 'A floodlit synthetic turf pitch' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/images/hero-pitch.jpg'],
  },
  robots: { index: true, follow: true },
};

/**
 * Structured data. Two graphs: the software product itself, and the FAQ
 * below — both are things Google renders enhanced results for, and both
 * describe content that genuinely appears on this page. Marking up content
 * that isn't visible is a guidelines violation, so every answer here is the
 * same text rendered in the FAQ section.
 */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Turfly',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: DESCRIPTION,
      url: SITE_URL,
      areaServed: { '@type': 'Country', name: 'Bangladesh' },
      // No aggregateRating and no offers: inventing review counts or prices
      // to win a rich snippet is exactly the kind of markup that earns a
      // manual action. Added back when there is something real to state.
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How do players pay for a booking?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Players send a deposit — a percentage of the slot price that you set — over bKash or Nagad, then enter the transaction number. Your staff check it against your bKash statement and confirm. Turfly does not touch the money.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can two people book the same slot at once?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. A slot can hold exactly one live booking, enforced by the database rather than by application code, so two people tapping the same slot at the same moment cannot both succeed.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I stop counter staff from seeing revenue?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Staff on the Bookie role can take bookings and check players in but cannot open reports, record payments, or see what anything earned. Managers can handle money; only you can change pricing.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do I get an account?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Turfly is invite-only. Request an invite and we send a registration code; that code creates your business and your first venue.',
          },
        },
      ],
    },
  ],
};

const FEATURES = [
  {
    icon: CalendarCheck,
    title: 'One diary, both counters',
    body: 'Online bookings and walk-ins land in the same day view. Your staff stop keeping a paper register that disagrees with the website.',
  },
  {
    icon: Wallet,
    title: 'bKash deposits, verified by you',
    body: 'A player sends the deposit and enters the TRXN. Staff check it against your statement and confirm. Unverified claims release the slot automatically instead of sitting on it.',
  },
  {
    icon: Users2,
    title: 'Staff who cannot see your money',
    body: 'Bookies take bookings and check players in — no reports, no payments, no revenue. Managers handle money. Only you touch pricing.',
  },
  {
    icon: ShieldCheck,
    title: 'The same slot cannot sell twice',
    body: 'One live booking per slot is enforced by the database, not by hopeful code. Two players tapping at the same instant cannot both get it.',
  },
  {
    icon: TrendingUp,
    title: 'What the pitch actually earned',
    body: 'Revenue by day, week or month, and which slots sit empty. Price weekday afternoons differently from Friday night, because they are not the same product.',
  },
  {
    icon: ClipboardList,
    title: 'Every change is on the record',
    body: 'Who cancelled, who rescheduled, who confirmed a payment, and when. When a player argues about a refund, you have the answer.',
  },
];

/** Product facts, not invented metrics. A landing page that opens with
 * "97% satisfaction" nobody measured is the fastest way to lose a buyer who
 * checks. Every number here is something the software actually does. */
const STATS = [
  { value: '16', label: 'bookable slots a day' },
  { value: '90', label: 'minutes per slot' },
  { value: '24/7', label: 'the pitch can take bookings' },
];

const STEPS = [
  {
    n: '001',
    title: 'Get a registration code',
    body: 'Turfly is invite-only, so every business on it is one we have spoken to. Request an invite and we send you a code.',
  },
  {
    n: '002',
    title: 'Set up your turf',
    body: 'Name, contact number, your bKash wallet, your deposit percentage, and a price grid you can edit per day and per time of day.',
  },
  {
    n: '003',
    title: 'Take bookings the same day',
    body: 'Share your booking link. Bookings arrive online and at the counter, and your staff work the day view from a tablet.',
  },
];

const FAQS = JSON_LD['@graph'][1]!.mainEntity!;

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {/* Structured data — see JSON_LD's comment. Safe: a constant we author,
       * serialised with JSON.stringify, never user input. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <MarketingHeader />

      <main className="flex-1">
        {/* ---------------------------------------------------------- hero
          * Full-bleed photograph with the copy laid over it, per the
          * reference. The scrim is doing real work, not decoration: white
          * body text over a raw photo fails WCAG the moment the image
          * changes. A left-weighted gradient plus a flat tint keeps the text
          * column above 7:1 while the right side of the photo stays legible.
          * CLAUDE.md §6 has no scrim token because the app never puts text on
          * imagery — this is the marketing surface's own rule. */}
        <section className="px-3 pt-3 sm:px-4">
          <div className="relative isolate overflow-hidden rounded-(--radius-marketing) bg-text">
            <Image
              src="/images/hero-pitch.jpg"
              alt=""
              aria-hidden="true"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-r from-[#0b2a18]/95 via-[#0b2a18]/75 to-[#0b2a18]/35"
            />

            <div className="relative mx-auto flex max-w-[1120px] flex-col items-start gap-6 px-6 py-20 sm:px-10 sm:py-28 lg:py-36">
              <Eyebrow tone="dark">Invite-only · built in Dhaka</Eyebrow>

              <h1 className="max-w-[20ch] text-display text-balance text-white sm:text-hero lg:text-[56px] lg:leading-[58px] lg:tracking-[-0.025em]">
                Run your turf like a business, not a notebook.
              </h1>

              <p className="max-w-[54ch] text-body leading-relaxed text-white/85 sm:text-[15px] sm:leading-[24px]">
                Turfly is booking software for turf owners in Bangladesh. Take bookings online and at the counter,
                verify bKash deposits, decide what each staff member can see, and know what every slot earned.
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-3">
                <PillButton href="/sign-up" variant="light">
                  Start with your code
                </PillButton>
                <PillButton href="#how-it-works" variant="solid">
                  How it works
                </PillButton>
              </div>

              {/* Product facts as social proof, since there are no customer
                * numbers worth quoting yet and inventing them is not an
                * option. */}
              <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/20 pt-6">
                {STATS.map((stat) => (
                  <div key={stat.label} className="flex flex-col">
                    <dt className="sr-only">{stat.label}</dt>
                    <dd className="text-display tabular-nums text-white">{stat.value}</dd>
                    <dd className="text-caption text-white/70">{stat.label}</dd>
                  </div>
                ))}
              </dl>

              <p className="text-caption text-white/70">
                <Link href="/demo" className="text-white underline underline-offset-4 hover:no-underline">
                  Try the live demo
                </Link>{' '}
                — no signup, real dashboard, sample data.
              </p>

              <p className="text-caption text-white/70">
                Looking to book a pitch to play on?{' '}
                <Link href="/book" className="text-white underline underline-offset-4 hover:no-underline">
                  Find a slot
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ features */}
        <section id="features" aria-labelledby="features-heading" className="mx-auto max-w-[1120px] px-4 py-20 sm:py-28">
          <div className="flex flex-col items-center gap-4 text-center">
            <Eyebrow>What you get</Eyebrow>
            <h2 id="features-heading" className="max-w-[22ch] text-display text-balance text-text">
              Everything the counter actually needs
            </h2>
            <p className="max-w-[58ch] text-body text-text-muted">
              Not a generic calendar with a football icon. These are the things that go wrong when a turf runs on
              WhatsApp and a paper register.
            </p>
          </div>

          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="flex flex-col gap-3 rounded-(--radius-marketing-sm) border border-border bg-surface-muted p-6 transition-colors hover:bg-accent-soft/30"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-surface text-accent">
                  <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
                </span>
                <h3 className="text-subheading text-text">{title}</h3>
                <p className="text-caption leading-relaxed text-text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* -------------------------------------------------- how it works */}
        <section id="how-it-works" aria-labelledby="how-heading" className="border-y border-border bg-surface-muted">
          <div className="mx-auto max-w-[1120px] px-4 py-20 sm:py-28">
            <div className="flex flex-col items-center gap-4 text-center">
              <Eyebrow>Getting started</Eyebrow>
              <h2 id="how-heading" className="max-w-[20ch] text-display text-balance text-text">
                Three steps to your first booking
              </h2>
            </div>

            <ol className="mt-12 grid gap-4 sm:grid-cols-3">
              {STEPS.map((step) => (
                <li
                  key={step.n}
                  className="flex flex-col gap-2 rounded-(--radius-marketing-sm) border border-border bg-surface p-6"
                >
                  <span className="font-mono text-caption tabular-nums text-accent">/{step.n}</span>
                  <h3 className="text-subheading text-text">{step.title}</h3>
                  <p className="text-caption leading-relaxed text-text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------ faq */}
        <section aria-labelledby="faq-heading" className="mx-auto max-w-[1120px] px-4 py-20 sm:py-28">
          <div className="flex flex-col items-center gap-4 text-center">
            <Eyebrow>Questions</Eyebrow>
            <h2 id="faq-heading" className="max-w-[20ch] text-display text-balance text-text">
              What owners ask before signing up
            </h2>
          </div>

          {/* A plain definition list, not an accordion: four short answers
            * hidden behind clicks is worse for a reader and worse for a
            * crawler than four short answers on the page. */}
          <dl className="mx-auto mt-12 grid max-w-[900px] gap-4 sm:grid-cols-2">
            {FAQS.map((faq) => (
              <div
                key={faq.name}
                className="flex flex-col gap-2 rounded-(--radius-marketing-sm) border border-border bg-surface-muted p-6"
              >
                <dt className="text-subheading text-text">{faq.name}</dt>
                <dd className="text-caption leading-relaxed text-text-muted">{faq.acceptedAnswer.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ------------------------------------------------------------ cta */}
        <section aria-labelledby="cta-heading" className="px-3 pb-3 sm:px-4">
          <div className="relative isolate overflow-hidden rounded-(--radius-marketing) bg-text">
            <Image src="/images/hero-pitch.jpg" alt="" aria-hidden="true" fill sizes="100vw" className="object-cover" />
            <div aria-hidden="true" className="absolute inset-0 bg-[#0b2a18]/85" />
            <div className="relative mx-auto flex max-w-[1120px] flex-col items-center gap-5 px-6 py-20 text-center sm:py-24">
              <Eyebrow tone="dark">Invite-only</Eyebrow>
              <h2 id="cta-heading" className="max-w-[20ch] text-display text-balance text-white">
                Ready to stop running the pitch from a notebook?
              </h2>
              <p className="max-w-[54ch] text-body text-white/80">
                Tell us about your turf and we will send a registration code. One code sets up your business and your
                first venue.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <PillButton href="/sign-up" variant="light">
                  Start with your code
                </PillButton>
                <PillButton href="mailto:hello@turfly.app?subject=Turfly%20invite%20request" variant="solid">
                  Request an invite
                </PillButton>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
