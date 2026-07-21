# World Wine Map Phase 2B — Tile UI, Parity, Promotion, Retirement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the tile-based wine map UI reading the live PMTiles releases (opt-in at `/knowledge/map?map=tiles`), pass the owner parity gate, promote it to the default map, and retire `wine_map_nodes`.

**Architecture:** A new `get_wine_place_context(p_place_key)` RPC (security invoker, RLS-bound) provides one bounded context fetch per selection. A small client library fetches/validates `tiles/manifest.json` and the RPC response. A MapLibre component renders `world.pmtiles` + the france shard through the pmtiles protocol; an explorer component owns selection state, URL state (`?place=`), breadcrumb/pills/details, and fallbacks. The old `wine_map_nodes` path stays the default until the owner approves parity; promotion and retirement are separate revertible commits.

**Tech Stack:** Next.js 16 (Promise-based `searchParams`), react-map-gl 8 / maplibre-gl 5, pmtiles 4.4.1 (moves to `dependencies`), Supabase (RLS, RPC), PostgreSQL migrations, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-07-20-world-wine-map-phase-2-tile-pilot-design.md`

## Global Constraints

- The tile UI is reachable only via `?map=tiles` until Task 5; the default `/knowledge/map` experience must remain byte-identical to today's until then.
- Live manifest URL (the only mutable object): `https://eqzwmkpeysqiihuojmuj.supabase.co/storage/v1/object/public/wine-map-tiles/tiles/manifest.json` (schema_version 1).
- The RPC is `security invoker`; RLS already restricts authenticated users to `VERIFIED` places, `PLACEHOLDER|PUBLISHED` articles, and current `VALIDATED` boundaries. Execute is granted to `authenticated` only.
- No service keys, no `DB_PASSWORD`, no credentials in any committed file. Database work uses the pooler env pattern (`DB_PASSWORD` process-env only).
- No changes to scoring tables, scoring functions, or reference UUIDs. `wine_map_nodes` is not touched until Task 6.
- Pushes to `master` auto-deploy to blindrapp.vercel.app. The Task 4 push exposes only the opt-in URL; the Task 5/6 push changes the default.
- Every task ends green on: `npx tsc --noEmit`, targeted `npx eslint`, `npm run build` (when app code changed), plus the task's own tests. Check `$LASTEXITCODE` after every native command.
- Owner parity approval (Task 4) is a HARD GATE: Tasks 5–6 must not start without it.

---

## File Structure

- `supabase/migrations/20260729090000_wine_place_context_rpc.sql` — context RPC + grants.
- `scripts/wine-place-context.test.mjs` — rollback-capable live integration test for the RPC.
- `src/lib/wine-map/manifest.ts` — manifest contract, runtime validation, fetch.
- `src/lib/wine-map/context.ts` — RPC call + response types/validation.
- `src/lib/supabase/database.types.ts` — `get_wine_place_context` under `Functions`.
- `src/app/knowledge/map/tile-wine-map.tsx` — MapLibre + pmtiles map (client-only).
- `src/app/knowledge/map/tile-wine-map-explorer.tsx` — selection/URL state, breadcrumb, pills, details, fallbacks.
- `src/app/knowledge/map/page.tsx` — `?map=tiles` switch (Task 3); tiles-only (Task 5).
- `docs/superpowers/specs/2026-07-21-wine-map-parity-checklist.md` — owner parity checklist.
- `supabase/migrations/20260730090000_wine_map_nodes_retirement.sql` — guarded `drop table wine_map_nodes`.
- `scripts/world-wine-map-foundation.test.mjs` — Task 6 amendment (remove `wine_map_nodes` parity joins).
- `CLAUDE.md` — Task 6 domain-rule update.

---

### Task 1: `get_wine_place_context` RPC

**Files:**
- Create: `supabase/migrations/20260729090000_wine_place_context_rpc.sql`
- Create: `scripts/wine-place-context.test.mjs`
- Scratch, then delete: `scripts/scratch-apply-context-rpc.mjs`

**Interfaces:**
- Produces SQL function `get_wine_place_context(p_place_key text) returns jsonb`, `stable`, `security invoker`, executable by `authenticated` only.
- Returns `null` for unknown/invisible keys; otherwise `{ place: { id, key, name, kind, tier, min_zoom, label_min_zoom }, ancestors: [{ id, key, name, kind }] (outermost first), children: [{ id, key, name, kind, min_zoom }] (sort_order, name), article: { description, climate, grape_varieties, wine_styles, key_facts, editorial_status } | null, boundary: { bbox: [minX,minY,maxX,maxY], label_lon, label_lat } | null }`.
- Applied live in this task (additive, read-only, RLS-bound — same rationale as the 2A bucket migration).

- [ ] **Step 1: Write the failing integration test**

Create `scripts/wine-place-context.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, delimiter } from "node:path";
import test, { after, before } from "node:test";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

const migrationPaths = (process.env.WINE_PLACE_CONTEXT_MIGRATIONS ?? "")
  .split(delimiter)
  .filter(Boolean);
const isMigrationDryRun = migrationPaths.length > 0;

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

let savepointSequence = 0;
async function withRollback(callback) {
  if (!isMigrationDryRun) {
    await client.query("begin");
    try {
      return await callback();
    } finally {
      await client.query("rollback");
    }
  }
  const savepoint = `wine_place_context_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    return await callback();
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
}

