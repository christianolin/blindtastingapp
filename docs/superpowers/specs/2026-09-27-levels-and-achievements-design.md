# Levels and achievements — design

Date: 2026-09-27. Branch `levels` (base: production master `2193035`). Status: design
approved by the owner on 2026-09-27 (L1–L9, binding); L10 onwards are this spec's own
decisions. Every user-facing sentence below is provisional until the owner approves it.

Live-database facts in this spec come from read-only queries against production on
2026-09-27 (`begin read only … rollback`). Production has two migrations this branch
does not have yet: `20260925190000_wine_place_context_inherited_profile` and
`20260927100000_training_region_guess` (the second adds
`training_attempts.picked_region_id` / `picked_grape_id` and recreates
`record_training_attempt`, live md5 `f6a24c83…`). Nothing here depends on either, and
this migration does not touch `record_training_attempt`.

## 0. The owner's words

> "lets work making achievements / levels to gamify a bit. So you get xp each time to do
> a tasting or add something to your cellar or drink a wine. You get achievements, e.g.
> first bottle in cellar or 100 bottles in cellar at once. Could be cool. It shouldnt take
> up too much of the app, but just small notifications that pop up and then you can see
> your own stats in profile etc and you can also see other peoples levels and achievements
> through the community. lets make the xp bar around you profile icon circle and your
> level above it (like in wow)."

## 1. Decisions

### Owner-approved (2026-09-27, binding)

- **L1 History counts.** At launch everyone starts at the level their past activity earns,
  with earned achievements already unlocked, and gets ONE welcome pop-up ("You're level N")
  instead of a flood of old ones.
- **L2 Broad XP sources.** Scored blind guess = 10 + its points; finishing a tasting you
  joined (not host) = 40; hosting a finished tasting with ≥ 1 other JOINED guest and ≥ 1
  revealed glass = 40; each bottle added to your cellar = 5 (≤ 20 bottles per lot, ≤ 100
  cellar-add XP per day); each bottle drunk (consumption reason DRANK) = 15; a WSET note =
  20 (≤ 5 notes per day earn XP); a training-room reveal = 20 + its points; every
  achievement grants a 25–250 XP bonus. Values tunable, kept in one place.
- **L3 Awarded in the database.** An append-only XP ledger written by triggers on the
  source tables, so every write path counts; idempotent per source fact (a unique source
  key); XP is never taken back; caps stop farming. Rejected: computing on read, awarding in
  app code.
- **L4 Rule 1.** Levels, XP and achievements are public, so they are shared counts under
  CLAUDE.md's rule: a bottle drawn into a not-yet-revealed glass counts as still in the
  cellar and not drunk until that reveal. XP and achievements from a masked pour wait for
  the reveal; guess XP waits for the global reveal; note achievements that depend on a
  wine's attributes count identified notes only.
- **L5 Level curve.** `threshold(L) = 25·L·(L−1)` XP, cap level 60 (88,500 XP); the
  formula lives in SQL and TS with a parity test.
- **L6 About 20 achievements** across Cellar, Tastings, Notes, Training, Friends; "at
  once" achievements persist once earned; Cellar achievements are hidden from viewers who
  cannot see that cellar (`can_view_cellar`).
- **L7 Pop-ups.** Small cards in a bottom corner, about 4 s, at most 3 stacked,
  `aria-live="polite"`, reduced motion respected. No new always-on poller: AppHeader reads
  the viewer's unseen awards and hands them to a client toaster that shows them and marks
  them seen through a server action.
- **L8 The ring.** A gold progress ring around the avatar with the level in a small badge
  above it, in the sidebar footer (full and 60 px rail), the phone drawer and the /u/[id]
  header; tokens only, dark mode too; accessible name "Level 4, 120 of 200 XP to level 5"
  (the approved example read "120 of 250"; level 4 spans 200 XP on the L5 curve, so the
  number here is the curve's, the wording the owner's).
- **L9 Community and profiles.** A level badge next to each person in /community (cards
  and table, batched); /u/[id] gets a small "Level & achievements" card (level, XP bar,
  earned achievements with dates; on your own profile also the locked ones with progress).
  "It shouldn't take up too much of the app."

### This spec's decisions

