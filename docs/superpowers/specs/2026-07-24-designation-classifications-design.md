# Expandable Designation Classifications — Design

Date: 2026-07-24
Status: Approved for planning
Area: Knowledge → Type Designations library (`src/app/knowledge/type-designations/page.tsx`)

## Overview

The Designation library today lists ~50 generic scoring terms (`type_designations`:
Kabinett, Grand Cru, Brut …) grouped by category. This feature adds a
**Classifications** section that lets a learner expand a real classification
*system* — e.g. the 1855 Médoc — to reveal its ranked **member châteaux/vineyards**
(name + growth tier + commune). The member data does not exist anywhere yet; this
spec introduces it as structured, reusable DB data and an expandable UI to browse it.

Two member kinds, per the product owner:
- **ESTATE** — a Bordeaux château ranked into a growth. Member identity is a
  producer (store the name now, link `producer_id` later).
- **SITE** — a Burgundy/Alsace Grand Cru, which is a geographic vineyard. Member
  identity is a place (link `wine_place_id` now where the place is live, later
  otherwise; eventually surfaced on the map).

## Goals

- Structured, queryable member data reusable beyond this one page (map, scoring later).
- Expand a classification system → see its tiers and members, learning-focused and readable.
- Render immediately on push (no dependence on the "Wine Map Tiles (promote)" workflow).
- Encode both member kinds cleanly so producers/places can be linked in later.

## Non-goals (v1)

- **Cru Bourgeois** estate lists (~250, re-ranked annually) — out of scope by owner request.
- Populating `producer_id` (Bordeaux) or creating Alsace `wine_place` rows now.
- Enumerating Burgundy **Premier Cru** climats (~640) — `burgundy-premier-cru` stays a
  description-only system with no members and does not appear as an expandable card.
- Member-level search/filter (glossary search behaviour is unchanged).
- Gameplay integration (autocomplete/guess-matching) — deliberately avoided by not
  inserting châteaux into `producers`.

## Data model

### New table: `wine_designation_members`

```sql
create table public.wine_designation_members (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid not null references public.wine_designations(id) on delete cascade,
  member_kind text not null check (member_kind in ('ESTATE','SITE')),
  name text not null,                 -- château or vineyard label (authoritative)
  tier text,                          -- 'Premier Cru' … 'Cinquième Cru'; 'Grand Cru'; etc.
  tier_rank int not null default 0,   -- tier ordering, 1 = top
  commune text,                       -- Pauillac / Margaux / village
  sort_order int not null default 0,  -- ordering within a tier
  producer_id uuid references public.producers(id),      -- ESTATE: linked later
  wine_place_id uuid references public.wine_places(id),   -- SITE: linked now (Burgundy) / later (Alsace)
  local_note text,                    -- e.g. 'promoted 1973', 'red & white'
  editorial_status wine_article_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  unique (designation_id, name)
);

create index wine_designation_members_designation_idx
  on public.wine_designation_members (designation_id);

alter table public.wine_designation_members enable row level security;

create policy "wine designation members published read"
  on public.wine_designation_members
  for select to authenticated
  using (editorial_status = 'PUBLISHED');
```

RLS is **published-read only** — no place-verified gate. Members are curated
catalogue data (like `wine_designations`), so they render as soon as the row is
`PUBLISHED`. Seeds are inserted already-`PUBLISHED`, mirroring the Bordeaux
`wine_designations` seed, so nothing waits on the promote workflow. (SITE members
whose place is not yet live simply carry a null `wine_place_id` and render as text.)

### Additions to `wine_designations`

```sql
alter table public.wine_designations
  add column if not exists display_group text,   -- 'Bordeaux' | 'Burgundy' | 'Alsace'
  add column if not exists sort_order int not null default 0;
```

Data-driven grouping/ordering for the Classifications section, replacing any
hardcoded key list in the page. New system row:

- `alsace-grand-cru` — "Grand Cru (Alsace)", 51 delimited vineyards, seeded PUBLISHED.

Existing systems get `display_group`/`sort_order` backfilled
(medoc-1855, sauternes-1855, saint-emilion-grand-cru-classe, graves-cru-classe →
Bordeaux; burgundy-grand-cru → Burgundy; alsace-grand-cru → Alsace). Member-less
systems (burgundy-village, burgundy-premier-cru, and cru-bourgeois-medoc — the
last deliberately, per the Cru Bourgeois non-goal) are left with null
`display_group` and are excluded from the section by the "systems that have
members" filter.

## Seed data & scope

| System (`wine_designations.key`) | Kind | Members | Tiers |
|---|---|---|---|
| `medoc-1855` | ESTATE | 61 | Premier→Cinquième Cru (rank 1–5) |
| `sauternes-1855` | ESTATE | 27 | Premier Cru Supérieur, Premier Cru, Deuxième Cru |
| `saint-emilion-grand-cru-classe` | ESTATE | 85 | 1er GCC A (2), 1er GCC B (12), GCC (71) — 2022 classification |
| `graves-cru-classe` | ESTATE | 16 | single "Cru Classé" (colour scope in `local_note`) |
| `burgundy-grand-cru` | SITE | 33 | "Grand Cru" — `wine_place_id` set from existing GC places |
| `alsace-grand-cru` | SITE | 51 | "Grand Cru" — `wine_place_id` null until Alsace goes live |

≈ **273 rows** (189 ESTATE + 84 SITE). Counts to be confirmed against authoritative
sources at implementation; each migration self-asserts exact counts.

