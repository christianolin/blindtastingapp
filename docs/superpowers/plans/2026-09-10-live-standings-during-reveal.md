# Live Standings During Progressive Reveal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During a live tasting, every participant's points climb category by category as the host reveals — not just the viewer's own.

**Architecture:** The scoring already drips correctly; the break is that `getTastingLeaderboard` reads `guesses` directly under the viewer's session, and the `guesses` SELECT policy has no clause for a *partially* revealed wine. Add a `SECURITY DEFINER` RPC that returns per-participant **aggregates only**, and make `getTastingLeaderboard` a thin wrapper over it. No RLS policy is changed; the migration asserts it wasn't.

**Tech Stack:** Next.js 16 server components, Supabase (Postgres + RLS), plpgsql/SQL functions, vitest.

## Global Constraints

- **Never widen the `guesses` SELECT policy.** The whole row would become readable, including `country_id`/`region_id`/`appellation_id` for *unrevealed* categories. Task 2 adds a guard that fails the migration if the policy ever references `reveal_step`.
- **The RPC returns aggregates only** — `participant_id`, `total`, `wines_scored`, `last_round_points`. No guessed value, and no per-wine breakdown, ever crosses the boundary.
- **No animation.** Ticking counters, row-slide transitions and `+N` badges are explicitly out of scope (owner: "plain version first — no need for fanfare, can be too much too").
- **No behaviour change in any other mode.** The countability rule in SQL must reproduce today's TypeScript rule exactly.
- Migrations are applied with `node .tiles-build/apply-migration.mjs <VERSION> <NAME>` (dry-run, then apply + track). No supabase CLI.
- Never push to `master`. Feature branch; the owner opens the PR.
- No tiles run — this touches no boundary or map data.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/tasting-leaderboard-math.ts` *(new)* | Pure, dependency-free arithmetic extracted from the wrapper so it can be unit-tested. Currently just own-bottle counting. |
| `src/lib/tasting-leaderboard-math.test.ts` *(new)* | vitest coverage for the above, including the multi-contribution edge case. |
| `supabase/migrations/20260905100000_tasting_leaderboard_rpc.sql` *(new)* | Creates `get_tasting_leaderboard`, grants execute, and asserts both the definer flag and that the `guesses` policy was not widened. |
| `src/lib/tasting-leaderboard.ts` *(modify)* | Becomes a thin wrapper: calls the RPC for scores, keeps the profile join and out-of arithmetic. Exported signature and `LeaderboardRow` shape unchanged. |
| `src/lib/supabase/database.types.ts` *(modify)* | Adds the `get_tasting_leaderboard` entry to the hand-maintained `Functions` block. |

Consumers (`standings-panel.tsx`, `play-experience.tsx`) are deliberately untouched.

---

### Task 1: Extract and test the out-of arithmetic

Pure logic first, with no database involved. `src/lib/tasting-leaderboard.ts` imports `@/lib/supabase/server`, which pulls in `next/headers` and cannot be imported from a node-environment vitest run — so the testable logic moves to its own dependency-free module. This mirrors `src/lib/wine-map/deep-link.ts`, which was extracted for exactly this reason.

**Files:**
- Create: `src/lib/tasting-leaderboard-math.ts`
- Test: `src/lib/tasting-leaderboard-math.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ownWineCounts(wines: { contributor_participant_id: string | null }[]): Map<string, number>` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tasting-leaderboard-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ownWineCounts } from "./tasting-leaderboard-math";

describe("ownWineCounts", () => {
  it("returns an empty map when nobody contributed a bottle", () => {
    const counts = ownWineCounts([
      { contributor_participant_id: null },
      { contributor_participant_id: null },
    ]);
    expect(counts.size).toBe(0);
  });

  it("counts one bottle per contributor", () => {
    const counts = ownWineCounts([
      { contributor_participant_id: "a" },
      { contributor_participant_id: "b" },
    ]);
    expect(counts.get("a")).toBe(1);
    expect(counts.get("b")).toBe(1);
  });

  // The edge case worth having: in bring-your-own tastings a participant can
  // bring more than one bottle, and their "out of" must drop by all of them.
  it("accumulates when one participant contributed several bottles", () => {
    const counts = ownWineCounts([
      { contributor_participant_id: "a" },
      { contributor_participant_id: "a" },
      { contributor_participant_id: "a" },
      { contributor_participant_id: "b" },
      { contributor_participant_id: null },
    ]);
    expect(counts.get("a")).toBe(3);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("ignores nulls mixed in with contributors", () => {
    const counts = ownWineCounts([
      { contributor_participant_id: null },
      { contributor_participant_id: "a" },
      { contributor_participant_id: null },
    ]);
    expect(counts.get("a")).toBe(1);
    expect(counts.has("null")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/tasting-leaderboard-math.test.ts`
