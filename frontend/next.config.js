// The browser only ever talks to this server. /api requests are forwarded to the backend, so the
// same image works anywhere without baking in a public API address. The destination is fixed at
// build time; `backend:4000` resolves in both docker compose and Kubernetes.
const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Production builds use webpack (`next build --webpack` in package.json) because Turbopack
  // peaked at ~1.9 GB, which gets OOM-killed on the 2 GB CI machine. With these settings the
  // build peaks at ~550 MB.
  experimental: {
    webpackMemoryOptimizations: true,
    // Next starts one page-generation worker per CPU, each a separate Node process.
    cpus: 1,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

module.exports = nextConfig;