Sourcing:
- Bordeaux growths — the official 1855 lists, St-Émilion 2022 INAO classification,
  1959 Graves classification.
- Burgundy GC — matched to existing `wine_places` (`france.bourgogne.*`,
  `appellation_level = 'grand_cru'`); `wine_place_id` resolved by canonical_key/name.
- Alsace GC — the committed `data/wine-map/*alsace*-appellations.json` artifact
  (51 GC), names/communes only; `wine_place_id` stays null.

Notes on volatility: St-Émilion (revised ~decennially) and Graves are stored as of
their current classification; `local_note`/description carry the year so a later
revision is a data update, not a schema change.

## UI design

Server component throughout (the page is already an async server component). No new
client component; expansion uses native `<details>`/`<summary>`.

**Placement.** A new **Classifications** block at the top of the content column,
above the existing category glossary cards. The desktop side-nav gains a
**Classifications** group at the top of its jump list (same pattern as the
category groups), each item linking to `#classification-<key>`.

**System card** (`<details>` styled as a Card, `id="classification-<key>"`,
`scroll-mt-20`):
- `<summary>`: system name (e.g. "1855 Classification (Médoc)"), a muted one-line
  summary ("5 growths · 61 châteaux"), and a chevron that rotates via
  `group-open:rotate-180`. Grouped under a `display_group` subheading (Bordeaux /
  Burgundy / Alsace).
- Open body:
  - system `description`.
  - tiers in `tier_rank` order. Each tier: a small heading (tier name) + a count
    badge, optional `Separator` between tiers.
  - members under each tier as a responsive grid
    (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) of compact cells: **name**
    (medium weight) + **commune** (muted, small). SITE members with a
    `wine_place_id` render the name as a map deep-link
    (`/knowledge/map?place=<canonical_key>`), mirroring the grape page's
    "On the wine map" links; ESTATE and not-yet-live SITE members render as text.

Layout stays left-anchored (no `mx-auto`), preserving the knowledge-tab fix (2b3204a).

**Cross-link (optional polish).** On the glossary rows whose term maps to a system
(e.g. "Grand Cru Classé", "Cru Bourgeois"), a small "See classifications ↑" link
to the section. Nice-to-have, not required for v1.

## Rendering / queries (server component)

1. Fetch published members joined to their system:
   `wine_designation_members` (editorial_status = PUBLISHED) join `wine_designations`
   (editorial_status = PUBLISHED), select member fields + designation
   key/name/description/display_group/sort_order.
2. Group in JS: designation → tier (ordered by tier_rank) → members (ordered by
   sort_order). Only systems with ≥1 member appear.
3. For SITE members with `wine_place_id`, fetch `wine_places (id, name, canonical_key)`
   by id (same approach as `grapes/page.tsx`) to build map links.
4. Order sections by `wine_designations.sort_order`, grouped by `display_group`.

## Migrations plan

Versioning per repo convention (latest live 20260828099000 → use 20260829*). All
self-assert with `raise exception` guards; idempotent (`on conflict do nothing`,
final-state assertions — mindful of the twin-applier gremlin: no PENDING filters,
assert final counts). Apply via
`node scripts/scratch-apply.mjs --file <path> --mode dry|live`.

1. **`20260829090000_designation_members_schema.sql`** — table + index + RLS;
   `wine_designations` `display_group`/`sort_order` columns + backfill; insert
   `alsace-grand-cru` system (PUBLISHED). Asserts: table exists, wine_designations
   count = 9, alsace row present.
2. **`20260829091000_bordeaux_designation_members.sql`** — 189 ESTATE members for the
   4 Bordeaux systems (PUBLISHED, `producer_id` null). Asserts per-system counts
   (61/27/85/16) and per-tier counts.
3. **`20260829092000_geographic_designation_members.sql`** — 33 Burgundy SITE members
   (resolve + set `wine_place_id` from existing GC places; assert all 33 resolved) +
   51 Alsace SITE members (`wine_place_id` null). Asserts counts 33/51 and that every
   Burgundy member has a non-null `wine_place_id`.

(Grouping into three files is for reviewability; the plan may adjust. No boundary
changes, so `boundary-expectations.json` regeneration is not required.)

## Tests

Existing suites: `node --test scripts/world-wine-map-foundation.test.mjs`
`scripts/wine-place-context.test.mjs` (need `DB_PASSWORD` + `DB_PORT=5432`).

- If the foundation test asserts a `wine_designations` count, bump 8 → 9 for
  `alsace-grand-cru`; confirm from a live probe, not arithmetic.
- Add a focused test (e.g. `scripts/designation-members.test.mjs`) asserting:
  total member count; per-system counts and tier composition; every ESTATE has
  null `producer_id` and non-null `commune`; every Burgundy SITE has a non-null
  `wine_place_id`; every Alsace SITE has null `wine_place_id`; unique(designation_id,
  name) holds; all seeded members are PUBLISHED.
- Verify the page renders for a system (Playwright/manual per repo norm) and that
  Burgundy map links resolve.

## Risks / open items

- **Data accuracy** is the main risk (learning-focused). Member lists must come from
  authoritative sources; self-asserting counts catch miscounts but not wrong names —
  a careful review pass is part of implementation.
- **Burgundy duplication** (Approach A): membership also exists as
  `wine_place_designations` for the map/place pages. The new focused test asserts the
  33 GC place-links and the 33 member rows agree, preventing drift.
- **Graves colour scope**: one row per estate; red/white classification captured in
  `local_note` rather than duplicate rows.
- **St-Émilion revisions**: current 2022 set stored; future revisions are data updates.
```