Expected: FAIL — cannot resolve `./tasting-leaderboard-math`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/tasting-leaderboard-math.ts`:

```ts
// Pure leaderboard arithmetic, kept free of any Supabase or Next import so it
// can be unit-tested in vitest's node environment. The scoring rules
// themselves live in the get_tasting_leaderboard RPC, because they need
// elevated rights to see other participants' guesses.

/**
 * How many bottles each participant contributed, keyed by participant id.
 * In bring-your-own tastings you never guess your own bottle, so a
 * participant's "out of" total is the wine count minus this.
 */
export function ownWineCounts(
  wines: { contributor_participant_id: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const wine of wines) {
    const id = wine.contributor_participant_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tasting-leaderboard-math.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasting-leaderboard-math.ts src/lib/tasting-leaderboard-math.test.ts
git commit -m "Extract the leaderboard out-of arithmetic so it can be tested"
```

---

### Task 2: The `get_tasting_leaderboard` RPC

**Files:**
- Create: `supabase/migrations/20260905100000_tasting_leaderboard_rpc.sql`

**Interfaces:**
- Consumes: existing `is_tasting_host(uuid)` and `is_tasting_participant(uuid)` helpers (both `STABLE SECURITY DEFINER`, returning boolean).
- Produces: `public.get_tasting_leaderboard(p_tasting_id uuid)` returning `TABLE(participant_id uuid, total integer, wines_scored integer, last_round_points integer)` — used by Task 3.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260905100000_tasting_leaderboard_rpc.sql`:

```sql
-- Live standings during a progressive reveal.
--
-- THE BUG. getTastingLeaderboard reads `guesses` directly under the viewer's
-- own session. The `guesses read` SELECT policy admits a row only when it is
-- the viewer's own guess, the wine is FULLY revealed, or the viewer is the
-- host. There is no clause for a partially revealed wine, so mid-reveal a
-- participant can read exactly one row -- their own -- and the leaderboard
-- sums only that. You watch your own points climb while everyone else sits
-- frozen until the wine finishes.
--
-- THE FIX, and why it is not a policy change. Widening the policy would make
-- the whole guess row readable, including country_id / region_id /
-- appellation_id for categories NOT yet revealed, while guessing may still be
-- open -- a cheating vector in place of a scoreboard bug. Instead this adds a
-- SECURITY DEFINER aggregate that returns totals only: no guessed value, and
-- no per-wine breakdown, ever crosses the boundary. It is the same pattern
-- get_wine_reveal already uses to drive the reveal panel, with the
-- authorization guard from tasting_guess_status.

begin;

create or replace function public.get_tasting_leaderboard(p_tasting_id uuid)
returns table (
  participant_id uuid,
  total integer,
  wines_scored integer,
  last_round_points integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with t as (
    select
      timing_mode::text as timing_mode,
      coalesce(leaderboard_reveal::text, 'PER_ATTRIBUTE') as leaderboard_reveal
    from tastings
    where id = p_tasting_id
  ),
  -- Reproduces the countability rule the TypeScript used, unchanged:
  --   PER_WINE      -> only once the wine is fully revealed
  --   PER_ATTRIBUTE -> from the first reveal step; the shared wine step when
  --                    guided (LIVE), else this guess's own step.
  -- total_points is already the sum of revealed categories only (unrevealed
  -- category columns are null), so the per-category drip needs no new maths.
  countable as (
    select
      g.participant_id,
      g.wine_id,
      coalesce(g.total_points, 0) as pts,
      g.scored_at
    from guesses g
    join wines w on w.id = g.wine_id
    cross join t
    where w.tasting_id = p_tasting_id
      and (
        w.is_revealed
        or (
          t.leaderboard_reveal <> 'PER_WINE'
          and case
                when t.timing_mode = 'LIVE' then coalesce(w.reveal_step, 0) > 0
                else coalesce(g.reveal_step, 0) > 0
              end
        )
      )
  ),
  last_round as (
    select wine_id
    from countable
    where scored_at is not null
    order by scored_at desc
    limit 1
  )
  select
    p.id,
    coalesce(sum(c.pts), 0)::int,
    count(c.wine_id)::int,
    case
      when exists (select 1 from last_round)
        then coalesce(
          sum(c.pts) filter (where c.wine_id = (select wine_id from last_round)),
          0)::int
      else null
    end
  from tasting_participants p
  left join countable c on c.participant_id = p.id
  where p.tasting_id = p_tasting_id
    -- Anyone who is neither host nor participant gets no rows at all.
    and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
  group by p.id;
$function$;

grant execute on function public.get_tasting_leaderboard(uuid) to authenticated;

do $$
declare
  v_secdef boolean;
  v_qual text;
begin
  select prosecdef into v_secdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_tasting_leaderboard';
  if v_secdef is null then
    raise exception 'get_tasting_leaderboard was not created';
  end if;
  -- A definer function that quietly lands as invoker reintroduces the exact
  -- bug this migration exists to fix, with no other visible symptom.
  if not v_secdef then
    raise exception 'get_tasting_leaderboard is not SECURITY DEFINER';
  end if;

  select qual::text into v_qual
  from pg_policies
  where tablename = 'guesses' and policyname = 'guesses read';
  if v_qual is null then
    raise exception 'the guesses read policy is missing';
  end if;
  -- Tripwire. The tempting "simplification" of this fix is to widen the
  -- SELECT policy to admit partially revealed wines, which would expose every
  -- unrevealed guessed value. Any such rewrite has to reference reveal_step.
  if v_qual like '%reveal_step%' then
    raise exception
      'the guesses SELECT policy now references reveal_step: partially revealed guesses are readable, which leaks unrevealed answers';
  end if;
  if v_qual not like '%is_revealed%' then
    raise exception 'the guesses SELECT policy no longer gates on is_revealed';
  end if;
end $$;

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `node .tiles-build/apply-migration.mjs 20260905100000 tasting_leaderboard_rpc`
Expected: `DRY-RUN ok (assertions passed, rolled back).` then `APPLIED + tracked`.

If the dry-run fails on the tripwire, stop — it means the policy has already been widened elsewhere and that must be understood before continuing.

- [ ] **Step 3: Verify the RPC agrees with the current TypeScript**

The RPC must not change any total that already worked. Run this against the existing tastings and confirm the totals match what the app shows today for a *host* viewer (the host could always see everyone, so their view is the correct reference):

```bash
node -e "
const {Client}=require('pg');const fs=require('fs');
const url=fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.*)\$/m)[1].trim().replace(/^[\"']|[\"']\$/g,'');
(async()=>{const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});await c.connect();
const ts=(await c.query(\"select id, name from tastings order by created_at desc limit 3\")).rows;
for(const t of ts){
  console.log('===', t.name, t.id);
  // Service-role connection bypasses RLS, so this is the ground truth the
  // definer function should reproduce.
  console.table((await c.query(\`
    select g.participant_id, sum(coalesce(g.total_points,0))::int total, count(*)::int scored
    from guesses g join wines w on w.id=g.wine_id
    where w.tasting_id=\$1 and (w.is_revealed or coalesce(w.reveal_step,0)>0)
    group by 1 order by 2 desc\`,[t.id])).rows);
}
await c.end()})().catch(e=>{console.error(e.message);process.exit(1)});
"
```

Expected: for each tasting, a total per participant. Record these numbers — Task 3 compares against them.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260905100000_tasting_leaderboard_rpc.sql
git commit -m "Add get_tasting_leaderboard, a definer aggregate that does not leak guesses"
```

---

### Task 3: Rewire `getTastingLeaderboard` onto the RPC

**Files:**
- Modify: `src/lib/tasting-leaderboard.ts` (whole body of `getTastingLeaderboard`)
- Modify: `src/lib/supabase/database.types.ts` (the `Functions` block, near `get_wine_reveal` at ~line 1367)

**Interfaces:**
- Consumes: `ownWineCounts` from Task 1; `get_tasting_leaderboard` from Task 2.
- Produces: `getTastingLeaderboard(tastingId: string): Promise<LeaderboardRow[]>` — unchanged signature and row shape, so `StandingsPanel` and `play-experience.tsx` need no edits.

- [ ] **Step 1: Add the RPC to the generated types**

In `src/lib/supabase/database.types.ts`, inside `Functions:`, immediately before the existing `get_wine_reveal` entry, add:

```ts
      get_tasting_leaderboard: {
        Args: { p_tasting_id: string };
        Returns: {
          participant_id: string;
          total: number;
          wines_scored: number;
          last_round_points: number | null;
        }[];
      };
```

- [ ] **Step 2: Replace the body of `getTastingLeaderboard`**

In `src/lib/tasting-leaderboard.ts`, keep the imports, the `LeaderboardRow` type and the doc comment's intent, and replace the function body. The new file body after the type declaration:

```ts
import { createClient } from "@/lib/supabase/server";
import { ownWineCounts } from "@/lib/tasting-leaderboard-math";

export type LeaderboardRow = {
  participantId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  total: number;
  winesScored: number;
  totalWines: number;
  lastRoundPoints: number | null;
};

// Shared by the results page and the standings panel.
//
// Scores come from the get_tasting_leaderboard RPC rather than from a direct
// read of `guesses`, and that is load-bearing. The guesses SELECT policy only
// admits your own row until a wine is FULLY revealed, so a direct read made
// every other player's total sit frozen through a progressive reveal while
// your own climbed. The RPC is SECURITY DEFINER and returns aggregates only —
// no guessed value crosses the boundary, so nothing unrevealed leaks.
//
// The profile join and the out-of arithmetic stay here: `wines` and
// `tasting_participants` are readable under RLS, so they need no elevated
// rights, and the definer surface stays as small as it can be.
export async function getTastingLeaderboard(
  tastingId: string,
): Promise<LeaderboardRow[]> {
  const supabase = await createClient();

  const [{ data: participants }, { data: wines }, { data: scores }] =
    await Promise.all([
      supabase
        .from("tasting_participants")
        .select("id, user_id")
        .eq("tasting_id", tastingId),
      supabase
        .from("wines")
        .select("contributor_participant_id")
        .eq("tasting_id", tastingId),
      supabase.rpc("get_tasting_leaderboard", { p_tasting_id: tastingId }),
    ]);

  const userIds = (participants ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const totalWines = (wines ?? []).length;
  const ownWines = ownWineCounts(wines ?? []);
  const scoreByParticipantId = new Map(
    (scores ?? []).map((s) => [s.participant_id, s]),
  );

  return (participants ?? [])
    .map((p) => {
      const profile = profileByUserId.get(p.user_id);
      const score = scoreByParticipantId.get(p.id);
      return {
        participantId: p.id,
        userId: p.user_id,
        name: profile?.display_name ?? "Unknown",
        avatarUrl: profile?.avatar_url ?? null,
        total: score?.total ?? 0,
        winesScored: score?.wines_scored ?? 0,
        totalWines: totalWines - (ownWines.get(p.id) ?? 0),
        lastRoundPoints: score?.last_round_points ?? null,
      };
    })
    .sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx eslint src/lib/tasting-leaderboard.ts src/lib/tasting-leaderboard-math.ts`
Expected: clean.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all pass, including Task 1's four new tests.

Run: `node --test scripts/wine-map-tiles/lib.test.mjs`
Expected: 26 pass, 0 fail (unrelated, but confirms nothing global broke).

- [ ] **Step 5: Verify the totals are unchanged**

Compare against the numbers recorded in Task 2 Step 3 — the RPC must reproduce them exactly:

```bash
node -e "
const {Client}=require('pg');const fs=require('fs');
const url=fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.*)\$/m)[1].trim().replace(/^[\"']|[\"']\$/g,'');
(async()=>{const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});await c.connect();
const ts=(await c.query(\"select id, name from tastings order by created_at desc limit 3\")).rows;
for(const t of ts){
  console.log('===', t.name);
  console.table((await c.query('select * from get_tasting_leaderboard(\$1) order by total desc',[t.id])).rows);
}
await c.end()})().catch(e=>{console.error(e.message);process.exit(1)});
"
```

Expected: totals identical to Task 2 Step 3. A service-role connection satisfies the host/participant guard differently from a real session, so this checks the arithmetic, not the authorization — authorization is checked in Step 6.

- [ ] **Step 6: Manual verification in the running app (the one that matters)**

Start the dev server and, in a live tasting with at least two participants and a wine at `reveal_step > 0` but not fully revealed, signed in as a **non-host participant**:

1. The standings show a non-zero total for *another* participant, and it increases as the host advances each category.
2. In the browser console, confirm the raw table is still protected:

```js
const { data, error } = await window.supabase
  .from("guesses").select("*").neq("participant_id", MY_PARTICIPANT_ID);
console.log(data, error);
```

Expected: an empty array. **If this returns rows, stop** — the leak this design exists to prevent is present.

Record both results in the PR description.

- [ ] **Step 7: Commit and push**

```bash
git add src/lib/tasting-leaderboard.ts src/lib/supabase/database.types.ts
git commit -m "Read standings through the definer RPC so every player's points move live"
git push -u origin live-standings-during-reveal
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| `get_tasting_leaderboard` definer RPC, aggregates only | Task 2 |
| Guard: `is_tasting_host` or `is_tasting_participant` | Task 2, in the RPC's `where` |
| Countability table reproduced exactly | Task 2, `countable` CTE |
| `last_round_points` keeps its null-when-absent semantics | Task 2, `case when exists (select 1 from last_round)` |
| `getTastingLeaderboard` keeps signature and row shape | Task 3 Step 2 |
| Profile join and out-of maths stay in TypeScript | Task 3 Step 2 |
| `database.types.ts` entry | Task 3 Step 1 |
| Consumers unchanged | No task — verified by `tsc` in Task 3 Step 3 |
| Realtime unchanged | No task — `RevealSync` already fires on `wines.reveal_step` |
| Migration guard: definer flag | Task 2, `do $$` block |
| Migration guard: policy not widened | Task 2, `do $$` block |
| Unit test for out-of arithmetic | Task 1 |
| Manual security verification | Task 3 Step 6 |
| No animation | Global Constraints |

No gaps.

**Placeholders:** none — every step carries its actual code or command.

**Type consistency:** `ownWineCounts` is defined in Task 1 and consumed in Task 3 Step 2 under the same name and signature. The RPC's four columns (`participant_id`, `total`, `wines_scored`, `last_round_points`) are declared identically in Task 2's `returns table`, Task 3 Step 1's `Returns` type and Task 3 Step 2's field reads. `LeaderboardRow` is unchanged from the current file.
