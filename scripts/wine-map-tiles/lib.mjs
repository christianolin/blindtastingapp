// Shared constants and pure helpers for the wine map tile pipeline.
// Everything network-facing lives behind small factory functions so the
// pure helpers stay unit-testable without credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Shard = 2nd segment of the canonical key. tier 0 (country) -> world only;
// tier 1 (region) -> world AND its own shard; tier >= 2 -> shard only. Region
// coverage grows without touching this rule.
export function shardKeyFor(canonicalKey) {
  const segments = canonicalKey.split(".");
  return segments.length >= 2 ? segments[1] : null;
}

export function archiveForPlace(row) {
  const shard = shardKeyFor(row.canonical_key);
  if (row.display_tier <= 0) return { world: true, shard: null };
  if (row.display_tier === 1) return { world: true, shard };
  return { world: false, shard };
}

export const WORLD_TARGET = { minZoom: 0, maxZoom: 7 };
export const SHARD_TARGET = { minZoom: 4, maxZoom: 16 };
export const BUCKET = "wine-map-tiles";
export const WORK_DIR = path.resolve(".tiles-build");
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eqzwmkpeysqiihuojmuj.supabase.co";

export const ATTRIBUTION = {
  BLINDR_MANUAL: { key: "blindr", text: "© Blindr" },
  IGN_INAO_AOC_VITICOLES_LEGACY: {
    key: "ign-inao",
    text: "Contains data © IGN / INAO, Licence Ouverte Etalab",
  },
  // Phase 3A adapter namespace (no _LEGACY suffix); same public credit as the
  // legacy import, so attributionDisplayMap collapses both to one entry.
  IGN_INAO_AOC_VITICOLES: {
    key: "ign-inao",
    text: "Contains data © IGN / INAO, Licence Ouverte Etalab",
  },
  // Champagne (and future no-parcel regions): commune-union from IGN Admin
  // Express filtered by the INAO official commune list. IGN geometry + INAO
  // membership, so it collapses to the same public credit as the parcel source.
  IGN_ADMIN_EXPRESS: {
    key: "ign-inao",
    text: "Contains data © IGN / INAO, Licence Ouverte Etalab",
  },
  NATURAL_EARTH: { key: "natural-earth", text: "Made with Natural Earth" },
  // Piedmont pilot (Barolo/Barbaresco/Piemonte): ISTAT comuni dissolve.
  // See scripts/wine-map-sources/stage-piedmont-boundaries.mjs (NAMESPACE).
  ISTAT_CONFINI: {
    key: "istat",
    text: "© ISTAT — Confini delle unità amministrative a fini statistici (CC BY 4.0)",
  },
  // Official Regione Piemonte DOC/DOCG delimited-area polygons (Langhe
  // expansion pilot). See scripts/wine-map-sources/stage-piemonte-official.mjs
  // (NAMESPACE). Supersedes ISTAT_CONFINI for Barolo/Barbaresco.
  PIEMONTE_DOC_DOCG: {
    key: "piemonte",
    text: "© Regione Piemonte — Aree di produzione dei vini DOC e DOCG (CC BY 4.0)",
  },
};

export function attributionKeyFor(namespace) {
  const entry = ATTRIBUTION[namespace];
  if (!entry) throw new Error(`Unknown source namespace: ${namespace}`);
  return entry.key;
}

export function attributionDisplayMap() {
  return Object.fromEntries(
    Object.values(ATTRIBUTION).map(({ key, text }) => [key, text]),
  );
}

export function releaseVersion(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function sha256hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

export function releaseObjectPath(version, filename) {
  return `tiles/releases/${version}/${filename}`;
}

export function storagePublicUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { z, x, y };
}

