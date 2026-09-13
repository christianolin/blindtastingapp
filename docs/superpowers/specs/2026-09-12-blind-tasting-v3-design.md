# Blind tasting v3 — the evening, end to end

Design spec · 2026-09-12, revised 2026-09-13 after three critiques · base `master` at `3d4c270`, with add-wine v2 wave C in flight

- **Binding ledger:** `.superpowers/blind-tasting/decisions.md` (Precedence, Sequencing, B0–B14, "B13 outcome", "B13.4 outcome", Reversals, Not adopted, Q1–Q6).
- **Handoff:** `.superpowers/blind-tasting/README.md`, `canvas-text.txt` (the paragraph under each `#### [ID]` anchor is that screen's spec), `Blindr Blind Tasting.dc.html`.
- **Maps:** `map.json` (371 verified items: `CREATE-`, `LOBBY-`, `GUEST-`, `HOST-`, `PLAY-`, `REVEAL-`/`RESULT-`/`RECORD-`, `SB-`, `XCUT-`), `critic.json` (`MISSED-01`…`07` and corrections), `reconcile.json`.
- **Upstream plans this spec builds on:** `docs/superpowers/plans/2026-09-12-add-wine-v2-scan-and-flow-fixes.md` (Global Constraints, Amendments 1–20, `.superpowers/add-wine-v2/owns.json`, and its G1–G4 and V1–V3 gates), `.superpowers/taste-rate/decisions.md` (R1–R6).

---

## 0. How to read this spec

### 0.1 State of the code this spec was verified against

Verified on 2026-09-12/13 against the working tree and a read-only probe of the live database (`begin read only … rollback`; the output stayed in the session scratchpad, not in the repo).

| Stream | Committed | In flight (not on `master` yet) |
|---|---|---|
| Add-wine v2 | F1–F11, T1–T11, T13, T14, L1, plus F5x, T2x, F7x; amendment 20 (`a1399c6`, the reducer keeps a read's turn) | F12 (in the tree: `src/components/add-wine/sheet-state.ts`, `use-camera.ts`), F13, T12, S1–S7, then G1 → (G2 ∥ G4) → G3 → V1 → V2 → V3 |
| Blind tasting lane N | `20260912090000`, `091000`, `092000`, `093000` applied live; `src/lib/result-math.ts`, `semi-blind-candidates.ts`, `tasting-eyebrow.ts`, `relative-day.ts`, `ics.ts`, `src/app/tastings/[id]/calendar.ics/route.ts`; `wine-label.ts` numbers by list order | — |
| Taste & Rate | R1–R5 (`/taste` All tastings, `/taste/notes`, `src/components/tastings/invitation-row.tsx`) | R6 (after S5c) |
| Overview phone redesign | `ea8cf26` | — |

Live facts this spec relies on (probe, 2026-09-13):

- `tastings` has `current_wine_id uuid` (FK to `wines`, `on delete set null`) and `opens_at`; no row uses either. There is no `location`, `paused_at`, `started_at` or `finished_at`. `authenticated` holds UPDATE on every `tastings` column and `tastings update host` checks `host_id` only, so nothing in the database stops a host changing `reveal_mode`, `timing_mode` or `wine_source` after Start.
- `wines` has `reveal_step int2` and `added_via text`; there is no `revealed_at` and no `updated_at`.
  - `authenticated` (and `anon`) hold UPDATE on every `wines` column, and `wines update host` checks only that the caller hosts the tasting. A host can therefore write `contributor_participant_id`, `is_revealed` and `reveal_step` directly.
  - `wines_contributor_participant_id_fkey` is `ON DELETE SET NULL`, and `participants delete host` lets the host delete any participant row. So "contributor is null" — the test every "host-added" check uses today (`wine_answers read`, `is_wine_adder`) — is something a host can make true.
- `get_wine_reveal` (SECURITY DEFINER; JOINED and host) returns `in_play_count` at every step, step 0 included, and its LIVE branch reads `wines.reveal_step`.
- `guesses_guessed_wine_id_fkey` is `ON DELETE SET NULL`; `guesses_block_after_reveal` (BEFORE INSERT OR UPDATE, invoker) raises whenever the row's own glass is revealed.
- `save_wset_note(p_note, p_aromas)` (SECURITY INVOKER) never writes `unidentified_wine_id`, and on update sets `catalog_wine_id` straight from the payload.
- `participants update own or host` lets a participant or the host write `joined_at`.
- `generate_join_code` draws 6 characters; one live tasting has a code.
- Every glass of an `OPEN`-mode tasting is revealed (live count of unrevealed OPEN glasses: 0); no bring-your-own glass has a null contributor; no `wset_notes` row points at an unrevealed glass.
- `wine_answers.producer_id` and `vintage_kind` are NOT NULL live (ledger "Live drift").
- `wset_notes.catalog_wine_id` is nullable; `wset_notes_one_identity` requires exactly one of `catalog_wine_id` / `unidentified_wine_id`; `wset notes read` and `wset note aromas read` are `using (true)`; `wset_note_aromas.note_id` cascades on delete.
- `guesses`: unique `(wine_id, participant_id)`; `authenticated` holds column INSERT/UPDATE on exactly the 14 client columns (093000) and table-level SELECT.
- `wine_answers read` = `has_scored_guess(wine_id)` OR host OR `is_revealed` OR contributor OR (`SEMI_BLIND` AND `is_tasting_participant`). `wine_answers update` lets the host update any answer key of their tasting, revealed or not.
- `in_play_steps(uuid)` is SECURITY DEFINER and EXECUTE-able by `PUBLIC`, `anon` and `authenticated`. Nothing in `src/` calls it.
- `join_tasting_by_code` refuses `CLOSED` and every started non-`OPEN` tasting, and upserts JOINED over any non-JOINED row with `joined_at = coalesce(joined_at, now())`. `generate_join_code` draws 6 characters from a 32-letter alphabet (about 30 bits).
- `merge_catalog_wines` and `resolve_unidentified_wine`, the only SQL writers of `wine_answers` outside the flight, are SECURITY DEFINER.
- Migration tail, live: `20260913150000`, `160000`, `170000`, `180000` (`germany_franken_promote`, upstream wine-map). The local `origin/master` ref (`5a44457`) lags at `20260913160000`, so version checks run after a fresh `git fetch origin` (§1.6). The add-wine set `20260912100100`…`106000` (no `105000`) is live.

### 0.2 Conventions in this document

- Each decision section has the same parts: **Screens**, **Current state** (with `file:line` at `ef4f2f3`, re-checked at `3d4c270`), **Change**, **SQL**, **Tests**, **Verification**, **Owner default**.
- A file owned by an in-flight add-wine task is marked with that task, for example `page.tsx` (S7). Line numbers and add-wine contracts are re-verified against the landed code by the plan's BT-A0, once add-wine V2 is done.
- Text in "double quotes" inside a Change list is UI copy, verbatim from the handoff unless the ledger changes it. Copy this spec had to write, because the handoff draws nothing there, is marked **(spec copy)**.
- SQL is written as the intended statements. §15 groups them into migrations; versions are chosen at implementation time.

---

## 1. Precedence and scope

### 1.1 Precedence (the ledger's order)

1. **Owner instructions.** The handoff is owner-commissioned: "a complete redesign of the blind tastings UX and flow".
2. **Invariants that are not UX:**
   - one definition of a complete wine (`src/lib/wine-identity`, add-wine D2);
   - `reveal_wine`, `reveal_next_category` and `score_own_guess` stay the only scoring engine, with CLAUDE.md's point values;
   - nobody sees an unrevealed wine they did not add (handoff rule 1);
   - cross-table RLS goes through SECURITY DEFINER helpers;
   - guess inputs are controlled React state (AutoRefresh);
   - comboboxes keep-mount and focus synchronously;
   - producers and appellations are never preloaded.
3. **This handoff** for the tasting flow's UX, flow and copy. Where it contradicts a CLAUDE.md line that records an earlier UX or flow choice, the handoff wins and that line is rewritten (§1.4).
4. **The add-wine handoff and its ledger** for the add-wine sheet in every context, including create step 2 and the S4c edit form.
5. **Verified map findings**, then the code on `master`.

### 1.2 What is in scope

| Ledger | Screens | Map items (main) | Section |
|---|---|---|---|
| B1 Create | S1, S1b, S2, S2b, S3, S3b | CREATE-04…58 | §2 |
| B2 Lobby and editing | S4, S4b, S4c, S4d | LOBBY-01…50 | §3 |
| B3 Guests before the start | S5, S5b, S6, S6b | GUEST-01…38 | §4 |
| B4 Joining late | S3's link hint; otherwise not drawn | CREATE-52, XCUT-59 | §5 |
| B5 Dark means live | every live screen | XCUT-01…09, PLAY-01/02/04, REVEAL-10, SB-09 | §6 |
| B6 Host console | S7, S7b | HOST-01…33, SB-34/35 | §7 |
| B7 Guessing, picker, waiting | S8, S8b, S9, S10, S10b | PLAY-01…43 | §8 |
| B8 A note on a hidden glass | S10, S10b | PLAY-38/40, XCUT-52 | §9 |
| B9 Semi-blind permutation | SB1, SB2, SB3, SB4 | SB-01…40, GUEST-36 | §10 |
| B10 Reveal, result, record | S11, S11b, S12, S12b, S13, S13b, S13c | REVEAL-01…13, RESULT-01…14, RECORD-01…22, MISSED-01/03/04 | §11 |
| B11 Hand hosting | S4d | LOBBY-48, XCUT-56 | §12 |
| B12 Place | S1, S4d, S5, S5b, S6 | CREATE-11, LOBBY-42, GUEST-10, XCUT-50 | §13 |
| B13, B14 | already landed | REVEAL-13, GUEST-34, XCUT-38 | §14 |

The critic's `MISSED-05` (S4c field order) is resolved by precedence 4: the add-wine D8 order wins (§3). `MISSED-02` (no padded Overview slots) is already plan amendment 6 (T10).

### 1.3 Not adopted

From the ledger, with where the replacement lives:

| Not adopted | Why | Instead |
|---|---|---|
| Secondary grape and type designation rows "appear only if the wine has them" (S8, S8b footnote) | Rule 1: the row list would tell a guesser what the hidden wine has | Both rows always under More, with T6's `LADDER_EXTRAS_NOTE` (§8) |
| "Your phone will buzz." (S6) | No push exists | Sentence dropped (§4) |
| "the more certain you are, the more you can score" (S6) | No confidence scoring | "up to 30 points a glass" (§4) |
| A mixed host-and-guest flight, and a host competing while seeing identities (S4, S7, S12) | `wine_source` stays either/or | A host-provides host sees "You hosted"; a bring-your-own host competes blind (§7, §11) |
| Reading the full invitation with no account (S5) | Place and joined names are private | A reduced, code-keyed preview (§4) |
| "Wines 3 of 6", "3 of 6 · hidden" and six-slot padding | No planned count exists | "{n} so far" (§3), "{n} glasses so far" (§4) |
| A ✕ on a waiting contributor row (S2b) | Nothing to remove; uninviting is not this control | No control (§2) |
| S3b's friend context lines "Gustav brings wine 4" and "Anders 24 Sep · Barolo by village" | B1 limits friend context to `getBulkProfileSummaries` | "{n} tastings · {avg} avg" or "new to Blindr" only (§2) |
| SB1's candidate list shown to guests before Start, and adding, swapping or removing a semi-blind glass after Start | Rule 1: a card that appears in the same refresh as a new glass maps that card to that glass (§10.4) | Guests get the list from Start; before Start, "The list of tonight's wines opens when {host} starts." A semi-blind flight is fixed at Start; Edit stays (§10.3; Q7) |
| The README's stale notes: `guess-form.tsx`, `RateWineModal`, a `Sheet` primitive, join codes and grape mapping "missing" | Verified stale (`MISSED-06`, `CREATE-51`, `PLAY-29`) | The shipped ladder, the add-wine note destination, Dialog-based sheets, `tastings.join_code`, the `wine_place_grapes` shortlist |

Consequences of precedence 4 and of earlier landed decisions (not new deviations; stated so nobody rebuilds them):

- S4c's field order and header copy ("wine 3 · hidden from tasters", "1 GAP", "Save wine 3") follow the add-wine by-hand form (D8, A4b; `LOBBY-28`/`29`/`30`, `MISSED-05`). This spec adds only Swap and Remove to that form.
- S2's laptop sources and the "↵ adds it" first row follow the add-wine matrix that S6 builds (`CREATE-27`/`28`).
- S2's caption "tasters only ever see the number" applies to host-provides only; S6 writes the bring-your-own caption (`CREATE-31`).
- The console keeps T9's "Tasting page" link (reveal-5), which S7 does not draw (`HOST-07`).

### 1.4 Reversals of documented rules — the exact CLAUDE.md lines to rewrite

CLAUDE.md is edited only after add-wine G4, by the task that lands the behaviour. The quoted text is the current line, verbatim.

| # | Current CLAUDE.md text (verbatim) | Rewrite to (substance) | Lands in |
|---|---|---|---|
| 1 | "the host presses **Start** (`startTasting`, requires ≥1 wine) to move it to `IN_PROGRESS`, which opens guessing." | Start has no wine-count gate; an incomplete glass returns a warning naming the glass and blocks only its own reveal. | built (B0); rewritten by §3's task |
| 2 | "Invites close once started." | Invitations and the join link stay open until the tasting is CLOSED; a late joiner is eligible for every glass not yet revealed. | §5 |
| 3 | "`join_tasting_by_code(code)` (SECURITY DEFINER; inserts JOINED or flips INVITED → JOINED; refuses CLOSED tastings and started non-OPEN ones — so people join by link BEFORE the host presses Start). `/j/[code]` calls it and redirects to the lobby" | `/j/[code]` shows the invitation through `get_join_preview` — a reduced preview when signed out, the invitation without the place when signed in — and joins only on "I am in"; the RPC refuses only CLOSED; `joined_at` is trigger-owned. | §4, §5 |
| 4 | "There is deliberately no Pause or Skip-glass control." | Pause (`tastings.paused_at`) and the pour pointer (`tastings.current_wine_id`, "Skip to glass N →"). | §7 |
| 5 | "No WSET note can be written while a glass is locked." | A taster may write a private WSET note on a hidden glass; it resolves to the wine at the reveal. | §9 |
| 6 | "Matching is NOT enforced to be 1-to-1 (the same candidate can be picked for more than one glass); each glass is still scored independently against its own true answer." | Semi-blind is a permutation: one open glass per candidate, swap on assign, a revealed wine leaves the pool. Each glass is still scored 1/0 by `reveal_wine`. | §10 |
| 7 | "Semi-blind matching (`play/match-guess-form.tsx` + `submitAllMatchGuesses` in `play/actions.ts`) is submitted as one combined batch, not per-glass" and "Semi-blind is an all-at-once ladder (`match-ladder.tsx`) locked with `lockGuesses`." | Every assignment autosaves through `assign_semi_blind_match`; each glass locks on its own. | §10 |
| 8 † | "In `SEMI_BLIND`, every wine's answer key is visible to all participants up front as a "candidate list" (`wine_answers` RLS allows this — see `is_tasting_participant` + `reveal_mode` check in the read policy)" and "Any future recreate of that policy must keep `is_tasting_host`, `has_scored_guess`, the revealed gate AND the semi-blind participant clause." | The candidate list comes only from `get_semi_blind_candidates` (opaque keys; JOINED and host; every card only from Start). `wine_answers read` has no semi-blind clause, and its host clause covers host-added glasses only (`wines.added_by_host`). A future recreate keeps `has_scored_guess`, the revealed gate, the `added_by_host` host clause and the contributor clause, and must not bring the semi-blind clause back. | §10 |
| 9 | "semi-blind and OPEN tastings stay on the lobby." | A LIVE semi-blind host-provides tasting lands on the console too. | §7 |
| 10 | "each pick autosaves the COMPLETE row through `submitGuess` (full-row replace; an absent field becomes null)." | Each pick upserts only its field group (`saveGuessFields`); a failed save reverts only that group. | §8 |
| 11 | "Wines are editable after being added, while the tasting is still DRAFT:" … "Gated three ways: the Edit button only renders pre-start, the `updateWine` action re-checks DRAFT + not-revealed + adder identity" | Edit, Swap and Remove are open to the adder while the glass is unrevealed and `reveal_step = 0`, in DRAFT and IN_PROGRESS; Remove also needs every later glass unseen; a semi-blind flight is fixed at Start (Edit only). The running page keeps the Wines card for the host and for a contributor. | §3 |
| 12 † | "Pickers are keep-mounted bottom sheets (centred on desktop)" and "Vintage is a year list; NV and tawny live under "More" with secondary grape / type designation." | Phone: a keep-mounted bottom sheet. Laptop: a keep-mounted popover anchored to its row. The vintage picker offers years (next year down to 1900), NV and tawny. | §8 |
| 13 † | "`/results` remains as the dedicated leaderboard + breakdown page" | For a CLOSED tasting `/results` renders the record (S13); the running page shows the dark result (S12) until dismissed, then the same record. | §11 |
| 14 † | "Everything for a running tasting lives on the main page (`tastings/[id]/page.tsx`)" | Unchanged, plus: the page is dark while IN_PROGRESS and on the result. | §6 |
| 15 | Add-wine ledger D7 "Start is refused while any glass is incomplete"; D14 play-2; D15 reveal-8 | D7 → a warning; play-2 → dropped; reveal-8 → the console facts count revealed categories only. | B0 (plan amendments 1–3, 8) and §7 |
| 16 † | "\"One wine at a time\" pacing: `tastings.sequential_guessing` (blind only; host toggles it in HostControls). When on, only the current wine — the lowest-`position` not-yet-revealed one — is guessable" | Guided pacing applies to LIVE blind and LIVE semi-blind tastings; the current glass is the pour pointer's (`tastings.current_wine_id`, `currentGlass`), and semi-blind opens every glass poured so far; the toggle lives in Tasting settings. | §2, §7, §10 |
| 17 † | "\"Reveal everything\" is `reveal_wine` behind a `window.confirm`." | An inline two-tap in the button ("Tap again to reveal everything"); End tasting keeps its confirm (§19.2). | §7 |
| 18 † | "While `DRAFT` the host can add wines, edit the schedule, and invite more people" and "Tastings carry an optional `scheduled_at timestamptz` (date + time), editable while `DRAFT`." | Name, description, photo, `scheduled_at` and place stay editable after Start (Tasting settings); mode, timing, rules and wine source lock at Start, in the app and in the database (`tastings_lock_setup_after_start`); wines can be added while running (not in semi-blind); invitations stay open until CLOSED. | §3, §5 |
| 19 † | "\"+N last round\" (their points on whichever wine has the most recent `scored_at` across the tasting" | In LIVE per-attribute tastings the round is the pour pointer's glass while its step reveal runs, then the lowest mid-step glass, then the newest scored glass (`get_tasting_leaderboard`, M7). | §7 |
| 20 † | "a Host badge where applicable, the In/Invited/Declined status" | Joined and Invited are listed and counted; Declined collapses to "{n} declined"; the host row reads "You · host". | §3 |
| 21 † | "a region-scoped shortlist group (\"Grown in Bourgogne\", \"Specific to Bourgogne\")" | The grape shortlist is headed "Common grapes in {region}" (S9); producers keep "Specific to {region}". | §8 |

† Not in the ledger's "Reversals of documented rules" list. The main session adds these rows to the ledger, and the owner report lists them with the ledger's own reversals.

New CLAUDE.md lines (not reversals) that the owning tasks add:
- `tasting_places` visibility (§13);
- the `guesses.guessed_wine_id` column lockdown, and the semi-blind flight fixed at Start (§10);
- hidden-glass notes, their resolve trigger and the `save_wset_note` identity rules (§9);
- the lifecycle stamps and the trigger-owned `joined_at` (§5, §11);
- `in_play_steps` no longer callable by clients, and `get_wine_reveal`'s null `in_play_count` at step 0 (§14.3);
- `wines.added_by_host`, the `wines` column privileges (`position`, `added_via`), `remove_flight_glass` and the setup lock after Start (§3);
- 10-character join codes and the signed-in link invitation (§4);
- Pause is LIVE-only (§7).

### 1.5 Sequencing and file ownership

- **Add-wine v2 finishes first, review and browser checks included,** for every file it owns. Add-wine G1–G3 review and fix, and V1/V2 verify in the browser, the very files these sections change; a blind-tasting edit landing inside that window would be reviewed, "fixed" or failed as add-wine code. So a blind-tasting task that edits any file in an add-wine task's OWNS (`.superpowers/add-wine-v2/owns.json`, committed or not) starts only after add-wine **V2** (which follows G1 → G2 ∥ G4 → G3 → V1) **and** the plan's BT-A0, which re-verifies every add-wine contract this spec names against the landed code. Before that, only the pure modules, the migrations' writing and rollback-only probes, and the live applies of M1–M3 (behaviour-neutral for deployed code) run.

| Section | Waits for (add-wine / T&R) | Shared files |
|---|---|---|
| §2 B1 | S6, F13, S3b; V2 | `flight-step.tsx`, `new-tasting-sheet.tsx`, `tastings/new/actions.ts` (`listFlight`), `components/add-wine/actions.ts` |
| §3 B2 | S3b, S5b, S5c, S7, F13; V2 | `tastings/[id]/page.tsx`, `wine-flight-list.tsx`, `by-hand-form.tsx`, `add-wine-sheet.tsx`, `add-wine/types.ts`, `tasting-wine-writes.ts` |
| §4 B3 | S7; V2 (the link preview changes a flow add-wine V1 checks) | `tastings/[id]/page.tsx`, `overview/page.tsx`, `j/[code]/page.tsx` |
| §5 B4 | V2 (T2, T3 files) | `join-link-row.tsx`, `tastings/[id]/actions.ts` |
| §6 B5 | tokens: V2 (F7's `globals.css`; T&R's pending `.wset-row` hairline shares the file); the shell: S7 | `globals.css`, `popover.tsx`, every play file |
| §7 B6 | S5c, T9's files; V2 | `host/page.tsx`, `host/console.tsx` |
| §8 B7 | T5, T6, T8 files; V2 | `play/actions.ts`, `guess-ladder.tsx`, `field-picker.tsx`, `locked-in.tsx` |
| §9 B8 | R6 (after S5c); V2 | `new-note-modal.tsx`, `note-editor.tsx`, `locked-in.tsx`, the WSET dictionary |
| §10 B9 | S7; V2 | `match-ladder.tsx`, `play-experience.tsx`, `host/console.tsx`, every `guesses` reader |
| §11 B10 | S5c, R6, T10, S7; V2 | `reveal-view.tsx`, `results/page.tsx`, `add-wine-context.tsx`, `add-wine/types.ts`, `sheet-state.ts` |
| §12 B11 | — (after §3) | `tasting-settings-sheet.tsx` (created in §3) |
| §13 B12 | S7, T10; V2 | `new-tasting-form.tsx`, `overview/banner.tsx`, `overview-data.ts` (T10), `next-up-meta.ts` |

- **Within this work** the order is: §6 tokens → §3 and §4 (the page split) → §7 and §8 → §9 → §10 → §11. §2, §5, §12 and §13 are independent once their shared files are free.
- **`src/lib/supabase/database.types.ts`** is edited by one blind task at a time, in migration order (§15). Those edits add or correct entries no add-wine review covers, so the migration tasks do not wait for V2.
- **Deploy order.** M9 (§10) narrows what already-deployed code may read and write: its app changes (explicit `guesses` column lists, the RPC-based semi-blind UI, the bring-your-own host console on `get_wine_reveal`) ship to production first, and the main session applies M9 only after that deploy (the queue.md push cadence; the plan ships M9 as M9a + M9b). M4, M5, M6 and M8 change flows add-wine V1/V2 exercise, so they apply after V2; M6 also only after F13's committed `addToFlight` passes M6's OPEN rows. Each was checked against the deployed code and needs no other gate (§15).

### 1.6 Conventions shared by every task

- **Copy language.** English on every tasting surface: the tasting pages, the console, the Overview card and `/j/[code]` have no i18n today. English and Danish through `makeT` only where the surface already uses the WSET dictionary: the note sheet (§9). The `/taste` band and rows (R5) keep their own dictionary; this spec only links to them.
- **Tokens.** `globals.css` tokens only; `--gold-dark` for small gold text on parchment, `--gold-light` on dark; no raw hex in components (§6 adds `--primary-hover`, so `hover:bg-[#4A1523]` goes).
- **Radii.** Tasting surfaces this spec builds use the README's radii through explicit classes: sheets 16px, cards 12–13px, buttons 9–11px, pills 999px. The app-wide `--radius` token stays as it is (§19.2).
- **Sizes.** Phone tap targets at least 44px; no text below 10px.
- **Controlled inputs** on every surface that mounts `AutoRefresh` (the guest lobby now does, §4).
- **Comboboxes and pickers** keep-mount and call `.focus()` synchronously inside the opening tap (CLAUDE.md).
- **Tests.** vitest in the node environment; any module a test loads imports other modules at runtime only by relative path (`import type` from `@/` is fine); no `server-only` in pure modules.
- **SQL.**
  - Recreate functions and policies from the LIVE definition (`pg_get_functiondef`, `pg_policies`), never from an older migration file.
  - No `begin`/`commit`. Pre-state shape assertions first (fail when live differs from what the migration was written against); post-state assertions in a final `do` block, in the same transaction (the `20260912093000` pattern).
  - Every new SECURITY DEFINER function pins `set search_path = public`, revokes EXECUTE from `PUBLIC` and `anon` unless its section says otherwise, grants `authenticated` explicitly, and is asserted through `to_regprocedure`, `prosecdef` and `proconfig`.
  - Cross-table checks on `tastings`, `tasting_participants` and `wines` in a new or recreated policy go through SECURITY DEFINER helpers, never a raw subquery. (A policy recreated only to drop a clause keeps its live text otherwise; §10 says which.)
  - Dry run: `node scripts/scratch-apply.mjs --file <sql> --mode dry` must print `DRY-OK`. Only the main session applies live.
  - **Behavioural probes** follow lane N's synthetic-rollback pattern (`.superpowers/blind-tasting/lane-n/probe-092000.mjs`): one `pg` client; every transaction ends in `rollback`, also on error; fixtures on the seeded `demo.*@blindr.invalid` accounts; each scenario in a savepoint that is rolled back; the caller simulated with `set local role authenticated` plus `select set_config('request.jwt.claims', <json with sub>, true)`; a "before" phase on live and an "after" phase with the migration applied inside the transaction; every expected outcome written into the script before it runs.
- **Versions.** Checked absent from `supabase_migrations.schema_migrations` (live, the authority) and from `supabase/migrations` on `origin/master` immediately before writing and again before the live apply. The main session runs `git fetch origin` first, because the local ref lags the upstream stream (§0.1). Non-round seconds (for example `20260914090500`, `20260914091500` — examples, not reservations). When a slot is taken, that file and every later unapplied blind-tasting migration are renumbered together, so M1 < … < M10 stays in version order. A version that ends up below the live tail is fine while it is absent: these migrations depend on no wine-map object.

---

## 2. B1 · Create (S1–S3b)

### 2.1 Screens

S1 (setup, laptop), S1b (setup, phone), S2 and S2b (the flight), S3 and S3b (invite and start).

### 2.2 Current state

- **The sheet.** `src/components/new-tasting-sheet.tsx` (T2; S6 edits the `<FlightStep/>` call site) runs three steps.
  - Step 1 creates the row with `createTasting`, which returns `{ id }` (`src/app/tastings/new/actions.ts:116-213`). Later saves call `updateTastingSetup` (`actions.ts:235-269`: DRAFT only; the wine-source lock at :250-257).
  - The footers already read "Create and finish later" (`new-tasting-sheet.tsx:472`), "Even none is enough." (:487), "Invite later" (:520) and "Start the tasting" (:523).
  - Start routes through `startLandsOnConsole` (:317; `src/lib/tasting-lifecycle-copy.ts:21-31`: LIVE + BLIND + HOST_PROVIDES only).
- **Name chips.** `nameSuggestions(today, region)` (`src/app/tastings/new/setup-copy.ts:194-203`):
  - chip 1 is "{today's weekday} blind", whatever the mode and the scheduled date;
  - chip 2 comes from `getNameSuggestionContext` (`actions.ts:280-299`), which takes the region of the wines behind the caller's *scored guesses* — what they tasted, not what they poured — and falls back to "Burgundy #1";
  - its doc comment (`actions.ts:276-279`) still says a scored guess grants `wine_answers` access, which 20260912090000 narrowed.
- **Rules card.** `rulesSummary` (`setup-copy.ts:112-133`) gives "Guided · standings after each attribute · Danish Championship scoring" for blind (as B1 wants) but "Semi-blind · one point per glass" for semi-blind.
- **Guided pacing is blind-only.** `setupColumns` stores `sequential_guessing` for BLIND + LIVE + GUIDED (`actions.ts:75`); `flowApplies` is BLIND + LIVE (`setup-copy.ts:85-87`); `flowWord` says "Guided" only for BLIND (`src/lib/tasting-eyebrow.ts:73-81`).
- **Place.** No row and no storage (B12).
- **Step 2.** `src/app/tastings/new/flight-step.tsx` (S6 rewrites it on the matrix): rows with ✕, no drag handles, no paste. `listFlight` (`actions.ts:380-529`) is S6's.
- **Step 3.** `src/app/tastings/new/invite-step.tsx` (T2):
  - friend chips (`Friend = { id; display_name; email }`, :11) and typed email chips (`invite-field.tsx`);
  - `JoinLinkRow` with the hint "Works until you start the tasting." (`join-link-row.tsx:90`);
  - the gold summary from `readySummary` (`setup-copy.ts:155-180`): mode · timing · flow · "{n} wines so far" · date · "{n} invited" · "add more as you pour";
  - no phone rows, no context lines, no people search.

### 2.3 Change

**Step 1 (S1, S1b)**

1. **Name chips.** `setup-copy.ts` (T1's file, committed):
   ```ts
   export function nameSuggestions(input: {
     today: Date;
     scheduledLocal: string;                        // SetupValues.scheduledLocal, "" when unset
     revealMode: RevealMode;
     pouredRegion: { region: string; n: number } | null;
   }): string[];
   ```
   - Chip 1: "{Weekday} blind" or "{Weekday} semi-blind" — the weekday of the scheduled date when set, else today's, in the viewer's zone (the form is a client component).
   - Chip 2: "{region} #{n}", only when `pouredRegion` is non-null. The "Burgundy #1" fallback goes: it names a region the host never poured.
   - Chip 3: "Six glasses, no mercy".
   - The chips follow the mode tile and the date as they change (both are already controlled state).
2. **Poured region.** `getNameSuggestionContext` becomes `getPouredRegionSuggestion()` (same file):
   - the most frequent `wine_answers.region_id` among the wines of tastings the caller hosts where `wines.added_by_host` (M6's pinned host-added flag) OR `wines.is_revealed`;
   - `n` = the number of the caller's tastings that poured that region, plus 1;
   - every read runs under the caller's RLS. The host-added filter matters because today's host clause of `wine_answers read` shows a bring-your-own host every contributor's answer key; §10 narrows the policy, and the filter keeps this function correct before and after.
3. **Place row (B12).** Beside or below the date row: "Where? — a place or an address" with "optional" on laptops; "Where?" with "optional" on phones. A controlled input, `maxLength={200}`; `SetupValues.place: string` (default ""). Written through `setTastingPlace` (§13).
4. **Rules card.**
   - `flowApplies(v)` = `v.revealMode !== "OPEN" && v.timingMode === "LIVE"`: LIVE semi-blind gets Guided / Free, which B9's pour pointer needs.
   - `leaderboardApplies(v)` stays BLIND + LIVE + GUIDED.
   - `rulesSummary` for semi-blind: the flow word when it applies, then "one point for each glass you match", then the ASYNC results clause. The default reads "Guided · one point for each glass you match". Blind is unchanged.
   - `rulesSummaryShort` for semi-blind: "Guided · 1 pt a match" (**spec copy**, the phone one-liner).
   - `setupColumns` (`actions.ts:75`): `sequential_guessing: f.revealMode !== "OPEN" && f.timingMode === "LIVE" && f.flow === "GUIDED"`.
   - `flowWord` (`tasting-eyebrow.ts`): "Guided" for any non-OPEN LIVE tasting with `sequentialGuessing`.
5. **Footer note.** "A name is all it takes. Wines and people can wait — the tasting exists from here and you can leave it empty." (`CREATE-17`; add it where step 1 lacks it).

**Step 2 (S2, S2b), after S6**

6. **Drag handles.** "⋮⋮" on every flight row (pointer events; no new dependency), keeping ▲▼ as the keyboard fallback.
   - Both call `moveFlightGlass(tastingId, wineId, toIndex)` → the `move_flight_glass` RPC (§3.4). A drag's drop index comes from the row midpoints through pure `dropIndex(rowRects, pointerY)` in `src/lib/flight-glass-rules.ts`.
   - The list reorders optimistically; a refusal reverts it and shows the RPC's sentence inline.
   - The caption stays S6's per-source caption.
7. **Paste a list** (the handoff's "Paste a list of six", without the planned count). A secondary text button under the flight opens an inline, controlled textarea inside the step (not a nested dialog).
   - Pure `src/app/tastings/new/paste-list.ts`:
     - `splitPastedLines(text): string[]` — split on newlines; trim; drop empty lines and list markers such as "1." or "-"; collapse spaces; at most 24 lines.
     - `pickPasteMatch(line, catalogRows): string | null` — a catalog wine id only when exactly one catalog row's folded title contains every folded token of the line (`fold` from `src/lib/wine-identity/fold.ts`).
   - "Add these" resolves the lines one at a time through F13's `searchAddWine` (catalog group only) and adds each match with `addToFlight(destination, { kind: "catalog", catalogWineId, via: "search" })`.
   - Unmatched lines are listed under "Couldn't match {n} lines" (**spec copy**). Each line has "By hand", which opens `openAddWineSheet(destination, { start: "byhand" })`.
   - Paste never adds an incomplete glass.
8. **Waiting contributor rows** carry no ✕ (already S6's design; keep it).
   - **The others' rows arrive while step 2 is open** (`CREATE-38`). In bring-your-own, step 2 re-reads `listFlight` every 5 seconds while it is open and the tab is visible, so S2b's footnote — the others' "rows appear here as they do it" — holds.

**Step 3 (S3, S3b)**

9. **Friends.** Chips from `md`; full rows below `md` (32px avatar, name, a context line, a 22px check disc; a selected row is gold-bordered).
   - The context line comes from one `getBulkProfileSummaries(friendIds)` call when the sheet loads its friends. Pure `friendContextLine(summary)` in `setup-copy.ts`: "{n} tastings · {avg} avg" when `tastingsAttended > 0` (one decimal), else "new to Blindr".
   - With no friends the picker still renders its "browse People to add some" message (CLAUDE.md).
   - S3b also draws other context lines ("brings wine 4", a last tasting and its region). They are not built (§1.3).
10. **Name or email.** The "+ email or name" chip on laptops and the "Name, or an email address" field on phones:
    - text containing "@" behaves as today (an email chip);
    - other text of 2+ characters searches People through a debounced server action `searchPeople(query)` (new, `src/app/tastings/new/people-search.ts`): up to 8 profiles by `display_name ilike`, with `%`, `_` and `\` escaped by pure `escapeIlike` (new `src/lib/ilike.ts`), excluding the caller and anyone already chosen, returning `{ id, display_name, avatar_url, email }` (profiles are readable by every signed-in user today);
    - picking a person adds their email to the invite list, exactly as a friend pick does;
    - no match: "No one on Blindr by that name — type their email instead." (**spec copy**).
11. **Share link.** `JoinLinkRow`'s hint becomes "Works until the tasting ends." (B4).
12. **Gold summary** restates every choice. `readySummary({ setup, wineCount, invitedCount, dateText, place, phone })`:
    - mode · timing · flow (when it applies) · "everyone brings" (bring-your-own only) · "{n} wines so far" · the date or "no date" · the place (when set) · "{n} invited" · "add more as you pour" (laptops only: S3b's phone summary ends at "{n} invited");
    - sub-copy unchanged: "Starting opens the table for everyone. You can also start with nobody invited and share the link once people arrive."
13. **Start lands per B6.** `startLandsOnConsole(t)` = `t.timingMode === "LIVE" && t.wineSource === "HOST_PROVIDES" && (t.revealMode === "BLIND" || t.revealMode === "SEMI_BLIND")`.

### 2.4 SQL

None of its own. The place table is §13 (M2); `move_flight_glass` is §3.4 (M6).

### 2.5 Tests (vitest, written first)

- `src/app/tastings/new/setup-copy.test.ts`:
  - `nameSuggestions` takes the scheduled weekday, says "semi-blind" for semi-blind and omits the region chip when it is null;
  - `flowApplies` is true for LIVE semi-blind;
  - `rulesSummary` semi-blind default is "Guided · one point for each glass you match";
  - `readySummary` with a place and with bring-your-own;
  - `friendContextLine` for 0 and several tastings;
  - `readySummary` with `phone: true` drops "add more as you pour".
- `src/app/tastings/new/paste-list.test.ts`: splitting, list markers, the 24-line cap, a unique match, two candidates → null.
- `src/lib/ilike.test.ts`: `%`, `_` and `\` are escaped; plain text is unchanged.
- `src/lib/flight-glass-rules.test.ts` (§3.5): `dropIndex` above the first row, between rows, below the last row.
- `src/lib/tasting-lifecycle-copy.test.ts`: `startLandsOnConsole` is true for LIVE semi-blind host-provides and false for bring-your-own and ASYNC.
- `src/lib/tasting-eyebrow.test.ts`: `flowWord` is "Guided" for LIVE semi-blind with sequential guessing.

### 2.6 Verification (375px phone emulation and a 1280px mouse device)

- **S1/S1b.** Field order: name → mode → timing and source → date and place → photo → rules. The chips follow the mode tile and the date. Switching to Semi-blind changes the rules line. "Create and finish later" closes the sheet with no navigation.
- **S2/S2b.** Drag a row with the mouse; move one with ▲▼ from the keyboard; paste two lines where one matches and one does not. In bring-your-own, a bottle a second demo account adds appears in the open step 2 within 5 seconds.
- **S3/S3b.** Phone rows show their context lines; with no friends the empty message still shows; typing a display name lists that person, and typing "%" lists nobody; the link row reads "Works until the tasting ends."; the summary includes the place, ending "add more as you pour" on the laptop and "{n} invited" on the phone.
- Start on a LIVE semi-blind host-provides tasting lands on `/tastings/[id]/host`.

### 2.7 Owner default

Q2 (the place stays participant-private, §13) and Q6 (the link hint).

---

## 3. B2 · Lobby and editing (S4–S4d)

### 3.1 Screens

S4 (lobby, laptop), S4b (lobby, phone), S4c (edit a wine), S4d (tasting settings).

### 3.2 Current state

- **`src/app/tastings/[id]/page.tsx`** (678 lines; T4 committed; S7 rewrites the Wines card):
  - Header: thumbnail, name, description, a `derivedStatus` badge with "{n} wines · {m} participants · date" (:477-492), then "Live session · Host-selected wines · Danish Championship scoring" (:493-507).
  - The cog is an icon-only popover, `HostControlsMenu` (`host-controls-menu.tsx:53-59`, `aria-label="Host controls"`).
  - Start is `HostControls surface="start"` (:548-559) with T2x's inline warning.
  - The Wines card (:250-285) is shown to every viewer, guests included ("Wine N · Hidden"; `GUEST-35`), with "{n} wines · only you can see them" for the host-provides host.
  - The Participants card (:289-373) lists every status, Declined included, and counts every row (`LOBBY-17`).
- **`wine-flight-list.tsx`** (S7): "Wine N", badges, an Edit link to `/wines/[wineId]/edit` (S7 replaces it with `openAddWineSheet(…, { start: "byhand", edit: { wineId } })`), ▲▼ through `moveWine` (a swap through a temporary `-1` slot, `tastings/[id]/actions.ts:317-344`).
- **Edit guard.** F10's `editRefusal` (`src/app/tastings/[id]/wines/new/tasting-wine-writes.ts:658-668`, amendment 7): not CLOSED, unrevealed, and `reveal_step = 0` for a complete glass.
- **Remove.** `removeWine` (`actions.ts:351-385`) is host-only and DRAFT-only; it deletes, then closes the gap with one `update wines set position` per later row. RLS `wines delete host` (a raw subquery) lets the host delete any glass, revealed or not. `insertGlassRow` puts a new glass at `count + 1` (`tasting-wine-writes.ts:259-287`), so a gap left by a removal would collide on `(tasting_id, position)` at the next add.
- **`wines` writes (live).** Clients hold UPDATE on every column and `wines update host` is host-only: a contributor's renumbering updates would silently touch 0 rows, while a host can write `contributor_participant_id`, `is_revealed` and `reveal_step` (§0.1). F10's undo `removeGlassIfHost` (`tasting-wine-writes.ts:296-310`) deletes a just-added glass when its answer-key write fails, and OPEN glasses are inserted revealed (`:281`).
- **Running page.** Once IN_PROGRESS the Wines card renders only for the host (`page.tsx:635`); a bring-your-own contributor gets only an Add button (`:627`), so nothing reaches Edit on their own bottle after Start.
- **Settings.** `updateTastingSetup` is DRAFT-only (`tastings/new/actions.ts:241-243`); `updateSchedule` has no status guard (`actions.ts:178-207`); nor has `setLeaderboardReveal` (:298-312).
- **Answer-key RLS (live).** `wine_answers update` lets the host update any answer key of the tasting — revealed or not, a bring-your-own contributor's included — and the contributor while unrevealed. `wine_answers insert` allows the host or the contributor at any time.

### 3.3 Change

**Header (S4, S4b)**

1. **Eyebrow** from `tasting-eyebrow.ts`: `joinEyebrow([statusWord(status, timing), modeWord(mode), status === "IN_PROGRESS" ? "" : timingWord(timing), <date>, participantsPhrase(rows)])` → "Draft · blind · live · Thursday 11 Sep 19:00 · 7 participants". Phone: status · mode · date only ("Draft · blind · Thursday 19:00", `LOBBY-23`).
   - The date renders client-side: `LocalDateTime` gains `format?: "default" | "eyebrow" | "eyebrow-short"` ("Thursday 11 Sep 19:00" / "Thursday 19:00") and keeps its `useSyncExternalStore` server snapshot.
   - Beside the eyebrow, the existing `/rules` link: "Danish Championship scoring" or "Semi-blind scoring" (the CLAUDE.md badge rule, `LOBBY-03`).
   - Then the name (Cormorant), the description, and the place line for members (§13).
2. **"Tasting settings"** is a labelled button (gear icon + text, 1.5px bordeaux border, `bg-card`) in place of the icon-only cog. The phone header keeps a 34px gear icon button with `aria-label="Tasting settings"` (`LOBBY-04`, `LOBBY-23`). It opens S4d. `HostControlsMenu` is deleted once nothing imports it.

**Wines card (host and adder view, after S7)**

3. **Title row** "Wines" with S7's `AddToFlightButton`. Caption for the host-provides host only: "{n} so far · only you can see them" (laptop), "{n} so far · hidden" (phone).
4. **Rows** keep S7's content (D13), plus a drag handle "⋮⋮" before "Wine N" on laptops (`LOBBY-07`).
   - An incomplete glass reads `flightRowNeeds(missing)` + " — tap Edit to finish" on laptops and `flightRowNeeds(missing)` alone on phones, in `--gold-dark` (`LOBBY-13`).
   - Compact phone rows drop the region and the provenance (`LOBBY-24`).
   - **After Start** the running page keeps this card, dark, for the host and for a JOINED bring-your-own contributor (their own rows carry Edit), so Edit, Swap and Remove stay reachable (§6). In a semi-blind tasting its Add button goes at Start (§10.3 item 7).
5. **Reorder.** ▲▼ and drag both call `moveFlightGlass(tastingId, wineId, toIndex)` → `move_flight_glass`; a drag's drop index comes from `dropIndex` (§2.3 item 6). `moveWine` becomes a thin ±1 wrapper and is deleted when unused.
6. **Guests.**
   - HOST_PROVIDES: no Wines card for anyone but the host; under the eyebrow a chip `glassesSoFarPhrase(count)` ("4 glasses so far").
   - PARTICIPANT_CONTRIBUTED: S7's contributor rows and waiting rows; identity lines only on the viewer's own rows.

**Start (S4, S4b)**

7. Host only. An inline gold button (`bg-gold text-foreground`, the `0 2px 0 0 rgba(42,33,30,.18)` shadow) below the Wines card on laptops, with "Starting opens guessing for everyone. You can keep adding wines after it starts — the flight grows as you pour."
   - Phones: pinned to the bottom (a full-width gold button in a top-bordered bar, `pb-[max(12px,env(safe-area-inset-bottom))]`).
   - `startTasting`'s warning shows inline under it (T2x).

**Participants (S4, S4b)**

8. JOINED and INVITED are listed; the count is JOINED + INVITED; DECLINED collapses to one muted line "{n} declined" and is not counted (`LOBBY-17`).
   - The host row reads "You · host" with a bordeaux avatar and no status badge (`LOBBY-18`).
   - The stats line comes from `getBulkProfileSummaries` (already batched): "{n} tastings · {avg} avg".
   - Bring-your-own: "brings wine {N}" after a contributor who has added a bottle; N is the list-order number of their first glass (`LOBBY-19`).
   - Phone: chips below the Wines card — "You · host" (bordeaux fill), "{name} ✓" (joined), "{name} · invited" (gold border, `--gold-dark` text) (`LOBBY-25`).
   - Footer: "More invites live in Tasting settings." (**spec copy**; the handoff's sentence names the cogwheel this spec removes).

**S4c — edit a wine (after S3b, S5b, S5c, S7)**

9. Edit opens the add-wine by-hand form in the sheet on that glass (S7). Field order and header copy are the add-wine form's (D8, A4b). This spec adds two rows at the bottom of that form, rendered only when it edits a flight glass:
   - "Swap for another bottle", with the sub-line "Keeps position {n} and any guesses already made" and a chevron;
   - "Remove from the flight" (a destructive text button).
10. **Who and when** — one pure module, `src/lib/flight-glass-rules.ts`:
    ```ts
    export type FlightGlassState = {
      tastingStatus: TastingStatus;
      revealMode: RevealMode;
      isRevealed: boolean;
      revealStep: number;
      viewerIsAdder: boolean;   // the host for a host-added glass (wines.added_by_host); the contributor for their own
      viewerIsHost: boolean;
      laterGlassSeen: boolean;  // a glass after this one in list order is revealed or has reveal_step > 0
    };
    export function glassEditRefusal(s: FlightGlassState): string | null;   // Edit
    export function glassSwapRefusal(s: FlightGlassState): string | null;   // Swap
    export function glassRemoveRefusal(s: FlightGlassState): string | null; // Remove
    export function dropIndex(rowRects: readonly { top: number; height: number }[], pointerY: number): number; // 1-based
    ```
    - Edit: the adder, while not CLOSED, unrevealed and `reveal_step = 0` — F10's guard, which then delegates to this module. An OPEN glass is inserted revealed, so the app never edits it (as today).
    - Swap: Edit's rule, and never a semi-blind glass after Start (§10.3 item 7).
    - Remove: Edit's rule, or the host in DRAFT for any glass (the create sheet's clean-up); never a semi-blind glass after Start; never while `laterGlassSeen`.
    - Refusals reuse F10's strings (`TASTING_CLOSED`, `ALREADY_REVEALED`, `NOT_ADDER`), plus (all **spec copy**) "This glass's reveal has started — it can't be changed now.", "A later glass has already been revealed — this one can't be removed now." and "A semi-blind flight is fixed once the tasting starts — the list of wines can't change."
    - `viewerIsAdder` comes from `is_wine_adder`, which keys on `wines.added_by_host` after M6 (§3.4).
11. **Swap** re-points the answer key on the same `wines` row.
    - `AddWineOpenOptions` (after S5c) gains `swap?: { wineId: string }`. The sheet opens its normal flight sources (scan, search, cellar, by hand) with the header "Swap glass {n}" and the footer primary "Swap into glass {n}" (both **spec copy**).
    - The add path calls a new server action `swapFlightGlass(tastingId, wineId, source)` in `src/components/add-wine/actions.ts` (after F13); `source` is an `AddSource` or a by-hand identity. It:
      1. re-checks `glassSwapRefusal`;
      2. resolves the wine through the one write path (`prepareCompleteWine` / `upsertCatalogWine`, or `prepareUnidentifiedWine`);
      3. calls F10's `saveFlightGlassCore` on the existing wine id, which updates `wine_answers` (or inserts it, when the glass was incomplete);
      4. writes `wines.added_via` through `set_flight_glass_added_via(p_wine_id, p_added_via)` (§3.4: a contributor holds no UPDATE on `wines` rows);
      5. deletes the old `wine_pour_intents` row, and records a new one for a lot source (a running tasting pours it at once, D11).
    - Position and every `guesses` row stay. The blind-pending triggers (`trg_catalog_wine_unmark_blind_on_unlink`, `trg_catalog_wine_mark_blind`) move the pending mark from the old catalog wine to the new one.
12. **Remove.** `removeWine(tastingId, wineId)` applies `glassRemoveRefusal` in place of host + DRAFT, then calls `remove_flight_glass(p_wine_id)` (§3.4), which deletes and closes the gap in one transaction whoever the adder is.
    - Before the tap the sheet states, inline and with no dialog, what goes with the glass: "{k} guesses on this glass go with it" ("1 guess on this glass goes with it"); with private notes (§9) "{k} guesses and {m} private notes on this glass go with it" (**spec copy** extension). Nothing when both counts are 0.
    - The counts come from `glass_removal_impact(p_wine_id)` (§3.4), loaded when the edit sheet opens.
    - After Start, removing a glass renumbers the later glasses for everyone — allowed only while none of them has been revealed or started its reveal, so "Glass N" never changes for a glass the table has seen (`MISSED-01`). The pour pointer is keyed on wine ids (`current_wine_id` nulls on delete), so pacing is unaffected.

**S4d — Tasting settings**

13. New `src/app/tastings/[id]/tasting-settings-sheet.tsx`: a Dialog sheet like `new-tasting-sheet.tsx` (full screen below `sm`), reusing `NewTastingForm` in a `mode="settings"` with the tasting's current values (the place from `tasting_places`).
    - Eyebrow "Host controls · not started yet" in DRAFT and "Host controls · started" after Start (**spec copy**); title "Tasting settings"; ✕; one Save.
    - Fields: Name; Description (a controlled textarea, `LOBBY-39`); "Change photo"; the mode tiles with "still changeable — nothing has been poured" (DRAFT); When; Where; the timing pair; the wine-source pair (locked once wines exist, `WINE_SOURCE_LOCKED`); the rules card.
    - DRAFT footer: "Once the first glass is poured, mode and scoring lock. Everything else stays editable."
    - After Start ("first pour" = Start) mode, timing, rules and wine source render read-only, and the footer reads "The tasting has started — mode, timing, rules and who brings the wines are locked. Name, description, photo, time and place stay editable." (**spec copy**). The guided-pacing toggle stays for LIVE blind and LIVE semi-blind (`setSequentialGuessing`).
    - Below a rule, under "Only once a tasting exists":
      - "Manage invitations" — an inner view with `InviteField`, the friend picker and `JoinLinkRow`, open until CLOSED (§5);
      - "Hand hosting to someone" — DRAFT only (§12);
      - "Delete the tasting" — an inline two-tap, "Tap again to delete it for everyone" (**spec copy**), replacing `window.confirm`.
    - A running or finished tasting also keeps End and Reopen here (`LOBBY-50`, from `HostControls`).
14. **Server.** `updateTastingSetup(tastingId, fields)` becomes status-aware through a pure `settingsChangeRefusal({ status, wineCount, before, after })` in `setup-copy.ts`:
    - DRAFT: every field; the wine-source switch is refused once wines exist, as today.
    - IN_PROGRESS and CLOSED: only name, description, image, `scheduled_at` and place may change; anything else → "Mode, timing, rules and who brings the wines lock once the tasting has started." (**spec copy**).
    - `setLeaderboardReveal` refuses outside DRAFT (the rules lock). `updateSchedule` folds into `updateTastingSetup` and is deleted when unused.

### 3.4 SQL (M6 `flight_edits_until_first_step`; after M5, so the impact count can read notes)

```sql
-- 1. Who added a glass is fixed when it is inserted. Nulling
--    contributor_participant_id later (a host's update, or the FK when the
--    contributor's participant row is deleted) no longer turns a contributor's
--    glass into a host-added one.
alter table public.wines add column added_by_host boolean;
update public.wines set added_by_host = (contributor_participant_id is null);
alter table public.wines alter column added_by_host set not null;

create or replace function public.wines_pin_adder()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.added_by_host := (new.contributor_participant_id is null);
  else
    new.added_by_host := old.added_by_host;
  end if;
  return new;
end $$;
create trigger wines_pin_adder
  before insert or update on public.wines
  for each row execute function public.wines_pin_adder();

-- 2. Clients update only position and added_via. is_revealed, reveal_step,
--    contributor_participant_id and tasting_id are written by SECURITY DEFINER
--    functions only (reveal_wine, reveal_next_category, the RPCs below).
revoke update on public.wines from anon, authenticated;
grant update (position, added_via) on public.wines to authenticated;

-- 3. Mode, timing and wine source lock once the tasting has started (§3.3 item 14,
--    in the database). The policies below and §10's semi-blind RPCs branch on
--    reveal_mode, so a host must not be able to flip it mid-tasting.
create or replace function public.tastings_lock_setup_after_start()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status <> 'DRAFT'
     and (new.reveal_mode is distinct from old.reveal_mode
          or new.timing_mode is distinct from old.timing_mode
          or new.wine_source is distinct from old.wine_source) then
    raise exception 'mode, timing and who brings the wines lock once the tasting has started'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger tastings_lock_setup_after_start
  before update of reveal_mode, timing_mode, wine_source on public.tastings
  for each row execute function public.tastings_lock_setup_after_start();

-- 4. The adder, keyed on the pinned flag. Recreated from its live definition;
--    only the host test changes (F10's write path calls it).
create or replace function public.is_wine_adder(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = p_wine_id
      and ((w.added_by_host and t.host_id = auth.uid())
           or (not w.added_by_host and p.user_id = auth.uid()))
  )
$$;

-- 5. The adder's edit window: one helper for the policies and the RPCs.
--    OPEN (Taste & rate) glasses are inserted already revealed
--    (tasting-wine-writes.ts:281), so OPEN keeps its add path: the adder may
--    write while the tasting is not CLOSED.
create or replace function public.can_edit_flight_glass(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    where w.id = p_wine_id
      and t.status <> 'CLOSED'
      and public.is_wine_adder(p_wine_id)
      and (t.reveal_mode = 'OPEN' or (not w.is_revealed and w.reveal_step = 0))
  );
$$;

-- Remove: the edit window, or the host for any glass while DRAFT. Never a
-- semi-blind glass after Start (§10.4), and never while a later glass has been
-- revealed or has started its reveal, because removing would renumber it
-- (OPEN boards are exempt: every glass there is revealed).
create or replace function public.can_remove_flight_glass(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    where w.id = p_wine_id
      and (public.can_edit_flight_glass(p_wine_id)
           or (t.status = 'DRAFT' and t.host_id = auth.uid()))
      and not (t.reveal_mode = 'SEMI_BLIND' and t.status <> 'DRAFT')
      and (t.reveal_mode = 'OPEN' or not exists (
            select 1 from wines later
            where later.tasting_id = w.tasting_id
              and later.position > w.position
              and (later.is_revealed or later.reveal_step > 0)))
  );
$$;

-- A direct row delete: the host while DRAFT (deployed removeWine renumbers as
-- the host), or the adder's last glass (F10's undo of a half-added glass).
-- Every other removal goes through remove_flight_glass, which renumbers.
create or replace function public.can_delete_flight_glass_row(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_remove_flight_glass(p_wine_id)
     and exists (
       select 1 from wines w join tastings t on t.id = w.tasting_id
       where w.id = p_wine_id
         and ((t.status = 'DRAFT' and t.host_id = auth.uid())
              or not exists (select 1 from wines later
                             where later.tasting_id = w.tasting_id
                               and later.position > w.position)));
$$;

-- wine_answers: the live policies replaced by the adder's window.
drop policy "wine_answers insert" on public.wine_answers;
create policy "wine_answers insert" on public.wine_answers
  for insert to authenticated
  with check (public.can_edit_flight_glass(wine_id));

drop policy "wine_answers update" on public.wine_answers;
create policy "wine_answers update" on public.wine_answers
  for update to authenticated
  using (public.can_edit_flight_glass(wine_id))
  with check (public.can_edit_flight_glass(wine_id));

-- wines: delete through the helper. Deleting a tasting still cascades
-- (FK cascades do not go through RLS).
drop policy "wines delete host" on public.wines;
create policy "wines delete adder" on public.wines
  for delete to authenticated
  using (public.can_delete_flight_glass_row(id));

-- Remove a glass and close the gap, whoever the adder is.
create or replace function public.remove_flight_glass(p_wine_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tasting uuid;
begin
  if not public.can_remove_flight_glass(p_wine_id) then
    raise exception 'you cannot remove this glass';
  end if;
  select tasting_id into v_tasting from wines where id = p_wine_id;
  perform 1 from wines where tasting_id = v_tasting for update;
  delete from wines where id = p_wine_id;
  -- Two statements, so the (tasting_id, position) unique constraint never collides.
  with ordered as (
    select id, row_number() over (order by position) as ord
    from wines where tasting_id = v_tasting
  )
  update wines w set position = -o.ord from ordered o where w.id = o.id;
  update wines set position = -position where tasting_id = v_tasting;
end $$;

-- Swap's provenance write: a contributor holds no UPDATE on wines rows.
create or replace function public.set_flight_glass_added_via(p_wine_id uuid, p_added_via text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_flight_glass(p_wine_id)
     or exists (select 1 from wines w join tastings t on t.id = w.tasting_id
                where w.id = p_wine_id and t.reveal_mode = 'SEMI_BLIND' and t.status <> 'DRAFT') then
    raise exception 'you cannot change this glass';
  end if;
  update wines set added_via = p_added_via where id = p_wine_id;
end $$;

-- Reorder atomically. Host only; never renumbers a glass the table has seen.
create or replace function public.move_flight_glass(p_wine_id uuid, p_to_index int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tasting uuid;
  v_ids uuid[];
  v_new uuid[];
begin
  select w.tasting_id into v_tasting from wines w where w.id = p_wine_id;
  if v_tasting is null or not is_tasting_host(v_tasting) then
    raise exception 'only the host can reorder the flight';
  end if;
  if exists (select 1 from tastings where id = v_tasting and status = 'CLOSED') then
    raise exception 'this tasting is finished';
  end if;

  select array_agg(id order by position) into v_ids
  from wines where tasting_id = v_tasting;
  if p_to_index < 1 or p_to_index > coalesce(array_length(v_ids, 1), 0) then
    raise exception 'no such place in the flight';
  end if;

  v_new := array_remove(v_ids, p_wine_id);
  v_new := v_new[1:p_to_index - 1] || p_wine_id || v_new[p_to_index:];

  if exists (
    select 1 from wines w
    where w.tasting_id = v_tasting
      and (w.is_revealed or w.reveal_step > 0)
      and array_position(v_ids, w.id) <> array_position(v_new, w.id)
  ) then
    raise exception 'a glass the table has already seen cannot change its number';
  end if;

  -- Two statements, so the (tasting_id, position) unique constraint never collides.
  update wines set position = -position - 1 where tasting_id = v_tasting;
  update wines w set position = o.ord
  from unnest(v_new) with ordinality as o(id, ord)
  where w.id = o.id;
end $$;

-- What a removal takes with it: counts only (private notes are §9's).
create or replace function public.glass_removal_impact(p_wine_id uuid)
returns table (guesses int, private_notes int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from guesses g where g.wine_id = p_wine_id),
    (select count(*)::int from wset_notes n
      where n.tasting_wine_id = p_wine_id
        and num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id) = 0)
  where public.can_remove_flight_glass(p_wine_id);
$$;

revoke all on function public.wines_pin_adder(), public.tastings_lock_setup_after_start()
  from public, anon, authenticated;
revoke all on function public.can_edit_flight_glass(uuid), public.can_remove_flight_glass(uuid),
  public.can_delete_flight_glass_row(uuid), public.move_flight_glass(uuid, int),
  public.glass_removal_impact(uuid), public.remove_flight_glass(uuid),
  public.set_flight_glass_added_via(uuid, text) from public, anon;
grant execute on function public.can_edit_flight_glass(uuid), public.can_remove_flight_glass(uuid),
  public.can_delete_flight_glass_row(uuid), public.move_flight_glass(uuid, int),
  public.glass_removal_impact(uuid), public.remove_flight_glass(uuid),
  public.set_flight_glass_added_via(uuid, text) to authenticated;
```

**Security reasoning (rule 1 and lane N)**

- **Host-added is a fact fixed at insert.** `added_by_host` is trigger-owned. Nulling the contributor, or deleting the contributor's participant row (the FK sets it null), leaves the glass with no adder instead of handing it to the host; such an orphaned glass keeps its key hidden until it is revealed. `is_wine_adder`, `can_edit_flight_glass`, §10's `wine_answers read` host clause and §12's hand-hosting refusal all key on it.
- **Clients update only `position` and `added_via`.** A host can no longer write `is_revealed` or `reveal_step` directly. That closes the `get_wine_reveal` peek (set a step, read the revealed cells, set it back) and the scoring bypass §14.3 mentions. Contributors, who hold no row-level UPDATE on `wines`, write provenance through `set_flight_glass_added_via`.
- **The setup lock.** `tastings_lock_setup_after_start` stops a host flipping `reveal_mode` (to reach §10's candidate list, or this section's OPEN branch) or `wine_source` mid-tasting. Deployed code changes these only in DRAFT (`updateTastingSetup`).
- The narrowed `wine_answers insert` / `update` put CLAUDE.md's documented rule — the host can not edit someone else's bring-your-own wine — into the database. A bring-your-own host can no longer overwrite, or plant, a contributor's hidden answer key.
- Clients can no longer change an answer key after a reveal, except on OPEN boards (glasses inserted revealed, where nothing is hidden). `merge_catalog_wines` and `resolve_unidentified_wine` are SECURITY DEFINER and keep working; the migration pre-asserts their `prosecdef`.
- **Positions stay contiguous.** `remove_flight_glass` renumbers for any adder in one transaction; a direct delete is allowed only to the host in DRAFT (deployed `removeWine` renumbers as the host) or on the adder's last glass (F10's undo). No client can leave a gap that makes the next `count + 1` insert collide.
- `glass_removal_impact` returns two counts to the adder only; it never says who guessed or what.
- `move_flight_glass` and `remove_flight_glass` write positions only and never read or return an answer key. Refusing to move a seen glass, or to remove a glass before a seen one, keeps "Glass N" stable for every glass the table has seen. The BEFORE UPDATE triggers on `wines` act only on the `is_revealed` flip, and `wines_pin_adder` only keeps its flag, so the position statements wake nothing.
- No lane N object is recreated; `guesses` still cascade when a glass is deleted. A semi-blind glass is never removed after Start, so `guesses_guessed_wine_id_fkey`'s SET NULL never runs against a locked or revealed holder in a running game (§8.4 covers the tasting delete).
- **Assertions.** Pre-assert: the live text of `wine_answers insert`, `wine_answers update` and `wines delete host`; `md5(prosrc)` of `is_wine_adder`; `authenticated` UPDATE on all eight `wines` columns; zero bring-your-own glasses with a null contributor. Post-assert: `added_by_host` NOT NULL with `wines_pin_adder` enabled; `authenticated` UPDATE on exactly `position` and `added_via`, `anon` none; the new policy set on both tables; `tastings_lock_setup_after_start` enabled; every helper SECURITY DEFINER with `search_path=public`; EXECUTE authenticated-only on the seven functions.

### 3.5 Tests

- `src/lib/flight-glass-rules.test.ts`: every combination of status × revealed × step × adder × host, for Edit and for Remove; Swap and Remove on a semi-blind glass before and after Start; Remove with `laterGlassSeen`; `dropIndex`.
- `src/lib/lobby-copy.ts` (new, pure) with `lobby-copy.test.ts`: the participants summary ("{n} declined", the count), `removalImpactLine(guesses, notes)` singular and plural, the phone eyebrow parts.
- `setup-copy.test.ts`: `settingsChangeRefusal` for DRAFT, IN_PROGRESS and CLOSED.
- **Behavioural SQL probe** (§1.6):
  - a contributor updates their own step-0 answer in IN_PROGRESS; refused at `reveal_step = 1`;
  - the host is refused on a contributor's glass, and on their own glass after its reveal;
  - the host removes a contributor's glass in DRAFT and is refused in IN_PROGRESS;
  - a contributor removes their own unrevealed glass in IN_PROGRESS and its guesses go;
  - `move_flight_glass` refuses to cross a revealed glass and leaves positions contiguous from 1;
  - `glass_removal_impact` returns no row to a non-adder;
  - **the host bypass:** a host's direct `update wines set contributor_participant_id = null`, `set is_revealed = true` or `set reveal_step = 7` → permission denied; `set position` → OK;
  - **a deleted contributor:** the host deletes a contributor's participant row → the glass keeps `added_by_host = false`, `is_wine_adder` is false for everyone, and the host still cannot update its key;
  - **OPEN:** the host inserts a revealed `wines` row and then its `wine_answers` → OK; updates that key → OK; deletes that last glass (F10's undo) → OK — both before and after the migration;
  - **renumbering:** a contributor removes glass 2 of 3 through `remove_flight_glass` → positions 1..2, and the next glass inserts at `count + 1` without a collision; `remove_flight_glass` is refused when a later glass is revealed or at `reveal_step = 1`, and for a semi-blind glass after Start; a contributor's direct delete of a middle glass is refused, of their last glass allowed;
  - **Swap:** on an IN_PROGRESS step-0 glass with a JOINED guess, the adder re-points `wine_answers.catalog_wine_id` → the guess row is unchanged, `wines.position` is unchanged, the old catalog wine's `blind_pending` clears and the new one's is set; `set_flight_glass_added_via` → OK for the adder, refused for a non-adder and for a semi-blind glass after Start;
  - **the setup lock:** `update tastings set reveal_mode = 'SEMI_BLIND'` → refused IN_PROGRESS, allowed in DRAFT.

### 3.6 Verification

- **1280px.** The labelled "Tasting settings" opens S4d; after Start the locked fields are read-only and the footer says so; drag reorders; the incomplete-row wording; Start below the Wines card.
- **375px.** Start pinned at the bottom; participant chips; "{n} declined"; the 34px gear opens S4d full screen, with the same locks after Start.
- **Edit after Start (both widths).** On a running host-provides tasting the host opens the running page's Wines card → Edit → the Swap and Remove rows. On a running bring-your-own tasting a JOINED contributor does the same on their own bottle and sees no Edit on anyone else's.
- **Swap.** On a glass with one saved guess (a seeded demo guesser): after the swap the glass keeps its number and the guess row still exists.
- **Remove on a running tasting.** The sheet shows "1 guess on this glass goes with it"; after the tap the glass disappears for the guesser within one AutoRefresh. With a later glass already revealed, Remove shows "A later glass has already been revealed — this one can't be removed now."
- **Settings (both widths).** Manage invitations: an invite sent after Start arrives; after End the invite field is gone. Delete the tasting arms, relabels "Tap again to delete it for everyone", disarms after 5 seconds, and deletes on a second tap inside the window. On a LIVE semi-blind tasting the guided-pacing toggle is present after Start.

### 3.7 Owner default

None of Q1–Q6 directly. The hand-hosting row relies on Q4 (§12).

---

## 4. B3 · Guests before the start (S5–S6b)

### 4.1 Screens

S5 (the invitation, phone), S5b (the invitation, laptop Overview card), S6 (joined, waiting, phone), S6b (joined, waiting, laptop).

### 4.2 Current state

- An INVITED viewer of `/tastings/[id]` gets a small "You're invited" card on top of the lobby, with the Wines card still visible (`page.tsx:378-419`).
- Overview: pending invitations are rows in the Blind tastings card (`src/app/overview/invitation-row.tsx`; `tastings-card.tsx:41-82`). There is no top card and no "Overview · what's happening now" eyebrow (`GUEST-01`; `overview/page.tsx:44-51` renders only `AppHeader title="Overview"` above the banner).
- R5's shared compact row: `src/components/tastings/invitation-row.tsx` (`InvitationRow`, `useInvitationResponses`).
- `/j/[code]` (`src/app/j/[code]/page.tsx:12-54`): signed out → `/login?next=`; signed in → `join_tasting_by_code` joins silently and redirects.
- A JOINED guest before Start sees "Waiting for the host to start the tasting." above the Wines card (`page.tsx:664-669`). `AutoRefresh` mounts only once started (:443).
- `calendar.ics` (lane N): host or JOINED, a 404 for everyone else, no LOCATION yet.
- No leave action. `tasting_participants_pin_identity` (091000) pins `tasting_id` and `user_id`; `participants update own or host` lets a participant change their own status at any time.
- No hosted-count helper: under RLS a client cannot count someone else's hosted tastings.
- `participants update own or host` lets a participant or the host write `joined_at`, and `respondToInvite` sends one (`actions.ts:412`). `generate_join_code` draws 6 characters from a 32-letter alphabet (about 30 bits).

### 4.3 Change

1. **Data.** `src/lib/invitation-data.ts` (server-only; not a server action):
   ```ts
   export type InvitationData = {
     tastingId: string;
     name: string;
     imageUrl: string | null;
     scheduledAt: string | null;
     place: string | null;              // tasting_places; RLS: host, JOINED, INVITED
     revealMode: RevealMode;
     timingMode: TimingMode;
     flow: FlowWord;                    // tasting-eyebrow flowWord
     glassCount: number;                // wines so far
     host: {
       id: string;
       name: string;
       avatarUrl: string | null;
       hostedCount: number;             // host_tastings_count
       averagePoints: number | null;    // getBulkProfileSummaries; null with no scored guesses
     };
     joinedNames: string[];             // JOINED, minus the viewer and the host, earliest joined first
     invitedCount: number;
     status: TastingStatus;
     viewerStatus: ParticipantStatus | "HOST";
   };
   export async function getInvitation(tastingId: string): Promise<InvitationData | null>;
   /** The viewer's soonest pending invitation, for the Overview card. */
   export async function getOverviewInvitation(): Promise<InvitationData | null>;
   ```
2. **Phone invitation (S5).** New `src/app/tastings/[id]/invitation-view.tsx`, rendered by `page.tsx` for an INVITED viewer of a DRAFT or IN_PROGRESS tasting (a CLOSED tasting keeps entry-6's "has finished" card). Parchment; full screen below `md`; a 560px centred column above.
   - Header: ✕ (to `/overview`) and "Invitation".
   - Host avatar; "{host} invited you"; "{hostedCount} tastings hosted · {avg} average" ("1 tasting hosted"; the average is omitted when null).
   - The name at full size.
   - Chips: the mode ("Blind" / "Semi-blind"), `glassesSoFarPhrase(glassCount)`, the flow word ("Guided" / "Free order" / "Self-paced").
   - A card: the date ("Thursday 11 Sep, 19:00") with `invitationDayPhrase` ("in 2 days"); the place; the avatar stack with "{names} are in" ("{name} is in"; omitted when nobody else has joined).
   - "How it is scored":
     - blind: six rows "Country 2", "Region 3", "Appellation 5", "Grape 8", "Producer 6", "Vintage 2", then "Up to 30 points a glass, Danish Championship rules. {host} may pour more — the count is whatever is in the flight tonight.";
     - semi-blind: no rows; "One point for each glass you match. {host} may pour more — the count is whatever is in the flight tonight."
   - "Bring a glass. Everything else happens on your phone."
   - Footer: "I am in" (primary; `respondToInvite` accept), with "Can't make it" beneath (decline). No calendar action.
3. **Laptop Overview card (S5b).** New `src/app/overview/invitation-card.tsx`, rendered by `overview/page.tsx` above the banner from `md` when `getOverviewInvitation()` returns one. It is fetched in `page.tsx`, not in `overview-data.ts` (T10's file).
   - Page eyebrow above it: "Overview · what's happening now". Card eyebrow: "Invitation · {eyebrowDayPhrase}" ("Invitation · 2 days away"; "Invitation" when unscheduled).
   - The cover image when set; "{host} invited you · {n} tastings hosted"; the name.
   - One chip row: mode, glasses so far, flow, time (`LocalDateTime format="eyebrow-short"`), place.
   - One line: "{names} are in · Up to 30 points a glass, Danish Championship rules" (semi-blind: "{names} are in · One point for each glass you match").
   - Inline "I am in" and "Can't make it" through `useInvitationResponses` (optimistic).
   - The Blind tastings card keeps its rows for the other invitations, and on phones.
4. **`/j/[code]`.** Every visitor first gets `get_join_preview(code)` (§4.4).
   - **Signed out:** the reduced preview — host name and avatar, the name, the time, the mode and flow words, the glass count, the scoring rows — with "Sign in to say yes" → `/login?next=/j/{code}`. No place, no joined names, no description, no cover photo (Q3).
   - **Signed in as the host, a JOINED or an INVITED participant** (`viewer_tasting_id` set): redirect to `/tastings/{id}`, where an INVITED viewer gets the full invitation.
   - **Signed in and not a member, a DECLINED guest coming back included:** B3's "sees the invitation and says yes". The signed-in form of the preview shows the host avatar, "{host} invited you" and the host record (`host_tastings_count(host_id)` and `getBulkProfileSummaries([host_id])`, both readable to any signed-in viewer); the name; the mode, glasses-so-far and flow chips and the time; "{names} are in" from `joined_names`; "How it is scored" as on S5; "Bring a glass. Everything else happens on your phone."; "I am in" (a server action that calls `join_tasting_by_code` and redirects) and "Can't make it" (back to `/overview`; nothing written). Never the place (Q2: host, JOINED and INVITED only), the description or the cover photo.
   - CLOSED: "That tasting has finished." (existing copy). An unknown code keeps its existing copy. The "already started" branch goes (B4).
5. **Joined guest before Start (S6, S6b).** New `src/app/tastings/[id]/guest-lobby.tsx`, rendered by `page.tsx` for a JOINED non-host viewer while DRAFT.
   - Eyebrow "{host} is hosting · {mode word}" (the laptop adds " · guided" when the flow is Guided); the name; a "You are in" pill; a ← back on phones.
   - Waiting block: "Waiting for {host} to pour"; LIVE adds "Glass 1 opens for everyone at the same moment."; ASYNC adds "Every glass opens when {host} starts." (**spec copy**).
   - "At the table · {joined} of {joined + invited}" (phone: "… arrived"). Chips in order: "You" (bordeaux fill), "{host} · host", joined people (solid), invited people (dashed, "{name}…"). DECLINED people are not shown.
   - The Tonight card (phone) or explanation paragraph (laptop) comes from a pure `tonightLines(...)`:
     - LIVE, guided, blind: "{Glasses so far}, poured one at a time. Guess six things about each — up to 30 points a glass." and "{host} reveals one attribute at a time, so the table finds out together." (PER_WINE: "{host} reveals each glass once it is done." — **spec copy**);
     - LIVE, free order: "Guess the glasses in any order — up to 30 points a glass." (**spec copy**);
     - ASYNC: "Guess at your own pace — up to 30 points a glass.", then AFTER_ALL "Answers show once everyone has guessed." or IMMEDIATE "You see each answer as soon as you submit." (**spec copy**);
     - semi-blind: "Match each glass to a wine on the list — one point for each glass you match." (**spec copy**), followed by "The list of tonight's wines opens when {host} starts." (**spec copy**); SB1's list appears on the matching board from Start (§10.3 item 1; Q7);
     - "{Glasses so far}" is `glassesSoFarPhrase` ("4 glasses so far"); with no glasses the sentence starts "Glasses are poured one at a time." (**spec copy**).
   - "While you wait":
     - "Add to your calendar", with "{short date} · {place}" → `/tastings/{id}/calendar.ics`; only when `scheduled_at` is set;
     - "The map" / "Regions and appellations, in Learn" → `/knowledge/map`;
     - "Knowledge" / "Grapes, styles and vintages, in Learn" → `/knowledge`;
     - laptop: "While you wait · both open Learn", the two links side by side with S6b's shorter subs "Regions and appellations" and "Grapes, styles, vintages" (`GUEST-30`).
   - Bring-your-own: S7's Wines card (the guest's own rows, the waiting rows, Add a wine) sits above "At the table".
   - "Leave the tasting" at the bottom → `leaveTasting(tastingId)` (new, `tastings/[id]/actions.ts`): DRAFT only; sets the caller's row to DECLINED; revalidates the page, `/overview` and `/taste`. Never offered to the host.
   - `AutoRefresh` mounts on the guest lobby and on the invitation view, so Start moves guests to glass 1 and a new arrival shows up.

### 4.4 SQL (M4 `join_preview_and_late_join`, together with §5)

```sql
create or replace function public.host_tastings_count(p_user_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from tastings
  where host_id = p_user_id and status in ('IN_PROGRESS', 'CLOSED');
$$;
revoke all on function public.host_tastings_count(uuid) from public, anon;
grant execute on function public.host_tastings_count(uuid) to authenticated;

create or replace function public.get_join_preview(p_code text)
returns table (
  name text,
  host_name text,
  host_avatar_url text,
  scheduled_at timestamptz,
  reveal_mode reveal_mode_type,
  timing_mode timing_mode,
  sequential_guessing boolean,
  glass_count int,
  status tasting_status,
  viewer_tasting_id uuid,   -- only when auth.uid() is the host or has a JOINED or INVITED row
  host_id uuid,             -- signed-in callers only (the host record)
  joined_names text[]       -- signed-in callers only: JOINED display names, host excluded, earliest first
)
language sql stable security definer set search_path = public as $$
  select t.name, p.display_name, p.avatar_url, t.scheduled_at,
         t.reveal_mode, t.timing_mode, t.sequential_guessing,
         (select count(*)::int from wines w where w.tasting_id = t.id),
         t.status,
         case
           when auth.uid() is not null
                and (t.host_id = auth.uid()
                     or exists (select 1 from tasting_participants tp
                                where tp.tasting_id = t.id and tp.user_id = auth.uid()
                                  and tp.status in ('JOINED', 'INVITED')))
           then t.id
         end,
         case when auth.uid() is not null then t.host_id end,
         case when auth.uid() is not null then (
           select coalesce(array_agg(jp.display_name order by tp.joined_at nulls last, tp.created_at), '{}')
           from tasting_participants tp
           join profiles jp on jp.id = tp.user_id
           where tp.tasting_id = t.id and tp.status = 'JOINED' and tp.user_id <> t.host_id
         ) end
  from tastings t
  join profiles p on p.id = t.host_id
  where t.join_code = upper(btrim(p_code))
    and t.reveal_mode <> 'OPEN';
$$;
revoke all on function public.get_join_preview(text) from public;
grant execute on function public.get_join_preview(text) to anon, authenticated;

-- Codes minted from now on carry 10 characters (about 50 bits). Recreated from
-- the live definition; only the loop bound changes. Existing codes keep working.
create or replace function public.generate_join_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..10 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- A guest may leave only before Start, and the host never leaves their own
-- tasting. Once the tasting has started (its status is not DRAFT, or M3 has
-- stamped its started_at, which no later status change clears) a JOINED row
-- stays JOINED, and stays in the table, for every signed-in caller, the host
-- included; only deleting the tasting itself removes it. service_role
-- (auth.uid() null) is not a client and stays free.
create or replace function public.tasting_participants_leave_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status tasting_status;
  v_started timestamptz;
  v_host uuid;
begin
  if tg_op = 'DELETE' then
    if old.status = 'JOINED' and auth.uid() is not null then
      select status, started_at into v_status, v_started from tastings where id = old.tasting_id;
      -- No tasting row: the tasting itself is being deleted (the cascade from deleteTasting).
      if found and (v_status <> 'DRAFT' or v_started is not null) then
        raise exception 'A guest who has joined stays in the tasting once it has started.'; -- (plan copy)
      end if;
    end if;
    return old;
  end if;
  if old.status = 'JOINED' and new.status <> 'JOINED' then
    select status, started_at, host_id into v_status, v_started, v_host from tastings where id = new.tasting_id;
    if new.user_id = v_host then
      raise exception 'the host cannot leave their own tasting';
    end if;
    if auth.uid() is not null and (v_status <> 'DRAFT' or v_started is not null) then
      if auth.uid() = new.user_id then
        raise exception 'you can only leave before the tasting starts';
      end if;
      raise exception 'A guest who has joined stays in the tasting once it has started.'; -- (plan copy)
    end if;
  end if;
  return new;
end $$;

create trigger tasting_participants_leave_guard
  before update of status or delete on public.tasting_participants
  for each row execute function public.tasting_participants_leave_guard();

-- joined_at belongs to the server and is stamped once: now() the first time a
-- row becomes JOINED (on insert, by accepting, or by the link), then never
-- moved. A later flip to JOINED keeps an existing joined_at (a guest who left
-- before Start and comes back keeps the first one); a DECLINED invitee who
-- never joined gets theirs on the first join. A client-sent value is never
-- taken (respondToInvite and the create action send one today).
create or replace function public.tasting_participants_stamp_joined_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.joined_at := case when new.status = 'JOINED' then now() end;
  else
    new.joined_at := old.joined_at;
    if new.status = 'JOINED' and old.status is distinct from 'JOINED' and old.joined_at is null then
      new.joined_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger tasting_participants_stamp_joined_at
  before insert or update on public.tasting_participants
  for each row execute function public.tasting_participants_stamp_joined_at();

revoke all on function public.tasting_participants_leave_guard(),
  public.tasting_participants_stamp_joined_at() from public, anon, authenticated;
```

**Security reasoning**

- **`get_join_preview` is the only new anon-callable function.** To a signed-out caller it returns what a link holder may know without an account (Q3): no place, joined names, description or wine data beyond a count; `host_id` and `joined_names` are null. A signed-in caller also gets the host id (for the host record, which any signed-in viewer can already compute from public profile stats) and the joined display names: the invitation B3 shows a signed-in link holder. The place never comes from this function (Q2). OPEN tastings are excluded.
- **`viewer_tasting_id`** goes only to the host and to JOINED or INVITED rows, so a DECLINED guest opening the link gets the invitation and can say yes again (B4, `CREATE-51`).
- **Enumeration.** Codes minted from now on carry 10 characters from a 32-letter alphabet (about 50 bits), out of reach of guessing through the anon key. The one existing 6-character code keeps working, because rotating it would break a link already shared. The RPC has no per-caller rate limit (§16.3). A hit discloses the reduced preview to anon, and to a signed-in guesser also the joined names; joining then shows the place — which is why new codes got longer.
- `host_tastings_count` returns one integer about a public profile (the People directory is open by design).
- `getInvitation` reads under the viewer's RLS: a `wines` count (any participant row can already read `wines`), `tasting_participants`, `profiles`, `tasting_places`. It never reads `wine_answers`. Rule 1 holds: a count, never a wine.
- **The leave guard** keeps `reveal_wine`'s eligible count from dropping after Start, which would otherwise let the remaining participants pass its participant gate early: once the tasting has started, no signed-in caller, the host included, moves a JOINED row out of JOINED or deletes it. A tasting counts as started when its status is not DRAFT or its `started_at` is set (M3, §11.4), which no later status change clears: the host can write `tastings.status`, so a status test alone would let a host set a running tasting back to DRAFT, take a guest out, and start it again. A guest is told "you can only leave before the tasting starts"; the host, "A guest who has joined stays in the tasting once it has started." (plan copy). Only deleting the tasting itself removes such a row: the guard lets it go once its tasting row is gone, which is how `deleteTasting`'s cascade reaches it. Before Start a guest can leave and the host can take a guest off the list; the host's own row never leaves JOINED, whoever writes it. INVITED and DECLINED rows can still be deleted. `service_role` (no `auth.uid()`) is not a client and stays free. Limit: a tasting that reached a started status without M3's Start stamp — the three live tastings started before M3 (no backfill), or one moved from DRAFT straight to OPEN or CLOSED by a direct update — has no `started_at`, so for it only the status test applies.
- **`joined_at` is trigger-owned and stamped once:** `now()` the first time a row becomes JOINED, never a client's value, and kept on every later flip to JOINED — a guest who left before Start and comes back keeps the first stamp, and a DECLINED invitee who never joined gets theirs on the first join. With the leave guard, neither a participant nor the host can move it to turn glasses into, or out of, "joined after" (§5, §11).
- Lane N: `tasting_participants_pin_identity` stays; the new triggers only read or stamp.
- **Assertions:** both new functions SECURITY DEFINER with `search_path=public`; `get_join_preview` returns exactly the twelve columns and EXECUTE exactly anon + authenticated (+ owner, service_role); `host_tastings_count` authenticated-only; `generate_join_code`'s body differs from live only in the loop bound; both triggers exist, enabled — the leave guard BEFORE UPDATE OF status OR DELETE, the joined-at stamp BEFORE INSERT OR UPDATE; the leave guard carries the DELETE branch and the host-worded refusal and counts a set `started_at` as started, and the stamp keeps an existing `joined_at`; M3's `tastings_stamp_lifecycle` is pinned before and after.

### 4.5 Tests

- `src/lib/invitation-copy.ts` (new, pure) with its test: `hostRecordLine(count, avg)`, `joinedNamesLine(names)`, `scoringSentence(revealMode, host)`, `tonightLines(...)` for its five variants, `atTheTableLabel(joined, invited, phone)`.
- `relative-day.test.ts` already covers the day phrases.
- **Behavioural SQL probe:**
  - the anon preview returns exactly the listed columns for a valid code, and no row for an unknown code or an OPEN tasting;
  - `viewer_tasting_id` is null for a signed-in stranger and for a DECLINED user, and set for an INVITED user and the host; that DECLINED user then joins by code and becomes JOINED with a fresh `joined_at`;
  - `host_id` and `joined_names` are null for anon; for a signed-in stranger `joined_names` lists the JOINED display names without the host;
  - a participant's or the host's `update tasting_participants set joined_at = …` leaves it unchanged; INVITED → JOINED stamps `now()`;
  - `ensure_join_code` on a codeless tasting returns 10 characters, and the existing 6-character code still joins;
  - `host_tastings_count` counts started and closed tastings only;
  - the leave guard allows JOINED → DECLINED in DRAFT, refuses it IN_PROGRESS, and always refuses the host.

### 4.6 Verification

- **375px and 1280px**, an INVITED demo account on `/tastings/[id]`: S5's content and no Wines card — full screen on the phone, a 560px centred column on the laptop; "I am in" → S6; "Can't make it" → back to the Overview with the invitation gone.
- **1280px Overview:** the eyebrow and the S5b card above the banner; accept inline.
- **Signed-out tab** on `/j/{code}`: the reduced preview, without place or names; "Sign in to say yes" returns to the same URL after login. There, signed in as a stranger to the tasting, the page shows the invitation with the host record and joined names, still without the place, and offers "I am in".
- **A DECLINED guest** reopens the link: the invitation with "I am in"; saying yes makes them JOINED again.
- **Joined guest:** "Add to your calendar" downloads an `.ics` with LOCATION (§13); "Leave the tasting" works in DRAFT; after the host presses Start the guest page moves to glass 1 within one AutoRefresh interval.

### 4.7 Owner default

Q3 (the preview's contents), Q2 (no place in the preview), Q6 (the link stays open until CLOSED).

---

## 5. B4 · Joining late

### 5.1 Screens

S3/S3b's share-link row. Joining late is otherwise not drawn (`XCUT-59`).

### 5.2 Current state

- `join_tasting_by_code` refuses every started non-OPEN tasting (probe; `20260911100000`).
- `inviteToTasting` refuses non-DRAFT, non-OPEN tastings: "Invites close once the tasting has started." (`tastings/[id]/actions.ts:222-224`).
- `JoinLinkRow`: "Works until you start the tasting." (`join-link-row.tsx:90`).
- `respondToInvite` accepts until CLOSED (`actions.ts:393-421`) and stamps `joined_at = now()`.
- Eligibility everywhere is "JOINED, minus the contributor, minus the host-provides host" (`play-experience.tsx:315-323`, `host/page.tsx:227-232`), so a late joiner is counted on glasses revealed before they arrived.
- There is no reveal time: `wines.revealed_at` does not exist.

### 5.3 Change

1. `inviteToTasting` refuses only CLOSED: "Invites close when the tasting ends." (**spec copy**). The OPEN branch folds into it.
2. `join_tasting_by_code` (M4) refuses only CLOSED. `joined_at` is stamped by M4's `tasting_participants_stamp_joined_at` trigger whenever a row becomes JOINED — by the link, by accepting, or by a DECLINED guest coming back — and a client-sent value is ignored, so a late joiner's clock starts when they said yes.
3. `JoinLinkRow`: "Works until the tasting ends.", in step 3 and in Manage invitations.
4. **Eligibility**, one pure module `src/lib/glass-eligibility.ts`:
   ```ts
   export type EligibilityParticipant = {
     id: string; userId: string; status: ParticipantStatus; joinedAt: string | null;
   };
   export type EligibilityGlass = {
     contributorParticipantId: string | null; isRevealed: boolean; revealedAt: string | null;
   };
   export function eligibleForGlass(
     p: EligibilityParticipant,
     g: EligibilityGlass,
     t: { wineSource: WineSourceMode; hostId: string },
   ): boolean;
   export function joinedAfterReveal(p: EligibilityParticipant, g: EligibilityGlass): boolean;
   ```
   - `eligibleForGlass` = JOINED, not the glass's contributor, not the host-provides host. It does not exclude a late joiner: they are eligible for every glass and simply have no row on the glasses revealed before they joined.
   - `joinedAfterReveal` = revealed, `revealedAt` and `joinedAt` both known, and `joinedAt > revealedAt`. A null `revealedAt` (every glass revealed before M3) is never "after".
   - Readiness ("N of M locked in") is shown only for unrevealed glasses, so a late joiner counts only where they can still act.
   - Result maths count a joined-after glass as 0 against its maximum (the ledger's "count 0"); the record row reads "You joined after this glass" (§11).
   - Callers: `play-experience.tsx`, `host/page.tsx`, `play/auto-reveal.ts` (its inline eligible set switches to this module), the result and record loaders (§11).
   - On the running page, a glass revealed before the viewer joined reads "You joined after this glass" on its revealed card, as the record does (§11).
5. A late joiner's play page opens on the current glass (§7's pointer). Glasses already mid-reveal are closed to them by the existing guards (`guessBlockReason`, the `guesses` policies).
6. `reveal_wine`'s participant gate counts JOINED participants, so a late joiner becomes an eligible guesser for the unrevealed glasses at once (in ASYNC the auto-reveal then waits for their lock too). The host can always reveal. No reveal-function change.

### 5.4 SQL

- M3 adds `wines.revealed_at` (listed with the lifecycle stamps in §11.4).
- M4 recreates `join_tasting_by_code` from its live definition with exactly one edit:
  ```sql
  -- removed:
  --   if v_tasting.status <> 'DRAFT' and v_tasting.reveal_mode <> 'OPEN' then
  --     raise exception 'that tasting has already started';
  --   end if;
  ```
  Its `joined_at = coalesce(tasting_participants.joined_at, now())` stays as written and agrees with M4's `tasting_participants_stamp_joined_at` trigger (§4.4), which owns the value: it keeps an existing `joined_at` and stamps `now()` only on a row's first flip to JOINED.
- **Assertions:** a text diff of `pg_get_functiondef` before and after shows only that edit (lane N's `reveal_wine` pattern); EXECUTE stays authenticated-only.

**Security reasoning.** Late joining is the owner's call (Q6). Rule 1: a late joiner sees what any JOINED participant sees; revealed glasses were already readable to every signed-in user (`is_revealed`), so nothing new leaks. `joined_at` is server-owned and stamped once, and once the tasting has started (its status is not DRAFT, or its `started_at` is set) no signed-in caller, the host included, moves a JOINED row out of JOINED or deletes it, not even after setting the tasting back to DRAFT (§4.4's leave guard; only deleting the tasting removes it), so neither the participant nor the host can move it to turn glasses into, or out of, "joined after".

### 5.5 Tests

- `src/lib/glass-eligibility.test.ts`: a late joiner is eligible on unrevealed glasses; joined-after only with both timestamps; the host-provides host and the contributor are never eligible.
- **Behavioural SQL probe:** joining by code IN_PROGRESS succeeds and stamps `joined_at`; CLOSED is refused; a DECLINED user joining through the link becomes JOINED with a fresh `joined_at`; a client-sent `joined_at` is ignored on insert and on update.

### 5.6 Verification

Start a LIVE tasting and fully reveal glass 1; join by link as a second demo account (375px and 1280px). Glass 2 is guessable, and glass 1's revealed card on the running page reads "You joined after this glass". After End, the record reads the same on glass 1, with 0 points.

### 5.7 Owner default

Q6.

---

## 6. B5 · Dark means live

### 6.1 Screens

Every live screen: S7, S7b, S8, S8b, S9, S10, S10b, S11, S11b, S12, S12b, SB2, SB3, SB4.

### 6.2 Current state

- `globals.css:5` defines `@custom-variant dark (&:is(.dark *))`. The `.dark` block (:142-176) is never applied.
- The console palette lives in separate `:root` tokens (:122-125, and `--gold-light` at :110): `--console #1b1310`, `--console-card #241b16`, `--console-ink #b9a98c`, `--miss #e08a76`, `--gold-light #d4af6a`. `host/console.tsx`, `locked-in.tsx` and `reveal-view.tsx` use them.
- The ladder (`guess-ladder.tsx:778` `bg-background`, rows `bg-white`), the picker (`field-picker.tsx:188` `bg-card`, a forced white search field), `match-ladder.tsx`, `standings-panel.tsx` and the revealed cards are parchment inside the parchment running page.
- Buttons hard-code `hover:bg-[#4A1523]` (`guess-ladder.tsx:852`, `page.tsx:427`, `components/tastings/invitation-row.tsx:113`).
- `PopoverContent` renders in a portal (`components/ui/popover.tsx`), outside any wrapper's class.

### 6.3 Change

1. **Tokens** (`globals.css`):

   | Token | `:root` (parchment) | `.dark` (live) | Note |
   |---|---|---|---|
   | `--background` | `#f5efe3` | `#1b1310` | exists |
   | `--card`, `--popover` | `#fbf7ef` | `#241b16` | exist |
   | `--surface-deep` (new) | `#ede4d1` | `#15100d` | the deepest live surface: pinned bars, header strips |
   | `--muted-foreground` | `#7a6a52` | `#b9a98c` | exists |
   | `--gold-dark` | `#6e5416` | `#d4af6a` | small gold text; on dark it reads gold-on-dark |
   | `--gold-light` | `#d4af6a` | `#d4af6a` | now also in `.dark` |
   | `--rose` | `#a8425a` | `#e08a76` | a miss turns miss-red on dark |
   | `--miss` | `#e08a76` | `#e08a76` | now also in `.dark` |
   | `--primary-hover` (new) | `#4a1523` | `#b04961` | replaces `hover:bg-[#4A1523]`; a step darker than `--primary` on parchment, a step lighter on dark |
   | `--border` | `#e0d2b4` | `rgba(245,239,227,.14)` | exists |
   | `--border-light` | `#f0e6d1` | `rgba(245,239,227,.08)` | now also in `.dark` |
   | `--border-strong` | `#dcceb0` | `rgba(245,239,227,.22)` | now also in `.dark` |
   | `--console`, `--console-card`, `--console-ink` | unchanged | unchanged | fixed aliases, so T9's console keeps rendering |

   - `@theme inline` gains `--color-surface-deep` and `--color-primary-hover`.
   - `.dark --primary` stays `#a8425a`, the bordeaux that reads on dark (the open row's border, "just now").
   - All hex values are the README's, except the dark hover `#b04961` (**spec**: one bordeaux step lighter than the dark `--primary` `#a8425a`, so a hover lifts on a dark ground; parchment text on it is 4.62:1, checked in §6.6).
2. **`src/components/live-shell.tsx`** (client):
   ```tsx
   export function LiveShell(props: { active: boolean; children: React.ReactNode }): React.JSX.Element;
   /** "dark" inside an active LiveShell, else null. */
   export function useLiveTheme(): "dark" | null;
   ```
   - Active: `<div className="dark flex flex-1 flex-col bg-background text-foreground">` plus the context value. Inactive: a fragment.
   - `components/ui/popover.tsx` `PopoverContent` adds the class `dark` when `useLiveTheme() === "dark"`, so the laptop picker popover (§8) and the "All {n}" standings popover render dark.
   - `Dialog` is untouched: the add-wine sheet keeps its own look (B5).
   - `FieldPicker`'s phone sheet is not portalled, so it inherits the class.
3. **Where the shell is active**
   - `/tastings/[id]` while IN_PROGRESS: everything below `AppHeader` (the app chrome stays as on every page).
   - `/tastings/[id]/host` while IN_PROGRESS (already dark; wrapped for the shared context).
   - CLOSED: the result (S12) is dark until the viewer dismisses it; then the parchment record (S13).
     - Pure `src/lib/live-theme.ts`: `resultDismissKey(tastingId)` = `"blindr:result-dismissed:" + tastingId`; `liveSurface({ status, dismissed })` → `"lobby" | "live" | "result" | "record"`.
     - The flag is read with `useSyncExternalStore`. The server snapshot is `null` (unknown) and renders only the page header; the client snapshot then picks the result or the record. A reload of a dismissed tasting therefore never flashes the dark result, and a first visit shows the result once hydrated.
     - Every storage access goes through the shared try/catch helper `src/lib/safe-storage.ts`; when storage throws, the flag lives in component state for the visit. localStorage stays the store (B5); no cookie.
   - Parchment: DRAFT (lobby, invitation, guest lobby), create, `/j/[code]`, the record.
   - `OPEN` tastings: no shell.
4. **Re-skin to tokens** in the files §7, §8, §10 and §11 already touch: `bg-white` → `bg-card`; `hover:bg-[#4A1523]` → `hover:bg-primary-hover`; fixed parchment hex → tokens. Misses keep `text-rose`, which the token flips. The console keeps its `bg-console` utilities.
5. `live-ping` and `rise-in` already drop under `prefers-reduced-motion` (`globals.css:251`, `:347`).

### 6.4 SQL

None.

### 6.5 Tests

- `src/lib/live-theme.test.ts`: `liveSurface` for DRAFT, IN_PROGRESS, and CLOSED dismissed or not; the key.
- `src/lib/safe-storage.test.ts`: reads and writes through a storage, a throwing storage and a missing one.
- A plan grep gate: `rg -n "bg-white|#4A1523|#[0-9a-fA-F]{6}" "src/app/tastings/[id]/play" "src/app/tastings/[id]/page.tsx" "src/app/tastings/[id]/host"` prints nothing.

### 6.6 Verification

- **375px and 1280px.** DRAFT is parchment. Press Start: the running page is dark — the ladder, the phone picker sheet, the laptop popover, waiting, the reveal, the standings. The add-wine sheet opened from the console keeps its own look.
- **End the tasting.** The result is dark; "See every wine" dismisses it and the parchment record shows; a reload shows the record once the page hydrates, with no flash of the result; a private window with site data blocked shows the result and still dismisses it for the visit.
- **Contrast.** Gold-on-dark text (`#d4af6a`: 8.84:1 on `#1b1310`, 8.15:1 on `#241b16`) and muted text (`#b9a98c`: 7.95:1 and 7.33:1) pass WCAG AA; parchment text on the dark hover `#b04961` is 4.62:1.

### 6.7 Owner default

None.

---

## 7. B6 · Host console (S7, S7b)

### 7.1 Screens

S7 (console, laptop), S7b (console, phone).

### 7.2 Current state

- **`src/app/tastings/[id]/host/page.tsx`** (454 lines; T9):
  - host-only after Start (:93-95);
  - the current glass is derived as the lowest-position unrevealed glass (:151), with the previous glass kept for a dwell;
  - chips from `inPlaySteps(answer)` (:49-59); a competing bring-your-own host sees only "Country" until step 1 (:248-254);
  - identity only for host-provides or a revealed glass (:276);
  - locked = a locked or scored row (:304-317);
  - facts use `categoryVisible = hostProvides || wine.is_revealed || revealedKeys.has(key)` (:256-257), so a host-provides host sees "Got the grape" and "Most said" counted from every row, drafts included, before any reveal;
  - standings from `getTastingLeaderboard`, labelled "after the {step}" or "after glass N" (:393-406); `RevealSync` for LIVE (:446-450).
- **`console.tsx`** (595 lines; T9):
  - header: "Live · you are hosting" (:233-238), the name, an outlined gold-light "Add a wine" (:246) opening `{ start: "camera" }` (:182-194), the "Tasting page" link (:249-262), End tasting behind `window.confirm(endTastingConfirm(…))` (:263-286);
  - reveal chips; the gold "Reveal the {x}" or "Reveal the whole glass"; "Reveal everything" behind `window.confirm("Reveal everything about this glass now?")` (:458-477); "Next glass →" (:479-483);
  - not-locked line "{names} has/have not locked in. Revealing now scores them on what they have." (:486-491);
  - no Pause, no Skip.
- **Semi-blind:** no chips (:239-240), "Reveal the whole glass", a "Matched this glass" fact read from host-readable `guesses.guessed_wine_id` (:326-330). Start lands on the lobby.
- **Pointer:** `tastings.current_wine_id` exists but is never read or written (probe: no row uses it). `sequentialOrderError` (`play/actions.ts:22-51`) and `play-experience.tsx:403-406` both derive the current glass as the lowest unrevealed one. `get_tasting_leaderboard`'s `live_round` is the lowest-position mid-step glass, else the newest scored glass.

### 7.3 Change

1. **Header (S7).** Live dot · "Live · you are hosting" · the name · "Pause" (or "Resume") · "+ Add a wine" in gold (filled `bg-gold-light text-console`) · "End tasting". T9's "Tasting page" link stays, as a text link.
   - **Phone (S7b):** one line with the eyebrow, "Pause" and "+ Wine"; no name; a ← back icon to the tasting page. End tasting moves to the bottom of the page, under the facts card (S7b draws none, and it must stay reachable).
2. **Pause** (Q1 default).
   - `setTastingPaused(tastingId, paused)`, a new server action in `tastings/[id]/actions.ts`: host only, IN_PROGRESS only, LIVE only ("Pause is for live tastings." — **spec copy**); writes `tastings.paused_at = now()` or `null`; revalidates the page and the console. Pause lives on the console, a LIVE surface: an ASYNC tasting has nobody driving reveals, and pausing its auto-reveal would leave a glass everyone locked unrevealed after Resume.
   - Every live screen shows a band while `paused_at` is set:
     - participants (ladder, waiting, reveal, matching board): "Paused · {host} has paused the tasting. You can still change and lock your guess." (**spec copy**);
     - console: "Paused — reveals and Skip wait until you resume." with "Resume" (**spec copy**).
   - While paused the console's reveal chips, gold button, "Reveal everything" and "Skip" are disabled. `revealNextCategory`, `revealFull`, `revealWine` and `skipToGlass` refuse with "The tasting is paused — resume to reveal." (**spec copy**). The ASYNC auto-reveal is untouched: an ASYNC tasting can never be paused.
   - Guesses stay editable and lockable: no pause guard in `saveGuessFields`, `lockGuess` or `assignMatch`.
   - The database refuses every reveal write while paused (§7.4), so a stale tab cannot reveal.
   - End tasting while paused is allowed; M7 clears `paused_at` when the status leaves IN_PROGRESS, and on any tasting that is not LIVE.
3. **Pour pointer.** Pure `src/lib/pour-pointer.ts`:
   ```ts
   export type PointerGlass = { id: string; isRevealed: boolean; revealStep: number };

   /** Glasses in list order. */
   export function currentGlass(
     glasses: readonly PointerGlass[],
     pointerWineId: string | null,
   ): { id: string; index: number; wrapped: boolean } | null;

   export function skipTarget(
     glasses: readonly PointerGlass[],
     current: { index: number },
   ): { id: string; index: number } | null;

   /** The highest list index already poured; -1 when none. */
   export function pouredThrough(glasses: readonly PointerGlass[], pointerWineId: string | null): number;
   ```
   - `currentGlass`: pointer null or not in the list → the lowest unrevealed glass; the pointer's glass unrevealed → that glass; the pointer's glass revealed → the next unrevealed glass after it in list order, wrapping to the lowest unrevealed one (`wrapped: true` when the result lies before the pointer); null when every glass is revealed. The pointer is never rewritten on a reveal.
   - `skipTarget`: the next unrevealed glass after `current`, wrapping; null when `current` is the only unrevealed glass.
   - `pouredThrough`: the largest index among revealed glasses, glasses with `revealStep > 0`, the pointer's glass and `currentGlass` (semi-blind dimming, §10).
   - **"Skip to glass {N} →"** calls `skipToGlass(tastingId, fromWineId)`, a new server action: host; IN_PROGRESS; not paused; `fromWineId` is `currentGlass` and has `reveal_step = 0` (Skip is offered only then). It writes `current_wine_id = skipTarget` as a compare-and-set against the pointer it read (`.eq("current_wine_id", prev)`, or `.is("current_wine_id", null)`), so a double tap skips one glass.
   - A skipped glass stays unrevealed and keeps its guesses. When the pointer passes the end the console's eyebrow reads "Glass {n} was skipped · Pour it now" (`wrapped`). In a semi-blind tasting a Skip never wraps: `skipPlan` returns null when its target would lie before the pointer, since every glass up to the pointer is already open for matching (plan refinement 23). The eyebrow is reveal-driven only; a blind Skip that itself wraps does not raise it.
   - **Pure guards.** Whether a step reveal of a glass is allowed now, and what a Skip writes, live in `src/lib/pacing-guards.ts`, so they are tested apart from the actions:
     ```ts
     export function revealStepRefusal(input: {
       guided: boolean; paused: boolean; glasses: readonly PointerGlass[]; pointer: string | null; wineId: string;
     }): string | null;
     export function skipPlan(input: {
       status: TastingStatus; paused: boolean; glasses: readonly PointerGlass[]; pointer: string | null; fromWineId: string;
     }): { targetId: string; expectPointer: string | null } | { error: string } | null;   // null: nothing to skip to
     ```
   - **Everything that paces reads the pointer:** `host/page.tsx` (current and previous glass); `play-experience.tsx` (`currentWineId` when guided); `sequentialOrderError` (reads `current_wine_id` and the wines, calls `currentGlass`); `revealNextCategory` in `reveal-actions.ts` (in guided LIVE a step reveal is accepted only on the current glass: "Reveal the glass that is pouring now." — **spec copy**); `get_tasting_leaderboard`'s `live_round` (M7).
   - This reverses "There is deliberately no Pause or Skip-glass control."
4. **Main area (S7).**
   - "Pouring now · glass {N} of {M} so far" (M = the flight's count so far).
   - The identity title, and the meta "{appellation} · {region} · {country} · {grape}" with "only you can see this" — only when the host set the answer (host-provides). A competing bring-your-own host sees "Glass {N}" or the contributor label and no identity (T9, D14 reveal-1).
   - "{k}/{n}" with "locked in".
   - "Reveal in order · tap to go one step further", then the chips: revealed ones gold with a check, the next one dashed gold "· next".
   - One gold button naming the next reveal ("Reveal the producer").
   - **"Reveal everything"** as an inline two-tap confirm in the button: the first tap arms it and relabels it "Tap again to reveal everything" for 5 seconds; the second tap submits `revealFull`. `window.confirm` goes. Pure `revealEverythingState(armedAt, now)`.
   - "Skip to glass {N} →".
   - **Not-locked line**, they/them for every name (`notLockedLine(names, phone)` in new `src/lib/console-copy.ts`):
     - one name: "{name} has not locked in. They are scored on whatever they have already answered — nothing at all if they have not started.";
     - two: "{a} and {b} have not locked in. They are scored on whatever they have already answered — nothing at all if they have not started."; three or more: "{a}, {b} and {n} others have not locked in. …";
     - phone: "{name} is scored on what they have answered — nothing if they have not started." / "{a} and {b} are scored on what they have answered — nothing if they have not started."
5. **Standings and facts** (right rail on laptops; cards on phones).
   - Standings with per-round deltas: "{rank} {name} +{lastRoundPoints} {total}", under the existing "after {step}" / "after glass N" label. Phone: the top two plus "All {n} ›", which opens a popover (dark through `useLiveTheme`) with the full list.
   - **"This glass"** (phone: "This glass, so far"): facts from revealed categories only, counted over eligible participants whose row has `locked_at` or `scored_at` (B0; D15 reveal-8 answered). Pure `src/lib/host-facts.ts`:
     ```ts
     export function glassFacts(input: {
       revealedKeys: readonly StepKey[];   // from reveal_step, or every step once revealed
       answer: { primary_grape_id: string; appellation_id: string | null } | null;
       rows: readonly {
         participant_id: string;
         primary_grape_id: string | null;
         appellation_id: string | null;
         locked_at: string | null;
         scored_at: string | null;
       }[];
       eligibleIds: ReadonlySet<string>;
       nameOf: (id: string) => string | null;
     }): { label: string; value: string }[];
     ```
     "Got the grape {k} of {n}" once `grapes` is revealed; "Got the appellation {k} of {n}" and "Most said {appellation}" once `appellation` is revealed; n = the eligible participants. `host/page.tsx` drops `hostProvides ||` from the facts' visibility test (identity keeps it).
6. **Semi-blind LIVE host-provides** (reverses "semi-blind and OPEN tastings stay on the lobby").
   - `startLandsOnConsole` includes it (§2).
   - The header's "+ Add a wine" is not offered after Start: a semi-blind flight is fixed at Start (§10.3 item 7).
   - The chips collapse to one gold "Reveal glass {N}" (`revealFull` → `reveal_wine`); no "Reveal everything".
   - Before the reveal the rail shows "{k}/{n} locked in" only. After it: "How the table split" — one row per candidate picked for that glass, "{producer}, {wine name} {count}", the correct one gold — and "Matched this glass {k} of {n}". Data from `get_semi_blind_board` (§10), never from `guesses.guessed_wine_id`.
7. **Competing bring-your-own host.** The answer-key read behind chips and facts moves to `get_wine_reveal(p_wine_id)` (host and JOINED; it returns revealed steps only).
   - Chips: the revealed chips from `revealed_keys`, then one dashed "Next" chip — bare at step 0, where `get_wine_reveal` returns a null `in_play_count` after M1 (§14.3), and with "{in_play_count − reveal_step} to go" (**spec copy**) from step 1; the gold button reads "Reveal the next attribute" (**spec copy**).
   - This must ship before M9 narrows the host clause of `wine_answers read` (§10.4).
8. **Incomplete glass.** Its reveal controls stay inert, with the refusal sentence and an "Edit" link beside it: `openAddWineSheet(flight, { start: "byhand", edit: { wineId } })` (B0).
9. **Phone (S7b).** Chips wrap; the "{k}/{n} locked in" card carries the short not-locked line; the standings card (top two + "All {n} ›"); the facts card; a pinned bottom bar (safe-area inset) with the gold reveal button full width, then "Reveal everything" and "Skip to glass {N} →" as two equal buttons.
10. **Which tastings reveal attribute by attribute** (`REVEAL-02`; Q8). One pure predicate in `src/lib/console-copy.ts`, `stepRevealApplies({ revealMode, timingMode, sequentialGuessing })` — LIVE + BLIND + guided pacing, the rule `leaderboardApplies` already uses — decides both the console's chips and the participants' `RevealView`. A LIVE blind tasting in free order reveals whole glasses ("Reveal the whole glass", as shipped), with standings after each glass. The two gates can no longer drift apart.

### 7.4 SQL (M7 `tasting_pacing`)

```sql
alter table public.tastings add column paused_at timestamptz;

-- The pour pointer must stay inside its own tasting.
create or replace function public.tastings_pointer_in_tasting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.current_wine_id is not null and not exists (
    select 1 from wines w where w.id = new.current_wine_id and w.tasting_id = new.id
  ) then
    raise exception 'the pour pointer must be a glass of this tasting';
  end if;
  return new;
end $$;
create trigger tastings_pointer_in_tasting
  before insert or update of current_wine_id on public.tastings
  for each row execute function public.tastings_pointer_in_tasting();

-- Pause exists only on a LIVE tasting while IN_PROGRESS; anything else clears it.
create or replace function public.tastings_pause_follows_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status <> 'IN_PROGRESS' or new.timing_mode <> 'LIVE' then
    new.paused_at := null;
  end if;
  return new;
end $$;
create trigger tastings_pause_follows_status
  before insert or update of status, paused_at, timing_mode on public.tastings
  for each row execute function public.tastings_pause_follows_status();

-- No reveal write while paused. It covers reveal_wine, reveal_next_category and
-- a host's direct update, without recreating a scoring function: reveal_wine
-- scores guesses before it flips wines.is_revealed, so this raise rolls that
-- scoring back in the same transaction.
create or replace function public.wines_refuse_reveal_while_paused()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.reveal_step > old.reveal_step or (new.is_revealed and not old.is_revealed))
     and exists (select 1 from tastings t where t.id = new.tasting_id and t.paused_at is not null)
  then
    raise exception 'The tasting is paused';
  end if;
  return new;
end $$;
create trigger wines_refuse_reveal_while_paused
  before update of reveal_step, is_revealed on public.wines
  for each row execute function public.wines_refuse_reveal_while_paused();
```

`get_tasting_leaderboard` is recreated from its live definition (`20260912106000`). Only the `t` and `live_round` CTEs change; the signature, the gate and every output column stay:

```sql
  with t as (
    select
      timing_mode::text as timing_mode,
      coalesce(leaderboard_reveal::text, 'PER_ATTRIBUTE') as leaderboard_reveal,
      current_wine_id                                              -- new
    from tastings
    where id = p_tasting_id
  ),
  -- countable: unchanged
  live_round as (
    select coalesce(
      -- new: the pour pointer's glass while its step reveal runs
      (select w.id from wines w cross join t
        where t.timing_mode = 'LIVE' and t.leaderboard_reveal <> 'PER_WINE'
          and w.id = t.current_wine_id and w.reveal_step > 0 and not w.is_revealed),
      -- unchanged: the lowest-position glass mid step-reveal
      (select w.id from wines w cross join t
        where t.timing_mode = 'LIVE' and t.leaderboard_reveal <> 'PER_WINE'
          and w.tasting_id = p_tasting_id and w.reveal_step > 0 and not w.is_revealed
        order by w.position limit 1),
      -- unchanged: the newest scored glass
      (select c.wine_id from countable c cross join t
        where t.timing_mode = 'LIVE' and c.scored_at is not null
        order by c.scored_at desc limit 1)
    ) as wine_id
  ),
  -- async_round and the final select: unchanged
```

**Security reasoning**

- `paused_at` and `current_wine_id` are written by the host through the live `tastings update host` policy. Participants may read them: they learn only that the table is paused and which glass is being poured, never what is in it (rule 1).
- The pointer trigger stops a host pointing at another tasting's wine.
- The reveal-while-paused trigger is SECURITY DEFINER only so it can read `tastings` whoever the caller is; it adds a refusal and grants nothing.
- No scoring function is recreated. Lane N's 092000 gate and 090000 helper are untouched. `get_tasting_leaderboard` returns the same shape to the same callers.
- **Assertions:** pre-assert the live leaderboard body's md5 (as lane N did); post-assert that the new body differs from live only in `t` and `live_round` (text diff); the three triggers exist and are enabled; `paused_at` exists and is nullable.

### 7.5 Tests

- `src/lib/pour-pointer.test.ts`: no pointer; pointer unrevealed; pointer revealed → the next glass; wrap with `wrapped: true`; every glass revealed → null; `skipTarget` wrapping and the sole-glass case; `pouredThrough`.
- `src/lib/pacing-guards.test.ts`: `revealStepRefusal` for a non-current glass in guided LIVE, a paused tasting and free order; `skipPlan` for a stale `fromWineId`, a glass at `reveal_step > 0`, a paused or not-running tasting, a wrap, and the sole unrevealed glass.
- `src/lib/console-copy.test.ts`: `notLockedLine` for one, two and many names, laptop and phone; `pausedBand(host)`; `revealEverythingState` arming and expiry; `nextChipLabel` with a null count; `stepRevealApplies` for guided LIVE blind, free order, ASYNC and semi-blind.
- `src/lib/host-facts.test.ts`: no facts before any reveal; the grape fact after the grapes step; unlocked, unscored drafts never counted; appellation facts only when in play and revealed.
- `tasting-lifecycle-copy.test.ts` (from §2).
- **Behavioural SQL probe:**
  - while paused, `reveal_next_category` and `reveal_wine` raise and no `guesses` points change; after resume both succeed;
  - a pointer to another tasting's wine is refused;
  - `last_round_points` follows the pointer's glass mid-step;
  - moving the status to CLOSED clears `paused_at`; a `paused_at` written on an ASYNC tasting stays null;
  - two compare-and-set pointer writes with the same expected pointer (`update tastings set current_wine_id = … where id = … and current_wine_id is not distinct from <prev>`) → exactly one changes a row.

### 7.6 Verification

- **1280px (S7).** Pause → a participant's page (a second tab with a demo session, at 375px and at 1280px) shows the band within one refresh, and their guess still saves; the console's reveal controls are disabled; Resume.
- At step 0, "Skip to glass 4 →" (a quick double tap still skips exactly one glass); fully reveal glass 4; the console now reads "Glass 3 was skipped · Pour it now".
- "Reveal everything" arms, relabels, and reveals on the second tap; no browser dialog appears.
- **375px (S7b).** The pinned bar; top-two standings with "All 7 ›"; facts only after the grape step.
- **LIVE semi-blind host-provides.** Start lands on the console; "Reveal glass 1"; "How the table split" after the reveal.
- **Bring-your-own host.** No identity and no facts before a step is revealed; at step 0 the chip reads a bare "Next", from step 1 "Next" with the count to go.
- **Free order.** A LIVE blind tasting without guided pacing offers "Reveal the whole glass" on the console, and its participants go from the ladder straight to the revealed card.

### 7.7 Owner default

Q1 (Pause semantics), Q8 (which LIVE blind tastings reveal attribute by attribute).

---

## 8. B7 · Guessing, picker, waiting (S8–S10b)

### 8.1 Screens

S8 (guessing, phone), S8b (guessing, laptop), S9 (a picker), S10 (locked in, waiting), S10b (waiting, laptop).

### 8.2 Current state

- **`src/app/tastings/[id]/play/guess-ladder.tsx`** (885 lines; T6): a parchment root `bg-background` (:778); header with back arrow, eyebrow, "Glass N" and a rank chip (:780-800); flight bar (:804-816); summary "Your guess so far {stake} / {MAX_POINTS} pts at stake" (:820-826); rows with points, "just now" (:715-717) and empty text; the More toggle with secondary grape, type designation and `LADDER_EXTRAS_NOTE` (:832-840); footer lock button and helper (:847-862).
- **Autosave.** Every pick calls `submitGuess` with the complete row (`buildFormData`, :104-129), debounced 150 ms. `latestRef` / `savedRef` (:231-256): a failed save resets the whole screen to `savedRef`, discarding picks made in the meantime (critic on `XCUT-53`).
- **`submitGuess`** (`play/actions.ts:192-266`): select, then update or insert every guess column; three `revalidatePath` calls per tap (:262-264).
- **Vintage picker.** Years from this year down to `OLDEST_YEAR = 1960` (:71, :523-528), NV, tawny 10/20/30/40 (:70). Answer keys accept 1900 to UTC year + 1 and tawny 1–100 (F1), so older and next-year vintages cannot be guessed (critic on `PLAY-15`).
- **`field-picker.tsx`** (348 lines; T6): a keep-mounted bottom sheet, a centred 480px dialog from `md` (:27-38, :188-189); synchronous focus from the ladder; shortlist groups from `shortlistGrapesForRegion` ("Grown in {place}") and `search_producers`' `in_region`; a footer with skip and next (:304-311).
- **`lock-copy.ts`** (T6): the ASYNC + IMMEDIATE lock labels, `LADDER_EXTRAS_NOTE`, `MATCH_FOOTER`.
- **`locked-in.tsx`** (323 lines; T8): the dark waiting state — roster chips, "What you said" chips, the stake, "Change it" (`unlockGuess`), a standings link; no note action; `canChange` never false.
- **`unlockGuess`** refuses only scored rows (`actions.ts:384-419`); the live `guesses update own` policy already refuses a row whose glass has `reveal_step > 0`.

### 8.3 Change

1. **Header** (dark, §6): live dot; the tasting name; a segmented flight bar sized to the glasses so far (`flightSegments`); "Glass {N} of {M}"; the rank chip "{ordinal} of {competitors} · {points} pts" on laptops and "{ordinal} · {points} pts" on phones (`getTastingLeaderboard` + `rankRows`); the laptop eyebrow "Live · {host} is hosting" (`PLAY-05`); the paused band (§7). Phone (S8): the title reads "{tasting} · {mode word}" ("Nebbiolo vs Sangiovese · blind"), and "{k} of {n} locked" sits under the flight bar, counted from `tasting_guess_status` like the laptop rail's roster.
2. **Intro:** "What is in glass {N}?" and "Each row saves as you answer it. Skip anything you cannot call."
3. **Summary:** "Your guess so far" with "{x} / 30 at stake" (phone: "{x} / 30 pts at stake"). x = `pointsAtStake(guess)`, the point values of the answered fields; 30 is the constant ceiling (`MAX_POINTS`). No per-wine maximum appears anywhere on the page (rule 1).
4. **Rows:** points first; the field name ("Grape · worth the most"); the answer. The row whose picker is open is bordeaux-bordered; the row set last carries "just now"; unanswered rows are dashed and read "Skip, or name one".
   - Vintage: the label "Vintage · 1 pt if a year out" and the empty text "Year, NV or tawny — or skip".
   - Secondary grape and type designation stay under More for every glass, with T6's `LADDER_EXTRAS_NOTE` (the handoff's footnote is not adopted).
5. **Writes: a per-field-group upsert** (reverses "each pick autosaves the COMPLETE row").
   - Pure `src/app/tastings/[id]/play/guess-write.ts`:
     ```ts
     export type GuessFieldGroup = "origin" | "grapes" | "producer" | "designation" | "vintage";

     export const GROUP_COLUMNS: Readonly<Record<GuessFieldGroup, readonly (keyof GuessRow)[]>>;
     //   origin:      country_id, region_id, appellation_id   (a region pick sets its country, T6)
     //   grapes:      primary_grape_id, secondary_grape_id
     //   producer:    producer_id
     //   designation: type_designation_id
     //   vintage:     vintage_kind, vintage_year, vintage_tawny_years

     export function groupForField(field: LadderField): GuessFieldGroup;

     /** YEAR needs 1900..(UTC year + 1); TAWNY needs 1..100; NV clears both numbers. */
     export function groupPayload(
       group: GuessFieldGroup,
       row: GuessRow,
       now: Date,
     ): { values: Partial<GuessRow> } | { error: string };

     export function vintageOptions(now: Date): { years: number[]; tawny: number[] };
     ```
   - Server action `saveGuessFields(tastingId, wineId, group, values)` in `play/actions.ts`:
     1. `resolveGuesser`, `guessableWineError`, `sequentialOrderError` (pointer-aware, §7);
     2. `groupPayload` validation — the server never trusts the client's shape;
     3. read the caller's `locked_at, scored_at`: locked → "Change it first — this glass is locked in." (**spec copy**); scored → the existing `LOCKED_ERROR`;
     4. `supabase.from("guesses").upsert({ wine_id, participant_id, ...values }, { onConflict: "wine_id,participant_id" })`. PostgREST's merge-duplicates updates only the columns sent, so the other groups stay as they are;
     5. no `revalidatePath`; return `{ ok: true } | { error: string }`.
   - The ladder keeps one save queue per group. `savedRef` holds the last server-confirmed values per group; a failure reverts only that group's fields on screen and shows the error under its row; picks in other groups carry on.
   - The queue's rules live in pure `src/app/tastings/[id]/play/guess-save-queue.ts` (enqueue, confirm and fail per group → the visible row and a per-group error), so the fix for the whole-row reset (critic on `XCUT-53`) is tested: a failure reverts only its group while a newer pick in another group is pending; confirmations may arrive out of order; a second pick in a group supersedes the first; a failure that arrives after a later successful pick in the same group keeps the later value.
   - **Lock waits for the queues.** "Lock in glass {N}" awaits every pending group save before it calls `lockGuess`, so a save racing the lock never meets M8's refusal. A 42501 that still arrives after a successful lock maps quietly to `LOCKED_EDIT_REFUSAL`.
   - `submitGuess` is marked `@deprecated` and deleted once `rg -n "submitGuess" src` is empty.
6. **Vintage picker** (`vintageOptions(now)`): years from UTC year + 1 down to 1900; "NV"; tawny "10 years", "20 years", "30 years", "40 years" and "Other age…", which shows a controlled number input (1–100) inside the picker.
7. **Laptop (S8b).** Two columns: the ladder on the left with wider rows; a sticky right rail with
   - the stake card "Your guess so far {x} / 30 at stake";
   - "{k} of {n} locked in", with "{name} ✓" and "{name}…" for anyone still deciding (eligible participants, from `tasting_guess_status`);
   - "Standings after glass {N−1}" with the top three (hidden before any glass is revealed);
   - "Lock in glass {N}" and "Saved as you go. Locking stops edits and tells the table you are ready."
   - The phone footer reads "Lock in glass {N}" and "Saved as you go. Locking stops edits and shows the others you are ready."
   - **Picker presentation:** `FieldPicker` gains `presentation: "sheet" | "popover"`. The ladder chooses `"popover"` from `md` (the shared `useMediaQuery("(min-width: 768px)")` from `src/components/add-wine/use-camera.ts:46` — a layout choice, not device routing; the plan's BT-A0 confirms the export survives add-wine S6, and a neutral `src/lib/use-media-query.ts` takes its place if it does not). Both presentations stay mounted and receive `.focus()` synchronously in the opening tap. The popover is base-ui `Popover` with `positionMethod="fixed"` and `keepMounted`, anchored to its row, with "Everything else" in two columns.
8. **The picker (S9).**
   - Title "Which {field}?" with a gold pill "{points} pts"; search "Search {count} grapes" (phone) or "Type to search all {count} grapes" (laptop), and the same per field ("Search {count} producers", …); "Skip" beside the pill on laptops.
   - The shortlist header: grapes "Common grapes in {region}" (S9; it replaces "Grown in {region}" — the handoff's note that no grape-to-region table exists is stale, but its copy stands); producers keep "Specific to {region}". Each row keeps its context line (existing place lines for grapes), plus " · you guess this often" when the viewer has picked that id at least 3 times.
   - "Everything else · all {count}".
   - Footer: "Not sure — skip it" · "Next: {field} →".
   - The shortlist orders the list and never restricts it.
   - **Counts:** grapes, countries and regions from `getReferenceOptions()`; appellations and producers from `select("id", { count: "exact", head: true })`, once per request — no rows loaded, never preloaded; type designations from the active list the ladder already preloads (about 50 rows); vintages from `vintageOptions(now).years.length`.
   - **"you guess this often":** `PlayExperience` computes `pickCounts: Partial<Record<LadderField, Record<string, number>>>` from the viewer's own `guesses` rows across all their tastings (ids only; their own rows under RLS). The threshold lives in pure `pick-counts.ts` (`oftenPicked(counts, id)`: at least 3).
9. **Waiting (S10, dark, `locked-in.tsx`).**
   - "Waiting for the table"; `decidingLine(names)` followed by "The reveal starts when everyone is in — or when the host moves on." (laptop: "The reveal starts when everyone is in, or when {host} moves on.").
   - The roster chips with the viewer's in gold, "What you said" chips including "no producer", and "{x} pts at stake" — all existing.
   - "Change it", allowed until the glass's first reveal step: hidden once `reveal_step > 0`; `unlockGuess` refuses with "The reveal for this glass has started — guessing is closed." (`guessBlockReason`'s string).
   - "Note this glass" (§9).
   - "Standings after glass {N}" (existing link).
10. **Waiting on a laptop (S10b).** The S8b layout with the ladder closed. Left: "What you said · {x} pts at stake" chips, "Change it", "Note this glass" with "Attaches to the wine at the reveal", "Standings ›". Right rail: the roster "{k} of {n} locked in" and "The reveal starts when everyone is in, or when {host} moves on."

### 8.4 SQL (M8 `guess_lock_pin`)

```sql
-- A locked guess keeps its answers until it is unlocked. Locking and unlocking
-- (locked_at alone) and the scoring functions (score columns only) pass.
create or replace function public.guesses_refuse_locked_edit()
returns trigger language plpgsql set search_path = public as $$
begin
  -- The one change allowed on a locked row: its candidate becoming null while
  -- every other answer stays (guesses_guessed_wine_id_fkey's SET NULL when the
  -- picked glass is deleted, for example inside a tasting delete).
  if old.locked_at is not null and new.locked_at is not null
     and old.guessed_wine_id is not null and new.guessed_wine_id is null
     and row(new.country_id, new.region_id, new.appellation_id, new.primary_grape_id,
             new.secondary_grape_id, new.producer_id, new.type_designation_id,
             new.vintage_kind, new.vintage_year, new.vintage_tawny_years)
         is not distinct from
         row(old.country_id, old.region_id, old.appellation_id, old.primary_grape_id,
             old.secondary_grape_id, old.producer_id, old.type_designation_id,
             old.vintage_kind, old.vintage_year, old.vintage_tawny_years) then
    return new;
  end if;
  if old.locked_at is not null and new.locked_at is not null
     and row(new.country_id, new.region_id, new.appellation_id, new.primary_grape_id,
             new.secondary_grape_id, new.producer_id, new.type_designation_id,
             new.vintage_kind, new.vintage_year, new.vintage_tawny_years, new.guessed_wine_id)
         is distinct from
         row(old.country_id, old.region_id, old.appellation_id, old.primary_grape_id,
             old.secondary_grape_id, old.producer_id, old.type_designation_id,
             old.vintage_kind, old.vintage_year, old.vintage_tawny_years, old.guessed_wine_id)
  then
    raise exception 'this guess is locked in — change it first'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger guesses_refuse_locked_edit
  before update on public.guesses
  for each row execute function public.guesses_refuse_locked_edit();
```

**Security reasoning.** The trigger only refuses, and runs as the invoker. `reveal_wine`, `reveal_next_category` and `score_own_guess` write score columns and `scored_at` only, so they pass. §10's pool release clears `guessed_wine_id` and `locked_at` together (`new.locked_at` is null), so it passes. The only change it lets through on a locked row is `guessed_wine_id` becoming null with every other answer equal — the FK's SET NULL, which a tasting delete can fire against a row that is itself cascading away, in either order; clients cannot write `guessed_wine_id` after M9 anyway. A whole-tasting delete also passes `guesses_block_after_reveal`: one statement deletes every glass of the tasting before the FK actions on `guesses` run, so that trigger finds no revealed glass. A semi-blind glass is never removed on its own after Start (§10.3 item 7). The 093000 client-column privileges, `guesses_pin_identity` and `guesses_block_after_reveal` stay. There is no read path, so rule 1 is unaffected. **Assertions:** the trigger exists with this definition, enabled; `guesses` carries exactly the live three triggers plus this one.

### 8.5 Tests

- `guess-save-queue.test.ts`: the four race cases of §8.3 item 5, lock readiness once every group has settled, and a 42501 after a lock.
- `guess-write.test.ts`: `groupForField` for every ladder field; `groupPayload` vintage shapes (YEAR 1900..UTC+1, tawny 1..100, NV) and the origin group carrying the country; `vintageOptions(now)` from UTC year + 1 down to 1900.
- `src/app/tastings/[id]/play/ladder-copy.ts` (new, pure) with its test: the intro, the rank chip for laptop and phone, the vintage label, the waiting tail with and without the host's name.
- `pick-counts.test.ts`: the threshold of 3.
- **Behavioural SQL probe:** upserting the origin group creates the row; a later grapes upsert leaves origin intact; updating a locked row's answers is refused by the trigger; lock and unlock pass; an update on a glass at `reveal_step = 1` is refused (live policy); `reveal_wine` still scores locked rows; a service-role delete of a picked, unrevealed semi-blind glass nulls the locked holder's `guessed_wine_id` and nothing else; deleting a semi-blind tasting whose guesses hold locked matches and a pick on a revealed glass succeeds.

### 8.6 Verification

- **375px.** Pick country → region → appellation → grape; each row shows "just now" in turn. With the network offline for one pick (DevTools), only that row reverts and shows the error. "1905" and "NV" are selectable; tawny "Other age…" accepts 25.
- **1280px.** The picker opens as a popover under its row; typing straight after the click lands in the search field; the rail stays in view while scrolling; lock, then "Change it"; once the host reveals the first step, "Change it" is gone.
- **375px header.** "{tasting} · blind" and "{k} of {n} locked" under the flight bar.
- **Waiting, 375px (S10).** Lock glass 3: "Waiting for the table"; roster chips with the viewer's in gold; "What you said" chips with "no producer" when the producer was skipped; "{x} pts at stake"; "{name} is still deciding." followed by "The reveal starts when everyone is in — or when the host moves on."; "Change it" disappears once the host reveals the first step.
- **Waiting, 1280px (S10b).** Lock: the ladder closes into the S10b layout — "What you said · {x} pts at stake", Change it, "Note this glass" with "Attaches to the wine at the reveal", and Standings › on the left; the roster rail with "The reveal starts when everyone is in, or when {host} moves on." on the right.
- **Lock during a save.** With a group save still pending (network throttled), Lock waits for it, then locks; no error shows.
- **Both.** An AutoRefresh during a pick resets neither the open picker nor a half-typed tawny age.

### 8.7 Owner default

None.

---

## 9. B8 · A note on a hidden glass (S10)

### 9.1 Screens

S10 ("Note this glass"), S10b ("Note this glass · Attaches to the wine at the reveal").

### 9.2 Current state

- `locked-in.tsx` offers no note. CLAUDE.md: "No WSET note can be written while a glass is locked."
- **Notes.** `wset_notes_one_identity` requires exactly one of `catalog_wine_id` / `unidentified_wine_id`. `wset notes read` and `wset note aromas read` are `using (true)`; insert and update are author-only. Notes are saved through `save_wset_note(p_note, p_aromas)` (SECURITY INVOKER; `src/app/catalog/[wineId]/notes/note-editor.tsx:91`), which writes `catalog_wine_id`, `context_kind` and `tasting_wine_id` from the payload.
- `save_wset_note` never writes `unidentified_wine_id`, and on update sets `catalog_wine_id` from the payload (§0.1). A sheet opened on a hidden glass before its reveal would null the identity the resolve trigger set, and an unidentified wine can get no note at all.
- `/catalog/<any wine>/notes/new?blindWine=<glass id>` (`src/app/catalog/[wineId]/notes/new/page.tsx:47-48`) writes a BLIND note carrying a catalog identity and `tasting_wine_id` for any glass, revealed or not. With `wset notes read` public, a crafted link publishes a glass-to-wine mapping.
- `src/components/new-note-modal.tsx:28-47`: `NewNoteModal({ wineId, onClose, cellarConsume, tastingWineId, contextKind, onSaved })` loads a catalog wine by `wineId`.
- `wset_notes_check_hue` (a BEFORE trigger) validates `colour_hue` against `catalog_wines.colour` when the note has a catalog wine.
- `catalog_wine_mark_blind` ignores notes without a catalog id.
- Deleting a glass sets `wset_notes.tasting_wine_id` to null (`on delete set null`).
- R4's archive rows already tolerate `catalogWineId = null` (`src/app/taste/notes/notes-search.ts:48,57`). R6's after-save copy has a hidden-note branch ("It will attach to the wine when the glass is revealed.").

### 9.3 Change

1. **Entry points.**
   - `locked-in.tsx` (S10), under "While you wait": "Note this glass" with "What you smell and taste, and what you would give it — it attaches to the wine at the reveal". Laptop (S10b): "Note this glass" with "Attaches to the wine at the reveal".
   - The open ladder: a text link "Note this glass" under the lock button, on both widths — a taster may note a glass "locked or not".
   - When the viewer already has a hidden note on the glass, the row reads "Your note · {d} of {t} assessed" (R3's `summarizeNoteState`) and opens it.
   - Offered only to eligible guessers (never the host-provides host or the bottle's contributor), and only while the glass is unrevealed. Pure `canNoteHiddenGlass({ status, isRevealed, eligible })`.
2. **The note sheet.** `NewNoteModal` takes a target union:
   ```ts
   export type NoteTarget =
     | { kind: "catalog"; wineId: string; tastingWineId?: string | null; contextKind?: string | null }
     | { kind: "hidden-glass"; tastingWineId: string; tastingName: string; glassLabel: string };
   ```
   - A `hidden-glass` target loads no catalog wine. The header shows the eyebrow "Tasting note" and the title "{tastingName} · {glassLabel}", and under it "Only you can read this until the glass is revealed. Then it attaches to the wine." In Danish through `makeT` (the WSET dictionary): "Kun du kan læse den, indtil glasset afsløres. Så knyttes den til vinen." (**spec copy**; the owner reviews the Danish).
   - The colour family is unknown, so the hue control offers every hue grouped by family (white, rosé, red) instead of the read-only family line (`wine-colour-control.tsx` gains `family: WineColour | null`).
   - The style is unknown: the sections are a still wine's (no mousse row), and the summary total follows `noteTotal(null)`.
   - `note-editor.tsx` saves `{ catalog_wine_id: null, context_kind: "BLIND", tasting_wine_id }` through `save_wset_note`, which M5 recreates so an update never removes an identity the note already has and an insert can carry `unidentified_wine_id` (§9.4); the policies enforce the rest.
   - After the reveal the same note opens as an ordinary catalog (or unidentified) note.
3. **Archive.** R4 lists a hidden note as "{tasting name} · Glass {N}" (its prepared row model); a resolved note shows its wine. R6 shows its hidden-note sentence after saving.
4. **Rating.** Once resolved it counts as a rating: `catalog_wine_ratings` averages notes by `catalog_wine_id`, which is null until the reveal.
5. **The `?blindWine=` link.** `src/app/catalog/[wineId]/notes/new/page.tsx` honours `blindWine` only for a revealed glass the viewer may note (its host or a JOINED participant); anything else is a 404. The database refuses the write regardless (§9.4).

### 9.4 SQL (M5 `hidden_glass_notes`)

```sql
-- May the caller attach a note to this tasting glass? JOINED participant or host of its tasting.
create or replace function public.can_note_tasting_wine(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wines w join tastings t on t.id = w.tasting_id
    where w.id = p_wine_id
      and (t.host_id = auth.uid()
           or exists (select 1 from tasting_participants p
                      where p.tasting_id = t.id and p.user_id = auth.uid()
                        and p.status = 'JOINED'))
  );
$$;

-- Is this glass revealed? VOLATILE on purpose: every call reads with a fresh
-- snapshot, so the write policies below see a reveal that committed while the
-- write was waiting on the glass (wset_notes_glass_resolve_on_write). A STABLE
-- helper would judge that row by the statement's older snapshot and refuse it.
create or replace function public.is_tasting_wine_revealed(p_wine_id uuid)
returns boolean language sql volatile security definer set search_path = public as $$
  select coalesce((select is_revealed from wines where id = p_wine_id), false);
$$;

-- Does a hue fit a wine colour? The same mapping wset_notes_check_hue enforces.
create or replace function public.wset_hue_fits_colour(p_hue wset_colour_hue, p_colour wine_colour)
returns boolean language sql immutable set search_path = public as $$
  select p_hue is null or p_colour is null or case p_colour
    when 'WHITE' then p_hue in ('LEMON_GREEN', 'LEMON', 'GOLD', 'AMBER', 'BROWN')
    when 'ROSE'  then p_hue in ('PINK', 'SALMON', 'ORANGE')
    when 'RED'   then p_hue in ('PURPLE', 'RUBY', 'GARNET', 'TAWNY', 'BROWN')
    else true
  end;
$$;

alter table public.wset_notes drop constraint wset_notes_one_identity;
alter table public.wset_notes add constraint wset_notes_one_identity check (
  num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
  or (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
      and tasting_wine_id is not null
      and context_kind = 'BLIND')
);

drop policy "wset notes read" on public.wset_notes;
create policy "wset notes read" on public.wset_notes
  for select to authenticated
  using (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1 or author_id = auth.uid());

-- A note tied to a tasting glass: on an unrevealed glass only an identity-less
-- BLIND note, so no note can publish a glass-to-wine mapping; on a revealed glass
-- only an identity-bearing note. Writing one needs the caller to be JOINED in, or
-- the host of, that tasting.
drop policy "wset notes insert" on public.wset_notes;
create policy "wset notes insert" on public.wset_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (tasting_wine_id is null
         or (public.can_note_tasting_wine(tasting_wine_id)
             and case when public.is_tasting_wine_revealed(tasting_wine_id)
                      then num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
                      else num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
                           and context_kind = 'BLIND'
                 end))
  );

-- Updates keep the same shape rules. Membership is re-checked only for a hidden
-- note, so an author who later left the tasting can still edit a note on a revealed glass.
drop policy "wset notes update" on public.wset_notes;
create policy "wset notes update" on public.wset_notes
  for update to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and (tasting_wine_id is null
         or case when public.is_tasting_wine_revealed(tasting_wine_id)
                 then num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
                 else num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
                      and context_kind = 'BLIND'
                      and public.can_note_tasting_wine(tasting_wine_id)
            end)
  );

drop policy "wset note aromas read" on public.wset_note_aromas;
create policy "wset note aromas read" on public.wset_note_aromas
  for select to authenticated
  using (exists (select 1 from wset_notes n where n.id = wset_note_aromas.note_id));

-- save_wset_note, recreated from its live definition with two edits. It stays
-- SECURITY INVOKER: the policies above still decide every write.
--   insert: also writes unidentified_wine_id = (p_note->>'unidentified_wine_id')::uuid
--   update: the identity takes the payload only while the note has none, so a sheet
--           opened before the reveal can never null what the resolve trigger set:
--     catalog_wine_id = case when num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
--                            then catalog_wine_id
--                            else (p_note->>'catalog_wine_id')::uuid end,
--     unidentified_wine_id = case when num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
--                                 then unidentified_wine_id
--                                 else (p_note->>'unidentified_wine_id')::uuid end,

-- resolve_unidentified_wine, recreated from its live definition with one edit. A
-- hue is judged only against a known colour (wset_hue_fits_colour, and
-- wset_notes_check_hue, which reads catalog_wines only), so a note on an
-- unidentified wine may hold any hue: that wine may have no colour, and no write
-- checks its colour. When the wine resolves to a catalog wine, its notes keep a
-- hue only when it fits that wine's colour (the reveal's rule), so a taster's hue
-- can never fail the resolution. It stays SECURITY DEFINER with its live checks:
--   update wset_notes
--     set catalog_wine_id = p_catalog_wine_id, unidentified_wine_id = null,
--         colour_hue = case when public.wset_hue_fits_colour(colour_hue,
--                                  (select cw.colour from catalog_wines cw where cw.id = p_catalog_wine_id))
--                           then colour_hue end
--     where unidentified_wine_id = p_unidentified_id;

-- At the reveal every hidden note on the glass takes the glass's identity,
-- and a hue that does not fit the revealed colour is cleared so the reveal
-- can never fail on a taster's colour guess.
create or replace function public.wset_notes_resolve_on_reveal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update wset_notes n
     set catalog_wine_id = a.catalog_wine_id,
         unidentified_wine_id = a.unidentified_wine_id,
         colour_hue = case
           when public.wset_hue_fits_colour(n.colour_hue, coalesce(cw.colour, u.colour))
           then n.colour_hue
         end
    from wine_answers a
    left join catalog_wines cw on cw.id = a.catalog_wine_id
    left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id
   where a.wine_id = new.id
     and n.tasting_wine_id = new.id
     and num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id) = 0;
  return null;
end $$;
create trigger wset_notes_resolve_on_reveal
  after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.wset_notes_resolve_on_reveal();

-- A deleted glass (Remove, or a deleted tasting) takes its unresolved notes
-- with it: they have no identity to keep, and the FK's "set null" would
-- otherwise violate wset_notes_one_identity and fail the delete.
create or replace function public.wines_drop_unresolved_notes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from wset_notes
   where tasting_wine_id = old.id
     and num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0;
  return old;
end $$;
create trigger wines_drop_unresolved_notes
  before delete on public.wines
  for each row execute function public.wines_drop_unresolved_notes();

-- Moving a note onto a glass needs the same membership as inserting one there.
-- The update policy re-checks membership only for a hidden note, and RLS cannot
-- compare a row's new tasting_wine_id with its old one, so without this guard an
-- author could point a catalog note at any revealed glass: by an update, or
-- through save_wset_note, whose update sets tasting_wine_id = coalesce(payload,
-- current). An edit that keeps the glass (by an author since set DECLINED too), a
-- detach to null (the FK's SET NULL) and the resolve paths, which never set
-- tasting_wine_id, still pass. Membership is by auth.uid(), so a caller with no
-- signed-in user (service_role, the owner) cannot move a note onto a glass either:
-- no later migration or repair may re-point notes as the owner.
create or replace function public.wset_notes_glass_move_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tasting_wine_id is not null
     and new.tasting_wine_id is distinct from old.tasting_wine_id then
    if not public.can_note_tasting_wine(new.tasting_wine_id) then
      raise exception 'a note can only be tied to a glass of a tasting you host or have joined'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger wset_notes_glass_move_guard
  before update of tasting_wine_id on public.wset_notes
  for each row execute function public.wset_notes_glass_move_guard();

-- A note written without an identity onto a glass that is already revealed takes
-- that glass's identity as it is written, by the reveal's rule: the answer's
-- catalog (or unidentified) wine, and a hue that does not fit its colour cleared.
-- FOR SHARE waits for a reveal that is flipping the glass right now and then reads
-- the committed row, so a save that races a reveal still attaches: either the
-- reveal commits first and this copies the identity, or this write commits first
-- and the reveal's own trigger resolves the note. It runs for an insert and for an
-- update that moves the note to another glass. An edit that keeps its glass takes
-- no lock: the reveal's trigger reaches that note through its row, and a lock here
-- could deadlock with it. Membership stays the policies' and the move guard's job;
-- by name this fires after the move guard and before the hue check.
create or replace function public.wset_notes_glass_resolve_on_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_revealed boolean;
  v_catalog_wine_id uuid;
  v_unidentified_wine_id uuid;
  v_colour wine_colour;
begin
  if new.tasting_wine_id is null
     or num_nonnulls(new.catalog_wine_id, new.unidentified_wine_id) <> 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.tasting_wine_id is not distinct from old.tasting_wine_id then
      return new;
    end if;
  end if;
  select w.is_revealed into v_revealed
    from wines w
   where w.id = new.tasting_wine_id
     for share;
  if coalesce(v_revealed, false) then
    select a.catalog_wine_id, a.unidentified_wine_id, coalesce(cw.colour, u.colour)
      into v_catalog_wine_id, v_unidentified_wine_id, v_colour
      from wine_answers a
      left join catalog_wines cw on cw.id = a.catalog_wine_id
      left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id
     where a.wine_id = new.tasting_wine_id;
    if found then
      new.catalog_wine_id := v_catalog_wine_id;
      new.unidentified_wine_id := v_unidentified_wine_id;
      new.colour_hue := case when public.wset_hue_fits_colour(new.colour_hue, v_colour)
                             then new.colour_hue end;
    end if;
  end if;
  return new;
end $$;
create trigger wset_notes_glass_resolve_on_write
  before insert or update of tasting_wine_id on public.wset_notes
  for each row execute function public.wset_notes_glass_resolve_on_write();

revoke all on function public.can_note_tasting_wine(uuid), public.is_tasting_wine_revealed(uuid)
  from public, anon;
grant execute on function public.can_note_tasting_wine(uuid), public.is_tasting_wine_revealed(uuid)
  to authenticated;
-- Trigger functions: no client role may call them; the triggers still fire.
revoke execute on function public.wset_notes_resolve_on_reveal(), public.wines_drop_unresolved_notes(),
  public.wset_notes_glass_move_guard(), public.wset_notes_glass_resolve_on_write()
  from public, anon, authenticated;
```

**Security reasoning (rule 1)**

- Before the reveal a hidden note has no identity. The read policy returns it to its author only; its aromas follow the note's visibility; `glass_removal_impact` (§3) reveals only a count.
- The author learns nothing from the database — the row stores what they wrote — and nobody else can read it, so nothing about a glass passes between tasters.
- **No note maps a hidden glass to its wine.** A note tied to an unrevealed glass carries no identity — whoever writes it: the host, a contributor, a guesser, or a crafted `?blindWine=` link. Inserts need the caller to be JOINED in, or host of, the glass's tasting. So do a hidden note's updates, and any update that moves a note onto a different glass (`wset_notes_glass_move_guard`): RLS cannot compare the new `tasting_wine_id` with the old, so without the guard an author could point a catalog note at any revealed glass. A note written without an identity onto a revealed glass takes that glass's identity (`wset_notes_glass_resolve_on_write`). An update that removes a resolved note's identity is refused, and `save_wset_note` never removes an identity a note already has, so a resolved note cannot be hidden again.
- **Owner-only callers.** The move guard judges membership by `auth.uid()`, so a caller with no signed-in user (service_role, the owner) cannot move a note onto a glass either. No server path re-points a note, and M6 and later migrations must not re-point notes as the owner.
- At the reveal the note takes the glass's identity inside the reveal's transaction; no reveal function is recreated. An ASYNC IMMEDIATE guesser who already saw their own answer keeps an unresolved note until the glass is revealed for everyone (documented; nothing leaks).
- **A save racing the reveal still attaches.** Under READ COMMITTED, a save whose statement began before the reveal committed would pass the policies as a hidden note after the reveal's trigger had run, leaving an identity-less note on a revealed glass that nothing resolves. `wset_notes_glass_resolve_on_write` (SECURITY DEFINER) fires for an insert, and for an update that moves an identity-less note to another glass. It reads the glass `FOR SHARE`, which conflicts with the reveal's row lock:
  - a save that arrives while a reveal is flipping the glass waits, then copies the committed identity;
  - a save that holds the glass first commits before the reveal's trigger runs, and that trigger resolves it.
  - The write policies judge the copied identity through `is_tasting_wine_revealed`. It is VOLATILE so its fresh snapshot sees the committed reveal; a STABLE helper would refuse the row by the statement's older snapshot.
  - An edit that keeps its glass takes no lock, because the reveal's trigger reaches that note through its row lock and a glass lock there could deadlock with the reveal. Such an edit re-reads the resolved row, and `save_wset_note` keeps its identity.
  - The copy is only ever an identity the glass already shows everyone, and the policies still decide whether the write happens.
- **A hue never fails a reveal or a resolution.** A hue is judged only against a known colour (`wset_hue_fits_colour`, `wset_notes_check_hue`). The reveal and the write trigger clear a hue that does not fit the glass's colour, and a null colour (an unidentified wine without one) fits any hue. A note on an unidentified wine can therefore hold a hue its eventual catalog wine does not allow, and no write checks an unidentified wine's own colour. `resolve_unidentified_wine` is recreated from live with one edit: the notes it re-points keep a hue only when it fits the catalog wine's colour.
- `catalog_wine_mark_blind` still ignores notes without a catalog id, so a hidden note never marks `blind_pending` and never shows in a catalog or public list.
- **Recursion:** the new policies reach `wines`, `tastings` and `tasting_participants` only through SECURITY DEFINER helpers; the aromas policy subqueries `wset_notes`, whose policies reference no tasting table.
- **Data loss, stated:** removing a glass or deleting a tasting deletes the unresolved notes on it; §3's removal sentence counts them.
- **Assertions:** pre-assert the four live policies' text, the constraint's text and `md5(prosrc)` of `save_wset_note` and `resolve_unidentified_wine`. Post-assert:
  - the new policies and constraint;
  - the two triggers on `wines`, and the four on `wset_notes` (the move guard and the write resolve next to the two live ones, firing in that order before the hue check);
  - `save_wset_note`'s body differing from live only in the two edits (still SECURITY INVOKER), and `resolve_unidentified_wine`'s only in the hue edit (still SECURITY DEFINER, its ACL unchanged);
  - `wset_note_aromas.note_id` still `on delete cascade`;
  - the helpers SECURITY DEFINER with `search_path=public` and EXECUTE authenticated-only (`can_note_tasting_wine` STABLE, `is_tasting_wine_revealed` VOLATILE);
  - no client EXECUTE on the four trigger functions (the move guard SECURITY INVOKER, the other three SECURITY DEFINER).

### 9.5 Tests

- `src/lib/wset/hidden-note.ts` (new, pure) with its test: `canNoteHiddenGlass`, `hiddenNoteTitle(tastingName, glassLabel)`, `hueGroupsFor(family)`; the new dictionary keys exist in both EN and DA (the dictionary's existing test pattern).
- **Behavioural SQL probe:**
  - a JOINED guesser inserts a hidden note on an unrevealed glass; INVITED users and outsiders are refused;
  - another participant can select neither the note nor its aromas;
  - `reveal_wine` fills `catalog_wine_id`; a RUBY hue on a white wine becomes null and the reveal succeeds;
  - a hidden (identity-less) insert on a revealed glass takes that glass's identity, with a hue that does not fit its colour cleared; a non-member's is still refused. An update that nulls a resolved note's identity is refused;
  - deleting the glass deletes the unresolved note and keeps a resolved one (with `tasting_wine_id` null);
  - `catalog_wines.blind_pending` does not change when a hidden note is inserted;
  - an identity-bearing note with the `tasting_wine_id` of an unrevealed glass — by its host, by its contributor and by a JOINED guesser — is refused;
  - a minimal note `{ catalog_wine_id, context_kind: 'BLIND', tasting_wine_id: <revealed glass> }`: by a JOINED participant → OK; by the host → OK; by an INVITED user or an outsider → refused; with another tasting's glass id → refused;
  - `save_wset_note` inserts a note with `unidentified_wine_id` on a revealed glass whose wine is unidentified → OK;
  - a hidden note resolved by `reveal_wine`, then saved through `save_wset_note` with a null `catalog_wine_id` in the payload → keeps its catalog id;
  - an author set DECLINED since then updates their note on a revealed glass → OK;
  - moving a note onto another tasting's revealed glass, by update or through `save_wset_note`, as an outsider, an INVITED or a DECLINED user → refused (`wset_notes_glass_move_guard`). A member moving a note onto their own tasting's glass → OK. A caller with no signed-in user → refused (documented);
  - `resolve_unidentified_wine` when the wine's notes hold a hue that does not fit the catalog wine → the resolution succeeds and clears the hue; a fitting hue is kept; a caller who is neither the creator nor a curator is still refused. Cases:
    - a hidden note resolved at a reveal onto an unidentified wine with no colour;
    - one resolved onto an unidentified wine with a colour;
    - a note written with a hue its unidentified wine's colour does not explain;
  - a reveal emulated inside a hidden-note save, after the save's statement snapshot (rollback-only, on the database): the note attaches; with a STABLE `is_tasting_wine_revealed` it is refused; with neither the write trigger nor the VOLATILE helper it stays identity-less on the revealed glass;
  - a reveal racing a hidden-note save, with real commits on two connections (a disposable local cluster, because the database cannot hold a committed reveal rollback-only):
    - a save that arrives while the reveal holds the glass waits and attaches;
    - a save holding the glass makes the reveal wait and is resolved by it;
    - a re-save of a note the reveal's trigger holds succeeds and keeps the identity;
    - an edit that lands inside the reveal's locked window does not deadlock;
    - two savers wait together and both attach.

### 9.6 Verification

- **375px and 1280px.** Lock glass 3 → "Note this glass" → the sheet titled "{tasting} · Glass 3" → save a nose and a score. `/taste/notes` lists it as Unfinished under that title.
- A `?blindWine=<unrevealed glass>` link returns a 404.
- The host reveals glass 3 → the archive row shows the wine; its catalog page counts the rating.
- A second demo account never sees the note before the reveal (neither in its archive nor on the catalog wine page).

### 9.7 Owner default

None (the reversal is the ledger's).

---

## 10. B9 · Semi-blind — a permutation (SB1–SB4)

### 10.1 Screens

SB1 (the list), SB2 (matching, phone), SB3 (matching, laptop), SB4 (the reveal); the laptop reveal is S11b with one row (`MISSED-04`); the finish is §11.

### 10.2 Current state

- **Candidate list.** `play-experience.tsx:454-459` selects every `wine_answers` row of the tasting through the semi-blind participant clause and renders "These are the {n} wines being poured — you just don't know which glass is which. Match each glass below." (:810-817) in query order.
- **A rule-1 leak found while verifying** (wider than `GUEST-36`): those rows carry `wine_id`, and any participant row can read `wines (id, position)`, so the "candidate list" is the answer key. After a match the same holds for `guesses.guessed_wine_id`, which its author can read and which maps to a position.
- **`match-ladder.tsx`** (313 lines; T6): one batch. "Lock in all glasses" enables once every glass has a match, then `submitAllMatchGuesses` and `lockGuesses`; "Change it" unlocks all; duplicates allowed; no pool; no swap.
- `wines read` shows every participant row each glass's `id`, `position`, `contributor_participant_id` and `added_via`, and the lobby and the running board refresh on a timer. Any list that changes in the same refresh as a new or changed glass ties that card to that glass.
- A revealed semi-blind glass renders as a parchment answer card with a collapsed tick list (`MISSED-04`).
- `sequential_guessing` is never stored for semi-blind (§2).
- Lane N: `semi-blind-candidates.ts` (`buildCandidateCard`, `sortCandidates`: folded producer, wine name, vintage, then the opaque key); `result-math.ts`' semi-blind rows take `guessed_wine_id`.

### 10.3 Change

1. **The list (SB1).**
   - Data comes only from `get_semi_blind_candidates(p_tasting_id)` (§10.4) → `buildCandidateCard` → `sortCandidates`; never from `wine_answers`.
   - **A snapshot taken at Start** (rule 1; Q7). From Start, every JOINED participant and the host get every card: the pool on the running board. Before Start the RPC returns a caller only the cards of glasses they added — the host-provides host their whole flight in the DRAFT lobby, a bring-your-own contributor their own bottles — and `pending` only to the host. A guest's lobby shows "The list of tonight's wines opens when {host} starts." (**spec copy**) instead. Otherwise every add in the lobby would put a new card on the guests' screens in the same refresh as the new glass.
   - Copy: eyebrow "Semi-blind · {host} is hosting"; title "Tonight's {count word} wines" ("Tonight's six wines"; numerals above ten); "These are the bottles on the table. You will not be told which glass is which — that is what you work out."; the cards (producer / wine name + vintage / appellation · grape, with a hatch thumb); "Listed alphabetically by producer. Never in pouring order — position in this list would otherwise be the answer."; before Start, "Glass 1 is poured when {host} starts."
   - A glass with no answer key yet shows "1 wine still being added" / "{n} wines still being added" instead of a card (`pending`).
   - Laptop: the cards inside the two-column lobby (`SB-08`).
   - INVITED and DECLINED viewers never see it: the RPC returns nothing to them.
2. **Matching board (SB2 phone, SB3 laptop)**, dark.
   - Header: phone eyebrow "Semi-blind · glass {n} poured" and title "Match the glasses"; laptop eyebrow "Live · semi-blind · {host} is hosting", the tasting name as the title, and "Glass {n} poured"; the gold pill "{assigned} of {total} matched" (matches, never points). On laptops the glass column is headed "The glasses".
   - **One row per glass, in pour order:**
     - open, empty: "Tap to choose" (phone) / "Drop a wine here, or click to choose" (laptop);
     - open, assigned: "{producer}, {wine name} {vintage}" with a chevron (phone) or ✕ (laptop);
     - locked: the assignment with "locked" and "Change it" (**spec copy** for "locked");
     - LIVE guided, beyond `pouredThrough` (§7): dimmed "Not poured yet", no chevron;
     - ASYNC or free flow: every glass open;
     - revealed: "Glass {n} was {producer} {vintage}" with ✓ or ✗ (**spec copy**);
     - bring-your-own, the viewer's own bottle: "Your bottle" (**spec copy**), not matchable.
   - **The pool:** phone "Still unassigned · {n} wines" (unassigned cards only); laptop "The bottles" with "{n} still unassigned" on its own line (every card; an assigned card dims to 0.65 and carries a gold "Glass {N}" pill; a card held by a locked glass shows "Glass {N} · locked").
   - **Phone helper:** when two or more pool cards share a grape, "Producer alone is not enough — {count word} of these are {grape}, so the wine and the vintage have to be on the label too." (**spec copy**: the handoff's sentence made data-driven), always followed by "Assigning one that sits on another glass swaps the two; revealed wines leave the list entirely."
   - **Footer:** phone "Change anything until {host} reveals. Nothing is scored before then."; laptop "Every assignment stays changeable until {host} reveals that glass. Locking a glass only closes that one."; "Clear glass {n}" (laptop, current glass) and "Lock in glass {n}" with "Locking only this glass. The rest stay open."
   - **The current glass** is the pointer's glass in LIVE guided (§7), otherwise the first open, unlocked, unassigned glass.
   - **Interactions:** tap a glass → the picker over the pool (no skip, D14 play-7). Laptop: click a bottle, then a glass; or drag a bottle's "⋮⋮" onto a glass (pointer events; clicking is the keyboard fallback).
   - **Assign** → `assignMatch(tastingId, glassWineId, candidateKey)` → `assign_semi_blind_match`:
     - a candidate held by another open, unlocked glass swaps the two (that glass receives this glass's previous candidate, or becomes empty);
     - a candidate held by a locked glass is refused: "Glass {N} · locked" (N from the holder's glass id, which the RPC returns in the error detail);
     - a revealed candidate is refused: "That wine has been revealed." (**spec copy**); the mapping from the RPC's error and detail to these sentences is pure `matchRefusalSentence` in `src/lib/semi-blind-copy.ts`;
     - it autosaves, with no `revalidatePath`; the optimistic board applies the same rules (pure `applyAssignment`).
   - **Clear** (✕ / "Clear glass {n}") → `clearMatch(tastingId, glassWineId)` → `clear_semi_blind_match`.
   - **Lock per glass** → the existing `lockGuess(tastingId, wineId)`, after an app guard "Choose a wine for glass {n} first." (**spec copy**). **Change it per glass** → `unlockGuess`, until that glass is revealed or its reveal has started.
   - Deleted once unused: `submitAllMatchGuesses`, `lockGuesses`, the batch UI, `MATCH_FOOTER`.
3. **Reveal (SB4)** — a whole glass at once, through `reveal_wine` (the console's "Reveal glass {N}", or the ASYNC auto-reveal).
   - Participant view (dark): eyebrow "Revealing glass {n}" and "{k} of {N} revealed"; "Glass {n} was"; gold "{producer} {vintage}"; meta "{appellation} · {region} · {grape}" (the wine is revealed, so its `wine_answers` row is readable).
   - Result: "You had it" with "+1 · {mine} of {revealed} so far"; or "You said {producer}, {wine name}" with "0 · {mine} of {revealed} so far" (**spec copy** for the miss).
   - "How the table split": a bar row per candidate picked for this glass, "{producer}, {wine name} {count}", the right one gold, the others rose (from `get_semi_blind_board`).
   - Pool note: "Wines already revealed are gone from the list — that is why a late glass is easier than an early one.", preceded, when two or more remaining cards share a grape, by "{Count word} {grape} wines still in the pool." (**spec copy**, replacing the handoff's data-specific first sentence).
   - "Standings · one point a glass": rank, name, match count.
   - **Laptop (`MISSED-04`):** the S11b layout with one row — the hero and the single result row on the left; standings and "How the table split" in the right rail.
   - The pool release (the revealed wine leaves every other unrevealed glass, which is cleared and unlocked) happens in the database, inside the reveal's transaction (§10.4). The board shows the cleared glass open again after the next refresh.
4. **Finish:** S12 counting matches (§11).
5. **Host console:** §7.3 item 6.
6. **ASYNC IMMEDIATE semi-blind:** locking a glass scores it for the viewer (`score_own_guess`, unchanged). The board shows that result, and the RPC removes that glass's true wine from the viewer's own pool — the viewer has legitimately learned it. "Proven" is exactly lane N's `has_scored_guess`: the viewer's own scored guess on that glass while the glass has no shared step reveal in progress.
7. **A semi-blind flight is fixed at Start** (rule 1; Q7). After Start nobody adds a glass, swaps a bottle or removes a glass: a new or changed glass would change the list in the same refresh. Edit stays — it changes only `wine_answers`, which no guest can read, and moves no card between glasses. The app refuses with "A semi-blind flight is fixed once the tasting starts — the list of wines can't change." (§3.3 item 10) and hides the Add buttons; the database refuses too (M6 for removal and provenance, M9 for inserts).

### 10.4 SQL (M9 `semi_blind_permutation`; deploy-ordered, §1.5)

**(a) Opaque keys**

```sql
create table public.semi_blind_candidate_keys (
  wine_id uuid primary key references public.wines(id) on delete cascade,
  tasting_id uuid not null references public.tastings(id) on delete cascade,
  candidate_key text not null,
  created_at timestamptz not null default now(),
  unique (tasting_id, candidate_key)
);
alter table public.semi_blind_candidate_keys enable row level security;
revoke all on public.semi_blind_candidate_keys from anon, authenticated;
-- No policies: only SECURITY DEFINER functions read or write it.

-- Mint keys for glasses that have none. Random; never derived from position, id or time.
create or replace function public.ensure_semi_blind_keys(p_tasting_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into semi_blind_candidate_keys (wine_id, tasting_id, candidate_key)
  select w.id, w.tasting_id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
  from wines w
  where w.tasting_id = p_tasting_id
    and not exists (select 1 from semi_blind_candidate_keys k where k.wine_id = w.id)
  on conflict do nothing;
end $$;
revoke all on function public.ensure_semi_blind_keys(uuid) from public, anon, authenticated;
```

A glass whose key collides within its tasting simply gets one on the next call (16 hex characters make it vanishingly rare); callers call `ensure_semi_blind_keys` before every read.

**(b) Reads**

```sql
create or replace function public.can_see_semi_blind_list(p_tasting_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tastings t
    where t.id = p_tasting_id and t.reveal_mode = 'SEMI_BLIND'
      and (t.host_id = auth.uid()
           or exists (select 1 from tasting_participants p
                      where p.tasting_id = t.id and p.user_id = auth.uid()
                        and p.status = 'JOINED'))
  );
$$;

-- { "cards": [ { "key", "producer", "wine_name", "vintage_kind", "vintage_year",
--               "vintage_tawny_years", "appellation", "grape",
--               "revealed_glass" } ],          -- list-order glass number, null unless revealed
--   "pending": <glasses without an answer key> }
-- Cards ordered by key (random); the client sorts with sortCandidates.
-- Null unless can_see_semi_blind_list(p_tasting_id). Calls ensure_semi_blind_keys first.
-- While the tasting is DRAFT: only the cards of glasses the caller added (the host's
-- added_by_host glasses; a contributor's own), and "pending" null unless the caller is
-- the host. From Start: every card, and "pending", to every caller allowed above.
create or replace function public.get_semi_blind_candidates(p_tasting_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$ … $$;

-- The caller's board. Null unless can_see_semi_blind_list(p_tasting_id).
-- { "mine":        [ { "glass_wine_id", "key", "locked", "scored", "total_points" } ],  -- the caller's own rows
--   "revealed":    [ { "glass_wine_id", "key" } ],                                      -- revealed glasses only
--   "split":       [ { "glass_wine_id", "key", "count" } ],                             -- revealed glasses, eligible rows
--   "own_bottles": [ "key" ],                                                           -- wines the caller contributed
--   "known":       [ { "glass_wine_id", "key" } ] }                                     -- unrevealed glasses where has_scored_guess(glass) holds
create or replace function public.get_semi_blind_board(p_tasting_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$ … $$;

-- For /results, the record (§11) and /u/[id]/tastings/[tastingId]: per revealed glass,
-- who matched and what they picked. Rows only for revealed glasses of a SEMI_BLIND tasting
-- the caller can read (host, participant, or tasting_has_revealed_wine).
-- pick_key   = the picked wine's opaque candidate key (null when nothing was picked); an
--              identifier for counting splits, meaningless without the list.
-- pick_label = "{producer}, {wine name} {vintage}" of the picked wine when that wine is
--              revealed, or when the caller is the host or a JOINED participant (who saw the
--              list); null otherwise.
create or replace function public.get_semi_blind_revealed_picks(p_tasting_id uuid)
returns table (glass_wine_id uuid, participant_id uuid, correct boolean,
               pick_key text, pick_label text)
language plpgsql security definer set search_path = public as $$ … $$;  -- calls ensure_semi_blind_keys
```

**(c) Writes**

```sql
create or replace function public.assign_semi_blind_match(p_wine_id uuid, p_candidate_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_glass wines%rowtype;
  v_tasting tastings%rowtype;
  v_pid uuid;
  v_candidate uuid;
  v_mine guesses%rowtype;
  v_has_mine boolean;
  v_holder guesses%rowtype;
  v_has_holder boolean;
begin
  select * into v_glass from wines where id = p_wine_id;
  select * into v_tasting from tastings where id = v_glass.tasting_id;
  if v_tasting.reveal_mode is distinct from 'SEMI_BLIND' or v_tasting.status <> 'IN_PROGRESS' then
    raise exception 'matching is closed';
  end if;

  select id into v_pid from tasting_participants
   where tasting_id = v_tasting.id and user_id = auth.uid() and status = 'JOINED';
  if v_pid is null
     or v_glass.contributor_participant_id is not distinct from v_pid
     or (v_tasting.wine_source = 'HOST_PROVIDES' and v_tasting.host_id = auth.uid())
     or v_glass.is_revealed or v_glass.reveal_step > 0 then
    raise exception 'you cannot match this glass';
  end if;

  select wine_id into v_candidate from semi_blind_candidate_keys
   where tasting_id = v_tasting.id and candidate_key = p_candidate_key;
  if v_candidate is null
     or exists (select 1 from wines where id = v_candidate
                and (is_revealed or contributor_participant_id = v_pid))
     or public.has_scored_guess(v_candidate) then          -- ASYNC IMMEDIATE: already proven (lane N's gate)
    raise exception 'that wine is not in your pool';
  end if;

  select * into v_mine from guesses
   where wine_id = p_wine_id and participant_id = v_pid for update;
  v_has_mine := found;
  if v_has_mine and (v_mine.locked_at is not null or v_mine.scored_at is not null) then
    raise exception 'this glass is locked in';
  end if;

  select * into v_holder from guesses
   where participant_id = v_pid and guessed_wine_id = v_candidate
     and scored_at is null and wine_id <> p_wine_id
   for update;
  v_has_holder := found;
  if v_has_holder and v_holder.locked_at is not null then
    raise exception 'glass locked' using detail = v_holder.wine_id::text;
  end if;

  -- Clear the holder, set this glass, then hand this glass's previous
  -- candidate to the holder: the unique index never sees a duplicate.
  if v_has_holder then
    update guesses set guessed_wine_id = null where id = v_holder.id;
  end if;
  insert into guesses (wine_id, participant_id, guessed_wine_id)
  values (p_wine_id, v_pid, v_candidate)
  on conflict (wine_id, participant_id) do update set guessed_wine_id = excluded.guessed_wine_id;
  if v_has_holder and v_has_mine and v_mine.guessed_wine_id is not null then
    update guesses set guessed_wine_id = v_mine.guessed_wine_id where id = v_holder.id;
  end if;

  return jsonb_build_object('glass', p_wine_id,
                            'swapped_with', case when v_has_holder then v_holder.wine_id end);
end $$;

-- The caller's own unlocked, unscored row on this glass loses its candidate.
create or replace function public.clear_semi_blind_match(p_wine_id uuid)
returns void language plpgsql security definer set search_path = public as $$ … $$;
```

**(d) The permutation's invariant and the pool release**

```sql
-- Pre-assert first: no participant holds one candidate on two unscored glasses (live data).
create unique index guesses_one_open_glass_per_candidate
  on public.guesses (participant_id, guessed_wine_id)
  where guessed_wine_id is not null and scored_at is null;

create or replace function public.semi_blind_release_revealed_wine()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from tastings t
             where t.id = new.tasting_id and t.reveal_mode = 'SEMI_BLIND') then
    update guesses g
       set guessed_wine_id = null,
           locked_at = null
      from wines w
     where w.id = g.wine_id
       and w.tasting_id = new.tasting_id
       and g.wine_id <> new.id
       and g.guessed_wine_id = new.id
       and not w.is_revealed
       and g.scored_at is null;
  end if;
  return null;
end $$;
create trigger semi_blind_release_revealed_wine
  after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.semi_blind_release_revealed_wine();
```

`reveal_wine` scores the glass's rows before it flips `is_revealed`, so this AFTER trigger runs after the scoring, in the same transaction. Neither `reveal_wine` nor `score_own_guess` is recreated: they compare `guessed_wine_id` exactly as today, and scoring stays 1 / 0.

```sql
-- A semi-blind flight is fixed at Start: no glass is inserted into a started
-- semi-blind tasting (§10.3 item 7). M6's helpers refuse removal and provenance.
create or replace function public.wines_semi_blind_flight_locked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from tastings t
             where t.id = new.tasting_id and t.reveal_mode = 'SEMI_BLIND' and t.status <> 'DRAFT') then
    raise exception 'a semi-blind flight is fixed once the tasting starts'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger wines_semi_blind_flight_locked
  before insert on public.wines
  for each row execute function public.wines_semi_blind_flight_locked();
```

**(e) `guesses.guessed_wine_id` leaves the client roles**

```sql
revoke insert (guessed_wine_id), update (guessed_wine_id) on public.guesses from anon, authenticated;
revoke select on public.guesses from anon, authenticated;
grant select (id, wine_id, participant_id,
              country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
              producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
              country_points, region_points, appellation_points, primary_grape_points,
              secondary_grape_points, producer_points, type_designation_points, vintage_points,
              total_points, scored_at, submitted_at, updated_at, reveal_step, locked_at)
  on public.guesses to authenticated;
```

App consequences, all shipped before M9 applies:

- Every `supabase.from("guesses").select("*")` becomes an explicit list from `src/lib/guess-columns.ts` (`GUESS_READ_COLUMNS`). Today's readers: `host/page.tsx:172`, `play-experience.tsx:280,488,602`, `results/page.tsx:112`, `u/[id]/tastings/[tastingId]/page.tsx:89`, `overview-data.ts:239`, `profile-stats.ts:196,353`, `your-numbers.ts:117`, `taste-archive-data.ts:123`, `tastings/new/actions.ts:316`, and `play/actions.ts`.
- Every reader of `guessed_wine_id` moves to the RPCs: `host/page.tsx`, `play-experience.tsx`, `results/page.tsx`, `u/[id]/tastings/[tastingId]/page.tsx`, and the result and record loaders (§11).
- Plan grep gates: every hit of `rg -n 'from\("guesses"\)' src` passes an explicit column list; `rg -n "guessed_wine_id" src` hits only `database.types.ts`, `result-math.ts` comments and the RPC result types.
- `RevealSync`'s `postgres_changes` subscription on `guesses` is probed after the revoke. If Realtime cannot deliver it without table-wide SELECT, the component drops that channel and relies on the `wines` channel plus `AutoRefresh` (the task decides by the probe).
- The live `is_open_guess_target(participant_id, wine_id, guessed_wine_id)` policy checks stay; client writes can no longer set the column at all.

**(f) `wine_answers read`, recreated from live**

```sql
drop policy "wine_answers read" on public.wine_answers;
create policy "wine_answers read" on public.wine_answers
  for select to authenticated
  using (
    has_scored_guess(wine_id)
    or exists (
      select 1
      from wines w
      join tastings t on t.id = w.tasting_id
      left join tasting_participants p on p.id = w.contributor_participant_id
      where w.id = wine_answers.wine_id
        and (
          (t.host_id = auth.uid() and w.added_by_host)                       -- the host: glasses the host added (M6's pinned flag)
          or w.is_revealed
          or p.user_id = auth.uid()                                          -- the contributor: their own
        )
    )
  );
```

- The semi-blind participant clause is gone; `get_semi_blind_candidates` replaces it.
- The host clause narrows to host-added glasses through M6's pinned `added_by_host`: a bring-your-own host no longer reads other contributors' hidden answer keys (rule 1 at the API level), and cannot win them back by nulling a contributor or deleting their participant row.
- The live policy's raw `exists` over `wines` / `tastings` / `tasting_participants` is kept word for word apart from those two edits; this recreate removes clauses and adds no new cross-table check.
- Callers of the old host clause, re-checked by the plan: `host/page.tsx` for a bring-your-own host (moved to `get_wine_reveal`, §7.3 item 7), `listFlight` and the lobby identity (already host-provides only), `getPouredRegionSuggestion` (filtered, §2), the Overview (no answer reads).

**Security reasoning (rule 1)**

- **The list.** Keys are random per tasting and never equal a wine id; cards carry label fields only; the client sorts by those fields and then the key; `pending` is a count; INVITED and DECLINED viewers get nothing.
- **No payload maps a candidate to a wine id.** `guesses` no longer exposes `guessed_wine_id`; the board speaks in keys; splits exist only for revealed glasses; labels for unrevealed picks go only to people who saw the list. The `glass_wine_id` values are the glasses the viewer already sees as rows.
- **No refresh maps a card to a glass.** Keys hide pour order only within one snapshot, while `wines` rows (id, position, contributor, `added_via`) stay readable to every participant and the pages refresh on a timer. So the list is a snapshot: non-adders get it only from Start, and a started semi-blind flight never gains, swaps or loses a glass. An Edit changes a card's text without touching any `wines` column, so it maps nothing.
- **The mode cannot be flipped to reach the list.** M6's `tastings_lock_setup_after_start` stops a host turning a running blind tasting semi-blind.
- A revealed glass's key↔wine mapping is public by then: the wine is revealed.
- **Bring-your-own.** A contributor's own bottle is excluded from their pool and their glass row reads "Your bottle"; they know both anyway.
- **Honest permutation without touching scoring.** The pool release and the unique index keep one open glass per candidate; `reveal_wine` and `score_own_guess` are unchanged.
- **Lane N.** 093000's client-column matrix narrows by one column (insert and update) and gains a select list; its policies, `guesses_pin_identity` and the JOINED-only `get_wine_reveal` stay.
- **Assertions:** pre-assert the live `wine_answers read` text, 093000's column grants, the absence of duplicate open holdings, and M6's `wines.added_by_host`; post-assert the policy (no `SEMI_BLIND`; the host clause carries `added_by_host`), `wines_semi_blind_flight_locked` enabled, authenticated SELECT on exactly 27 `guesses` columns and INSERT/UPDATE on exactly 13, no client grants on `semi_blind_candidate_keys`, every new function SECURITY DEFINER with `search_path=public` (EXECUTE authenticated-only; `ensure_semi_blind_keys` owner-only), the index and the trigger.

### 10.5 Tests

- `src/lib/semi-blind-board.ts` (new, pure) with its test: `applyAssignment(board, glass, key)` (assign; swap with an open glass; refusal on a locked holder, a revealed wine, the viewer's own bottle), `clearAssignment`, `poolFor(cards, board)`, `matchedCount`, `glassRowState` (open, assigned, locked, not poured, revealed, own bottle).
- `src/lib/semi-blind-copy.ts` with its test: the helper sentence with and without a shared grape, the pool note, count words, "Glass {N} · locked".
- `semi-blind-candidates.test.ts` already exists.
- **Behavioural SQL probe:**
  - `get_semi_blind_candidates` returns cards to JOINED and host, nothing to INVITED, DECLINED or outsiders; no card key equals any wine id of the tasting; `pending` counts a glass without an answer key;
  - before Start a JOINED guest's payload has no cards and a null `pending`, unchanged across two DRAFT adds; a bring-your-own contributor gets only their own cards; the host-provides host gets every card;
  - after one step reveal on an ASYNC IMMEDIATE semi-blind glass, `known` stays empty for every other guesser, and assigning that glass's wine stays allowed;
  - inserting a glass into an IN_PROGRESS semi-blind tasting → refused (M9's trigger); removing one through `remove_flight_glass` → refused (M6);
  - a JOINED participant's select of an unrevealed semi-blind glass's `wine_answers` returns no row; a bring-your-own host's select of a contributor's answer returns no row; a host-provides host still reads their own glasses;
  - `select guessed_wine_id from guesses` as authenticated → permission denied; an explicit column list succeeds; a client update of `guessed_wine_id` → permission denied;
  - assign; swap (both rows right afterwards); refusal when the holder is locked; refusal for a revealed candidate;
  - the unique index refuses a direct duplicate (service role);
  - `reveal_wine` on glass A clears and unlocks another glass holding A's wine, and scores A's rows 1 / 0 as before.

### 10.6 Verification

- **375px (SB2).** Assign two glasses; move one glass's wine to the other (a swap); lock glass 1; try to take its wine from glass 2 → "Glass 1 · locked".
- **1280px (SB3).** Drag a bottle onto a glass; click a bottle, then a glass; "Clear glass 3".
- The host reveals glass 3 from the console: SB4 renders dark with the split; a second demo guesser who held that wine on glass 5 sees glass 5 open again.
- Reload the list several times, on two accounts: the same order each time, and not the pour order.
- **Before Start (both widths).** A JOINED guest's lobby reads "The list of tonight's wines opens when {host} starts." while the host adds two glasses; the host's own lobby shows the cards.
- **Semi-blind, ASYNC IMMEDIATE, bring-your-own (both widths).** Every glass opens. A contributor's own glass reads "Your bottle" and their wine is absent from their pool. Locking a glass shows its 1 / 0 result and removes that wine from this viewer's pool only; a second guesser's pool is unchanged; assigning the proven wine is refused. After Start no Add button shows.

### 10.7 Owner default

None (the reversals are the ledger's).

---

## 11. B10 · Reveal, result, record (S11–S13c)

### 11.1 Screens

S11 (reveal, phone), S11b (reveal, laptop), S12 and S12b (the finish), S13 and S13b (every wine, named), S13c (one glass, opened).

### 11.2 Current state

- **`src/app/tastings/[id]/play/reveal-view.tsx`** (517 lines; T7): dark (console tokens); reads `get_wine_reveal`; hero, verdict pill, rows (truth, "you:", points); hidden rows read "still hidden" with their values (:408); "{reveal_step} of {in_play_count} attributes" (:322); standings with `rankDelta` (:294-310), the delta hidden under PER_WINE while a glass is only partly revealed (:299); nothing at step 0 (:157). No locked line, no facts for participants, no motion.
- **Numbering.** The running page's navigator says "Wine {i + 1}" (`page.tsx:604`) and "{revealed} of {n} wines" (:619). `/play`'s header says "Wine {position} of {total}" from the raw stored position (`play-experience.tsx:418-420, 739-740`). Glass cards and `/results` use `makeWineLabeler` ("Wine N"; list order since lane N).
- **CLOSED.** The running page shows "Completed" over the same board; there is no result screen (`RESULT-01`).
- **`results/page.tsx`** (626 lines; T7): standings (`rankRows`; "Standings so far" until CLOSED, :357-359) and a per-wine breakdown of fully revealed wines; it reads `guesses` with `select("*")` (:112) and `guessed_wine_id` (:567-576).
- **`/u/[id]/tastings/[tastingId]/page.tsx`**: a per-person breakdown that reads `guessed_wine_id` (:95-104, :187-188).
- **`src/lib/result-math.ts`** (lane N): `blindResult`, `semiBlindResult`, `glassMaxPoints`, `glassMarks`, `bestGlass`, `strongestAttribute`, `blindAgreedLeast`, `semiBlindAgreedLeast`; semi-blind rows take `guessed_wine_id`.
- No CSV export, no "Save all", no S13c. `AddWineOpenOptions` has no preselect (`src/components/add-wine/types.ts:27-33`).
- No `tastings.started_at` / `finished_at`, no `wines.revealed_at`.

### 11.3 Change

**The reveal (S11, S11b; `reveal-view.tsx`)**

1. **Laptop header:** "Revealing glass {n}" · "{k} of {m} attributes · {host} is driving", with the rank-delta pill "▲ 2nd → 1st" in the header row (`REVEAL-11`). The phone keeps the delta on its standings card. The standings card lists the top three on phones and the top five on laptops, always including the viewer's row (`REVEAL-09`).
2. **Locked line** under the rows whenever at least one step is still hidden: "{Hidden labels} are worth {points} between them. Nothing you do now changes them — the guess is locked." With one hidden step: "{Label} is worth {points}. Nothing you do now changes it — the guess is locked." (**spec copy** for the singular). Pure `lockedLine(hidden)` in new `src/lib/reveal-copy.ts`.
3. **"This glass" rail** (laptop) for participants: "Got the grape {k} of {n}", "Got the appellation {k} of {n}", "Most said {appellation}". Computed with §7's `glassFacts` rule from `get_wine_reveal`'s `guesses` (every row in LIVE; revealed keys only). From step 1 every row on the glass carries `scored_at` (`reveal_next_category` stamps all rows), so every row counts once a step is out; n = eligible participants.
4. **Motion** (`MISSED-03`): the newly revealed step animates — the hero, the verdict pill, that row's "+N" and the delta pill take `animate-rise-in`, keyed on `reveal_step`. Nothing animates under `prefers-reduced-motion` (the existing rule in `globals.css`).
5. **Semi-blind** reveals are SB4 (§10).
   - `RevealView` renders only where `stepRevealApplies` holds (§7.3 item 10), the predicate the console's chips use.
   - A glass revealed before the viewer joined reads "You joined after this glass" on its revealed card instead of a verdict (B4; `joinedAfterReveal`, §5).
6. **Rule 1 note.** "{k} of {m} attributes" and the hidden rows show whether an appellation or a designation is still to come. Accepted: from step 1 every guess on the glass is frozen (`guesses update own` requires `reveal_step = 0`), and the handoff draws exactly this (§16.3).

**Numbering (`MISSED-01`)**

7. Everything guest-facing says "Glass N" by list order: the running page's navigator chips and progress ("{revealed} of {n} glasses"), `/play`'s header ("Glass {index} of {total}", never the stored position), glass cards, `/results`, the result and the record. The host's lobby Wines card keeps "Wine N".
   - `src/lib/wine-label.ts` gains `makeGlassLabeler(wines, wineSource, nameByParticipantId)`, with `makeWineLabeler`'s signature, returning "Glass {n}" or the contributor label. `makeWineLabeler` is unchanged.

**The result (S12, S12b), dark**

8. **When.** The running page of a CLOSED tasting renders `ResultView` (new `src/app/tastings/[id]/result/result-view.tsx`) until the viewer dismisses it (§6), then the record.
9. **Data.** `src/lib/tasting-result.ts` (server-only):
   - the tasting (with `started_at`, `finished_at`); participants (with `joined_at`); the wines in list order (with `revealed_at`);
   - `wine_answers` for fully revealed glasses only (readable by everyone signed in); `guesses` on those glasses through `GUESS_READ_COLUMNS` (readable once revealed); `getTastingLeaderboard`; `get_semi_blind_revealed_picks` for semi-blind;
   - eligibility per glass from `glass-eligibility.ts` (§5); competitors = JOINED minus the host-provides host, ranked by `rankRows` over the leaderboard totals;
   - `blindResult` / `semiBlindResult` for the viewer.
   - **`result-math.ts` change:** `SemiBlindGuessRow` drops `guessed_wine_id` for `pick_key: string | null` (the opaque candidate key from `get_semi_blind_revealed_picks`); `SplitSentence.pickId` then carries that key, resolved to its label on the server.
10. **Content.**
    - Eyebrow "{tasting} · finished".
    - "You finished", the ordinal at full size ("2nd"), then "of {competitors} · {score} of {maximum} points". Semi-blind: "of {competitors} · {matches} of {revealed glasses} matched" (**spec copy**).
    - A host-provides host is not a competitor: "You hosted" and "{winner} won with {points} points" (ties: "{a} and {b} shared first with {points} points") (**spec copy**).
    - The table: the top four on phones, with the viewer's row highlighted (appended when outside the top four); every place on laptops, under the heading "Final standings" (S12b).
    - "Best glass" (blind): "{points} / {max}" and "Glass {n} · {short name}".
    - Strongest attribute (blind): "{Attribute} right", "{hits} of {inPlay}", "your best category". Labels: Countries, Regions, Appellations, Grapes, Second grapes, Producers, Designations, Vintages.
    - "The table agreed least on", then "Glass {n} — {glass title}. {Count word} of {outOf} said {pick}." or "Glass {n} — {glass title}. {Count word} of {outOf} got the grape." Blind picks are grape names; semi-blind picks are candidate labels ("… got it" when the most common pick was right, **spec copy**).
      - Glass title: bring-your-own "{contributor}'s {short name}" ("Gustav's Brunello di Montalcino"); host-provides "{short name}".
      - `shortWineName(answer)` = the catalog wine name, else the appellation without its designation suffix, else the producer.
      - Count words one to ten, capitalised at the start of a sentence; numerals above ten.
    - Excluded glasses, one line: "Glass 5 was never revealed" / "Glasses 5 and 6 were never revealed" / "Glass 4 was only partly revealed" (**spec copy** for the partial case).
    - Joined-after glasses count 0 (§5).
    - Actions: "See every wine" (gold primary; dismisses the result and shows the record) and "Share the result" (phone) / "Share" (laptop):
      - `navigator.share({ url, text })`, `url` = `{site}/tastings/{id}/results`, `text` = "{ordinal} of {n} at {tasting} — {score} of {maximum} points" (semi-blind: "… — {matches} of {glasses} matched"; host: "{tasting} — {winner} won") (**spec copy**);
      - when `navigator.share` is missing, or rejects with anything but `AbortError`: `navigator.clipboard.writeText(url)` and an inline "Link copied" for 3 seconds.
    - Laptop (S12b): placing and the two stat cards on the left, the full table on the right, the agreed-least line beneath.

**The record (S13, S13b), parchment**

11. **One component,** `src/app/tastings/[id]/record/record-view.tsx`, rendered on the CLOSED running page once the result is dismissed, and at `/tastings/[id]/results` for a CLOSED tasting. An IN_PROGRESS `/results` keeps T7's "Standings so far" page. `/u/[id]/tastings/[tastingId]` keeps its per-person page (its semi-blind picks move to the RPC). The rows sit under the heading "Glass by glass" (S13).
12. **Header.** "Tonight · you hosted · {n} tasters" when the viewer hosted and `finished_at` is within the last 24 hours; otherwise "{d Mon} · you hosted · {n} tasters" or "{d Mon} · {host} hosted · {n} tasters" (`LocalDateTime`). Then the name, and the totals "{score} of {maximum}" and "{ordinal} of {n}" — to the right on laptops, a band under the header on phones. A host-provides host sees "You hosted" instead of totals. n = competitors.
13. **Legend.** Laptops: "C you had it" (bordeaux tile) and "C you missed" (muted tile, `--placeholder` letter), with "C 2 · R 3 · A 5 · G 8 · P 6 · V 2 — 26 across these six, and 30 a glass once a secondary grape and a type designation are in play". Phones (S13b): "C had it" and "C missed". The phone footer reads "C 2 · R 3 · A 5 · G 8 · P 6 · V 2 — {pattern sentence}" when a pattern exists, else the weights alone.
14. **Rows,** one per glass in list order, each built by pure `recordRowModel` (`src/lib/record-rows.ts`) so the branches below are tested:
    - the position; the label thumbnail (`wine_answers.image_url`, `.hatch` fallback);
    - the identity "{producer}, {wine name} {vintage}" and the meta "{appellation} · {region} · {grape}" (laptops; phones drop the meta);
    - provenance on the meta line: "{contributor} brought it" (bring-your-own); "added while pouring" when the glass's `created_at` is after `tastings.started_at`;
    - six marks C R A G P V from `glassMarks` (hit, near vintage, miss, out); the points (Cormorant, bordeaux); a chevron into S13c (phones) or an in-place expansion (laptops, `RECORD-22`);
    - a never-revealed glass: "Glass {n} · never revealed" — no identity, no marks, no points (rule 1);
    - a joined-after glass: no marks, "You joined after this glass", 0;
    - semi-blind: one mark (✓/✗) and 1 / 0 instead of six marks, and "you said {pick label}" on a miss;
    - a host-provides host: identities without the marks and points columns.
15. **Pattern sentence** (`RECORD-11`), shown only when at least 2 earlier tastings back it. Pure `src/lib/record-pattern.ts`:
    ```ts
    export type CategoryRate = { category: ResultCategory; hits: number; inPlay: number };
    export type RecordPattern = {
      everyTime: ResultCategory[];
      weakest: CategoryRate;
      backedBy: number;
    };
    export function recordPattern(
      current: readonly CategoryRate[],
      earlier: readonly (readonly CategoryRate[])[],
    ): RecordPattern | null;
    export function patternSentence(pattern: RecordPattern): string;
    ```
    - "every time" = categories with `hits === inPlay` and `inPlay >= 3` in this tasting; `weakest` = the lowest hit rate among the rest, when it is at most 1/3;
    - an earlier tasting backs the pattern when each "every time" category's rate there is at least 0.8 and the weakest category's rate at most 0.34;
    - null unless `everyTime` is non-empty, `weakest` exists and `backedBy >= 2`;
    - sentence: "Country and region every time, the producer once in six. That pattern is now {backedBy + 1, in words} tastings old — it shows up in your numbers too." ("never in six" when hits = 0);
    - data: `src/lib/record-history.ts` `getCategoryRatesByTasting(userId, excludeTastingId)` — the viewer's scored guesses on fully revealed glasses of their CLOSED blind tastings (the `profile-stats.ts` rules), at most the 20 most recent tastings.
16. **Footer actions.**
    - "Export the flight" → `/tastings/{id}/export.csv` (below). Host and JOINED only; CLOSED only.
    - "Save all {count word} to my ratings" (Q5; count = fully revealed glasses) → `saveAllToRatings(tastingId)`, a new server action in `tastings/[id]/actions.ts`:
      - CLOSED; the caller is JOINED or the host;
      - the glasses to save come from pure `glassesNeedingNotes(revealedWineIds, notedWineIds)` (`src/lib/flight-csv.ts`), so a second tap saves nothing; M5's insert policy accepts these notes because each glass is revealed and the caller is JOINED or the host (probed in §9.5);
      - for each fully revealed glass with no `wset_notes` row by the caller on that `tasting_wine_id`, insert a minimal note `{ author_id, catalog_wine_id or unidentified_wine_id (from wine_answers), context_kind: 'BLIND', tasting_wine_id, tasted_on: (finished_at ?? scheduled_at ?? now()) as a date }`;
      - inline result "Saved {k} notes to Tasting notes" with a link to `/taste/notes`; when every glass already has a note the button reads "All saved to your ratings" and is disabled (**spec copy**);
      - minimal notes show as Unfinished in the archive (R-ledger Q6).
    - Laptop: Export outlined (secondary), Save primary. Phone: Save first, Export second.
17. **CSV route** `src/app/tastings/[id]/export.csv/route.ts`, on the `calendar.ics` pattern: a 404 for anyone but the host and JOINED participants and for any status but CLOSED; `Cache-Control: private, no-store`; `Content-Disposition: attachment; filename="{slug}-flight.csv"`.
    - Columns: glass, revealed (yes/no), producer, wine name, vintage, country, region, appellation, primary grape, secondary grape, type designation, brought by (bring-your-own), your points (when the viewer competed).
    - A never-revealed glass exports its number and "no", with every identity column empty.
    - Pure `src/lib/csv.ts`: `csvRow(values)` with RFC 4180 quoting and a formula-injection guard (a `'` prefix on cells starting with `=`, `+`, `-` or `@`).
    - Pure `src/lib/flight-csv.ts`: `exportAllowed({ status, viewerRole })` (the 404 rule) and `flightCsvRows({ glasses, answersByWineId, viewer })` (the columns above, the never-revealed row and the viewer-dependent columns), so the route only loads and streams.

**One glass (S13c)**

18. `src/app/tastings/[id]/record/record-glass.tsx`: the phone detail at a route segment `/tastings/[id]/results/[glass]` (so prev/next are links), and the laptop's in-place expansion.
    - ← back; eyebrow "{tasting} · tonight" (or "· {d Mon}"); "Glass {n} of {m}"; ‹ ›.
    - The identity with the country; the label photo from `wine_answers.image_url` (hatch fallback); "{points} of {glass max}" ("20 of 30").
    - Six lines — plus secondary grape and designation when in play (the glass is revealed, so this is allowed) — each with the truth, "you: {answer}" or "you: skipped it", and "+{n}" gold-tinted for a hit, "+1" for a near vintage, "0" otherwise.
    - "Do something with it": "Rate it" / "Opens the existing rate-a-wine flow, wine prefilled"; "Add to my cellar" / "The add-wine sheet, cellar destination"; "Open it in the catalog" / "The wine's own page".
    - Footer prev / next: "Glass {n−1} · {producer short}" and "Glass {n+1} · {producer short} ›".
19. **The three actions start existing flows** (after S5c and R6, which own `add-wine-context.tsx`):
    - `AddWineOpenOptions` gains `preselect?: { catalogWineId?: string; unidentifiedWineId?: string; tastingWineId?: string }`.
    - "Rate it" → `openAddWineSheet({ kind: "note" }, { preselect: { catalogWineId, tastingWineId } })`: the provider skips the pick and opens `NewNoteModal` on that catalog wine with `tastingWineId` and `contextKind: "BLIND"`; R6's confirmation follows the save.
    - "Add to my cellar" → `openAddWineSheet({ kind: "cellar" }, { preselect: { catalogWineId } })`: the sheet opens on its lot step (quantity and rack), the path `openAddWine("cellar", { cellarWine })` already takes.
    - "Open it in the catalog" → `/catalog/{catalogWineId}`.
    - An unidentified wine: "Rate it" opens the note with `unidentifiedWineId` (the catalog target of `NewNoteModal` gains that alternative, and M5's `save_wset_note` writes it, §9.4); "Add to my cellar" opens the by-hand form prefilled from the unidentified identity through a new loader, `loadUnidentifiedWineDraft(unidentifiedWineId)` in `src/components/add-wine/by-hand-actions.ts`, opened as `openByHand({ kind: "new" }, draft)` (the form writes the catalog wine first); no catalog link.
    - The cellar preselect lands on the lot step through S5b's `initialSheetState({ initialLot })`; the unidentified preselect lands on by hand. Both are `sheet-state.ts` reducer cases with tests.

### 11.4 SQL (M3 `tasting_lifecycle_stamps`, shared with §5)

```sql
alter table public.tastings
  add column started_at timestamptz,
  add column finished_at timestamptz;
alter table public.wines add column revealed_at timestamptz;

-- The server owns these stamps: a client-sent value is always replaced.
create or replace function public.tastings_stamp_lifecycle()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := case when new.status in ('IN_PROGRESS', 'OPEN') then now() end;
    new.finished_at := case when new.status = 'CLOSED' then now() end;
    return new;
  end if;
  new.started_at := old.started_at;
  new.finished_at := old.finished_at;
  if new.status is distinct from old.status then
    if old.status = 'DRAFT' and new.status = 'IN_PROGRESS' then
      new.started_at := coalesce(old.started_at, now());
    end if;
    if new.status = 'CLOSED' then
      new.finished_at := now();
    elsif old.status = 'CLOSED' then
      new.finished_at := null;                    -- reopened
    end if;
  end if;
  return new;
end $$;
create trigger tastings_stamp_lifecycle
  before insert or update on public.tastings
  for each row execute function public.tastings_stamp_lifecycle();

create or replace function public.wines_stamp_revealed_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.revealed_at := case when new.is_revealed then now() end;
    return new;
  end if;
  new.revealed_at := old.revealed_at;
  if new.is_revealed and not old.is_revealed then
    new.revealed_at := now();
  elsif not new.is_revealed then
    new.revealed_at := null;
  end if;
  return new;
end $$;
create trigger wines_stamp_revealed_at
  before insert or update on public.wines
  for each row execute function public.wines_stamp_revealed_at();
```

- **No backfill.** Existing tastings keep null stamps. By design, legacy tastings get no "added while pouring" and no "joined after" (both need a known stamp), and the record header falls back to `scheduled_at`, then `created_at`.
- `scripts/seed-demo-people.mjs` creates tastings IN_PROGRESS, reveals, then sets CLOSED (B13 outcome); the stamps follow on their own.
- The `wines` BEFORE triggers run in name order (`wines_full_reveal_step`, M7's `wines_refuse_reveal_while_paused`, `wines_stamp_revealed_at`); this one only sets `revealed_at`, so its place in that order does not matter.

**Security reasoning.** The stamps are facts about the tasting, readable wherever its row is; they reveal no wine. Owning them in triggers stops a host from back-dating a reveal; `joined_at`, the other half of "joined after", is owned by M4's trigger (§4.4), so neither side can move it. **Assertions:** the three columns exist and are nullable; both triggers are enabled; both functions are SECURITY INVOKER with `search_path=public`.

### 11.5 Tests

- `src/lib/reveal-copy.test.ts`: `lockedLine` with two hidden steps, one, and none (null).
- `src/lib/wine-label.test.ts`: `makeGlassLabeler` numbers by list order and keeps contributor labels.
- `src/lib/result-math.test.ts`: semi-blind rows with `pick_key`; a joined-after glass counts 0 against its maximum (the caller passes eligibility); every existing case still passes.
- `src/lib/result-copy.ts` (new, pure) with its test: placing lines (blind, semi-blind, host), strongest-attribute labels, count words, the agreed-least sentences, the excluded-glass sentences, the share text, "Final standings", "Glass by glass" and the legend labels for both widths.
- `src/lib/record-pattern.test.ts`: no pattern with fewer than two backers; the sentence for "every time" with "once in six" and with "never"; the backing thresholds.
- `src/lib/csv.test.ts`: quoting, embedded newlines, the formula guard.
- `src/lib/flight-csv.test.ts`: a never-revealed row is only its number and "no"; bring-your-own and host-provides column differences; no points column for the host-provides host; `exportAllowed` for each status and role; `glassesNeedingNotes` returns nothing on a second Save all.
- `src/lib/record-rows.test.ts`: never revealed (no identity, marks or points); joined after (0); semi-blind ✓/✗ with the pick label on a miss; the host-provides host without marks or points.
- `src/components/add-wine/sheet-state.test.ts`: the cellar preselect opens the lot step; the unidentified preselect opens by hand.
- **Behavioural SQL probe:** `started_at` stamps on DRAFT → IN_PROGRESS and a host's direct update cannot change it; `finished_at` stamps on CLOSED and clears on reopen; `revealed_at` is stamped by `reveal_wine` and cannot be forged. The minimal-note scenarios (a JOINED participant's and the host's note on a revealed glass accepted; an INVITED user, an outsider and another tasting's glass refused) run in M5's probe (§9.5), where the insert policy lives.

### 11.6 Verification

- **The reveal, 1280px (S11b), mid step-reveal.** The header reads "Revealing glass {n}" and "{k} of {m} attributes · {host} is driving", with the "▲ 2nd → 1st" pill when the rank moved; the locked line reads, for example, "Producer and vintage are worth 8 between them. Nothing you do now changes them — the guess is locked."; the "This glass" rail shows no "Got the grape" before the grapes step and shows it after; the standings card lists the top five and the viewer's row.
- **The reveal, 375px (S11).** The delta sits on the standings card; the card lists the top three, plus the viewer's row when they are outside it; the locked line shows.
- **375px and 1280px, a CLOSED demo tasting.** The result is dark with the placing, best glass, strongest attribute, the agreed-least line, and "Glass 5 was never revealed" for an unrevealed glass. "See every wine" → the parchment record. Phone rows open S13c with prev/next; the laptop row expands in place.
- "Rate it" opens the note sheet on that wine and saving shows R6's confirmation; "Add to my cellar" opens the lot step; "Open it in the catalog" navigates.
- "Export the flight" downloads a CSV (both widths; on the phone it sits below Save) whose never-revealed row carries no identity.
- The record reads "Glass by glass" above its rows; the laptop result's table is headed "Final standings"; the phone legend reads "C had it" / "C missed".
- "Save all six to my ratings" creates Unfinished notes in `/taste/notes`; the button then reads "All saved to your ratings", and a second tap from another tab saves nothing.
- "Share" on a laptop without `navigator.share` shows "Link copied".
- During a LIVE step reveal the newly revealed row animates; with reduced motion emulated nothing moves.

### 11.7 Owner default

Q5 ("Save all to my ratings" as minimal notes per glass).

---

## 12. B11 · Hand hosting (S4d)

### 12.1 Screens

S4d ("Hand hosting to someone").

### 12.2 Current state

- No action exists. `tastings update host` has `host_id = auth.uid()` in both USING and CHECK, so no client can move `host_id`.
- `wine_identity_drafts.owner_id` and `wine_pour_intents.owner_id` belong to a user (the adder); `is_wine_adder` keys host-added glasses on `tastings.host_id`; `draw_down_flight_cellar_lots` pours intents by owner.

### 12.3 Change

1. S4d's "Hand hosting to someone" (DRAFT only; hidden otherwise) opens an inner view: "Choose who hosts" (**spec copy**), with the JOINED participants other than the viewer as rows (avatar, name). Selecting one shows "{name} becomes the host. You stay at the table as a guest." and a confirming "Make {name} host" (both **spec copy**).
2. `handHosting(tastingId, newHostUserId)`, a server action → `rpc("transfer_tasting_host", { p_tasting_id, p_new_host_user_id })`. Refusals map to sentences through pure `handHostingRefusal(message)` in `src/lib/lobby-copy.ts` (all **spec copy**):
   - "only the host can hand hosting over" → "Only the host can hand hosting over."
   - "hosting can only change before the tasting starts" → "Hosting can only change before the tasting starts."
   - "only someone who has joined can host" → "Only someone who has joined can host."
   - "remove the glasses you added first" → "Remove the glasses you added first — the new host would inherit their answers."
   - "finish or remove your unfinished glasses and cellar bottles first" → "Finish or remove your unfinished glasses and cellar bottles first."
3. On success the page revalidates: the former host now gets §4's guest lobby, the new host the host lobby. `tasting_places`, the join code and the settings follow `host_id`.

### 12.4 SQL (M10 `transfer_tasting_host`; after M9)

```sql
create or replace function public.transfer_tasting_host(p_tasting_id uuid, p_new_host_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tasting tastings%rowtype;
begin
  select * into v_tasting from tastings where id = p_tasting_id for update;
  if not found or auth.uid() is null or v_tasting.host_id is distinct from auth.uid() then
    raise exception 'only the host can hand hosting over';
  end if;
  if v_tasting.status <> 'DRAFT' then
    raise exception 'hosting can only change before the tasting starts';
  end if;
  if p_new_host_user_id is null
     or p_new_host_user_id = v_tasting.host_id
     or not exists (select 1 from tasting_participants
                    where tasting_id = p_tasting_id and user_id = p_new_host_user_id
                      and status = 'JOINED') then
    raise exception 'only someone who has joined can host';
  end if;
  if exists (select 1 from wines
             where tasting_id = p_tasting_id and added_by_host) then   -- M6's pinned flag
    raise exception 'remove the glasses you added first';
  end if;
  if exists (select 1 from wine_identity_drafts d join wines w on w.id = d.wine_id
             where w.tasting_id = p_tasting_id and d.owner_id = v_tasting.host_id)
     or exists (select 1 from wine_pour_intents i join wines w on w.id = i.wine_id
                where w.tasting_id = p_tasting_id and i.owner_id = v_tasting.host_id) then
    raise exception 'finish or remove your unfinished glasses and cellar bottles first';
  end if;

  update tastings set host_id = p_new_host_user_id where id = p_tasting_id;
  -- The former host's participant row is untouched: they stay JOINED.
end $$;
revoke all on function public.transfer_tasting_host(uuid, uuid) from public, anon;
grant execute on function public.transfer_tasting_host(uuid, uuid) to authenticated;
```

**Security reasoning**

- Only the current host may call it, only in DRAFT, and only to a JOINED participant.
- **Rule 1.** Refusing while any glass is host-added (`added_by_host`, pinned at insert by M6) means the new host inherits no answer key they did not add — a glass whose contributor row was deleted stays not host-added. In host-provides, hosting moves only with an empty flight. In bring-your-own there are no host-added glasses, and after M9 the host clause of `wine_answers read` covers host-added glasses only, so the new host reads no contributor's key. (Before M9 the live host clause would show them — hence M10 applies after M9.)
- Drafts and pour intents stay with their owners. Refusing while any belongs to the host keeps `is_wine_adder` (host-added glasses) and `draw_down_flight_cellar_lots` from changing meaning under a new `host_id`.
- The former host stays JOINED and becomes an eligible guesser of the others' bottles, which they never saw.
- `tastings update host`'s CHECK still blocks any client-side change of `host_id`.
- **Assertions:** SECURITY DEFINER, `search_path=public`, EXECUTE authenticated-only; the `tastings update host` policy text unchanged.

### 12.5 Tests

- `src/lib/lobby-copy.test.ts`: `handHostingRefusal` for each message and an unknown one.
- **Behavioural SQL probe:** a non-host is refused; IN_PROGRESS is refused; an INVITED target is refused; a host-added glass refuses; a host's draft or pour intent refuses; success moves `host_id` and keeps the former host JOINED; the new host can update the tasting and the former host cannot; with M9 applied, a bring-your-own new host cannot read a contributor's hidden answer key, even after the former host deleted that contributor's participant row.

### 12.6 Verification

A DRAFT bring-your-own tasting with no host-added glasses: hand hosting to a joined demo account turns the former host's page into the guest lobby, and the new host sees "Tasting settings". A host-provides tasting with one glass shows "Remove the glasses you added first — the new host would inherit their answers."

### 12.7 Owner default

Q4 (the hand-hosting rules).

---

## 13. B12 · Place

### 13.1 Screens

S1 (the place row), S4d ("Where"), S5 (the time-and-place card), S5b (the place chip), S6 ("Add to your calendar · {place}").

### 13.2 Current state

- No storage for a tasting's place. `profiles.location` is a different, public field.
- `buildTastingIcs` already accepts `location` (`src/lib/ics.ts:30-42`); the calendar route passes none ("No LOCATION yet", `calendar.ics/route.ts:11`).
- A tasting row becomes readable by every signed-in user once one of its wines is revealed (`tastings with revealed wines are public`).

### 13.3 Change

1. **Storage:** a separate table, `tasting_places` (§13.4) — never a `tastings` column.
2. **Writes:** `createTasting` and `updateTastingSetup` call `setTastingPlace(supabase, tastingId, place)` (new server helper, `src/app/tastings/new/place.ts`). Input goes through pure `normalisePlace(input)`: trim, collapse whitespace, cap at 200 characters (`{ place } | { error: "Keep the place under 200 characters." }`, **spec copy**). Empty → delete the row; otherwise upsert.
3. **Reads:** `getTastingPlace(tastingId)` under the viewer's RLS (null for anyone who may not see it).
4. **Shown on:** the invitation's card line (S5) and chip (S5b); the lobby's header line under the eyebrow (a `MapPin` icon and the text) for the host, JOINED and INVITED; the Overview next-up banner (`NextUpBanner.place?: string | null`, added by whichever task owns `overview-data.ts` after T10) — after the time in the laptop meta, and as the last part of the phone meta line from `next-up-meta.ts` ("You're hosting · 3 glasses so far · Nørrebro"); the guest lobby's calendar row "{date} · {place}"; the `.ics` `LOCATION` (the route reads the place under the same RLS: host or JOINED).
5. **Never shown on:** the signed-out preview, the signed-in link preview before joining, the record, public profile pages.

### 13.4 SQL (M2 `tasting_places`)

```sql
create or replace function public.is_tasting_member(p_tasting_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tastings t where t.id = p_tasting_id and t.host_id = auth.uid())
      or exists (select 1 from tasting_participants p
                 where p.tasting_id = p_tasting_id and p.user_id = auth.uid()
                   and p.status in ('JOINED', 'INVITED'));
$$;
revoke all on function public.is_tasting_member(uuid) from public, anon;
grant execute on function public.is_tasting_member(uuid) to authenticated;

create table public.tasting_places (
  tasting_id uuid primary key references public.tastings(id) on delete cascade,
  place text not null check (char_length(place) between 1 and 200 and place = btrim(place)),
  updated_at timestamptz not null default now()
);
alter table public.tasting_places enable row level security;

create policy "tasting places read" on public.tasting_places
  for select to authenticated using (public.is_tasting_member(tasting_id));
create policy "tasting places insert host" on public.tasting_places
  for insert to authenticated with check (public.is_tasting_host(tasting_id));
create policy "tasting places update host" on public.tasting_places
  for update to authenticated
  using (public.is_tasting_host(tasting_id))
  with check (public.is_tasting_host(tasting_id));
create policy "tasting places delete host" on public.tasting_places
  for delete to authenticated using (public.is_tasting_host(tasting_id));

revoke all on public.tasting_places from anon;
grant select, insert, update, delete on public.tasting_places to authenticated;

create trigger tasting_places_set_updated_at
  before update on public.tasting_places
  for each row execute function public.set_updated_at();
```

`database.types.ts`: `tasting_places` Row / Insert / Update with `Relationships: []`; `is_tasting_member` under Functions.

**Security reasoning.** A place can be a home address (Q2), so it lives outside `tastings`, whose rows go public once a wine is revealed. Readers: the host and JOINED and INVITED participants; DECLINED people and strangers — including anyone who can read a revealed tasting — get nothing. Writer: the host only. Both checks go through SECURITY DEFINER helpers (`is_tasting_member` new, `is_tasting_host` live). No wine data is involved. **Assertions:** RLS enabled; exactly the four policies; no anon grant; the helper SECURITY DEFINER with `search_path=public` and EXECUTE authenticated-only.

### 13.5 Tests

- `src/app/tastings/new/place.test.ts`: `normalisePlace` trims, collapses whitespace, enforces the 200 cap, and returns null for empty input.
- **Behavioural SQL probe:** INVITED reads the place; DECLINED does not; a stranger who can read a revealed tasting does not; a participant cannot write; the host writes and deletes; deleting the tasting cascades.

### 13.6 Verification

Create a tasting with a place → an INVITED demo account's invitation shows it; after declining, that account's page no longer shows it; the `.ics` downloaded by a JOINED account contains `LOCATION:`; the signed-out `/j/{code}` shows no place.

### 13.7 Owner default

Q2 (place visibility).

---

## 14. Already landed: B13 and B14

### 14.1 B13 outcome (live) — what later sections rely on

- **`20260912090000`.** `has_scored_guess` grants only the caller's own scored guess, where the caller is JOINED in the wine's tasting, the tasting is ASYNC IMMEDIATE, and the glass has `reveal_step = 0` or is revealed. §9's resolve trigger and §10's board rely on it: during a shared step reveal no guesser reads a full answer row.
- **`20260912091000`.** `tasting_participants_pin_identity` (BEFORE UPDATE) refuses changes to `tasting_id` and `user_id`. §4's leave action and §5's late join rely on it.
- **`20260912092000`.** `reveal_wine`'s participant gate counts eligible JOINED participants who have a locked guess, excludes the host-provides host, is null-safe on the host test, and refuses CLOSED. §5 (a late joiner counts once JOINED) and §7 (Pause adds a trigger, not a gate change) rely on it.
- **`20260912093000`.** Clients insert and update only the 14 guess columns; `guesses insert own` / `guesses update own` require `is_own_joined_participant_for_wine` and `is_open_guess_target`, and updates require `scored_at is null and reveal_step = 0`; `guesses_pin_identity`; `get_wine_reveal` serves JOINED participants and the host only; `reveal_own_next_category` is service_role-only; EXECUTE on the game RPCs is revoked from anon and PUBLIC. §8's upsert and §10's column lockdown build on it.
- **Seed script.** Tastings are created IN_PROGRESS, revealed, and only then CLOSED; §11's stamps follow.
- **Live drift.** `wine_answers.producer_id` and `vintage_kind` are NOT NULL, so producer and vintage are always in play for the result maths (§11).

### 14.2 B14 pure modules (lane N) and where this spec uses them

| Module | Used by |
|---|---|
| `src/lib/result-math.ts` | §11 result and record (semi-blind rows switch to `pick_key`) |
| `src/lib/semi-blind-candidates.ts` | §10 list, pool and picker |
| `src/lib/tasting-eyebrow.ts` | §3 eyebrow, §4 chips, §2's `flowWord` change |
| `src/lib/relative-day.ts` | §4 "in 2 days" / "2 days away" |
| `src/lib/ics.ts`, `src/app/tastings/[id]/calendar.ics/route.ts` | §4 "Add to your calendar", §13 `LOCATION` |
| `src/lib/wine-label.ts` (list order) | §11 `makeGlassLabeler` |

### 14.3 Carried-over hardening in scope: `in_play_steps` (M1)

- B13.4 left `in_play_steps(uuid)` executable by anon; the probe shows `PUBLIC` and `authenticated` too. Any signed-in participant can call it on an unrevealed glass and learn whether it has an appellation or a type designation — the per-wine shape §8 forbids the ladder to show (rule 1).
- Nothing in `src/` calls it. Its callers are SECURITY DEFINER functions (`get_wine_reveal`, `reveal_next_category`, `reveal_own_next_category`) and the `wines_full_reveal_step` trigger, which runs inside `reveal_wine`'s definer context.
- M1 revokes EXECUTE from `PUBLIC`, `anon` and `authenticated`; the owner and `service_role` keep it. A host's direct `update wines set is_revealed = true` through PostgREST — a scoring bypass no app path uses — then fails inside the trigger, and M6's column privileges refuse it outright (§3.4).
- **The same leak through `get_wine_reveal`.** That function (SECURITY DEFINER; JOINED guests and the host) returns `in_play_count` at every step, so at step 0 a count of 5, 6 or 7 says whether an unguessed glass has an appellation and a designation. M1 recreates it from its live definition with one edit: `'in_play_count', case when v_step = 0 and not coalesce(v_is_revealed, false) then null else coalesce(array_length(v_all, 1), 0) end`. `RevealView` already renders nothing at step 0 (`reveal-view.tsx:157`) and T9's console does not call it, so deployed code is unaffected; the competing bring-your-own console shows a bare "Next" chip there (§7.3 item 7).
- **Probe:** `get_wine_reveal`, `reveal_next_category` and `reveal_wine` still work for their callers after the revoke; an authenticated `select in_play_steps(<wine>)` is denied; a JOINED guest's and the host's `get_wine_reveal` returns a null `in_play_count` at step 0 and the count from step 1 or once revealed; the recreated body differs from live only in that expression.
- The other B13.4 leftovers — `score_own_guess` without a lock, `reveal_next_category` accepting the contributor in any timing mode — stay out of scope.

---

## 15. Migrations

Versions are chosen at implementation time (§1.6): checked absent live and on a freshly fetched `origin/master`, non-round seconds, and renumbered together when a slot is taken. Each migration follows §1.6's SQL conventions, updates `src/lib/supabase/database.types.ts` in the same task, is dry-run to `DRY-OK`, has its behavioural probe run and recorded in `.superpowers/blind-tasting/` (gitignored), and is applied live by the main session in this order — M1–M3 as soon as each is written and probed, M4 onward after add-wine V2 (§1.5).

| # | Name | Section | Purpose | Objects touched | Needs | Deploy gate |
|---|---|---|---|---|---|---|
| M1 | `in_play_steps_execute_lockdown` | §14.3 | Stop the per-glass "has an appellation / designation" leak | `in_play_steps(uuid)` EXECUTE ACL; `get_wine_reveal` recreated from live (`in_play_count` null at step 0) | — | none (no app caller of `in_play_steps`; `RevealView` renders nothing at step 0) |
| M2 | `tasting_places` | §13 | The private place | fn `is_tasting_member`; table `tasting_places` with RLS, four policies, grants, `tasting_places_set_updated_at` trigger | — | none (the app reads null until §2/§13 ship) |
| M3 | `tasting_lifecycle_stamps` | §5, §11 | When a tasting started and finished, when a glass was revealed | columns `tastings.started_at`, `tastings.finished_at`, `wines.revealed_at`; fns and triggers `tastings_stamp_lifecycle`, `wines_stamp_revealed_at` | — | none |
| M4 | `join_preview_and_late_join` | §4, §5 | The link preview and the signed-in invitation, the host's record, joining until CLOSED, leaving before Start, a server-owned `joined_at`, longer join codes | fns `host_tastings_count`, `get_join_preview` (anon + authenticated); `join_tasting_by_code` and `generate_join_code` recreated from live; fns and triggers `tasting_participants_leave_guard`, `tasting_participants_stamp_joined_at` | — | after add-wine V2 (late joining changes a flow V1 checks); the old `/j/[code]` page still joins |
| M5 | `hidden_glass_notes` | §9 | Private notes on a hidden glass, resolved at the reveal (a save racing the reveal too); no public note on a hidden glass; a note's hue never fails a reveal or a resolution | fns `can_note_tasting_wine`, `is_tasting_wine_revealed` (VOLATILE), `wset_hue_fits_colour`; constraint `wset_notes_one_identity`; policies `wset notes read` / `insert` / `update`, `wset note aromas read`; `save_wset_note` and `resolve_unidentified_wine` recreated from live; fns and triggers `wset_notes_resolve_on_reveal` (AFTER UPDATE OF `is_revealed` on `wines`), `wines_drop_unresolved_notes` (BEFORE DELETE on `wines`), `wset_notes_glass_move_guard` (BEFORE UPDATE OF `tasting_wine_id` on `wset_notes`), `wset_notes_glass_resolve_on_write` (BEFORE INSERT OR UPDATE OF `tasting_wine_id` on `wset_notes`) | — | after add-wine V2 (its Taste & rate checks write notes); deployed code writes identity-bearing notes on revealed glasses only (live count of notes on unrevealed glasses: 0) |
| M6 | `flight_edits_until_first_step` | §3 (and §2's reorder) | The adder pinned at insert; the `wines` column privileges; the setup lock after Start; the adder's edit window in RLS (OPEN kept); atomic reorder and removal; removal counts | column `wines.added_by_host`, trigger `wines_pin_adder`; UPDATE on `wines` narrowed to `position`, `added_via`; fn and trigger `tastings_lock_setup_after_start`; `is_wine_adder` recreated from live; fns `can_edit_flight_glass`, `can_remove_flight_glass`, `can_delete_flight_glass_row`, `move_flight_glass`, `remove_flight_glass`, `set_flight_glass_added_via`, `glass_removal_impact`; policies `wine_answers insert`, `wine_answers update`; `wines delete host` replaced by `wines delete adder` | M5 (the count reads hidden notes) | after add-wine V2 and F13, with the probe's OPEN rows re-run against F13's committed `addToFlight` and `saveFlightGlassCore`. Deployed code updates only `wines.position`, adds OPEN glasses revealed, and removes as the DRAFT host — all still allowed |
| M7 | `tasting_pacing` | §7 | Pause (LIVE only) and the pour pointer | column `tastings.paused_at`; fns and triggers `tastings_pointer_in_tasting`, `tastings_pause_follows_status`, `wines_refuse_reveal_while_paused`; `get_tasting_leaderboard` recreated from live (`t` and `live_round` only) | — | none (deployed code never pauses or points); applied in version order after M6 |
| M8 | `guess_lock_pin` | §8 | A locked guess keeps its answers (the FK's SET NULL excepted) | fn and trigger `guesses_refuse_locked_edit` | — | after add-wine V2: the deployed ladder can race a debounced save against `lockGuess`, which M8 would surface as an error during V1/V2; "Change it" unlocks first |
| M9 | `semi_blind_permutation` | §10 (and §7.3 item 7) | Opaque keys (the list a snapshot from Start), the permutation, the flight fixed at Start, the `guessed_wine_id` lockdown, the narrowed answer-key read | table `semi_blind_candidate_keys`; fns `ensure_semi_blind_keys`, `can_see_semi_blind_list`, `get_semi_blind_candidates`, `get_semi_blind_board`, `get_semi_blind_revealed_picks`, `assign_semi_blind_match`, `clear_semi_blind_match`, `semi_blind_release_revealed_wine`, `wines_semi_blind_flight_locked`; index `guesses_one_open_glass_per_candidate`; triggers `semi_blind_release_revealed_wine`, `wines_semi_blind_flight_locked`; `guesses` column privileges (SELECT list; INSERT/UPDATE without `guessed_wine_id`); policy `wine_answers read` | M6 (`added_by_host`), M8 (the pool release must pass the lock pin) | **Gate:** production runs the explicit `guesses` column lists, the RPC-based semi-blind UI, and the bring-your-own host console on `get_wine_reveal` before M9 applies (the plan's M9b; its additive RPCs, M9a, apply after add-wine V2) |
| M10 | `transfer_tasting_host` | §12 | Hand hosting | fn `transfer_tasting_host` | M9 (the narrowed host clause), M6 (`added_by_host`) | none |

`database.types.ts` notes:

- M9 removes `guessed_wine_id` from `guesses.Row`, `Insert` and `Update`, so `tsc` flags every remaining client reader; the RPC result types carry keys.
- M6 adds `wines.added_by_host` (Row `boolean`; Insert and Update optional, since the trigger owns it); M4 adds `host_id` and `joined_names` to `get_join_preview`'s result.
- New tables keep `Relationships: []`; jsonb RPC results are typed `unknown` and narrowed by a local type at the call site.

---

## 16. Data privacy — every new read path against rule 1

Rule 1: nobody sees an unrevealed wine they did not add — not in a lobby, a notification, or a count they could subtract from.

### 16.1 New or changed read paths

| # | Read path | Who can call it | What it returns | Why rule 1 holds | § |
|---|---|---|---|---|---|
| 1 | `get_join_preview(code)` | anon, authenticated | name, host name and avatar, time, mode, timing, pacing, glass count, status; the tasting id only to the host and JOINED or INVITED members; to signed-in callers also the host id and the joined names | A count, never a wine; never the place or the description; new codes carry about 50 bits | §4 |
| 2 | `host_tastings_count(user)` | authenticated | an integer | About a host, not a wine | §4 |
| 3 | `getInvitation`, `getOverviewInvitation` | host, JOINED, INVITED (their RLS) | tasting fields, glass count, joined names, place | Reads the `wines` count and participants only, never `wine_answers` | §4 |
| 4 | `tasting_places` select | host, JOINED, INVITED | the place | Outside the public revealed-tasting read; not a wine | §13 |
| 5 | `calendar.ics` with `LOCATION` | host, JOINED | an event | No wine | §4, §13 |
| 6 | `glass_removal_impact(wine)` | the glass's adder (or host in DRAFT) | two counts | Counts only; nothing about who or what | §3 |
| 7 | `move_flight_glass`, `remove_flight_glass`, `set_flight_glass_added_via` refusals | host; the adder | a sentence | Positions and provenance only; never an answer key | §3 |
| 8 | The lobby for guests | host-provides guests; bring-your-own guests | a glass-count chip; contributor rows with identity only on the viewer's own glasses | No other glass's identity | §3 |
| 9 | `getPouredRegionSuggestion` | host | a region name | Only host-added or revealed answer keys | §2 |
| 10 | `searchPeople(query)` | authenticated | profiles | Profiles are already readable; no wine | §2 |
| 11 | Friend context lines (`getBulkProfileSummaries`) | host, while creating | counts and averages | Built from fully revealed wines only (`profile-stats.ts`) | §2 |
| 12 | Console facts | host | hit counts and "Most said" | Revealed categories only, locked or scored rows; a bring-your-own host through `get_wine_reveal` | §7 |
| 12b | `get_wine_reveal` (recreated) | JOINED, host | unchanged, except `in_play_count` null at step 0 | No per-glass shape before the first step | §14.3 |
| 13 | `tastings.current_wine_id`, `paused_at` | host, participants | a glass id the viewer already sees as a row; a timestamp | No identity | §7 |
| 14 | `get_tasting_leaderboard` (recreated) | host, participants | unchanged columns | Unchanged gate and totals; only the round glass selection reads the pointer | §7 |
| 15 | Ladder pick counts | the viewer | counts of ids the viewer picked | The viewer's own guesses | §8 |
| 16 | Picker "all {count}" | participants | head counts of catalog tables | Catalog-wide; no tasting data | §8 |
| 17 | `wset_notes` read of a hidden note | its author | their own note | No identity until the reveal; nobody else sees it | §9 |
| 18 | `wset_note_aromas` read | whoever can read the note | aromas | A hidden note's aromas stay hidden | §9 |
| 19 | `get_semi_blind_candidates` | JOINED, host | keyed cards and a pending count; before Start only the caller's own cards, and the count only to the host | Random keys, never wine ids; sorted on the client by label; a snapshot from Start, with the flight fixed at Start, so no refresh ties a card to a glass | §10 |
| 20 | `get_semi_blind_board` | JOINED, host | own keys; revealed glasses' keys; splits for revealed glasses | No key↔wine mapping for any unrevealed wine | §10 |
| 21 | `get_semi_blind_revealed_picks` | anyone who can read the tasting | picks on revealed glasses; labels of unrevealed picks only to JOINED and host | A public viewer never learns an unrevealed candidate | §10 |
| 22 | `wine_answers read` (recreated) | authenticated | host-added glasses (`added_by_host`) to the host; revealed glasses; the contributor's own; ASYNC IMMEDIATE own scored | Removes two leaks (16.2); nulling or deleting a contributor cannot widen the host clause | §10 |
| 23 | `guesses` select | own rows, revealed glasses, the host | every column except `guessed_wine_id` | No candidate↔position mapping | §10 |
| 24 | Result and record loaders | participants; readers of the tasting | answer keys of fully revealed glasses; excluded glasses by number | No unrevealed identity, maximum or category | §11 |
| 25 | `export.csv` | host, JOINED; CLOSED only | the flight | Never-revealed glasses carry no identity (`flightCsvRows`, tested) | §11 |
| 26 | `saveAllToRatings` | JOINED, host | writes notes on revealed glasses | Revealed glasses only; M5's policy refuses anything else | §11 |
| 26b | `wset_notes` insert and update carrying a `tasting_wine_id` | the author (JOINED or host for new notes, hidden notes and moves onto a glass) | a write | An unrevealed glass only ever gets an identity-less note; a note written identity-less onto a revealed glass takes that glass's identity, which is already public | §9 |
| 27 | Share text | the viewer | placing and points | No wine | §11 |
| 28 | `transfer_tasting_host` | host | void | The new host inherits no answer key (no `added_by_host` glass; M9's narrowed host clause) | §12 |

### 16.2 Leaks found while writing this spec, and where they close

| Leak (live today) | Closed by |
|---|---|
| A semi-blind candidate row carries `wine_id`, and `wines.position` maps it to the pour order: the list is the answer key | M9 (keys, policy; the list a snapshot from Start, the flight fixed at Start) |
| `guesses.guessed_wine_id` maps a picked candidate to its position, before and after that glass's reveal | M9 (column lockdown) |
| The host clause of `wine_answers read` shows a competing bring-your-own host every contributor's hidden answer key; `wine_answers update` lets them overwrite it | M9 (read), M6 (write) |
| `in_play_steps` tells any signed-in user whether a hidden glass has an appellation or a designation | M1 |
| The console shows a host-provides host "Most said" and hit counts built from drafts before any reveal | §7 (D15 reveal-8 answered) |
| A host turns a contributor's glass into a "host-added" one — by nulling `contributor_participant_id` or deleting the contributor's participant row — and so reads and overwrites its hidden key; a host writes `wines.reveal_step` and reads the answer through `get_wine_reveal` | M6 (`added_by_host`, column privileges) |
| `get_wine_reveal` returns `in_play_count` at step 0 | M1 |
| A BLIND note carrying a catalog identity and an unrevealed glass's `tasting_wine_id` (for example through `?blindWine=`) is public | M5 |
| A host flips a running tasting's `reveal_mode` (to reach a candidate list) or `wine_source` | M6 (the setup lock) |

### 16.3 Known and accepted, not changed here

- During a shared step reveal "{k} of {m} attributes" and the hidden rows' labels show whether an appellation or a designation is still to come. Every guess on the glass is frozen from step 1, and the handoff draws it.
- `guesses read`'s host clause lets a competing bring-your-own host read other guessers' answers before a reveal. That is a fairness gap about guesses, not a wine identity; flagged for a later lane.
- `wines update host` still lets a host update `position` and `added_via` directly; after M6 no client writes any other `wines` column.
- `profiles.email` is readable by every signed-in user (the open directory); §2's people search uses it exactly as the friend picker already does.
- `wines read` lets INVITED and DECLINED participant rows read `wines` (id, position, contributor, `added_via`): counts and contributor labels, never an identity. It is also why the semi-blind list is a snapshot from Start (§10.4).
- B13.4's leftovers: `score_own_guess` without a lock; `reveal_next_category` accepting the contributor in any timing mode.
- `get_join_preview` is callable with the anon key and has no per-caller rate limit (a PostgREST RPC carries no caller address, and adding one is out of scope). New codes carry about 50 bits; the one existing 6-character code (about 30 bits) keeps working so its shared link does not break. A hit returns §4's reduced fields to anon, and the joined names to a signed-in guesser.

---

## 17. Tests — summary

**New pure modules (vitest, node, relative imports):**
`src/app/tastings/new/paste-list.ts`, `src/app/tastings/new/place.ts` (`normalisePlace`), `src/lib/ilike.ts`, `src/lib/flight-glass-rules.ts`, `src/lib/lobby-copy.ts`, `src/lib/invitation-copy.ts`, `src/lib/glass-eligibility.ts`, `src/lib/live-theme.ts`, `src/lib/safe-storage.ts`, `src/lib/pour-pointer.ts`, `src/lib/pacing-guards.ts`, `src/lib/console-copy.ts`, `src/lib/host-facts.ts`, `src/app/tastings/[id]/play/guess-write.ts`, `src/app/tastings/[id]/play/guess-save-queue.ts`, `src/app/tastings/[id]/play/ladder-copy.ts`, `src/app/tastings/[id]/play/pick-counts.ts`, `src/lib/wset/hidden-note.ts`, `src/lib/semi-blind-board.ts`, `src/lib/semi-blind-copy.ts`, `src/lib/reveal-copy.ts`, `src/lib/result-copy.ts`, `src/lib/record-pattern.ts`, `src/lib/record-rows.ts`, `src/lib/csv.ts`, `src/lib/flight-csv.ts`.

**Changed tests:** `setup-copy.test.ts`, `tasting-lifecycle-copy.test.ts`, `tasting-eyebrow.test.ts`, `wine-label.test.ts`, `result-math.test.ts`, the WSET dictionary test, `sheet-state.test.ts` (Swap and the preselects), `next-up-meta.test.ts` (the place).

**Behavioural SQL probes:** one script per migration, lane N's synthetic-rollback pattern (§1.6), scenarios listed in each section's Tests; results written to `.superpowers/blind-tasting/` before the live apply.

**Plan grep gates:**
- `rg -n "window\.confirm" "src/app/tastings/[id]/host" "src/app/tastings/[id]/play"` → only End tasting's confirm (unchanged, §19.2).
- `rg -n 'from\("guesses"\)' src` → every hit passes an explicit column list (before M9).
- `rg -n "guessed_wine_id" src` → `database.types.ts` history comments, `result-math.ts` comments and RPC types only (before M9).
- `rg -n "bg-white|#4A1523" "src/app/tastings/[id]" src/app/tastings/new src/components/new-tasting-sheet.tsx src/components/add-wine/by-hand-form.tsx` → nothing (§6).
- `rg -n "submitAllMatchGuesses|lockGuesses|OLDEST_YEAR" src` → nothing once §8/§10 land.
- `rg -n "Wine " "src/app/tastings/[id]/play" "src/app/tastings/[id]/results"` → no guest-facing "Wine N" label or "… wines" progress text remains (§11 numbering; the host lobby's Wines card lives outside these paths).

---

## 18. Verification plan (browser)

- **Environment.** The integrate worktree's dev server; demo sessions minted with `.superpowers/demo-session.mjs` (magiclink + `verifyOtp` → `/auth/confirm-hash`), never a typed password; the Browser pane in front (a hidden pane never hydrates); the browser tool sends "Enter", not "Return".
- **Viewports.** The `mobile` preset (375×812) and a 1280px mouse device, for every item in each section (a width named in an item adds detail and never skips the other width); no horizontal overflow at 375px; phone tap targets at least 44px; no text under 10px; WCAG AA on the dark surfaces.
- **Accounts.** A host (`demo.diego@blindr.invalid`), guests (`demo.isabelle`, `demo.marcus`, `demo.priya`, `demo.sofia`), and a signed-out tab.
- **Evenings to run, in order:**
  1. Blind, LIVE, host-provides, guided: §2 → §3 → §4 → §7 (Pause, Skip, two-tap) → §8 (the ladder, the picker, S10 and S10b) → §9 → §11 (S11 and S11b mid step-reveal, then the finish).
  2. Semi-blind, LIVE, host-provides, guided: §10 end to end, then §11's semi-blind finish.
  3. Bring-your-own, LIVE: §3 Swap and Remove — reached after Start from the running page's Wines card (Edit → Swap / Remove), by a contributor on their own bottle, at 375px and 1280px — §7's competing host, §12 hand hosting (in DRAFT, before this evening starts).
  4. A late joiner: §5.
  5. ASYNC IMMEDIATE blind: the ladder, a hidden-glass note resolving at the auto-reveal.
  6. Semi-blind, ASYNC IMMEDIATE, bring-your-own: §10.6's last check — every glass open, "Your bottle", locking scores and shrinks only the viewer's pool, the proven wine refused, no Add after Start.
- **Clean-up.** Throwaway tastings are deleted afterwards (the queue.md practice); no demo account keeps test notes.

---

## 19. Owner questions and spec-level choices

### 19.1 Owner questions (defaults adopted; none blocks)

| Q | Question | Default adopted | Where |
|---|---|---|---|
| Q1 | Pause semantics | LIVE tastings only; `tastings.paused_at`; a band on every live screen; reveals and Skip disabled (and refused by the database); guesses stay editable and lockable | §7 |
| Q2 | Place visibility | Host, JOINED and INVITED only; never public; never in a preview or the record | §13 |
| Q3 | The signed-out preview | Name, host name and avatar, time, mode and flow words, glass count, scoring rows; no place, joined names, description or cover photo | §4 |
| Q4 | Hand-hosting rules | Host only; DRAFT; a JOINED target; no host-added glass and no host draft or pour intent; the former host stays JOINED | §12 |
| Q5 | "Save all to my ratings" | One minimal note per fully revealed glass that has none by this taster, linked to the tasting glass | §11 |
| Q6 | Late joining | Invitations and the link stay open until CLOSED; a late joiner is eligible for unrevealed glasses; glasses revealed before they joined count 0 | §5 |
| Q7 (new) | Semi-blind before and after Start. Rule 1 forbids a list that grows while guests watch: shown before Start, every add puts a card on screen in the same refresh as its glass. | Guests get the list from Start (before Start: "The list of tonight's wines opens when {host} starts."); a semi-blind flight is fixed at Start — no add, Swap or Remove; Edit stays. The alternative for the owner: the host marks the flight final, and the list opens to guests from then | §10 |
| Q8 (new; `REVEAL-02`) | Should a LIVE blind tasting in free order still reveal attribute by attribute, or only a guided one? | Only a guided one, as shipped: one predicate, `stepRevealApplies`, gates the console chips and `RevealView`; free order reveals whole glasses | §7 |

### 19.2 Choices this spec made that the owner should see in the report

- The app chrome (`AppHeader`, the sidebar) stays as it is on live pages; only the page content goes dark. S7 and S8b draw live screens without the chrome.
- Removing a glass, or deleting a tasting, deletes the unresolved private notes on it; §3's sentence counts them.
- The "Burgundy #1" name-chip fallback goes (it named a region the host never poured).
- End tasting keeps T2/T9's `endTastingConfirm` in `window.confirm`; only "Reveal everything" and "Delete the tasting" become inline two-taps. Converting End too is one line for the owner to ask for.
- **A signed-in link visitor sees the invitation** (B3), with the host record and the joined names but never the place (Q2); a signed-out visitor keeps the reduced preview (Q3). A DECLINED guest can say yes again through the link.
- **Pause is LIVE-only** (Q1's default, narrowed): the console is a LIVE surface, and a paused auto-reveal would never re-run after Resume.
- **Removing a glass after Start** is refused once any later glass has been revealed or started its reveal, so "Glass N" never changes for a glass the table has seen.
- **The README's radii are not applied app-wide** (`XCUT-22`): retuning `--radius` would restyle every shadcn surface outside this handoff (catalog, cellar, Overview, and the add-wine sheet, which keeps its own look under B5). New tasting surfaces use the README radii through explicit classes.
- **The grape shortlist reads "Common grapes in {region}"** (S9), replacing "Grown in {region}"; the handoff's note that no grape-to-region table exists is stale, its copy is not.
- **A reload of a dismissed result never flashes it:** the page renders its header until it hydrates, then the record. localStorage stays the store (B5).
- **Settled by the main session (2026-09-13):** the not-locked line reads "They are scored on whatever they have already answered — nothing at all if they have not started." The ledger had dropped the canvas's "has"; the ledger, this spec and BT-P4 now agree.
- **Taste & Rate's R5 row** routes a LIVE semi-blind host-provides host to `/host` once `startLandsOnConsole` includes it (§2.3 item 13); the main session updates that R-ledger row.
- **(spec copy)** strings, all marked in place: the paused bands; "Pause is for live tastings."; the flight refusals (a later glass seen; the semi-blind flight fixed); "The list of tonight's wines opens when {host} starts."; Skip's refusal; the settings lock footer and eyebrow; "Swap glass {n}" / "Swap into glass {n}"; "Couldn't match {n} lines"; the people-search empty line; "Your bottle", "locked", the SB4 miss line and the data-driven pool sentences; the ASYNC guest-lobby lines; the host's result line; "All saved to your ratings"; the hand-hosting sentences; the place length error; the Danish hidden-note hint.

---

## Appendix A · Screen → section → main files

| Screen | Section | Main files (created ✚ or changed) |
|---|---|---|
| S1, S1b | §2 | `setup-copy.ts`, `new-tasting-form.tsx`, `tastings/new/actions.ts`, ✚`place.ts` |
| S2, S2b | §2 | `flight-step.tsx` (after S6), ✚`paste-list.ts` |
| S3, S3b | §2, §5 | `invite-step.tsx`, `invite-field.tsx`, `join-link-row.tsx`, ✚`people-search.ts`, ✚`ilike.ts`, `tasting-lifecycle-copy.ts` |
| S4, S4b | §3 | `tastings/[id]/page.tsx`, `wine-flight-list.tsx`, `local-date-time.tsx`, ✚`lobby-copy.ts` |
| S4c | §3 | `by-hand-form.tsx`, `add-wine-sheet.tsx`, `add-wine/types.ts`, `sheet-state.ts`, `add-wine/actions.ts`, `tasting-wine-writes.ts`, ✚`flight-glass-rules.ts`, `tastings/[id]/actions.ts` |
| S4d | §3, §12, §13 | ✚`tasting-settings-sheet.tsx`, `host-controls.tsx`, `new-tasting-form.tsx`, `tastings/new/actions.ts` |
| S5, S5b | §4, §13 | ✚`invitation-data.ts`, ✚`invitation-view.tsx`, ✚`overview/invitation-card.tsx`, `overview/page.tsx`, `j/[code]/page.tsx`, ✚`invitation-copy.ts` |
| S6, S6b | §4 | ✚`guest-lobby.tsx`, `tastings/[id]/actions.ts` (`leaveTasting`), `calendar.ics/route.ts` |
| S7, S7b | §7 | `host/page.tsx`, `host/console.tsx`, `play/reveal-actions.ts`, `play/actions.ts`, `play/auto-reveal.ts`, ✚`pour-pointer.ts`, ✚`pacing-guards.ts`, ✚`console-copy.ts`, ✚`host-facts.ts` |
| S8, S8b, S9 | §8 | `guess-ladder.tsx`, `field-picker.tsx`, `play-experience.tsx`, `play/actions.ts`, ✚`guess-write.ts`, ✚`guess-save-queue.ts`, ✚`ladder-copy.ts`, ✚`pick-counts.ts` |
| S10, S10b | §8, §9 | `locked-in.tsx`, `new-note-modal.tsx`, `note-editor.tsx`, `wine-colour-control.tsx`, the WSET dictionary, ✚`wset/hidden-note.ts` |
| S11, S11b | §11 | `reveal-view.tsx`, `wine-label.ts`, ✚`reveal-copy.ts` |
| S12, S12b | §6, §11 | ✚`live-shell.tsx`, ✚`live-theme.ts`, ✚`safe-storage.ts`, ✚`result/result-view.tsx`, ✚`tasting-result.ts`, `result-math.ts`, ✚`result-copy.ts` |
| S13, S13b, S13c | §11 | ✚`record/record-view.tsx`, ✚`record/record-glass.tsx`, `results/page.tsx`, ✚`record-pattern.ts`, ✚`record-rows.ts`, ✚`record-history.ts`, ✚`export.csv/route.ts`, ✚`csv.ts`, ✚`flight-csv.ts`, `add-wine-context.tsx`, `sheet-state.ts`, `by-hand-actions.ts` |
| SB1–SB4 | §10 | `match-ladder.tsx`, `play-experience.tsx`, `host/console.tsx`, ✚`semi-blind-board.ts`, ✚`semi-blind-copy.ts`, ✚`guess-columns.ts`, every `guesses` reader |
| all live screens | §6 | `globals.css`, `components/ui/popover.tsx` |
