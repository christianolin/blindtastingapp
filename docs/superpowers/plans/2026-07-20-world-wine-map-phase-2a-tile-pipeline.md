# World Wine Map Phase 2A: Tile Publication Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the 14 verified wine places as immutable, versioned PMTiles archives on Supabase Storage through a fail-closed export → tippecanoe → validate → publish → promote pipeline running in GitHub Actions.

**Architecture:** Node scripts in `scripts/wine-map-tiles/` handle export (Supabase → GeoJSON), validation (PMTiles read-back gates), publish (upload + `wine_map_releases` record), and promote (manifest pointer flip). Only the tippecanoe build stage requires the CI runner; everything else runs locally on Windows. Promotion writes `tiles/manifest.json` last, so no failed run can activate a half-published release; rollback re-promotes a prior release.

**Tech Stack:** Node 22 (`node --test`), `pg`, `@supabase/supabase-js` (Storage), `pmtiles` (read-back), `@mapbox/vector-tile` + `pbf` (tile decode), tippecanoe 2.79.0 (CI-only), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-20-world-wine-map-phase-2-tile-pilot-design.md`

## Global Constraints

- Publish exactly the 14 `VERIFIED` places with current `VALIDATED` boundaries. Export aborts unless it reads exactly 14 places, 14 boundaries, 14 label points.
- `world.pmtiles` contains France + Bordeaux; `france.pmtiles` contains Bordeaux + the 12 appellations. Layers per archive: `places` (polygons) and `labels` (points).
- Tile feature properties, exactly: `id`, `key`, `name`, `kind`, `tier`, `parent_id`, `has_children`, `rank`, `attribution`, `min_zoom`, `label_min_zoom`. No article text, aliases, or provenance detail.
- Bucket `wine-map-tiles`, public read, writes only via service-role credential. Paths: `tiles/releases/<version>/world.pmtiles`, `tiles/releases/<version>/france.pmtiles`, `tiles/manifest.json`.
- `<version>` = `wine_map_releases.version`, UTC form `YYYYMMDDTHHMMSSZ`.
- Cache-control: release archives `max-age=31536000`; manifest `max-age=60`.
- Manifest is schema-versioned JSON (`schema_version: 1`) with the exact shape in Task 2's `buildManifest`.
- Tippecanoe pinned at felt/tippecanoe tag `2.79.0`, built in CI only. Identical inputs must produce identical archive checksums (verified by double-build in CI).
- Fail-closed everywhere: any gate failure marks the release `FAILED` and leaves the active manifest untouched. The manifest is always written after archives.
- No credential is ever committed. Scripts read `DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `NEXT_PUBLIC_SUPABASE_URL`/`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_NAME` from the process environment. CI provides them via GitHub Actions secrets.
- Database writes use the Phase 1 pooler pattern: host `aws-0-eu-central-1.pooler.supabase.com`, port `6543`, user `postgres.eqzwmkpeysqiihuojmuj`, database `postgres`.
- The Task 1 bucket migration is the ONLY pre-review live change in this plan (the hosting spike depends on it). It is additive and reversible (delete the bucket). Every other live effect happens in CI after the final review and push.
- No UI changes, no `pmtiles` usage in `src/`, no changes to `/knowledge/map`, no changes to scoring tables or `wine_map_nodes`. Those are Plan 2B.
- Work directly on `master`, commit per task, push only after final review (Task 8).
- After every native command in PowerShell steps, check `$LASTEXITCODE` and stop on failure.
- Required final verification: `node --test scripts/wine-map-tiles/*.test.mjs`, existing boundary tests, `npx tsc --noEmit`, targeted ESLint, `npm run build`, `git diff --check`.

---

## File Structure

- `supabase/migrations/20260728090000_wine_map_tiles_bucket.sql` — creates the public Storage bucket.
- `scripts/wine-map-tiles/lib.mjs` — shared pure helpers + storage/db clients (single source of constants).
- `scripts/wine-map-tiles/lib.test.mjs` — unit tests for every pure helper (no network).
- `scripts/wine-map-tiles/hosting-spike.mjs` — Storage acceptance test (range/CORS/cache), re-runnable.
- `scripts/wine-map-tiles/export.mjs` — DB → GeoJSON + `release.json` into `.tiles-build/`.
- `scripts/wine-map-tiles/build.mjs` — tippecanoe wrapper + determinism check (CI-only execution).
- `scripts/wine-map-tiles/validate.mjs` — PMTiles read-back quality gates (local files or public URLs).
- `scripts/wine-map-tiles/publish.mjs` — upload archives, record + validate release, mark `VALIDATED`/`FAILED`.
- `scripts/wine-map-tiles/promote.mjs` — write manifest, flip `ACTIVE`, supports rollback by version.
- `.github/workflows/wine-map-tiles.yml` — `workflow_dispatch` pipeline.
- `.gitignore` — adds `.tiles-build/`.
- `CLAUDE.md` — Phase 2A domain rule.

Interfaces consumed from Phase 1 (live schema): `wine_places` (`id`, `canonical_key`, `name`, `kind`, `display_tier`, `primary_parent_id`, `min_zoom`, `label_min_zoom`, `sort_order`, `publication_status`), `wine_place_boundaries` (`wine_place_id`, `source_snapshot_id`, `display_geometry`, `label_point`, `is_current`, `quality_status`), `wine_boundary_source_snapshots.source_id`, `wine_boundary_sources.source_namespace`, and `wine_map_releases` (`version` unique, `status` enum `BUILDING|VALIDATED|ACTIVE|RETIRED|FAILED`, `manifest_url`, `manifest_checksum_sha256`, `tile_checksums`, `feature_counts`, `build_inputs`, `validation_report`, `promoted_at`; one `ACTIVE` enforced by unique index; `ACTIVE` requires manifest url+checksum).

---

### Task 1: Storage Bucket And Hosting Acceptance Spike

**Files:**
- Create: `supabase/migrations/20260728090000_wine_map_tiles_bucket.sql`
- Create: `scripts/wine-map-tiles/hosting-spike.mjs`
- Scratch, then delete: `scripts/scratch-apply-tiles-bucket.mjs`

**Interfaces:**
- Produces: public bucket `wine-map-tiles` (live), and a re-runnable spike script proving range requests, CORS, and cache headers on the bucket.
- The spike uses a deterministic binary fixture. The pmtiles-client read-back of a REAL archive happens in `publish.mjs` (Task 6) before any promotion — together they satisfy the spec's hosting acceptance requirement (Task 7 amends the spec sentence accordingly).

- [ ] **Step 1: Write the bucket migration**

Create `supabase/migrations/20260728090000_wine_map_tiles_bucket.sql`:

```sql
-- Public tile bucket for the world wine map (Phase 2A).
-- Public read happens via /storage/v1/object/public/...; there are no
-- storage.objects policies, so anon/authenticated cannot write. Uploads go
-- through the service role in CI, which bypasses RLS.
insert into storage.buckets (id, name, public)
values ('wine-map-tiles', 'wine-map-tiles', true)
on conflict (id) do update set public = true;
```

- [ ] **Step 2: Apply the bucket migration live**