| # | Decision | Why |
|---|---|---|
| L10 | A semi-blind guess earns 10 + 10 per match (10 or 20). **Tunable.** | Live blind guesses average 10.7 points (48 scored guesses), so a match earns about an average blind glass; a miss still earns the 10 for playing. |
| L11 | A guess earns XP only when it is scored, its glass is globally revealed (`wines.is_revealed`) and it names at least one field; a blank guess earns nothing. | Locking a blank row is a readiness signal, not play; the global reveal is the Rule 1 moment. |
| L12 | ASYNC-IMMEDIATE: `score_own_guess` never awards; the guess is paid at the glass's global reveal, like everyone's. A glass never globally revealed pays nothing. | Paying at self-score would move a public number while others still guess the glass. |
| L13 | "Finished a tasting" = the tasting goes to `CLOSED`, is `BLIND`/`SEMI_BLIND`, has ≥ 1 revealed glass, and you are JOINED, not the host, with ≥ 1 scored non-blank guess on a revealed glass. The host award needs the same tasting plus ≥ 1 other JOINED person. Reopen + re-close never pays twice. | Joining without playing earns nothing; `OPEN` boards have no game. |
| L14 | Cellar-add XP counts growth of `cellar_lots.purchased_quantity` (a new lot, "+1 bottle", "Add N to the existing lot"); an Edit-lot `quantity` correction never pays. The 20-bottle cap spans the lot's life. | `increaseCellarLotQuantity` raises both columns; `updateLot` writes `quantity` alone, as a correction. |
| L15 | Extra caps, all **tunable**: drinks ≤ 6 bottles per consumption and ≤ 90 XP per day; tastings finished ≤ 3 per day; tastings hosted ≤ 3 per day; training rounds ≤ 5 per day. | `cellar_consumptions` is client-writable (a direct insert of 1,000 DRANK bottles would otherwise pay 15,000 XP); training is solo and repeatable. |
| L16 | Every cap counts per **UTC day** of the award (the ledger's `day`), the same day basis `consume_cellar_lot` and the pour RPCs use for `consumed_on`. XP cut by a cap is lost, not deferred; no zero-XP rows. | Caps are anti-farming, never shown as a clock; UTC has no DST edge. |
| L17 | Drink XP needs `reason = 'DRANK'` and a `lot_id` when the transaction commits; a later reason edit never pays. The history backfill does not require the lot (a lot deleted since sets `lot_id` null). | Every app path consumes from a lot; lot-less direct inserts are farming. |
| L18 | `TRAINING` notes earn no note XP (the round pays instead), but count toward the note-count achievements. | No double pay for one training round; the note is still a note. |
| L19 | One internal `xp_award()` locks the person's `profile_levels` row, applies caps, writes the ledger row with the running total `xp_after`, and updates the level. Per-source award functions are shared by the triggers and by `xp_replay_user()` (backfill and repair): one definition of every rule. | Backfill and live awards can never disagree. |
| L20 | Every XP trigger function wraps its work in `begin … exception when others then raise warning … end`. | An XP bug must never block a reveal, a pour, a note or a cellar write; `xp_replay_user` repairs a missed award. |
| L21 | Drinks: the `cellar_consumptions` trigger is a `DEFERRABLE INITIALLY DEFERRED` constraint trigger; a masked drink is paid by the reveal trigger, which is named to fire after `trg_catalog_wine_unmark_blind`. | Both pour RPCs insert the consumption BEFORE pointing `wine_pour_intents.cellar_consumption_id` at it; a plain AFTER INSERT trigger would see an unmasked pour and pay at Start. |
| L22 | Numbers live in two tables — `xp_sources` (XP values and caps) and `achievements` (key, category, gate, target, bonus, order) — seeded by the migration. Names and descriptions live in `src/lib/levels/copy.ts`; the DB suite pins the two key sets equal. | "Kept in one place" for every number; copy stays where the owner edits copy. |
| L23 | Read paths: `profile_levels` is readable by every signed-in member (xp, level); `profile_achievements` likewise except rows with gate `cellar`, which need your own id or `can_view_cellar(user_id)`; the ledger is owner-only; three client RPCs (§6). A SECURITY DEFINER "levels for ids" RPC was rejected: levels need no per-viewer filtering and a plain `.in()` read batches. | Narrowest shape that still batches. |
| L24 | Count achievements read their source tables with the Rule 1 filters, except `glasses_50`, which counts the ledger's guess rows (exact, because guess XP is uncapped). No trigger and no index is added on `guesses`. Two indexes are added: `wset_notes(author_id)`, `tasting_participants(user_id)`. | The guess autosave is the hottest write in the app. |
| L25 | Backfilled achievements are stamped at launch with `backfill = true` and show "Before levels" instead of a date. | A historic "25th note" date is not reconstructible from current rows. |
| L26 | Every non-deleted profile at launch (38) gets `welcome_pending`; accounts created later do not (the first-run tour covers them). The five seeded demo profiles (`.invalid` emails) get levels like anyone. | One welcome per existing person; seed data is data. |
| L27 | Account deletion: `profiles_deleted_drop_levels` (AFTER UPDATE OF `deleted_at`, the `profiles_deleted_drop_favourites` pattern) deletes the person's ledger, achievements and level; `scrub_deleted_account` is not recreated. `xp_award` skips a deleted profile. | The scrub's latest body stays untouched. |
| L28 | Toaster architecture: AppHeader adds `get_my_level_state()` to its existing `Promise.all` and renders `<AwardsFeed>` (client, renders nothing), which publishes into a module store; one `<AwardsToaster>` mounted in `AppShell` shows the cards and calls `markXpSeen(ids, welcome)`, which does not revalidate. The rings read the same store, keyed by user id. | The sidebar lives in the root layout, which a soft navigation never re-renders. |
| L29 | Cards: one render's new awards become at most three cards — one XP card, one achievement card (merged when ≥ 2), one level-up card (the highest level reached). The welcome card comes first. Awards older than 10 minutes collapse into "+N XP while you were away". A hidden tab queues; `BroadcastChannel` stops a second tab repeating a card. | L7's "max 3 stacked" per action; no flood after an absence. |
| L30 | Ring tones: on the bordeaux sidebar and drawer the fill is `--gold` over `primary-foreground/20` (5.28:1 light, 6.19:1 dark); on the page surface (/u/[id]) the fill is `--gold-deep` over `--border-light`, supplementary to the card's text; the badge is `bg-gold text-on-accent`. The ring is an arc with a gap under the badge. | Measured contrasts in §8.2; no progress hides under the badge. |
| L31 | /community shows a text pill "Lv N" beside the name (cards and table), not a ring; one batched `.in()` read in the same `Promise.all` as `getBulkProfileSummaries`. | A ring on every row is noise. |
| L32 | The /u/[id] card sits directly under `ProfileHeader`, compact (one row collapsed), and shows even when the empty state replaces the stats. One row collapsed now holds on laptops from 1100px (trio \| level row \| footer); amended 2026-09-28. | A person with only cellar XP still has a level. |
| L33 | `src/app/cellar/new/actions.ts`'s `addCellarLot` and `increaseCellarLotQuantity` each gain `revalidatePath("/cellar")`. | `/cellar/new` then `router.push`es inside the cellar layout, whose AppHeader a soft navigation keeps, and the add-wine sheet's merge card ("Add N to the existing lot", `lotMerge` in `use-sheet-adds.ts`) calls `increaseCellarLotQuantity` with no re-render until the sheet closes; every other award path already re-renders (§9). |
| L34 | A trigger that pays several people loops in `user_id` order. | One lock order on `profile_levels`, so two concurrent reveals cannot deadlock each other. |
| L35 | Winner = most points over fully revealed glasses among ≥ 3 players (JOINED, with a scored non-blank guess on a revealed glass); top > 0; ties all win. | Partial step points of a glass left mid-reveal at close are not final. |
| L36 | A change to `xp_sources` affects future awards only; a lowered achievement target unlocks at that person's next event in the category, or at once through `xp_replay_user`. | History is never recomputed (L3). |

## 2. XP table

Stored in `xp_sources` (§5.1). "Unit" is what `xp_events.units` records.

| kind | Pays | Base | Per unit | Unit cap | Daily cap | Paid when |
|---|---|---|---|---|---|---|
| `guess` | scored blind guess | 10 | 1 per point (0–30) | — | — | its glass is globally revealed |
| `guess_match` | scored semi-blind guess | 10 | 10 per match (0/1) | — | — | its glass is globally revealed |
| `tasting_finished` | guest of a closed tasting (L13) | 40 | — | — | 3 awards | the tasting closes |
| `tasting_hosted` | host of a closed tasting (L13) | 40 | — | — | 3 awards | the tasting closes |
| `cellar_add` | bottles added (L14) | 0 | 5 per bottle | 20 per lot (life) | 100 XP | the lot is inserted or `purchased_quantity` grows |
| `drink` | bottles drunk (L17) | 0 | 15 per bottle | 6 per consumption | 90 XP | the consumption commits, or its glass is revealed (masked pour) |
| `note` | WSET note, not TRAINING | 20 | — | — | 5 awards | the note is inserted |
| `training` | scored training round | 20 | 1 per point | — | 5 awards | `training_attempts.scored_at` is set |
| `achievement` | achievement bonus | from `achievements.bonus_xp` | — | — | — | the achievement unlocks |

A blind glass pays 10–40 XP; the live average is 20.7. A typical guest evening (five
glasses, average points) pays ≈ 104 + 40 = 144 XP. Host 40. A 12-bottle haul 60. An
opened bottle 15. A note 20.

## 3. Level curve and calibration

### 3.1 Curve

`xpForLevel(L) = 25·L·(L−1)`; `levelForXp(xp)` = the largest L ≤ 60 with
`xpForLevel(L) ≤ xp`. SQL `level_for_xp(integer)` and TS `levelForXp` both compute
`floor((1 + sqrt(1 + 4·xp/25)) / 2)` then correct by ±1 against the integer threshold (no
floating-point edge), capped at 60.

| Level | XP | Level | XP | Level | XP |
|---|---|---|---|---|---|
| 2 | 50 | 7 | 1,050 | 15 | 5,250 |
| 3 | 150 | 8 | 1,400 | 20 | 9,500 |
| 4 | 300 | 9 | 1,800 | 30 | 21,750 |
| 5 | 500 | 10 | 2,250 | 40 | 39,000 |
| 6 | 750 | 12 | 3,300 | 60 | 88,500 (cap) |

Parity: `src/lib/levels/__fixtures__/curve.json` lists `[xp, level]` for 0, every
threshold −1 / 0 / +1 for L = 2…60, and 1,000,000. Vitest checks `levelForXp` against it;
the DB suite checks `level_for_xp` against the same file.

### 3.2 Calibration (production, 2026-09-27, the rules of this spec replayed)

Live history: 7 tastings (4 CLOSED, 3 IN_PROGRESS, all BLIND), 19 glasses all revealed, 48
scored guesses (0 blank, 21 never locked, average 10.73 points, best 29/30; one 26/26
perfect), 91 cellar lots, 8 consumptions (7 DRANK, all with a lot), 16 notes (10 OPEN, 5
BLIND, 1 TRAINING), 1 training attempt (unscored), 32 friendship rows, 0 pour intents, 0
flight holds, 0 deleted profiles. Seed = a demo profile (`.invalid` email). "Act" = XP
before achievement bonuses.

| id | seed | guess | finish | host | cellar | drink | notes | act | bonus | total | level | achievements |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| d3ee0f40 | | 70 | 80 | 0 | 155 | 75 | 100 | 480 | 300 | 780 | 6 | first_bottle, first_drink, first_tasting, winner, first_note, first_friend, friends_10 |
| f9d82d2a | yes | 132 | 40 | 40 | 45 | 0 | 0 | 257 | 300 | 557 | 5 | first_bottle, first_tasting, first_host, perfect_glass, winner |
| 95584be2 | yes | 196 | 80 | 0 | 0 | 0 | 0 | 276 | 125 | 401 | 4 | first_tasting, winner |
| 430f8450 | | 40 | 0 | 80 | 10 | 0 | 120 | 250 | 150 | 400 | 4 | first_bottle, first_tasting, first_host, first_note, first_friend |
| caa708a1 | yes | 115 | 40 | 40 | 0 | 0 | 0 | 195 | 75 | 270 | 3 | first_tasting, first_host |
| ad5343d0 | | 40 | 40 | 0 | 0 | 0 | 20 | 100 | 150 | 250 | 3 | first_tasting, winner, first_note |
| 0e5b68d5 | | 55 | 40 | 0 | 0 | 0 | 0 | 95 | 150 | 245 | 3 | first_tasting, winner, first_friend |
| bc88c69e | | 0 | 0 | 0 | 100 | 0 | 0 | 100 | 100 | 200 | 3 | first_bottle, cellar_25, first_friend |
| c86c09ab | | 34 | 0 | 0 | 5 | 15 | 40 | 94 | 75 | 169 | 3 | first_bottle, first_drink, first_note |
| 10f2f036 | yes | 101 | 40 | 0 | 0 | 0 | 0 | 141 | 25 | 166 | 3 | first_tasting |
| 114a760a | yes | 92 | 40 | 0 | 0 | 0 | 0 | 132 | 25 | 157 | 3 | first_tasting |
| 6ff56c36 | | 50 | 40 | 0 | 0 | 0 | 0 | 90 | 50 | 140 | 2 | first_tasting, first_friend |
| bdfcae07 | | 49 | 40 | 0 | 0 | 0 | 0 | 89 | 50 | 139 | 2 | first_tasting, first_friend |
| 7c0ae002 | | 0 | 0 | 0 | 70 | 0 | 0 | 70 | 50 | 120 | 2 | first_bottle, first_friend |
| d861f8bd | | 0 | 0 | 0 | 5 | 15 | 20 | 40 | 75 | 115 | 2 | first_bottle, first_drink, first_note |
| 42eec649 | | 0 | 0 | 0 | 35 | 0 | 0 | 35 | 50 | 85 | 2 | first_bottle, first_friend |
| 17b57a92 | | 0 | 0 | 0 | 30 | 0 | 0 | 30 | 50 | 80 | 2 | first_bottle, first_friend |
| b5fd2370 | | 21 | 0 | 0 | 0 | 0 | 0 | 21 | 25 | 46 | 1 | first_friend |
| e8242abe | | 0 | 0 | 0 | 10 | 0 | 0 | 10 | 25 | 35 | 1 | first_bottle |
| 4b6513f2 | | 0 | 0 | 0 | 5 | 0 | 0 | 5 | 25 | 30 | 1 | first_bottle |
| 3d88ab9a, 59747e73, 6dd0b7aa, 73cf0828 | | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 | 25 | 1 | first_friend |
| 14 others | | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | — |

Summary: the most active person has 480 XP before bonuses (the owner's probe: ≈ 500);
tasters sit at 90–280; 18 of 38 profiles have no activity XP (4 of them earn first_friend
only). Launch levels: L6 × 1, L5 × 1, L4 × 2, L3 × 7, L2 × 6, L1 × 21. Achievement bonuses
are ≈ 40 % of the top totals — a newcomer's first tasting (≈ 144 XP + First flight 25)
reaches level 3. No training XP exists yet (the one attempt is unscored). The five seed
profiles land at L3–L5.

## 4. Achievements

Twenty achievements, stored in `achievements` (§5.1). Names and descriptions are
provisional copy (owner approval needed). "Target" is compared with the metric (§4.1).
Visible = to other signed-in members. Cellar rows have gate `cellar` (the RLS in §5.2).

| # | key | Name | Description | Cat. | Target | Bonus | Evaluated on | Visible |
|---|---|---|---|---|---|---|---|---|
| 1 | `first_bottle` | First bottle | Add your first bottle to your cellar. | cellar | 1 | 25 | lot insert / growth | cellar gate |
| 2 | `cellar_25` | Well stocked | Hold 25 bottles in your cellar at once. | cellar | 25 | 50 | lot insert / growth | cellar gate |
| 3 | `cellar_100` | Serious cellar | Hold 100 bottles in your cellar at once. | cellar | 100 | 150 | lot insert / growth | cellar gate |
| 4 | `first_drink` | First cork | Drink your first bottle from your cellar. | cellar | 1 | 25 | drink paid | cellar gate |
| 5 | `drank_50` | Fifty corks | Drink 50 bottles from your cellar. | cellar | 50 | 100 | drink paid | cellar gate |
| 6 | `first_tasting` | First flight | Finish your first blind tasting. | tastings | 1 | 25 | tasting closes | yes |
| 7 | `tastings_10` | Regular | Finish 10 blind tastings. | tastings | 10 | 100 | tasting closes | yes |
| 8 | `first_host` | Host for the night | Host a blind tasting to the end, with at least one guest. | tastings | 1 | 50 | tasting closes | yes |
| 9 | `perfect_glass` | Perfect glass | Get every part of a blind glass right. | tastings | 1 | 100 | glass revealed | yes |
| 10 | `winner` | Top of the table | Win a blind tasting of three or more players. | tastings | 1 | 100 | tasting closes | yes |
| 11 | `glasses_50` | Fifty glasses | Guess 50 blind glasses. | tastings | 50 | 100 | glass revealed | yes |
| 12 | `first_note` | First impressions | Write your first tasting note. | notes | 1 | 25 | note inserted | yes |
| 13 | `notes_25` | Note taker | Write 25 tasting notes. | notes | 25 | 75 | note inserted | yes |
| 14 | `notes_100` | Critic | Write 100 tasting notes. | notes | 100 | 200 | note inserted | yes |
| 15 | `note_countries_10` | Well travelled | Write notes on wines from 10 countries. | notes | 10 | 100 | note inserted / identity set | yes |
| 16 | `first_training` | Practice round | Finish your first round in the training room. | training | 1 | 25 | round scored | yes |
| 17 | `training_10` | In training | Finish 10 rounds in the training room. | training | 10 | 75 | round scored | yes |
| 18 | `training_ace` | Spot on | Score every possible point in a training round. | training | 1 | 100 | round scored | yes |
| 19 | `first_friend` | Good company | Make your first friend on Blindr. | friends | 1 | 25 | friendship inserted | yes |
| 20 | `friends_10` | Full table | Have 10 friends at once. | friends | 10 | 75 | friendship inserted | yes |

Total bonus available: 1,525 XP. "At once" achievements (2, 3, 20) compare the current
state at evaluation time and persist once earned; nothing is ever revoked.

### 4.1 Metrics (`xp_achievement_metric(p_user uuid, p_key text) returns integer`)

The one definition of every unlock rule, used by the live check, the replay and the
own-profile progress RPC. `u` = `p_user`. Shared expressions:

- `blank(g)` = `num_nonnulls(g.country_id, g.region_id, g.appellation_id,
  g.primary_grape_id, g.secondary_grape_id, g.producer_id, g.type_designation_id,
  g.vintage_kind, g.guessed_wine_id) = 0`.
- `possible(g)` = `2*(g.country_points is not null)::int + 3*(g.region_points is not
  null)::int + 5*(g.appellation_points is not null)::int + 8*(g.primary_grape_points is not
  null)::int + 2*(g.secondary_grape_points is not null)::int + 6*(g.producer_points is not
  null)::int + 2*(g.type_designation_points is not null)::int + 2*(g.vintage_points is not
  null)::int` — `reveal_wine`'s own per-category maxima; after a full reveal a null column
  means "not applicable".
- `xp_consumption_masked(c uuid)` = `exists (select 1 from flight_holds h where
  h.consumption_id = c) or exists (select 1 from wine_pour_intents i join wines w on w.id
  = i.wine_id where i.cellar_consumption_id = c and not w.is_revealed)` — the predicate of
  `catalog_wine_masked_pours` (md5 `fea91b15…`), pinned equal by a DB test.
- `xp_tasting_player(t, u)` = `exists (select 1 from tasting_participants p join guesses g
  on g.participant_id = p.id join wines w on w.id = g.wine_id where p.tasting_id = t and
  p.user_id = u and p.status = 'JOINED' and w.tasting_id = t and w.is_revealed and
  g.scored_at is not null and not blank(g))`.
- `xp_tasting_counts(t)` = `t.status = 'CLOSED' and t.reveal_mode in ('BLIND','SEMI_BLIND')
  and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed)`.

| key(s) | metric |
|---|---|
| first_bottle | `select count(*) from cellar_lots where owner_id = u` |
| cellar_25, cellar_100 | on hand = `(select coalesce(sum(quantity),0) from cellar_lots where owner_id = u) + (select coalesce(sum(c.quantity),0) from cellar_consumptions c where c.owner_id = u and xp_consumption_masked(c.id))` — a masked pour still counts as in the cellar |
| first_drink, drank_50 | `select coalesce(sum(c.quantity),0) from cellar_consumptions c where c.owner_id = u and c.reason = 'DRANK' and not xp_consumption_masked(c.id)` |
| first_tasting, tastings_10 | `select count(*) from tasting_participants s join tastings t on t.id = s.tasting_id where s.user_id = u and xp_tasting_counts(t) and ((t.host_id <> u and xp_tasting_player(t.id, u)) or (t.host_id = u and exists (select 1 from tasting_participants o where o.tasting_id = t.id and o.status = 'JOINED' and o.user_id <> u)))` (the host always has a JOINED seat) |
| first_host | the host half of the row above |
| perfect_glass | `select count(*) from tasting_participants p join guesses g on g.participant_id = p.id join wines w on w.id = g.wine_id join tastings t on t.id = w.tasting_id where p.user_id = u and t.reveal_mode = 'BLIND' and w.is_revealed and g.scored_at is not null and possible(g) > 0 and g.total_points = possible(g)` |
| winner | `select count(*) from tasting_participants s join tastings t on t.id = s.tasting_id where s.user_id = u and xp_tasting_counts(t) and xp_tasting_won_by(t.id, u)`, where `xp_tasting_won_by(t, u)` sums `total_points` per JOINED user over scored non-blank guesses on revealed glasses of `t`, and is true when there are ≥ 3 such users, the maximum is > 0 and `u`'s sum equals it |
| glasses_50 | `select count(*) from xp_events where user_id = u and kind in ('guess','guess_match')` (L24) |
| first_note, notes_25, notes_100 | `select count(*) from wset_notes n where n.author_id = u and not wset_note_held(n.id)` (every context, identity-less notes included — a count names no wine; a held note left out, §14 A1) |
| note_countries_10 | `select count(distinct cw.country_id) from wset_notes n join catalog_wines cw on cw.id = n.catalog_wine_id where n.author_id = u and not cw.blind_pending and not wset_note_held(n.id)` (§14 A1) |
| first_training, training_10 | `select count(*) from training_attempts where author_id = u and scored_at is not null` |
| training_ace | `select count(*) from training_attempts where author_id = u and scored_at is not null and possible_points > 0 and total_points = possible_points` |
| first_friend, friends_10 | `select count(*) from friendships where user_id = u` (pairs: each side has its own row) |

`xp_check_achievements(p_user, p_category, p_at, p_seen, p_backfill)` walks the active
achievements of the category that the person has NOT unlocked (so a veteran pays nothing
for achievements already earned), in `sort_order`; for each whose metric ≥ target it
inserts `profile_achievements` (`on conflict do nothing`) and, when inserted, pays
`xp_award(p_user, 'achievement', 'achievement:' || key, bonus_xp, null, key, p_at, p_seen)`.

## 5. Data model and migration

One migration: `supabase/migrations/20260927120000_levels_and_achievements.sql` (sorts
after the live `20260927100000`). Additive: five new tables, new functions, triggers on
existing tables, two indexes, the backfill, same-transaction assertions. It recreates no
existing function.

### 5.1 Tables

```sql
create table public.xp_sources (
  kind            text primary key,
  base_xp         integer not null default 0 check (base_xp >= 0),
  unit_xp         integer not null default 0 check (unit_xp >= 0),
  unit_cap        integer check (unit_cap > 0),
  daily_xp_cap    integer check (daily_xp_cap > 0),
  daily_count_cap integer check (daily_count_cap > 0)
);
-- seed rows: exactly §2's table.

create table public.achievements (
  key        text primary key,
  category   text not null check (category in ('cellar','tastings','notes','training','friends')),
  gate       text not null check (gate in ('public','cellar')),
  target     integer not null check (target > 0),
  bonus_xp   integer not null check (bonus_xp between 25 and 250),
  sort_order integer not null,
  is_active  boolean not null default true,
  check ((category = 'cellar') = (gate = 'cellar'))
);
-- seed rows: exactly §4's table.

create table public.xp_events (          -- the ledger, append-only
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  kind            text not null references public.xp_sources(kind),
  source_key      text not null,
  xp              integer not null check (xp > 0),
  xp_after        integer not null check (xp_after >= xp),
  units           integer,               -- points / bottles / match, per kind
  achievement_key text references public.achievements(key),
  day             date not null,         -- UTC day of created_at: the cap bucket
  created_at      timestamptz not null default now(),
  seen_at         timestamptz,
  unique (user_id, source_key),
  check ((kind = 'achievement') = (achievement_key is not null))
);
create index xp_events_user_kind_day_idx on public.xp_events (user_id, kind, day);
create index xp_events_unseen_idx on public.xp_events (user_id, id) where seen_at is null;

create table public.profile_levels (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  xp              integer not null default 0 check (xp >= 0),
  level           smallint not null default 1 check (level between 1 and 60),
  welcome_pending boolean not null default false,
  updated_at      timestamptz not null default now()
);

create table public.profile_achievements (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievements(key),
  gate            text not null check (gate in ('public','cellar')),  -- copied at unlock
  unlocked_at     timestamptz not null default now(),
  backfill        boolean not null default false,
  primary key (user_id, achievement_key)
);

create index wset_notes_author_idx on public.wset_notes (author_id);
create index tasting_participants_user_idx on public.tasting_participants (user_id);
```

Source keys (the idempotency contract; `xp_events` is unique on `(user_id, source_key)`):

| kind | source_key | units |
|---|---|---|
| guess / guess_match | `guess:<guesses.id>` | points / match (0,1) |
| tasting_finished | `finish:<tastings.id>` | — |
| tasting_hosted | `host:<tastings.id>` | — |
| cellar_add | `cellar_add:<cellar_lots.id>:<least(purchased_quantity, 20) reached>` | bottles counted (XP may be clamped by the day cap) |
| drink | `drink:<cellar_consumptions.id>` | bottles counted (≤ 6) |
| note | `note:<wset_notes.id>` | — |
| training | `training:<training_attempts.id>` | points |
| achievement | `achievement:<key>` | — |

`xp_after` is the person's total right after the row was written (computed under the
`profile_levels` row lock, so it is ordered with `id`). `seen_at` is the only column ever
updated, and only by `mark_xp_seen`.

### 5.2 RLS and grants

Supabase's default privileges give anon/authenticated/service_role ALL on a new table and
EXECUTE on a new function (verified: `pg_default_acl` for `postgres` on `public`), so the
migration revokes explicitly.

| Table | RLS policy (SELECT, `authenticated`) | anon / PUBLIC | authenticated |
|---|---|---|---|
| `xp_sources` | "xp sources read": `true` | nothing | SELECT |
| `achievements` | "achievements read": `true` | nothing | SELECT |
| `xp_events` | "xp events read own": `user_id = auth.uid()` | nothing | SELECT |
| `profile_levels` | "profile levels read": `true` | nothing | SELECT |
| `profile_achievements` | "profile achievements read": `user_id = auth.uid() or gate <> 'cellar' or can_view_cellar(user_id)` | nothing | SELECT |

No client role holds INSERT/UPDATE/DELETE on any of the five; no column grants. Functions:
`get_my_level_state()`, `mark_xp_seen(bigint[], boolean)` and
`get_my_achievement_progress()` are EXECUTE `authenticated` only (revoked from PUBLIC,
anon and service_role, the OD-1 pattern); every other function this migration creates is
owner-only.

### 5.3 Functions

| Function | Security | Purpose |
|---|---|---|
| `level_for_xp(integer) returns smallint` | invoker, immutable | §3.1 |
| `xp_award(p_user, p_kind, p_source_key, p_xp, p_units, p_achievement, p_at timestamptz, p_seen boolean) returns integer` | definer | Returns 0 if `p_xp <= 0`, the profile is missing or deleted, or the key exists. Otherwise: `insert into profile_levels (user_id) … on conflict do nothing`; `select … for update`; applies `daily_count_cap` / `daily_xp_cap` for `(user_id, kind, day = (p_at at time zone 'utc')::date)` (clamping `p_xp`); inserts the ledger row (`created_at = p_at`, `seen_at = case when p_seen then now() end`, `xp_after = xp + clamped`) `on conflict do nothing`; updates `profile_levels.xp`, `level = level_for_xp(xp)`, `updated_at`. Returns the XP paid. |
| `xp_consumption_masked(uuid)`, `xp_cellar_on_hand(uuid)`, `xp_tasting_player(uuid,uuid)`, `xp_tasting_won_by(uuid,uuid)`, `xp_achievement_metric(uuid,text)` | definer, stable | §4.1 |
| `xp_check_achievements(p_user, p_category, p_at, p_seen, p_backfill)` | definer | §4.1 |
| `xp_award_guess(p_guess uuid, p_at, p_seen, p_check boolean)` | definer | Pays one guess if its glass is revealed, its tasting is BLIND/SEMI_BLIND, it is scored and non-blank; `guess` = 10 + `total_points`, `guess_match` = 10 + 10·`total_points`; then, when `p_check`, `xp_check_achievements(user, 'tastings')`. |
| `xp_award_tasting_close(p_tasting uuid, p_user uuid, p_at, p_seen, p_check)` | definer | Pays `p_user`'s share of a closed tasting (L13): `finish:` for a qualifying guest, `host:` for a qualifying host; then the tastings check. |
| `xp_award_cellar_lot(p_lot uuid, p_old integer, p_new integer, p_at, p_seen, p_check)` | definer | `least(p_new,20) − least(p_old,20)` bottles × 5 under key `cellar_add:<lot>:<least(p_new,20)>`; then the cellar check. |
| `xp_award_drink(p_consumption uuid, p_at, p_seen, p_check, p_require_lot boolean)` | definer | Re-reads the row; pays `least(quantity,6)` × 15 when DRANK, unmasked and (if required) with a lot; then the cellar check. |
| `xp_award_note(p_note uuid, p_at, p_seen, p_check)` | definer | 20 unless `context_kind = 'TRAINING'` or the note is held (`wset_note_held`, §14 A1: its reveal pays it); then the notes check (always, TRAINING included). |
| `xp_award_training(p_attempt uuid, p_at, p_seen, p_check)` | definer | 20 + `total_points` when scored; then the training check. |
| `xp_replay_user(p_user uuid, p_seen boolean, p_backfill boolean, p_repair boolean)` | definer | §5.5. With `p_repair` the repair tool (L20, §14 A3). |
| trigger functions `xp_on_glass_revealed`, `xp_on_tasting_closed`, `xp_on_cellar_lot`, `xp_on_cellar_consumption`, `xp_on_wset_note`, `xp_on_training_scored`, `xp_on_friendship`, `xp_drop_deleted_profile` | definer | §7; each wraps its body per L20 and returns null |
| `get_my_level_state() returns jsonb` | invoker, stable | §6.1 |
| `mark_xp_seen(p_ids bigint[], p_welcome boolean) returns void` | definer | §6.1 |
| `get_my_achievement_progress()` | definer, stable | §6.1 |

Every function sets `search_path = public`.

### 5.4 Pre-state and post-state assertions (same transaction)

Pre-state (refuse to run otherwise): `xp_events` does not exist; the md5 of
`replace(prosrc, chr(13), '')` of every function whose behaviour the triggers rely on
equals its live value: `reveal_wine` `ed7f78a5…`, `reveal_next_category` `6a081836…`,
`score_own_guess` `395045b1…`, `pour_cellar_lot_into_glass` `558e6072…`,
`draw_down_flight_cellar_lots` `0cbe5dd2…`, `consume_cellar_lot` `990d02e6…`,
`add_cellar_lot` `52c28f6b…`, `import_cellar_lot` `4ebae429…`, `save_wset_note`
`9ac29b18…`, `catalog_wine_unmark_blind` `de1f11ee…`, `flight_holds_on_pour` `f2eefca3…`,
`wset_notes_resolve_on_reveal` `f406623e…`, `catalog_wine_masked_pours` `fea91b15…`,
`scrub_deleted_account` `b9aa8d71…`, `can_view_cellar` `3af2e51e…`, `accept_friend_request`
`8c473e36…`, `accept_platform_invite` `9b3e4a89…` (full hashes in the file); and the AFTER
UPDATE OF `is_revealed` triggers on `wines` are exactly `semi_blind_release_revealed_wine`,
`trg_catalog_wine_unmark_blind`, `wset_notes_resolve_on_reveal` (the name-order premise of
L21). `record_training_attempt` is deliberately NOT pinned (its live body differs from
master; the trigger reads only `training_attempts` columns).

Post-state (training-room migration style): each table's policies text, RLS enabled and not
forced, grants exactly §5.2, no column grants; each new function's security, config,
volatility, arguments and EXECUTE holders; each trigger's `pg_get_triggerdef`; the seeded
`xp_sources` and `achievements` rows; the backfill invariants — for every profile,
`profile_levels.xp = sum(xp_events.xp)` and `level = level_for_xp(xp)`; no ledger row with
`seen_at is null`; `welcome_pending` true for exactly the non-deleted profiles; every
unlocked achievement's bonus row present once.

### 5.5 Backfill (in the migration) and repair

```sql
insert into profile_levels (user_id, welcome_pending)
select id, true from profiles where deleted_at is null
on conflict (user_id) do nothing;
select public.xp_replay_user(p.id, true, true, false)
  from profiles p where p.deleted_at is null order by p.id;
```

`xp_replay_user(u, p_seen, p_backfill, p_repair)` walks u's facts oldest first, each with its own
time, through the same award functions with `p_check = false`:

| Fact | Selection | Time (`p_at`) |
|---|---|---|
| guess | u's scored guesses on revealed glasses of BLIND/SEMI tastings | `coalesce(w.revealed_at, g.scored_at)` |
| close | CLOSED tastings where u holds a seat | `coalesce(t.finished_at, max(w.revealed_at), t.created_at)` |
| lot | u's `cellar_lots` (old = 0, new = `purchased_quantity`) | `created_at` |
| drink | u's DRANK consumptions, `p_require_lot => false` | `created_at` |
| note | u's `wset_notes` | `created_at` |
| training | u's scored `training_attempts` | `scored_at` |

Then `xp_check_achievements` once per category with `p_at = now()`, `p_backfill`. Caps
bucket by each fact's UTC day. Keys make it idempotent, so running it again later (as the
repair after a swallowed error, `p_seen = false`, `p_backfill = false`) only adds what is
missing. Legacy tastings closed before M3 have `finished_at` null (both live CLOSED LIVE
tastings do); the fallback times cover them. Launch cost: 38 profiles, ≈ 200 facts.

