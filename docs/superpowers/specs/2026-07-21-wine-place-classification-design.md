# Wine Place Classification And Hierarchy Design (Phase 3 Addendum)

Addendum to `2026-07-19-world-wine-map-architecture-design.md`, agreed with
the owner on 2026-07-21. Governs how the Phase 3 France import (and every
later import) models places so the catalog is legally accurate, intuitive to
navigate, and scalable worldwide — without ever entangling scoring.

## The Four Orthogonal Axes

A place participates in four independent relationships. Conflating any two
of them is the failure mode this addendum exists to prevent.

| Axis | Question it answers | Where it lives |
| --- | --- | --- |
| Navigation | What shows under what when browsing the map | `wine_places.primary_parent_id` (one deterministic tree) |
| Classification facts | Is this a legal appellation? In which system, at what level? | New flat columns on `wine_places` (below) |
| Legal relationships | How do like-territory appellations relate in law? | `wine_place_relationships` with an extended type enum (below) |
| Scoring mapping | Which guessable region/appellation rows resolve here? | Existing `regions`/`appellations` → `wine_place_id` links |

Scoring never traverses `primary_parent_id`. A wine's answer key points at
`regions.id`/`appellations.id`, which link to places independently — so the
navigation tree may be freely optimized for intuition without any scoring
risk.

## Classification Facts (new columns on `wine_places`)

- `is_appellation boolean not null default false` — the place is itself a
  legally recognized appellation.
- `appellation_system text` — the legal system: `AOC/AOP`, `IGP`, `DOCG`,
  `DOC`, `AVA`, … Text rather than an enum: the value set grows per country
  through the review workflow, never automatically.
- `appellation_level text` — coarse level within the system: `regional`,
  `subregional`, `communal`, `cru`. Reviewed vocabulary, not free text.
- Constraint: `is_appellation = false` implies both other columns are null;
  `is_appellation = true` requires `appellation_system`.

Flat columns, not a side table: a geographic place is one appellation at one
level. The genuinely many-to-many legal nuance lives in relationships, where
it is naturally N-ary. `kind` stays what it is today — the navigation /
geographic tier — and stops implying anything legal.

`is_selectable` from the owner's sketch is derived, not stored: a place is
guessable exactly when a scoring row links to it.

## Legal Relationship Types (enum extension)

`wine_place_relationship_type` gains two values beside
`OVERLAPS`/`ALTERNATE_PARENT`/`RELATED`:

- `REPLACES_WITHIN` — source appellation legally replaces the target within
  the source's boundaries. Producers inside the source cannot label as the
  target.
- `DUAL_LABEL` — source appellation coexists with the target; producers
  inside the source may label as either.

Both edges are directional (source = the inner/more specific appellation).

## Worked Examples (the Bordeaux pair that motivated this)

| | Navigation parent | Classification | Legal edge |
| --- | --- | --- | --- |
| Pessac-Léognan | Graves | `is_appellation`, `AOC/AOP`, `subregional` | `REPLACES_WITHIN` → Graves (since 1987; its producers cannot use Graves AOC) |
| Barsac | Sauternes | `is_appellation`, `AOC/AOP`, `communal` | `DUAL_LABEL` → Sauternes (its producers may label Barsac AOC or Sauternes AOC; other Sauternes communes cannot use Barsac) |

The navigation tree is identical in shape for both; only the typed legal
edge differs. That is the proof the axes are independent.

## Region == Appellation Duplicates (e.g. Bordeaux, Chablis, Chianti)

One canonical place, not two. `france.bordeaux` is a `REGION` in the tree
AND carries `is_appellation = true` (the generic Bordeaux AOP). It may be
linked from both a `regions` scoring row and an `appellations` scoring row.
Never mint a second place to carry the legal identity.

## Canonical Key Rule

`canonical_key` is a stable, opaque identifier. It is never parsed for
lineage and never rewritten on reparenting (keys lock at verification).
Dotted keys read like paths only as a naming convenience for humans; the
tree truth is `primary_parent_id`. A place created under one parent keeps
its key forever even if navigation later moves it.

## Target Bordeaux Tree (Phase 3 correction)

The Phase 1 pilot tree placed Pessac-Léognan and Sauternes directly under
Bordeaux. The Phase 3 import corrects navigation to the owner-approved
shape (keys unchanged, only `primary_parent_id` moves; Graves and the other
left/right-bank groupings gain real sourced boundaries as part of the
import):

```
France
└── Bordeaux
    ├── Médoc (area)
    │   ├── Médoc AOC
    │   └── Haut-Médoc
    │       ├── Margaux · Saint-Julien · Pauillac · Saint-Estèphe
    ├── Graves
    │   ├── Graves AOC
    │   ├── Pessac-Léognan
    │   └── Sauternes
    │       ├── Sauternes AOC
    │       └── Barsac
    ├── Saint-Émilion · Pomerol · Fronsac · Canon-Fronsac
    ├── Blaye · Côtes de Bourg · Entre-Deux-Mers
    └── Bordeaux AOP (the region itself; see duplicates rule)
```

Where "area" and "AOC" would otherwise be the same name at two nodes
(Médoc, Graves, Sauternes), prefer ONE node carrying both roles per the
duplicates rule unless the legal boundary and the navigation grouping
genuinely differ in geometry — the import decides per case with sourced
boundaries, and the review workflow records the decision.

## Scoring Hook (recorded, not built now)

`DUAL_LABEL` is a real scoring fact: a Barsac wine's appellation answer
could legitimately accept Sauternes as correct. Today scoring is exact
`appellation_id` match. When alternate-acceptance is built, it reads
`DUAL_LABEL` edges — it is never hardcoded per appellation.

## What The Phase 3 Import Must Honor

1. Additive migration first: enum values + classification columns +
   constraint (no data), typed and tested like every schema change.
2. Every imported place gets classification facts at review time; legal
   edges are created only from sourced statements, never inferred from the
   tree.
3. Navigation reparenting of existing verified places is allowed and
   expected (keys immutable); scoring links are untouched by reparenting.
4. Reference-row review statuses (`VERIFIED`/`SYNTHETIC`/`DUPLICATE`/…)
   continue to account for every scoring row as regions beyond Bordeaux
   come online.
