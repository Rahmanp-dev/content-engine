import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['googleapis', 'playwright', 'mongoose', 'puppeteer-extra-plugin-stealth', 'playwright-extra'],
};

export default nextConfig;
