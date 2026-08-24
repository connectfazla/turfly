import type { NextConfig } from "next";
import path from "node:path";

/**
 * Security headers applied to every response. Next.js doesn't set any of
 * these by default. `Content-Security-Policy` is deliberately not on this
 * list — a CSP tight enough to matter would need per-directive auditing of
 * every third-party script this app ever loads (Resend/React Email render
 * server-side only, so there aren't any today, but a hand-wavy CSP is
 * worse than no CSP) - add one deliberately if/when the app grows a client
 * script that needs it.
 */
const securityHeaders = [
  // Refuses to let this app be framed by another origin - the admin panel
  // authenticates by cookie, so clickjacking is the relevant risk, not XSS
  // via iframe sandboxing.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops browsers from MIME-sniffing a response into executing as
  // something other than its declared Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never leak the full referring URL (which can carry a booking
  // reference or reset token in the query string) to a third-party site
  // linked from this app.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Forces HTTPS for a year, including subdomains, once a browser has
  // seen this once. Vercel already redirects http->https, this closes the
  // gap for the very first request and any embedded absolute http link.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // No geolocation/camera/microphone/payment-API access - this app never
  // asks for any of it.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Don't advertise "X-Powered-By: Next.js" - no functional benefit to a
  // would-be attacker knowing the framework for free.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
