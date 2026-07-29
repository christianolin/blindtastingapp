import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared wine catalog moved from /cellar to /catalog when Catalog became
  // its own pillar (P3). These temporary redirects preserve old links; /cellar
  // is later reclaimed by the personal Cellar pillar (bottles you own), so they
  // are 307s (permanent: false), not permanent.
  async redirects() {
    return [
      { source: "/cellar", destination: "/catalog", permanent: false },
      { source: "/cellar/:path*", destination: "/catalog/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
