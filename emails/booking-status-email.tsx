import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';

/**
 * One shared template for confirmed/cancelled/rescheduled — the three
 * status emails only differ in heading, intro line and accent colour, so
 * a single component keeps the nine-colour palette (CLAUDE.md §6) in one
 * place instead of duplicated across three files.
 */
export interface BookingStatusEmailProps {
  heading: string;
  intro: string;
  reference: string;
  dateLabel: string;
  timeLabel: string;
  priceLabel: string;
  accentHex: string; // '#15803D' confirmed, '#B91C1C' cancelled, '#B45309' rescheduled
  footerNote?: string;
}

export default function BookingStatusEmail({
  heading,
  intro,
  reference,
  dateLabel,
  timeLabel,
  priceLabel,
  accentHex,
  footerNote,
}: BookingStatusEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{heading} — {reference}</Preview>
      <Body style={{ backgroundColor: '#F9FAFB', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <Container
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            margin: '40px auto',
            padding: 24,
            maxWidth: 480,
          }}
        >
          <Heading style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: '0 0 8px' }}>{heading}</Heading>
          <Text style={{ fontSize: 14, color: '#6B7280', margin: '0 0 20px' }}>{intro}</Text>

          <Section
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 8,
              padding: 16,
              borderLeft: `4px solid ${accentHex}`,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>{reference}</Text>
            <Text style={{ fontSize: 14, color: '#111827', margin: 0 }}>{dateLabel}</Text>
            <Text style={{ fontSize: 14, color: '#111827', margin: 0 }}>{timeLabel}</Text>
            <Text style={{ fontSize: 14, color: '#111827', margin: 0 }}>{priceLabel}</Text>
          </Section>

          <Hr style={{ borderColor: '#E5E7EB', margin: '20px 0' }} />
          <Text style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
            {footerNote ?? 'Ortha Turf. One field, open 24 hours.'}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
