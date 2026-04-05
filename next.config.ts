import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['googleapis', 'playwright', 'mongoose'],
};

export default nextConfig;
