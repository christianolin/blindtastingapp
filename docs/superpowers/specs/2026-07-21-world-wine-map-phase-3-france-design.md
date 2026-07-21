# World Wine Map Phase 3 — France Regions Design

Companion to the Phase 2 tile pilot spec and the 2026-07-21 classification
addendum. Scope decided with the owner on 2026-07-21.

## Goal

Every major French wine region visible and selectable on the live tile map,
with the corrected full Bordeaux tree, sourced boundaries wherever an
official source exists, and honest `MANUAL` outlines where none does. French
display names throughout (Bourgogne, not Burgundy).

Target regions (tier 1 under France): Bordeaux (existing), Bourgogne,
Champagne, Alsace, Vallée de la Loire, Vallée du Rhône, Beaujolais, Jura,
Savoie, Provence, Languedoc-Roussillon, Sud-Ouest, Corse.

Bordeaux corrections (owner: "full target tree now"): Graves becomes the
left-bank southern grouping parenting Pessac-Léognan and Sauternes (with
Barsac); a Médoc grouping parents Médoc AOC and Haut-Médoc (with the four
communes); new appellations Fronsac, Canon Fronsac, Blaye, Côtes de Bourg,
Entre-deux-Mers. Region==appellation duplicates follow the addendum's
one-node rule.

## Source Reality (verified live, 2026-07-21)

The only official machine-fetchable boundary source is IGN Géoplateforme WFS
`AOC-VITICOLES:aire_parcellaire` (`https://data.geopf.fr/wfs/ows`): 228,724
parcel polygons, WFS 2.0 paging, GeoJSON output. There is no
`aire_geographique` layer on this service, and no pre-dissolved INAO areas
dataset was discoverable on data.gouv.fr (only the same parcel delimitation
as shapefile dumps).

Critical semantics of the layer, encoded here because they are easy to get
wrong:

- **`denom` is a combination string**: every denomination the parcel belongs
  to, comma-separated (e.g. a Côte d'Or parcel lists its village, premier
  cru, and `Bourgogne`, `Bourgogne aligoté`, `Crémant de Bourgogne`, …).
  Equality filters therefore undercount catastrophically (`denom =
  'Bourgogne'` matches 466 parcels; true Bourgogne membership is 16,855).
- **Fetch rule**: server-side `LIKE '%<name>%'` to bound the transfer, then
  client-side exact membership matching after splitting the combo string.
- **Split rule**: split on a comma NOT followed by a space. Separator commas
  carry no space; a comma+space is part of a denomination name (real case:
  `Côtes de Bourg, Bourg et Bourgeais`).
- **Vocabulary is pinned in-repo**: `data/wine-map/inao-denominations.json`
  (3,123 combo strings) and `data/wine-map/inao-denomination-membership.json`
  (1,254 clean denominations with membership counts). Import allowlists use
  exact names from the membership file only.
- **Absences are real**: Champagne has zero parcels in this layer (its
  delimitation is not published here). Any region whose membership is absent
  or visibly misleading gets an honest `MANUAL` outline.

Verified membership counts for planning: Bourgogne 16,855 · Côtes du Rhône
18,181 · Beaujolais 9,297 · Anjou 8,488 · Touraine 8,333 · Cahors 3,027 ·
Alsace 2,595 · Coteaux d'Aix-en-Provence 1,995 · Vin de Savoie ou Savoie
1,974 · Côtes du Jura 1,720 · Entre-deux-Mers 1,199 · Blaye 680 · Côtes de
Bourg, Bourg et Bourgeais 147 · Fronsac 70 · Canon Fronsac 20.

## Adapter Design (the first real source adapter)

New namespace `IGN_INAO_AOC_VITICOLES` (non-legacy). Per fetched
denomination set:

1. **Fetch**: paged WFS GetFeature with the LIKE bound, client-side exact
   membership filter, deterministic ordering. The unmodified page responses
   are the **raw artifact**.
2. **Raw retention**: raw artifacts are too large for the repo (10–20k
   parcels per region). They upload to Supabase Storage under
   `wine-map-sources/<namespace>/<revision>/…` with SHA-256 checksums;
   `raw_snapshot_uri` points at the storage object. This fulfils the
   architecture's "immutable raw snapshot object URL" as originally
   intended.
