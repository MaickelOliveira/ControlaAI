import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["node-forge"],
  outputFileTracingIncludes: { "/api/nfse/certificate": ["./scripts/nfse-certificate.cjs", "./node_modules/node-forge/**/*"] },
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://www.facebook.com https://graph.facebook.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }, {
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "private, no-store" }],
    }];
  },
};

export default nextConfig;
