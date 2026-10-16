import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy (ENFORCED). Notes:
 *  - script-src needs 'unsafe-inline': Next.js streams inline hydration scripts and the theme bootstrap script is inline. A strict
 *    nonce/hash policy would force dynamic rendering of every public page, so it is a product decision (see docs/DEPLOY.md, "CSP").
 *    Everything else is locked down: no plugins/objects, no <base> hijack, forms only to self, framing only by self, connections only to
 *    self + Supabase, no eval in production.
 *  - img/frame sources allow https: because the CMS stores editor-supplied image / video / map / virtual-tour URLs.
 *  - blob: is needed for generated PDFs / certificates and image previews; data: for inlined icons and fonts.
 */
function csp(): string {
  const d = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: data: https:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? " ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*" : ""}`,
    "frame-src 'self' https: blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ];
  if (!isDev) d.push("upgrade-insecure-requests");
  return d.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera: the QR check-in scanner (admin). Everything else sensitive stays off.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // same-origin-allow-popups keeps window.open() print/preview windows working while isolating the browsing context group
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // document import: native / worker-thread packages must stay outside the server bundle (OCR, legacy .doc, canvas)
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas", "word-extractor", "mammoth", "unpdf", "jszip"],
  // keep OCR language data in serverless traces (only used when IMPORT_OCR is on)
  outputFileTracingIncludes: { "/api/admin/import": ["./node_modules/@tesseract.js-data/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses: never cached, never embedded cross-origin
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "Cross-Origin-Resource-Policy", value: "same-origin" }] },
      // private areas: not indexed, never stored by shared caches
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/school/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
