import type { NextConfig } from "next";
import { manifestOverrideBuildError } from "./src/lib/wine-map/manifest-guard";
import { storageRemotePatterns } from "./src/lib/images/storage-src";

// The wine map's draft-manifest override must never reach a production build
// (src/lib/wine-map/manifest-guard.ts): fail the build rather than ship a map
// that loads a manifest the deployment does not have.
const manifestOverrideError = manifestOverrideBuildError(process.env);
if (manifestOverrideError) throw new Error(manifestOverrideError);

const nextConfig: NextConfig = {
  // Photos from Supabase Storage go through the image optimizer (StorageImg,
  // src/components/storage-img.tsx) so Supabase serves each original once per
  // cache entry instead of on every view (Free-plan egress, 2026-10-13).
  // Stored objects never change in place — wine photos are write-locked,
  // tasting covers get fresh names, avatars carry a ?t= cache-buster — so a
  // long TTL is safe. The size lists are kept short on purpose: every distinct
  // (image, width) pair is one billed transformation on Vercel.
  images: {
    remotePatterns: storageRemotePatterns(process.env.NEXT_PUBLIC_SUPABASE_URL),
    minimumCacheTTL: 2_678_400, // 31 days
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    deviceSizes: [640, 828, 1080, 1200, 1920],
    qualities: [75],
    formats: ["image/webp"],
  },
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
