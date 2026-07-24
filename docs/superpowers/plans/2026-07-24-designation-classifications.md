# Expandable Designation Classifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner expand a Bordeaux/Burgundy/Alsace classification *system* in the Designation library to reveal its ranked member châteaux/vineyards.

**Architecture:** New `wine_designation_members` table (unified ESTATE|SITE, per approved Approach A) hangs off the existing `wine_designations`. Members seed already-`PUBLISHED` with published-read-only RLS so they render on push without the promote workflow. The type-designations page (async server component) gains a **Classifications** section rendering each system as a native `<details>` card → tiers → member grid.

**Tech Stack:** Next.js 16 (modified — read `node_modules/next/dist/docs/` before page changes), Supabase/Postgres, Tailwind, shadcn UI (Card/Badge/Separator; no accordion → native `<details>`).

## Global Constraints

- Migrations applied via `node scripts/scratch-apply.mjs --file <path> --mode dry|live` (dry rolls back, live commits). Never commit `scripts/scratch-apply.mjs`.
- Every migration self-asserts final state with `raise exception` guards; idempotent (`on conflict do nothing`, final-state assertions, **no PENDING filters / no row-count deltas** — twin-applier gremlin).
- Version numbers: latest live `20260828099000` → use `20260829*`.
- Tests need `DB_PASSWORD` + `DB_PORT=5432`. Verify counts from a **live probe**, never arithmetic.
- Push to `master` auto-deploys to Vercel. Push only after tests + build are green.
- Knowledge pages stay left-anchored (no `mx-auto`) — preserves fix 2b3204a.
- Spec: `docs/superpowers/specs/2026-07-24-designation-classifications-design.md`.

---

### Task 1: Schema migration — table, RLS, `wine_designations` columns, `alsace-grand-cru`

**Files:**
- Create: `supabase/migrations/20260829090000_designation_members_schema.sql`

**Interfaces:**
- Produces: table `public.wine_designation_members` (columns per spec); `wine_designations.display_group text`, `wine_designations.sort_order int`; `wine_designations` row `alsace-grand-cru` (PUBLISHED). Later tasks insert member rows referencing `wine_designations.key`.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 3F: classification MEMBERS. One row per château (ESTATE) or Grand Cru
-- vineyard (SITE) under a wine_designations system. Rendered in the Designation
-- library's Classifications section. Seeded PUBLISHED (published-read RLS, no
-- place-verified gate) so it renders without the promote workflow.
alter table public.wine_designations
  add column if not exists display_group text,
  add column if not exists sort_order int not null default 0;

create table if not exists public.wine_designation_members (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid not null references public.wine_designations(id) on delete cascade,
  member_kind text not null check (member_kind in ('ESTATE','SITE')),
  name text not null,
  tier text,
  tier_rank int not null default 0,
  commune text,
  sort_order int not null default 0,
  producer_id uuid references public.producers(id),
  wine_place_id uuid references public.wine_places(id),
  local_note text,
  editorial_status wine_article_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  unique (designation_id, name)
);

create index if not exists wine_designation_members_designation_idx
  on public.wine_designation_members (designation_id);

alter table public.wine_designation_members enable row level security;

drop policy if exists "wine designation members published read" on public.wine_designation_members;
create policy "wine designation members published read"
  on public.wine_designation_members
  for select to authenticated
  using (editorial_status = 'PUBLISHED');

-- New system: Alsace Grand Cru (51 delimited lieux-dits). Seeded PUBLISHED.
insert into public.wine_designations (key, name, appellation_system, description, editorial_status, display_group, sort_order)
values ('alsace-grand-cru', 'Grand Cru (Alsace)', 'AOC/AOP',
  'Alsace''s 51 delimited Grand Cru vineyards, each its own AOC, generally for the four noble varieties (Riesling, Gewurztraminer, Pinot Gris, Muscat). The vineyard name appears on the label.',
  'PUBLISHED', 'Alsace', 30)
on conflict (key) do update set
  name = excluded.name, appellation_system = excluded.appellation_system,
  description = excluded.description, editorial_status = 'PUBLISHED',
  display_group = excluded.display_group, sort_order = excluded.sort_order;

