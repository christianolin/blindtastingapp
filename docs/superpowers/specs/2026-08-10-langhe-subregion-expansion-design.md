# Langhe subregion + Piedmont denomination expansion (design)

Date: 2026-08-10
Status: **PROPOSED** — extends the shipped Piedmont pilot (Barolo/Barbaresco).
Predecessor: `2026-08-09-italy-wine-map-design.md` + its plan (pilot, merged & live).

## Objective

Add the **Langhe** subregion under Piemonte, re-parent **Barolo & Barbaresco**
beneath it, and add the notable Langhe denominations as mapped footprints
(owner chose "option 2" = every denomination gets its own footprint; we render
and then decide whether the broad grape-DOCs need cosmetic changes / a fallback
to option 1).

## Hierarchy (target)

```
italy.piemonte                     REGION      tier 1  [existing]
└─ italy.piemonte.langhe           SUBREGION   tier 2  is_appellation=true (= Langhe DOC)
   ├─ barolo                       APPELLATION tier 3  [re-parented from tier 2]
   ├─ barbaresco                   APPELLATION tier 3  [re-parented]
   ├─ dogliani                     APPELLATION tier 3  DOCG
   ├─ diano-dalba                  APPELLATION tier 3  DOCG  (Diano d'Alba)
   ├─ verduno-pelaverga            APPELLATION tier 3  DOC
   ├─ barbera-dalba                APPELLATION tier 3  DOC   (broad)
   ├─ dolcetto-dalba               APPELLATION tier 3  DOC   (broad)
   └─ nebbiolo-dalba               APPELLATION tier 3  DOC   (broad)
```

- **`langhe` node doubles as Langhe DOC** (is_appellation=true, appellation_system
  'DOC', appellation_level 'subregional'). Its footprint = the Langhe DOC
  production zone (broad comune list).
- **Re-parent Barolo & Barbaresco** from tier 2 (under piemonte) to tier 3 (under
  langhe). `display_tier` must not decrease with depth (hierarchy trigger), and
  `primary_parent_id` + `display_tier` must move together in one UPDATE — the
  exact pattern of `20260829264200_alsace_communes_flip.sql`.
- canonical_keys: `italy.piemonte.langhe`, then `italy.piemonte.langhe.<slug>` for
  the appellations? **Decision:** keep appellation keys stable —
  Barolo/Barbaresco keep `italy.piemonte.barolo` / `.barbaresco` (canonical_key is
  immutable once VERIFIED; do NOT re-key them — only re-parent). New appellations
  get `italy.piemonte.langhe.<slug>` OR `italy.piemonte.<slug>` (owner's call; the
  key is opaque, hierarchy is via primary_parent_id not the key). Recommend
  `italy.piemonte.<slug>` for the new ones for consistency with the existing two,
  since the key is not the hierarchy.

## Denominations & comune sources (all verified vs. the disciplinare before use)

| Denom | Class | Type | Comuni (verify vs disciplinare) |
|---|---|---|---|
| Barolo | DOCG | crisp | 11 (done) |
| Barbaresco | DOCG | crisp | 3 (done) |
| Dogliani | DOCG | crisp | ~a dozen (Dogliani + neighbours) — verify |
| Diano d'Alba | DOCG | crisp | 1 (Diano d'Alba) — verify |
| Verduno Pelaverga | DOC | crisp | 1 (Verduno) — verify |
| Barbera d'Alba | DOC | broad | dozens (Langhe + parts of Roero) — verify |
| Dolcetto d'Alba | DOC | broad | dozens (Langhe) — verify |
| Nebbiolo d'Alba | DOC | broad | dozens (Langhe + Roero, excl. Barolo/Barbaresco core) — verify |
| Langhe DOC (= subregion) | DOC | broad | large Langhe-wide comune list — verify |

**Accuracy note:** Barbera d'Alba / Dolcetto d'Alba / Nebbiolo d'Alba / Langhe DOC
extend across the Tanaro into **Roero**; placing them under the Langhe subregion
is a navigation simplification (documented), not a geographic claim. Roero itself
is a separate future subregion.

## Boundary approach (unchanged pipeline)

Per denomination: reviewed comune-membership artifact (`data/wine-map/<slug>-comuni.json`)
→ `stage-piedmont-boundaries.mjs`-style ISTAT dissolve (now hole-free via the
`noholes` CTE) → DRAFT boundary → reviewed flip to VALIDATED+current.
`boundary_method = MANUAL` (whole-comune over-approximation). The broad DOCs will
be large; that redundancy is the thing we're rendering to evaluate.

## Execution phases (reviewed + gated, same as the pilot)

- **Phase A — structure + crisp zones:** Langhe subregion node (Langhe DOC), the
  re-parent flip of Barolo/Barbaresco, and Dogliani / Diano d'Alba /
  Verduno Pelaverga footprints + articles. Lower risk; proves the subregion +
  re-parent path.
- **Phase B — broad grape-DOCs:** Barbera d'Alba, Dolcetto d'Alba, Nebbiolo d'Alba,
  and the Langhe DOC subregion footprint. Heaviest comune verification.
- Then: one tile re-publish (promote) + owner "see it on the map" review → decide
  keep option 2 or fall back to option 1 for the broad ones.

## Discipline (unchanged)

Verified comune lists (disciplinare-sourced, not memory); ISTAT CC BY geometry;
per-denomination review; DRAFT→VALIDATED only after preview; migrations
dry-run→apply + tracked; re-parent + tier move in one UPDATE with same-transaction
assertions; hole-free footprints. All DB writes gated on owner go.

## Owner decisions before build

1. Canonical-key scheme for the new appellations (`italy.piemonte.<slug>` vs
   `italy.piemonte.langhe.<slug>`).
2. Confirm the broad DOCs go under the Langhe subregion despite their Roero spill.
3. Go-ahead per phase (each writes to production).
