# Designations → Library restructure — design

- Date: 2026-08-03
- Status: Approved (brainstorm) — pending spec review
- Owner: cdo@copenhagendata.com

## Summary

The Learn area's reference pages (Designations, Grapes, Typical Wines, Rules) are too
many top-level nav items, and the Designations page in particular is a dense, messy
glossary. This restructures them under a single **Library** hub and rebuilds
Designations as an editorial **overview + browsable directory + per-topic deep-dive
pages**, with two polished flagship deep-dives (Bordeaux 1855 Médoc, Burgundy Grand Cru)
and a template that degrades gracefully for the other, less-developed topics.

Goals:

- Collapse the Learn nav to **Wine Map · Library**.
- A light **Library** hub that is a clean front door to the reading sections.
- Turn Designations from one long glossary into overview + directory + deep-dives.
- Two flagship deep-dives at mockup fidelity; everything else reachable and tidy.
- No database schema changes; no redesign of Grapes / Typical Wines / Rules.

## Non-goals (this pass)

- No redesign of Grapes, Typical Wines, or Rules pages (Library just links to them).
- No new DB tables/columns; bespoke copy/images live in a static content module.
- No seeding of empty systems (Cru Bourgeois du Médoc, Burgundy Premier/Village have 0
  members) — hidden from the directory until they have data.
- No admin/editing UI for designations; no per-château detail pages.
- Map Challenge is undeveloped and out of scope; dropped from nav for now.

## Information architecture & routes

| Route | Purpose | Status |
|---|---|---|
| `/knowledge` | **Library** hub (light) — front door to the reading sections | new |
| `/knowledge/designations` | Designations **overview** (editorial + browse directory) | replaces `/knowledge/type-designations` |
| `/knowledge/designations/[key]` | System **deep-dive** (key = `wine_designations.key`) | new |
| `/knowledge/designations/glossary/[category]` | Glossary **category** page (term list) | new |
| `/knowledge/map`, `/knowledge/archetypes`, `/knowledge/grapes`, `/rules` | Existing pages | unchanged |
| `/knowledge/type-designations` | Old route | → redirect to `/knowledge/designations` |

Breadcrumb example: `Library › Designations › Bordeaux › 1855 Classification` (the group
segment, e.g. Bordeaux, comes from `wine_designations.display_group` and links back to the
overview; it is not a route level of its own).

## Decisions

- **Nav (Learn pillar, `src/components/nav-links.ts`):** children become exactly **Wine
  Map** (`/knowledge/map`) and **Library** (`/knowledge`). Remove Typical Wines, Grapes,
  Designations, Rules and Map Challenge from the pillar. Keep the pillar `match` covering
  `/knowledge` and `/rules` so those routes still highlight Learn.
- **"Designations" keeps its name** as a section inside Library — the naming concern was
  the top-level nav, resolved by the hub. Reconcile the page H1 ("Type Designations") to
  "Designations".
- **Flat deep-dive route** keyed by `wine_designations.key` (not nested `/bordeaux/1855`);
  the group is derived, keeping route surface minimal.
- **One deep-dive template, two content shapes**, chosen from the data (see below).

## Library hub (`/knowledge`) — light

A simple landing page, no heavy logic:

