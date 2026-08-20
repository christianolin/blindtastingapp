# Germany on the wine map

Add the German wine hierarchy — Anbaugebiet → Bereich → Großlage → Einzellage —
plus the VDP classification, mirroring the France depth model rather than the
Spain breadth model.

## Session status — 2026-08-20 (resume here)

Research complete, nothing built yet. Both unknowns are resolved (below). Spain
is finished and published; Germany is at **0 nodes**.

---

## Why Germany is a France problem, not a Spain problem

Spain was municipality unions from one national portal. Germany is
**vineyard-parcel** geometry, federated across state authorities, and its labels
name the **Einzellage** ("Wehlener Sonnenuhr"), four levels down. The existing
model already supports this: `wine_place_kind` has SITE and VINEYARD, and France
already runs to `display_tier` 5 with 655 SITEs.

## Resolved unknown #1 — the data (PROVEN, not assumed)

Rheinland-Pfalz publishes the **legal** Weinbergsrolle boundaries via a QGIS WFS.
Verified live on 2026-08-20 by actually pulling it:

```
https://geodaten.lwk-rlp.de/cgi-bin/qgis_mapserv.fcgi
  ?MAP=/home/qgis/projects/gg_wfslvermgeo_lokal.qgs
  &SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature
  &outputFormat=geojson&typeName=weinlagen_recht
```

- **1,583 Einzellagen**, MultiPolygon, **already WGS84 lon/lat** (no reprojection).
- 13.4 MB in ONE request — no pagination. `RESULTTYPE=hits` → `numberMatched=1583`.
- Data date 2026-08-11. Other feature types on the same service: `weinlagen`,
  `gga`, `gu` (g.g.A. and g.U. boundaries — useful later).
- Licence **dl-de/by-2.0** (free use, attribution). Required credit:
  `©LGB-RLP (Jahr des Datenbezugs), dl-de/by-2-0, https://www.lgb-rlp.de [Daten bearbeitet]`
  — note the *data* is the LWK's Weinbergsrolle, published via LGB.

**Each feature carries the whole hierarchy**, so all four tiers come from
dissolving this one file — the Spain municipality-union pattern with better input:

| property | example | use |
|---|---|---|
| `anbaugebiet` | `Mosel` | tier 1 REGION |
| `bereich` | `Bereich Burg Cochem` | tier 2 SUBREGION |
| `grosslage` | `Rosenhang` | tier 3 |
| `wlg_name` | `Arzlay` | tier 4 SITE (the Einzellage) |
| `wlg_nr` | `440313` | **unique** → stable id / `source_feature_id` |
| `gemeinde`, `gemarkungen` | `Cochem`, `Cond` | village for the canonical key |
| `rebflaeche` | `k. A.` | planted area, for key_facts |

Coverage (counted from the cached file):

| Anbaugebiet | Bereiche | Großlagen | Einzellagen |
|---|---|---|---|
| Mosel | 5 | 18 | 462 |
| Rheinhessen | 3 | 23 | 412 |
| Pfalz | 2 | 25 | 325 |
| Nahe | 1 | 6 | 251 |
| Mittelrhein | 1 | 10 | 95 |
| Ahr | 1 | 1 | 38 |
| **TOTAL** | **13** | **83** | **1,583** |

→ **1,685 nodes from one dataset.** Every Einzellage has a Großlage (0 orphans).
bbox 6.3584, 49.0337 → 8.4151, 50.6020 (sane for RLP wine country).

**Critical for key design:** Lage names are heavily reused — 1,010 distinct names
for 1,583 sites; `Schloßberg`×43, `Sonnenberg`×37, `Rosenberg`×27. The canonical
key MUST include the village, exactly like Burgundy climats. `wlg_nr` is unique
and is the right `source_feature_id`.

## Resolved unknown #2 — how VDP is modelled

**As a classification over Einzellage places, NOT as separate polygons.** The
codebase already does exactly this shape:

| existing designation | member_kind | tiers |
|---|---|---|
| **Champagne Échelle des Crus** | SITE | **2** |
| Alsace Grand Cru | SITE | 1 |
| Burgundy Grand Cru | SITE | 1 |

Champagne's two-tier SITE classification is the structural twin of VDP's
**Große Lage / Erste Lage**. So: one `wine_designations` row (`vdp-lagen`) with
`wine_designation_members` of `member_kind = 'SITE'`, `tier_rank` 1 = Große Lage,
2 = Erste Lage, each pointing at an Einzellage's `wine_place_id`.