before(async () => {
  await client.connect();
  if (!isMigrationDryRun) return;
  await client.query("begin");
  for (const migrationPath of migrationPaths) {
    const match = /^(\d+)_([^/\\]+)\.sql$/.exec(basename(migrationPath));
    assert.ok(match, `Invalid migration filename: ${migrationPath}`);
    const existing = await client.query(
      "select 1 from supabase_migrations.schema_migrations where version = $1",
      [match[1]],
    );
    assert.equal(existing.rowCount, 0, `version ${match[1]} already recorded`);
    const sql = await readFile(migrationPath, "utf8");
    await client.query(sql);
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ($1, $2, $3)`,
      [match[1], match[2], [sql]],
    );
  }
});

after(async () => {
  try {
    if (isMigrationDryRun) await client.query("rollback");
  } finally {
    await client.end();
  }
});

async function contextFor(key) {
  const result = await client.query("select get_wine_place_context($1) ctx", [key]);
  return result.rows[0].ctx;
}

test("bordeaux context has the full contract shape", async () => {
  const ctx = await contextFor("france.bordeaux");
  assert.equal(ctx.place.key, "france.bordeaux");
  assert.equal(ctx.place.name, "Bordeaux");
  assert.equal(ctx.place.kind, "REGION");
  assert.equal(ctx.place.tier, 1);
  assert.equal(typeof ctx.place.min_zoom, "number");
  assert.equal(typeof ctx.place.label_min_zoom, "number");
  assert.deepEqual(
    ctx.ancestors.map((a) => a.key),
    ["france"],
  );
  assert.equal(ctx.children.length, 7);
  assert.ok(ctx.children.every((c) => typeof c.min_zoom === "number"));
  assert.equal(ctx.article.editorial_status, "PUBLISHED");
  assert.equal(ctx.boundary.bbox.length, 4);
  assert.ok(ctx.boundary.label_lon > -6 && ctx.boundary.label_lon < 11);
  assert.ok(ctx.boundary.label_lat > 41 && ctx.boundary.label_lat < 52);
});

test("nested appellation ancestors are outermost first", async () => {
  const ctx = await contextFor("france.bordeaux.haut-medoc.margaux");
  assert.deepEqual(
    ctx.ancestors.map((a) => a.key),
    ["france", "france.bordeaux", "france.bordeaux.haut-medoc"],
  );
  assert.equal(ctx.children.length, 0);
  assert.equal(ctx.place.kind, "APPELLATION");
});

test("unknown key returns null", async () => {
  assert.equal(await contextFor("nowhere.special"), null);
});

test("execute privileges are authenticated-only", async () => {
  const anon = await client.query(
    `select has_function_privilege('anon', 'get_wine_place_context(text)', 'execute') ok`,
  );
  assert.equal(anon.rows[0].ok, false);
  const authenticated = await client.query(
    `select has_function_privilege('authenticated', 'get_wine_place_context(text)', 'execute') ok`,
  );
  assert.equal(authenticated.rows[0].ok, true);
});

test("authenticated role sees verified content through RLS", async () => {
  await withRollback(async () => {
    await client.query("set local role authenticated");
    const ctx = await contextFor("france.bordeaux");
    assert.equal(ctx.place.key, "france.bordeaux");
    assert.ok(ctx.article, "article should be visible to authenticated");
    assert.ok(ctx.boundary, "boundary should be visible to authenticated");
  });
});
```

- [ ] **Step 2: Run against live and verify RED**

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
node --test --test-concurrency=1 scripts/wine-place-context.test.mjs
$red = $LASTEXITCODE
Remove-Item Env:DB_PASSWORD
if ($red -eq 0) { throw "Expected RED (function absent) but tests passed." }
```

Expected: FAIL with `function get_wine_place_context(unknown) does not exist` — not a connection/credential failure.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260729090000_wine_place_context_rpc.sql`:

```sql
-- One bounded context fetch for the tile map UI: the selected place, its
-- ancestor chain, immediate children, article, and current boundary
-- envelope — replacing the old full-tree select. security invoker: RLS on
-- wine_places / wine_place_articles / wine_place_boundaries already limits
-- authenticated readers to VERIFIED places, PLACEHOLDER|PUBLISHED articles,
-- and current VALIDATED boundaries, so this function adds no new exposure.
create or replace function get_wine_place_context(p_place_key text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select * from wine_places where canonical_key = p_place_key
  ),
  ancestor_chain as (
    with recursive chain as (
      select p.id, p.primary_parent_id, p.canonical_key, p.name, p.kind, 1 as depth
      from wine_places p
      join target t on p.id = t.primary_parent_id
      union all
      select p.id, p.primary_parent_id, p.canonical_key, p.name, p.kind, c.depth + 1
      from wine_places p
      join chain c on p.id = c.primary_parent_id
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', id, 'key', canonical_key, 'name', name, 'kind', kind)
        order by depth desc
      ),
      '[]'::jsonb
    ) as items
    from chain
  ),
  child_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id, 'key', c.canonical_key, 'name', c.name, 'kind', c.kind,
          'min_zoom', c.min_zoom
        )
        order by c.sort_order, c.name
      ),
      '[]'::jsonb
    ) as items
    from wine_places c
    join target t on c.primary_parent_id = t.id
  ),
  article_row as (
    select jsonb_build_object(
      'description', a.description,
      'climate', a.climate,
      'grape_varieties', a.grape_varieties,
      'wine_styles', a.wine_styles,
      'key_facts', to_jsonb(coalesce(a.key_facts, array[]::text[])),
      'editorial_status', a.editorial_status
    ) as item
    from wine_place_articles a
    join target t on a.wine_place_id = t.id
  ),
  boundary_row as (
    select jsonb_build_object(
      'bbox', to_jsonb(b.bbox),
      'label_lon', extensions.ST_X(b.label_point),
      'label_lat', extensions.ST_Y(b.label_point)
    ) as item
    from wine_place_boundaries b
    join target t on b.wine_place_id = t.id
    where b.is_current
  )
  select case
    when not exists (select 1 from target) then null
    else jsonb_build_object(
      'place', (
        select jsonb_build_object(
          'id', t.id, 'key', t.canonical_key, 'name', t.name, 'kind', t.kind,
          'tier', t.display_tier, 'min_zoom', t.min_zoom,
          'label_min_zoom', t.label_min_zoom
        )
        from target t
      ),
      'ancestors', (select items from ancestor_chain),
      'children', (select items from child_list),
      'article', (select item from article_row),
      'boundary', (select item from boundary_row)
    )
  end
$$;

revoke execute on function get_wine_place_context(text) from public, anon;
grant execute on function get_wine_place_context(text) to authenticated;
```

- [ ] **Step 4: Rollback-only dry run and verify GREEN**

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
$env:WINE_PLACE_CONTEXT_MIGRATIONS = "supabase/migrations/20260729090000_wine_place_context_rpc.sql"
node --test --test-concurrency=1 scripts/wine-place-context.test.mjs
$green = $LASTEXITCODE
Remove-Item Env:WINE_PLACE_CONTEXT_MIGRATIONS
Remove-Item Env:DB_PASSWORD
if ($green -ne 0) { throw "Dry-run tests failed." }
```

Expected: 5/5 pass; the outer transaction rolls back (nothing persisted).

- [ ] **Step 5: Apply live via scratch script, verify GREEN live, delete scratch**

Create `scripts/scratch-apply-context-rpc.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");
const migrationPath = process.argv[2];
assert.ok(migrationPath, "migration path is required");
const match = /^(\d+)_([^/\\]+)\.sql$/.exec(basename(migrationPath));
assert.ok(match, "migration filename must start with its numeric version");
const [, version, name] = match;
const sql = await readFile(migrationPath, "utf8");

const client = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: 6543,
  user: "postgres.eqzwmkpeysqiihuojmuj",
  database: "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const existing = await client.query(
    "select 1 from supabase_migrations.schema_migrations where version = $1",
    [version],
  );
  assert.equal(existing.rowCount, 0, `version ${version} already recorded`);
  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ($1, $2, $3)`,
    [version, name, [sql]],
  );
  await client.query("commit");
  console.log(`Applied ${version} ${name}.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
```

Run:

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
node scripts/scratch-apply-context-rpc.mjs supabase/migrations/20260729090000_wine_place_context_rpc.sql
if ($LASTEXITCODE -ne 0) { Remove-Item Env:DB_PASSWORD; throw "live apply failed." }
node --test --test-concurrency=1 scripts/wine-place-context.test.mjs
$live = $LASTEXITCODE
Remove-Item Env:DB_PASSWORD
if ($live -ne 0) { throw "live tests failed." }
Remove-Item scripts/scratch-apply-context-rpc.mjs
```

Expected: `Applied 20260729090000 wine_place_context_rpc.` then 5/5 pass live (no dry-run env set).

- [ ] **Step 6: Commit Task 1**

```powershell
git add supabase/migrations/20260729090000_wine_place_context_rpc.sql scripts/wine-place-context.test.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add wine place context RPC"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 2: Wine-Map Client Library And Types

**Files:**
- Create: `src/lib/wine-map/manifest.ts`
- Create: `src/lib/wine-map/context.ts`
- Modify: `src/lib/supabase/database.types.ts` (Functions block)
- Modify: `package.json`, `package-lock.json` (pmtiles → dependencies)

**Interfaces:**
- Consumes: `get_wine_place_context` (Task 1) via `supabase.rpc`.
- Produces: `WINE_MAP_MANIFEST_URL`, `fetchWineMapManifest(): Promise<WineMapManifest>`, `parseManifest(value: unknown): WineMapManifest`; `fetchWinePlaceContext(supabase, placeKey): Promise<WinePlaceContext | null>` and the `WinePlaceContext`/`WinePlaceSummary`/`WinePlaceChild`/`WinePlaceArticle` types Task 3 renders.

- [ ] **Step 1: Move pmtiles into dependencies**

```powershell
npm install pmtiles@4.4.1
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
```

Then open `package.json` and confirm `"pmtiles"` now appears under `dependencies` only (npm normally moves it out of `devDependencies` automatically; if a `devDependencies` entry remains, delete it and re-run `npm install` to sync the lockfile).

- [ ] **Step 2: Create `src/lib/wine-map/manifest.ts`**

```ts
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
```

- [ ] **Step 3: Create `src/lib/wine-map/context.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type WinePlaceSummary = {
  id: string;
  key: string;
  name: string;
  kind: string;
};

export type WinePlaceChild = WinePlaceSummary & { min_zoom: number };

export type WinePlaceArticle = {
  description: string | null;
  climate: string | null;
  grape_varieties: string | null;
  wine_styles: string | null;
  key_facts: string[];
  editorial_status: string;
};

export type WinePlaceContext = {
  place: WinePlaceSummary & {
    tier: number;
    min_zoom: number;
    label_min_zoom: number;
  };
  ancestors: WinePlaceSummary[];
  children: WinePlaceChild[];
  article: WinePlaceArticle | null;
  boundary: {
    bbox: [number, number, number, number];
    label_lon: number;
    label_lat: number;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// The RPC builds this shape server-side with jsonb_build_object; the guard
// checks the load-bearing fields rather than re-validating every leaf.
function isContext(value: unknown): value is WinePlaceContext {
  if (!isRecord(value)) return false;
  const place = value.place;
  return (
    isRecord(place) &&
    typeof place.key === "string" &&
    typeof place.name === "string" &&
    typeof place.tier === "number" &&
    Array.isArray(value.ancestors) &&
    Array.isArray(value.children)
  );
}

export async function fetchWinePlaceContext(
  supabase: SupabaseClient<Database>,
  placeKey: string,
): Promise<WinePlaceContext | null> {
  const { data, error } = await supabase.rpc("get_wine_place_context", {
    p_place_key: placeKey,
  });
  if (error) {
    throw new Error(`get_wine_place_context failed: ${error.message}`);
  }
  if (data === null) return null;
  if (!isContext(data)) {
    throw new Error("Unrecognized wine place context shape");
  }
  return data;
}
```

- [ ] **Step 4: Type the RPC in `database.types.ts`**

Inside `Database["public"]["Functions"]`, add this entry immediately before `reveal_wine`:

```ts
      get_wine_place_context: {
        Args: { p_place_key: string };
        Returns: unknown;
      };
```

- [ ] **Step 5: Verify and commit**

```powershell
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "tsc failed." }
npx eslint src/lib/wine-map/manifest.ts src/lib/wine-map/context.ts src/lib/supabase/database.types.ts
if ($LASTEXITCODE -ne 0) { throw "eslint failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed." }
git add src/lib/wine-map/manifest.ts src/lib/wine-map/context.ts src/lib/supabase/database.types.ts package.json package-lock.json
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add wine map manifest and context client library"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 3: Tile Map Components And `?map=tiles` Switch

**Files:**
- Create: `src/app/knowledge/map/tile-wine-map.tsx`
- Create: `src/app/knowledge/map/tile-wine-map-explorer.tsx`
- Modify: `src/app/knowledge/map/page.tsx`

**Interfaces:**
- Consumes: `fetchWineMapManifest`, `fetchWinePlaceContext` and types (Task 2); tile properties from the archives (`key`, `name`, `kind`, `tier` on layers `places` and `labels`).
- Produces: `TileWineMap` (props `manifest`, `selectedKey`, `cameraTarget`, `onSelect`) and `TileWineMapExplorer` (prop `initialPlaceKey: string | null`); page renders the explorer when `map === "tiles"`.

- [ ] **Step 1: Create `src/app/knowledge/map/tile-wine-map.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WineMapManifest } from "@/lib/wine-map/manifest";

// Free, un-keyed Carto vector basemap — same as the legacy map.
const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// maplibre keeps protocols globally; registering twice throws in dev
// (React strict mode double-mounts), so guard with a module flag.
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolRegistered = true;
}

export type CameraTarget = {
  bbox: [number, number, number, number];
  maxZoom: number;
};

export function TileWineMap({
  manifest,
  selectedKey,
  cameraTarget,
  onSelect,
}: {
  manifest: WineMapManifest;
  selectedKey: string | null;
  cameraTarget: CameraTarget | null;
  onSelect: (key: string) => void;
}) {
  ensurePmtilesProtocol();
  const mapRef = useRef<MapRef>(null);
  const franceShard = manifest.shards.france ?? null;

  useEffect(() => {
    if (!cameraTarget) return;
    const [minX, minY, maxX, maxY] = cameraTarget.bbox;
    mapRef.current?.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 48, duration: 900, maxZoom: cameraTarget.maxZoom },
    );
  }, [cameraTarget]);

  // Selection-aware paint. The zoom interpolation fades fills — the
  // selected parent included — as children appear, while outlines and
  // labels persist (spec: "parent outline and single label remain";
  // selection stays legible through the gold color).
  const fillPaint = useMemo(
    () => ({
      "fill-color": [
        "case",
        ["==", ["get", "key"], selectedKey ?? ""],
        "#B78E42",
        "#5C1A2B",
      ] as unknown as string,
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        [
          "case",
          ["==", ["get", "key"], selectedKey ?? ""],
          0.55,
          ["min", 0.5, ["*", 0.16, ["get", "tier"]]],
        ],
        9,
        [
          "case",
          ["==", ["get", "key"], selectedKey ?? ""],
          0.18,
          ["min", 0.5, ["*", 0.08, ["get", "tier"]]],
        ],
      ] as unknown as number,
    }),
    [selectedKey],
  );

  const attribution = useMemo(
    () => Object.values(manifest.attribution),
    [manifest],
  );

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border">
      <Map
        ref={mapRef}
        mapStyle={BASEMAP_STYLE}
        initialViewState={{ longitude: -0.58, latitude: 44.84, zoom: 6 }}
        interactiveLayerIds={["france-fills", "world-fills"]}
        onClick={(e) => {
          let best: { key: string; tier: number } | null = null;
          for (const feature of e.features ?? []) {
            const p = feature.properties as { key?: string; tier?: number };
            if (typeof p.key !== "string") continue;
            if (!best || (p.tier ?? 0) > best.tier) {
              best = { key: p.key, tier: p.tier ?? 0 };
            }
          }
          if (best) onSelect(best.key);
        }}
        onMouseMove={(e) => {
          const map = mapRef.current;
          if (map) {
            map.getCanvas().style.cursor = e.features?.length ? "pointer" : "";
          }
        }}
        attributionControl={{ compact: true, customAttribution: attribution }}
        style={{ width: "100%", height: "100%" }}
      >
        <Source id="wine-world" type="vector" url={`pmtiles://${manifest.world.url}`}>
          {/* The pilot always loads the france shard, so the world archive
              contributes only the country outline; Bordeaux renders from the
              shard to avoid double-drawing (it exists in both archives). */}
          <Layer
            id="world-fills"
            type="fill"
            source-layer="places"
            filter={["==", ["get", "key"], "france"]}
            paint={{
              "fill-color": "#5C1A2B",
              "fill-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                0.12,
                5,
                0.03,
              ] as unknown as number,
            }}
          />
          <Layer
            id="world-outlines"
            type="line"
            source-layer="places"
            filter={["==", ["get", "key"], "france"]}
            paint={{ "line-color": "#5C1A2B", "line-width": 1 }}
          />
          <Layer
            id="world-labels"
            type="symbol"
            source-layer="labels"
            filter={["==", ["get", "key"], "france"]}
            layout={{ "text-field": ["get", "name"], "text-size": 12 }}
            paint={{
              "text-color": "#3d1220",
              "text-halo-color": "#F5EFE3",
              "text-halo-width": 1,
            }}
          />
        </Source>
        {franceShard ? (
          <Source id="wine-france" type="vector" url={`pmtiles://${franceShard.url}`}>
            <Layer
              id="france-fills"
              type="fill"
              source-layer="places"
              paint={fillPaint}
            />
            <Layer
              id="france-outlines"
              type="line"
              source-layer="places"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "key"], selectedKey ?? ""],
                  "#B78E42",
                  "#5C1A2B",
                ] as unknown as string,
                "line-width": ["+", 0.5, ["*", 0.5, ["get", "tier"]]] as unknown as number,
              }}
            />
            <Layer
              id="france-labels"
              type="symbol"
              source-layer="labels"
              layout={{
                "text-field": ["get", "name"],
                "text-size": 11,
                // Deeper (smaller) places label first so commune names
                // survive collision against their parent's label.
                "symbol-sort-key": ["-", 10, ["get", "tier"]] as unknown as number,
              }}
              paint={{
                "text-color": "#3d1220",
                "text-halo-color": "#F5EFE3",
                "text-halo-width": 1,
              }}
            />
          </Source>
        ) : null}
      </Map>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/knowledge/map/tile-wine-map-explorer.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  fetchWineMapManifest,
  type WineMapManifest,
} from "@/lib/wine-map/manifest";
import {
  fetchWinePlaceContext,
  type WinePlaceContext,
} from "@/lib/wine-map/context";
import type { CameraTarget } from "./tile-wine-map";