-- Backfill display_group / sort_order for member-bearing systems.
update public.wine_designations set display_group = 'Bordeaux', sort_order = 10 where key = 'medoc-1855';
update public.wine_designations set display_group = 'Bordeaux', sort_order = 11 where key = 'sauternes-1855';
update public.wine_designations set display_group = 'Bordeaux', sort_order = 12 where key = 'saint-emilion-grand-cru-classe';
update public.wine_designations set display_group = 'Bordeaux', sort_order = 13 where key = 'graves-cru-classe';
update public.wine_designations set display_group = 'Burgundy', sort_order = 20 where key = 'burgundy-grand-cru';

do $$
declare v_designations int; v_alsace int; v_cols int;
begin
  select count(*) into v_designations from wine_designations;
  if v_designations <> 9 then raise exception 'expected 9 wine_designations, got %', v_designations; end if;
  select count(*) into v_alsace from wine_designations where key = 'alsace-grand-cru' and editorial_status = 'PUBLISHED';
  if v_alsace <> 1 then raise exception 'alsace-grand-cru missing/not published'; end if;
  select count(*) into v_cols from information_schema.columns
    where table_name = 'wine_designation_members' and column_name in ('member_kind','producer_id','wine_place_id','tier_rank');
  if v_cols <> 4 then raise exception 'wine_designation_members schema incomplete, got % of 4 cols', v_cols; end if;
end $$;
```

- [ ] **Step 2: Dry-run** — `node scripts/scratch-apply.mjs --file supabase/migrations/20260829090000_designation_members_schema.sql --mode dry` → Expected: assertions pass, rolled back.
- [ ] **Step 3: Live-apply** — same with `--mode live` → Expected: committed.
- [ ] **Step 4: Commit** — `git add supabase/migrations/20260829090000_designation_members_schema.sql; git commit -m "feat(db): wine_designation_members schema + alsace-grand-cru system"`

---

### Task 2: Bordeaux estate members (189 rows)

**Files:**
- Create: `supabase/migrations/20260829091000_bordeaux_designation_members.sql`

**Interfaces:**
- Consumes: `wine_designation_members`, `wine_designations` (keys medoc-1855, sauternes-1855, saint-emilion-grand-cru-classe, graves-cru-classe).
- Produces: 189 ESTATE rows (`producer_id` null, `commune` set, `editorial_status = 'PUBLISHED'`).

**Data composition (compiled in-migration from authoritative fixed lists; counts are the guardrail):**
- `medoc-1855` — 61 châteaux. Tiers: `Premier Cru` rank 1 (5), `Deuxième Cru` rank 2 (14), `Troisième Cru` rank 3 (14), `Quatrième Cru` rank 4 (10), `Cinquième Cru` rank 5 (18). `commune` = Pauillac/Margaux/Saint-Julien/Saint-Estèphe/Haut-Médoc. `local_note='Promoted 1973'` on Mouton Rothschild.
- `sauternes-1855` — 27 châteaux. Tiers: `Premier Cru Supérieur` rank 1 (1: Yquem), `Premier Cru` rank 2 (11), `Deuxième Cru` rank 3 (15). `commune` = Sauternes/Barsac/Bommes/Fargues/Preignac.
- `saint-emilion-grand-cru-classe` — 85 châteaux (2022 INAO classification). Tiers: `Premier Grand Cru Classé A` rank 1 (2: Figeac, Pavie), `Premier Grand Cru Classé B` rank 2 (12), `Grand Cru Classé` rank 3 (71). `commune` = Saint-Émilion (+ satellite communes where applicable).
- `graves-cru-classe` — 16 châteaux (1959, Pessac-Léognan). Single tier `Cru Classé` rank 1. `local_note` = `'red'` / `'white'` / `'red & white'` per estate's classified colour(s).

- [ ] **Step 1: Write the migration** — one `insert ... select ... from (values ...) join wine_designations d on d.key = v.dkey on conflict (designation_id, name) do nothing`, all rows `member_kind='ESTATE'`, `producer_id` null, `editorial_status='PUBLISHED'`. End with self-assert:

```sql
do $$
declare v_total int; v_medoc int; v_saut int; v_stem int; v_graves int; v_a int; v_b int;
begin
  select count(*) into v_medoc  from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='medoc-1855';
  select count(*) into v_saut   from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='sauternes-1855';
  select count(*) into v_stem   from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='saint-emilion-grand-cru-classe';
  select count(*) into v_graves from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='graves-cru-classe';
  if v_medoc<>61 then raise exception 'medoc expected 61, got %', v_medoc; end if;
  if v_saut<>27 then raise exception 'sauternes expected 27, got %', v_saut; end if;
  if v_stem<>85 then raise exception 'st-emilion expected 85, got %', v_stem; end if;
  if v_graves<>16 then raise exception 'graves expected 16, got %', v_graves; end if;
  select count(*) into v_a from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='saint-emilion-grand-cru-classe' and m.tier_rank=1;
  select count(*) into v_b from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='saint-emilion-grand-cru-classe' and m.tier_rank=2;
  if v_a<>2 or v_b<>12 then raise exception 'st-emilion tiers A/B expected 2/12, got %/%', v_a, v_b; end if;
  select count(*) into v_total from wine_designation_members where member_kind='ESTATE';
  if v_total<>189 then raise exception 'ESTATE total expected 189, got %', v_total; end if;