Why not geometry:
1. **VDP publishes a membership list, not boundaries.** No VDP polygon dataset exists.
2. A VDP site is a named Einzellage or a delimited part of one — a separate
   polygon would duplicate the Einzellage or invent a boundary we don't have.
3. As a classification it can render as a badge on the Einzellage, which is more
   useful than a stacked shape.
4. Honest provenance: legal boundary from LWK-RLP, classification from a private
   association.

**Caveat to state in the UI/notes:** VDP membership is per *producer*, not purely
per site. One Einzellage can have VDP and non-VDP owners, and the classified
portion may be smaller than the legal Einzellage. The badge means "this site
contains VDP Große/Erste Lage holdings", not "this whole polygon is Große Lage".

## Wave 1 status — country DONE, Anbaugebiete blocked on one decision

Shipped (`0336444`):
- **`germany` COUNTRY node** + a precise outline: dissolve of the 16 Bundesländer
  (BKG VG250), **6,571 vertices, 25 parts**, bbox 5.87..15.04 / 47.27..55.06 —
  Germany's exact extremes, matching France/Spain/Italy resolution.
- The **six RLP Anbaugebiete as DRAFT** nodes with articles, grapes and styles.
  They are REGION **and** `is_appellation` (a German Anbaugebiet *is* the g.U.).
- Attribution namespaces `BKG_VG250` and `LWK_RLP_WEINLAGEN`; the Weinbergsrolle
  fetcher (fails closed on ~1583 features + unique `wlg_nr`).

### The decision that blocks promoting them
The `gu` (PDO) layer only covers **4 of the 6** (no Rheinhessen, no Ahr), so the
Anbaugebiet outline has to come from dissolving the Einzellagen. But vineyard
parcels are scattered, and a raw union is unusable at region zoom. Measured:

| Anbaugebiet | raw union | close ~150 m | close ~380 m |
|---|---|---|---|
| Ahr (38 Lagen) | 1,121 pts / **115 parts** | 216 / 5 | 95 / 2 |
| Mittelrhein (95) | 2,324 pts / **299 parts** | 763 / 47 | 364 / 21 |
| Mosel (462) | 13,348 pts / **1,391 parts** | 3,241 / 93 | — |

**Recommendation: morphological close at 0.002° (~150 m)** — Mosel 1,391 → 93
parts — and record it honestly, because it inflates area (Mosel 0.0235 → 0.0364
deg², ~55%). The precise geometry is kept where it matters, at Einzellage level;
the region outline is explicitly a generalisation. Alternative if that's too
loose: ship the raw union and accept a sparse, ribbon-like region at z4.

**Perf note:** the close is expensive — a single Mosel variant took minutes and a
15-min budget wasn't enough for all six. The builder must run per-Anbaugebiet
with a long `statement_timeout`, and is a good candidate for one-at-a-time runs.

## Waves

1. **Country outline + 13 Anbaugebiete.** Outline by dissolving
   `georef-germany-gemeinde` (10,949 Gemeinden, `geo_shape` + codes — the twin of
   the Spain/Italy datasets already used), mirroring
   `build-spain-country-outline.mjs`. The 6 RLP Anbaugebiete dissolve from the
   Weinlagen file; the other 7 need Wave 5's sources, so ship them then.
2. **Bereiche (13) + Großlagen (83)** — dissolves of the same file.
3. **Einzellagen (1,583)** — the polygons themselves, tier 4 SITE.
4. **VDP designation + members.**
5. **The 7 non-RLP Anbaugebiete**: Rheingau + Hessische Bergstraße (Hessen),
   Baden + Württemberg (BW), Franken (Bayern), Saale-Unstrut, Sachsen. Each needs
   its own state source; none proven yet.

## Open decisions
- **Großlage honesty problem.** Großlagen are widely disliked (a Großlage name
  can look like an Einzellage on a label — "Piesporter Michelsberg"). They're in
  the data and legally real, so include them, but consider a note on each.
- **Attribution namespace** for the new source; must be added to `ATTRIBUTION` in
  `scripts/wine-map-tiles/lib.mjs` or the tile export fails closed.
- **min_zoom ladder**: Anbaugebiet 4-5, Bereich 6, Großlage 7, Einzellage 8-9?
  France's climats are the precedent to copy.

## Invariant to check after each wave
`.tiles-build/verify-spain.mjs` has the Germany-equivalent shape: membership
`ready` == DB appellations, nothing unverified, no appellation without a current
boundary. Spain wave 24 existed *because* nobody checked this.
