# Cellar Inventory Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Ship the Cellar pillar's inventory core — a `cellar_lots` table with owner-only RLS + an `add_cellar_lot` RPC, and the `/cellar` UI (Bottles + My notes tabs, add, edit/adjust/delete).

**Architecture:** `cellar_lots` (a purchase lot with a live `quantity`) references the shared `catalog_wines` identity. Adding a lot reuses the P5 catalog find-or-create (`add_cellar_lot` wraps `find_or_create_catalog_wine` + insert). `/cellar` reclaims the route from the P3 catalog redirects and gets its own `layout.tsx` header, mirroring `/catalog`.

**Tech Stack:** Next.js 16 (App Router; `params`/`searchParams` are Promises — `await` them), Supabase Postgres + RLS, `node --test` DB suites on the pooled DB via `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`, hand-maintained `src/lib/supabase/database.types.ts`.

## Global Constraints
- Migrations apply with `node scripts/scratch-apply.mjs --file <path> --mode dry|live` (env `DB_PASSWORD` set in the shell). Next migration number: **`20260829241000`**.
- No emojis. Money is `numeric(10,2)`; `currency` is ISO-4217 text with **no conversion** in this sub-project.
- Owner-only RLS: no cross-user reads. No `visibility` column yet (social sub-project adds it).
- Reuse existing helpers: `find_or_create_catalog_wine(p jsonb)`, `search_catalog_wines(text,int)`, `set_updated_at()` trigger fn, `catalogWineTitle()` in `src/lib/wset/queries.ts`, the `reference-combobox` used by `catalog/new/new-wine-form.tsx`.
- **Community (People/Friends → `/community`) is a SEPARATE change, not in this plan.** This plan adds only the **Cellar** nav entry; the label stays "Friends" until the Community change.
- Each task ends green: DB tasks `node --test` passing; UI tasks `npx tsc --noEmit` clean (clear `.next` first if it pins a stale route type). Then commit + push.

---

### Task 1: Migration — `cellar_lots` + `profiles.preferred_currency` + `add_cellar_lot` RPC + RLS (TDD)

**Files:**
- Create: `supabase/migrations/20260829241000_cellar_inventory_core.sql`
- Create: `scripts/cellar.test.mjs`

**Produces (later tasks consume):** table `cellar_lots` (columns per §2.1 of the spec); RPC `add_cellar_lot(p jsonb) returns uuid` where `p` carries the `find_or_create_catalog_wine` identity keys **plus** lot keys `quantity, bottle_size_ml, price_per_bottle, currency, purchased_on, purchase_source, drink_from, drink_to, storage_location, lot_note` and optional `catalog_wine_id` (skips find-or-create when present).

- [ ] **Step 1: Write the migration SQL** — `supabase/migrations/20260829241000_cellar_inventory_core.sql`:

```sql
-- Cellar inventory core: per-user bottle lots over the shared catalog identity.
alter table profiles add column if not exists preferred_currency text not null default 'DKK';

create table if not exists cellar_lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  catalog_wine_id uuid not null references catalog_wines(id) on delete restrict,
  bottle_size_ml int not null default 750 check (bottle_size_ml > 0),
  quantity int not null check (quantity >= 0),
  purchased_quantity int not null check (purchased_quantity >= 1),
  price_per_bottle numeric(10,2) check (price_per_bottle >= 0),
  currency text not null default 'DKK',
  purchased_on date,
  purchase_source text,
  drink_from int,
  drink_to int,
  storage_location text,
  lot_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cellar_lots_drink_window
    check (drink_from is null or drink_to is null or drink_to >= drink_from)
);

create index if not exists cellar_lots_owner_idx on cellar_lots (owner_id);
create index if not exists cellar_lots_wine_idx on cellar_lots (catalog_wine_id);

drop trigger if exists cellar_lots_set_updated_at on cellar_lots;
create trigger cellar_lots_set_updated_at before update on cellar_lots
  for each row execute function set_updated_at();

alter table cellar_lots enable row level security;
drop policy if exists "cellar own select" on cellar_lots;
create policy "cellar own select" on cellar_lots for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists "cellar own insert" on cellar_lots;
create policy "cellar own insert" on cellar_lots for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "cellar own update" on cellar_lots;
create policy "cellar own update" on cellar_lots for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "cellar own delete" on cellar_lots;
create policy "cellar own delete" on cellar_lots for delete to authenticated
  using (owner_id = auth.uid());

-- add_cellar_lot: resolve/create the catalog identity, insert a lot for the caller.
-- SECURITY INVOKER so auth.uid() is the caller and RLS applies to both writes.
create or replace function add_cellar_lot(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_wine uuid;
  v_qty int := coalesce((p->>'quantity')::int, 1);
  v_currency text;
  v_lot uuid;
begin
  v_wine := nullif(p->>'catalog_wine_id','')::uuid;
  if v_wine is null then
    v_wine := find_or_create_catalog_wine(p);
  end if;
  select coalesce(nullif(p->>'currency',''), preferred_currency, 'DKK')
    into v_currency from profiles where id = auth.uid();
  insert into cellar_lots (
    owner_id, catalog_wine_id, bottle_size_ml, quantity, purchased_quantity,
    price_per_bottle, currency, purchased_on, purchase_source,
    drink_from, drink_to, storage_location, lot_note
  ) values (
    auth.uid(), v_wine, coalesce((p->>'bottle_size_ml')::int, 750),
    v_qty, v_qty,
    nullif(p->>'price_per_bottle','')::numeric, coalesce(v_currency, 'DKK'),
    nullif(p->>'purchased_on','')::date, nullif(p->>'purchase_source',''),
    nullif(p->>'drink_from','')::int, nullif(p->>'drink_to','')::int,
    nullif(p->>'storage_location',''), nullif(p->>'lot_note','')
  ) returning id into v_lot;
  return v_lot;
end $$;
grant execute on function add_cellar_lot(jsonb) to authenticated;

do $$
begin
  if to_regclass('public.cellar_lots') is null then
    raise exception 'final-state: cellar_lots missing'; end if;
  if not exists (select 1 from information_schema.columns
    where table_name='profiles' and column_name='preferred_currency') then
    raise exception 'final-state: profiles.preferred_currency missing'; end if;
  if (select count(*) from pg_policies where tablename='cellar_lots') <> 4 then
    raise exception 'final-state: expected 4 cellar_lots policies'; end if;
  if not exists (select 1 from pg_proc where proname='add_cellar_lot') then
    raise exception 'final-state: add_cellar_lot missing'; end if;
end $$;
```

- [ ] **Step 2: Write `scripts/cellar.test.mjs`** — mirror `scripts/wset-notes.test.mjs`: `pgConfig()`, `withRollback`, `set local role authenticated`, and `set_config('request.jwt.claims', …)` to drive `auth.uid()`. `reset role` before switching users.

```js
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());
before(async () => { await client.connect(); });
after(async () => { await client.end(); });

async function withRollback(cb) {
  await client.query("begin");
  try { return await cb(); } finally { await client.query("rollback"); }
}
async function asUser(id) {
  await client.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: id, role: "authenticated" })]);
  await client.query("set local role authenticated");
}
async function twoProfiles() {
  const r = await client.query("select id from profiles order by id limit 2");
  assert.equal(r.rowCount, 2, "need 2 profiles");
  return [r.rows[0].id, r.rows[1].id];
}
async function identity() {
  const pick = async (t) => (await client.query(`select id from ${t} order by id limit 1`)).rows[0].id;
  return {
    country_id: await pick("countries"), region_id: await pick("regions"),
    appellation_id: await pick("appellations"), primary_grape_id: await pick("grapes"),
    producer_id: await pick("producers"), vintage_kind: "YEAR", vintage_year: 2019,
    colour: "RED", style: "STILL", wine_name: "CellarTest " + Math.random(),
  };
}

test("add_cellar_lot creates lot under caller with profile currency", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await client.query("update profiles set preferred_currency='EUR' where id=$1", [a]);
    await asUser(a);
    const p = { ...(await identity()), quantity: 6, bottle_size_ml: 750 };
    const { rows } = await client.query("select add_cellar_lot($1::jsonb) id", [JSON.stringify(p)]);
    const lot = (await client.query("select * from cellar_lots where id=$1", [rows[0].id])).rows[0];
    assert.equal(lot.owner_id, a);
    assert.equal(lot.quantity, 6);
    assert.equal(lot.purchased_quantity, 6);
    assert.equal(lot.bottle_size_ml, 750);
    assert.equal(lot.currency, "EUR");
  });
});

test("owner CRUD; other user cannot see or mutate", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    await asUser(a);
    const id = (await client.query("select add_cellar_lot($1::jsonb) id",
      [JSON.stringify({ ...(await identity()), quantity: 3 })])).rows[0].id;
    assert.equal((await client.query("select count(*)::int n from cellar_lots where id=$1", [id])).rows[0].n, 1);
    await client.query("reset role");
    await asUser(b);
    assert.equal((await client.query("select count(*)::int n from cellar_lots where id=$1", [id])).rows[0].n, 0);
    assert.equal((await client.query("update cellar_lots set quantity=1 where id=$1", [id])).rowCount, 0);
    assert.equal((await client.query("delete from cellar_lots where id=$1", [id])).rowCount, 0);
  });
});

test("find_or_create dedups: two lots, one catalog identity", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const p = { ...(await identity()), quantity: 1 };
    const l1 = (await client.query("select add_cellar_lot($1::jsonb) id", [JSON.stringify(p)])).rows[0].id;
    const l2 = (await client.query("select add_cellar_lot($1::jsonb) id", [JSON.stringify(p)])).rows[0].id;
    const w = await client.query("select distinct catalog_wine_id from cellar_lots where id = any($1)", [[l1, l2]]);
    assert.equal(w.rowCount, 1);
  });
});

test("checks reject bad quantity and drink window", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const id = (await client.query("select add_cellar_lot($1::jsonb) id",
      [JSON.stringify({ ...(await identity()), quantity: 1 })])).rows[0].id;
    const cwid = (await client.query("select catalog_wine_id from cellar_lots where id=$1", [id])).rows[0].catalog_wine_id;
    await assert.rejects(client.query(
      "insert into cellar_lots (owner_id,catalog_wine_id,quantity,purchased_quantity) values ($1,$2,-1,1)", [a, cwid]));
    await assert.rejects(client.query(
      "insert into cellar_lots (owner_id,catalog_wine_id,quantity,purchased_quantity,drink_from,drink_to) values ($1,$2,1,1,2030,2020)", [a, cwid]));
  });
});
```

