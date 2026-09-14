# Blind tasting v3 — Implementation Plan

The evening, end to end · create → lobby → invite → play → reveal → result → record, plus semi-blind

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is prompt-ready: give one agent the **Global Constraints**, the **Plan refinements**, the **Working Rules** and **exactly one task**, together with the spec and ledger paths below.

**Goal:**
- Build the owner's Claude Design handoff *the blind tasting, end to end* (screens S1–S13c and SB1–SB4) on top of add-wine v2.
- Land every B-ledger decision (B1–B12), every verified map item the ledger adopts, and the rule-1 leaks the spec found (§16.2).
- Keep the scoring engine (`reveal_wine`, `reveal_next_category`, `score_own_guess`), rule 1 and the CLAUDE.md invariants exactly as they are.

**Architecture:**
- **SQL as its own chain.** Eleven migrations (M1–M8, M9a, M9b, M10) are written, dry-run and behaviour-probed by agents and applied live by the main session in version order, except M8, which waits for its deploy gate and applies after M9a (refinement 24). No scoring function is recreated: pause, the pool release and note resolution are triggers.
- **Pure modules first.** Twenty-two new pure modules (copy, rules, maths) land in a parallel wave with vitest, so every UI task builds against fixed contracts; five more (`ilike`, `pacing-guards`, `guess-save-queue`, `flight-csv`, `record-rows`) land test-first inside the tasks that use them.
- **One running page, split into views.** `src/app/tastings/[id]/page.tsx` becomes a router over view files (host lobby, invitation, guest lobby, running, finished). Tracks then own different files. The running view sits in `LiveShell`, dark while IN_PROGRESS.
- **Tracks by screen family:** create (C), lobby and editing (L), guests (G), joining late (J), host console and pacing (H), guessing (Y), hidden-glass note (N), semi-blind (S), reveal/result/record (R), hand hosting (K), place (Q). The hotspot files (`play-experience.tsx`, `play/actions.ts`, `database.types.ts`, `tastings/[id]/actions.ts`) are edited in fixed chains.
- **Deploy gate.** M9 is split. M9a (additive RPCs) is applied before the app ships the RPC-based semi-blind UI; M9b (the `guessed_wine_id` lockdown, the narrowed `wine_answers read`, the permutation index, the pool release and the semi-blind flight lock) is applied only after production runs that UI.
- **Add-wine first, review included.** Every task that edits a file an add-wine task owns waits for add-wine V2 (after its G1–G3 review and V1 browser checks) and for BT-A0, the main session's re-verification of every add-wine contract this plan names. Before that, only the pure modules, the migrations' writing and probing, and the live applies of M1–M3 run.

**Tech Stack:**
- Next.js 16 App Router. AGENTS.md: read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers, server actions or dynamic routes.
- React 19, TypeScript, Tailwind, shadcn/ui on `@base-ui/react`.
- Supabase: Postgres, RLS, Realtime, Storage.
- vitest (node environment). No new dependencies: drag and drop uses pointer events.

**Spec:** `docs/superpowers/specs/2026-09-12-blind-tasting-v3-design.md`. Each task cites the sections it implements; read them.

**Inputs** (all binding; the first four live in `.superpowers/blind-tasting/`, gitignored):
- `decisions.md`: the B-ledger (Precedence, Sequencing, B0–B14, "B13 outcome", "B13.4 outcome", Reversals, Not adopted, Q1–Q6).
- `README.md`, `canvas-text.txt`: the handoff. The paragraph under each `#### [ID]` anchor is that screen's spec.
- `map.json` (371 verified items), `critic.json` (MISSED-01…07 and corrections), `reconcile.json`.
- `lane-n/probe-092000.mjs`: the behavioural-probe pattern every migration task copies.
- Upstream: `docs/superpowers/plans/2026-09-12-add-wine-v2-scan-and-flow-fixes.md` (Global Constraints, Amendments 1–20, the G1–G4 and V1–V3 gates), `.superpowers/add-wine-v2/owns.json`, `.superpowers/taste-rate/decisions.md` (R4, R5, R6), `.superpowers/queue.md` (push procedure and the F7-revert window).

**Base:** `master` at `a925925` (BT-A0 ran at `8d4eb71`; restated here after the pre-apply hardening round 2 that followed it — BT-SQL4x, M5x2, M6x and P6x committed, refinement 25). Add-wine F1–F13, L1, S1–S7 and Taste & Rate R6 (`d11f9a6`) are committed; T1–T14 are committed. G1–G4 and V1–V3 are not yet in history. Live `supabase_migrations.schema_migrations` ends at `20260914113500` (add-wine's `producer_aliases`; M1–M3, `20260914090500`–`092500`, are live, M4–M10 are committed in the tree but not applied — read-only checks, 2026-09-13). The local `origin/master` ref is stale relative to both; restate it here once the main session fetches. Refinement 26 (2026-09-13 19:08): M4–M7 and M9a are live, M8 waits for its deploy gate, and `origin/master` is `31fea27`.

**Id conventions:** blind-tasting tasks are `BT-…`. Add-wine v2 tasks appear as `AW-<id>` (for example `AW-S7`), Taste & Rate tasks as `TR-<id>`. Migrations are `M1`…`M10` as in spec §15, with M9 split into `M9a` and `M9b` (refinement 1).

---

## Global Constraints

Every task's requirements implicitly include this section.

### Precedence and invariants

- **Precedence** (ledger): owner instructions → the invariants below → this handoff for tasting UX, flow and copy → the add-wine handoff and ledger for the add-wine sheet in every context (create step 2, the S4c edit form) → verified map findings → code on `master`.
- **Invariants you must never plan or build against:**
  - Rule 1: nobody sees an unrevealed wine they did not add — not in a lobby, a notification, a payload, or a count they could subtract from. Every new read path is checked against spec §16.
  - `reveal_wine`, `reveal_next_category` and `score_own_guess` stay the only scoring engine, with CLAUDE.md's point values (country 2, region 3, appellation 5, primary grape 8, secondary grape 2, producer 6, type designation 2, vintage 2/1/0; semi-blind 1/0). No task recreates them.
  - Cross-table RLS on `tastings`, `tasting_participants` and `wines` goes through SECURITY DEFINER helpers. A policy recreated only to drop a clause keeps its live text otherwise (spec §10.4 f).
  - Guess inputs are controlled React state on every page that mounts `AutoRefresh`.
  - Comboboxes, pickers and popovers stay keep-mounted and call `.focus()` synchronously inside the opening tap.
  - Producers and appellations are never preloaded: search RPCs, id lookups, or `select("id", { count: "exact", head: true })`.
  - One definition of a complete wine: `src/lib/wine-identity/` (add-wine D2). No "is it complete" logic anywhere else.
- **Live drift (ledger B13 outcome):** live `wine_answers.producer_id` and `vintage_kind` are NOT NULL; producer and vintage are always in play.

### Anthropic API

- **Zero calls.** No agent and no task in this plan calls the Anthropic API: no `messages`, no `count_tokens`, no batch, no script that touches `api.anthropic.com`. Nothing here changes the label reader.
- Browser verification (BT-V5) keeps `LABEL_READ_FIXTURE` set in `.env.local`, so a scan through the add-wine sheet never bills.

### Tests and pure modules

- vitest runs `src/**/*.test.ts` in node with **no `@/` alias**. A module a test loads imports other modules at runtime only by relative path; `import type … from "@/…"` is fine.
- **Pure modules** never import `server-only`, Supabase clients, React or a browser API at module top level. In this plan: every file created by BT-P1…BT-P8 (`src/lib/safe-storage.ts` included), `src/lib/tasting-date-format.ts` (BT-D1), `src/app/tastings/[id]/view-route.ts` (BT-D2), `src/lib/ilike.ts` (BT-C3), `src/lib/pacing-guards.ts` (BT-H1), `src/app/tastings/[id]/play/guess-save-queue.ts` (BT-Y1), `src/lib/wset/hidden-note.ts` (BT-N1), `src/lib/flight-csv.ts` (BT-R4), `src/lib/record-rows.ts` (BT-R3), and the modified `setup-copy.ts`, `tasting-eyebrow.ts`, `tasting-lifecycle-copy.ts`, `wine-label.ts`, `result-math.ts`, `next-up-meta.ts`. `place.ts` may take a Supabase client as a parameter, typed with `import type` only.
- Tests are written first (Working Rule 4). Component files get no unit tests; the browser checks in BT-V5 cover them.

### CLAUDE.md rules that bind here

- **Reference tables:** never read a whole `appellations` or `producers` table (PostgREST caps at 1000 rows).
- **Base UI:** `Button render={<Link/>}` needs `nativeButton={false}`; a `Button` passed as another component's `render` keeps the default; `Select` needs an `items` map.
- **Synchronous focus:** `PopoverContent` keeps `keepMounted`; each picker calls `.focus()` in the same handler that opens it. Never `autoFocus`, never a deferred callback.
- **Dates:** format with `LocalDateTime` (client, the viewer's zone); convert `datetime-local` ⇄ ISO at the action boundary.
- **Semi-blind branch rule:** every surface that renders scoring has a semi-blind branch (✓/✗, "k of n matched"), never the category table.
- **Wine labels:** guest-facing text says "Glass N" by list order (B10, MISSED-01); the host's lobby Wines card keeps "Wine N".

### Copy and visuals

- **Copy** is exactly the spec's (verbatim handoff copy, or copy the spec marks **(spec copy)**). Strings this plan had to add are listed under "Plan copy" below and marked `(plan copy)` in a code comment next to them.
- **Language:** English on every tasting surface. English and Danish through `makeT` (`src/lib/wset/i18n.ts`) only in the note sheet (BT-N1).
- **Tokens only:** no raw hex in components. `--gold-dark` for small gold text on parchment, `--gold-light` for gold on dark, `bg-primary-hover` for the bordeaux hover (BT-D1 adds it). The console keeps its `bg-console*` utilities.
- **Radii:** new tasting surfaces use the README's radii through explicit classes — sheets 16px, cards 12–13px, buttons 9–11px, pills 999px. The app-wide `--radius` stays (spec §19.2, `XCUT-22`).
- **Sizes:** phone and tablet tap targets at least 44px tall; no text below 10px (eyebrows at 10px minimum, XCUT-25).
- **Motion:** `animate-rise-in` and `live-ping` only; both already drop under `prefers-reduced-motion`.

### Migrations

- **File rules** (spec §1.6):
  - No `begin` / `commit`.
  - Pre-state assertions first: they fail when live differs from what the migration was written against.
  - Post-state assertions in a final `do` block, in the same transaction (the `20260912093000` pattern).
  - Recreate functions and policies from the LIVE definition. Before writing, dump `pg_get_functiondef` / `pg_policies` for every object you recreate into `.superpowers/blind-tasting/probes/<version>-live-defs.sql` with a read-only script (`begin read only … rollback`).
  - Every new SECURITY DEFINER function pins `set search_path = public`, revokes EXECUTE from `public, anon` unless its task says otherwise, grants `authenticated` explicitly, and is asserted through `to_regprocedure`, `prosecdef` and `proconfig`.
- **Dry run:** `node scripts/scratch-apply.mjs --file <file> --mode dry` must print `DRY-OK <version> <name>`. When a migration needs an earlier one that is not live yet, concatenate both into the scratchpad under the later file's name (`cat <earlier>.sql <later>.sql > "$SCRATCH/<later version>_<later name>.sql"`) and dry-run that file.
- **Behavioural probe** (spec §1.6, lane N pattern): `.superpowers/blind-tasting/probes/<version>-<name>.mjs`, run with `node --env-file=.env.local <probe>`.
  - One `pg` client (`pgConfig` from `scripts/wine-map-tiles/lib.mjs`); every transaction ends in `rollback`, also on error.
  - Fixtures on the seeded `demo.*@blindr.invalid` accounts; each scenario in a savepoint that is rolled back.
  - The caller is simulated with `set local role authenticated` plus `select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)`; anon with role `anon` and claims without `sub`.
  - A "before" phase on live and an "after" phase with the migration applied inside the transaction.
  - The `EXPECT` table is written into the script before the first run. Output goes to `<probe>.log` and `<probe>.out.json` beside it; the task reports every mismatch.
- **Agents** run `--mode dry` and rollback-only probes only. Never `--mode live`, never a committed write, never `supabase db push`. The main session applies live in the BT-M tasks.
- **When the applies run:** BT-M1, BT-M2 and BT-M3 as soon as their SQL task commits (behaviour-neutral for deployed code). BT-M4 onward wait for add-wine V2, because they change flows add-wine V1/V2 exercise (late joining, notes, answer-key writes, the lock pin). BT-M6 also waits for AW-F13 and re-runs its probe's OPEN rows against F13's committed `addToFlight` and `saveFlightGlassCore` first. BT-M8 also waits for its own deploy gate (BT-SQL8 "Deploy gate": a Ready production deployment containing BT-Y1, BT-S2 and BT-S3), so it applies after BT-M9a and before BT-M9b, out of version order (refinement 24). Refinement 26: the owner lifted the AW-V2 wait, and M4–M7 and M9a were applied on 2026-09-13.
- **Versions** are shared with the upstream wine-map stream. The plan reserves these slots (non-round seconds, above the live tail `20260913180000` when written):

  | Migration | Version | File |
  |---|---|---|
  | M1 | `20260914090500` | `20260914090500_in_play_steps_execute_lockdown.sql` |
  | M2 | `20260914091500` | `20260914091500_tasting_places.sql` |
  | M3 | `20260914092500` | `20260914092500_tasting_lifecycle_stamps.sql` |
  | M4 | `20260914093500` | `20260914093500_join_preview_and_late_join.sql` |
  | M5 | `20260914094500` | `20260914094500_hidden_glass_notes.sql` |
  | M6 | `20260914095500` | `20260914095500_flight_edits_until_first_step.sql` |
  | M7 | `20260914100500` | `20260914100500_tasting_pacing.sql` |
  | M8 | `20260914101500` | `20260914101500_guess_lock_pin.sql` |
  | M9a | `20260914102500` | `20260914102500_semi_blind_rpcs.sql` |
  | M9b | `20260914103500` | `20260914103500_semi_blind_lockdown.sql` |
  | M10 | `20260914104500` | `20260914104500_transfer_tasting_host.sql` |

  - The main session runs `git fetch origin` immediately before dispatching each BT-SQL task and before each BT-M apply. Agents never fetch, and the local ref lags the upstream stream (see Base).
  - Immediately before writing, and again immediately before the live apply, check the version is absent live (`select 1 from supabase_migrations.schema_migrations where version = '<v>'`, read-only — the authority) and upstream (`git ls-tree --name-only origin/master supabase/migrations/ | grep <v>`, on the freshly fetched ref).
  - If a slot is taken, renumber that file **and every later unapplied BT migration together**, keeping M1 < M2 < … < M10 in version order; rename each file and every reference to it (this table, its task, its probe) and report. A version below the live tail is fine while it is absent: these migrations depend on no wine-map object. Never rename an applied file.
- **Types file:** `src/lib/supabase/database.types.ts` is hand-written. Every table keeps `Relationships: []`, the schema keeps `Views: {}`, and jsonb RPC results are typed `Json` and narrowed at the call site. Only these tasks edit it, in this order: BT-SQL2 → BT-SQL3 → BT-SQL4 → BT-SQL5 → BT-SQL6 → BT-SQL7 → BT-SQL9 → BT-N1 → BT-SQL10 → BT-SQL11.

### Deploy and push

- **Push rule** (queue.md; the owner's cadence "push verified state regularly"): the main session pushes straight to `master` (no PR; `gh` is not installed) through the integrate worktree, and only a tree where each of these passes with its real exit code captured (never `cmd | tail && next`):
  1. `npx tsc --noEmit`
  2. `npm run lint -- --max-warnings=0`
  3. `npm test`
  4. `node --test scripts/wine-map-tiles/lib.test.mjs`
  5. `npm run build`
- **No push ahead of the database:** never push a commit whose code calls a migration object that is not live yet (check the BT-M log).
- **M9b only after the deploy:** M9b is applied only after the production deployment of a commit containing BT-S5 and everything it depends on is Ready (BT-M9b).
- **Compile-debt window: closed (BT-A0).** AW-S6 (`951e729`) is committed, so Working Rule 5's "From AW-S6 on, a bare `npx tsc --noEmit` must print nothing" branch now applies everywhere — confirmed: a bare `npx tsc --noEmit` prints nothing on the current tree. Historical, while the window was open: add-wine F7…S5c were committed but AW-S6 was not, so only green commits were pushed (queue.md; amendment 19); queue.md's procedure covered blind-tasting commits too, the integrate branch kept the revert of F7 (`5a44457`) until S6 landed, and green BT commits (wave 0–1's pure modules and migrations) were cherry-picked onto integrate instead of merging master. On S6 landing, `git revert` the F7 revert on integrate first, then merge master.
- **Gate base:** when BT wave 0 starts, the main session records master's sha as `BT_BASE` in `.superpowers/blind-tasting/probes/live-applies.log`. Every BT-V gate that reads history reads only blind-tasting commits (`git log --grep='^feat(blind-tasting)'`), never a range that includes add-wine work.
- **Lockfile:** the pre-existing `package-lock.json` diff is never committed and the working-tree file is never rewritten.

### Never build (ledger "Not adopted", and earlier removals)

- Secondary grape and type designation rows "only if the wine has them" (rule 1). Both rows stay under More with `LADDER_EXTRAS_NOTE`.
- "Your phone will buzz." (no push notifications).
- "The more certain you are, the more you can score." (no confidence scoring).
- A mixed host-and-guest flight, or a host competing while seeing identities: `wine_source` stays either/or.
- Reading the full invitation with no account (B3 gives a reduced preview only).
- "Wines 3 of 6", "3 of 6 · hidden", six-slot padding or any planned glass count.
- A ✕ on a waiting contributor row.
- S3b's friend context lines "brings wine N" and a last tasting with its region: friend context is `getBulkProfileSummaries` only (B1).
- The semi-blind candidate list for guests before Start, and adding, swapping or removing a semi-blind glass after Start (rule 1; Q7).
- The README's stale notes: `guess-form.tsx`, `RateWineModal`, a `Sheet` primitive, "join codes / grape mapping missing".
- A `/taste/semi-blind` redirect (XCUT-45: that route never existed).
- D14 play-2's semi-blind freeze (dropped by B0), and everything the add-wine plan lists under "Removed on purpose".

### Owner defaults adopted (ask in the final report; never block on them)

| Q | Default this plan builds | Tasks |
|---|---|---|
| Q1 Pause | LIVE tastings only; `tastings.paused_at`; a band on every live screen; reveals and Skip disabled; reveals refused by the database (M7's `wines_refuse_reveal_while_paused`), Skip refused by the action (`skipPlan`), not the database; guesses stay editable and lockable | BT-SQL7, BT-H1, BT-H2 |
| Q2 Place | host, JOINED and INVITED only; never public, never in a preview or the record | BT-SQL2, BT-P8, BT-C1, BT-L2, BT-L4, BT-G1, BT-G2, BT-Q1 |
| Q3 Signed-out preview | name, host name and avatar, time, mode and flow words, glass count, scoring rows; nothing else | BT-SQL4, BT-G3 |
| Q4 Hand hosting | host only, DRAFT, a JOINED target, no host-added glass and no host draft or pour intent; the former host stays JOINED | BT-SQL11, BT-K1 |
| Q5 Save all | one minimal note per fully revealed glass without one by this taster | BT-R4, BT-R3 |
| Q6 Late joining | invitations and the link stay open until CLOSED; glasses revealed before a joiner arrived count 0 | BT-SQL3, BT-SQL4, BT-J1, BT-P2, BT-R2 |
| Q7 Semi-blind snapshot (new) | guests get the candidate list from Start; before Start "The list of tonight's wines opens when {host} starts."; a semi-blind flight is fixed at Start (no add, Swap or Remove; Edit stays) | BT-SQL6, BT-SQL9, BT-SQL10, BT-P1, BT-P6, BT-L1, BT-L3, BT-S1, BT-H2 |
| Q8 Step reveal (new; `REVEAL-02`) | only guided LIVE blind tastings reveal attribute by attribute; one predicate, `stepRevealApplies`, gates the console chips and `RevealView` | BT-P4, BT-H2, BT-R1 |

---

## Plan refinements of the spec (binding; they keep the spec's names, copy and SQL semantics)

1. **M9 ships as M9a + M9b.** The spec requires the RPC-based semi-blind UI in production before M9, but that UI calls M9's RPCs. M9a holds §10.4 (a)–(c): additive, safe for deployed code. M9b holds (d)–(f): the unique index, the pool release, the `guesses` column privileges and the narrowed `wine_answers read`. M10 applies after M9b.
2. **New server actions live in new per-concern `"use server"` files** instead of `src/app/tastings/[id]/actions.ts`, so tracks don't queue on one file: `flight-actions.ts`, `settings-actions.ts`, `guest-actions.ts`, `pacing-actions.ts`, `record-actions.ts`, `hosting-actions.ts`, `src/app/j/[code]/actions.ts`, `src/app/tastings/new/people-search.ts`. The action names and signatures are the spec's.
3. **The running page is split first** (BT-D2): `page.tsx` routes to `lobby-view.tsx`, `invitation-view.tsx`, `guest-lobby.tsx`, `running-view.tsx` and `finished-view.tsx`, plus the shared `tasting-page-header.tsx`, `wines-card.tsx` and `participants-card.tsx`. Each view loads its own data through `src/lib/tasting-request-cache.ts`.
4. **CLAUDE.md is edited once, in BT-DOC1, after AW-G4.** Tasks that land before AW-G4 cannot edit CLAUDE.md (spec §1.4). Each task's report quotes the §1.4 row it makes true; BT-DOC1 applies them all.
5. **Play guards move to `src/app/tastings/[id]/play/guesser.ts`** (server-only, pointer-aware): `resolveGuesser`, `guessableWineError`, `sequentialOrderError`. Guess, match and reveal actions share them.
6. **Semi-blind guided pacing refuses a not-yet-poured glass on the server** in `assignMatch`, with the existing string "Guess the wines in order — earlier wines come first." Spec §10.3 dims the row in the UI; this adds no copy.
7. **The `window.confirm` gate is corrected.** Allowed: End tasting's `endTastingConfirm` (T2/T9, kept per spec §19.2) and the ASYNC + IMMEDIATE `lockConfirm` (add-wine T6 play-4). `play/reveal-controls.tsx`'s "Reveal the full answer now?" becomes the same two-tap as the console's Reveal everything (B6).
8. **`LocalDateTime` formats land in BT-D1**, before any consumer. They add `"card"` ("Thursday 11 Sep, 19:00", S5) next to the spec's `"eyebrow"` and `"eyebrow-short"`.
9. **Phone step 2 gets "Create and finish later"** under "Invite people →" (CREATE-43). The handoff draws it and nothing in the spec or ledger removes it.
10. **`taste-archive-math.test.ts`** "a live semi-blind host also lands on the lobby" flips to `/host` together with `startLandsOnConsole` (BT-C1).
11. **Hidden notes count as ratings only once resolved** (B8). The author-scoped `wset_notes` stats reads in `overview-data.ts`, `your-numbers.ts` and `cellar/page.tsx` skip identity-less notes (BT-N1). The spec lists only the archive.
12. **`wset_notes` types are corrected in BT-N1:** `catalog_wine_id: string | null`, plus `unidentified_wine_id`. Both are nullable live; the hand-written types lag (queue.md).
13. **Small shared helpers for reuse:** `guessOrderAllows` (pour-pointer), `twoTapState` (console-copy), `countWord` (`src/lib/count-words.ts`), `boardFromRpc` (semi-blind-board), `pickPouredRegion` (setup-copy), `reorderIds` / `crossesSeenGlass` (flight-glass-rules), `view-route.ts`.
14. **BT-S6 is conditional.** It runs only if BT-M9b's Realtime check shows the `guesses` channel stops delivering after the column revoke (spec §10.4 e).
15. **The grape row renders as a plain row** (B7 "Rows"; PLAY-13): the answer only; the shortlist context stays in the picker.
16. **The reveal standings card is capped** (REVEAL-09): the top 3 on phones, the top 5 on laptops, with the viewer's row always shown.
17. **Guest AutoRefresh:** the invitation view (BT-G1) mounts `AutoRefresh` too, so a Start or a new joiner shows without a reload (spec §4.3 item 5 names both views).
18. **Semi-blind result glasses carry their candidate key.** With `pick_key` replacing `guessed_wine_id` (spec §11.3 item 9), `semiBlindResult` needs each glass's own key to tell "said" from "got": `SemiBlindResultGlass = ResultGlass & { candidateKey: string | null }` (BT-R2).
19. **Critique round (2026-09-13).** Each change is also in the spec; they are listed here so a reviewer finds them in one place:
    - M1 also nulls `get_wine_reveal`'s `in_play_count` at step 0 (BT-SQL1).
    - M4: the signed-in invitation fields, `viewer_tasting_id` only for the host and JOINED or INVITED rows, a trigger-owned `joined_at`, 10-character join codes (BT-SQL4).
    - M5: no identity-bearing note on an unrevealed glass; `save_wset_note` recreated (BT-SQL5).
    - M6 pins `wines`: `added_by_host` (trigger-owned), UPDATE only on `position` and `added_via`, `tastings_lock_setup_after_start`, `is_wine_adder` recreated, the OPEN branch, `remove_flight_glass`, `set_flight_glass_added_via`, `can_delete_flight_glass_row` (BT-SQL6).
    - M7: Pause LIVE-only (BT-SQL7). M8: the FK's SET NULL passes a locked row (BT-SQL8).
    - M9a: the list a snapshot from Start; `known` and the proven check through `has_scored_guess` (BT-SQL9). M9b: inserts refused once a semi-blind tasting has started; the host clause on `added_by_host` (BT-SQL10).
20. **New pure modules for logic that had no test:** `safe-storage.ts` (BT-P3), `pacing-guards.ts` (BT-H1), `guess-save-queue.ts` (BT-Y1), `ilike.ts` (BT-C3), `flight-csv.ts` (BT-R4), `record-rows.ts` (BT-R3), plus `dropIndex` (BT-P1), `matchRefusalSentence` (BT-P6), `stepRevealApplies` (BT-P4) and the sheet's preselect cases (BT-R5).
21. **The running page keeps the Wines card** for the host and for a JOINED bring-your-own contributor after Start, so Edit, Swap and Remove stay reachable (BT-D2).
22. **Duplicates avoided:** `host-facts.ts` uses `RevealKey` from `reveal-rows-math.ts`; `participantsSummary` and `modeChip` build on `tasting-eyebrow.ts`; `play/auto-reveal.ts` and `host/page.tsx` use `eligibleForGlass`; `live-theme.ts` and TR-R6's "Don't show this again" share `safe-storage.ts`.
23. **A semi-blind Skip never wraps (main session, 2026-09-13; BT-P3 review, map SB-13).** `pouredThrough` follows the pointer, so a Skip that wrapped back past the end would re-dim glasses guests have already matched. `skipPlan` therefore takes `revealMode`: in `SEMI_BLIND` a target that lies before the pointer returns null (nothing to skip to: every glass up to the pointer is already open for matching), and the console hides Skip there; BLIND keeps the wrap. BT-H1 adds `revealMode: "BLIND"` to its test `base` plus the case `expect(skipPlan({ ...base, revealMode: "SEMI_BLIND", pointer: "d", fromWineId: "d" })).toBeNull()`, and `skipToGlass` reads `reveal_mode` with the rest. No column is added and `pour-pointer.ts` is unchanged. The "Glass {n} was skipped · Pour it now" eyebrow is reveal-driven only: a blind Skip that itself wraps does not raise it.
24. **M8 binds the client roles only, and applies behind a deploy gate (main session, 2026-09-13; BT-SQL8x).**
    - `guesses_refuse_locked_edit` refuses a locked row's answer change only when `current_user` is `anon` or `authenticated`, or the request's JWT role (`request.jwt.claims`, the expression `auth.role()` uses) is one of them. A SECURITY DEFINER function or a foreign-key action that runs inside a client request therefore stays bound. `service_role`, and the owner or a superuser outside a client request, pass: maintenance that repoints `guesses` foreign keys (`scripts/dedupe-producer-orthographic-variants.mjs`, `scripts/fix-lwin-producer-titles.mjs`, data migrations) is never blocked by a locked row. Nothing in `src` writes `guesses` with the admin client. The rest of spec §8.4's SQL, the SET NULL exemption included, is unchanged.
    - M8 also pins `reveal_own_next_category`, the fourth live writer, and fails closed unless every function that inserts into or updates `guesses` is one of the four live writers or M9a's `assign_semi_blind_match` / `clear_semi_blind_match`, and unless only `authenticated`, `service_role` and the owner hold UPDATE on `guesses`.
    - BT-M8 applies only once production runs BT-Y1, BT-S2 and BT-S3 (BT-SQL8 "Deploy gate"), because the deployed `submitGuess` and `submitAllMatchGuesses` rewrite locked rows. BT-S2 needs M9a live, so BT-M9a no longer waits for BT-M8, and M8's version then sits below the live tail (Global Constraints "Versions" allows it). BT-M9b still needs BT-M8. BT-SQL9's probe runs M9a's RPCs on locked glasses with M8 applied after M9a ("With M8"), and `matchRefusalSentence` maps the pin's sentence to `ctx.lockedIn` (BT-P6x, committed 3269919), so BT-S2 shows `LOCKED_EDIT_REFUSAL` (BT-SQL8 "Deploy gate" check 3). This supersedes spec §15's M8 gate ("after add-wine V2") and §1.5's "needs no other gate" for M8.
25. **Pre-apply hardening round 2 (main session, 2026-09-13).** The decisions taken on the wave-2 reviews (BT-SQL4x, BT-SQL5x, BT-SQL8x, BT-SQL6, BT-SQL7, BT-SQL9) and the hardening round after them (M5x2, M6x, P6x), with what actually committed. M1–M3 are live; every migration below is committed and none is live yet, so BT-M4 onward still apply them in the BT-M order. The spec carries each change (§1.5, §3.4, §3.5, §4.4, §4.5, §5.3–§5.5, §7.4, §8.4, §9.4, §9.5, §10.4 (b), §15, §16, §19.1).
    - **M4: `joined_at` stamped once; no leaving and no delete after Start (BT-SQL4x, committed 4a09f6b).**
      - `tasting_participants_stamp_joined_at` stamps `now()` the first time a row becomes JOINED and keeps it on every later flip to JOINED. A guest who left before Start and rejoins keeps the first stamp, so the glasses revealed while they were away read as ordinary misses (0 against the maximum), not "You joined after this glass" (BT-P2, BT-R1, BT-R2). A DECLINED invitee who never joined is stamped on the first join.
      - `tasting_participants_leave_guard` fires `BEFORE UPDATE OF status OR DELETE` (tgtype 27). Once the tasting has started (the status is not DRAFT, or `started_at` is set) no signed-in caller, the host included, moves a JOINED row out of JOINED or deletes it. The guest hears "you can only leave before the tasting starts"; the host, and any delete, "A guest who has joined stays in the tasting once it has started." (plan copy). Deleting the tasting still cascades. `service_role` and the owner (`auth.uid()` null) stay exempt, as committed.
      - Probes that delete a JOINED contributor's participant row stage it in DRAFT, or run it as `service_role` after Start (BT-SQL6 H5, BT-SQL10, BT-SQL11).
    - **M5: membership before the glass lock (M5x2, committed ce80f9e).** On BT-SQL5x's base (4c5b9e6: a save racing the reveal attaches, `is_tasting_wine_revealed` is VOLATILE, a hue never fails a reveal or a resolution), `wset_notes_glass_resolve_on_write` now returns before its `FOR SHARE` for a client request (JWT role `anon` or `authenticated`) from anyone who may not note the glass (`can_note_tasting_wine`), so a write RLS refuses never holds up a reveal, a reveal step or a position change. `service_role`, and the owner outside a client request, still lock and attach.
      - M5x2's spec §9.4/§9.5 edits (probe rows L1 and G3 compare them with the migration byte for byte) and its BT-SQL5 plan edits were outside its commit paths; they land in the commit that adds this refinement.
      - Residual, stated in §9.4: the gate reads membership with a fresh snapshot and the insert policy with the statement's, so they disagree only when the writer's own membership is removed while that write runs; after Start M4's leave guard prevents it.
      - Pending (main session): whether the gate raises 42501 instead of returning. That one change would close the residual and the SECURITY DEFINER writer caveat (BT-N1 below); the md5, the structural post-assert, spec §9.4 and the probe expectations would change together.
    - **M6: the setup lock, hidden inserts, lock-first removal and moves after Start (M6x, committed 7f832c5).** Spec §3.4's block now carries the four reviewed replacements of `20260914095500-flight-edits.m6x-pairs.txt` (block md5 6ed62072… → 83dfc8f2…), which probe row L0 accepts.
      - Decision 1: a tasting that has left DRAFT never goes back to DRAFT for a client (`anon` or `authenticated`, or a request whose JWT names one: refinement 24's expression). `tastings_lock_setup_after_start` carries the refusal and now also fires on `status`; its setup lock counts a stamped `started_at` as started (the BT-SQL6 review line). `service_role`, and the owner outside a client request, still can.
      - Decision 2: the tastings that left DRAFT before M3 get `started_at = created_at` once, with `tastings_stamp_lifecycle` disabled for that one statement; the count is asserted (stamped = found, none left). With decision 1 this closes spec §4.4's limit once M6 is live.
      - Decision 3: a client's insert of a revealed glass, or of one past step 0, is refused unless the tasting is OPEN. With it (the M6x review) a client's glass goes to `max(position) + 1` whatever position it sends, and its contributor must be a participant of the glass's own tasting.
      - Decision 4: `remove_flight_glass` checks host-or-adder, takes the flight's row lock, then evaluates `can_remove_flight_glass`; its second renumbering statement flips back only the glasses the first moved below zero.
      - Decision 5: `move_flight_glass` takes the row lock before every check. After Start it refuses a semi-blind flight (Q7) and any move whose moved glass, or any glass between its old and new places (both ends included), is revealed, mid-step or guessed. It refuses a null place and a glass that vanished while it waited, and renumbers only the glasses it locked.
      - M7 and M9a kept in step: only M7's `wines_pin_adder` md5 pin changed (in 7f832c5); the M9a file and its probe needed no change, and M9a's header note that a started semi-blind list stays complete holds once M6 is live.
      - Pending (main session): confirm the inclusive range (a revealed, mid-step or guessed glass "moved" to its own place is refused, probe Y7; skipping the range check when the place is unchanged would allow it), the server-appended position rather than a refusal, and the same-tasting contributor refusal, which cannot be relaxed later because `pin_tasting_participant_identity` never moves a participant row to another tasting.
      - BT-M6: before applying, re-run O1–O4, C1, K7, N8, W1, Y10, Q2, Q8 and Q13 against the then-committed write path. The apply writes `started_at` on three live tastings (42e8c830 and 295dc289 CLOSED, cd6c5ab8 IN_PROGRESS) and takes SHARE ROW EXCLUSIVE on `tastings` and ACCESS EXCLUSIVE on `wines`, so BT-M6 and BT-M7 expect to retry on a `lock_timeout` or a deadlock against live traffic (the M9a probe's chain hit both). The race probe (`20260914095500-flight-edits-race.mjs`) runs on a disposable local cluster.
    - **M8: the client-role scope (BT-SQL8x, committed d3c0dce; refinement 24).** Spec §8.4's SQL now carries it verbatim, and spec §15 and §1.5 carry its deploy gate. P6x (committed 3269919) maps the pin's sentence "this guess is locked in — change it first" in `matchRefusalSentence` to `ctx.lockedIn`, the ladder's locked-in sentence, so BT-S2 shows `LOCKED_EDIT_REFUSAL` (refinement 24's own "Deploy gate" check 3 bullet already states this).
    - **M7 and M9a (BT-SQL7, committed a069e8e; BT-SQL9, committed 43773f9).** Spec §7.4 and §16.1 row 13 now name every reader of `current_wine_id` and `paused_at`; spec §10.4 (b), §16.1 row 19 and the `database.types.ts` comment carry M9a's reviewed candidates rule (from Start every card once nothing is pending; until then only the cards of glasses the caller added).
    - **Hand-offs.**
      - BT-H1: `revealNextCategory`, `revealFull` and `revealWine` map a database error whose message is "The tasting is paused" (P0001 from M7's `wines_refuse_reveal_while_paused`, reached when a pause commits after the action's own check) to `PAUSED_REFUSAL`.
      - BT-N1: a note re-saved after its glass's reveal, or racing it, with a hue that no longer fits the revealed wine is still refused by `wset_notes_check_hue` (the author's own write); BT-N1 re-opens it as a catalog note after the reveal or maps that error to copy, so the edit is never lost silently. An identity-less note written onto an already revealed glass is not refused: it attaches and takes that glass's identity, whatever its context. A note-writing RPC added by BT-N1 or later is SECURITY INVOKER through `save_wset_note`, or checks `can_note_tasting_wine` itself: a SECURITY DEFINER writer acting for a non-member would leave an identity-less note on a revealed glass (M5x2).
      - BT-S1, and every loader of the semi-blind reads: `get_semi_blind_candidates`, `get_semi_blind_board` and `get_semi_blind_revealed_picks` are VOLATILE (they mint keys through `ensure_semi_blind_keys`), so they are called as ordinary POST RPCs, never `rpc(…, { get: true })` and never inside a read-only transaction.
      - BT-R2 and BT-R3: `get_semi_blind_revealed_picks` returns every `guesses` row on a revealed glass with no eligibility filter (a host-provides host's blank row, a contributor's row, non-JOINED rows); the result and record loaders filter them with `eligibleForGlass`.
      - BT-L1 and BT-L2: close probe row Y10. The host's direct `position` writes (deployed `moveWine`) still reorder a started semi-blind flight or a guessed or revealed glass; route every reorder through `move_flight_glass`, retire `moveWine`, then revoke `authenticated` UPDATE (`position`), moving `removeWine`'s DRAFT renumber into `remove_flight_glass`, or refuse a client's position write after Start (spec §16.3).
      - BT-P1 / BT-L1 (`src/lib/flight-glass-rules.ts`): mirror decision 5 (a started semi-blind move; a guessed, seen or unmoved glass in the range) and map M6's new database sentences to UI copy: "a semi-blind flight is fixed once the tasting has started" (the spec's existing refusal copy for a fixed semi-blind flight), "a glass that has been guessed or seen cannot change its number once the tasting has started", "a tasting that has started cannot go back to DRAFT", "a new glass starts hidden, before its first reveal step" and "a glass is brought by someone in its own tasting".
      - BT-S2: serialise one participant's assigns through the save queue, and treat 40P01 and 23505 as a refresh or retry, not a sentence (BT-SQL9 review).
      - BT-Y1: `saveGuessFields` maps `error.code === "42501"` to `LOCKED_EDIT_REFUSAL` on the server; the client sees only the message (BT-SQL8x review).
      - BT-DOC1 adds these CLAUDE.md lines:
        - the lock pin: `guesses_refuse_locked_edit` refuses a change to a locked row's answers or `guessed_wine_id` with 42501 for `anon` and `authenticated`, SECURITY DEFINER functions and FK actions inside their requests included; `service_role` and owner maintenance pass; lock, unlock, the score columns and the FK's SET NULL pass; any new function that writes `guesses` is probed against the pin;
        - `joined_at`: trigger-owned and stamped once (a later flip to JOINED keeps it); after Start no signed-in caller moves a JOINED row out of JOINED or deletes it, except by deleting the tasting;
        - `wines delete adder`: M6 replaces `wines delete host` with `can_delete_flight_glass_row`, and the `wine_answers` insert and update policies (the edit-wine bullet's 20260722090000 policy) with `can_edit_flight_glass`;
        - the setup lock: mode, timing and wine source lock once a tasting has started; a started tasting never returns to DRAFT for a client (`service_role` and the owner can); tastings started before M3 carry `started_at = created_at`; a client's glass is inserted hidden except on OPEN boards, at the end of the flight and from its own tasting; `remove_flight_glass` and `move_flight_glass` lock the flight before they check; after Start `move_flight_glass` moves no semi-blind flight and no range holding a revealed, stepped or guessed glass, and the direct `moveWine` path is not covered yet.
    - Optional, not scheduled: refuse a `reveal_mode` change away from OPEN while a glass is revealed (probe N9; spec §16.3).

### Plan copy (strings the spec does not supply)

| String | Where | Why |
|---|---|---|
| "Hosting could not be handed over." | `handHostingRefusal` fallback (BT-P1) | the spec's test names an unknown message but no sentence |
| "1 private note on this glass goes with it" / "{m} private notes on this glass go with it" | `removalImpactLine` (BT-P1) | the notes-only form of the spec's sentence |
| "{a}, {b} and 1 other …" | `notLockedLine` (BT-P4) | the spec writes "{n} others" |
| "Choose a vintage from the list." | `INVALID_VINTAGE` (BT-P5) | the server refusal of a malformed vintage group |
| "You did not match this glass" | `revealResult` with no pick (BT-P6) | SB4 draws only a hit and a wrong pick |
| "Glass {n} — {title}." | `agreedLeastLine` kind `none` (BT-P7) | nobody with a row picked anything |
| "{name} won with {n} matches" / "… shared first with {n} matches" | `hostedLines` semi-blind (BT-P7) | the spec writes the points form |
| "twice in {n}" / "{k} times in {n}" | `patternSentence` (BT-P7) | the spec writes "once" and "never" |
| "One point for each glass you match · results after everyone has guessed" | `rulesSummary`, self-paced semi-blind (BT-C1) | first letter upper-cased when no flow word leads |
| "Free · 1 pt a match", "1 pt a match · results at once" | `rulesSummaryShort` (BT-C1) | the spec writes only the guided phone line |
| "Couldn't match 1 line" | `couldntMatchHeading(1)` (BT-P8) | the singular of the spec's "Couldn't match {n} lines" |
| "The tasting is not running." | `skipPlan` outside IN_PROGRESS (BT-H1) | the spec names no refusal for a Skip on a tasting that is not running |
| "That glass is no longer the one pouring." | `skipPlan` with a stale glass or one past step 0 (BT-H1) | a second console tab can race the first |
| "A guest who has joined stays in the tasting once it has started." | `tasting_participants_leave_guard` (M4; BT-SQL4x): after Start, the refusal the host gets for moving a guest's JOINED row out of JOINED, and any signed-in caller gets for deleting a JOINED row, the host's own included | the spec words only the guest's own refusal, "you can only leave before the tasting starts" |

26. **The owner go: the blind-tasting screens start before add-wine V2, and M4–M7 and M9a are live (main session, 2026-09-13 evening).** The owner: "You can start with the blind tasting changed. Go go." This binds every task from here on.
    - **The freeze narrows to the add-wine sheet.** Add-wine V1–V3 still run their phone checks against `src/components/add-wine/**` and `src/components/add-wine-context.tsx`, so no BT task edits those paths until AW-V2 closes; a change a task needs there is a stop-and-report item. BT-L3 and BT-R5 own files there and stay deferred until AW-V2. Every other `AW-V2` entry in the Task Index and in the BT-M rows is dropped.
    - **BT-A0 is done.** Results in `.superpowers/blind-tasting/bt-a0-results.json`; its contract corrections are committed in `c8e34ee`.
    - **BT-N1 no longer waits for BT-L3.** That dependency only ordered their edits to `src/components/add-wine/actions.ts`. If tsc flags that file for the nullable `catalog_wine_id`, BT-N1 stops and reports it rather than editing it, and the change lands with BT-L3 after AW-V2. BT-R5 still waits for BT-L3.
    - **Applied live on 2026-09-13 at 19:08 (main session).** In version order, each after its rollback probe passed against live (18:58–19:05; the `095500` probe ran 380 checks with AW-F13 committed and deployed) and a dry run, with a `schema_migrations` read-back after each commit: BT-M4 `20260914093500`, BT-M5 `20260914094500`, BT-M6 `20260914095500`, BT-M7 `20260914100500`, BT-M9a `20260914102500`. BT-M8 (`20260914101500`) still waits for its deploy gate. BT-SQL10 (M9b) and BT-SQL11 (M10) are not written yet. The live tail stays `20260914113500`.

27. **The standings gate survives the view rewrites (main session, 2026-09-13 night).** Upstream commit 1c6e738 ("Do not show a standings board to non-participants") is ported into the split views by 351d20c: `viewerCanSeeStandings({ isHost, viewer })` in `src/app/tastings/[id]/view-route.ts` (the host, or any participant row whatever its status), used by `running-view.tsx` and `finished-view.tsx`, which render the standings board only when it is true and drop the grid to one column otherwise. BT-R1 (the running view), BT-R2 (ClosedSurface) and BT-R3 (RecordView) keep that rule on every board or standings card they render: an outsider never gets a board, not even an empty one. Reviews check it as a binding rule.

---

## Working Rules

1. **Ownership.** You may create, edit or delete only the files in your task's **OWNS** list. You may read anything. If the task needs a change in a file you do not own, stop and report the exact change to the orchestrator. Never make it yourself.

2. **No git writes by agents.**
   - Agents never change the index or history: no `git add`, `commit`, `stash`, `checkout -- …`, `reset`, `fetch` or `pull`.
   - The main session reviews each finished task and commits exactly its OWNS paths on `master`: `git add -- <paths> && git commit -m "feat(blind-tasting): BT-XX — <title>"`, ending the message with the session's attribution line.
   - Files under `.superpowers/` are gitignored and never committed.

3. **Other lanes.**
   - **The add-wine review window.** A task whose OWNS names any file in an add-wine task's OWNS (`.superpowers/add-wine-v2/owns.json`, committed or not) starts only after add-wine V2 is done — after its G1 gates, G2 review, G3 fixes and V1 browser checks — and after BT-A0. Its "Depends on" says so through `BT-A0`, which itself depends on `AW-V2`. The one exemption is `src/lib/supabase/database.types.ts`, where the BT-SQL tasks add or correct entries no add-wine review covers. So no add-wine gate, reviewer or fix group ever meets a blind-tasting change in its files, and no blind-tasting task builds on code a G3 group is about to rewrite.
   - Never start a task while a file in its OWNS belongs to TR-R6 before it commits. Every such wait is written into "Depends on"; the orchestrator checks `git log --format=%s` for the named ids before dispatch.
   - Never resume a parallel workflow with `resumeFromRunId`; relaunch a fresh script from git state (memory note).

4. **Tests first.** For every file in a task's **Tests** block:
   1. Write the tests.
   2. Run `npx vitest run <file>` and watch it fail for the stated reason.
   3. Implement.
   4. Run it again and watch it pass.

5. **tsc.**
   - While AW-S6 is not committed, `npx tsc --noEmit` may report errors in the add-wine compile-debt set only. Check that your task leaves none elsewhere:
     ```bash
     npx tsc --noEmit 2>&1 | grep "error TS" \
       | grep -vE "src/components/add-wine/|src/components/(add-wine-context|taste-launcher-context|tasting-scan-registrar|add-wine-button)\.tsx|src/app/tastings/new/flight-step\.tsx"
     # → must print nothing
     npx tsc --noEmit 2>&1 | grep "error TS" | grep -F -e "<each OWNS path>"
     # → must print nothing
     ```
   - From AW-S6 on, a bare `npx tsc --noEmit` must print nothing.
   - Parallel agents share one tree: an error in a file another running task owns is that task's. Note it and move on.

6. **Deletion rule.**
   - Delete an export only when `rg -n "\b<name>\b" src` shows no importer outside your OWNS.
   - Otherwise keep it, marked `/** @deprecated removed in BT-XX */`. The named task deletes it.
   - Every scheduled deprecation is listed in "Scheduled deprecations" under Parallelism and Sequencing, and in both tasks.

7. **SQL tasks.**
   - Order: dump the live definitions → write the migration → write the probe (the EXPECT table before the first run) → dry-run → run the probe.
   - Report the `DRY-OK` line, the probe's pass/fail table and every assertion you added.
   - A probe mismatch is a failure: fix the migration, or report why the expectation was wrong.

8. **Before reporting done,** run:
   - the task's `npx vitest run …`, or `npm test` if you touched a module other tests import;
   - the tsc check from rule 5;
   - `npx eslint <your OWNS source files> --max-warnings=0`;
   - the task's Acceptance commands.

9. **Report:**
   - files changed (a subset of OWNS);
   - tests added and their pass output;
   - tsc, eslint, dry-run and probe output;
   - every stop-and-report item;
   - the spec §1.4 CLAUDE.md row(s) the task makes true, quoted;
   - every plan-copy string used;
   - the ledger, map, critic and screen ids closed.

10. **Paths with brackets:** quote them in shell commands, for example `"src/app/tastings/[id]/page.tsx"`.

11. **Dev and browser gotchas** (CLAUDE.md):
    - A stale Turbopack 404 renders unstyled: stop the server, `rm -rf .next`, start again.
    - Folders starting with `_` under `src/app` get no route.
    - The browser tool sends "Enter", not "Return".
    - Override `window.confirm` in the tab before an automated click on End tasting.
    - Mint demo sessions with `.superpowers/demo-session.mjs`; never type a password. Switching users re-mints (one cookie jar).
    - A hidden Browser pane never hydrates; keep it visible for interactive checks.

## Task Fields

| Field | What it holds |
|---|---|
| **Depends on** | The tasks that must be committed first (BT, AW and TR ids). A `BT-M…` id means that migration must be **live**. |
| **OWNS** | The exhaustive list of files the task may create, modify or delete. |
| **Does** | Concrete bullets, with spec references. |
| **Interfaces** | Consumes: names from earlier tasks. Produces: names later tasks rely on, with signatures. |
| **Tests** | vitest code written first for pure modules; behavioural probe scenarios for SQL. |
| **Steps** | The ordered checklist. |
| **Acceptance** | Commands and results that prove it is done. |
| **Closes** | Ledger decisions, map and critic ids, handoff screens, spec sections. |

## Task Index

| ID | Title | Depends on |
|---|---|---|
| **Main session: re-verification** | | |
| BT-A0 | Re-verify the add-wine contracts against the landed code | AW-V2 |
| **Pure modules** | | |
| BT-P1 | Flight glass rules and lobby copy | — |
| BT-P2 | Invitation copy and glass eligibility | — |
| BT-P3 | Live theme, safe storage and the pour pointer | — |
| BT-P4 | Console copy and glass facts | — |
| BT-P5 | Guess writes, ladder copy, pick counts | — |
| BT-P6 | Count words, the semi-blind board and copy, guess columns | — |
| BT-P7 | Reveal, result and record copy; record pattern; CSV | BT-P6 |
| BT-P8 | Paste list and place | BT-SQL2 |
| **Migrations (agents: write, dry-run, probe)** | | |
| BT-SQL1 | M1 `in_play_steps_execute_lockdown` | — |
| BT-SQL2 | M2 `tasting_places` | — |
| BT-SQL3 | M3 `tasting_lifecycle_stamps` | BT-SQL2 |
| BT-SQL4 | M4 `join_preview_and_late_join` | BT-SQL3 |
| BT-SQL5 | M5 `hidden_glass_notes` | BT-SQL4 |
| BT-SQL6 | M6 `flight_edits_until_first_step` | BT-SQL5, AW-F13 |
| BT-SQL7 | M7 `tasting_pacing` | BT-SQL6 |
| BT-SQL8 | M8 `guess_lock_pin` | — |
| BT-SQL9 | M9a `semi_blind_rpcs` | BT-SQL7, BT-SQL8 |
| BT-SQL10 | M9b `semi_blind_lockdown` | BT-SQL8, BT-SQL9, BT-N1, BT-S5 |
| BT-SQL11 | M10 `transfer_tasting_host` | BT-SQL10 |
| **Live applies (main session)** | | |
| BT-M1 | Apply M1 | BT-SQL1 |
| BT-M2 | Apply M2 | BT-SQL2, BT-M1 |
| BT-M3 | Apply M3 | BT-SQL3, BT-M2 |
| BT-M4 | Apply M4 | BT-SQL4, BT-M3, AW-V2 |
| BT-M5 | Apply M5 | BT-SQL5, BT-M4 |
| BT-M6 | Apply M6 (after its OPEN rows re-run against AW-F13's committed writes) | BT-SQL6, BT-M5 |
| BT-M7 | Apply M7 | BT-SQL7, BT-M6 |
| BT-M8 | Deploy gate, apply M8 | BT-SQL8, BT-M9a, and a Ready production deployment containing BT-Y1, BT-S2 and BT-S3 (BT-SQL8 "Deploy gate") |
| BT-M9a | Apply M9a | BT-SQL9, BT-M7 |
| BT-M9b | Deploy gate, apply M9b, Realtime check | BT-V3 (push A deployed), BT-SQL10, BT-M9a, BT-M8 |
| BT-M10 | Apply M10 | BT-SQL11, BT-M9b |
| **Dark means live (B5)** | | |
| BT-D1 | Tokens, `LiveShell`, the dark popover, `LocalDateTime` formats | BT-A0 |
| BT-D2 | The running page split into views, inside the live shell | AW-S7, BT-A0, BT-D1, BT-P1, BT-P3 |
| **Create (B1)** | | |
| BT-C1 | Create step 1: name chips, place, rules, Start landing | AW-S6, BT-A0, BT-P8, BT-M2, BT-M6 |
| BT-C2 | Create step 2: drag handles, "Paste a list", contributor rows arriving | AW-S6, AW-F13, BT-A0, BT-P8, BT-L1 |
| BT-C3 | Create step 3: friend rows, context lines, people search | BT-C1, BT-J1 |
| **Joining late (B4)** | | |
| BT-J1 | Invites until CLOSED and the link hint | BT-A0, BT-P1, BT-M4 |
| **Lobby and editing (B2)** | | |
| BT-L1 | Flight glass server rules: reorder, remove, the edit guard | AW-F13, BT-A0, BT-P1, BT-J1, BT-M6 |
| BT-L4 | The Tasting settings sheet (S4d) | BT-C1, BT-C3, BT-L1, BT-P1, BT-P4 |
| BT-L2 | The lobby (S4, S4b) | AW-S7, BT-D2, BT-L1, BT-L4, BT-C2, BT-P1, BT-P8 |
| BT-L3 | Edit a wine: Swap and Remove (S4c) | AW-S3b, AW-S5a, AW-S5b, AW-S5c, AW-F13, BT-A0, BT-L1, BT-P1, BT-M5, BT-M6 (and TR-R6, only if BT-A0 finds the provider must change) |
| **Guests before the start (B3)** | | |
| BT-G1 | The invitation (S5, S5b) | BT-D1, BT-D2, BT-P2, BT-P8, BT-M2, BT-M4 |
| BT-G2 | The joined guest before Start (S6, S6b) | BT-D2, BT-P2, BT-P8, BT-M2, BT-M4 |
| BT-G3 | The share-link preview and invitation at `/j/[code]` | BT-A0, BT-P2, BT-M4 |
| **Host console and pacing (B6)** | | |
| BT-H1 | Pacing on the server and the participant side | BT-A0, BT-P2, BT-P3, BT-P4, BT-M7 |
| BT-H2 | The host console (S7, S7b) | AW-S5c, BT-D1, BT-H1 |
| **Guessing, picker, waiting (B7)** | | |
| BT-Y1 | Per-field-group guess writes and the vintage range | BT-P5, BT-H1, BT-SQL8 |
| BT-Y2 | The picker (S9) | BT-P5, BT-D1, BT-Y1 |
| BT-Y3 | The ladder and the laptop rail (S8, S8b) | BT-Y2 |
| BT-Y4 | Waiting (S10, S10b) | BT-Y3 |
| **A note on a hidden glass (B8)** | | |
| BT-N1 | The hidden-glass note sheet | TR-R6, BT-L3, BT-Q1, BT-SQL9, BT-M5 |
| BT-N2 | "Note this glass" entry points | BT-N1, BT-Y4 |
| **Semi-blind (B9)** | | |
| BT-S1 | The semi-blind list (SB1) and its data module | BT-P6, BT-L2, BT-G2, BT-M9a |
| BT-S2 | Matching server actions | BT-P6, BT-Y1, BT-M9a |
| BT-S3 | The matching board (SB2, SB3) | BT-S1, BT-S2, BT-N2, BT-Y2 |
| BT-S4 | The semi-blind reveal (SB4) and console | BT-S3, BT-H2 |
| BT-S5 | Explicit `guesses` column lists everywhere (the M9b gate) | BT-R3, BT-S4 |
| BT-S6 | `RevealSync` without table-wide `guesses` SELECT (conditional) | BT-M9b |
| **Reveal, result, record (B10)** | | |
| BT-R1 | The reveal view and glass numbering (S11, S11b) | BT-S4, BT-D2, BT-P2, BT-P4, BT-P7 |
| BT-R2 | The result (S12, S12b) | BT-R1, BT-S1, BT-P3, BT-M3 |
| BT-R4 | Export the flight and Save all | BT-R2, BT-M5 |
| BT-R3 | The record and `/results` (S13, S13b) | BT-R4 |
| BT-R5 | One glass and its actions (S13c) | BT-R3, BT-L3, BT-N1, BT-M5, TR-R6 |
| **Hand hosting (B11) and place (B12)** | | |
| BT-K1 | Hand hosting to someone | BT-L4, BT-M10 |
| BT-Q1 | The place on the Overview banner and in the calendar file | BT-A0, BT-P8, BT-M2 |
| **Docs and verification** | | |
| BT-DOC1 | CLAUDE.md: the reversals and the new rules | AW-G4, BT-K1, BT-M9b (and BT-S6 if it ran) |
| BT-V1 | Integration gate A | every BT implementation task except BT-K1, BT-S6 and BT-DOC1; BT-SQL10, BT-SQL11 |
| BT-V2 | Adversarial review | BT-V1 |
| BT-V3 | Review fixes, re-gate, push A | BT-V2 |
| BT-V4 | Gate B and push B | BT-K1, BT-DOC1 (and BT-S6 if it ran) |
| BT-V5 | Browser verification: six evenings (main session) | BT-V4 |

Every task that edits a file in an add-wine OWNS list reaches BT-A0 directly or through a dependency (Working Rule 3).

---

## Parallelism and Sequencing

### Waves

A task starts as soon as everything in its "Depends on" is committed (a `BT-M…` dependency: that migration is live; an `AW-V2` dependency: add-wine's phone verification is done). Add-wine wave C (AW-F12 → F13 → S1 → … → S7, with T12), then G1 → (G2 ∥ G4) → G3 → V1 → V2, run while waves 0–2 run; nothing in those waves edits a file an add-wine task owns, apart from the additive `database.types.ts` entries.

| Wave | Starts when | Tasks that may run at the same time |
|---|---|---|
| 0 | now | BT-P1 · BT-P2 · BT-P3 · BT-P4 · BT-P5 · BT-P6 · BT-SQL1 · BT-SQL2 · BT-SQL8 |
| 1 | BT-SQL2, BT-P6 done | **BT-SQL3 → SQL4 → SQL5** (chain on `database.types.ts`) · BT-P7 · BT-P8 · main session: BT-M1, BT-M2, BT-M3 as each SQL task commits |
| 2 | AW-F13 committed | **BT-SQL6 → SQL7 → SQL9** (the chain continues) |
| 3 | AW-V2 done | **BT-A0** (main session) · main session: BT-M4 → BT-M5 → BT-M6 (its OPEN rows re-run first) → BT-M7 → BT-M9a, in version order (BT-M8 waits for its deploy gate: wave 13 at the latest) |
| 4 | BT-A0 done | BT-D1 · BT-Q1 · BT-J1 (BT-M4 live) · BT-G3 (BT-M4 live) · BT-C1 (BT-M2 and BT-M6 live) · BT-H1 (BT-M7 live) |
| 5 | as their dependencies land | BT-C3 (after BT-C1, BT-J1) · BT-L1 (after BT-J1, BT-M6) → BT-C2 · **BT-H1 → BT-Y1 → BT-Y2 → BT-Y3 → BT-Y4** · BT-H2 (after BT-H1, BT-D1) · BT-D2 (after BT-D1) |
| 6 | BT-C1, BT-C3, BT-L1 done | BT-L4 |
| 7 | BT-D2 done | BT-G1 · BT-G2 · BT-L2 (after BT-L4, BT-C2) |
| 8 | BT-L1, BT-M5, BT-M6 (and TR-R6 if BT-A0 keeps that dependency) | BT-L3 → BT-N1 (after BT-Q1, TR-R6) → BT-N2 (after BT-Y4) |
| 9 | BT-M9a live | BT-S2 (after BT-Y1) · BT-S1 (after BT-L2, BT-G2) → BT-S3 (after BT-S2, BT-N2) → BT-S4 (after BT-H2) |
| 10 | BT-S4 done | **BT-R1 → BT-R2 → BT-R4 → BT-R3 → BT-R5** (BT-R5 also after BT-L3, BT-N1, TR-R6) |
| 11 | BT-R3 done (BT-SQL10 also waits for BT-N1) | BT-S5 → BT-SQL10 → BT-SQL11 |
| 12 | every implementation task above done | BT-V1 → BT-V2 → BT-V3 (push A) |
| 13 | push A's production deployment Ready | BT-M8 (its deploy gate; earlier if a Ready production deployment already contains BT-Y1, BT-S2 and BT-S3) → BT-M9b → (BT-S6 if the Realtime check fails) → BT-M10 → BT-K1 |
| 14 | AW-G4 and BT-K1 committed | BT-DOC1 → BT-V4 (push B) → BT-V5 |

### Two tasks may run together only when all three hold

1. Neither depends on the other, directly or transitively.
2. They are not both in one chain (the SQL chain on `database.types.ts`; H1 → Y1 → Y2 → Y3 → Y4; R1 → R2 → R4 → R3 → R5).
3. Their OWNS lists are disjoint.

Condition 3 holds for every pair except the shared files below, and each of those is already ordered through "Depends on".

### Files more than one task edits (always sequential, in this order)

| File | Editors, in order | Why it is shared |
|---|---|---|
| `src/lib/supabase/database.types.ts` | BT-SQL2 → SQL3 → SQL4 → SQL5 → SQL6 → SQL7 → SQL9 → BT-N1 → BT-SQL10 → BT-SQL11 | hand-written types per migration; BT-N1 corrects `wset_notes` |
| `src/app/globals.css` | T&R's pending `.wset-row` hairline (the R1 follow-up) and BT-D1, never at the same time; whichever lands second rebases on the other | F7 committed the file; the T&R lane left that one line waiting for it |
| `src/app/taste/taste-archive-math.test.ts` | TR-R5 (committed) → BT-C1 | the "live semi-blind host" case flips with `startLandsOnConsole`; the main session updates the R-ledger's R5 row |
| `src/app/overview/next-up-meta.ts` + test | Overview phone redesign (committed) → BT-Q1 | the place joins the phone meta line |
| `src/components/add-wine/by-hand-actions.ts` | AW-F13 → BT-R5 | `loadUnidentifiedWineDraft` (BT-A0: owns.json gives this file to F13 only, not also AW-S5a) |
| `src/app/tastings/new/actions.ts` | AW-S6 → BT-C1 | S6 `listFlight`; C1 setup, place, poured region |
| `src/components/new-tasting-sheet.tsx` | AW-S6 → BT-C1 → BT-C3 | C1 suggestions, footers; C3 friends and summaries |
| `src/app/tastings/new/new-tasting-form.tsx` | BT-C1 → BT-L4 | C1 place row and chips; L4 `mode="settings"` |
| `src/app/tastings/new/invite-step.tsx` | BT-J1 → BT-C3 | J1 the `JoinLinkRow` prop; C3 rows and context |
| `src/app/tastings/new/flight-step.tsx` | AW-S6 → BT-C2 | S6 the matrix; C2 drag and paste |
| `src/app/tastings/[id]/actions.ts` | BT-J1 → BT-L1 → BT-L4 → BT-L2 | J1 `inviteToTasting`; L1 remove/move/leaderboard; L4 deletes `updateSchedule`; L2 deletes `moveWine` |
| `src/app/tastings/[id]/host-controls.tsx` | BT-J1 → BT-L4 → BT-L2 | J1 invites in the running menu; L4 folds the menu into the sheet; L2 deletes `invitesStayOpen` |
| `src/app/tastings/[id]/page.tsx` | AW-S7 → BT-D2 | S7 the Wines card; D2 the router |
| `src/app/tastings/[id]/lobby-view.tsx` | BT-D2 → BT-L2 → BT-S1 | created by the split; lobby; SB1 list |
| `src/app/tastings/[id]/guest-lobby.tsx` | BT-D2 → BT-G2 → BT-S1 | created by the split; guest lobby; SB1 list |
| `src/app/tastings/[id]/invitation-view.tsx` | BT-D2 → BT-G1 | created by the split; S5 |
| `src/app/tastings/[id]/tasting-page-header.tsx`, `wines-card.tsx`, `participants-card.tsx` | BT-D2 → BT-L2 | extracted; restyled |
| `src/app/tastings/[id]/running-view.tsx` | BT-D2 → BT-R1 | extracted; "Glass N" navigator |
| `src/app/tastings/[id]/finished-view.tsx` | BT-D2 → BT-R2 → BT-R3 | extracted; the result; the record as its child |
| `src/app/tastings/[id]/wine-flight-list.tsx` | AW-S7 → BT-L2 | S7 rows and Edit; L2 drag, compact rows |
| `src/app/tastings/[id]/tasting-settings-sheet.tsx` | BT-L4 → BT-K1 | created; the hand-hosting row |
| `src/app/tastings/[id]/wines/new/tasting-wine-writes.ts` | AW-F13 → BT-L1 | F13 amendment 19; L1 the edit guard delegates, and `resolveTastingAdder` refuses a semi-blind add after Start |
| `src/app/tastings/[id]/play/play-experience.tsx` | BT-H1 → BT-Y3 → BT-Y4 → BT-N2 → BT-S3 → BT-S4 → BT-R1 → BT-S5 | the shared running composition |
| `src/app/tastings/[id]/play/actions.ts` | BT-H1 → BT-Y1 → BT-S2 → BT-S3 → BT-S5 | guards moved; `saveGuessFields`; match actions; deletions; column lists |
| `src/app/tastings/[id]/play/guess-ladder.tsx` | BT-Y1 → BT-Y3 → BT-N2 | writes; layout; the note link |
| `src/app/tastings/[id]/play/ladder-types.ts` | BT-Y1 → BT-Y2 → BT-Y3 → BT-S3 | vintage ids; picker props; ladder props; board props |
| `src/app/tastings/[id]/play/locked-in.tsx` | BT-Y4 → BT-N2 | waiting; the note row |
| `src/app/tastings/[id]/host/page.tsx` | BT-H2 → BT-S4 → BT-S5 | console data; semi-blind split; column list |
| `src/app/tastings/[id]/host/console.tsx` | BT-H2 → BT-S4 | console UI; "Reveal glass N" |
| `src/app/tastings/[id]/results/page.tsx` | BT-R3 → BT-S5 | the record; column list |
| `src/app/tastings/[id]/record/record-view.tsx` | BT-R3 → BT-R5 | created; the laptop expansion |
| `src/components/add-wine/types.ts` | AW-S5c → BT-L3 → BT-R5 | `swap`; `preselect` |
| `src/components/add-wine/add-wine-sheet.tsx` | AW-S5b → BT-L3 → BT-R5 | swap header and footer; preselect routing |
| `src/components/add-wine/sheet-state.ts` + test | AW-F12 → AW-S5a → AW-S5b → BT-L3 → BT-R5 | the swap state and actions (add only); the preselect cases |
| `src/components/add-wine/use-sheet-adds.ts` | AW-S5a → BT-L3 | adds routed to the swap |
| `src/components/add-wine/by-hand-form.tsx` | AW-S3b → BT-L3 | the Swap and Remove rows |
| `src/components/add-wine-context.tsx` | AW-S5c → TR-R6 → BT-R5 | the provider (BT-A0: `add-wine-context.tsx:238-242` already forwards `AddWineOpenOptions` whole, so BT-L3 does not own this file — dropped from the chain) |
| `src/components/add-wine/actions.ts` | AW-F13 → BT-L3 → BT-N1 (only where tsc flags the nullable note id) | `swapFlightGlass`; the types fix |
| `src/components/new-note-modal.tsx` | TR-R6 → BT-N1 → BT-R5 | R6 `onSaved`; the hidden-glass target; the unidentified target |
| `src/lib/overview-data.ts` | BT-Q1 → BT-N1 | place; identity-less notes skipped in the ratings read |
| `CLAUDE.md` | AW-G4 → BT-DOC1 | documentation |

### Contract dependencies (no shared file, but an import or prop contract)

| Consumer | Provider | Contract |
|---|---|---|
| AW-F13 (committed a68833b) | BT-H1 | `maybeAutoRevealWine(supabase, wineId)` in `play/auto-reveal.ts` keeps its signature |
| BT-A0 | AW-F12, AW-F13, AW-S5a, AW-S5b, AW-S5c, AW-S6, AW-S7, TR-R6 | every add-wine and Taste & Rate contract named in this table and in the Interfaces blocks, re-verified on the landed code |
| BT-D2 | AW-S7 | the Wines card's content, `SheetFromQuery({ destination, canAddWine, editableWineIds })` and `?editWine=` |
| BT-L1 | AW-F13 | `resolveTastingAdder`, `editRefusal` and the refusal constants, diffed against BT-P1 before delegating |
| BT-L3 | AW-F12 and amendments 20–23 | `ByHandSession["origin"]` `{ kind: "glass"; wineId; incomplete }` (BT-A0: `sheet-state.ts:56`, not `:48`); `confirmQueue`, `parkedByHand`, the landing rule, `reduceSheet`/`replyIsCurrent`, and three seeded model-based tests (`sheet-state.test.ts:593`, `:1168`, `:1847`), not one |
| BT-R5 | AW-S5b | `initialSheetState({ destination, options, canScan, initialLot })` — BT-A0: `initialLot` is `AddSource \| null` (`sheet-state.ts:581-586`), not `{ catalogWineId }`; `canScan` is `boolean \| null` (`null` = resolving) |
| BT-R5 | AW-F13 | `loadCatalogWineDraft` (`add-wine/actions.ts:656`, BT-A0: not `by-hand-actions.ts`) |
| BT-R5 | AW-F12 / AW-S5a | BT-A0: `openByHand` is a `SheetAction` sent through `adds.send` (`use-sheet-adds.ts:142`), not an exported function |
| BT-R5, BT-N1 | BT-SQL5 | `save_wset_note` writes `unidentified_wine_id` and keeps an existing identity |
| BT-Y3 | AW-F12 / AW-S6 | `useMediaQuery` exported from `src/components/add-wine/use-camera.ts` (BT-A0 confirms it survives S6) |
| BT-H1, BT-H2 | BT-P2 | `eligibleForGlass` |
| BT-H2, BT-R1 | BT-P4 | `stepRevealApplies`; `nextChipLabel(inPlayCount: number \| null, revealStep)` |
| TR-R6 (T&R lane) | BT-P3 | `readFlag` / `writeFlag` in `src/lib/safe-storage.ts` for "Don't show this again" (the main session tells the T&R lane before R6) |
| TR-R7 (T&R lane follow-up, R-ledger Sequencing "After blind-tasting B8/B10") | BT-N1, BT-R4 | the archive's rows for hidden-glass notes and minimal notes. R4's row model already titles a nameless note "{tasting} · Glass N" by list order (`glassNumbers`); TR-R7 checks it against the landed notes and owns any change in `src/app/taste/notes/*` |
| BT-C1 | BT-P8 | `normalisePlace`, `setTastingPlace(supabase, tastingId, place)`, `getTastingPlace(supabase, tastingId)` |
| BT-C2 | BT-L1 | `moveFlightGlass(tastingId, wineId, toIndex)` in `src/app/tastings/[id]/flight-actions.ts` |
| BT-C2 | AW-F13 | `searchAddWine`, `addToFlight` in `src/components/add-wine/actions.ts` |
| BT-C3 | BT-C1 | `readySummary({ …, place })`, `friendContextLine(summary)` |
| BT-L4 | BT-C1 | `SetupValues.description`, `SetupValues.place`, status-aware `updateTastingSetup`, `settingsChangeRefusal`, `SETTINGS_LOCKED_AFTER_START` |
| BT-L2 | BT-L4 | `TastingSettingsButton({ tastingId, phone })` |
| BT-L2, BT-G1, BT-G2, BT-R1, BT-R2 | BT-D2 | `routeTastingView`; `TastingPageHeader`, `WinesCard`, `ParticipantsCard`, `InvitationView`, `GuestLobby`, `LobbyView`, `RunningView`, `FinishedView`, each `({ tastingId }: { tastingId: string })` |
| BT-G1, BT-L2, BT-R3, BT-H2 | BT-D1 | `LocalDateTime format?: "default" \| "eyebrow" \| "eyebrow-short" \| "card"`; `LiveShell`, `useLiveTheme` |
| BT-H2 | BT-H1 | `setTastingPaused`, `skipToGlass` (`pacing-actions.ts`); `PausedBand` |
| BT-Y1, BT-S2 | BT-H1 | `resolveGuesser`, `guessableWineError`, `sequentialOrderError` in `play/guesser.ts` |
| BT-Y3 | BT-Y2 | `FieldPickerProps.presentation`, `anchorRef`, `totalCount`, `oftenIds` |
| BT-S3, BT-S4, BT-R2 | BT-S1 | `getSemiBlindCandidates`, `getSemiBlindBoard`, `getSemiBlindRevealedPicks` in `src/lib/semi-blind-data.ts` |
| BT-S3 | BT-S2 | `assignMatch`, `clearMatch` |
| BT-R2, BT-R3 | BT-R1 | `makeGlassLabeler` |
| BT-R3 | BT-R4 | `saveAllToRatings(tastingId)`; `GET /tastings/[id]/export.csv` |
| BT-R5 | BT-L3 | `AddWineOpenOptions` with `swap` |
| BT-N2 | BT-N1 | `NoteTarget`, `NewNoteModal({ target, … })`, `canNoteHiddenGlass` |
| BT-K1 | BT-L4 | the sheet's "Only once a tasting exists" section and `getTastingSettings` |
| BT-SQL10 | BT-S5 | `rg -n "guessed_wine_id" src` hits only `database.types.ts` |
| BT-SQL8 (M8's writer list), BT-M8 (gate check 3) | BT-SQL9 | `assign_semi_blind_match(uuid,text)` and `clear_semi_blind_match(uuid)` keep these signatures and refuse a locked row before they write (BT-SQL9 "With M8") |
| every UI task calling a new RPC | its BT-SQL task | the RPC's `Args` / `Returns` in `database.types.ts` |

### Scheduled deprecations

| Export or file | Marked by | Deleted by |
|---|---|---|
| `moveWine` (`src/app/tastings/[id]/actions.ts`) | BT-L1 | BT-L2 (BT-C2 drops the flight-step importer first) |
| `updateSchedule` (same file) | BT-L1 | BT-L4 |
| `invitesStayOpen` prop (`src/app/tastings/[id]/host-controls.tsx`) | BT-J1 | BT-L2 |
| `getNameSuggestionContext` (`src/app/tastings/new/actions.ts`) | — | BT-C1 (renamed; both callers change in the same task) |
| `submitGuess` (`play/actions.ts`) | — | BT-Y1 (its only importer is the ladder it owns) |
| `OLDEST_YEAR` (`guess-ladder.tsx`) | — | BT-Y1 |
| `submitAllMatchGuesses`, `lockGuesses` (`play/actions.ts`) | BT-S2 | BT-S3 |
| `MATCH_FOOTER` (`play/lock-copy.ts`) | — | BT-S3 |
| `src/app/tastings/[id]/play/match-ladder.tsx` | — | BT-S3 (replaced by `match-board.tsx`) |
| `src/app/tastings/[id]/host-controls-menu.tsx` | — | BT-L2 |
| `getParticipantRows` consumers inside `page.tsx` | — | BT-D2 (moved into the views) |

### Migration ownership (each migration written, dry-run and probed by exactly one task)

| Migration | Version | Written by | Applied live in | Needs live first |
|---|---|---|---|---|
| M1 `in_play_steps_execute_lockdown` | 20260914090500 | BT-SQL1 | BT-M1 | — |
| M2 `tasting_places` | 20260914091500 | BT-SQL2 | BT-M2 | M1 (order) |
| M3 `tasting_lifecycle_stamps` | 20260914092500 | BT-SQL3 | BT-M3 | M2 |
| M4 `join_preview_and_late_join` | 20260914093500 | BT-SQL4 | BT-M4 | M3, and add-wine V2 done |
| M5 `hidden_glass_notes` | 20260914094500 | BT-SQL5 | BT-M5 | M4 |
| M6 `flight_edits_until_first_step` | 20260914095500 | BT-SQL6 | BT-M6 | M5 (the removal count reads hidden notes), and its OPEN rows re-run against AW-F13's committed writes |
| M7 `tasting_pacing` | 20260914100500 | BT-SQL7 | BT-M7 | M6 |
| M8 `guess_lock_pin` | 20260914101500 | BT-SQL8 | BT-M8 | M9a (applied first, so M8's version sits below the live tail; refinement 24), and a Ready production deployment containing BT-Y1, BT-S2 and BT-S3 |
| M9a `semi_blind_rpcs` | 20260914102500 | BT-SQL9 | BT-M9a | M7 (order) |
| M9b `semi_blind_lockdown` | 20260914103500 | BT-SQL10 | BT-M9b | M9a, M8, and push A deployed |
| M10 `transfer_tasting_host` | 20260914104500 | BT-SQL11 | BT-M10 | M9b |

### Deploy and push order

- **During the build:** the main session pushes each green chunk (Global Constraints "Deploy and push"), holding back any commit whose code calls a migration object that is not live yet. BT-M tasks run as soon as their SQL task commits, so this rarely holds anything back.
- **Push A (BT-V3):** everything except BT-K1, BT-S6 and BT-DOC1. It includes the M9b and M10 migration files unapplied; they are inert, because nobody runs `supabase db push` against this database (the upstream stream uses `scripts/scratch-apply.mjs` too).
- **The M8 gate (BT-M8):** only once a production deployment containing BT-Y1, BT-S2 and BT-S3 is Ready (push A's at the latest), and before BT-M9b (BT-SQL8 "Deploy gate").
- **The M9b gate (BT-M9b):** after push A's production deployment is Ready, and only then.
- **Push B (BT-V4):** BT-K1 (after M10 is live), BT-S6 if it ran, BT-DOC1.

---

## Track BT-A — Re-verification (main session)

### BT-A0 — Re-verify the add-wine contracts against the landed code

**Depends on:** AW-V2 (add-wine's G1 gates, G2 review, G3 fixes and V1/V2 browser checks are done)

**OWNS**
- modify `docs/superpowers/plans/2026-09-12-blind-tasting-v3.md` (this plan)
- modify `docs/superpowers/specs/2026-09-12-blind-tasting-v3-design.md` (line anchors only)

**Does** (spec §0.2, §1.5; ledger Sequencing: "a blind-tasting spec and plan are written against the landed add-wine code")
- `git fetch origin`; record `git log -1 --format=%h`; restate the plan's **Base** line, the live migration tail and the fetched `origin/master` tail.
- For every row of "Contract dependencies" whose provider is an AW- or TR- task, and every AW or TR name in a task's Interfaces block, open the committed code and confirm the name, the signature and the behaviour. At least:
  - AW-S7: the Wines card's content, `SheetFromQuery({ destination, canAddWine, editableWineIds })`, `?editWine=`, and how `editableWineIds` is computed (BT-D2, BT-L2);
  - AW-S5c: whether the provider forwards `AddWineOpenOptions` whole — this decides whether BT-L3 keeps `add-wine-context.tsx` and its TR-R6 dependency — plus `NotePick` handling and the registrar's `timingMode` / `status` (BT-D2, BT-L3, BT-R5);
  - AW-S5b: `initialSheetState({ destination, options, canScan, initialLot })` (BT-R5);
  - AW-S5a and AW-F13: `loadCatalogWineDraft`, `loadFlightGlassForEdit`, `openByHand`, `searchAddWine`, `addToFlight`, `saveFlightGlassCore`, `resolveTastingAdder` and the refusal constants in `tasting-wine-writes.ts` (BT-C2, BT-L1, BT-L3, BT-R5);
  - AW-F12 and amendment 20: `ByHandSession["origin"]`, `confirmQueue`, the landing rule and the seeded model-based test (BT-L3);
  - AW-S6: the FlightStep write queue, its captions and waiting rows (BT-C1, BT-C2); `src/components/add-wine/use-camera.ts` still exports `useMediaQuery` (`:34`) — confirmed by BT-A0, no `src/lib/use-media-query.ts` fallback needed (BT-Y3);
  - TR-R6: `NewNoteModal.onSaved`, the hidden-note sentence, and whether it adopted `safe-storage.ts` (BT-N1, BT-R5).
- Re-anchor every `file:line` this plan and the spec cite in an add-wine-owned file.
- Add a dated "BT-A0 amendments" list under Plan refinements (the add-wine plan's amendment pattern) for every contract that changed, and adjust the affected tasks' Does, OWNS and Depends on. The spec changes only in its line anchors; a changed decision goes to the owner report instead.
- Recompute from `.superpowers/add-wine-v2/owns.json` and this plan's OWNS lists which BT tasks edit an add-wine-owned file; each must reach BT-A0 through Depends on (Working Rule 3).

**Acceptance**
- The amendments list exists (possibly "no changes"), and it marks every Contract dependencies row with an AW- or TR- provider as checked.
- `git diff --stat` shows only the two docs.

**Closes:** spec §0.2 (re-anchoring), §1.5 (the review window); ledger Sequencing.

---

## Track BT-SQL — Migrations (agents write, dry-run and probe; the main session applies)

Every task in this track follows Global Constraints "Migrations" and Working Rule 7. Each OWNS list implicitly includes its probe directory entries: `.superpowers/blind-tasting/probes/<version>-live-defs.sql`, `<version>-<name>.mjs`, `.log`, `.out.json` (gitignored, never committed).

---

### BT-SQL1 — M1 `20260914090500_in_play_steps_execute_lockdown`

**Depends on:** —

**OWNS**
- create `supabase/migrations/20260914090500_in_play_steps_execute_lockdown.sql`
- create `.superpowers/blind-tasting/probes/20260914090500-in-play-steps.mjs` (+ `.log`, `.out.json`, live-defs)

**Does** (spec §14.3, §16.2 row 4; ledger "B13.4 outcome", Left open)
- First confirm `rg -n "in_play_steps" src scripts` prints nothing: no app caller.
- Pre-assert:
  - `to_regprocedure('public.in_play_steps(uuid)')` is not null;
  - `has_function_privilege('authenticated', 'public.in_play_steps(uuid)', 'execute')` is true (the state this closes);
  - `get_wine_reveal(uuid)`, `reveal_next_category(uuid,smallint)` and `reveal_own_next_category(uuid,smallint)` are SECURITY DEFINER;
  - trigger `wines_full_reveal_step` exists on `public.wines`.
- Statements:
  ```sql
  revoke execute on function public.in_play_steps(uuid) from public, anon, authenticated;
  -- service_role may have held EXECUTE only through PUBLIC; keep it explicitly.
  grant execute on function public.in_play_steps(uuid) to service_role;
  ```
- Post-assert: no EXECUTE for `authenticated` or `anon`; EXECUTE for `service_role`.
- **`get_wine_reveal`** (spec §14.3). Dump its live definition and recreate it with exactly one edit, the `in_play_count` entry of the returned object:
  ```sql
  'in_play_count', case when v_step = 0 and not coalesce(v_is_revealed, false)
                        then null else coalesce(array_length(v_all, 1), 0) end,
  ```
  Pre-assert the live `md5(prosrc)` equals the dump's; post-assert the md5 of the edited body; the probe prints the diff (that one expression). Grants, SECURITY DEFINER and `search_path` stay.
- **Deployed code:** `reveal-view.tsx:157` returns before it reads `in_play_count` at step 0, and T9's console does not call `get_wine_reveal`. `rg -n "in_play_count" src` must match only `reveal-view.tsx` and `reveal-rows-math.ts`; report anything else.

**Tests — behavioural probe (EXPECT before → after)**

| # | Scenario | Before | After |
|---|---|---|---|
| A1 | JOINED guest `select public.in_play_steps(<hidden glass>)` | OK (returns steps) | permission denied |
| A2 | anon, same call | OK | permission denied |
| A3 | host `reveal_next_category(<glass>, 0)` | OK, step 1 | OK, step 1 |
| A4 | JOINED guest `get_wine_reveal(<glass>)` after A3 | OK | OK |
| A5 | host `reveal_wine(<glass>)` with every eligible guess locked | OK | OK, identical points |
| A6 | host direct `update wines set position = …` (deployed `moveWine`) | OK | OK |
| A7 | host adds a glass (`wines` insert, then `wine_answers` insert) | OK | OK |
| A8 | service_role `select public.in_play_steps(<glass>)` | OK | OK |
| A9 | host direct `update wines set is_revealed = true` (a scoring bypass no app path uses) | OK | refused inside `wines_full_reveal_step` (accepted, spec §14.3; M6 later refuses it outright) |
| A10 | JOINED guest `get_wine_reveal(<glass at step 0>)` | `in_play_count` 5, 6 or 7 | `in_play_count` null |
| A11 | host `get_wine_reveal(<glass at step 0>)` | the count | null |
| A12 | JOINED guest `get_wine_reveal` after A3 (step 1) | the count | the same count |
| A13 | JOINED guest `get_wine_reveal(<revealed glass>)` | the count | the same count |

**Steps**
- [ ] Confirm no app caller; dump the live grants to the live-defs file.
- [ ] Write the migration and the probe (EXPECT first).
- [ ] Dry-run; run the probe.

**Acceptance**
- `node scripts/scratch-apply.mjs --file supabase/migrations/20260914090500_in_play_steps_execute_lockdown.sql --mode dry` → `DRY-OK 20260914090500 in_play_steps_execute_lockdown`.
- Every probe row matches.
- `rg -n "in_play_steps" src` prints nothing; the probe's diff shows only the `in_play_count` expression.

**Closes:** spec §14.3 (both leaks), §15 M1, §16.1 row 12b, §16.2 (`in_play_steps`, `get_wine_reveal` at step 0); ledger B13.4 outcome (Left open: `in_play_steps`).

---

### BT-SQL2 — M2 `20260914091500_tasting_places`

**Depends on:** —

**OWNS**
- create `supabase/migrations/20260914091500_tasting_places.sql`
- modify `src/lib/supabase/database.types.ts`
- create `.superpowers/blind-tasting/probes/20260914091500-tasting-places.mjs` (+ outputs)

**Does** (spec §13.4, B12, Q2)
- The SQL of spec §13.4, verbatim.
- Pre-assert: `public.tasting_places` absent; `public.is_tasting_host(uuid)` SECURITY DEFINER; `public.set_updated_at()` exists.
- Post-assert:
  - RLS enabled on `tasting_places`; exactly four policies (`tasting places read`, `… insert host`, `… update host`, `… delete host`);
  - `has_table_privilege('anon', 'public.tasting_places', 'select')` is false;
  - `is_tasting_member(uuid)` SECURITY DEFINER, `proconfig` contains `search_path=public`, EXECUTE for `authenticated` and not for `anon`;
  - trigger `tasting_places_set_updated_at` exists.
- Types:
  ```ts
  tasting_places: {
    Row: { tasting_id: string; place: string; updated_at: string };
    Insert: { tasting_id: string; place: string; updated_at?: string };
    Update: { tasting_id?: string; place?: string; updated_at?: string };
    Relationships: [];
  };
  // Functions:
  is_tasting_member: { Args: { p_tasting_id: string }; Returns: boolean };
  ```

**Tests — behavioural probe** (spec §13.5; after phase only, the table does not exist before)
- INVITED participant selects the place → 1 row; DECLINED → 0 rows.
- A signed-in stranger on a tasting with a revealed wine (who can read `tastings`) → 0 rows.
- JOINED participant insert / update / delete → refused (RLS).
- Host insert, update (`updated_at` moves), delete → OK.
- Deleting the tasting (service role) removes the row.
- anon select → permission denied.
- `place` of 201 characters, or with leading spaces → check violation.

**Steps**
- [ ] Write the migration, the types and the probe; dry-run; run the probe; `npx tsc --noEmit` (Working Rule 5).

**Acceptance**
- `DRY-OK 20260914091500 tasting_places`.
- Every probe row matches; the tsc check is clean.

**Closes:** spec §13.4, §15 M2; ledger B12; Q2; map CREATE-11 (storage), LOBBY-42 (storage), GUEST-10 (storage), XCUT-50 (storage).

---

### BT-SQL3 — M3 `20260914092500_tasting_lifecycle_stamps`

**Depends on:** BT-SQL2

**OWNS**
- create `supabase/migrations/20260914092500_tasting_lifecycle_stamps.sql`
- modify `src/lib/supabase/database.types.ts` (`tastings.started_at`, `tastings.finished_at`, `wines.revealed_at`: Row `string | null`, Insert and Update `?: string | null`)
- create `.superpowers/blind-tasting/probes/20260914092500-lifecycle-stamps.mjs` (+ outputs)

**Does** (spec §11.4, §5.4)
- The SQL of spec §11.4, verbatim. No backfill.
- Pre-assert the three columns are absent.
- Post-assert: the columns exist and are nullable; triggers `tastings_stamp_lifecycle` and `wines_stamp_revealed_at` enabled; both functions SECURITY INVOKER (`prosecdef = false`) with `search_path=public`.
- `scripts/seed-demo-people.mjs` needs no change: it creates tastings IN_PROGRESS, reveals, then closes (B13 outcome), and the stamps follow.

**Tests — behavioural probe** (spec §11.5)
- DRAFT → IN_PROGRESS stamps `started_at`; a host's direct `update tastings set started_at = '2020-01-01'` leaves it unchanged.
- IN_PROGRESS → CLOSED stamps `finished_at`; CLOSED → IN_PROGRESS (reopen) clears it.
- An insert with `status = 'IN_PROGRESS'` stamps `started_at`.
- `reveal_wine` stamps `wines.revealed_at`; a client-sent `revealed_at` on update is replaced; `is_revealed` back to false clears it.
- `reveal_wine`'s points are identical in the before and after phases.

**Steps**
- [ ] Write, dry-run, probe, tsc check.

**Acceptance:** `DRY-OK 20260914092500 tasting_lifecycle_stamps`; every probe row matches; the tsc check is clean.

**Closes:** spec §11.4, §5.4 (M3 half), §15 M3; ledger B4 (reveal time), B10 (record dates); map RECORD-03, RECORD-09, XCUT-59 (timestamps).

---

### BT-SQL4 — M4 `20260914093500_join_preview_and_late_join`

**Depends on:** BT-SQL3

**OWNS**
- create `supabase/migrations/20260914093500_join_preview_and_late_join.sql`
- modify `src/lib/supabase/database.types.ts`
- create `.superpowers/blind-tasting/probes/20260914093500-join-preview.mjs` (+ outputs, live-defs)

**Does** (spec §4.4, §5.3 item 2, §5.4; B3, B4; Q3, Q6)
- Dump the live `join_tasting_by_code(text)` and `generate_join_code()` definitions. Recreate `join_tasting_by_code` with exactly the one edit of spec §5.4 (remove the `status <> 'DRAFT' and reveal_mode <> 'OPEN'` refusal); its `joined_at` expression stays, because the new trigger owns the value. Recreate `generate_join_code` with only its loop bound changed from 6 to 10.
- Pre-assert `md5(prosrc)` of both live functions equals the md5 of the dumped bodies. Post-assert `md5(prosrc)` equals the md5 of the edited bodies (computed by the task and written into the file). The probe prints a unified diff of each pair: one hunk each.
- Add `host_tastings_count(uuid)`, `get_join_preview(text)` (twelve columns) and the triggers `tasting_participants_leave_guard` and `tasting_participants_stamp_joined_at`, verbatim from spec §4.4. Check the enum type names against live (`select typname from pg_type where typname in ('tasting_status','timing_mode','reveal_mode_type')`) and use the live names.
- Before writing, confirm `rg -n "join_code" src` shows no code-length assumption (read-only check 2026-09-13: none).
- Post-assert:
  - both new functions SECURITY DEFINER with `search_path=public`;
  - `get_join_preview` EXECUTE for exactly `anon` and `authenticated` (plus the owner and `service_role`); `host_tastings_count` for `authenticated` only; `join_tasting_by_code` EXECUTE unchanged (authenticated only);
  - both triggers exist and are enabled: the leave guard `BEFORE UPDATE OF status OR DELETE` (tgtype 27, with its DELETE branch; BT-SQL4x), the joined-at stamp `BEFORE INSERT OR UPDATE`.
- Types (Functions):
  ```ts
  host_tastings_count: { Args: { p_user_id: string }; Returns: number };
  get_join_preview: {
    Args: { p_code: string };
    Returns: {
      name: string; host_name: string | null; host_avatar_url: string | null;
      scheduled_at: string | null; reveal_mode: RevealMode; timing_mode: TimingMode;
      sequential_guessing: boolean; glass_count: number; status: TastingStatus;
      viewer_tasting_id: string | null;
      host_id: string | null;        // signed-in callers only
      joined_names: string[] | null; // signed-in callers only
    }[];
  };
  ```

**Tests — behavioural probe** (spec §4.5, §5.5)
- anon `get_join_preview(<valid code>)` returns exactly the ten columns; an unknown code and an OPEN-mode tasting's code return no row; lower-case and padded codes match.
- `viewer_tasting_id` is null for anon, a signed-in stranger and a DECLINED user, and set for an INVITED user, a JOINED user and the host.
- `host_id` and `joined_names` are null for anon; for a signed-in stranger `joined_names` lists the JOINED display names, host excluded, earliest `joined_at` first.
- `joined_at`: a participant's and the host's `update tasting_participants set joined_at = '2020-01-01'` leave it unchanged; an INVITED insert carrying a client value stores null; INVITED → JOINED stamps `now()`; a later flip back to JOINED keeps it (BT-SQL4x).
- `ensure_join_code` on a codeless tasting returns 6 characters before and 10 after; the existing live code still joins.
- `host_tastings_count` counts IN_PROGRESS and CLOSED hosted tastings, not DRAFT.
- Leave guard: JOINED → DECLINED as that user in DRAFT OK; in IN_PROGRESS refused; the host's own row refused in both. BT-SQL4x: after Start the host moving a guest's JOINED row out of JOINED, and any signed-in delete of a JOINED row, are refused with "A guest who has joined stays in the tasting once it has started.", also after the tasting is set back to DRAFT (its `started_at` stays set); deleting the tasting still cascades; `service_role` passes.
- `join_tasting_by_code` on an IN_PROGRESS tasting: before refused / after OK with `joined_at` ≈ now; CLOSED refused in both; a DECLINED invitee who never joined becomes JOINED stamped `now()`, and a guest who joined, left before Start and rejoins keeps the first `joined_at` (after; BT-SQL4x).
- `respondToInvite`'s update (INVITED → JOINED as the user) still OK; lane N's `tasting_participants_pin_identity` still refuses moving a row.

**Steps**
- [ ] Dump; write; embed both md5s; probe (EXPECT first); dry-run; run; tsc check.

**Acceptance:** `DRY-OK 20260914093500 join_preview_and_late_join`; the probe's diffs show one hunk for each recreated function; every row matches; the tsc check is clean.

**Closes:** spec §4.4, §5.4, §15 M4, §16.3 (enumeration); ledger B3 (share link: reduced preview, signed-in invitation; host record), B4; Q3, Q6; map GUEST-04, GUEST-19 (preview part), GUEST-20, GUEST-34 (leave guard), CREATE-51 (DECLINED rejoin), CREATE-52, XCUT-59.

---

### BT-SQL5 — M5 `20260914094500_hidden_glass_notes`

**Depends on:** BT-SQL4

**OWNS**
- create `supabase/migrations/20260914094500_hidden_glass_notes.sql`
- modify `src/lib/supabase/database.types.ts` (Functions `can_note_tasting_wine`, `is_tasting_wine_revealed`, `wset_hue_fits_colour` only; `wset_notes` row types are BT-N1's)
- create `.superpowers/blind-tasting/probes/20260914094500-hidden-notes.mjs` (+ outputs, live-defs)

**Does** (spec §9.4, B8)
- The SQL of spec §9.4, verbatim.
- `save_wset_note`: dump the live definition and recreate it with exactly the two edits of spec §9.4 (the insert writes `unidentified_wine_id`; the update keeps an existing identity). Pre-assert its live `md5(prosrc)`; post-assert the edited md5; the probe prints the diff. It stays SECURITY INVOKER.
- `resolve_unidentified_wine` (BT-SQL5x): dump the live definition and recreate it with exactly the one edit of spec §9.4, so the notes it re-points keep a hue only when it fits the catalog wine's colour. Pre-assert its live `md5(prosrc)` and attributes; post-assert the edited md5 and the unchanged ACL; the probe prints the diff (one hunk). It stays SECURITY DEFINER.
- The move guard (BT-SQL5 review) and the write resolve (BT-SQL5x) sit inside spec §9.4's block. `wset_notes_glass_move_guard` is SECURITY INVOKER. `wset_notes_glass_resolve_on_write` is SECURITY DEFINER and reads the glass `FOR SHARE`, but only for a caller who may note that glass (M5x2): a client request (JWT role `anon` or `authenticated`) from anyone who is neither the host nor JOINED returns before the lock and copies nothing, so a write RLS refuses never holds up a reveal; service_role and the owner outside a client request still lock and attach. `is_tasting_wine_revealed` is VOLATILE, so the write policies see a reveal that committed while the write waited.
- Before writing: `rg -n "tastingWineId|tasting_wine_id" src` and report every path that writes a note with a `tasting_wine_id`. Each must write an identity-bearing note only for a revealed glass, or an identity-less BLIND note for a hidden one; the M5 policies refuse anything else.
- `wset_hue_fits_colour` keeps `else true` for ORANGE. The live `wset_notes_check_hue` has branches for WHITE, ROSE and RED only (read-only check 2026-09-13); `HUES_BY_COLOUR.ORANGE` in `src/lib/wset/vocab.ts` is a UI list, not the database rule. The probe proves the helper equals the trigger for every pair.
- Pre-assert: the live text of `wset notes read`, `wset notes insert`, `wset notes update`, `wset note aromas read` (`pg_policies.qual` / `with_check`) and `pg_get_constraintdef` of `wset_notes_one_identity` equal the dump. Also zero `wset_notes` rows whose `tasting_wine_id` points at an unrevealed glass, and zero whose author is neither the host nor a JOINED participant of that glass's tasting (read-only checks 2026-09-13: 0 and 0).
- Post-assert: spec §9.4 "Assertions":
  - the new policy texts and the constraint;
  - the two triggers on `wines`, and the four on `wset_notes` (the move guard and the write resolve next to the live two); the write resolve returning for a client who may not note the glass before its `FOR SHARE` (M5x2);
  - `wset_note_aromas.note_id` still `on delete cascade`;
  - both helpers SECURITY DEFINER with `search_path=public` and EXECUTE authenticated-only (`can_note_tasting_wine` STABLE, `is_tasting_wine_revealed` VOLATILE);
  - no client EXECUTE on the four trigger functions; `wset_hue_fits_colour` IMMUTABLE;
  - `save_wset_note` and `resolve_unidentified_wine` carrying exactly their edits.

**Tests — behavioural probe** (spec §9.5, plus hue equivalence)
- A JOINED guesser inserts an identity-less BLIND note on an unrevealed glass → OK; INVITED user and outsider → refused.
- Another participant selects neither the note nor its aromas.
- `reveal_wine` on that glass fills `catalog_wine_id`; a RUBY hue on a WHITE wine becomes null and the reveal succeeds.
- A hidden (identity-less) insert on a revealed glass → before refused / after it takes the glass's identity, with a hue that does not fit cleared; a non-member's → refused. An update that nulls a resolved note's identity → refused.
- Deleting the glass deletes the unresolved note and keeps a resolved one (with `tasting_wine_id` null).
- `catalog_wines.blind_pending` is unchanged by a hidden-note insert.
- `score_own_guess` (ASYNC IMMEDIATE) does not resolve the note; the later global reveal does.
- An identity-bearing note with the `tasting_wine_id` of an unrevealed glass — by its host, by its contributor, by a JOINED guesser — → before OK, after refused.

| # | Minimal notes, identities and membership (spec §9.5, §11.3 item 16) | Before | After |
|---|---|---|---|
| N1 | JOINED participant inserts `{ catalog_wine_id, context_kind: 'BLIND', tasting_wine_id: <revealed glass> }` | OK | OK |
| N2 | the host of that tasting, the same insert | OK | OK |
| N3 | an INVITED user, the same insert | OK | refused |
| N4 | an outsider, the same insert | OK | refused |
| N5 | the JOINED participant, with another tasting's revealed glass | OK | refused |
| N6 | `save_wset_note` insert with `unidentified_wine_id` on a revealed glass whose wine is unidentified | refused (the identity constraint: the column is never written) | OK |
| N7 | a hidden note resolved by `reveal_wine`, then `save_wset_note` with a null `catalog_wine_id` in the payload | refused (the identity constraint) | OK; keeps its catalog id |
| N8 | an author since set DECLINED updates their note on a revealed glass | OK | OK |
| N9 | an OPEN-board note by a JOINED participant on an OPEN glass (inserted revealed) | OK | OK |
- **Equivalence:** for each colour in `WHITE, ROSE, RED, ORANGE` × each of the 12 `ColourHue` values, `wset_hue_fits_colour(h, c)` equals "inserting a note with hue `h` on a catalog wine of colour `c` passes `wset_notes_check_hue`" (one savepoint per pair).

| # | Hardening: moves, hues, the reveal race (BT-SQL5 review; BT-SQL5x) | Before | After |
|---|---|---|---|
| W1–W6 | an outsider, an INVITED and a DECLINED user move their own note onto that tasting's revealed glass, by update or through `save_wset_note` | OK | refused (`wset_notes_glass_move_guard`) |
| W7–W8 | a JOINED participant moves a note to another tasting's revealed glass; an author since set DECLINED re-points theirs | OK | refused (the move guard) |
| W10–W12 | a member moves a note onto their own tasting's glass; the host re-points one; a DECLINED author detaches one | OK | OK |
| W13 | service_role (no signed-in user) moves a note onto a glass | OK | refused (documented) |
| K1–K3 | an identity-less save on a revealed glass (a catalog wine; an unidentified wine; an unidentified wine with no colour) | refused | OK; takes the glass's identity; a hue that does not fit is cleared, and a null colour keeps it |
| K4–K6 | the same by an outsider, an INVITED or a DECLINED user | refused | refused (RLS) |
| K7–K8 | a member moves a hidden note onto a revealed glass (update; `save_wset_note`) | — | OK; takes that glass's identity |
| K10 | service_role, an identity-less insert on a revealed glass | refused | OK; takes the glass's identity |
| K11–K12 | a JOINED guesser and the host write an identity-less note onto a hidden and a revealed glass (M5x2; the glass row's xmax read around the write resolve) | — | OK; the glass locked; the revealed glass's identity copied |
| K13–K16 | the same by an outsider, an INVITED and a DECLINED user (`save_wset_note`), and anon (a direct insert) | — | refused (RLS); no lock, no copy |
| K17 | service_role, a direct insert | — | OK; the glass locked; the revealed glass's identity copied |
| K18 | K13 and K16 on BT-SQL5x's write resolve (git 4c5b9e6) | — | refused, but the glass locked first (why the gate is needed) |
| Y1–Y2 | a hidden note resolved at a reveal onto an unidentified wine (no colour; RED) keeps RUBY; `resolve_unidentified_wine` to a WHITE catalog wine | — | OK; RUBY cleared |
| Y3, Y5, Y8 | a note on an unidentified wine with a hue that does not fit the target (no colour → WHITE; RED with LEMON → RED; a Save-all glass note with RUBY → WHITE), then `resolve_unidentified_wine` | refused (the hue check) | OK; the hue cleared |
| Y4, Y7 | a fitting hue; a caller who is neither creator nor curator | OK, hue kept; refused | the same |
| M1 | a reveal emulated inside a hidden-note save, after its statement snapshot | — | OK; the note attaches |
| M2 | M1 with `is_tasting_wine_revealed` STABLE | — | refused (why it is VOLATILE) |
| M3 | M1 on BT-SQL5's shape (no write resolve, STABLE helper) | — | the note stays identity-less on the revealed glass |
| M4 | M1 without the write resolve | — | refused (why the trigger is needed) |
| D5 | `resolve_unidentified_wine` differs from live only by the hue edit | — | one hunk |

- **Race probe** (`20260914094500-hidden-notes-race.mjs`): two connections with real commits on a disposable local PostgreSQL cluster, because the database cannot hold a committed reveal rollback-only. The migration applies there verbatim, assertions included.
  - RACE1: a save that arrives while the reveal holds the glass waits and attaches.
  - RACE2: a save holding the glass makes the reveal wait and is resolved by it.
  - RACE3: a re-save of a note the reveal's trigger holds succeeds and keeps the identity.
  - RACE4 and RACE4b: an edit that keeps its glass never deadlocks with the reveal. A glass lock on every update does deadlock, and the reveal is the side aborted.
  - RACE5: a move onto a glass under reveal attaches.
  - RACE6: a note on an unidentified wine with no colour keeps RUBY, then `resolve_unidentified_wine` clears it.
  - RACE7: two savers wait together.
  - In the same interleavings, the committed BT-SQL5 file, a STABLE helper and a missing write resolve each leave a stuck note or a refused save.
  - RACE8 (M5x2): an outsider's and anon's refused writes never wait on a reveal that holds the glass.
  - RACE9 (M5x2): a reveal that starts while an outsider's or anon's refused write is running is not held up.
  - RACE10 (M5x2): a member's save in the RACE9 interleaving holds the reveal and is resolved by it.
  - RACE11 (M5x2): service_role's insert racing the reveal waits and attaches.
  - On BT-SQL5x's committed file (git 4c5b9e6), RACE8 and RACE9 wait: the lock that M5x2 removes.

**Steps**
- [ ] Dump; write; probe (EXPECT first); dry-run; run; tsc check.

**Acceptance:**
- `DRY-OK 20260914094500 hidden_glass_notes`, standalone and concatenated after M4 while M4 is not live.
- Every probe row matches, and all 48 pairs are equal.
- The race probe passes on a disposable local cluster: `node .superpowers/blind-tasting/probes/20260914094500-hidden-notes-race.mjs --port <port>`.
- The tsc check is clean.

**Closes:** spec §9.4, §9.5, §11.5 (the minimal-note scenarios), §15 M5, §16.2 (public notes on hidden glasses); ledger B8, B10 (Save all's notes accepted); map PLAY-38 (schema), XCUT-52 (schema), RECORD-13 (policy); BT-SQL5's review issues (moving a note onto a glass; a hue on a note tied to an unidentified wine; a save racing the reveal); the wave-2 review's glass lock taken before RLS refuses a write (M5x2).

---

### BT-SQL6 — M6 `20260914095500_flight_edits_until_first_step`

**Depends on:** BT-SQL5 (the removal count reads identity-less notes; dry-run concatenated with M5 while M5 is not live), AW-F13 (the OPEN add path and `saveFlightGlassCore`, which the probe exercises)

**OWNS**
- create `supabase/migrations/20260914095500_flight_edits_until_first_step.sql`
- modify `src/lib/supabase/database.types.ts`
- create `.superpowers/blind-tasting/probes/20260914095500-flight-edits.mjs` (+ outputs, live-defs)

**Does** (spec §3.4, B2, B0 edit guard; spec §16.2 the host bypass and the mode flip)
- The SQL of spec §3.4, verbatim.
- Before writing: `rg -n -U 'from\("wines"\)\s*\.update' src` must show only `position` writes; nothing may set `is_revealed`, `reveal_step`, `contributor_participant_id` or `tasting_id` from a client (read-only check 2026-09-13: `moveWine` and `removeWine` write `position` only). Report anything else — it would break under the new column privileges.
- Pre-assert:
  - the live text of `wine_answers insert`, `wine_answers update` and `wines delete host` equals the dump; `md5(prosrc)` of `is_wine_adder` equals the dump's;
  - `merge_catalog_wines` and `resolve_unidentified_wine` are SECURITY DEFINER;
  - `has_column_privilege('authenticated','public.wines','reveal_step','update')` is true (the state this closes);
  - zero `wines` rows in PARTICIPANT_CONTRIBUTED tastings with a null contributor (read-only check 2026-09-13: 0), so the backfill classifies no contributor's glass as host-added.
- Post-assert: spec §3.4 "Assertions".
- Types:
  ```ts
  // wines: added_by_host is trigger-owned
  Row: { /* existing */ added_by_host: boolean };
  Insert: { /* existing */ added_by_host?: boolean };
  Update: { /* existing */ added_by_host?: boolean };
  // Functions
  can_edit_flight_glass: { Args: { p_wine_id: string }; Returns: boolean };
  can_remove_flight_glass: { Args: { p_wine_id: string }; Returns: boolean };
  can_delete_flight_glass_row: { Args: { p_wine_id: string }; Returns: boolean };
  move_flight_glass: { Args: { p_wine_id: string; p_to_index: number }; Returns: undefined };
  remove_flight_glass: { Args: { p_wine_id: string }; Returns: undefined };
  set_flight_glass_added_via: { Args: { p_wine_id: string; p_added_via: string }; Returns: undefined };
  glass_removal_impact: { Args: { p_wine_id: string }; Returns: { guesses: number; private_notes: number }[] };
  ```

**Tests — behavioural probe** (spec §3.5, plus deployed-code compatibility; EXPECT before → after)

| # | Scenario | Before | After |
|---|---|---|---|
| E1 | A contributor updates their own step-0 answer in IN_PROGRESS | OK | OK |
| E2 | the same at `reveal_step = 1` | OK | refused |
| E3 | the host updates a contributor's hidden answer key | OK | refused |
| E4 | the host updates their own BLIND glass's key after its reveal | OK | refused |
| H1 | host `update wines set contributor_participant_id = null` on a contributor's glass | OK | permission denied |
| H2 | host `update wines set reveal_step = 7`, then `get_wine_reveal` on that glass | OK, steps readable | permission denied |
| H3 | host `update wines set is_revealed = true` | refused inside the trigger once M1 is live | permission denied |
| H4 | host `update wines set position = …` (deployed `moveWine`) | OK | OK |
| H5 | the host deletes a contributor's participant row (in DRAFT: after Start M4's leave guard refuses the host), then updates that glass's key | OK, then OK | OK, then refused; `added_by_host` still false; `is_wine_adder` false for host and ex-contributor |
| O1 | OPEN: the host inserts a revealed `wines` row, then its `wine_answers` | OK | OK |
| O2 | OPEN: the host updates that key | OK | OK |
| O3 | OPEN: the host deletes that last glass (F10's undo) | OK | OK |
| R1 | the host removes a contributor's glass in DRAFT (direct delete, deployed `removeWine`) | OK | OK |
| R2 | the host removes a glass it added, IN_PROGRESS, through `remove_flight_glass` | — | OK |
| R3 | the host removes a contributor's glass in IN_PROGRESS (direct or RPC) | OK (direct) | refused |
| R4 | a contributor removes glass 2 of 3 in IN_PROGRESS through `remove_flight_glass`, then the host inserts a new glass at `count + 1` | — | OK; positions 1..3, no collision |
| R5 | `remove_flight_glass` when a later glass is revealed, or at `reveal_step = 1` | — | refused |
| R6 | `remove_flight_glass` on a semi-blind glass after Start | — | refused |
| R7 | a contributor's direct delete of their middle glass in IN_PROGRESS | refused (live host-only) | refused |
| R8 | a contributor's direct delete of their last glass | refused | OK |
| M1 | `move_flight_glass` crossing a revealed glass | — | refused; positions unchanged |
| M2 | `move_flight_glass`, a legal move | — | OK; positions contiguous from 1 |
| M3 | `move_flight_glass` by a non-host | — | refused |
| I1 | `glass_removal_impact` for a non-adder | — | no row |
| I2 | `glass_removal_impact` for the adder, with one guess and one hidden note | — | `(1, 1)` |
| S1 | Swap: on an IN_PROGRESS step-0 glass with a JOINED guess, the adder re-points `wine_answers.catalog_wine_id` | OK | OK; the guess row unchanged, `wines.position` unchanged, the old catalog wine's `blind_pending` cleared and the new one's set |
| S2 | `set_flight_glass_added_via` by the contributor on their step-0 glass | — | OK |
| S3 | `set_flight_glass_added_via` by a non-adder, or on a semi-blind glass after Start | — | refused |
| L1 | `update tastings set reveal_mode = 'SEMI_BLIND'` on an IN_PROGRESS tasting | OK | refused |
| L2 | the same in DRAFT | OK | OK |
| C1 | F10's host update of its own complete DRAFT glass (re-run on AW-F13's committed `saveFlightGlassCore`) | OK | OK |
| C2 | a contributor's `wine_answers` insert for their own new glass | OK | OK |
| C3 | a tasting delete cascading its glasses | OK | OK |

**Steps**
- [ ] Confirm the `wines` update callers; dump; write; probe (EXPECT first); dry-run (concatenated if needed); run; tsc check.
- [ ] Record which rows exercised AW-F13's committed code; BT-M6 re-runs O1–O4, C1, K7, N8, W1, Y10, Q2, Q8 and Q13 before the live apply (refinement 25).

**Acceptance:** `DRY-OK 20260914095500 flight_edits_until_first_step`; every row matches; the tsc check is clean.

**Closes:** spec §3.4, §3.5 (probe), §15 M6, §16.2 (the host bypass, the mode flip, row 3's write half); ledger B2 (Edit/Swap/Remove window), B0 (F10/S7 edit guard); map LOBBY-07 (reorder RPC), LOBBY-32, LOBBY-34, CREATE-30 (reorder RPC).

---

### BT-SQL7 — M7 `20260914100500_tasting_pacing`

**Depends on:** BT-SQL6

**OWNS**
- create `supabase/migrations/20260914100500_tasting_pacing.sql`
- modify `src/lib/supabase/database.types.ts` (`tastings.paused_at`)
- create `.superpowers/blind-tasting/probes/20260914100500-pacing.mjs` (+ outputs, live-defs)

**Does** (spec §7.4, B6, Q1)
- The column and the three triggers of spec §7.4, verbatim (the pause trigger clears `paused_at` on any tasting that is not LIVE and IN_PROGRESS).
- Recreate `get_tasting_leaderboard` from its dumped live body, changing only the `t` and `live_round` CTEs as spec §7.4 shows. Pre-assert the live `md5(prosrc)`; post-assert the md5 of the edited body; the probe prints the diff (only those two CTEs).
- Post-assert: the three triggers exist and are enabled; `paused_at` exists and is nullable; the leaderboard's signature, grants and output columns are unchanged.

**Tests — behavioural probe** (spec §7.5)
- While paused: `reveal_next_category` and `reveal_wine` raise "The tasting is paused" and no `guesses` points change; after `paused_at = null` both succeed.
- A pointer to another tasting's wine → refused; to a glass of this tasting → OK.
- Mid-step on two glasses with the pointer on the later one: `last_round_points` follows the pointer's glass (after) vs the lowest-position glass (before).
- Moving the status to CLOSED clears `paused_at`; a `paused_at` written on an ASYNC tasting stays null.
- Two compare-and-set pointer writes with the same expected pointer, one after the other (`update tastings set current_wine_id = <target> where id = <t> and current_wine_id is not distinct from <prev>`) → the first changes one row, the second none (the shape `skipToGlass` uses).
- While paused, a JOINED guest's `guesses` update of their own step-0 row → OK (guesses stay editable).

**Steps**
- [ ] Dump; write; embed md5s; probe; dry-run; run; tsc check.

**Acceptance:** `DRY-OK 20260914100500 tasting_pacing`; the diff shows only `t` and `live_round`; every row matches; the tsc check is clean.

**Closes:** spec §7.4, §15 M7; ledger B6 (Pause, pour pointer); Q1; map HOST-03 (schema), HOST-17 (schema), SB-13 (pointer), HOST-19 (round follows the pointer).

---

### BT-SQL8 — M8 `20260914101500_guess_lock_pin`

**Depends on:** —

**OWNS**
- create `supabase/migrations/20260914101500_guess_lock_pin.sql`
- create `.superpowers/blind-tasting/probes/20260914101500-guess-lock-pin.mjs` (+ outputs)

**Does** (spec §8.4, B7; refinement 24 — BT-SQL8x, main session 2026-09-13)
- The SQL of spec §8.4, including the exemption for `guessed_wine_id` becoming null on a locked row, plus the client-role scope below. No types change.
- **Client roles only.** The trigger returns early unless `current_user` is `anon` or `authenticated`, or the request's JWT role is one of them (`coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')`, the expression `auth.role()` uses). A SECURITY DEFINER function or a foreign-key action runs as the owner inside the request, so the JWT half keeps it bound; a direct client write runs as `authenticated`, whatever its JWT claims. `service_role`, and the owner or a superuser outside any client request, pass.
  - Checked before relying on it (read-only, 2026-09-13): `createAdminClient` has two call sites in `src` (`src/app/tastings/new/actions.ts:175`, `src/app/tastings/[id]/actions.ts:237`), and both only call `admin.auth.admin.inviteUserByEmail`. Every `from("guesses")` write in `src` uses the request's client, so nothing writes a guess with the service role on a user's behalf.
  - What it frees: `scripts/dedupe-producer-orthographic-variants.mjs` (service-role key; `update({ producer_id })` and `update({ appellation_id })` over `guesses`), `scripts/fix-lwin-producer-titles.mjs` (pg as `postgres`; `update guesses set producer_id`), and data migrations through `scripts/scratch-apply.mjs` (as `postgres`). Every answer FK on `guesses` is NO ACTION on delete and on update, so only such maintenance repoints them.
- Pre-assert:
  - `guesses` carries exactly the live non-internal triggers `guesses_block_after_reveal`, `guesses_pin_identity` and `guesses_set_updated_at` (read-only check 2026-09-13);
  - the bodies (md5) of `block_guess_writes_after_reveal`, `pin_guess_identity`, `reveal_wine`, `reveal_next_category`, `score_own_guess` and `reveal_own_next_category` are unchanged.
- Pre-assert the writer list: every function whose body inserts into or updates `guesses` is one of the four live writers, or M9a's `assign_semi_blind_match` / `clear_semi_blind_match`. Any other writer is probed against the pin first.
- Pre-assert the role scope:
  - UPDATE on `guesses` is held only by `anon`/`authenticated`, `service_role` and the owner;
  - no other non-superuser role inherits `anon` or `authenticated`. Live, their only members are `postgres` and `authenticator`, which does not inherit.
- Post-assert those three triggers plus `guesses_refuse_locked_edit`, enabled, with the reviewed body: its md5, plus the role-scope and exemption lines.

**Every writer of `guesses`, and what M8 does to it** (live writers from a read-only `pg_proc` scan, 2026-09-13; there are no rules, no dynamic SQL, and no trigger function writes `guesses`)

| Writer | Who can run it | Assigns on the row | Under M8 | Probe rows |
|---|---|---|---|---|
| `reveal_wine(uuid)` | authenticated, service_role | `*_points`, `total_points`, `scored_at` | passes under the pin (score columns only) | R1, D1b, D2 |
| `reveal_next_category(uuid,smallint)` | authenticated, service_role | `*_points`, `total_points`, `scored_at` (the step lives on `wines`) | passes under the pin | R2, S1b |
| `score_own_guess(uuid)` | authenticated, service_role | `*_points`, `total_points`, `scored_at` | passes under the pin | O1, O2 |
| `reveal_own_next_category(uuid,smallint)` | service_role only; nothing in `src` calls it | `reveal_step`, `*_points`, `total_points`, `scored_at` | passes by role, and passes under the pin because it writes score columns only; a guest's direct call is refused by its EXECUTE grant before any write | RO1, RO2, RO3 |
| M9a `assign_semi_blind_match`, `clear_semi_blind_match` (not live) | authenticated | `guessed_wine_id` | bound, never reached: each reads the caller's row (and the assign the holder) `FOR UPDATE` and refuses a locked one with its own sentence before writing | BT-SQL9 "With M8" (gate check 3) |
| M9b `semi_blind_release_revealed_wine` (not live; runs inside `reveal_wine`) | trigger | `guessed_wine_id` and `locked_at` together | passes (it unlocks) | X4; BT-SQL10 |
| The FK's SET NULL when a picked glass is deleted | the deleting request | `guessed_wine_id` | passes: by role for service_role, or through the exemption inside a client request | D1, D1a, X2 |
| Maintenance scripts and data migrations | service_role, `postgres` | the answer FKs | pass by role | K3, X1s, MS1, MS2 |
| A client role, or the owner inside a client request, changing a locked row's answers | authenticated; a definer function or FK action | answers | refused `42501` | K1, K2, X1, X3, MS3, SP1, P2 |

**Deploy gate (BT-M8)**

The table lists every deployed app path that writes `guesses` today (`master`), what M8 does to each, and the task that changes it. BT-M8 applies only after a Ready production deployment carries every change in the last column.

| Deployed path | On a locked row | Under M8 | Changed by |
|---|---|---|---|
| `submitGuess` (`play/actions.ts`), driven by the guess ladder's autosave pump (`guess-ladder.tsx`: a debounced full-row replace) | rewrites all ten answer columns; checks `scored_at`, never `locked_at` | **refused, and the raw sentence "this guess is locked in — change it first" shows under the ladder**, which reverts to its last saved row. This happens whenever a field differs: a pick made while Lock is in flight (`flushSaves` has already returned); a second tab or device still on the ladder; in ASYNC IMMEDIATE, a save that lands between `lockGuess` and `score_own_guess`. Restating an identical row passes (K4). | **BT-Y1**: `saveGuessFields` reads `locked_at` and refuses with `LOCKED_EDIT_REFUSAL` before writing; Lock awaits every group queue; a 42501 after a successful lock maps to `LOCKED_EDIT_REFUSAL`; `submitGuess` is deleted |
| `submitAllMatchGuesses` (`play/actions.ts`), from `match-ladder.tsx`'s "Lock in all glasses" (then `lockGuesses`) | rewrites `guessed_wine_id` on every listed glass; skips only scored rows | **refused raw, and the batch stops midway**, because it writes glass by glass outside one transaction. This happens whenever a still-locked glass gets a different pick: a "Change it" that did not unlock every glass, a second tab, or a glass added after an earlier lock-all. | **BT-S2** (`assignMatch` / `clearMatch` on M9a's RPCs, which refuse locked rows with their own sentences) and **BT-S3** (the board replaces `match-ladder.tsx`; `submitAllMatchGuesses` and `lockGuesses` are deleted) |
| `lockGuess`, `lockGuesses`, `unlockGuess` | `locked_at` only, or a blank locked insert | passes (K5–K8) | — |
| `scoreLockedGuess` and `lockGuess` (via `score_own_guess`); `revealWine` and `maybeAutoRevealWine` (via `reveal_wine`); the host console (via `reveal_next_category`) | score columns | passes (R1, R2, O1, O2) | — |
| The host deleting a glass (`wines delete host`) or the tasting (`deleteTasting`) | the FK's SET NULL on other glasses' locked picks; cascades | passes (D1a, D2b) | — |
| `createAdminClient` | never writes `guesses` | — | — |

Checks, run by the main session immediately before BT-M8's apply, after the BT-M procedure's fetch and version checks:
1. `git log origin/master --format=%s | grep -E "BT-(Y1|S2|S3) —"` prints three lines.
2. The production deployment of an `origin/master` commit containing all three is Ready (Vercel). On that commit, `git grep -n -E "submitGuess\b|submitAllMatchGuesses|lockGuesses" <sha> -- src` prints nothing.
3. BT-M9a is live, and BT-SQL9's probe log shows every "With M8" row passing, or stop: with this file applied after M9a, `assign_semi_blind_match` and `clear_semi_blind_match` refuse a locked glass with their own sentences and never raise this file's `42501`. If this file changed after BT-SQL9 ran (`git merge-base --is-ancestor "$(git log -1 --format=%H -- supabase/migrations/20260914101500_guess_lock_pin.sql)" <BT-SQL9 sha>` exits non-zero), first re-run that phase on the then-live database with `--m8-phase`.
   - Once BT-S2 and BT-S3 are deployed, no app path inserts a locked semi-blind row: `lockGuess` refuses `chooseFirst(n)` while the glass's board row has no key, and `lockGuesses` is deleted. Both RPCs read the caller's row, and the assign also the holder, `FOR UPDATE` and check `locked_at` before they write. A lock that commits first is refused by that check; a lock that comes second waits for the RPC's commit and then sets `locked_at` alone, which the pin allows. One race stays practically unreachable: while the caller has no row yet the `FOR UPDATE` read locks nothing, so a second tab that inserts and locks that row inside one assign call makes the assign's `insert … on conflict do update` meet the pin, which refuses instead of overwriting a locked pick. `matchRefusalSentence` maps the pin's sentence to the ladder's locked-in sentence (P6x, 3269919; refinement 25), so BT-S2 shows `LOCKED_EDIT_REFUSAL`.
4. The dry run of this file against the then-live database (M4–M7 and M9a applied) prints `DRY-OK`, and this probe passes every row. If M4–M7 broke a fixture, the main session re-expects that row; the lock-pin rows' outcomes never change.
5. Read-only, for the log: `select count(*) from guesses where locked_at is not null and scored_at is null` (the rows the pin will hold until "Change it").

**Tests — behavioural probe** (spec §8.5)
- As a JOINED guest: `insert … on conflict (wine_id, participant_id) do update` of the origin columns creates the row; a later upsert of the grape columns leaves origin intact.
- Updating a locked row's answers as the guest → refused with SQLSTATE `42501`.
- Setting `locked_at` (lock) and clearing it (unlock) → OK.
- An update on a glass at `reveal_step = 1` → refused (live policy, both phases).
- `reveal_wine` scores locked rows with identical points in both phases; `score_own_guess` on a locked ASYNC IMMEDIATE row → OK.
- A service-role delete of an unrevealed semi-blind glass picked by a locked row → OK; the holder keeps every answer and its `locked_at`, with `guessed_wine_id` null.
- A service-role delete of a whole semi-blind tasting whose guesses hold locked matches and a pick on a revealed glass → OK in both phases.
- A locked row's update that nulls `guessed_wine_id` and changes another answer, as the guest → refused.
- BT-SQL8x:
  - K3 and X1s: service_role changing a locked row's answers → OK.
  - MS1 and MS2: the maintenance repoint of `producer_id`, as service_role and as the owner with no JWT → OK.
  - MS3: the same statement as the owner inside a guest's request → refused.
  - SP1: a guest whose JWT claims `service_role` → refused.
  - RO1–RO3: `reveal_own_next_category` (the writer table above).
  - D1a: the glass delete inside the host's request, M6's `remove_flight_glass` shape → OK through the exemption.
  - X4: the pool-release shape inside the host's request → OK.
  - WL1: the writer list. GR1: the UPDATE grantees and inheritors. I0 also reports the JWT role.

**Steps**
- [ ] Write; probe; dry-run; run. BT-SQL8x: live writers, grants and admin-client grep (read-only); rewrite; new rows in EXPECT before their first run; dry-run; run; the two scratch mutants.

**Acceptance**
- `DRY-OK 20260914101500 guess_lock_pin` (M8 alone against live), and every row matches (91/91 on 2026-09-13).
- Two scratch mutants fail exactly the rows that prove each change:
  - without the exemption: D1a and X2, plus the Z1 body check;
  - without the role scope: K3, X1s, MS1 and MS2, plus Z1.

**Closes:** spec §8.4, §15 M8; ledger B7 (locked rows keep their answers); map PLAY-17 (server refusal); refinement 24; the BT-SQL8 review's four low issues (maintenance scripts blocked by a locked row, the delete-order reason for the exemption, the incomplete deploy gate, the unprobed fourth writer); the BT-SQL8x review's gate check 3 (BT-SQL9's "With M8" rows; the pin's sentence mapped by `matchRefusalSentence`, P6x).

---

### BT-SQL9 — M9a `20260914102500_semi_blind_rpcs`

**Depends on:** BT-SQL7, BT-SQL8 (the "With M8" phase applies the committed M8 file, BT-SQL8x's hardening included)

**OWNS**
- create `supabase/migrations/20260914102500_semi_blind_rpcs.sql`
- modify `src/lib/supabase/database.types.ts`
- create `.superpowers/blind-tasting/probes/20260914102500-semi-blind-rpcs.mjs` (+ outputs)

**Does** (spec §10.4 (a), (b), (c); refinement 1; B9)
- Additive only: nothing deployed changes behaviour. `wine_answers read`, the `guesses` grants, the unique index and the pool release are BT-SQL10's.
- (a) `semi_blind_candidate_keys` and `ensure_semi_blind_keys`, verbatim from spec §10.4 (a).
- (b) `can_see_semi_blind_list`, verbatim; and these bodies, which the spec elides:
  ```sql
  create or replace function public.get_semi_blind_candidates(p_tasting_id uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
  declare
    v_cards jsonb;
    v_pending int;
    v_started boolean;
    v_is_host boolean;
    v_pid uuid;
  begin
    if not public.can_see_semi_blind_list(p_tasting_id) then
      return null;
    end if;
    perform public.ensure_semi_blind_keys(p_tasting_id);
    select t.status <> 'DRAFT', t.host_id = auth.uid() into v_started, v_is_host
    from tastings t where t.id = p_tasting_id;
    select id into v_pid from tasting_participants
     where tasting_id = p_tasting_id and user_id = auth.uid() and status = 'JOINED';

    -- Before Start a caller sees only the glasses they added (spec §10.3 item 1).
    with numbered as (
      select w.id, w.is_revealed, w.added_by_host, w.contributor_participant_id,
             row_number() over (order by w.position) as glass
      from wines w where w.tasting_id = p_tasting_id
    ),
    ordered as (
      select n.id, n.is_revealed, n.glass
      from numbered n
      where v_started
         or (n.added_by_host and v_is_host)
         or (v_pid is not null and n.contributor_participant_id = v_pid)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', k.candidate_key,
             'producer', pr.name,
             'wine_name', coalesce(cw.wine_name, u.wine_name),
             'vintage_kind', a.vintage_kind,
             'vintage_year', a.vintage_year,
             'vintage_tawny_years', a.vintage_tawny_years,
             'appellation', ap.name,
             'grape', g.name,
             'revealed_glass', case when o.is_revealed then o.glass end
           ) order by k.candidate_key), '[]'::jsonb)
      into v_cards
    from ordered o
    join semi_blind_candidate_keys k on k.wine_id = o.id
    join wine_answers a on a.wine_id = o.id
    left join producers pr on pr.id = a.producer_id
    left join catalog_wines cw on cw.id = a.catalog_wine_id
    left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id
    left join appellations ap on ap.id = a.appellation_id
    left join grapes g on g.id = a.primary_grape_id;

    select case when v_started or v_is_host then count(*)::int end into v_pending
    from wines w
    where w.tasting_id = p_tasting_id
      and not exists (select 1 from wine_answers a where a.wine_id = w.id);

    return jsonb_build_object('cards', v_cards, 'pending', v_pending);
  end $$;

  create or replace function public.get_semi_blind_board(p_tasting_id uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
  declare
    v_t tastings%rowtype;
    v_pid uuid;
  begin
    if not public.can_see_semi_blind_list(p_tasting_id) then
      return null;
    end if;
    perform public.ensure_semi_blind_keys(p_tasting_id);
    select * into v_t from tastings where id = p_tasting_id;
    select id into v_pid from tasting_participants
     where tasting_id = p_tasting_id and user_id = auth.uid() and status = 'JOINED';

    return jsonb_build_object(
      'mine', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'glass_wine_id', g.wine_id, 'key', k.candidate_key,
                 'locked', g.locked_at is not null, 'scored', g.scored_at is not null,
                 'total_points', g.total_points))
        from guesses g
        join wines w on w.id = g.wine_id and w.tasting_id = p_tasting_id
        left join semi_blind_candidate_keys k on k.wine_id = g.guessed_wine_id
        where v_pid is not null and g.participant_id = v_pid), '[]'::jsonb),
      'revealed', coalesce((
        select jsonb_agg(jsonb_build_object('glass_wine_id', w.id, 'key', k.candidate_key))
        from wines w join semi_blind_candidate_keys k on k.wine_id = w.id
        where w.tasting_id = p_tasting_id and w.is_revealed), '[]'::jsonb),
      'split', coalesce((
        select jsonb_agg(jsonb_build_object('glass_wine_id', s.wine_id, 'key', s.candidate_key, 'count', s.n))
        from (
          select g.wine_id, k.candidate_key, count(*)::int as n
          from guesses g
          join wines w on w.id = g.wine_id and w.tasting_id = p_tasting_id and w.is_revealed
          join tasting_participants p on p.id = g.participant_id and p.status = 'JOINED'
          join semi_blind_candidate_keys k on k.wine_id = g.guessed_wine_id
          where p.id is distinct from w.contributor_participant_id
            and not (v_t.wine_source = 'HOST_PROVIDES' and p.user_id = v_t.host_id)
          group by g.wine_id, k.candidate_key
        ) s), '[]'::jsonb),
      'own_bottles', coalesce((
        select jsonb_agg(k.candidate_key)
        from wines w join semi_blind_candidate_keys k on k.wine_id = w.id
        where v_pid is not null and w.tasting_id = p_tasting_id
          and w.contributor_participant_id = v_pid), '[]'::jsonb),
      'known', coalesce((
        select jsonb_agg(jsonb_build_object('glass_wine_id', w.id, 'key', k.candidate_key))
        from guesses g
        join wines w on w.id = g.wine_id and w.tasting_id = p_tasting_id and not w.is_revealed
        join semi_blind_candidate_keys k on k.wine_id = w.id
        where v_pid is not null and g.participant_id = v_pid
          and public.has_scored_guess(w.id)), '[]'::jsonb)   -- lane N's gate: own scored guess, ASYNC IMMEDIATE, no step reveal in progress
    );
  end $$;

  create or replace function public.get_semi_blind_revealed_picks(p_tasting_id uuid)
  returns table (glass_wine_id uuid, participant_id uuid, correct boolean,
                 pick_key text, pick_label text)
  language plpgsql security definer set search_path = public as $$
  declare
    v_member boolean;
  begin
    if not exists (select 1 from tastings t where t.id = p_tasting_id and t.reveal_mode = 'SEMI_BLIND')
       or not (public.is_tasting_host(p_tasting_id)
               or public.is_tasting_participant(p_tasting_id)
               or public.tasting_has_revealed_wine(p_tasting_id)) then
      return;
    end if;
    perform public.ensure_semi_blind_keys(p_tasting_id);
    v_member := public.can_see_semi_blind_list(p_tasting_id);

    return query
    select g.wine_id, g.participant_id,
           coalesce(g.guessed_wine_id = g.wine_id, false),
           k.candidate_key,
           case when g.guessed_wine_id is not null and (pw.is_revealed or v_member) then
             concat_ws(' ',
               concat_ws(', ', pr.name, coalesce(cw.wine_name, u.wine_name)),
               case a.vintage_kind
                 when 'YEAR' then a.vintage_year::text
                 when 'NV' then 'NV'
                 when 'TAWNY' then coalesce(a.vintage_tawny_years::text || 'yo', 'Tawny')
               end)
           end
    from guesses g
    join wines w on w.id = g.wine_id and w.tasting_id = p_tasting_id and w.is_revealed
    left join wines pw on pw.id = g.guessed_wine_id
    left join semi_blind_candidate_keys k on k.wine_id = g.guessed_wine_id
    left join wine_answers a on a.wine_id = g.guessed_wine_id
    left join producers pr on pr.id = a.producer_id
    left join catalog_wines cw on cw.id = a.catalog_wine_id
    left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id;
  end $$;
  ```
- (c) `assign_semi_blind_match`, verbatim from spec §10.4 (c) (its proven check is `public.has_scored_guess(v_candidate)`), and:
  ```sql
  create or replace function public.clear_semi_blind_match(p_wine_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
  declare
    v_glass wines%rowtype;
    v_tasting tastings%rowtype;
    v_pid uuid;
    v_row guesses%rowtype;
  begin
    select * into v_glass from wines where id = p_wine_id;
    select * into v_tasting from tastings where id = v_glass.tasting_id;
    if v_tasting.reveal_mode is distinct from 'SEMI_BLIND' or v_tasting.status <> 'IN_PROGRESS' then
      raise exception 'matching is closed';
    end if;
    select id into v_pid from tasting_participants
     where tasting_id = v_tasting.id and user_id = auth.uid() and status = 'JOINED';
    if v_pid is null or v_glass.is_revealed or v_glass.reveal_step > 0 then
      raise exception 'you cannot match this glass';
    end if;
    select * into v_row from guesses
     where wine_id = p_wine_id and participant_id = v_pid for update;
    if not found then
      return;
    end if;
    if v_row.locked_at is not null or v_row.scored_at is not null then
      raise exception 'this glass is locked in';
    end if;
    update guesses set guessed_wine_id = null where id = v_row.id;
  end $$;
  ```
- Grants: every new function `revoke all … from public, anon` and `grant execute … to authenticated`, except `ensure_semi_blind_keys` (revoked from `authenticated` too: owner-only).
- Verify the column names against live before writing (`catalog_wines.wine_name`, `catalog_wines_unidentified.wine_name`, `wine_answers.unidentified_wine_id`, `tastings.async_reveal_policy`, and M6's `wines.added_by_host` — concatenate every earlier BT migration that is not live yet, M4–M7 in apply order, into the dry-run).
- Post-assert: RLS enabled on `semi_blind_candidate_keys` with no policies; `has_table_privilege('authenticated', 'public.semi_blind_candidate_keys', 'select')` false; every new function SECURITY DEFINER with `search_path=public`; EXECUTE matrix as above.
- Types (Functions; `semi_blind_candidate_keys` and `ensure_semi_blind_keys` are not typed, clients cannot reach them):
  ```ts
  can_see_semi_blind_list: { Args: { p_tasting_id: string }; Returns: boolean };
  get_semi_blind_candidates: { Args: { p_tasting_id: string }; Returns: Json };
  get_semi_blind_board: { Args: { p_tasting_id: string }; Returns: Json };
  get_semi_blind_revealed_picks: {
    Args: { p_tasting_id: string };
    Returns: { glass_wine_id: string; participant_id: string; correct: boolean; pick_key: string | null; pick_label: string | null }[];
  };
  assign_semi_blind_match: { Args: { p_wine_id: string; p_candidate_key: string }; Returns: Json };
  clear_semi_blind_match: { Args: { p_wine_id: string }; Returns: undefined };
  ```

**Tests — behavioural probe** (spec §10.5, the M9a half; after phase)
- `get_semi_blind_candidates`: JOINED participant and host get cards; INVITED, DECLINED and outsider get null. Before Start a JOINED guest gets no cards and a null `pending`, unchanged across two DRAFT adds; a bring-your-own contributor gets only their own cards; the host-provides host gets every card and `pending`. No card key equals any wine id of the tasting; keys are stable across two calls; `pending` counts a glass without an answer key; cards are not in position order in at least one of three seeded flights (report the orders).
- `get_semi_blind_board`: `mine` has the caller's rows only; `split` is empty until a glass is revealed; `own_bottles` lists a BYO contributor's own keys; `known` lists an ASYNC IMMEDIATE caller's scored glass. After one step reveal on an ASYNC IMMEDIATE semi-blind glass (every guess on it now carries `scored_at`), `known` is empty for every other guesser, and assigning that glass's wine stays allowed.
- `assign_semi_blind_match`: assign; swap (both rows correct right after); refusal "glass locked" with `detail` = the holder's glass id; refusal for a revealed candidate; refusal for the caller's own bottle; refusal for the HOST_PROVIDES host.
- `clear_semi_blind_match`: clears an open row; refuses a locked row.
- `get_semi_blind_revealed_picks`: on a revealed glass a non-member reading the revealed tasting gets `pick_label` null for a picked wine whose own glass is unrevealed, and the label for a revealed one; a JOINED participant gets both labels.
- **Deployed code unchanged:** a direct duplicate `guessed_wine_id` on two glasses (today's batch UI) still succeeds.
- **With M8** (a second after phase; refinement 24, BT-SQL8 "Deploy gate" check 3). M8 is applied live after M9a, so this phase applies `20260914101500_guess_lock_pin.sql` after this file, inside the same rolled-back transaction. As a JOINED guest of a started SEMI_BLIND tasting:
  - assign to the caller's own locked glass → `this glass is locked in`;
  - assign of a candidate whose holder glass is locked → `glass locked`, with `detail` the holder's glass id;
  - clear on the caller's locked row → `this glass is locked in`;
  - none of these three raises SQLSTATE `42501` or M8's sentence `this guess is locked in — change it first`, and the rows are unchanged;
  - assign, swap and clear on unlocked rows → OK, as without M8;
  - lock a matched glass, unlock it ("Change it"), then assign it again → OK.
  - M8's writer pre-assert passes, because its list names `assign_semi_blind_match(uuid,text)` and `clear_semi_blind_match(uuid)`. If this file needs another signature, stop and report it: the M8 file's list then changes in a reviewed edit before BT-M8.
  - `--m8-phase` runs this phase alone, applying M4–M7 (every earlier BT migration, in apply order) and this file only where they are not live yet, so BT-M8's gate can repeat it on the then-live database.

**Steps**
- [ ] Verify column names; write; probe (EXPECT first, the "With M8" rows included); dry-run, alone and with M8 after it; run; tsc check.

**Acceptance**
- `DRY-OK 20260914102500 semi_blind_rpcs`; every row matches, the "With M8" rows included; the tsc check is clean.
- `DRY-OK 20260914101500 guess_lock_pin` for M8 after this file: a scratch concatenation in apply order (M4–M7 in apply order while they are not live, this file, then M8), saved under M8's file name.

**Closes:** spec §10.4 (a)–(c), §15 M9 (first half); refinement 24 (the RPCs under the lock pin; BT-M8's gate check 3); ledger B9 (opaque keys, swap, per-glass clear); map SB-04, SB-17 (server), SB-19 (server), SB-27 (server), SB-31 (data), SB-40 (own bottles), GUEST-36 (list), RESULT-13 (picks data); supporting: RECORD-15.

---

### BT-SQL10 — M9b `20260914103500_semi_blind_lockdown`

**Depends on:** BT-SQL8, BT-SQL9, BT-N1 (types order), BT-S5 (no client reader of `guessed_wine_id` left)

**OWNS**
- create `supabase/migrations/20260914103500_semi_blind_lockdown.sql`
- modify `src/lib/supabase/database.types.ts` (remove `guessed_wine_id` from `guesses` Row, Insert and Update)
- create `.superpowers/blind-tasting/probes/20260914103500-semi-blind-lockdown.mjs` (+ outputs, live-defs)

**Does** (spec §10.4 (d), (e), (f); refinement 1)
- M8 is not live when this task runs: BT-M8 waits for its deploy gate and applies just before BT-M9b (refinement 24). So the dry run concatenates M8 and then this file (any earlier BT migration still not live goes in front, in apply order), and the probe's after phase applies M8 first in the same rolled-back transaction; the pre-assert on `guesses_refuse_locked_edit` and the pool-release row need it.
- First, read-only: count duplicate open holdings in live data.
  ```sql
  select participant_id, guessed_wine_id, count(*)
  from guesses
  where guessed_wine_id is not null and scored_at is null
  group by 1, 2 having count(*) > 1;
  ```
  Any row: stop and report the count; the main session decides the cleanup. The migration pre-asserts zero.
- (d) the unique index, `semi_blind_release_revealed_wine` and `wines_semi_blind_flight_locked`, verbatim.
- (e) the `guesses` column privileges, verbatim (27-column SELECT grant).
- (f) `wine_answers read`, verbatim from spec §10.4 (f): the live text with exactly two edits (no semi-blind participant clause; the host clause carries `w.added_by_host`, M6's pinned flag).
- Pre-assert: the live `wine_answers read` text equals the dump; 093000's INSERT/UPDATE column grants (14 columns) are in place; zero duplicate open holdings; `guesses_refuse_locked_edit` exists (the release must pass it); `wines.added_by_host` exists (M6).
- Post-assert: spec §10.4 "Assertions": the policy (no `SEMI_BLIND`; the host clause has `added_by_host`), SELECT on exactly 27 `guesses` columns and INSERT/UPDATE on exactly 13 for `authenticated`, no client grants on `semi_blind_candidate_keys`, the index, both triggers.
- After the types change a bare `npx tsc --noEmit` prints nothing (BT-S5 removed every reader).

**Tests — behavioural probe** (spec §10.5, the M9b half)
- A JOINED participant's select of an unrevealed semi-blind glass's `wine_answers` → before 1 row / after 0 rows.
- A BYO host's select of a contributor's hidden answer → before 1 / after 0; a HOST_PROVIDES host still reads their own glasses.
- `select guessed_wine_id from guesses` as authenticated → after permission denied; `select <GUESS_READ_COLUMNS> from guesses` → OK.
- A client `update guesses set guessed_wine_id = …` → after permission denied; `assign_semi_blind_match` still works.
- The unique index refuses a direct duplicate (service role).
- `reveal_wine` on glass A clears and unlocks another unrevealed glass holding A's wine, passes `guesses_refuse_locked_edit`, and scores A's rows 1 / 0 exactly as the before phase.
- A BYO host who deleted a contributor's participant row (staged in DRAFT, or as `service_role` after Start: M4's leave guard refuses the host once the tasting has started) reads that glass's `wine_answers` → before 1 row / after 0.
- Inserting a glass into an IN_PROGRESS semi-blind tasting → before OK / after refused; into a DRAFT one → OK in both.
- Deleting a semi-blind tasting whose guesses hold locked matches and a pick on a revealed glass → OK in both phases.

**Steps**
- [ ] Count duplicates (read-only); dump; write; probe (M8 applied first); dry-run (concatenated after M8); run; types; bare tsc.

**Acceptance:** `DRY-OK 20260914103500 semi_blind_lockdown`; every row matches; `npx tsc --noEmit` prints nothing; `rg -n "guessed_wine_id" src --glob '!src/lib/supabase/database.types.ts'` prints nothing.

**Closes:** spec §10.4 (d)–(f), §15 M9 (second half), §16.2 rows 1–3 (read half); ledger B9 (permutation, pool release); map SB-04, SB-17, SB-18, GUEST-36.

---

### BT-SQL11 — M10 `20260914104500_transfer_tasting_host`

**Depends on:** BT-SQL10 (M8 and M9b are not live when this task runs: the dry run concatenates M8, then M9b, then this file, and the probe applies M8 and M9b first in the same transaction)

**OWNS**
- create `supabase/migrations/20260914104500_transfer_tasting_host.sql`
- modify `src/lib/supabase/database.types.ts` (Functions `transfer_tasting_host: { Args: { p_tasting_id: string; p_new_host_user_id: string }; Returns: undefined }`)
- create `.superpowers/blind-tasting/probes/20260914104500-transfer-host.mjs` (+ outputs, live-defs)

**Does** (spec §12.4, B11, Q4)
- The SQL of spec §12.4, verbatim (the host-added refusal keys on M6's `added_by_host`).
- Pre-assert: the `tastings update host` policy text equals the dump; `wine_identity_drafts.owner_id`, `wine_pour_intents.owner_id` and `wines.added_by_host` exist.
- Post-assert: SECURITY DEFINER, `search_path=public`, EXECUTE authenticated-only; the `tastings update host` text unchanged.

**Tests — behavioural probe** (spec §12.5)
- A non-host → refused; IN_PROGRESS → refused; an INVITED target → refused; a host-added glass → refused; a host draft or pour intent → refused.
- Success moves `host_id` and keeps the former host JOINED; the new host can update the tasting, the former host cannot.
- With M8 and M9b in the same transaction: a BYO new host cannot read a contributor's hidden answer key, even after the former host deleted that contributor's participant row (staged in DRAFT, or as `service_role` after Start).
- A bring-your-own tasting whose contributor row was deleted (its glass now has a null contributor and `added_by_host = false`) → not refused as a host-added glass.

**Steps**
- [x] Dump; write; probe; dry-run (concatenated); run; tsc check.

**Acceptance:** `DRY-OK 20260914104500 transfer_tasting_host`; every row matches; the tsc check is clean.

**Closes:** spec §12.4, §15 M10; ledger B11; Q4; map LOBBY-48 (schema), XCUT-56 (schema).

---

## Track BT-M — Live applies (main session only)

**Procedure (every BT-M task)**
- [ ] The SQL task is committed, and its probe log shows every EXPECT row passing.
- [ ] `git fetch origin`, then re-check the version is absent live and upstream (Global Constraints "Versions").
- [ ] BT-M4 onward: the session log records add-wine V2 as done. BT-M6: rows O1–O4, C1, K7, N8, W1, Y10, Q2, Q8 and Q13 of its probe are green on the then-committed write path (AW-F13's code and anything since), and the apply is retried on a `lock_timeout` or a deadlock (refinement 25). BT-M8: every check in BT-SQL8 "Deploy gate" holds.
- [ ] `node scripts/scratch-apply.mjs --file <file> --mode dry` → `DRY-OK`, then `--mode live` → `LIVE-APPLIED <version> <name>`.
- [ ] Run the spot check below with `node --env-file=.env.local --input-type=module` using `pg` and `pgConfig()`, inside `begin read only … rollback`. Append the output to `.superpowers/blind-tasting/probes/live-applies.log`.
- [ ] Stop at the first `FAILED`. Never edit an applied migration.

| Task | File | Spot check (read-only) |
|---|---|---|
| BT-M1 | `20260914090500_in_play_steps_execute_lockdown.sql` | `select has_function_privilege('authenticated','public.in_play_steps(uuid)','execute')` → false; `select pg_get_functiondef('public.get_wine_reveal(uuid)'::regprocedure) like '%when v_step = 0 and not coalesce(v_is_revealed, false)%'` → true |
| BT-M2 | `20260914091500_tasting_places.sql` | `select to_regclass('public.tasting_places') is not null, (select count(*) from pg_policies where tablename = 'tasting_places')` → true, 4 |
| BT-M3 | `20260914092500_tasting_lifecycle_stamps.sql` | `select column_name from information_schema.columns where table_schema='public' and ((table_name='tastings' and column_name in ('started_at','finished_at')) or (table_name='wines' and column_name='revealed_at'))` → 3 rows |
| BT-M4 | `20260914093500_join_preview_and_late_join.sql` | `select has_function_privilege('anon','public.get_join_preview(text)','execute'), has_function_privilege('anon','public.host_tastings_count(uuid)','execute')` → true, false; `select count(*) from pg_trigger where tgname = 'tasting_participants_stamp_joined_at'` → 1 |
| BT-M5 | `20260914094500_hidden_glass_notes.sql` | `select pg_get_constraintdef(oid) from pg_constraint where conname = 'wset_notes_one_identity'` contains `tasting_wine_id IS NOT NULL` |
| BT-M6 | `20260914095500_flight_edits_until_first_step.sql` | `select policyname from pg_policies where tablename = 'wines' and cmd = 'DELETE'` → only `wines delete adder`; `select has_column_privilege('authenticated','public.wines','reveal_step','update'), has_column_privilege('authenticated','public.wines','position','update')` → false, true; `select count(*) from tastings where status <> 'DRAFT' and started_at is null` → 0 |
| BT-M7 | `20260914100500_tasting_pacing.sql` | `select tgname from pg_trigger where tgname in ('tastings_pointer_in_tasting','tastings_pause_follows_status','wines_refuse_reveal_while_paused')` → 3 rows |
| BT-M8 | `20260914101500_guess_lock_pin.sql` | `select tgname from pg_trigger where tgrelid = 'public.guesses'::regclass and not tgisinternal order by 1` → four names; `select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.guesses_refuse_locked_edit()'::regprocedure` → the migration's `c_body_md5` |
| BT-M9a | `20260914102500_semi_blind_rpcs.sql` | `select to_regprocedure('public.assign_semi_blind_match(uuid,text)') is not null, has_table_privilege('authenticated','public.semi_blind_candidate_keys','select')` → true, false |
| BT-M10 | `20260914104500_transfer_tasting_host.sql` | `select prosecdef from pg_proc where proname = 'transfer_tasting_host'` → true |

**Closes:** spec §15 (applied live), in order; supporting: LOBBY-48, XCUT-56.

### BT-M9b — Deploy gate, apply M9b, Realtime check

**Depends on:** BT-V3 (push A pushed), BT-SQL10, BT-M9a, BT-M8

- [ ] **Gate.** All of these hold, or stop:
  1. `origin/master` contains the BT-S5, BT-S2, BT-S3, BT-S4 and BT-H2 commits (`git log origin/master --format=%s | grep -E "BT-(S5|S2|S3|S4|H2) —"`).
  2. The production deployment of push A's commit is Ready (Vercel dashboard).
  3. The duplicate-holdings count (BT-SQL10's query, read-only) is still 0.
  4. BT-M8 is live: `select to_regprocedure('public.guesses_refuse_locked_edit()') is not null` → true (M9b's pre-assert needs it).
- [ ] Apply with the procedure above.
- [ ] Spot check: `select has_column_privilege('authenticated','public.guesses','guessed_wine_id','select')` → false; `select qual from pg_policies where tablename = 'wine_answers' and policyname = 'wine_answers read'` has no `SEMI_BLIND`; `select to_regclass('public.guesses_one_open_glass_per_candidate')` is not null.
- [ ] **Realtime check** (spec §10.4 e). Two demo sessions on a running LIVE tasting (the production site or the integrate dev server against the live database). In tab B keep the play page open with DevTools → Network → WS. In tab A lock a guess.
  - Tab B's `RevealSync` socket receives a `postgres_changes` frame for `guesses` within 10 seconds → done.
  - No `guesses` frame arrives while a reveal still delivers a `wines` frame → run BT-S6.
- [ ] Record the outcome in `live-applies.log` and in the session log.

**Closes:** spec §1.5 deploy order, §10.4 (e) Realtime probe, §15 M9 gate; supporting: PLAY-41.

---

## Track BT-P — Pure modules (wave 0, parallel)

New files only (BT-P8 aside, which needs the M2 types). Relative runtime imports, `import type` for anything under `@/`, no `server-only`. Every module exports exactly the names its test imports, plus the extra constants listed under Interfaces.

---

### BT-P1 — Flight glass rules and lobby copy

**Depends on:** —

**OWNS**
- create `src/lib/flight-glass-rules.ts`, `src/lib/flight-glass-rules.test.ts`
- create `src/lib/lobby-copy.ts`, `src/lib/lobby-copy.test.ts`

**Does** (spec §3.3 items 3, 7, 8, 10–13; §5.3 items 1, 3; §12.3 items 1–2)
- `flight-glass-rules.ts`: who may Edit, Swap, Remove and add a glass, and when (spec §3.3 item 10, §10.3 item 7). The refusal strings are F10's exact wording (`tasting-wine-writes.ts:72-76`); BT-L1 diffs them against AW-F13's committed file before it imports them from here. `reorderIds` and `crossesSeenGlass` mirror `move_flight_glass` for the optimistic list; `dropIndex` turns a drag's pointer position into a 1-based place from the row midpoints.
- `lobby-copy.ts`: lobby, settings-sheet, swap/remove and hand-hosting copy. It builds the eyebrow parts from `./tasting-eyebrow` (`statusWord`, `modeWord`, `timingWord`, `participantsPhrase`); the date is a slot the caller fills with `LocalDateTime`. `participantsSummary.count` follows `participantsPhrase`'s JOINED + INVITED rule, and the test pins the two together.

**Interfaces — produces**
```ts
// src/lib/flight-glass-rules.ts
export type FlightGlassState = {
  tastingStatus: TastingStatus;
  revealMode: RevealMode;
  isRevealed: boolean;
  revealStep: number;
  viewerIsAdder: boolean;   // from is_wine_adder: the host for an added_by_host glass; the contributor for their own
  viewerIsHost: boolean;
  laterGlassSeen: boolean;  // a glass after this one in list order is revealed or has reveal_step > 0
};
export const TASTING_CLOSED = "This tasting is finished — reopen it to add wines.";
export const ALREADY_REVEALED = "This wine has already been revealed.";
export const NOT_ADDER = "Only the person who added this glass can edit it.";
export const GLASS_STEP_STARTED = "This glass's reveal has started — it can't be changed now.";
export const LATER_GLASS_SEEN = "A later glass has already been revealed — this one can't be removed now.";
export const SEMI_BLIND_FLIGHT_FIXED = "A semi-blind flight is fixed once the tasting starts — the list of wines can't change.";
export function glassEditRefusal(s: FlightGlassState): string | null;   // Edit
export function glassSwapRefusal(s: FlightGlassState): string | null;   // Swap
export function glassRemoveRefusal(s: FlightGlassState): string | null; // Remove
export function semiBlindAddRefusal(t: { revealMode: RevealMode; tastingStatus: TastingStatus }): string | null; // adding a glass
export function reorderIds(ids: readonly string[], wineId: string, toIndex: number): string[] | null; // 1-based
export function crossesSeenGlass(before: readonly string[], after: readonly string[], seen: ReadonlySet<string>): boolean;
export function dropIndex(rowRects: readonly { top: number; height: number }[], pointerY: number): number; // 1-based

// src/lib/lobby-copy.ts
export function participantsSummary(rows: readonly { status: ParticipantStatus }[]): { count: number; declined: number; declinedLine: string | null };
export function lobbyEyebrowParts(
  t: { status: TastingStatus; timingMode: TimingMode; revealMode: RevealMode; participants: readonly { status: ParticipantStatus }[] },
  opts: { phone: boolean },
): { before: string[]; after: string[] };                         // the caller renders before · <date> · after
export function winesCaption(count: number, opts: { phone: boolean }): string;
export const START_CAPTION: string;
export const PARTICIPANTS_FOOTER: string;
export function bringsWineLine(firstGlass: number | null): string | null;
export function removalImpactLine(guesses: number, privateNotes: number): string | null;
export function swapCopy(glass: number): { row: string; rowSub: string; header: string; primary: string; remove: string };
export function deleteTastingLabel(state: "idle" | "armed"): string;
export function settingsEyebrow(status: TastingStatus): string;
export const SETTINGS_TITLE = "Tasting settings";
export const SETTINGS_FOOTER_DRAFT: string;
export const SETTINGS_FOOTER_STARTED: string;
export const MODE_STILL_CHANGEABLE: string;
export const ONLY_ONCE_EXISTS = "Only once a tasting exists";
export const MANAGE_INVITATIONS = "Manage invitations";
export const HAND_HOSTING_ROW = "Hand hosting to someone";
export function handHostingCopy(name: string): { title: string; line: string; button: string };
export function handHostingRefusal(message: string): string;
export const INVITES_CLOSE_WHEN_ENDED = "Invites close when the tasting ends.";
export const LINK_WORKS_UNTIL_END = "Works until the tasting ends.";
```

**Tests (write first)** — `src/lib/flight-glass-rules.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  ALREADY_REVEALED,
  GLASS_STEP_STARTED,
  LATER_GLASS_SEEN,
  NOT_ADDER,
  SEMI_BLIND_FLIGHT_FIXED,
  TASTING_CLOSED,
  crossesSeenGlass,
  dropIndex,
  glassEditRefusal,
  glassRemoveRefusal,
  glassSwapRefusal,
  reorderIds,
  semiBlindAddRefusal,
  type FlightGlassState,
} from "./flight-glass-rules";

const base: FlightGlassState = {
  tastingStatus: "DRAFT",
  revealMode: "BLIND",
  isRevealed: false,
  revealStep: 0,
  viewerIsAdder: true,
  viewerIsHost: true,
  laterGlassSeen: false,
};

describe("refusal strings (F10's wording)", () => {
  it("keeps the shipped sentences", () => {
    expect(TASTING_CLOSED).toBe("This tasting is finished — reopen it to add wines.");
    expect(ALREADY_REVEALED).toBe("This wine has already been revealed.");
    expect(NOT_ADDER).toBe("Only the person who added this glass can edit it.");
    expect(GLASS_STEP_STARTED).toBe("This glass's reveal has started — it can't be changed now.");
  });
});

describe("glassEditRefusal — every status × revealed × step × adder × host", () => {
  for (const tastingStatus of ["DRAFT", "IN_PROGRESS", "OPEN", "CLOSED"] as const)
    for (const isRevealed of [false, true])
      for (const revealStep of [0, 2])
        for (const viewerIsAdder of [false, true])
          for (const viewerIsHost of [false, true]) {
            const s: FlightGlassState = { ...base, tastingStatus, isRevealed, revealStep, viewerIsAdder, viewerIsHost };
            const expected =
              tastingStatus === "CLOSED" ? TASTING_CLOSED
              : isRevealed ? ALREADY_REVEALED
              : revealStep > 0 ? GLASS_STEP_STARTED
              : !viewerIsAdder ? NOT_ADDER
              : null;
            it(`${JSON.stringify(s)} → ${expected}`, () => expect(glassEditRefusal(s)).toBe(expected));
          }
});

describe("glassRemoveRefusal", () => {
  it("the host clears any glass while the tasting is a draft", () => {
    expect(glassRemoveRefusal({ ...base, viewerIsAdder: false })).toBeNull();
  });
  it("after Start only the adder, before the first step", () => {
    const running = { ...base, tastingStatus: "IN_PROGRESS" as const };
    expect(glassRemoveRefusal({ ...running, viewerIsAdder: false })).toBe(NOT_ADDER);
    expect(glassRemoveRefusal({ ...running, viewerIsHost: false })).toBeNull();
    expect(glassRemoveRefusal({ ...running, revealStep: 1 })).toBe(GLASS_STEP_STARTED);
  });
  it("never on a finished tasting", () => {
    expect(glassRemoveRefusal({ ...base, tastingStatus: "CLOSED" })).toBe(TASTING_CLOSED);
  });
  it("never while a later glass has been seen (removing would change its number)", () => {
    expect(glassRemoveRefusal({ ...base, tastingStatus: "IN_PROGRESS", laterGlassSeen: true })).toBe(LATER_GLASS_SEEN);
  });
});

describe("a semi-blind flight is fixed at Start (Q7)", () => {
  const semi = { ...base, revealMode: "SEMI_BLIND" as const };
  const running = { ...semi, tastingStatus: "IN_PROGRESS" as const };
  it("Swap, Remove and adding refuse after Start; Edit stays", () => {
    expect(glassSwapRefusal(running)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(glassRemoveRefusal(running)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(semiBlindAddRefusal(running)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(glassEditRefusal(running)).toBeNull();
  });
  it("everything stays open in DRAFT, and blind flights are untouched", () => {
    expect(glassSwapRefusal(semi)).toBeNull();
    expect(glassRemoveRefusal(semi)).toBeNull();
    expect(semiBlindAddRefusal(semi)).toBeNull();
    expect(semiBlindAddRefusal({ ...base, tastingStatus: "IN_PROGRESS" })).toBeNull();
    expect(glassSwapRefusal({ ...base, tastingStatus: "IN_PROGRESS" })).toBeNull();
  });
  it("otherwise Swap follows Edit", () => {
    expect(glassSwapRefusal({ ...base, tastingStatus: "IN_PROGRESS", revealStep: 1 })).toBe(GLASS_STEP_STARTED);
    expect(glassSwapRefusal({ ...base, viewerIsAdder: false })).toBe(NOT_ADDER);
  });
});

describe("reorderIds and crossesSeenGlass (mirror move_flight_glass)", () => {
  it("moves a glass to a 1-based place", () => {
    expect(reorderIds(["a", "b", "c", "d"], "d", 2)).toEqual(["a", "d", "b", "c"]);
    expect(reorderIds(["a", "b", "c"], "a", 3)).toEqual(["b", "c", "a"]);
    expect(reorderIds(["a", "b", "c"], "b", 2)).toEqual(["a", "b", "c"]);
  });
  it("null for an unknown glass or a place outside the flight", () => {
    expect(reorderIds(["a", "b"], "z", 1)).toBeNull();
    expect(reorderIds(["a", "b"], "a", 0)).toBeNull();
    expect(reorderIds(["a", "b"], "a", 3)).toBeNull();
  });
  it("true only when a seen glass would change its number", () => {
    expect(crossesSeenGlass(["a", "b", "c"], ["b", "a", "c"], new Set(["a"]))).toBe(true);
    expect(crossesSeenGlass(["a", "b", "c"], ["a", "c", "b"], new Set(["a"]))).toBe(false);
  });
});

describe("dropIndex (drag handles)", () => {
  const rows = [{ top: 0, height: 40 }, { top: 40, height: 40 }, { top: 80, height: 40 }];
  it("one place per row midpoint above the pointer, within the flight", () => {
    expect(dropIndex(rows, -10)).toBe(1);
    expect(dropIndex(rows, 19)).toBe(1);
    expect(dropIndex(rows, 21)).toBe(2);
    expect(dropIndex(rows, 61)).toBe(3);
    expect(dropIndex(rows, 500)).toBe(3);
    expect(dropIndex([], 10)).toBe(1);
  });
});
```

**Tests (write first)** — `src/lib/lobby-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  HAND_HOSTING_ROW,
  INVITES_CLOSE_WHEN_ENDED,
  LINK_WORKS_UNTIL_END,
  MANAGE_INVITATIONS,
  MODE_STILL_CHANGEABLE,
  ONLY_ONCE_EXISTS,
  PARTICIPANTS_FOOTER,
  SETTINGS_FOOTER_DRAFT,
  SETTINGS_FOOTER_STARTED,
  START_CAPTION,
  bringsWineLine,
  deleteTastingLabel,
  handHostingCopy,
  handHostingRefusal,
  lobbyEyebrowParts,
  participantsSummary,
  removalImpactLine,
  settingsEyebrow,
  swapCopy,
  winesCaption,
} from "./lobby-copy";
import { participantsPhrase } from "./tasting-eyebrow";

const people = (joined: number, invited: number, declined: number) => [
  ...Array.from({ length: joined }, () => ({ status: "JOINED" as const })),
  ...Array.from({ length: invited }, () => ({ status: "INVITED" as const })),
  ...Array.from({ length: declined }, () => ({ status: "DECLINED" as const })),
];

describe("participants (LOBBY-17)", () => {
  it("counts exactly what tasting-eyebrow's participantsPhrase counts", () => {
    for (const rows of [people(5, 2, 2), people(1, 0, 1), people(0, 3, 0)]) {
      const { count } = participantsSummary(rows);
      expect(participantsPhrase(rows)).toBe(`${count} ${count === 1 ? "participant" : "participants"}`);
    }
  });
  it("counts Joined and Invited, collapses Declined", () => {
    expect(participantsSummary(people(5, 2, 2))).toEqual({ count: 7, declined: 2, declinedLine: "2 declined" });
    expect(participantsSummary(people(1, 0, 1)).declinedLine).toBe("1 declined");
    expect(participantsSummary(people(1, 0, 0))).toEqual({ count: 1, declined: 0, declinedLine: null });
  });
});

describe("lobby eyebrow (LOBBY-01, LOBBY-23)", () => {
  const t = { status: "DRAFT", timingMode: "LIVE", revealMode: "BLIND" } as const;
  it("laptop: status · mode · timing, the date slot, participants", () => {
    expect(lobbyEyebrowParts({ ...t, participants: people(5, 2, 1) }, { phone: false }))
      .toEqual({ before: ["Draft", "blind", "live"], after: ["7 participants"] });
  });
  it("phone: status · mode, then the date slot", () => {
    expect(lobbyEyebrowParts({ ...t, participants: people(5, 2, 1) }, { phone: true }))
      .toEqual({ before: ["Draft", "blind"], after: [] });
  });
  it("a running live tasting drops the timing word next to Live", () => {
    expect(lobbyEyebrowParts({ ...t, status: "IN_PROGRESS", participants: people(2, 0, 0) }, { phone: false }).before)
      .toEqual(["Live", "blind"]);
  });
});

describe("removalImpactLine (S4c)", () => {
  it.each([
    [0, 0, null],
    [1, 0, "1 guess on this glass goes with it"],
    [3, 0, "3 guesses on this glass go with it"],
    [3, 2, "3 guesses and 2 private notes on this glass go with it"],
    [1, 1, "1 guess and 1 private note on this glass go with it"],
    [0, 1, "1 private note on this glass goes with it"],
    [0, 2, "2 private notes on this glass go with it"],
  ] as const)("%d guesses, %d notes → %s", (g, n, line) => expect(removalImpactLine(g, n)).toBe(line));
});

describe("lobby lines (S4, S4b)", () => {
  it("captions, Start, footer, brings wine", () => {
    expect(winesCaption(3, { phone: false })).toBe("3 so far · only you can see them");
    expect(winesCaption(3, { phone: true })).toBe("3 so far · hidden");
    expect(START_CAPTION).toBe(
      "Starting opens guessing for everyone. You can keep adding wines after it starts — the flight grows as you pour.",
    );
    expect(PARTICIPANTS_FOOTER).toBe("More invites live in Tasting settings.");
    expect(bringsWineLine(4)).toBe("brings wine 4");
    expect(bringsWineLine(null)).toBeNull();
  });
  it("swap copy", () => {
    expect(swapCopy(3)).toEqual({
      row: "Swap for another bottle",
      rowSub: "Keeps position 3 and any guesses already made",
      header: "Swap glass 3",
      primary: "Swap into glass 3",
      remove: "Remove from the flight",
    });
  });
});

describe("settings sheet copy (S4d)", () => {
  it("eyebrow, footers, delete two-tap", () => {
    expect(settingsEyebrow("DRAFT")).toBe("Host controls · not started yet");
    expect(settingsEyebrow("IN_PROGRESS")).toBe("Host controls · started");
    expect(settingsEyebrow("CLOSED")).toBe("Host controls · started");
    expect(SETTINGS_FOOTER_DRAFT).toBe("Once the first glass is poured, mode and scoring lock. Everything else stays editable.");
    expect(SETTINGS_FOOTER_STARTED).toBe(
      "The tasting has started — mode, timing, rules and who brings the wines are locked. Name, description, photo, time and place stay editable.",
    );
    expect(MODE_STILL_CHANGEABLE).toBe("still changeable — nothing has been poured");
    expect(ONLY_ONCE_EXISTS).toBe("Only once a tasting exists");
    expect(MANAGE_INVITATIONS).toBe("Manage invitations");
    expect(deleteTastingLabel("idle")).toBe("Delete the tasting");
    expect(deleteTastingLabel("armed")).toBe("Tap again to delete it for everyone");
  });
  it("invites and the link stay open until the end (B4)", () => {
    expect(INVITES_CLOSE_WHEN_ENDED).toBe("Invites close when the tasting ends.");
    expect(LINK_WORKS_UNTIL_END).toBe("Works until the tasting ends.");
  });
});

describe("hand hosting (B11)", () => {
  it("copy", () => {
    expect(HAND_HOSTING_ROW).toBe("Hand hosting to someone");
    expect(handHostingCopy("Maja")).toEqual({
      title: "Choose who hosts",
      line: "Maja becomes the host. You stay at the table as a guest.",
      button: "Make Maja host",
    });
  });
  it.each([
    ["only the host can hand hosting over", "Only the host can hand hosting over."],
    ["hosting can only change before the tasting starts", "Hosting can only change before the tasting starts."],
    ["only someone who has joined can host", "Only someone who has joined can host."],
    ["remove the glasses you added first", "Remove the glasses you added first — the new host would inherit their answers."],
    ["finish or remove your unfinished glasses and cellar bottles first", "Finish or remove your unfinished glasses and cellar bottles first."],
    ["permission denied for function transfer_tasting_host", "Hosting could not be handed over."],
  ])("%s", (message, sentence) => expect(handHostingRefusal(message)).toBe(sentence));
});
```

**Steps**
- [ ] Write both test files; run them and watch them fail (modules missing).
- [ ] Implement both modules; run until green; eslint.

**Acceptance**
- `npx vitest run src/lib/flight-glass-rules.test.ts src/lib/lobby-copy.test.ts` is green.
- `rg -n 'from "@/' src/lib/flight-glass-rules.ts src/lib/lobby-copy.ts` shows only `import type` lines.

**Closes:** spec §3.3 items 10, 12 (copy), §3.5 (pure tests), §12.5 (pure test), §2.3 item 6 (`dropIndex`), §10.3 item 7 (the refusal rules); ledger B2 (the edit window, participants), B11 (refusals), B4 (the link hint copy); Q7 (rules); map LOBBY-17, LOBBY-19, LOBBY-20, LOBBY-31 (copy), LOBBY-32 (copy), LOBBY-35 (copy), LOBBY-46 (copy); supporting: LOBBY-01, LOBBY-05, LOBBY-07, LOBBY-14, LOBBY-23.

---

### BT-P2 — Invitation copy and glass eligibility

**Depends on:** —

**OWNS**
- create `src/lib/invitation-copy.ts`, `src/lib/invitation-copy.test.ts`
- create `src/lib/glass-eligibility.ts`, `src/lib/glass-eligibility.test.ts`

**Does** (spec §4.3 items 2–5, §4.5; §5.3 item 4, §5.5)
- `invitation-copy.ts`: every sentence of S5, S5b, S6 and S6b. `SCORING_ROWS` derives from `FIELD_POINTS` (`./guess-ladder-math`), so the numbers have one source (GUEST-13). Never a per-flight maximum (GUEST-12). `modeChip` capitalises `modeWord` from `./tasting-eyebrow`. The signed-in `/j/[code]` invitation reuses these strings (BT-G3).
- `glass-eligibility.ts`: B4's eligibility. A late joiner is eligible for every glass; `joinedAfterReveal` marks glasses revealed before they joined (both stamps needed, so legacy tastings never read "joined after").

**Interfaces — produces**
```ts
// src/lib/invitation-copy.ts
export const SCORING_ROWS: readonly { label: string; points: number }[];
export function hostRecordLine(hostedCount: number, averagePoints: number | null): string;
export function invitedYouLine(host: string): string;                       // "{host} invited you"
export function joinedNamesLine(names: readonly string[]): string | null;
export function modeChip(revealMode: RevealMode): string;                   // "Blind" | "Semi-blind" | ""
export function scoringSentence(revealMode: RevealMode, host: string): string;
export function overviewScoringLine(revealMode: RevealMode): string;
export function invitationCardEyebrow(dayPhrase: string | null): string;    // "Invitation · 2 days away"
export type TonightInput = {
  revealMode: RevealMode; timingMode: TimingMode; sequentialGuessing: boolean;
  leaderboardReveal: WineLeaderboardReveal; asyncRevealPolicy: AsyncRevealPolicy;
  glassCount: number; host: string;
};
export function tonightLines(input: TonightInput): string[];
export function waitingLines(timingMode: TimingMode, host: string): string[];
export function atTheTableLabel(joined: number, invited: number, opts: { phone: boolean }): string;
export function guestEyebrow(t: { host: string; revealMode: RevealMode; guided: boolean }, opts: { phone: boolean }): string;
export const OVERVIEW_EYEBROW = "Overview · what's happening now";
export const INVITATION_TITLE = "Invitation";
export const HOW_IT_IS_SCORED = "How it is scored";
export const BRING_A_GLASS = "Bring a glass. Everything else happens on your phone.";
export const I_AM_IN = "I am in";
export const CANT_MAKE_IT = "Can't make it";
export const SIGN_IN_TO_SAY_YES = "Sign in to say yes";
export const YOU_ARE_IN = "You are in";
export const LEAVE_TASTING = "Leave the tasting";
export const WHILE_YOU_WAIT = "While you wait";
export const WHILE_YOU_WAIT_LAPTOP = "While you wait · both open Learn";
export const ADD_TO_CALENDAR = "Add to your calendar";
export const LEARN_LINKS: readonly { title: string; sub: string; subLaptop: string; href: string }[];

// src/lib/glass-eligibility.ts (spec §5.3 item 4, verbatim)
export type EligibilityParticipant = { id: string; userId: string; status: ParticipantStatus; joinedAt: string | null };
export type EligibilityGlass = { contributorParticipantId: string | null; isRevealed: boolean; revealedAt: string | null };
export function eligibleForGlass(p: EligibilityParticipant, g: EligibilityGlass, t: { wineSource: WineSourceMode; hostId: string }): boolean;
export function joinedAfterReveal(p: EligibilityParticipant, g: EligibilityGlass): boolean;
```

**Tests (write first)** — `src/lib/invitation-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  BRING_A_GLASS,
  LEARN_LINKS,
  OVERVIEW_EYEBROW,
  SCORING_ROWS,
  atTheTableLabel,
  guestEyebrow,
  hostRecordLine,
  invitationCardEyebrow,
  invitedYouLine,
  joinedNamesLine,
  modeChip,
  overviewScoringLine,
  scoringSentence,
  tonightLines,
  waitingLines,
} from "./invitation-copy";

describe("the host and the table (S5, S5b)", () => {
  it("host record", () => {
    expect(hostRecordLine(12, 18.4)).toBe("12 tastings hosted · 18.4 average");
    expect(hostRecordLine(3, 20)).toBe("3 tastings hosted · 20.0 average");
    expect(hostRecordLine(1, null)).toBe("1 tasting hosted");
    expect(invitedYouLine("Christian")).toBe("Christian invited you");
  });
  it.each([
    [[], null],
    [["Gustav"], "Gustav is in"],
    [["Gustav", "Anders"], "Gustav and Anders are in"],
    [["Gustav", "Anders", "Sofie"], "Gustav, Anders and Sofie are in"],
    [["Gustav", "Anders", "Sofie", "Maja", "Ida"], "Gustav, Anders, Sofie and 2 more are in"],
  ] as const)("joined names %j → %s", (names, line) => expect(joinedNamesLine(names)).toBe(line));
  it("chips and eyebrows", () => {
    expect(modeChip("BLIND")).toBe("Blind");
    expect(modeChip("SEMI_BLIND")).toBe("Semi-blind");
    expect(invitationCardEyebrow("2 days away")).toBe("Invitation · 2 days away");
    expect(invitationCardEyebrow(null)).toBe("Invitation");
    expect(OVERVIEW_EYEBROW).toBe("Overview · what's happening now");
  });
});

describe("scoring (GUEST-12, GUEST-13)", () => {
  it("six rows from FIELD_POINTS", () => {
    expect(SCORING_ROWS).toEqual([
      { label: "Country", points: 2 },
      { label: "Region", points: 3 },
      { label: "Appellation", points: 5 },
      { label: "Grape", points: 8 },
      { label: "Producer", points: 6 },
      { label: "Vintage", points: 2 },
    ]);
  });
  it("sentences", () => {
    expect(scoringSentence("BLIND", "Christian")).toBe(
      "Up to 30 points a glass, Danish Championship rules. Christian may pour more — the count is whatever is in the flight tonight.",
    );
    expect(scoringSentence("SEMI_BLIND", "Christian")).toBe(
      "One point for each glass you match. Christian may pour more — the count is whatever is in the flight tonight.",
    );
    expect(overviewScoringLine("BLIND")).toBe("Up to 30 points a glass, Danish Championship rules");
    expect(overviewScoringLine("SEMI_BLIND")).toBe("One point for each glass you match");
    expect(BRING_A_GLASS).toBe("Bring a glass. Everything else happens on your phone.");
  });
});

describe("the joined guest (S6, S6b)", () => {
  const live = {
    revealMode: "BLIND", timingMode: "LIVE", sequentialGuessing: true, leaderboardReveal: "PER_ATTRIBUTE",
    asyncRevealPolicy: "AFTER_ALL", glassCount: 4, host: "Christian",
  } as const;
  it("LIVE guided blind", () => {
    expect(tonightLines(live)).toEqual([
      "4 glasses so far, poured one at a time. Guess six things about each — up to 30 points a glass.",
      "Christian reveals one attribute at a time, so the table finds out together.",
    ]);
    expect(tonightLines({ ...live, leaderboardReveal: "PER_WINE" })[1]).toBe("Christian reveals each glass once it is done.");
    expect(tonightLines({ ...live, glassCount: 0 })[0]).toBe(
      "Glasses are poured one at a time. Guess six things about each — up to 30 points a glass.",
    );
    expect(tonightLines({ ...live, glassCount: 1 })[0]).toBe(
      "1 glass so far, poured one at a time. Guess six things about each — up to 30 points a glass.",
    );
  });
  it("LIVE free order, ASYNC, semi-blind", () => {
    expect(tonightLines({ ...live, sequentialGuessing: false })).toEqual(["Guess the glasses in any order — up to 30 points a glass."]);
    expect(tonightLines({ ...live, timingMode: "ASYNC" })).toEqual([
      "Guess at your own pace — up to 30 points a glass.",
      "Answers show once everyone has guessed.",
    ]);
    expect(tonightLines({ ...live, timingMode: "ASYNC", asyncRevealPolicy: "IMMEDIATE" })[1]).toBe("You see each answer as soon as you submit.");
    expect(tonightLines({ ...live, revealMode: "SEMI_BLIND" })).toEqual([
      "Match each glass to a wine on the list — one point for each glass you match.",
    ]);
  });
  it("waiting, the table, the eyebrow, Learn", () => {
    expect(waitingLines("LIVE", "Christian")).toEqual(["Waiting for Christian to pour", "Glass 1 opens for everyone at the same moment."]);
    expect(waitingLines("ASYNC", "Christian")).toEqual(["Waiting for Christian to pour", "Every glass opens when Christian starts."]);
    expect(atTheTableLabel(5, 2, { phone: false })).toBe("At the table · 5 of 7");
    expect(atTheTableLabel(5, 2, { phone: true })).toBe("At the table · 5 of 7 arrived");
    expect(guestEyebrow({ host: "Christian", revealMode: "BLIND", guided: true }, { phone: false })).toBe("Christian is hosting · blind · guided");
    expect(guestEyebrow({ host: "Christian", revealMode: "BLIND", guided: true }, { phone: true })).toBe("Christian is hosting · blind");
    expect(LEARN_LINKS).toEqual([
      { title: "The map", sub: "Regions and appellations, in Learn", subLaptop: "Regions and appellations", href: "/knowledge/map" },
      { title: "Knowledge", sub: "Grapes, styles and vintages, in Learn", subLaptop: "Grapes, styles, vintages", href: "/knowledge" },
    ]);
  });
});
```

**Tests (write first)** — `src/lib/glass-eligibility.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  eligibleForGlass,
  joinedAfterReveal,
  type EligibilityGlass,
  type EligibilityParticipant,
} from "./glass-eligibility";

const p = (over: Partial<EligibilityParticipant> = {}): EligibilityParticipant => ({
  id: "p1", userId: "u1", status: "JOINED", joinedAt: "2026-09-13T19:30:00Z", ...over,
});
const g = (over: Partial<EligibilityGlass> = {}): EligibilityGlass => ({
  contributorParticipantId: null, isRevealed: false, revealedAt: null, ...over,
});
const hostProvides = { wineSource: "HOST_PROVIDES", hostId: "host" } as const;
const byo = { wineSource: "PARTICIPANT_CONTRIBUTED", hostId: "host" } as const;

describe("eligibleForGlass (B4)", () => {
  it("a JOINED guest is eligible, a late joiner included", () => {
    expect(eligibleForGlass(p(), g(), hostProvides)).toBe(true);
    expect(eligibleForGlass(
      p({ joinedAt: "2026-09-13T21:00:00Z" }),
      g({ isRevealed: true, revealedAt: "2026-09-13T20:00:00Z" }),
      hostProvides,
    )).toBe(true);
  });
  it("never INVITED or DECLINED, never the contributor, never the host-provides host", () => {
    expect(eligibleForGlass(p({ status: "INVITED" }), g(), hostProvides)).toBe(false);
    expect(eligibleForGlass(p({ status: "DECLINED" }), g(), hostProvides)).toBe(false);
    expect(eligibleForGlass(p(), g({ contributorParticipantId: "p1" }), byo)).toBe(false);
    expect(eligibleForGlass(p({ userId: "host" }), g(), hostProvides)).toBe(false);
    expect(eligibleForGlass(p({ userId: "host" }), g({ contributorParticipantId: "p9" }), byo)).toBe(true);
  });
});

describe("joinedAfterReveal", () => {
  const revealed = g({ isRevealed: true, revealedAt: "2026-09-13T20:00:00Z" });
  it("only with both stamps and the join after the reveal", () => {
    expect(joinedAfterReveal(p({ joinedAt: "2026-09-13T21:00:00Z" }), revealed)).toBe(true);
    expect(joinedAfterReveal(p({ joinedAt: "2026-09-13T19:00:00Z" }), revealed)).toBe(false);
    expect(joinedAfterReveal(p({ joinedAt: null }), revealed)).toBe(false);
    expect(joinedAfterReveal(p({ joinedAt: "2026-09-13T21:00:00Z" }), g({ isRevealed: true, revealedAt: null }))).toBe(false);
    expect(joinedAfterReveal(p({ joinedAt: "2026-09-13T21:00:00Z" }), g())).toBe(false);
  });
});
```

**Steps**
- [ ] Write both tests; watch them fail; implement; green; eslint.

**Acceptance:** `npx vitest run src/lib/invitation-copy.test.ts src/lib/glass-eligibility.test.ts` is green.

**Closes:** spec §4.5, §5.5 (pure tests); ledger B3 (copy), B4 (eligibility); map GUEST-05 (line), GUEST-06, GUEST-07, GUEST-11, GUEST-12, GUEST-13, GUEST-14, GUEST-23, GUEST-24, GUEST-25 (copy), GUEST-27, GUEST-29, GUEST-32, GUEST-33; supporting: GUEST-15, XCUT-57, XCUT-59.

---

### BT-P3 — Live theme, safe storage and the pour pointer

**Depends on:** —

**OWNS**
- create `src/lib/safe-storage.ts`, `src/lib/safe-storage.test.ts`
- create `src/lib/live-theme.ts`, `src/lib/live-theme.test.ts`
- create `src/lib/pour-pointer.ts`, `src/lib/pour-pointer.test.ts`

**Does** (spec §6.3 item 3, §6.5; §7.3 item 3, §7.5; refinement 6)
- `safe-storage.ts`: the one try/catch wrapper over `localStorage`-like storage (`readFlag`, `writeFlag`). A throwing or missing storage reads as false, and a failed write returns false. TR-R6's "Don't show this again" uses it too (Contract dependencies).
- `live-theme.ts`: which surface a viewer gets, and the per-viewer dismissal flag through `safe-storage.ts`; a throwing or missing storage reads as "not dismissed" and writes return false (the caller then keeps the flag in component state for the visit).
- `pour-pointer.ts`: the pointer rules of spec §7.3 item 3, verbatim, plus `guessOrderAllows`, the one place pacing decides whether a guess or match on a glass is in order (BLIND guided: only the current glass; SEMI_BLIND guided: any glass up to `pouredThrough`; free order and self-paced: any glass).

**Interfaces — produces**
```ts
// src/lib/safe-storage.ts
export type StorageLike = Pick<Storage, "getItem" | "setItem">;
export function readFlag(getStorage: () => StorageLike | null, key: string): boolean;
export function writeFlag(getStorage: () => StorageLike | null, key: string): boolean;

// src/lib/live-theme.ts (StorageLike: import type from ./safe-storage)
export type LiveSurface = "lobby" | "live" | "result" | "record";   // "lobby" = parchment, no shell
export function liveSurface(input: { status: TastingStatus; dismissed: boolean }): LiveSurface;
export function resultDismissKey(tastingId: string): string;
export function readDismissed(getStorage: () => StorageLike | null, tastingId: string): boolean;
export function writeDismissed(getStorage: () => StorageLike | null, tastingId: string): boolean;

// src/lib/pour-pointer.ts
export type PointerGlass = { id: string; isRevealed: boolean; revealStep: number };
export function currentGlass(glasses: readonly PointerGlass[], pointerWineId: string | null): { id: string; index: number; wrapped: boolean } | null;
export function skipTarget(glasses: readonly PointerGlass[], current: { index: number }): { id: string; index: number } | null;
export function pouredThrough(glasses: readonly PointerGlass[], pointerWineId: string | null): number;
export function guessOrderAllows(input: {
  revealMode: RevealMode; timingMode: TimingMode; sequentialGuessing: boolean;
  glasses: readonly PointerGlass[]; pointerWineId: string | null; wineId: string;
}): boolean;
```

**Tests (write first)** — `src/lib/live-theme.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { liveSurface, readDismissed, resultDismissKey, writeDismissed } from "./live-theme";

describe("liveSurface (B5)", () => {
  it.each([
    [{ status: "DRAFT", dismissed: false }, "lobby"],
    [{ status: "OPEN", dismissed: false }, "lobby"],
    [{ status: "IN_PROGRESS", dismissed: true }, "live"],
    [{ status: "CLOSED", dismissed: false }, "result"],
    [{ status: "CLOSED", dismissed: true }, "record"],
  ] as const)("%j → %s", (input, surface) => expect(liveSurface(input)).toBe(surface));
});

describe("the dismissal flag", () => {
  it("is keyed by tasting", () => expect(resultDismissKey("t1")).toBe("blindr:result-dismissed:t1"));
  it("reads and writes through storage, and survives a throwing or missing storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readDismissed(() => storage, "t1")).toBe(false);
    expect(writeDismissed(() => storage, "t1")).toBe(true);
    expect(readDismissed(() => storage, "t1")).toBe(true);
    const throwing = () => { throw new Error("SecurityError"); };
    expect(readDismissed(throwing, "t1")).toBe(false);
    expect(writeDismissed(throwing, "t1")).toBe(false);
    expect(readDismissed(() => null, "t1")).toBe(false);
  });
});
```

**Tests (write first)** — `src/lib/safe-storage.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { readFlag, writeFlag } from "./safe-storage";

describe("safe-storage", () => {
  it("reads and writes a flag, and survives a throwing or missing storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readFlag(() => storage, "k")).toBe(false);
    expect(writeFlag(() => storage, "k")).toBe(true);
    expect(readFlag(() => storage, "k")).toBe(true);
    const throwing = () => { throw new Error("SecurityError"); };
    expect(readFlag(throwing, "k")).toBe(false);
    expect(writeFlag(throwing, "k")).toBe(false);
    expect(readFlag(() => null, "k")).toBe(false);
    const quota = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(writeFlag(() => quota, "k")).toBe(false);
  });
});
```

**Tests (write first)** — `src/lib/pour-pointer.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { currentGlass, guessOrderAllows, pouredThrough, skipTarget, type PointerGlass } from "./pour-pointer";

const g = (id: string, isRevealed = false, revealStep = 0): PointerGlass => ({ id, isRevealed, revealStep });

describe("currentGlass (B6)", () => {
  it("no pointer: the lowest unrevealed glass", () => {
    expect(currentGlass([g("a", true), g("b"), g("c")], null)).toEqual({ id: "b", index: 1, wrapped: false });
  });
  it("a pointer outside the list reads as no pointer", () => {
    expect(currentGlass([g("a"), g("b")], "gone")).toEqual({ id: "a", index: 0, wrapped: false });
  });
  it("the pointer's glass while it is unrevealed", () => {
    expect(currentGlass([g("a"), g("b"), g("c")], "c")).toEqual({ id: "c", index: 2, wrapped: false });
  });
  it("after the pointer's glass is revealed: the next unrevealed glass after it", () => {
    expect(currentGlass([g("a"), g("b"), g("c", true), g("d")], "c")).toEqual({ id: "d", index: 3, wrapped: false });
  });
  it("wraps to a skipped glass when the pointer passes the end", () => {
    expect(currentGlass([g("a"), g("b", true), g("c", true)], "c")).toEqual({ id: "a", index: 0, wrapped: true });
  });
  it("null once every glass is revealed", () => {
    expect(currentGlass([g("a", true), g("b", true)], "b")).toBeNull();
    expect(currentGlass([], null)).toBeNull();
  });
});

describe("skipTarget", () => {
  const flight = [g("a"), g("b"), g("c", true), g("d")];
  it("the next unrevealed glass after the current one, wrapping", () => {
    expect(skipTarget(flight, { index: 1 })).toEqual({ id: "d", index: 3 });
    expect(skipTarget(flight, { index: 3 })).toEqual({ id: "a", index: 0 });
  });
  it("null when the current glass is the only unrevealed one", () => {
    expect(skipTarget([g("a", true), g("b"), g("c", true)], { index: 1 })).toBeNull();
  });
});

describe("pouredThrough", () => {
  it.each([
    [[g("a"), g("b"), g("c")], null, 0],
    [[g("a", true), g("b"), g("c")], null, 1],
    [[g("a", true), g("b", false, 2), g("c"), g("d")], "d", 3],
    [[g("a", true), g("b", true)], null, 1],
    [[], null, -1],
  ] as const)("%j with pointer %s → %d", (flight, pointer, index) => expect(pouredThrough(flight, pointer)).toBe(index));
});

describe("guessOrderAllows (refinement 6)", () => {
  const flight = [g("a", true), g("b"), g("c"), g("d")];
  const guided = { timingMode: "LIVE", sequentialGuessing: true } as const;
  it("blind guided: only the glass pouring now", () => {
    expect(guessOrderAllows({ ...guided, revealMode: "BLIND", glasses: flight, pointerWineId: "c", wineId: "c" })).toBe(true);
    expect(guessOrderAllows({ ...guided, revealMode: "BLIND", glasses: flight, pointerWineId: "c", wineId: "b" })).toBe(false);
  });
  it("semi-blind guided: every glass poured so far", () => {
    expect(guessOrderAllows({ ...guided, revealMode: "SEMI_BLIND", glasses: flight, pointerWineId: "c", wineId: "b" })).toBe(true);
    expect(guessOrderAllows({ ...guided, revealMode: "SEMI_BLIND", glasses: flight, pointerWineId: "c", wineId: "d" })).toBe(false);
  });
  it("free order and self-paced: any glass", () => {
    expect(guessOrderAllows({ timingMode: "LIVE", sequentialGuessing: false, revealMode: "BLIND", glasses: flight, pointerWineId: null, wineId: "d" })).toBe(true);
    expect(guessOrderAllows({ timingMode: "ASYNC", sequentialGuessing: true, revealMode: "BLIND", glasses: flight, pointerWineId: null, wineId: "d" })).toBe(true);
  });
});
```

**Steps**
- [ ] Write both tests; watch them fail; implement; green; eslint.

**Acceptance:** `npx vitest run src/lib/safe-storage.test.ts src/lib/live-theme.test.ts src/lib/pour-pointer.test.ts` is green; `rg -n "try \{" src/lib/live-theme.ts` prints nothing (storage errors are `safe-storage.ts`'s).

**Closes:** spec §6.5, §7.5 (pure tests); ledger B5 (dismissal), B6 (pointer); map HOST-17 (rules), SB-13 (poured state), XCUT-07 (dismissal); supporting: RESULT-02.

---

### BT-P4 — Console copy and glass facts

**Depends on:** —

**OWNS**
- create `src/lib/console-copy.ts`, `src/lib/console-copy.test.ts`
- create `src/lib/host-facts.ts`, `src/lib/host-facts.test.ts`

**Does** (spec §7.3 items 2, 4, 5, 7; §7.5; §11.3 item 3; B0 / D15 reveal-8)
- `console-copy.ts`: the not-locked line (they/them for every name), the paused band and refusals, the pour eyebrows, Skip, the "to go" chip, and the generic two-tap confirm (`twoTapState`, 5 seconds) that Reveal everything (BT-H2) and Delete the tasting (BT-L4) share.
- `host-facts.ts`: "This glass" facts from revealed categories only, counted over eligible participants whose row has `locked_at` or `scored_at`. Its step keys are `RevealKey` from `./reveal-rows-math` (the `StepKey` union in `host/console.tsx` repeats it; BT-H2 switches the console to `RevealKey`). BT-H2 (host) and BT-R1 (participants) both use it.
- `console-copy.ts` also holds `stepRevealApplies` (spec §7.3 item 10; Q8), the one rule for which tastings reveal attribute by attribute, and `nextChipLabel` takes a null count: the bare "Next" at step 0, after M1.
- **Settled (2026-09-13):** `notLockedLine` pins "They are scored on whatever they have already answered — nothing at all if they have not started." (the canvas's "has" restored in the ledger and spec).

**Interfaces — produces**
```ts
// src/lib/console-copy.ts
export function notLockedLine(names: readonly string[], opts: { phone: boolean }): string | null;
export function pausedBand(host: string): string;
export const CONSOLE_PAUSED = "Paused — reveals and Skip wait until you resume.";
export const PAUSED_REFUSAL = "The tasting is paused — resume to reveal.";
export const CURRENT_GLASS_ONLY = "Reveal the glass that is pouring now.";
export const NEXT_ATTRIBUTE = "Reveal the next attribute";
export function pouringNowEyebrow(glass: number, soFar: number): string;
export function skippedEyebrow(glass: number): string;
export function skipLabel(glass: number): string;
export function nextChipLabel(inPlayCount: number | null, revealStep: number): string; // null → "Next"
export function stepRevealApplies(t: { revealMode: RevealMode; timingMode: TimingMode; sequentialGuessing: boolean }): boolean;
export type TwoTapState = "idle" | "armed";
export const TWO_TAP_WINDOW_MS = 5000;
export function twoTapState(armedAt: number | null, now: number): TwoTapState;
export function revealEverythingLabel(state: TwoTapState): string;

// src/lib/host-facts.ts
// step keys: import type { RevealKey } from "./reveal-rows-math"
export type FactRow = {
  participant_id: string; primary_grape_id: string | null; appellation_id: string | null;
  locked_at: string | null; scored_at: string | null;
};
export function glassFacts(input: {
  revealedKeys: readonly RevealKey[];
  answer: { primary_grape_id: string; appellation_id: string | null } | null;
  rows: readonly FactRow[];
  eligibleIds: ReadonlySet<string>;
  nameOf: (appellationId: string) => string | null;
}): { label: string; value: string }[];
```

**Tests (write first)** — `src/lib/console-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  CONSOLE_PAUSED,
  CURRENT_GLASS_ONLY,
  NEXT_ATTRIBUTE,
  PAUSED_REFUSAL,
  nextChipLabel,
  notLockedLine,
  pausedBand,
  pouringNowEyebrow,
  revealEverythingLabel,
  skipLabel,
  skippedEyebrow,
  stepRevealApplies,
  twoTapState,
} from "./console-copy";

describe("notLockedLine (S7, S7b)", () => {
  const tail = "They are scored on whatever they have already answered — nothing at all if they have not started.";
  it("laptop", () => {
    expect(notLockedLine([], { phone: false })).toBeNull();
    expect(notLockedLine(["Maja"], { phone: false })).toBe(`Maja has not locked in. ${tail}`);
    expect(notLockedLine(["Maja", "Gustav"], { phone: false })).toBe(`Maja and Gustav have not locked in. ${tail}`);
    expect(notLockedLine(["Maja", "Gustav", "Anders"], { phone: false })).toBe(`Maja, Gustav and 1 other have not locked in. ${tail}`);
    expect(notLockedLine(["Maja", "Gustav", "Anders", "Sofie"], { phone: false })).toBe(`Maja, Gustav and 2 others have not locked in. ${tail}`);
  });
  it("phone", () => {
    expect(notLockedLine(["Maja"], { phone: true })).toBe("Maja is scored on what they have answered — nothing if they have not started.");
    expect(notLockedLine(["Maja", "Gustav"], { phone: true })).toBe("Maja and Gustav are scored on what they have answered — nothing if they have not started.");
    expect(notLockedLine(["Maja", "Gustav", "Anders"], { phone: true })).toBe(
      "Maja, Gustav and 1 other are scored on what they have answered — nothing if they have not started.",
    );
  });
});

describe("pause, skip and the pointer (B6)", () => {
  it("copy", () => {
    expect(pausedBand("Christian")).toBe("Paused · Christian has paused the tasting. You can still change and lock your guess.");
    expect(CONSOLE_PAUSED).toBe("Paused — reveals and Skip wait until you resume.");
    expect(PAUSED_REFUSAL).toBe("The tasting is paused — resume to reveal.");
    expect(CURRENT_GLASS_ONLY).toBe("Reveal the glass that is pouring now.");
    expect(NEXT_ATTRIBUTE).toBe("Reveal the next attribute");
    expect(pouringNowEyebrow(3, 6)).toBe("Pouring now · glass 3 of 6 so far");
    expect(skippedEyebrow(3)).toBe("Glass 3 was skipped · Pour it now");
    expect(skipLabel(4)).toBe("Skip to glass 4 →");
    expect(nextChipLabel(6, 2)).toBe("4 to go");
    expect(nextChipLabel(null, 0)).toBe("Next");
  });
});

describe("stepRevealApplies (Q8, REVEAL-02)", () => {
  it("only guided LIVE blind tastings reveal attribute by attribute", () => {
    expect(stepRevealApplies({ revealMode: "BLIND", timingMode: "LIVE", sequentialGuessing: true })).toBe(true);
    expect(stepRevealApplies({ revealMode: "BLIND", timingMode: "LIVE", sequentialGuessing: false })).toBe(false);
    expect(stepRevealApplies({ revealMode: "BLIND", timingMode: "ASYNC", sequentialGuessing: true })).toBe(false);
    expect(stepRevealApplies({ revealMode: "SEMI_BLIND", timingMode: "LIVE", sequentialGuessing: true })).toBe(false);
  });
});

describe("two-tap confirm", () => {
  it("arms for five seconds", () => {
    expect(twoTapState(null, 1_000)).toBe("idle");
    expect(twoTapState(1_000, 1_000)).toBe("armed");
    expect(twoTapState(1_000, 5_999)).toBe("armed");
    expect(twoTapState(1_000, 6_000)).toBe("idle");
  });
  it("labels Reveal everything", () => {
    expect(revealEverythingLabel("idle")).toBe("Reveal everything");
    expect(revealEverythingLabel("armed")).toBe("Tap again to reveal everything");
  });
});
```

**Tests (write first)** — `src/lib/host-facts.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { glassFacts, type FactRow } from "./host-facts";

const row = (participant_id: string, over: Partial<FactRow> = {}): FactRow => ({
  participant_id, primary_grape_id: null, appellation_id: null,
  locked_at: "2026-09-13T19:00:00Z", scored_at: null, ...over,
});
const names: Record<string, string> = { barolo: "Barolo DOCG", barbaresco: "Barbaresco DOCG" };
const base = {
  answer: { primary_grape_id: "nebbiolo", appellation_id: "barbaresco" },
  eligibleIds: new Set(["p1", "p2", "p3", "p4"]),
  nameOf: (id: string) => names[id] ?? null,
};
const rows = [
  row("p1", { primary_grape_id: "nebbiolo", appellation_id: "barolo" }),
  row("p2", { primary_grape_id: "nebbiolo", appellation_id: "barolo" }),
  row("p3", { primary_grape_id: "sangiovese", appellation_id: "barbaresco", locked_at: null }), // an unlocked draft
  row("p4", { primary_grape_id: "nebbiolo", appellation_id: "barbaresco", locked_at: null, scored_at: "2026-09-13T19:05:00Z" }),
  row("host", { primary_grape_id: "nebbiolo" }), // not eligible
];

describe("glassFacts (B6 'This glass', D15 reveal-8)", () => {
  it("nothing before any reveal", () => {
    expect(glassFacts({ ...base, revealedKeys: [], rows })).toEqual([]);
  });
  it("the grape fact once grapes are revealed, over locked or scored eligible rows", () => {
    expect(glassFacts({ ...base, revealedKeys: ["country", "region", "grapes"], rows })).toEqual([
      { label: "Got the grape", value: "3 of 4" },
    ]);
  });
  it("appellation facts once the appellation is revealed", () => {
    expect(glassFacts({ ...base, revealedKeys: ["country", "region", "appellation"], rows })).toEqual([
      { label: "Got the appellation", value: "1 of 4" },
      { label: "Most said", value: "Barolo DOCG" },
    ]);
  });
  it("no appellation facts when the wine has none; nothing without an answer", () => {
    expect(glassFacts({ ...base, answer: { primary_grape_id: "nebbiolo", appellation_id: null }, revealedKeys: ["appellation", "grapes"], rows }))
      .toEqual([{ label: "Got the grape", value: "3 of 4" }]);
    expect(glassFacts({ ...base, answer: null, revealedKeys: ["grapes"], rows })).toEqual([]);
  });
});
```

**Steps**
- [ ] Write both tests; watch them fail; implement; green; eslint.

**Acceptance:** `npx vitest run src/lib/console-copy.test.ts src/lib/host-facts.test.ts` is green.

**Closes:** spec §7.5 (pure tests), §7.3 item 10 (the predicate); ledger B6 (not-locked line, facts), B0 (reveal-8 answered); Q8; map HOST-18 (copy), HOST-21, HOST-22, REVEAL-02 (the predicate), REVEAL-12 (rule), XCUT-37 (two-tap helper); supporting: HOST-16.

---

### BT-P5 — Guess writes, ladder copy, pick counts

**Depends on:** —

**OWNS**
- create `src/app/tastings/[id]/play/guess-write.ts`, `guess-write.test.ts`
- create `src/app/tastings/[id]/play/ladder-copy.ts`, `ladder-copy.test.ts`
- create `src/app/tastings/[id]/play/pick-counts.ts`, `pick-counts.test.ts`

**Does** (spec §8.3 items 1–10, §8.5)
- `guess-write.ts`: the field groups of the per-field-group upsert and their validation. The year range is add-wine F1's (`VINTAGE_YEAR_MIN`, `vintageYearMax` from `src/lib/wine-identity/complete.ts`, imported relatively); tawny 1–100; NV and a skip clear both numbers. The server never trusts the client's shape: BT-Y1's action runs `groupPayload` again.
- `ladder-copy.ts`: S8, S8b, S9 and S10 copy. The field noun per picker search (country → countries, region → regions, appellation → appellations, both grapes → grapes, producer → producers, type designation → designations, vintage → vintages).
- `pick-counts.ts`: "you guess this often", counted from the viewer's own `guesses` rows across tastings (ids only), threshold 3. Vintage is not counted.

**Interfaces — produces**
```ts
// guess-write.ts
export type GuessFieldGroup = "origin" | "grapes" | "producer" | "designation" | "vintage";
export const GROUP_COLUMNS: Readonly<Record<GuessFieldGroup, readonly (keyof GuessRow)[]>>;
export function groupForField(field: LadderField): GuessFieldGroup;
export const INVALID_VINTAGE = "Choose a vintage from the list."; // (plan copy)
export function groupPayload(group: GuessFieldGroup, row: GuessRow, now: Date): { values: Partial<GuessRow> } | { error: string };
export function vintageOptions(now: Date): { years: number[]; tawny: number[] };

// ladder-copy.ts
export function introHeading(glass: number): string;
export const INTRO_SENTENCE: string;
export function stakeLine(points: number, opts: { phone: boolean }): string;
export const VINTAGE_LABEL: string;
export const VINTAGE_EMPTY: string;
export function rankChipLabel(r: { rank: number; tied: boolean; competitors: number; points: number }, opts: { phone: boolean }): string;
export function lockButtonText(glass: number): string;
export function lockFooterText(opts: { phone: boolean }): string;
export const LOCKED_EDIT_REFUSAL: string;
export function laptopEyebrow(host: string): string;
export function formatCount(n: number): string;
export function searchPlaceholder(field: LadderField, count: number, opts: { phone: boolean }): string;
export function everythingElseHeading(count: number): string;
export const OFTEN_SUFFIX: string;
export function waitingTail(host: string | null): string;
export function standingsAfterHeading(glass: number): string;   // "Standings after glass 2"
export function lockedInRosterHeading(k: number, n: number): string; // "5 of 7 locked in"
export const NOTE_THIS_GLASS = "Note this glass";
export const NOTE_THIS_GLASS_SUB = "What you smell and taste, and what you would give it — it attaches to the wine at the reveal";
export const NOTE_THIS_GLASS_SUB_LAPTOP = "Attaches to the wine at the reveal";
export function phoneLadderTitle(tasting: string, revealMode: RevealMode): string; // "Nebbiolo vs Sangiovese · blind"
export function lockedCountShort(k: number, n: number): string;                    // "5 of 7 locked"
export function shortlistHeading(region: string): string;                            // "Common grapes in Piedmont"

// pick-counts.ts
export type PickCounts = Partial<Record<LadderField, Record<string, number>>>;
export const OFTEN_THRESHOLD = 3;
export function buildPickCounts(rows: readonly Pick<GuessRow,
  "country_id" | "region_id" | "appellation_id" | "primary_grape_id" | "secondary_grape_id" | "producer_id" | "type_designation_id">[]): PickCounts;
export function oftenPicked(counts: Record<string, number> | undefined, id: string): boolean;
```

**Tests (write first)** — `src/app/tastings/[id]/play/guess-write.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { GROUP_COLUMNS, INVALID_VINTAGE, groupForField, groupPayload, vintageOptions } from "./guess-write";
import type { GuessRow } from "./ladder-types";

const empty: GuessRow = {
  country_id: null, region_id: null, appellation_id: null, primary_grape_id: null, secondary_grape_id: null,
  producer_id: null, type_designation_id: null, vintage_kind: null, vintage_year: null, vintage_tawny_years: null,
};
const now = new Date("2026-09-13T12:00:00Z");

describe("field groups (B7)", () => {
  it("maps every ladder field", () => {
    expect([groupForField("country"), groupForField("region"), groupForField("appellation")]).toEqual(["origin", "origin", "origin"]);
    expect([groupForField("primary_grape"), groupForField("secondary_grape")]).toEqual(["grapes", "grapes"]);
    expect(groupForField("producer")).toBe("producer");
    expect(groupForField("type_designation")).toBe("designation");
    expect(groupForField("vintage")).toBe("vintage");
  });
  it("names exactly the columns each group writes", () => {
    expect(GROUP_COLUMNS).toEqual({
      origin: ["country_id", "region_id", "appellation_id"],
      grapes: ["primary_grape_id", "secondary_grape_id"],
      producer: ["producer_id"],
      designation: ["type_designation_id"],
      vintage: ["vintage_kind", "vintage_year", "vintage_tawny_years"],
    });
  });
});

describe("groupPayload", () => {
  it("origin carries the country a region pick set", () => {
    expect(groupPayload("origin", { ...empty, country_id: "it", region_id: "piemonte" }, now))
      .toEqual({ values: { country_id: "it", region_id: "piemonte", appellation_id: null } });
  });
  it("vintage: a year from 1900 to next UTC year", () => {
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 1900 }, now))
      .toEqual({ values: { vintage_kind: "YEAR", vintage_year: 1900, vintage_tawny_years: null } });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 2027 }, now)).toHaveProperty("values");
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 1899 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 2028 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: null }, now)).toEqual({ error: INVALID_VINTAGE });
  });
  it("vintage: tawny 1–100; NV and a skip clear the numbers", () => {
    expect(groupPayload("vintage", { ...empty, vintage_kind: "TAWNY", vintage_tawny_years: 25, vintage_year: 2001 }, now))
      .toEqual({ values: { vintage_kind: "TAWNY", vintage_year: null, vintage_tawny_years: 25 } });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "TAWNY", vintage_tawny_years: 0 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "TAWNY", vintage_tawny_years: 101 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "NV", vintage_year: 2010 }, now))
      .toEqual({ values: { vintage_kind: "NV", vintage_year: null, vintage_tawny_years: null } });
    expect(groupPayload("vintage", empty, now))
      .toEqual({ values: { vintage_kind: null, vintage_year: null, vintage_tawny_years: null } });
  });
});

describe("vintageOptions", () => {
  it("next UTC year down to 1900, and the tawny steps", () => {
    const { years, tawny } = vintageOptions(now);
    expect(years[0]).toBe(2027);
    expect(years[years.length - 1]).toBe(1900);
    expect(years).toHaveLength(128);
    expect(tawny).toEqual([10, 20, 30, 40]);
  });
  it("follows the UTC year across midnight", () => {
    expect(vintageOptions(new Date("2026-12-31T23:30:00-05:00")).years[0]).toBe(2028);
  });
});
```

**Tests (write first)** — `src/app/tastings/[id]/play/ladder-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  INTRO_SENTENCE, LOCKED_EDIT_REFUSAL, OFTEN_SUFFIX, VINTAGE_EMPTY, VINTAGE_LABEL,
  everythingElseHeading, formatCount, introHeading, laptopEyebrow, lockButtonText, lockFooterText,
  lockedCountShort, lockedInRosterHeading, phoneLadderTitle, rankChipLabel, searchPlaceholder, shortlistHeading,
  stakeLine, standingsAfterHeading, waitingTail,
} from "./ladder-copy";

describe("ladder copy (S8, S8b)", () => {
  it("intro, stake, vintage", () => {
    expect(introHeading(3)).toBe("What is in glass 3?");
    expect(INTRO_SENTENCE).toBe("Each row saves as you answer it. Skip anything you cannot call.");
    expect(stakeLine(10, { phone: false })).toBe("10 / 30 at stake");
    expect(stakeLine(10, { phone: true })).toBe("10 / 30 pts at stake");
    expect(VINTAGE_LABEL).toBe("Vintage · 1 pt if a year out");
    expect(VINTAGE_EMPTY).toBe("Year, NV or tawny — or skip");
  });
  it("rank chip (PLAY-07)", () => {
    expect(rankChipLabel({ rank: 2, tied: false, competitors: 7, points: 14 }, { phone: false })).toBe("2nd of 7 · 14 pts");
    expect(rankChipLabel({ rank: 2, tied: false, competitors: 7, points: 14 }, { phone: true })).toBe("2nd · 14 pts");
    expect(rankChipLabel({ rank: 2, tied: true, competitors: 7, points: 14 }, { phone: false })).toBe("=2nd of 7 · 14 pts");
  });
  it("lock, eyebrow and the rail", () => {
    expect(lockButtonText(3)).toBe("Lock in glass 3");
    expect(lockFooterText({ phone: false })).toBe("Saved as you go. Locking stops edits and tells the table you are ready.");
    expect(lockFooterText({ phone: true })).toBe("Saved as you go. Locking stops edits and shows the others you are ready.");
    expect(LOCKED_EDIT_REFUSAL).toBe("Change it first — this glass is locked in.");
    expect(laptopEyebrow("Christian")).toBe("Live · Christian is hosting");
    expect(phoneLadderTitle("Nebbiolo vs Sangiovese", "BLIND")).toBe("Nebbiolo vs Sangiovese · blind");
    expect(lockedCountShort(5, 7)).toBe("5 of 7 locked");
    expect(standingsAfterHeading(2)).toBe("Standings after glass 2");
    expect(lockedInRosterHeading(5, 7)).toBe("5 of 7 locked in");
  });
});

describe("picker copy (S9)", () => {
  it("counts and placeholders", () => {
    expect([formatCount(57), formatCount(1240), formatCount(33741)]).toEqual(["57", "1,240", "33,741"]);
    expect(searchPlaceholder("primary_grape", 1240, { phone: true })).toBe("Search 1,240 grapes");
    expect(searchPlaceholder("primary_grape", 1240, { phone: false })).toBe("Type to search all 1,240 grapes");
    expect(searchPlaceholder("producer", 33741, { phone: true })).toBe("Search 33,741 producers");
    expect(searchPlaceholder("appellation", 3282, { phone: false })).toBe("Type to search all 3,282 appellations");
    expect(everythingElseHeading(1240)).toBe("Everything else · all 1,240");
    expect(OFTEN_SUFFIX).toBe(" · you guess this often");
    expect(shortlistHeading("Piedmont")).toBe("Common grapes in Piedmont");
  });
});

describe("waiting (S10, S10b)", () => {
  it("the tail", () => {
    expect(waitingTail(null)).toBe("The reveal starts when everyone is in — or when the host moves on.");
    expect(waitingTail("Christian")).toBe("The reveal starts when everyone is in, or when Christian moves on.");
  });
});
```

**Tests (write first)** — `src/app/tastings/[id]/play/pick-counts.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { OFTEN_THRESHOLD, buildPickCounts, oftenPicked } from "./pick-counts";

const rows = [
  { country_id: "it", region_id: "piemonte", appellation_id: "barolo", primary_grape_id: "nebbiolo", secondary_grape_id: null, producer_id: "vietti", type_designation_id: null },
  { country_id: "it", region_id: "piemonte", appellation_id: null, primary_grape_id: "nebbiolo", secondary_grape_id: null, producer_id: null, type_designation_id: null },
  { country_id: "fr", region_id: null, appellation_id: null, primary_grape_id: "nebbiolo", secondary_grape_id: "barbera", producer_id: null, type_designation_id: null },
];

describe("pick counts ('you guess this often')", () => {
  it("counts ids per field from the viewer's own rows", () => {
    expect(buildPickCounts(rows)).toEqual({
      country: { it: 2, fr: 1 },
      region: { piemonte: 2 },
      appellation: { barolo: 1 },
      primary_grape: { nebbiolo: 3 },
      secondary_grape: { barbera: 1 },
      producer: { vietti: 1 },
    });
  });
  it("a threshold of three", () => {
    const counts = buildPickCounts(rows);
    expect(OFTEN_THRESHOLD).toBe(3);
    expect(oftenPicked(counts.primary_grape, "nebbiolo")).toBe(true);
    expect(oftenPicked(counts.country, "it")).toBe(false);
    expect(oftenPicked(undefined, "it")).toBe(false);
  });
});
```

**Steps**
- [ ] Write the three tests; watch them fail; implement; green; eslint.

**Acceptance:** `npx vitest run "src/app/tastings/[id]/play/guess-write.test.ts" "src/app/tastings/[id]/play/ladder-copy.test.ts" "src/app/tastings/[id]/play/pick-counts.test.ts"` is green.

**Closes:** spec §8.5 (pure tests), §8.3 items 1 and 8 (the phone header, the shortlist heading); ledger B7 (writes, vintage, copy, "you guess this often"); map PLAY-07, PLAY-09, PLAY-14, PLAY-15, PLAY-19, PLAY-29 (heading), PLAY-30, PLAY-31, XCUT-53, XCUT-54; supporting: PLAY-17, PLAY-34.

---

### BT-P6 — Count words, the semi-blind board and copy, guess columns

**Depends on:** —

**OWNS**
- create `src/lib/count-words.ts`, `src/lib/count-words.test.ts`
- create `src/lib/semi-blind-board.ts`, `src/lib/semi-blind-board.test.ts`
- create `src/lib/semi-blind-copy.ts`, `src/lib/semi-blind-copy.test.ts`
- create `src/lib/guess-columns.ts`, `src/lib/guess-columns.test.ts`

**Does** (spec §10.3, §10.4 (e), §10.5; §11.3 item 10 count words)
- `count-words.ts`: one to ten as words, numerals above ten, optional capital.
- `semi-blind-board.ts`: the client twin of `assign_semi_blind_match` / `clear_semi_blind_match` for the optimistic board, the pool, the matched count, each glass row's state, and the mapping from `get_semi_blind_board`'s JSON. It speaks in opaque keys only; it never sees a wine id for a candidate.
- `semi-blind-copy.ts`: SB1–SB4 copy. The helper and pool-note first sentences are data-driven: they name a grape only when two or more pool cards share it (the most common shared grape; ties by folded name). `listTitle` uses `countWord` ("Tonight's six wines"). `matchRefusalSentence` maps `assign_semi_blind_match`'s and `clear_semi_blind_match`'s errors to the sentences BT-S2 shows; the caller passes the ladder's locked-in sentence, so this module imports nothing from `play/`.
- `guess-columns.ts`: the explicit 27-column `guesses` select list (M9b's grant), as a string literal so postgrest-js keeps inferring row types.

**Interfaces — produces**
```ts
// count-words.ts
export function countWord(n: number, opts?: { capital?: boolean }): string;

// semi-blind-board.ts
export type BoardGlass = { wineId: string; glass: number; isRevealed: boolean; revealStep: number; ownBottle: boolean };
export type BoardRow = { key: string | null; locked: boolean; scored: boolean; totalPoints: number | null };
export type Board = {
  glasses: readonly BoardGlass[];                                     // list order
  mine: Readonly<Record<string, BoardRow>>;                           // by glass wine id
  revealedKeyByGlass: Readonly<Record<string, string>>;
  splitByGlass: Readonly<Record<string, readonly { key: string; count: number }[]>>;
  ownBottleKeys: readonly string[];
  knownKeyByGlass: Readonly<Record<string, string>>;
};
export type SemiBlindBoardJson = {
  mine: { glass_wine_id: string; key: string | null; locked: boolean; scored: boolean; total_points: number | null }[];
  revealed: { glass_wine_id: string; key: string }[];
  split: { glass_wine_id: string; key: string; count: number }[];
  own_bottles: string[];
  known: { glass_wine_id: string; key: string }[];
};
export function boardFromRpc(glasses: readonly BoardGlass[], json: SemiBlindBoardJson | null): Board;
export type AssignOutcome =
  | { ok: true; board: Board; swappedWith: string | null }
  | { ok: false; reason: "locked-holder"; holderGlass: number }
  | { ok: false; reason: "revealed" | "not-in-pool" | "glass-locked" | "glass-closed" };
export function applyAssignment(board: Board, glassWineId: string, key: string): AssignOutcome;
export function clearAssignment(board: Board, glassWineId: string): Board;
export function poolFor<T extends { key: string }>(cards: readonly T[], board: Board): T[];
export function matchedCount(board: Board): { assigned: number; total: number };
export type GlassRowState = "open-empty" | "open-assigned" | "locked" | "not-poured" | "revealed" | "own-bottle";
export function glassRowState(board: Board, glassWineId: string, pouredThroughIndex: number | null): GlassRowState;

// semi-blind-copy.ts — the names the test imports, plus:
export const HOW_THE_TABLE_SPLIT = "How the table split";
export const STANDINGS_ONE_POINT = "Standings · one point a glass";
export const MATCH_TITLE = "Match the glasses";            // phone title; the laptop title is the tasting name
export const THE_GLASSES = "The glasses";                  // laptop glass column heading
export const THE_BOTTLES = "The bottles";                  // laptop pool heading
export function stillUnassigned(n: number): string;        // "4 still unassigned" (laptop, its own line)
export function listOpensAtStart(host: string): string;    // "The list of tonight's wines opens when Christian starts."
export function matchRefusalSentence(
  error: { message: string; detail?: string | null },
  ctx: { glassNumberOf: (wineId: string) => number | null; candidateKey: string; revealedKeys: ReadonlySet<string>; lockedIn: string },
): string;
export function revealingGlassEyebrow(glass: number): string;        // "Revealing glass 3"
export function revealedSoFar(k: number, n: number): string;         // "2 of 6 revealed"
export function glassWas(glass: number): string;                      // "Glass 3 was"
export function unassignedHeading(n: number): string;       // phone: "Still unassigned · 3 wines"
export function clearGlassLabel(glass: number): string;              // "Clear glass 3"
export function lockGlassLabel(glass: number): string;               // "Lock in glass 3"

// guess-columns.ts
export const GUESS_READ_COLUMNS: "id, wine_id, participant_id, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, country_points, region_points, appellation_points, primary_grape_points, secondary_grape_points, producer_points, type_designation_points, vintage_points, total_points, scored_at, submitted_at, updated_at, reveal_step, locked_at";
export const GUESS_READ_COLUMN_LIST: readonly string[];
```

**Tests (write first)** — `src/lib/count-words.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { countWord } from "./count-words";

describe("countWord", () => {
  it("words to ten, numerals above", () => {
    expect([1, 2, 5, 10].map((n) => countWord(n))).toEqual(["one", "two", "five", "ten"]);
    expect(countWord(0)).toBe("zero");
    expect(countWord(11)).toBe("11");
    expect(countWord(7, { capital: true })).toBe("Seven");
    expect(countWord(12, { capital: true })).toBe("12");
  });
});
```

**Tests (write first)** — `src/lib/semi-blind-board.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  applyAssignment, boardFromRpc, clearAssignment, glassRowState, matchedCount, poolFor,
  type Board, type BoardGlass, type BoardRow,
} from "./semi-blind-board";

const glass = (wineId: string, n: number, over: Partial<BoardGlass> = {}): BoardGlass => ({
  wineId, glass: n, isRevealed: false, revealStep: 0, ownBottle: false, ...over,
});
const row = (key: string | null, locked = false): BoardRow => ({ key, locked, scored: false, totalPoints: null });
const board = (over: Partial<Board> = {}): Board => ({
  glasses: [glass("g1", 1), glass("g2", 2), glass("g3", 3)],
  mine: {}, revealedKeyByGlass: {}, splitByGlass: {}, ownBottleKeys: [], knownKeyByGlass: {},
  ...over,
});
const card = (key: string) => ({ key });

describe("applyAssignment (B9)", () => {
  it("assigns an unheld wine", () => {
    const out = applyAssignment(board(), "g1", "k1");
    expect(out).toMatchObject({ ok: true, swappedWith: null });
    if (out.ok) expect(out.board.mine.g1.key).toBe("k1");
  });
  it("swaps with an open glass holding it", () => {
    const out = applyAssignment(board({ mine: { g1: row("k1"), g2: row("k2") } }), "g2", "k1");
    expect(out).toMatchObject({ ok: true, swappedWith: "g1" });
    if (out.ok) {
      expect(out.board.mine.g2.key).toBe("k1");
      expect(out.board.mine.g1.key).toBe("k2");
    }
  });
  it("an empty glass taking a held wine empties the holder", () => {
    const out = applyAssignment(board({ mine: { g1: row("k1") } }), "g3", "k1");
    if (!out.ok) throw new Error("expected ok");
    expect(out.board.mine.g1.key).toBeNull();
    expect(out.board.mine.g3.key).toBe("k1");
  });
  it("refuses a wine held by a locked glass, naming the glass", () => {
    expect(applyAssignment(board({ mine: { g2: row("k1", true) } }), "g1", "k1")).toEqual({ ok: false, reason: "locked-holder", holderGlass: 2 });
  });
  it("refuses revealed, own and proven wines, a locked glass and a closed glass", () => {
    expect(applyAssignment(board({ revealedKeyByGlass: { g3: "k3" } }), "g1", "k3")).toEqual({ ok: false, reason: "revealed" });
    expect(applyAssignment(board({ ownBottleKeys: ["k9"] }), "g1", "k9")).toEqual({ ok: false, reason: "not-in-pool" });
    expect(applyAssignment(board({ knownKeyByGlass: { g2: "k2" } }), "g1", "k2")).toEqual({ ok: false, reason: "not-in-pool" });
    expect(applyAssignment(board({ mine: { g1: row("k1", true) } }), "g1", "k2")).toEqual({ ok: false, reason: "glass-locked" });
    expect(applyAssignment(board({ glasses: [glass("g1", 1, { isRevealed: true })] }), "g1", "k2")).toEqual({ ok: false, reason: "glass-closed" });
  });
});

describe("clear, pool, counts", () => {
  it("clear returns the wine to the pool unless the glass is locked", () => {
    expect(clearAssignment(board({ mine: { g1: row("k1") } }), "g1").mine.g1.key).toBeNull();
    expect(clearAssignment(board({ mine: { g1: row("k1", true) } }), "g1").mine.g1.key).toBe("k1");
  });
  it("the pool leaves out assigned, revealed, own and proven wines, keeping card order", () => {
    const b = board({ mine: { g1: row("k1") }, revealedKeyByGlass: { g2: "k2" }, ownBottleKeys: ["k3"], knownKeyByGlass: { g3: "k4" } });
    expect(poolFor(["k6", "k1", "k2", "k3", "k4", "k5"].map(card), b).map((c) => c.key)).toEqual(["k6", "k5"]);
  });
  it("matched counts skip the viewer's own bottles", () => {
    const b = board({ glasses: [glass("g1", 1), glass("g2", 2, { ownBottle: true }), glass("g3", 3)], mine: { g1: row("k1") } });
    expect(matchedCount(b)).toEqual({ assigned: 1, total: 2 });
  });
});

describe("glassRowState", () => {
  const b = board({
    glasses: [glass("g1", 1, { isRevealed: true }), glass("g2", 2), glass("g3", 3), glass("g4", 4, { ownBottle: true })],
    mine: { g2: row("k2", true) },
  });
  it.each([
    ["g1", 2, "revealed"],
    ["g2", 2, "locked"],
    ["g3", 1, "not-poured"],
    ["g3", null, "open-empty"],
    ["g4", null, "own-bottle"],
  ] as const)("%s poured through %s → %s", (id, poured, state) => expect(glassRowState(b, id, poured)).toBe(state));
  it("open-assigned", () => expect(glassRowState(board({ mine: { g1: row("k1") } }), "g1", null)).toBe("open-assigned"));
});

describe("boardFromRpc", () => {
  it("maps the payload", () => {
    const b = boardFromRpc([glass("g1", 1), glass("g2", 2, { ownBottle: true })], {
      mine: [{ glass_wine_id: "g1", key: "k1", locked: true, scored: false, total_points: null }],
      revealed: [{ glass_wine_id: "g2", key: "k2" }],
      split: [{ glass_wine_id: "g2", key: "k1", count: 3 }],
      own_bottles: ["k2"],
      known: [],
    });
    expect(b.mine.g1).toEqual({ key: "k1", locked: true, scored: false, totalPoints: null });
    expect(b.revealedKeyByGlass).toEqual({ g2: "k2" });
    expect(b.splitByGlass).toEqual({ g2: [{ key: "k1", count: 3 }] });
    expect(b.ownBottleKeys).toEqual(["k2"]);
  });
  it("a null payload (not allowed to see the list) is an empty board", () => {
    expect(boardFromRpc([glass("g1", 1)], null).mine).toEqual({});
  });
});
```

**Tests (write first)** — `src/lib/semi-blind-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  LIST_BODY, LIST_FOOTNOTE, LOCK_ONLY_THIS, NOT_POURED, POOL_SWAP_NOTE, REVEALED_WINE_REFUSAL, YOUR_BOTTLE,
  beforeStartLine, boardEyebrow, candidateLabel, chooseFirst, emptyRowText, footerLine, listEyebrow, listTitle,
  THE_BOTTLES, THE_GLASSES, listOpensAtStart, lockedHolderLabel, matchRefusalSentence, matchedPill, pendingLine,
  poolHelperLines, poolNoteLines, revealResult, revealedRowText, stillUnassigned, unassignedHeading,
} from "./semi-blind-copy";
import type { CandidateCard } from "./semi-blind-candidates";

const c = (key: string, producer: string, grape: string | null, wineName: string | null = null): CandidateCard => ({
  key, producer, wineName, vintage: { kind: "YEAR", year: 2016, tawnyYears: null }, vintageLabel: "2016", appellation: null, grape,
});

describe("the list (SB1)", () => {
  it("copy", () => {
    expect(listEyebrow("Christian")).toBe("Semi-blind · Christian is hosting");
    expect(listTitle(6)).toBe("Tonight's six wines");
    expect(listTitle(12)).toBe("Tonight's 12 wines");
    expect(listOpensAtStart("Christian")).toBe("The list of tonight's wines opens when Christian starts.");
    expect(LIST_BODY).toBe("These are the bottles on the table. You will not be told which glass is which — that is what you work out.");
    expect(LIST_FOOTNOTE).toBe("Listed alphabetically by producer. Never in pouring order — position in this list would otherwise be the answer.");
    expect(beforeStartLine("Christian")).toBe("Glass 1 is poured when Christian starts.");
    expect(pendingLine(0)).toBeNull();
    expect(pendingLine(1)).toBe("1 wine still being added");
    expect(pendingLine(2)).toBe("2 wines still being added");
  });
});

describe("the board (SB2, SB3)", () => {
  it("header, rows, footer, refusals", () => {
    expect(boardEyebrow({ phone: true, host: "Christian", pouredGlass: 3 })).toBe("Semi-blind · glass 3 poured");
    expect(boardEyebrow({ phone: false, host: "Christian", pouredGlass: 3 })).toBe("Live · semi-blind · Christian is hosting");
    expect(matchedPill(3, 6)).toBe("3 of 6 matched");
    expect(THE_GLASSES).toBe("The glasses");
    expect(THE_BOTTLES).toBe("The bottles");
    expect(stillUnassigned(4)).toBe("4 still unassigned");
    expect(unassignedHeading(3)).toBe("Still unassigned · 3 wines");
    expect(unassignedHeading(1)).toBe("Still unassigned · 1 wine");
    expect(emptyRowText({ phone: true })).toBe("Tap to choose");
    expect(emptyRowText({ phone: false })).toBe("Drop a wine here, or click to choose");
    expect(NOT_POURED).toBe("Not poured yet");
    expect(YOUR_BOTTLE).toBe("Your bottle");
    expect(lockedHolderLabel(2)).toBe("Glass 2 · locked");
    expect(revealedRowText({ glass: 2, producer: "Vietti", vintageLabel: "2017" })).toBe("Glass 2 was Vietti 2017");
    expect(footerLine("Christian", { phone: true })).toBe("Change anything until Christian reveals. Nothing is scored before then.");
    expect(footerLine("Christian", { phone: false })).toBe(
      "Every assignment stays changeable until Christian reveals that glass. Locking a glass only closes that one.",
    );
    expect(LOCK_ONLY_THIS).toBe("Locking only this glass. The rest stay open.");
    expect(chooseFirst(3)).toBe("Choose a wine for glass 3 first.");
    expect(REVEALED_WINE_REFUSAL).toBe("That wine has been revealed.");
    expect(candidateLabel(c("k", "Vietti", null, "Barolo Castiglione"))).toBe("Vietti, Barolo Castiglione 2016");
    expect(candidateLabel(c("k", "Vietti", null))).toBe("Vietti 2016");
  });
  it("the pool helper names a grape only when two cards share it", () => {
    expect(POOL_SWAP_NOTE).toBe("Assigning one that sits on another glass swaps the two; revealed wines leave the list entirely.");
    expect(poolHelperLines([c("a", "A", "Nebbiolo"), c("b", "B", "Nebbiolo"), c("d", "D", "Sangiovese")])).toEqual([
      "Producer alone is not enough — two of these are Nebbiolo, so the wine and the vintage have to be on the label too.",
      POOL_SWAP_NOTE,
    ]);
    expect(poolHelperLines([c("a", "A", "Nebbiolo"), c("d", "D", "Sangiovese")])).toEqual([POOL_SWAP_NOTE]);
  });
});

describe("matchRefusalSentence (BT-S2)", () => {
  const ctx = {
    glassNumberOf: (id: string) => (id === "w2" ? 2 : null),
    candidateKey: "k1",
    revealedKeys: new Set(["k9"]),
    lockedIn: "LOCKED-IN",
  };
  it("maps each refusal", () => {
    expect(matchRefusalSentence({ message: "glass locked", detail: "w2" }, ctx)).toBe("Glass 2 · locked");
    expect(matchRefusalSentence({ message: "glass locked", detail: "gone" }, ctx)).toBe("Glass locked.");
    expect(matchRefusalSentence({ message: "that wine is not in your pool" }, { ...ctx, candidateKey: "k9" })).toBe(REVEALED_WINE_REFUSAL);
    expect(matchRefusalSentence({ message: "that wine is not in your pool" }, ctx)).toBe("That wine is not in your pool.");
    expect(matchRefusalSentence({ message: "this glass is locked in" }, ctx)).toBe("LOCKED-IN");
    expect(matchRefusalSentence({ message: "matching is closed" }, ctx)).toBe("Matching is closed.");
  });
});

describe("the reveal (SB4)", () => {
  it("result lines and the pool note", () => {
    expect(revealResult({ hit: true, pickLabel: null, mine: 2, revealed: 3 })).toEqual({ title: "You had it", detail: "+1 · 2 of 3 so far" });
    expect(revealResult({ hit: false, pickLabel: "Vietti, Barolo Castiglione", mine: 1, revealed: 3 }))
      .toEqual({ title: "You said Vietti, Barolo Castiglione", detail: "0 · 1 of 3 so far" });
    expect(revealResult({ hit: false, pickLabel: null, mine: 1, revealed: 3 }))
      .toEqual({ title: "You did not match this glass", detail: "0 · 1 of 3 so far" }); // (plan copy)
    expect(poolNoteLines([c("a", "A", "Nebbiolo"), c("b", "B", "Nebbiolo")])).toEqual([
      "Two Nebbiolo wines still in the pool.",
      "Wines already revealed are gone from the list — that is why a late glass is easier than an early one.",
    ]);
    expect(poolNoteLines([c("a", "A", "Nebbiolo")])).toEqual([
      "Wines already revealed are gone from the list — that is why a late glass is easier than an early one.",
    ]);
  });
});
```

**Tests (write first)** — `src/lib/guess-columns.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { GUESS_READ_COLUMNS, GUESS_READ_COLUMN_LIST } from "./guess-columns";

describe("GUESS_READ_COLUMNS (M9b's SELECT grant)", () => {
  it("is exactly the 27 columns clients may select, never guessed_wine_id", () => {
    expect(GUESS_READ_COLUMNS.split(", ")).toEqual([
      "id", "wine_id", "participant_id",
      "country_id", "region_id", "appellation_id", "primary_grape_id", "secondary_grape_id",
      "producer_id", "type_designation_id", "vintage_kind", "vintage_year", "vintage_tawny_years",
      "country_points", "region_points", "appellation_points", "primary_grape_points",
      "secondary_grape_points", "producer_points", "type_designation_points", "vintage_points",
      "total_points", "scored_at", "submitted_at", "updated_at", "reveal_step", "locked_at",
    ]);
    expect(GUESS_READ_COLUMN_LIST).toHaveLength(27);
    expect(GUESS_READ_COLUMN_LIST).not.toContain("guessed_wine_id");
  });
});
```

**Steps**
- [ ] Write the four tests; watch them fail; implement; green; eslint.

**Acceptance:** `npx vitest run src/lib/count-words.test.ts src/lib/semi-blind-board.test.ts src/lib/semi-blind-copy.test.ts src/lib/guess-columns.test.ts` is green.

**Closes:** spec §10.5 (pure tests), §10.4 (e) (`GUESS_READ_COLUMNS`); ledger B9 (swap, pool, per-glass lock, copy); map SB-05, SB-06, SB-07, SB-10, SB-11, SB-14, SB-15, SB-16, SB-17 (client), SB-18 (client), SB-21, SB-26, SB-28, SB-30, SB-32, SB-40 (client); supporting: SB-04, SB-23, SB-27, SB-29.

---

### BT-P7 — Reveal, result and record copy; the record pattern; CSV

**Depends on:** BT-P6 (`countWord`)

**OWNS**
- create `src/lib/reveal-copy.ts`, `src/lib/reveal-copy.test.ts`
- create `src/lib/result-copy.ts`, `src/lib/result-copy.test.ts`
- create `src/lib/record-pattern.ts`, `src/lib/record-pattern.test.ts`
- create `src/lib/csv.ts`, `src/lib/csv.test.ts`

**Does** (spec §11.3 items 1–2, 7, 10, 12–15, 17; §11.5)
- `reveal-copy.ts`: the locked line (first hidden label keeps its case, later ones are lower-cased), the laptop header, the rank-delta pill.
- `result-copy.ts`: S12 copy. `shortWineName` strips a trailing designation word in display case using `DESIGNATION_SUFFIXES` from `src/lib/wine-identity/fold.ts` (relative import); the ordinal comes from `ordinal` in `./stats-math`.
- `record-pattern.ts`: spec §11.3 item 15, verbatim, with category nouns: country → "country", region → "region", appellation → "the appellation", primary grape → "the grape", secondary grape → "the second grape", producer → "the producer", type designation → "the designation", vintage → "the vintage". The sentence's first letter is upper case. Times: 0 → "never in {n}", 1 → "once in {n}", 2 → "twice in {n}", else "{k} times in {n}", numbers through `countWord`.
- `csv.ts`: RFC 4180 quoting (a cell with a comma, quote, CR or LF is quoted, quotes doubled) and the formula guard: a string cell starting with `=`, `+`, `-` or `@` gets a `'` prefix before quoting. Numbers are never prefixed. Rows end with CRLF.

**Interfaces — produces**
```ts
// reveal-copy.ts
export function lockedLine(hidden: readonly { label: string; points: number }[]): string | null;
export function revealingGlass(glass: number): string;
export function revealHeaderMeta(step: number, inPlay: number, host: string): string;
export function rankDeltaPill(delta: { before: number; after: number }): string | null;

// result-copy.ts
export function resultEyebrow(tasting: string): string;
export function placingLines(p: { mode: RevealMode; rank: number; tied: boolean; competitors: number; score: number; maximum: number }): { ordinal: string; line: string };
export function hostedLines(h: { winners: readonly string[]; points: number; mode: RevealMode }): { title: string; line: string };
export function bestGlassLines(b: { points: number; max: number; glass: number; name: string }): { score: string; name: string };
export function strongestLines(s: { category: ResultCategory; hits: number; inPlay: number }): { title: string; detail: string; caption: string };
export function glassTitle(g: { wineSource: WineSourceMode; contributor: string | null; shortName: string }): string;
export function shortWineName(w: { wineName: string | null; appellation: string | null; producer: string | null }): string;
export function agreedLeastLine(a: { glass: number; title: string; mode: RevealMode; sentence: SplitSentence; pickLabel: string | null }): string;
export function excludedLines(glasses: readonly { glass: number; reason: "half_revealed" | "unrevealed" | "no_answer_key" }[]): string[];
export type ShareInput =
  | { kind: "placed"; mode: RevealMode; ordinal: string; competitors: number; tasting: string; score: number; maximum: number }
  | { kind: "hosted"; tasting: string; winners: readonly string[] };
export function shareText(s: ShareInput): string;
export function shareLabel(opts: { phone: boolean }): string;
export const LINK_COPIED = "Link copied";
export const SEE_EVERY_WINE = "See every wine";
export const YOU_FINISHED = "You finished";
export const FINAL_STANDINGS = "Final standings";   // S12b laptop table heading
export const GLASS_BY_GLASS = "Glass by glass";     // S13 rows heading
export function legendLabels(opts: { phone: boolean }): { hit: string; miss: string }; // laptop "you had it" / "you missed"; phone "had it" / "missed"

// record-pattern.ts (spec §11.3 item 15)
export type CategoryRate = { category: ResultCategory; hits: number; inPlay: number };
export type RecordPattern = { everyTime: ResultCategory[]; weakest: CategoryRate; backedBy: number };
export function recordPattern(current: readonly CategoryRate[], earlier: readonly (readonly CategoryRate[])[]): RecordPattern | null;
export function patternSentence(pattern: RecordPattern): string;

// csv.ts
export type CsvCell = string | number | null | undefined;
export function csvRow(cells: readonly CsvCell[]): string;
export function csvDocument(rows: readonly (readonly CsvCell[])[]): string;
```

**Tests (write first)** — `src/lib/reveal-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { lockedLine, rankDeltaPill, revealHeaderMeta, revealingGlass } from "./reveal-copy";

describe("reveal copy (S11, S11b)", () => {
  it("the locked line", () => {
    expect(lockedLine([{ label: "Producer", points: 6 }, { label: "Vintage", points: 2 }])).toBe(
      "Producer and vintage are worth 8 between them. Nothing you do now changes them — the guess is locked.",
    );
    expect(lockedLine([{ label: "Appellation", points: 5 }, { label: "Producer", points: 6 }, { label: "Vintage", points: 2 }])).toBe(
      "Appellation, producer and vintage are worth 13 between them. Nothing you do now changes them — the guess is locked.",
    );
    expect(lockedLine([{ label: "Vintage", points: 2 }])).toBe("Vintage is worth 2. Nothing you do now changes it — the guess is locked.");
    expect(lockedLine([])).toBeNull();
  });
  it("the laptop header and the delta pill", () => {
    expect(revealingGlass(3)).toBe("Revealing glass 3");
    expect(revealHeaderMeta(4, 6, "Christian")).toBe("4 of 6 attributes · Christian is driving");
    expect(rankDeltaPill({ before: 2, after: 1 })).toBe("▲ 2nd → 1st");
    expect(rankDeltaPill({ before: 1, after: 3 })).toBe("▼ 1st → 3rd");
    expect(rankDeltaPill({ before: 2, after: 2 })).toBeNull();
  });
});
```

**Tests (write first)** — `src/lib/result-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  FINAL_STANDINGS, GLASS_BY_GLASS, LINK_COPIED, SEE_EVERY_WINE, agreedLeastLine, bestGlassLines, excludedLines,
  glassTitle, hostedLines, legendLabels, placingLines, resultEyebrow, shareLabel, shareText, shortWineName, strongestLines,
} from "./result-copy";

describe("the placing (S12, S12b)", () => {
  it("blind and semi-blind", () => {
    expect(placingLines({ mode: "BLIND", rank: 2, tied: false, competitors: 7, score: 93, maximum: 180 }))
      .toEqual({ ordinal: "2nd", line: "of 7 · 93 of 180 points" });
    expect(placingLines({ mode: "SEMI_BLIND", rank: 1, tied: true, competitors: 5, score: 4, maximum: 6 }))
      .toEqual({ ordinal: "=1st", line: "of 5 · 4 of 6 matched" });
    expect(resultEyebrow("Nebbiolo vs Sangiovese")).toBe("Nebbiolo vs Sangiovese · finished");
  });
  it("a host-provides host", () => {
    expect(hostedLines({ winners: ["Maja"], points: 27, mode: "BLIND" })).toEqual({ title: "You hosted", line: "Maja won with 27 points" });
    expect(hostedLines({ winners: ["Maja", "Gustav"], points: 27, mode: "BLIND" }).line).toBe("Maja and Gustav shared first with 27 points");
    expect(hostedLines({ winners: ["Maja", "Gustav", "Ida"], points: 4, mode: "SEMI_BLIND" }).line).toBe("Maja, Gustav and Ida shared first with 4 matches");
  });
});

describe("the cards", () => {
  it("best glass and strongest attribute", () => {
    expect(bestGlassLines({ points: 26, max: 30, glass: 6, name: "Le Pergole Torte" })).toEqual({ score: "26 / 30", name: "Glass 6 · Le Pergole Torte" });
    expect(strongestLines({ category: "primary_grape", hits: 4, inPlay: 6 })).toEqual({ title: "Grapes right", detail: "4 of 6", caption: "your best category" });
    expect(strongestLines({ category: "type_designation", hits: 1, inPlay: 1 }).title).toBe("Designations right");
    expect(strongestLines({ category: "secondary_grape", hits: 1, inPlay: 2 }).title).toBe("Second grapes right");
  });
});

describe("the agreed-least line", () => {
  const title = "Gustav's Brunello di Montalcino";
  it("said, got and none", () => {
    expect(agreedLeastLine({ glass: 4, title, mode: "BLIND", sentence: { kind: "said", pickId: "g", count: 5, outOf: 7 }, pickLabel: "Nebbiolo" }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino. Five of seven said Nebbiolo.");
    expect(agreedLeastLine({ glass: 4, title, mode: "BLIND", sentence: { kind: "got", pickId: "g", hits: 2, outOf: 7 }, pickLabel: "Sangiovese" }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino. Two of seven got the grape.");
    expect(agreedLeastLine({ glass: 4, title, mode: "SEMI_BLIND", sentence: { kind: "got", pickId: "k", hits: 3, outOf: 12 }, pickLabel: "x" }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino. Three of 12 got it.");
    expect(agreedLeastLine({ glass: 4, title, mode: "BLIND", sentence: { kind: "said", pickId: "g", count: 11, outOf: 12 }, pickLabel: "Nebbiolo" }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino. 11 of 12 said Nebbiolo.");
    expect(agreedLeastLine({ glass: 4, title, mode: "BLIND", sentence: { kind: "none", outOf: 7 }, pickLabel: null }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino.");
  });
  it("titles and short names", () => {
    expect(glassTitle({ wineSource: "PARTICIPANT_CONTRIBUTED", contributor: "Gustav", shortName: "Brunello di Montalcino" })).toBe(title);
    expect(glassTitle({ wineSource: "HOST_PROVIDES", contributor: null, shortName: "Le Pergole Torte" })).toBe("Le Pergole Torte");
    expect(shortWineName({ wineName: "Le Pergole Torte", appellation: "Toscana IGT", producer: "Montevertine" })).toBe("Le Pergole Torte");
    expect(shortWineName({ wineName: null, appellation: "Barbaresco DOCG", producer: "Produttori del Barbaresco" })).toBe("Barbaresco");
    expect(shortWineName({ wineName: null, appellation: "Saint-Émilion Grand Cru AOP", producer: "x" })).toBe("Saint-Émilion Grand Cru");
    expect(shortWineName({ wineName: null, appellation: null, producer: "Montevertine" })).toBe("Montevertine");
  });
});

describe("excluded glasses", () => {
  it.each([
    [[{ glass: 5, reason: "unrevealed" }], ["Glass 5 was never revealed"]],
    [[{ glass: 5, reason: "unrevealed" }, { glass: 6, reason: "no_answer_key" }], ["Glasses 5 and 6 were never revealed"]],
    [[{ glass: 4, reason: "half_revealed" }], ["Glass 4 was only partly revealed"]],
    [[{ glass: 4, reason: "unrevealed" }, { glass: 5, reason: "unrevealed" }, { glass: 6, reason: "unrevealed" }], ["Glasses 4, 5 and 6 were never revealed"]],
    [[{ glass: 3, reason: "half_revealed" }, { glass: 4, reason: "half_revealed" }, { glass: 6, reason: "unrevealed" }],
      ["Glasses 3 and 4 were only partly revealed", "Glass 6 was never revealed"]],
  ] as const)("%j", (glasses, lines) => expect(excludedLines(glasses)).toEqual(lines));
});

describe("share", () => {
  it("text and labels", () => {
    expect(shareText({ kind: "placed", mode: "BLIND", ordinal: "2nd", competitors: 7, tasting: "Nebbiolo vs Sangiovese", score: 93, maximum: 180 }))
      .toBe("2nd of 7 at Nebbiolo vs Sangiovese — 93 of 180 points");
    expect(shareText({ kind: "placed", mode: "SEMI_BLIND", ordinal: "1st", competitors: 5, tasting: "Six Nebbiolos", score: 4, maximum: 6 }))
      .toBe("1st of 5 at Six Nebbiolos — 4 of 6 matched");
    expect(shareText({ kind: "hosted", tasting: "Nebbiolo vs Sangiovese", winners: ["Maja"] })).toBe("Nebbiolo vs Sangiovese — Maja won");
    expect(shareLabel({ phone: true })).toBe("Share the result");
    expect(shareLabel({ phone: false })).toBe("Share");
    expect(LINK_COPIED).toBe("Link copied");
    expect(SEE_EVERY_WINE).toBe("See every wine");
    expect(FINAL_STANDINGS).toBe("Final standings");
    expect(GLASS_BY_GLASS).toBe("Glass by glass");
    expect(legendLabels({ phone: false })).toEqual({ hit: "you had it", miss: "you missed" });
    expect(legendLabels({ phone: true })).toEqual({ hit: "had it", miss: "missed" });
  });
});
```

**Tests (write first)** — `src/lib/record-pattern.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { patternSentence, recordPattern, type CategoryRate } from "./record-pattern";

const r = (category: CategoryRate["category"], hits: number, inPlay: number): CategoryRate => ({ category, hits, inPlay });
const tonight = [r("country", 6, 6), r("region", 6, 6), r("appellation", 3, 6), r("primary_grape", 4, 6), r("producer", 1, 6), r("vintage", 2, 6)];
const backer = [r("country", 5, 6), r("region", 6, 6), r("producer", 0, 6)];

describe("recordPattern (RECORD-11)", () => {
  it("needs two earlier tastings behind it", () => {
    expect(recordPattern(tonight, [backer])).toBeNull();
    expect(recordPattern(tonight, [backer, backer])).toEqual({ everyTime: ["country", "region"], weakest: r("producer", 1, 6), backedBy: 2 });
  });
  it("an earlier tasting backs it only past both thresholds", () => {
    const soft = [r("country", 4, 6), r("region", 6, 6), r("producer", 0, 6)];   // country 0.67 < 0.8
    const strong = [r("country", 6, 6), r("region", 6, 6), r("producer", 3, 6)]; // producer 0.5 > 0.34
    expect(recordPattern(tonight, [backer, soft, strong])).toBeNull();
  });
  it("every time needs at least three in play; the weakest must be at most a third", () => {
    expect(recordPattern([r("country", 2, 2), r("producer", 0, 6)], [backer, backer])).toBeNull();
    expect(recordPattern([r("country", 6, 6), r("producer", 3, 6)], [backer, backer])).toBeNull();
  });
  it("the sentence", () => {
    const p = recordPattern(tonight, [backer, backer]);
    if (!p) throw new Error("expected a pattern");
    expect(patternSentence(p)).toBe(
      "Country and region every time, the producer once in six. That pattern is now three tastings old — it shows up in your numbers too.",
    );
    expect(patternSentence({ ...p, weakest: r("producer", 0, 6) })).toBe(
      "Country and region every time, the producer never in six. That pattern is now three tastings old — it shows up in your numbers too.",
    );
    expect(patternSentence({ everyTime: ["primary_grape"], weakest: r("vintage", 2, 6), backedBy: 4 })).toBe(
      "The grape every time, the vintage twice in six. That pattern is now five tastings old — it shows up in your numbers too.",
    );
  });
});
```

**Tests (write first)** — `src/lib/csv.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { csvDocument, csvRow } from "./csv";

describe("csv (RFC 4180 and the formula guard)", () => {
  it("quotes only when needed", () => {
    expect(csvRow(["a", "b", 3, null])).toBe("a,b,3,");
    expect(csvRow(["a,b"])).toBe('"a,b"');
    expect(csvRow(['He said "hi"'])).toBe('"He said ""hi"""');
    expect(csvRow(["line1\nline2"])).toBe('"line1\nline2"');
  });
  it("neutralises formula starts in strings, never in numbers", () => {
    expect(csvRow(["=SUM(A1)", "+1", "-2", "@cmd", -2])).toBe("'=SUM(A1),'+1,'-2,'@cmd,-2");
    expect(csvRow(["=a,b"])).toBe("\"'=a,b\"");
  });
  it("a document ends every row with CRLF", () => {
    expect(csvDocument([["glass", "revealed"], [1, "yes"]])).toBe("glass,revealed\r\n1,yes\r\n");
  });
});
```

**Steps**
- [ ] Write the four tests; watch them fail; implement; green; eslint.

**Acceptance:** `npx vitest run src/lib/reveal-copy.test.ts src/lib/result-copy.test.ts src/lib/record-pattern.test.ts src/lib/csv.test.ts` is green.

**Closes:** spec §11.5 (pure tests); ledger B10 (copy, pattern, export); map REVEAL-08 (copy), REVEAL-11 (copy), RESULT-02, RESULT-03, RESULT-07, RESULT-08, RESULT-09, RESULT-11 (copy), RESULT-12 (copy), RESULT-14 (copy), RECORD-11, RECORD-12 (CSV); supporting: RESULT-10.

---

### BT-P8 — Paste list and place

**Depends on:** BT-SQL2 (the `tasting_places` types)

**OWNS**
- create `src/app/tastings/new/paste-list.ts`, `paste-list.test.ts`
- create `src/app/tastings/new/place.ts`, `place.test.ts`

**Does** (spec §2.3 item 7; §13.3 items 2–3)
- `paste-list.ts`: split pasted text (trim, drop blank lines and list markers `-`, `*`, `•`, `1.`, `2)`, collapse spaces, at most 24 lines) and pick a unique catalog match: every folded token of the line (`foldWords` from `src/lib/wine-identity/fold.ts`, relative import) equals a folded word of exactly one candidate title.
- `place.ts`: `normalisePlace` (trim, collapse whitespace, at most 200 characters, empty → null) and the two helpers every place read and write goes through. They take the caller's Supabase client, so reads run under the viewer's RLS (null for anyone who may not see the place). Only `import type` from `@supabase/supabase-js` and `@/lib/supabase/database.types`.

**Interfaces — produces**
```ts
// paste-list.ts
export const MAX_PASTE_LINES = 24;
export function splitPastedLines(text: string): string[];
export type PasteCandidate = { id: string; title: string };
export function pickPasteMatch(line: string, candidates: readonly PasteCandidate[]): string | null;
export function couldntMatchHeading(n: number): string;   // "Couldn't match 2 lines" / "Couldn't match 1 line"
export const PASTE_LIST_BUTTON = "Paste a list";
export const ADD_THESE = "Add these";

// place.ts
export const PLACE_MAX = 200;
export const PLACE_TOO_LONG = "Keep the place under 200 characters.";
export const PLACE_LABEL = "Where?";
export const PLACE_PLACEHOLDER = "a place or an address";
export function normalisePlace(input: string): { place: string | null } | { error: string };
export async function setTastingPlace(supabase: SupabaseClient<Database>, tastingId: string, input: string): Promise<{ ok: true } | { error: string }>;
export async function getTastingPlace(supabase: SupabaseClient<Database>, tastingId: string): Promise<string | null>;
```
`setTastingPlace`: `normalisePlace`; an error is returned before any write; `null` deletes the row; otherwise `upsert({ tasting_id, place }, { onConflict: "tasting_id" })`.

**Tests (write first)** — `src/app/tastings/new/paste-list.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { MAX_PASTE_LINES, couldntMatchHeading, pickPasteMatch, splitPastedLines } from "./paste-list";

describe("splitPastedLines (S2 'Paste a list')", () => {
  it("trims, drops blanks and list markers, collapses spaces", () => {
    expect(splitPastedLines("1. Vietti Barolo 2017\n- Produttori  Barbaresco 2018\n\n  • Montevertine   Le Pergole Torte \r\n2) Fèlsina\n* Poggio di Sotto"))
      .toEqual(["Vietti Barolo 2017", "Produttori Barbaresco 2018", "Montevertine Le Pergole Torte", "Fèlsina", "Poggio di Sotto"]);
  });
  it("keeps a year that only looks like a marker", () => {
    expect(splitPastedLines("2016 Barolo")).toEqual(["2016 Barolo"]);
  });
  it("caps at 24 lines", () => {
    expect(MAX_PASTE_LINES).toBe(24);
    expect(splitPastedLines(Array.from({ length: 30 }, (_, i) => `Wine ${i}`).join("\n"))).toHaveLength(24);
  });
});

describe("pickPasteMatch", () => {
  const rows = [
    { id: "w1", title: "Vietti, Barolo Castiglione 2017" },
    { id: "w2", title: "Vietti, Barolo Rocche di Castiglione 2015" },
    { id: "w3", title: "Château Palmer 2010" },
  ];
  it("one row holding every folded token → its id", () => {
    expect(pickPasteMatch("Vietti Barolo 2017", rows)).toBe("w1");
    expect(pickPasteMatch("chateau palmer", rows)).toBe("w3");
  });
  it("two candidates, none, or an empty line → null", () => {
    expect(pickPasteMatch("Vietti Barolo", rows)).toBeNull();
    expect(pickPasteMatch("Giacosa", rows)).toBeNull();
    expect(pickPasteMatch("   ", rows)).toBeNull();
  });
  it("the unmatched heading", () => {
    expect(couldntMatchHeading(2)).toBe("Couldn't match 2 lines");
    expect(couldntMatchHeading(1)).toBe("Couldn't match 1 line");
  });
});
```

**Tests (write first)** — `src/app/tastings/new/place.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { PLACE_TOO_LONG, normalisePlace } from "./place";

describe("normalisePlace (B12)", () => {
  it("trims and collapses whitespace", () => {
    expect(normalisePlace("  Christian's   place,\n Nørrebro ")).toEqual({ place: "Christian's place, Nørrebro" });
  });
  it("empty clears", () => {
    expect(normalisePlace("")).toEqual({ place: null });
    expect(normalisePlace(" \n ")).toEqual({ place: null });
  });
  it("200 characters at most", () => {
    expect(normalisePlace("x".repeat(200))).toEqual({ place: "x".repeat(200) });
    expect(normalisePlace("x".repeat(201))).toEqual({ error: PLACE_TOO_LONG });
    expect(PLACE_TOO_LONG).toBe("Keep the place under 200 characters.");
  });
});
```

**Steps**
- [ ] Write both tests; watch them fail; implement; green; tsc check; eslint.

**Acceptance:** `npx vitest run src/app/tastings/new/paste-list.test.ts src/app/tastings/new/place.test.ts` is green; the tsc check is clean.

**Closes:** spec §2.5 (paste test), §13.5 (place test); ledger B1 ("Paste a list"), B12 (writes normalised); map CREATE-39 (logic), CREATE-11 (validation); supporting: GUEST-10, LOBBY-42, XCUT-50.

---

## Track BT-D — Dark means live (B5)

### BT-D1 — Tokens, `LiveShell`, the dark popover, `LocalDateTime` formats

**Depends on:** BT-A0 (`globals.css`, `popover.tsx` and `invitation-row.tsx` sit in the add-wine review window; the Taste & Rate lane's pending `.wset-row` hairline shares `globals.css`)

**OWNS**
- modify `src/app/globals.css`
- create `src/components/live-shell.tsx`
- modify `src/components/ui/popover.tsx`
- modify `src/components/local-date-time.tsx`
- create `src/lib/tasting-date-format.ts`, `src/lib/tasting-date-format.test.ts`
- modify `src/components/tastings/invitation-row.tsx` (the hover hex only)

**Does** (spec §6.3 items 1, 2, 5; §3.3 item 1 date formats; refinement 8)
- **Tokens:** the table of spec §6.3 item 1, with exactly those values. Add `--surface-deep` and `--primary-hover` to `:root` and `.dark`; complete `.dark` with `--gold-dark`, `--gold-light`, `--rose`, `--miss`, `--border`, `--border-light`, `--border-strong`, `--muted-foreground`, `--background`, `--card`, `--popover`; add `--color-surface-deep` and `--color-primary-hover` to `@theme inline`. `--console`, `--console-card`, `--console-ink` stay as they are. `.dark --primary` stays `#a8425a`.
- **`LiveShell`** (client), spec §6.3 item 2 verbatim: active renders `<div className="dark flex flex-1 flex-col bg-background text-foreground">` inside a context; inactive renders a fragment. `useLiveTheme()` reads the context.
- **Popover:** `PopoverContent` adds the class `dark` when `useLiveTheme() === "dark"`. Keep `keepMounted`, `positionMethod="fixed"` and the touch `initialFocus` rule exactly as they are. `Dialog` is untouched (the add-wine sheet keeps its own look).
- **Dates:** `LocalDateTime` gains `format?: "default" | "eyebrow" | "eyebrow-short" | "card"` and keeps its `useSyncExternalStore` server snapshot. The strings come from the pure `formatTastingDate(iso, format, timeZone?)`: English words, the viewer's time zone (undefined → the runtime's), 24-hour clock.
- **Hover:** `invitation-row.tsx`'s `hover:bg-[#4A1523]` becomes `hover:bg-primary-hover`. The other raw hovers move with the tasks that own their files: BT-C1 (`new-tasting-sheet.tsx:590`), BT-C3 (`invite-step.tsx:80`), BT-Y2 (`field-picker.tsx:320`), BT-D2 (`page.tsx:575`, as it moves) and BT-S3 (`match-ladder.tsx`, deleted). BT-A0: `by-hand-form.tsx:376` no longer applies — S3b (`63fc436`) already removed every `#4A1523` from that file, so BT-L3 owns no raw hover here. Files no BT task owns — `src/components/wset/wset-sheet.tsx:67` (Taste & Rate), `src/components/overview/action-button.tsx:10` and `src/app/overview/invitation-row.tsx:67` (Overview) — go to their lanes as a follow-up the main session queues once BT-D1 lands; add-wine deletes `src/components/add-wine/scan-confirm.tsx`.

**Interfaces — produces**
```ts
// src/components/live-shell.tsx
export function LiveShell(props: { active: boolean; children: React.ReactNode }): React.JSX.Element;
export function useLiveTheme(): "dark" | null;

// src/components/local-date-time.tsx
export function LocalDateTime(props: { iso: string; format?: TastingDateFormat }): React.JSX.Element;

// src/lib/tasting-date-format.ts
export type TastingDateFormat = "default" | "eyebrow" | "eyebrow-short" | "card";
export function formatTastingDate(iso: string, format: Exclude<TastingDateFormat, "default">, timeZone?: string): string;
```

**Tests (write first)** — `src/lib/tasting-date-format.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { formatTastingDate } from "./tasting-date-format";

describe("formatTastingDate (S4 eyebrow, S5 card, S5b chip)", () => {
  const iso = "2026-09-10T17:00:00Z"; // 19:00 in Copenhagen (CEST)
  it("formats in the given zone, English words, 24-hour clock", () => {
    expect(formatTastingDate(iso, "eyebrow", "Europe/Copenhagen")).toBe("Thursday 10 Sep 19:00");
    expect(formatTastingDate(iso, "eyebrow-short", "Europe/Copenhagen")).toBe("Thursday 19:00");
    expect(formatTastingDate(iso, "card", "Europe/Copenhagen")).toBe("Thursday 10 Sep, 19:00");
  });
  it("an invalid date is an empty part", () => {
    expect(formatTastingDate("not a date", "eyebrow", "UTC")).toBe("");
  });
});
```

**Steps**
- [ ] Write the test; watch it fail; implement `tasting-date-format.ts`; green.
- [ ] Tokens, `LiveShell`, popover, `LocalDateTime`, the hover token.
- [ ] Contrast check (not committed): a one-off node script in the scratchpad computing WCAG ratios for `#d4af6a` and `#b9a98c` text on `#1b1310` and `#241b16`, and `#f5efe3` on `#b04961` (the dark `--primary-hover`). Report the numbers; every one must be at least 4.5 (expected 8.84, 8.15, 7.95, 7.33 and 4.62).
- [ ] tsc check, eslint.

**Acceptance**
- `npx vitest run src/lib/tasting-date-format.test.ts` is green.
- `rg -n "\-\-surface-deep|\-\-primary-hover|color-surface-deep|color-primary-hover" src/app/globals.css` shows `:root`, `.dark` and `@theme inline` entries.
- `rg -n "#4A1523" src/components/tastings src/components/live-shell.tsx src/components/ui` prints nothing; the report lists the handed-off lane files.
- The contrast report shows every ratio ≥ 4.5.

**Closes:** spec §6.3 items 1, 2, 5, §6.6 (contrast); ledger B5 (tokens, shell); map XCUT-01 (mechanism), XCUT-04 (popover), PLAY-02 (popover), XCUT-11, XCUT-20, GUEST-09 (formats), LOBBY-01 (date format); supporting: PLAY-01.

---

### BT-D2 — The running page split into views, inside the live shell

**Depends on:** AW-S7 (`page.tsx`), BT-A0, BT-D1, BT-P1, BT-P3

**OWNS**
- modify `src/app/tastings/[id]/page.tsx`
- create `src/app/tastings/[id]/view-route.ts`, `src/app/tastings/[id]/view-route.test.ts`
- create `src/app/tastings/[id]/lobby-view.tsx`
- create `src/app/tastings/[id]/invitation-view.tsx`
- create `src/app/tastings/[id]/guest-lobby.tsx`
- create `src/app/tastings/[id]/running-view.tsx`
- create `src/app/tastings/[id]/finished-view.tsx`
- create `src/app/tastings/[id]/tasting-page-header.tsx`
- create `src/app/tastings/[id]/wines-card.tsx`
- create `src/app/tastings/[id]/participants-card.tsx`
- modify `src/lib/tasting-request-cache.ts`

**Does** (spec §6.3 item 3; §3 and §4 "the page split"; refinement 3; B2 "one running page", B5)
- A refactor with two behaviour changes: everything below `AppHeader` on an IN_PROGRESS tasting renders inside `<LiveShell active>`, and the running view keeps the Wines card after Start for the host and for a JOINED bring-your-own contributor (below). No copy, layout or data change otherwise; later tasks restyle.
- **Routing** (pure `view-route.ts`):
  - reveal mode OPEN and the tasting has started (`status !== "DRAFT"`) → `"open-board"` (BT-A0: S7 gates the existing `open-board.tsx` branch on `running && isOpen`, page.tsx:721, where `running = hasStarted` at page.tsx:111; a DRAFT OPEN tasting falls through to the DRAFT routing below, page.tsx's DRAFT branch at :821+, so this needs `status !== "DRAFT"` too, not a bare reveal-mode check);
  - status CLOSED → `"finished"` (an INVITED viewer's T4 "This tasting has finished" card renders first inside it);
  - viewer INVITED (not host) → `"invitation"`;
  - status DRAFT: JOINED non-host → `"guest-lobby"`; everyone else who can read the tasting → `"lobby"`;
  - otherwise (IN_PROGRESS, legacy status OPEN) → `"running"`.
- **`page.tsx`** loads only the tasting row and the viewer's participant row (through `tasting-request-cache.ts`), calls `notFound()` as today, and renders the routed view with `{ tastingId }`. It stays under 120 lines.
- **Views load their own data** through the `React.cache` getters in `src/lib/tasting-request-cache.ts`: reuse `getCurrentUser`, `getTastingRow`, `getParticipantRows`, `getWineRows` and `getReferenceOptions`, and add `getViewerParticipant(tastingId)`. No view depends on props from `page.tsx`.
- **Moved without change:**
  - the header (thumbnail, name, description, badges, the `/rules` link, `HostControlsMenu`) → `tasting-page-header.tsx`;
  - AW-S7's Wines card → `wines-card.tsx`;
  - the Participants card → `participants-card.tsx`;
  - the DRAFT host lobby layout (Start, cards, `TastingScanRegistrar`, `SheetFromQuery`) → `lobby-view.tsx`;
  - the INVITED card → `invitation-view.tsx`;
  - the JOINED guest's DRAFT layout → `guest-lobby.tsx`;
  - the IN_PROGRESS board (navigator, standings aside, `PlayExperience`, `AutoRefresh`, `RevealSync`, registrar) → `running-view.tsx`, wrapped in `LiveShell`, **plus `WinesCard` and `SheetFromQuery`** for the host and for a JOINED bring-your-own contributor (S7's own gate is `showWinesWhileRunning = isHost || myWineIds.length > 0`, page.tsx:395). The host sees every row as today; a contributor sees their own rows with Edit and the others' as labels (AW-S7's contributor view). BT-A0: in landed S7, `editableWineIds` (page.tsx:364) is computed inline from each glass's `editable` flag (page.tsx:354-358: the adder, not CLOSED, not revealed, and incomplete or `reveal_step === 0`) — this task replaces that inline computation so `editableWineIds` instead holds the viewer's added glasses for which `glassEditRefusal` returns null (BT-P1), so Edit, Swap and Remove stay reachable after Start (spec §3.3 item 4). The contributor's separate Add button (`page.tsx:787`, `addWineButton && !showWinesWhileRunning`) goes, because the card carries Add; in a semi-blind tasting after Start `canAddWine` is already false in landed S7 (`semiBlindAddRefusal`, page.tsx:179, spec §10.3 item 7 — f67dd9c);
  - the CLOSED board → `finished-view.tsx`.
- Moved code that carries `hover:bg-[#4A1523]` switches to `hover:bg-primary-hover`.
- The shared components keep the `({ tastingId }: { tastingId: string })` signature (Contract dependencies).

**Interfaces — produces**
```ts
// src/app/tastings/[id]/view-route.ts
export type TastingView = "open-board" | "finished" | "invitation" | "guest-lobby" | "lobby" | "running";
export function routeTastingView(input: {
  revealMode: RevealMode; status: TastingStatus; viewerStatus: ParticipantStatus | null; isHost: boolean;
}): TastingView;

// every view and shared card: async server components
export function LobbyView(props: { tastingId: string }): Promise<React.JSX.Element>;
export function InvitationView(props: { tastingId: string }): Promise<React.JSX.Element>;
export function GuestLobby(props: { tastingId: string }): Promise<React.JSX.Element>;
export function RunningView(props: { tastingId: string }): Promise<React.JSX.Element>;
export function FinishedView(props: { tastingId: string }): Promise<React.JSX.Element>;
export function TastingPageHeader(props: { tastingId: string }): Promise<React.JSX.Element>;
export function WinesCard(props: { tastingId: string }): Promise<React.JSX.Element | null>;
export function ParticipantsCard(props: { tastingId: string }): Promise<React.JSX.Element>;
```

**Tests (write first)** — `src/app/tastings/[id]/view-route.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { routeTastingView } from "./view-route";

describe("routeTastingView (B2 one running page, B3, B5)", () => {
  it.each([
    [{ revealMode: "OPEN", status: "IN_PROGRESS", viewerStatus: "JOINED", isHost: false }, "open-board"],
    [{ revealMode: "BLIND", status: "CLOSED", viewerStatus: "INVITED", isHost: false }, "finished"],
    [{ revealMode: "BLIND", status: "CLOSED", viewerStatus: "JOINED", isHost: false }, "finished"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: "INVITED", isHost: false }, "invitation"],
    [{ revealMode: "SEMI_BLIND", status: "IN_PROGRESS", viewerStatus: "INVITED", isHost: false }, "invitation"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: "JOINED", isHost: false }, "guest-lobby"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: "JOINED", isHost: true }, "lobby"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: "DECLINED", isHost: false }, "lobby"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: null, isHost: true }, "lobby"],
    [{ revealMode: "BLIND", status: "IN_PROGRESS", viewerStatus: "JOINED", isHost: false }, "running"],
    [{ revealMode: "BLIND", status: "OPEN", viewerStatus: null, isHost: false }, "running"],
    // BT-A0: a DRAFT OPEN tasting gets the lobby, not open-board (S7 gates
    // OpenBoard on `running && isOpen`, page.tsx:721).
    [{ revealMode: "OPEN", status: "DRAFT", viewerStatus: "JOINED", isHost: true }, "lobby"],
  ] as const)("%j → %s", (input, view) => expect(routeTastingView(input)).toBe(view));
});
```

**Steps**
- [ ] Read AW-S7's `page.tsx` end to end; list every viewer class it renders (host, JOINED, INVITED, DECLINED, a reader of a revealed tasting) and what each sees.
- [ ] Write the routing test from that list; watch it fail; implement `view-route.ts`.
- [ ] Add the cached getters; extract the shared cards; extract the five views; reduce `page.tsx` to the router.
- [ ] Wrap the running view in `LiveShell`.
- [ ] Bare `npx tsc --noEmit`; eslint; `npm run build`.

**Acceptance**
- `npx vitest run "src/app/tastings/[id]/view-route.test.ts"` is green; a bare tsc prints nothing; `npm run build` passes.
- `wc -l "src/app/tastings/[id]/page.tsx"` ≤ 120.
- `rg -n "#4A1523" "src/app/tastings/[id]"` prints nothing.
- `rg -n "LiveShell" "src/app/tastings/[id]/running-view.tsx"` matches.
- `rg -n "WinesCard|SheetFromQuery" "src/app/tastings/[id]/running-view.tsx"` matches both; `rg -n "glassEditRefusal" "src/app/tastings/[id]"` matches where `editableWineIds` is computed.
- The report lists each viewer class with the view it now gets, matching the pre-split behaviour except the dark shell and the running Wines card.

**Closes:** spec §6.3 item 3, §3.3 item 4 (the running page's Wines card); refinements 3, 21; ledger B5 (dark while IN_PROGRESS), B2 (one running page; Edit, Swap and Remove until the first step); map PLAY-04, XCUT-08, XCUT-01 (mount), XCUT-06 (surface), XCUT-57 (dark for every IN_PROGRESS timing), GUEST-18 (routing), GUEST-38, LOBBY-34 (reachable after Start); supporting: PLAY-01, REVEAL-10, XCUT-05, XCUT-11.

---

## Track BT-C — Create (B1)

### BT-C1 — Create step 1: name chips, place, rules, Start landing

**Depends on:** AW-S6 (`tastings/new/actions.ts`, `new-tasting-sheet.tsx`), BT-A0, BT-P8, BT-M2 (live), BT-M6 (live: `wines.added_by_host` for the poured region)

**OWNS**
- modify `src/app/tastings/new/setup-copy.ts`, `src/app/tastings/new/setup-copy.test.ts`
- modify `src/lib/tasting-eyebrow.ts`, `src/lib/tasting-eyebrow.test.ts`
- modify `src/lib/tasting-lifecycle-copy.ts`, `src/lib/tasting-lifecycle-copy.test.ts`
- modify `src/app/taste/taste-archive-math.test.ts` (the "live semi-blind host" case only)
- modify `src/app/tastings/new/new-tasting-form.tsx`
- modify `src/app/tastings/new/actions.ts` (everything except `listFlight`)
- modify `src/app/tastings/new/page.tsx` (the suggestion call only)
- modify `src/components/new-tasting-sheet.tsx` (the suggestion call, the footer notes, place in setup state, `hover:bg-[#4A1523]` at :590 → `hover:bg-primary-hover`)

**Does** (spec §2.3 items 1–5, 12–13; §3.3 item 14 bullets 1–2; §13.3 item 2; refinements 9, 10)
1. **Name chips.** `nameSuggestions({ today, scheduledLocal, revealMode, pouredRegion })`: chip 1 "{Weekday} blind|semi-blind" from the scheduled date when it parses, else today; chip 2 "{region} #{n}" only when `pouredRegion` is set (the "Burgundy #1" fallback goes); chip 3 "Six glasses, no mercy". The form recomputes them from its controlled mode and date.
2. **Poured region.** `getPouredRegionSuggestion()` replaces `getNameSuggestionContext()` (both callers change): the caller's hosted tastings → their wines with `added_by_host` (M6) OR `is_revealed` → `wine_answers.region_id` → pure `pickPouredRegion(rows, names)`. Every read under the caller's RLS; no `guesses` read (the old one goes).
3. **Place row.** "Where?" with "optional" beside the date on laptops and under it on phones; a controlled input, placeholder `PLACE_PLACEHOLDER`, `maxLength={200}`. `SetupValues` gains `place: string` and `description: string` (both default `""`); `buildSetupFormData` sets `place` and `description`. `createTasting` and `updateTastingSetup` validate with `normalisePlace` before any write, then call `setTastingPlace(supabase, tastingId, place)` after the tasting row write.
4. **Rules.** `flowApplies(v)` = `v.revealMode !== "OPEN" && v.timingMode === "LIVE"`; `leaderboardApplies(v)` = `v.revealMode === "BLIND" && v.timingMode === "LIVE" && v.flow === "GUIDED"`; semi-blind `rulesSummary` / `rulesSummaryShort` per spec §2.3 item 4 (first letter upper-cased when no flow word leads); `setupColumns` stores `sequential_guessing` for non-OPEN LIVE GUIDED; `flowWord` (`tasting-eyebrow.ts`) says "Guided" for any non-OPEN LIVE tasting with `sequentialGuessing`.
5. **Footers.** Step 1 shows `STEP1_FOOTER_NOTE` ("A name is all it takes. Wines and people can wait — the tasting exists from here and you can leave it empty."). Phone step 2 gets a full-width "Create and finish later" text button under "Invite people →", with step 1's close-without-navigation handler (refinement 9).
6. **Step 3 helpers** (consumed by BT-C3): `readySummary` takes optional `place` and `phone`, adds "everyone brings" for bring-your-own, and drops "add more as you pour" when `phone` (S3b); `friendContextLine(summary)`.
7. **Start landing.** `startLandsOnConsole` is true for LIVE + HOST_PROVIDES + (BLIND or SEMI_BLIND). Flip the `taste-archive-math.test.ts` case "a live semi-blind host also lands on the lobby" to expect `/tastings/t1/host` and rename it "a live semi-blind host-provides host lands on the console too (B6)". The report tells the main session to update the R-ledger's R5 row ("host of a LIVE blind tasting → `/host`") to match.
8. **Settings rules on the server.** `settingsChangeRefusal` + `SETTINGS_LOCKED_AFTER_START` in `setup-copy.ts`. `updateTastingSetup` reads status, wine count and the stored locked fields, returns the refusal before any write, and accepts name, description, image, `scheduled_at` and place in IN_PROGRESS, CLOSED and legacy OPEN.

**Interfaces**
- Consumes: `normalisePlace`, `setTastingPlace`, `PLACE_PLACEHOLDER`, `PLACE_LABEL` (BT-P8).
- Produces:
  ```ts
  // setup-copy.ts
  export type SetupValues = { /* existing fields */ place: string; description: string };
  export function nameSuggestions(input: { today: Date; scheduledLocal: string; revealMode: RevealMode; pouredRegion: { region: string; n: number } | null }): string[];
  export function pickPouredRegion(rows: readonly { tastingId: string; regionId: string }[], names: ReadonlyMap<string, string>): { region: string; n: number } | null;
  export function readySummary(input: { setup: SetupValues; wineCount: number; invitedCount: number; dateText: string | null; place?: string | null; phone?: boolean }): string[];
  export function friendContextLine(summary: { tastingsAttended: number; winesGuessed: number; averagePoints: number } | undefined): string;
  export type LockedSetup = Pick<SetupValues, "revealMode" | "timingMode" | "wineSource" | "flow" | "leaderboardReveal" | "asyncRevealPolicy">;
  export const SETTINGS_LOCKED_AFTER_START = "Mode, timing, rules and who brings the wines lock once the tasting has started.";
  export function settingsChangeRefusal(input: { status: TastingStatus; wineCount: number; before: LockedSetup; after: LockedSetup }): string | null;
  export const STEP1_FOOTER_NOTE: string;
  // actions.ts
  export async function getPouredRegionSuggestion(): Promise<{ region: string; n: number } | null>;
  // TastingSetupFields gains place?: string
  ```

**Tests (write first)** — in `src/app/tastings/new/setup-copy.test.ts`, replace the two `nameSuggestions` cases and the semi-blind `rulesSummary` / `rulesSummaryShort` cases with these, and add the rest:
```ts
describe("nameSuggestions (B1)", () => {
  const thursday = new Date(2026, 8, 10, 12); // Thursday 10 Sep 2026
  it("the scheduled weekday, else today, and the mode word", () => {
    expect(nameSuggestions({ today: thursday, scheduledLocal: "", revealMode: "BLIND", pouredRegion: { region: "Piedmont", n: 5 } }))
      .toEqual(["Thursday blind", "Piedmont #5", "Six glasses, no mercy"]);
    expect(nameSuggestions({ today: thursday, scheduledLocal: "2026-09-12T19:00", revealMode: "SEMI_BLIND", pouredRegion: null }))
      .toEqual(["Saturday semi-blind", "Six glasses, no mercy"]);
  });
  it("an unparsable date falls back to today", () => {
    expect(nameSuggestions({ today: thursday, scheduledLocal: "nonsense", revealMode: "BLIND", pouredRegion: null })[0]).toBe("Thursday blind");
  });
});

describe("pickPouredRegion", () => {
  const names = new Map([["piemonte", "Piedmont"], ["toscana", "Tuscany"], ["a", "Alsace"], ["b", "Bordeaux"]]);
  it("the region poured most, numbered by the tastings that poured it", () => {
    const rows = [
      { tastingId: "t1", regionId: "piemonte" }, { tastingId: "t1", regionId: "piemonte" },
      { tastingId: "t2", regionId: "piemonte" }, { tastingId: "t2", regionId: "toscana" },
      { tastingId: "t3", regionId: "toscana" },
    ];
    expect(pickPouredRegion(rows, names)).toEqual({ region: "Piedmont", n: 3 });
    expect(pickPouredRegion([], names)).toBeNull();
    expect(pickPouredRegion([{ tastingId: "t1", regionId: "gone" }], names)).toBeNull();
  });
  it("ties go to the name first in the alphabet", () => {
    expect(pickPouredRegion([{ tastingId: "t1", regionId: "b" }, { tastingId: "t2", regionId: "a" }], names)).toEqual({ region: "Alsace", n: 2 });
  });
});

describe("guided pacing for LIVE semi-blind (B6 pour pointer)", () => {
  const semi = { ...base, revealMode: "SEMI_BLIND" as const };
  it("flow applies to any LIVE non-OPEN tasting; the leaderboard stays blind-only", () => {
    expect(flowApplies(semi)).toBe(true);
    expect(flowApplies({ ...semi, timingMode: "ASYNC" })).toBe(false);
    expect(flowApplies({ ...base, revealMode: "OPEN" })).toBe(false);
    expect(leaderboardApplies(semi)).toBe(false);
    expect(leaderboardApplies(base)).toBe(true);
  });
  it("semi-blind rules summaries", () => {
    expect(rulesSummary(semi)).toBe("Guided · one point for each glass you match");
    expect(rulesSummary({ ...semi, flow: "FREE" })).toBe("Free · one point for each glass you match");
    expect(rulesSummary({ ...semi, timingMode: "ASYNC" })).toBe("One point for each glass you match · results after everyone has guessed");
    expect(rulesSummaryShort(semi)).toBe("Guided · 1 pt a match");
    expect(rulesSummaryShort({ ...semi, flow: "FREE" })).toBe("Free · 1 pt a match");
    expect(rulesSummaryShort({ ...semi, timingMode: "ASYNC", asyncRevealPolicy: "IMMEDIATE" })).toBe("1 pt a match · results at once");
  });
});

describe("readySummary with a place and bring-your-own (B1 step 3)", () => {
  it("restates every choice", () => {
    expect(readySummary({ setup: { ...base, wineSource: "PARTICIPANT_CONTRIBUTED" }, wineCount: 0, invitedCount: 2, dateText: "DATE", place: "Nørrebro" }))
      .toEqual(["Blind", "live", "guided", "everyone brings", "0 wines so far", "DATE", "Nørrebro", "2 invited", "add more as you pour"]);
    expect(readySummary({ setup: base, wineCount: 1, invitedCount: 0, dateText: null, place: null }))
      .toEqual(["Blind", "live", "guided", "1 wine so far", "no date", "0 invited", "add more as you pour"]);
    expect(readySummary({ setup: base, wineCount: 3, invitedCount: 2, dateText: "DATE", phone: true }))
      .toEqual(["Blind", "live", "guided", "3 wines so far", "DATE", "2 invited"]);
  });
});

describe("friendContextLine (CREATE-48)", () => {
  it("tastings and average, or new to Blindr", () => {
    expect(friendContextLine({ tastingsAttended: 9, winesGuessed: 40, averagePoints: 19.12 })).toBe("9 tastings · 19.1 avg");
    expect(friendContextLine({ tastingsAttended: 1, winesGuessed: 6, averagePoints: 12 })).toBe("1 tasting · 12.0 avg");
    expect(friendContextLine({ tastingsAttended: 0, winesGuessed: 0, averagePoints: 0 })).toBe("new to Blindr");
    expect(friendContextLine(undefined)).toBe("new to Blindr");
  });
});

describe("settingsChangeRefusal (S4d)", () => {
  const locked = { revealMode: "BLIND", timingMode: "LIVE", wineSource: "HOST_PROVIDES", flow: "GUIDED", leaderboardReveal: "PER_ATTRIBUTE", asyncRevealPolicy: "AFTER_ALL" } as const;
  it("DRAFT: everything, except the wine source once wines exist", () => {
    expect(settingsChangeRefusal({ status: "DRAFT", wineCount: 0, before: locked, after: { ...locked, revealMode: "SEMI_BLIND", wineSource: "PARTICIPANT_CONTRIBUTED" } })).toBeNull();
    expect(settingsChangeRefusal({ status: "DRAFT", wineCount: 2, before: locked, after: { ...locked, wineSource: "PARTICIPANT_CONTRIBUTED" } })).toBe(WINE_SOURCE_LOCKED);
  });
  it("after Start: mode, timing, rules and wine source lock", () => {
    for (const status of ["IN_PROGRESS", "CLOSED", "OPEN"] as const) {
      expect(settingsChangeRefusal({ status, wineCount: 3, before: locked, after: locked })).toBeNull();
      expect(settingsChangeRefusal({ status, wineCount: 3, before: locked, after: { ...locked, timingMode: "ASYNC" } })).toBe(SETTINGS_LOCKED_AFTER_START);
      expect(settingsChangeRefusal({ status, wineCount: 3, before: locked, after: { ...locked, leaderboardReveal: "PER_WINE" } })).toBe(SETTINGS_LOCKED_AFTER_START);
    }
    expect(SETTINGS_LOCKED_AFTER_START).toBe("Mode, timing, rules and who brings the wines lock once the tasting has started.");
  });
});
```
Add `pickPouredRegion`, `friendContextLine`, `settingsChangeRefusal`, `SETTINGS_LOCKED_AFTER_START` to the file's import list.

`src/lib/tasting-eyebrow.test.ts` — replace the SEMI_BLIND LIVE `sequentialGuessing: true` expectation:
```ts
it("LIVE semi-blind with guided pacing reads Guided (B6)", () => {
  expect(flowWord({ revealMode: "SEMI_BLIND", timingMode: "LIVE", sequentialGuessing: true })).toBe("Guided");
  expect(flowWord({ revealMode: "SEMI_BLIND", timingMode: "LIVE", sequentialGuessing: false })).toBe("Free order");
  expect(flowWord({ revealMode: "OPEN", timingMode: "LIVE", sequentialGuessing: true })).toBe("Free order");
});
```

`src/lib/tasting-lifecycle-copy.test.ts` — replace the `startLandsOnConsole` table:
```ts
describe("startLandsOnConsole (B6: LIVE semi-blind host-provides too)", () => {
  it.each([
    [{ timingMode: "LIVE", revealMode: "BLIND", wineSource: "HOST_PROVIDES" }, true],
    [{ timingMode: "LIVE", revealMode: "SEMI_BLIND", wineSource: "HOST_PROVIDES" }, true],
    [{ timingMode: "LIVE", revealMode: "SEMI_BLIND", wineSource: "PARTICIPANT_CONTRIBUTED" }, false],
    [{ timingMode: "LIVE", revealMode: "BLIND", wineSource: "PARTICIPANT_CONTRIBUTED" }, false],
    [{ timingMode: "ASYNC", revealMode: "SEMI_BLIND", wineSource: "HOST_PROVIDES" }, false],
    [{ timingMode: "LIVE", revealMode: "OPEN", wineSource: "HOST_PROVIDES" }, false],
  ] as const)("%j → %s", (t, v) => expect(startLandsOnConsole(t)).toBe(v));
});
```

**Steps**
- [ ] Update the three test files and the archive case; watch the new cases fail.
- [ ] Implement the helpers until green.
- [ ] Form: chips, place row, footer note; sheet: suggestion call, phone step-2 button, place state; `page.tsx` suggestion call.
- [ ] Actions: `getPouredRegionSuggestion`, `setupColumns`, place writes, status-aware `updateTastingSetup`.
- [ ] `npm test` (the helpers are imported by other tests), bare tsc, eslint.

**Acceptance**
- `npm test` is green; a bare `npx tsc --noEmit` prints nothing.
- `rg -n "getNameSuggestionContext|Burgundy #1" src` prints nothing.
- `rg -n "sequential_guessing" src/app/tastings/new/actions.ts` shows the non-OPEN LIVE GUIDED condition.
- `rg -n "setTastingPlace" src/app/tastings/new/actions.ts` matches in both `createTasting` and `updateTastingSetup`.

**Closes:** spec §2.3 items 1–5, 12, 13; §3.3 item 14 (bullets 1–2); §13.3 item 2; §2.5; ledger B1 (name suggestions, place row, rules card, Start lands per B6), B12 (writes), B6 (semi-blind LIVE host-provides lands on the console); map CREATE-04, CREATE-10, CREATE-11, CREATE-13, CREATE-14 (semi-blind), CREATE-17, CREATE-20, CREATE-43, CREATE-53 (helper), CREATE-56, HOST-32, SB-13 (stored pacing), SB-34, GUEST-08, LOBBY-36 (server), LOBBY-39 (field), LOBBY-40 (lock rule), LOBBY-42 (write), LOBBY-46 (lock rule); supporting: GUEST-10, CREATE-48, XCUT-50.

---

### BT-C2 — Create step 2: drag handles, "Paste a list", contributor rows arriving

**Depends on:** AW-S6, AW-F13, BT-A0, BT-P8, BT-L1

**OWNS**
- modify `src/app/tastings/new/flight-step.tsx`
- create `src/app/tastings/new/paste-list-panel.tsx`

**Does** (spec §2.3 items 6–8; B1 step 2)
- **Drag handles.** "⋮⋮" on every flight row (pointer events with `setPointerCapture`; the drop index is `dropIndex(rowRects, pointerY)` from BT-P1). ▲▼ stay as the keyboard fallback. Both call `moveFlightGlass(tastingId, wineId, toIndex)` through the step's existing write queue; the list reorders optimistically with `reorderIds`; a refusal reverts it and shows the returned sentence inline. The `moveWine` import goes.
- **Paste a list.** A secondary text button `PASTE_LIST_BUTTON` opens `PasteListPanel` inline under the flight (a controlled textarea inside the step, not a nested dialog).
  - "Add these" runs `splitPastedLines`, then for each line in order: F13's `searchAddWine` exactly as the step's inline search calls it; the catalog group's rows become `{ id: catalogWineId, title }` with the step's own row-title formatter; `pickPasteMatch`.
  - A match → `addToFlight(destination, { kind: "catalog", catalogWineId, via: "search" })`.
  - Unmatched lines are listed under `couldntMatchHeading(n)`, each with "By hand" → `openAddWineSheet(destination, { start: "byhand" })`.
  - Paste never adds an incomplete glass. The textarea stays controlled; the button shows progress while lines resolve.
- Waiting contributor rows keep AW-S6's design: no ✕ (not adopted).
- **Contributor rows arrive** (spec §2.3 item 8; `CREATE-38`). In bring-your-own, step 2 re-reads the flight every 5 seconds while it is open and `document.visibilityState` is `visible` — BT-A0: `FlightStep` never calls `listFlight` itself; the sheet does (`refreshFlight`, `new-tasting-sheet.tsx:182-184`), passed down as `<FlightStep snapshot onChanged={() => refreshFlight(tastingId)}>` (`:404-410`), so this task calls its `onChanged` prop on the 5-second interval, not a `listFlight` call of its own. BT-C2 does not own `new-tasting-sheet.tsx`. A read never interrupts a drag or the paste panel, and waits for the write queue to drain.

**Interfaces**
- Consumes: `moveFlightGlass` (BT-L1); `reorderIds`, `dropIndex` (BT-P1); `splitPastedLines`, `pickPasteMatch`, `couldntMatchHeading`, `PASTE_LIST_BUTTON`, `ADD_THESE` (BT-P8); `searchAddWine`, `addToFlight` (AW-F13); `useAddWine().openAddWineSheet` (AW-S5c).
- Produces: `PasteListPanel({ destination, onAdded }: { destination: Extract<AddWineDestination, { kind: "flight" }>; onAdded: () => void })`.

**Tests:** none new; the logic is BT-P1's and BT-P8's. BT-V5 evening 1 covers the UI.

**Steps**
- [ ] Drag handles and the queue; paste panel; bare tsc; eslint.

**Acceptance**
- A bare `npx tsc --noEmit` prints nothing.
- `rg -n "moveWine" src/app/tastings/new/flight-step.tsx` prints nothing.
- `rg -n "PasteListPanel" src/app/tastings/new/flight-step.tsx` matches.
- `rg -n "visibilityState" src/app/tastings/new/flight-step.tsx` matches.

**Closes:** spec §2.3 items 6–8; ledger B1 (drag handles, paste, no ✕ on waiting rows); map CREATE-30, CREATE-39, CREATE-34 (✕ on waiting rows not adopted), CREATE-37, CREATE-38 (rows arrive).

---

### BT-C3 — Create step 3: friend rows, context lines, people search

**Depends on:** BT-C1, BT-J1

**OWNS**
- modify `src/app/tastings/new/invite-step.tsx`
- modify `src/app/tastings/new/invite-field.tsx`
- create `src/app/tastings/new/people-search.ts`
- create `src/lib/ilike.ts`, `src/lib/ilike.test.ts`
- modify `src/components/new-tasting-sheet.tsx` (friend context lines, place and `phone` into the summary)

**Does** (spec §2.3 items 9, 10, 12; B1 step 3)
- **Friends.** Chips from `md`; full rows below `md` (32px avatar, name, context line, 22px check disc; a selected row is gold-bordered). The sheet fetches `getFriendContextLines(friendIds)` once the friends resolve (SSR or lazy) and passes the map down. With no friends the "browse People to add some" message still renders (CLAUDE.md).
- **Name or email.** The "+ email or name" chip (laptop) and the "Name, or an email address" field (phone):
  - text containing "@" behaves as today (an email chip);
  - other text of 2+ characters calls a debounced (250 ms) `searchPeople(query, excludeIds)`: up to 8 profiles by `display_name ilike`, the query escaped by pure `escapeIlike` (`%`, `_` and the backslash; `src/app/catalog/new/actions.ts:46` keeps a private copy of the same rule, left as it is), excluding the caller and anyone already chosen;
  - picking a person adds their email to the invite list, exactly as a friend pick does;
  - no match shows "No one on Blindr by that name — type their email instead." (spec copy; a constant in `invite-field.tsx`).
- **Summary.** `readySummary({ setup, wineCount, invitedCount, dateText, place: setup.place, phone })` — phones end at "{n} invited" (S3b).
- **Context lines** are only "{n} tastings · {avg} avg" or "new to Blindr"; S3b's "brings wine N" and last-tasting lines are not built (Never build).
- `invite-step.tsx:80`'s `hover:bg-[#4A1523]` → `hover:bg-primary-hover`.
- Every input stays controlled.

**Interfaces**
- Consumes: `readySummary`, `friendContextLine` (BT-C1); `getBulkProfileSummaries` (`src/lib/profile-stats.ts`).
- Produces (`src/app/tastings/new/people-search.ts`, `"use server"`):
  ```ts
  export async function searchPeople(query: string, excludeIds: string[]): Promise<{ id: string; display_name: string; avatar_url: string | null; email: string }[]>;
  export async function getFriendContextLines(ids: string[]): Promise<Record<string, string>>;
  // src/lib/ilike.ts (pure)
  export function escapeIlike(text: string): string;
  ```

**Tests (write first)** — `src/lib/ilike.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { escapeIlike } from "./ilike";

describe("escapeIlike (people search)", () => {
  it("escapes the ilike wildcards and the escape character, and nothing else", () => {
    expect(escapeIlike("Maja")).toBe("Maja");
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("a_b")).toBe("a\\_b");
    expect(escapeIlike("back\\slash")).toBe("back\\\\slash");
    expect(escapeIlike("Søren O'Neil")).toBe("Søren O'Neil");
  });
});
```
BT-C1 covers `friendContextLine`; BT-V5 covers the UI.

**Steps**
- [x] `people-search.ts`; the invite field; the step's rows; the sheet's context fetch; bare tsc; eslint.

**Acceptance**
- A bare `npx tsc --noEmit` prints nothing.
- `rg -n "^\"use server\"" src/app/tastings/new/people-search.ts` matches.
- `rg -n "browse People" src/app/tastings/new/invite-step.tsx` matches (the empty state stays).
- `npx vitest run src/lib/ilike.test.ts` is green; `rg -n "escapeIlike" src/app/tastings/new/people-search.ts` matches; `rg -n "#4A1523" src/app/tastings/new/invite-step.tsx` prints nothing.

**Closes:** spec §2.3 items 9, 10, 12; ledger B1 step 3 (rows on phone, context lines, typed non-email searches People, gold summary); map CREATE-46, CREATE-47, CREATE-48, CREATE-49, CREATE-53.

---

## Track BT-J — Joining late (B4)

### BT-J1 — Invites until CLOSED and the link hint

**Depends on:** BT-A0, BT-P1, BT-M4 (live: the RPC must accept late joins before the copy says so)

**OWNS**
- modify `src/app/tastings/[id]/actions.ts` (`inviteToTasting` only)
- modify `src/app/tastings/new/join-link-row.tsx`
- modify `src/app/tastings/new/invite-step.tsx` (the `JoinLinkRow` props only)
- modify `src/app/tastings/[id]/host-controls.tsx` (the `JoinLinkRow` props and the running menu's invite section)

**Does** (spec §5.3 items 1, 3; §2.3 item 11; B4; Q6)
- `inviteToTasting` refuses only CLOSED, with `INVITES_CLOSE_WHEN_ENDED`; the OPEN branch folds into it.
- `JoinLinkRow`: the prop `worksUntilStart: boolean` becomes `showExpiryHint?: boolean` (default `true`), and the hint reads `LINK_WORKS_UNTIL_END`. Both callers change.
- `HostControls`' running menu offers the invite field and the share link for every tasting that is not CLOSED. `invitesStayOpen` is ignored and marked `/** @deprecated removed in BT-L2 */` (its last passer lives in the header BT-L2 rewrites).

**Interfaces**
- Consumes: `INVITES_CLOSE_WHEN_ENDED`, `LINK_WORKS_UNTIL_END` (BT-P1).
- Produces: `JoinLinkRow({ tastingId, showExpiryHint?, active?, className? })`.

**Tests:** none new (BT-P1 covers the copy; BT-SQL4's probe covers the RPC).

**Steps**
- [ ] The action; the row and its callers; the running menu; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "Invites close once|Works until you start|worksUntilStart" src` prints nothing.

**Closes:** spec §5.3 items 1, 3; §2.3 item 11; ledger B4; Q6; map CREATE-52, XCUT-59 (invites), LOBBY-47 (invites stay open).

---

## Track BT-L — Lobby and editing (B2)

### BT-L1 — Flight glass server rules: reorder, remove, the edit guard

**Depends on:** AW-F13 (`tasting-wine-writes.ts`), BT-A0, BT-P1, BT-J1 (`tastings/[id]/actions.ts` order), BT-M6 (live)

**OWNS**
- create `src/app/tastings/[id]/flight-actions.ts`
- modify `src/app/tastings/[id]/actions.ts` (`removeWine`, `moveWine`, `setLeaderboardReveal`, `updateSchedule` only)
- modify `src/app/tastings/[id]/wines/new/tasting-wine-writes.ts` (`editRefusal`, the three refusal constants, `resolveTastingAdder`'s semi-blind refusal, and `GlassState` / `loadGlassState`'s `tastings` select — BT-A0: add `reveal_mode` — only)

**Does** (spec §3.3 items 5, 10, 12, 14; ledger B2; B0 edit guard)
- **`flight-actions.ts`** (`"use server"`):
  - `moveFlightGlass(tastingId, wineId, toIndex)`: signed-in user; `rpc("move_flight_glass", { p_wine_id: wineId, p_to_index: toIndex })`; an error returns the RPC's own sentence with its first letter upper-cased and a closing period (spec §2.3 item 6: "shows the RPC's sentence"); success revalidates `/tastings/{tastingId}`.
  - `getGlassRemovalImpact(wineId)`: `rpc("glass_removal_impact", { p_wine_id: wineId })` → the first row as `{ guesses, privateNotes }`, or null (not the adder).
- **`actions.ts`:**
  - `removeWine(tastingId, wineId)`: read the tasting's status, reveal mode and host, the wine's `is_revealed` and `reveal_step`, whether any later glass in list order is revealed or has `reveal_step > 0`, and whether the caller is the adder (`is_wine_adder`, as F10 does); return `glassRemoveRefusal(...)` as `{ error }` before touching anything. Then `rpc("remove_flight_glass", { p_wine_id })`, which deletes and renumbers in one transaction whoever the adder is; the per-row renumbering loop goes (a contributor's updates would touch 0 rows). The RPC is the floor. Its signature stays.
  - `moveWine(formData)`: `/** @deprecated removed in BT-L2 */`, a thin ±1 wrapper over `moveFlightGlass`.
  - `setLeaderboardReveal`: returns without writing unless the tasting is DRAFT (the rules lock).
  - `updateSchedule`: `/** @deprecated removed in BT-L4 */` (the settings sheet's When row saves through `updateTastingSetup`).
- **`tasting-wine-writes.ts`:**
  - First diff F10's three refusal strings in AW-F13's committed file against BT-P1's constants. BT-A0: `TASTING_CLOSED` (`:72`), `NOT_ADDER` (`:75`) and `ALREADY_REVEALED` (`:76`) are byte-identical to `flight-glass-rules.ts:28-30` already — F13 reworded nothing, so this diff is a no-op; still run it and report the result.
  - BT-A0: as landed, `GlassState` (`tasting-wine-writes.ts:553-560`) carries no reveal mode, and `loadGlassState`'s `tastings` select (`:582`) reads only `status` — this task adds `reveal_mode` to both, so `editRefusal(state)` returns `glassEditRefusal({ tastingStatus: state.status, revealMode, isRevealed: state.isRevealed, revealStep: state.revealStep, viewerIsAdder: true, viewerIsHost: false, laterGlassSeen: false })` (the adder is checked where it is today; `revealMode` now comes from `state`, read with the status). `TASTING_CLOSED`, `NOT_ADDER` and `ALREADY_REVEALED` import from `@/lib/flight-glass-rules`; the other local constants stay. A complete glass at `reveal_step > 0` now reads `GLASS_STEP_STARTED`.
  - `resolveTastingAdder` returns `semiBlindAddRefusal({ revealMode, tastingStatus })` as its refusal before any insert, so no path adds a glass to a started semi-blind tasting (spec §10.3 item 7); M9b's trigger is the floor.

**Interfaces**
- Consumes: `glassEditRefusal`, `glassRemoveRefusal`, `semiBlindAddRefusal`, the refusal constants (BT-P1); `remove_flight_glass` (BT-SQL6).
- Produces:
  ```ts
  export async function moveFlightGlass(tastingId: string, wineId: string, toIndex: number): Promise<{ ok: true } | { error: string }>;
  export async function getGlassRemovalImpact(wineId: string): Promise<{ guesses: number; privateNotes: number } | null>;
  ```

**Tests:** none new (BT-P1 covers the rules; BT-SQL6's probe covers the database).

**Steps**
- [ ] `flight-actions.ts`; the four `actions.ts` edits; the write-path delegation; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "glassRemoveRefusal" "src/app/tastings/[id]/actions.ts"` and `rg -n "glassEditRefusal" "src/app/tastings/[id]/wines/new/tasting-wine-writes.ts"` match.
- `rg -n "reopen it to add wines" src` matches only `src/lib/flight-glass-rules.ts`.
- `rg -n "remove_flight_glass" "src/app/tastings/[id]/actions.ts"` matches; `rg -n -U 'from\("wines"\)\s*\.delete' "src/app/tastings/[id]/actions.ts"` prints nothing; `rg -n "semiBlindAddRefusal" "src/app/tastings/[id]/wines/new/tasting-wine-writes.ts"` matches.

**Closes:** spec §3.3 items 5, 10, 12, 14 (`setLeaderboardReveal`, `updateSchedule`), §10.3 item 7 (server); ledger B2 (Remove after Start, reorder), B0 (edit guard until the first step); Q7 (server); map LOBBY-07 (server), LOBBY-32 (server), LOBBY-34, CREATE-30 (server).

---

### BT-L4 — The Tasting settings sheet (S4d)

**Depends on:** BT-C1, BT-C3, BT-L1, BT-P1, BT-P4

**OWNS**
- create `src/app/tastings/[id]/tasting-settings-sheet.tsx`
- create `src/app/tastings/[id]/tasting-settings-button.tsx`
- create `src/app/tastings/[id]/settings-actions.ts`
- modify `src/app/tastings/new/new-tasting-form.tsx`
- modify `src/app/tastings/[id]/host-controls.tsx`
- modify `src/app/tastings/[id]/actions.ts` (delete `updateSchedule` only)

**Does** (spec §3.3 items 13–14; ledger B2 S4d; B4)
- **`getTastingSettings(tastingId)`** (`"use server"`, host only): the current `SetupValues` (description, place via `getTastingPlace`), status, wine count, `sequential_guessing`, the host's friends (the create sheet's query), and the unrevealed glasses for End's confirm.
- **`TastingSettingsButton`** (client): from `md` a labelled button (gear icon + "Tasting settings", `border-[1.5px] border-primary bg-card`); on phones a 34px icon button with `aria-label="Tasting settings"`. It loads the settings on first open and renders the sheet.
- **`TastingSettingsSheet`** (client Dialog, full screen below `sm`, like `new-tasting-sheet.tsx`):
  - eyebrow `settingsEyebrow(status)`, title `SETTINGS_TITLE`, ✕, one Save → `updateTastingSetup(tastingId, fields)`; a refusal shows inline;
  - body: `NewTastingForm mode="settings"` — Name; Description (a controlled textarea); "Change photo"; the mode tiles with `MODE_STILL_CHANGEABLE` in DRAFT; When; Where; the timing pair; the wine-source pair (locked with `WINE_SOURCE_LOCKED` once wines exist); the rules card. After Start, mode, timing, rules and wine source render read-only;
  - footer: `SETTINGS_FOOTER_DRAFT`, or `SETTINGS_FOOTER_STARTED` after Start;
  - after Start, the guided-pacing toggle (`setSequentialGuessing`) for LIVE blind and LIVE semi-blind;
  - below a rule, under `ONLY_ONCE_EXISTS`: `MANAGE_INVITATIONS` (an inner view with `InviteField`, the friend picker and `JoinLinkRow`, offered while the tasting is not CLOSED); "Delete the tasting" as an inline two-tap (`twoTapState`, `deleteTastingLabel`; the second tap submits `deleteTasting`); for a running or finished tasting also End (keeping `window.confirm(endTastingConfirm(unrevealed))`, spec §19.2) and Reopen. BT-K1 adds the hand-hosting row.
- **`NewTastingForm`** gains `mode?: "create" | "settings"` and `status?: TastingStatus`; create mode is unchanged.
- **`host-controls.tsx`:** the `"menu"` surface's pieces become the sheet's controls (End, Reopen, the pacing toggle, the delete two-tap); the schedule form and the `updateSchedule` import go; the `"start"` surface stays.
- **`actions.ts`:** delete `updateSchedule` once `rg` shows no importer.
- Every input stays controlled; the sheet never auto-focuses a field on touch.

**Interfaces**
- Consumes: `SetupValues`, `updateTastingSetup`, `settingsChangeRefusal` (BT-C1); `InviteField` (BT-C3); `JoinLinkRow` (BT-J1); the settings copy (BT-P1); `twoTapState` (BT-P4).
- Produces:
  ```ts
  // settings-actions.ts
  export type TastingSettings = {
    setup: SetupValues; status: TastingStatus; wineCount: number; sequentialGuessing: boolean;
    friends: { id: string; display_name: string; email: string }[];
    unrevealedGlasses: UnrevealedGlass[];
  };
  export async function getTastingSettings(tastingId: string): Promise<TastingSettings | { error: string }>;
  // tasting-settings-button.tsx
  export function TastingSettingsButton(props: { tastingId: string; phone: boolean }): React.JSX.Element;
  // tasting-settings-sheet.tsx
  export function TastingSettingsSheet(props: { tastingId: string; open: boolean; onOpenChange: (open: boolean) => void; settings: TastingSettings }): React.JSX.Element;
  ```

**Tests:** none new (BT-P1, BT-P4, BT-C1 cover the rules and copy).

**Steps**
- [ ] The settings action; the form's settings mode; the sheet and button; the host-controls fold-in; delete `updateSchedule`; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "updateSchedule" src` prints nothing.
- `rg -n "window\.confirm\(" "src/app/tastings/[id]/host-controls.tsx" "src/app/tastings/[id]/tasting-settings-sheet.tsx" | rg -v "endTastingConfirm"` prints nothing.

**Closes:** spec §3.3 items 13–14; ledger B2 (S4d); map LOBBY-35, LOBBY-36, LOBBY-37, LOBBY-38, LOBBY-39, LOBBY-40, LOBBY-41, LOBBY-42 (field), LOBBY-43, LOBBY-44, LOBBY-45, LOBBY-46, LOBBY-47, LOBBY-49, LOBBY-50, XCUT-37 (Delete two-tap); supporting: CREATE-09, LOBBY-04, XCUT-50.

---

### BT-L2 — The lobby (S4, S4b)

**Depends on:** AW-S7, BT-D2, BT-L1, BT-L4, BT-C2, BT-P1, BT-P8

**OWNS**
- modify `src/app/tastings/[id]/lobby-view.tsx`
- modify `src/app/tastings/[id]/tasting-page-header.tsx`
- modify `src/app/tastings/[id]/wines-card.tsx`
- modify `src/app/tastings/[id]/participants-card.tsx`
- modify `src/app/tastings/[id]/wine-flight-list.tsx`
- create `src/app/tastings/[id]/start-bar.tsx`
- modify `src/app/tastings/[id]/host-controls.tsx` (delete the deprecated `invitesStayOpen` only)
- modify `src/app/tastings/[id]/actions.ts` (delete the deprecated `moveWine` only)
- delete `src/app/tastings/[id]/host-controls-menu.tsx`

**Does** (spec §3.3 items 1–8; ledger B2; B12 lobby display)
1. **Header** (`tasting-page-header.tsx`, every status):
   - laptop eyebrow `lobbyEyebrowParts(t, { phone: false })` around `<LocalDateTime format="eyebrow">`; phone `{ phone: true }` with `format="eyebrow-short"`;
   - beside it the existing `/rules` link: "Danish Championship scoring" (BLIND) or "Semi-blind scoring" (SEMI_BLIND);
   - the name (Cormorant), the description, and a place line (`MapPin` + `getTastingPlace`) — RLS gives it only to the host, JOINED and INVITED;
   - the host gets `TastingSettingsButton` in place of `HostControlsMenu`;
   - a HOST_PROVIDES guest gets the chip `glassesSoFarPhrase(count)` under the eyebrow.
2. **Wines card** (`wines-card.tsx`, `wine-flight-list.tsx`):
   - title row with AW-S7's `AddToFlightButton`; caption `winesCaption(n, { phone })` for the HOST_PROVIDES host only;
   - rows keep AW-S7's content, plus the "⋮⋮" drag handle before "Wine N" on laptops;
   - an incomplete glass reads `flightRowNeeds(missing)` on laptops and `describeMissing(missing)` (the short "needs a vintage", `src/lib/wine-identity/describe.ts`) on phones, in `--gold-dark`;
   - compact phone rows drop the region and the provenance;
   - ▲▼ and drag both call `moveFlightGlass`, reordering optimistically with `reorderIds` (a drag's place from `dropIndex`) and refusing locally with `crossesSeenGlass`; a refusal reverts and shows the sentence;
   - HOST_PROVIDES: no Wines card for anyone but the host. PARTICIPANT_CONTRIBUTED: AW-S7's contributor and waiting rows, identity only on the viewer's own rows.
3. **Start** (`start-bar.tsx`, host only, wrapping `HostControls surface="start"`): on laptops an inline gold button below the Wines card (`bg-gold text-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)]`) with `START_CAPTION`; on phones a full-width gold button in a top-bordered bar pinned to the bottom (`pb-[max(12px,env(safe-area-inset-bottom))]`), with bottom padding on the page so the last row stays visible. Start's warning shows inline under it.
4. **Participants** (`participants-card.tsx`): JOINED and INVITED listed; the count is `participantsSummary(rows).count`; DECLINED collapses to `declinedLine`; the host row reads "You · host" with a bordeaux avatar and no status badge; the stats line from `getBulkProfileSummaries` reads "{n} tastings · {avg} avg" (the location / favourite-wine line stays, CLAUDE.md rich-card rule); `bringsWineLine(firstGlass)` for bring-your-own contributors; phone chips ("You · host" bordeaux fill, "{name} ✓", "{name} · invited" with a gold border and `--gold-dark` text); footer `PARTICIPANTS_FOOTER`.
5. **Deletions:** `host-controls-menu.tsx`, `moveWine`, `invitesStayOpen`.
- Tokens only.

**Interfaces**
- Consumes: BT-P1 lobby copy; `getTastingPlace` (BT-P8); `moveFlightGlass` (BT-L1); `TastingSettingsButton` (BT-L4); `LocalDateTime format` (BT-D1).
- Produces: `StartBar(props: { tastingId: string }): Promise<React.JSX.Element | null>`.

**Tests:** none new.

**Steps**
- [ ] Header; Wines card and rows; Start bar; Participants; deletions; bare tsc; eslint.

**Acceptance**
- A bare `npx tsc --noEmit` prints nothing.
- `rg -n "HostControlsMenu|moveWine\b|invitesStayOpen" src` prints nothing.
- `rg -n "#4A1523|bg-white" "src/app/tastings/[id]/lobby-view.tsx" "src/app/tastings/[id]/tasting-page-header.tsx" "src/app/tastings/[id]/wines-card.tsx" "src/app/tastings/[id]/participants-card.tsx" "src/app/tastings/[id]/wine-flight-list.tsx" "src/app/tastings/[id]/start-bar.tsx"` prints nothing.

**Closes:** spec §3.3 items 1–8; ledger B2 (header, labelled settings button, Wines card, Start, Participants), B12 (lobby place line); map LOBBY-01, LOBBY-03, LOBBY-04, LOBBY-05, LOBBY-07, LOBBY-08, LOBBY-13, LOBBY-14, LOBBY-17, LOBBY-18, LOBBY-19, LOBBY-20, LOBBY-21, LOBBY-23, LOBBY-24, LOBBY-25, LOBBY-26, LOBBY-42 (display), GUEST-35, XCUT-21 (Start shadow), XCUT-28; supporting: XCUT-11, XCUT-50.

---

### BT-L3 — Edit a wine: Swap and Remove (S4c)

**Depends on:** AW-S3b, AW-S5a, AW-S5b, AW-S5c, AW-F13, BT-A0, BT-L1, BT-P1, BT-M5, BT-M6, TR-R6 (BT-A0: `add-wine-context.tsx:238-242` already forwards `AddWineOpenOptions` whole, so the conditional is resolved — TR-R6 is a plain dependency, committed `d11f9a6`)

**OWNS**
- modify `src/components/add-wine/types.ts` (`AddWineOpenOptions.swap` only)
- modify `src/components/add-wine/sheet-state.ts`, `src/components/add-wine/sheet-state.test.ts` (add the swap state and two actions; never rename one)
- modify `src/components/add-wine/add-wine-sheet.tsx` (the swap header and footer; adds routed to the swap)
- modify `src/components/add-wine/use-sheet-adds.ts` (call `swapFlightGlass` while swapping)
- modify `src/components/add-wine/by-hand-form.tsx` (the two rows in flight-edit mode; the impact line — BT-A0: no `#4A1523` hover left to rename here, S3b (`63fc436`) already removed every occurrence from this file)
- modify `src/components/add-wine/actions.ts` (`swapFlightGlass`)

**Does** (spec §3.3 items 9, 11, 12; ledger B2 S4c)
- **Two rows** at the bottom of the by-hand form, rendered only when the session edits a flight glass — `session.origin.kind === "glass"`, F12's origin `{ kind: "glass"; wineId; incomplete }` (BT-A0: `sheet-state.ts:56`, the glass variant of the `origin` union at `:52-56`), never a `destination.kind` test (add-wine G1 gate 4 scans `by-hand-form.tsx`) — and each only while its refusal is null (`glassSwapRefusal`, `glassRemoveRefusal`): `swapCopy(n).row` with `swapCopy(n).rowSub` and a chevron; `swapCopy(n).remove` as a destructive text button. Field order and header copy stay the add-wine form's (D8, A4b; MISSED-05).
- **Remove:** `getGlassRemovalImpact(wineId)` loads when the form opens; `removalImpactLine(guesses, privateNotes)` shows before the tap (nothing when both are 0). The tap calls `removeWine(tastingId, wineId)` — no dialog; a refusal shows inline; success closes the sheet.
- **Swap:** the Swap row dispatches `swapStarted { wineId, glass }`, which stores `swap` and routes to the flight destination's start view (the matrix's normal sources). The header reads `swapCopy(n).header`, the footer primary `swapCopy(n).primary`; `swapCancelled` returns to the edit form. `options.swap` opens straight into the same state (glass number resolved on load).
- **Amendment 20 holds** (the add-wine reducer's turn rules): `swapStarted` leaves the state unchanged while `items` or `confirmQueue` is non-empty (a read keeps its turn; the edit form never has one, so this only guards a stray dispatch); it forces `multi` off; a `swapCancelled` with no edit form behind it lands home by the landing rule, opening the oldest waiting read if there is one.
- **BT-A0, against the state as F12/S5a/S5b landed it (amendments 20–23):** `swapStarted` and `swapCancelled` join `USER_MOVES` (`sheet-state.ts:633-636`), so a swap advances `flow` and any reply already in flight when it starts goes stale (`replyIsCurrent`, `sheet-state.ts:681-683`). `swapStarted` on a dirty edit form keeps it rather than dropping it: park it in `parkedByHand` (the same give-back `openEdit` already does, `sheet-state.ts:880-901`) so `swapCancelled` reopens it through `sessionToReopen` (`sheet-state.ts:702`), and it counts toward `unfinishedCount`. `initialSheetState`'s start rule (`sheet-state.ts:589`, currently `p.options.edit ? "byhand" : p.options.start`) needs an `options.swap` branch alongside the existing `edit` one. Both actions join the seeded model-based test's generator (`sheet-state.test.ts:593`, amendment 20's; and `:1847`, amendment 23's late-replies generator), whose invariants must still hold.
- **`swapFlightGlass(tastingId, wineId, source)`** (spec §3.3 item 11):
  1. re-check `glassSwapRefusal` (the adder through `is_wine_adder`; a semi-blind glass after Start refuses);
  2. resolve the wine through the one write path (`prepareCompleteWine` / `upsertCatalogWine`, or `prepareUnidentifiedWine`, in `src/lib/wine-identity/server/write.ts`);
  3. `saveFlightGlassCore(supabase, userId, { wineId, draft, unidentified, leaveForLater: false })` on the existing wine id;
  4. write `wines.added_via` through `rpc("set_flight_glass_added_via", { p_wine_id, p_added_via })` (a contributor holds no UPDATE on `wines` rows; M6);
  5. delete the old `wine_pour_intents` row; for a lot source record a new intent and, when the tasting is running, pour it at once exactly as F10's lot add does (D11).
  Position and every `guesses` row stay; the blind-pending triggers move the mark.
- Rule 1: the edit form, the impact counts and the swap never touch another adder's glass.

**Interfaces**
- Consumes: `swapCopy`, `removalImpactLine`, `glassSwapRefusal`, `glassRemoveRefusal` (BT-P1); `getGlassRemovalImpact`, `removeWine` (BT-L1); `set_flight_glass_added_via` (BT-SQL6); `saveFlightGlassCore` (F10); the write path (F8); F12's `ByHandSession["origin"]` and amendment 20's reducer rules.
- Produces:
  ```ts
  // types.ts
  export type AddWineOpenOptions = { /* AW fields */ swap?: { wineId: string } };
  // sheet-state.ts
  // SheetState.swap: { wineId: string; glass: number | null } | null
  // SheetAction: | { type: "swapStarted"; wineId: string; glass: number | null } | { type: "swapCancelled" }
  // actions.ts
  export async function swapFlightGlass(tastingId: string, wineId: string, source: AddSource): Promise<AddResult>;
  ```

**Tests (write first)** — add to `src/components/add-wine/sheet-state.test.ts` (it already has `flight` and `initialSheetState`; BT-A0: the file has no bare, file-scope `run` or `ship` — `run = (s, ...a) => a.reduce(sheetReducer, s)` is a single module-scope const at `:19`, and every `ship = (s, ...a) => a.reduce(reduceSheet, s)` is redeclared per describe block, e.g. `:992`, `:1358`, `:1423`, `:1559`, `:1629`, `:1767`, `:2408` — this block needs its own `ship`, not `run`: amendment 22 says the tests run what ships, i.e. `reduceSheet`, the same path `use-sheet-adds.ts`'s `send` and the shell's `useReducer` both call). Build the edit form's `openByHand` action with F12's origin `{ kind: "glass", wineId: "w3", incomplete: false }` (the shape `openEdit` uses); the assertions stay as written:
```ts
describe("swap a flight glass (S4c, BT-L3)", () => {
  const ship = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(reduceSheet, s);
  it("swapStarted keeps the glass and leaves the edit form; swapCancelled returns to it", () => {
    let s = ship(
      initialSheetState({ destination: flight, options: { edit: { wineId: "w3" } }, canScan: true }),
      { type: "openByHand", origin: EDIT_ORIGIN_W3, draft: emptyDraft(), focusField: null },
    );
    expect(s.view).toBe("byhand");
    s = ship(s, { type: "swapStarted", wineId: "w3", glass: 3 });
    expect(s.swap).toEqual({ wineId: "w3", glass: 3 });
    expect(s.view).not.toBe("byhand");
    s = ship(s, { type: "swapCancelled" });
    expect(s.swap).toBeNull();
    expect(s.view).toBe("byhand");
  });
  it("opening with options.swap starts in the swap state", () => {
    const s = initialSheetState({ destination: flight, options: { swap: { wineId: "w3" } }, canScan: true });
    expect(s.swap).toEqual({ wineId: "w3", glass: null });
  });
  it("amendment 20: a swap forces Many off", () => {
    const s = ship(
      initialSheetState({ destination: flight, options: { multi: true, edit: { wineId: "w3" } }, canScan: true }),
      { type: "swapStarted", wineId: "w3", glass: 3 },
    );
    expect(s.multi).toBe(false);
  });
});
```
`EDIT_ORIGIN_W3` is a `const` declared above the block: `{ kind: "glass", wineId: "w3", incomplete: false }`. Inside amendment 20's describe block (which defines `open`, `photo` and `read`), add one more case: with a read waiting, `swapStarted` returns the state unchanged. Add `swapStarted` and `swapCancelled` to both seeded model-based tests' action generators (`sheet-state.test.ts:593` and `:1847`), and run those generators' own sequences through their block's existing `ship`, as they already do.

**Steps**
- [ ] Add the tests; watch them fail; add the state and actions until green.
- [ ] The form rows; the sheet header and footer; the adds hook; `swapFlightGlass`; the provider pass-through only if needed.
- [ ] `npx vitest run src/components/add-wine/sheet-state.test.ts`; bare tsc; eslint.

**Acceptance**
- The sheet-state tests are green; a bare tsc prints nothing.
- `rg -n "swapFlightGlass" src/components/add-wine` matches `actions.ts` and `use-sheet-adds.ts`.
- The seeded model-based test is green with `swapStarted` and `swapCancelled` in its generator; `rg -n "destination\??\.kind ===" src/components/add-wine/by-hand-form.tsx` prints nothing; `rg -n "#4A1523" src/components/add-wine/by-hand-form.tsx` prints nothing.

**Closes:** spec §3.3 items 9, 11, 12; ledger B2 (S4c Swap and Remove; Remove after Start states its count inline); map LOBBY-27 (kept), LOBBY-31, LOBBY-32, LOBBY-33 (kept), LOBBY-34; MISSED-05 (order kept).

---

## Track BT-G — Guests before the start (B3)

### BT-G1 — The invitation (S5, S5b)

**Depends on:** BT-D1, BT-D2, BT-P2, BT-P8, BT-M2, BT-M4

**OWNS**
- create `src/lib/invitation-data.ts`
- modify `src/app/tastings/[id]/invitation-view.tsx`
- create `src/app/tastings/[id]/invitation-actions-bar.tsx`
- create `src/app/overview/invitation-card.tsx`
- modify `src/app/overview/page.tsx`

**Does** (spec §4.3 items 1–3; ledger B3; B12; refinement 17)
- **`invitation-data.ts`** (`import "server-only"`; not a server action): `getInvitation(tastingId)` and `getOverviewInvitation()` with the `InvitationData` shape of spec §4.3 item 1. Reads under the viewer's RLS: the tasting row, a `wines` count, participants, profiles, `getTastingPlace`, `rpc("host_tastings_count")`, `getBulkProfileSummaries([hostId])` (average null when `winesGuessed` is 0). Never `wine_answers`. Joined names: JOINED minus the viewer and the host, earliest `joined_at` first.
- **Phone invitation** (`invitation-view.tsx`; BT-D2 routes INVITED viewers of a DRAFT or IN_PROGRESS tasting here):
  - parchment; full screen below `md`, a 560px centred column above;
  - header ✕ (to `/overview`) and `INVITATION_TITLE`;
  - host avatar, `invitedYouLine(host)`, `hostRecordLine(count, avg)`; the name at full size;
  - chips `modeChip`, `glassesSoFarPhrase(glassCount)`, `flowWord(...)`;
  - a card: `<LocalDateTime format="card">` with `invitationDayPhrase`, the place, the avatar stack with `joinedNamesLine`;
  - `HOW_IT_IS_SCORED`: blind `SCORING_ROWS` then `scoringSentence`; semi-blind `scoringSentence` only;
  - `BRING_A_GLASS`;
  - footer `InvitationActionsBar`: `I_AM_IN` (primary) with `CANT_MAKE_IT` beneath, both through `respondToInvite`; no calendar action;
  - `AutoRefresh` mounted.
- **Laptop Overview card** (`invitation-card.tsx`), rendered by `overview/page.tsx` above the banner from `md` when `getOverviewInvitation()` returns one (fetched in `page.tsx`, never in `overview-data.ts`):
  - page eyebrow `OVERVIEW_EYEBROW`; card eyebrow `invitationCardEyebrow(eyebrowDayPhrase)`;
  - the cover image (`.hatch` when none); "{host} invited you · {n} tastings hosted"; the name;
  - one chip row: mode, glasses so far, flow, `<LocalDateTime format="eyebrow-short">`, place;
  - one line: "{joinedNamesLine} · {overviewScoringLine}";
  - inline `I_AM_IN` / `CANT_MAKE_IT` through `useInvitationResponses` (optimistic).
  The Blind tastings card keeps its rows for other invitations and on phones.
- Day phrases (`invitationDayPhrase`, `eyebrowDayPhrase`) are computed in a client leaf with `new Date()`, never on the server.

**Interfaces**
- Consumes: BT-P2 copy; `getTastingPlace` (BT-P8); `glassesSoFarPhrase`, `flowWord` (`tasting-eyebrow.ts`); `LocalDateTime format` (BT-D1).
- Produces: `InvitationData`, `getInvitation(tastingId)`, `getOverviewInvitation()` (spec §4.3 item 1); `InvitationActionsBar(props: { tastingId: string })`; `OverviewInvitationCard(props: { invitation: InvitationData })`.

**Tests:** none new (BT-P2).

**Steps**
- [ ] The data module; the phone view; the actions bar; the Overview card and its mount; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "wine_answers" src/lib/invitation-data.ts` prints nothing; `rg -n "^import \"server-only\"" src/lib/invitation-data.ts` matches.
- `rg -n "AutoRefresh" "src/app/tastings/[id]/invitation-view.tsx"` matches.

**Closes:** spec §4.3 items 1–3; ledger B3 (invitation, Overview card), B12 (invitation place); refinement 17; map GUEST-01, GUEST-02, GUEST-03, GUEST-04 (UI), GUEST-05, GUEST-06, GUEST-07, GUEST-08, GUEST-09, GUEST-10 (display), GUEST-11, GUEST-12, GUEST-13, GUEST-14, GUEST-15, GUEST-16, GUEST-17, GUEST-18, GUEST-21, GUEST-22; supporting: XCUT-50.

---

### BT-G2 — The joined guest before Start (S6, S6b)

**Depends on:** BT-D2, BT-P2, BT-P8, BT-M2, BT-M4

**OWNS**
- modify `src/app/tastings/[id]/guest-lobby.tsx`
- create `src/app/tastings/[id]/guest-actions.ts`
- create `src/app/tastings/[id]/leave-tasting-button.tsx`

**Does** (spec §4.3 item 5; ledger B3)
- Eyebrow `guestEyebrow(...)`; the name; the `YOU_ARE_IN` pill; a ← back on phones.
- Waiting block: `waitingLines(timingMode, host)`.
- `atTheTableLabel(joined, invited, { phone })`; chips in order: "You" (bordeaux fill), "{host} · host", joined people (solid), invited people (dashed, "{name}…"); DECLINED hidden. Laptop: a 250px right rail.
- The Tonight card (phone) or explanation paragraph (laptop) from `tonightLines(...)`. For a semi-blind tasting BT-S1 mounts `SemiBlindList` below it, which shows a guest `listOpensAtStart(host)` until Start (spec §10.3 item 1; Q7).
- While you wait: `ADD_TO_CALENDAR` with "{short date} · {place}" linking `/tastings/{id}/calendar.ics`, only when `scheduled_at` is set; `LEARN_LINKS` with `sub` on phones; on laptops `WHILE_YOU_WAIT_LAPTOP` with the two links side by side and `subLaptop`.
- Bring-your-own: `WinesCard` (BT-D2's shared card) above "At the table".
- `LEAVE_TASTING` → `leaveTasting(tastingId)`: DRAFT only; sets the caller's row DECLINED; revalidates the page, `/overview` and `/taste`. Never offered to the host. The M4 leave guard is the floor.
- `AutoRefresh` mounted, so Start re-routes the guest to the running view.
- Every input controlled.

**Interfaces**
- Consumes: BT-P2 copy; `getTastingPlace` (BT-P8); `WinesCard` (BT-D2).
- Produces: `leaveTasting(tastingId: string): Promise<{ error: string } | null>`; `LeaveTastingButton(props: { tastingId: string })`.

**Tests:** none new.

**Steps**
- [ ] The action; the layout; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "AutoRefresh" "src/app/tastings/[id]/guest-lobby.tsx"` matches.
- `rg -n "buzz|more certain" "src/app/tastings/[id]"` prints nothing.

**Closes:** spec §4.3 item 5; ledger B3 (joined guest; "Your phone will buzz" and the certainty sentence not adopted), B12 (calendar row); map GUEST-23, GUEST-24, GUEST-25, GUEST-26 (not adopted), GUEST-27, GUEST-28, GUEST-29, GUEST-30, GUEST-31 (row), GUEST-32, GUEST-33, GUEST-34, GUEST-37, GUEST-38, XCUT-28, XCUT-58 (the guest's Wines card); supporting: GUEST-10, GUEST-35.

---

### BT-G3 — The share-link preview and invitation at `/j/[code]`

**Depends on:** BT-A0 (the link page changes a flow add-wine V1 checks), BT-P2, BT-M4

**OWNS**
- modify `src/app/j/[code]/page.tsx`
- create `src/app/j/[code]/actions.ts`
- create `src/app/j/[code]/join-preview.tsx`

**Does** (spec §4.3 item 4; ledger B3; Q3; B4)
- Every visitor first gets `rpc("get_join_preview", { p_code: code })` through the server client (anon when signed out).
- No row → the existing unknown-code card; `status = 'CLOSED'` → "That tasting has finished." (existing copy). The "already started" branch goes.
- Signed in with `viewer_tasting_id` set (the host, a JOINED or an INVITED participant) → `redirect(/tastings/{id})` (an INVITED viewer gets the full invitation there).
- Otherwise `JoinPreview`: host name and avatar, the name, `<LocalDateTime format="card">`, `modeChip` and `flowWord`, `glassesSoFarPhrase(glass_count)`, `SCORING_ROWS` and the scoring sentence by mode. Never the place, the description or the cover photo.
  - **Signed out** (Q3): nothing more; `SIGN_IN_TO_SAY_YES` → `/login?next=/j/{code}` (validated by `safeNext`).
  - **Signed in and not a member, a DECLINED guest included** (B3; spec §4.3 item 4): the invitation. It adds `invitedYouLine(host)`; `hostRecordLine(count, average)` with the count from `rpc("host_tastings_count", { p_user_id: host_id })` and the average from `getBulkProfileSummaries([host_id])` (null when `winesGuessed` is 0); `joinedNamesLine(joined_names)`; `BRING_A_GLASS`; then `I_AM_IN` → `joinByCode(code)` and `CANT_MAKE_IT` → `/overview`, nothing written.

**Interfaces**
- Consumes: BT-P2 copy; `get_join_preview` and `host_tastings_count` types (BT-SQL4); `getBulkProfileSummaries` (`src/lib/profile-stats.ts`).
- Produces: `joinByCode(code: string): Promise<{ error: string }>` (redirects to the tasting on success); `type JoinPreviewRow = Database["public"]["Functions"]["get_join_preview"]["Returns"][number]` (the twelve columns, never a hand-written list); `JoinPreview(props: { code: string; preview: JoinPreviewRow; signedIn: boolean; hostRecord: { hostedCount: number; averagePoints: number | null } | null })`.

**Tests:** none new (BT-SQL4's probe covers the RPC).

**Steps**
- [ ] The action; the preview; the page; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "already started" "src/app/j"` prints nothing.
- `rg -n '\bplace\b|\.description\b|image_url' "src/app/j/[code]/join-preview.tsx"` prints nothing, and `JoinPreviewRow` is the RPC's row type (inspect).

**Closes:** spec §4.3 item 4; ledger B3 (share link: the reduced preview signed out, the invitation signed in; say yes before joining), B4 (a DECLINED guest rejoins), Q3; map GUEST-19 (reduced preview; reading the full invitation without an account not adopted), GUEST-20, CREATE-51 (rejoin), CREATE-52 (link).

---

## Track BT-H — Host console and pacing (B6)

### BT-H1 — Pacing on the server and the participant side

**Depends on:** BT-A0, BT-P2, BT-P3, BT-P4, BT-M7 (live)

**OWNS**
- create `src/lib/pacing-guards.ts`, `src/lib/pacing-guards.test.ts`
- create `src/app/tastings/[id]/pacing-actions.ts`
- create `src/app/tastings/[id]/play/guesser.ts`
- modify `src/app/tastings/[id]/play/actions.ts`
- modify `src/app/tastings/[id]/play/reveal-actions.ts`
- modify `src/app/tastings/[id]/play/auto-reveal.ts`
- modify `src/app/tastings/[id]/play/play-experience.tsx`
- create `src/app/tastings/[id]/play/paused-band.tsx`

**Does** (spec §7.3 items 2–3, §5.3 items 4–5; refinements 5, 6; Q1)
- **`src/lib/pacing-guards.ts`** (pure; tests first): `revealStepRefusal({ guided, paused, glasses, pointer, wineId })` → `PAUSED_REFUSAL`, `CURRENT_GLASS_ONLY` (guided, and not `currentGlass`) or null; `skipPlan({ status, paused, glasses, pointer, fromWineId })` → `{ error }` (not running, paused, a stale `fromWineId` or one past step 0), `null` (nothing to skip to) or `{ targetId, expectPointer }`. The actions below call these and hold no pacing rule of their own.
- **`pacing-actions.ts`** (`"use server"`):
  - `setTastingPaused(tastingId, paused)`: host only, IN_PROGRESS only, LIVE only ("Pause is for live tastings."); `update tastings set paused_at = now()` or `null`; revalidates `/tastings/{id}` and `/tastings/{id}/host`.
  - `skipToGlass(tastingId, fromWineId)`: host only; reads the status, `paused_at`, the wines in list order and `current_wine_id`, then asks `skipPlan(...)`. An `{ error }` is returned as it is; `null` is a no-op; `{ targetId, expectPointer }` becomes a compare-and-set write, `.eq("current_wine_id", expectPointer)` or `.is("current_wine_id", null)`, so a double tap skips one glass (zero rows updated → no-op).
- **`guesser.ts`** (`import "server-only"`): `resolveGuesser`, `guessableWineError` and `sequentialOrderError` move here from `play/actions.ts` unchanged, except `sequentialOrderError`: it reads `sequential_guessing`, `reveal_mode`, `timing_mode`, `current_wine_id` and the wines, and returns the existing "Guess the wines in order — earlier wines come first." when `guessOrderAllows(...)` is false.
- **`play/actions.ts`:** imports the guards from `guesser.ts`; `revealWine` refuses with `PAUSED_REFUSAL` while `paused_at` is set.
- **`reveal-actions.ts`:** `revealNextCategory` returns `revealStepRefusal(...)` when it is non-null (paused; or, in guided LIVE, a glass that is not `currentGlass(...)`); `revealFull` refuses with `PAUSED_REFUSAL` while paused.
- **`auto-reveal.ts`:** `maybeAutoRevealWine` builds its eligible set with `eligibleForGlass` (BT-P2) instead of its inline filter (`auto-reveal.ts:59`). No pause check: an ASYNC tasting cannot be paused (Q1). Its signature stays (AW-F13 imports it).
- **`play-experience.tsx`:**
  - `currentWineId` when guided = `currentGlass(glasses, tasting.current_wine_id)?.id` (was the lowest unrevealed glass);
  - eligibility per glass through `eligibleForGlass` (JOINED, not the contributor, not the host-provides host), so a late joiner opens on the current glass; readiness ("N of M") only for unrevealed glasses;
  - `PausedBand` at the top while `paused_at` is set: `pausedBand(hostName)`.
- No pause guard on guess writes, locks or matches (Q1).

**Interfaces**
- Consumes: `currentGlass`, `skipTarget`, `guessOrderAllows` (BT-P3); `pausedBand`, `PAUSED_REFUSAL`, `CURRENT_GLASS_ONLY` (BT-P4); `eligibleForGlass` (BT-P2).
- Produces:
  ```ts
  // pacing-actions.ts
  export async function setTastingPaused(tastingId: string, paused: boolean): Promise<{ error: string } | null>;
  export async function skipToGlass(tastingId: string, fromWineId: string): Promise<{ error: string } | null>;
  // play/guesser.ts — the three guards, with their current signatures
  export async function resolveGuesser(/* unchanged */): Promise<unknown>;
  export async function guessableWineError(/* unchanged */): Promise<string | null>;
  export async function sequentialOrderError(supabase: Client, tastingId: string, wineId: string): Promise<string | null>;
  // play/paused-band.tsx
  export function PausedBand(props: { hostName: string }): React.JSX.Element;
  ```

**Tests (write first)** — `src/lib/pacing-guards.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { CURRENT_GLASS_ONLY, PAUSED_REFUSAL } from "./console-copy";
import { revealStepRefusal, skipPlan } from "./pacing-guards";
import type { PointerGlass } from "./pour-pointer";

const g = (id: string, isRevealed = false, revealStep = 0): PointerGlass => ({ id, isRevealed, revealStep });
const flight = [g("a", true), g("b"), g("c"), g("d")];

describe("revealStepRefusal (B6)", () => {
  it("guided LIVE: only the glass pouring now", () => {
    expect(revealStepRefusal({ guided: true, paused: false, glasses: flight, pointer: "c", wineId: "c" })).toBeNull();
    expect(revealStepRefusal({ guided: true, paused: false, glasses: flight, pointer: "c", wineId: "b" })).toBe(CURRENT_GLASS_ONLY);
    expect(revealStepRefusal({ guided: true, paused: false, glasses: flight, pointer: null, wineId: "b" })).toBeNull();
  });
  it("free order reveals any glass; a pause refuses every one", () => {
    expect(revealStepRefusal({ guided: false, paused: false, glasses: flight, pointer: "c", wineId: "d" })).toBeNull();
    expect(revealStepRefusal({ guided: false, paused: true, glasses: flight, pointer: null, wineId: "b" })).toBe(PAUSED_REFUSAL);
  });
});

describe("skipPlan (B6)", () => {
  const base = { status: "IN_PROGRESS", paused: false, glasses: flight, pointer: null } as const;
  it("from the current glass to the next unrevealed one, compare-and-set on the pointer it read", () => {
    expect(skipPlan({ ...base, fromWineId: "b" })).toEqual({ targetId: "c", expectPointer: null });
    expect(skipPlan({ ...base, pointer: "d", fromWineId: "d" })).toEqual({ targetId: "b", expectPointer: "d" });
  });
  it("refuses a stale glass, a glass past step 0, a paused or a not-running tasting", () => {
    expect(skipPlan({ ...base, fromWineId: "c" })).toHaveProperty("error");
    expect(skipPlan({ ...base, glasses: [g("a", true), g("b", false, 1), g("c")], fromWineId: "b" })).toHaveProperty("error");
    expect(skipPlan({ ...base, paused: true, fromWineId: "b" })).toEqual({ error: PAUSED_REFUSAL });
    expect(skipPlan({ ...base, status: "DRAFT", fromWineId: "b" })).toHaveProperty("error");
  });
  it("nothing to skip to when the current glass is the only unrevealed one", () => {
    expect(skipPlan({ ...base, glasses: [g("a", true), g("b")], fromWineId: "b" })).toBeNull();
  });
});
```
BT-P2, BT-P3 and BT-P4 cover the other rules; BT-SQL7's probe covers the database, the compare-and-set included.

**Steps**
- [ ] Move the guards; pacing actions; reveal and auto-reveal guards; the play-experience pointer, eligibility and band; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "async function (resolveGuesser|guessableWineError|sequentialOrderError)" "src/app/tastings/[id]/play"` matches only `guesser.ts`.
- `npx vitest run src/lib/pacing-guards.test.ts` is green; `rg -n "revealStepRefusal|skipPlan" "src/app/tastings/[id]"` matches `play/reveal-actions.ts` and `pacing-actions.ts`.
- `rg -n "PAUSED_REFUSAL" "src/app/tastings/[id]"` matches `play/actions.ts` and `play/reveal-actions.ts`; `rg -n "eligibleForGlass" "src/app/tastings/[id]/play/auto-reveal.ts"` matches.
- `git diff -U0 -- "src/app/tastings/[id]/play/auto-reveal.ts" | rg "^[-+]export async function maybeAutoRevealWine"` prints nothing (signature unchanged).

**Closes:** spec §7.3 items 2 (server, band), 3 (non-console callers), §5.3 items 4–5 (play), §7.5 (`pacing-guards.test.ts`); ledger B6 (Pause, the pour pointer in every pacing guard), B4 (late joiner opens on the current glass); Q1; map HOST-03 (server), HOST-17 (server), PLAY-42 (pointer), XCUT-59 (eligibility in play); supporting: SB-13.

---

### BT-H2 — The host console (S7, S7b)

**Depends on:** AW-S5c, BT-D1, BT-H1

**OWNS**
- modify `src/app/tastings/[id]/host/page.tsx`
- modify `src/app/tastings/[id]/host/console.tsx`
- create `src/app/tastings/[id]/host/console-standings.tsx`
- modify `src/app/tastings/[id]/play/reveal-controls.tsx`

**Does** (spec §7.3 items 1, 2 (console), 4, 5, 7, 8, 9; B6; B0 reveal-8; refinement 7)
- **`host/page.tsx`:**
  - wrap the page in `<LiveShell active={status === "IN_PROGRESS"}>`;
  - current glass = `currentGlass(glasses, tasting.current_wine_id)` (the dwell on the previous glass stays); `wrapped` → `skippedEyebrow(n)` in place of the pouring eyebrow;
  - eligibility via `eligibleForGlass`; locked = a locked or scored row;
  - facts via `glassFacts`, with `revealedKeys` from `reveal_step` (every step once revealed); the facts' visibility test drops `hostProvides ||` (identity keeps it); `nameOf` from `lookupAppellationAndProducerNames`;
  - a competing bring-your-own host's chips and facts come from `rpc("get_wine_reveal", { p_wine_id })` (revealed keys, the in-play count — null at step 0 after M1 — and the guesses of revealed steps), never from `wine_answers` (ships before M9b);
  - the chips appear only where `stepRevealApplies(...)` holds (Q8); a free-order LIVE blind glass keeps "Reveal the whole glass";
  - `StepKey` becomes `RevealKey` from `src/lib/reveal-rows-math.ts` (the duplicate union goes);
  - standings rows carry `lastRoundPoints` for per-round deltas.
  - The semi-blind branch and the `guesses` column list are left for BT-S4 and BT-S5.
- **`console.tsx`:**
  - Header (S7): live dot · "Live · you are hosting" · the name · Pause / Resume (`setTastingPaused`) · "+ Add a wine" in gold (`bg-gold-light text-console`; `openAddWineSheet(flight, { start: "camera" })`) · End tasting (keeps `window.confirm(endTastingConfirm(...))`) · T9's "Tasting page" text link. A semi-blind tasting gets no "+ Add a wine": its flight is fixed at Start (`semiBlindAddRefusal`).
  - Phone header (S7b): the eyebrow, Pause and "+ Wine" on one line; a ← back icon; no name. End tasting moves to the bottom of the page, under the facts card.
  - While paused: the `CONSOLE_PAUSED` band with Resume; chips, the gold button, Reveal everything and Skip disabled.
  - Main: `pouringNowEyebrow(n, m)`; the identity title "{producer}, {wine name} {vintage}" and the meta "{appellation} · {region} · {country} · {grape}" with "only you can see this" (host-provides only; phones drop the country and put the note on its own gold-light line with a lucide icon); "{k}/{n}" with "locked in"; "Reveal in order · tap to go one step further"; chips (revealed gold with ✓, the next dashed "· next"). A competing BYO host sees the revealed chips, then one dashed chip with `nextChipLabel(inPlay, step)` (a bare "Next" at step 0) and the gold button `NEXT_ATTRIBUTE`.
  - The gold button names the next reveal; **Reveal everything** is the two-tap (`twoTapState`, `revealEverythingLabel`; the second tap submits `revealFull`; no `window.confirm`); `skipLabel(next)` only at `reveal_step = 0` → `skipToGlass`; `notLockedLine(names, { phone })`.
  - Standings (laptop rail): "{rank} {name} +{lastRoundPoints} {total}" under the existing label; phones show the top two plus "All {n} ›", which opens `ConsoleStandings` in a popover (dark through `useLiveTheme`).
  - "This glass" (phone: "This glass, so far"): the facts.
  - An incomplete glass: chips inert, the refusal sentence, and "Edit" → `openAddWineSheet(flight, { start: "byhand", edit: { wineId } })`.
  - Phone pinned bottom bar (safe-area inset): the gold reveal button full width, then Reveal everything and Skip as two equal buttons. Chips wrap; a tappable chip is at least 44px tall.
- **`reveal-controls.tsx`:** "Reveal the full answer now?" `window.confirm` becomes the same two-tap (refinement 7).
- Tokens only.

**Interfaces**
- Consumes: BT-H1 actions and `PausedBand`; BT-P3 pointer; BT-P4 console copy and `glassFacts`; `LiveShell`, `useLiveTheme` (BT-D1).
- Produces: `ConsoleData` gains `paused: boolean; wrapped: boolean; skipTo: { wineId: string; glass: number } | null; notLocked: string[]; facts: { label: string; value: string }[]; standings: { rank: number; tied: boolean; name: string; total: number; lastRoundPoints: number | null }[]`; `ConsoleStandings(props: { rows: ConsoleData["standings"] })`.

**Tests:** none new.

**Steps**
- [ ] Page data; console header, main area, rail and phone bar; standings popover; reveal-controls two-tap; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "window\.confirm\(" "src/app/tastings/[id]/host" "src/app/tastings/[id]/play/reveal-controls.tsx" | rg -v "endTastingConfirm"` prints nothing.
- `rg -n "LiveShell" "src/app/tastings/[id]/host/page.tsx"` and `rg -n "get_wine_reveal" "src/app/tastings/[id]/host/page.tsx"` match.
- `rg -n 'from\("wine_answers"\)' "src/app/tastings/[id]/host/page.tsx"`: every hit sits inside the host-provides branch (inspect, and quote each in the report), so a bring-your-own host never reads `wine_answers` before M9b.
- `rg -n "type StepKey" "src/app/tastings/[id]/host"` prints nothing; `rg -n "stepRevealApplies" "src/app/tastings/[id]/host"` matches.
- `rg -n "min-width: 768px" "src/app/tastings/[id]/host"` prints nothing.

**Closes:** spec §7.3 items 1, 2, 4, 5, 7, 8, 9; ledger B6 (header, Pause, Skip, main area, not-locked line, standings, facts, incomplete glass, phone), B0 (reveal-8 answered); refinement 7; Q8; map REVEAL-02 (console gate), HOST-01, HOST-02, HOST-03, HOST-04, HOST-05 (Edit link), HOST-06 (phone End), HOST-07 (kept link), HOST-08, HOST-09, HOST-10, HOST-11, HOST-16, HOST-17, HOST-18, HOST-19, HOST-21, HOST-22, HOST-23, HOST-24, HOST-25, HOST-26, HOST-27, HOST-28, HOST-29, HOST-30, HOST-31, XCUT-02 (dark console), XCUT-31, XCUT-37; supporting: HOST-20, SB-35.

---

## Track BT-Y — Guessing, picker, waiting (B7)

### BT-Y1 — Per-field-group guess writes and the vintage range

**Depends on:** BT-P5, BT-H1, BT-SQL8

**OWNS**
- modify `src/app/tastings/[id]/play/actions.ts`
- modify `src/app/tastings/[id]/play/guess-ladder.tsx`
- modify `src/app/tastings/[id]/play/ladder-types.ts` (vintage option ids only)
- create `src/app/tastings/[id]/play/guess-save-queue.ts`, `src/app/tastings/[id]/play/guess-save-queue.test.ts`

**Does** (spec §8.3 items 5, 6, 9 (the unlock message); B7; reverses "each pick autosaves the COMPLETE row")
- **`saveGuessFields(tastingId, wineId, group, values)`** in `play/actions.ts`, spec §8.3 item 5 steps 1–5:
  1. `resolveGuesser`, `guessableWineError`, `sequentialOrderError` (from `guesser.ts`);
  2. `groupPayload(group, { ...EMPTY_GUESS_ROW, ...values }, new Date())`; an error returns;
  3. read the caller's `locked_at, scored_at`: locked → `LOCKED_EDIT_REFUSAL`; scored → the existing `LOCKED_ERROR`;
  4. `supabase.from("guesses").upsert({ wine_id, participant_id, ...payload.values }, { onConflict: "wine_id,participant_id" })` — only guess columns (093000);
  5. no `revalidatePath`; returns `{ ok: true } | { error }`.
- **`unlockGuess`** refuses once the glass's `reveal_step > 0`, with `guessBlockReason`'s "The reveal for this glass has started — guessing is closed."
- **Delete `submitGuess`** (its only importer is the ladder).
- **The ladder:**
  - one save queue per group (a promise chain per `GuessFieldGroup`), driven by the pure reducer in `guess-save-queue.ts`: per group the last confirmed values, the newest pending pick with its sequence number, and the error; the visible row is derived from them;
  - a failure reverts only that group's fields on screen and shows the error under that group's row; the other groups carry on;
  - **Lock waits:** `onLock` awaits every group's pending save (`allSettled`) before calling `lockGuess`; a 42501 from a save that still lands after a successful lock maps quietly to `LOCKED_EDIT_REFUSAL` and does not revert the row;
  - `buildFormData` and the full-row reset go.
- **Vintage picker:** years from `vintageOptions(new Date())` (next UTC year down to 1900); "NV"; tawny "10 years", "20 years", "30 years", "40 years" and "Other age…", which shows a controlled number input (1–100) inside the picker. `OLDEST_YEAR` goes. `ladder-types.ts` gains `VINTAGE_TAWNY_OTHER_ID = "tawny:other"`.

**Interfaces**
- Consumes: `groupPayload`, `groupForField`, `GROUP_COLUMNS`, `vintageOptions`, `LOCKED_EDIT_REFUSAL` (BT-P5); guards (BT-H1).
- Produces: `saveGuessFields(tastingId: string, wineId: string, group: GuessFieldGroup, values: Partial<GuessRow>): Promise<{ ok: true } | { error: string }>`, and the pure queue:

```ts
// play/guess-save-queue.ts
export type SaveQueueState = {
  confirmed: GuessRow;                                                                     // the last server-confirmed row
  pending: Partial<Record<GuessFieldGroup, { seq: number; values: Partial<GuessRow> }>>;   // the newest unconfirmed pick per group
  confirmedSeq: Partial<Record<GuessFieldGroup, number>>;                                  // stale results are ignored
  errors: Partial<Record<GuessFieldGroup, string>>;
  nextSeq: number;
};
export type SaveQueueEvent =
  | { type: "picked"; group: GuessFieldGroup; values: Partial<GuessRow> }   // takes the next seq
  | { type: "confirmed"; group: GuessFieldGroup; seq: number }
  | { type: "failed"; group: GuessFieldGroup; seq: number; error: string };
export function initialSaveQueue(row: GuessRow): SaveQueueState;
export function saveQueueReducer(state: SaveQueueState, event: SaveQueueEvent): SaveQueueState;
export function visibleRow(state: SaveQueueState): GuessRow;   // confirmed, overlaid with every pending group's values
export function allSettled(state: SaveQueueState): boolean;    // no group pending
```

**Tests (write first)** — `src/app/tastings/[id]/play/guess-save-queue.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { allSettled, initialSaveQueue, saveQueueReducer, visibleRow, type SaveQueueEvent, type SaveQueueState } from "./guess-save-queue";
import type { GuessRow } from "./ladder-types";

const empty: GuessRow = {
  country_id: null, region_id: null, appellation_id: null, primary_grape_id: null, secondary_grape_id: null,
  producer_id: null, type_designation_id: null, vintage_kind: null, vintage_year: null, vintage_tawny_years: null,
};
const run = (s: SaveQueueState, ...events: SaveQueueEvent[]) => events.reduce(saveQueueReducer, s);

describe("per-group save queues (B7; critic on XCUT-53)", () => {
  it("a failure reverts only its own group while another group's newer pick is pending", () => {
    let s = run(initialSaveQueue(empty),
      { type: "picked", group: "origin", values: { country_id: "it" } },               // seq 1
      { type: "picked", group: "grapes", values: { primary_grape_id: "nebbiolo" } });  // seq 2
    s = run(s, { type: "failed", group: "origin", seq: 1, error: "offline" });
    expect(visibleRow(s)).toMatchObject({ country_id: null, primary_grape_id: "nebbiolo" });
    expect(s.errors).toEqual({ origin: "offline" });
    expect(allSettled(s)).toBe(false);
  });
  it("confirmations may arrive out of order", () => {
    let s = run(initialSaveQueue(empty),
      { type: "picked", group: "origin", values: { country_id: "it" } },
      { type: "picked", group: "producer", values: { producer_id: "vietti" } });
    s = run(s, { type: "confirmed", group: "producer", seq: 2 }, { type: "confirmed", group: "origin", seq: 1 });
    expect(visibleRow(s)).toMatchObject({ country_id: "it", producer_id: "vietti" });
    expect(allSettled(s)).toBe(true);
  });
  it("a second pick in a group supersedes the first", () => {
    let s = run(initialSaveQueue(empty),
      { type: "picked", group: "grapes", values: { primary_grape_id: "barbera" } },    // seq 1
      { type: "picked", group: "grapes", values: { primary_grape_id: "nebbiolo" } });  // seq 2
    s = run(s, { type: "confirmed", group: "grapes", seq: 1 });
    expect(visibleRow(s).primary_grape_id).toBe("nebbiolo");
    expect(allSettled(s)).toBe(false);
    s = run(s, { type: "confirmed", group: "grapes", seq: 2 });
    expect(s.confirmed.primary_grape_id).toBe("nebbiolo");
  });
  it("a failure that arrives after a later successful pick in the same group keeps the later value", () => {
    const s = run(initialSaveQueue(empty),
      { type: "picked", group: "grapes", values: { primary_grape_id: "barbera" } },    // seq 1
      { type: "picked", group: "grapes", values: { primary_grape_id: "nebbiolo" } },   // seq 2
      { type: "confirmed", group: "grapes", seq: 2 },
      { type: "failed", group: "grapes", seq: 1, error: "timeout" });
    expect(visibleRow(s).primary_grape_id).toBe("nebbiolo");
    expect(s.errors).toEqual({});
  });
  it("Lock waits until every group has settled", () => {
    const s = run(initialSaveQueue(empty), { type: "picked", group: "vintage", values: { vintage_kind: "NV" } });
    expect(allSettled(s)).toBe(false);
    expect(allSettled(run(s, { type: "confirmed", group: "vintage", seq: 1 }))).toBe(true);
  });
});
```
BT-P5 covers the groups and ranges; BT-SQL8's probe covers the locked pin and the upsert.

**Steps**
- [ ] The action; delete `submitGuess`; the ladder's queues; the vintage picker; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "submitGuess\b|OLDEST_YEAR|buildFormData" src` prints nothing.
- `rg -n 'onConflict: "wine_id,participant_id"' "src/app/tastings/[id]/play/actions.ts"` matches.
- `npx vitest run "src/app/tastings/[id]/play/guess-save-queue.test.ts"` is green; `rg -n "saveQueueReducer|allSettled" "src/app/tastings/[id]/play/guess-ladder.tsx"` matches.

**Closes:** spec §8.3 items 5, 6, 9 (server), §8.5 (`guess-save-queue.test.ts`); ledger B7 (writes, the vintage picker, Change it until the first step); map PLAY-15, PLAY-17 (app refusal), PLAY-19, PLAY-37 (server), XCUT-53, XCUT-54.

---

### BT-Y2 — The picker (S9)

**Depends on:** BT-P5, BT-D1, BT-Y1

**OWNS**
- modify `src/app/tastings/[id]/play/field-picker.tsx`
- modify `src/app/tastings/[id]/play/ladder-types.ts` (`FieldPickerProps`)

**Does** (spec §8.3 items 7 (presentation), 8)
- **Presentation:** `presentation?: "sheet" | "popover"` (default `"sheet"`). The sheet stays as shipped. The popover is base-ui `Popover` with `positionMethod="fixed"` and `keepMounted`, anchored to `anchorRef` (the row); no dimming backdrop; outside click or Escape closes it and returns focus to the row; "Everything else" in two columns with arrow keys still moving through the rows. Both presentations stay mounted, so the ladder's synchronous `.focus()` on `inputRef` inside the opening tap always has an input.
- **Header:** `title` with the gold "{points} pts" pill; on the popover a "Skip" beside the pill → `onPick(null)`.
- **Search placeholder:** `searchPlaceholder(field, totalCount, { phone })` when `totalCount` is given, otherwise the existing `searchPlaceholder` prop.
- **Shortlist:** the groups the ladder passes (BT-Y3 renames the grape group "Common grapes in {region}"; the producer group keeps "Specific to {region}"); a row whose id is in `oftenIds` appends `OFTEN_SUFFIX` to its context line. The shortlist orders the list and never restricts it.
- **Rest group heading:** `everythingElseHeading(totalCount)`.
- **Footer:** "Not sure — skip it" · "Next: {field} →", as shipped.
- Dark through the tokens: the popover inherits `dark` from BT-D1; the sheet sits inside the running view's shell. `field-picker.tsx:320`'s `hover:bg-[#4A1523]` → `hover:bg-primary-hover`.

**Interfaces**
- Produces: `FieldPickerProps` gains `presentation?: "sheet" | "popover"; anchorRef?: React.RefObject<HTMLElement | null>; totalCount?: number; oftenIds?: ReadonlySet<string>` (all optional, so the current ladder keeps compiling until BT-Y3 passes them).

**Tests:** none new.

**Steps**
- [ ] The popover presentation; header Skip; placeholder, often suffix, rest heading; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "keepMounted" "src/app/tastings/[id]/play/field-picker.tsx"` matches; `rg -n "#4A1523" "src/app/tastings/[id]/play/field-picker.tsx"` prints nothing.

**Closes:** spec §8.3 items 7–8; ledger B7 (the picker; the laptop popover); map PLAY-02, PLAY-25, PLAY-26, PLAY-27, PLAY-28, PLAY-29 (groups kept), PLAY-30, PLAY-31, PLAY-32, XCUT-04.

---

### BT-Y3 — The ladder and the laptop rail (S8, S8b)

**Depends on:** BT-Y2

**OWNS**
- modify `src/app/tastings/[id]/play/guess-ladder.tsx`
- modify `src/app/tastings/[id]/play/play-experience.tsx`
- modify `src/app/tastings/[id]/play/ladder-types.ts` (`GuessLadderProps`)
- create `src/app/tastings/[id]/play/ladder-rail.tsx`
- create `src/lib/reference-counts.ts`

**Does** (spec §8.3 items 1–4, 7, 8 (counts and pick counts); refinement 15)
- **Header** (dark): live dot, the tasting name, the `flightSegments` bar, "Glass {N} of {M}", `rankChipLabel` with the competitor count, and on laptops `laptopEyebrow(host)`. On phones the title is `phoneLadderTitle(tasting, revealMode)` and `lockedCountShort(k, n)` sits under the flight bar, counted from the same `tasting_guess_status` roster as the laptop rail. The paused band stays BT-H1's.
- **Intro and summary:** `introHeading(n)` + `INTRO_SENTENCE`; `stakeLine(pointsAtStake(guess), { phone })`.
- **Rows:** points first, the field name, the answer; the row whose picker is open is bordeaux-bordered; "just now" on the row set last; unanswered rows dashed "Skip, or name one"; vintage `VINTAGE_LABEL` / `VINTAGE_EMPTY`; the grape row is a plain row (refinement 15); secondary grape and type designation under More with `LADDER_EXTRAS_NOTE`.
- **The grape shortlist heading** (S9; spec §8.3 item 8): the group heading built at `guess-ladder.tsx:474` becomes `shortlistHeading(shortlist?.placeName ?? regionName ?? "the region")` — "Common grapes in Piedmont" instead of "Grown in Piedmont". The producers' "Specific to {region}" stays.
- **Laptop (S8b, from `md`):** two columns; `LadderRail` sticky on the right: the stake card; `lockedInRosterHeading(k, n)` with "{name} ✓" / "{name}…" (eligible participants, from `tasting_guess_status`); `standingsAfterHeading(N − 1)` with the top three (hidden before any glass is revealed); `lockButtonText(n)` + `lockFooterText({ phone: false })`. The phone footer uses `lockButtonText(n)` + `lockFooterText({ phone: true })`.
- **The picker** opens as `presentation="popover"` from `md` (`useMediaQuery("(min-width: 768px)")` from `src/components/add-wine/use-camera.ts:34`, a layout choice; BT-A0 confirms that export survives AW-S6, so no neutral `src/lib/use-media-query.ts` fallback is needed), anchored to the row; `totalCount` and `oftenIds` are passed.
- **`play-experience.tsx`:**
  - `pickCounts = buildPickCounts(rows)` from the viewer's own `guesses` across tastings: extend the existing read (the one selecting `primary_grape_id, secondary_grape_id`) to the seven id columns; `frequentGrapeIds` (threshold 2) goes;
  - `getReferenceCounts()` from `src/lib/reference-counts.ts` (`React.cache`): countries, regions and grapes from `getReferenceOptions()` lengths; `appellations` and `producers` via `select("id", { count: "exact", head: true })`, once per request — never rows; type designations from the length of the active list the ladder already preloads (`.eq("is_active", true)`); vintages from `vintageOptions(new Date()).years.length`;
  - the roster, standings after the previous glass, the host name and the competitor count go to the ladder.
- Tokens only: `bg-white` → `bg-card`; `hover:bg-[#4A1523]` → `hover:bg-primary-hover`.
- Every input stays controlled (AutoRefresh).

**Interfaces**
- Consumes: BT-P5 ladder copy and pick counts; BT-Y2 picker props.
- Produces:
  ```ts
  // ladder-types.ts: GuessLadderProps loses frequentGrapeIds and gains
  //   pickCounts: PickCounts; referenceCounts: ReferenceCounts; hostName: string; competitors: number;
  //   roster: { name: string; locked: boolean; isMe: boolean }[];
  //   standingsAfterPrevious: { rank: number; tied: boolean; name: string; total: number }[] | null;
  // src/lib/reference-counts.ts
  export type ReferenceCounts = Record<LadderField, number>; // secondary_grape shares the grape count
  export const getReferenceCounts: () => Promise<ReferenceCounts>;
  // play/ladder-rail.tsx
  export function LadderRail(props: { stake: number; roster: GuessLadderProps["roster"]; standings: GuessLadderProps["standingsAfterPrevious"]; glass: number; onLock: () => void; locking: boolean }): React.JSX.Element;
  ```

**Tests:** none new.

**Steps**
- [ ] Reference counts; ladder header, intro, rows, rail, popover wiring; play-experience data; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "frequentGrapeIds|bg-white|#4A1523" "src/app/tastings/[id]/play"` prints nothing.
- `rg -n "Grown in" "src/app/tastings/[id]/play"` prints nothing; `rg -n "shortlistHeading|phoneLadderTitle|lockedCountShort" "src/app/tastings/[id]/play/guess-ladder.tsx"` matches all three.
- `rg -n "head: true" src/lib/reference-counts.ts` matches; `rg -n '\.from\("(appellations|producers)"\)' src/lib/reference-counts.ts` shows only head counts.

**Closes:** spec §8.3 items 1–4, 7, 8 (the phone header, the shortlist heading, the counts); ledger B7 (header, intro, summary, rows, desktop rail); refinement 15; map PLAY-29 (heading), PLAY-01, PLAY-05, PLAY-06, PLAY-07, PLAY-08, PLAY-09, PLAY-10, PLAY-11, PLAY-12, PLAY-13, PLAY-14, PLAY-16 (note kept), PLAY-20, PLAY-21, PLAY-22, PLAY-23, PLAY-24, PLAY-27 (counts), PLAY-30 (threshold), XCUT-03 (ladder dark); supporting: PLAY-25, XCUT-11.

---

### BT-Y4 — Waiting (S10, S10b)

**Depends on:** BT-Y3

**OWNS**
- modify `src/app/tastings/[id]/play/locked-in.tsx`
- modify `src/app/tastings/[id]/play/play-experience.tsx` (the `LockedInData` fields only)

**Does** (spec §8.3 items 9–10)
- "Waiting for the table"; the existing `decidingLine(names)` followed by `waitingTail(null)` on phones and `waitingTail(host)` on laptops. In ASYNC the tail is the matching results sentence from `tonightLines` ("Answers show once everyone has guessed." / "You see each answer as soon as you submit.") (PLAY-34).
- Roster chips (yours in gold), "What you said" chips including "no producer", "{x} pts at stake" — kept.
- "Change it" is hidden once `revealStep > 0`; otherwise `unlockGuess`.
- "Standings after glass {N}" link kept.
- **Laptop (S10b):** the S8b layout with the ladder closed — left: "What you said · {x} pts at stake" chips, Change it, a Standings › row; right rail: the roster and `waitingTail(host)`. The "Note this glass" row is BT-N2's.
- Tokens only.

**Interfaces**
- Produces: `LockedInData` gains `hostName: string; revealStep: number; timingMode: TimingMode; asyncRevealPolicy: AsyncRevealPolicy`.

**Tests:** none new.

**Steps**
- [ ] `LockedInData`; the phone and laptop waiting layouts; tsc check; eslint.

**Acceptance:** the tsc check is clean; `rg -n "bg-white|#4A1523" "src/app/tastings/[id]/play/locked-in.tsx"` prints nothing.

**Closes:** spec §8.3 items 9–10; ledger B7 (waiting); map PLAY-03, PLAY-33, PLAY-34, PLAY-35, PLAY-36, PLAY-37, PLAY-39, PLAY-40, XCUT-05 (dark); supporting: XCUT-57.

---

## Track BT-N — A note on a hidden glass (B8)

### BT-N1 — The hidden-glass note sheet

**Depends on:** TR-R6, BT-L3, BT-Q1 (`overview-data.ts` order), BT-SQL9 (types order), BT-M5 (live: its `save_wset_note` keeps a resolved identity)

**OWNS**
- create `src/lib/wset/hidden-note.ts`, `src/lib/wset/hidden-note.test.ts`
- modify `src/lib/wset/i18n.ts` (the new EN and DA keys)
- modify `src/components/new-note-modal.tsx`
- modify `src/app/catalog/[wineId]/notes/note-editor.tsx`
- modify `src/components/wset/wine-colour-control.tsx`
- modify `src/lib/wset/queries.ts` (load a note by id for a hidden-glass reopen)
- modify `src/lib/supabase/database.types.ts` (`wset_notes` Row, Insert, Update)
- modify `src/app/catalog/[wineId]/notes/new/page.tsx` (the `?blindWine=` gate)
- modify, only where tsc flags the nullable `catalog_wine_id` or where a stats read must skip identity-less notes: `src/lib/overview-data.ts`, `src/lib/your-numbers.ts`, `src/app/cellar/page.tsx`, `src/components/wset/note-modal.tsx`, `src/app/catalog/[wineId]/page.tsx`, `src/app/catalog/[wineId]/notes/[noteId]/page.tsx`, `src/app/tastings/[id]/open-board.tsx`, `src/components/add-wine/actions.ts`
- never `src/app/taste/notes/*` (the Taste & Rate lane's files): a needed change there is a stop-and-report item for TR-R7

**Does** (spec §9.3 items 2–4; refinements 11, 12; B8)
- **`hidden-note.ts`:** `canNoteHiddenGlass({ status, isRevealed, eligible })` (IN_PROGRESS or legacy OPEN status, unrevealed, an eligible guesser); `hiddenNoteTitle(tastingName, glassLabel)`; `hueGroupsFor(family)` (the family's hues from `HUES_BY_COLOUR`, or the WHITE, ROSE and RED groups when the family is unknown); `HIDDEN_NOTE_HINT` (the dictionary key).
- **Dictionary:** `hidden_note_hint` EN "Only you can read this until the glass is revealed. Then it attaches to the wine." and DA "Kun du kan læse den, indtil glasset afsløres. Så knyttes den til vinen." BT-A0: `tasting_note` already exists (EN "Tasting note" `i18n.ts:254`, DA "Smagsnote" `:467`) — the eyebrow just reuses it; no new key or plan-copy Danish is needed.
- **`NewNoteModal`:** `wineId` becomes optional and a new optional `target?: NoteTarget` takes precedence, so existing callers (the provider, the catalog, the cellar) keep compiling:
  ```ts
  export type NoteTarget =
    | { kind: "catalog"; wineId: string; unidentifiedWineId?: never; tastingWineId?: string | null; contextKind?: string | null }
    | { kind: "hidden-glass"; tastingWineId: string; tastingName: string; glassLabel: string; noteId?: string };
  ```
  A `hidden-glass` target loads no catalog wine (only the aroma terms, and the note itself when `noteId` is set, via `queries.ts`). The header shows the eyebrow, the title `hiddenNoteTitle(...)`, and under it the hint through `makeT`.
- **`NoteEditor`:** `wineId: string | null`; `wine: { colour: WineColour | null; style: WineStyle | null }`. It saves `{ catalog_wine_id: wineId, context_kind: "BLIND", tasting_wine_id }` through the unchanged `save_wset_note`; a null style uses the still-wine sections and `noteTotal(null)`. Keep R6's `NoteEditor` `onSaved(savedId, saved)` signature unchanged. BT-A0: a hidden-glass target's save passes `catalogWineId: null` to `noteSavedReport` (`note-saved.ts:63-81`), so `noteAttachment` resolves to `"pending-reveal"` and R6's confirmation reads "It will attach to the wine when the glass is revealed." (`note-saved.ts:148-149`) — as landed today the modal always passes `catalogWineId: wineId` with no `unidentifiedWineId`, so every save currently reports `"catalog"`. BT-R5's later unidentified target passes `unidentifiedWineId` instead, which reads `"bottle"` ("It is also attached to this bottle.", `:146-147`).
- **`WineColourControl`:** `colour: WineColour | null`; null renders `hueGroupsFor(null)` grouped by family instead of the read-only family line.
- **Types:** `wset_notes` Row `catalog_wine_id: string | null; unidentified_wine_id: string | null`; Insert and Update optional.
- **Stats readers** (refinement 11): the author-scoped `wset_notes` reads in `overview-data.ts`, `your-numbers.ts` and `cellar/page.tsx` add `.or("catalog_wine_id.not.is.null,unidentified_wine_id.not.is.null")`, so a hidden note counts as a rating only once it resolves.
- **Archive:** R4's `notes-data.ts` already titles an identity-less note "{tasting name} · Glass {N}" by list order (`glassNumbers` in `notes-search.ts` sorts by position). Confirm it in the report; any change there is TR-R7's (Contract dependencies), never this task's.
- **`?blindWine=`** (spec §9.3 item 5): `notes/new/page.tsx` honours `blindWine` only when that glass is revealed and `rpc("can_note_tasting_wine", { p_wine_id })` is true for the viewer; otherwise `notFound()`.

**Interfaces**
- Produces: `canNoteHiddenGlass`, `hiddenNoteTitle`, `hueGroupsFor`, `HIDDEN_NOTE_HINT`; `NoteTarget`; `NewNoteModal({ wineId?, target?, onClose, cellarConsume?, tastingWineId?, contextKind?, onSaved? })`.

**Tests (write first)** — `src/lib/wset/hidden-note.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { HIDDEN_NOTE_HINT, canNoteHiddenGlass, hiddenNoteTitle, hueGroupsFor } from "./hidden-note";
import { makeT, uiStrings } from "./i18n";

describe("hidden-glass notes (B8)", () => {
  it("offered to eligible guessers on an unrevealed glass of a running tasting", () => {
    expect(canNoteHiddenGlass({ status: "IN_PROGRESS", isRevealed: false, eligible: true })).toBe(true);
    expect(canNoteHiddenGlass({ status: "OPEN", isRevealed: false, eligible: true })).toBe(true);
    expect(canNoteHiddenGlass({ status: "IN_PROGRESS", isRevealed: true, eligible: true })).toBe(false);
    expect(canNoteHiddenGlass({ status: "IN_PROGRESS", isRevealed: false, eligible: false })).toBe(false);
    expect(canNoteHiddenGlass({ status: "DRAFT", isRevealed: false, eligible: true })).toBe(false);
    expect(canNoteHiddenGlass({ status: "CLOSED", isRevealed: false, eligible: true })).toBe(false);
  });
  it("the title", () => {
    expect(hiddenNoteTitle("Nebbiolo vs Sangiovese", "Glass 3")).toBe("Nebbiolo vs Sangiovese · Glass 3");
  });
  it("hue groups: the wine's own family, or every family when unknown", () => {
    expect(hueGroupsFor("RED")).toEqual([{ family: "RED", hues: ["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"] }]);
    expect(hueGroupsFor(null).map((g) => g.family)).toEqual(["WHITE", "ROSE", "RED"]);
  });
  it("the hint exists in English and Danish", () => {
    expect(makeT("en")(HIDDEN_NOTE_HINT)).toBe("Only you can read this until the glass is revealed. Then it attaches to the wine.");
    expect(uiStrings("da")[HIDDEN_NOTE_HINT]).toBe("Kun du kan læse den, indtil glasset afsløres. Så knyttes den til vinen.");
  });
});
```

**Steps**
- [ ] Write the test; watch it fail; implement `hidden-note.ts` and the keys; green.
- [ ] Types; the modal, editor and colour control; fix what tsc flags in the listed consumers; the stats filters; the archive title.
- [ ] `npm test`; bare tsc; eslint.

**Acceptance**
- `npx vitest run src/lib/wset/hidden-note.test.ts` and `npm test` are green; a bare tsc prints nothing.
- `rg -n -A4 'from\("wset_notes"\)' src/lib/overview-data.ts src/lib/your-numbers.ts src/app/cellar/page.tsx` shows the identity filter on each author-scoped read.
- `rg -n "notFound|can_note_tasting_wine" "src/app/catalog/[wineId]/notes/new/page.tsx"` shows the `blindWine` gate; `git diff --stat -- src/app/taste/notes` prints nothing.

**Closes:** spec §9.3 items 2–5, §9.5 (pure); refinements 11, 12; ledger B8 (the sheet, resolution, counts as a rating once resolved); map PLAY-38 (sheet), XCUT-52 (sheet).

---

### BT-N2 — "Note this glass" entry points

**Depends on:** BT-N1, BT-Y4

**OWNS**
- create `src/app/tastings/[id]/play/note-this-glass.tsx`
- modify `src/app/tastings/[id]/play/locked-in.tsx`
- modify `src/app/tastings/[id]/play/guess-ladder.tsx`
- modify `src/app/tastings/[id]/play/play-experience.tsx`

**Does** (spec §9.3 item 1; B8)
- **`NoteThisGlass`** (client): `NOTE_THIS_GLASS` with `NOTE_THIS_GLASS_SUB` (phone) or `NOTE_THIS_GLASS_SUB_LAPTOP`; when the viewer already has a hidden note on the glass, "Your note · {d} of {t} assessed" (R3's `assessedOf`), which reopens it. It opens `NewNoteModal` with `target={{ kind: "hidden-glass", tastingWineId, tastingName, glassLabel, noteId }}`.
- Mounted in `locked-in.tsx` under "While you wait" (S10) and in the S10b left column, and in the open ladder as a text link under the lock button on both widths ("locked or not").
- `play-experience.tsx` computes `canNoteHiddenGlass(...)` per glass and loads the viewer's own identity-less notes on the tasting's glasses (`wset_notes` with `tasting_wine_id in (…)` and both identities null; RLS returns the author's only).
- Never offered to the host-provides host or the bottle's contributor.

**Interfaces**
- Produces: `NoteThisGlass(props: { tastingWineId: string; tastingName: string; glassLabel: string; existing: { noteId: string; assessed: string } | null; layout: "phone" | "laptop" | "link" }): React.JSX.Element`.

**Tests:** none new.

**Steps**
- [ ] The component; the three mounts; the data; tsc check; eslint.

**Acceptance:** the tsc check is clean; `rg -n "NoteThisGlass" "src/app/tastings/[id]/play"` matches `locked-in.tsx` and `guess-ladder.tsx`.

**Closes:** spec §9.3 item 1; ledger B8 (entry points; reverses "No WSET note can be written while a glass is locked"); map PLAY-38, PLAY-40 (note row), XCUT-05 (note), XCUT-52.

---

## Track BT-S — Semi-blind as a permutation (B9)

### BT-S1 — The semi-blind list (SB1) and its data module

**Depends on:** BT-P6, BT-L2, BT-G2, BT-M9a (live)

**OWNS**
- create `src/lib/semi-blind-data.ts`
- create `src/app/tastings/[id]/semi-blind-list.tsx`
- modify `src/app/tastings/[id]/lobby-view.tsx` (the mount)
- modify `src/app/tastings/[id]/guest-lobby.tsx` (the mount)

**Does** (spec §10.3 item 1; B9 "The list")
- **`semi-blind-data.ts`** (`import "server-only"`), the only place the app reads the semi-blind RPCs:
  - `getSemiBlindCandidates(tastingId)`: `rpc("get_semi_blind_candidates")` → validate the JSON shape → `buildCandidateCard` → `sortCandidates` → `{ cards, pending, revealedGlassByKey }` (`pending` null for a guest before Start); null when the RPC returns null.
  - `getSemiBlindBoard(tastingId, glasses)`: `rpc("get_semi_blind_board")` → `boardFromRpc(glasses, json)`.
  - `getSemiBlindRevealedPicks(tastingId)`: the RPC rows in camelCase.
  - A malformed payload is logged on the server and read as null.
- **`SemiBlindList({ tastingId, hostName, started, viewerIsHost })`** (parchment): `listEyebrow(host)`, `listTitle(cards.length)`, `LIST_BODY`, the cards (producer / "{wine name} {vintage}" / "{appellation} · {grape}", a hatch thumb), `pendingLine(pending)` when `pending` is set, `LIST_FOOTNOTE`, and `beforeStartLine(host)` before Start. On laptops the cards sit in the lobby's main column.
  - **Before Start** (spec §10.3 item 1; Q7) the RPC gives a caller only the cards of glasses they added. A guest with no cards sees `listOpensAtStart(host)` in place of the list; a bring-your-own contributor sees their own cards under that line; the host-provides host sees the whole list.
- Mounted for SEMI_BLIND tastings in `lobby-view.tsx` (the host's DRAFT lobby) and `guest-lobby.tsx` (below the Tonight card). INVITED and DECLINED viewers never see it: the RPC returns null and the component renders nothing.

**Interfaces**
- Produces:
  ```ts
  export async function getSemiBlindCandidates(tastingId: string): Promise<{ cards: CandidateCard[]; pending: number | null; revealedGlassByKey: Record<string, number> } | null>;
  export async function getSemiBlindBoard(tastingId: string, glasses: readonly BoardGlass[]): Promise<Board>;
  export async function getSemiBlindRevealedPicks(tastingId: string): Promise<{ glassWineId: string; participantId: string; correct: boolean; pickKey: string | null; pickLabel: string | null }[]>;
  export function SemiBlindList(props: { tastingId: string; hostName: string; started: boolean; viewerIsHost: boolean }): Promise<React.JSX.Element | null>;
  ```

**Tests:** none new (BT-P6 covers the board and copy; BT-SQL9's probe covers the RPCs).

**Steps**
- [ ] The data module; the list; the two mounts; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "wine_answers|guessed_wine_id" src/lib/semi-blind-data.ts "src/app/tastings/[id]/semi-blind-list.tsx"` prints nothing.
- `rg -n "sortCandidates" src/lib/semi-blind-data.ts` matches.

**Closes:** spec §10.3 item 1; ledger B9 (the list: JOINED and host only, sorted, opaque keys, "still being added"); Q7 (the list from Start); map SB-01, SB-02, SB-03, SB-05, SB-06, SB-07, SB-08, SB-39, GUEST-36 (UI), XCUT-30.

---

### BT-S2 — Matching server actions

**Depends on:** BT-P6, BT-Y1 (`play/actions.ts` order), BT-M9a (live)

**OWNS**
- modify `src/app/tastings/[id]/play/actions.ts`

**Does** (spec §10.3 item 2 (server); refinement 6)
- `assignMatch(tastingId, glassWineId, candidateKey)`:
  1. `resolveGuesser`; `sequentialOrderError` (semi-blind guided refuses a glass beyond `pouredThrough`);
  2. `rpc("assign_semi_blind_match", { p_wine_id: glassWineId, p_candidate_key: candidateKey })`;
  3. errors go through `matchRefusalSentence(error, { glassNumberOf, candidateKey, revealedKeys, lockedIn: LOCKED_EDIT_REFUSAL })` (BT-P6, tested there): "glass locked" (its `detail` is the holder's wine id) → `lockedHolderLabel(holderGlass)` with the glass number from the tasting's wines in list order; "that wine is not in your pool" → `REVEALED_WINE_REFUSAL` when that key is revealed, otherwise the RPC sentence capitalised; "this glass is locked in" → `LOCKED_EDIT_REFUSAL`; M8's "this guess is locked in — change it first" (BT-P6x) → `LOCKED_EDIT_REFUSAL` too — `matchRefusalSentence` maps both to `ctx.lockedIn`; anything else → the RPC sentence capitalised;
  4. no `revalidatePath`; returns `{ ok: true, swappedWith }`.
- `clearMatch(tastingId, glassWineId)` → `rpc("clear_semi_blind_match", { p_wine_id })`, errors mapped the same way.
- `lockGuess` on a semi-blind glass refuses `chooseFirst(n)` when the caller's board row has no key (read through `getSemiBlindBoard`, never `guessed_wine_id`).
- `submitAllMatchGuesses` and `lockGuesses`: `/** @deprecated removed in BT-S3 */`.

**Interfaces**
- Produces:
  ```ts
  export async function assignMatch(tastingId: string, glassWineId: string, candidateKey: string): Promise<{ ok: true; swappedWith: string | null } | { error: string }>;
  export async function clearMatch(tastingId: string, glassWineId: string): Promise<{ ok: true } | { error: string }>;
  ```

**Tests:** none new.

**Steps**
- [ ] The two actions; the semi-blind lock guard; deprecations; tsc check; eslint.

**Acceptance:** the tsc check is clean; `rg -n "assign_semi_blind_match|clear_semi_blind_match" "src/app/tastings/[id]/play/actions.ts"` matches both.

**Closes:** spec §10.3 item 2 (server); ledger B9 (assign, swap, clear, lock per glass); refinement 6; map SB-17, SB-19, SB-20, SB-27 (server).

---

### BT-S3 — The matching board (SB2, SB3)

**Depends on:** BT-S1, BT-S2, BT-N2 (`play-experience.tsx` order), BT-Y2

**OWNS**
- create `src/app/tastings/[id]/play/match-board.tsx`
- delete `src/app/tastings/[id]/play/match-ladder.tsx`
- modify `src/app/tastings/[id]/play/play-experience.tsx`
- modify `src/app/tastings/[id]/play/lock-copy.ts`, `src/app/tastings/[id]/play/lock-copy.test.ts` (delete `MATCH_FOOTER` and its assertion)
- modify `src/app/tastings/[id]/play/actions.ts` (delete `submitAllMatchGuesses`, `lockGuesses`)
- modify `src/app/tastings/[id]/play/ladder-types.ts` (the board props, if shared)

**Does** (spec §10.3 items 2 (UI), 6; B9 "Matching")
- **Dark board.** Header: phone `boardEyebrow({ phone: true, pouredGlass })` and `MATCH_TITLE`; laptop `boardEyebrow({ phone: false, host })`, the tasting name as the title (SB3) and "Glass {n} poured"; the gold `matchedPill(assigned, total)` (matches, never points). On laptops the glass column is headed `THE_GLASSES`.
- **One row per glass in pour order**, from `glassRowState(board, wineId, guided ? pouredThrough : null)`:
  - `open-empty` → `emptyRowText({ phone })`;
  - `open-assigned` → `candidateLabel(card)` with a chevron (phone) or ✕ (laptop);
  - `locked` → the assignment, "locked" and Change it (`unlockGuess`);
  - `not-poured` → `NOT_POURED`, dimmed, no chevron;
  - `revealed` → `revealedRowText(...)` with ✓ or ✗;
  - `own-bottle` → `YOUR_BOTTLE`.
- **The pool:** phone `unassignedHeading(n)` over `poolFor(cards, board)`; laptop `THE_BOTTLES` with `stillUnassigned(n)` on its own line, over every card (assigned cards at 0.65 with a gold "Glass {N}" pill; a card held by a locked glass shows `lockedHolderLabel(N)`).
- **Phone helper:** `poolHelperLines(poolCards)`.
- **Footer:** `footerLine(host, { phone })`; on laptops `clearGlassLabel(n)` for the current glass; `lockGlassLabel(n)` with `LOCK_ONLY_THIS`.
- **Current glass:** the pointer's glass in LIVE guided (`currentGlass`), otherwise the first open, unlocked, unassigned glass.
- **Interactions:**
  - tap a glass → `FieldPicker` over the pool with `skipLabel={null}` (D14 play-7 stays);
  - laptop: click a bottle, then a glass; or drag a bottle's "⋮⋮" onto a glass (pointer events; clicking is the keyboard fallback);
  - assign → `applyAssignment` optimistically, then `assignMatch`; a refusal reverts and shows its sentence;
  - ✕ / Clear → `clearAssignment` + `clearMatch`;
  - lock per glass → `lockGuess` (after `chooseFirst`); Change it per glass → `unlockGuess`.
- **ASYNC IMMEDIATE:** locking scores the glass for the viewer; the board shows that result, and `knownKeyByGlass` removes the proven wine from the viewer's own pool.
- **`play-experience.tsx`:** the semi-blind branch loads `getSemiBlindCandidates` and `getSemiBlindBoard` (never `wine_answers` for candidates, never `guessed_wine_id`) and renders `MatchBoard`; the old candidate intro and `MatchLadder` go.
- Delete `MATCH_FOOTER`, `submitAllMatchGuesses`, `lockGuesses` and `match-ladder.tsx`.

**Interfaces**
- Consumes: BT-P6 board and copy; BT-S1 loaders; BT-S2 actions; `FieldPicker` (BT-Y2); `currentGlass`, `pouredThrough` (BT-P3).
- Produces: `MatchBoard(props: { tastingId: string; hostName: string; cards: CandidateCard[]; board: Board; pouredThroughIndex: number | null; currentGlassWineId: string | null; timingMode: TimingMode; asyncRevealPolicy: AsyncRevealPolicy; pending: number }): React.JSX.Element`.

**Tests:** `lock-copy.test.ts` drops its `MATCH_FOOTER` assertion (and the import); every other case stays.

**Steps**
- [ ] The board; the play-experience branch; deletions; `npm test`; tsc check; eslint.

**Acceptance**
- `npm test` is green; the tsc check is clean.
- `rg -n "MatchLadder|match-ladder|submitAllMatchGuesses|lockGuesses|MATCH_FOOTER" src` prints nothing.
- `rg -n "guessed_wine_id" "src/app/tastings/[id]/play"` prints nothing.

**Closes:** spec §10.3 items 2, 6; ledger B9 (matching: one row per glass, dimmed unpoured glasses, swap, locked holder, autosave, per-glass lock, Change it, clear); map SB-09, SB-10, SB-11, SB-12, SB-13 (UI), SB-14, SB-15, SB-16, SB-17 (UI), SB-19, SB-20, SB-21, SB-22, SB-23, SB-24, SB-25, SB-26, SB-27, SB-28, SB-40, XCUT-03 (board dark); supporting: SB-03, SB-18, SB-39.

---

### BT-S4 — The semi-blind reveal (SB4) and the semi-blind console

**Depends on:** BT-S3, BT-H2

**OWNS**
- create `src/app/tastings/[id]/play/semi-blind-reveal.tsx`
- modify `src/app/tastings/[id]/play/play-experience.tsx`
- modify `src/app/tastings/[id]/host/page.tsx`
- modify `src/app/tastings/[id]/host/console.tsx`

**Does** (spec §10.3 items 3, 5; §7.3 item 6; MISSED-04)
- **`SemiBlindReveal`** (dark), for the glass just revealed:
  - `revealingGlassEyebrow(n)` and `revealedSoFar(k, N)`; `glassWas(n)`; gold "{producer} {vintage}"; meta "{appellation} · {region} · {grape}" (the wine is revealed, so its `wine_answers` row is readable);
  - `revealResult({ hit, pickLabel, mine, revealed })` from `getSemiBlindRevealedPicks`;
  - `HOW_THE_TABLE_SPLIT`: one bar per candidate picked for this glass, "{producer}, {wine name} {count}" from `board.splitByGlass` labelled from the candidate cards; the right one gold, the others rose;
  - `poolNoteLines(remainingCards)`;
  - `STANDINGS_ONE_POINT`: rank, name, match count.
  - Laptop (S11b with one row): the hero and the single result row on the left; standings and the split in the right rail.
- **`play-experience.tsx`:** the most recently revealed semi-blind glass renders `SemiBlindReveal`; earlier ones a compact revealed row. Never the parchment answer card.
- **Console** (LIVE semi-blind host-provides): the chips collapse to one gold "Reveal glass {n}" (`revealFull` → `reveal_wine`), with no Reveal everything; before the reveal the rail shows "{k}/{n} locked in" only; after it `HOW_THE_TABLE_SPLIT` from `getSemiBlindBoard` with labels from `getSemiBlindCandidates`, and "Matched this glass {k} of {n}". `host/page.tsx` stops reading `guessed_wine_id`.

**Interfaces**
- Produces: `SemiBlindReveal(props: { glass: number; revealedCount: number; total: number; identity: { producer: string; vintage: string; meta: string }; result: { hit: boolean; pickLabel: string | null; mine: number }; split: { label: string; count: number; correct: boolean }[]; poolCards: CandidateCard[]; standings: { rank: number; tied: boolean; name: string; matches: number }[] }): React.JSX.Element`.

**Tests:** none new.

**Steps**
- [ ] The reveal component; the play branch; the console branch; tsc check; eslint.

**Acceptance:** the tsc check is clean; `rg -n "guessed_wine_id" "src/app/tastings/[id]/host"` prints nothing.

**Closes:** spec §10.3 items 3, 5; §7.3 item 6; ledger B9 (reveal a whole glass, the pool release shown, standings counting matches), B6 (semi-blind LIVE host-provides console); MISSED-04; map SB-18 (UI), SB-29, SB-30, SB-31, SB-32, SB-33, SB-34, SB-35.

---

### BT-S5 — Explicit `guesses` column lists everywhere (the M9b gate)

**Depends on:** BT-R3, BT-S4

**OWNS**
- modify `src/app/tastings/[id]/play/play-experience.tsx`
- modify `src/app/tastings/[id]/play/actions.ts`
- modify `src/app/tastings/[id]/host/page.tsx`
- modify `src/app/tastings/[id]/results/page.tsx`
- modify `src/app/u/[id]/tastings/[tastingId]/page.tsx`

**Does** (spec §10.4 (e) app consequences; §11.3 item 11 last sentence; §1.5 deploy order)
- Replace every `from("guesses").select("*")` with `select(GUESS_READ_COLUMNS)` (or a narrower explicit list) in these five files. `profile-stats.ts`, `your-numbers.ts`, `overview-data.ts`, `taste-archive-data.ts` and `tastings/new/actions.ts` already pass explicit lists without `guessed_wine_id` (checked 2026-09-13); the gate confirms it.
- `/u/[id]/tastings/[tastingId]`: semi-blind picks come from `getSemiBlindRevealedPicks(tastingId)` (`pickLabel`, `correct`), not from `guessed_wine_id` or a candidate `wine_answers` lookup.
- Any other `guessed_wine_id` reader found moves to the RPCs (stop and report if it is in a file outside OWNS).

**Tests:** none new.

**Steps**
- [ ] The five files; bare tsc; eslint; the gates.

**Acceptance**
- A bare `npx tsc --noEmit` prints nothing.
- `rg -U -n 'from\("guesses"\)\s*\.select\("\*"\)' src` prints nothing.
- `rg -n "guessed_wine_id" src --glob '!src/lib/supabase/database.types.ts'` prints nothing.

**Closes:** spec §10.4 (e) (app half), §1.5 (the M9 prerequisite); ledger B9 (lockdown readiness); map SB-04 (client half), RECORD-15 (per-person page).

---

### BT-S6 — `RevealSync` without table-wide `guesses` SELECT (conditional)

**Depends on:** BT-M9b, and only when its Realtime check found no `guesses` frames

**OWNS**
- modify `src/components/reveal-sync.tsx`

**Does** (spec §10.4 (e), last bullet; refinement 14)
- Drop the `postgres_changes` subscription on `guesses`; keep the `wines` channel; lock chatter falls back to `AutoRefresh`. Rewrite the header comment to say why.

**Acceptance**
- The tsc check is clean; `rg -n 'table: "guesses"' src/components/reveal-sync.tsx` prints nothing.
- Main session, in the browser: a lock in one tab shows in the other within one `AutoRefresh` interval.

**Closes:** spec §10.4 (e) Realtime fallback; map PLAY-41 (channel decision).

---

## Track BT-R — Reveal, result, record (B10)

### BT-R1 — The reveal view and glass numbering (S11, S11b)

**Depends on:** BT-S4 (`play-experience.tsx` order), BT-D2, BT-P2, BT-P4, BT-P7

**OWNS**
- modify `src/app/tastings/[id]/play/reveal-view.tsx`
- modify `src/app/tastings/[id]/play/play-experience.tsx`
- modify `src/lib/wine-label.ts`, `src/lib/wine-label.test.ts`
- modify `src/app/tastings/[id]/running-view.tsx`

**Does** (spec §11.3 items 1–7; MISSED-01, MISSED-03; refinement 16)
- Laptop header: `revealingGlass(n)` · `revealHeaderMeta(k, m, host)`, with `rankDeltaPill` in the header row; phones keep the delta on the standings card.
- `lockedLine(hidden)` under the rows whenever a step is still hidden.
- `RevealView` renders only where `stepRevealApplies(...)` holds (BT-P4; Q8) — the predicate the console's chips use — and types `in_play_count` as `number | null` (null only at step 0, where it renders nothing).
- **Joined after** (B4; spec §5.3 item 4): a revealed glass's card in `play-experience.tsx` reads "You joined after this glass" in place of its verdict when `joinedAfterReveal(viewer, glass)` holds (BT-P2), using `wines.revealed_at` (M3) and the viewer's `joined_at`.
- The "This glass" rail (laptop) for participants: `glassFacts` over `get_wine_reveal`'s `guesses` (revealed keys only; from step 1 every row on the glass carries `scored_at`), n = eligible participants (`eligibleForGlass`).
- Motion: the hero, the verdict pill, the newly revealed row's "+N" and the delta pill take `animate-rise-in`, keyed on `reveal_step` (a React `key`); nothing moves under `prefers-reduced-motion`.
- The standings card: top 3 on phones, top 5 on laptops, the viewer's row always included (refinement 16).
- **Numbering:** `makeGlassLabeler` returns "Glass {n}" by list order (or the contributor label). Guest-facing surfaces use it: the running view's navigator chips and progress ("{revealed} of {n} glasses"), `/play`'s header ("Glass {index} of {total}", never the stored position), the glass cards in `play-experience.tsx`. The host lobby's Wines card keeps "Wine N".
- Tokens only in `reveal-view.tsx`.

**Interfaces**
- Produces:
  ```ts
  export function makeGlassLabeler(
    wines: WineRow[],
    wineSource: "HOST_PROVIDES" | "PARTICIPANT_CONTRIBUTED",
    nameByParticipantId: Map<string, string>,
  ): (wine: WineRow) => string;
  // RevealView props gain: hostName: string; eligibleIds: string[]
  ```

**Tests (write first)** — add to `src/lib/wine-label.test.ts` (and add `makeGlassLabeler` to its import):
```ts
describe("makeGlassLabeler (MISSED-01)", () => {
  const wines = [
    { id: "w3", position: 7, contributor_participant_id: null },
    { id: "w1", position: 2, contributor_participant_id: null },
    { id: "w2", position: 5, contributor_participant_id: "p1" },
  ];
  it("numbers guest-facing glasses by list order", () => {
    const label = makeGlassLabeler(wines, "HOST_PROVIDES", new Map());
    expect(wines.map(label)).toEqual(["Glass 3", "Glass 1", "Glass 2"]);
  });
  it("keeps the contributor label in bring-your-own", () => {
    const label = makeGlassLabeler(wines, "PARTICIPANT_CONTRIBUTED", new Map([["p1", "Gustav"]]));
    expect(label(wines[2])).toBe("Gustav's wine");
    expect(label(wines[0])).toBe("Glass 3");
  });
});
```

**Steps**
- [ ] Write the test; watch it fail; implement `makeGlassLabeler`; green.
- [ ] The reveal view; the play and running-view numbering; tsc check; eslint.

**Acceptance**
- `npx vitest run src/lib/wine-label.test.ts` is green; the tsc check is clean.
- `rg -n '>Wine |"Wine \$\{|Wine \{|of \$\{[a-zA-Z.]+\} wines' "src/app/tastings/[id]/play" "src/app/tastings/[id]/running-view.tsx"` prints nothing.

**Closes:** spec §11.3 items 1–7, §5.3 item 4 (joined after on the running page); ledger B10 (the reveal additions; numbering), B4 (joined after); Q8 (the RevealView gate); MISSED-01, MISSED-03; refinement 16; map REVEAL-01, REVEAL-02 (RevealView gate), REVEAL-03, REVEAL-04, REVEAL-05, REVEAL-06, REVEAL-08, REVEAL-09, REVEAL-10, REVEAL-11, REVEAL-12, RECORD-07 (numbering), XCUT-06.

---

### BT-R2 — The result (S12, S12b)

**Depends on:** BT-R1, BT-S1, BT-P3, BT-M3 (live)

**OWNS**
- create `src/lib/tasting-result.ts`
- modify `src/lib/result-math.ts`, `src/lib/result-math.test.ts`
- create `src/app/tastings/[id]/result/result-view.tsx`
- create `src/app/tastings/[id]/result/closed-surface.tsx`
- modify `src/app/tastings/[id]/finished-view.tsx`

**Does** (spec §11.3 items 8–10; §6.3 item 3 (CLOSED); refinement 18; B4 joined-after)
- **`result-math.ts`:** `SemiBlindGuessRow` drops `guessed_wine_id` for `pick_key: string | null`; semi-blind glasses are `SemiBlindResultGlass = ResultGlass & { candidateKey: string | null }`; `semiBlindScore`, `semiBlindAgreedLeast` and `semiBlindResult` take them and compare `pick_key` with the glass's `candidateKey`; `SplitSentence.pickId` carries the key; comments that mention `guessed_wine_id` are rewritten.
- **`tasting-result.ts`** (`import "server-only"`) — `getTastingResult(tastingId)` per spec §11.3 item 9:
  - the tasting (with `started_at`, `finished_at`), participants (with `joined_at`), wines in list order (with `revealed_at`);
  - `wine_answers` of fully revealed glasses; `guesses` on those glasses via `GUESS_READ_COLUMNS`; `getTastingLeaderboard`; `getSemiBlindRevealedPicks` for semi-blind (with each glass's `candidateKey` from the picks marked `correct`, or `getSemiBlindBoard`'s revealed keys);
  - eligibility per glass from `eligibleForGlass`; a glass the viewer `joinedAfterReveal` stays in their eligible set, so it counts 0 against their maximum;
  - competitors = JOINED minus the host-provides host, ranked by `rankRows` over the leaderboard totals;
  - `blindResult` / `semiBlindResult` for the viewer; every label resolved on the server (`pickLabel`, grape names by id lookup, `shortWineName`, `glassTitle`).
- **`ResultView`** (dark; client for Share), spec §11.3 item 10 with `result-copy.ts`: eyebrow; `YOU_FINISHED` + ordinal + line, or `hostedLines`; the table (phones: top four with the viewer highlighted, appended when outside; laptops: every place, under `FINAL_STANDINGS`); best glass; strongest attribute; the agreed-least line; `excludedLines`; "See every wine" (dismisses) and Share (`navigator.share({ url, text })`; when missing, or rejected with anything but `AbortError`, `navigator.clipboard.writeText(url)` and `LINK_COPIED` for 3 seconds). Laptop S12b layout.
- **`ClosedSurface`** (client): `useSyncExternalStore` over `readDismissed`. The server snapshot is `null` (unknown) and renders only the page header, so a reload of a dismissed tasting never flashes the dark result; the client snapshot then picks the result or the record. "See every wine" calls `writeDismissed` (on failure the flag lives in component state for the visit); the result renders inside `LiveShell active`, the record (children) on parchment. localStorage stays the store (B5).
- **`finished-view.tsx`:** `<ClosedSurface tastingId result={<ResultView … />}>{the existing finished board}</ClosedSurface>`; BT-R3 swaps the children for the record. An INVITED viewer's "has finished" card stays first.

**Interfaces**
- Produces:
  ```ts
  export type SemiBlindResultGlass = ResultGlass & { candidateKey: string | null };
  export type SemiBlindGuessRow = { wine_id: string; participant_id: string; pick_key: string | null; total_points: number | null };
  export type TastingResultView = {
    mode: RevealMode; viewerRole: "competitor" | "host-provides-host" | "spectator"; tastingName: string;
    placing: { ordinal: string; line: string } | null; hosted: { title: string; line: string } | null;
    table: { rank: number; tied: boolean; name: string; total: number; isViewer: boolean }[];
    bestGlass: { score: string; name: string } | null; strongest: { title: string; detail: string; caption: string } | null;
    agreedLeast: string | null; excluded: string[]; share: ShareInput; resultsUrl: string;
  };
  export async function getTastingResult(tastingId: string): Promise<TastingResultView | null>;
  export function ClosedSurface(props: { tastingId: string; result: React.ReactNode; children: React.ReactNode }): React.JSX.Element;
  ```

**Tests (write first)** — in `src/lib/result-math.test.ts`, change the semi-blind fixture helpers to keys (every existing semi-blind expectation stays as it is):
```ts
const sGlass = (wineId: string, over: Partial<SemiBlindResultGlass> = {}): SemiBlindResultGlass => ({
  wineId, isRevealed: true, revealStep: 0, eligibleParticipantIds: GUESTS, candidateKey: `k-${wineId}`, ...over,
});
const pick = (wine: string, participant: string, guessed: string | null): SemiBlindGuessRow => ({
  wine_id: wine,
  participant_id: participant,
  pick_key: guessed === null ? null : `k-${guessed}`,
  total_points: guessed === wine ? 1 : 0,
});
```
and add:
```ts
it("a glass revealed before a late joiner arrived counts 0 against their maximum (B4)", () => {
  const answer = { primary_grape_id: "neb", appellation_id: "barolo", secondary_grape_id: null, producer_id: "p", type_designation_id: null, vintage_kind: "YEAR" };
  const glass = (wineId: string): BlindResultGlass => ({ wineId, isRevealed: true, revealStep: 0, eligibleParticipantIds: ["late"], answer });
  const scored: BlindGuessRow = {
    wine_id: "b2", participant_id: "late", primary_grape_id: "neb",
    country_points: 2, region_points: 3, appellation_points: 5, primary_grape_points: 8,
    secondary_grape_points: null, producer_points: 0, type_designation_points: null, vintage_points: 0, total_points: 18,
  };
  const r = blindResult([glass("b1"), glass("b2")], [scored], "late");
  expect(r.glasses.map((g) => [g.wineId, g.points, g.hasRow])).toEqual([["b1", 0, false], ["b2", 18, true]]);
  expect(r.maximum).toBe(2 * glassMaxPoints(answer));
});
```
Add `SemiBlindResultGlass`, `BlindResultGlass`, `BlindGuessRow`, `blindResult`, `glassMaxPoints` to the imports where missing.

**Steps**
- [ ] Update the tests; watch them fail; change `result-math.ts`; green.
- [ ] The loader; `ResultView`; `ClosedSurface`; `finished-view.tsx`; tsc check; eslint.

**Acceptance**
- `npx vitest run src/lib/result-math.test.ts` is green; the tsc check is clean.
- `rg -n "guessed_wine_id" src/lib/result-math.ts src/lib/result-math.test.ts` prints nothing.

**Closes:** spec §11.3 items 8–10; §6.3 item 3; refinement 18; ledger B10 (S12), B5 (CLOSED dark until dismissed), B4 (joined-after counts 0); map RESULT-01, RESULT-02, RESULT-03, RESULT-04, RESULT-05, RESULT-06, RESULT-07, RESULT-08, RESULT-09, RESULT-10, RESULT-11, RESULT-12, RESULT-13, RESULT-14, SB-36, XCUT-02 (CLOSED), XCUT-07; supporting: XCUT-59.

---

### BT-R4 — Export the flight and Save all

**Depends on:** BT-R2, BT-M5 (live: its insert policy accepts the minimal notes)

**OWNS**
- create `src/lib/flight-csv.ts`, `src/lib/flight-csv.test.ts`
- create `src/app/tastings/[id]/export.csv/route.ts`
- create `src/app/tastings/[id]/record-actions.ts`

**Does** (spec §11.3 items 16–17; Q5)
- **`flight-csv.ts`** (pure; tests first): `exportAllowed({ status, viewerRole })`, `flightCsvRows({ glasses, answersByWineId, viewer })` and `glassesNeedingNotes(revealedWineIds, notedWineIds)`. The route and the action only load data and call these.
- **Route**, on the `calendar.ics` pattern: a 404 with `Cache-Control: private, no-store` unless `exportAllowed` (the host and JOINED participants, CLOSED only); `Content-Type: text/csv; charset=utf-8`; `Content-Disposition: attachment; filename="{slug}-flight.csv"` (slug as `icsFilename` builds it, with `.csv`). Columns per spec §11.3 item 17, from `flightCsvRows`: a never-revealed glass exports its number and "no" with every other column empty; "brought by" only in bring-your-own; "your points" only when the viewer competed. Built with `csvDocument`.
- **`saveAllToRatings(tastingId)`** (`"use server"`): CLOSED; the caller JOINED or host; for each glass in `glassesNeedingNotes(fully revealed glass ids, ids of glasses the caller already noted)`, insert `{ author_id, catalog_wine_id | unidentified_wine_id (from wine_answers), context_kind: "BLIND", tasting_wine_id, tasted_on }` with `tasted_on` = the local date of `finished_at ?? scheduled_at ?? now`; revalidates `/taste/notes` and the tasting.

**Interfaces**
- Produces: `saveAllToRatings(tastingId: string): Promise<{ saved: number; total: number } | { error: string }>`; `GET /tastings/[id]/export.csv`; and

```ts
// src/lib/flight-csv.ts (pure)
export type CsvViewerRole = "host-provides-host" | "host" | "competitor" | "other";
export type CsvAnswer = {
  producer: string; wineName: string | null; vintage: string; country: string; region: string;
  appellation: string | null; primaryGrape: string; secondaryGrape: string | null; typeDesignation: string | null;
};
export type CsvGlass = { glass: number; wineId: string; isRevealed: boolean; broughtBy: string | null; viewerPoints: number | null };
export function exportAllowed(input: { status: TastingStatus; viewerRole: CsvViewerRole }): boolean;
export function flightCsvRows(input: {
  glasses: readonly CsvGlass[]; answersByWineId: ReadonlyMap<string, CsvAnswer>;
  viewer: { role: CsvViewerRole; wineSource: WineSourceMode };
}): CsvCell[][];                                                    // the header row first
export function glassesNeedingNotes(revealedWineIds: readonly string[], notedWineIds: ReadonlySet<string>): string[];
```

**Tests (write first)** — `src/lib/flight-csv.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { exportAllowed, flightCsvRows, glassesNeedingNotes, type CsvAnswer, type CsvGlass } from "./flight-csv";

const answer: CsvAnswer = {
  producer: "Vietti", wineName: "Barolo Castiglione", vintage: "2017", country: "Italy", region: "Piedmont",
  appellation: "Barolo DOCG", primaryGrape: "Nebbiolo", secondaryGrape: null, typeDesignation: null,
};
const glasses: CsvGlass[] = [
  { glass: 1, wineId: "w1", isRevealed: true, broughtBy: "Gustav", viewerPoints: 18 },
  { glass: 2, wineId: "w2", isRevealed: false, broughtBy: "Maja", viewerPoints: null },
];
const answers = new Map([["w1", answer], ["w2", answer]]);
const byoCompetitor = { role: "competitor", wineSource: "PARTICIPANT_CONTRIBUTED" } as const;

describe("flight CSV (S13; rule 1)", () => {
  it("a never-revealed glass is only its number and 'no', even when the loader holds its answer", () => {
    const rows = flightCsvRows({ glasses, answersByWineId: answers, viewer: byoCompetitor });
    expect(rows[2]).toEqual([2, "no", "", "", "", "", "", "", "", "", "", "", ""]);
    expect(rows[1].slice(0, 3)).toEqual([1, "yes", "Vietti"]);
  });
  it("'brought by' only in bring-your-own; 'your points' only for someone who competed", () => {
    expect(flightCsvRows({ glasses, answersByWineId: answers, viewer: byoCompetitor })[0].slice(-2)).toEqual(["brought by", "your points"]);
    const hosted = flightCsvRows({ glasses, answersByWineId: answers, viewer: { role: "host-provides-host", wineSource: "HOST_PROVIDES" } });
    expect(hosted[0]).not.toContain("brought by");
    expect(hosted[0]).not.toContain("your points");
  });
  it("exports only a CLOSED tasting, to its host or a JOINED participant", () => {
    expect(exportAllowed({ status: "CLOSED", viewerRole: "competitor" })).toBe(true);
    expect(exportAllowed({ status: "CLOSED", viewerRole: "host-provides-host" })).toBe(true);
    expect(exportAllowed({ status: "IN_PROGRESS", viewerRole: "host" })).toBe(false);
    expect(exportAllowed({ status: "CLOSED", viewerRole: "other" })).toBe(false);
  });
  it("Save all saves only glasses without a note, so a second tap saves nothing", () => {
    expect(glassesNeedingNotes(["w1", "w2", "w3"], new Set(["w2"]))).toEqual(["w1", "w3"]);
    expect(glassesNeedingNotes(["w1", "w3"], new Set(["w1", "w3"]))).toEqual([]);
  });
});
```
`csv.ts` (BT-P7) covers quoting and the formula guard.

**Steps**
- [ ] The route; the action; tsc check; eslint.

**Acceptance:** `npx vitest run src/lib/flight-csv.test.ts` is green; the tsc check is clean; `rg -n "private, no-store" "src/app/tastings/[id]/export.csv/route.ts"` and `rg -n "flightCsvRows|exportAllowed" "src/app/tastings/[id]/export.csv/route.ts"` match; `rg -n "glassesNeedingNotes" "src/app/tastings/[id]/record-actions.ts"` matches.

**Closes:** spec §11.3 items 16 (server), 17, §11.5 (`flight-csv.test.ts`); ledger B10 (Export the flight, Save all); Q5; map RECORD-12, RECORD-13.

---

### BT-R3 — The record and `/results` (S13, S13b)

**Depends on:** BT-R4

**OWNS**
- create `src/app/tastings/[id]/record/record-view.tsx`
- create `src/app/tastings/[id]/record/record-actions-bar.tsx`
- create `src/lib/record-history.ts`
- create `src/lib/record-rows.ts`, `src/lib/record-rows.test.ts`
- modify `src/app/tastings/[id]/results/page.tsx`
- modify `src/app/tastings/[id]/finished-view.tsx`

**Does** (spec §11.3 items 11–16)
- **`RecordView({ tastingId })`** (parchment, server):
  - header per item 12 ("Tonight · you hosted · {n} tasters" when the viewer hosted and `finished_at` is within 24 hours, else the date via `LocalDateTime`); the name; totals "{score} of {maximum}" and "{ordinal} of {n}" (laptop right, phone band) or "You hosted" for the host-provides host;
  - legend per item 13 with `legendLabels({ phone })`; the rows under `GLASS_BY_GLASS`;
  - rows per item 14, each from pure `recordRowModel` (below): position; label thumb (`wine_answers.image_url`, `.hatch`); identity and meta; provenance "{contributor} brought it" / "added while pouring" (`created_at > started_at`); six marks from `glassMarks`; points; "Glass {n} · never revealed" (no identity, marks or points); "You joined after this glass" with 0; semi-blind one ✓/✗ with "you said {pickLabel}" on a miss; a host-provides host sees identities without marks and points; a chevron (phone) to `/tastings/{id}/results/{n}` (BT-R5 adds the route and the laptop expansion);
  - the pattern sentence from `recordPattern` + `getCategoryRatesByTasting`, only when it exists;
  - `RecordActionsBar`: laptop Export outlined, Save primary; phone Save first, Export second; Save shows "Saved {k} notes to Tasting notes" with a link, or "All saved to your ratings" disabled when nothing is left.
- **`record-rows.ts`** (pure; tests first): `recordRowModel(input)` → `{ kind: "never-revealed"; glass }`, `{ kind: "joined-after"; glass; points: 0 }`, `{ kind: "blind"; glass; identity; meta; provenance; marks; points }`, `{ kind: "semi-blind"; glass; identity; hit; pickLabel; points }` or `{ kind: "hosted"; glass; identity; meta; provenance }`.
- **`record-history.ts`** (`import "server-only"`): `getCategoryRatesByTasting(userId, excludeTastingId)` — the viewer's scored guesses on fully revealed glasses of their CLOSED blind tastings (the `profile-stats.ts` rules), at most the 20 most recent.
- **`results/page.tsx`:** CLOSED → `RecordView`; IN_PROGRESS keeps T7's "Standings so far"; semi-blind picks from `getSemiBlindRevealedPicks`, never `guessed_wine_id`.
- **`finished-view.tsx`:** `ClosedSurface`'s children become `RecordView`.

**Interfaces**
- Produces: `recordRowModel` (`src/lib/record-rows.ts`, the kinds in Does); `RecordView(props: { tastingId: string }): Promise<React.JSX.Element>`; `RecordActionsBar(props: { tastingId: string; revealedCount: number; alreadySaved: number })`; `getCategoryRatesByTasting(userId: string, excludeTastingId: string): Promise<CategoryRate[][]>`.

**Tests (write first)** — `src/lib/record-rows.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { recordRowModel } from "./record-rows";

const answer = { producer: "Vietti", wineName: "Barolo Castiglione", vintage: "2017", appellation: "Barolo DOCG", region: "Piedmont", grape: "Nebbiolo" };
const base = {
  glass: { number: 3, isRevealed: true, contributor: null, addedWhilePouring: false },
  answer, marks: ["hit", "hit", "miss", "hit", "miss", "near"] as const, points: 16, pickLabel: null,
  mode: "BLIND" as const, viewerRole: "competitor" as const, joinedAfter: false,
};

describe("recordRowModel (S13 rows)", () => {
  it("a never-revealed glass carries no identity, marks or points (rule 1)", () => {
    expect(recordRowModel({ ...base, glass: { ...base.glass, isRevealed: false }, answer: null })).toEqual({ kind: "never-revealed", glass: 3 });
  });
  it("a glass revealed before the viewer joined counts 0", () => {
    expect(recordRowModel({ ...base, joinedAfter: true })).toEqual({ kind: "joined-after", glass: 3, points: 0 });
  });
  it("semi-blind: one mark, 1 / 0, and the pick on a miss", () => {
    expect(recordRowModel({ ...base, mode: "SEMI_BLIND", points: 0, pickLabel: "Brovia, Barolo Villero 2016" }))
      .toMatchObject({ kind: "semi-blind", hit: false, points: 0, pickLabel: "Brovia, Barolo Villero 2016" });
  });
  it("a host-provides host sees identities without marks or points", () => {
    const row = recordRowModel({ ...base, viewerRole: "host-provides-host" });
    expect(row).toMatchObject({ kind: "hosted", glass: 3 });
    expect(row).not.toHaveProperty("marks");
    expect(row).not.toHaveProperty("points");
  });
});
```
`record-pattern.ts` (BT-P7) covers the pattern sentence.

**Steps**
- [ ] History loader; the record; the actions bar; the results page and finished view; tsc check; eslint.

**Acceptance**
- The tsc check is clean.
- `rg -n "guessed_wine_id" "src/app/tastings/[id]/results"` prints nothing.
- `rg -n "RecordView" "src/app/tastings/[id]/results/page.tsx" "src/app/tastings/[id]/finished-view.tsx"` matches both.
- `npx vitest run src/lib/record-rows.test.ts` is green; `rg -n "recordRowModel" "src/app/tastings/[id]/record/record-view.tsx"` matches.

**Closes:** spec §11.3 items 11–16; ledger B10 (S13 record, the pattern sentence, footer actions); map RECORD-01, RECORD-03, RECORD-04, RECORD-05, RECORD-06, RECORD-07, RECORD-08, RECORD-09, RECORD-10, RECORD-11, RECORD-12, RECORD-13, RECORD-14, RECORD-15, RESULT-12 (record), RESULT-14 (record); supporting: XCUT-59.

---

### BT-R5 — One glass and its actions (S13c)

**Depends on:** BT-R3, BT-L3 (`types.ts`, `add-wine-sheet.tsx`, `sheet-state.ts` order), BT-N1 (`new-note-modal.tsx` order), BT-M5 (live: `save_wset_note` writes `unidentified_wine_id`), TR-R6

**OWNS**
- create `src/app/tastings/[id]/record/record-glass.tsx`
- create `src/app/tastings/[id]/record/glass-actions.tsx`
- create `src/app/tastings/[id]/results/[glass]/page.tsx`
- modify `src/app/tastings/[id]/record/record-view.tsx` (the laptop in-place expansion)
- modify `src/components/add-wine/types.ts` (`AddWineOpenOptions.preselect` only)
- modify `src/components/add-wine-context.tsx` (the preselect routing; BT-A0: also `OpenNote`, `add-wine-context.tsx:109`, currently `{ seq; pick }` — see Does)
- modify `src/components/add-wine/add-wine-sheet.tsx` (the cellar preselect → lot step; unidentified → by hand, prefilled)
- modify `src/components/add-wine/sheet-state.ts`, `src/components/add-wine/sheet-state.test.ts` (the preselect cases; add only, never rename)
- modify `src/components/add-wine/by-hand-actions.ts` (`loadUnidentifiedWineDraft` only)
- modify `src/components/new-note-modal.tsx` (the catalog target's `unidentifiedWineId` alternative)

**Does** (spec §11.3 items 18–19)
- **`RecordGlass({ tastingId, glass, layout })`:** ← back; eyebrow "{tasting} · tonight" (or "· {d Mon}"); "Glass {n} of {m}"; ‹ ›; the identity with the country; the label photo (hatch fallback); "{points} of {glass max}"; six lines (plus secondary grape and designation when in play) with the truth, "you: {answer}" or "you: skipped it", and "+{n}" gold-tinted for a hit, "+1" for a near vintage, "0" otherwise; "Do something with it"; footer prev / next "Glass {n−1} · {producer short}" and "Glass {n+1} · {producer short} ›". It walks revealed glasses only; a never-revealed glass number 404s.
- **Route** `/tastings/[id]/results/[glass]` renders `layout="page"` (phones); `RecordView` expands a laptop row in place with `layout="inline"`.
- **`GlassActions`** (client) through `useAddWine().openAddWineSheet`:
  - Rate it → `openAddWineSheet({ kind: "note" }, { preselect: { catalogWineId, tastingWineId } })`: the provider skips the pick and opens `NewNoteModal` on that wine with `tastingWineId` and `contextKind: "BLIND"`. BT-A0: as landed, the provider's `OpenNote` state (`add-wine-context.tsx:109`) is only `{ seq; pick }`, and it renders `NewNoteModal` with just `wineId` and `cellarConsume` (`:323-335`) — no `tastingWineId` or `contextKind` reach the modal today, so this task must add both fields to `OpenNote` and thread them through, inside its own "preselect routing" OWNS entry. (Alternative, if that plumbing proves awkward: `GlassActions` mounts `NewNoteModal` itself instead of going through the provider's note state.) Either way R6's confirmation still fires: `NoteSavedStepContext` wraps every child (`add-wine-context.tsx:308`), so it is unaffected by which path opens the modal. `NotePick` itself (`types.ts:68`, `{ catalogWineId; lotId?; consume? }`) needs no change.
  - Add to my cellar → BT-A0: reuse the provider's existing `openAddWine("cellar", { cellarWine: { id, label } })` path (`add-wine-context.tsx:244-262`), not a new `preselect`/`initialLot` plumbing path — it already opens straight on the lot step with a title, which is all this needs.
  - Open it in the catalog → `/catalog/{catalogWineId}`.
  - An unidentified wine: Rate it opens the note with `unidentifiedWineId` (M5's `save_wset_note` writes it); Add to my cellar loads `loadUnidentifiedWineDraft(unidentifiedWineId)` and dispatches the `openByHand` `SheetAction` through `adds.send` — `adds.send({ type: "openByHand", origin: { kind: "new" }, draft, focusField: null })` (BT-A0: `openByHand` is not an exported function to call directly — it is a `SheetAction`, `sheet-state.ts:153`, sent through `use-sheet-adds.ts:142` — the earlier `openByHand({ kind: "new" }, draft)` call form does not exist) — the form writes the catalog wine first; no catalog link.
  - BT-A0: the cellar path above reuses existing provider plumbing and needs no new reducer case; only the unidentified preselect (landing on by hand) is a new reducer case, with a test.

**Interfaces**
- Consumes: AW-S5b's `initialSheetState({ destination, options, canScan, initialLot })` (BT-A0: `initialLot` is `AddSource | null`, e.g. `{ kind: "catalog", catalogWineId, via: "search" }`, not `{ catalogWineId }`; `canScan` is `boolean | null`, where `null` means "resolving"); AW-F12/AW-S5a's `openByHand` `SheetAction` (not a function); AW-F13's `loadCatalogWineDraft` (`add-wine/actions.ts:656`) as the model for this task's own `loadUnidentifiedWineDraft` — BT-A0: model it on `draftFromStoredAnswer` (`tasting-wine-writes.ts:624-716`, which reads `catalog_wines_unidentified`), since `by-hand-actions.ts` carries no catalog-wine draft mapping to reuse (it exports only `producerSummary`, `loadByHandReferences` and `regionSelfNamedAppellation`).
- Produces: `loadUnidentifiedWineDraft(unidentifiedWineId: string): Promise<WineIdentityDraft | null>` (`by-hand-actions.ts`); `AddWineOpenOptions.preselect?: { catalogWineId?: string; unidentifiedWineId?: string; tastingWineId?: string }`; `RecordGlass(props: { tastingId: string; glass: number; layout: "page" | "inline" }): Promise<React.JSX.Element>`; `GlassActions(props: { catalogWineId: string | null; unidentifiedWineId: string | null; tastingWineId: string })`.

**Tests:** none new.

**Steps**
- [ ] The glass view, the route and the laptop expansion; the actions; the provider, sheet and modal preselect; tsc check; eslint.

**Tests (write first)** — add to `src/components/add-wine/sheet-state.test.ts`:
```ts
describe("preselect from the record (S13c, BT-R5)", () => {
  it("a cellar preselect with its lot opens the lot step", () => {
    const s = initialSheetState({
      destination: { kind: "cellar" }, options: { preselect: { catalogWineId: "c7" } }, canScan: true,
      initialLot: { kind: "catalog", catalogWineId: "c7", via: "search" },
    });
    expect(s.view).toBe("lot");
  });
  it("an unidentified preselect lands on by hand once its draft loads; back lands home", () => {
    const s = run(
      initialSheetState({ destination: { kind: "cellar" }, options: { preselect: { unidentifiedWineId: "u3" } }, canScan: false }),
      { type: "openByHand", origin: { kind: "new" }, draft: emptyDraft(), focusField: null },
    );
    expect(s.view).toBe("byhand");
    expect(run(s, { type: "back" }).view).toBe("desktop");
  });
});
```
`initialLot`'s shape is AW-S5b's committed type, `AddSource | null` (`sheet-state.ts:581-586`) — BT-A0 confirms it, above; the assertions stay.

**Acceptance:** `npx vitest run src/components/add-wine/sheet-state.test.ts` is green, the seeded model-based test included; the tsc check is clean; `rg -n "preselect" src/components/add-wine-context.tsx src/components/add-wine/types.ts` matches both; `rg -n "loadUnidentifiedWineDraft" src/components/add-wine/by-hand-actions.ts` matches.

**Closes:** spec §11.3 items 18–19; ledger B10 (S13c); map RECORD-16, RECORD-17, RECORD-18, RECORD-19, RECORD-20, RECORD-21, RECORD-22.

---

## Track BT-K — Hand hosting (B11)

### BT-K1 — Hand hosting to someone

**Depends on:** BT-L4, BT-M10 (live)

**OWNS**
- create `src/app/tastings/[id]/hosting-actions.ts`
- modify `src/app/tastings/[id]/tasting-settings-sheet.tsx`

**Does** (spec §12.3; Q4)
- `handHosting(tastingId, newHostUserId)` (`"use server"`) → `rpc("transfer_tasting_host", { p_tasting_id, p_new_host_user_id })`; an error → `handHostingRefusal(message)`; success revalidates `/tastings/{id}`, `/overview` and `/taste`.
- In the settings sheet: `HAND_HOSTING_ROW` (DRAFT only; hidden otherwise) opens an inner view: `handHostingCopy(name).title`; the JOINED participants other than the viewer as rows (avatar, name); selecting one shows `.line` and a confirming `.button`; a refusal shows inline.
- On success the page re-routes: the former host gets the guest lobby, the new host the host lobby.

**Interfaces**
- Produces: `handHosting(tastingId: string, newHostUserId: string): Promise<{ error: string } | null>`.

**Tests:** none new (BT-P1 covers the refusals; BT-SQL11's probe covers the rules).

**Steps**
- [ ] The action; the inner view; tsc check; eslint.

**Acceptance:** the tsc check is clean; `rg -n "transfer_tasting_host" "src/app/tastings/[id]/hosting-actions.ts"` matches.

**Closes:** spec §12.3; ledger B11; Q4; map LOBBY-48, XCUT-56.

---

## Track BT-Q — Place (B12)

### BT-Q1 — The place on the Overview banner and in the calendar file

**Depends on:** BT-A0, BT-P8, BT-M2 (live)

**OWNS**
- modify `src/lib/overview-types.ts` (`NextUpBanner.place` only)
- modify `src/app/overview/next-up-meta.ts`, `src/app/overview/next-up-meta.test.ts` (the place part)
- modify `src/lib/overview-data.ts` (the next-up builder only)
- modify `src/app/overview/banner.tsx` (the next-up meta only)
- modify `src/app/tastings/[id]/calendar.ics/route.ts`

**Does** (spec §13.3 items 4–5; §4.3 item 5 calendar)
- `NextUpBanner.place?: string | null` from `getTastingPlace(supabase, tastingId)` under the viewer's RLS; the laptop meta shows it after the time when set, and `nextUpMeta({ …, place })` adds it as the last part of the phone meta line ("You're hosting · 3 glasses so far · Nørrebro"; B12 names the banner at every width).
- `calendar.ics`: `location` from `getTastingPlace` under the same RLS (the route already limits to host and JOINED); the "No LOCATION yet" comment goes.
- Never shown on the signed-out preview, the record or public pages (those tasks never read it).

**Interfaces**
- Consumes: `getTastingPlace` (BT-P8); `buildTastingIcs({ …, location })` (lane N).

**Tests (write first)** — add to `src/app/overview/next-up-meta.test.ts`:
```ts
it("ends with the place when one is set (B12)", () => {
  expect(nextUpMeta({ hosting: true, hostName: "Christian", nextWinePosition: 4, place: "Nørrebro" }))
    .toBe("You're hosting · 3 glasses so far · Nørrebro");
  expect(nextUpMeta({ hosting: true, hostName: "Christian", nextWinePosition: 4, place: null }))
    .toBe("You're hosting · 3 glasses so far");
});
```
`ics.test.ts` already covers `location`.

**Steps**
- [ ] Types, builder, banner; the route; tsc check; eslint.

**Acceptance:** `npx vitest run src/app/overview/next-up-meta.test.ts` is green; the tsc check is clean; `rg -n "location" "src/app/tastings/[id]/calendar.ics/route.ts"` matches; `rg -n "No LOCATION yet" src` prints nothing.

**Closes:** spec §13.3 items 4–5; ledger B12 (Overview banner, `.ics`); map GUEST-10 (display), GUEST-31 (LOCATION), XCUT-50 (display).

---

## Track BT-DOC — Documentation

### BT-DOC1 — CLAUDE.md: the reversals and the new rules

**Depends on:** AW-G4, BT-K1, BT-M9b (and BT-S6 if it ran)

**OWNS**
- modify `CLAUDE.md`

**Does** (spec §1.4; ledger "Reversals of documented rules"; "B13.4 outcome" CLAUDE.md note; refinement 4)
- Rewrite each row of spec §1.4 (Appendix F) where CLAUDE.md states it: find the quoted line first; if AW-G4 already reworded it, rewrite the new wording to the same substance.
- Add paragraphs for the new rules:
  - `tasting_places`: participant-private, never public, never in a preview or the record;
  - the semi-blind permutation: opaque keys, `get_semi_blind_*` RPCs, the pool release trigger, the `guesses.guessed_wine_id` column lockdown, and why M9 shipped as M9a + M9b;
  - hidden-glass notes: identity-less BLIND notes, author-only until the reveal, the resolve trigger, deletion with the glass;
  - lifecycle stamps (`started_at`, `finished_at`, `revealed_at`) owned by triggers;
  - `in_play_steps` is not callable by clients;
  - the pour pointer (`current_wine_id`), `paused_at` and the reveal-while-paused trigger;
  - the running page split (`view-route.ts`, the views) and `LiveShell` (dark while IN_PROGRESS; the result until dismissed);
  - the per-field-group upsert and the locked-row pin;
  - `get_join_preview` (anon) and joining until CLOSED;
  - hand hosting rules;
  - `wines.added_by_host`, the `wines` column privileges (`position`, `added_via`), `remove_flight_glass`, `set_flight_glass_added_via` and the setup lock after Start;
  - the semi-blind list as a snapshot from Start, and the semi-blind flight fixed at Start;
  - the trigger-owned `joined_at`, 10-character join codes and the signed-in `/j/[code]` invitation;
  - Pause is LIVE-only; `stepRevealApplies` decides which tastings reveal attribute by attribute (Q8);
  - `save_wset_note` never removes an identity; no note carries an identity for an unrevealed glass;
  - the `RevealSync` decision from BT-M9b / BT-S6.
- If AW-G4 did not document lane N's 093000 (client columns, `is_own_joined_participant_for_wine`, `guesses_pin_identity`, JOINED-only `get_wine_reveal`, the anon revokes), add it.
- Rewrite the CLAUDE.md sentence that tells future recreates of `wine_answers read` to keep "the semi-blind participant clause": that clause must stay gone (spec §1.4 row 8).
- Never rewrite applied history.

**Acceptance**
- Must print nothing (every reversed rule, spec §1.4 rows 1–21):
  `rg -n "requires ≥1 wine|Invites close once started|deliberately no Pause|No WSET note can be written while a glass is locked|NOT enforced to be 1-to-1|one combined batch|all-at-once ladder|autosaves the COMPLETE row|stay on the lobby|while the tasting is still DRAFT|BEFORE the host presses Start|semi-blind participant clause|centred on desktop|remains as the dedicated leaderboard|blind only;|lowest-.position. not-yet-revealed|behind a .window\.confirm|editable while .DRAFT|edit the schedule, and invite|most recent .scored_at. across the tasting|In/Invited/Declined status|Grown in Bourgogne" CLAUDE.md`
- Must match each term: `rg -n "tasting_places|guessed_wine_id|in_play_steps|paused_at|current_wine_id|get_join_preview|transfer_tasting_host|LiveShell|revealed_at|added_by_host|remove_flight_glass|is_own_joined_participant_for_wine|guesses_pin_identity|stepRevealApplies|joined_at" CLAUDE.md`
- `rg -n "wine_answers read" CLAUDE.md` shows a sentence saying the policy has no semi-blind clause and must never regain one (inspect).

**Closes:** spec §1.4 rows 1–21 and the new lines; ledger Reversals; B13.4 outcome (CLAUDE.md); supporting: PLAY-41.

---

## Track BT-V — Integration gate, review, verification

### BT-V1 — Integration gate A

**Depends on:** every BT implementation task except BT-K1, BT-S6 and BT-DOC1; BT-SQL10; BT-SQL11

**OWNS:** none (read-only; reports in the session)

**Steps**
- [ ] Run, capturing each exit code: `npx tsc --noEmit`; `npm run lint -- --max-warnings=0`; `npm test`; `node --test scripts/wine-map-tiles/lib.test.mjs`; `npm run build` (read the relevant `node_modules/next/dist/docs/` guide before fixing a build failure).
- [ ] Grep gates. Each must print nothing unless stated otherwise:
  1. `rg -n "window\.confirm\(" src/app/tastings src/components | rg -v "endTastingConfirm|lockConfirm"`
  2. `rg -U -n 'from\("guesses"\)\s*\.select\("\*"\)' src`
  3. `rg -n "guessed_wine_id" src` (BT-SQL10 removed it from the types file too)
  4. `rg -n "bg-white|#4A1523" "src/app/tastings/[id]" src/app/tastings/new src/app/j src/app/overview/invitation-card.tsx src/components/live-shell.tsx src/components/tastings src/components/new-tasting-sheet.tsx src/components/add-wine/by-hand-form.tsx`
  5. `rg -n "#[0-9a-fA-F]{6}\b" "src/app/tastings/[id]" src/app/j src/app/overview/invitation-card.tsx` — the whole tasting page tree (views, cards, the start bar, the settings sheet, the semi-blind list, the result, the record); a hit in a file no BT task touched is listed, not failed
  6. `rg -n "submitAllMatchGuesses|lockGuesses|OLDEST_YEAR|MATCH_FOOTER|submitGuess\b|getNameSuggestionContext|HostControlsMenu|updateSchedule|moveWine\b|invitesStayOpen|frequentGrapeIds|match-ladder|worksUntilStart" src`
  7. `rg -n '>Wine |"Wine \$\{|Wine \{|of \$\{[a-zA-Z.]+\} wines' "src/app/tastings/[id]/play" "src/app/tastings/[id]/results" "src/app/tastings/[id]/running-view.tsx" "src/app/tastings/[id]/result" "src/app/tastings/[id]/record"`
  8. `rg -n "in_play_steps" src`
  9. `rg -n "Invites close once|Works until you start|already started|Burgundy #1|buzz|more certain|appear only if the wine has them" src`
  10. Pure-module imports — every hit must be an `import type` line (inspect): `rg -n 'from "@/' src/lib/flight-glass-rules.ts src/lib/lobby-copy.ts src/lib/invitation-copy.ts src/lib/glass-eligibility.ts src/lib/live-theme.ts src/lib/pour-pointer.ts src/lib/console-copy.ts src/lib/host-facts.ts src/lib/count-words.ts src/lib/semi-blind-board.ts src/lib/semi-blind-copy.ts src/lib/guess-columns.ts src/lib/reveal-copy.ts src/lib/result-copy.ts src/lib/record-pattern.ts src/lib/csv.ts src/lib/flight-csv.ts src/lib/record-rows.ts src/lib/safe-storage.ts src/lib/pacing-guards.ts src/lib/ilike.ts src/lib/tasting-date-format.ts src/lib/wset/hidden-note.ts src/app/tastings/new/paste-list.ts src/app/tastings/new/place.ts "src/app/tastings/[id]/view-route.ts" "src/app/tastings/[id]/play/guess-write.ts" "src/app/tastings/[id]/play/guess-save-queue.ts" "src/app/tastings/[id]/play/ladder-copy.ts" "src/app/tastings/[id]/play/pick-counts.ts"`
  11. `rg -n "server-only" <the same files>`
  12. Bounded reference reads — inspect each hit; every new one is a head count, an id filter or a limit: `rg -n '\.from\("(appellations|producers)"\)' src --glob '!**/*.test.ts'`
  13. Each of the eleven BT migration files named in "Migration ownership" (or its reported replacement) exists: `ls supabase/migrations | grep -E "_(in_play_steps_execute_lockdown|tasting_places|tasting_lifecycle_stamps|join_preview_and_late_join|hidden_glass_notes|flight_edits_until_first_step|tasting_pacing|guess_lock_pin|semi_blind_rpcs|semi_blind_lockdown|transfer_tasting_host)\.sql$"` lists eleven files; upstream wine-map files in the same date prefix are not counted.
  14. No blind-tasting commit touches the label reader (no API-path change): `git log --format=%H --grep='^feat(blind-tasting)' | xargs -I{} git show --stat --format= {} -- src/lib/label-scan` prints nothing.
  15. No blind-tasting commit touches the lockfile: `git log --format=%H --grep='^feat(blind-tasting)' | xargs -I{} git show --stat --format= {} -- package-lock.json` prints nothing.
- [ ] List every failure as a BT-V3 item, naming its owning task from the OWNS lists.

**Acceptance:** every command is green, or its failures are listed for BT-V3.

### BT-V2 — Adversarial review

**Depends on:** BT-V1

**OWNS:** none (read-only)

Five reviewers in parallel. Each receives the spec, the ledger, the handoff files, `map.json` / `critic.json` / `reconcile.json`, CLAUDE.md, AGENTS.md, this plan and the blind-tasting commits' diffs (`git log -p --grep='^feat(blind-tasting)' BT_BASE..HEAD`; Global Constraints "Gate base") limited to its scope, and reports findings as `{ file:line, severity: high|medium|low, claim broken, reproduction, owning task }`.

1. **Rule 1 and privacy.** Re-verify every row of spec §16.1 against the code and the probe logs. Semi-blind keys never correlate with position (list order, payload order, key derivation); no payload carries a hidden wine's identity, its in-play shape or a per-glass maximum; the place never reaches a public read, a preview or the record; hidden notes are author-only until resolved; the console's facts count revealed categories and locked or scored rows only; the semi-blind list is a snapshot from Start and a started semi-blind flight never changes; `added_by_host` and the `wines` column privileges hold; no note carries an identity for an unrevealed glass; `get_wine_reveal` hides `in_play_count` at step 0.
2. **SQL and RLS.** Each migration's assertions test what they claim; every recreated body differs from live only as specified (md5 and diffs in the probe logs); every cross-table check goes through a SECURITY DEFINER helper; EXECUTE matrices; M9a leaves deployed code working and M9b follows the deploy; M8 lets the pool release through; versions are unique and recorded.
3. **Scoring and pacing invariants.** `reveal_wine`, `reveal_next_category` and `score_own_guess` bodies are unchanged (compare `md5(prosrc)` before M1 and after M10 from `live-applies.log`); a paused tasting refuses every reveal write at the database; Skip is compare-and-set and never renumbers; the late joiner's eligibility and joined-after zero; result maths (fully revealed glasses only; ties; host-provides host); semi-blind stays 1 / 0.
4. **Handoff fidelity.** S1–S13c and SB1–SB4 against `canvas-text.txt` copy and states at 375px and 1280px (from the code); tokens and the dark scope; the plan-copy table is complete and nothing else was invented; the not-adopted items are absent.
5. **Cross-cutting.** Controlled inputs on every AutoRefresh surface (running page, guest lobby, invitation, console, board, settings sheet); keep-mounted synchronous focus (picker sheet and popover, board picker); producers and appellations never preloaded; one completeness module; scheduled deprecations deleted; a semi-blind branch on every scoring surface; `window.confirm` only where refinement 7 allows.

**Output:** one consolidated list; the main session accepts or rejects each finding with a reason.

### BT-V3 — Review fixes, re-gate, push A

**Depends on:** BT-V2

**OWNS:** set per fix group: each group owns exactly the files its accepted findings name; groups are disjoint, and groups that share a file are merged.

**Steps**
- [ ] Group the accepted findings by file; run one fix agent per group in parallel (a failing test first for pure modules).
- [ ] A finding in an unapplied migration is fixed in that file (re-dry-run, re-probe). A finding in an applied migration gets a new migration with the next free slot, its own probe, and a BT-M apply.
- [ ] Re-run all of BT-V1 until green.
- [ ] The main session commits each group, then pushes A through the integrate worktree (Global Constraints "Deploy and push") and records the pushed sha for BT-M9b.

**Closes:** every accepted BT-V2 finding.

### BT-V4 — Gate B and push B

**Depends on:** BT-K1, BT-DOC1 (and BT-S6 if it ran)

**OWNS:** none (fixes go through the BT-V3 procedure)

**Steps**
- [ ] Re-run BT-V1's commands and gates on the tree with BT-K1, BT-DOC1 (and BT-S6).
- [ ] Push B.

### BT-V5 — Browser verification: six evenings (main session)

**Depends on:** BT-V4

**Setup (once)**
- The integrate worktree's dev server against the live database; `LABEL_READ_FIXTURE` set; the Browser pane visible for interactive checks.
- Demo sessions via `.superpowers/demo-session.mjs`: host `demo.diego@blindr.invalid`; guests `demo.isabelle`, `demo.marcus`, `demo.priya`, `demo.sofia`; plus a signed-out tab.
- Two viewports for every check: the `mobile` preset (375×812) and a 1280px mouse device (`desktop` preset); a width named in a spec item adds detail and never skips the other width. Also: no horizontal overflow at 375px; tap targets at least 44px; no text below 10px.
- Throwaway tastings are deleted afterwards; no demo account keeps test notes.

**Evenings** (run each spec verification section exactly as written)
- [ ] **1. Blind, LIVE, host-provides, guided:** §2.6 → §3.6 (settings: Manage invitations, Delete's two-tap) → §4.6 (the INVITED view at both widths; the signed-in link invitation) → §6.6 → §7.6 (Pause on a participant tab at both widths, Skip with a double tap, two-tap) → §8.6 (S10 and S10b) → §9.6 → §11.6 (S11 and S11b mid step-reveal; Export on the phone) → §13.6.
- [ ] **2. Semi-blind, LIVE, host-provides, guided:** §10.6 end to end, then §11.6's semi-blind finish.
- [ ] **3. Bring-your-own, LIVE:** §3.6 Swap and Remove, reached after Start from the running page's Wines card (Edit → Swap / Remove) by a contributor on their own bottle, at 375px and 1280px; §7.6's competing host (the bare "Next" chip at step 0); §12.6 hand hosting (in DRAFT, before the evening starts).
- [ ] **4. A late joiner:** §5.6 ("You joined after this glass" on the running page and on the record).
- [ ] **5. ASYNC IMMEDIATE blind:** the ladder; a hidden-glass note resolving at the auto-reveal (§9.6); the Taste & Rate archive shows the hidden note and Save all's minimal notes as TR-R7 expects.
- [ ] **6. Semi-blind, ASYNC IMMEDIATE, bring-your-own:** §10.6's before-Start and last checks at 375px and 1280px — the guest lobby's "The list of tonight's wines opens when {host} starts.", every glass open, "Your bottle" with the viewer's own wine absent from their pool, locking scores and shrinks only the viewer's pool, a second guesser's pool unchanged, the proven wine refused, no Add after Start.
- [ ] Alongside evening 2: the guided-pacing toggle on a LIVE semi-blind tasting after Start (§3.6).
- [ ] Alongside evening 1, the Taste & Rate interactive checks queued in `.superpowers/queue.md` (the note sheet from the archive, Save note + Next/Prev, "Why 100 points?", invitation Accept).

**Failures:** each becomes a fix in the owning task's files through the BT-V3 procedure; re-run the affected check.

**Report:** pass/fail per item, with a screenshot of each screen at both widths, plus the owner report items: spec §19 (Q1–Q8 with their defaults and §19.2's choices), this plan's refinements and plan-copy table, the reversals (spec §1.4, the † rows the ledger's list lacks included), and the not-adopted list.

---

## Appendix A — Traceability: every map item

All 371 items in `map.json`, each exactly once. "Built" names the tasks that build or change it; "kept (shipped)" means the behaviour is already on master and the named task only preserves or re-skins it; "landed" names the upstream task; "not adopted" gives the ledger reason. A verification script (`trace.mjs`, session scratchpad) checked coverage against `map.json` and `critic.json`. After the 2026-09-13 revision it also checked that each row's tasks and the tasks whose Closes line names the item agree: "also …" in a row marks a task added in that pass, and "supporting: …" in a Closes line an item that task helps build; BT-V2 mentions are audits, not closers.

### Guessing, the picker and waiting (S8b, S8, S9, S10, S10b) (43)

| Item | Map status | Disposition | Tasks / reason |
|---|---|---|---|
| PLAY-01 | partial | built | BT-D1 (tokens), BT-D2 (shell), BT-Y3 (re-skin) |
| PLAY-02 | partial | built | BT-D1 (dark popover), BT-Y2 |
| PLAY-03 | shipped | kept (shipped) | BT-Y4 keeps the dark waiting state |
| PLAY-04 | conflict | built | BT-D2 (B5: one page, a dark shell while IN_PROGRESS) |
| PLAY-05 | missing | built | BT-Y3 |
| PLAY-06 | shipped | kept (shipped) | BT-Y3 |
| PLAY-07 | partial | built | BT-P5, BT-Y3 |
| PLAY-08 | shipped | kept (shipped) | BT-Y3 (dark colours) |
| PLAY-09 | missing | built | BT-P5, BT-Y3 |
| PLAY-10 | shipped | kept (shipped) | BT-Y3 (the stake moves to the laptop rail) |
| PLAY-11 | partial | built | BT-Y3 |
| PLAY-12 | shipped | kept (shipped) | BT-Y3 (dark) |
| PLAY-13 | partial | built | BT-Y3 (a plain grape row, refinement 15) |
| PLAY-14 | partial | built | BT-P5, BT-Y3 |
| PLAY-15 | stale-note | built | BT-P5, BT-Y1 (critic: partial; years 1900.., tawny 1–100) |
| PLAY-16 | conflict | not adopted | rows 'only if the wine has them' break rule 1 (ledger Not adopted); BT-Y3 keeps LADDER_EXTRAS_NOTE |
| PLAY-17 | partial | built | BT-P5, BT-SQL8, BT-Y1 |
| PLAY-18 | conflict | kept (shipped) | add-wine T6 play-4 (the confirm is ASYNC + IMMEDIATE only; the LIVE lock has no dialog) |
| PLAY-19 | partial | built | BT-P5, BT-Y1 |
| PLAY-20 | missing | built | BT-Y3 |
| PLAY-21 | partial | built | BT-Y3 |
| PLAY-22 | missing | built | BT-Y3 |
| PLAY-23 | partial | built | BT-Y3 |
| PLAY-24 | partial | built | BT-Y3 |
| PLAY-25 | partial | built | BT-Y2, BT-Y3 |
| PLAY-26 | shipped | kept (shipped) | BT-Y2 (dark) |
| PLAY-27 | shipped | built | BT-Y2, BT-Y3 (counts from head queries, never hardcoded or preloaded) |
| PLAY-28 | partial | built | BT-Y2 |
| PLAY-29 | stale-note | built | the mapping exists (the note is stale); the heading switches to the handoff's "Common grapes in {region}" (BT-P5, BT-Y2); also BT-Y3 |
| PLAY-30 | shipped | built | BT-P5 (threshold 3), BT-Y2, BT-Y3 |
| PLAY-31 | partial | built | BT-P5, BT-Y2 |
| PLAY-32 | shipped | kept (shipped) | BT-Y2 |
| PLAY-33 | shipped | kept (shipped) | BT-Y4 |
| PLAY-34 | shipped | built | BT-P5, BT-Y4 (ASYNC tail) |
| PLAY-35 | shipped | kept (shipped) | BT-Y4 |
| PLAY-36 | shipped | kept (shipped) | BT-Y4 |
| PLAY-37 | partial | built | BT-Y1 (server), BT-Y4 (UI) |
| PLAY-38 | conflict | built | BT-SQL5, BT-N1, BT-N2 (B8 reverses the CLAUDE.md rule) |
| PLAY-39 | shipped | kept (shipped) | BT-Y4 |
| PLAY-40 | partial | built | BT-Y4, BT-N2 |
| PLAY-41 | shipped | kept (shipped) | the Realtime decision after M9b: BT-M9b, BT-S6 (conditional); CLAUDE.md line in BT-DOC1 |
| PLAY-42 | shipped | kept (shipped) | pointer-aware in BT-H1 |
| PLAY-43 | partial | landed (add-wine) | add-wine T6 play-3 |

### The guest before the start: S5b laptop invitation, S5 phone invitation, S6b and S6 joined guest waiting for Start (38)

| Item | Map status | Disposition | Tasks / reason |
|---|---|---|---|
| GUEST-01 | partial | built | BT-G1 (card and the 'Overview · what's happening now' eyebrow) |
| GUEST-02 | missing | built | lane N relative-day.ts; BT-G1 |
| GUEST-03 | missing | built | BT-G1 |
| GUEST-04 | missing | built | BT-SQL4 (host_tastings_count), BT-G1 |
| GUEST-05 | partial | built | BT-G1; also BT-P2 |
| GUEST-06 | partial | built | BT-P2, BT-G1 |
| GUEST-07 | partial | built | BT-P2, BT-G1 |
| GUEST-08 | partial | built | BT-C1 (flowWord for semi-blind), BT-G1 |
| GUEST-09 | partial | built | BT-D1 (date formats), BT-G1 |
| GUEST-10 | missing | built | BT-SQL2, BT-P8, BT-C1, BT-G1, BT-G2, BT-Q1 |
| GUEST-11 | partial | built | BT-P2, BT-G1 |
| GUEST-12 | conflict | built | BT-P2, BT-G1 ('Up to 30 points a glass', never a flight figure) |
| GUEST-13 | partial | built | BT-P2, BT-G1 |
| GUEST-14 | missing | built | BT-P2, BT-G1 (one sentence, spec §4.3 item 2) |
| GUEST-15 | partial | built | BT-P2, BT-G1 |
| GUEST-16 | partial | built | BT-G1 |
| GUEST-17 | shipped | kept (shipped) | BT-G1 (no calendar before accepting) |
| GUEST-18 | partial | built | BT-D2 (routing), BT-G1 |
| GUEST-19 | conflict | not adopted | the full invitation without an account (ledger Not adopted); the reduced preview is BT-SQL4, BT-G3 |
| GUEST-20 | partial | built | BT-SQL4, BT-G3 |
| GUEST-21 | partial | built | BT-G1 (INVITED viewers get S5 on the same URL; email delivery unchanged, no B-ledger decision) |
| GUEST-22 | shipped | kept (shipped) | audited in BT-V2; also BT-G1 |
| GUEST-23 | partial | built | BT-P2, BT-G2 |
| GUEST-24 | partial | built | BT-P2, BT-G2 |
| GUEST-25 | partial | built | BT-P2, BT-G2 (AutoRefresh on the guest lobby) |
| GUEST-26 | conflict | not adopted | 'Your phone will buzz' — no push (ledger Not adopted); BT-G2 drops it |
| GUEST-27 | partial | built | BT-P2, BT-G2 |
| GUEST-28 | partial | built | BT-G2 |
| GUEST-29 | conflict | built | BT-P2, BT-G2 (the certainty sentence is not adopted) |
| GUEST-30 | partial | built | BT-G2 |
| GUEST-31 | missing | built | lane N (route), BT-G2 (row), BT-Q1 (LOCATION) |
| GUEST-32 | partial | built | BT-P2, BT-G2 |
| GUEST-33 | partial | built | BT-P2, BT-G2 |
| GUEST-34 | missing | built | lane N 091000 (pin), BT-SQL4 (leave guard), BT-G2 (leaveTasting) |
| GUEST-35 | partial | built | BT-L2 (no Wines card for host-provides guests), BT-G2 (the bring-your-own guest card) |
| GUEST-36 | conflict | built | BT-SQL9, BT-SQL10, BT-S1 |
| GUEST-37 | shipped | kept (shipped) | BT-G2 |
| GUEST-38 | shipped | kept (shipped) | BT-D2 keeps DRAFT screens parchment; also BT-G2 |

### Host console (S7 desktop, S7b phone) (33)

| Item | Map status | Disposition | Tasks / reason |
|---|---|---|---|
| HOST-01 | shipped | kept (shipped) | BT-H2 |
| HOST-02 | shipped | kept (shipped) | BT-H2 (S7b drops the name on phones) |
| HOST-03 | conflict | built | BT-SQL7, BT-H1, BT-H2 (Q1) |
| HOST-04 | partial | built | BT-H2 |
| HOST-05 | partial | built | add-wine F10/T5 (server, incomplete refusal); BT-H2 (Edit link) |
| HOST-06 | partial | built | add-wine T9 (confirm copy); BT-H2 (phone placement; the confirm stays, spec §19.2) |
| HOST-07 | conflict | kept (shipped) | add-wine T9's 'Tasting page' link stays (spec §1.3); BT-H2 |
| HOST-08 | shipped | kept (shipped) | BT-H2 (pointer-aware) |
| HOST-09 | partial | built | BT-H2 |
| HOST-10 | shipped | kept (shipped) | BT-H2 (host-provides only) |
| HOST-11 | partial | built | add-wine T9 (reveal-1); BT-H2 (get_wine_reveal) |
| HOST-12 | shipped | kept (shipped) | — (critic corrected the citation) |
| HOST-13 | shipped | kept (shipped) | — (critic corrected the citation) |
| HOST-14 | shipped | kept (shipped) | — |
| HOST-15 | shipped | kept (shipped) | — |
| HOST-16 | shipped | built | BT-P4, BT-H2 (two-tap) |
| HOST-17 | conflict | built | BT-P3, BT-SQL7, BT-H1, BT-H2 |
| HOST-18 | partial | built | BT-P4, BT-H2 (critic corrected the citation) |
| HOST-19 | partial | built | add-wine T13 (106000), BT-SQL7 (pointer round), BT-H2 (deltas) |
| HOST-20 | conflict | not adopted | a host competing while seeing identities / a mixed flight (ledger Not adopted); BT-H2 keeps the host-provides host out of the standings |
| HOST-21 | partial | built | BT-P4, BT-H2 |
| HOST-22 | conflict | built | BT-P4, BT-H2 (D15 reveal-8 answered, B0) |
| HOST-23 | partial | built | BT-H2 |
| HOST-24 | partial | built | BT-H2 |
| HOST-25 | missing | built | BT-H2 |
| HOST-26 | partial | built | BT-H2 |
| HOST-27 | missing | built | BT-H2 |
| HOST-28 | partial | built | BT-H2 |
| HOST-29 | missing | built | BT-H2 |
| HOST-30 | shipped | kept (shipped) | BT-H2 (LiveShell) |
| HOST-31 | shipped | kept (shipped) | BT-H2 |
| HOST-32 | partial | built | BT-C1 (startLandsOnConsole) |
| HOST-33 | partial | landed (lane N) | 20260912092000 (critic corrected the citation) |

### create (S1, S1b, S2, S2b, S3, S3b + README Part 1 steps 1-3 and Nav) (58)

| Item | Map status | Disposition | Tasks / reason |
|---|---|---|---|
| CREATE-01 | stale-note | stale note | landed in the add-wine flows |
| CREATE-02 | stale-note | stale note | landed in the add-wine flows |
| CREATE-03 | shipped | kept (shipped) | — |
| CREATE-04 | shipped | built | BT-C1 |
| CREATE-05 | shipped | kept (shipped) | — |
| CREATE-06 | shipped | kept (shipped) | — |
| CREATE-07 | shipped | kept (shipped) | — |
| CREATE-08 | shipped | kept (shipped) | — |
| CREATE-09 | partial | landed (add-wine) | add-wine T1; BT-L4 keeps the lock in settings |
| CREATE-10 | partial | built | BT-C1 |
| CREATE-11 | missing | built | BT-SQL2, BT-P8, BT-C1 |
| CREATE-12 | partial | kept (shipped) | ledger B1 'What stays as shipped: … cover photo' |
| CREATE-13 | shipped | built | BT-C1 (the semi-blind line) |
| CREATE-14 | partial | built | add-wine T1; BT-C1 (LIVE semi-blind guided) |
| CREATE-15 | partial | landed (add-wine) | add-wine T1 |
| CREATE-16 | shipped | kept (shipped) | — |
| CREATE-17 | partial | built | BT-C1 |
| CREATE-18 | partial | landed (add-wine) | add-wine T2 (B0) |
| CREATE-19 | shipped | kept (shipped) | — |
| CREATE-20 | partial | built | BT-C1 (place row; the photo row as shipped) |
| CREATE-21 | shipped | kept (shipped) | — |
| CREATE-22 | conflict | landed (add-wine) | add-wine T2 (the DRAFT status stays; copy per B0; critic: stale note) |
| CREATE-23 | shipped | kept (shipped) | — |
| CREATE-24 | stale-note | stale note | add-wine T11 |
| CREATE-25 | shipped | kept (shipped) | — |
| CREATE-26 | shipped | kept (shipped) | — |
| CREATE-27 | conflict | landed (add-wine) | add-wine S6 (precedence 4: the add-wine matrix) |
| CREATE-28 | conflict | landed (add-wine) | add-wine S6 (precedence 4: the add-wine matrix) |
| CREATE-29 | partial | landed (add-wine) | add-wine S6 |
| CREATE-30 | partial | built | BT-SQL6, BT-L1, BT-C2 |
| CREATE-31 | conflict | landed (add-wine) | add-wine S6 |
| CREATE-32 | shipped | kept (shipped) | — |
| CREATE-33 | shipped | kept (shipped) | — |
| CREATE-34 | shipped | not adopted | a ✕ on a waiting contributor row (ledger Not adopted; critic); the ✕ on added glasses stays (add-wine S6); also BT-C2 |
| CREATE-35 | missing | landed (add-wine) | add-wine F3, S6 |
| CREATE-36 | conflict | landed (add-wine) | B0: Start warns, the reveal stays refused (add-wine T2/T3) |
| CREATE-37 | partial | landed (add-wine) | add-wine S6; no ✕ (not adopted); also BT-C2 |
| CREATE-38 | partial | built | add-wine S6 (the footnote); BT-C2 (step 2 re-reads `listFlight` every 5 seconds in bring-your-own) |
| CREATE-39 | missing | built | BT-P8, BT-C2 |
| CREATE-40 | conflict | landed (add-wine) | B0 (add-wine T2/T3) |
| CREATE-41 | shipped | kept (shipped) | — |
| CREATE-42 | shipped | kept (shipped) | — |
| CREATE-43 | missing | built | BT-C1 (refinement 9) |
| CREATE-44 | shipped | kept (shipped) | — |
| CREATE-45 | shipped | kept (shipped) | — |
| CREATE-46 | partial | built | BT-C3 |
| CREATE-47 | missing | built | BT-C3 |
| CREATE-48 | missing | built | BT-C1 (friendContextLine), BT-C3 |
| CREATE-49 | partial | built | BT-C3 |
| CREATE-50 | shipped | kept (shipped) | — |
| CREATE-51 | stale-note | stale note | `tastings.join_code` exists; a DECLINED guest rejoins through the link (BT-SQL4: `viewer_tasting_id` only for JOINED and INVITED rows; BT-G3) |
| CREATE-52 | conflict | built | BT-SQL4, BT-J1 (Q6); also BT-G3 |
| CREATE-53 | partial | built | BT-C1, BT-C3 |
| CREATE-54 | partial | landed (add-wine) | add-wine T2 |
| CREATE-55 | shipped | kept (shipped) | — |
| CREATE-56 | partial | built | BT-C1 |
| CREATE-57 | partial | landed (add-wine) | add-wine T2 (B0) |
| CREATE-58 | shipped | kept (shipped) | — |

### The reveal, the result and the record (S11b, S11, S12b, S12, S13, S13b, S13c) (49)

| Item | Map status | Disposition | Tasks / reason |
|---|---|---|---|
| REVEAL-01 | shipped | kept (shipped) | BT-R1 |
| REVEAL-02 | partial | built | BT-P4 (`stepRevealApplies`), BT-H2 (the console gate), BT-R1 (the `RevealView` gate): guided LIVE blind only (Q8) |
| REVEAL-03 | shipped | kept (shipped) | BT-R1 |
| REVEAL-04 | shipped | kept (shipped) | BT-R1 |
| REVEAL-05 | shipped | kept (shipped) | BT-R1 |
| REVEAL-06 | shipped | kept (shipped) | BT-R1 |
| REVEAL-07 | partial | landed (add-wine) | add-wine T7 (UI); live NOT NULL makes the SQL moot (B13 outcome) |
| REVEAL-08 | missing | built | BT-P7, BT-R1 |
| REVEAL-09 | partial | built | BT-R1 (refinement 16) |
| REVEAL-10 | missing | built | BT-D2, BT-R1 |
| REVEAL-11 | missing | built | BT-P7, BT-R1 |
| REVEAL-12 | missing | built | BT-P4, BT-R1 |
| REVEAL-13 | partial | landed (lane N) | 20260912090000 |
| RESULT-01 | missing | built | BT-R2 |
| RESULT-02 | missing | built | BT-P3, BT-P7, BT-R2 |
| RESULT-03 | missing | built | BT-P7, BT-R2 |
| RESULT-04 | conflict | built | lane N result-math; BT-R2 |
| RESULT-05 | missing | built | BT-R2 |
| RESULT-06 | missing | built | BT-R2 |
| RESULT-07 | missing | built | BT-P7, BT-R2 |
| RESULT-08 | missing | built | BT-P7, BT-R2 |
| RESULT-09 | missing | built | BT-P7, BT-R2 |
| RESULT-10 | missing | built | BT-P7, BT-R2 |
| RESULT-11 | missing | built | BT-P7, BT-R2 |
| RESULT-12 | partial | built | BT-R2, BT-R3; also BT-P7 |
| RESULT-13 | missing | built | BT-SQL9, BT-R2 |
| RESULT-14 | conflict | built | BT-P7, BT-R2, BT-R3 (a mixed flight is not adopted) |
| RECORD-01 | partial | built | BT-R3 |
| RECORD-02 | stale-note | stale note | — |
| RECORD-03 | missing | built | BT-SQL3, BT-R3 |
| RECORD-04 | missing | built | BT-R3 |
| RECORD-05 | missing | built | BT-R3 |
| RECORD-06 | missing | built | lane N glassMarks; BT-R3 |
| RECORD-07 | partial | built | lane N wine-label list order; BT-R1, BT-R3 |
| RECORD-08 | partial | built | BT-R3 |
| RECORD-09 | missing | built | BT-SQL3, BT-R3 |
| RECORD-10 | partial | built | BT-R3 |
| RECORD-11 | missing | built | BT-P7, BT-R3 |
| RECORD-12 | missing | built | BT-P7, BT-R4, BT-R3 |
| RECORD-13 | missing | built | BT-R4, BT-R3 (Q5); also BT-SQL5 |
| RECORD-14 | missing | built | BT-R3 |
| RECORD-15 | partial | built | BT-SQL9, BT-R3, BT-S5 |
| RECORD-16 | missing | built | BT-R5 |
| RECORD-17 | partial | built | BT-R5 |
| RECORD-18 | partial | built | BT-R5 |
| RECORD-19 | partial | built | BT-R5 |
| RECORD-20 | partial | built | BT-R5 |
| RECORD-21 | partial | built | BT-R5 |
| RECORD-22 | missing | built | BT-R5 |

### Lobby and editing (S4, S4b, S4c, S4d) (50)

| Item | Map status | Disposition | Tasks / reason |
|---|---|---|---|
| LOBBY-01 | partial | built | lane N tasting-eyebrow; BT-P1, BT-D1, BT-L2 |
| LOBBY-02 | shipped | kept (shipped) | — |
| LOBBY-03 | conflict | built | BT-L2 (the /rules link stays) |
| LOBBY-04 | partial | built | BT-L4, BT-L2 |
| LOBBY-05 | partial | built | BT-P1, BT-L2 ('{n} so far'; '3 of 6' is not adopted) |
| LOBBY-06 | stale-note | stale note | add-wine S7 |
| LOBBY-07 | missing | built | BT-SQL6, BT-P1, BT-L1, BT-L2 |
| LOBBY-08 | shipped | kept (shipped) | BT-L2 |
| LOBBY-09 | conflict | not adopted | a mixed host-and-guest flight (ledger Not adopted); 'Wine N' / the contributor label stay (add-wine S7) |
| LOBBY-10 | partial | landed (add-wine) | add-wine S7 |
| LOBBY-11 | partial | landed (add-wine) | add-wine S7 |
| LOBBY-12 | shipped | kept (shipped) | add-wine S7 opens the sheet |
| LOBBY-13 | missing | landed (add-wine) | add-wine S7; BT-L2 (phone wording) |
| LOBBY-14 | partial | built | BT-P1, BT-L2 |
| LOBBY-15 | conflict | landed (add-wine) | B0 (add-wine T3) |
| LOBBY-16 | shipped | kept (shipped) | — |
| LOBBY-17 | partial | built | BT-P1, BT-L2 (critic: Declined collapsed, not counted) |
| LOBBY-18 | partial | built | BT-L2 |
| LOBBY-19 | missing | built | BT-P1, BT-L2 |
| LOBBY-20 | partial | built | BT-P1, BT-L2 |
| LOBBY-21 | partial | built | BT-L2 |
| LOBBY-22 | shipped | kept (shipped) | — |
| LOBBY-23 | partial | built | BT-P1, BT-L2 |
| LOBBY-24 | missing | built | BT-L2 |
| LOBBY-25 | missing | built | BT-L2 |
| LOBBY-26 | missing | built | BT-L2 |
| LOBBY-27 | partial | landed (add-wine) | add-wine S7, S3b; BT-L3 adds Swap and Remove |
| LOBBY-28 | conflict | landed (add-wine) | the add-wine by-hand form header (precedence 4) |
| LOBBY-29 | partial | landed (add-wine) | add-wine S3b (A4b) |
| LOBBY-30 | conflict | landed (add-wine) | add-wine D8 (precedence 4) |
| LOBBY-31 | missing | built | BT-P1, BT-L3 |
| LOBBY-32 | partial | built | BT-SQL6, BT-L1, BT-L3; also BT-P1 |
| LOBBY-33 | partial | landed (add-wine) | add-wine S3b; also BT-L3 |
| LOBBY-34 | conflict | built | BT-SQL6, BT-L1 (the B2 window), BT-L3; also BT-D2 |
| LOBBY-35 | partial | built | BT-P1, BT-L4 |
| LOBBY-36 | partial | built | BT-C1, BT-L4 |
| LOBBY-37 | partial | built | BT-L4 |
| LOBBY-38 | partial | built | BT-L4 |
| LOBBY-39 | missing | built | BT-C1, BT-L4 |
| LOBBY-40 | partial | built | BT-C1, BT-L4 (critic corrected the citation) |
| LOBBY-41 | partial | built | BT-L4 |
| LOBBY-42 | missing | built | BT-SQL2, BT-P8, BT-C1, BT-L4, BT-L2 |
| LOBBY-43 | partial | built | BT-L4 |
| LOBBY-44 | conflict | landed (add-wine) | add-wine T1; BT-L4 |
| LOBBY-45 | partial | built | BT-L4 |
| LOBBY-46 | conflict | built | BT-C1, BT-L4; also BT-P1 |
| LOBBY-47 | partial | built | BT-J1, BT-L4 |
| LOBBY-48 | missing | built | BT-SQL11, BT-K1 (Q4) |
| LOBBY-49 | shipped | built | BT-L4 (two-tap) |
| LOBBY-50 | partial | built | BT-L4 |

### Cross-cutting rules, tokens, nav and the handoff's gap list (canvas-text.txt:1905-1935; README.md:32-40, 194-224) (60)

| Item | Map status | Disposition | Tasks / reason |
|---|---|---|---|
| XCUT-01 | partial | built | BT-D1, BT-D2 |
| XCUT-02 | partial | built | BT-H2, BT-R2 |
| XCUT-03 | missing | built | BT-Y3, BT-S3 |
| XCUT-04 | missing | built | BT-D1, BT-Y2 |
| XCUT-05 | partial | built | BT-D2, BT-Y4, BT-N2 |
| XCUT-06 | partial | built | BT-D2, BT-R1 |
| XCUT-07 | missing | built | BT-P3, BT-R2 |
| XCUT-08 | conflict | built | BT-D2 (B5) |
| XCUT-09 | conflict | kept (shipped) | the add-wine sheet keeps its own look (B5) |
| XCUT-10 | shipped | kept (shipped) | — |
| XCUT-11 | partial | built | BT-D1; the hex goes in BT-D2, BT-Y3, BT-L2 |
| XCUT-12 | shipped | kept (shipped) | — |
| XCUT-13 | shipped | kept (shipped) | — |
| XCUT-14 | shipped | kept (shipped) | — |
| XCUT-15 | shipped | kept (shipped) | — |
| XCUT-16 | shipped | kept (shipped) | — |
| XCUT-17 | shipped | kept (shipped) | — |
| XCUT-18 | shipped | kept (shipped) | — |
| XCUT-19 | shipped | kept (shipped) | — |
| XCUT-20 | partial | built | BT-D1 (--surface-deep) |
| XCUT-21 | partial | built | BT-L2 (the Start shadow); no theme token (no B-ledger decision) |
| XCUT-22 | partial | kept (shipped) | the app-wide `--radius` stays: retuning it restyles every shadcn surface outside this handoff (spec §19.2); new tasting surfaces use the README radii through explicit classes (Global Constraints) |
| XCUT-23 | shipped | kept (shipped) | — |
| XCUT-24 | shipped | kept (shipped) | — |
| XCUT-25 | shipped | kept (shipped) | Global Constraints: eyebrows at 10px minimum |
| XCUT-26 | shipped | kept (shipped) | audited in BT-V2 |
| XCUT-27 | shipped | kept (shipped) | audited in BT-V2 |
| XCUT-28 | partial | built | BT-L2, BT-G2 |
| XCUT-29 | shipped | kept (shipped) | — |
| XCUT-30 | partial | built | lane N sortCandidates; BT-S1 |
| XCUT-31 | partial | landed (add-wine) | add-wine T9; BT-H2 |
| XCUT-32 | partial | landed (add-wine) | add-wine F13 (D10) |
| XCUT-33 | shipped | kept (shipped) | — |
| XCUT-34 | shipped | kept (shipped) | — |
| XCUT-35 | conflict | landed (add-wine) | B0 (add-wine T2/T3) |
| XCUT-36 | conflict | landed (add-wine) | B0 (add-wine T3, T5, T9) |
| XCUT-37 | partial | built | BT-H2 (Reveal everything), BT-L4 (Delete); End keeps its confirm (spec §19.2, refinement 7); also BT-P4 |
| XCUT-38 | partial | landed (lane N) | 20260912092000 |
| XCUT-39 | partial | kept (shipped) | no change |
| XCUT-40 | shipped | kept (shipped) | — |
| XCUT-41 | shipped | kept (shipped) | — |
| XCUT-42 | conflict | landed (add-wine) | add-wine T2 (B0; critic: partial) |
| XCUT-43 | shipped | kept (shipped) | — |
| XCUT-44 | shipped | kept (shipped) | — |
| XCUT-45 | missing | not adopted | the /taste/semi-blind route never existed (critic correction); no redirect |
| XCUT-46 | shipped | kept (shipped) | — |
| XCUT-47 | stale-note | stale note | — |
| XCUT-48 | partial | landed (add-wine) | add-wine T11 |
| XCUT-49 | stale-note | stale note | — |
| XCUT-50 | missing | built | BT-SQL2, BT-P8, BT-C1, BT-L2, BT-L4, BT-G1, BT-Q1 |
| XCUT-51 | stale-note | stale note | — |
| XCUT-52 | conflict | built | BT-SQL5, BT-N1, BT-N2 |
| XCUT-53 | stale-note | built | BT-P5, BT-Y1 (critic: partial) |
| XCUT-54 | partial | built | BT-P5, BT-Y1 |
| XCUT-55 | stale-note | stale note | the CLOSED status exists |
| XCUT-56 | missing | built | BT-SQL11, BT-K1 |
| XCUT-57 | partial | built | BT-D2 (dark for every IN_PROGRESS timing), BT-P2, BT-Y4 (ASYNC copy) |
| XCUT-58 | partial | built | BT-G2 (the guest's Wines card), add-wine S7 (guest adds); an ask-to-add prompt is not built (no B-ledger decision) |
| XCUT-59 | partial | built | BT-SQL3, BT-SQL4, BT-P2, BT-J1, BT-H1, BT-R2, BT-R3 |
| XCUT-60 | shipped | kept (shipped) | — |

### semi-blind (SB1 list, SB2 phone matching, SB3 desktop matching, SB4 reveal, plus the semi-blind host console and finish) (40)

| Item | Map status | Disposition | Tasks / reason |
|---|---|---|---|
| SB-01 | missing | built | BT-S1 |
| SB-02 | partial | built | lane N buildCandidateCard; BT-S1 |
| SB-03 | partial | built | lane N sortCandidates; BT-S1, BT-S3 |
| SB-04 | missing | built | BT-SQL9, BT-SQL10, BT-P6, BT-S5 |
| SB-05 | partial | built | BT-P6, BT-S1 |
| SB-06 | missing | built | BT-P6, BT-S1 |
| SB-07 | missing | built | BT-P6, BT-S1 |
| SB-08 | missing | built | BT-S1 |
| SB-09 | partial | built | BT-S3 |
| SB-10 | partial | built | BT-P6, BT-S3 |
| SB-11 | partial | built | BT-P6, BT-S3 |
| SB-12 | partial | built | BT-S3 |
| SB-13 | missing | built | BT-C1 (stored pacing), BT-SQL7, BT-P3, BT-H1, BT-S3 |
| SB-14 | partial | built | BT-P6, BT-S3 |
| SB-15 | missing | built | BT-P6, BT-S3 |
| SB-16 | missing | built | BT-P6, BT-S3 (data-driven first sentence) |
| SB-17 | conflict | built | BT-SQL9, BT-SQL10, BT-P6, BT-S2, BT-S3 |
| SB-18 | missing | built | BT-SQL10, BT-P6, BT-S3, BT-S4 |
| SB-19 | conflict | built | BT-SQL9, BT-S2, BT-S3 |
| SB-20 | conflict | built | BT-S2, BT-S3 |
| SB-21 | partial | built | BT-P6, BT-S3 |
| SB-22 | missing | built | BT-S3 |
| SB-23 | partial | built | BT-P6, BT-S3 |
| SB-24 | missing | built | BT-S3 |
| SB-25 | missing | built | BT-S3 |
| SB-26 | missing | built | BT-P6, BT-S3 |
| SB-27 | missing | built | BT-SQL9, BT-P6, BT-S2, BT-S3 |
| SB-28 | missing | built | BT-P6, BT-S3 |
| SB-29 | partial | built | BT-P6, BT-S4 |
| SB-30 | partial | built | BT-P6, BT-S4 |
| SB-31 | partial | built | BT-SQL9, BT-S4 |
| SB-32 | conflict | built | BT-P6, BT-S4 (data-driven first sentence) |
| SB-33 | partial | built | BT-S4 |
| SB-34 | conflict | built | BT-C1, BT-S4 |
| SB-35 | partial | built | BT-H2 (pointer), BT-S4 |
| SB-36 | partial | built | BT-R2 |
| SB-37 | shipped | kept (shipped) | — |
| SB-38 | stale-note | stale note | — |
| SB-39 | partial | built | BT-S1, BT-S3 (the list re-reads on every refresh; the pending line) |
| SB-40 | partial | built | BT-SQL9, BT-P6, BT-S3 |

**Totals:** built 231 · kept (shipped) 87 · landed (add-wine) 32 · landed (lane N) 3 · stale note 11 · not adopted 7

---

## Appendix B — Traceability: the critic

### Missed requirements (MISSED-01…07)

| Item | Disposition | Tasks / reason |
|---|---|---|
| MISSED-01 | built | BT-R1 (makeGlassLabeler, 'Glass N'); lane N list order |
| MISSED-02 | landed (add-wine) | add-wine T10 (amendment 6) |
| MISSED-03 | built | BT-R1 (motion keyed on reveal_step) |
| MISSED-04 | built | BT-S4 (S11b with one row) |
| MISSED-05 | landed (add-wine) | add-wine D8 field order kept (precedence 4); BT-L3 adds only Swap and Remove |
| MISSED-06 | not adopted | the README's stale notes (ledger Not adopted) |
| MISSED-07 | kept (shipped) | the nav as drawn |

### Weak-item corrections

| Item | How the plan uses the correction |
|---|---|
| HOST-12 | citation corrected; no task change |
| HOST-13 | citation corrected; no task change |
| HOST-18 | citation corrected; BT-P4, BT-H2 |
| HOST-33 | citation corrected; landed in lane N 092000 |
| XCUT-45 | stale: no route to redirect; not built |
| XCUT-53 | partial: BT-P5, BT-Y1 (per-group saves in the tested `guess-save-queue.ts`; a failed group reverts alone; Lock waits for the queues) |
| PLAY-15 | partial: BT-P5, BT-Y1 (years 1900 to next UTC year, tawny 1–100) |
| CREATE-51 | a DECLINED guest may rejoin through the link: B4 keeps it; the first join's `joined_at` stays, and a DECLINED invitee who never joined is stamped on that first join (BT-SQL4's `viewer_tasting_id` rule and joined-at trigger, stamped once since BT-SQL4x; BT-G3) |
| CREATE-22 | stale: DRAFT stays; copy landed in add-wine T2 |
| XCUT-42 | partial: landed in add-wine T2 |
| LOBBY-17 | Declined collapsed and not counted: BT-P1, BT-L2 |
| CREATE-34 | the ✕ on a waiting contributor row is not adopted (ledger) |
| GUEST-01 | the Overview eyebrow: BT-G1 |
| LOBBY-40 | citation corrected; every recreate starts from the live definition (Global Constraints) |
---

## Appendix C — Ledger decisions → tasks

| Decision | Tasks |
|---|---|
| Precedence | Global Constraints "Precedence and invariants" |
| Sequencing (add-wine first; lane N now; everything else waits for its files) | Waves; Working Rule 3; every "Depends on" naming an AW- or TR- task |
| B0 · Start without a wine-count gate | landed in add-wine T2/T3 (amendment 1); BT-L2 renders Start inline and pinned |
| B0 · D7 amended: an incomplete glass warns at Start, its reveal stays refused | landed in add-wine (amendment 2); BT-L2 (inline warning), BT-H2 (refusal with Edit) |
| B0 · D14 play-2 dropped | landed (amendment 3); BT-S2, BT-S3 build the permutation instead |
| B0 · T2 copy | landed (amendment 4); BT-C1 keeps it |
| B0 · T10 without padded slots | landed in add-wine T10 (amendment 6) |
| B0 · F10 / S7 edit guard until the first step | add-wine F10/S7 (amendment 7); BT-P1, BT-SQL6, BT-L1, BT-L3 |
| B0 · D15 reveal-8 answered | BT-P4, BT-H2 |
| B1 · Create | BT-C1, BT-C2, BT-C3, BT-P8, BT-J1 (link hint) |
| B2 · Lobby and editing | BT-D2, BT-P1, BT-SQL6, BT-L1, BT-L2, BT-L3, BT-L4 |
| B3 · Guests before the start | BT-P2, BT-SQL4, BT-D1 (date formats), BT-G1, BT-G2, BT-G3 |
| B4 · Joining late | BT-SQL3, BT-SQL4, BT-P2, BT-J1, BT-H1, BT-R2, BT-R3 |
| B5 · Dark means live | BT-D1, BT-D2, BT-P3, BT-R2; re-skins in BT-Y2, BT-Y3, BT-Y4, BT-H2, BT-S3, BT-S4, BT-R1 |
| B6 · Host console | BT-SQL7, BT-P3, BT-P4, BT-H1 (`pacing-guards.ts`), BT-H2, BT-S4, BT-C1 (landing) |
| B7 · Guessing, picker, waiting | BT-P5, BT-SQL8, BT-Y1, BT-Y2, BT-Y3, BT-Y4 |
| B8 · A note on a hidden glass | BT-SQL5, BT-N1, BT-N2 |
| B9 · Semi-blind as a permutation | BT-P6, BT-SQL9, BT-SQL10, BT-S1, BT-S2, BT-S3, BT-S4, BT-S5, BT-S6, BT-H2 (BYO console on `get_wine_reveal`), BT-M9b; the list a snapshot and the flight fixed at Start: BT-P1, BT-SQL6, BT-L1, BT-L3 (Q7) |
| B10 · Reveal, result, record | BT-P7, BT-SQL3, BT-R1, BT-R2, BT-R3, BT-R4, BT-R5 |
| B11 · Hand hosting | BT-SQL11, BT-P1, BT-K1 |
| B12 · Place | BT-SQL2, BT-P8, BT-C1, BT-L2, BT-L4, BT-G1, BT-G2, BT-Q1 |
| B13 · Security fixes (lane N) | landed live (`20260912090000`–`093000`); BT-SQL1 closes the `in_play_steps` leftover and its `get_wine_reveal` twin; BT-SQL6 closes the host bypass found in the critique (`added_by_host`, the `wines` column privileges) |
| B14 · Pure modules (lane N) | landed; consumed by BT-G1 (`relative-day`), BT-L2 and BT-G1 (`tasting-eyebrow`), BT-S1 (`semi-blind-candidates`), BT-R1 (`wine-label`), BT-R2 (`result-math`), BT-Q1 (`ics`) |
| B13 outcome (versions, seed script, live drift) | Global Constraints "Versions" and "Live drift"; BT-SQL3 (seed script unchanged) |
| B13.4 outcome | Global Constraints (client columns); BT-Y1 (writes only guess fields), BT-SQL1 (`in_play_steps`), BT-SQL10 (`guessed_wine_id`), BT-DOC1 (CLAUDE.md note) |
| Reversals of documented rules | BT-DOC1; Appendix F names the landing task per row |
| Not adopted from the handoff | Global Constraints "Never build"; Appendix A rows marked "not adopted" |
| Q1 … Q6 | Global Constraints "Owner defaults adopted" |
| Q7, Q8 (new owner questions, 2026-09-13) | Global Constraints "Owner defaults adopted"; spec §19.1 |
| Critique round 2026-09-13 | refinements 19–22; BT-A0; Working Rule 3 (the review window) |

---

## Appendix D — Handoff screens → tasks

| Screen | What it is | Tasks |
|---|---|---|
| S1 | Setup, laptop | BT-C1 (+ BT-P8, BT-SQL2) |
| S1b | Setup, phone | BT-C1 |
| S2 | The flight, laptop | BT-C2 (+ AW-S6 matrix, BT-L1, BT-SQL6) |
| S2b | The flight, phone | BT-C2, BT-C1 (step-2 "Create and finish later") |
| S3 | Invite and start, laptop | BT-C3, BT-C1 (summary, Start landing), BT-J1 (link hint) |
| S3b | Invite and start, phone | BT-C3 |
| S4 | The lobby, laptop | BT-L2 (+ BT-D2, BT-P1, BT-L1) |
| S4b | The lobby, phone | BT-L2 |
| S4c | Edit a wine | BT-L3 (+ AW-S3b/S7 edit form, BT-L1) |
| S4d | Tasting settings | BT-L4, BT-K1, BT-J1 |
| S5 | The invitation, phone | BT-G1 (+ BT-D2 routing) |
| S5b | The invitation, laptop Overview card | BT-G1 |
| S6 | Joined guest, phone | BT-G2 (+ BT-Q1 calendar LOCATION) |
| S6b | Joined guest, laptop | BT-G2 |
| S7 | Host console, laptop | BT-H2, BT-H1 (+ BT-SQL7) |
| S7b | Host console, phone | BT-H2 |
| S8 | Guessing, phone | BT-Y3, BT-Y1 |
| S8b | Guessing, laptop | BT-Y3 |
| S9 | The picker | BT-Y2 |
| S10 | Locked in, waiting, phone | BT-Y4, BT-N2 |
| S10b | Waiting, laptop | BT-Y4, BT-N2 |
| S11 | The reveal, phone | BT-R1 |
| S11b | The reveal, laptop | BT-R1 |
| S12 | The finish, phone | BT-R2 |
| S12b | The finish, laptop | BT-R2 |
| S13 | Every wine, named | BT-R3, BT-R4 |
| S13b | Every wine, phone | BT-R3 |
| S13c | One glass, opened | BT-R5 |
| SB1 | The semi-blind list | BT-S1 |
| SB2 | Matching, phone | BT-S3, BT-S2 |
| SB3 | Matching, laptop | BT-S3 |
| SB4 | The semi-blind reveal | BT-S4 (laptop = S11b with one row, MISSED-04) |
| all live screens | Dark means live | BT-D1, BT-D2 |

---

## Appendix E — Spec sections → tasks

| Spec section | Tasks |
|---|---|
| §0 How to read this spec | Header "Base"; Global Constraints; BT-A0 (re-anchoring) |
| §1.1 Precedence | Global Constraints "Precedence and invariants" |
| §1.2 Scope | Task Index; Appendix A |
| §1.3 Not adopted | Global Constraints "Never build" |
| §1.4 Reversals, CLAUDE.md lines | BT-DOC1; Appendix F |
| §1.5 Sequencing, file ownership, deploy gate | Parallelism and Sequencing; Working Rule 3 (the review window); BT-A0; refinement 1; BT-M9b |
| §1.6 Shared conventions | Global Constraints (copy, tokens, tests, SQL, probes, versions) |
| §2 B1 Create | BT-C1, BT-C2, BT-C3, BT-P8, BT-J1 |
| §3 B2 Lobby and editing | BT-P1, BT-SQL6, BT-D2, BT-L1, BT-L2, BT-L3, BT-L4 |
| §4 B3 Guests before the start | BT-P2, BT-SQL4, BT-D1, BT-G1, BT-G2, BT-G3 |
| §5 B4 Joining late | BT-P2, BT-SQL3, BT-SQL4, BT-J1, BT-H1, BT-R2, BT-R3 |
| §6 B5 Dark means live | BT-D1, BT-D2, BT-P3, BT-R2; the re-skins in BT-Y2/Y3/Y4, BT-H2, BT-S3/S4, BT-R1 |
| §7 B6 Host console | BT-P3, BT-P4, BT-SQL7, BT-H1, BT-H2, BT-S4, BT-C1 |
| §8 B7 Guessing, picker, waiting | BT-P5, BT-SQL8, BT-Y1, BT-Y2, BT-Y3, BT-Y4 |
| §9 B8 A note on a hidden glass | BT-SQL5, BT-N1, BT-N2 |
| §10 B9 Semi-blind permutation | BT-P6, BT-SQL9, BT-SQL10, BT-S1…BT-S6, BT-H2 |
| §11 B10 Reveal, result, record | BT-P7, BT-SQL3, BT-R1…BT-R5 |
| §12 B11 Hand hosting | BT-P1, BT-SQL11, BT-K1 |
| §13 B12 Place | BT-SQL2, BT-P8, BT-C1, BT-L2, BT-L4, BT-G1, BT-G2, BT-Q1 |
| §14 Already landed; `in_play_steps` | lane N (landed); BT-SQL1 |
| §15 Migrations M1–M10 | BT-SQL1…BT-SQL11 (M9 split, refinement 1); BT-M1…BT-M10 |
| §16 Data privacy audit | every task's rule-1 bullets; BT-V2 reviewer 1 |
| §17 Tests summary | each task's Tests block; BT-V1 gates |
| §18 Verification plan | BT-V5 |
| §19 Owner questions and choices | Global Constraints "Owner defaults adopted"; BT-V5 report |
| Appendix A (screen → files) | the OWNS lists; Appendix D |

---

## Appendix F — CLAUDE.md reversal rows (spec §1.4) → landing tasks → BT-DOC1

| Row | Current rule (substance) | Becomes | Lands in |
|---|---|---|---|
| 1 | Start "requires ≥1 wine" | no count gate; an incomplete glass warns and blocks only its own reveal | add-wine T2/T3 (B0); BT-L2 |
| 2 | "Invites close once started." | open until CLOSED; a late joiner is eligible for every unrevealed glass | BT-SQL4, BT-J1 |
| 3 | `join_tasting_by_code` refuses started tastings; `/j/[code]` joins silently | a reduced preview; join only on "I am in"; refuses only CLOSED | BT-SQL4, BT-G3 |
| 4 | "There is deliberately no Pause or Skip-glass control." | Pause (`paused_at`) and the pour pointer | BT-SQL7, BT-H1, BT-H2 |
| 5 | "No WSET note can be written while a glass is locked." | a private note on a hidden glass, resolved at the reveal | BT-SQL5, BT-N1, BT-N2 |
| 6 | "Matching is NOT enforced to be 1-to-1" | a permutation: one open glass per candidate, swap, the pool release | BT-SQL9, BT-SQL10, BT-S2, BT-S3 |
| 7 | "submitted as one combined batch"; "an all-at-once ladder" | every assignment autosaves; each glass locks on its own | BT-S2, BT-S3 |
| 8 † | the `wine_answers read` semi-blind participant clause, and the rule that every recreate must keep it | candidates only through `get_semi_blind_candidates` (a snapshot from Start); the host clause covers `added_by_host` glasses; the semi-blind clause never comes back | BT-SQL6, BT-SQL10, BT-S1 |
| 9 | "semi-blind and OPEN tastings stay on the lobby." | LIVE semi-blind host-provides lands on the console | BT-C1, BT-S4 |
| 10 | "each pick autosaves the COMPLETE row" | per-field-group upsert; a failed save reverts only its group | BT-Y1 |
| 11 | "Wines are editable … while the tasting is still DRAFT" | Edit, Swap, Remove until the glass's first reveal step, DRAFT and IN_PROGRESS | BT-SQL6, BT-L1, BT-L3 |
| 12 † | "Pickers are keep-mounted bottom sheets (centred on desktop)"; NV and tawny under More | phone sheet, laptop popover anchored to the row; years 1900.., NV, tawny | BT-Y1, BT-Y2 |
| 13 † | "`/results` remains as the dedicated leaderboard + breakdown page" | CLOSED `/results` renders the record; the running page shows the dark result first | BT-R2, BT-R3 |
| 14 † | "Everything for a running tasting lives on the main page" | unchanged, plus dark while IN_PROGRESS and on the result | BT-D2 |
| 15 | add-wine D7 Start refusal; D14 play-2; D15 reveal-8 | a warning; dropped; the console facts count revealed categories only | add-wine amendments 1–3, 8; BT-H2 |
| 16 † | sequential guessing "blind only"; the current wine is "the lowest-position not-yet-revealed one" | LIVE blind and LIVE semi-blind; the pour pointer's glass; semi-blind opens every glass poured so far | BT-C1, BT-P3, BT-H1 |
| 17 † | "Reveal everything" behind a `window.confirm` | an inline two-tap | BT-P4, BT-H2 |
| 18 † | the schedule editable "while DRAFT" | name, description, photo, time and place editable after Start; mode, timing and wine source lock, in the app and the database | BT-C1, BT-L4, BT-SQL6 |
| 19 † | "+N last round" from the most recent `scored_at` | the pointer's glass while its step reveal runs | BT-SQL7 |
| 20 † | the Participants card's "In/Invited/Declined status" | Declined collapses to "{n} declined" | BT-P1, BT-L2 |
| 21 † | the shortlist group "Grown in {region}" | "Common grapes in {region}" | BT-P5, BT-Y2 |
| new | — | `tasting_places`; the `guessed_wine_id` lockdown; hidden-glass notes and `save_wset_note`'s identity rules; the lifecycle stamps and the trigger-owned `joined_at`; `in_play_steps` not client-callable and `get_wine_reveal`'s null count at step 0; `wines.added_by_host`, the `wines` column privileges, `remove_flight_glass` and the setup lock; the semi-blind snapshot and fixed flight; pause (LIVE only) and pointer triggers; the page split and `LiveShell`; `get_join_preview` and the signed-in invitation; 10-character join codes; hand hosting | BT-SQL2, BT-SQL10, BT-SQL5, BT-SQL3, BT-SQL4, BT-SQL1, BT-SQL6, BT-SQL9, BT-SQL7, BT-D2, BT-SQL11 |

† Not in the ledger's "Reversals of documented rules" list; the main session adds these rows to the ledger (spec §1.4).
