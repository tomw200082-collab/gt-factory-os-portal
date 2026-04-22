/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------
// Security headers applied to every response.
//
// - Strict-Transport-Security: force HTTPS for 2 years, include subdomains,
//   preload-listable. Safe only if every GT-Factory-OS subdomain is HTTPS.
// - X-Content-Type-Options: block MIME sniffing on uploaded assets.
// - X-Frame-Options: DENY iframes entirely (clickjacking defence).
// - Referrer-Policy: origin-only on cross-origin navigation so the full URL
//   (which may embed IDs) never leaks to third parties.
// - Permissions-Policy: deny camera, microphone, geolocation, payment — the
//   portal doesn't need any of them; closing them blunts opportunistic abuse.
// - Content-Security-Policy-Report-Only: starts in report-only so violations
//   are logged but not blocked. Graduate to enforcing CSP after one clean
//   production day. connect-src whitelists Supabase; script-src includes
//   'unsafe-inline' for Next RSC hydration (tighten to hashes/nonces in a
//   future tranche once the report is clean).
// ---------------------------------------------------------------------------

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
