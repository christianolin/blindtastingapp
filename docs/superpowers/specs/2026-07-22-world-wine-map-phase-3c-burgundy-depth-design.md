# World Wine Map — Phase 3C: Burgundy in Depth (design)

Date: 2026-07-22
Status: approved (owner brainstorm 2026-07-22)
Predecessors: Phase 3A (schema + INAO adapter + corrected Bordeaux + Bourgogne pilot, live at `3747e2e`); classification addendum `2c0a84c`; Phase 2 tile pipeline.

## Objective

Model **all of Burgundy** to full legal depth — region → district → village → premier cru → grand cru / climat — rendered on the tile map with deep zoom and progressive detail, **without slowing the app**. Burgundy is the maximal stress test (5 nested levels, ~760 places, sub-hectare crus, detached districts); solving it validates the architecture for every other region. Côte de Nuits ships first as an end-to-end proof, then the rest of Burgundy, then the pattern is back-applied to Bordeaux and the remaining French regions.

## What Burgundy is (sized from the committed INAO vocabulary)

| Level | kind | appellation_level | ~count | Source in `inao-denomination-membership.json` |
|---|---|---|---|---|
| Region | REGION | regional | 1 | Bourgogne (exists, live) |
| District | SUBREGION | subregional | ~7 | Côte de Nuits, Côte de Beaune, Côte Chalonnaise, Mâconnais, Chablis, Châtillonnais, Couchois |
| Village | APPELLATION | communal | ~85 | Gevrey-Chambertin (649), Vosne-Romanée (394) |
| Grand cru | APPELLATION | grand_cru | ~33 | Échezeaux (56), Musigny (14), Corton (127) |
| Premier-cru climat | SITE | premier_cru | ~634 | Vosne-Romanée 1er cru Les Suchots (23) |

**Grand-cru naming trap:** most Burgundy grand crus contain no "grand cru" text (Échezeaux, Richebourg, Musigny, Chambertin…). A text filter finds only 8 of ~33. Grand crus MUST be enumerated from a **curated denomination list** committed as a data artifact, not pattern-matched.

## Performance architecture (the crux)

Today `archiveForTier` puts everything deeper than a region into a single `france.pmtiles` at maxzoom 12 — this cannot scale to ~760 climats and cannot render sub-hectare crus. Replace it with:

**Per-region deep shards, loaded on demand, with per-feature zoom-gating.**

