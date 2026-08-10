# Italy Wine Map — Piedmont Pilot (Barolo + Barbaresco) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Italy on the live wine map with a Piedmont pilot — the `italy` country node, the `italy.piemonte` region, and the `Barolo` and `Barbaresco` DOCG appellations — reusing the France pipeline unchanged and matching its map styling exactly.

**Architecture:** France's boundaries come free from the IGN/INAO WFS; Italy has no equivalent, so footprints are built by dissolving the **member comuni** of each denomination (the Champagne/Alsace commune model) over **ISTAT** official comune geometry, plus **Natural Earth** for the country outline. Everything downstream of a staged boundary — concave generalizer, tile export/validate/publish, manifest, and the map UI — is reused without change. New places appear on the map purely as data + a tile release.

**Tech Stack:** Node ESM (`.mjs`) scripts + `node --test`; PostGIS (dissolve) via `pg`; Supabase Storage for raw-source provenance; MapLibre GL / `react-map-gl` (existing UI); tippecanoe (GitHub Actions only).

## Global Constraints

- **Sources allowed:** ISTAT comuni geometry + Natural Earth 1:50m admin-0 (country) only. **No OpenStreetMap** (ODbL share-alike; repo policy). Confirm ISTAT licence terms before any fetch (owner gate).
- **Verified domain facts are frozen** in `data/wine-map/barolo-comuni.json` and `data/wine-map/barbaresco-comuni.json` (disciplinare-verified 2026-08-09). Do not edit the comune membership without re-verifying against the Ministry disciplinare (`catalogoviti.politicheagricole.it`). Grape = 100% Nebbiolo (Michet/Lampia/Rosé) for both; province = Cuneo (CN); DOCG since 1980.
- **`canonical_key` is immutable once a place is VERIFIED** (DB trigger locks it): `italy` → `italy.piemonte` → `italy.piemonte.barolo` / `italy.piemonte.barbaresco`. Lock these strings now.
- **No schema/enum migration is required.** `appellation_system` is free text → use `'DOCG'`. `appellation_level` check allows `('regional','subregional','communal','cru')` → Barolo/Barbaresco = `'communal'`. `wine_place_kind` (`COUNTRY`/`REGION`/`APPELLATION`) and `wine_boundary_method` (`MANUAL`) already exist.
- **Boundaries stage `DRAFT`/non-current and flip to `VALIDATED`+current ONLY after a rendered preview review** (architecture invariant). Every flip carries a bbox window guard.
- **Whole-comune footprints ⇒ `boundary_method = 'MANUAL'`** (honest over-approximation, exactly like Champagne's villages).
- **Map styling MUST match France exactly** (`src/app/knowledge/map/tile-wine-map.tsx`): Carto Positron basemap (`https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`), region fill keyed by region slug (add `piemonte`), `SELECTED_COLOR = '#B78E42'`, casing line `#FFFDF7`, label ink `#2b0f18` / halo `#FFFDF7`; child appellations are auto-colored from the existing `CHILD_RAMP`. Map components load via `next/dynamic` with `ssr:false` only.
- **Tiles:** manifest `schema_version: 2`; country + region (tier ≤ 1) → `world.pmtiles`; denominations (tier ≥ 2) → per-region shard `piemonte.pmtiles`. tippecanoe runs only in the `wine-map-tiles` GitHub Actions workflow.
- **Migration discipline:** dry-run inside a rollback transaction first; fail-closed `raise exception` guards; same-transaction assertions + independent post-apply verification; version-number collision check; foundation + context suites green before and after.
- **OWNER GATES — no unattended production writes.** Tasks 1–2 are local (no shared-DB writes) and a collaborator may run them. Tasks 3–7 write to the shared Supabase / CI and require the repo owner (christianolin) to run or explicitly approve: licence confirmation, each DRAFT→VALIDATED flip after preview review, running live migrations, and tile publish/promote.

## Domain facts (source of truth = the two committed artifacts)

| | Barolo DOCG | Barbaresco DOCG |
|---|---|---|
| Comuni (whole) | Barolo, Castiglione Falletto, Serralunga d'Alba | Barbaresco, Neive, Treiso |
| Comuni (partial) | Monforte d'Alba, Novello, La Morra, Verduno, Grinzane Cavour, Diano d'Alba, Cherasco, Roddi | Alba (frazione **San Rocco Seno d'Elvio** only) |
| Footprint policy | whole-comune union of all 11 (over-approx; partial-comuni trim is an owner review) | **union of Barbaresco+Neive+Treiso; EXCLUDE all of Alba** (only a frazione qualifies; whole-Alba would over-inflate) |
| Grape | 100% Nebbiolo | 100% Nebbiolo |

## File Structure

- Create: `scripts/wine-map-sources/istat-lib.mjs` — ISTAT comuni adapter: name-normalize/match, PRO_COM extraction, source URL/paging helpers (pure, unit-testable).
- Create: `scripts/wine-map-sources/istat-lib.test.mjs` — unit tests for the pure helpers.
- Create: `scripts/wine-map-sources/fetch-piedmont-comuni.mjs` — fetch ISTAT comuni for the member set, name-match to the artifacts (assert all resolve), dissolve to per-denomination footprints, write a labelled preview SVG. `--local-only` writes GeoJSON+SVG to disk and touches no DB/bucket; without it, stages DRAFT boundaries + provenance rows (owner-run).
- Create: `data/wine-map/barolo-comuni.json`, `data/wine-map/barbaresco-comuni.json` — **already created & verified.**
- Modify: `src/app/knowledge/map/tile-wine-map.tsx` — add `piemonte` to the region color map (near lines 50–63).
- Create: `supabase/migrations/2026XXXXXXXXXX_italy_piedmont_catalog.sql` — italy/piemonte/barolo/barbaresco places (DRAFT).
- Create: `supabase/migrations/2026XXXXXXXXXX_italy_piedmont_boundary_flip.sql` — promote DRAFT boundaries + places, bbox guards, assertions.
- Modify: `scripts/world-wine-map-foundation.test.mjs` + `data/wine-map/boundary-expectations.json` — updated counts (review evidence).

---

### Task 1: ISTAT source adapter library (pure helpers) — LOCAL

**Files:**
- Create: `scripts/wine-map-sources/istat-lib.mjs`
- Test: `scripts/wine-map-sources/istat-lib.test.mjs`

**Interfaces:**
- Produces: `normalizeComuneName(name: string): string` — casefold, strip accents, collapse apostrophes/whitespace, for robust matching (`Serralunga d'Alba` ≈ `SERRALUNGA D'ALBA`). `matchComune(feature, targetName): boolean`. `ISTAT_COMUNI_URL: string`, `PRO_COM_PROP: string`, `NAME_PROP: string` (confirmed against the ISTAT layer in the spike).

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeComuneName, matchComune } from "./istat-lib.mjs";

test("normalizeComuneName folds case, accents, apostrophes", () => {
  assert.equal(normalizeComuneName("Serralunga d'Alba"), "serralunga d alba");
  assert.equal(normalizeComuneName("SERRALUNGA D’ALBA"), "serralunga d alba"); // curly apostrophe
  assert.equal(normalizeComuneName("Monforte d'Alba"), "monforte d alba");
});

test("matchComune compares on normalized ISTAT name property", () => {
  const feature = { properties: { COMUNE: "Grinzane Cavour" } };
  assert.equal(matchComune(feature, "Grinzane Cavour", "COMUNE"), true);
  assert.equal(matchComune(feature, "Diano d'Alba", "COMUNE"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/wine-map-sources/istat-lib.test.mjs`
Expected: FAIL (module not found / export missing).

- [ ] **Step 3: Write minimal implementation**

```js
// ISTAT comuni adapter. Geometry source: ISTAT "Confini delle unità
// amministrative a fini statistici" (comuni). URL + property names are
// pinned during the source spike (Task 2, step 1) and asserted there.
export const ISTAT_COMUNI_URL = "TBD-IN-SPIKE"; // set once, then treat as pinned provenance
export const PRO_COM_PROP = "PRO_COM";
export const NAME_PROP = "COMUNE";

export function normalizeComuneName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchComune(feature, targetName, nameProp = NAME_PROP) {
  return normalizeComuneName(feature?.properties?.[nameProp]) ===
    normalizeComuneName(targetName);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/wine-map-sources/istat-lib.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/wine-map-sources/istat-lib.mjs scripts/wine-map-sources/istat-lib.test.mjs
git commit -m "feat(wine-map): ISTAT comune name-match adapter"
```

---

### Task 2: Local dissolve + France-styled preview (NO shared-DB writes) — LOCAL

This is the reviewable "does Italy work?" deliverable. It produces the two footprints and a preview whose styling matches the live France map, without touching the shared database.

**Files:**
- Modify: `scripts/wine-map-sources/fetch-piedmont-comuni.mjs` (add `--local-only`)
- Consumes: `data/wine-map/{barolo,barbaresco}-comuni.json`, `istat-lib.mjs`.
- Produces on disk: `.tiles-build/sources/{barolo,barbaresco}-footprint.geojson`, `.tiles-build/sources/piedmont-preview.html` (MapLibre + Positron), `.tiles-build/sources/piedmont-preview.svg`.

- [ ] **Step 1: Pin the ISTAT source (spike).** Locate the official ISTAT comuni download (generalized GeoJSON, EPSG:4326). Record its exact URL, the property names for comune name + `PRO_COM`, and the **licence/attribution string**. Write these into `istat-lib.mjs` (`ISTAT_COMUNI_URL`, `NAME_PROP`, `PRO_COM_PROP`). **Owner gate:** licence must be confirmed acceptable (attribution-only, no share-alike) before proceeding.

- [ ] **Step 2: Fetch + name-match, assert full resolution.** Load the ISTAT comuni, select the features whose normalized name matches each artifact's `in_footprint` comuni. Assert every expected comune resolves exactly once; abort otherwise (fail-closed — a missing/renamed comune must fail the build, not silently drop). Barolo footprint set = all 11; Barbaresco footprint set = Barbaresco+Neive+Treiso (Alba excluded per artifact `in_footprint:false`). Write matched `PRO_COM` back into local copies of the artifacts for the record.

```js
const expected = comuni.filter((c) => c.in_footprint !== false).map((c) => c.name);
const matched = expected.map((name) => {
  const hits = istat.features.filter((f) => matchComune(f, name));
  assert.equal(hits.length, 1, `comune "${name}" matched ${hits.length} ISTAT features (need exactly 1)`);
  return hits[0];
});
```

- [ ] **Step 3: Dissolve to one footprint per denomination.** Union the matched comune polygons (PostGIS `ST_Union` in a rolled-back temp-table transaction, or a client-side union) → a single MultiPolygon per denomination. Also union all denomination footprints → a `italy.piemonte` region preview outline. Write the GeoJSONs to `.tiles-build/sources/`.

- [ ] **Step 4: Render the France-styled preview.** Emit `piedmont-preview.html`: a MapLibre GL map using the **exact** France constants — basemap `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`, Barolo/Barbaresco fills from the France `CHILD_RAMP`, casing `#FFFDF7`, labels ink `#2b0f18`/halo `#FFFDF7`, camera fit to the footprint bbox. Also emit `piedmont-preview.svg` (labelled, static) for quick sign-off. This is the artifact the owner eyeballs.

- [ ] **Step 5: Verify shapes numerically.** Assert each footprint is inside the Piedmont window (lon [7.0, 9.2], lat [44.1, 46.5]), has ≥1 part, and Barolo area > Barbaresco area (sanity). Print vertex/part counts.

Run: `node scripts/wine-map-sources/fetch-piedmont-comuni.mjs --local-only`
Expected: two footprints + preview files written; all assertions pass; no DB/network writes beyond the ISTAT fetch.

- [ ] **Step 6: Commit** (scripts only — build outputs stay under `.tiles-build/`, which is git-ignored).

```bash
git add scripts/wine-map-sources/fetch-piedmont-comuni.mjs scripts/wine-map-sources/istat-lib.mjs
git commit -m "feat(wine-map): local Piedmont footprint + France-styled preview"
```

**⇩ OWNER GATE — everything below writes to the shared Supabase project or CI. Do not run without the repo owner. ⇩**

---

### Task 3: Catalog migration — italy / piemonte / barolo / barbaresco (DRAFT) — OWNER-GATED

**Files:**
- Create: `supabase/migrations/2026XXXXXXXXXX_italy_piedmont_catalog.sql` (use the next free 14-digit timestamp; check for collision).

- [ ] **Step 1: Write the migration** — insert four places, all `publication_status = 'DRAFT'` (canonical_key stays unlocked until VERIFIED):

```sql
begin;
-- italy (COUNTRY, tier 0)
insert into wine_places (slug, canonical_key, name, kind, display_tier, is_appellation, publication_status, sort_order)
values ('italy', 'italy', 'Italia', 'COUNTRY', 0, false, 'DRAFT', 100);
-- piemonte (REGION, tier 1)
insert into wine_places (slug, canonical_key, name, kind, display_tier, is_appellation, publication_status, sort_order, primary_parent_id)
select 'piemonte', 'italy.piemonte', 'Piemonte', 'REGION', 1, false, 'DRAFT', 10, id
  from wine_places where canonical_key = 'italy';
-- barolo + barbaresco (APPELLATION, tier 2, DOCG, communal)
insert into wine_places (slug, canonical_key, name, kind, display_tier, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, true, 'DOCG', 'communal', 'DRAFT', v.so, p.id
  from (values ('barolo','italy.piemonte.barolo','Barolo',10),
               ('barbaresco','italy.piemonte.barbaresco','Barbaresco',20)) as v(slug,ckey,name,so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte') p;
-- same-transaction assertion
do $$ begin
  if (select count(*) from wine_places where canonical_key like 'italy%') <> 4
    then raise exception 'expected 4 italy places'; end if;
end $$;
commit;
```

- [ ] **Step 2: Dry-run** the migration inside a `begin; ... rollback;` wrapper against the pooler connection; confirm the assertion passes and the hierarchy trigger accepts the tier ladder (0→1→2). Fix any collision on the version number.

- [ ] **Step 3: Apply** via `npx supabase db push --db-url "<pooler-connection-string>"` (owner-run). Verify independently: `select canonical_key, kind, display_tier, publication_status from wine_places where canonical_key like 'italy%' order by display_tier;`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026XXXXXXXXXX_italy_piedmont_catalog.sql
git commit -m "feat(wine-map): Italy/Piedmont/Barolo/Barbaresco catalog (DRAFT)"
```

---

### Task 4: Stage DRAFT boundaries + provenance — OWNER-GATED

**Files:** run `fetch-piedmont-comuni.mjs` in DB mode (no `--local-only`).

- [ ] **Step 1:** For the country node, mirror France: create/verify a `NATURAL_EARTH` boundary source and stage the Italy outline (`extract-italy-ne.mjs` mirroring `extract-france-ne.mjs`), `boundary_method = 'MANUAL'`, `DRAFT`.
- [ ] **Step 2:** Run `fetch-piedmont-comuni.mjs` (DB mode) to: upload the raw ISTAT source snapshot to the private `wine-map-sources` bucket with SHA-256 checksums; create `wine_boundary_sources` + `_snapshots` rows (namespace `ISTAT_CONFINI`); stage the barolo, barbaresco, and piemonte footprints as `wine_place_boundaries` rows, `boundary_method = 'MANUAL'`, `quality_status = 'DRAFT'`, non-current.
- [ ] **Step 3:** Assert each staged boundary links to its place and sits in the Piedmont bbox. Regenerate the preview SVG from the staged geometry for review.

---

### Task 5: Preview review → flip — OWNER-GATED

**Files:** Create `supabase/migrations/2026XXXXXXXXXX_italy_piedmont_boundary_flip.sql`.

- [ ] **Step 1: OWNER reviews the rendered preview** (France-styled). Gate — do not proceed without shape sign-off.
- [ ] **Step 2: Write the flip migration** — one transaction: promote the 4 DRAFT boundaries to `is_current` + `quality_status = 'VALIDATED'` behind a bbox window guard (Italy mainland for the country; Piedmont lon [7.0,9.2]/lat [44.1,46.5] for the rest); set the 4 places `DRAFT → VERIFIED` (locks their canonical_key). Same-transaction assertions: exactly 4 current-VALIDATED boundaries under `italy%`, each place VERIFIED.
- [ ] **Step 3: Dry-run → apply** (owner). Independent verify.
- [ ] **Step 4: Commit.**

---

### Task 6: France styling + knowledge + scoring links — OWNER-GATED (code portion local)

**Files:**
- Modify: `src/app/knowledge/map/tile-wine-map.tsx` (region color map ~L50–63).

- [ ] **Step 1 (local):** Add the Piedmont region color, distinct from every France hue and from Bordeaux's claret. Proposed `piemonte: "#7B2233"` (Nebbiolo garnet). Owner confirms the hue at review.

```ts
// in the region color map alongside bordeaux/bourgogne/champagne…
piemonte: "#7B2233",
```

- [ ] **Step 2 (owner):** Knowledge content that populates the **Details panel** (right side of `/knowledge/map`). **Do NOT ship `PLACEHOLDER` articles** — `tile-wine-map-explorer.tsx:297` nulls out any article with `editorial_status = 'PLACEHOLDER'`, leaving Details blank. Write real (`DRAFT`/`PUBLISHED`) articles for all four places: `barolo`/`barbaresco` — description (Langhe, Nebbiolo, tar-and-roses/perfumed style), `soils` (Barolo spans Tortonian + Serravallian marls; Barbaresco mostly Tortonian), `climate`, `key_facts` (DOCG 1980, 100% Nebbiolo, min ageing — Barolo 38 mo / Riserva 62, Barbaresco 26 mo / Riserva 50; **verify these ageing figures against the disciplinare before writing**); `piemonte` — short regional description; `italy` — one-line country article. Grape link **Nebbiolo** (`wine_place_grapes`) + still-red style (`wine_place_styles`) for Barolo/Barbaresco — these render as their own Details rows (`context.grapes`/`context.styles`) independent of the prose. Designation note: DOCG since 1980; MGA are future cru depth, not separate appellations.
- [ ] **Step 3 (owner):** Scoring links — link existing live `regions`/`appellations` rows for Piemonte/Barolo/Barbaresco to the new places via `wine_place_id`, exact-name match, `map_status = 'VERIFIED'`. **Note for later Italy batches (not this task):** "Classico" appellations must be linked scoped by `region_id`, never by name alone (seven distinct regional Classicos) — see CLAUDE.md.
- [ ] **Step 4:** Commit the styling change.

```bash
git add src/app/knowledge/map/tile-wine-map.tsx
git commit -m "feat(wine-map): Piedmont region color (France-matched palette)"
```

---

### Task 7: Publish tiles + verify live — OWNER-GATED (CI)

- [ ] **Step 1:** Update `scripts/world-wine-map-foundation.test.mjs` counts (+4 places, +4 boundaries, +4 manual, +4 linked) and regenerate `data/wine-map/boundary-expectations.json` from the post-flip live state (its diff is review evidence). Run the foundation + context suites green.
- [ ] **Step 2:** Dispatch the `wine-map-tiles` GitHub Actions workflow: export → tippecanoe → validate → publish → promote. Country+Piemonte region land in `world.pmtiles`; Barolo/Barbaresco go to the new `piemonte.pmtiles` shard; manifest `schema_version: 2` gains the shard. Re-check the world-archive size budget.
- [ ] **Step 3:** **Live probe + owner "see it on the map" sign-off** at `/knowledge/map`, checking all three panels the France map has: (1) **map** — select Italy → Piemonte → Barolo/Barbaresco; fills, casing, labels, camera-fit match the France regions; (2) **Explorer** (left) — Italy appears as a second country root next to France, and the breadcrumb/child-pills navigate Italy→Piemonte→Barolo/Barbaresco; (3) **Details** (right) — the article prose + Nebbiolo grape row + red-style row render (NOT blank, i.e. no PLACEHOLDER article); (4) **Legend** (bottom-left) — shows a Piemonte/Barolo/Barbaresco row in the `piemonte` color. This is the definition of done.

---

## Self-Review

**Spec coverage:** Objective (country + region + 2 DOCGs) → Tasks 3–7. Boundary source A (ISTAT comuni) → Tasks 1–2, 4. Natural Earth country → Task 4 step 1. Recommended phasing I-0 + I-1 → whole plan. Catalog changes (classification columns, no enum change) → Task 3. Tile/publication (world + piemonte shard, schema v2) → Task 7. Migration & safety discipline → Tasks 3/5. Owner gates (licence, preview, live apply, publish) → marked on Tasks 2–7. Out-of-scope MGA/partial-comune precision → recorded as owner-review flags in the artifacts + Task 2. ✅ No gaps.

**Placeholder scan:** `ISTAT_COMUNI_URL = "TBD-IN-SPIKE"` and the `2026XXXXXXXXXX` version numbers are **intentional** — the URL is pinned in Task 2 step 1 (with a licence gate) and timestamps are assigned at apply time with a collision check; both are called out at their step, not hidden. No silent TODOs.

**Type consistency:** `normalizeComuneName`/`matchComune`/`NAME_PROP`/`PRO_COM_PROP` are defined in Task 1 and consumed in Task 2. `in_footprint` (artifact field) drives Task 2 step 2's set selection and matches the committed JSON. `canonical_key` strings (`italy`, `italy.piemonte`, `italy.piemonte.barolo`, `italy.piemonte.barbaresco`) are identical across Tasks 3/5/6. Enum values (`'DOCG'`, `'communal'`, `'MANUAL'`, `'DRAFT'`/`'VALIDATED'`/`'VERIFIED'`) all match the real schema read from `20260727090000_world_wine_map_foundation.sql` and `20260801090000_wine_place_classification.sql`.
