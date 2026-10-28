/** @type {import('next').NextConfig} */
const nextConfig = {
  // Arena's dev preview is served from https://{port}-{sandboxId}.e2b.app.
  // Permit that preview origin to load Next's HMR/dev assets.
  allowedDevOrigins: ["*.e2b.app"],
  async rewrites() {
    return [{ source: '/radio', destination: '/radio.html' }];
  },
};

module.exports = nextConfig;
