# Bordeaux Classifications — Redesign + Cru↔Appellation Linking

Date: 2026-08-04
Status: Approved design (visual direction validated via the brainstorming companion)

## Goals

- Replace the flat, middot-joined text presentation of the Bordeaux
  classifications with an interactive view: a growth **pyramid** as the hero
  with a filterable château **table** beneath it. Clicking a pyramid tier
  filters the table. (Chosen via the visual companion: Option A + table.)
- Link classified growths to their appellations **both ways**, via the wine map:
  - château → appellation: the table's Appellation column links to
    `/knowledge/map?place=<canonical_key>`.
  - appellation → châteaux: the map place page (e.g. Pauillac) gains a
    "Classified growths" section listing the châteaux located there.
- Give all four populated systems the rich treatment. Reduce **Cru Bourgeois**
  to a short prose explainer (re-ranked ~every 5 years, so no fixed list).

## Current state (recap)

- 189 `wine_designation_members` (`member_kind = 'ESTATE'`) rows across four
  Bordeaux systems, each with `tier`, `tier_rank`, `commune` (free text) and an
  optional `local_note`. Already `PUBLISHED`; already fetched to the client in
  `src/lib/designations/page-data.ts` but rendered as a middot-joined text list
  in `SystemsPanel` (`designations-tabs.tsx`), with `commune` ignored.
- Appellations exist as `wine_places` rows (e.g.
  `france.bordeaux.haut-medoc.pauillac`). There is **no** structured link from a
  member to its appellation today — only the `commune` string.
- Burgundy demonstrates the bespoke-panel pattern to mirror: `burgundy.ts`
  (data shaper) + `content.ts` pyramid meta + `burgundy-pyramid.tsx`
  (interactive component), wired at the `designations-tabs.tsx` `switch`.

## System shapes (from live data)

| System (`wine_designations.key`) | Tiers (by `tier_rank`) | Count |
| --- | --- | --- |
| `medoc-1855` | Premier (5) · Deuxième (14) · Troisième (14) · Quatrième (10) · Cinquième (18) | 61 |
| `sauternes-1855` | Premier Cru Supérieur (1) · Premier Cru (11) · Deuxième Cru (15) | 27 |
| `saint-emilion-grand-cru-classe` | Premier Grand Cru Classé A (2) · B (12) · Grand Cru Classé (71) | 85 |
| `graves-cru-classe` | Cru Classé (single flat tier) | 16 |
| `cru-bourgeois-medoc` | — (empty; prose only) | 0 |

## Presentation

Add a tab kind `"bordeaux"` in `src/lib/designations/tabs.ts`. The Bordeaux tab
renders a new client component `BordeauxClassification` via a new branch in the
`designations-tabs.tsx` `switch` (Alsace stays on the generic `systems` panel).

Within the Bordeaux tab:

- **Segmented switcher** over the four populated systems (Médoc 1855 ·
  Sauternes 1855 · Saint-Émilion GCC · Graves Cru Classé). Default = Médoc 1855.
- For the selected system:
  - **Interactive pyramid** as hero, one band per `tier` ordered by `tier_rank`,
    band width increasing down the tiers. Each band shows the tier label + a
    count (e.g. "5 châteaux · 1st Growths"). Clicking a band filters the table
    to that tier; clicking the active band (or "Show all") resets. Graves renders
    as a single flat band; Saint-Émilion A/B/GCC and Sauternes' three tiers use
    the same mechanism.
  - **Château table** below: columns **Growth · Château · Commune ·
    Appellation**. `local_note` renders as a muted sub-line under the château
    name. The Appellation cell is a link to the wine map (see Rendering). Styled
    to match the cellar/catalog tables (same visual language).
  - A client-side **search** box filters the table by château name (parity with
    the existing Library search affordance).
- A short **Cru Bourgeois** explainer card (static prose in `content.ts`): what
  it is, the three current levels (Exceptionnel / Supérieur / Cru Bourgeois),
  and that the list is revised roughly every five years — hence no fixed roster.
- The existing **glossary terms** for Bordeaux (`GlossaryList`) remain, appended
  below, unchanged.

Pyramid tier colours/labels live as per-system `pyramid` metadata in
`content.ts` keyed by `wine_designations.key` (the `DesignationContent.pyramid`
type already exists; extend the map with entries for the four systems). Colours
follow the existing Burgundy palette family (deep bordeaux → gold down the
tiers).

## Data model

Add a dedicated nullable FK to `wine_designation_members`:

```sql
alter table wine_designation_members
  add column appellation_wine_place_id uuid references wine_places(id);
create index on wine_designation_members (appellation_wine_place_id);
```

Rationale: the existing `wine_place_id` is used by SITE members (Burgundy/Alsace
vineyards) to point at the member's own delimited place. A château's
*appellation* is a different relation, so a dedicated column keeps semantics
clean and leaves SITE usage untouched. The index serves the reverse
(appellation → members) lookup.