This is the plan's one pre-review live change (additive, reversible). Create the untracked scratch script `scripts/scratch-apply-tiles-bucket.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");
const path = "supabase/migrations/20260728090000_wine_map_tiles_bucket.sql";
const sql = await readFile(path, "utf8");

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ('20260728090000', 'wine_map_tiles_bucket', $1)`,
    [[sql]],
  );
  await client.query("commit");
  const check = await client.query(
    "select id, public from storage.buckets where id = 'wine-map-tiles'",
  );
  console.log(JSON.stringify(check.rows));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
```

Run (password set only for this process):

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
node scripts/scratch-apply-tiles-bucket.mjs
if ($LASTEXITCODE -ne 0) { throw "Bucket migration failed." }
Remove-Item Env:DB_PASSWORD
```

Expected output: `[{"id":"wine-map-tiles","public":true}]`. Delete the scratch script afterward.

Contingency: if the insert fails with a privilege error on `storage.buckets`, create the bucket in the Supabase dashboard instead (Storage → New bucket → `wine-map-tiles`, public), still commit the migration file, and record its version in `supabase_migrations.schema_migrations` so replays stay consistent.

- [ ] **Step 3: Write the hosting spike**

Create `scripts/wine-map-tiles/hosting-spike.mjs`:

```js
// Supabase Storage hosting acceptance test for PMTiles-style access:
// HTTP range requests, CORS toward the app origin, and cache-header
// round-trip on the public bucket. Re-runnable; cleans up after itself.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required");
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eqzwmkpeysqiihuojmuj.supabase.co";
const BUCKET = "wine-map-tiles";
const APP_ORIGIN = "https://blindrapp.vercel.app";

// 1 MiB deterministic pseudo-random buffer (sha256 chain, seed "blindr-spike").
function fixtureBuffer() {
  const chunks = [];
  let block = createHash("sha256").update("blindr-spike").digest();
  for (let i = 0; i < 32768; i += 1) {
    chunks.push(block);
    block = createHash("sha256").update(block).digest();
  }
  return Buffer.concat(chunks); // 32768 * 32 bytes = 1 MiB
}

const storage = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage.from(BUCKET);

const objectPath = `tiles/spike/${Date.now()}.bin`;
const fixture = fixtureBuffer();
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

const upload = await storage.upload(objectPath, fixture, {
  contentType: "application/octet-stream",
  cacheControl: "31536000",
  upsert: false,
});
assert.equal(upload.error, null, `upload failed: ${upload.error?.message}`);

try {
  const full = await fetch(publicUrl);
  const fullBody = Buffer.from(await full.arrayBuffer());
  record(
    "full GET",
    full.status === 200 && fullBody.equals(fixture),
    `status ${full.status}, ${fullBody.byteLength} bytes`,
  );
  const cacheControl = full.headers.get("cache-control") ?? "";
  record(
    "cache-control round-trip",
    cacheControl.includes("max-age=31536000"),
    cacheControl || "(missing)",
  );

  const ranged = await fetch(publicUrl, {
    headers: { Range: "bytes=100000-100999", Origin: APP_ORIGIN },
  });
  const rangedBody = Buffer.from(await ranged.arrayBuffer());
  record(
    "range request 206",
    ranged.status === 206 &&
      rangedBody.byteLength === 1000 &&
      rangedBody.equals(fixture.subarray(100000, 101000)),
    `status ${ranged.status}, ${rangedBody.byteLength} bytes, content-range ${ranged.headers.get("content-range")}`,
  );
  const acao = ranged.headers.get("access-control-allow-origin");
  record("CORS allow-origin", acao === "*" || acao === APP_ORIGIN, acao ?? "(missing)");

  const tail = await fetch(publicUrl, {
    headers: { Range: `bytes=${fixture.length - 16384}-${fixture.length - 1}` },
  });
  const tailBody = Buffer.from(await tail.arrayBuffer());
  record(
    "tail range (pmtiles directory reads)",
    tail.status === 206 && tailBody.equals(fixture.subarray(fixture.length - 16384)),
    `status ${tail.status}, ${tailBody.byteLength} bytes`,
  );
} finally {
  const removal = await storage.remove([objectPath]);
  if (removal.error) console.error(`cleanup failed: ${removal.error.message}`);
}

const failed = results.filter(({ pass }) => !pass);
if (failed.length > 0) {
  console.error(`Hosting spike FAILED ${failed.length}/${results.length} checks.`);
  process.exit(1);
}
console.log(`Hosting spike passed all ${results.length} checks.`);
```

- [ ] **Step 4: Run the spike against the live bucket**

Load only the needed names from `.env.local` without printing values:

```powershell
Get-Content .env.local | Where-Object { $_ -match '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' } | ForEach-Object { $n, $v = $_ -split '=', 2; Set-Item -Path "Env:$n" -Value $v.Trim().Trim('"') }
node scripts/wine-map-tiles/hosting-spike.mjs
$spikeExit = $LASTEXITCODE
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
if ($spikeExit -ne 0) { throw "Hosting spike failed — STOP: escalate host choice before any later task." }
```

Expected: `PASS` on all five checks and exit 0. If the spike fails, STOP the plan — the host decision must be revisited before Tasks 2-9 (only manifest URLs would change, but do not proceed on a failed host).

- [ ] **Step 5: Commit Task 1**

Confirm the scratch script is deleted, then:

```powershell
git add supabase/migrations/20260728090000_wine_map_tiles_bucket.sql scripts/wine-map-tiles/hosting-spike.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add wine map tile bucket and hosting spike"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 2: Shared Pipeline Library

**Files:**
- Create: `scripts/wine-map-tiles/lib.mjs`
- Create: `scripts/wine-map-tiles/lib.test.mjs`

