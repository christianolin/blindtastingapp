# Progressive Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reveal a blind wine's answer one attribute at a time (Country → Region → Appellation → Grapes → Producer → Type designation → Vintage), scoring and moving the leaderboard per step, live for guided tastings and self-driven for self-paced ones — without ever leaking an unrevealed value to a client.

**Architecture:** A shared `wines.reveal_step` (guided) and a per-guess `guesses.reveal_step` (self-paced) drive progression. New SECURITY DEFINER RPCs advance one category at a time (`reveal_next_category`, `reveal_own_next_category`), scoring just that category; `is_revealed` stays false until fully revealed so existing RLS keeps the full answer hidden. A single spoiler-safe reader, `get_wine_reveal`, returns only categories `≤ reveal_step`. Supabase Realtime on `wines` pushes each step to all clients.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Supabase Postgres (plpgsql, RLS, Realtime), `@supabase/ssr`, `node:test` + `pg` for DB tests, Tailwind v4.

## Global Constraints

- **Spoiler invariant (verbatim):** an unrevealed attribute value must never reach any client — not in the DOM, accessible labels, tooltips, or API payloads. Revealed data flows only through `get_wine_reveal`, which returns strictly `≤ reveal_step`.
- **Migration discipline:** every live apply is dry-run in a rollback transaction first, carries fail-closed `raise exception` guards + same-transaction assertions, is version-collision-checked, and is verified independently post-apply ("version recorded" is never proof). RPCs use `create or replace`.
- **DB creds via process env only** (`DB_PASSWORD`, port 5432 for long ops); never commit or print credentials. Latest live migration version is `20260818099000`; new migrations use `2026081900xxxx`+ (collision-check before apply).
- **Reveal order (verbatim):** Country, Region, Appellation, Grapes (primary+secondary together), Producer, Type designation, Vintage. Skip a step whose answer column is null (appellation, secondary grape only affects display, producer, type designation, vintage).
- **Scope:** progressive applies to blind category-scored tastings only — Live+Guided (shared) and Self-paced/Free (per-participant). Semi-blind keeps all-at-once. Do not change scoring point values or reference IDs.
- **Point values (verbatim, from `reveal_wine`):** country 2, region 3, appellation 5, primary grape 8, secondary grape 2, producer 6, type designation 2, vintage 2/1/0 (exact / ±1 year / else; NV & TAWNY exact-only).

---

### Task 1: Schema migration — reveal_step columns + leaderboard_reveal enum

**Files:**
- Create: `supabase/migrations/20260819090000_progressive_reveal_schema.sql`
- Create: `scripts/progressive-reveal.test.mjs` (DB test harness, reused by later tasks)
- Modify: `src/lib/supabase/database.types.ts` (add columns to `wines`, `guesses`, `tastings` Insert/Row; add `WineLeaderboardReveal` type)

**Interfaces:**
- Produces: `wines.reveal_step smallint` (default 0), `guesses.reveal_step smallint` (default 0), `tastings.leaderboard_reveal` enum `wine_leaderboard_reveal` (`PER_ATTRIBUTE|PER_WINE`, default `PER_ATTRIBUTE`). A reusable `seedTasting()` test fixture returning `{ tastingId, hostParticipantId, p1, p2, wineId }`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260819090000_progressive_reveal_schema.sql`:

```sql
-- Progressive reveal: per-category reveal progression + a leaderboard-timing
-- toggle. reveal_step counts revealed in-play steps; is_revealed keeps meaning
-- "fully revealed". All additive; no scoring value or reference id changes.
create type wine_leaderboard_reveal as enum ('PER_ATTRIBUTE', 'PER_WINE');

alter table wines
  add column if not exists reveal_step smallint not null default 0;
alter table guesses
  add column if not exists reveal_step smallint not null default 0;
alter table tastings
  add column if not exists leaderboard_reveal wine_leaderboard_reveal
    not null default 'PER_ATTRIBUTE';

