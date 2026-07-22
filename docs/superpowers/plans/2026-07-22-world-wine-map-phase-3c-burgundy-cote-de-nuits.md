# Phase 3C Implementation Plan — Burgundy in Depth (Côte de Nuits vertical slice)

Spec: docs/superpowers/specs/2026-07-22-world-wine-map-phase-3c-burgundy-depth-design.md
Base: master @ ad3658a. Live DB: 20 VERIFIED places, 20 current boundaries, release 20260722T075439Z.

## Global constraints (apply to every task)

- **Migrations are dry-run-first.** Every schema/data migration runs rollback-only through the Phase-1 foundation harness (`WORLD_WINE_MAP_MIGRATIONS`) and must go GREEN before any live apply. Live apply uses the scratch applier, then live verification.
- **No heavy server-side dissolves.** Village/cru/climat footprints use the precise client-side dissolve on small parcel sets; region/district footprints are the union of their children (`DERIVED_FROM_DESCENDANTS`) computed client-side. Never `ST_Union` tens of thousands of parcels on the free-tier DB.
- **Exact-name scoring links only.** No fuzzy matching; unmatched rows stay PENDING and are reported.
- **`canonical_key` is opaque + locked.** Only the region-ancestor segment (2nd segment) may be read, and only for shard routing.
- **Reviewed provenance.** Every boundary carries a source snapshot with real raw + normalized artifacts and checksums; raw parcel pages go to the `wine-map-sources` bucket (gzipped).
- **Per-task review** (implementer → reviewer) then controller records the ledger. Migrations/tooling/UI each get a review before push.
- **Push to master directly**, then the tile workflow + owner map gate is the release path. No user-visible change until the owner triggers the workflow and signs off.
- Verification battery per task as applicable: `node --test` for touched suites, `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`, and the live foundation + context suites after any live apply.

## Shard-key convention (used throughout)

A place's **shard** is the 2nd segment of its `canonical_key`:
`france` (tier 0) → world only; `france.bourgogne` (tier 1 region) → world **and** shard `bourgogne`; `france.bourgogne.cote-de-nuits.*` (tier ≥2) → shard `bourgogne` only. Shard file = `<shard>.pmtiles`. This needs no mapping table and generalises to every region.

## File map (created/changed in this plan)

- `supabase/migrations/20260804090000_appellation_level_crus.sql` — extend `appellation_level` CHECK (Task 1).
- `data/wine-map/burgundy-grand-crus.json` — curated grand-cru denomination list, self-validated against the vocabulary (Task 1).
- `scripts/wine-map-tiles/lib.mjs` — `archiveForPlace`/`shardKeyFor`, dynamic BUILD_TARGETS, manifest v2, drop hardcoded `EXPECTED_PLACES` drift check (Task 2).
- `scripts/wine-map-tiles/export.mjs` — per-shard GeoJSON + shard bbox/zoom in release.json (Task 2).
- `scripts/wine-map-tiles/build.mjs`, `validate.mjs`, `publish.mjs`, `promote.mjs` — iterate shards; `publish.mjs` persists per-shard bbox/zoom into the release row (Task 2).
- `scripts/wine-map-tiles/lib.test.mjs` — shard-routing + manifest-v2 unit tests (Task 2).
- `.github/workflows/wine-map-tiles.yml` — build all shards (Task 2).
- `src/lib/wine-map/manifest.ts` — manifest v2 type + parser (Task 3).
- `src/app/knowledge/map/tile-wine-map.tsx` — shard-generic, on-demand source loading (Task 3).
- `scripts/wine-map-sources/build-boundary.mjs`, `concave-engine.mjs` — output sliver filter + `--engine derived` (union of children) + per-level params (Task 4).
- `supabase/migrations/20260805090000_cote_de_nuits.sql` — Côte de Nuits catalog (district, villages, grand crus, 1er-cru groups, Vosne climats), classification, nav, legal edges (Task 5).
- `supabase/migrations/20260805093000_cote_de_nuits_links.sql` — exact-name scoring links (Task 5).
- `supabase/migrations/20260805096000_cote_de_nuits_flip.sql` — DRAFT→VERIFIED/VALIDATED after review (Task 5).
- Foundation + context test expectation updates (Tasks 1, 5).

