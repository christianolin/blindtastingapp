# Alsace Communes — the Parent Tier Above the 51 Grands Crus

Date: 2026-08-05
Status: Approved design

## Goal

Put Alsace's communes on the wine map as the level between the region and its
51 grands crus, so the hierarchy models true geographic containment:

```
france.alsace                 REGION       tier 1  is_appellation = true
└─ france.alsace.<commune>    SITE         tier 2  is_appellation = false   (47 new)
   └─ france.alsace.<cru>     APPELLATION  tier 3  is_appellation = true    (51 re-parented)
```

Today the 51 crus hang straight off the region at tier 2, so Alsace has no
village level while Burgundy and Champagne do. `display_tier` must not decrease
with depth (`validate_wine_place_hierarchy`, and `areaAncestor` in
`scripts/wine-map-tiles/export.mjs` walks it), so the crus move to tier 3 as the
communes take tier 2.

This is officially correct: INAO's decree for each grand cru names the
commune(s) its delimited area lies in. `wine_places` is a containment tree;
`is_appellation` marks which nodes are appellations. A commune is a place, not
an appellation — same modelling as Champagne's Échelle des Crus villages
(`kind = 'SITE'`, `is_appellation = false`).

## Which communes — and how we know

Two independent INAO artifacts were cross-checked, and they reproduce each
other exactly.

**Source 1 — INAO's commune list.** The "Aires géographiques des AOC/AOP" open
dataset (data.gouv.fr, Licence Ouverte) carries all 51 `Alsace grand cru <name>`
aires. Every one of the 51 lists the *same* 47 communes: the file records the
collective aire géographique of the Alsace Grand Cru AOC, not a per-cru
delimitation. So it bounds the commune set but cannot assign crus to communes.

**Source 2 — INAO's delimited parcels.** For each cru, its parcels were fetched
from the IGN Geoplateforme WFS (`AOC-VITICOLES:aire_parcellaire` — the same
layer the live cru boundaries were built from), unioned, and intersected with
IGN Admin Express commune polygons to measure how the delimited area splits
across commune lines.

The result: **48 communes hold delimited grand cru land at ≥0.5%**. Remove the
Kaysersberg *déléguée* (1.3% of Schlossberg — see below) and the remainder is
**exactly INAO's 47**. Independent derivation, identical answer.

Everything below 0.02% is boundary-line digitisation noise, not membership:
Kaefferkopf/Katzenthal 0.0014%, Mambourg/Bennwihr 0.0092%,
Praelatenberg/Orschwiller 0.0185%, Sonnenglanz/Zellenberg 0.0067%. The
membership threshold is 0.5%.

### The 47

45 resolve in `LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune`. Two do not:
**Kientzheim (68164)** and **Sigolsheim (68310)** were merged into Kaysersberg
Vignoble (68162) on 1 January 2016 and now exist only in
`commune_associee_ou_deleguee`. Their déléguée polygons are the correct
pre-merger footprints, INAO still lists them separately, and labels and
textbooks still use the wine names — so they are imported as `Kientzheim` and
`Sigolsheim` with the merger recorded in the artifact and the place's note.

**Kaysersberg is not created.** 1.3% of Schlossberg falls inside the Kaysersberg
déléguée, but INAO's aire omits Kaysersberg (while listing Kientzheim and
Sigolsheim), so we follow INAO. Recorded as a caveat in the artifact.

## Parenting rule

Each cru is parented to the commune holding the **largest share of its
delimited area**. Area-majority is decided by the geometry, not by convention or
recollection, which is the only rule that stays consistent with a containment
tree.

That yields 42 parent communes. The other 5 — Saint-Hippolyte,
Scharrachbergheim-Irmstett, Soultzmatt, Vieux-Thann, Vœgtlinshoffen — host cru
land whose majority lies in the neighbouring commune, so they are childless
places. That is honest: they really do contain grand cru vines.

A cru still crosses commune lines. Rangen is parented to Thann while 34.8% of it
lies in the Vieux-Thann polygon, which is also drawn. The containment tree is an
approximation of a delimitation that does not respect administrative borders;
the artifact records the full split for every cru so the approximation is
auditable.

## Corrections to `wine_designation_members`

The commune column shipped in `20260829263900` was compiled from recollection
rather than a source document. Against the parcel geometry it is right on 43 of
51, with 8 defects. All are corrected in a migration that precedes the catalog.

| Cru | Stored | Geometry | Fix |
| --- | --- | --- | --- |
| Moenchberg | Andlau | Eichhoffen 81.5% + Andlau 18.5% | commune → Eichhoffen |
| Zinnkoepfle | Soultzmatt | Westhalten 53.1% + Soultzmatt 46.9% | commune → Westhalten |
| Praelatenberg | + Orschwiller | Kintzheim 100% | drop the note |
| Altenberg de Bergheim | + Saint-Hippolyte | Bergheim 100% | drop the note |
| Kessler | Guebwiller | + Bergholtz 3.5% | add the note |
| Steingrubler | Wettolsheim | + Wintzenheim 0.6% | add the note |
| Engelberg | "Scharrachbergheim" | Scharrachbergheim-Irmstett | official name |
| Schlossberg | + Kaysersberg | Kientzheim 98.7% + Kaysersberg 1.3% | note the 2016 merger |

