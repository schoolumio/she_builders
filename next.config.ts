import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function origin(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

const livekit = origin(process.env.LIVEKIT_URL);
const livekitHttps = livekit.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
const publicAssets = origin(process.env.STORAGE_PUBLIC_BASE_URL);

// Next.js injects small inline bootstrap scripts, so 'unsafe-inline' is required for scripts
// unless nonce-based CSP is adopted (which forces dynamic rendering of every page).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${publicAssets}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${livekit} ${livekitHttps} ${livekit ? "wss://*.livekit.cloud https://*.livekit.cloud" : ""}`.trim(),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.paystack.com https://checkout.stripe.com https://connect.stripe.com",
  "object-src 'none'",
]
  .join("; ")
  .replace(/\s+/g, " ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client"],
  // Image uploads (logos, covers, campaign images) are up to 2 MB plus multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera and microphone are only requested inside meeting rooms on our own origin.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()" },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
