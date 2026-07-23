# World Wine Map — Champagne region (design)

Date: 2026-07-23
Status: **PROPOSED — awaiting owner approval** (boundary-source decision is a gate;
no live production migration has been run for this yet).
Predecessors: Phase 3 France design (`2026-07-21-world-wine-map-phase-3-france-design.md`),
Phase 3C Burgundy depth, classification addendum. Live map at the Phase 3F state
(≈793 places / 859 boundaries, France to climat level).

## Objective

Add **Champagne** as a tier-1 France region on the live tile map — a selectable
outline + knowledge article + reviewed scoring link — using the established
pipeline. Champagne is the template for every remaining "no INAO parcel"
region, so getting its boundary-source pattern right matters beyond Champagne.

## Why Champagne is different (the crux)

Every French boundary so far is built `GENERALIZED_FROM_OFFICIAL_SOURCE` by
dissolving member parcels from the IGN INAO `AOC-VITICOLES:aire_parcellaire`
WFS layer. **Champagne has zero parcels in that layer** (verified live in the
Phase 3 spec; its delimitation isn't published there). The only existing
`MANUAL` precedent — France itself — came from Natural Earth 1:50m admin-0
(`extract-france-ne.mjs`), which only contains countries, not sub-national wine
regions. So Champagne cannot reuse either existing path unchanged; its footprint
needs a deliberately chosen source. This was foreseen and deferred:
> "No usable membership (Champagne) … `MANUAL` outline with honest provenance,
> Natural-Earth-France style." — Phase 3 France design

## Boundary source — decision required (owner)

The AOC's legal area is *parcels within ~635 communes* across Marne, Aube,
Aisne, Haute-Marne, Seine-et-Marne. No open parcel layer exists. Options, with
trade-offs:

- **Option A (recommended): commune-union from IGN Admin Express.** Dissolve the
  polygons of the reviewed official Champagne commune list (Licence Ouverte
  Etalab — same authority family as INAO, consistent with existing provenance).
  The commune list ships as a reviewed in-repo artifact
  (`data/wine-map/champagne-communes.json`); the source is honest and
  re-derivable. Fidelity caveat: it is an *over-approximation* (whole communes,
  not the parcels inside them) — acceptable at region display zoom (z4–~8) and
  how most wine atlases depict Champagne. Method: `MANUAL` (or
  `GENERALIZED_FROM_OFFICIAL_SOURCE` if the commune list is treated as the
  reviewed membership — owner's call on labelling). Requires a small
  source-availability spike first (confirm Admin Express communes are fetchable
  and that we have an authoritative commune list).
- **Option B (fast fallback): reviewed hand-traced `MANUAL` outline.** A coarse
  region polygon (Reims–Épernay–Aube), like the original 20-point France outline
  that was later replaced. Ships in a day, refine later. Honest but low fidelity.
- **Option C (avoid): OpenStreetMap relation.** An OSM boundary may exist but is
  ODbL (attribution + share-alike) — introduces a new licence class the repo has
  so far avoided (Natural Earth public-domain + IGN/INAO Licence Ouverte only).

Recommendation: **A**, with **B** as an explicit fallback if the Admin Express
spike doesn't land cleanly. Whichever is chosen, the boundary is staged `DRAFT`
and only flipped current-`VALIDATED` after a rendered preview review — never
auto-published (architecture invariant).

## Catalog changes (v1 = region only)

1. **New place** `france.champagne`: `REGION`, `display_tier` 1, `min_zoom`≈4,
   French display name "Champagne", `publication_status` `DRAFT` → `VERIFIED`
   only after boundary + article review. `canonical_key` immutable once locked.
2. **Boundary**: source + snapshot rows (provenance per the chosen option),
   `wine_place_boundaries` staged `DRAFT`, generalized to region tolerance;
   flip to current-`VALIDATED` in a reviewed migration (dry-run → live), with a
   bbox window guard (Champagne ≈ lon [3.3, 4.9], lat [47.9, 49.4]) mirroring
   the France-boundary guard pattern.
3. **Scoring link**: live `regions` row **Champagne** → `france.champagne`,
   `map_status = VERIFIED`, exact-name match only (row keeps its UUID + name;
   French display name lives on `wine_places`). The `Champagne AOC` appellation
   row stays PENDING unless a place exists for it (region-only v1 links the
   region; the AOC == region duplicate follows the addendum's one-node rule —
   link the appellation row to the same region place if owner prefers).
4. **Knowledge content** (may launch `PLACEHOLDER`): article (chalk/craie soils,
   cool climate, traditional-method sparkling); grape links Chardonnay, Pinot
   Noir, Pinot Meunier (+ the four rare: Arbane, Petit Meslier, Pinot Blanc,
   Pinot Gris/Fromenteau); style = sparkling; designations note the Échelle des
   Crus (Grand Cru / Premier Cru are *commune* ratings, not parcel appellations).

## Out of scope for v1 (later phase, noted)

- **Sub-regions** (Montagne de Reims, Vallée de la Marne, Côte des Blancs, Côte
  de Sézanne, Côte des Bar) and the **Échelle des Crus** villages (17 Grand Cru,
  42 Premier Cru communes). These are commune-scale classifications, not parcel
  appellations, so they'd model as `SITE`/designation depth and want their own
  boundary approach — a follow-up once the region ships. If depth is added, its
  tier≥2 places route to a `champagne.pmtiles` shard per the manifest-v2 model.

## Tile / publication

Tier-1 region → `world.pmtiles` (z4+); `export` already emits whatever is
`VERIFIED` + current-`VALIDATED`, so v1 is a single workflow dispatch
(publish → promote) after review. No new shard for region-only v1. World-archive
size budget (<100 KB) re-checked at publish.

## Migration & safety discipline (unchanged repo standard)

Every live apply: dry-run inside a rollback transaction first; fail-closed
`raise exception` guards; **same-transaction assertions** + independent
post-apply verification (never trust "version recorded" — the twin-applier
incident rule); scratch-apply pattern; foundation + context suites green before
and after; version-number collision check against existing migrations.

## Verification / owner gates

1. Boundary-source spike result (A feasible? else B).
2. Rendered **preview review** of the Champagne outline (SVG + numeric sanity:
   inside the bbox window, sane vertex/part counts) — owner approves shapes.
3. Foundation test count bump (+1 place, +1 boundary, +1 link) committed as the
   diff = review evidence; context test for the new region.
4. Post-promote **live tile probe** + owner "see it on the map" sign-off.

## Decisions needed from owner before any live change

1. **Boundary source: A, B, or C** (recommendation: A, fallback B).
2. **v1 scope**: region-only (recommended) vs. include sub-region depth now.
3. **Method label** for Option A (`MANUAL` vs `GENERALIZED_FROM_OFFICIAL_SOURCE`).
4. Go-ahead to run the live migrations (I will not apply them to production
   unattended — this doc is the pre-work up to that gate).
