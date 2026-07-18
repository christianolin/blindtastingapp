# Interactive Wine Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the schematic SVG wine map on `/knowledge/map` with a real interactive geographic map (MapLibre GL via react-map-gl) rendering polygon boundaries stored as JSONB on `wine_map_nodes`.

**Architecture:** A new `boundary_geojson` JSONB column on `wine_map_nodes` holds each node's GeoJSON geometry (seeded with rough placeholder polygons for the existing France → Bordeaux → 12 appellations tree). A new client-only `InteractiveWineMap` component renders the selected region's appellation polygons on a free Carto vector basemap; clicking a polygon focuses it (same state as the existing pill buttons), and the map auto-fits to the focused shape. `WineMapExplorer` swaps its hand-drawn `REGION_LAYOUTS` SVG for this component.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres, JSONB), maplibre-gl, react-map-gl, @turf/bbox.

**Spec:** `docs/superpowers/specs/2026-07-18-wine-map-design.md`

## Global Constraints

- Before every commit: `npx tsc --noEmit`, `npx eslint <changed files>`, and `npm run build` must all pass.
- Push directly to `master` after each verified batch — no PRs (gh CLI not installed). Auto-deploys to blindrapp.vercel.app.
- This repo's Next.js version may differ from training data. If a Next API behaves unexpectedly, read the relevant guide in `node_modules/next/dist/docs/` before working around it.
- There is no unit-test framework in this repo. The verification cycle per task is: typecheck + lint + build, plus data verification via scratch Node scripts (deleted after use).
- Migrations go in `supabase/migrations/` but **cannot** be applied with the Supabase CLI (pooler "prepared statement" errors). Apply with a scratch Node script using `pg.Client` with **explicit connection fields** (the URL parser mishandles the connection string): host `aws-0-eu-central-1.pooler.supabase.com`, port `6543`, user `postgres.eqzwmkpeysqiihuojmuj`, database `postgres`, `ssl: { rejectUnauthorized: false }`. **The DB password must be requested from the user** — it is not in `.env.local`.
- `src/lib/supabase/database.types.ts` is hand-written and must be updated in the same commit as any migration that changes schema.
- Update `CLAUDE.md`'s domain rules when the feature lands (established project habit).
- Dev-server note: the in-app browser preview pane has a known hydration bug on some routes; verify server rendering via the hidden RSC content / build output, don't fight the pane.

---

### Task 1: Migration — `boundary_geojson` column + placeholder Bordeaux polygons

**Files:**
- Create: `supabase/migrations/20260723090000_wine_map_boundaries.sql`
- Modify: `src/lib/supabase/database.types.ts` (the `wine_map_nodes` block, ~lines 103–136)
- Scratch (create then DELETE): `scripts/apply-boundaries-migration.mjs`, `scripts/check-boundaries.mjs`

**Interfaces:**
- Produces: `wine_map_nodes.boundary_geojson` (JSONB, nullable) holding a bare GeoJSON **Geometry** object (e.g. `{"type":"Polygon","coordinates":[...]}`), NOT a Feature. TypeScript Row type: `boundary_geojson: unknown` (cast to `GeoJSON.Geometry` at the component boundary).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260723090000_wine_map_boundaries.sql`:

```sql
-- Interactive wine map: each node can carry a GeoJSON *geometry* (not a
-- Feature) as JSONB. Nullable on purpose — a node without a boundary just
-- doesn't render on the map (the pill list remains the universal fallback).
-- These seed shapes are ROUGH PLACEHOLDERS: hand-approximated boxes near the
-- real locations, good enough to make the map interactive; replace with real
-- boundary data (e.g. traced from OpenStreetMap) per-node later via UPDATE.
alter table wine_map_nodes add column boundary_geojson jsonb;

-- France: coarse hexagon of the mainland.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-4.8,48.4],[2.5,51.0],[7.6,48.9],[7.0,43.7],[3.0,42.4],[-1.8,43.3],[-4.8,48.4]]]}'::jsonb where slug = 'france';