3. **Normalize**: dissolve member parcels and generalize with the proven
   concave pipeline (same family as the Bordeaux 13), with per-target
   reviewed parameters recorded in `generation_parameters`. Normalized
   GeoJSON is the normalized artifact (Storage, checksummed; small ones may
   also live in-repo).
4. **Stage, never auto-publish**: boundaries land `DRAFT` and become
   `VALIDATED`/current only through review, exactly as the architecture
   requires.

## Region Footprint Rule

A navigation region's footprint is the dissolve of a **reviewed
member-denomination list** (one or many entries from the membership file),
classified `GENERALIZED_FROM_OFFICIAL_SOURCE` with the member list recorded
in `generation_parameters`:

- Dual-role regions (region == regional AOC): single-entry list — Bourgogne,
  Alsace, Beaujolais.
- Aggregate regions: multi-entry list reviewed per region — e.g. Vallée de
  la Loire from its constituent AOC memberships; Jura from Côtes du Jura +
  Arbois + Château-Chalon + L'Étoile; Savoie from `Vin de Savoie ou Savoie`
  + Roussette de Savoie; Provence, Languedoc-Roussillon, Sud-Ouest, Corse
  likewise.
- No usable membership (Champagne) or visually misleading coverage (review
  judges): `MANUAL` outline with honest provenance, Natural-Earth-France
  style.

The per-region member lists are proposed in the implementation plan and
confirmed at review against rendered previews — geometry decisions are
reviewed, never assumed.

## Catalog Changes

1. **Classification migration** (additive, per the addendum): enum values
   `REPLACES_WITHIN` + `DUAL_LABEL`; columns `is_appellation`,
   `appellation_system`, `appellation_level` with the null-coupling
   constraint; types + tests. Backfill the existing 14 places
   (13 appellation-role places + France).
2. **Bordeaux corrections**: reparent Pessac-Léognan and Sauternes under
   Graves; introduce the Médoc grouping per the addendum's tree; add the
   five new appellations with INAO-sourced boundaries (exact vocabulary
   names; display names may drop the legal suffix — e.g. place "Côtes de
   Bourg" sourced from "Côtes de Bourg, Bourg et Bourgeais"). Keys are
   immutable; only `primary_parent_id` moves. Legal edges seeded where the
   INAO cahier states them: Pessac-Léognan `REPLACES_WITHIN` Graves; Barsac
   `DUAL_LABEL` Sauternes; each edge carries a provenance note.
3. **New region places**: French names, tier 1, zooms in the existing
   region window (min_zoom ≈ 4), `VERIFIED` only after boundary + article
   review; articles may launch as `PLACEHOLDER` (curation state exists for
   exactly this).
4. **Scoring-reference review pass**: link the live French `regions` rows to
   the new places (exact-name review, never fuzzy); every touched reference
   row gets an explicit `map_status`. Scoring rows keep their existing
   names and UUIDs — French display names live on `wine_places` only.

## Publication

Regions ship in reviewed batches through the existing pipeline: export
already reads whatever is `VERIFIED` + current-`VALIDATED`, so each batch is
one workflow dispatch. World archive gains the tier-1 regions (z4+);
`france.pmtiles` gains the corrected Bordeaux tree and any deeper content.
Zoom windows and the one-shard pilot model are unchanged. Expect the first
batch (schema + corrected Bordeaux) before the region waves.

## Verification

- Adapter: unit tests for combo splitting (incl. the comma-in-name case),
  membership filtering, paging determinism; checksummed artifacts.
- Geometry: existing validity/label gates plus per-region rendered preview
  at review.
- Catalog: hierarchy/classification constraint tests; reparenting leaves
  every canonical key and scoring link byte-identical (digest check, Phase 1
  style).
- End-to-end: post-publish live tile probes per new region (validate stage
  already does this per release).

## Out Of Scope (Phase 4+)

- Full appellation depth inside each region (village/cru trees beyond the
  corrected Bordeaux) — Phase 4 batches.
- A Champagne parcel source hunt; alternate-acceptance scoring on
  `DUAL_LABEL` edges; commune-based boundary derivation.