do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_name='wines' and column_name='reveal_step') then
    raise exception 'wines.reveal_step missing post-migration';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_name='guesses' and column_name='reveal_step') then
    raise exception 'guesses.reveal_step missing post-migration';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_name='tastings' and column_name='leaderboard_reveal') then
    raise exception 'tastings.leaderboard_reveal missing post-migration';
  end if;
end $$;
```

- [ ] **Step 2: Write the DB test harness + first test**

Create `scripts/progressive-reveal.test.mjs`. It connects with the pooler env pattern and rolls back every test. `seedTasting` builds a LIVE + BLIND + guided tasting with a host, two joined guessers, one wine with an answer (France/Bordeaux/Margaux/Cab-Sauv/Merlot/Ch.Margaux/GrandCruClasse/2020) and their two guesses (p1 perfect, p2 wrong region+producer):

```js
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");
const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

let sp = 0;
export async function withRollback(fn) {
  const name = `pr_${++sp}`;
  await client.query(`savepoint ${name}`);
  try { return await fn(); }
  finally {
    await client.query(`rollback to savepoint ${name}`);
    await client.query(`release savepoint ${name}`);
  }
}

// Real reference ids (exact-name lookups; France/Bordeaux exist live).
async function ref(table, name) {
  const { rows } = await client.query(`select id from ${table} where name=$1 limit 1`, [name]);
  assert.ok(rows[0], `${table} '${name}' missing`);
  return rows[0].id;
}

export async function seedTasting() {
  const host = (await client.query(
    `insert into tastings (name, host_id, timing_mode, wine_source, reveal_mode,
       status, sequential_guessing)
     values ('PR test', gen_random_uuid(), 'LIVE', 'HOST_PROVIDES', 'BLIND',
       'IN_PROGRESS', true) returning id, host_id`)).rows[0];
  const tastingId = host.id;
  const mk = async (uid) => (await client.query(
    `insert into tasting_participants (tasting_id, user_id, status)
     values ($1,$2,'JOINED') returning id`, [tastingId, uid])).rows[0].id;
  const hostParticipantId = await mk(host.host_id);
  const p1 = await mk(crypto.randomUUID());
  const p2 = await mk(crypto.randomUUID());
  const wineId = (await client.query(
    `insert into wines (tasting_id, position) values ($1, 1) returning id`,
    [tastingId])).rows[0].id;
  const country = await ref("countries", "France");
  const region = await ref("regions", "Bordeaux");
  const grapeCab = await ref("grapes", "Cabernet Sauvignon");
  const grapeMerlot = await ref("grapes", "Merlot");
  await client.query(
    `insert into wine_answers (wine_id, country_id, region_id, primary_grape_id,
       secondary_grape_id, vintage_kind, vintage_year)
     values ($1,$2,$3,$4,$5,'YEAR',2020)`,
    [wineId, country, region, grapeCab, grapeMerlot]);
  // p1 perfect, p2 wrong region + no secondary
  await client.query(
    `insert into guesses (wine_id, participant_id, country_id, region_id,
       primary_grape_id, secondary_grape_id, vintage_kind, vintage_year)
     values ($1,$2,$3,$4,$5,$6,'YEAR',2020)`,
    [wineId, p1, country, region, grapeCab, grapeMerlot]);
  const otherRegion = (await client.query(
    `select id from regions where name<>'Bordeaux' limit 1`)).rows[0].id;
  await client.query(
    `insert into guesses (wine_id, participant_id, country_id, region_id,
       primary_grape_id, vintage_kind, vintage_year)
     values ($1,$2,$3,$4,$5,'YEAR',2019)`,
    [wineId, p2, country, otherRegion, grapeCab]);
  return { tastingId, hostParticipantId, p1, p2, wineId, hostUserId: host.host_id };
}

before(async () => { await client.connect(); });
after(async () => { await client.end(); });
export { client };