**Interfaces:**
- Produces (consumed by Tasks 3-6): `EXPECTED_PLACES`, `WORLD_KEYS`, `BUCKET`, `WORK_DIR`, `SUPABASE_URL`, `ATTRIBUTION`, `attributionKeyFor(namespace)`, `attributionDisplayMap()`, `releaseVersion(date?)`, `sha256hex(buffer)`, `storagePublicUrl(objectPath)`, `releaseObjectPath(version, filename)`, `lonLatToTile(lon, lat, z)`, `placeFeature(row)`, `labelFeature(row)`, `featureCollection(features)`, `buildManifest({version, generatedAt, world, france, attribution})`, `pgConfig()`, `storageBucket()`, `uploadObject(objectPath, body, {contentType, cacheControlSeconds, upsert})`.
- Export row shape consumed by `placeFeature`/`labelFeature` (produced by Task 3's SQL): `{ id, canonical_key, name, kind, display_tier, primary_parent_id, min_zoom, label_min_zoom, sort_order, has_children, source_namespace, geometry, label_point }` where `geometry`/`label_point` are GeoJSON strings.

- [ ] **Step 1: Write the failing unit tests**

Create `scripts/wine-map-tiles/lib.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTION,
  attributionKeyFor,
  attributionDisplayMap,
  buildManifest,
  featureCollection,
  labelFeature,
  lonLatToTile,
  placeFeature,
  releaseObjectPath,
  releaseVersion,
  sha256hex,
  storagePublicUrl,
  WORLD_KEYS,
} from "./lib.mjs";

const EXPORT_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  canonical_key: "france.bordeaux",
  name: "Bordeaux",
  kind: "REGION",
  display_tier: 1,
  primary_parent_id: "22222222-2222-2222-2222-222222222222",
  min_zoom: 4,
  label_min_zoom: 4,
  sort_order: 0,
  has_children: true,
  source_namespace: "IGN_INAO_AOC_VITICOLES_LEGACY",
  geometry: '{"type":"MultiPolygon","coordinates":[[[[0,0],[1,0],[1,1],[0,0]]]]}',
  label_point: '{"type":"Point","coordinates":[-0.58,44.84]}',
};

test("releaseVersion formats a UTC compact timestamp", () => {
  assert.equal(releaseVersion(new Date("2026-07-20T14:00:00.000Z")), "20260720T140000Z");
});

test("sha256hex returns uppercase hex", () => {
  assert.equal(
    sha256hex(Buffer.from("abc")),
    "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD",
  );
});

test("storage paths and URLs are stable", () => {
  assert.equal(
    releaseObjectPath("20260720T140000Z", "world.pmtiles"),
    "tiles/releases/20260720T140000Z/world.pmtiles",
  );
  assert.match(
    storagePublicUrl("tiles/manifest.json"),
    /^https:\/\/.+\/storage\/v1\/object\/public\/wine-map-tiles\/tiles\/manifest\.json$/,
  );
});

test("lonLatToTile matches known slippy-map tiles", () => {
  assert.deepEqual(lonLatToTile(0, 0, 0), { z: 0, x: 0, y: 0 });
  assert.deepEqual(lonLatToTile(-0.58, 44.84, 4), { z: 4, x: 7, y: 5 });
  assert.deepEqual(lonLatToTile(2.35, 48.85, 7), { z: 7, x: 64, y: 44 });
});

test("placeFeature maps an export row to the exact tile properties", () => {
  const feature = placeFeature(EXPORT_ROW);
  assert.deepEqual(feature.properties, {
    id: EXPORT_ROW.id,
    key: "france.bordeaux",
    name: "Bordeaux",
    kind: "REGION",
    tier: 1,
    parent_id: EXPORT_ROW.primary_parent_id,
    has_children: true,
    rank: 0,
    attribution: "ign-inao",
    min_zoom: 4,
    label_min_zoom: 4,
  });
  assert.deepEqual(feature.tippecanoe, { minzoom: 4 });
  assert.equal(feature.geometry.type, "MultiPolygon");
});

test("labelFeature uses the label point and label_min_zoom", () => {
  const feature = labelFeature(EXPORT_ROW);
  assert.deepEqual(feature.geometry, { type: "Point", coordinates: [-0.58, 44.84] });
  assert.deepEqual(feature.tippecanoe, { minzoom: 4 });
  assert.equal(feature.properties.id, EXPORT_ROW.id);
});

test("fractional min_zoom floors and never goes below zero", () => {
  const france = placeFeature({ ...EXPORT_ROW, min_zoom: 1.5 });
  assert.equal(france.tippecanoe.minzoom, 1);
  assert.equal(france.properties.min_zoom, 1.5);
});

test("attribution keys reject unknown namespaces", () => {
  assert.equal(attributionKeyFor("BLINDR_MANUAL"), "blindr");
  assert.throws(() => attributionKeyFor("SOMETHING_ELSE"), /Unknown source namespace/);
  assert.deepEqual(attributionDisplayMap(), {
    blindr: ATTRIBUTION.BLINDR_MANUAL.text,
    "ign-inao": ATTRIBUTION.IGN_INAO_AOC_VITICOLES_LEGACY.text,
  });
});

test("buildManifest emits the schema_version 1 contract", () => {
  const archive = { url: "https://x/world.pmtiles", checksum_sha256: "A".repeat(64), bytes: 10 };
  const manifest = buildManifest({
    version: "20260720T140000Z",
    generatedAt: "2026-07-20T14:00:00.000Z",
    world: archive,
    france: archive,
    attribution: attributionDisplayMap(),
  });
  assert.deepEqual(manifest, {
    schema_version: 1,
    release_version: "20260720T140000Z",
    generated_at: "2026-07-20T14:00:00.000Z",
    world: archive,
    shards: { france: archive },
    attribution: attributionDisplayMap(),
  });
});

test("featureCollection wraps features", () => {
  assert.deepEqual(featureCollection([]), { type: "FeatureCollection", features: [] });
});

test("WORLD_KEYS pins the world archive contents", () => {
  assert.deepEqual(WORLD_KEYS, ["france", "france.bordeaux"]);
});
```

- [ ] **Step 2: Run tests, verify RED**

```powershell
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -eq 0) { throw "Expected RED (lib.mjs missing)." }
```

Expected: FAIL — `Cannot find module ... lib.mjs`.

- [ ] **Step 3: Implement `lib.mjs`**

Create `scripts/wine-map-tiles/lib.mjs`:

```js
// Shared constants and pure helpers for the wine map tile pipeline.
// Everything network-facing lives behind small factory functions so the
// pure helpers stay unit-testable without credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const EXPECTED_PLACES = 14;
export const WORLD_KEYS = ["france", "france.bordeaux"];
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
    attribution: attributionKeyFor(row.source_namespace),
    min_zoom: Number(row.min_zoom),
    label_min_zoom: Number(row.label_min_zoom),
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

export function labelFeature(row) {
  return {
    type: "Feature",
    properties: tileProperties(row),
    tippecanoe: { minzoom: Math.max(0, Math.floor(Number(row.label_min_zoom))) },
    geometry: JSON.parse(row.label_point),
  };
}

export function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

export function buildManifest({ version, generatedAt, world, france, attribution }) {
  return {
    schema_version: 1,
    release_version: version,
    generated_at: generatedAt,
    world,
    shards: { france },
    attribution,
  };
}

export function pgConfig() {
  assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");
  return {
    host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
    port: Number(process.env.DB_PORT ?? 6543),
    user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
    database: process.env.DB_NAME ?? "postgres",
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  };
}

export function storageBucket() {
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);
}

export async function uploadObject(objectPath, body, { contentType, cacheControlSeconds, upsert = false }) {
  const { error } = await storageBucket().upload(objectPath, body, {
    contentType,
    cacheControl: String(cacheControlSeconds),
    upsert,
  });
  if (error) throw new Error(`Upload ${objectPath} failed: ${error.message}`);
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```powershell
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "lib tests failed." }
```

Expected: all 11 tests pass, output pristine.

- [ ] **Step 5: Commit Task 2**

```powershell
git add scripts/wine-map-tiles/lib.mjs scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add wine map tile pipeline library"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 3: Export Stage

**Files:**
- Create: `scripts/wine-map-tiles/export.mjs`
- Modify: `.gitignore` (add `.tiles-build/`)

**Interfaces:**
- Consumes: `lib.mjs` helpers; live Phase 1 schema (read-only).
- Produces in `WORK_DIR` (consumed by Tasks 4-6): `world-places.geojson`, `world-labels.geojson`, `france-places.geojson`, `france-labels.geojson` (FeatureCollections), and `release.json` with shape `{ version, generated_at, git_sha, node, counts: { places, labels, by_kind }, expected: [{ id, key, tier, parent_id, label_lon, label_lat, archive }] }` where `archive` is `"world"`, `"france"`, or `"both"` (Bordeaux).

- [ ] **Step 1: Implement `export.mjs`**

