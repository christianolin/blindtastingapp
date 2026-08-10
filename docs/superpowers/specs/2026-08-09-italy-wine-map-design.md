# World Wine Map — Italy (design)

Date: 2026-08-09
Status: **PROPOSED — awaiting owner approval** (boundary-source decision is a gate;
no code, migration, or live change has been made — this is pre-work only).
Predecessors: Champagne region design (`2026-07-23-champagne-region-design.md`),
Alsace communes design (`2026-08-05-alsace-communes-design.md`), Phase 3 France
design (`2026-07-21-world-wine-map-phase-3-france-design.md`). Italy reuses the
Phase 2/3 pipeline unchanged and is a pure data-and-source-adapter effort.

## Objective

Add **Italy** to the live tile map as a new country, mirroring what exists for
France: a selectable country outline, tier-1 region outlines, and selectable
DOCG/DOC appellations with knowledge articles and reviewed scoring links — built
through the established `wine_places` → boundary → tiles pipeline, so no map UI
change is needed (`/knowledge/map` renders whatever shards the manifest lists).

## Why Italy is different (the crux)

**France's boundaries are handed to it for free by the French government.** Every
French footprint is dissolved from the IGN Géoplateforme WFS
(`AOC-VITICOLES:aire_parcellaire`, `inao-lib.mjs`) or IGN Admin Express communes —
official, open (Licence Ouverte Etalab), machine-readable, national.

**Italy has no equivalent.** There is no national WFS of DOC/DOCG vineyard
parcels. Italian denominations are defined in *disciplinari di produzione*
(MASAF production rulebooks) as **lists of comuni** — published as PDF text, with
no attached geometry. So Italy cannot reuse the France parcel path at all; its
footprints must be *constructed* from a different source. This is the same
problem Champagne already solved (zero parcels in the INAO layer), and its
solution is our template: **dissolve the member communes.**

The France-specific fetchers (`fetch-inao-denomination.mjs`, `inao-lib.mjs`) are
therefore **not reused**. Everything downstream of a staged boundary — the
concave generalizer, `build-boundary.mjs`, the tile export/validate/publish
workflow, the manifest, and the entire map UI — **is reused unchanged.**

## Boundary source — decision required (owner)

The dominant question, exactly as with Champagne. Options with trade-offs:

- **Option A (recommended): comune-union from ISTAT boundaries.** For each
  denomination, dissolve the ISTAT official comune polygons named in its
  disciplinare into one footprint — the Champagne model
  (`build-champagne-communes.mjs` / `fetch-champagne-communes.mjs`) with an
  Italian commune source. ISTAT publishes *confini amministrativi* (regioni /
  province / comuni) as open GeoJSON. The per-denomination comune list ships as a
  reviewed in-repo artifact (one per denomination, like
  `data/wine-map/champagne-communes.json`). Fidelity caveat, identical to
  Champagne: it is an **over-approximation** (whole comuni, not the vineyard land
  inside them) — acceptable at region/appellation display zoom and how most wine
  atlases depict Italian zones. `boundary_method = MANUAL`.
- **Option C (higher fidelity, per-region, layer on top of A): official regional
  geoportal GIS.** Where a region publishes real vineyard/cru geometry, use it
  for the deepest tier. The strongest case is **Piemonte Geoportale's MGA**
  (*Menzioni Geografiche Aggiuntive* — the named cru zones of Barolo/Barbaresco)
  as official GIS layers. Best fidelity, but fragmented: every region has its own
  portal, coverage, and licence, so this scales one region at a time.
- **Option B (fast stopgap only): hand-traced `MANUAL` outlines.** Coarse region
  polygons, like the original 20-point France outline. Ships in a day; honest but
  low fidelity. Use only if an ISTAT spike slips, and only for the country/region
  outlines.
- **Avoid — OpenStreetMap.** Italian wine-region relations exist but are ODbL
  (attribution + share-alike). The repo has deliberately stayed on public-domain
  (Natural Earth) + Licence-Ouverte (IGN/INAO) sources only; ODbL introduces a
  new licence class. Do not use without an explicit owner decision.