// maplibre-gl touches `window` on import — must never be server-rendered.
const TileWineMap = dynamic(
  () => import("./tile-wine-map").then((m) => m.TileWineMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-lg border bg-muted" />
    ),
  },
);

const DEFAULT_PLACE_KEY = "france.bordeaux";

const KIND_LABELS: Record<string, string> = {
  COUNTRY: "Country",
  MACRO_REGION: "Macro region",
  REGION: "Region",
  SUBREGION: "Subregion",
  APPELLATION: "Appellation",
  SITE: "Site",
  VINEYARD: "Vineyard",
};

export function TileWineMapExplorer({
  initialPlaceKey,
}: {
  initialPlaceKey: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [manifest, setManifest] = useState<WineMapManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState(
    initialPlaceKey ?? DEFAULT_PLACE_KEY,
  );
  const [context, setContext] = useState<WinePlaceContext | null>(null);
  const [contextState, setContextState] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading");

  const loadManifest = useCallback(() => {
    setManifestError(null);
    fetchWineMapManifest()
      .then(setManifest)
      .catch((error: Error) => setManifestError(error.message));
  }, []);
  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    let cancelled = false;
    setContextState("loading");
    fetchWinePlaceContext(supabase, selectedKey)
      .then((ctx) => {
        if (cancelled) return;
        setContext(ctx);
        setContextState(ctx ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setContextState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedKey]);

  // Selection updates the URL in place (shareable deep links) while
  // preserving any other params — including ?map=tiles during the opt-in
  // phase — without a Next navigation round-trip.
  const select = useCallback((key: string) => {
    setSelectedKey(key);
    const params = new URLSearchParams(window.location.search);
    params.set("place", key);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const cameraTarget = useMemo<CameraTarget | null>(() => {
    if (!context?.boundary) return null;
    const childZooms = context.children.map((c) => c.min_zoom);
    const maxZoom = Math.min(
      childZooms.length > 0
        ? Math.min(...childZooms) + 0.5
        : context.place.min_zoom + 1.5,
      11,
    );
    return { bbox: context.boundary.bbox, maxZoom };
  }, [context]);

  const breadcrumb = context
    ? [...context.ancestors, context.place]
    : [];
  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
      ? context.article
      : null;

  return (
    <div className="flex flex-col gap-4">
      {breadcrumb.length > 0 ? (
        <nav
          aria-label="Wine map breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm"
        >
          {breadcrumb.map((entry, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={entry.id} className="flex items-center gap-1">
                {i > 0 ? (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                ) : null}
                {isLast ? (
                  <span className="font-medium text-foreground">
                    {entry.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => select(entry.key)}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {entry.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 pt-6">
            {manifest ? (
              <TileWineMap
                manifest={manifest}
                selectedKey={selectedKey}
                cameraTarget={cameraTarget}
                onSelect={select}
              />
            ) : manifestError ? (
              <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-lg border text-center">
                <p className="text-sm text-muted-foreground">
                  The map tiles are unavailable right now — navigation below
                  still works.
                </p>
                <button
                  type="button"
                  onClick={loadManifest}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Retry map
                </button>
              </div>
            ) : (
              <div className="h-[420px] animate-pulse rounded-lg border bg-muted" />
            )}

            {context && context.children.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Within {context.place.name}:
                </span>
                {context.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => select(child.key)}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            {contextState === "loading" ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : contextState === "error" ? (
              <p className="text-sm text-muted-foreground">
                Details are unavailable right now. Try another place or reload.
              </p>
            ) : contextState === "missing" || !context ? (
              <p className="text-sm text-muted-foreground">
                That place isn&apos;t on the map yet.
              </p>
            ) : (
              <>
                <div>
                  <Badge variant="secondary" className="mb-1.5">
                    {KIND_LABELS[context.place.kind] ?? context.place.kind}
                  </Badge>
                  <h2 className="font-heading text-xl font-semibold">
                    {context.place.name}
                  </h2>
                </div>
                {article ? (
                  <>
                    {article.description ? (
                      <p className="text-sm text-muted-foreground">
                        {article.description}
                      </p>
                    ) : null}
                    <dl className="flex flex-col gap-2 text-sm">
                      {article.climate ? (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">
                            Climate
                          </dt>
                          <dd>{article.climate}</dd>
                        </div>
                      ) : null}
                      {article.grape_varieties ? (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">
                            Main grape varieties
                          </dt>
                          <dd>{article.grape_varieties}</dd>
                        </div>
                      ) : null}
                      {article.wine_styles ? (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">
                            Wine styles
                          </dt>
                          <dd>{article.wine_styles}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {article.key_facts.length > 0 ? (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Key facts
                        </p>
                        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                          {article.key_facts.map((fact, i) => (
                            <li key={i}>{fact}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Profile being curated — check back soon.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the `?map=tiles` switch to `page.tsx`**

Replace the whole of `src/app/knowledge/map/page.tsx` with:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { TileWineMapExplorer } from "./tile-wine-map-explorer";
import { WineMapExplorer } from "./wine-map-explorer";

export const metadata = {
  title: "Wine Map · Knowledge · Blindr",
};

export default async function WineMapPage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string; place?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { map, place } = await searchParams;
  // Controlled switch (spec §4): the tile pilot is URL opt-in until it
  // passes the owner parity gate; the legacy explorer stays the default.
  const useTiles = map === "tiles";

  let nodes = null;
  if (!useTiles) {
    // Small, hand-curated tree (currently 14 rows) — fetched in full and built
    // into a tree client-side rather than paginated/queried per level.
    const { data } = await supabase
      .from("wine_map_nodes")
      .select("*")
      .order("sort_order");
    nodes = data;
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <Link
            href="/knowledge"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            ← Knowledge
          </Link>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Wine Map
          </h1>
          <p className="mt-2 text-muted-foreground">
            Click through from country to region to appellation.
          </p>
        </div>

        {useTiles ? (
          <TileWineMapExplorer initialPlaceKey={place ?? null} />
        ) : (
          <WineMapExplorer nodes={nodes ?? []} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```powershell
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "tsc failed." }
npx eslint src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx src/app/knowledge/map/page.tsx
if ($LASTEXITCODE -ne 0) { throw "eslint failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed." }
```

Expected: all exit 0; `/knowledge/map` still builds as a dynamic route.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx src/app/knowledge/map/page.tsx
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add opt-in tile wine map UI"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

### Task 4: Parity Checklist, Interim Push, And The Owner Gate

**Files:**
- Create: `docs/superpowers/specs/2026-07-21-wine-map-parity-checklist.md`

**Interfaces:**
- Produces the checklist the owner executes against production, and the deployed opt-in UI at `https://blindrapp.vercel.app/knowledge/map?map=tiles`.
- HARD GATE: Tasks 5–6 must not start until the owner reports the checklist passed.

- [ ] **Step 1: Write the checklist**

Create `docs/superpowers/specs/2026-07-21-wine-map-parity-checklist.md`:

```markdown
# Wine Map Tile Pilot — Parity Checklist

Run against production (`https://blindrapp.vercel.app`) after the Task 4
push. The tile map must match or beat the legacy map on every item before
promotion (spec §5, Application tests).

## Navigation parity

- [ ] `/knowledge/map` (no params) still shows the legacy map, unchanged.
- [ ] `/knowledge/map?map=tiles` loads the tile map focused on Bordeaux.
- [ ] Click path works: Bordeaux → an appellation (fill highlights, camera
      fits, details panel updates) → nested commune (e.g. Margaux via
      Haut-Médoc) → breadcrumb back up to France.
- [ ] Child pills ("Within Bordeaux:") select and focus the same way the
      legacy pills did.
- [ ] Manual zoom out to world level shows France (fill + label); manual
      zoom does NOT change the selection or the details panel.
- [ ] Zooming into Bordeaux reveals appellations at ~z7 and the nested
      communes at ~z9; Bordeaux's outline and label remain visible behind
      its appellations (parent-fade behavior).

## Deep links and URL state

- [ ] Selecting places rewrites `?place=` in the URL without a page reload,
      and `?map=tiles` is preserved.
- [ ] Opening `/knowledge/map?map=tiles&place=france.bordeaux.haut-medoc.margaux`
      directly restores the Margaux selection, breadcrumb, and camera.
- [ ] An unknown place key (`?map=tiles&place=nope`) shows the "isn't on the
      map yet" state and the map still renders.

## Article and fallback states

- [ ] Details panel shows description / climate / grape varieties / wine
      styles / key facts for Bordeaux and at least two appellations, matching
      the legacy panel's content.
- [ ] With DevTools network blocking of `tiles/manifest.json`, the page shows
      the "map tiles are unavailable" card with Retry, and breadcrumb /
      pills / details still work (text navigation survives tile failure).
- [ ] Attribution (Blindr, IGN/INAO) is visible on the map control.

## Mobile (real phone, not just responsive mode)

- [ ] Pan / pinch-zoom / tap-select all work on the tile map.
- [ ] The details panel is readable and the layout doesn't overflow.
- [ ] A deep link opened on the phone restores the right view.

## Sign-off

- Owner approval (date + note): ____________________
```

- [ ] **Step 2: Commit the checklist**

```powershell
git add docs/superpowers/specs/2026-07-21-wine-map-parity-checklist.md
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "docs: add wine map parity checklist"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

- [ ] **Step 3: Whole-range review, then push the opt-in stage**

Dispatch a code review of the range `origin/master..HEAD` (Tasks 1–4) with this plan and the Phase 2 spec. Resolve every Critical/Important finding, then push with the standard guards:

```powershell
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed." }
$branch = git branch --show-current
if ($branch -ne "master") { throw "Expected master, got $branch." }
$status = git status --porcelain
if ($status) { throw "Worktree must be clean before push.`n$status" }
$counts = (git rev-list --left-right --count origin/master...HEAD) -split '\s+'
if ([int]$counts[0] -ne 0) { throw "origin/master has remote-only commits." }
git push origin master
if ($LASTEXITCODE -ne 0) { throw "git push failed." }
```

Expected: push succeeds; Vercel deploys. The default map is unchanged; the tile map is live at `?map=tiles`.

- [ ] **Step 4: OWNER GATE (STOP)**

Hand the owner the checklist and the production URL. Wait for explicit approval (or findings — fix, re-review, re-push, re-test). Do not begin Task 5 without it. Record the approval in the progress ledger.

---

### Task 5: Promotion — Tile Map Becomes The Default

**Files:**
- Modify: `src/app/knowledge/map/page.tsx`
- Delete: `src/app/knowledge/map/wine-map-explorer.tsx`
- Delete: `src/app/knowledge/map/interactive-wine-map.tsx`
- Modify: `docs/superpowers/specs/2026-07-21-wine-map-parity-checklist.md` (sign-off line)
- Modify: `package.json`, `package-lock.json` (`@turf/bbox` removed with its only importer)

**Interfaces:**
- Consumes: owner approval from Task 4.
- Produces: `/knowledge/map` renders the tile explorer unconditionally; `?place=` deep links keep working; `?map=` is ignored. No remaining imports of the legacy components.

- [ ] **Step 1: Replace `page.tsx` with the tiles-only version**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { TileWineMapExplorer } from "./tile-wine-map-explorer";

export const metadata = {
  title: "Wine Map · Knowledge · Blindr",
};

export default async function WineMapPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { place } = await searchParams;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <Link
            href="/knowledge"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            ← Knowledge
          </Link>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Wine Map
          </h1>
          <p className="mt-2 text-muted-foreground">
            Click through from country to region to appellation.
          </p>
        </div>

        <TileWineMapExplorer initialPlaceKey={place ?? null} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove the legacy components and record sign-off**

```powershell
git rm src/app/knowledge/map/wine-map-explorer.tsx src/app/knowledge/map/interactive-wine-map.tsx
if ($LASTEXITCODE -ne 0) { throw "git rm failed." }
npm uninstall @turf/bbox
if ($LASTEXITCODE -ne 0) { throw "npm uninstall failed." }
```

`interactive-wine-map.tsx` was `@turf/bbox`'s only importer; it leaves with it.

Fill the checklist's "Owner approval" line with the date and the owner's approval note.

- [ ] **Step 3: Verify and commit**

```powershell
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "tsc failed." }
npx eslint src/app/knowledge/map/page.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx
if ($LASTEXITCODE -ne 0) { throw "eslint failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed." }
git add src/app/knowledge/map/page.tsx docs/superpowers/specs/2026-07-21-wine-map-parity-checklist.md package.json package-lock.json package.json package-lock.json
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: promote tile wine map to default"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 6: Retire `wine_map_nodes`

**Files:**
- Create: `supabase/migrations/20260730090000_wine_map_nodes_retirement.sql`
- Modify: `scripts/world-wine-map-foundation.test.mjs` (remove `wine_map_nodes` joins)
- Modify: `src/lib/supabase/database.types.ts` (remove `wine_map_nodes` + `WineMapLevel`)
- Modify: `CLAUDE.md` (Wine Map domain rules)
- Scratch, then delete: `scripts/scratch-apply-context-rpc.mjs` (recreated for this migration)

**Interfaces:**
- Consumes: Task 5 committed (no code reads `wine_map_nodes`).
- Produces: `wine_map_nodes` dropped live (guarded), Phase 1 integration tests green without the legacy table, types with no `wine_map_nodes` surface.
- Note: the Phase 1 seed migration (`20260727093000`) still reads `wine_map_nodes` on a from-scratch replay — that stays correct because this retirement migration is ordered after it.

- [ ] **Step 1: Create the retirement migration**

Create `supabase/migrations/20260730090000_wine_map_nodes_retirement.sql`:

```sql
-- Phase 2B retirement: the tile map is the only map UI and reads the
-- canonical catalog exclusively; wine_map_nodes has no remaining readers.
-- Guards fail closed if the canonical catalog is not fully in place.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from wine_places where publication_status = 'VERIFIED';
  if v_count < 14 then
    raise exception 'expected at least 14 verified wine places, got %', v_count;
  end if;

  select count(*) into v_count
  from wine_place_boundaries
  where is_current and quality_status = 'VALIDATED';
  if v_count < 14 then
    raise exception 'expected at least 14 current validated boundaries, got %', v_count;
  end if;

  select count(*) into v_count from wine_map_nodes;
  if v_count <> 14 then
    raise exception 'expected exactly 14 legacy wine map nodes, got %', v_count;
  end if;
end;
$$;

drop table wine_map_nodes;
```

- [ ] **Step 2: Amend the Phase 1 integration test**

In `scripts/world-wine-map-foundation.test.mjs`:

1. Delete the entire `test("canonical catalog is a lossless copy of the current map tree", ...)` block — its purpose was to prove the transition copy while both tables existed; the legacy table is now gone.
2. In `test("all migrated places have valid reviewed current boundaries", ...)`, make two targeted deletions in the first query and its assertion — everything else in the test (including the `reproducible` filter with its `reproducible: 13` expectation, and the provenance sub-query) stays exactly as it is:
   - delete the `join wine_map_nodes n on n.id = b.wine_place_id` line, so the `from` clause becomes just `from wine_place_boundaries b`;
   - delete the whole `exact_geometry` `count(*) filter (...)` block from the select list and the `exact_geometry: 14,` line from the `assert.deepEqual` expectation.

Leave every other test in the file untouched. Then confirm no other live-table references remain:

```powershell
git grep -n "wine_map_nodes" -- scripts/world-wine-map-foundation.test.mjs
if ($LASTEXITCODE -eq 0) { throw "test file still references wine_map_nodes." }
```

- [ ] **Step 3: Remove the legacy types**

In `src/lib/supabase/database.types.ts`:

1. Delete the `export type WineMapLevel = ...` line.
2. Delete the entire `wine_map_nodes: { ... };` entry under `Tables`.

```powershell
git grep -n "wine_map_nodes\|WineMapLevel" -- src
if ($LASTEXITCODE -eq 0) { throw "src still references wine_map_nodes/WineMapLevel." }
```

- [ ] **Step 4: Update `CLAUDE.md`**

Add this exact bullet directly after the Phase 2A wine-map bullet:

```markdown
- World Wine Map Phase 2B made the tile map the only map UI: `/knowledge/map`
  renders `TileWineMapExplorer`, which reads `tiles/manifest.json` (PMTiles
  archives) for geometry and `get_wine_place_context` (RLS-bound RPC,
  authenticated-only) for place context; deep links use `?place=<canonical
  key>`. `wine_map_nodes` is retired and dropped — the canonical
  `wine_places` catalog is the single map source. New places appear on the
  map by verifying them in the catalog and publishing a release through the
  Wine Map Tiles workflow; no UI change is needed for new coverage.
```

Then remove the contradictions the retirement creates elsewhere in `CLAUDE.md`:

- Rewrite the Knowledge-area `/knowledge/map` bullet (the one describing `wine-map-explorer.tsx`, `interactive-wine-map.tsx`, and the full-tree `wine_map_nodes` fetch) to describe the current implementation: `TileWineMapExplorer` (client state, breadcrumb/pills/details, `?place=` URL state) plus `TileWineMap` (MapLibre with the pmtiles protocol over the manifest's archives), with context fetched through the `get_wine_place_context` RPC.
- In the Phase 1 bullet, change "`wine_map_nodes` remains the active read source during Phase 1 and is retired only after the Phase 2 tile UI passes parity" to "`wine_map_nodes` remained the active read source through Phase 1 and was retired in Phase 2B after the tile UI passed parity".
- In the Phase 2A bullet, change the clause saying the map UI still reads `wine_map_nodes` to past tense: "the map UI read `wine_map_nodes` until the Phase 2B tile UI replaced it".
- Where the concave-boundary generator (`scripts/generate-wine-map-concave-boundaries.mjs`) is described, note it is historical: it emits SQL against the retired `wine_map_nodes` table and its tests are file-fixture-based only.

- [ ] **Step 5: Verify, commit, review, push**

```powershell
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "tsc failed." }
npx eslint scripts/world-wine-map-foundation.test.mjs src/lib/supabase/database.types.ts
if ($LASTEXITCODE -ne 0) { throw "eslint failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed." }
node --test scripts/wine-map-tiles/lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "tile lib tests failed." }
node --test scripts/generate-wine-map-concave-boundaries.test.mjs
if ($LASTEXITCODE -ne 0) { throw "boundary generator tests failed." }
git add supabase/migrations/20260730090000_wine_map_nodes_retirement.sql scripts/world-wine-map-foundation.test.mjs src/lib/supabase/database.types.ts CLAUDE.md
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: retire wine_map_nodes"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

Dispatch a code review of the Task 5–6 range; resolve findings, then push with the Task 4 Step 3 guard block. Wait for the Vercel deployment of the new default to finish (~2 min) BEFORE applying the migration live — the deployed old code must stop reading the table before it is dropped.

- [ ] **Step 6: Rollback-only dry run of the retirement (post-deploy)**

Run this only after the Task 5/6 deployment is live: production no longer
reads `wine_map_nodes`, so the ACCESS EXCLUSIVE lock the dry-run transaction
holds on the table stalls no traffic. The Phase 1 harness supports
transactional migration dry runs:

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
$env:WORLD_WINE_MAP_MIGRATIONS = "supabase/migrations/20260730090000_wine_map_nodes_retirement.sql"
node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
$dry = $LASTEXITCODE
Remove-Item Env:WORLD_WINE_MAP_MIGRATIONS
Remove-Item Env:DB_PASSWORD
if ($dry -ne 0) { throw "retirement dry run failed." }
```

Expected: all remaining tests pass with the table dropped inside the rolled-back transaction (concurrency test skipped in dry-run mode as designed).

- [ ] **Step 7: Apply the retirement live and verify**

Recreate `scripts/scratch-apply-context-rpc.mjs` exactly as in Task 1 Step 5, then:

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD in this PowerShell process first." }
node scripts/scratch-apply-context-rpc.mjs supabase/migrations/20260730090000_wine_map_nodes_retirement.sql
if ($LASTEXITCODE -ne 0) { Remove-Item Env:DB_PASSWORD; throw "live apply failed." }
node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
$foundation = $LASTEXITCODE
node --test --test-concurrency=1 scripts/wine-place-context.test.mjs
$context = $LASTEXITCODE
Remove-Item Env:DB_PASSWORD
Remove-Item scripts/scratch-apply-context-rpc.mjs
if ($foundation -ne 0) { throw "foundation live tests failed." }
if ($context -ne 0) { throw "context live tests failed." }
```

Expected: `Applied 20260730090000 wine_map_nodes_retirement.`; all foundation tests (including the two-client concurrency test) and all context tests pass live. Load `/knowledge/map` on production once more: the tile map is the default and Phase 2 is complete. Record completion in the progress ledger.