---

## Task 1 — Schema: appellation levels + curated grand-cru list

**Goal:** allow `premier_cru`/`grand_cru` classification and commit the reviewed grand-cru denomination list the import depends on.

### Step 1 — Migration (rollback-first)

`supabase/migrations/20260804090000_appellation_level_crus.sql`:

```sql
-- Phase 3C: Burgundy needs the premier/grand cru layers distinguished.
-- appellation_level is a text column with a CHECK; swap the constraint
-- transactionally (empty-of-new-values today, so no backfill).
begin;

alter table wine_places
  drop constraint if exists wine_places_appellation_level_check;

alter table wine_places
  add constraint wine_places_appellation_level_check
  check (
    appellation_level is null
    or appellation_level in
       ('regional', 'subregional', 'communal', 'premier_cru', 'grand_cru', 'cru')
  );

commit;
```

### Step 2 — Curated grand-cru artifact

`data/wine-map/burgundy-grand-crus.json` — every Burgundy grand cru with its exact INAO `denom`, district and village. For 3C the Côte de Nuits set is load-bearing; the rest are included for 3D reuse. Shape:

```json
{
  "source": "curated from INAO AOC-VITICOLES denom vocabulary; each denom asserted present in inao-denomination-membership.json",
  "grand_crus": [
    { "denom": "Chambertin", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Chambertin-Clos de Bèze", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Chapelle-Chambertin", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Charmes-Chambertin", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Griotte-Chambertin", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Latricières-Chambertin", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Mazis-Chambertin", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Mazoyères-Chambertin", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Ruchottes-Chambertin", "district": "cote-de-nuits", "village": "gevrey-chambertin" },
    { "denom": "Clos de la Roche", "district": "cote-de-nuits", "village": "morey-saint-denis" },
    { "denom": "Clos Saint-Denis", "district": "cote-de-nuits", "village": "morey-saint-denis" },
    { "denom": "Clos des Lambrays", "district": "cote-de-nuits", "village": "morey-saint-denis" },
    { "denom": "Clos de Tart", "district": "cote-de-nuits", "village": "morey-saint-denis" },
    { "denom": "Bonnes-Mares", "district": "cote-de-nuits", "village": "chambolle-musigny" },
    { "denom": "Musigny", "district": "cote-de-nuits", "village": "chambolle-musigny" },
    { "denom": "Clos de Vougeot ou Clos Vougeot", "name": "Clos de Vougeot", "district": "cote-de-nuits", "village": "vougeot" },
    { "denom": "Echezeaux", "name": "Échezeaux", "district": "cote-de-nuits", "village": "vosne-romanee" },
    { "denom": "Grands-Echezeaux", "name": "Grands-Échezeaux", "district": "cote-de-nuits", "village": "vosne-romanee" },
    { "denom": "Richebourg", "district": "cote-de-nuits", "village": "vosne-romanee" },
    { "denom": "Romanée-Conti", "district": "cote-de-nuits", "village": "vosne-romanee" },
    { "denom": "La Romanée", "district": "cote-de-nuits", "village": "vosne-romanee" },
    { "denom": "La Tâche", "district": "cote-de-nuits", "village": "vosne-romanee" },
    { "denom": "Romanée-Saint-Vivant", "district": "cote-de-nuits", "village": "vosne-romanee" }
  ]
}
```

> **`denom` = the exact vocabulary key; `name` = display label — they differ.** INAO stores some names *without* accents (`Echezeaux`, `Grands-Echezeaux`) and some as compound "ou" forms (`Clos de Vougeot ou Clos Vougeot`), even though the display `name` keeps the accent/short form. The generator MUST assert every `denom` is a key in `data/wine-map/inao-denomination-membership.json` before committing and fail loudly otherwise. `Clos de Tart`/`Clos des Lambrays` are monopoles — confirm their exact denom form too. Any denom not found is corrected against the vocabulary (never force-added); the human-facing `name` is set separately.

### Step 3 — Foundation-test probe (rollback-scoped)

In the foundation suite, add a probe (own rollback scope) asserting the constraint accepts `grand_cru`/`premier_cru` and rejects a bogus level:

```js
await withRollback(async (tx) => {
  await tx.query("savepoint p");
  // grand_cru now allowed
  await tx.query(`update wine_places set is_appellation = true, appellation_system = 'AOC/AOP',
                  appellation_level = 'grand_cru' where canonical_key = 'france.bordeaux.fronsac'`);
  await tx.query("rollback to savepoint p");
});
await withRollback(async (tx) => {
  await tx.query("savepoint p");
  // france.bordeaux is already is_appellation=true, so only the level check can fire
  await assert.rejects(
    tx.query(`update wine_places set appellation_level = 'bogus_level'
              where canonical_key = 'france.bordeaux'`),
    /appellation_level_check/,
  );
  await tx.query("rollback to savepoint p");
});
```

### Step 4 — Verify + apply + commit

1. RED/GREEN dry-run: `WORLD_WINE_MAP_MIGRATIONS=...20260804090000... node --test test/world-wine-map-foundation.test.mjs` → 15 pass + concurrency skip.
2. Validate the grand-cru list against the vocabulary (a one-off `node` check; read-only).
3. Live apply via scratch applier; live foundation 15/15 + context 5/5.
4. Commit `feat: add premier/grand cru levels + curated burgundy grand-cru list` (migration + json + test). Push.

**Task 1 acceptance:** constraint accepts the two new levels; grand-cru list committed and 100% resolvable against the vocabulary; suites green live.

## Task 2 — Tile pipeline: per-region shards + manifest v2

**Goal:** replace the single-`france`-shard/tier split with per-region shards (each `z4–16`, loaded on demand) and a v2 manifest carrying each shard's bbox + zoom. Pure tooling, TDD, no DB writes.

### Step 1 — `lib.mjs` changes (RED first: write tests in Step 4)

Replace `archiveForTier` and the fixed `BUILD_TARGETS`; bump the manifest:

```js
// Shard = 2nd segment of the canonical key. tier 0 -> world only;
// tier 1 (region) -> world AND its own shard; tier >= 2 -> shard only.
export function shardKeyFor(canonicalKey) {
  const seg = canonicalKey.split(".");
  return seg.length >= 2 ? seg[1] : null;
}

export function archiveForPlace(row) {
  const shard = shardKeyFor(row.canonical_key);
  if (row.display_tier <= 0) return { world: true, shard: null };
  if (row.display_tier === 1) return { world: true, shard };
  return { world: false, shard };
}

export const WORLD_TARGET = { minZoom: 0, maxZoom: 7 };
export const SHARD_TARGET = { minZoom: 4, maxZoom: 16 };

// name is "world" or a shard key; spec carries min/max zoom.
export function tippecanoeArgs(name, spec) {
  return [
    "-o", `${name}.pmtiles`, "--force",
    `-Z${spec.minZoom}`, `-z${spec.maxZoom}`, "-r1",
    "--no-progress-indicator",
    "-L", `places:${name}-places.geojson`,
    "-L", `labels:${name}-labels.geojson`,
  ];
}

export function buildManifest({ version, generatedAt, world, shards, attribution }) {
  return {
    schema_version: 2,
    release_version: version,
    generated_at: generatedAt,
    world,      // { url, checksum_sha256, bytes }
    shards,     // { <key>: { url, checksum_sha256, bytes, bbox:[w,s,e,n], min_zoom, max_zoom } }
    attribution,
  };
}

// Generic id sets: world + each shard, from release.json.
export function expectedIdSets(release) {
  const world = new Set(release.world.place_ids);
  const shards = {};
  for (const [key, s] of Object.entries(release.shards)) shards[key] = new Set(s.place_ids);
  return { world, shards };
}
```

Remove the exported `EXPECTED_PLACES` drift constant and the old `archiveForTier`/`BUILD_TARGETS`/two-set `expectedIdSets`. `tippecanoeArgs` now takes `(name, spec)`.

### Step 2 — `export.mjs`

Group rows by `archiveForPlace`, write `world-*` plus `<shard>-*` GeoJSON, and record shard bbox/zoom in `release.json`. Key changes:

```js
import { archiveForPlace, WORLD_TARGET, SHARD_TARGET, /* … */ } from "./lib.mjs";

// consistency, not a magic number:
const verified = await client.query(
  "select count(*)::int as count from wine_places where publication_status = 'VERIFIED'");
assert.equal(rows.length, verified.rows[0].count, "verified/export row mismatch");
assert.ok(rows.length >= 20, "implausibly few places");

// bbox from a feature's geometry coords (MultiPolygon):
function extendBbox(bbox, geojson) {
  for (const poly of geojson.coordinates) for (const ring of poly)
    for (const [x, y] of ring) {
      bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
      bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
    }
  return bbox;
}

const world = { rows: [], ids: [] };
const shards = {};                      // key -> { rows, ids, bbox }
for (const row of rows) {
  const { world: inWorld, shard } = archiveForPlace(row);
  if (inWorld) { world.rows.push(row); world.ids.push(row.id); }
  if (shard) {
    const s = (shards[shard] ??= { rows: [], ids: [], bbox: [180, 90, -180, -90] });
    s.rows.push(row); s.ids.push(row.id);
    extendBbox(s.bbox, JSON.parse(row.geometry));
  }
}
assert.ok(world.rows.some((r) => r.canonical_key === "france"), "world must contain France");

// write world-*.geojson and <shard>-*.geojson (places + labels)
const outputs = [
  ["world-places.geojson", featureCollection(world.rows.map(placeFeature))],
  ["world-labels.geojson", featureCollection(world.rows.map(labelFeature))],
];
for (const [key, s] of Object.entries(shards)) {
  outputs.push([`${key}-places.geojson`, featureCollection(s.rows.map(placeFeature))]);
  outputs.push([`${key}-labels.geojson`, featureCollection(s.rows.map(labelFeature))]);
}
// … writeFile each …

const release = {
  version: releaseVersion(), generated_at: new Date().toISOString(),
  git_sha: process.env.GITHUB_SHA ?? null, node: process.version,
  counts: { places: rows.length, by_kind: byKind },
  world: { place_ids: world.ids },
  shards: Object.fromEntries(Object.entries(shards).map(([k, s]) => [k, {
    place_ids: s.ids, bbox: s.bbox,
    min_zoom: SHARD_TARGET.minZoom, max_zoom: SHARD_TARGET.maxZoom,
  }])),
  expected: rows.map((row) => ({ id: row.id, key: row.canonical_key, tier: row.display_tier,
    parent_id: row.primary_parent_id, label_lon: Number(row.label_lon),
    label_lat: Number(row.label_lat), archive: archiveForPlace(row) })),
};
```

### Step 3 — `build.mjs`, `validate.mjs`, `publish.mjs`, `promote.mjs`