function tileProperties(row) {
  return {
    id: row.id,
    key: row.canonical_key,
    name: row.name,
    kind: row.kind,
    tier: row.display_tier,
    parent_id: row.primary_parent_id,
    has_children: row.has_children,
    rank: row.sort_order,
    // Region segment drives per-region map colouring; the country itself
    // falls back to its own key.
    region: shardKeyFor(row.canonical_key) ?? row.canonical_key,
    attribution: attributionKeyFor(row.source_namespace),
    min_zoom: Number(row.min_zoom),
    label_min_zoom: Number(row.label_min_zoom),
    // Planar deg² of the footprint: click resolution picks the smallest
    // overlapping shape so enclaves (Canon-Fronsac in Fronsac) stay clickable.
    area: Number(row.area ?? 0),
    // Legal appellation level; null for non-appellations.
    level: row.level ?? null,
    // Classification for the border language on the map: appellation_level
    // where it exists, else derived from échelle provenance so Champagne's
    // rated villages (not appellations) still carry grand/premier cru.
    classification: row.classification ?? row.level ?? null,
    // Third key segment — a region's top-level areas (medoc, graves,
    // pomerol…). District-mode regions colour and legend by it; computed in
    // export.mjs from the full row set (needs the ancestor's display name).
    group: row.group ?? null,
    group_name: row.group_name ?? null,
    // Hue-grouping unit for fills (NOT `area`, which is the numeric
    // footprint size above): the tier-3 ancestor (village) where one exists,
    // else the tier-2 district/sub-region; falls back to the key-segment
    // group for fixture rows.
    area_key: row.area_key ?? row.group ?? null,
    area_name: row.area_name ?? row.group_name ?? null,
  };
}

export function placeFeature(row) {
  return {
    type: "Feature",
    properties: tileProperties(row),
    tippecanoe: { minzoom: Math.max(0, Math.floor(Number(row.min_zoom))) },
    geometry: JSON.parse(row.geometry),
  };
}

// Ranked per-island labels (owner brief: one label per region at everyday
// zooms). Components arrive largest-first ([lon, lat, area] from the export
// SQL); rank 1 — in practice the region's best-known heartland (Côte d'Or
// for Bourgogne, not the Chablis island) — labels from label_min_zoom like
// before. The other islands' labels are baked in SECONDARY_LABEL_ZOOM_OFFSET
// zooms deeper, so "Bourgogne" appears over Chablis only once the camera is
// close enough that the heartland is off-screen. Components under
// MIN_LABEL_COMPONENT_SHARE of the footprint never get a label (slivers).
// Bare [lon, lat] fixtures rank by list order and are all kept. Falls back
// to the canonical label point when the row has no per-component list.
export const SECONDARY_LABEL_ZOOM_OFFSET = 5;
export const MIN_LABEL_COMPONENT_SHARE = 0.02;

export function labelFeatures(row) {
  const properties = tileProperties(row);
  const baseMinzoom = Math.max(0, Math.floor(Number(row.label_min_zoom)));
  if (!Array.isArray(row.component_labels) || row.component_labels.length === 0) {
    return [{
      type: "Feature",
      properties: { ...properties, label_rank: 1 },
      tippecanoe: { minzoom: baseMinzoom },
      geometry: { type: "Point", coordinates: JSON.parse(row.label_point).coordinates },
    }];
  }
  const totalArea = row.component_labels.reduce(
    (sum, entry) => sum + (Number(entry[2]) || 0),
    0,
  );
  return row.component_labels
    .filter((entry, index) => {
      if (index === 0 || totalArea === 0) return true;
      return (Number(entry[2]) || 0) / totalArea >= MIN_LABEL_COMPONENT_SHARE;
    })
    .map(([lon, lat], index) => ({
      type: "Feature",
      properties: { ...properties, label_rank: index + 1 },
      tippecanoe: {
        minzoom: index === 0
          ? baseMinzoom
          : baseMinzoom + SECONDARY_LABEL_ZOOM_OFFSET,
      },
      geometry: { type: "Point", coordinates: [lon, lat] },
    }));
}

export function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

