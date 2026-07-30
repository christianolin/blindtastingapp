import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /cellar was a temporary P3 alias for /catalog; the Cellar inventory pillar
  // (P6) reclaims /cellar for real content, so those redirects are removed.
  // /dashboard became the Taste pillar (P4). 307 (permanent: false) so old
  // links/bookmarks resolve.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/taste", permanent: false },
      { source: "/dashboard/:path*", destination: "/taste/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