```js
// Export stage: reads the 14 verified places + current validated boundaries
// from Supabase and writes tippecanoe-ready GeoJSON plus release.json into
// .tiles-build/. Fail-closed: aborts on any count or shape mismatch.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  EXPECTED_PLACES,
  WORK_DIR,
  WORLD_KEYS,
  featureCollection,
  labelFeature,
  pgConfig,
  placeFeature,
  releaseVersion,
} from "./lib.mjs";

const EXPORT_SQL = `
  select
    p.id::text as id,
    p.canonical_key,
    p.name,
    p.kind::text as kind,
    p.display_tier,
    p.primary_parent_id::text as primary_parent_id,
    p.min_zoom,
    p.label_min_zoom,
    p.sort_order,
    exists (
      select 1 from wine_places c
      where c.primary_parent_id = p.id and c.publication_status = 'VERIFIED'
    ) as has_children,
    s.source_namespace,
    extensions.ST_AsGeoJSON(b.display_geometry, 6) as geometry,
    extensions.ST_AsGeoJSON(b.label_point, 6) as label_point,
    extensions.ST_X(b.label_point) as label_lon,
    extensions.ST_Y(b.label_point) as label_lat
  from wine_places p
  join wine_place_boundaries b
    on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
  join wine_boundary_source_snapshots snap on snap.id = b.source_snapshot_id
  join wine_boundary_sources s on s.id = snap.source_id
  where p.publication_status = 'VERIFIED'
  order by p.canonical_key`;

const client = new pg.Client(pgConfig());
await client.connect();
let rows;
try {
  const verified = await client.query(
    "select count(*)::int as count from wine_places where publication_status = 'VERIFIED'",
  );
  assert.equal(verified.rows[0].count, EXPECTED_PLACES, "verified place count drifted");
  ({ rows } = await client.query(EXPORT_SQL));
} finally {
  await client.end();
}

assert.equal(rows.length, EXPECTED_PLACES, `expected ${EXPECTED_PLACES} exportable places, got ${rows.length}`);
assert.equal(new Set(rows.map(({ id }) => id)).size, EXPECTED_PLACES, "duplicate place ids");
for (const row of rows) {
  const geometry = JSON.parse(row.geometry);
  assert.equal(geometry.type, "MultiPolygon", `${row.canonical_key}: unexpected geometry type`);
  assert.equal(JSON.parse(row.label_point).type, "Point", `${row.canonical_key}: unexpected label type`);
}

const worldRows = rows.filter(({ canonical_key }) => WORLD_KEYS.includes(canonical_key));
const franceRows = rows.filter(({ canonical_key }) => canonical_key !== "france");
assert.equal(worldRows.length, 2, "world archive must contain France + Bordeaux");
assert.equal(franceRows.length, 13, "france shard must contain Bordeaux + 12 appellations");

await mkdir(WORK_DIR, { recursive: true });
const outputs = [
  ["world-places.geojson", featureCollection(worldRows.map(placeFeature))],
  ["world-labels.geojson", featureCollection(worldRows.map(labelFeature))],
  ["france-places.geojson", featureCollection(franceRows.map(placeFeature))],
  ["france-labels.geojson", featureCollection(franceRows.map(labelFeature))],
];
for (const [filename, collection] of outputs) {
  await writeFile(path.join(WORK_DIR, filename), `${JSON.stringify(collection)}\n`);
}

const byKind = {};
for (const { kind } of rows) byKind[kind] = (byKind[kind] ?? 0) + 1;
const release = {
  version: releaseVersion(),
  generated_at: new Date().toISOString(),
  git_sha: process.env.GITHUB_SHA ?? null,
  node: process.version,
  counts: { places: rows.length, labels: rows.length, by_kind: byKind },
  expected: rows.map((row) => ({
    id: row.id,
    key: row.canonical_key,
    tier: row.display_tier,
    parent_id: row.primary_parent_id,
    label_lon: Number(row.label_lon),
    label_lat: Number(row.label_lat),
    archive:
      row.canonical_key === "france"
        ? "world"
        : row.canonical_key === "france.bordeaux"
          ? "both"
          : "france",
  })),
};
await writeFile(path.join(WORK_DIR, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
console.log(
  `Exported ${rows.length} places (${JSON.stringify(byKind)}) as release ${release.version}.`,
);
```

- [ ] **Step 2: Add the work dir to `.gitignore`**

Append this exact line to `.gitignore`:

```
.tiles-build/
```

- [ ] **Step 3: Run the export live (read-only) and verify**

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
node scripts/wine-map-tiles/export.mjs
$exportExit = $LASTEXITCODE
Remove-Item Env:DB_PASSWORD
if ($exportExit -ne 0) { throw "Export failed." }
node -e "const r=require('./.tiles-build/release.json');const a=r.expected.filter(e=>e.archive!=='france').map(e=>e.key).sort();console.log(JSON.stringify({places:r.counts.places,by_kind:r.counts.by_kind,world:a}))"
if ($LASTEXITCODE -ne 0) { throw "release.json inspection failed." }
```

Expected export output: `Exported 14 places ({"COUNTRY":1,"REGION":1,"APPELLATION":12}) as release <version>.`
Expected inspection: `{"places":14,"by_kind":{"COUNTRY":1,"REGION":1,"APPELLATION":12},"world":["france","france.bordeaux"]}` and `git status --short` shows no `.tiles-build/` entries.

- [ ] **Step 4: Commit Task 3**

```powershell
git add scripts/wine-map-tiles/export.mjs .gitignore
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add wine map tile export stage"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 4: Build Stage (Tippecanoe Wrapper)

**Files:**
- Create: `scripts/wine-map-tiles/build.mjs`
- Modify: `scripts/wine-map-tiles/lib.mjs` (add `tippecanoeArgs`)
- Modify: `scripts/wine-map-tiles/lib.test.mjs` (add args tests)

**Interfaces:**
- Produces: `WORK_DIR/world.pmtiles`, `WORK_DIR/france.pmtiles` (CI-only execution); `tippecanoeArgs(target)` exported from `lib.mjs` where `target` is `"world"` or `"france"`.
- `node scripts/wine-map-tiles/build.mjs` builds both archives; `--check-determinism` rebuilds each archive in place from identical inputs and compares SHA-256s, exiting 1 on mismatch.

- [ ] **Step 1: Add failing args tests to `lib.test.mjs`**

Append:

```js
test("tippecanoeArgs pins zoom windows and layers per archive", async () => {
  const { tippecanoeArgs } = await import("./lib.mjs");
  assert.deepEqual(tippecanoeArgs("world"), [
    "-o", "world.pmtiles", "--force", "-Z0", "-z7", "-r1",
    "--no-progress-indicator",
    "-L", "places:world-places.geojson", "-L", "labels:world-labels.geojson",
  ]);
  assert.deepEqual(tippecanoeArgs("france"), [
    "-o", "france.pmtiles", "--force", "-Z4", "-z12", "-r1",
    "--no-progress-indicator",
    "-L", "places:france-places.geojson", "-L", "labels:france-labels.geojson",
  ]);
  assert.throws(() => tippecanoeArgs("mars"), /Unknown build target/);
});
```

Run and verify RED:

```powershell
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -eq 0) { throw "Expected RED (tippecanoeArgs missing)." }
```

- [ ] **Step 2: Add `tippecanoeArgs` to `lib.mjs`**

Append to `lib.mjs`:

```js
const BUILD_TARGETS = {
  world: { output: "world.pmtiles", minZoom: 0, maxZoom: 7 },
  france: { output: "france.pmtiles", minZoom: 4, maxZoom: 12 },
};

// Args are relative paths run with cwd=WORK_DIR so tippecanoe's embedded
// generator_options metadata stays machine-independent (determinism).
export function tippecanoeArgs(target) {
  const spec = BUILD_TARGETS[target];
  if (!spec) throw new Error(`Unknown build target: ${target}`);
  return [
    "-o", spec.output, "--force", `-Z${spec.minZoom}`, `-z${spec.maxZoom}`, "-r1",
    "--no-progress-indicator",
    "-L", `places:${target}-places.geojson`,
    "-L", `labels:${target}-labels.geojson`,
  ];
}
```

Verify GREEN: `node --test scripts/wine-map-tiles/lib.test.mjs` → all tests pass (`$LASTEXITCODE` 0).

- [ ] **Step 3: Implement `build.mjs`**

```js
// Build stage: runs tippecanoe (CI-only; the binary is not available on the
// Windows dev machine) with cwd=WORK_DIR. --check-determinism rebuilds each
// archive in place from identical inputs and compares SHA-256 checksums.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256hex, tippecanoeArgs, WORK_DIR } from "./lib.mjs";

const TARGETS = ["world", "france"];
const checkDeterminism = process.argv.includes("--check-determinism");

function runTippecanoe(target) {
  const result = spawnSync("tippecanoe", tippecanoeArgs(target), {
    cwd: WORK_DIR,
    stdio: "inherit",
  });
  assert.equal(result.status, 0, `tippecanoe ${target} failed (status ${result.status})`);
}

if (!checkDeterminism) {
  for (const target of TARGETS) runTippecanoe(target);
  console.log("Built world.pmtiles and france.pmtiles.");
} else {
  for (const target of TARGETS) {
    const first = sha256hex(await readFile(path.join(WORK_DIR, `${target}.pmtiles`)));
    runTippecanoe(target); // rebuild in place from identical inputs
    const second = sha256hex(await readFile(path.join(WORK_DIR, `${target}.pmtiles`)));
    assert.equal(second, first, `${target}.pmtiles is not deterministic`);
    console.log(`${target}.pmtiles deterministic: ${first}`);
  }
}
```

- [ ] **Step 4: Syntax-check (execution happens in CI)**

```powershell
node --check scripts/wine-map-tiles/build.mjs
if ($LASTEXITCODE -ne 0) { throw "build.mjs syntax check failed." }
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "lib tests failed." }
```

- [ ] **Step 5: Commit Task 4**

```powershell
git add scripts/wine-map-tiles/build.mjs scripts/wine-map-tiles/lib.mjs scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add tippecanoe build stage"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 5: Validation Gates

**Files:**
- Create: `scripts/wine-map-tiles/validate.mjs`
- Modify: `scripts/wine-map-tiles/lib.mjs` (add `NodeFileSource`, `decodeTileFeatures`, `expectedIdSets`)
- Modify: `scripts/wine-map-tiles/lib.test.mjs` (add pure-helper tests)

**Interfaces:**
- Consumes: `WORK_DIR` archives + `release.json` (Task 3/4), `pmtiles`, `@mapbox/vector-tile`, `pbf`.
- Produces: `validateArchives(sources, release)` exported from `validate.mjs` returning `{ gates: [...], featureCounts }` and throwing on any failure — reused by `publish.mjs` (Task 6) against remote `FetchSource`s. CLI: `node scripts/wine-map-tiles/validate.mjs local`.
- `expectedIdSets(release)` (in `lib.mjs`) returns `{ world: Set<id>, france: Set<id> }` derived from `release.expected[].archive` (`"both"` appears in both sets).

- [ ] **Step 1: Add failing pure-helper tests to `lib.test.mjs`**

Append:

```js
test("expectedIdSets splits ids by archive with Bordeaux in both", async () => {
  const { expectedIdSets } = await import("./lib.mjs");
  const release = {
    expected: [
      { id: "a", archive: "world" },
      { id: "b", archive: "both" },
      { id: "c", archive: "france" },
    ],
  };
  const sets = expectedIdSets(release);
  assert.deepEqual([...sets.world].sort(), ["a", "b"]);
  assert.deepEqual([...sets.france].sort(), ["b", "c"]);
});
```

Run `node --test scripts/wine-map-tiles/lib.test.mjs` and confirm RED (`expectedIdSets` missing; `$LASTEXITCODE` non-zero).

- [ ] **Step 2: Add the helpers to `lib.mjs`**

Append:

```js
export function expectedIdSets(release) {
  const world = new Set();
  const france = new Set();
  for (const { id, archive } of release.expected) {
    if (archive === "world" || archive === "both") world.add(id);
    if (archive === "france" || archive === "both") france.add(id);
  }
  return { world, france };
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
```

Run `node --test scripts/wine-map-tiles/lib.test.mjs` and confirm GREEN (all tests pass).

- [ ] **Step 3: Implement `validate.mjs`**

```js
// Validation gates: open each archive with the pmtiles client, verify header
// zoom windows and layer metadata, then decode the tiles at every expected
// label point at the archive's max zoom and assert the exact feature-id sets
// for both layers. Reused by publish.mjs against remote FetchSources.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PMTiles } from "pmtiles";
import {
  decodeTileFeatures,
  expectedIdSets,
  lonLatToTile,
  NodeFileSource,
  WORK_DIR,
} from "./lib.mjs";

const ARCHIVE_SPECS = {
  world: { minZoom: 0, maxZoom: 7 },
  france: { minZoom: 4, maxZoom: 12 },
};
const FRANCE_BBOX = { minLon: -6, minLat: 41, maxLon: 11, maxLat: 52 };

export async function validateArchives(sources, release) {
  const idSets = expectedIdSets(release);
  const gates = [];
  const featureCounts = {};

  for (const [name, spec] of Object.entries(ARCHIVE_SPECS)) {
    const pmt = new PMTiles(sources[name]);
    const header = await pmt.getHeader();
    assert.equal(header.minZoom, spec.minZoom, `${name}: header minZoom`);
    assert.equal(header.maxZoom, spec.maxZoom, `${name}: header maxZoom`);
    assert.equal(header.tileType, 1, `${name}: tileType must be MVT`);
    assert.ok(
      header.minLon >= FRANCE_BBOX.minLon && header.maxLon <= FRANCE_BBOX.maxLon &&
      header.minLat >= FRANCE_BBOX.minLat && header.maxLat <= FRANCE_BBOX.maxLat,
      `${name}: bounds outside France bbox`,
    );
    gates.push(`${name}: header ok (z${header.minZoom}-z${header.maxZoom})`);

    const metadata = await pmt.getMetadata();
    const layerNames = (metadata.vector_layers ?? []).map(({ id }) => id).sort();
    assert.deepEqual(layerNames, ["labels", "places"], `${name}: vector layers`);
    gates.push(`${name}: layers ok`);

    const expectedIds = idSets[name];
    const seen = { places: new Set(), labels: new Set() };
    const expectedRows = release.expected.filter(({ id }) => expectedIds.has(id));
    for (const row of expectedRows) {
      const { z, x, y } = lonLatToTile(row.label_lon, row.label_lat, spec.maxZoom);
      const tile = await pmt.getZxy(z, x, y);
      assert.ok(tile?.data, `${name}: missing tile ${z}/${x}/${y} for ${row.key}`);
      const layers = await decodeTileFeatures(tile.data);
      for (const layer of ["places", "labels"]) {
        for (const properties of layers[layer] ?? []) {
          if (expectedIds.has(properties.id)) seen[layer].add(properties.id);
          assert.ok(idSets.world.has(properties.id) || idSets.france.has(properties.id),
            `${name}/${layer}: unexpected feature id ${properties.id}`);
          assert.equal(typeof properties.key, "string", `${name}/${layer}: missing key`);
          assert.equal(typeof properties.tier, "number", `${name}/${layer}: missing tier`);
        }
      }
    }
    for (const layer of ["places", "labels"]) {
      const missing = [...expectedIds].filter((id) => !seen[layer].has(id));
      assert.equal(missing.length, 0, `${name}/${layer}: missing ids ${missing.join(",")}`);
    }
    featureCounts[name] = { places: seen.places.size, labels: seen.labels.size };
    gates.push(`${name}: all ${expectedIds.size} ids present in places+labels`);
  }
  return { gates, featureCounts };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const mode = process.argv[2];
  if (mode !== "local") {
    throw new Error(`validate.mjs requires mode "local" when run directly, got ${mode}`);
  }
  const release = JSON.parse(await readFile(path.join(WORK_DIR, "release.json"), "utf8"));
  const { gates, featureCounts } = await validateArchives(
    {
      world: new NodeFileSource(path.join(WORK_DIR, "world.pmtiles")),
      france: new NodeFileSource(path.join(WORK_DIR, "france.pmtiles")),
    },
    release,
  );
  for (const gate of gates) console.log(`GATE ${gate}`);
  console.log(`Local validation passed: ${JSON.stringify(featureCounts)}`);
}
```

- [ ] **Step 4: Verify checks pass locally**

```powershell
node --check scripts/wine-map-tiles/validate.mjs
if ($LASTEXITCODE -ne 0) { throw "validate.mjs syntax check failed." }
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "lib tests failed." }
```

(Full gate execution needs real archives — it runs in CI in Task 7 and is also exercised remotely by `publish.mjs`.)

- [ ] **Step 5: Commit Task 5**

```powershell
git add scripts/wine-map-tiles/validate.mjs scripts/wine-map-tiles/lib.mjs scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add pmtiles validation gates"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 6: Publish And Promote Stages