1. **`world.pmtiles` (z0–7):** countries (tier 0) + regions (tier 1) only. Small, always loaded.
2. **One shard per region**, covering only that region's bbox, at high zoom — `burgundy.pmtiles` z4–**16**. Region area is tiny, so even z16 stays small (tile count ∝ area × 4^zoom).
3. **On-demand shard loading:** the UI loads a region's shard only when the user selects it or the viewport enters its bbox; **≤2 shards loaded at once**. The whole of France's detail is never downloaded at once.
4. **Per-feature `minzoom`** (already wired to each place's `min_zoom`) reveals depth progressively: district ~z8, village ~z10, 1er-cru group ~z12, grand cru ~z13, climat ~z14.

Mechanics this requires:
- **Manifest `schema_version` → 2:** each shard entry carries `{ url, checksum, bytes, bbox:[w,s,e,n], min_zoom, max_zoom, region_key }` so the UI knows when to fetch it. `world` unchanged shape; `shards` becomes a keyed map of the richer entry. Client parser accepts v2; falls back cleanly.
- **`archiveForTier` → `archiveForPlace`:** tier 0/1 → world; tier ≥2 → the shard named by the place's **region ancestor** (`canonical_key` second segment, e.g. `france.bourgogne.*` → `burgundy`). Bordeaux's appellations move from `france` to a `bordeaux` shard in 3E.
- **Build targets** become per-shard with per-region min/max zoom; tippecanoe runs once per archive.
- **UI** (`tile-wine-map.tsx`) becomes shard-generic: iterate `manifest.shards`, add/remove MapLibre sources by viewport/selection rather than the hardcoded single `wine-france` source.

## Data model

- **kinds** (all already in `wine_place_kind`): district=SUBREGION, village=APPELLATION, grand cru=APPELLATION, premier-cru climat=SITE, plain lieu-dit=VINEYARD. The "vineyard that is also an appellation" duality (Échezeaux) is expressed by `kind` (geographic/nav) being orthogonal to `is_appellation`+`appellation_level` (legal) — the four-axis model.
- **Schema gap 1:** extend the `appellation_level` CHECK to add `premier_cru` and `grand_cru` (keep `regional/subregional/communal/cru`). One constraint swap, transactional.
- **Nav shape:** Bourgogne → district → village → { grand crus (direct children of the village) ; a **premier-cru group node** per village → individual climats }. The 1er-cru group is a navigable node (`SITE`, is_appellation, premier_cru) matching how tasters think ("a Vosne 1er cru").
- **Parent footprints:** districts and the region get `boundary_method = DERIVED_FROM_DESCENDANTS` — the union of their children's geometries — so outlines are exactly what they contain (this also removes the current Bourgogne "island" artifacts). The premier-cru group footprint = union of its climats.
- **Boundary engine per level:** villages/grand crus/climats are small parcel sets (1–70 for climats, 200–650 for villages) → the **precise dissolve** path (like Bordeaux appellations, 7–156 vertices). The client-side **concave** engine stays only for big regional shapes; its **sliver bug is fixed** (drop output polygon parts below an area/vertex floor) — which also cleans up Bourgogne.
- **`canonical_key`** stays an opaque locked id; deep keys like `france.bourgogne.cote-de-nuits.vosne-romanee.echezeaux` are identifiers, never parsed for lineage (except the region-ancestor segment used only for shard routing).

## Rollout

- **3C — Côte de Nuits vertical slice (this plan):** the shard architecture + z16 + on-demand loading + the schema/level/engine changes, proven on Côte de Nuits — its ~8 villages, ~20 grand crus, a 1er-cru group per village, and **Vosne-Romanée's individual climats** as the explicit full-depth performance test. Fix Bourgogne's islands here. Ships behind the normal review + owner map gate.
- **3D — rest of Burgundy:** Côte de Beaune, Côte Chalonnaise, Mâconnais, Chablis, Châtillonnais (+ Couchois) in waves; full climat coverage everywhere.
- **3E — back-apply to Bordeaux:** re-shard Bordeaux; add St-Émilion grands crus and any cru depth.
- **3F — remaining French regions** (former Phase 3B), now routine on the shard pattern.

## Performance budget (gates for 3C)

- `world.pmtiles` < 100 KB.
- Each region shard < ~3 MB.
- ≤ 2 shards loaded simultaneously; a shard is fetched only on region entry.
- Initial map JS payload unchanged (no new always-loaded deps beyond pmtiles, already present).
- 3C reports measured shard size + first-detail-paint timing as an explicit acceptance gate before promotion.

## Out of scope for 3C

- Non-Burgundy regions; full Burgundy breadth (3D); Bordeaux re-shard (3E).
- Editorial article content per climat (placeholders are fine; the map renders regardless).
- Acceptable-alternate scoring (the DUAL_LABEL/declassification scoring hook stays a later enhancement).
- New source adapters — everything derives from the INAO parcel layer already in use.

## Risks / watch-items

- **Shard maxzoom cost:** z16 over Burgundy's bbox must be measured; if a shard exceeds the budget, cap climat detail zoom or split the shard by district.
- **Grand-cru list correctness:** the curated grand-cru denomination list is load-bearing and reviewed against INAO before staging.
- **Free-tier DB:** district/region footprints use client-side derivation (union of children) or the concave engine — never a heavy server-side dissolve of tens of thousands of parcels.
- **Scoring links:** Burgundy coverage in the live `appellations`/`regions` tables is audited; exact-name links only, everything else PENDING (no fuzzy matching).
