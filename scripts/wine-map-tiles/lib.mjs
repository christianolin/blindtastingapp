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

// Multi-country export invariants (fail-closed). Routing is country-agnostic
// by construction — country = key segment 0, shard = segment 1 — so France,
// Italy and Spain coexist without special cases. Two silent failure modes
// survive that generality, and this guard turns each into a hard stop at
// export time:
//
//  1. Orphaned country: a place keyed `spain.galicia.rias-baixas` while no
//     `spain` COUNTRY (tier 0) row is present — the region would draw with no
//     country outline beneath it, or the prefix is a typo. Every distinct
//     key-prefix among the rows MUST have a tier-0 row in the same set.
//  2. Cross-country shard collision: shards are keyed by the 2nd segment
//     (a France region / a Spain comunidad). If a French region and a Spanish
//     comunidad ever shared a slug (say both `rioja`) their features would
//     merge into one archive under one colour and bbox. No shard key may be
//     claimed by two different countries.
//
// Decision (locked): keep shard = 2nd segment, un-namespaced — matching
// France's region-level and Italy's — rather than prefixing `country-region`.
// France/Italy/Spain have no colliding second segment today; this guard is the
// tripwire if that ever stops being true, at which point we namespace.
export function assertMultiCountryArchive(rows) {
  const countryOf = (key) => key.split(".")[0];
  const countryOutlines = new Set(
    rows.filter((row) => row.display_tier <= 0).map((row) => row.canonical_key),
  );
  const shardCountries = new Map();
  for (const row of rows) {
    const country = countryOf(row.canonical_key);
    assert.ok(
      countryOutlines.has(country),
      `place ${row.canonical_key} has no ${country} country outline in the archive`,
    );
    const shard = shardKeyFor(row.canonical_key);
    if (shard === null) continue;
    const claimed = shardCountries.get(shard);
    assert.ok(
      claimed === undefined || claimed === country,
      `shard "${shard}" is claimed by two countries (${claimed}, ${country}); namespace shard keys`,
    );
    shardCountries.set(shard, country);
  }
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
  // Official Regione Toscana wine-production-area polygons (GEOscopio "Zone di
  // produzione dei vini"). See scripts/wine-map-sources/stage-toscana-official.mjs.
  TOSCANA_DOC_DOCG: {
    key: "toscana",
    text: "© Regione Toscana — Zone di produzione dei vini (CC BY 4.0)",
  },
  // Spanish DO/DOCa outlines: whole-municipality union from the OpenDataSoft
  // georef-spain-municipio layer (IGN/CNIG-derived) filtered by each DO's
  // official municipality list. The Spanish analogue of IGN_ADMIN_EXPRESS —
  // official municipal polygons + a pliego membership list, dissolved.
  IGN_CNIG_SPAIN: {
    key: "ign-cnig-spain",
    text: "Contains data © IGN/CNIG España",
  },
  // Official Provincia Autonoma di Bolzano "Zone DOC e IGT" (GeoKatalog).
  // See scripts/wine-map-sources/stage-altoadige-official.mjs.
  ALTOADIGE_DOC_IGT: {
    key: "trentino-alto-adige",
    text: "© Autonome Provinz Bozen-Südtirol / Provincia Autonoma di Bolzano — Zone DOC e IGT (CC BY 4.0)",
  },
  // Official Regione del Veneto DOC/DOCG wine zones (IDT2 GeoServer).
  // See scripts/wine-map-sources/stage-veneto-official.mjs.
  VENETO_DOC_DOCG: {
    key: "veneto",
    text: "© Regione del Veneto — Zone DOC e DOCG viticole (CC BY 4.0)",
  },
  // Sicily has no official delimited-zone GIS: footprints are ISTAT comune
  // boundaries dissolved per the MASAF disciplinare comune lists (comune-level
  // approximation). See scripts/wine-map-sources/stage-sicily-official.mjs.
  SICILY_COMUNI: {
    key: "sicilia",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  // Lombardy: no official delimited-zone GIS — ISTAT comuni dissolved per the
  // MASAF disciplinare comune lists. See stage-lombardia-official.mjs.
  LOMBARDIA_COMUNI: {
    key: "lombardia",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  // Friuli: no official delimited-zone GIS — ISTAT comuni dissolved per the
  // MASAF disciplinare comune lists. See stage-friuli-official.mjs.
  FRIULI_COMUNI: {
    key: "friuli",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
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
