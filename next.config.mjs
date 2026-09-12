/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the sandbox preview host when running `next dev` behind a proxy.
  allowedDevOrigins: ['*.e2b.app', 'localhost'],
};

export default nextConfig;
