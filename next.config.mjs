/** @type {import('next').NextConfig} */
const nextConfig = {
  // ioredis is a Node library: keep it out of the bundler.
  serverExternalPackages: ['ioredis'],

  // The dev server is reachable through a proxied preview host (e.g.
  // https://3000-<sandbox>.e2b.app) as well as localhost, so allow those
  // origins to load dev assets.
  allowedDevOrigins: ['localhost', '127.0.0.1', '*.e2b.app', '*.e2b.dev', '*.arena.ai'],
};

export default nextConfig;
