import type { NextConfig } from 'next';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This app lives inside another repository; keep Next.js scoped to this folder.
  turbopack: { root },
  outputFileTracingRoot: root,
  // Earlier screens were folded into the workspace, Changes and Settings.
  async redirects() {
    return [
      { source: '/write', destination: '/', permanent: false },
      { source: '/review', destination: '/', permanent: false },
      { source: '/review/:id', destination: '/changes', permanent: false },
      { source: '/handover', destination: '/changes', permanent: false },
      { source: '/connection', destination: '/settings', permanent: false },
    ];
  },
};

export default nextConfig;