## 6. Read paths

### 6.1 Client RPCs

- **`get_my_level_state()`** (invoker, reads under RLS) returns
  `{ "xp", "level", "welcome", "checked_at", "unseen": [ { "id", "kind", "xp", "xp_after",
  "units", "achievement", "created_at" } ] }` — `profile_levels` defaults to xp 0 / level 1
  when the person has no row; `unseen` is the oldest 50 rows with `seen_at is null`,
  ordered by `id` (partial index). Anything past 50 arrives on the next render.
- **`mark_xp_seen(p_ids, p_welcome)`**: refuses no `auth.uid()` (42501); `update xp_events
  set seen_at = now() where user_id = auth.uid() and id = any(p_ids) and seen_at is null`;
  when `p_welcome`, clears the caller's `welcome_pending`. Explicit ids, not "up to id N":
  two transactions for one person can commit out of id order. Idempotent.
- **`get_my_achievement_progress()`**: for the caller, every active achievement:
  `key, category, bonus_xp, target, progress (least(metric, target)), unlocked_at,
  backfill`. Definer because the cellar metrics read `flight_holds` and
  `wine_pour_intents`; it only ever computes for `auth.uid()`.

### 6.2 Server reads (TypeScript, `src/lib/levels/read.ts`, server-only)

| Reader | Used by | Query |
|---|---|---|
| `readLevelSnapshot(supabase, userId)` | AppHeader | `rpc("get_my_level_state")`; null on any error (the page never breaks, the feed then publishes nothing) |
| `readOwnLevel(supabase, userId)` | AppShell (sidebar initial) | `profile_levels` `select xp, level` for the user, in `Promise.all` with the existing profile read |
| `readLevels(supabase, ids)` | /community | `profile_levels.select("user_id, xp, level").in("user_id", ids)` → `Map`; missing = level 1; run in `Promise.all` with `getBulkProfileSummaries` |
| `readProfileLevel(supabase, id, isOwn)` | /u/[id] | the person's `profile_levels` row + (own) `get_my_achievement_progress` or (other) `profile_achievements` joined with `achievements` for order; in the page's existing `Promise.all` |