**Files:**
- Create: `scripts/wine-map-tiles/publish.mjs`
- Create: `scripts/wine-map-tiles/promote.mjs`

**Interfaces:**
- Consumes: `WORK_DIR` archives + `release.json`; `validateArchives` from `validate.mjs`; `lib.mjs` helpers; live `wine_map_releases` (writes).
- Produces: a `VALIDATED` (or `FAILED`) `wine_map_releases` row whose `tile_checksums` is `{ world: { path, bytes, checksum_sha256 }, france: { ... } }`; uploaded immutable archives; and `promote.mjs [version]` which writes `tiles/manifest.json`, retires the previous `ACTIVE`, and activates the target (rollback = promote an earlier version). A run that crashes before the FAILED update may leave an inert `BUILDING` row; these are harmless (every run uses a fresh version) and may be cleaned up manually later.

- [ ] **Step 1: Implement `publish.mjs`**

```js
// Publish stage: record the release (BUILDING), upload both archives to
// immutable versioned paths, re-run the validation gates through the PUBLIC
// URLS (the real-PMTiles hosting acceptance), then mark VALIDATED. Any
// failure marks the release FAILED and exits 1; the manifest is untouched.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { FetchSource } from "pmtiles";
import {
  pgConfig,
  releaseObjectPath,
  sha256hex,
  storagePublicUrl,
  uploadObject,
  WORK_DIR,
} from "./lib.mjs";
import { validateArchives } from "./validate.mjs";

const release = JSON.parse(await readFile(path.join(WORK_DIR, "release.json"), "utf8"));
const archives = {};
for (const name of ["world", "france"]) {
  const body = await readFile(path.join(WORK_DIR, `${name}.pmtiles`));
  archives[name] = {
    body,
    path: releaseObjectPath(release.version, `${name}.pmtiles`),
    bytes: body.byteLength,
    checksum_sha256: sha256hex(body),
  };
}

const client = new pg.Client(pgConfig());
await client.connect();
let releaseId;
try {
  const inserted = await client.query(
    `insert into wine_map_releases (version, status, tile_checksums, feature_counts, build_inputs)
     values ($1, 'BUILDING', $2, $3, $4)
     returning id`,
    [
      release.version,
      JSON.stringify({
        world: { path: archives.world.path, bytes: archives.world.bytes, checksum_sha256: archives.world.checksum_sha256 },
        france: { path: archives.france.path, bytes: archives.france.bytes, checksum_sha256: archives.france.checksum_sha256 },
      }),
      JSON.stringify(release.counts),
      JSON.stringify({
        git_sha: release.git_sha,
        node: release.node,
        tippecanoe: "2.79.0",
        generated_at: release.generated_at,
      }),
    ],
  );
  releaseId = inserted.rows[0].id;

  try {
    for (const name of ["world", "france"]) {
      await uploadObject(archives[name].path, archives[name].body, {
        contentType: "application/octet-stream",
        cacheControlSeconds: 31536000,
        upsert: false,
      });
      console.log(`Uploaded ${archives[name].path} (${archives[name].bytes} bytes).`);
    }

    // Remote read-back through the public URLs: proves range requests work
    // on a REAL PMTiles archive before this release can ever be promoted.
    const { gates, featureCounts } = await validateArchives(
      {
        world: new FetchSource(storagePublicUrl(archives.world.path)),
        france: new FetchSource(storagePublicUrl(archives.france.path)),
      },
      release,
    );
    for (const gate of gates) console.log(`REMOTE GATE ${gate}`);

    const ranged = await fetch(storagePublicUrl(archives.world.path), {
      headers: { Range: "bytes=0-16383", Origin: "https://blindrapp.vercel.app" },
    });
    assert.equal(ranged.status, 206, "expected 206 for ranged archive read");
    const acao = ranged.headers.get("access-control-allow-origin");
    assert.ok(acao === "*" || acao === "https://blindrapp.vercel.app", "missing CORS header");

    await client.query(
      `update wine_map_releases
       set status = 'VALIDATED', validation_report = $2
       where id = $1`,
      [
        releaseId,
        JSON.stringify({ gates, feature_counts: featureCounts, remote: { ranged_status: 206, cors: acao } }),
      ],
    );
    console.log(`Release ${release.version} VALIDATED.`);
  } catch (error) {
    try {
      await client.query(
        `update wine_map_releases set status = 'FAILED', validation_report = $2 where id = $1`,
        [releaseId, JSON.stringify({ error: String(error?.message ?? error) })],
      );
    } catch (updateError) {
      // Never let the bookkeeping failure mask the root cause.
      console.error(`could not mark release FAILED: ${updateError.message}`);
    }
    throw error;
  }
} finally {
  await client.end();
}
```

- [ ] **Step 2: Implement `promote.mjs`**