export function buildManifest({ version, generatedAt, world, shards, attribution }) {
  return {
    schema_version: 2,
    release_version: version,
    generated_at: generatedAt,
    world, // { url, checksum_sha256, bytes }
    shards, // { <key>: { url, checksum_sha256, bytes, bbox:[w,s,e,n], min_zoom, max_zoom } }
    attribution,
  };
}

// Secrets pasted through dashboard/CI UIs can arrive wrapped in quotes or
// with stray whitespace/newlines; server auth then fails even though the
// underlying credential is correct.
function cleanSecret(value) {
  return value?.trim().replace(/^["']|["']$/g, "").trim();
}

export function pgConfig() {
  const password = cleanSecret(process.env.DB_PASSWORD);
  assert.ok(password, "DB_PASSWORD is required");
  return {
    host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
    port: Number(process.env.DB_PORT ?? 6543),
    user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
    database: process.env.DB_NAME ?? "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  };
}

export function storageBucket() {
  const serviceRoleKey = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);
}

// Storage uploads can fail transiently (run #46 died on a bare "Bad Request"
// that succeeded on manual re-run): three attempts with backoff, real HTTP
// status in the error. A retry after a written-but-timed-out attempt surfaces
// as 409 (upsert=false); publish re-validates every archive through the
// public URLs afterwards, so that counts as uploaded.
export async function uploadObject(objectPath, body, { contentType, cacheControlSeconds, upsert = false }) {
  const attempts = 3;
  for (let attempt = 1; ; attempt += 1) {
    const { error } = await storageBucket().upload(objectPath, body, {
      contentType,
      cacheControl: String(cacheControlSeconds),
      upsert,
    });
    if (!error) return;
    const status = error.status ?? error.statusCode ?? "unknown";
    if (attempt > 1 && String(status) === "409") return;
    if (attempt >= attempts) {
      throw new Error(
        `Upload ${objectPath} failed after ${attempts} attempts: ${error.message} (status ${status})`,
      );
    }
    console.warn(
      `Upload ${objectPath} attempt ${attempt} failed: ${error.message} (status ${status}); retrying...`,
    );
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
}

// Args are relative paths run with cwd=WORK_DIR so tippecanoe's embedded
// generator_options metadata stays machine-independent (determinism).
// name is "world" or a shard key; spec carries that archive's min/max zoom.
export function tippecanoeArgs(name, spec) {
  return [
    "-o", `${name}.pmtiles`, "--force", `-Z${spec.minZoom}`, `-z${spec.maxZoom}`, "-r1",
    "--no-progress-indicator",
    "-L", `places:${name}-places.geojson`,
    "-L", `labels:${name}-labels.geojson`,
  ];
}

export function expectedIdSets(release) {
  const world = new Set(release.world.place_ids);
  const shards = {};
  for (const [key, shard] of Object.entries(release.shards)) {
    shards[key] = new Set(shard.place_ids);
  }
  return { world, shards };
}

// Minimal pmtiles Source over a local file (the npm package's own sources
// are fetch/browser oriented).
export class NodeFileSource {
  constructor(filePath) {
    this.filePath = filePath;
  }
  getKey() {
    return this.filePath;
  }
  async getBytes(offset, length) {
    const { open } = await import("node:fs/promises");
    const handle = await open(this.filePath);
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return {
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead),
      };
    } finally {
      await handle.close();
    }
  }
}

export async function decodeTileFeatures(tileData) {
  const { VectorTile } = await import("@mapbox/vector-tile");
  const { PbfReader } = await import("pbf");
  const tile = new VectorTile(new PbfReader(new Uint8Array(tileData)));
  const byLayer = {};
  for (const [layerName, layer] of Object.entries(tile.layers)) {
    byLayer[layerName] = [];
    for (let i = 0; i < layer.length; i += 1) {
      byLayer[layerName].push(layer.feature(i).properties);
    }
  }
  return byLayer;
}
