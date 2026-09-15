import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep build and pipeline inputs out of the deployed server functions. The
  // development-only label-read fixture (src/lib/label-scan/fixture.ts) reads a
  // path built from process.cwd(), so file tracing packed the whole project into
  // every function: ~51 MB per deployment, mostly the wine-map GeoJSON sources
  // and the docs, which filled Vercel's function storage (2026-09-15). Nothing at
  // runtime reads these folders; the map serves PMTiles from Storage.
  outputFileTracingExcludes: {
    "*": [
      "data/**",
      "docs/**",
      "scripts/**",
      "supabase/**",
      ".superpowers/**",
      ".claude/**",
      ".tiles-build/**",
      "design_handoff*/**",
      "src/**/__fixtures__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
  },
  // /cellar was a temporary P3 alias for /catalog; the Cellar inventory pillar
  // (P6) reclaims /cellar for real content, so those redirects are removed.
  // /dashboard became the Taste pillar (P4). 307 (permanent: false) so old
  // links/bookmarks resolve.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/taste", permanent: false },
      { source: "/dashboard/:path*", destination: "/taste/:path*", permanent: false },
      // People & Friends became the Community pillar (P6).
      { source: "/people", destination: "/community", permanent: false },
      { source: "/people/:path*", destination: "/community/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