**Country outline is easy and consistent:** take Italy from the *same* Natural
Earth 1:50m admin-0 set France came from — a new `extract-italy-ne.mjs` mirroring
`extract-france-ne.mjs`, public domain, `boundary_method = MANUAL`.

Recommendation: **A as the backbone** for region and DOC/DOCG footprints,
**Natural Earth** for the country node, and **C layered in for flagship crus**
(Piemonte MGA) where an official GIS source exists. Every boundary stages `DRAFT`
and is only flipped current-`VALIDATED` after a rendered preview review — never
auto-published (architecture invariant).

**Owner gate before any fetch:** confirm the ISTAT confini licence terms
(attribution string, redistribution) and the Piemonte MGA licence, the same way
the Etalab licence was confirmed for Champagne.

## Recommended phasing (v1 = a flagship pilot, not all of Italy)

Full Italy is hundreds of denominations, each needing its comune list
transcribed from a disciplinare — that transcription is the real cost, not the
code. So ship a **small pilot that proves the Italy path end-to-end**, then scale
as pure data batches (the pipeline is designed for exactly this — "new regions
are pure data batches through the same pipeline").

- **I-0 — Country node.** `italy` place, `COUNTRY`, tier 0, Natural Earth
  outline. Trivial; unlocks everything below.
- **I-1 — Pilot region: Piedmont.** `italy.piemonte` REGION (tier 1) + **Barolo**
  and **Barbaresco** DOCG appellations (tier 2, comune-union via A). Optionally
  the **Barolo MGA crus** (tier 3, via C / Piemonte MGA) to exercise the
  cru-depth path — the analogue of Burgundy climats. Piedmont is chosen because
  it validates *both* source paths (A and C) on a high-recognition set.
- **I-2+ — Scale out.** Tuscany (Chianti Classico, Brunello di Montalcino,
  Vino Nobile), Veneto (Amarone/Valpolicella, Prosecco, Soave), etc. — each a
  data batch of comune-list artifacts + catalog + boundary flip.

`canonical_key` scheme (immutable once locked — owner confirms):
`italy` → `italy.piemonte` → `italy.piemonte.barolo` →
`italy.piemonte.barolo.<mga>`. Local-language region/denomination slugs, matching
France's `france.bourgogne.cote-de-nuits`.

## Catalog changes (I-1 shape)

1. **Places**: `italy` (COUNTRY, tier 0); `italy.piemonte` (REGION, tier 1,
   `is_appellation = false`); `italy.piemonte.barolo` and
   `.barbaresco` (APPELLATION, tier 2, `is_appellation = true`). Optional MGA
   crus (`SITE`/APPELLATION, tier 3). All `publication_status = DRAFT` until
   boundary + article review.
2. **Classification columns**: Italy's DOCG/DOC/IGT map onto the existing flat
   fields (`is_appellation`, `appellation_system`, `appellation_level`) the same
   way AOC levels do for France. **Schema touch-point to confirm:** the
   `appellation_system` / `appellation_level` enums likely need Italian values
   (DOCG / DOC / IGT, EU umbrella DOP/IGP) added by migration — verify current
   enum members before writing the catalog migration.
3. **Boundaries**: `wine_boundary_sources` + `_snapshots` provenance rows per the
   chosen source (namespace e.g. `ISTAT_CONFINI` for A, `PIEMONTE_GEOPORTALE` for
   C, `NATURAL_EARTH` for the country), boundaries staged `DRAFT`, flipped
   current-`VALIDATED` in a reviewed migration with a bbox window guard
   (Piedmont ≈ lon [7.0, 9.2], lat [44.1, 46.5]; Italy mainland guard for the
   country node).
4. **Scoring links**: link existing live `regions` / `appellations` rows to the
   new places via `wine_place_id`, exact-name match, `map_status = VERIFIED`.
   **Heed the documented gotcha:** "Classico" is a distinct appellation under
   seven Italian regions — appellation linkage/dedup must be **scoped by
   `region_id`**, never by name alone (CLAUDE.md, LWIN import notes). Relevant the
   moment Chianti Classico / Soave Classico / etc. enter in I-2.
5. **Relationships** (`wine_place_relationships`): model Italian legal structure
   with the existing typed edges — e.g. a `Classico` subzone vs its base DOC is a
   `REPLACES_WITHIN` / `DUAL_LABEL` case, exactly like Pessac-Léognan→Graves and
   Barsac↔Sauternes. Kept separate from the containment tree (`primary_parent_id`).
6. **Knowledge content** (may launch `PLACEHOLDER`): article per place; grape
   links (Barolo/Barbaresco → Nebbiolo); style; designation note (DOCG/DOC/IGT
   pyramid, and that MGA are *named vineyard zones*, not separate appellations —
   the Piedmont analogue of Burgundy's climat vs appellation distinction).

## Tile / publication

Per manifest v2 (schema_version 2): country (tier 0) + region outlines (tier 1)
go in `world.pmtiles`; denominations and crus (tier ≥ 2) route to a **per-region
shard** — `piemonte.pmtiles` (second key segment = region, per the Burgundy
`bourgogne.pmtiles` model). New coverage is a workflow dispatch
(export → tippecanoe → validate → publish → promote) after review; **no UI
change**. Re-check the world-archive size budget at publish.

## Migration & safety discipline (unchanged repo standard)

Every live apply: dry-run inside a rollback transaction first; fail-closed
`raise exception` guards; **same-transaction assertions** + independent post-apply
verification (the "version recorded without its DDL" incident rule); scratch-apply
pattern; foundation + context suites green before and after; version-number
collision check. Boundaries never auto-flip — DRAFT → VALIDATED only after a
rendered preview review. Regenerate `data/wine-map/boundary-expectations.json`
and bump `scripts/world-wine-map-foundation.test.mjs` counts as review evidence.

## Operational prerequisites (coordinate with owner)

Building (not just planning) needs: `DB_PASSWORD` (PostGIS dissolve/intersect),
`SUPABASE_SERVICE_ROLE_KEY` + the private `wine-map-sources` bucket, and the
`wine-map-tiles` GitHub Actions workflow (tippecanoe 2.79.0 runs only there).
Italy writes to the shared database, so it lands as a reviewed PR against a
branch, and the live migrations/tile publish are owner-run (or owner-approved),
never applied unattended.

## Verification / owner gates

1. **Source spike + licence confirmation**: ISTAT confini fetchable and licence
   terms acceptable; Piemonte MGA availability/licence (if pursuing C).
2. **Rendered preview review** of each staged outline (SVG + numeric sanity:
   inside the bbox window, sane vertex/part counts) — owner approves shapes.
3. **Foundation test count bump** committed as the diff = review evidence;
   context test for the new places.
4. Post-promote **live tile probe** + owner "see it on the map" sign-off.

## Decisions needed from owner before any build

1. **Boundary source**: A (+ Natural Earth country) as recommended, with/without
   C for MGA crus; B only as stopgap.
2. **Pilot scope**: I-0 + I-1 Piedmont (recommended) vs. a different first region
   (e.g. Tuscany) vs. broader.
3. **`canonical_key` country segment**: `italy` (proposed) — immutable once
   locked.
4. **Licence acceptance** for ISTAT (and Piemonte MGA) — the equivalent of the
   Etalab confirmation.
5. Go-ahead to run the live migrations and tile publish (owner-run; this doc is
   the pre-work up to that gate).

## Out of scope for v1

Full DOC/DOCG/IGT coverage; IGT footprints; partial-comune precision (whole-comune
over-approximation stands, as in Champagne); per-region geoportal integration
beyond Piemonte; making `wine_designation_members` commune columns foreign keys.
All are later data batches through this same pipeline.
