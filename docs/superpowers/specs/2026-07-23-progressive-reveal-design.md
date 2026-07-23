# Progressive Reveal — design

Date: 2026-07-23
Status: **approved** (owner brainstorm 2026-07-23; scope, sync, and leaderboard-toggle decisions confirmed)
Predecessors: tasting-flow UX (guided/free, active-wine spotlight, live leaderboard); tasting-page redesign v1 (header, navigator, 70/30, `AttributeSheet`); owner spec `Downloads/blind-tasting-result-page-redesign(1).md` §4, §12, §19.

## Objective

Turn the reveal from a single all-at-once event into a paced, attribute-by-attribute
reveal that creates a shared moment for discussion, scoring, and leaderboard
movement. Reveal the correct answer one category at a time — Country → Region →
Appellation → Grapes → Producer → Type designation → Vintage — marking each
participant correct/incorrect/unanswered, awarding that category's points
immediately, and moving the standings, until the wine is fully revealed.

The absolute invariant: **an unrevealed attribute value must never reach any
client** — not in the DOM, accessible labels, tooltips, or API payloads.

## Current architecture (what we're changing)

- `reveal_wine(p_wine_id)` (SECURITY DEFINER) is the single scoring path: it
  computes **all** per-category point columns for **every** guess on the wine and
  flips `wines.is_revealed = true`, atomically. Host-only, or any participant
  once everyone eligible has guessed (auto-reveal), or the contributor.
- `guesses` carries per-category point columns (`country_points` … `vintage_points`),
  `total_points`, `scored_at`.
- RLS opens `wine_answers` and other participants' `guesses` **only once
  `wines.is_revealed`** (or the host, the contributor, or a caller whose own
  guess was scored via `has_scored_guess`).
- `score_own_guess(p_wine_id)` scores just the caller's guess (async IMMEDIATE).
- The UI polls with `AutoRefresh` (interval `router.refresh()`); the tasting
  page server-renders `wine_answers` + `guesses` directly through RLS.

The all-at-once `reveal_wine` and the "open everything when `is_revealed`" RLS are
exactly what progressive reveal must replace/bypass without leaking.

## Scope