test("schema: reveal_step + leaderboard_reveal exist with defaults", async () => {
  await withRollback(async () => {
    const { tastingId, wineId, p1 } = await seedTasting();
    const w = await client.query("select reveal_step from wines where id=$1", [wineId]);
    assert.equal(w.rows[0].reveal_step, 0);
    const g = await client.query(
      "select reveal_step from guesses where wine_id=$1 and participant_id=$2",
      [wineId, p1]);
    assert.equal(g.rows[0].reveal_step, 0);
    const t = await client.query("select leaderboard_reveal from tastings where id=$1", [tastingId]);
    assert.equal(t.rows[0].leaderboard_reveal, "PER_ATTRIBUTE");
  });
});
```

> **Fixture note (auth FKs):** if `tastings.host_id` / `tasting_participants.user_id` / `profiles.id` FK `auth.users`, the random-UUID inserts above will fail. First check the FK (`\d tastings`); if present, seed a throwaway auth user per test — `insert into auth.users (id, instance_id, aud, role, email) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', gen_random_uuid()||'@t.test') returning id` — and use those ids for `host_id`/`user_id` (and insert matching `profiles` rows if a profiles FK exists). Everything rolls back per savepoint.

- [ ] **Step 3: Dry-run the migration, then run the test RED (pre-apply)**