-- Bordeaux: rough envelope of the Gironde wine region.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.15,44.35],[-1.10,45.60],[-0.05,45.40],[0.10,44.50],[-0.50,44.20],[-1.15,44.35]]]}'::jsonb where slug = 'bordeaux';

-- Left Bank, north to south along the Gironde/Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.05,45.25],[-1.05,45.55],[-0.75,45.55],[-0.75,45.25],[-1.05,45.25]]]}'::jsonb where slug = 'medoc';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.95,44.95],[-0.95,45.25],[-0.70,45.25],[-0.70,44.95],[-0.95,44.95]]]}'::jsonb where slug = 'haut-medoc';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.83,45.22],[-0.83,45.30],[-0.72,45.30],[-0.72,45.22],[-0.83,45.22]]]}'::jsonb where slug = 'saint-estephe';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.81,45.16],[-0.81,45.22],[-0.71,45.22],[-0.71,45.16],[-0.81,45.16]]]}'::jsonb where slug = 'pauillac';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.80,45.11],[-0.80,45.16],[-0.70,45.16],[-0.70,45.11],[-0.80,45.11]]]}'::jsonb where slug = 'saint-julien';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.74,45.00],[-0.74,45.07],[-0.62,45.07],[-0.62,45.00],[-0.74,45.00]]]}'::jsonb where slug = 'margaux';

-- South of the city.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.72,44.68],[-0.72,44.82],[-0.55,44.82],[-0.55,44.68],[-0.72,44.68]]]}'::jsonb where slug = 'pessac-leognan';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.62,44.45],[-0.62,44.72],[-0.30,44.72],[-0.30,44.45],[-0.62,44.45]]]}'::jsonb where slug = 'graves';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.42,44.48],[-0.42,44.57],[-0.28,44.57],[-0.28,44.48],[-0.42,44.48]]]}'::jsonb where slug = 'sauternes';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.40,44.57],[-0.40,44.64],[-0.28,44.64],[-0.28,44.57],[-0.40,44.57]]]}'::jsonb where slug = 'barsac';

-- Right Bank.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.22,44.84],[-0.22,44.95],[-0.02,44.95],[-0.02,44.84],[-0.22,44.84]]]}'::jsonb where slug = 'saint-emilion';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.25,44.90],[-0.25,44.97],[-0.16,44.97],[-0.16,44.90],[-0.25,44.90]]]}'::jsonb where slug = 'pomerol';
```

Note: slugs are globally unique in the current 14-row seed, so `where slug =` is safe without a parent filter.

- [ ] **Step 2: Ask the user for the DB password**

The pooler password is not stored anywhere in the repo. Ask the user for it before proceeding. Do not commit it or write it to any tracked file.

- [ ] **Step 3: Apply the migration via a scratch script**

Create `scripts/apply-boundaries-migration.mjs`:

```js
import { readFileSync } from "node:fs";
import pg from "pg";

const sql = readFileSync("supabase/migrations/20260723090000_wine_map_boundaries.sql", "utf8");

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
  await client.query(sql);
  console.log("Migration applied.");
} finally {
  await client.end();
}
```

Run (PowerShell): `$env:DB_PASSWORD = "<password from user>"; node scripts/apply-boundaries-migration.mjs`
Expected: `Migration applied.`

- [ ] **Step 4: Verify the seed with a scratch check script**

Create `scripts/check-boundaries.mjs`:

```js
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from("wine_map_nodes").select("slug, boundary_geojson");
if (error) throw error;
for (const row of data) {
  console.log(row.slug, row.boundary_geojson ? row.boundary_geojson.type : "NULL");
}
```

Run: `node scripts/check-boundaries.mjs`
Expected: 14 lines, every one ending in `Polygon` (none `NULL`).

- [ ] **Step 5: Delete both scratch scripts**

```powershell
Remove-Item scripts/apply-boundaries-migration.mjs, scripts/check-boundaries.mjs
```

- [ ] **Step 6: Update the hand-written database types**

In `src/lib/supabase/database.types.ts`, inside the `wine_map_nodes` table type: add to `Row` (after `sort_order: number;`):

```ts
          boundary_geojson: unknown;
