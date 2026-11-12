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
};

module.exports = nextConfig;