Backfill is **total** — every distinct `commune` maps to a real `wine_places`
`canonical_key` (verified against live data):

| `commune` | → `canonical_key` |
| --- | --- |
| Pauillac | `france.bordeaux.haut-medoc.pauillac` |
| Margaux | `france.bordeaux.haut-medoc.margaux` |
| Saint-Julien | `france.bordeaux.haut-medoc.saint-julien` |
| Saint-Estèphe | `france.bordeaux.haut-medoc.saint-estephe` |
| Haut-Médoc | `france.bordeaux.haut-medoc` |
| Pessac (Graves) | `france.bordeaux.pessac-leognan` |
| Cadaujac, Léognan, Martillac, Pessac, Talence, Villenave-d'Ornon | `france.bordeaux.pessac-leognan` |
| Sauternes, Bommes, Fargues, Preignac | `france.bordeaux.sauternes` |
| Barsac | `france.bordeaux.sauternes.barsac` |
| Saint-Émilion, Saint-Christophe-des-Bardes, Saint-Étienne-de-Lisse, Saint-Hippolyte, Saint-Laurent-des-Combes, Saint-Pey-d'Armens, Saint-Sulpice-de-Faleyrens | `france.bordeaux.saint-emilion` |

The backfill migration self-asserts that **zero** Bordeaux ESTATE members remain
with a NULL `appellation_wine_place_id` (guards against a future unmapped
commune).

## Rendering — both directions

**Château → appellation (Bordeaux panel).** `page-data.ts` extends the member
select to include `tier_rank`, `local_note`, and the joined appellation via
`appellation_wine_place_id` (its `canonical_key` + `name`). `TabSystemMember`
gains `tierRank`, `localNote`, `appellationKey`, `appellationName`. The table's
Appellation cell renders `<Link href={/knowledge/map?place=${appellationKey}}>`
— the established deep-link pattern (`grape-library.tsx`, `designations-tabs.tsx`).

**Appellation → châteaux (wine map).** Extend the `get_wine_place_context` RPC
to return a `classified_members` array for the selected place: members where
`appellation_wine_place_id = place.id`, joined to their `wine_designations`
(system name/key), ordered by `tier_rank`, `sort_order`. `knowledge-sections.tsx`
renders a new **"Classified growths"** section grouping these by system then
tier (e.g. Pauillac → 1855 Médoc → Premier: Lafite, Latour, Mouton; Deuxième:
Pichon…; etc.). The section is omitted when the array is empty, so only relevant
appellations show it. This mirrors the existing "Designations" section that the
RPC already feeds.

## Data flow / files touched

- `supabase/migrations/*` — column + index + backfill; RPC extension (below).
- `src/lib/database.types.ts` — regen/extend for the new column + RPC field.
- `src/lib/designations/tabs.ts` — add `kind: "bordeaux"`; the Bordeaux tab
  switches from `"systems"` to `"bordeaux"`.
- `src/lib/designations/content.ts` — per-system pyramid meta + Cru Bourgeois
  prose.
- `src/lib/designations/page-data.ts` — extend member select + `TabSystemMember`.
- `src/app/knowledge/designations/bordeaux-classification.tsx` — **new**
  component (segmented switch + pyramid + table + search + Cru Bourgeois card).
- `src/app/knowledge/designations/designations-tabs.tsx` — new `switch` branch;
  include Bordeaux members in the search index.
- `src/app/knowledge/map/knowledge-sections.tsx` — new "Classified growths"
  section; context type + `fetchWinePlaceContext` mapping updated.

## Migrations (next version ≥ `20260829263300`)

1. `..._designation_member_appellation_link.sql` — add column + index +
   backfill from the commune map; assert zero NULL Bordeaux ESTATE members.
2. `..._wine_place_context_classified_members.sql` — extend
   `get_wine_place_context` to return `classified_members`.

Applied dry→live with `node scripts/scratch-apply.mjs --file <path> --mode dry|live`.

## Non-goals

- No château → `producer_id` linking (stays NULL; future work).
- No Cru Bourgeois château list (prose only).
- No admin/editing UI for members.
- No change to the flat `appellations` reference table or tasting scoring.

## Testing & verification

- `tsc --noEmit` clean (clear `.next` first).
- DB test (`node --test scripts/*.test.mjs`): after backfill, **0** Bordeaux
  ESTATE members have NULL `appellation_wine_place_id`; and the extended RPC
  returns ≥1 `classified_members` for `france.bordeaux.haut-medoc.pauillac`.
- Manual QA (screenshots): pyramid tier click filters the table; Appellation
  links open the correct map place; the map place page shows "Classified
  growths"; the four systems each render; Cru Bourgeois shows the explainer.

## Risks

- The commune→place map is curated to today's data. A newly-added member with a
  novel commune string would break the "zero NULL" assertion — intended, so it
  surfaces loudly and the map is updated.
- Saint-Émilion's list is periodically revised (like Cru Bourgeois but less
  often). Members reflect the current published list; acceptable per scope.
