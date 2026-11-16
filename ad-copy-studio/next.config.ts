import type { NextConfig } from 'next';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This app lives inside another repository; keep Next.js scoped to this folder.
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
