// Contract for tiles/manifest.json (schema_version 2), published by
// scripts/wine-map-tiles/promote.mjs. The manifest is the only mutable
// storage object; the archive URLs inside it are immutable and versioned.
// v2 adds per-shard bbox + zoom so the UI can load region shards on demand.

/** The live manifest: the one production reads. */
export const DEFAULT_WINE_MAP_MANIFEST_URL =
  "https://eqzwmkpeysqiihuojmuj.supabase.co/storage/v1/object/public/wine-map-tiles/tiles/manifest.json";

/** Where the tile archives are served from, whichever manifest names them
    (the page's preconnect). */
export const WINE_MAP_TILES_ORIGIN = new URL(DEFAULT_WINE_MAP_MANIFEST_URL).origin;

/** The manifest a build loads: DEFAULT_WINE_MAP_MANIFEST_URL, unless the
    build was made with NEXT_PUBLIC_WINE_MAP_MANIFEST_URL, which exists for ONE
    purpose: a LOCAL build that loads a tiles release that was never promoted
    (a draft, built by the Wine Map Tiles workflow with promote=false), so it
    can be checked before tiles/manifest.json points at it. Production never
    sets it, and a Vercel production build with it set fails at next.config.ts
    (manifest-guard.ts). Only an absolute http(s) URL or a root-relative path is taken;
    anything else, empty included, falls back to the default. A backslash or a
    control character is refused anywhere: a URL parser reads "/\host" as
    "//host", another host (the lesson of lib/auth/login-copy.ts sameSiteNext). */
export function manifestUrlFrom(override: string | undefined): string {
  const value = override?.trim();
  if (!value || /[\x00-\x1f\x7f\\]/.test(value)) return DEFAULT_WINE_MAP_MANIFEST_URL;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : DEFAULT_WINE_MAP_MANIFEST_URL;
  } catch {
    return DEFAULT_WINE_MAP_MANIFEST_URL;
  }
}

/** What a build was given, if anything (inlined at build time). */
const MANIFEST_URL_OVERRIDE = process.env.NEXT_PUBLIC_WINE_MAP_MANIFEST_URL;

/** The manifest this build loads (see manifestUrlFrom). NEXT_PUBLIC_ variables
    are inlined at build time, so the server's preload and the browser's fetch
    always name the same one. */
export const WINE_MAP_MANIFEST_URL = manifestUrlFrom(MANIFEST_URL_OVERRIDE);

// Say so whenever the override is set, so a draft check can never quietly
// test the live tiles: Git Bash, for one, rewrites "/wine-map-draft/..." into
// "C:/Program Files/Git/wine-map-draft/..." unless MSYS_NO_PATHCONV=1, and
// that value is refused. Production sets nothing and logs nothing.
if (MANIFEST_URL_OVERRIDE?.trim()) {
  if (WINE_MAP_MANIFEST_URL === DEFAULT_WINE_MAP_MANIFEST_URL) {
    console.warn(
      `[wine-map] NEXT_PUBLIC_WINE_MAP_MANIFEST_URL "${MANIFEST_URL_OVERRIDE}" is neither an http(s) URL nor a /path: loading the live manifest`,
    );
  } else {
    console.info(`[wine-map] manifest override: ${WINE_MAP_MANIFEST_URL}`);
  }
}

export type WineMapArchive = {
  url: string;
  checksum_sha256: string;
  bytes: number;
};

// bbox/zoom are optional so the transitional v1 manifest (a single "france"
// shard with no bbox) still parses until the first v2 promote (Phase 3C).
export type WineMapShard = WineMapArchive & {
  bbox?: [number, number, number, number];
  min_zoom?: number;
  max_zoom?: number;
  /** Present (1) when this shard's subregions carry reveal_area, the size
      rule's per-feature size (src/lib/wine-map/reveal.ts shardRevealPx;
      scripts/wine-map-tiles/lib.mjs REVEAL_RULE). Absent in every release
      published before the rule: the shard then keeps the old map. */
  reveal_rule?: number;
};

export type WineMapManifest = {
  schema_version: 1 | 2;
  release_version: string;
  generated_at: string;
  world: WineMapArchive;
  shards: Record<string, WineMapShard>;
  attribution: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArchive(value: unknown): value is WineMapArchive {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    typeof value.checksum_sha256 === "string" &&
    typeof value.bytes === "number"
  );
}

export function parseManifest(value: unknown): WineMapManifest {
  if (
    !isRecord(value) ||
    (value.schema_version !== 1 && value.schema_version !== 2) ||
    typeof value.release_version !== "string" ||
    typeof value.generated_at !== "string" ||
    !isArchive(value.world) ||
    !isRecord(value.shards) ||
    !Object.values(value.shards).every(isArchive) ||
    !isRecord(value.attribution) ||
    !Object.values(value.attribution).every((text) => typeof text === "string")
  ) {
    throw new Error("Unrecognized wine map manifest shape");
  }
  return value as WineMapManifest;
}

export async function fetchWineMapManifest(): Promise<WineMapManifest> {
  const response = await fetch(WINE_MAP_MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Wine map manifest request failed (${response.status})`);
  }
  return parseManifest(await response.json());
}