- Short intro line ("Everything to learn about wine — regions, grapes, styles and the
  rules of the game.").
- A responsive **card grid** linking to: Designations, Grapes, Typical Wines, Rules, plus a
  prominent pointer to the Wine Map. Each card: title + one-line description + icon.
- No redesign of the linked pages. This hub is the only new surface here.

## Designations overview (`/knowledge/designations`)

Per the mockup, editorial then a directory:

1. Hero: "Designations" + intro paragraph.
2. "Why designations matter" — 4 icon cards (Indicate origin, Set standards, Create
   hierarchy, Reflect tradition).
3. "Variation in wine" — 4 icon cards (Country to country … Vineyard to vineyard).
4. Blind-tasting info callout.
5. **Browse directory**: entries grouped by `display_group` / theme (Bordeaux, Burgundy,
   Alsace, Germany, Sparkling, Fortified …). Each entry is a card/row linking to its
   deep-dive (systems) or glossary category page. Systems with 0 members are omitted. The
   two flagships are visually first in their groups.

## Deep-dive template (`/knowledge/designations/[key]`)

Shared server-component layout. Header: breadcrumb, title, intro (static content else
`wine_designations.description`), optional hero image (static content; gradient fallback
when absent). `?tab=` link tabs. The **shape is chosen from the data**: if the system has
members with a `wine_place_id`, offer the map + hierarchy shape; otherwise the tiered
table shape.

**Shape A — tiered members** (1855 Médoc, Saint-Émilion, Graves, Sauternes):

- Overview tab: "The N growths/tiers" — members grouped by `tier`, ordered by `tier_rank`;
  each tier is a card (colour swatch + tier label + count) listing member names.
- Second tab ("Châteaux"): full searchable list (name + commune + tier).

**Shape B — place-linked** (Burgundy Grand Cru, Alsace Grand Cru):

- Overview tab: hierarchy pyramid (static content) + scoped `TileWineMap`
  (`visibleKeys` = member site keys) + a **By sub-region** list (computed).
- Second tab ("All Grand Cru vineyards"): full list grouped by sub-region.

Non-flagship systems use the same template without static hero/pyramid — intro from the
system description, list from data — so every directory link resolves to a decent page.

## The two flagships

**Bordeaux 1855 Médoc (`medoc-1855`)** — Shape A. 61 châteaux across 1er–5e Grand Cru
Classé. Static: hero image, intro. Tier colours per mockup. No map (0 place links).

**Burgundy Grand Cru (`burgundy-grand-cru`)** — Shape B. 33 vineyards, all place-linked.
Static: hero, intro, the 5-row hierarchy pyramid (Grand Cru 33 / Premier Cru ~640 /
Village 44 / Regional 23 / Bourgogne). Map scoped to the 33 grand-cru sites within
`france.bourgogne`. By-subregion computed (Côte de Nuits, Côte de Beaune, Côte
Chalonnaise, Mâconnais, Chablis).

## Glossary category pages (`/knowledge/designations/glossary/[category]`)

For `type_designations` categories (Prädikat, Sparkling Dosage, Aging Classification,
Quality Classification, Fortified Style, Sweetness): title + intro + an ordered list of
terms (name + description) by `sort_order`. `[category]` is a slug of the category name.
Preserves and improves today's glossary content.

## Static content module

`src/lib/designations/content.ts`:

```ts
export type DesignationContent = {
  hero?: { src: string; alt: string };
  intro?: string;
  hierarchy?: { tier: string; label: string; count?: string; note?: string }[];
};
export const DESIGNATION_CONTENT: Record<string, DesignationContent>;
```

Keyed by system key; only flagships need entries. Hero images live under
`/public/designations/<key>.*` and are drop-in — the template renders a gradient fallback
when `hero` is absent. Overview editorial copy (why-cards, intro) is a sibling constant.

## Data flow & queries

New `src/lib/designations/queries.ts` (server), reused by overview + deep-dives:

- `listDesignationTopics()` — systems (member count > 0) + glossary categories for the
  overview directory, grouped by display group.
- `getDesignationSystem(key)` — the system row + members ordered by `tier_rank, sort_order`.
- `getSubregionBreakdown(designationId)` — place-linked systems only: member → `wine_place`
  → nearest `SUBREGION` ancestor (recursive CTE on `wine_places.primary_parent_id`),
  returning `{ subregion, canonical_key, count }[]` plus the member site `canonical_key`s
  for the map's `visibleKeys`.
- `getGlossaryCategory(slug)` — `type_designations` rows for that category.

All server-side via `@/lib/supabase/server`; RLS already restricts to published rows. No
schema changes.

## Reused components

- `src/components/ui/tabs.tsx` (`?tab=` link tabs) for deep-dive tabs.
- `TileWineMap` (`src/app/knowledge/map/tile-wine-map.tsx`) with `visibleKeys` + a fixed
  `CameraTarget` for the Burgundy map, wrapped in a small client component that loads the
  manifest; `dynamic(..., { ssr: false })`.
- `Card`, `Badge`, and existing header/breadcrumb patterns.

## Testing / verification

- `tsc --noEmit` (clear `.next` first) each increment.
- Optional `node --test` for `getSubregionBreakdown` (the one non-trivial query) against
  the live DB, mirroring existing `scripts/*.test.mjs`.
- Manual visual verification by the owner (push → screenshots).

## Open questions / follow-ups

- Real hero imagery: owner to supply; gradient placeholder until then.
- Later: upgrade the other systems (Alsace, Saint-Émilion, Graves, Sauternes) and glossary
  categories to richer bespoke deep-dives; seed the empty systems.
- Later: Map Challenge — decide whether it lives under Wine Map or Library.
