# Concave Wine Map Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragmented INAO parcel multipolygons with one clean concave cartographic footprint per Bordeaux map node.

**Architecture:** A reproducible Node script reads the existing official parcel-derived migration, extracts each area's exterior coordinates, and uses `concaveman` to produce one closed, hole-free `Polygon`. It first generates an all-component hull; only when that hull's longest edge exceeds 20% of its diagonal does it omit components below 2% of the dominant exterior component and regenerate once. This global rule currently changes Pauillac and Saint-Julien. The script writes a new data-only migration; the existing database schema and React map components remain unchanged.

**Tech Stack:** Node.js ESM, `concaveman`, Node's built-in test runner, Supabase Postgres JSONB, GeoJSON.

**Spec:** `docs/superpowers/specs/2026-07-19-concave-wine-map-boundaries-design.md`

## Global Constraints

- Work directly on `master` and push to `origin/master`; do not create a PR or worktree.
- Preserve `20260726090000_wine_map_inao_boundaries.sql` as the official parcel-derived source migration.
- Every generated geometry must be one GeoJSON `Polygon` containing exactly one closed exterior ring and no holes.
- Generate the all-component hull first. Only if its longest edge exceeds 20% of its diagonal, omit components below 2% of the dominant exterior component and regenerate once; this currently changes Pauillac and Saint-Julien without slug-specific branching.
- Do not change the hierarchy, schema, breadcrumbs, MapLibre layers, click resolution, or auto-fit behavior.
- Apply the migration through `pg.Client` using explicit pooler connection fields and a process environment variable for the database password. Never write the password to a file or commit it.
- Before the final commit, run `node --test`, `npx tsc --noEmit`, targeted ESLint, and `npm run build`.

---

### Task 1: Reproducible Concave-Envelope Generator

**Files:**
- Create: `scripts/generate-wine-map-concave-boundaries.mjs`
- Create: `scripts/generate-wine-map-concave-boundaries.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `parseBoundaryUpdates(sql: string): Array<{ slug: string, geometry: GeoJSONGeometry }>` extracts parcel geometries from the source migration.
- `createAllComponentEnvelope(geometry: GeoJSONGeometry): Polygon` returns the pre-adaptation all-component envelope.
- `createConcaveEnvelope(geometry: GeoJSONGeometry): Polygon` returns one hole-free, closed polygon.
- `validateEnvelope(geometry: Polygon): void` throws on malformed output.
- `renderMigration(updates): string` returns the complete generated migration text.
- Running `node scripts/generate-wine-map-concave-boundaries.mjs` writes `supabase/migrations/20260726100000_wine_map_concave_boundaries.sql`.

- [ ] **Step 1: Add failing generator tests**

Use `node:test` to assert that a synthetic fragmented `MultiPolygon` becomes a single `Polygon`, has one exactly closed ring, contains finite longitude/latitude pairs, and retains a concave indentation. Add an integration assertion that parsing `20260726090000_wine_map_inao_boundaries.sql` returns exactly these 13 slugs:

```js
const EXPECTED_SLUGS = [
  "bordeaux", "medoc", "haut-medoc", "saint-estephe", "pauillac",
  "saint-julien", "margaux", "pessac-leognan", "graves", "sauternes",
  "barsac", "saint-emilion", "pomerol",
];
```

For every source geometry, assert `createConcaveEnvelope` passes `validateEnvelope` and produces fewer positions than the source geometry.

- [ ] **Step 2: Run the tests and confirm the expected failure**

Run: `node --test scripts/generate-wine-map-concave-boundaries.test.mjs`

Expected: FAIL because `generate-wine-map-concave-boundaries.mjs` does not exist.

- [ ] **Step 3: Add `concaveman` and implement the generator**

Install `concaveman` as a development dependency. The generator must:

```js
const CONCAVITY = 2;
const EDGE_THRESHOLD_DIVISOR = 30;

const points = uniqueExteriorPositions(geometry);
const diagonal = Math.hypot(maxX - minX, maxY - minY);
const hull = concaveman(points, CONCAVITY, diagonal / EDGE_THRESHOLD_DIVISOR);
const ring = closeRing(removeAdjacentDuplicates(hull));
const envelope = { type: "Polygon", coordinates: [ring] };
validateEnvelope(envelope);
```

The script must sort updates in source order, round coordinates to 4 decimal places, include source attribution and the cartographic-generalization warning in the SQL header, and fail unless all 13 expected slugs are present exactly once.

- [ ] **Step 4: Run generator tests**

Run: `node --test scripts/generate-wine-map-concave-boundaries.test.mjs`

Expected: 0 failures.

### Task 2: Generate and Validate the Data Migration

**Files:**
- Create: `supabase/migrations/20260726100000_wine_map_concave_boundaries.sql`

**Interfaces:**
- Consumes the generator from Task 1 and the parcel geometries in `20260726090000_wine_map_inao_boundaries.sql`.
- Produces updated `wine_map_nodes.boundary_geojson` values for the same 13 slugs.

- [ ] **Step 1: Generate the migration**

Run: `node scripts/generate-wine-map-concave-boundaries.mjs`

Expected: reports 13 generated polygons and writes the migration.

- [ ] **Step 2: Validate migration output**

Run: `node --test scripts/generate-wine-map-concave-boundaries.test.mjs`

Expected: all tests pass, including parsing the generated migration and verifying every geometry is a one-ring `Polygon`.

- [ ] **Step 3: Produce a temporary SVG preview**

Generate a local SVG from the migration with each polygon drawn once and its slug labeled once. Inspect the SVG to verify that Margaux, Graves, and the other areas are coherent outer footprints without parcel holes or detached islands. Delete the preview before committing.

- [ ] **Step 4: Apply and verify the live migration**

Use a temporary Node script with `pg.Client` and these explicit fields:

```js
const client = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: 6543,
  user: "postgres.eqzwmkpeysqiihuojmuj",
  database: "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
```

Execute the new SQL inside a transaction, then insert version
`20260726100000`, name `wine_map_concave_boundaries`, and the SQL statement
array into `supabase_migrations.schema_migrations` using `on conflict
(version) do nothing`. Query the 13 slugs and assert that
`boundary_geojson->>'type' = 'Polygon'` and
`jsonb_array_length(boundary_geojson->'coordinates') = 1` for every row.
Delete the temporary apply script.

### Task 3: Documentation and Full Verification

**Files:**
- Modify: `CLAUDE.md:597-628`

**Interfaces:**
- Documents that displayed boundaries are generalized concave footprints, not legal parcel coverage.

- [ ] **Step 1: Update the map domain rule**

State that official INAO parcel geometries are retained as the source, while `20260726100000_wine_map_concave_boundaries.sql` replaces their fragmented display with one hole-free concave polygon per node. Note that internal white space and detached islands are intentionally absorbed into a cartographic footprint.

- [ ] **Step 2: Run all verification commands**

```powershell
node --test scripts/generate-wine-map-concave-boundaries.test.mjs
npx tsc --noEmit
npx eslint scripts/generate-wine-map-concave-boundaries.mjs scripts/generate-wine-map-concave-boundaries.test.mjs
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Review and commit only intended files**

Inspect `git status`, `git diff`, and `git log --oneline -10`. Stage the
generator, test, dependency lockfiles, migration, and domain documentation
only. Commit with a concise message describing generalized concave
appellation footprints.

- [ ] **Step 4: Push directly to master**

Run: `git push origin master`

Expected: `master -> master` succeeds.