```

and to `Insert` (after `sort_order?: number;`):

```ts
          boundary_geojson?: unknown;
```

(`unknown`, not a GeoJSON type — this file stays dependency-free; consumers cast at the edge.)

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit` → no errors. `npx eslint src/lib/supabase/database.types.ts` → clean. (`npm run build` not needed yet — no runtime code changed — but harmless.)

```bash
git add supabase/migrations/20260723090000_wine_map_boundaries.sql src/lib/supabase/database.types.ts
git commit -m "feat: add boundary_geojson to wine_map_nodes with placeholder Bordeaux shapes"
```

---

### Task 2: `InteractiveWineMap` component

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/app/knowledge/map/interactive-wine-map.tsx`

**Interfaces:**
- Consumes: `wine_map_nodes.boundary_geojson: unknown` (Task 1); `WineMapNode` = `Database["public"]["Tables"]["wine_map_nodes"]["Row"]`.
- Produces: `export function InteractiveWineMap(props: { region: WineMapNode | null; appellations: WineMapNode[]; focusedId: string | null; onFocus: (id: string) => void }): JSX.Element | null` — returns `null` when nothing has a boundary. Task 3 imports it via `next/dynamic` with `ssr: false`.

- [ ] **Step 1: Install dependencies**

```powershell
npm install maplibre-gl react-map-gl @turf/bbox
```

Expected: installs cleanly. If `tsc` later complains about missing GeoJSON types, also `npm install -D @types/geojson` (usually a transitive dep of maplibre-gl already).

- [ ] **Step 2: Create the component**

Create `src/app/knowledge/map/interactive-wine-map.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import bbox from "@turf/bbox";
import type { Geometry } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Database } from "@/lib/supabase/database.types";

type WineMapNode = Database["public"]["Tables"]["wine_map_nodes"]["Row"];

// Free, un-keyed Carto vector basemap — clean and muted so the polygons pop.
const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const APPELLATION_LAYER_ID = "appellation-fills";

function geometryOf(node: WineMapNode): Geometry | null {
  return (node.boundary_geojson as Geometry | null) ?? null;
}

function toFeature(node: WineMapNode) {
  const geometry = geometryOf(node);
  if (!geometry) return null;
  return {
    type: "Feature" as const,
    properties: { id: node.id, name: node.name },
    geometry,
  };
}

