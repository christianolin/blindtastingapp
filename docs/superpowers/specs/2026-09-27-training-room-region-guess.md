# Training room — guess at the depth you are sure of (design addendum)

Date 2026-09-27. Extends `docs/superpowers/specs/2026-09-25-training-room-design.md`
(live since 2cd2d53; D1–D22 there still hold unless changed here). Base: master at
eb14ffd, branch `training-region-guess`.

## 1. Goal

Owner, verbatim: "maybe it would make sense to group wines within region or something in
the training room. Right now premier cru and grand cru chablis are separate guesses for
example. It makes sense, but maybe you could either guess just bourgogne or go deeper —
does that make sense". Then, choosing among options: **"Region + grape"** — a guess that
stops at the region may add a grape.

So: the candidate list groups the typical wines by region, and "Your call" lets the
taster stop at the region (optionally naming a grape) or go deeper to a typical wine.
Going deeper is a bet: it pays more when right and costs nothing extra when close
(a wrong sibling already keeps country, region and grape).

## 2. Decisions

- **R1 Group by scoring region.** A group is one `regions` row (`TrainingCandidate.region`,
  with its country). Groups carry the region name and country ("Bourgogne, France"); a
  region with one typical wine is still a group of one.
- **R2 Group closeness = its best member.** A group's number is the highest closeness among
  its uncapped members; a group whose members are all capped is itself capped (under
  "Unlikely from what you've said", closeness = its best capped member). Groups sort by
  that number (nulls after numbers, then alphabetically by country then region), exactly
  like wines do today (§5.8 of the base spec). Members inside a group keep the existing
  wine order. The matcher itself is unchanged.
- **R3 The candidate list shows groups.** Laptop column and phone sheet: the top 5 groups
  (the rest behind "Show all N regions"), each a row with the region, its country, the
  best member's short name ("best: Chablis Premier Cru") and the group's closeness bar.
  Tapping a group row expands it in place to its typical wines (the current wine rows,
  explanation line and all, tapping a wine opens its detail as today). The top group
  starts expanded. Before any answer: groups listed by country then region, no numbers,
  "Start describing the wine".
- **R4 The phone strip names the region and its best wine:** "Top match: Bourgogne ·
  Chablis Premier Cru 100 % · 3 more close" (k keeps its current meaning: other uncapped
  wines within 10 points of the leader).
- **R5 "Your call" becomes two short steps.** (1) *Which region is it?* — the top 5 groups
  as radios (region, country, %), a search over every region in the pool, and "It's not in
  the list". (2) Once a region is chosen: *Go deeper (optional)* — "Just the region"
  (default) plus that region's typical wines as radios (with their %). (3) Only while "Just
  the region" is chosen: *Grape (optional)* — chips of the grapes this region's typical wines
  name (primary and secondary, deduplicated, most common first) plus "Other grape…" (a search
  over every grape). Choosing a typical wine hides the grape step (the wine implies its
  grapes). Vintage stays as today. Changing the region clears the deeper choice and the grape.
- **R6 Scoring a region pick** (in `record_training_attempt`, the one scoring source):
  country 2 and region 3 by FK equality against the picked region's `country_id` / `id`;
  appellation 0 (a catalog wine always names one); primary grape 8 when the picked grape
  equals the wine's primary grape, else 0; secondary grape 0 when the wine has one (a
  region pick names one grape), null when it has none; designation 0 when the wine has one,
  null when not; vintage exactly as today. A typical-wine pick scores exactly as today.
  `possible_points` is unchanged (it depends on the wine, not the pick), so a region pick is
  visibly "5 of 22" or "13 of 22" against the same total as a deep pick.
- **R7 Storage.** `training_attempts` gains `picked_region_id uuid → regions(id) on delete set
  null` and `picked_grape_id uuid → grapes(id) on delete set null`, with checks: not both
  `picked_archetype_id` and `picked_region_id`; `picked_grape_id` only with
  `picked_region_id`. `record_training_attempt` reads `picked_region_id` / `picked_grape_id`
  from `p_attempt` on a fresh attempt (a re-reveal keeps the stored pick, as today). The
  migration recreates the RPC from its live body with a pre-state md5 assert and pins the
  new body's md5 in the post-state, re-grants EXECUTE to `authenticated` only (revoked from
  PUBLIC, anon, service_role), and asserts the new columns and checks. D17's style-verdict
  tie-break keeps preferring the taster's `picked_archetype_id`; a region pick has none.
- **R8 Result and history copy.** "You said Bourgogne · Chardonnay" / "You said Bourgogne"
  (region pick), "You said Chablis Premier Cru" (wine pick, as today). The verdict table,
  total and style verdict are unchanged.
- **R9 The snapshot stays the full wine ranking** (no schema change to it); a region's
  standing is derivable from it.
- **R10 Copy** (English, in `src/lib/training/copy.ts`): "Which region is it?", "Search
  regions…", "It's not in the list", "Go deeper (optional)", "Just the region", "Grape
  (optional)", "Other grape…", "Search grapes…", "best: {shortName}", "Show all {n} regions",
  "You said {region} · {grape}". Existing strings keep their wording.
- **R11 No new API call, no new content.** The pool already holds every region, country
  and grape the groups need; "Other grape…" reads `grapes` (≈280 rows, preloaded like the
  guess ladder does).

## 3. Tests

Pure: `groupRanking(ranked)` (grouping, best-member closeness, capped groups, order, a
single-member group, nulls before answers); the region-step grape list (dedupe, order);
copy strings. DB suite (rolled back, extend `scripts/training-room.test.mjs`): a region pick
with the right region and grape scores 2+3+0+8 (+ nulls/zeros per R6); a region pick with a
wrong grape scores 5; both-picks and grape-without-region are refused by the checks; a
typical-wine pick scores exactly as before; the RPC's grants. Browser: the grouped list on
laptop and phone, expand/collapse, the two-step call with region-only, region+grape and a
deep pick, the result lines, history rows.

## 4. Rollout

Migration first (additive: two nullable columns, two checks, the RPC gains a branch — the
deployed app never sends the new keys), then the app. Rollback: revert the app; the
migration stays.
