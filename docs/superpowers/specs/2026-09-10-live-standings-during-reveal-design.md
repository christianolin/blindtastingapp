# Live standings during progressive reveal

**Date:** 2026-09-10
**Status:** Approved (approach A)

## Problem

During a live tasting the host reveals a wine one category at a time. Each
reveal is visible to every participant, but the standings do not move for
anyone except the viewer: **you see your own points climb; everyone else's stay
frozen** until the wine is fully revealed.

The intended experience is the opposite — watching the bracket shuffle as each
category lands is the point of a progressive reveal.

## Root cause

This is not a presentation problem, and not a scoring problem. The scoring
already drips correctly:

- `reveal_next_category` scores exactly one category per step and then
  recomputes `total_points` as the sum of the per-category columns. Unrevealed
  categories are `NULL`, so `total_points` is always "points from revealed
  categories only".
- The `PER_ATTRIBUTE` leaderboard mode already counts a guess from the first
  reveal step, and it is the column default.
- `RevealSync` subscribes to Realtime on `wines` and `guesses` (both are in the
  `supabase_realtime` publication) and calls `router.refresh()`, which
  re-renders every server component on the route — including `StandingsPanel`.

The break is RLS. `getTastingLeaderboard` queries `guesses` **directly**, under
the viewer's own session. The `guesses read` SELECT policy admits a row only
when one of these holds:

1. the row is the viewer's own guess, or
2. the wine is **fully** revealed (`wines.is_revealed`), or
3. the viewer is the tasting host.

There is no clause for a *partially* revealed wine. So mid-reveal a normal
participant can read exactly one row — their own — and the leaderboard sums
only that. The host sees everyone (clause 3), and everyone sees everyone once
the wine finishes (clause 2), which is why the bug looks intermittent.

The progressive reveal panel that *does* show other people's guesses reads
`get_wine_reveal`, which is `SECURITY DEFINER` and therefore bypasses the
policy. That is the pattern this design follows.

## Rejected: widening the RLS policy

The one-line fix is to add "or the wine is partially revealed" to the policy.
It is wrong. The policy governs the whole row, so it would expose
`country_id`, `region_id`, `appellation_id`, `primary_grape_id` and the rest —
including for categories **not yet revealed**, and while guessing may still be
open. That trades a scoreboard bug for a cheating vector.

A restricted `guesses_leaderboard` view was also considered. It is narrower,
but it publishes the full per-person, per-wine grid for every wine at once, and
it does so through RLS on a view, which is easy to get subtly wrong on a later
edit. A definer function with a fixed, minimal column list is the tighter
surface.

## Design

### `get_tasting_leaderboard(p_tasting_id uuid)`

A new `STABLE SECURITY DEFINER` function returning one row per participant, and
**points totals only** — no **unrevealed** value ever crosses the boundary.

That is deliberately not the stronger claim "no per-wine figure crosses it":
`last_round_points` *is* a single participant's points on a single wine. It is
benign, and the reason is worth stating rather than assuming. `total_points`
sums matched categories that have **already been revealed** — unrevealed
category columns are null — so the figure cannot disclose whether someone has
matched a category the host has not yet turned over. And it is derivable from
successive `total` deltas anyway, so it adds no disclosure over the running
total the board already shows. The four columns below are the whole contract:
adding a fifth is where a real leak would enter, so any future addition needs
this same argument made afresh.

```
RETURNS TABLE (
  participant_id     uuid,
  total              integer,
  wines_scored       integer,
  last_round_points  integer
)
```

It mirrors `tasting_guess_status`, which is the existing precedent for a
tasting-scoped definer aggregate: `LANGUAGE sql`/`plpgsql`, `STABLE SECURITY
DEFINER`, `SET search_path TO 'public'`, and an authorization guard of
`is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id)`.
Callers who are neither get no rows.

**Countability** reproduces today's TypeScript rule exactly, so behaviour is
unchanged for every mode other than the broken one:

| mode | a guess counts when |
| --- | --- |
| `PER_WINE` | `wines.is_revealed` |
| `PER_ATTRIBUTE`, `timing_mode = 'LIVE'` | `wines.reveal_step > 0` |
| `PER_ATTRIBUTE`, self-paced | that guess's own `guesses.reveal_step > 0` |

`total` sums `total_points` over countable guesses. Because `total_points` is
already revealed-categories-only, the per-category drip needs no new
arithmetic.

`last_round_points` is the participant's points on **their own** most recently
scored countable wine — the greatest `scored_at` among that participant's
countable guesses — or NULL if they have none. It is scoped per participant,
not globally: in a `LIVE` tasting everyone is on the same wine so the two are
the same, but in a self-paced tasting a global pick would show "+0 last round"
to anyone who has not yet reached whichever wine some other participant scored
most recently.

### `getTastingLeaderboard` becomes a wrapper

`src/lib/tasting-leaderboard.ts` keeps its exported signature and
`LeaderboardRow` shape, so neither consumer changes. Internally it:

- calls the RPC for `total`, `winesScored`, `lastRoundPoints`;
- keeps the profile join and the `totalWines` / own-bottle arithmetic in
  TypeScript, since `wines` and `tasting_participants` are readable under RLS
  and that math needs no elevated rights.

This keeps the definer surface as small as it can be: elevated rights are used
for the one thing that requires them and nothing else.

`Functions` in `src/lib/supabase/database.types.ts` gains an entry for the new
RPC, matching the existing hand-maintained style.

### Consumers

Unchanged. `StandingsPanel` (tasting page) and the `!embedded` leaderboard in
`play-experience.tsx` both call `getTastingLeaderboard` and keep working.

### Realtime

Unchanged. `RevealSync` already refreshes on every `wines.reveal_step` change,
which fires on every reveal step. Participants do not receive Realtime events
for other people's `guesses` rows — Realtime honours RLS — but they do not need
to: the `wines` event drives the refresh, and the refreshed server render then
reads the full picture through the RPC.

## Verification

There is no database test harness in this repo — vitest runs `environment:
node` over `src/**/*.test.ts`, and every other database invariant here is
asserted inside its migration. This section is scoped to what can actually run,
rather than describing a harness that would have to be built first.

1. **Migration guards** (run at apply time, same pattern as the Portugal and
   Italy waves):
   - the new function exists and `prosecdef` is true — a definer function that
     silently lands as invoker would reintroduce the bug with no other symptom;
   - the `guesses` SELECT policy still has exactly its three existing clauses.
     This is the tripwire: it fails loudly if someone later "simplifies" the
     fix by widening the policy, which is the one change that would turn this
     into a cheating vector.

2. **Unit tests** (vitest) for whatever pure logic remains in the wrapper —
   the `totalWines` minus own-bottles arithmetic, which has a real edge case in
   bring-your-own tastings where a participant contributed more than one wine.
   The countability rule itself moves into SQL and is covered by (3).

3. **Manual verification against a real tasting**, recorded in the PR. As a
   non-host participant, with a wine at `reveal_step > 0` and
   `is_revealed = false`:
   - `get_tasting_leaderboard` returns a non-zero total for *another*
     participant;
   - `select * from guesses` for that other participant still returns nothing.

   The second assertion is the one that matters. If a DB test harness is added
   later, this is the first case that should move into it.

## Out of scope

**Animation.** Once this lands the standings will genuinely climb category by
category, but they will do it instantly and silently — `StandingsPanel` is a
server component, so a 5 becomes an 8 between renders with no tween, no row
re-order, no `+3`. Ticking counters and sliding rows are a deliberate
follow-up, to be judged after seeing whether the plain version already feels
good enough.

**Scoring changes.** Point values, categories and the reveal order are
untouched.

## Rollout

One migration (the function) plus the TypeScript wrapper and types entry.
No tiles run. No boundary or map data is involved.