export function InteractiveWineMap({
  region,
  appellations,
  focusedId,
  onFocus,
}: {
  region: WineMapNode | null;
  appellations: WineMapNode[];
  focusedId: string | null;
  onFocus: (id: string) => void;
}) {
  const mapRef = useRef<MapRef>(null);

  const appellationCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: appellations
        .map(toFeature)
        .filter((f): f is NonNullable<typeof f> => f !== null),
    }),
    [appellations],
  );

  const regionFeature = useMemo(
    () => (region ? toFeature(region) : null),
    [region],
  );

  // Auto-fit: fly to the focused node's shape; if the focused node has no
  // boundary (or nothing is focused), fall back to the region's shape.
  useEffect(() => {
    const focusedNode =
      appellations.find((n) => n.id === focusedId) ??
      (region?.id === focusedId ? region : null);
    const target =
      (focusedNode && geometryOf(focusedNode)) ??
      (region && geometryOf(region));
    if (!target) return;
    const [minX, minY, maxX, maxY] = bbox(target);
    mapRef.current?.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 48, duration: 900, maxZoom: 11 },
    );
  }, [focusedId, region, appellations]);

  if (appellationCollection.features.length === 0 && !regionFeature) {
    return null;
  }

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border">
      <Map
        ref={mapRef}
        mapStyle={BASEMAP_STYLE}
        initialViewState={{ longitude: -0.58, latitude: 44.84, zoom: 7 }}
        interactiveLayerIds={[APPELLATION_LAYER_ID]}
        onClick={(e) => {
          const id = e.features?.[0]?.properties?.id;
          if (typeof id === "string") onFocus(id);
        }}
        onMouseMove={(e) => {
          const map = mapRef.current;
          if (map) {
            map.getCanvas().style.cursor = e.features?.length ? "pointer" : "";
          }
        }}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        {regionFeature ? (
          <Source id="region-boundary" type="geojson" data={regionFeature}>
            <Layer
              id="region-outline"
              type="line"
              paint={{
                "line-color": "#C3A25B",
                "line-width": 2,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
        ) : null}
        <Source id="appellations" type="geojson" data={appellationCollection}>
          <Layer
            id={APPELLATION_LAYER_ID}
            type="fill"
            paint={{
              "fill-color": [
                "case",
                ["==", ["get", "id"], focusedId ?? ""],
                "#B78E42",
                "#5C1A2B",
              ],
              "fill-opacity": [
                "case",
                ["==", ["get", "id"], focusedId ?? ""],
                0.65,
                0.35,
              ],
            }}
          />
          <Layer
            id="appellation-outlines"
            type="line"
            paint={{ "line-color": "#5C1A2B", "line-width": 1 }}
          />
          <Layer
            id="appellation-labels"
            type="symbol"
            layout={{
              "text-field": ["get", "name"],
              "text-size": 11,
              "text-font": ["Montserrat Regular"],
            }}
            paint={{
              "text-color": "#3d1220",
              "text-halo-color": "#F5EFE3",
              "text-halo-width": 1,
            }}
          />
        </Source>
      </Map>
    </div>
  );
}
```

Implementation notes for this step:
- The brand hex values (`#5C1A2B` Bordeaux, `#C3A25B` gold, `#B78E42` gold-deep, `#F5EFE3` parchment) are hardcoded because MapLibre paint expressions can't read CSS variables. This mirrors what the old SVG did with Tailwind arbitrary values.
- `"text-font": ["Montserrat Regular"]` must be a glyph set the Carto style actually serves. If labels don't render, check the style JSON's available fonts (fetch `BASEMAP_STYLE` and look at its `glyphs`/existing symbol layers) and use one of those font names, or drop the `text-font` line entirely to use the style default.
- If `react-map-gl`'s import path differs in the installed major version (e.g. `react-map-gl/maplibre` not found), check `node_modules/react-map-gl/package.json` `exports` before changing the import.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` → no errors. `npx eslint src/app/knowledge/map/interactive-wine-map.tsx` → clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app/knowledge/map/interactive-wine-map.tsx
git commit -m "feat: MapLibre interactive wine map component"
```

---

### Task 3: Wire `InteractiveWineMap` into `WineMapExplorer`, remove the schematic SVG

**Files:**
- Modify: `src/app/knowledge/map/wine-map-explorer.tsx`

**Interfaces:**
- Consumes: `InteractiveWineMap({ region, appellations, focusedId, onFocus })` from Task 2.
- Produces: no interface changes — `WineMapExplorer({ nodes })` keeps its existing signature, so `page.tsx` needs no changes (it already does `select("*")`, which picks up `boundary_geojson` automatically).

- [ ] **Step 1: Replace the SVG with the map**

In `src/app/knowledge/map/wine-map-explorer.tsx`:

1. Delete the entire `REGION_LAYOUTS` constant (lines 11–49) and its comment block.
2. Replace the imports at the top:

```tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type WineMapNode = Database["public"]["Tables"]["wine_map_nodes"]["Row"];

// maplibre-gl touches `window` on import — must never be server-rendered.
const InteractiveWineMap = dynamic(
  () =>
    import("./interactive-wine-map").then((m) => m.InteractiveWineMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-lg border bg-muted" />
    ),
  },
);
```

3. Delete the line `const layout = selectedRegion ? REGION_LAYOUTS[selectedRegion.slug] : null;` (keep `selectedRegion` itself — the map needs it).
4. Inside the left `<Card>`'s `<CardContent>`, replace the whole `{layout ? ( <svg ...>...</svg> ) : null}` block with:

```tsx
            <InteractiveWineMap
              region={selectedRegion ?? null}
              appellations={appellations}
              focusedId={focusedId}
              onFocus={setFocusedId}
            />