Run (PowerShell, creds set for the process):
```
node scripts/scratch-apply.mjs --file supabase/migrations/20260819090000_progressive_reveal_schema.sql --mode dry
```
Expected: `DRY-OK 20260819090000 progressive_reveal_schema`. (`scratch-apply.mjs` is the repo's dry/live applier; recreate it from the Champagne session if absent — see its git history.)

- [ ] **Step 4: Apply live, then run the test GREEN**

```
node scripts/scratch-apply.mjs --file supabase/migrations/20260819090000_progressive_reveal_schema.sql --mode live
node --test scripts/progressive-reveal.test.mjs
```
Expected: `LIVE-APPLIED …`; test `# pass 1`.

- [ ] **Step 5: Update `database.types.ts`**

In `src/lib/supabase/database.types.ts` add `reveal_step: number` to the `wines` Row and `reveal_step?: number` to its Insert; same for `guesses`; add `leaderboard_reveal: WineLeaderboardReveal` to `tastings` Row and optional in Insert; and `export type WineLeaderboardReveal = "PER_ATTRIBUTE" | "PER_WINE";` near the other enums (line 12-17 region).

- [ ] **Step 6: Verify + commit**

```
npx tsc --noEmit
git add supabase/migrations/20260819090000_progressive_reveal_schema.sql scripts/progressive-reveal.test.mjs src/lib/supabase/database.types.ts
git commit -m "feat(reveal): schema — reveal_step columns + leaderboard_reveal toggle"
```

---

### Task 2: `reveal_next_category` RPC (guided, shared)

**Files:**
- Create: `supabase/migrations/20260819093000_reveal_next_category.sql`
- Modify: `scripts/progressive-reveal.test.mjs` (add tests)

**Interfaces:**
- Consumes: `seedTasting()`, `wines.reveal_step`.
- Produces: `reveal_next_category(p_wine_id uuid, p_expected_step smallint) returns smallint` — advances one in-play step, scores that category for all guesses, sets `is_revealed` on the last step; returns the new step. A SQL helper `in_play_steps(wine_id) returns text[]` giving the ordered non-skipped step keys (`country, region, appellation?, grapes, producer?, type_designation?, vintage?`).

- [ ] **Step 1: Write the migration (helper + RPC)**

Create `supabase/migrations/20260819093000_reveal_next_category.sql`. The RPC mirrors `reveal_wine`'s per-category `case` expressions (Global Constraints point values) but writes only the one advancing category, recomputes `total_points` from the revealed columns, sets `scored_at = now()` on first advance, and flips `is_revealed` when the step reaches `array_length(in_play_steps)`:

```sql
create or replace function in_play_steps(p_wine_id uuid) returns text[]
language sql stable security definer set search_path=public as $$
  select array_remove(array[
    'country','region',
    case when a.appellation_id is not null then 'appellation' end,
    'grapes',
    case when a.producer_id is not null then 'producer' end,
    case when a.type_designation_id is not null then 'type_designation' end,
    case when a.vintage_kind is not null then 'vintage' end
  ], null)
  from wine_answers a where a.wine_id = p_wine_id;
$$;
grant execute on function in_play_steps(uuid) to authenticated;

create or replace function reveal_next_category(p_wine_id uuid, p_expected_step smallint)
returns smallint language plpgsql security definer set search_path=public as $$
declare
  v_ans wine_answers%rowtype; v_tasting uuid; v_contrib uuid;
  v_is_host boolean; v_status text; v_steps text[]; v_next text; v_new smallint;
begin
  select w.tasting_id, w.contributor_participant_id, t.host_id=auth.uid(), t.status
    into v_tasting, v_contrib, v_is_host, v_status
  from wines w join tastings t on t.id=w.tasting_id where w.id=p_wine_id;
  if v_tasting is null then raise exception 'Wine % not found', p_wine_id; end if;
  if v_status = 'CLOSED' then raise exception 'Tasting is finished'; end if;
  if not (v_is_host or v_contrib in
      (select id from tasting_participants where tasting_id=v_tasting and user_id=auth.uid()))
  then raise exception 'Only the host or the wine owner can reveal'; end if;

  select * into v_ans from wine_answers where wine_id=p_wine_id;
  if not found then raise exception 'No answer key for wine %', p_wine_id; end if;
  v_steps := in_play_steps(p_wine_id);

  -- Compare-and-set: no-op if someone already advanced past expected.
  update wines set reveal_step = reveal_step + 1
   where id=p_wine_id and reveal_step = p_expected_step
     and reveal_step < array_length(v_steps,1);
  if not found then
    return (select reveal_step from wines where id=p_wine_id);
  end if;
  select reveal_step into v_new from wines where id=p_wine_id;
  v_next := v_steps[v_new];  -- the step just revealed (1-based)

  -- Score only the advancing category for every guess on the wine.
  if v_next = 'country' then
    update guesses set country_points = case when country_id=v_ans.country_id then 2 else 0 end where wine_id=p_wine_id;
  elsif v_next = 'region' then
    update guesses set region_points = case when region_id=v_ans.region_id then 3 else 0 end where wine_id=p_wine_id;
  elsif v_next = 'appellation' then
    update guesses set appellation_points = case when appellation_id=v_ans.appellation_id then 5 else 0 end where wine_id=p_wine_id;
  elsif v_next = 'grapes' then
    update guesses set
      primary_grape_points = case when primary_grape_id=v_ans.primary_grape_id then 8 else 0 end,
      secondary_grape_points = case when v_ans.secondary_grape_id is null then null
        when secondary_grape_id=v_ans.secondary_grape_id then 2 else 0 end
      where wine_id=p_wine_id;
  elsif v_next = 'producer' then
    update guesses set producer_points = case when producer_id=v_ans.producer_id then 6 else 0 end where wine_id=p_wine_id;
  elsif v_next = 'type_designation' then
    update guesses set type_designation_points = case when type_designation_id=v_ans.type_designation_id then 2 else 0 end where wine_id=p_wine_id;
  elsif v_next = 'vintage' then
    update guesses set vintage_points = case
      when vintage_kind is null then 0
      when vintage_kind=v_ans.vintage_kind and vintage_kind='NV' then 2
      when vintage_kind=v_ans.vintage_kind and vintage_kind='TAWNY' and vintage_tawny_years=v_ans.vintage_tawny_years then 2
      when vintage_kind=v_ans.vintage_kind and vintage_kind='YEAR' and vintage_year=v_ans.vintage_year then 2
      when vintage_kind=v_ans.vintage_kind and vintage_kind='YEAR' and abs(vintage_year-v_ans.vintage_year)=1 then 1
      else 0 end where wine_id=p_wine_id;
  end if;

  update guesses set
    total_points = coalesce(country_points,0)+coalesce(region_points,0)
      +coalesce(appellation_points,0)+coalesce(primary_grape_points,0)
      +coalesce(secondary_grape_points,0)+coalesce(producer_points,0)
      +coalesce(type_designation_points,0)+coalesce(vintage_points,0),
    scored_at = coalesce(scored_at, now())
  where wine_id=p_wine_id;

  if v_new >= array_length(v_steps,1) then
    update wines set is_revealed=true where id=p_wine_id;
  end if;
  return v_new;
end $$;
grant execute on function reveal_next_category(uuid, smallint) to authenticated;
```

- [ ] **Step 2: Add tests (RED before apply)**

Append to `scripts/progressive-reveal.test.mjs`: a test that seeds, calls `reveal_next_category(wineId, 0)` as the host (set `select set_config('request.jwt.claim.sub', hostUserId, true)` so `auth.uid()` resolves — or `set local role`/`request.jwt.claims`), asserts step→1, `country_points` = 2 (p1) / 2 (p2, both France), `region_points` still null, `is_revealed=false`; a second call with `p_expected_step=0` is a no-op (still step 1 — idempotent); advancing through all in-play steps sets `is_revealed=true` and matches `reveal_wine`'s totals; and a non-host/non-owner call raises. (Use `set local "request.jwt.claims" = json_build_object('sub', <uuid>)::text` inside each `withRollback`.)

- [ ] **Step 3: Dry-run → run tests RED (function missing) → apply live → tests GREEN**

```
node scripts/scratch-apply.mjs --file supabase/migrations/20260819093000_reveal_next_category.sql --mode dry
node scripts/scratch-apply.mjs --file supabase/migrations/20260819093000_reveal_next_category.sql --mode live
node --test scripts/progressive-reveal.test.mjs
```
Expected: dry-OK; live-applied; all tests pass.

- [ ] **Step 4: Commit**

```
git add supabase/migrations/20260819093000_reveal_next_category.sql scripts/progressive-reveal.test.mjs
git commit -m "feat(reveal): reveal_next_category — guided per-attribute scoring with compare-and-set"
```

---

### Task 3: `reveal_own_next_category` RPC (self-paced, per-guess)

**Files:**
- Create: `supabase/migrations/20260819096000_reveal_own_next_category.sql`
- Modify: `scripts/progressive-reveal.test.mjs`

**Interfaces:**
- Produces: `reveal_own_next_category(p_wine_id uuid, p_expected_step smallint) returns smallint` — advances the caller's own `guesses.reveal_step`, scores only that guess's next in-play category, sets `scored_at` on completion; never touches `wines`.

- [ ] **Step 1: Write the migration** — same category `case` expressions as Task 2 but scoped to the caller's own guess (`participant_id in (select id from tasting_participants where tasting_id=v_tasting and user_id=auth.uid())`), compare-and-set on that guess's `reveal_step`, `is_revealed` untouched; on final in-play step set `scored_at=now()`. (Full plpgsql, structured like Task 2's body; the `update guesses … where wine_id=p_wine_id and participant_id=v_pid`.)

- [ ] **Step 2: Add tests** — seed a self-paced (`timing_mode='ASYNC'`) tasting; as p2 call `reveal_own_next_category(wineId,0)` → own `reveal_step=1`, own `country_points` set, p1's guess untouched, `wines.reveal_step=0`, `is_revealed=false`. Idempotent double-call. Cannot advance another participant's guess.

- [ ] **Step 3: Dry-run → RED → apply → GREEN → commit** (as Task 2 pattern; commit `feat(reveal): reveal_own_next_category — self-paced per-attribute`).

---

### Task 4: `get_wine_reveal` RPC (spoiler-safe read)

**Files:**
- Create: `supabase/migrations/20260819099000_get_wine_reveal.sql`
- Modify: `scripts/progressive-reveal.test.mjs`

**Interfaces:**
- Produces: `get_wine_reveal(p_wine_id uuid) returns jsonb` — `{ reveal_step, in_play_count, is_fully_revealed, steps: [{ key, correct:{...ids}, guesses:[{ participant_id, guessed:{...ids}, points }] }] }`, containing **only** steps `≤ reveal_step` (guided: `wines.reveal_step`; self-paced: caller's own `guesses.reveal_step`). Correct-value and guessed-value objects carry only the ids for revealed categories.

- [ ] **Step 1: Write the migration.** SECURITY DEFINER, `stable`. Guard: caller is host or a JOINED participant of the wine's tasting. Compute `v_step`: for guided (LIVE) use `wines.reveal_step`; else the caller's own `guesses.reveal_step`. Build `steps` from `in_play_steps(p_wine_id)` sliced to `v_step`, each carrying the answer's ids for that step and, per relevant guess (all guesses for guided; only caller's for self-paced), the guessed ids + the stored `*_points`. Emit ids only (names resolved client-side). Grant execute to `authenticated`.

- [ ] **Step 2: Spoiler-safety tests (the load-bearing ones).**
  - After `reveal_next_category(wineId,0)` (step 1 = country), `get_wine_reveal(wineId)` as p2 returns exactly one step (`country`) and **no** `region`/`producer`/`vintage` keys anywhere in the JSON; assert `JSON.stringify(result)` does not contain the answer's region id.
  - Self-paced: as p2, only p2's guess appears; p1 absent.
  - Guided at step 2 returns country+region for all participants.
  - A non-participant call raises / returns null.

- [ ] **Step 3: Dry-run → RED → apply → GREEN → commit** (`feat(reveal): get_wine_reveal — spoiler-safe progressive read`).

---

### Task 5: Skip-to-full alignment

**Files:**
- Create: `supabase/migrations/20260820090000_reveal_full_sets_step.sql`
- Modify: `scripts/progressive-reveal.test.mjs`

**Interfaces:**
- Consumes: existing `reveal_wine`, `score_own_guess`.
- Produces: `reveal_wine` also sets `wines.reveal_step = array_length(in_play_steps,1)`; `score_own_guess` sets the caller's `guesses.reveal_step` likewise — so "Reveal full answer" leaves `reveal_step` consistent with the fully-scored state.

- [ ] **Step 1: `create or replace`** both functions from their current live definitions (`20260807090000` for `reveal_wine`; `20260716140000` for `score_own_guess`) adding the one `reveal_step` update line each (guard: only bump when `>` current, so it's idempotent).
- [ ] **Step 2: Tests** — `reveal_wine` on a fresh wine sets `reveal_step` to the in-play count and `is_revealed`; calling `reveal_next_category` afterward is a no-op.
- [ ] **Step 3: Dry-run → RED → apply → GREEN → commit** (`fix(reveal): skip-to-full keeps reveal_step consistent`).

---

### Task 6: Realtime publication

**Files:**
- Create: `supabase/migrations/20260820093000_realtime_reveal.sql`
- Modify: `scripts/progressive-reveal.test.mjs`

- [ ] **Step 1: Migration** — `alter publication supabase_realtime add table wines;` and `… add table guesses;` each wrapped so a re-run is a no-op:
```sql
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='wines')
  then alter publication supabase_realtime add table wines; end if;
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='guesses')
  then alter publication supabase_realtime add table guesses; end if;
end $$;
```
- [ ] **Step 2: Test** — assert both tables are members of `supabase_realtime` in `pg_publication_tables`.
- [ ] **Step 3: Dry-run → RED → apply → GREEN → commit** (`feat(reveal): add wines+guesses to realtime publication`).

---

### Task 7: Leaderboard honours partial reveals + the toggle

**Files:**
- Modify: `src/lib/tasting-leaderboard.ts`
- Modify: `src/app/tastings/[id]/play/play-experience.tsx` (inline leaderboard block)
- Modify: `scripts/progressive-reveal.test.mjs` (SQL-level assertion of the counting rule)

**Interfaces:**
- Consumes: `wines.reveal_step`, `guesses.reveal_step`, `tastings.leaderboard_reveal`.
- Produces: `getTastingLeaderboard` counts a guess's `total_points` when the wine is *countable*: `PER_WINE` ⇒ `wines.is_revealed`; `PER_ATTRIBUTE` ⇒ `wines.reveal_step > 0` (guided) or that guess's `reveal_step > 0` (self-paced).

- [ ] **Step 1: Write the failing test** — seed, `reveal_next_category(wineId,0)` (1 category, not full). With `leaderboard_reveal='PER_ATTRIBUTE'` the running total includes the country points; set it to `'PER_WINE'` and the same wine contributes 0 until `is_revealed`. Assert against a small SQL replication of the rule (the lib mirrors it).
- [ ] **Step 2: Fetch `leaderboard_reveal` + `reveal_step`** in `getTastingLeaderboard` (it already loads wines and guesses; add the columns) and filter `revealedWineIds`/point-summing by the countable rule above.
- [ ] **Step 3: Mirror the rule** in `play-experience.tsx`'s inline `leaderboard` IIFE (currently keys off `w.is_revealed`; add the `PER_ATTRIBUTE`/`reveal_step` branch, reading `tasting.leaderboard_reveal`).
- [ ] **Step 4: Run test GREEN + `npx tsc --noEmit` + `npx next build`; commit** (`feat(reveal): leaderboard counts partial reveals per the toggle`).

---

### Task 8: `leaderboard_reveal` setting in the create form + host menu

**Files:**
- Modify: `src/app/tastings/new/new-tasting-form.tsx`, `src/app/tastings/new/actions.ts`
- Modify: `src/app/tastings/[id]/host-controls.tsx`, `src/app/tastings/[id]/actions.ts`

**Interfaces:**
- Produces: create-form writes `leaderboard_reveal`; a host-menu control (draft only) updates it via a new `setLeaderboardReveal` action mirroring `setSequentialGuessing`.

- [ ] **Step 1:** Add a `leaderboard_reveal` `<Select>` (Per attribute / Per wine) shown only for Blind tastings in `new-tasting-form.tsx`; read + insert it in `createTasting` (default `PER_ATTRIBUTE`).
- [ ] **Step 2:** Add `setLeaderboardReveal(prev, formData)` to `[id]/actions.ts` (host-only, DRAFT-only, `.update({ leaderboard_reveal })`), and a toggle in `host-controls.tsx` `surface="menu"` draft branch (mirror the Flow toggle).
- [ ] **Step 3:** `npx tsc --noEmit && npx next build`; commit (`feat(reveal): leaderboard-reveal setting in create form + host menu`).

---

### Task 9: `RevealSync` realtime client (replaces AutoRefresh on live)

**Files:**
- Create: `src/components/reveal-sync.tsx`
- Modify: `src/app/tastings/[id]/play/play-experience.tsx` (swap `<AutoRefresh/>` for `<RevealSync tastingId=… />` when timing is LIVE)

**Interfaces:**
- Consumes: `wines`/`guesses` realtime publication.
- Produces: a `"use client"` component that subscribes via `createClient()` (browser Supabase) to `postgres_changes` on `wines` filtered `tasting_id=eq.<id>` and on `guesses` (unfiltered, filtered client-side by wine belonging to the tasting is unnecessary — `router.refresh()` is idempotent), calling `router.refresh()` (debounced ~150ms) on any event; unsubscribes on unmount.

- [ ] **Step 1: Write the component:**
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RevealSync({ tastingId }: { tastingId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (t) clearTimeout(t); t = setTimeout(() => router.refresh(), 150); };
    const channel = supabase
      .channel(`reveal:${tastingId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "wines", filter: `tasting_id=eq.${tastingId}` }, refresh)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "guesses" }, refresh)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(channel); };
  }, [tastingId, router]);
  return null;
}
```
- [ ] **Step 2:** In `play-experience.tsx`, render `{tasting.timing_mode === "LIVE" ? <RevealSync tastingId={tastingId} /> : <AutoRefresh />}` in place of the current `<AutoRefresh />` (keep AutoRefresh for async).
- [ ] **Step 3:** `npx tsc --noEmit && npx next build`; commit (`feat(reveal): realtime RevealSync for live tastings`). Manual check noted: two browsers, host advances a step → guest updates without manual refresh.

---

### Task 10: Progressive reveal UI + host/self reveal controls

**Files:**
- Modify: `src/app/tastings/[id]/play/play-experience.tsx` (in-progress wine rendering + controls)
- Modify: `src/app/tastings/[id]/play/reveal-button.tsx` (progressive host control) or Create: `src/app/tastings/[id]/play/reveal-controls.tsx`
- Create: `src/app/tastings/[id]/play/reveal-actions.ts` (server actions wrapping the RPCs)
- Modify: `src/lib/wine-label` or PlayExperience helpers for progressive identity

**Interfaces:**
- Consumes: `get_wine_reveal`, `reveal_next_category`, `reveal_own_next_category`, `reveal_wine`/`score_own_guess`.
- Produces: for an unrevealed-but-in-progress wine (`reveal_step > 0` guided, or own `reveal_step > 0` self-paced) the card renders progressive state instead of the guess form.

- [ ] **Step 1: Server actions** in `reveal-actions.ts`: `revealNextCategory(prev, formData)` → validates wine→tasting, `supabase.rpc("reveal_next_category", { p_wine_id, p_expected_step })`, `revalidatePath`; `revealOwnNextCategory` likewise; both return `{ error }|null`. (Mirror `revealWine` in `play/actions.ts`.)
- [ ] **Step 2: Fetch progressive data** in `PlayExperience`: for each wine that is in-progress (not fully revealed but `reveal_step>0` shared, or own guess `reveal_step>0`), call `supabase.rpc("get_wine_reveal", { p_wine_id: wine.id })`; do **not** read `wine_answers` for those wines. Resolve returned ids to names with the maps already built (`nameById`, `lookupAppellationAndProducerNames`).
- [ ] **Step 3: Extend `AttributeSheet`** to accept a `concealedAfter` count / an array of rows where unrevealed rows render the neutral `Hidden` placeholder (label only), plus a `cumulative` header (`X / Y points so far`) and a progressively-built identity string from revealed steps only.
- [ ] **Step 4: Reveal controls** — host (guided): a primary button labelled `Reveal <next step name>` posting `revealNextCategory` with `p_expected_step = reveal_step`, and a secondary `Reveal full answer` posting `revealWine`; disabled until all eligible have guessed (reuse the existing readiness computation). Self-paced: same two actions posting the `own` variants. Wire keyboard/focus (native `<button>` gives this).
- [ ] **Step 5: Completed state** — when `is_fully_revealed`, keep the full `AttributeSheet` result sheet (Task's redesign already renders this once `resolved && answer`); ensure the transition from progressive → full is seamless (both use `AttributeSheet`).
- [ ] **Step 6: Verify** `npx tsc --noEmit && npx eslint … && npx next build`; **manual**: guided run reveals country→…→vintage with points landing per step and the leaderboard moving; self-paced participant reveals their own; unrevealed values absent from the network payloads (inspect the `get_wine_reveal` response). Commit (`feat(reveal): progressive reveal UI + host/self controls`).

- [ ] **Step 7: Update `.superpowers/sdd/progress.md`** with the shipped feature; **do not** commit progress.md (gitignored).

---

## Post-plan notes

- **Owner gate:** progressive reveal changes live scoring behaviour — after Task 10, demo a guided run + a self-paced run before considering it done.
- **No tile/map involvement.** No reference-id or point-value changes (foundation/context suites unaffected, but run them once after Task 5 to confirm).