```js
// Promotion: write tiles/manifest.json pointing at a VALIDATED (or, for
// rollback, RETIRED) release, then flip statuses in one transaction. The
// manifest is written BEFORE the DB flip; if the flip fails, re-running
// promote converges. Rollback = promote an earlier version explicitly.
import assert from "node:assert/strict";
import pg from "pg";
import {
  attributionDisplayMap,
  buildManifest,
  pgConfig,
  sha256hex,
  storagePublicUrl,
  uploadObject,
} from "./lib.mjs";

const requestedVersion = process.argv[2] ?? null;
const client = new pg.Client(pgConfig());
await client.connect();
try {
  const target = requestedVersion
    ? await client.query(
        `select id, version, status, tile_checksums from wine_map_releases where version = $1`,
        [requestedVersion],
      )
    : await client.query(
        `select id, version, status, tile_checksums from wine_map_releases
         where status = 'VALIDATED' order by created_at desc limit 1`,
      );
  assert.equal(target.rows.length, 1, "no promotable release found");
  const row = target.rows[0];
  assert.ok(
    ["VALIDATED", "RETIRED", "ACTIVE"].includes(row.status),
    `release ${row.version} is ${row.status}; cannot promote a FAILED/BUILDING release`,
  );

  const manifest = buildManifest({
    version: row.version,
    generatedAt: new Date().toISOString(),
    world: {
      url: storagePublicUrl(row.tile_checksums.world.path),
      checksum_sha256: row.tile_checksums.world.checksum_sha256,
      bytes: row.tile_checksums.world.bytes,
    },
    france: {
      url: storagePublicUrl(row.tile_checksums.france.path),
      checksum_sha256: row.tile_checksums.france.checksum_sha256,
      bytes: row.tile_checksums.france.bytes,
    },
    attribution: attributionDisplayMap(),
  });
  const body = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await uploadObject("tiles/manifest.json", body, {
    contentType: "application/json",
    cacheControlSeconds: 60,
    upsert: true,
  });
  const manifestChecksum = sha256hex(body);

  await client.query("begin");
  await client.query(
    `update wine_map_releases set status = 'RETIRED' where status = 'ACTIVE' and id <> $1`,
    [row.id],
  );
  await client.query(
    `update wine_map_releases
     set status = 'ACTIVE', promoted_at = now(), manifest_url = $2, manifest_checksum_sha256 = $3
     where id = $1`,
    [row.id, storagePublicUrl("tiles/manifest.json"), manifestChecksum],
  );
  await client.query("commit");

  const readBack = await fetch(storagePublicUrl("tiles/manifest.json"), { cache: "no-store" });
  const readBody = Buffer.from(await readBack.arrayBuffer());
  assert.equal(readBack.status, 200, "manifest read-back failed");
  assert.equal(sha256hex(readBody), manifestChecksum, "manifest checksum mismatch after upload");
  console.log(`PROMOTED ${row.version} (manifest ${manifestChecksum.slice(0, 12)}…).`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
```

- [ ] **Step 3: Verify syntax and full unit suite**

```powershell
node --check scripts/wine-map-tiles/publish.mjs
if ($LASTEXITCODE -ne 0) { throw "publish.mjs syntax check failed." }
node --check scripts/wine-map-tiles/promote.mjs
if ($LASTEXITCODE -ne 0) { throw "promote.mjs syntax check failed." }
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "lib tests failed." }
```

- [ ] **Step 4: Commit Task 6**

```powershell
git add scripts/wine-map-tiles/publish.mjs scripts/wine-map-tiles/promote.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add tile release publish and promote stages"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 7: CI Workflow, New Dependencies, And Documentation

**Files:**
- Create: `.github/workflows/wine-map-tiles.yml`
- Modify: `package.json` + `package-lock.json` (add dev deps `pmtiles`, `@mapbox/vector-tile`, `pbf`)
- Modify: `scripts/wine-map-tiles/lib.test.mjs` (tile-decode dependency test)
- Modify: `CLAUDE.md` (Phase 2A domain rule)
- Modify: `docs/superpowers/specs/2026-07-20-world-wine-map-phase-2-tile-pilot-design.md` (hosting-spike sentence)

**Interfaces:**
- Produces: `workflow_dispatch` pipeline with boolean `promote` input; secrets contract `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` (set by the owner in GitHub before Task 9).

- [ ] **Step 1: Install the pipeline dependencies**

```powershell
npm install --save-dev pmtiles@4.4.1 @mapbox/vector-tile@3.0.0 pbf@5.1.2
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
```

Append this test to `scripts/wine-map-tiles/lib.test.mjs` — it needs the freshly installed packages, which is why it lands in this task (it would catch a wrong `pbf` import shape before CI does):

```js
test("tile decode dependencies expose the expected API", async () => {
  const { PbfReader } = await import("pbf");
  const { VectorTile } = await import("@mapbox/vector-tile");
  // .layers is a null-prototype object; spread it so strict deepEqual
  // compares contents rather than prototypes.
  assert.deepEqual({ ...new VectorTile(new PbfReader(new Uint8Array())).layers }, {});
  const { decodeTileFeatures } = await import("./lib.mjs");
  assert.deepEqual(await decodeTileFeatures(new ArrayBuffer(0)), {});
});
```

Then run:

```powershell
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "lib tests failed after install." }
```

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/wine-map-tiles.yml`:

```yaml
name: Wine Map Tiles

on:
  workflow_dispatch:
    inputs:
      promote:
        description: "Promote the release after validation"
        type: boolean
        required: false
        default: false

concurrency:
  group: wine-map-tiles
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-24.04
    env:
      NEXT_PUBLIC_SUPABASE_URL: https://eqzwmkpeysqiihuojmuj.supabase.co
      DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Cache tippecanoe
        id: cache-tippecanoe
        uses: actions/cache@v4
        with:
          path: ~/tippecanoe-bin
          key: tippecanoe-2.79.0
      - name: Build tippecanoe 2.79.0
        if: steps.cache-tippecanoe.outputs.cache-hit != 'true'
        run: |
          sudo apt-get update
          sudo apt-get install -y libsqlite3-dev zlib1g-dev
          git clone --depth 1 --branch 2.79.0 https://github.com/felt/tippecanoe.git "$RUNNER_TEMP/tippecanoe"
          make -C "$RUNNER_TEMP/tippecanoe" -j"$(nproc)"
          mkdir -p ~/tippecanoe-bin
          cp "$RUNNER_TEMP/tippecanoe/tippecanoe" ~/tippecanoe-bin/
      - name: Add tippecanoe to PATH
        run: echo "$HOME/tippecanoe-bin" >> "$GITHUB_PATH"
      - run: tippecanoe --version
      - run: node --test scripts/wine-map-tiles/lib.test.mjs
      - run: node scripts/wine-map-tiles/export.mjs
      - run: node scripts/wine-map-tiles/build.mjs
      - run: node scripts/wine-map-tiles/build.mjs --check-determinism
      - run: node scripts/wine-map-tiles/validate.mjs local
      - run: node scripts/wine-map-tiles/publish.mjs
      - name: Promote release
        if: inputs.promote
        run: node scripts/wine-map-tiles/promote.mjs
      - name: Upload build artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tiles-build
          path: |
            .tiles-build/release.json
            .tiles-build/*.geojson
          retention-days: 7
```

- [ ] **Step 3: Update `CLAUDE.md`**

Add this exact bullet immediately after the World Wine Map Phase 1 bullet:

```markdown
- World Wine Map Phase 2A publishes the 14 verified places as immutable PMTiles
  releases. `scripts/wine-map-tiles/` holds the pipeline (export → tippecanoe →
  validate → publish → promote); tippecanoe 2.79.0 runs only in the
  `wine-map-tiles` GitHub Actions workflow. Storage bucket `wine-map-tiles` is
  public-read; archives live at `tiles/releases/<version>/` with immutable
  cache headers and `tiles/manifest.json` (max-age=60) is the only mutable
  pointer — promotion/rollback rewrite the manifest and flip
  `wine_map_releases.status`; archives are never mutated. Releases that fail
  any gate are recorded `FAILED` and never promoted. The map UI still reads
  `wine_map_nodes`; consuming the manifest is Phase 2B.
```

- [ ] **Step 4: Amend the Phase 2 spec's hosting-spike sentence**

In `docs/superpowers/specs/2026-07-20-world-wine-map-phase-2-tile-pilot-design.md`, replace:

```markdown
- **Hosting: Supabase Storage, gated by an acceptance spike.** A spike script must
  prove HTTP range requests, CORS from the app origin, cache-header control, and
  acceptable file sizes on a real PMTiles file before any pipeline work builds on
  the bucket. If the spike fails, choose another host; only manifest URLs change.
```

with:

```markdown
- **Hosting: Supabase Storage, gated by an acceptance spike.** A spike script must
  prove HTTP range requests, CORS from the app origin, and cache-header control
  on a binary fixture before any pipeline work builds on the bucket, and the
  publish stage must re-prove range reads through the pmtiles client on the real
  archives before a release can be promoted. If either fails, choose another
  host; only manifest URLs change.
```

- [ ] **Step 5: Verify and commit Task 7**

```powershell
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "TypeScript failed." }
npx eslint scripts/wine-map-tiles/lib.mjs scripts/wine-map-tiles/lib.test.mjs scripts/wine-map-tiles/hosting-spike.mjs scripts/wine-map-tiles/export.mjs scripts/wine-map-tiles/build.mjs scripts/wine-map-tiles/validate.mjs scripts/wine-map-tiles/publish.mjs scripts/wine-map-tiles/promote.mjs
if ($LASTEXITCODE -ne 0) { throw "ESLint failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }
git add .github/workflows/wine-map-tiles.yml package.json package-lock.json scripts/wine-map-tiles/lib.test.mjs CLAUDE.md docs/superpowers/specs/2026-07-20-world-wine-map-phase-2-tile-pilot-design.md
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add wine map tile CI workflow and docs"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 8: Final Review And Push

**Files:** none created; review + push of Tasks 1-7.

- [ ] **Step 1: Full repository verification**

```powershell
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "pipeline unit tests failed." }
node --test scripts/generate-wine-map-concave-boundaries.test.mjs
if ($LASTEXITCODE -ne 0) { throw "boundary tests failed." }
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "TypeScript failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "Whitespace check failed." }
```

Also confirm no Phase 1 regression surface: `git diff --name-only origin/master..HEAD` must contain no path under `src/` (this plan touches no application code).

- [ ] **Step 2: Request whole-branch code review**

Capture the range (`$base = git merge-base origin/master HEAD`, `$head = git rev-parse HEAD`) and dispatch the reviewer with this plan, the Phase 2 spec, and the diff. Resolve every Critical/Important finding, commit fixes, and re-review if any script, migration, or workflow changed.

- [ ] **Step 3: Push**

```powershell
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed." }
$status = git status --porcelain
if ($status) { throw "Worktree must be clean before push.`n$status" }
$counts = (git rev-list --left-right --count origin/master...HEAD) -split '\s+'
if ([int]$counts[0] -ne 0) { throw "origin/master has remote-only commits." }
git push origin master
if ($LASTEXITCODE -ne 0) { throw "git push failed." }
```

---

### Task 9: First Release, Promotion, And Rollback Drill (post-push, owner-in-the-loop)

**Files:** none; live CI operation and verification.

- [ ] **Step 1: Owner sets GitHub Actions secrets (USER ACTION — pause and ask)**

In GitHub → repo → Settings → Secrets and variables → Actions, add:
- `SUPABASE_DB_PASSWORD` (the database password)
- `SUPABASE_SERVICE_ROLE_KEY` (from `.env.local`)

Wait for the owner's confirmation before continuing.

- [ ] **Step 2: First pipeline run (no promote)**

Owner (or agent via API if available) triggers **Actions → Wine Map Tiles → Run workflow** with `promote` unchecked. Expected: all steps green, `tippecanoe v2.79.0`, determinism check passes, local + remote gates all print, `Release <v1> VALIDATED.`

Verify from the dev machine (read-only):

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD first." }
node -e "import('pg').then(async ({default:pg})=>{const c=new pg.Client({host:'aws-0-eu-central-1.pooler.supabase.com',port:6543,user:'postgres.eqzwmkpeysqiihuojmuj',database:'postgres',password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false}});await c.connect();const r=await c.query('select version,status,manifest_url from wine_map_releases order by created_at');console.log(JSON.stringify(r.rows));await c.end()})"
$checkExit = $LASTEXITCODE
Remove-Item Env:DB_PASSWORD
if ($checkExit -ne 0) { throw "release check failed." }
```

Expected: one row, `status: "VALIDATED"`, `manifest_url: null`. `tiles/manifest.json` must return a 4xx not-found status — Supabase returns 400 or 404 depending on storage-api version; anything but 200 (nothing promoted yet).

- [ ] **Step 3: Promote v1**

Re-run the workflow with `promote` checked (a second release v2 is created and promoted — that is fine and expected; each run is a fresh version). Expected: `PROMOTED <v2>`. Verify the manifest:

```powershell
node -e "fetch('https://eqzwmkpeysqiihuojmuj.supabase.co/storage/v1/object/public/wine-map-tiles/tiles/manifest.json',{cache:'no-store'}).then(async r=>{const m=await r.json();console.log(r.status, m.schema_version, m.release_version, Object.keys(m.shards).join(','))})"
if ($LASTEXITCODE -ne 0) { throw "manifest fetch failed." }
```

Expected: `200 1 <v2> france`. The DB now shows v1 `VALIDATED`, v2 `ACTIVE`.

- [ ] **Step 4: Rollback drill**

From the dev machine, promote v1 explicitly, verify, then restore v2:

```powershell
Get-Content .env.local | Where-Object { $_ -match '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' } | ForEach-Object { $n, $v = $_ -split '=', 2; Set-Item -Path "Env:$n" -Value $v.Trim().Trim('"') }
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD first." }
node scripts/wine-map-tiles/promote.mjs <v1>
if ($LASTEXITCODE -ne 0) { throw "rollback promote failed." }
node scripts/wine-map-tiles/promote.mjs <v2>
$promoteExit = $LASTEXITCODE
Remove-Item Env:DB_PASSWORD
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
if ($promoteExit -ne 0) { throw "re-promote failed." }
```

After the first command the manifest's `release_version` must equal v1; after the second, v2. This satisfies the spec's "rollback demonstrated once."

- [ ] **Step 5: Record completion**

Append the outcome (versions, statuses, manifest URL) to the progress ledger. Phase 2A is complete; Plan 2B (tile UI + parity + promotion of the UI) is written next, consuming `tiles/manifest.json`.