end $$;
```

- [ ] **Step 2: Dry-run** (`--mode dry`) → assertions pass.
- [ ] **Step 3: Live-apply** (`--mode live`).
- [ ] **Step 4: Commit** — `git commit -m "feat(db): Bordeaux 1855/Graves/St-Émilion classified estates"`

---

### Task 3: Geographic members — Burgundy (33) + Alsace (51)

**Files:**
- Create: `supabase/migrations/20260829092000_geographic_designation_members.sql`

**Interfaces:**
- Consumes: `wine_designations` (burgundy-grand-cru, alsace-grand-cru); existing `wine_places` (`france.bourgogne.*`, `appellation_level='grand_cru'`).
- Produces: 33 Burgundy SITE rows (`wine_place_id` resolved from existing places) + 51 Alsace SITE rows (`wine_place_id` null). All `member_kind='SITE'`, tier `Grand Cru` rank 1, PUBLISHED.

- [ ] **Step 1: Write the migration.** Burgundy: `insert ... select p.name, p.id ... from wine_places p join wine_designations d on d.key='burgundy-grand-cru' where p.canonical_key like 'france.bourgogne.%' and p.appellation_level='grand_cru' and p.publication_status='VERIFIED'`. Alsace: `from (values ...)` of 51 lieu-dit names + communes, `wine_place_id` null. Assert:

```sql
do $$
declare v_bur int; v_bur_linked int; v_als int; v_als_null int;
begin
  select count(*) into v_bur from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='burgundy-grand-cru';
  select count(*) into v_bur_linked from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='burgundy-grand-cru' and m.wine_place_id is not null;
  if v_bur<>33 then raise exception 'burgundy GC expected 33, got %', v_bur; end if;
  if v_bur_linked<>33 then raise exception 'burgundy GC all must link a place, linked %', v_bur_linked; end if;
  select count(*) into v_als from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='alsace-grand-cru';
  select count(*) into v_als_null from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='alsace-grand-cru' and m.wine_place_id is null;
  if v_als<>51 then raise exception 'alsace GC expected 51, got %', v_als; end if;
  if v_als_null<>51 then raise exception 'alsace GC wine_place_id must be null for now, non-null present'; end if;