```

5. Keep the plain clickable pill list below it unchanged — it remains the fallback for nodes without boundaries and the mobile-friendly alternative (update its comment to say "fallback for any node without boundary data" instead of referencing hand-tuned layouts).

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit` → no errors.
Run: `npx eslint src/app/knowledge/map/wine-map-explorer.tsx src/app/knowledge/map/interactive-wine-map.tsx` → clean.
Run: `npm run build` → succeeds. Watch for any SSR/`window` errors on the `/knowledge/map` route in the build output — if the build fails with `window is not defined`, the dynamic `ssr: false` import isn't being respected; check `node_modules/next/dist/docs/` for this Next version's lazy-loading guidance rather than guessing.

- [ ] **Step 3: Runtime smoke test**

Start the dev server (`npm run dev`; if a route 404s unstyled, stop, `Remove-Item -Recurse -Force .next`, restart). Sign in with the demo login (`demo.isabelle@blindr.invalid` / `BlindrDemoPerson123!`) and load `/knowledge/map`. Verify via the RSC/hidden-div workaround if the preview pane sticks on its loading state (known tool issue, not an app bug). Confirm:
- The map renders the 12 appellation boxes over a basemap of the Bordeaux area, with the region outline dashed in gold.
- Clicking a polygon updates the right-hand detail card.
- Clicking a pill flies/zooms the map to that polygon.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge/map/wine-map-explorer.tsx
git commit -m "feat: replace schematic wine map SVG with interactive MapLibre map"
```

---

### Task 4: Documentation + push

**Files:**
- Modify: `CLAUDE.md` (the Wine Map bullet under `/knowledge`)
- Modify (commit if not yet committed): `docs/superpowers/specs/2026-07-18-wine-map-design.md`, `docs/superpowers/plans/2026-07-18-interactive-wine-map.md`

**Interfaces:**
- Consumes: everything shipped in Tasks 1–3.
- Produces: up-to-date domain rules; feature live on master.

- [ ] **Step 1: Update CLAUDE.md's Wine Map bullet**

Replace the part of the `/knowledge` Wine Map bullet that describes the SVG diagram (`The SVG diagram is opt-in per region via REGION_LAYOUTS[slug] ... without needing a hand-drawn map for each one.`) with:

```markdown
    The map view is a real interactive geographic map
    (`interactive-wine-map.tsx`: MapLibre GL via `react-map-gl/maplibre`,
    free un-keyed Carto Positron vector basemap — no API key). Each node
    can carry a `boundary_geojson` JSONB column (a bare GeoJSON *geometry*,
    not a Feature; migration `20260723090000_wine_map_boundaries.sql`) —
    typed `unknown` in `database.types.ts` and cast to `GeoJSON.Geometry`
    at the component edge. The component must ONLY be loaded via
    `next/dynamic` with `ssr: false` (maplibre-gl touches `window` on
    import). Clicking a polygon and clicking a pill both drive the same
    `focusedId`; the map auto-fits (`@turf/bbox` + `fitBounds`) to the
    focused shape. Brand colors are hardcoded hex in the MapLibre paint
    expressions (paint expressions can't read CSS variables). Nodes without
    `boundary_geojson` simply don't render on the map — the always-present
    pill list is the fallback, and rough placeholder polygons (hand-drawn
    boxes, NOT real boundaries) are seeded for the France/Bordeaux tree;
    replacing them with real traced boundaries is a data task, not a code
    task. The old hand-positioned schematic SVG (`REGION_LAYOUTS`) is gone.
```

- [ ] **Step 2: Verify, commit, push**

Run: `npx eslint` is N/A for markdown; run `npm run build` once more if any code changed since Task 3 (otherwise skip).

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-18-wine-map-design.md docs/superpowers/plans/2026-07-18-interactive-wine-map.md
git commit -m "docs: interactive wine map domain rules, spec and plan"
git push origin master
```

Expected: push succeeds; Vercel auto-deploys.