Types in the plain module `src/lib/levels/types.ts` (`LevelSnapshot`, `XpEvent`,
`XpKind`, `AchievementKey`, `ProfileLevel`, `Toast`), imported with `import type` by the
`"use server"` file `src/lib/levels/actions.ts`, which exports only
`markXpSeen(ids: number[], welcome: boolean): Promise<void>` (validates ≤ 100 positive
integers, calls the RPC, never revalidates, never refreshes). A Supabase token refresh
inside it may still write a cookie, which re-renders the page once (Next's cookie rule) —
harmless, the ids are already seen.

`database.types.ts` gains the five tables (each with `Relationships: []`) and the three
functions.

## 7. Triggers and Rule 1

### 7.1 Every trigger

```sql
create trigger wines_xp_on_reveal after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.xp_on_glass_revealed();
create trigger tastings_xp_on_close after update of status on public.tastings
  for each row when (new.status = 'CLOSED' and old.status is distinct from 'CLOSED')
  execute function public.xp_on_tasting_closed();
create trigger cellar_lots_xp_insert after insert on public.cellar_lots
  for each row execute function public.xp_on_cellar_lot();
create trigger cellar_lots_xp_update after update of purchased_quantity, quantity on public.cellar_lots
  for each row when (new.purchased_quantity > old.purchased_quantity or new.quantity > old.quantity)
  execute function public.xp_on_cellar_lot();
create constraint trigger cellar_consumptions_xp after insert on public.cellar_consumptions
  deferrable initially deferred for each row execute function public.xp_on_cellar_consumption();
create trigger wset_notes_xp_insert after insert on public.wset_notes
  for each row execute function public.xp_on_wset_note();
create trigger wset_notes_xp_identity after update of catalog_wine_id, unidentified_wine_id on public.wset_notes
  for each row when (old.catalog_wine_id is distinct from new.catalog_wine_id
                     or old.unidentified_wine_id is distinct from new.unidentified_wine_id)
  execute function public.xp_on_wset_note();
create trigger training_attempts_xp after insert or update of scored_at on public.training_attempts
  for each row when (new.scored_at is not null)
  execute function public.xp_on_training_scored();
create trigger friendships_xp after insert on public.friendships
  for each row execute function public.xp_on_friendship();
create trigger profiles_deleted_drop_levels after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.xp_drop_deleted_profile();
```

| Trigger | Does | Write paths it catches (audited) |
|---|---|---|
| `wines_xp_on_reveal` | For every guess on the glass, in participant `user_id` order: `xp_award_guess(…, check => true)`. Then for the glass's pour (`wine_pour_intents.cellar_consumption_id where wine_id = new.id`): `xp_award_drink(…, require_lot => false)` — the reveal is what unmasks it. | `reveal_wine` (host, a participant when all have locked, the ASYNC auto-reveal via `maybeAutoRevealWine`, the demo seed); the last step of `reveal_next_category`. Both score the guesses before setting `is_revealed`. `score_own_guess` never sets it (L12). Name order: after `semi_blind_release_revealed_wine` and `trg_catalog_wine_unmark_blind` (which deletes the pour's `flight_holds` row), before `wset_notes_resolve_on_reveal`. |
| `tastings_xp_on_close` | For every seat of the tasting plus the host, in `user_id` order: `xp_award_tasting_close(t, u, …, check => true)` (the check covers `winner`). | `finishTasting` (the only app path), `scrub_deleted_account` step 2 (a deleted host's rows go at step 7, L27); a reopen (`reopenTasting`) then a second close pays only new qualifiers. |
| `cellar_lots_xp_*` | Insert: `xp_award_cellar_lot(id, 0, purchased_quantity)`. Update: `xp_award_cellar_lot(id, old.pq, new.pq)` when it grew; the cellar check whenever `quantity` grew. | `add_cellar_lot` (add-wine sheet cellar adds, /cellar/new), `import_cellar_lot` (CSV), `increaseCellarLotQuantity` ("+1 bottle", `addBottles`, the merge card's "Add N to the existing lot"), `updateLot` (quantity only: check, no XP), direct client writes (RLS own rows). Decreases (`consume_cellar_lot`, both pour RPCs) skip on the WHEN clause at no cost. |
| `cellar_consumptions_xp` (deferred) | At COMMIT: `xp_award_drink(new.id, now(), false, true, require_lot => true)`; skips if the row is gone, not DRANK, lot-less or masked. | `consume_cellar_lot` (drink sheet, NewNoteModal's Taste & rate draw-down), `pour_cellar_lot_into_glass` and `draw_down_flight_cellar_lots` (masked → paid at the reveal), direct client inserts. |
| `wset_notes_xp_*` | Insert: `xp_award_note`. Identity change: the notes check only. | `save_wset_note` (note editor, NewNoteModal, hidden-glass notes), `record_training_attempt` (TRAINING: no note XP), `wset_notes_resolve_on_reveal`, `wset_notes_glass_resolve_on_write`, `resolve_unidentified_wine`, `merge_catalog_wines`, direct client writes. `save_wset_note` rewrites `catalog_wine_id` on every save; the WHEN clause makes an unchanged save free. |
| `training_attempts_xp` | `xp_award_training`. | `record_training_attempt` (a fresh scored attempt inserts scored; an unscored attempt is scored later by an UPDATE; "already revealed" refuses a second scoring). No client write grant exists. |
| `friendships_xp` | The friends check for `new.user_id`. | `accept_friend_request`, `send_friend_request` (auto-accept), `accept_platform_invite` (both rows). |
| `profiles_deleted_drop_levels` | Deletes the person's `xp_events`, `profile_achievements`, `profile_levels`. | `scrub_deleted_account` step 7 (self-service and dashboard deletes). |

No trigger and no index touches `guesses`: its autosave, lock and Realtime paths are
unchanged.

### 7.2 Rule 1 by source

| Source | When the public number moves | Why no unrevealed glass can be learned |
|---|---|---|
| Guess XP, perfect_glass, glasses_50 | at the glass's global reveal | Points and answer keys are public from that moment anyway (L11, L12). |
| Finish / host / winner / first_tasting | at close, counting revealed glasses only | A glass still hidden in a closed tasting never counts. |
| D11 pour at Start (`draw_down_flight_cellar_lots`) or into a running flight (`pour_cellar_lot_into_glass`) | nothing moves until that glass's reveal | The deferred trigger sees the pour intent and the `flight_holds` row and skips; on-hand (cellar_25/100) counts the masked bottle as still in the cellar; no drink XP, no first_drink, no pop-up. At the reveal the drink is paid (+15, "Bottle opened"). |
| A masked pour whose glass is removed or whose tasting is deleted before its reveal | never | The hold stays for good (OD4); everyone but the owner counts the bottle as unopened, and so does XP. |
| Cellar add | at the add | A count of bottles names no wine, even when the lot's wine is `blind_pending`. |
| Note XP, note counts | at the write, hidden-glass notes included; a note sharing-defaults holds, at the reveal that releases it (§14 A1) | A count names no wine; a held note is tonight's wine in its adder's hands, so it moves nothing until then. |
| note_countries_10 | when a note gets an identity on a wine with `blind_pending = false` and is not held | Identity-less notes, notes on hidden wines and held notes never count; a hidden-glass note counts once `wset_notes_resolve_on_reveal` gives it the revealed identity, a held one once its last holding glass is revealed. |
| Training | at the round's scoring | The round is solo practice; the XP delta carries points, not identity. |
| Friends | at the friendship | No wine involved. |

The pop-up for a guess, a drink or a finish reaches only its owner (`xp_events` is
owner-only), and only after the reveal or close that made it.

### 7.3 Performance of the hot paths

- A reveal with n guessers adds n × (one PK lock + a cap-free insert + an update) plus the
  locked tastings achievements' metrics (a veteran with first_tasting etc. unlocked skips
  them). Expected single-digit to low tens of ms for n ≤ 10; the DB suite logs the timing
  of an 8-guesser reveal (logged, not asserted — the pooler round trip dominates).
- The pour and consume paths gain one deferred trigger run per consumption: a PK re-read,
  the `flight_holds_consumption_key` lookup and a scan of `wine_pour_intents` by
  `cellar_consumption_id` (no index there — the same scan `catalog_wine_masked_pours`
  already does; the table holds only open pour intents, 0 rows live).
- AppHeader gains one RPC per render inside its existing `Promise.all` (the bell's
  `getPendingInvites` already takes 575–2,773 ms there), so no added latency; the query is
  a PK read plus the partial unseen index. AppShell gains one PK read in parallel with its
  profile read. /community gains one `.in()` read in parallel. No interval, no poller.

## 8. UI

### 8.1 Pop-ups (toaster)

Files: `src/components/levels/awards-feed.tsx` (client; rendered by AppHeader with the
snapshot; renders null; `useEffect` publishes it to `src/lib/levels/level-store.ts`),
`src/components/levels/awards-toaster.tsx` (client; mounted once in AppShell inside the
providers; subscribes with `useSyncExternalStore`), pure rules in
`src/lib/levels/toasts.ts`, copy in `src/lib/levels/copy.ts`.

Store: keyed by `userId` (a sign-out and sign-in in the same tab is a soft navigation, so
module state survives it); keeps the newest `{ xp, level }` by highest `xp`, the set of
event ids already queued or shown, and the welcome flag. Snapshots from every render are
merged; an id seen before is ignored.

`buildToasts(newEvents, { welcome, level, checkedAt })` → `Toast[]`:

1. Welcome (when `welcome`): title "You're level {n}", detail (xp > 0) "Levels are here —
   your tastings, cellar and notes so far already count." or (xp = 0) "Levels are here —
   taste, cellar and note wines to earn XP.", 6 s.
2. One XP card for the non-achievement events: events older than `checkedAt − 10 min` make
   it "+{sum} XP while you were away"; otherwise "+{sum} XP · {label}" where one kind gives
   its label (below), two kinds "{label1} & {label2 lowercased}", more "{label1} & more"
   (labels ordered by XP).
3. One achievement card: "Achievement · {name}", detail "+{bonus} XP"; two or more:
   "{n} achievements · {name1}, {name2}", detail "+{sum} XP".
4. One level-up card when `levelForXp(last.xp_after) > levelForXp(first.xp_after −
   first.xp)` (events sorted by `xp_after`): "Level up · You're level {highest}", filled
   `bg-gold text-on-accent`.

Labels: guess/guess_match "Glass revealed" / "{n} glasses revealed"; tasting_finished
"Tasting finished"; tasting_hosted "Tasting hosted"; cellar_add "Bottle added" / "{units}
bottles added"; drink "Bottle opened" / "{units} bottles opened"; note "Tasting note" /
"{n} tasting notes"; training "Training round" / "{n} training rounds". The owner's three
examples render exactly: "+40 XP · Tasting finished", "Level up · You're level 4",
"Achievement · Serious cellar".

Display: container `fixed z-[60] pointer-events-none flex flex-col gap-2`; from `md`
`right-4 bottom-4 w-80`; below `md` `inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]`.
Cards `pointer-events-auto rounded-xl border border-border bg-card text-card-foreground
shadow-lg px-3.5 py-2.5`, a lucide icon (Sparkles / Trophy / ChevronsUp), the "+N XP" part
in `text-gold-dark` (6.23:1 on `--background` light; `#d4af6a` in dark). At most three
visible, newest at the bottom, the rest queued FIFO. Each stays 4 s (welcome 6 s); hover or
focus-within pauses; a click dismisses. Enter `motion-safe:animate-in
motion-safe:fade-in motion-safe:slide-in-from-bottom-2`, exit a 150 ms fade, both off under
reduced motion. A single visually hidden `role="status" aria-live="polite"` node receives
each card's text once when it appears; the cards themselves are not focusable (non-blocking,
non-essential status).

Marking seen: when a card first becomes visible, the toaster calls
`markXpSeen(card.eventIds, card.welcome)` once; a failure keeps the ids in the tab's
shown-set (no repeat in this tab; a later render may show them in another). While
`document.visibilityState === "hidden"` nothing is shown or marked; the queue starts on
`visibilitychange`. A `BroadcastChannel("blindr-awards")` message `{ userId, ids }` adds
another tab's shown ids to this tab's set (absent API: no dedupe; a duplicate card is
harmless).

### 8.2 The ring

`src/components/levels/level-ring.tsx` — hook-free, so server components can render it:

```ts
LevelRing({
  level: number; xp: number;
  size: number;                     // outer diameter, px
  tone: "sidebar" | "surface";
  labelled?: boolean;               // true: role="img" + aria-label; false: aria-hidden
  className?: string;
  children: ReactNode;              // the avatar, sized size − 2·(stroke + gap)
})
```

`src/components/levels/live-level-ring.tsx` (client) wraps it for the viewer's own ring:
`useOwnLevel(userId, initial)` reads the store, falls back to `initial`; no data at all →
the bare avatar, never a false 0 %.

Geometry: stroke 2.5 px and gap 1.5 px below 64 px, 3 px and 2 px from 64 px. The track and
the fill are one circle drawn as an arc of `360° − g` (g worked out from the badge, §14 A5:
34 px 109°, 40 px 86°, 74 px 52°, 90 px 42°; first drafted as a fixed 50°/36°, which the
badge and its halo overlapped) starting at 12 o'clock + g/2, clockwise, computed in px
(`strokeDasharray`), so the gap sits
under the badge and no progress hides beneath it; fill length = arc × `fraction`;
`motion-safe:transition-[stroke-dashoffset] duration-700`. Badge: centred on the top edge,
`bg-gold text-on-accent font-semibold tabular-nums rounded-full`, 14 px tall / 9 px text
below 64 px, 20 px / 12 px from 64 px, `ring-2` in the surrounding colour (`ring-primary` on
the sidebar, `ring-background` on the page) to separate it from the arc.

| Tone | Track | Fill | Measured |
|---|---|---|---|
| sidebar (bordeaux panel, both themes) | `stroke-primary-foreground/20` | `stroke-gold` | gold on `#5c1a2b` 5.28:1 light, `#d4af6a` 6.19:1 dark |
| surface (/u/[id]) | `stroke-border-light` | `stroke-gold-deep` | light `#b78e42` on `--background` 2.63:1 (supplementary: the card below states the numbers in text and the ring carries an aria-label); dark `#c3a25b` on `#1b1310` 7.53:1 |
| badge | — | `bg-gold text-on-accent` | `#2a211e` on `#c3a25b` 6.47:1 light, on `#d4af6a` 7.60:1 dark |

Label (`ringLabel`): "Level {n}, {into} of {span} XP to level {n+1}"; at 60: "Level 60,
the top level". Where the ring sits inside a link, the ring is `aria-hidden` and the link
carries "{name}, level {n}, {into} of {span} XP to level {n+1}" (the visible name first,
2.5.3).

Placements:

| Where | Avatar | Ring | Notes |
|---|---|---|---|
| Sidebar full (xl) and the tablet drawer (`SidebarBody variant="full"`) | 32 px | 40 px, sidebar tone | `UserAvatar` wrapped; the profile row gets `pt-2` for the badge |
| Sidebar rail (md–xl) | 26 px (was 30) | 34 px, sidebar tone | inside the existing 44 px `size-11` link, `mt-1.5`; the link's `aria-label` gains the level |
| Phone drawer (`MobileNav`) | 32 px | 40 px, sidebar tone | initial from AppHeader's snapshot (`level`, `xp` props) |
| /u/[id] `ProfileHeader` | 80 px (64 phone) | 90 px (74), surface tone, `labelled` | own profile: `LiveLevelRing`; others: `LevelRing` from `readProfileLevel` |

`AppSidebar` receives `level: { xp, level } | null` from AppShell and renders `LiveLevelRing`
in both variants.

### 8.3 Community

`CommunityRow` gains `level: number`. `LevelPill` (`src/components/levels/level-pill.tsx`):
`inline-flex h-5 items-center rounded-full border border-gold-deep/50 px-1.5 text-[11px]
font-semibold tabular-nums text-gold-dark` (6.23:1 light, 8.15:1 dark on `--card`),
content `<span aria-hidden>Lv {n}</span><span className="sr-only">Level {n}</span>`, placed
after the name and the "You" badge in both the phone/tablet cards and the xl table's Person
cell. Every listed person gets one (level 1 when there is no row). No sort by level.

### 8.4 /u/[id] "Level & achievements" card

`src/app/u/[id]/level-card.tsx` on the `StatCard` shell (`src/app/profile/numbers/stat-card`),
placed directly under `ProfileHeader` (L32). Collapsed: "Level {n}" · "{xp} XP in all", a
6 px bar (`bg-gold-deep` on `bg-secondary`) with "{into} / {span} XP to level {n+1}" (or
"Top level"), and up to six earned-achievement chips (category icon + name). A plain
`<button aria-expanded>` "All achievements" / "Fewer" opens: **Earned** (grouped by
category, each with its UTC date "12 Sep 2026", or "Before levels" when backfilled) and, on
your own profile only, **Not yet** (name, description, a thin progress bar and "{progress}
/ {target}", "+{bonus} XP"). Someone else's hidden cellar achievements are simply absent
(no count, no placeholder). Another person with none: "No achievements yet." Icons: cellar
`Boxes`, tastings `Wine`, notes `NotebookPen`, training `GraduationCap`, friends `Users`.
A key the app has no copy for (DB ahead of a deploy) is skipped, never rendered raw.

**Amended 2026-09-28** (owner: 'more in sync with the rest of the design'; see
`2026-09-28-profile-achievements-card-design.md`): the card is rebuilt from the Your numbers
primitives — StatTrio (level · XP in all · achievements, '7/20' on your own profile only),
one AccuracyRows level row (`bg-gold-deep` on `bg-muted`, was `bg-secondary`), Latest/Closest
footer rows; the chips and category icons are gone; the toggle is a text button with a
chevron in the header row; the title is an h2 (Earned/Not yet h3, categories h4); Not yet is
grouped by category with 6px bars; expanded groups flow in 2/3 columns. Rule 1 wording
unchanged: someone else's count is visible-only, never 'of N'. Owner approved the direction
on 2026-09-28; strings provisional.

No new page (the page-wrapper rule is untouched); no Button composed with a Link here, so
no `nativeButton` concerns.

### 8.5 Files

New: the migration; `scripts/levels.test.mjs`; `src/lib/levels/` (`curve.ts`, `copy.ts`,
`toasts.ts`, `types.ts`, `read.ts`, `actions.ts`, `level-store.ts`, their tests,
`__fixtures__/curve.json`); `src/components/levels/` (`level-ring.tsx`,
`live-level-ring.tsx`, `level-pill.tsx`, `awards-feed.tsx`, `awards-toaster.tsx`,
`level-ring.test.tsx`); `src/app/u/[id]/level-card.tsx`.
Changed: `app-header.tsx` (snapshot read, `AwardsFeed`, level props to `MobileNav`),
`app-shell.tsx` (initial level, `AwardsToaster`), `app-sidebar.tsx`, `mobile-nav.tsx`,
`src/app/u/[id]/page.tsx` and `profile-header.tsx`, `src/app/community/page.tsx` and
`community-list.tsx`, `src/app/cellar/new/actions.ts` (L33), `database.types.ts`,
CLAUDE.md.

## 9. Flows (when the pop-up appears)

Pop-ups appear on the next render of an AppHeader after the award commits. Section layouts
(`/cellar`, `/catalog`, `/community`, `/tastings`, `/admin`) render AppHeader in the layout,
which a soft navigation inside the section keeps; a server action that revalidates, a
`router.refresh()`, `RevealSync` and `AutoRefresh` re-render it. That last sentence is read
from Next 16's docs (`02-guides/server-actions.md`: a revalidating action "re-renders the
current route server-side") and from `ActiveTastingBanner`, which already relies on it from
the same layouts — it is the first thing the implementation verifies (§10.3), before any UI
work builds on it.

| Flow | Award | Re-render | Pop-up |
|---|---|---|---|
| Host reveals (lobby, console) | guess (BYO host only) | reveal action's `revalidatePath` | at once |
| Guests watching a LIVE reveal | guess (+ drink for a poured glass's owner) | `RevealSync` `router.refresh()` 20 ms after the `wines` change | ≈ 1 s |
| ASYNC: the last lock auto-reveals | guess for everyone | `lockGuess`'s `revalidatePath` for the locker; others on their next render | at once / later |
| Host finishes | host 40 (+ achievements) | `finishTasting`'s `revalidatePath` | at once |
| Guests of a finished tasting | finish 40, winner | `AutoRefresh` (6 s) on the tasting pages, else the next render | ≤ 6 s |
| Add-wine sheet → cellar (new lot, "+1") | cellar_add | `addToCellar`'s `revalidatePath("/cellar")` | at once, over the open sheet |
| Add-wine sheet merge card "Add N to the existing lot" | cellar_add | L33's `revalidatePath` in `increaseCellarLotQuantity` (today: only the sheet's close-time `router.refresh()`) | at once |
| Lot sheet "Add bottles" | cellar_add | `revalidatePath` + `router.refresh()` | at once |
| /cellar/new form (new lot or merge) | cellar_add | L33's `revalidatePath("/cellar")` | at once |
| Drink sheet | drink | `router.refresh()` via `onChanged` | at once |
| Note editor / NewNoteModal save | note | `router.refresh()` after the save | at once |
| Taste & rate's draw-down after the note | drink | the consume RPC runs after NoteEditor's refresh | next render |
| Training reveal | training | `revalidatePath` + `router.refresh()` | at once |
| Friend request accepted | first_friend (both) | `acceptFriendRequest`'s `revalidatePath` for the acceptor | at once / requester later |
| Platform invite accepted | first_friend (both) | the accept route's redirect | first page |
| D11 draw-down at Start, pour into a running flight | none until the reveal | — | at the reveal |

## 10. Tests

### 10.1 DB suite `scripts/levels.test.mjs`

The training-room harness: production, every test in a transaction that always rolls back,
throwaway profiles/tastings/wines; `LEVELS_APPLY=<migration>` applies the file inside each
test's transaction for the dry run. Deferred triggers fire only at commit, so drink tests run
`set constraints all immediate` inside the transaction after the write.

1. `level_for_xp` equals `__fixtures__/curve.json` for every row.
2. Post-state: policies, grants, EXECUTE holders, trigger definitions and the `wines`
   trigger name order; the `xp_sources`/`achievements` seeds; `achievements` keys equal the
   keys in `src/lib/levels/copy.ts` (read as text).
3. BLIND reveal via `reveal_wine`: each guesser gets `guess:<id>` = 10 + points; a blank
   locked guess gets nothing; the HOST_PROVIDES host nothing; no second row on any re-run.
4. `reveal_next_category`: nothing until the last step; then the final points.
5. ASYNC IMMEDIATE: `score_own_guess` pays nothing; the later global reveal pays.
6. SEMI_BLIND: matched 20, unmatched 10, unassigned (blank) nothing.
7. Close: qualifying guests 40, a JOINED guest with no scored guess nothing, INVITED and
   DECLINED nothing, host 40 only with another JOINED seat; no revealed glass → nothing;
   OPEN mode → nothing; reopen + close → no duplicate; the fourth finish of a UTC day → no
   row.
8. Winner: 3 players → the top gets `winner` (+100); a tie → both; 2 players → none; top 0
   → none.
9. Cellar: `add_cellar_lot` 5 → 25 XP, units 5; +3 on `purchased_quantity` → 15; a 30-bottle
   lot → 100 (20 × 5); across one UTC day the award that crosses 100 is clamped and later
   ones write no row;
   an Edit-lot `quantity` change → no XP; a decrease then an increase back to a reached level
   → no duplicate.
10. Drinks: `consume_cellar_lot` DRANK 2 → 30 after `set constraints all immediate`; GIFTED
    → nothing; quantity 10 → 90 (6 × 15); the 90/day cap; a lot-less direct insert → nothing.
11. Masked pour: `pour_cellar_lot_into_glass` into an unrevealed glass → no drink row at
    commit, the on-hand metric unchanged, no achievement; reveal → `drink:<id>` = 15 and
    first_drink; a removed glass → never. The same through `draw_down_flight_cellar_lots`
    at Start. Another member reading the owner's `profile_levels.xp` sees no change until the
    reveal.
12. `xp_consumption_masked` agrees with `catalog_wine_masked_pours` on the same fixtures.
13. Notes: OPEN 20; the sixth note of a UTC day nothing; TRAINING nothing (but counted by
    first_note); a hidden-glass BLIND note 20 at insert; note_countries_10 ignores
    identity-less notes and `blind_pending` wines and counts a hidden-glass note after its
    reveal; an unchanged `save_wset_note` re-save does no work.
14. Training: a fresh scored attempt 20 + total; an unscored insert nothing, its later
    scoring pays once; the sixth round of a day nothing; `training_ace` on total =
    possible.
15. Friends: `accept_friend_request` → both first_friend; the tenth friend → friends_10.
16. RLS: another member reads `profile_levels` and public achievements; a `cellar_100` row
    is visible to the owner, to anyone for a PUBLIC cellar, to friends only for FRIENDS, to
    nobody else for PRIVATE; nobody reads another's `xp_events`; anon reads nothing.
17. `mark_xp_seen`: marks only the caller's ids, ignores others', idempotent; clears
    `welcome_pending`; refused without a user.
18. `get_my_level_state`: shape, defaults with no row, oldest 50 unseen.
19. Deletion: `scrub_deleted_account` removes the person's rows; a later reveal in a tasting
    where their JOINED seat stays pays them nothing; a scrub-closed tasting pays its guests.
20. Error isolation: with `alter table xp_events add constraint xp_fail check (false)` in the
    test transaction, `reveal_wine`, `consume_cellar_lot` and `save_wset_note` still succeed,
    with no ledger rows and a WARNING.
21. Replay parity: history created with live triggers, the ledger deleted, then
    `xp_replay_user(u, true, false, false)` → the same keys and XP.
22. Timing: an 8-guesser reveal's duration is logged.

### 10.2 Vitest

- `src/lib/levels/curve.test.ts`: thresholds, `levelForXp`, `levelProgress`, the cap, the
  fixture.
- `src/lib/levels/copy.test.ts`: twenty keys, each with name/description/category; labels
  singular/plural; `ringLabel` including level 60; welcome variants; the owner's three
  example strings.
- `src/lib/levels/toasts.test.ts`: one XP card per render, kinds merged, catch-up after
  10 min, achievements merged at ≥ 2, level-up to the highest level across several, welcome
  first, ≤ 3 cards per batch, already-shown ids dropped.
- `src/lib/levels/level-store.test.ts`: keyed by user, highest XP wins, ids deduped.
- `src/components/levels/level-ring.test.tsx` (react-dom/server, like
  `sheet-markup.test.tsx`): aria-label or aria-hidden, badge text, dash lengths at 0 %,
  37 %, 100 %.

### 10.3 Browser checklist (production build; laptop and phone emulation; light and dark)

Front the Browser pane (a hidden pane never hydrates and never shows a card).

- Sidebar full (xl), rail (md–xl) and tablet drawer: ring, badge, no clipping in the 44 px
  rail link; dark mode.
- Phone drawer ring; /u/[id] own (live) and someone else's; the card collapsed/expanded;
  own "Not yet" progress; a PRIVATE cellar owner's cellar achievements absent for another
  viewer.
- /community cards (below xl) and table (xl): "Lv N" beside every name.
- The welcome card once per account; a reload shows nothing.
- Add a bottle from /cellar (sheet) → "+5 XP · Bottle added" at once; /cellar/new;
  "+1 bottle"; drink; a note; a training reveal.
- Two sessions on a throwaway LIVE tasting: a reveal → the guest's card within ≈ 1 s;
  Finish → the host's card at once, the guest's within 6 s; a level-up card.
- Reduced-motion emulation: no slide, no ring transition. Two tabs: one card. A hidden tab:
  queued until fronted.
- Network idle for 5 minutes: no new periodic request.
- Server timing of an AppHeader page before/after on production (the owner's devices:
  desktop and iPhone Safari/Chrome).

## 11. Rollout

1. Owner go-ahead for this project (a new project asks once).
2. `LEVELS_APPLY=supabase/migrations/20260927120000_levels_and_achievements.sql node
   --env-file=.env.local --test scripts/levels.test.mjs` against production (rolled back).
3. `apply-migration.mjs … --dry`, then apply at a quiet time: `CREATE TRIGGER` takes a
   SHARE ROW EXCLUSIVE lock on `wines`, `tastings`, `cellar_lots`,
   `cellar_consumptions`, `wset_notes`, `training_attempts`, `friendships` and `profiles`
   for the migration's duration (seconds), so no LIVE tasting should be revealing. The
   triggers are created before the backfill in the same transaction, so no fact falls
   between them. Migration first: it is additive and the deployed app ignores the new
   tables.
4. Read-only check: `profile_levels` against §3.2 (differences only from activity since).
5. App deploy (staged push to master, live smoke on blindrapp.vercel.app: welcome card,
   ring, community, a cellar add). Awards earned between steps 3 and 5 arrive as one "while
   you were away" card after the welcome.
6. CLAUDE.md bullet (tables, triggers, L20/L21, the toaster architecture, "any new count
   over `cellar_*` or `wset_notes` shown publicly must follow Rule 1", the repair function).

### Rollback

- App: `git revert` + push; the triggers keep awarding silently (harmless).
- A misbehaving trigger without a revert: `alter table … disable trigger <name>` (owner
  only), then `xp_replay_user(u, false, false, true)` per person once fixed.
- Full DB rollback (after the app revert):

```sql
drop trigger if exists wines_xp_on_reveal on public.wines;
drop trigger if exists tastings_xp_on_close on public.tastings;
drop trigger if exists cellar_lots_xp_insert on public.cellar_lots;
drop trigger if exists cellar_lots_xp_update on public.cellar_lots;
drop trigger if exists cellar_consumptions_xp on public.cellar_consumptions;
drop trigger if exists wset_notes_xp_insert on public.wset_notes;
drop trigger if exists wset_notes_xp_identity on public.wset_notes;
drop trigger if exists training_attempts_xp on public.training_attempts;
drop trigger if exists friendships_xp on public.friendships;
drop trigger if exists profiles_deleted_drop_levels on public.profiles;
drop table if exists public.profile_achievements, public.xp_events, public.profile_levels,
  public.achievements, public.xp_sources;
-- then drop every function in §5.3; the two indexes may stay.
```

## 12. Residuals

- R1 XP and levels are public, so aggregate activity is visible, including XP from a private
  cellar and the bonus of a hidden cellar achievement (a +150 jump); no wine identity.
- R2 An ASYNC-IMMEDIATE guess on a glass never globally revealed (closed first) earns
  nothing (L12).
- R3 A masked pour whose glass is removed or deleted before its reveal never earns drink XP
  (OD4 parity).
- R4 `cellar_lots` and `cellar_consumptions` are client-writable: crafted writes can farm up
  to 100 + 90 XP per day and unlock cellar achievements early (one-time bonuses).
- R5 Alt accounts can farm tastings within 3 finishes and 3 hosts per day; guess XP is
  uncapped.
- R6 note_countries_10 is re-evaluated lazily: a note on a wine that un-hides later counts
  at the author's next notes event.
- R7 The winner counts fully revealed glasses only; the PER_ATTRIBUTE standings can differ
  when a glass is left mid-step at close.
- R8 Inside a section layout, a pop-up for an award the viewer did not cause waits for the
  next refresh, revalidation or navigation out.
- R9 The five seed demo profiles show levels 3–5.
- R10 A swallowed XP error is visible only as a Postgres WARNING (no alert) until
  `xp_replay_user` runs.
- R11 Backfilled achievements have no date ("Before levels").
- R12 Two tabs rendering the same unseen award at the same instant can both show it.
- R13 While a modal dialog is open (the add-wine sheet), assistive technology may not
  announce the toaster (the dialog can make the rest of the page inert); the card still
  shows.
- R14 On phones a card can cover a fixed bottom bar (the tasting start bar) for up to 4 s.
- R15 There is no opt-out of showing one's level.
- R16 This branch's `database.types.ts` will conflict with `training-region-guess`'s when
  both merge; resolve by keeping both sets of changes.
- R17 The notes achievements (`first_note`, `notes_25`, `notes_100`, `note_countries_10`)
  are gate `public` whatever the author's `notes_visibility` (sharing-defaults S2): a
  person whose notes are "Only me" still shows "Critic" or "Well travelled" to every member.
  They carry counts, never a note or a wine (R1 already makes aggregate activity public).
  Owner decision pending: a `notes` gate following `can_view_notes`, the way cellar
  achievements follow `can_view_cellar`, is the alternative (§14 A4).
- R18 A held note is paid by the reveal that releases it only when it is on that glass's
  catalog wine or its pour's wine, or linked to its pour. A note held by a glass that was
  later Swapped to another wine without a pour is released at that reveal but paid only by
  a repair (`xp_replay_user(u, false, false, true)`); its count and country still count at
  the author's next notes event (R6).
- R19 A cellar-add pop-up names the bottles PAID: a lot that crosses its 20-bottle life cap
  by growth (18 → 25) says "2 bottles added". An award that reached the cap itself (a new
  24-bottle lot, 10 bottles opened at once) names no count ("Bottles added" / "Bottles
  opened", §14 A6).

## 13. Controller rulings (2026-09-27, binding on the plan)

- **C1 Migration version `20260927160000_levels_and_achievements.sql`**, not `…120000`: it sorts after the sharing-defaults migrations (`20260927140000`, `20260927150000`), which land first. The file stays independent of them (it pins none of their objects); its `wset_notes (author_id)` index stays even though sharing adds a composite index led by `author_id` (negligible cost, no cross-migration dependency).
- **C2 Go-ahead.** The owner approved the design ("Go ahead", 2026-09-27) and has authorised pushes and applies for this work; §11 step 1 is satisfied. Every apply is dry-run first and done when no LIVE reveal is running.
- **C3 Copy.** §8's drafts ship as written; the owner reviews them live and changes follow as copy edits.
- **C4 Order across branches.** `training-region-guess` and then `sharing-defaults` merge to master first; this branch rebases onto master before its final review and deploy. `database.types.ts`, `CLAUDE.md`, `src/app/u/[id]/page.tsx` and `profile-header.tsx` may conflict: keep both sides. Re-check the §5.4 md5 pins against live at dry-run time (sharing recreates `shared_cellar_lots` and `catalog_wine_usage`, which this file does not pin).

## 14. Whole-branch review amendments (2026-09-27)

- **A1 Held notes (amends C1's "pins none of their objects").** Under sharing-defaults
  (S9-S11) a note is *held* while its author adds an unrevealed glass of its wine, holds a
  scored ASYNC IMMEDIATE guess on one, or while its linked pour is masked; a held note must
  move no count others see. So
  `xp_award_note` pays no held note, the four notes metrics leave held notes out, and
  `xp_on_glass_revealed` gains a third step, inside the same `user_id` order (L34): for the
  glass's adder, each pour owner and, in an ASYNC IMMEDIATE tasting, each guesser (the one
  case the hold names a guesser; elsewhere a capped note stays lost, L16) it pays their
  unpaid notes on the glass's catalog wine or
  its pour's wine, or linked to its pour (unless another unrevealed glass still holds them),
  then runs the notes check. Without it, a host with visible notes from 9 countries who
  notes tonight's public wine from a tenth would unlock "Well travelled" (+100) before the
  reveal, telling guests tonight's country. The migration now REQUIRES sharing-defaults M1:
  the pre-state pins `wset_note_held`, `wset_notes_hold_on_identity` and
  `wines_release_note_holds` and accepts only the four-trigger `wines` set. DB test 13c.
- **A2 The deletion race.** `xp_award` and `xp_check_achievements` take the profile row FOR
  SHARE for the deleted-profile check, which conflicts with the scrub's UPDATE of
  `deleted_at`, so an award racing an account deletion either lands before the scrub (which
  then drops it) or re-reads the profile as deleted and pays nothing (L27).
- **A3 The repair.** `xp_replay_user` gains `p_repair`: a lot-less DRANK row pays only when a
  pour links it (the live rule), and every fact's time is clamped to on or after the
  account's `created_at` (and never after now), so a row dated before the account cannot
  open an older cap bucket. It still re-derives from the rows as they are now, so it is run
  only for a person whose cellar and notes rows have been checked. The backfill passes
  `false`. DB test 21b.
- **A4 Notes achievements' gate:** left `public` and recorded as R17 for the owner.
- **A5 The ring's gap** is worked out from the badge (§8.2), so no progress hides under the
  badge or its halo at a two-digit level.
- **A6 Capped bottle counts.** A cellar-add or drink row whose paid bottles reached the
  kind's unit cap (20, 6) labels its pop-up "Bottles added" / "Bottles opened" instead of a
  number that may be lower than the real one. New copy, for the owner's live review (C3).