end $$;
```

Note: if the live Burgundy GC place count is not exactly 33, probe `select count(*) from wine_places where canonical_key like 'france.bourgogne.%' and appellation_level='grand_cru' and publication_status='VERIFIED'` and reconcile the assertion to the real number before live-apply (verify from probe, not arithmetic).

- [ ] **Step 2: Probe Burgundy GC place count** (adjust assert if needed) → **Step 3: Dry-run** → **Step 4: Live-apply**.
- [ ] **Step 5: Commit** — `git commit -m "feat(db): Burgundy & Alsace Grand Cru classification members"`

---

### Task 4: Tests

**Files:**
- Create: `scripts/designation-members.test.mjs`
- Modify: `scripts/world-wine-map-foundation.test.mjs` (only if it asserts a `wine_designations` count → bump 8→9)

- [ ] **Step 1: Grep foundation test** for `wine_designations` count assertions; if present, bump to the live value (probe first).
- [ ] **Step 2: Write `designation-members.test.mjs`** asserting via live DB: total members = 273 (or probed live total); per-system counts 61/27/85/16/33/51; St-Émilion tiers 2/12/71; every ESTATE has null `producer_id` and non-null `commune`; every Burgundy SITE has non-null `wine_place_id`; every Alsace SITE has null `wine_place_id`; all seeded members `PUBLISHED`; the 33 Burgundy member `wine_place_id`s equal the 33 `wine_place_designations` links for `burgundy-grand-cru` (drift guard).
- [ ] **Step 3: Run** — `node --test scripts/world-wine-map-foundation.test.mjs scripts/wine-place-context.test.mjs scripts/designation-members.test.mjs` → Expected: all green.
- [ ] **Step 4: Commit** — `git commit -m "test: designation members counts, tiers, linkage invariants"`

---

### Task 5: UI — Classifications section on the library page

**Files:**
- Modify: `src/app/knowledge/type-designations/page.tsx`

- [ ] **Step 1: Check Next docs** — read the relevant guide under `node_modules/next/dist/docs/` for server-component data fetching (modified Next).
- [ ] **Step 2: Add the query** (after the existing `type_designations` query): fetch `wine_designation_members` (PUBLISHED) joined to `wine_designations` (PUBLISHED) selecting member fields + `wine_designations(key,name,description,display_group,sort_order)`; fetch `wine_places(id,name,canonical_key)` for the SITE `wine_place_id`s (same pattern as `grapes/page.tsx:47-60`). Group in JS: `display_group` → system (by `sort_order`) → tier (by `tier_rank`) → members (by `sort_order`). Only systems with ≥1 member.
- [ ] **Step 3: Render the Classifications block** above the glossary cards: per system a `<details className="group ...">` styled as a Card, `id="classification-<key>"`, `scroll-mt-20`; `<summary>` shows system name + muted "N tiers · M members" + chevron (`group-open:rotate-180`); open body shows `description`, then each tier as a heading + count `Badge`, members in `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, each cell = name (medium) + commune (muted). SITE members with a resolved place render name as `<Link href={\`/knowledge/map?place=<canonical_key>\`}>`. Add a **Classifications** group at the top of the desktop side-nav jump list (`#classification-<key>`). Keep left-anchored (no `mx-auto`).
- [ ] **Step 4: Typecheck/build** — `npm run build` (or `npx tsc --noEmit`) → Expected: green.
- [ ] **Step 5: Commit** — `git commit -m "feat(knowledge): expandable classification members in Designation library"`

---

### Task 6: Verify & ship

- [ ] **Step 1:** Re-run all three test suites → green.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** `git status` — confirm only intended files staged/committed; `scripts/scratch-apply.mjs` still untracked (never committed).
- [ ] **Step 4:** `git push origin master` → triggers Vercel deploy.
- [ ] **Step 5:** Confirm deploy and spot-check `/knowledge/type-designations` (expand 1855 Médoc; a Burgundy GC deep-links to the map).

---

## Self-Review

- **Spec coverage:** table+RLS+PUBLISHED (T1), `display_group`/`sort_order`+`alsace-grand-cru` (T1), 189 estates (T2), Burgundy 33 + Alsace 51 (T3), tests incl. drift guard + count bump (T4), Classifications UI + side-nav + map links + left-anchored (T5), ship (T6). All spec sections mapped.
- **Placeholders:** data name-lists are compiled in-migration from fixed authoritative classifications with exact self-asserting counts (not forbidden "TBD" — the shape/counts are fully specified); St-Émilion 2022 is the accuracy watch-item.
- **Type consistency:** keys (`medoc-1855`, `sauternes-1855`, `saint-emilion-grand-cru-classe`, `graves-cru-classe`, `burgundy-grand-cru`, `alsace-grand-cru`), columns (`member_kind`, `tier_rank`, `producer_id`, `wine_place_id`, `display_group`), and tier ranks are consistent across tasks.