- [ ] **Step 3: Run test — must FAIL** (no table): `$env:DB_PASSWORD='…'; node --test scripts/cellar.test.mjs` → "relation cellar_lots does not exist".
- [ ] **Step 4: Dry-run then live-apply**: `node scripts/scratch-apply.mjs --file supabase/migrations/20260829241000_cellar_inventory_core.sql --mode dry` (expect `DRY-OK`), then `--mode live` (expect `LIVE-APPLIED`).
- [ ] **Step 5: Run test — must PASS**: `node --test scripts/cellar.test.mjs` → all green.
- [ ] **Step 6: Commit** `feat(cellar): cellar_lots table, RLS, add_cellar_lot RPC (inventory core)`.

---

### Task 2: Types — `database.types.ts`

**Files:** Modify `src/lib/supabase/database.types.ts`

The repo hand-maintains this file. Add:
- A `cellar_lots` `Row`/`Insert`/`Update` block under `Tables` (mirror an existing table's shape). Required in Insert: `owner_id`, `catalog_wine_id`, `quantity`, `purchased_quantity`; optional (defaults/nullable): `bottle_size_ml`, `currency`, `price_per_bottle`, `purchased_on`, `purchase_source`, `drink_from`, `drink_to`, `storage_location`, `lot_note`, `id`, `created_at`, `updated_at`.
- `profiles` Row/Insert/Update gain `preferred_currency: string` (optional in Insert/Update).
- Under `Functions`: `add_cellar_lot: { Args: { p: Json }; Returns: string }`.

- [ ] Step 1: add the three edits above.
- [ ] Step 2: `npx tsc --noEmit` → clean.
- [ ] Step 3: Commit `feat(cellar): database types for cellar_lots + add_cellar_lot`.

---

### Task 3: `/cellar` reclaim — layout, nav, Bottles + My-notes page

**Files:**
- Modify `next.config.ts` — remove the two `/cellar` → `/catalog` redirects (keep `/dashboard` → `/taste`); update the comment to note `/cellar` is now the Cellar pillar.
- Modify `src/components/nav-links.ts` — insert `{ href: "/cellar", label: "Cellar", match: ["/cellar"] }` after the Catalog entry. Order becomes Taste · Catalog · Cellar · Knowledge · Friends (Community rename is separate).
- Create `src/app/cellar/layout.tsx` — copy `src/app/catalog/layout.tsx` (an `<AppHeader/>` wrapper); update its comment.
- Create `src/app/cellar/page.tsx` — server component, two Link-tabs modeled on `src/app/people/page.tsx` (`searchParams: Promise<{ tab?: string }>`, `tab === "notes"` selects My notes).
- Create `src/app/cellar/bottles-list.tsx` and `src/app/cellar/my-notes-list.tsx` — presentational lists.

**Details:**
- **Bottles tab:** `supabase.from("cellar_lots").select("id, bottle_size_ml, quantity, price_per_bottle, currency, drink_from, drink_to, storage_location, catalog_wine_id, catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, style, producer:producers(name), appellation:appellations(name))")` — RLS auto-scopes to the owner. Group rows by `catalog_wine_id`, title via `catalogWineTitle(...)`. Summary bar: total bottles `= Σ quantity`, distinct wines `= unique catalog_wine_id`, total value `= Σ quantity·price_per_bottle` over lots whose `currency` equals the user's `preferred_currency` (note any excluded). "Add wine" → `/cellar/new`; empty state nudges to add.
- **My notes tab:** `supabase.from("wset_notes").select("id, tasted_on, quality_score, context_kind, catalog_wine_id, catalog_wines(...title fields)").eq("author_id", user.id).order("tasted_on", { ascending: false })`. Rows show title, point score, date, context chip; link to `/catalog/[catalog_wine_id]/notes/[id]`.
- [ ] Steps: build files → `npx tsc --noEmit` clean → manual: `/cellar` lists lots, `?tab=notes` shows notes, old `/cellar` no longer redirects → Commit `feat(cellar): /cellar pillar with Bottles + My notes`.

### Task 4: `/cellar/new` — catalog-first add + lot fields

**Files:**
- Create `src/app/cellar/new/page.tsx` — load reference data exactly like `src/app/catalog/new/page.tsx` (countries, regions, grapes, type_designations) **plus** the user's `preferred_currency`; render the form.
- Create `src/app/cellar/new/cellar-lot-form.tsx` — client. Identity section reuses the `reference-combobox` fields from `src/app/catalog/new/new-wine-form.tsx` (country/region/appellation/grape/producer, colour/style/vintage/wine_name); add a "search existing wine" box calling `search_catalog_wines` (mirror `src/app/tastings/[id]/wines/new/`), which on pick sets `catalog_wine_id` and hides the identity fields; then lot fields: `quantity` (default 1), `bottle_size_ml` (default 750), `price_per_bottle`, `currency` (default = preferred), `purchased_on`, `purchase_source`, `drink_from`, `drink_to`, `storage_location`, `lot_note`.
- Create `src/app/cellar/new/actions.ts` — `addCellarLot(input)` builds the `p` jsonb (identity keys + `catalog_wine_id?` + lot keys) and calls `supabase.rpc("add_cellar_lot", { p })`; on success `redirect("/cellar")`.

**Interfaces — consumes:** RPC `add_cellar_lot` (Task 1). `p` keys per Task 1 "Produces".
- [ ] Steps: build files → `npx tsc --noEmit` clean → manual: add via new identity + via searched existing → both land in `/cellar`, no duplicate catalog row → Commit `feat(cellar): add-to-cellar (catalog-first) form`.

### Task 5: `/cellar/[lotId]/edit` — edit / adjust count / delete

**Files:**
- Create `src/app/cellar/[lotId]/edit/page.tsx` — `params: Promise<{ lotId: string }>`; load the lot (`select … , catalog_wines(...)`); RLS returns nothing if not the owner → `redirect("/cellar")` when absent. Show the (fixed, non-editable) wine title + editable lot fields.
- Create `src/app/cellar/[lotId]/edit/edit-lot-form.tsx` — client. Edit the lot fields (same set as Task 4 minus identity) via `supabase.from("cellar_lots").update({...}).eq("id", lotId)`; a Delete button `supabase.from("cellar_lots").delete().eq("id", lotId)`; both under RLS; on success `redirect("/cellar")` / `router.push("/cellar")`.

- [ ] Steps: build files → `npx tsc --noEmit` clean → manual: change count, edit fields, delete → reflected in `/cellar` → Commit `feat(cellar): edit / adjust / delete a lot`.

---

## Out of scope (later sub-projects, each its own spec)
Drinking a bottle + linking to a note (drink+notes); value/spend/drink-window graphs (stats); CellarTracker CSV import (import); viewing others' cellars + `visibility` (social); the People/Friends → `/community` rename.

## Self-review
- **Spec coverage:** §2.1 table → Task 1; §2.2 preferred_currency → Task 1; §2.3 RLS → Task 1; §3 add flow/RPC → Tasks 1+4; §4.1 routes → Tasks 3–5; §4.2 tabs → Task 3; §4.3 nav → Task 3; §5 tests → Task 1 (DB) + tsc per UI task. All covered.
- **Types:** `add_cellar_lot(p jsonb)`/`p` keys consistent across Tasks 1, 2, 4; `cellar_lots` columns identical in migration, types, and queries.
