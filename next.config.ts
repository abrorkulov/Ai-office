import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // Next встраивает служебные скрипты в страницу; внешние скрипты запрещены полностью
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' blob: data:${dev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

const security = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // только для next dev: показать проект с телефона или ноутбука в той же сети Wi-Fi
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // SQL-миграции читаются с диска — кладём их в серверный бандл.
  outputFileTracingIncludes: { "/api/**/*": ["./drizzle/**/*"] },
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  async headers() {
    return [
      { source: "/:path*", headers: security },
      { source: "/office/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
};

export default nextConfig;
