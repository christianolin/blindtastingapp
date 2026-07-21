// Contract for tiles/manifest.json (schema_version 1), published by
// scripts/wine-map-tiles/promote.mjs. The manifest is the only mutable
// storage object; the archive URLs inside it are immutable and versioned.
export const WINE_MAP_MANIFEST_URL =
  "https://eqzwmkpeysqiihuojmuj.supabase.co/storage/v1/object/public/wine-map-tiles/tiles/manifest.json";

export type WineMapArchive = {
  url: string;
  checksum_sha256: string;
  bytes: number;
};

export type WineMapManifest = {
  schema_version: 1;
  release_version: string;
  generated_at: string;
  world: WineMapArchive;
  shards: Record<string, WineMapArchive>;
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
    value.schema_version !== 1 ||
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
