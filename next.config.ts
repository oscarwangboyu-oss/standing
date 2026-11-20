import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * The content policy. Everything comes from this site: no third-party script, font, image or
 * connection is allowed, which is what CLAUDE.md promises. Next.js writes inline scripts for
 * hydration, so scripts allow 'unsafe-inline'; a nonce would force every page to render per
 * request. Images allow data: and blob: for the share image, which is drawn on a canvas.
 * Development also needs 'unsafe-eval' for fast refresh, so the policy is set in production only.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Sent with every response. */
const SECURITY_HEADERS = [
  ...(isProduction ? [{ key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY }] : []),
  // An invite address (/i/CODE) never leaves the site in a Referer header.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Standing uses none of these. Interest cohorts are off as well.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
];

const config: NextConfig = {
  // PGlite (the embedded Postgres used locally) ships WASM and must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Type checking runs through `npm run typecheck` so the build does not depend on it.
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  // `npm run dev` also answers on 127.0.0.1: a second origin with its own device storage, handy
  // for looking at the app as a new visitor while localhost holds a record.
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default config;