Both Praelatenberg/Orschwiller and Altenberg de Bergheim/Saint-Hippolyte are
commonly stated in textbooks; both INAO sources disagree, so the notes go. The
other five multi-commune crus flagged for spot-check — Engelberg, Rangen,
Spiegel, plus Hatschbourg and Vorbourg — are correct on both commune and
majority direction.

## Zoom

Communes get `min_zoom` 8 / `label_min_zoom` 8, matching Champagne's
whole-commune village footprints (`20260823090000`). Crus keep 10/10. Communes
appear first; crus resolve on top two zooms deeper.

## Deliverables

**1. `scripts/wine-map-sources/build-alsace-communes.mjs` → `data/wine-map/alsace-communes.json`**

Re-derivable artifact, following `build-champagne-communes.mjs`: fetch the INAO
CSV for the 47, fetch parcels per cru, intersect against commune polygons in
Postgres (temp tables, rolled back — writes nothing), emit the commune list plus
the per-cru split with every share. Needs `DB_PASSWORD` for the intersection.

**2. `scripts/wine-map-sources/fetch-alsace-communes.mjs`**

Follows `fetch-champagne-communes.mjs` for provenance discipline: raw and
normalised artifacts to the `wine-map-sources` bucket with SHA-256 checksums,
`wine_boundary_sources` + `wine_boundary_source_snapshots` rows, boundaries
staged DRAFT, namespace `IGN_ADMIN_EXPRESS`, `boundary_method = 'MANUAL'`.

It differs from Champagne in the one way that matters: Champagne dissolves 635
communes into a single region boundary, whereas this stages **47 separate
boundaries**, one per commune place. It also writes a labelled preview SVG to
`.superpowers/sdd/` and gates on every commune being present and inside the
Alsace window (lon [6.9, 7.8], lat [47.7, 49.2]).

**3. `20260829264000_alsace_commune_corrections.sql`** — the 8 defects above.

**4. `20260829264100_alsace_communes_catalog.sql`** — 47 commune places,
`kind = 'SITE'`, tier 2, `is_appellation = false`, `publication_status = 'DRAFT'`,
alphabetical `sort_order`. Asserts no canonical-key collision with the 51 crus
(checked: none).

**5. `20260829264200_alsace_communes_flip.sql`** — one transaction:

- promote the 47 DRAFT boundaries to `is_current` + `VALIDATED` (bbox window
  guard, as in `20260829095000`);
- commune places DRAFT → VERIFIED;
- re-parent the 51 crus to their commune and set `display_tier = 3` in a single
  UPDATE (both columns must move together or the hierarchy trigger rejects it);
- assert each cru's new parent name equals its corrected
  `wine_designation_members.commune`.

Re-parenting belongs in the flip, not the catalog. Doing it here means there is
never a moment where a cru's parent is a place the tile exporter does not emit —
between the catalog and the flip the communes are DRAFT, boundaryless and
invisible, which is a consistent state.

## Order of operations

1. Migration 264000 (corrections) and 264100 (catalog) — apply, push.
2. Run `build-alsace-communes.mjs`, commit the artifact.
3. Run `fetch-alsace-communes.mjs` — stages 47 DRAFT boundaries, writes the
   preview SVG.
4. **Owner reviews the preview SVG.** Gate.
5. Migration 264200 (flip).
6. Regenerate `boundary-expectations.json`; update the foundation test counts.
7. **Verify tiles — after promotion, not before.**

Step 7 is not optional. `export.mjs:59` inner-joins `wine_place_boundaries` on
`is_current and quality_status = 'VALIDATED'`, so a place without a promoted
boundary vanishes from the tiles silently rather than failing the build. A green
export proves nothing about the communes until the flip has run.

## Test fallout

`scripts/world-wine-map-foundation.test.mjs`: `total` 1299 → 1346, `current`
1194 → 1241, `validated` 1299 → 1346, `manual` 67 → 114, `linked_boundaries`
1299 → 1346. `data/wine-map/boundary-expectations.json` regenerated from the
live post-flip state (its diff is part of the review evidence).

Unaffected: `appellations: 1107` — communes are not appellations. The
`designation-members.test.mjs` assertions cover counts and linkage, not commune
values.

## Known consequences

**Hue grouping does not change.** `areaAncestor` returns a tier-3 node's self,
so each cru remains its own fill colour rather than inheriting its commune's. A
visual grouping ("Guebwiller's three crus share a hue") would require communes
at tier 3 and crus at tier 4. Out of scope; noted so the absence is not read as
a bug.

**`wine_designation_members.commune` stays free text.** Now that communes are
places, that column could become a foreign key and the library table could link
commune → map. Deliberately deferred: this change is about the map hierarchy.

## Out of scope

The Prädikat and ageing figures in the library are presented as sourced textbook
numbers and remain unverified. Separate piece of work.