**Progressive reveal applies to (blind, category-scored tastings):**
- **Live + Guided** — the host (or the wine's contributor) advances one shared,
  attribute-by-attribute reveal for the current wine; every participant sees each
  step live.
- **Self-paced with immediate reveal (and Free)** — after submitting, each
  participant reveals **their own** answer step by step, independent of others.
  The IMMEDIATE async policy becomes progressive; AFTER_ALL keeps its
  wait-then-global-reveal (below).

**Unchanged (no progressive reveal):**
- **Semi-blind** — match-based, no per-category scoring, so there are no attributes
  to sequence; keeps the current all-at-once reveal.
- **AFTER_ALL async** global auto-reveal still fires once everyone has guessed a
  wine (then the wine is simply fully revealed).

## Reveal sequence

Canonical ordered **steps** (each maps to one or two point columns):

1. Country
2. Region
3. Appellation — skipped when `answer.appellation_id is null`
4. Grapes — primary **and** secondary revealed together (secondary omitted from
   display when `answer.secondary_grape_id is null`; the step exists whenever the
   primary grape is scored, i.e. always)
5. Producer — skipped when `answer.producer_id is null`
6. Type designation — skipped when `answer.type_designation_id is null`
7. Vintage — skipped when `answer.vintage_kind is null`

The **in-play step list** for a wine is derived deterministically from
`wine_answers` (dropping skipped steps). `reveal_step` counts how many in-play
steps have been revealed; when `reveal_step = length(in-play list)` the wine is
fully revealed.

## Data model (additive migrations)

- `wines.reveal_step smallint not null default 0` — the **shared** Guided/Live
  progression. `is_revealed` remains, now meaning "fully revealed" (set true when
  the last in-play step is revealed, or by skip-to-full).
- `guesses.reveal_step smallint not null default 0` — each participant's **own**
  progression (Self-paced/Free).
- `tastings.leaderboard_reveal` enum `wine_leaderboard_reveal` =
  `PER_ATTRIBUTE | PER_WINE`, default `PER_ATTRIBUTE`.

`total_points` accumulates as categories are scored (revealed-so-far sum); the
leaderboard decides whether a not-fully-revealed wine counts (per the toggle),
so no separate "partial total" column is needed.

## RPCs

All SECURITY DEFINER, `search_path = public`, guarded internally.

- **`reveal_next_category(p_wine_id uuid, p_expected_step smallint)`** — Guided.
  - Auth: tasting host **or** the wine's contributor. Tasting must be Live +
    Blind + `sequential_guessing` (guided) and not CLOSED.
  - **Compare-and-set**: `update wines set reveal_step = reveal_step + 1 where
    id = p_wine_id and reveal_step = p_expected_step` — 0 rows ⇒ someone already
    advanced ⇒ no-op, return the current step (idempotent against double taps).
  - Scores exactly the newly-revealed step's category(ies) for **all** guesses on
    the wine (same point rules as `reveal_wine`), recomputes `total_points` from
    the revealed columns, sets `scored_at = now()` on first advance (locks the
    guess). On the final in-play step sets `is_revealed = true`.
  - Returns the new `reveal_step`.
- **`reveal_own_next_category(p_wine_id uuid, p_expected_step smallint)`** —
  Self-paced/Free.
  - Auth + compare-and-set on the **caller's own** `guesses.reveal_step`. Scores
    only that guess's next in-play category; sets `scored_at` on completion. Does
    **not** touch `wines.is_revealed`.
- **`reveal_wine` / `score_own_guess`** (existing) — reused as **"Reveal full
  answer"** (skip to end): score all remaining categories and set
  `reveal_step = length(in-play)` (+ `is_revealed` for the shared one).
- **`get_wine_reveal(p_wine_id uuid) returns jsonb`** — the **spoiler-safe read**.
  - Returns `{ reveal_step, in_play_count, is_fully_revealed, steps: [...] }` where
    `steps` contains **only** categories `≤ reveal_step`. Each step carries the
    correct value **id(s)** plus, per participant (Guided) or the caller only
    (Self-paced): guessed id(s) + points.
  - Unrevealed categories are **omitted entirely** — never serialized. The client
    resolves the returned (revealed) ids to names via the reference maps it
    already loads (safe: only revealed ids are ever sent).
  - Grant execute to `authenticated`; internal guard: caller must be a JOINED
    participant (or host) of the wine's tasting.

## Spoiler-safety & RLS

- During progression `wines.is_revealed` stays **false**, so the existing
  `wine_answers read` and `guesses read` policies keep the full answer and other
  participants' guesses hidden. The full answer never reaches a client.
- **All** revealed data flows only through `get_wine_reveal`, which returns
  strictly `≤ reveal_step`. This is the single channel; the server component stops
  reading `wine_answers`/others' `guesses` directly for an in-progress wine.
- The caller's own `guesses` row stays readable, but only exposes the caller's own
  guessed values (never the answer) and the caller's own points for **revealed**
  categories (unrevealed category points remain null/uncomputed). No leak.
- No RLS change is required for correctness; a follow-up may tighten `guesses`
  read so other participants can't see a peer's *unrevealed-category* null points
  early — not a leak (nulls), but noted.

## Realtime

- Migration: add `wines` (and `guesses`) to the `supabase_realtime` publication.
- New client component `RevealSync` (mounted on live tastings) subscribes to
  `postgres_changes` on `wines` filtered by `tasting_id`; on any `reveal_step` /
  `is_revealed` update it re-fetches `get_wine_reveal` + the leaderboard (or calls
  `router.refresh()`), replacing `AutoRefresh` for live tastings. Realtime honors
  RLS, so only the safe `reveal_step` counter is broadcast.
- Reconnection: on (re)subscribe the component re-reads current state via
  `get_wine_reveal`, so a rejoining participant resumes at the current step.
- Self-paced own actions refresh locally (the actor already knows); no broadcast
  needed for their private progression.

## Leaderboard

`getTastingLeaderboard` (and the inline live leaderboard) count a wine's points:
- `PER_ATTRIBUTE`: as soon as the relevant reveal has started (`wines.reveal_step
  > 0` for Guided; the participant's `guesses.reveal_step > 0` for Self-paced) —
  animated per step.
- `PER_WINE`: only once fully revealed (`is_revealed`, or the participant's guess
  `scored_at` at completion).
Standings only ever reflect revealed-category points, so they can't spoil an
unrevealed wine.

## UI / components

Reuse the redesign's `AttributeSheet`, extended for progression:
- Render revealed rows + a neutral **concealed placeholder** for each upcoming
  step; a cumulative **"X / Y points so far"**; a **progressively-built identity**
  (`France` → `Bordeaux · France` → `Margaux AOP · Bordeaux · France` → `Château
  Margaux 2024`) built only from public attributes.
- Host controls: primary **"Reveal `<next category>`"** (label names the upcoming
  attribute) + secondary **"Reveal full answer"** (skip; confirm if others are
  mid-reveal). Keyboard-activatable, visible focus, disabled until the submission
  condition is met.
- Self-paced: the same **Reveal next / Reveal full** for the participant's own
  answer.
- Leaderboard animates changed totals per the toggle (restrained; never celebrate
  a wrong answer; colour always paired with icon+text).
- Completed state: final score replaces "so far", full identity, permanent result
  sheet, next-wine action.

## Mode interactions

- **Host-provides + Guided**: host advances the shared reveal; the host doesn't
  compete.
- **BYO + Guided**: the wine's contributor advances the shared reveal for their
  bottle; everyone else sees it live.
- **Self-paced (IMMEDIATE)**: submitting no longer full-scores instantly; the
  participant reveals their own answer step by step. **AFTER_ALL** still globally
  reveals a wine once all have guessed (then fully shown).
- **Free**: per-participant progression on whichever wine they're reviewing;
  standings show only spoiler-safe changes.
- **Semi-blind**: unchanged (all-at-once).

## Concurrency, reconnection, audit

- Idempotency via compare-and-set on `reveal_step` (Guided) / the caller's
  `guesses.reveal_step` (Self-paced); duplicate reveal commands converge.
- Reconnecting clients resume at the server's current step (`get_wine_reveal`).
- Host answer correction after a reveal (existing `wine_answers` update): re-score
  affected revealed categories, update totals/standings, mark a correction (no
  reveal celebration). Audit log of administrative score changes is **out of scope
  for v1** (noted).

## Out of scope (v1)

- Websocket presence / typing indicators; audit-history UI for score edits.
- Progressive reveal for semi-blind.
- Alternative reveal sequences for custom rulesets.
- Host-defined discussion pauses/prompts between steps.
- Per-attribute "why these points" scoring-rule popovers (spec §6 progressive
  disclosure) — later enhancement.

## Verification / testing

- **RPC unit tests** (pg): step advances in order; skipped categories (null
  answer) are omitted; compare-and-set makes a double call a no-op; final step
  sets `is_revealed`; `reveal_own_next_category` only touches the caller's guess;
  scoring matches `reveal_wine` category-by-category.
- **Spoiler-safety tests**: `get_wine_reveal` never returns a category `>
  reveal_step`; `wine_answers`/others' guesses remain unreadable while
  `is_revealed=false`; a non-host/non-owner cannot advance.
- **Leaderboard tests**: `PER_ATTRIBUTE` counts partials, `PER_WINE` doesn't;
  self-paced counts the participant's own revealed points only.
- **Foundation/context suites** stay green (no scoring-id or reference change).
- **App**: `world → wine → progressive reveal → next wine` path; reconnection
  resumes; unrevealed values absent from payloads (inspect `get_wine_reveal`).

## Migration discipline (repo standard)

Every live apply: dry-run in a rollback transaction first; fail-closed
`raise exception` guards; **same-transaction assertions** + independent post-apply
verification (the twin-applier rule); scratch-apply pattern; version-collision
check; suites green before and after. RPC changes are `create or replace` with the
prior definition preserved in history.

## Decisions resolved (owner, 2026-07-23)

1. Scope: **Live+Guided and Self-paced** progressive (not guided-only).
2. Sync: **Supabase Realtime** (not poll-only).
3. Leaderboard timing: **per-attribute vs per-wine toggle**, default per-attribute.
4. Grapes reveal **together** as one step.
5. Self-paced progressive **replaces the IMMEDIATE** async experience; AFTER_ALL
   unchanged.
6. Free-flow uses the self-paced per-participant progression.
