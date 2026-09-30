// The tiles manifest contract, and the one build-time override a LOCAL check
// of a draft (never promoted) tiles release uses.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINE_MAP_MANIFEST_URL,
  manifestUrlFrom,
  parseManifest,
  WINE_MAP_MANIFEST_URL,
  WINE_MAP_TILES_ORIGIN,
} from "./manifest";

describe("the manifest URL", () => {
  it("is the live manifest unless a build says otherwise", () => {
    expect(DEFAULT_WINE_MAP_MANIFEST_URL).toBe(
      "https://eqzwmkpeysqiihuojmuj.supabase.co/storage/v1/object/public/wine-map-tiles/tiles/manifest.json",
    );
    expect(WINE_MAP_TILES_ORIGIN).toBe("https://eqzwmkpeysqiihuojmuj.supabase.co");
    // The test run sets no override.
    expect(WINE_MAP_MANIFEST_URL).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
  });

  it("takes an absolute http(s) URL or a root-relative path, and nothing else", () => {
    expect(manifestUrlFrom(undefined)).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("   ")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("/wine-map-draft/manifest.json")).toBe("/wine-map-draft/manifest.json");
    expect(manifestUrlFrom(" /wine-map-draft/manifest.json ")).toBe("/wine-map-draft/manifest.json");
    expect(manifestUrlFrom("http://localhost:3217/wine-map-draft/manifest.json")).toBe(
      "http://localhost:3217/wine-map-draft/manifest.json",
    );
    expect(manifestUrlFrom("https://example.test/m.json")).toBe("https://example.test/m.json");
    expect(manifestUrlFrom("//evil.example/m.json")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("/\\evil.example/m.json")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("/\t/evil.example/m.json")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("https://example.test/a\\b.json")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    // What Git Bash makes of "/wine-map-draft/manifest.json" without MSYS_NO_PATHCONV=1.
    expect(manifestUrlFrom("C:/Program Files/Git/wine-map-draft/manifest.json")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("javascript:alert(1)")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("file:///C:/m.json")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
    expect(manifestUrlFrom("wine-map-draft/manifest.json")).toBe(DEFAULT_WINE_MAP_MANIFEST_URL);
  });
});

describe("parseManifest", () => {
  const archive = { url: "https://x/a.pmtiles", checksum_sha256: "A".repeat(64), bytes: 10 };
  const manifest = {
    schema_version: 2,
    release_version: "20260930T000000Z",
    generated_at: "2026-09-30T00:00:00.000Z",
    world: archive,
    shards: {
      bourgogne: { ...archive, bbox: [3, 46, 5, 48], min_zoom: 4, max_zoom: 16, reveal_rule: 1 },
      bordeaux: { ...archive, bbox: [-1, 44, 0, 45], min_zoom: 4, max_zoom: 11 },
    },
    attribution: { blindr: "© Blindr" },
  };

  it("keeps a shard's reveal_rule, and a shard without one parses as before", () => {
    const parsed = parseManifest(manifest);
    expect(parsed.shards.bourgogne.reveal_rule).toBe(1);
    expect(parsed.shards.bordeaux.reveal_rule).toBeUndefined();
  });

  it("still refuses a shard that is not an archive", () => {
    expect(() => parseManifest({ ...manifest, shards: { bourgogne: { reveal_rule: 1 } } })).toThrow(
      "Unrecognized wine map manifest shape",
    );
  });
});
