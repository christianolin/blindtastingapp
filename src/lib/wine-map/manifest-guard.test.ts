// Review 2026-09-30: the draft-manifest override had no production guard.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { manifestOverrideBuildError } from "./manifest-guard";

describe("manifestOverrideBuildError", () => {
  it("refuses the override on a Vercel production build", () => {
    expect(
      manifestOverrideBuildError({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_WINE_MAP_MANIFEST_URL: "/wine-map-draft/manifest.json",
      }),
    ).toMatch(/^NEXT_PUBLIC_WINE_MAP_MANIFEST_URL is set \("\/wine-map-draft\/manifest.json"\) on a Vercel production build/);
  });

  it("lets every other build through", () => {
    expect(manifestOverrideBuildError({ VERCEL_ENV: "production" })).toBeNull();
    expect(manifestOverrideBuildError({ VERCEL_ENV: "production", NEXT_PUBLIC_WINE_MAP_MANIFEST_URL: "  " })).toBeNull();
    // A preview deploy, and a local `next build` (NODE_ENV production, no VERCEL_ENV).
    const draft = { NEXT_PUBLIC_WINE_MAP_MANIFEST_URL: "/wine-map-draft/manifest.json" };
    expect(manifestOverrideBuildError({ ...draft, VERCEL_ENV: "preview" })).toBeNull();
    expect(manifestOverrideBuildError({ ...draft, NODE_ENV: "production" })).toBeNull();
    expect(manifestOverrideBuildError({})).toBeNull();
  });

  it("is what next.config.ts runs at load", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain('from "./src/lib/wine-map/manifest-guard"');
    expect(config).toMatch(/manifestOverrideBuildError\(process\.env\)/);
  });
});