- **build.mjs:** read `release.json`; build `world` with `WORLD_TARGET` and each `shards` key with `SHARD_TARGET`; keep the determinism double-build (per archive). Fail if any `<name>-places.geojson` is missing.
- **validate.mjs:** replace the hardcoded `ARCHIVE_SPECS = { world, france }` with specs derived from `release.json` (each shard's own `max_zoom`); iterate `world` + every shard, decode probe tiles at that archive's `max_zoom`, assert its feature-id set equals `expectedIdSets(release)` for that archive. Generalise the per-feature guard from `idSets.world.has(id) || idSets.france.has(id)` to "id is in *any* expected archive set". Range-read each archive. NOTE: the `FRANCE_BBOX` header-bounds gate passes for `bourgogne` (Burgundy ⊂ France) but is a latent trap for the first non-France shard in 3E — leave a `TODO(3E)` to make it per-shard bbox.
- **publish.mjs:** the CI script run between build and promote. Generalise the hardcoded `for (const name of ["world","france"])` to `["world", ...Object.keys(release.shards)]`. It MUST **persist each shard's `bbox`/`min_zoom`/`max_zoom` into the DB release row** (extend `tile_checksums[name]` to `{ path, bytes, checksum, bbox, min_zoom, max_zoom }`), because `promote.mjs` reads the DB row — not `release.json` — on the explicit-version/rollback path.
- **promote.mjs:** read `tile_checksums` from the DB row; upload `world.pmtiles` + every `<shard>.pmtiles`; build the **v2 manifest** — `world` entry + a `shards` map where each entry is `{ url, checksum_sha256, bytes, bbox, min_zoom, max_zoom }` taken from the persisted `tile_checksums` (so rollback to an older version still emits correct shard metadata); upload manifest; flip the `wine_map_releases` row. Cache-busted read-back stays.

### Step 4 — `lib.test.mjs` (RED → GREEN)

Replace the `archiveForTier`/`WORLD_KEYS` tests with:

```js
test("archiveForPlace routes by tier and region segment", () => {
  assert.deepEqual(archiveForPlace({ display_tier: 0, canonical_key: "france" }),
    { world: true, shard: null });
  assert.deepEqual(archiveForPlace({ display_tier: 1, canonical_key: "france.bourgogne" }),
    { world: true, shard: "bourgogne" });
  assert.deepEqual(
    archiveForPlace({ display_tier: 3, canonical_key: "france.bourgogne.cote-de-nuits.vosne-romanee" }),
    { world: false, shard: "bourgogne" });
});

test("buildManifest is schema 2 with keyed shard entries", () => {
  const m = buildManifest({ version: "v", generatedAt: "t",
    world: { url: "w", checksum_sha256: "c", bytes: 1 },
    shards: { bourgogne: { url: "b", checksum_sha256: "c2", bytes: 2, bbox: [3,46,5,48], min_zoom: 4, max_zoom: 16 } },
    attribution: {} });
  assert.equal(m.schema_version, 2);
  assert.equal(m.shards.bourgogne.max_zoom, 16);
});

test("tippecanoeArgs honours per-archive zoom", () => {
  assert.deepEqual(tippecanoeArgs("bourgogne", SHARD_TARGET).slice(0, 6),
    ["-o", "bourgogne.pmtiles", "--force", "-Z4", "-z16", "-r1"]);
});
```

### Step 5 — `.github/workflows/wine-map-tiles.yml`

The build/validate steps already call the scripts; since build/validate now iterate `release.json`, no per-shard hardcoding is needed. Confirm the workflow uploads all `*.pmtiles` artifacts (glob) and that the promote step is unchanged.

### Step 6 — Verify + commit (no live release yet)

`node --test scripts/wine-map-tiles/lib.test.mjs` (GREEN), `tsc`, `eslint` the scripts, `npm run build`. A **live export dry-run** (`DB_PORT`/creds set, `node export.mjs`) against the current 20-place DB must still produce `world` + a `bourgogne` shard and pass `validate.mjs` locally — proving the generalised split is behaviour-preserving before any Burgundy data exists. Commit `feat: per-region tile shards + manifest v2`. Push **after Task 3** (UI must consume v2 before a v2 manifest is promoted).

**Task 2 acceptance:** unit tests green; a local export/build/validate of the current DB yields `world.pmtiles` + `bourgogne.pmtiles` with a valid v2 release.json; no live promote yet.

## Task 3 — UI: manifest v2 + on-demand shard loading

**Goal:** consume the v2 manifest and load a region's shard only when that region is active. Keeps `world` always loaded, ≤2 shards at once. No DB.

### Step 1 — `src/lib/wine-map/manifest.ts`

```ts
export interface WineMapArchive { url: string; checksum_sha256: string; bytes: number; }
export interface WineMapShard extends WineMapArchive {
  bbox: [number, number, number, number]; min_zoom: number; max_zoom: number;
}
export interface WineMapManifest {
  schema_version: number; release_version: string; generated_at: string;
  world: WineMapArchive; shards: Record<string, WineMapShard>;
  attribution: Record<string, string>;
}
```
Parser accepts `schema_version === 2`, validates `world` (archive shape) and every `shards` value (archive + `bbox` length 4 + numeric zooms). Throws on anything else.

### Step 2 — `src/app/knowledge/map/tile-wine-map.tsx`

- Add `shardKeyFor(key)` (same 2nd-segment rule) in a shared client util (`src/lib/wine-map/shard.ts`) reused by the UI.
- Compute `activeShardKey = selectedKey ? shardKeyFor(selectedKey) : shardKeyFor(DEFAULT_PLACE_KEY)`.
- Render the always-on `world` `<Source>` plus **one** shard `<Source id={"wine-shard-"+activeShardKey} url={pmtiles://manifest.shards[activeShardKey].url}>` when that key exists in `manifest.shards`; drop the hardcoded `wine-france` source.
- Emit the fill/outline/label layers once per source (`source-layer` `places`/`labels`), so world shows tier 0–1 and the active shard shows the region's deep features. Since features carry per-feature `minzoom` from tippecanoe, MapLibre only draws deeper places as zoom increases — no client zoom filters needed.
- Attribution unchanged (`Object.values(manifest.attribution)`).

> On-demand rule for 3C is **selection-driven** (the selected place's region), which also drives the camera, so entering Burgundy loads only `bourgogne`. A viewport-intersection loader (using each shard's `bbox`) is a documented follow-up, not required for 3C.

### Step 3 — Verify + commit

`tsc`, `eslint` the three files, `npm run build`. Commit `feat: shard-generic tile map UI (manifest v2, on-demand region shards)`. **Now push Task 2 + Task 3 together** (UI understands v2 before any v2 manifest is promoted). Single pre-push review of the Task 2+3 range.

**Task 3 acceptance:** build green; UI loads `world` + exactly the active region's shard; `?place=france.bordeaux…` loads `bordeaux`, Burgundy keys load `bourgogne`.

---

## Task 4 — Boundary engine: sliver fix, per-level params, derived-from-descendants

**Goal:** the engine capabilities the import needs, and fix the Bourgogne islands.

### Step 1 — `concave-engine.mjs`: drop output slivers

After building component rings, before returning the MultiPolygon: compute each part's area (shoelace) and **drop parts below `minPartAreaShare` of the largest part (default 0.02) AND parts with < 4 distinct vertices**. This removes the ~6 tiny fragments above Bourgogne. Record `minPartAreaShare` in `generation_parameters`.

### Step 2 — `build-boundary.mjs`: `--engine derived`

New mode that ignores parcels and sets a place's geometry to the union of its **VERIFIED children's current boundaries** (cheap — a handful of child geoms):

```sql
select extensions.ST_AsGeoJSON(
  extensions.ST_Multi(extensions.ST_CollectionExtract(
    extensions.ST_MakeValid(extensions.ST_Union(cb.display_geometry)), 3)), 6) as geom
from wine_places parent
join wine_places child on child.primary_parent_id = parent.id
  and child.publication_status = 'VERIFIED'
join wine_place_boundaries cb on cb.wine_place_id = child.id
  and cb.is_current and cb.quality_status = 'VALIDATED'
where parent.canonical_key = $1;
```
Then simplify to the level tolerance and insert a DRAFT boundary with `boundary_method = 'DERIVED_FROM_DESCENDANTS'`. It still uploads a real `normalized.geojson` (the `normalized_artifact_uri`/`normalized_checksum_sha256` columns are NOT NULL), sets `raw_snapshot_uri = null` with a `provenance_note`, and records child boundary ids in `generation_parameters`. The query needs VERIFIED+current+VALIDATED children, so derived nodes build AFTER the child flip (Task 5 two-phase), not during DRAFT staging.

### Step 3 — Per-level generalisation defaults (documented + wired as `--preset`)

| Level | engine | presimplify | tolerance | minPartAreaShare |
|---|---|---|---|---|
| region | concave | 0.002 | 0.005 | 0.02 |
| district | derived | – | 0.002 | – |
| village | dissolve | 0.0003 | 0.0008 | 0.05 |
| 1er-cru group | dissolve (aggregate denom) or derived | 0.0002 | 0.0005 | 0.05 |
| grand cru / climat | dissolve | 0.0001 | 0.0002 | – (keep all parts) |

### Step 4 — Fix Bourgogne + verify + commit

Re-stage Bourgogne with the sliver-cleaned concave engine (same fetch, cached parcels) → the three real northern districts remain (Chablis/Auxerrois, Tonnerrois, Châtillonnais) but the tiny fragments are gone; re-flip to current. (Full `DERIVED_FROM_DESCENDANTS` Bourgogne lands in 3D once all districts exist.) `node --check`, engine unit tests if present, live foundation 15/15 + context 5/5. Commit `feat: boundary engine sliver filter + derived-from-descendants; restage bourgogne`. Push (single review).

**Task 4 acceptance:** Bourgogne renders without slivers; `--engine derived` produces a valid union boundary on a test parent; suites green.

---

## Task 5 — Côte de Nuits import (the depth proof)

**Goal:** stage and verify the full Côte de Nuits sub-tree (~53 places): 1 district + 8 villages + ~23 grand crus + 1er-cru group per village + **Vosne-Romanée's 13 individual climats**.

### Nav + classification rules (exact)

| Level | kind | is_appellation | appellation_level | tier | min_zoom | label_min_zoom | parent |
|---|---|---|---|---|---|---|---|
| Côte de Nuits | SUBREGION | false | – | 2 | 8 | 8 | france.bourgogne |
| Village (e.g. Vosne-Romanée) | APPELLATION | true | communal | 3 | 10 | 10 | …cote-de-nuits |
| Grand cru (Échezeaux) | APPELLATION | true | grand_cru | 4 | 13 | 13 | its village |
| 1er-cru group (Vosne 1er cru) | SITE | true | premier_cru | 4 | 12 | 12 | its village |
| 1er-cru climat (Les Suchots) | SITE | true | premier_cru | 5 | 14 | 14 | its 1er-cru group |

`canonical_key` = slugged path, e.g. `france.bourgogne.cote-de-nuits.vosne-romanee.echezeaux`, `…vosne-romanee.premier-cru.les-suchots`. `sort_order` follows geographic N→S for villages, then alpha within a level.

### Step 1 — Boundaries (tooling, live DRAFT staging)

Fetch + build, in this order (children before parents so `derived` works):
1. **Villages** (8) — `--preset village`, exact membership (`Gevrey-Chambertin`, `Vosne-Romanée`, …).
2. **Grand crus** (~23) — `--preset grandcru`, exact denom from `burgundy-grand-crus.json`. Shared crus (Bonnes-Mares spans Chambolle+Morey) are one place under the primary village with an `OVERLAPS` note.
3. **Vosne climats** (13) — `--preset climat`, exact denom (`Vosne-Romanée premier cru Les Suchots`, …).
4. **1er-cru groups** — dissolve the aggregate denom (`Vosne-Romanée premier cru`) `--preset premiergroup`; for villages where we only model the group (not each climat yet), dissolve their aggregate too.
5. **District Côte de Nuits** is NOT staged here — `--engine derived` needs its villages VERIFIED+current first, so it is built in Step 4 Phase B, after the child flip.

Raw pages retained gzipped in `wine-map-sources`; each build stages a DRAFT boundary + provenance snapshot. Before staging the climats, take a rough z16 tile-count estimate over Burgundy's bbox; if it projects beyond the ~3 MB shard budget, cap climat detail at z15 now rather than waiting for the Task 6 gate.

### Step 2 — Catalog migration `20260805090000_cote_de_nuits.sql`

Insert all ~53 places (DRAFT) with the attributes above, classification facts, nav tree, `sort_order`, zoom. Generated from the curated lists + vocabulary by a committed generator (`scripts/wine-map-sources/generate-cote-de-nuits.mjs`) that also asserts every denom resolves. Legal edges (grand-cru declassification chain) are **deferred** with a note — not modelled in 3C. Dry-run through the harness (staged-count expectations), then live apply.

### Step 3 — Scoring links `20260805093000_cote_de_nuits_links.sql`

Audit live `appellations`/`regions` for Côte de Nuits names; link **by exact name only** (villages + grand crus most likely present; climats likely absent → PENDING, reported). Update foundation reference-link test counts.

### Step 4 — Review gate (owner) + two-phase flip

Generate preview SVGs + numeric sanity (component counts, vertices, bbox within Burgundy window 3.0–5.2 / 46.1–48.0) for all staged **child** boundaries (villages, grand crus, 1er-cru groups, Vosne climats). **Owner reviews** the shapes (esp. the tiny climats and grand crus).

- **Phase A — flip children.** On approval, `20260805096000_cote_de_nuits_flip.sql` flips the staged child boundaries → VALIDATED+current and their places → VERIFIED.
- **Phase B — build + flip the district.** Now the 8 villages are VERIFIED+current, so run `--engine derived` for `cote-de-nuits` (union of villages), quick-preview it, then `20260805097000_cote_de_nuits_district_flip.sql` flips the district boundary → VALIDATED+current and the district place → VERIFIED.

Then update foundation + context expectations (place count, Bourgogne→Côte de Nuits child, Vosne-Romanée children = its grand crus + 1er-cru group, the group's children = 13 climats). Live suites green. Commit + push per sub-step with review.

**Task 5 acceptance:** ~53 Côte de Nuits places VERIFIED with reviewed boundaries; Vosne-Romanée resolves to Échezeaux/Richebourg/… + a 1er-cru group of 13 climats; suites green live.

---

## Task 5c — Owner UX directives (2026-07-22, takes precedence; 5b waits on this)

Owner review of the live 5a slice ordered these fixes before any further region import:

1. **Finer boundary detail** for appellations/sites — the 4–12-vertex shapes are too crude. Fine presets (crus/climats ≈8 m tolerance, villages ≈30 m); re-stage all 23 Vosne boundaries, revision-flip them current (retire the coarse rows), regenerate `boundary-expectations.json`; generator presets updated so 5b+ imports inherit the finer detail.
2. **Click = drill-down**: selecting a place zooms so its children's reveal zoom is reached (camera target derives from children `min_zoom`, capped by shard max) — clicking Vosne-Romanée must show its crus/climats immediately.
3. **Label every island**: multi-part regions (Bourgogne) emit one label point per polygon component in the tiles (per-component `ST_PointOnSurface`), not a single point on the largest part.
4. **Colors + legend**: deterministic color per region (canonical-key segment carried as a `region` tile property), deeper levels as shades/opacity steps, plus an on-map legend explaining region colors and level shading.
5. **Bigger map + fullscreen**: viewport-scaled height (not fixed 420 px) and a fullscreen control.
6. **Searchable tree sidebar**: a folder-hierarchy of ALL verified places (new `get_wine_place_tree()` RPC, security-invoker, authenticated-only) with text search, expanded/highlighted current path — replacing the breadcrumb+pill "arrow" navigation; map and tree are two views of the same selection.

Verification: suites + tsc/eslint/build; boundary re-stage is dry-run-first with fail-closed guards like every flip. Owner reviews on the live map after republish.

## Task 6 — Publish, performance gate, owner map sign-off

**Goal:** ship it and prove it's fast.

### Step 1 — Owner triggers the tile workflow (promote)

Exports `world` + `bourgogne` shard (now deep), builds (world z0–7, bourgogne z4–16), validates, promotes the v2 manifest.

### Step 2 — Performance gate (controller, from here)

Measure and record against the spec budget:
- `world.pmtiles` < 100 KB; `bourgogne.pmtiles` < ~3 MB (report actual).
- Confirm the map loads `world` + only `bourgogne` when viewing Burgundy (≤2 archives).
- Note first-detail-paint feel at z8→z14 (district→climat reveal).
If `bourgogne.pmtiles` exceeds budget, cap climat zoom (z15) or split the shard by district and re-promote — decision recorded.

### Step 3 — Owner map sign-off

Owner walks the live path: Bourgogne → Côte de Nuits → Vosne-Romanée → (Échezeaux | 1er cru → Les Suchots), progressive zoom reveal, Bourgogne islands clean. Approve or list fixes (re-stage with tighter params → re-review).

### Step 4 — Record + close

Update CLAUDE.md wine-map rule (per-region shards, appellation levels, Burgundy depth) and the ledger. `HEAD == origin/master`.

**Task 6 acceptance:** Côte de Nuits live on the map with deep zoom; performance within budget; owner signed off. Ready for 3D (rest of Burgundy).

---

## Sequencing summary

1 (schema) → 2+3 (pipeline + UI, pushed together) → 4 (engine + Bourgogne fix) → 5 (Côte de Nuits data, owner review gate) → 6 (publish + perf + owner map gate). Migrations dry-run-first throughout; no heavy server dissolves; exact-name links; per-task review; owner gates at 5 (shapes) and 6 (live map).


