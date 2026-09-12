# Add-wine v2 — Implementation Plan

Sonnet 5 label reader · one complete wine · the universal add-wine sheet · flow fixes

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is prompt-ready: give one agent the **Global Constraints**, the **Working Rules** and **exactly one task**, together with the spec and ledger paths below.

**Goal:**
- Replace FastCork with a Claude Sonnet 5 label reader.
- Route every "is this wine complete" decision, and every wine write, through one module.
- Rebuild the add-wine sheet to the Claude Design handoff for every entry point.
- Land all 55 confirmed audit findings, each either fixed or explicitly left for the owner.

**Architecture:**
- **Pure core.** A pure `src/lib/wine-identity/` module holds the draft type, completeness, wording, folding, the read resolver, the confident-match rule and the grape suggestion.
- **Consumers.** Every client form and one server write path (`src/lib/wine-identity/server/write.ts`) consume that module.
- **The sheet.** It becomes a reducer (`sheet-state.ts`) plus one lookup (`matrix.ts`) keyed by destination × `canScan`. Views read the matrix and never branch on the destination.
- **Migrations.** Seven migrations add:
  - label-read retention;
  - a folded producer lookup;
  - incomplete glasses;
  - the pour-time cellar draw-down;
  - three SQL fixes.
- **Flow fixes.** The fixes outside the sheet run as a parallel T track on disjoint files.

**Tech Stack:**
- Next.js 16 App Router. AGENTS.md: read `node_modules/next/dist/docs/` before writing Next-specific code.
- React 19, TypeScript, Tailwind.
- shadcn/ui on `@base-ui/react`.
- Supabase: Postgres, RLS, Storage.
- `@anthropic-ai/sdk` and `zod` (both new).
- vitest, node environment.

**Spec:** `docs/superpowers/specs/2026-09-12-add-wine-v2-scan-and-flow-fixes-design.md`, cited below as "spec §X". Executors read the spec section a task cites. Code blocks and SQL marked "verbatim" are copied from it.

**Ledger (binding):** `.superpowers/add-wine-v2/decisions.md` (D1–D15, the migrations list).

**Other inputs** (all in `.superpowers/add-wine-v2/`):
- `handoff-README.md`, `handoff-canvas-text.txt` and `handoff-canvas.dc.html`: screens M, A1–A8, A4b, B1–B3, C1–C2, D1–D3, D2b, E1, E1b, N1.
- `audit-findings.json`: the 55 findings.
- `scan-diagnosis.json`: root causes RC1–RC12.

**Base:** `master` at `9258219`.

---

## Global Constraints

Every task's requirements implicitly include this section.

### Precedence and the definition of complete

- **Precedence.** When sources disagree, the order is:
  1. owner instructions;
  2. one definition of a complete wine, plus the CLAUDE.md domain rules;
  3. the handoff;
  4. the audit findings and the diagnosis;
  5. round-1 code on master.

  (Ledger preamble.) The only deviations from the handoff are spec §2.1 rows 1–17. Add no others.
- **Wine name is optional everywhere (D3).** `COMPLETE_WINE_FIELDS` = `producer, vintage, colour, style, country, region, appellation, primaryGrape`.
- **One completeness check (D2).** No "is it complete" logic may exist outside `src/lib/wine-identity/`. Every server refusal is `{ error: "This wine " + describeMissing(missing) + ".", missing }`.
- **Vintage ranges (spec §B.3).** A year is valid from 1900 to the current UTC year + 1, inclusive. A tawny age is an integer from 1 to 100.

### Anthropic API

- **No calls from coding agents.** Agents on the F, S, T and G tracks, and L1's fix agent, make **zero** Anthropic API calls: no `messages`, no `count_tokens`. Every agent-side read uses `LABEL_READ_FIXTURE`.
- **Live reads belong to the main session (D1).** The owner approved live Sonnet 5 test calls for development (ledger D1, 2026-09-12), so AGENTS.md's cost statement and approval are already on record.
  - L1 reads each of the 15 photos in `label-test-set.json` once, to verify the reader and the resolver end to end.
  - V3 makes one read through the UI.
  - The cap is **30 live reads in total**. Every call's `usage` is logged and stored in `label_reads` (spec §G.5). Staying inside the cap needs no new approval; going past it does.
- **The reader's settings.** Model `claude-sonnet-5`, `output_config.effort: "low"`, no tools, no web search, no batch. About $0.01 per scan (D1, spec §A.7).
- **No loops.** No batch or maintenance loops through the API: no backfills, and no re-reading the catalog's photos (AGENTS.md, D1).
- **Skill.** Before writing SDK code (F4, F7, L1), load the `claude-api` skill (TypeScript → Structured Outputs).

### Tests and pure modules

- **vitest.** It runs `src/**/*.test.ts` in node with **no `@/` alias**. A module a test loads may import other modules at runtime only by relative path. `import type … from "@/…"` is fine, because it is erased.
- **Pure modules.** These never import `server-only`, Supabase, or a browser-only API at module top level:
  - `src/lib/wine-identity/*.ts` outside `server/`;
  - `src/lib/label-scan/label-read-schema.ts`;
  - `src/components/add-wine/{matrix,added-via,sheet-state,flight-knowledge}.ts`;
  - the `detectCanScan` / `forcedCanScan` half of `use-can-scan.ts`.

### CLAUDE.md rules

- **Reference tables.** Never read a whole `appellations` or `producers` table: PostgREST caps a read at 1000 rows. Use `search_appellations` / `search_producers` / `listAppellationsForRegions`, or lookups by id.
- **Cross-table RLS.** Any cross-table check on tastings, tasting_participants or wines goes through a SECURITY DEFINER helper (`is_tasting_host`, `is_tasting_participant`, the new `is_wine_adder`). Never a raw subquery.
- **Base UI.**
  - `Button render={<Link/>}` needs `nativeButton={false}`.
  - A `Button` passed as another component's `render` keeps the default.
  - `Select` needs an `items` map to show labels.
- **Synchronous focus (spec §C.4 rule 9).** Comboboxes, the sheet's search field, Fix and By hand focus their input inside the same tap.
  - The input must already be mounted. The search view and `ByHandForm` mount, hidden, from the first paint after `resolving`.
  - Wrap the state change in `flushSync`, then call `.focus()` in the same handler. Never `autoFocus`, and never a deferred callback.
  - Opens that start outside the sheet (lobby Edit, `?addWine=`, `?editWine=`) focus after loading on a mouse device, and only flag the field on a touch device.
- **Controlled inputs.** Every input on a page with `AutoRefresh` is controlled React state.

### Copy and visuals

- **Copy.** Strings are exactly the spec's (§C.2 tables, §C.5, §D), including the curly quotes in “glass N”.
- **Sizes.** Touch targets on phones and tablets are at least 44 px tall (handoff README: "never below 44px tall for a mobile tap target"). The laptop's `RowActionButton` keeps round 1's 36 px. No text is smaller than 10 px.
- **Colour.** Use the `globals.css` tokens, never raw hex: `--gold-dark` for small gold text, `--gold-light` for gold on a dark ground.

### Migrations

- **File rules.**
  - No `begin` / `commit`.
  - End with a same-transaction assertion `do` block (the 20260911100000 pattern).
  - Every new SECURITY DEFINER function pins `set search_path = public`, grants execute to `authenticated`, and gets an assertion via `to_regprocedure` that `prosecdef` is true and `proconfig` contains `search_path=public`.
- **Dry run.** `node scripts/scratch-apply.mjs --file <file> --mode dry` must print `DRY-OK <version> <name>`.
- **Live apply.** Agents never run `--mode live`. Only the main session does, in M1–M3.
- **Types file.** `src/lib/supabase/database.types.ts` is hand-written. Every table keeps `Relationships: []`, the schema keeps `Views: {}`, and jsonb columns are typed `unknown`. **Only F2 and then F3 edit it.**
- **Lockfile.** The pre-existing `package-lock.json` diff (42 deleted `libc` lines) is never committed by this work. The working-tree file is never rewritten to remove it either; P0 stages a copy with the `libc` lines restored instead (spec §A.1, §F.3).

### Removed on purpose, never reintroduce

- runtime FastCork;
- the alternates list and "Use this" on the confirm screen;
- the year/NV Fix strip;
- the per-row "keep it in the cellar" toggle;
- `{ kind: "rate" }`;
- touch-only routing;
- silently adopting a hinted flight;
- `wine-form.tsx`;
- the unpaged self-named-appellation lookup;
- the resolver's first-hit fallback;
- a cellar lot id, or any other pour intent, on `wines`;
- mounting `ByHandForm` only when it is first needed.

### Left for the owner, do not build (D15)

- sources-6 and sources-7;
- reveal-8;
- entry-5 and entry-7;
- auto-add on a confident match;
- scan-6 beyond D10's in-flight marking.

---

## Amendments from the blind-tasting ledger (2026-09-12, binding — they supersede the task text further down)

The owner sent a second handoff, *the blind tasting, end to end*, while this plan was being written. Its binding ledger is `.superpowers/blind-tasting/decisions.md` (section B0). These amendments stop add-wine v2 from building what that redesign would immediately undo. Where a task below says otherwise, this section wins. Executors of the named tasks read it first.

1. **No wine-count gate on Start (T2, T3, V1 item 3).**
   - `startTasting` no longer requires at least one wine.
   - The create sheet's Start is enabled with an empty flight.
   - Copy under an empty flight: "Even none is enough. Wines can be added while the tasting is running."
2. **Incomplete glasses warn at Start instead of refusing it (D7 amended; F3, T3, T2, S6, S7, V1).**
   - **F3.** `incomplete.ts` exports `startWarning(rows): string | null` in place of `startRefusal`. The test pins its wording:
     - one glass: "Glass 3 still needs a vintage — finish it before you reveal it."
     - several: "Glass 3 still needs a vintage · Glass 5 still needs a vintage and a grape — finish them before you reveal them."
     - no rows: `null`.
     `revealRefusal`, `flightRowNeeds` and `pendingAnswerNotice` are unchanged.
   - **T3.** In `startTasting`, step 1 checks only that the caller is the host. Step 2 computes `startWarning` and carries it into the returned `warning`, space-joined with any draw-down warning lines. The status update and draw-down steps are unchanged. Acceptance greps that name `startRefusal` name `startWarning` instead.
   - **T2 / S6 / S7.** The warning renders inline under Start; nothing blocks the tap.
   - **Reveal.** The refusal for an incomplete glass stays exactly as planned (T5, T9).
3. **No semi-blind freeze (D14 play-2 dropped; T5, T6, T8, contract table, V1).**
   - Do not create `matchesFrozen`, `semiBlindMatchesFrozen` or the "The reveal has started — matches are final." refusals. `guess-guards.ts` exports only `guessBlockReason`.
   - `MatchLadder` gets no `frozen` prop, and T8 computes no `frozen`.
   - The contract-table entries naming `matchesFrozen` and `frozen` are void, and the V1 semi-blind freeze check is dropped.
   - play-7 (no skip in the match ladder) stays.
   - The blind-tasting work rebuilds semi-blind as a permutation.
4. **Create-sheet copy (T2).**
   - Step 1's secondary button reads "Create and finish later". It writes the row and closes the sheet, with no lobby push.
   - Step 3's secondary button reads "Invite later". It closes without creating participant rows or sending any email. This replaces "'Save as draft' still sends the invitations".
   - No "draft" / "drafts" wording remains in the sheet: "Save as draft" and "Until then it sits in your drafts" go. The lobby's status eyebrow may still say "Draft".
5. **The End confirm lives in the header menu (T2, T4 — a plan gap).** `page.tsx` renders `HostControlsMenu` (surface "menu", which holds End) at :482 and `HostControls` (surface "start") at :609.
   - **T2** also OWNS `src/app/tastings/[id]/host-controls-menu.tsx`. It accepts `unrevealedGlasses?` and forwards it to `HostControls`.
   - **T4** passes `unrevealedGlasses`, `showSequentialToggle` and `showLeaderboardToggle` to `HostControlsMenu`, which is where those controls render today.
6. **No padded slots on the Overview banner (T10).** The next-up banner never pads a flight to six "Empty" rows. Host-provides shows the real glasses with "{n} glasses so far". Bring-your-own shows one waiting row per JOINED participant without a bottle.
7. **Editing a complete glass mid-tasting (F10, S7).** Wherever F10 or S7 limits editing a complete glass to DRAFT, the guard becomes all three of:
   - the tasting is not CLOSED;
   - the glass is not revealed;
   - `wines.reveal_step = 0`.
   Incomplete glasses keep their planned guard.
8. **reveal-8 stays unbuilt here (T9).** T9 leaves the console's "This glass" facts as they are. The blind-tasting work makes them revealed-only.
9. **Three migrations land before M1 (M1, T13, G1).**
   - Blind-tasting lane N writes them, and the main session applies them live, in order, before 20260912100100:
     - `20260912090000_has_scored_guess_step_gate`
     - `20260912091000_participant_row_pin`
     - `20260912092000_reveal_wine_locked_gate`
   - These three files, and `20260912093000_guesses_client_columns` (item 12), are in no task's OWNS.
   - T13 writes 105000 against the LIVE `reveal_next_category` and must not recreate `has_scored_guess`.
   - Anything that reads `reveal_wine` expects the live 092000 gate:
     - a participant may reveal only when every eligible participant has a LOCKED guess;
     - the host-provides host is not an eligible guesser;
     - CLOSED tastings are refused.

10. **No 105000 (T13, M3, M4, spec §E.6).** Live `wine_answers.producer_id` and `vintage_kind` are NOT NULL, and live `reveal_wine` and `score_own_guess` have no null-producer or null-vintage branch.
    - Why: `20260807090000_optional_producer_vintage.sql` never ran live. Its version is recorded as `20260807090000_cote_de_nuits_villages`, and CLAUDE.md records the owner reverting optional producer. So reveal-3 does not apply live.
    - T13 writes only `20260912106000_leaderboard_round_wine`. M3 applies 104000, then 106000. M4 expects six add-wine rows.
    - Any reasoning about a missing producer or vintage on an answer key uses live NOT NULL, not the local file.
    - The duplicate-version drift is audited separately. Do not fix it inside this plan.
11. **`label_reads` is `20260912100100` (F2, M1, M4).** Upstream's `20260912100000_portugal_wave3_statute_corrections` is already live, so label_reads takes version 20260912100100.
    - Every `20260912100000` in this plan, the spec and the add-wine ledger now reads `20260912100100`.
    - Another stream applies wine-map migrations to the same database. Before writing any new migration, check that its version is absent from `supabase_migrations.schema_migrations` and from `supabase/migrations`.
12. **Guess writes carry only guess fields and `locked_at` (T5, T6, T8, G2).** Lane N adds `20260912093000_guesses_client_columns`.
    - Clients lose write access to the scoring columns: `scored_at`, every `*_points` column, `total_points` and `reveal_step`. Only SECURITY DEFINER functions write them.
    - Insert and update require the caller's JOINED participant row in the wine's tasting.
    - No app insert, update or upsert on `guesses` may include a scoring column.
13. **Auto-reveal counts through `tasting_guess_status` (T5).**
    - `maybeAutoRevealWine` counts locked guesses from `rpc("tasting_guess_status", { p_tasting_id })` rows with `locked`, filtered to eligible participants: JOINED, minus the wine's contributor, minus the host-provides host.
    - Counting `guesses` through the caller's RLS sees only the caller's own row on a hidden glass, so ASYNC AFTER_ALL never auto-reveals when a guest locks last.
    - Rewrite the stale "Known gap (no migration this round)" comment: 20260912092000 fixed the SQL gate.
14. **A glass mid step-reveal is never "resolved" (T8).** In `play-experience.tsx`, a glass with `reveal_step > 0 && !is_revealed` is unresolved for the viewer even with a scored guess. It renders RevealView or the locked state, never the ladder. After 20260912090000 only the host and the contributor can read its answer row mid-step.
15. **`has_scored_guess` grants only the ASYNC IMMEDIATE path (every wine_answers reader).** Since 20260912090000 (live), a guesser reads an answer row through that helper only when all of these hold:
    - it is their own scored guess;
    - the tasting is ASYNC IMMEDIATE;
    - they are JOINED in the wine's tasting;
    - the glass has no shared step reveal in progress.

    Everyone else reads through the host, contributor, `is_revealed` or semi-blind clauses. Code that assumed "a scored guess opens the answer" (profile stats, the create sheet's name suggestion, results) treats unrevealed glasses as hidden.

16. **Overview phone redesign landed first (T10).** Commit ea8cf26 (owner-approved design B, 2026-09-12) already edited `src/app/overview/banner.tsx`, `page.tsx`, the three cards, `add-wine-banner-button.tsx` and `src/components/overview/*`, and added `overview/quick-actions.tsx` and `overview/next-up-meta.ts`. T10 builds on that state:
    - keep the phone-only meta line under the Next-up title, its `./next-up-meta` import, the `hideActionOnPhone` props and the "Add a wine" label (no position number; fix the stale "Add wine N" comment in `overview-types.ts`);
    - when T10 removes the padded "Empty" slots (amendment 6) and adds bring-your-own waiting rows, keep the phone banner short: the slot list stays `max-md:hidden`;
    - if T10 adds a joined-participant count to `NextUpBanner`, pass it as `joinedCount` to `nextUpMeta` so the phone line gains "· {k} in"; do not add the field only for that;
    - `canAddWine` on the live banner also gates the tile row nothing; the tiles never depend on banner data except `bannerKind`.

## Working Rules

1. **Ownership.** You may create, edit or delete only the files in your task's **OWNS** list. You may read anything. If the task needs a change in a file you do not own, stop and report the exact change to the orchestrator. Never make that change yourself.

2. **No git writes by agents.**
   - Agents never change the index, the history, or a file outside OWNS. That rules out `git add`, `git commit`, `git stash`, `git checkout -- …` and `git reset`.
   - The main session reviews each finished task and commits exactly its OWNS paths on `master`, one task at a time: `git add -- <paths> && git commit`, ending the message with the session's attribution line.
   - **Nothing is pushed until G3 is green**, so the remote never receives a red tree. After that, push straight to `master` (the owner's preference: no PR).

3. **Tests first.** For every file in a task's **Tests** block:
   1. Write the tests.
   2. Run `npx vitest run <file>` and watch it fail for the stated reason.
   3. Implement.
   4. Run it again and watch it pass.

4. **Compile-debt window.** From **F7** until **S6** is done, `npx tsc --noEmit` may report errors in these files, and only while the task that owns them is unfinished:
   - `src/components/add-wine/**`
   - `src/components/add-wine-context.tsx`
   - `src/components/taste-launcher-context.tsx`
   - `src/components/tasting-scan-registrar.tsx`
   - `src/components/add-wine-button.tsx`
   - `src/app/tastings/new/flight-step.tsx`

   Every task leaves **zero** errors in its own OWNS files and **zero** errors outside that set. Check with:
   ```bash
   npx tsc --noEmit 2>&1 | grep "error TS" \
     | grep -vE "src/components/add-wine/|src/components/(add-wine-context|taste-launcher-context|tasting-scan-registrar|add-wine-button)\.tsx|src/app/tastings/new/flight-step\.tsx"
   # → must print nothing
   npx tsc --noEmit 2>&1 | grep "error TS" | grep -F -e "<each OWNS path>"
   # → must print nothing
   ```
   - Before F7, and from S6 on, a bare `npx tsc --noEmit` must print nothing.
   - Parallel agents share one tree. An error in a file owned by another task that is still running belongs to that task: note it and move on.

5. **Deletion rule.**
   - Delete an export only when `rg -n "\b<name>\b" src` shows no importer outside your OWNS.
   - Otherwise keep it, marked `/** @deprecated removed in <task> */`, and the named task deletes it.
   - Every scheduled deprecation is listed both in the task that creates it and in the task that removes it.

6. **Before reporting done,** run:
   - the task's `npx vitest run …`, or `npm test` if you touched a helper that other tests import;
   - the tsc check from rule 4;
   - `npx eslint <your OWNS files>`;
   - the task's Acceptance commands.

7. **Report:**
   - the files changed (a subset of OWNS);
   - the tests added and their pass output;
   - the tsc, eslint and dry-run output;
   - every stop-and-report item;
   - the decision, finding, screen and RC ids closed.

8. **Paths with brackets.** Quote them in shell commands, for example `"src/app/tastings/[id]/page.tsx"`.

9. **Dev and browser gotchas (CLAUDE.md).**
   - **Stale Turbopack 404.** It renders unstyled. Stop the server, run `rm -rf .next`, start again.
   - **Private folders.** Folders starting with `_` under `src/app` are private and get no route.
   - **Keys.** The browser tool must send "Enter", not "Return".
   - **Confirm dialogs.** Override `window.confirm` in the tab before an automated click that asks for confirmation.
   - **Demo sessions.** Mint them with `.superpowers/demo-session.mjs`. Never type a password.

## Task Fields

| Field | What it holds |
|---|---|
| **Depends on** | The tasks that must be committed first. |
| **OWNS** | The exhaustive list of files the task may touch. |
| **Round-1** | Which round-1 behaviour (9258219) it keeps or replaces. |
| **Does** | Concrete bullets, with spec references. |
| **Interfaces** | The names neighbouring tasks rely on. |
| **Tests** | vitest code written first; pure modules only. |
| **Steps** | The ordered checklist. |
| **Acceptance** | The commands and results that prove it is done. |
| **Closes** | Ledger decisions, audit finding ids, handoff screen ids, diagnosis RCs. |

## Task Index

| ID | Title | Depends on |
|---|---|---|
| P0 | Dependencies `@anthropic-ai/sdk` + `zod` (main session, before any agent) | — |
| F1 | wine-identity core: draft type, completeness, wording, folding | — |
| F2 | Migrations 100000 `label_reads` + 101000 producer folded lookup; types | F1 |
| F3 | Migrations 102000 `wine_identity_drafts` + 103000 `cellar_pour_intent`; types; incomplete-glass helpers | F2 |
| F4 | LabelRead schema, fixtures | F3 |
| F5 | Read resolver, region synonyms, reference snapshot | F4 |
| F6 | Confident match, grape suggestion, draft sources | F5 |
| F7 | Label reader server path, `label_reads` retention, guards, FastCork removal | F6 |
| F8 | Unified server write path | F7 |
| F9 | Catalog and cellar page writers on the write path | F8 |
| F10 | Flight writes, adder guard, legacy routes | F9 |
| F11 | Sheet contracts, matrix, `addedVia` | F10 |
| F12 | `canScan`, downscale, sheet state, knowledge rule | F11 |
| F13 | Sheet server actions, the self-named appellation lookup | F12, T5 |
| L1 | Live label verification on the test set (main session), resolver fixes | F7, M1 |
| S1 | Camera, read-and-confirm, multi stack, follow-up, chooser | F13 |
| S2 | Search, cellar source, lot step | S1 |
| S3a | By-hand logic (pure) | S2 |
| S3b | By-hand form | S3a |
| S4 | Laptop view | S3b |
| S5a | The sheet's adds hook (`use-sheet-adds.ts`) | S4 |
| S5b | The sheet shell (`add-wine-sheet.tsx`) | S5a |
| S5c | Provider, launcher, registrar, deprecation sweep | S5b, T10 |
| S6 | Create-sheet step 2 on the matrix | S5c, T1, T2 |
| S7 | Flight page Wines card and query launcher | S6, T4 |
| T1 | Create setup rules (Guided LIVE-only, leaderboard, who pours) | — |
| T2 | Create sheet, invites, share link, Start and End copy | T1, T3 |
| T3 | Lobby server actions and invites | F3 |
| T4 | Lobby page flow fixes | T2 |
| T5 | Play server guards and auto-reveal module | F3 |
| T6 | Guess and match ladders | — |
| T7 | Standings, results and reveal view | — |
| T8 | Play experience and locked-in | F3, T5, T6, T7 |
| T9 | Host console | F3, T2, T7 |
| T10 | Overview banner and flight hint | F11 |
| T11 | Cellar launcher copy and About fold | — |
| T12 | Legacy identity picker appellation shape | F13 |
| T13 | Reveal SQL: 105000 + 106000 | — |
| T14 | `blind_pending` unmark: 104000 | — |
| M1 | Apply 100000 and 101000 live (main session) | F2 |
| M2 | Apply 102000 and 103000 live (main session) | F3, M1 |
| M3 | Apply 104000, 105000 and 106000 live (main session) | M2, T13, T14 |
| M4 | Post-apply schema checks (main session) | M3 |
| G1 | Integration gate | every F, S and T task, and L1 |
| G2 | Adversarial review | G1 |
| G3 | Review fixes and re-gate, then push | G2 |
| G4 | Documentation that ships with the code | G1 |
| V1 | Browser checks — mouse device | G3, G4, M4 |
| V2 | Browser checks — phone emulation | V1 |
| V3 | One live read through the UI (main session, inside D1's cap) | V2 |

Every task also waits for P0. No agent starts until the dependencies are installed and committed.

---
## Parallelism and Sequencing

### Waves

A task starts as soon as everything in its "Depends on" is committed. The F track and the S track are chains by design: each task builds on the contracts its predecessor just landed. The T track fills parallel capacity next to them.

| Wave | Starts when | Tasks that may run at the same time |
|---|---|---|
| −1 | immediately | **P0** (main session, alone: it rewrites `node_modules`) |
| 0 | P0 committed | **F1** · T1 · T6 · T7 · T11 · T13 · T14 |
| 1 | F1 done | **F2** (continues alongside wave 0) |
| 2 | F2 done | **F3** · M1 (main session) |
| 3 | F3 done | **F4 → F5 → … → F12** (chain) · T3 · T5 · M2 (after M1) |
| 4 | T1 and T3 done | T2 |
| 5 | T2 done | T4 · T9 (once T7 is also done) |
| 6 | T5, T6 and T7 done | T8 |
| 7 | F7 and M1 done | **L1** (main session; its fix agent owns only L1's files) |
| 8 | F11 done | T10 |
| 9 | F12 and T5 done | **F13** |
| 10 | F13 done | **S1 → S2 → S3a → S3b → S4 → S5a → S5b** (chain) · T12 |
| 11 | S5b and T10 done | **S5c** |
| 12 | S5c, T1 and T2 done | **S6** |
| 13 | S6 and T4 done | **S7** |
| 14 | M2, T13 and T14 done | M3 → M4 |
| 15 | every F, S and T task done, and L1 | G1 → (G2 ∥ G4) → G3 → V1 → V2 → V3 |

### Two tasks may run together only when all three hold

1. Neither depends on the other, directly or transitively.
2. They are not both in the F chain or both in the S chain.
3. Their OWNS lists are disjoint.

Condition 3 holds for every pair except the shared files below, and each of those is already ordered through "Depends on".

### Files more than one task edits (always sequential, in this order)

| File | Editors, in order | Why it is shared |
|---|---|---|
| `package.json`, `package-lock.json` | P0 only | The main session installs before any agent runs |
| `src/lib/supabase/database.types.ts` | F2 → F3 | Hand-written types; two migration batches |
| `src/lib/wine-identity/resolve.ts` + `resolve.test.ts`, `src/lib/label-scan/region-canonical.ts`, `src/lib/wine-identity/__fixtures__/reference-snapshot.json` | F5 → L1 | L1 fixes the resolver misses that the live reads expose |
| `src/components/add-wine/types.ts` | F11 → S1 → S2 → S3b → S4 → S5c | F11 lands the contracts; each view task adds its own props; S5c removes the deprecated leftovers |
| `src/components/add-wine/sheet-state.ts` + `.test.ts` | F12 → S5a → S5b | S5a and S5b may add actions the hook and the shell need (never rename one) |
| `src/components/add-wine/use-camera.ts` + `.test.ts` | F12 → S6 | F12 deprecates the touch exports; S6 deletes them once flight-step stops importing them |
| `src/components/add-wine/desktop-format.ts` + `.test.ts` | S4 → S6 | S4 keeps `rowActionLabel`/`enterHint` as deprecated wrappers for flight-step |
| `src/lib/label-scan/extract.ts` | F7 → S5c | F7 keeps a deprecated `ExtractedLabel` type for sheet type-importers |
| `src/app/scan/actions.ts` | F7 → S5c | F7 keeps deprecated `ScanMatch`/`ScanResult` types |
| `src/components/add-wine/by-hand-logic.ts` | S3a → S3b | S3a deprecates the round-1 helpers; S3b deletes them once the form stops importing them |
| `src/app/catalog/new/actions.ts` | F9 → S3b | S3b deletes `createProducer` once the by-hand form stops importing it |
| `src/app/catalog/new/new-wine-form.tsx` | F9 → S5c | S5c removes `WineFormInitial.vintagePrompt` after the sheet stops reading it |
| `src/app/tastings/[id]/wines/new/actions.ts` | F10 → F13 | F10 keeps a deprecated `addTastingWineFromCellarLot` wrapper |
| `src/components/wine/wine-identity-fields.tsx` | F9 → T12 | F9 drops the `required` attributes; T12 changes the appellation shape |
| `src/app/tastings/new/actions.ts` | T1 → S6 | T1: setup columns and wine-source lock; S6: `listFlight` |
| `src/components/new-tasting-sheet.tsx` | T2 → S6 | T2: invites, routing, media hook; S6: the FlightStep call site only |
| `src/app/tastings/[id]/page.tsx` | T4 → S7 | T4: flow-fix toggles and invite card; S7: the Wines card (A1) |

### Contract dependencies (no shared file, but an import or prop contract)

| Consumer | Provider | Contract |
|---|---|---|
| F7 | F5 | `appellationSearchPattern` and `NATIONAL_TIER_REGION_NAMES` from `src/lib/wine-identity/resolve.ts`; `serverLookup` sends the pattern |
| F13 | T5 | `maybeAutoRevealWine(supabase, wineId)` exported from `src/app/tastings/[id]/play/auto-reveal.ts` |
| L1 | F7, M1 | `readLabel`, `serverLookup` and `findConfidentMatch`; `label_reads` live |
| T2 | T1 | `NewTastingForm` accepts `wineCount?: number` |
| T2 | T3 | `LobbyActionState` gains `{ success: string; warning?: string }` |
| T4 | T2 | `HostControls` accepts `unrevealedGlasses?: { glass: number; state: "hidden" \| "half" }[]` |
| T9 | T2 | `src/lib/tasting-lifecycle-copy.ts`: `startLandsOnConsole`, `endTastingConfirm`, `notRevealedEyebrow` |
| T8, T9 | T7 | `rankRows`, `rankLabel` in `src/lib/stats-math.ts` |
| T8 | T7 | `RevealView` prop `leaderboardReveal: "PER_ATTRIBUTE" \| "PER_WINE"`; T7 adds it, T8 passes `tasting.leaderboard_reveal` |
| T8 | T5 | `scoreLockedGuess` from `src/app/tastings/[id]/play/actions.ts` (a server action returning `LockResult`); `matchesFrozen` and `guessBlockReason` from `src/lib/guess-guards.ts` (pure) |
| T8 | T6 | `GuessLadder`/`MatchLadder` props `timingMode`, `asyncRevealPolicy`, `frozen` |
| T10 | F11 | `FlightHint.phase?`, optional in F11 beside a deprecated `live?` |
| S5c | T10 | Every `FlightHint` producer passes `phase`, so S5c makes it required and deletes `live` |
| S4 | F11, F13 | `SearchGroups` catalog and tasted rows carry `producerId`, `wineName`, `appellationId` and `vintageLabel` |
| S5b | S3b | `ByHandForm` renders an empty session while hidden and registers `fieldRefs` |
| S5b | S5a | `useSheetAdds(...)` from `src/components/add-wine/use-sheet-adds.ts` |
| S3b, T12 | F13 | `justTheRegionOption`, `findSelfNamedAppellation`, `appellationPlaceholder`, `appellationHint` in `src/components/add-wine/self-named-appellation.ts`; `regionSelfNamedAppellation` in `by-hand-actions.ts` |
| T3, T5, T8, T9, S6, S7 | F3 | `src/lib/wine-identity/incomplete.ts` and `server/incomplete-glasses.ts`; the RPC types |

### Per-task concurrency quick reference

| Task | Earliest start | Never concurrently with | Reason |
|---|---|---|---|
| P0 | first | everything | rewrites `node_modules` and the lockfile |
| F1–F13 | chain | each other | F chain |
| L1 | F7 + M1 | — | its fix agent owns files no other running task edits (F5 is done) |
| S1–S7 (with S3a, S3b, S5a, S5b, S5c) | chain | each other | S chain |
| T1 | wave 0 | S6 | shares `tastings/new/actions.ts` (ordered) |
| T2 | T1 + T3 | S6 | shares `new-tasting-sheet.tsx` (ordered) |
| T3 | F3 | — | disjoint from everything |
| T4 | T2 | S7 | shares `tastings/[id]/page.tsx` (ordered) |
| T5 | F3 | — | disjoint (F13 only imports its module after it lands) |
| T6, T7, T11, T13, T14 | wave 0 | — | disjoint from everything |
| T8 | T5 + T6 + T7 | — | disjoint |
| T9 | F3 + T2 + T7 | — | disjoint |
| T10 | F11 | — | disjoint; S5c waits for it |
| T12 | F13 | — | shares `wine-identity-fields.tsx` with F9, which finished long before |
| M1–M4 | see waves | the task writing the migration being applied | live DB; the main session runs them in ledger order |

### Migration ownership (each migration written and dry-run by exactly one task)

| Migration | Written and dry-run by | Applied live in |
|---|---|---|
| `20260912100100_label_reads.sql` | F2 | M1 |
| `20260912101000_producer_folded_lookup.sql` | F2 | M1 |
| `20260912102000_wine_identity_drafts.sql` | F3 | M2 |
| `20260912103000_cellar_pour_intent.sql` | F3 (dry-run combined with 102000, which it needs) | M2 |
| `20260912104000_blind_pending_unmark_on_delete.sql` | T14 | M3 |
| `20260912105000_reveal_step_null_scoring.sql` | T13 | M3 |
| `20260912106000_leaderboard_round_wine.sql` | T13 | M3 |

---
## Track F — Foundations (sequential chain)

### P0 — Dependencies `@anthropic-ai/sdk` + `zod` (main session, before any agent)

**Depends on:** — It runs before wave 0. No agent may run while it does, because it rewrites `node_modules`.

**OWNS**
- modify `package.json`, `package-lock.json` — in the commit only. The working-tree lockfile keeps the owner's `libc` deletions.

**Does** (spec §A.1, §F.3 Q12)
- Load the `claude-api` skill first (TypeScript → Structured Outputs, `zodOutputFormat`). `$SCRATCH` is the session scratchpad directory.
  ```bash
  git diff package-lock.json > "$SCRATCH/lockfile-preexisting.patch"   # the owner's 42 libc deletions, kept for the record
  git show HEAD:package-lock.json > "$SCRATCH/lock-head.json"
  npm install @anthropic-ai/sdk zod
  SCRATCH="$SCRATCH" node "$SCRATCH/lock-for-commit.mjs"               # writes $SCRATCH/package-lock.for-commit.json
  git add -- package.json
  git update-index --cacheinfo "100644,$(git hash-object -w "$SCRATCH/package-lock.for-commit.json"),package-lock.json"
  git diff --cached --stat
  ```
- `$SCRATCH/lock-for-commit.mjs` reads the installed lockfile, puts HEAD's `libc` fields back on every package whose version did not change, and writes the result to the scratchpad. It never writes `package-lock.json`:
  ```js
  import { readFileSync, writeFileSync } from "node:fs";
  const head = JSON.parse(readFileSync(process.env.SCRATCH + "/lock-head.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  for (const [key, entry] of Object.entries(lock.packages)) {
    const old = head.packages?.[key];
    if (!old?.libc || entry.libc || old.version !== entry.version) continue;
    const rebuilt = {};
    for (const k of Object.keys(old)) if (k in entry || k === "libc") rebuilt[k] = k === "libc" ? old.libc : entry[k];
    for (const k of Object.keys(entry)) if (!(k in rebuilt)) rebuilt[k] = entry[k];
    lock.packages[key] = rebuilt;
  }
  writeFileSync(process.env.SCRATCH + "/package-lock.for-commit.json", JSON.stringify(lock, null, 2) + "\n");
  ```
- **zod version.** Keep the zod major that `@anthropic-ai/sdk/helpers/zod` accepts. F4's schema test confirms it.
- Commit, ending the message with the session's attribution line.

**Acceptance**
- Before the commit, `git diff --cached -- package-lock.json | grep '^-' | grep -c libc` prints `0`.
- After the commit, `git diff HEAD~1 HEAD -- package-lock.json | grep '^-' | grep -c libc` prints `0`.
- `git diff -- package-lock.json` still shows only the owner's `libc` deletions, the same as `$SCRATCH/lockfile-preexisting.patch`.
- `node -e "require.resolve('@anthropic-ai/sdk/helpers/zod')"` succeeds, and a bare `npx tsc --noEmit` prints nothing.

**Closes:** D1 (the SDK dependency); spec §A.1 (dependencies); §F.3 Q12 (the lockfile left untouched).

---

### F1 — wine-identity core: draft type, completeness, wording, folding

**Depends on:** —

**OWNS**
- create `src/lib/wine-identity/types.ts`
- create `src/lib/wine-identity/complete.ts`
- create `src/lib/wine-identity/complete.test.ts`
- create `src/lib/wine-identity/describe.ts`
- create `src/lib/wine-identity/describe.test.ts`
- create `src/lib/wine-identity/fold.ts`
- create `src/lib/wine-identity/fold.test.ts`

**Round-1:** Touches no round-1 behaviour; this is a new module. Round 1 made the wine name required in the by-hand form. That rule is replaced later (S3a, S3b), through this module's constant.

**Does**
- **`types.ts`:** spec §B.2, verbatim.
- **`complete.ts` (spec §B.3).**
  - Exports: `COMPLETE_WINE_FIELDS`, `UNIDENTIFIED_WINE_FIELDS`, `VINTAGE_YEAR_MIN = 1900`, `vintageYearMax(now = new Date())` (= `now.getUTCFullYear() + 1`), `emptyDraft()`, `normaliseDraft`, `missingWineFields(draft, { unidentified?, now? })`, `toCompleteWine` and `toUnidentifiedWine`.
  - A field counts as present exactly per the §B.3 table.
- **`normaliseDraft`** (§B.3 bullets):
  - Trims `wineName` and `description`; a blank value becomes null.
  - Shapes the vintage per kind.
  - TAWNY forces `style = "FORTIFIED"`.
  - Keeps alcohol only when it is in (0, 100), rounded to one decimal (`Math.round(x * 10) / 10`).
  - Cleans the blend in three passes:
    1. Drop pending rows whose folded name is empty.
    2. Dedupe: existing rows by id, pending rows by `foldName(name)`; the first wins.
    3. Order with `orderedBlend` from `../wine-blend`. Pass each row as `{ grapeId: String(index), percentage: p == null ? "" : String(p) }` and map the returned ids back to rows. This is the same primary/secondary rule the `catalog_wine_grapes` trigger uses.
- **`missingWineFields`** normalises first. **`toCompleteWine`** builds `primaryGrape = blend[0].grape` and `secondaryGrape = blend[1]?.grape ?? null`.
- **`describe.ts`.**
  - `describeMissing` and `describeUnread` follow the §B.3 wording table.
    - Nouns: producer "a producer", vintage "a vintage", colour "a colour", style "a style", country "a country", region "a region", appellation "an appellation", primaryGrape "a grape".
    - `describeUnread` uses the bare nouns.
    - Lists join as "x, y and z" and "no x, y or z read".
  - `vintageLabel`: YEAR → "2018", NV → "NV", TAWNY → "20 years", incomplete → "".
  - `readDisplay(draft, names)` (spec §A.5):
    - title = `"{producer}, {wineName ?? appellation without its designation} {vintageLabel}"`, leaving out empty parts;
    - meta = `"{appellation} · {region} · {country} · {primaryGrape}"`, leaving out nulls;
    - `newProducer` = the producer is pending.
    - "Appellation without its designation" drops one trailing word whose `foldName` is in `DESIGNATION_SUFFIXES`, and keeps the original casing.
- **`fold.ts`** (§B.5 "Folding helpers").
  - `foldName` is the TypeScript twin of `f_search_norm` (20260829260000:13-20):
    1. lowercase;
    2. map ß→ss, æ→ae, œ→oe, ø→o, đ→d, ł→l;
    3. NFD, and remove combining marks;
    4. remove every character outside `[a-z0-9]`.
  - `foldWords` folds the same way, but turns each run of other characters into one space, trimmed.
  - `normaliseCru(s)` = `foldWords(s)` with `1er cru` → `premier cru`.
  - `stripDesignationSuffix(s)` = `foldWords(s)` minus **one** trailing word from `DESIGNATION_SUFFIXES` = `aoc aop ac doc docg doca dop do igt igp ig ava dac vqa wo gi pdo pgi`.
  - `TITLE_WORDS` as listed in §B.5. `isTitleOnly(name)` is true when `foldWords(name)` is non-empty and every word is in `TITLE_WORDS`.
- **Imports.** Relative only (`../wine-blend`). No `server-only`, no Supabase, no `@/` runtime import.

**Interfaces — produces**
```ts
// types.ts: spec §B.2 verbatim — WineFieldKey, FieldProvenance, ProvenanceKey, RefChoice, VintageKind,
// WineColour, WineStyle, BlendRow, WineIdentityDraft, CompleteVintage, CompleteWine, UnidentifiedWine
// complete.ts: spec §B.3 signatures
export type DisplayNames = { producer: string | null; appellation: string | null; region: string | null; country: string | null; primaryGrape: string | null };
export function describeMissing(fields: readonly WineFieldKey[]): string;
export function describeUnread(fields: readonly WineFieldKey[]): string;
export function vintageLabel(v: WineIdentityDraft["vintage"]): string;
export function readDisplay(draft: WineIdentityDraft, names: DisplayNames): { title: string; meta: string; newProducer: boolean };
export const DESIGNATION_SUFFIXES: readonly string[];
export const TITLE_WORDS: readonly string[];
export function foldName(s: string): string;
export function foldWords(s: string): string;
export function normaliseCru(s: string): string;
export function stripDesignationSuffix(s: string): string;
export function isTitleOnly(name: string): boolean;
```

**Tests (write first)**

`src/lib/wine-identity/complete.test.ts`
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPLETE_WINE_FIELDS, UNIDENTIFIED_WINE_FIELDS, emptyDraft, missingWineFields,
  normaliseDraft, toCompleteWine, toUnidentifiedWine, vintageYearMax,
} from "./complete";
import type { WineIdentityDraft } from "./types";

const NOW = new Date("2026-09-12T12:00:00Z");
const nebbiolo = { kind: "existing", id: "g-neb", name: "Nebbiolo" } as const;
const full = (): WineIdentityDraft => ({
  ...emptyDraft(),
  producer: { kind: "existing", id: "p1", name: "Produttori del Barbaresco" },
  vintage: { kind: "YEAR", year: 2018, tawnyYears: null, read: true },
  colour: "RED", style: "STILL",
  countryId: "c-it", regionId: "r-pie", appellationId: "a-bbr",
  blend: [{ grape: nebbiolo, percentage: 100 }],
});
const COLUMN: Record<(typeof COMPLETE_WINE_FIELDS)[number], string> = {
  producer: "producer_id", vintage: "vintage_kind", colour: "colour", style: "style",
  country: "country_id", region: "region_id", appellation: "appellation_id", primaryGrape: "primary_grape_id",
};
const migration = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

describe("COMPLETE_WINE_FIELDS is pinned to the catalog_wines NOT NULL columns (D2)", () => {
  it("equals 20260829211000's set-not-null columns minus wine_name, plus the three original ones", () => {
    const sql = migration("20260829211000_catalog_wines_strict.sql");
    expect(sql).toContain("-- country_id, primary_grape_id, producer_id are already NOT NULL.");
    const cols = new Set([...sql.matchAll(/alter column\s+(\w+)\s+set not null/g)].map((m) => m[1]));
    cols.delete("wine_name");
    ["country_id", "primary_grape_id", "producer_id"].forEach((c) => cols.add(c));
    expect(new Set(COMPLETE_WINE_FIELDS.map((f) => COLUMN[f]))).toEqual(cols);
  });
  it("keeps wine name optional (D3)", () => {
    expect(migration("20260829215000_wine_name_optional.sql")).toContain("alter column wine_name drop not null");
    expect(Object.values(COLUMN)).not.toContain("wine_name");
  });
});

describe("missingWineFields", () => {
  it.each<[string, (d: WineIdentityDraft) => WineIdentityDraft, string[]]>([
    ["a complete read", (d) => d, []],
    ["no wine name", (d) => ({ ...d, wineName: null }), []],
    ["a pending producer", (d) => ({ ...d, producer: { kind: "pending", name: "Cigliuti" } }), []],
    ["a pending producer that folds to nothing", (d) => ({ ...d, producer: { kind: "pending", name: " – " } }), ["producer"]],
    ["a pending grape", (d) => ({ ...d, blend: [{ grape: { kind: "pending", name: "Pelaverga" }, percentage: null }] }), []],
    ["no style", (d) => ({ ...d, style: null }), ["style"]],
    ["a region but a blank appellation", (d) => ({ ...d, appellationId: "" }), ["appellation"]],
    ["TAWNY without an age", (d) => ({ ...d, vintage: { kind: "TAWNY", year: null, tawnyYears: null, read: false }, style: "FORTIFIED" }), ["vintage"]],
    ["a year two years ahead", (d) => ({ ...d, vintage: { ...d.vintage, year: 2028 } }), ["vintage"]],
    ["next year", (d) => ({ ...d, vintage: { ...d.vintage, year: 2027 } }), []],
    ["1899", (d) => ({ ...d, vintage: { ...d.vintage, year: 1899 } }), ["vintage"]],
    ["NV", (d) => ({ ...d, vintage: { kind: "NV", year: null, tawnyYears: null, read: true } }), []],
    ["no vintage and no grape", (d) => ({ ...d, vintage: { kind: null, year: null, tawnyYears: null, read: false }, blend: [] }), ["vintage", "primaryGrape"]],
  ])("%s", (_l, edit, expected) => expect(missingWineFields(edit(full()), { now: NOW })).toEqual(expected));

  it("lists every field in contract order for an empty draft", () =>
    expect(missingWineFields(emptyDraft(), { now: NOW })).toEqual([...COMPLETE_WINE_FIELDS]));

  it("unidentified mode needs vintage, country, region and grape only (byhand-7)", () => {
    const d: WineIdentityDraft = { ...emptyDraft(), vintage: { kind: "NV", year: null, tawnyYears: null, read: false }, countryId: "c-fr", regionId: "r-bdx", blend: [{ grape: nebbiolo, percentage: null }] };
    expect(missingWineFields(d, { unidentified: true, now: NOW })).toEqual([]);
    expect(missingWineFields(emptyDraft(), { unidentified: true, now: NOW })).toEqual([...UNIDENTIFIED_WINE_FIELDS]);
  });
});

describe("normaliseDraft", () => {
  it("has next UTC year as the max", () => expect(vintageYearMax(NOW)).toBe(2027));
  it("TAWNY forces FORTIFIED and clears the year", () => {
    const d = normaliseDraft({ ...full(), vintage: { kind: "TAWNY", year: 2001, tawnyYears: 20, read: true }, style: "STILL" });
    expect([d.style, d.vintage]).toEqual(["FORTIFIED", { kind: "TAWNY", year: null, tawnyYears: 20, read: true }]);
  });
  it("turns blank text into null", () => {
    const d = normaliseDraft({ ...full(), wineName: "  ", description: "" });
    expect([d.wineName, d.description]).toEqual([null, null]);
  });
  it("dedupes, drops empty pending rows and orders like orderedBlend", () => {
    const merlot = { kind: "existing", id: "g-mer", name: "Merlot" } as const;
    const cab = { kind: "existing", id: "g-cab", name: "Cabernet Sauvignon" } as const;
    const d = normaliseDraft({ ...full(), blend: [
      { grape: merlot, percentage: 20 }, { grape: cab, percentage: 80 }, { grape: merlot, percentage: 5 },
      { grape: { kind: "pending", name: "Petit Verdot" }, percentage: null },
      { grape: { kind: "pending", name: "petit-verdot" }, percentage: null },
      { grape: { kind: "pending", name: "  " }, percentage: null },
    ] });
    expect(d.blend.map((b) => b.grape.name)).toEqual(["Cabernet Sauvignon", "Merlot", "Petit Verdot"]);
  });
  it("keeps alcohol only in (0, 100), one decimal", () => {
    expect(normaliseDraft({ ...full(), alcohol: 13.46 }).alcohol).toBe(13.5);
    expect(normaliseDraft({ ...full(), alcohol: 0 }).alcohol).toBeNull();
    expect(normaliseDraft({ ...full(), alcohol: 100 }).alcohol).toBeNull();
  });
});

describe("toCompleteWine / toUnidentifiedWine", () => {
  it("derives primary and secondary from the ordered blend", () => {
    const r = toCompleteWine({ ...full(), blend: [{ grape: { kind: "existing", id: "g-bar", name: "Barbera" }, percentage: 10 }, { grape: nebbiolo, percentage: 90 }] }, { now: NOW });
    if (!("wine" in r)) throw new Error("expected a wine");
    expect(r.wine.primaryGrape).toEqual(nebbiolo);
    expect(r.wine.secondaryGrape).toMatchObject({ id: "g-bar" });
  });
  it("returns the missing keys instead", () => expect(toCompleteWine({ ...full(), colour: null }, { now: NOW })).toEqual({ missing: ["colour"] }));
  it("an unidentified glass needs no producer, colour, style or appellation", () =>
    expect("wine" in toUnidentifiedWine({ ...full(), producer: null, colour: null, style: null, appellationId: null }, { now: NOW })).toBe(true));
});
```

`src/lib/wine-identity/describe.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { emptyDraft } from "./complete";
import { describeMissing, describeUnread, readDisplay, vintageLabel } from "./describe";
import type { WineIdentityDraft } from "./types";

it.each([
  [[], "", ""],
  [["vintage"], "needs a vintage", "no vintage read"],
  [["vintage", "primaryGrape"], "needs a vintage and a grape", "no vintage or grape read"],
  [["producer", "vintage", "primaryGrape"], "needs a producer, a vintage and a grape", "no producer, vintage or grape read"],
  [["appellation"], "needs an appellation", "no appellation read"],
] as const)("%j", (fields, missing, unread) => {
  expect(describeMissing(fields)).toBe(missing);
  expect(describeUnread(fields)).toBe(unread);
});

it.each([
  [{ kind: "YEAR", year: 2018, tawnyYears: null, read: true }, "2018"],
  [{ kind: "NV", year: null, tawnyYears: null, read: false }, "NV"],
  [{ kind: "TAWNY", year: null, tawnyYears: 20, read: true }, "20 years"],
  [{ kind: null, year: null, tawnyYears: null, read: false }, ""],
] as const)("vintageLabel %j → %s", (v, label) => expect(vintageLabel(v)).toBe(label));

describe("readDisplay (spec A.5)", () => {
  const draft: WineIdentityDraft = { ...emptyDraft(), producer: { kind: "existing", id: "p", name: "Produttori del Barbaresco" }, vintage: { kind: "YEAR", year: 2018, tawnyYears: null, read: true } };
  const names = { producer: "Produttori del Barbaresco", appellation: "Barbaresco DOCG", region: "Piedmont", country: "Italy", primaryGrape: "Nebbiolo" };
  it("uses the appellation without its designation when there is no wine name", () =>
    expect(readDisplay(draft, names)).toEqual({ title: "Produttori del Barbaresco, Barbaresco 2018", meta: "Barbaresco DOCG · Piedmont · Italy · Nebbiolo", newProducer: false }));
  it("prefers the wine name and flags a pending producer", () => {
    const r = readDisplay({ ...draft, producer: { kind: "pending", name: "Cigliuti" }, wineName: "Serraboella" }, { ...names, producer: "Cigliuti" });
    expect([r.title, r.newProducer]).toEqual(["Cigliuti, Serraboella 2018", true]);
  });
  it("leaves out parts with no value", () =>
    expect(readDisplay(emptyDraft(), { producer: null, appellation: null, region: "Bourgogne", country: "France", primaryGrape: null })).toEqual({ title: "", meta: "Bourgogne · France", newProducer: false }));
});
```

`src/lib/wine-identity/fold.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { foldName, foldWords, isTitleOnly, normaliseCru, stripDesignationSuffix } from "./fold";

it.each([
  ["Château La Fleur-Pétrus", "chateaulafleurpetrus"],
  ["Clos du Mont-Olivet", "closdumontolivet"],
  ["Bourgogne Aligoté", "bourgognealigote"],
  ["Weißburgunder", "weissburgunder"],
  ["  ", ""],
])("foldName(%s) mirrors f_search_norm → %s", (s, out) => expect(foldName(s)).toBe(out));

it("foldWords keeps single spaces", () => expect(foldWords("Saint-Émilion  Grand Cru AOC")).toBe("saint emilion grand cru aoc"));
it("normaliseCru rewrites 1er cru", () => expect(normaliseCru("Puligny-Montrachet 1er Cru")).toBe("puligny montrachet premier cru"));

describe("stripDesignationSuffix removes one geographic designation word only", () => {
  it.each([
    ["Barbaresco DOCG", "barbaresco"],
    ["Saint-Émilion Grand Cru AOC", "saint emilion grand cru"],
    ["Rioja DOCa", "rioja"],
    ["Puglia IGP", "puglia"],
    ["Mosel Qualitätswein", "mosel qualitatswein"],
    ["Vin de France", "vin de france"],
  ])("%s → %s", (s, out) => expect(stripDesignationSuffix(s)).toBe(out));
});

it.each([["Domaine", true], ["Bodegas", true], ["Château", true], ["Château Palmer", false], ["", false]] as const)(
  "isTitleOnly(%s) = %s", (n, v) => expect(isTitleOnly(n)).toBe(v));
```

**Steps**
- [ ] Write the three test files. Run `npx vitest run src/lib/wine-identity`; it fails with "Cannot find module".
- [ ] Implement `types.ts`, `fold.ts`, `complete.ts` and `describe.ts`.
- [ ] Run `npx vitest run src/lib/wine-identity`; it passes.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- `npx vitest run src/lib/wine-identity` is green.
- `rg -n 'from "@/|server-only|supabase' src/lib/wine-identity/types.ts src/lib/wine-identity/complete.ts src/lib/wine-identity/describe.ts src/lib/wine-identity/fold.ts` prints nothing.
- A bare `npx tsc --noEmit` prints nothing.

**Closes:** D2 (the definition), D3 (the constant and its pin), RC6 (the single definition), byhand-3 (the rule).

---

### F2 — Migrations `20260912100100_label_reads` + `20260912101000_producer_folded_lookup`, types

**Depends on:** F1 (chain)

**OWNS**
- create `supabase/migrations/20260912100100_label_reads.sql`
- create `supabase/migrations/20260912101000_producer_folded_lookup.sql`
- modify `src/lib/supabase/database.types.ts`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **`20260912100100`.** The spec §E.1 SQL verbatim, then one `do` block that asserts:
  - the table exists and `relrowsecurity` is true;
  - exactly three policies exist on `label_reads`, and none has `polcmd` UPDATE or ALL;
  - no column has type `bytea`;
  - the nine columns exist with the nullability shown in §E.1, together with the `outcome` check and `label_reads_read_matches_outcome`;
  - behaviourally, with the spec §E.0 synthetic-rollback pattern: a row inserted as profile A is invisible to profile B, and B's `update` changes nothing.
- **`20260912101000`.** The spec §E.2 SQL verbatim. Both functions are SECURITY **INVOKER** with `set search_path = public`; do not assert `prosecdef` for them. The `do` block:
  - asserts both functions with `to_regprocedure('public.find_producer_by_folded_name(text,uuid)')` and `…find_or_create_producer(text,uuid)`;
  - asserts that the index `producers_search_norm_eq_idx` exists;
  - picks one existing producer and asserts that `find_producer_by_folded_name(upper(name))` returns a row whose `f_search_norm(name)` equals the original's;
  - asserts that `find_or_create_producer('  ')` raises, inside a nested `begin … exception when others then … end`;
  - `raise notice`s the count of existing folded collisions (`group by f_search_norm(name) having count(*) > 1`). It merges nothing.
- **`database.types.ts`.** Only the §E.8 parts for these two files:
  - the `label_reads` table (Row, Insert, Update, `Relationships: []`), with `outcome` and a nullable `read`;
  - the function entries `find_producer_by_folded_name` and `find_or_create_producer`, typed `p_region_id?: string | null`.

**Interfaces — produces**
- RPC `find_producer_by_folded_name(p_name, p_region_id?) → uuid | null`.
- RPC `find_or_create_producer(p_name, p_region_id?) → uuid`.
- Table `label_reads`.

**Tests:** None in vitest; this is SQL. The assertion block is the test: write it first and watch it fail.

**Steps**
- [ ] Copy **only** the `do` assertion block into the scratchpad as `20260912100100_label_reads.sql`. Run `node scripts/scratch-apply.mjs --file "<scratchpad>/20260912100100_label_reads.sql" --mode dry`. It prints `FAILED 20260912100100: <your assertion message>`.
- [ ] Write the real file with the DDL above the block. Run `node scripts/scratch-apply.mjs --file supabase/migrations/20260912100100_label_reads.sql --mode dry`. It prints `DRY-OK 20260912100100 label_reads`.
- [ ] Repeat the red and green runs for `20260912101000_producer_folded_lookup.sql`, ending at `DRY-OK 20260912101000 producer_folded_lookup`.
- [ ] Edit `database.types.ts`. A bare `npx tsc --noEmit` prints nothing.

**Acceptance**
- Both `DRY-OK` lines are pasted into the report.
- `grep -n "label_reads\|find_or_create_producer\|find_producer_by_folded_name" src/lib/supabase/database.types.ts` shows the new entries.
- tsc prints nothing.

**Closes:** D1 (the retention table), D6 and D8 (folded producer SQL), byhand-1 (SQL side), scan-3 (SQL side), spec §E.1, §E.2, §E.8 (part).

---

### F3 — Migrations `20260912102000_wine_identity_drafts` + `20260912103000_cellar_pour_intent`, types, incomplete-glass helpers

**Depends on:** F2

**OWNS**
- create `supabase/migrations/20260912102000_wine_identity_drafts.sql`
- create `supabase/migrations/20260912103000_cellar_pour_intent.sql`
- modify `src/lib/supabase/database.types.ts`
- create `src/lib/wine-identity/incomplete.ts`
- create `src/lib/wine-identity/incomplete.test.ts`
- create `src/lib/wine-identity/server/incomplete-glasses.ts`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **`20260912102000`.** The spec §E.3 SQL verbatim, with the §E.3 assertion list:
  - `wines.added_via` exists, with its check;
  - the table exists with RLS on and exactly four policies;
  - no policy qual mentions `tasting_participants` or `from wines`;
  - both triggers exist;
  - `is_wine_adder(uuid)`, `tasting_incomplete_glasses(uuid)` and both trigger functions are SECURITY DEFINER with `search_path=public`;
  - no `wines` row has both a draft and an answer key;
  - the §E.3 behavioural checks, with the §E.0 synthetic-rollback pattern: drafts are owner-only, `tasting_incomplete_glasses` returns keys only, and a non-adder's insert is refused.
  - The `missing` check is `cardinality(missing) > 0` only, and the no-draft fallback is `'{}'::text[]` (spec §E.3). No field key is written in SQL.
- **`20260912103000`.** The spec §E.4 SQL verbatim: the owner-only `wine_pour_intents` table and the two functions. Nothing is added to `wines` here. Its assertions:
  - the table exists with RLS on and exactly three policies, none of them UPDATE or ALL, and no policy qual mentions `tasting_participants` or `from wines`;
  - the foreign keys: `wine_id` with `confdeltype = 'c'`, `cellar_lot_id` and `cellar_consumption_id` with `'n'`; and `consume_on_start` is `not null default false`;
  - `wines` has no `cellar_lot_id`, `consume_on_start` or `cellar_consumption_id` column;
  - both functions exist by signature, are SECURITY DEFINER with `search_path=public`, and are executable by `authenticated`;
  - the §E.4 behavioural checks: the first draw-down pours only the adder's own lot, a second draws nothing, and the other participant sees no intent.
- **Dry runs.**
  - 102000 runs on its own.
  - 103000 calls `is_wine_adder`, so it needs 102000. Create a scratchpad file named exactly `20260912103000_cellar_pour_intent.sql` containing 102000's SQL followed by 103000's SQL, and dry-run that path. Everything rolls back, and 103000 has been validated against 102000.
  - M2 re-runs a standalone dry run once 102000 is live.
- **`database.types.ts`** (spec §E.8):
  - `wines` Row/Insert gain `added_via` only;
  - add the `wine_identity_drafts` and `wine_pour_intents` tables;
  - add the functions `is_wine_adder`, `tasting_incomplete_glasses`, `draw_down_flight_cellar_lots` and `pour_cellar_lot_into_glass`.
- **`incomplete.ts`.** Pure. The single source of the incomplete-glass wording (spec §B.3 "Where the phrases appear", §C.7 step 2, §C.8):
  ```ts
  export type IncompleteGlass = { wineId: string; glass: number; missing: WineFieldKey[] };
  export function toIncompleteGlasses(rows: { wine_id: string; glass: number; missing: string[] }[]): IncompleteGlass[]; // unknown keys dropped; empty list → every COMPLETE_WINE_FIELDS key
  export function startRefusal(rows: IncompleteGlass[]): string | null;            // "Glass 3 needs a vintage · Glass 5 needs a vintage and a grape"
  export function revealRefusal(rows: IncompleteGlass[], wineId: string): string | null; // "Finish glass 3's details before revealing"
  export function flightRowNeeds(missing: readonly WineFieldKey[]): string;        // "needs a vintage — tap Edit to finish"
  export function pendingAnswerNotice(glass: number): string;                       // "Your answer shows once glass 3's details are finished."
  ```
- **`server/incomplete-glasses.ts`** (`import "server-only"`). `listIncompleteGlasses(supabase, tastingId)` calls `rpc("tasting_incomplete_glasses", { p_tasting_id })` and passes the rows to `toIncompleteGlasses`. It throws on an RPC error.

**Interfaces — produces**
- The four RPCs and their types.
- `IncompleteGlass`, `toIncompleteGlasses`, `startRefusal`, `revealRefusal`, `flightRowNeeds`, `pendingAnswerNotice`.
- `listIncompleteGlasses(supabase: SupabaseClient<Database>, tastingId: string): Promise<IncompleteGlass[]>`.

**Tests (write first)** — `src/lib/wine-identity/incomplete.test.ts`
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPLETE_WINE_FIELDS } from "./complete";
import { flightRowNeeds, pendingAnswerNotice, revealRefusal, startRefusal, toIncompleteGlasses } from "./incomplete";

const rows = toIncompleteGlasses([
  { wine_id: "w3", glass: 3, missing: ["vintage"] },
  { wine_id: "w5", glass: 5, missing: ["vintage", "primaryGrape", "bogus"] },
]);

describe("incomplete-glass wording (D7)", () => {
  it("drops unknown keys", () => expect(rows[1].missing).toEqual(["vintage", "primaryGrape"]));
  it("treats an empty key list as every field", () =>
    expect(toIncompleteGlasses([{ wine_id: "w1", glass: 1, missing: [] }])[0].missing).toEqual([...COMPLETE_WINE_FIELDS]));
  it("refuses Start glass by glass", () => {
    expect(startRefusal(rows)).toBe("Glass 3 needs a vintage · Glass 5 needs a vintage and a grape");
    expect(startRefusal([])).toBeNull();
  });
  it("refuses a reveal only for that glass", () => {
    expect(revealRefusal(rows, "w3")).toBe("Finish glass 3's details before revealing");
    expect(revealRefusal(rows, "w9")).toBeNull();
  });
  it("words the flight row and the locked-in notice", () => {
    expect(flightRowNeeds(["vintage"])).toBe("needs a vintage — tap Edit to finish");
    expect(pendingAnswerNotice(3)).toBe("Your answer shows once glass 3's details are finished.");
  });
});

it("SQL names no field key, so flipping D3 changes no SQL (spec §B.3, §E.3)", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20260912102000_wine_identity_drafts.sql"), "utf8");
  for (const key of COMPLETE_WINE_FIELDS) expect(sql).not.toContain(`'${key}'`);
});
```

**Steps**
- [ ] Red-run the assertion blocks, as in F2: 102000 alone, then the combined scratch file for 103000.
- [ ] Write both migrations. Each dry run prints `DRY-OK 20260912102000 wine_identity_drafts` and `DRY-OK 20260912103000 cellar_pour_intent` (the combined file).
- [ ] Write `incomplete.test.ts` and watch it fail. Implement `incomplete.ts` and `server/incomplete-glasses.ts`; the tests pass.
- [ ] Edit `database.types.ts`. Run the checks in Working Rules 4 and 6.

**Acceptance**
- Both `DRY-OK` lines: 102000 alone, 103000 combined.
- `npx vitest run src/lib/wine-identity/incomplete.test.ts` is green.
- A bare `npx tsc --noEmit` prints nothing.

**Closes:** D7 (schema and wording), D11 (schema), D13 (`added_via`), spec §2.1 row 11, §E.3, §E.4, §E.8 (rest).

---
### F4 — The LabelRead schema, fixtures

**Depends on:** F3

**OWNS**
- create `src/lib/label-scan/label-read-schema.ts`
- create `src/lib/label-scan/label-read-schema.test.ts`
- create in `src/lib/label-scan/__fixtures__/`:
  - `produttori-barbaresco-2018.json`
  - `cigliuti-barbaresco-no-vintage.json`
  - `vin-de-france.json`
  - `saint-emilion-grand-cru.json`
  - `tawny-port-20.json`
  - `bourgogne-aligote.json`
  - `rioja-spain.json`
  - `domaine-leflaive-puligny.json`
  - `not-a-label.json`

**Round-1:** Touches no round-1 behaviour.

**Does**
- Load the `claude-api` skill first (TypeScript → Structured Outputs, `zodOutputFormat`).
- **Dependencies.** P0 installed `@anthropic-ai/sdk` and `zod` before any agent started. Do not run `npm install`. Keep the zod major that `@anthropic-ai/sdk/helpers/zod` accepts; the last schema test below checks this, with no network.
- **`label-read-schema.ts`.**
  - `LABEL_READ_PROMPT` and `LabelReadSchema`: spec §A.3, verbatim.
  - Imports only `zod`, plus `foldName` from `../wine-identity/fold`.
  - `coerceLabelRead(raw: unknown): LabelRead` implements §A.3 rules 1–8. It reads fields leniently with `typeof` checks, not with `LabelReadSchema.parse`, so an unknown enum value becomes null or a default rather than throwing.
  - Grape duplicates are dropped by `foldName`; the first one wins.
- **Fixtures.** Hand-written, in `LabelRead` shape with every key present, per the §A.6 table. They are not API output. `produttori-barbaresco-2018.json` is the template:
  ```json
  {
    "isWineLabel": true,
    "producer": "Produttori del Barbaresco",
    "wineName": "Barbaresco",
    "appellation": "Barbaresco DOCG",
    "noGeographicIndication": false,
    "region": "Piedmont",
    "country": "Italy",
    "designation": null,
    "vintageKind": "YEAR",
    "vintageYear": 2018,
    "vintageTawnyYears": null,
    "vintageRead": true,
    "colour": "RED",
    "style": "STILL",
    "grapes": [{ "name": "Nebbiolo", "percentage": 100 }],
    "alcoholPercent": 14,
    "description": "Cooperative winery in Barbaresco working Nebbiolo from its members' vineyards.",
    "confidence": "high",
    "rawText": "PRODUTTORI DEL BARBARESCO · BARBARESCO · DENOMINAZIONE DI ORIGINE CONTROLLATA E GARANTITA · 2018 · 14% vol"
  }
  ```
  The other eight follow the §A.6 "The read" column:

  | File | Values |
  |---|---|
  | `cigliuti-barbaresco-no-vintage.json` | `producer "Cigliuti"`, `appellation "Barbaresco DOCG"`, region Piedmont, Italy, `vintageKind "YEAR"`, `vintageYear null`, `vintageRead false`, RED, STILL, Nebbiolo |
  | `vin-de-france.json` | `noGeographicIndication true`, `appellation null`, `region null`, France, RED, STILL, Grenache |
  | `saint-emilion-grand-cru.json` | `appellation "Saint-Émilion Grand Cru AOC"`, Bordeaux, France, 2016 read, RED, STILL, Merlot 70 / Cabernet Franc 30 |
  | `tawny-port-20.json` | `vintageKind "TAWNY"`, `vintageTawnyYears 20`, `vintageRead true`, `style "FORTIFIED"`, RED, Portugal, Douro, `appellation "Porto DOC"`, Touriga Nacional |
  | `bourgogne-aligote.json` | `appellation "Bourgogne Aligoté AOC"`, Bourgogne, France, WHITE, STILL, Aligoté, 2021 read |
  | `rioja-spain.json` | `appellation "Rioja DOCa"`, `region "La Rioja"`, Spain, 2019 read, RED, STILL, Tempranillo |
  | `domaine-leflaive-puligny.json` | `producer "Domaine Leflaive"`, `appellation "Puligny-Montrachet AOC"`, Bourgogne, France, 2019 read, WHITE, STILL, Chardonnay |
  | `not-a-label.json` | `isWineLabel false`, every identity field null, `grapes []`, `confidence "low"`, `rawText "A photo of a kitchen counter, not a wine label."` |

**Interfaces — produces**
- `LABEL_READ_PROMPT`, `LabelReadSchema`, `type LabelRead`, `coerceLabelRead`.
- The fixture directory `src/lib/label-scan/__fixtures__/`.

**Tests (write first)** — `src/lib/label-scan/label-read-schema.test.ts`
```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LabelReadSchema, coerceLabelRead } from "./label-read-schema";

const dir = path.join(process.cwd(), "src/lib/label-scan/__fixtures__");
const fixtures = readdirSync(dir).filter((f) => f.endsWith(".json"));
const base = () => JSON.parse(readFileSync(path.join(dir, "produttori-barbaresco-2018.json"), "utf8"));

it("commits the nine fixtures", () => expect(fixtures).toHaveLength(9));
it.each(fixtures)("%s satisfies LabelReadSchema", (f) =>
  expect(LabelReadSchema.safeParse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))).success).toBe(true));
it("the SDK zod helper accepts the schema (no network)", () => expect(() => zodOutputFormat(LabelReadSchema)).not.toThrow());

describe("coerceLabelRead (spec A.3 rules 1–8)", () => {
  it("1 trims, blanks become null, rawText ≤ 2000", () => {
    const r = coerceLabelRead({ ...base(), wineName: "  ", producer: " Produttori del Barbaresco ", rawText: "x".repeat(3000) });
    expect([r.wineName, r.producer, r.rawText.length]).toEqual([null, "Produttori del Barbaresco", 2000]);
  });
  it("2 not a label clears the identity", () =>
    expect(coerceLabelRead({ ...base(), isWineLabel: false })).toMatchObject({ producer: null, appellation: null, country: null, grapes: [], noGeographicIndication: false, vintageRead: false, confidence: "low" }));
  it("3 year and tawny ranges", () => {
    expect(coerceLabelRead({ ...base(), vintageYear: 1800 }).vintageYear).toBeNull();
    expect(coerceLabelRead({ ...base(), vintageKind: "YEAR", vintageTawnyYears: 20 }).vintageTawnyYears).toBeNull();
  });
  it("4 an incomplete vintage shape is never read", () =>
    expect(coerceLabelRead({ ...base(), vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: null, vintageRead: true }).vintageRead).toBe(false));
  it("5 no geographic indication nulls the appellation", () =>
    expect(coerceLabelRead({ ...base(), noGeographicIndication: true }).appellation).toBeNull());
  it("6 grapes: empty names, bad percentages, folded duplicates", () =>
    expect(coerceLabelRead({ ...base(), grapes: [{ name: "Nebbiolo", percentage: 150 }, { name: "nebbiolo", percentage: 20 }, { name: " ", percentage: 10 }] }).grapes)
      .toEqual([{ name: "Nebbiolo", percentage: null }]));
  it("7 alcohol in (0, 100), one decimal", () => {
    expect(coerceLabelRead({ ...base(), alcoholPercent: 14.04 }).alcoholPercent).toBe(14);
    expect(coerceLabelRead({ ...base(), alcoholPercent: 0 }).alcoholPercent).toBeNull();
  });
  it("8 out-of-schema values", () =>
    expect(coerceLabelRead({ ...base(), colour: "PURPLE", style: "FIZZY", confidence: "sure", vintageKind: "BOTTLE", vintageYear: 2018 }))
      .toMatchObject({ colour: null, style: null, confidence: "low", vintageKind: "YEAR" }));
});
```

**Steps**
- [ ] Write the tests and watch them fail.
- [ ] Write the schema, `coerceLabelRead` and the nine fixtures. The tests pass.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- `npx vitest run src/lib/label-scan` is green.
- `node -e "require.resolve('@anthropic-ai/sdk/helpers/zod')"` succeeds.
- A bare `npx tsc --noEmit` prints nothing.

**Closes:**
- D1 (the reader's schema: tawny age, the no-GI flag, the official-name instruction); spec §A.1, §A.3, §2.1 row 10.
- **RC1, RC2 and RC9 are superseded by D1.** The structured schema carries appellation, country, colour and style as fields.

---

### F5 — The read resolver, region synonyms, the reference snapshot

**Depends on:** F4

**OWNS**
- create `src/lib/wine-identity/resolve.ts`
- create `src/lib/wine-identity/resolve.test.ts`
- create `src/lib/wine-identity/__fixtures__/reference-snapshot.json`
- create `src/lib/wine-identity/__fixtures__/snapshot-lookup.ts`
- modify `src/lib/label-scan/region-canonical.ts`
- create `.superpowers/export-reference-snapshot.mjs` (gitignored; never committed)

**Round-1:** Keeps round 1's "no producer guessing". The resolver never fills an appellation or a grape from the producer (§B.5 step 7).

**Does**
- **`RefLookup` and `resolveLabelRead(read, lookup, { imageUrl })`** (spec §B.5). The `RefLookup` interface is verbatim. Implement steps 1–12 exactly:
  - **Country.** Folded equality after `canonicalCountryName`. A miss stays null.
  - **No geographic indication.** When the no-GI flag is set, use `noGeographicIndication` — Vin de France in France, the None pair elsewhere (spec §B.5) — and skip steps 3–5.
  - **Region candidate.** Folded equality within the country only.
  - **Appellation.**
    - Search on `base = stripDesignationSuffix(normaliseCru(read.appellation))`, in `foldWords` form. The lookup sends `appellationSearchPattern(base)`, the words joined with `%`.
    - Export `appellationSearchPattern` and `NATIONAL_TIER_REGION_NAMES = ["Vin de France"]` from `resolve.ts`, for F7's adapter and the snapshot lookup.
    - When exactly 25 hits come back and there is a region candidate, search again scoped to that region.
    - Keep the agreeing rows: folded, stripped, cru-normalised names are equal.
    - Filter those by country, then by region, then prefer an equivalent suffix (aoc≡aop, igt≡igp, doc≡dop).
    - Exactly one row sets appellation, region and country. Otherwise the appellation stays null. **There is no first-hit fallback.**
    - The only retry strips a trailing "grand cru" or "premier cru" once.
  - **Region from the read.** A candidate only. **Never** fall back to the region's self-named appellation.
  - **Producer.** Unless `isTitleOnly`, call `producerByFoldedName`: a hit is `existing`, otherwise `pending`.
  - **Region from the producer link.** Only when the region is still empty and the link's country is consistent. Never set the appellation or a grape from it.
  - **Designation.** Folded equality, preferring the draft's country, then a designation with no country.
  - **Grapes.** `canonicalGrapeName`, then folded equality: `existing`, otherwise `pending` with the canonical name. Keep the percentages.
  - **Vintage.** Only when `vintageRead`, with provenance `label`.
  - **The rest.** Colour, style, wine name, alcohol and description come from the read. Return `normaliseDraft(draft)`.
- **`region-canonical.ts`.** Burgundy, Piedmont and Tuscany are already mapped (region-canonical.ts:34-37). Add the §B.5 new synonyms. The map's keys are only lowercased, so add each with and without its accent:
  - France: "southern rhône", "southern rhone", "northern rhône", "northern rhone" → "Rhône";
  - Portugal: "douro valley" → "Douro";
  - Germany: "mosel-saar-ruwer" → "Mosel".

  Add a synonym **only** if its target name exists in the snapshot. List any you skipped in the report, and drop their cases from the synonym test.
- **`.superpowers/export-reference-snapshot.mjs`.** A read-only export.
  - It connects through `pg` with `pgConfig()` from `scripts/wine-map-tiles/lib.mjs` (DB_PASSWORD comes from `.env.local`).
  - It sorts every list by id. **No Anthropic call.**
  - It exports the §G.2 content:

    | Key | Rows |
    |---|---|
    | `countries` | all |
    | `regions` | France, Italy, Spain, Portugal, Argentina, Germany |
    | `none` | the per-country None region and appellation (20260829263700). France's "Vin de France" region and appellation arrive through `regions` and `appellations`. |
    | `appellations` | every appellation whose `f_search_norm(name)` contains `barbaresco`, `saintemilion`, `bourgogne`, `rioja`, `puligny`, `porto` or `vindefrance` |
    | `grapes` | all |
    | `type_designations` | the active ones |
    | `producers` | Produttori del Barbaresco, Cigliuti, and one `Domaine …` producer with a catalog wine that is not Domaine Leflaive |

  Its shape:
  ```ts
  export type ReferenceSnapshot = {
    countries: { id: string; name: string }[];
    regions: { id: string; name: string; country_id: string }[];
    appellations: { id: string; name: string; region_id: string }[];
    none: { country_id: string; region_id: string; appellation_id: string }[];
    producers: { id: string; name: string; region_id: string | null }[];
    grapes: { id: string; name: string }[];
    type_designations: { id: string; name: string; country_id: string | null }[];
  };
  ```
- **`snapshot-lookup.ts`.** A test helper, not a `.test.ts` file, with relative imports only. It exports `ReferenceSnapshot`, `loadReferenceSnapshot()` (fs + `process.cwd()`) and `snapshotLookup(s): RefLookup`.
  - `searchAppellations(words, regionId?)` mirrors `search_appellations` exactly.
    - It builds `"%" + appellationSearchPattern(words) + "%"`, reads `%` as "any run of characters" and `_` as "any one character", and matches that case-insensitively against each name with its accents folded and its punctuation kept.
    - It then filters by region, orders by name and takes 25.
    - Never fold both sides with `foldName`: that hides the hyphen defect the real RPC has (spec §B.5, §G.2).
  - `producerByFoldedName` mirrors `find_producer_by_folded_name`: folded equality; ties go to the given region, then to any region, then by name, then by id.
  - `noGeographicIndication` returns the country's `NATIONAL_TIER_REGION_NAMES` region and its same-named appellation when the snapshot has them, otherwise the `none` pair.

**Interfaces — produces**
```ts
export interface RefLookup { /* spec §B.5 verbatim */ }
export function resolveLabelRead(read: LabelRead, lookup: RefLookup, opts: { imageUrl: string | null }): Promise<WineIdentityDraft>;
export function appellationSearchPattern(words: string): string;   // "saint emilion grand cru" → "saint%emilion%grand%cru"
export const NATIONAL_TIER_REGION_NAMES: readonly string[];        // ["Vin de France"]
```

**Tests (write first)** — `src/lib/wine-identity/resolve.test.ts`
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { coerceLabelRead } from "../label-scan/label-read-schema";
import { missingWineFields } from "./complete";
import { foldName, stripDesignationSuffix } from "./fold";
import { resolveLabelRead } from "./resolve";
import { loadReferenceSnapshot, snapshotLookup, type ReferenceSnapshot } from "./__fixtures__/snapshot-lookup";

const NOW = new Date("2026-09-12T12:00:00Z");
let snap: ReferenceSnapshot;
beforeAll(() => { snap = loadReferenceSnapshot(); });
const fixture = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "src/lib/label-scan/__fixtures__", f), "utf8"));
const resolve = (f: string, patch: Record<string, unknown> = {}, s?: ReferenceSnapshot) =>
  resolveLabelRead(coerceLabelRead({ ...fixture(f), ...patch }), snapshotLookup(s ?? snap), { imageUrl: null });
const stripped = (name: string) => foldName(stripDesignationSuffix(name));
const country = (folded: string) => snap.countries.find((c) => foldName(c.name) === folded)!;
const appName = (id: string | null) => snap.appellations.find((a) => a.id === id)?.name ?? "";

describe("resolveLabelRead against the reference snapshot (spec G.2)", () => {
  it("produttori-barbaresco-2018 is complete", async () => {
    const d = await resolve("produttori-barbaresco-2018.json");
    expect(stripped(appName(d.appellationId))).toBe("barbaresco");
    expect(d.countryId).toBe(country("italy").id);
    expect(d.producer).toMatchObject({ kind: "existing" });
    expect(d.blend[0].grape).toMatchObject({ kind: "existing", name: "Nebbiolo" });
    expect(d.vintage).toEqual({ kind: "YEAR", year: 2018, tawnyYears: null, read: true });
    expect(missingWineFields(d, { now: NOW })).toEqual([]);
  });
  it("cigliuti without a vintage misses only the vintage", async () => {
    const d = await resolve("cigliuti-barbaresco-no-vintage.json");
    expect(d.vintage).toEqual({ kind: null, year: null, tawnyYears: null, read: false });
    expect(missingWineFields(d, { now: NOW })).toEqual(["vintage"]);
  });
  it("vin-de-france takes France's national tier, Vin de France, not None (spec §B.5)", async () => {
    const d = await resolve("vin-de-france.json");
    const vdfRegion = snap.regions.find((r) => r.country_id === country("france").id && foldName(r.name) === "vindefrance")!;
    const vdfApp = snap.appellations.find((a) => a.region_id === vdfRegion.id && foldName(a.name) === "vindefrance")!;
    expect(d).toMatchObject({ countryId: country("france").id, regionId: vdfRegion.id, appellationId: vdfApp.id });
  });
  it.each([
    ["France", "Southern Rhône", "rhone"], ["France", "Northern Rhone", "rhone"], ["Portugal", "Douro Valley", "douro"],
    ["Germany", "Mosel-Saar-Ruwer", "mosel"], ["France", "Burgundy", "bourgogne"], ["Italy", "Piedmont", "piemonte"], ["Italy", "Tuscany", "toscana"],
  ] as const)("%s · %s resolves to its stored region (RC3)", async (countryName, region, target) => {
    const d = await resolve("produttori-barbaresco-2018.json", { country: countryName, region, appellation: null, producer: null });
    const stored = snap.regions.find((r) => r.id === d.regionId);
    expect([stored?.country_id, stored && foldName(stored.name)]).toEqual([country(foldName(countryName)).id, target]);
  });
  it("keeps Grand Cru", async () =>
    expect(stripped(appName((await resolve("saint-emilion-grand-cru.json")).appellationId))).toBe("saintemiliongrandcru"));
  it("tawny carries its age and is FORTIFIED", async () => {
    const d = await resolve("tawny-port-20.json");
    expect([d.vintage.kind, d.vintage.tawnyYears, d.style]).toEqual(["TAWNY", 20, "FORTIFIED"]);
  });
  it("Bourgogne Aligoté finds the LWIN spelling", async () =>
    expect(stripped(appName((await resolve("bourgogne-aligote.json")).appellationId))).toBe("bourgognealigote"));
  it("Rioja resolves in Spain", async () => expect((await resolve("rioja-spain.json")).countryId).toBe(country("spain").id));
  it("Domaine Leflaive stays pending; a bare title word never looks anything up", async () => {
    expect((await resolve("domaine-leflaive-puligny.json")).producer).toEqual({ kind: "pending", name: "Domaine Leflaive" });
    expect((await resolve("domaine-leflaive-puligny.json", { producer: "Domaine" })).producer).toEqual({ kind: "pending", name: "Domaine" });
  });
  it("a region-only read sets the region and leaves the appellation missing", async () => {
    const d = await resolve("produttori-barbaresco-2018.json", { appellation: null, region: "Piedmont" });
    expect(d.regionId).not.toBeNull();
    expect(d.appellationId).toBeNull();
    expect(missingWineFields(d, { now: NOW })).toContain("appellation");
  });
});

describe("resolver rules on synthetic snapshots", () => {
  const synthetic = (): ReferenceSnapshot => ({
    countries: [{ id: "fr", name: "France" }],
    regions: [{ id: "rh", name: "Rhône", country_id: "fr" }, { id: "bg", name: "Bourgogne", country_id: "fr" }],
    appellations: [
      ...Array.from({ length: 26 }, (_, i) => ({ id: `x${i}`, name: `Côtes du Rhône Villages ${i} AOC`, region_id: "rh" })),
      { id: "a1", name: "Côtes du Rhône AOC", region_id: "rh" }, { id: "a2", name: "Côtes du Rhône AOP", region_id: "rh" },
    ],
    none: [], grapes: [{ id: "g", name: "Grenache" }], type_designations: [],
    producers: [{ id: "p", name: "Domaine Test", region_id: "bg" }],
  });
  it("a crowded query retries in the region and picks nothing when two rows agree", async () => {
    const d = await resolve("vin-de-france.json", { noGeographicIndication: false, appellation: "Côtes du Rhône AOC", region: "Rhône", producer: null }, synthetic());
    expect(d.appellationId).toBeNull();
  });
  it("a producer region link fills the region, never the appellation or a grape", async () => {
    const d = await resolve("vin-de-france.json", { noGeographicIndication: false, appellation: null, region: null, producer: "Domaine Test", grapes: [] }, synthetic());
    expect(d).toMatchObject({ regionId: "bg", appellationId: null, blend: [] });
    expect(d.provenance.region).toBe("producer-region");
  });
});

describe("punctuation, no-GI, cross-country links, designations, grapes (spec §B.5, §G.2)", () => {
  const fr = (): ReferenceSnapshot => ({
    countries: [{ id: "fr", name: "France" }, { id: "it", name: "Italy" }],
    regions: [
      { id: "bg", name: "Bourgogne", country_id: "fr" }, { id: "pv", name: "Provence", country_id: "fr" },
      { id: "vdf", name: "Vin de France", country_id: "fr" }, { id: "nfr", name: "None", country_id: "fr" },
      { id: "pie", name: "Piemonte", country_id: "it" },
    ],
    appellations: [
      { id: "pm", name: "Puligny-Montrachet AOC", region_id: "bg" },
      { id: "cap", name: "Coteaux d'Aix-en-Provence AOC", region_id: "pv" },
      { id: "vdfa", name: "Vin de France", region_id: "vdf" }, { id: "nfra", name: "None", region_id: "nfr" },
    ],
    none: [{ country_id: "fr", region_id: "nfr", appellation_id: "nfra" }],
    producers: [{ id: "ti", name: "Tenuta Italiana", region_id: "pie" }],
    grapes: [{ id: "syr", name: "Syrah" }, { id: "pn", name: "Pinot Noir" }],
    type_designations: [{ id: "gc-any", name: "Grand Cru", country_id: null }, { id: "gc-fr", name: "Grand Cru", country_id: "fr" }],
  });
  const plain = { noGeographicIndication: false, appellation: null, region: null, producer: null, designation: null, grapes: [] };
  it("a trailing Premier Cru falls back to the hyphenated base appellation", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, appellation: "Puligny-Montrachet Premier Cru AOC", region: "Bourgogne" }, fr());
    expect([d.appellationId, d.regionId]).toEqual(["pm", "bg"]);
  });
  it("an apostrophe and hyphens still match through the search pattern", async () =>
    expect((await resolve("vin-de-france.json", { ...plain, appellation: "Coteaux d'Aix-en-Provence AOC" }, fr())).appellationId).toBe("cap"));
  it("L'Envolee: no-GI France resolves to Vin de France, by flag and by text", async () => {
    for (const patch of [{ noGeographicIndication: true }, { appellation: "Vin de France", region: "Vin de France" }]) {
      const d = await resolve("vin-de-france.json", { ...plain, producer: "L'Envolee", grapes: [{ name: "Pinot Noir", percentage: null }], ...patch }, fr());
      expect([d.regionId, d.appellationId]).toEqual(["vdf", "vdfa"]);
    }
  });
  it("a producer linked to another country never sets the region (RC10)", async () => {
    const d = await resolve("vin-de-france.json", { ...plain, producer: "Tenuta Italiana" }, fr());
    expect([d.countryId, d.regionId, d.producer]).toEqual(["fr", null, { kind: "existing", id: "ti", name: "Tenuta Italiana" }]);
  });
  it("a designation prefers the draft's country", async () =>
    expect((await resolve("vin-de-france.json", { ...plain, designation: "Grand Cru" }, fr())).typeDesignationId).toBe("gc-fr"));
  it("grapes canonicalise to an existing grape; an unknown name stays pending", async () =>
    expect((await resolve("vin-de-france.json", { ...plain, grapes: [{ name: "Shiraz", percentage: 60 }, { name: "Mystery Noir", percentage: 40 }] }, fr())).blend).toEqual([
      { grape: { kind: "existing", id: "syr", name: "Syrah" }, percentage: 60 },
      { grape: { kind: "pending", name: "Mystery Noir" }, percentage: 40 },
    ]));
});
```
In the crowded case, the two agreeing rows have equivalent suffixes (AOC ≡ AOP). Step 6 still leaves two rows, so nothing is picked.

**Steps**
- [ ] Write and run `.superpowers/export-reference-snapshot.mjs`. Confirm the JSON is under 1 MB.
- [ ] Write `snapshot-lookup.ts` and the tests. They fail with "Cannot find module ./resolve".
- [ ] Implement `resolve.ts` and the synonyms. The tests pass.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- `npx vitest run src/lib/wine-identity/resolve.test.ts` is green.
- `rg -n 'from "@/|server-only' src/lib/wine-identity/resolve.ts src/lib/wine-identity/__fixtures__/snapshot-lookup.ts` prints nothing.
- A bare `npx tsc --noEmit` prints nothing.

**Closes:** D6 and D8 (read side; "read from the label" provenance), spec §B.5, §G.2, RC3, RC4, RC5 (no unpaged self-named lookup in the resolver), RC10 (the resolver half), scan-3 (no first hit; pending producer).

---

### F6 — Confident match, grape suggestion, draft sources

**Depends on:** F5

**OWNS**
- create `src/lib/wine-identity/match.ts`
- create `src/lib/wine-identity/match.test.ts`
- create `src/lib/wine-identity/grape-suggestion.ts`
- create `src/lib/wine-identity/grape-suggestion.test.ts`
- create `src/lib/wine-identity/from-sources.ts`
- create `src/lib/wine-identity/from-sources.test.ts`

**Round-1:** Replaces the rule that the first match wins whenever there is one (ScanConfirm's `matches[0]`) with the confident single-match rule. The UI change lands in S1.

**Does**
- **`match.ts`** (spec §B.6).
  - `CatalogCandidate` and `CatalogMatch`, verbatim.
  - `pickConfidentMatch(draft, candidates): CatalogCandidate | null` implements the four conditions exactly:
    1. **Vintage.** The draft's vintage is complete and read. A candidate needs the same kind: the same year for YEAR, the same `vintageTawnyYears` for TAWNY.
    2. **Colour.** It agrees whenever the draft has one.
    3. **Several identities.** An identity is a distinct `foldName(wineName ?? "")` + `appellationId`. When the producer has more than one, the folded wine name must match, and so must the appellation whenever the draft has one.
    4. **Uniqueness.** Exactly one candidate survives.
  - A pending producer returns null.
- **`grape-suggestion.ts`** (spec §B.8). `pickGrapeSuggestion(placeGrapes, catalogCounts)`:
  1. Exactly one principal grape → that grape, from the place.
  2. Several principals, exactly one with `sharePct ≥ 60` → that grape, from the place.
  3. Otherwise fall back to the catalog: at least 3 wines, with the top grape at ≥ 60% of them.
  4. Otherwise null.
- **`from-sources.ts`** (spec §B.1, §C.8):
  ```ts
  export type CatalogWineSource = {
    id: string; producer: { id: string; name: string }; wineName: string | null;
    vintageKind: VintageKind; vintageYear: number | null; vintageTawnyYears: number | null;
    colour: WineColour; style: WineStyle; countryId: string; regionId: string; appellationId: string;
    typeDesignationId: string | null; alcohol: number | null; description: string | null; imageUrl: string | null;
    grapes: { id: string; name: string; percentage: number | null }[];
  };
  export type AnswerKeySource = {
    countryId: string; regionId: string; appellationId: string | null;
    producer: { id: string; name: string } | null; typeDesignationId: string | null;
    vintageKind: VintageKind | null; vintageYear: number | null; vintageTawnyYears: number | null;
    imageUrl: string | null;
    primaryGrape: { id: string; name: string }; secondaryGrape: { id: string; name: string } | null;
    catalog: Pick<CatalogWineSource, "wineName" | "colour" | "style" | "description" | "alcohol" | "grapes"> | null;
  };
  export function draftFromCatalogWine(w: CatalogWineSource): WineIdentityDraft;   // provenance "catalog-match" on every present field
  export function draftFromAnswerKey(k: AnswerKeySource): WineIdentityDraft;       // provenance "manual"; blend = catalog grapes when present, else primary + secondary
  export function parseStoredDraft(json: unknown): WineIdentityDraft | null;       // field-by-field validation; any malformed field → null
  ```
  A vintage built from stored rows has `read: false`.

**Tests (write first)**

`src/lib/wine-identity/match.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { emptyDraft } from "./complete";
import { pickConfidentMatch, type CatalogCandidate } from "./match";
import type { WineIdentityDraft } from "./types";

const draft = (o: Partial<WineIdentityDraft> = {}): WineIdentityDraft => ({
  ...emptyDraft(), producer: { kind: "existing", id: "p-cig", name: "Cigliuti" }, wineName: "Serraboella",
  appellationId: "a-bbr", colour: "RED", style: "STILL", vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: true }, ...o,
});
const cand = (o: Partial<CatalogCandidate> = {}): CatalogCandidate => ({
  id: "c1", wineName: "Serraboella", appellationId: "a-bbr", colour: "RED", vintageKind: "YEAR", vintageYear: 2017, vintageTawnyYears: null, ...o,
});

describe("pickConfidentMatch (scan-1)", () => {
  it("matches the same vintage of a one-identity producer", () =>
    expect(pickConfidentMatch(draft({ wineName: null }), [cand({ wineName: null }), cand({ id: "c2", wineName: null, vintageYear: 2016 })])?.id).toBe("c1"));
  it.each<[string, WineIdentityDraft, CatalogCandidate[]]>([
    ["another vintage only", draft(), [cand({ vintageYear: 2016 })]],
    ["an unread vintage", draft({ vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: false } }), [cand()]],
    ["a colour disagreement", draft({ colour: "WHITE" }), [cand()]],
    ["two survivors", draft({ wineName: null, appellationId: null }), [cand({ wineName: null }), cand({ id: "c2", wineName: null })]],
    ["a pending producer", draft({ producer: { kind: "pending", name: "Cigliuti" } }), [cand()]],
  ])("null for %s", (_l, d, cs) => expect(pickConfidentMatch(d, cs)).toBeNull());
  it("compares the tawny age", () => {
    const t = draft({ vintage: { kind: "TAWNY", year: null, tawnyYears: 20, read: true }, colour: null, wineName: null });
    const tawny = (years: number) => cand({ wineName: null, vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: years });
    expect(pickConfidentMatch(t, [tawny(10)])).toBeNull();
    expect(pickConfidentMatch(t, [tawny(20)])?.id).toBe("c1");
  });
  it("a producer with several wines needs the cuvée and the appellation", () => {
    const cs = [cand(), cand({ id: "c2", wineName: null, appellationId: "a-langhe" })];
    expect(pickConfidentMatch(draft(), cs)?.id).toBe("c1");
    expect(pickConfidentMatch(draft({ wineName: null }), cs)).toBeNull();
    expect(pickConfidentMatch(draft({ appellationId: "a-other" }), cs)).toBeNull();
  });
});
```

`src/lib/wine-identity/grape-suggestion.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { pickGrapeSuggestion } from "./grape-suggestion";

const neb = { grapeId: "g-neb", name: "Nebbiolo" };
const bar = { grapeId: "g-bar", name: "Barbera" };
describe("pickGrapeSuggestion (spec B.8)", () => {
  it("one principal grape → place", () =>
    expect(pickGrapeSuggestion([{ ...neb, sharePct: null }], [])).toEqual({ grape: { id: "g-neb", name: "Nebbiolo" }, source: "place" }));
  it("several principals, one at ≥ 60% → place", () =>
    expect(pickGrapeSuggestion([{ ...neb, sharePct: 85 }, { ...bar, sharePct: 15 }], [])?.grape.id).toBe("g-neb"));
  it("several principals without one falls back to the catalog", () =>
    expect(pickGrapeSuggestion([{ ...neb, sharePct: 50 }, { ...bar, sharePct: 50 }], [{ ...neb, count: 3 }])).toEqual({ grape: { id: "g-neb", name: "Nebbiolo" }, source: "catalog" }));
  it("catalog: 60% of at least 3 wines", () =>
    expect(pickGrapeSuggestion([], [{ ...neb, count: 3 }, { ...bar, count: 2 }])?.source).toBe("catalog"));
  it("nothing from 2 wines, or at 59%", () => {
    expect(pickGrapeSuggestion([], [{ ...neb, count: 2 }])).toBeNull();
    expect(pickGrapeSuggestion([], [{ ...neb, count: 59 }, { ...bar, count: 41 }])).toBeNull();
  });
});
```

`src/lib/wine-identity/from-sources.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { emptyDraft, missingWineFields } from "./complete";
import { draftFromAnswerKey, draftFromCatalogWine, parseStoredDraft, type CatalogWineSource } from "./from-sources";

const wine: CatalogWineSource = {
  id: "c1", producer: { id: "p", name: "Vietti" }, wineName: "Castiglione", vintageKind: "YEAR", vintageYear: 2017, vintageTawnyYears: null,
  colour: "RED", style: "STILL", countryId: "it", regionId: "pie", appellationId: "barolo", typeDesignationId: null,
  alcohol: 14.5, description: null, imageUrl: null, grapes: [{ id: "neb", name: "Nebbiolo", percentage: null }],
};
describe("draft sources", () => {
  it("a catalog wine is complete and marked catalog-match", () => {
    const d = draftFromCatalogWine(wine);
    expect(missingWineFields(d)).toEqual([]);
    expect(d.provenance).toMatchObject({ producer: "catalog-match", vintage: "catalog-match", appellation: "catalog-match" });
    expect(d.vintage.read).toBe(false);
  });
  it("an answer key without a catalog link keeps primary and secondary, marked manual", () => {
    const d = draftFromAnswerKey({ countryId: "it", regionId: "pie", appellationId: null, producer: null, typeDesignationId: null,
      vintageKind: "NV", vintageYear: null, vintageTawnyYears: null, imageUrl: null,
      primaryGrape: { id: "neb", name: "Nebbiolo" }, secondaryGrape: { id: "bar", name: "Barbera" }, catalog: null });
    expect(d.blend.map((b) => b.grape.name)).toEqual(["Nebbiolo", "Barbera"]);
    expect(d.provenance.country).toBe("manual");
  });
  it("parseStoredDraft round-trips a draft and rejects malformed JSON", () => {
    const d = draftFromCatalogWine(wine);
    expect(parseStoredDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(parseStoredDraft({ ...emptyDraft(), colour: "PURPLE" })).toBeNull();
    expect(parseStoredDraft("nope")).toBeNull();
  });
});
```

**Steps**
- [ ] Write the three test files and watch them fail.
- [ ] Implement the three modules. The tests pass.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- `npx vitest run src/lib/wine-identity` is green.
- A bare `npx tsc --noEmit` prints nothing.

**Closes:** D6 (the confident-match rule), D8 (the grape-suggestion rule), D7 and D13 (sources for the edit prefill), scan-1 (the rule), spec §B.6 (pure half), §B.8 (pure half).

---
### F7 — The label reader server path, `label_reads` retention, FastCork removal

**Depends on:** F6 (the `label_reads` types come from F2)

**OWNS**
- rewrite `src/lib/label-scan/extract.ts`
- create `src/lib/label-scan/fixture.ts`
- create `src/lib/label-scan/guards.ts`
- create `src/lib/label-scan/guards.test.ts`
- create `src/lib/wine-identity/server/lookup.ts`
- create `src/lib/wine-identity/server/match.ts`
- rewrite `src/app/scan/actions.ts`
- delete `src/lib/label-scan/fx.ts`
- delete `src/app/catalog/[wineId]/refresh-profile-action.ts`
- modify `src/app/catalog/[wineId]/wine-admin-controls.tsx`
- modify `.env.example`
- modify `src/lib/wset/queries.ts` (the comment at :28 only)
- modify `src/app/globals.css` (the comment at :364 only)

**Round-1:** Touches no round-1 behaviour; round 1 never changed the reader.
- **This task opens the compile-debt window.** `add-wine-sheet.tsx` keeps importing the deleted `identifyWineFromLabel` and `resolveWinePrefill` until S5b.

**Does**
- Load the `claude-api` skill first.
- **`extract.ts`.** Spec §A.2, verbatim: `LABEL_READ_MODEL`, `LabelReadUsage`, `LabelReadFailure`, `LabelReadOutcome`, `readLabel`.
  - No FastCork code remains.
  - Keep the old `ExtractedLabel` type body as `/** @deprecated removed in S5c */ export type ExtractedLabel = …`. It is a type only; `format.ts`, `scan-copy.ts` and `scan-confirm.tsx` import it type-only.
- **`extract.ts`** returns `not-read` with the response's `usage` for a refusal, a `max_tokens` stop or an unparsed output (spec §A.2).
- **`fixture.ts`.** Spec §A.6, verbatim. It checks `fixtureAllowed(process.env)` before the SDK client is constructed, and is never used when `NODE_ENV === "production"`.
- **`guards.ts`** (pure; spec §A.1): `isOwnStagingPath(path, userId)` and `fixtureAllowed(env)`.
- **`server/lookup.ts`.** `serverLookup(supabase): RefLookup`, memoised per instance. Never read a whole `appellations` or `producers` table.

  | Method | Implementation |
  |---|---|
  | `countries()` | all rows |
  | `regionsInCountry` | `eq("country_id")` |
  | `searchAppellations(words, regionId?)` | `rpc("search_appellations", { p_query: appellationSearchPattern(words), p_region_id })` (20260716160000:27-43). Never send the bare words: the RPC folds accents but not punctuation (spec §B.5). |
  | `appellationsByIds` | `in("id")` plus region → country |
  | `noGeographicIndication` | the country's region named in `NATIONAL_TIER_REGION_NAMES` (France: "Vin de France", 20260829212000) and its same-named appellation; otherwise the None pair (20260829263700) |
  | `producerByFoldedName` | `rpc("find_producer_by_folded_name", { p_name, p_region_id: regionId })` with a nullable region (spec §E.8), then select `id, name, region_id` |
  | `regionById` | lookup by id |
  | `grapes()` | all rows (small table) |
  | `typeDesignations()` | `eq("is_active", true).order("sort_order")` |
- **`server/match.ts`.** `findConfidentMatch(supabase, draft): Promise<CatalogMatch | null>` (spec §B.6).
  - Returns null unless the producer is `existing`.
  - Candidates are `catalog_wines` rows with that `producer_id`, `merged_into is null` and `blind_pending = false`, ordered by id, limit 200. They go through `pickConfidentMatch`.
  - Title: `"{appellation name} {vintageLabel}"`.
  - Meta:
    - Parts: `★ {round(avg)}` · `{n} note(s)` · `in {h} cellar(s)`, leaving out empty ones.
    - Sources: `catalog_wine_ratings` (`avg_score`, `note_count`) and `rpc("catalog_wine_holdings", …)`. Read migrations 20260829196000 and 20260829255000 for their exact shapes.
- **`scan/actions.ts`.** One server action, `readLabelPhoto`, following spec §A.5 steps 1–7:
  1. `getUser`; with no user, return `signed-out`.
  2. `isOwnStagingPath(imagePath, user.id)` must be true; otherwise return `image`.
  3. Take the public URL.
  4. Call `readLabel`. An unexpected throw is logged and returns `service`.
  5. When the outcome carries `usage` (ok, not-a-label, or a billed not-read), insert a `label_reads` row with its `outcome`, and a null `read` for not-read. If the insert fails, log it and continue with `readId: null`.
  6. A failed outcome returns `{ ok: false, reason }`.
  7. On success, run `resolveLabelRead(read, serverLookup(supabase), { imageUrl })` → `missingWineFields` → `findConfidentMatch` → `readDisplay`, with names from the same lookup.

  Also:
  - Export `LabelPhotoFailure` and `LabelPhotoRead` exactly as §A.5 shows.
  - Delete `searchRows`, `identifyWineFromLabel`, `stripCruQualifier`, `stripClassSuffix`, `createScannedWine` and `resolveWinePrefill`, with the `WineFormInitial` and `fx` imports.
  - Keep `/** @deprecated removed in S5c */ export type ScanMatch = …; export type ScanResult = …;` (types only).
- **`wine-admin-controls.tsx`.** Remove the "Re-read profile" (Sparkles) button, its state and its handler (:5, :17, :44, :63-73, :95-104). Keep the shared error display that the delete dialog uses (:115-119, :136).
- **Delete** `fx.ts` and `refresh-profile-action.ts`.
- **`.env.example`** (spec §A.8):
  - remove `FASTCORK_API_KEY` and its comment;
  - add `ANTHROPIC_API_KEY=`, commented "label scans only — about $0.01 per scan; see AGENTS.md";
  - add `# LABEL_READ_FIXTURE=src/lib/label-scan/__fixtures__/produttori-barbaresco-2018.json`, commented "development only; never read in production";
  - add `# NEXT_PUBLIC_FORCE_CAN_SCAN=1`, commented "development only".
- **Comments.** Reword `wset/queries.ts:28` and `globals.css:364` to describe the label read without a vendor name.
- **Keep:** `scripts/backfill-fastcork-profile.mjs` and migration `20260902100000` (D1).

**Interfaces — produces**
```ts
export async function readLabel(imageUrl: string): Promise<LabelReadOutcome>;             // extract.ts
export async function labelReadFixture(): Promise<LabelReadOutcome | null>;               // fixture.ts
export function isOwnStagingPath(path: string, userId: string): boolean;                  // guards.ts
export function fixtureAllowed(env: { NODE_ENV?: string; LABEL_READ_FIXTURE?: string }): boolean; // guards.ts
export function serverLookup(supabase: SupabaseClient<Database>): RefLookup;              // server/lookup.ts
export async function findConfidentMatch(supabase: SupabaseClient<Database>, draft: WineIdentityDraft): Promise<CatalogMatch | null>;
export async function readLabelPhoto(input: { imagePath: string }): Promise<LabelPhotoRead | { ok: false; reason: LabelPhotoFailure }>;
export type LabelPhotoFailure = "signed-out" | "image" | "not-a-label" | "not-read" | "busy" | "network" | "rejected" | "service";
export type LabelPhotoRead = { ok: true; readId: string | null; draft: WineIdentityDraft; missing: WineFieldKey[];
  match: CatalogMatch | null; display: { title: string; meta: string; newProducer: boolean }; confidence: "high" | "medium" | "low" };
```

**Tests (write first)** — `src/lib/label-scan/guards.test.ts`. The other modules are server-only: F1–F6 cover the pure pieces they compose, L1 runs them against live reads, and V1 items 2, 4, 10 and 32 check end-to-end reads with fixtures.
```ts
import { describe, expect, it } from "vitest";
import { fixtureAllowed, isOwnStagingPath } from "./guards";

const me = "d3ee0f40-a6c0-40f6-9c45-9fc068fcc556";
describe("isOwnStagingPath (spec §A.5 step 2)", () => {
  it.each([
    [`catalog/staging/${me}/scan-1789151878445-duytuv9ox3a.jpg`, true],
    ["catalog/staging/430f8450-5ef7-4733-b38b-fb6f96b640e1/scan-1.jpg", false],
    [`catalog/staging/${me}/../other/scan-1.jpg`, false],
    [`catalog/staging/${me}/scan-1.png`, false],
    [`https://x.supabase.co/storage/v1/object/public/wine-images/catalog/staging/${me}/scan-1.jpg`, false],
  ])("%s → %s", (p, ok) => expect(isOwnStagingPath(p, me)).toBe(ok));
  it("escapes the user id", () => expect(isOwnStagingPath("catalog/staging/aXb/scan-1.jpg", "a.b")).toBe(false));
});
it("fixtureAllowed only outside production, and only with the variable (spec §A.6)", () => {
  expect(fixtureAllowed({ NODE_ENV: "development", LABEL_READ_FIXTURE: "x.json" })).toBe(true);
  expect(fixtureAllowed({ NODE_ENV: "production", LABEL_READ_FIXTURE: "x.json" })).toBe(false);
  expect(fixtureAllowed({ NODE_ENV: "development" })).toBe(false);
});
```

**Steps**
- [ ] Write `guards.test.ts` and watch it fail. Implement `guards.ts` until it passes.
- [ ] Rewrite `extract.ts`; add `fixture.ts`, `server/lookup.ts` and `server/match.ts`; rewrite `scan/actions.ts`.
- [ ] Apply the FastCork removal list above.
- [ ] Run `npm test` (all green) and the checks in Working Rules 4. The debt window is now open.

**Acceptance**
- `rg -n -i fastcork src .env.example --glob '!src/components/add-wine/**' --glob '!src/app/catalog/new/**'` prints nothing. S1, S4, S5b, S5c and F9 own the comments that remain.
- `rg -n "identifyWineFromLabel|resolveWinePrefill|createScannedWine|usdToDkk|refreshWineProfile" src --glob '!src/components/add-wine/**'` prints nothing.
- `rg -n "api.anthropic.com" src` prints nothing; the SDK is the only transport.
- `rg -n "claude-sonnet-5" src` matches only `src/lib/label-scan/extract.ts`.
- tsc is clean outside the debt set.

**Closes:**
- D1 (the reader, retention, the fixture switch, FastCork removal) and D6 (the server match).
- scan-1 and scan-2 (match candidates exclude `blind_pending`); scan-3 (the "new producer" display data).
- Spec §A.2, §A.5, §A.6, §A.8, §B.6 (server half).
- **RC1, RC2 and RC9 are superseded by D1.** **The profile/price half of RC11 is superseded by D1** (spec §F.3 Q9).

---

### F8 — The unified server write path

**Depends on:** F7

**OWNS**
- create `src/lib/wine-identity/server/write.ts`
- create `src/lib/wine-identity/blend-sync.ts`
- create `src/lib/wine-identity/blend-sync.test.ts`
- create `src/lib/catalog-visibility.ts`

**Round-1:** Touches no round-1 behaviour. No caller switches yet; F9, F10 and F13 do that.

**Does**
- **`server/write.ts`** (`import "server-only"`). Spec §B.9 signatures, with `type Db = SupabaseClient<Database>`.
  - **`resolveProducer`.** An `existing` choice is verified by id; a missing id throws `Error("Producer not found")`. A `pending` choice goes through `rpc("find_or_create_producer", { p_name, p_region_id })`.
  - **`findOrCreateGrapeFolded`.** Folded equality over `grapes` (a small table, one select). Inserts on a miss, with one retry on `23505`.
  - **`prepareCompleteWine`** runs §B.9 steps 1–5:
    1. **Completeness.** Missing fields → `{ error: "This wine " + describeMissing(missing) + ".", missing }`.
    2. **Consistency.**
       - The appellation's `region_id` must equal `regionId`; otherwise "The appellation is not in the chosen region." with `["appellation"]`.
       - The region's `country_id` must equal `countryId`; otherwise "The region is not in the chosen country." with `["region"]`.
    3. **Producer.** `resolveProducer`, passing `regionId`.
    4. **Grapes.** Existing ids are verified. Pending names go through `findOrCreateGrapeFolded`.
    5. **Result.** Ids only.
  - **`prepareUnidentifiedWine`.** Same steps, with `toUnidentifiedWine`.
  - **`upsertCatalogWine`** returns `{ catalogWineId: string; written: boolean } | WriteRefusal`, in three steps:
    1. **`written`** comes from a pre-lookup of the identity (`producer_id`, `coalesce(lower(btrim(wine_name)),'')`, `appellation_id`, `colour`, `vintage_kind`, `vintage_year`, `vintage_tawny_years`, `merged_into is null`).
    2. **Upsert.** Call `rpc("find_or_create_catalog_wine", p)` with the jsonb keys callers use today (tasting-wine-writes.ts:225-249; add-wine/actions.ts:505-524). `wine_name` is null when blank.
    3. **Fill.** Call `fillCatalogWine`.
  - **`fillCatalogWine`.** Touches a row only when `created_by = userId`.
    - `image_url` and `description` are written only when empty; `alcohol_percent` only when null.
    - The blend is replaced only when `blendNeedsReplace(stored, seeded, incoming)` is true. The **full** blend is then written, with percentages.
- **`blend-sync.ts`** (pure):
  ```ts
  export function blendNeedsReplace(
    stored: { grapeId: string; percentage: number | null }[],
    seeded: { primaryGrapeId: string; secondaryGrapeId: string | null },
    incoming: { grapeId: string; percentage: number | null }[],
  ): boolean;
  // true only when stored equals exactly what the insert trigger seeds (primary [+ secondary], all null %) AND incoming differs
  ```
- **`catalog-visibility.ts`.** `withoutBlindPending<T extends { id: string }>(supabase, rows: T[]): Promise<T[]>`, following add-wine/actions.ts:131-136.

**Interfaces — produces:** spec §B.9 verbatim, plus `written` on `upsertCatalogWine`, plus `blendNeedsReplace` and `withoutBlindPending`.

**Tests (write first)** — `src/lib/wine-identity/blend-sync.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { blendNeedsReplace } from "./blend-sync";

const seeded = { primaryGrapeId: "g1", secondaryGrapeId: "g2" };
const row = (grapeId: string, percentage: number | null = null) => ({ grapeId, percentage });
describe("blendNeedsReplace (fillCatalogWine's rule, byhand-4/6)", () => {
  it("replaces a trigger-seeded blend with a different incoming blend", () =>
    expect(blendNeedsReplace([row("g1"), row("g2")], seeded, [row("g1", 70), row("g2", 20), row("g3", 10)])).toBe(true));
  it("never overwrites a curated blend", () =>
    expect(blendNeedsReplace([row("g1", 60), row("g2", 40)], seeded, [row("g1", 100)])).toBe(false));
  it("does nothing when incoming equals stored", () =>
    expect(blendNeedsReplace([row("g1")], { primaryGrapeId: "g1", secondaryGrapeId: null }, [row("g1")])).toBe(false));
  it("treats extra stored rows as curated", () =>
    expect(blendNeedsReplace([row("g1"), row("g2"), row("g3")], seeded, [row("g1", 100)])).toBe(false));
});
```

**Steps**
- [ ] Write the test and watch it fail. Implement `blend-sync.ts`; it passes.
- [ ] Implement `server/write.ts` and `catalog-visibility.ts`.
- [ ] Run `npm test` and the checks in Working Rules 4.

**Acceptance**
- `npx vitest run src/lib/wine-identity/blend-sync.test.ts` is green.
- `rg -n "are required\." src/lib/wine-identity` prints nothing.
- tsc is clean outside the debt set.

**Closes:**
- D2 (the single server path).
- byhand-4 and byhand-6 (write side); the blend half of RC11; RC6 (server side).
- scan-2 (the shared visibility helper).
- Spec §B.7 (server helper), §B.9 (module).

---

### F9 — Catalog and cellar page writers on the write path

**Depends on:** F8

**OWNS**
- modify `src/app/catalog/new/actions.ts`
- modify `src/app/catalog/new/new-wine-form.tsx`
- modify `src/app/catalog/[wineId]/edit-wine-modal.tsx`
- modify `src/app/cellar/new/actions.ts`
- modify `src/app/cellar/new/cellar-lot-form.tsx`
- modify `src/app/catalog/unidentified/actions.ts`
- modify `src/components/wine/wine-identity-fields.tsx`
- create `src/components/wine/identity-draft.ts`
- create `src/components/wine/identity-draft.test.ts`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **`identity-draft.ts`** (pure; `import type` only from `@/`). `draftFromIdentityInput(v: WineIdentityInput, names?: { grapes?: Record<string, string> }): WineIdentityDraft`, where `WineIdentityInput` comes from `src/components/wine/wine-identity-types.ts`.
  - **Producer.** `producerId` → `existing`, named `producerLabel ?? ""`. Otherwise a non-blank `producerLabel` → `pending`.
  - **Blend.** A row with `grapeId` → `existing`; a row with `pendingName` → `pending`. Percentage strings become numbers or null.
  - **Vintage.** Strings become numbers, with `read: false`.
  - **Colour and style.** An unknown value becomes null.
  - **Result.** Provenance `manual` on present fields; returns `normaliseDraft(...)`.
- **`catalog/new/actions.ts`:**
  - **`createCatalogWine(input: { draft: WineIdentityDraft; profile?: WineProfileInput; estimatedPrice?: string | null })`.** `prepareCompleteWine` → `upsertCatalogWine`. Profile and price columns are written only on a row the caller created, and only into empty columns. Returns `{ catalogWineId: string; written: boolean } | WriteRefusal` and **never throws**.
  - **`updateCatalogWine(wineId, input)`.** `prepareCompleteWine`, then an update with `.select("id")`. Zero rows → `{ error: "You can't edit this wine." }`. An explicit blend edit in Manage wine replaces the blend, as today. Returns errors instead of throwing.
  - **`createProducer`.** Reimplement as `rpc("find_or_create_producer", { p_name, p_region_id })`. Keep the export, marked `/** @deprecated removed in S3b */`; the by-hand form still imports it.
  - **Self-named appellation and None rows** (byhand-5, spec §D.4 #8):
    - `createRegion` also find-or-creates the region's self-named appellation, named exactly as the region (as 20260713180000 did).
    - `createCountry` also find-or-creates that country's "None" region and "None" appellation (naming as 20260829263700).
  - **Removed:** the USD handling (:97-101) and the FastCork comments (:100, :108).
- **`new-wine-form.tsx`:**
  - `submit` builds the draft with `draftFromIdentityInput`, checks `missingWineFields`, and shows "This wine {describeMissing}." This replaces its own required checks (:160-178).
  - Pending producers and grapes travel in the draft; nothing is created first.
  - It handles `{ error, missing }`.
  - Remove `retailPriceUsd` from `WineFormInitial` (:55-58) and the FastCork comment.
  - Keep `vintagePrompt` on the type, marked `/** @deprecated removed in S5c */`.
- **`edit-wine-modal.tsx`.** Adapts only to the new result shapes.
- **`cellar/new/actions.ts`:**
  - `addCellarLot`'s identity branch: `prepareCompleteWine` → `upsertCatalogWine` → `add_cellar_lot` with `catalog_wine_id` only. It returns errors and no longer overwrites image or description unconditionally (:98-120).
  - `searchCellarCatalog` filters through `withoutBlindPending`.
- **`cellar-lot-form.tsx`.** The same completeness change as NewWineForm (:152-200). Pending names go to the write; drop any `vintagePrompt` read.
- **`catalog/unidentified/actions.ts`.** `searchCatalogForResolve` filters through `withoutBlindPending`.
- **`wine-identity-fields.tsx`.** Remove the `required` attributes (:320, :340, :381-391). T12 changes the appellation shape.

**Tests (write first)** — `src/components/wine/identity-draft.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { draftFromIdentityInput } from "./identity-draft";
import type { WineIdentityInput } from "./wine-identity-types";

// BlendRow comes from grape-blend-editor.tsx; if it declares further required keys, add them to both rows.
const input = (o: Partial<WineIdentityInput> = {}): WineIdentityInput => ({
  countryId: "c-it", regionId: "r-pie", appellationId: "a-bbr",
  blend: [{ grapeId: "g-neb", percentage: "90" }, { grapeId: "", percentage: "10", pendingName: "Pelaverga" }] as WineIdentityInput["blend"],
  producerId: "", producerLabel: "Cigliuti", typeDesignationId: null, wineName: " ", colour: "RED", style: "STILL",
  vintageKind: "YEAR", vintageYear: "2017", vintageTawnyYears: "", imageUrl: null, ...o,
});
describe("draftFromIdentityInput", () => {
  it("maps a pending producer, a pending grape, a blank name and a year", () => {
    const d = draftFromIdentityInput(input(), { grapes: { "g-neb": "Nebbiolo" } });
    expect(d.producer).toEqual({ kind: "pending", name: "Cigliuti" });
    expect(d.blend).toEqual([
      { grape: { kind: "existing", id: "g-neb", name: "Nebbiolo" }, percentage: 90 },
      { grape: { kind: "pending", name: "Pelaverga" }, percentage: 10 },
    ]);
    expect([d.wineName, d.vintage]).toEqual([null, { kind: "YEAR", year: 2017, tawnyYears: null, read: false }]);
    expect(d.provenance.country).toBe("manual");
  });
  it("maps an existing producer id and a tawny age", () => {
    const d = draftFromIdentityInput(input({ producerId: "p1", producerLabel: "Taylor's", vintageKind: "TAWNY", vintageYear: "", vintageTawnyYears: "20", style: "STILL" }));
    expect(d.producer).toEqual({ kind: "existing", id: "p1", name: "Taylor's" });
    expect([d.vintage.tawnyYears, d.style]).toEqual([20, "FORTIFIED"]);
  });
  it("turns an unknown colour into null", () => expect(draftFromIdentityInput(input({ colour: "" })).colour).toBeNull());
});
```

**Steps**
- [ ] Write the test and watch it fail. Implement `identity-draft.ts`; it passes.
- [ ] Rewire the six files as above.
- [ ] Run `npm test` and the checks in Working Rules 4.

**Acceptance**
- `rg -n "are required\.|Still missing|retailPriceUsd|usdToDkk" src/app/catalog src/app/cellar src/components/wine` prints nothing.
- `rg -n "required" src/components/wine/wine-identity-fields.tsx` shows no HTML `required` attribute.
- tsc is clean outside the debt set.

**Closes:**
- D2 (the legacy catalog and cellar forms).
- byhand-5 (`createRegion`/`createCountry`, catalog side); scan-2 (the other catalog searches); RC6; RC7 (data shape).
- Spec §B.6 "Other catalog searches"; §B.9 rows "Catalog page create and Manage wine" and "Cellar page lot create"; §D.4 #8 (catalog creators).

---
### F10 — Flight writes, the adder guard, legacy routes

**Depends on:** F9

**OWNS**
- modify `src/app/tastings/[id]/wines/new/tasting-wine-writes.ts`
- modify `src/app/tastings/[id]/wines/new/actions.ts`
- delete `src/app/tastings/[id]/wines/new/wine-form.tsx`
- modify `src/app/tastings/[id]/wines/new/page.tsx`
- modify `src/app/tastings/[id]/wines/[wineId]/edit/page.tsx`

**Round-1:** Touches no round-1 behaviour.

Before editing the two pages, read the Next.js 16 docs on `redirect` in server components (`node_modules/next/dist/docs/`).

**Does**

`tasting-wine-writes.ts` stays `server-only`. It is **not** a `"use server"` module.

- **`resolveTastingAdder(supabase, userId, tastingId)`** (spec §D.4 #1). It replaces the three permission copies (tasting-wine-writes.ts:183-198, 370-382; wines/new/actions.ts:534-552).
  - A CLOSED tasting → "This tasting is finished — reopen it to add wines."
  - `PARTICIPANT_CONTRIBUTED`, caller not JOINED → "Join the tasting to add a wine."
  - `HOST_PROVIDES`, caller not the host → today's host-refusal message (tasting-wine-writes.ts:183-198).
  - Otherwise it returns `{ tasting: { id, name, status, revealMode, wineSource }, contributorParticipantId }`.
- **`insertTastingWineCore` and `insertTastingWineFromCatalogRow`.**
  - Both take an `addedVia: "SCAN" | "CATALOG" | "CELLAR" | "BY_HAND"` parameter (the DB column type from F3).
  - Both call `resolveTastingAdder` first.
  - The catalog-row select adds `merged_into is null`.
- **`insertTastingWineFromIdentity(supabase, userId, tastingId, draft: WineIdentityDraft, addedVia)`.**
  - Runs `prepareCompleteWine` → `upsertCatalogWine`, then inserts the answer with the resolved ids (primary and secondary from `ResolvedWine`).
  - Its own required checks (:293-317) and its two-grape blend (:328-331) go, and so does the `ByHandIdentity` import.
- **`insertTastingWineFromLot`** (spec §C.7), moved in from `addTastingWineFromCellarLot`:
  1. `resolveTastingAdder`, and the lot is the caller's with `quantity ≥ 1`.
  2. Insert the glass from the lot's catalog wine, with `added_via = 'CELLAR'`. Nothing about the lot goes on `wines`.
  3. Insert the caller's `wine_pour_intents` row: `{ wine_id, owner_id: userId, cellar_lot_id: lotId, consume_on_start: status === "DRAFT" && consume }`.
     - This is one INSERT that the intent table's RLS allows the adder. It is never an update of `wines`, which silently matches 0 rows for a contributor.
     - If it fails, keep the glass and return `warning: "Added — but it won't come out of your cellar."`.
  4. IN_PROGRESS or OPEN, with `consume` true: call `rpc("pour_cellar_lot_into_glass", { p_wine_id })`. If that fails, keep the glass and return `warning: "Added — but the bottle couldn't be taken out of your cellar."`.
- **`insertTastingWineUnidentified`** (spec §B.9). The body of `addWineUnidentified`, on `prepareUnidentifiedWine`, inserting in this order: the `wines` row, the `catalog_wines_unidentified` row, then the answer.
  - Never rely on a delete that RLS forbids. `catalog_wines_unidentified` has no delete policy, and only the host may delete `wines`.
  - When a later insert fails, delete the glass only if the caller is the host. A contributor's glass stays, and reads as incomplete until they finish it with Edit.
- **`insertIncompleteGlass(supabase, userId, tastingId, draft, via)`** (spec §C.8 steps 1–6):
  1. `resolveTastingAdder`.
  2. Refuse an OPEN tasting with "Finish this wine's details first — an open tasting shows every glass as soon as it is added." Its glasses are inserted revealed, so an incomplete one could never be finished.
  3. `missingWineFields(draft)` must be non-empty.
  4. Insert the `wines` row at `count + 1`, with `added_via` and the contributor. `is_revealed` stays false.
  5. Insert the `wine_identity_drafts` row (`normaliseDraft(draft)`, `missing`). If that fails, delete the glass only if the caller is the host. A contributor's glass stays, as an incomplete glass with every field missing.
  6. Write nothing else: no catalog row, no answer, no `blind_pending`.
- **`loadFlightGlassCore(supabase, wineId)`** (spec §C.8 "loading a glass to edit").
  - `rpc("is_wine_adder")` must be true.
  - **Complete glass.** `draftFromAnswerKey`, from the answer key plus the catalog wine's name, colour, style, description, alcohol and blend.
  - **Incomplete glass** (no answer key). `parseStoredDraft(draftRow?.draft) ?? emptyDraft()`. A missing or malformed draft gives a draft with every field missing.
  - Returns `{ draft, incomplete, unidentified, glass, canEdit }`.
- **`saveFlightGlassCore(supabase, userId, { wineId, draft, unidentified, leaveForLater })`** (spec §C.8 "saving a glass").
  - **Gates:**
    - the caller is the adder;
    - the wine is not revealed;
    - a complete glass can be saved only while DRAFT;
    - an incomplete glass can be saved whenever the tasting is not CLOSED.
  - **`leaveForLater`.** Update the draft row with its recomputed `missing`. If the draft is now complete, fall through to the full save.
  - **Full save:**
    1. `prepareCompleteWine` (or `prepareUnidentifiedWine`). For an identified glass, then `upsertCatalogWine`.
    2. Insert or update `wine_answers`.
       - An identified glass sets `catalog_wine_id` **and clears `unidentified_wine_id` in the same statement**.
       - An unidentified glass upserts its `catalog_wines_unidentified` row. It then sets `unidentified_wine_id` **and clears `catalog_wine_id` in the same statement** (`wine_answers_one_identity`).
    3. The E.3 trigger deletes the draft.
  - Returns `{ ok: true; wineId; catalogWineId: string | null; incomplete?: { missing: WineFieldKey[] }; finishedIncomplete: boolean } | WriteRefusal`.
- **`wines/new/actions.ts`.**
  - Delete `addWine`, `updateWine`, `searchCatalogWines` and `addWineUnidentified`.
  - Replace `addTastingWineFromCellarLot` with a thin wrapper over `insertTastingWineFromLot`, marked `/** @deprecated removed in F13 */`; `add-wine/actions.ts` still imports it.
  - `createProducer` → `rpc("find_or_create_producer")`.
  - `createRegion` / `createCountry` gain the byhand-5 find-or-create of the self-named appellation and the None region and appellation, as in F9.
  - Keep the other reference creators.
- **Delete** `wine-form.tsx`.
- **`wines/new/page.tsx`** (server). Calls `resolveTastingAdder`.
  - OK → `redirect(\`/tastings/${id}?addWine=byhand\`)`.
  - Refused → render the refusal sentence in the page's existing chrome.
- **`wines/[wineId]/edit/page.tsx`** (server). Calls `rpc("is_wine_adder", { p_wine_id: wineId })`.
  - True → `redirect(\`/tastings/${id}?editWine=${wineId}\`)`.
  - Otherwise render "Only the person who added this glass can edit it."

**Interfaces — produces**
```ts
export async function resolveTastingAdder(supabase: Db, userId: string, tastingId: string): Promise<{ tasting: { id: string; name: string; status: TastingStatus; revealMode: RevealMode; wineSource: WineSourceMode }; contributorParticipantId: string | null } | { error: string }>;
export async function insertTastingWineFromCatalogRow(supabase: Db, userId: string, tastingId: string, catalogWineId: string, addedVia: AddedViaDb): Promise<{ wineId: string; position: number } | { error: string }>;
export async function insertTastingWineFromIdentity(supabase: Db, userId: string, tastingId: string, draft: WineIdentityDraft, addedVia: AddedViaDb): Promise<{ wineId: string; position: number; catalogWineId: string } | WriteRefusal>;
export async function insertTastingWineFromLot(supabase: Db, userId: string, tastingId: string, lotId: string, consume: boolean): Promise<{ wineId: string; position: number; catalogWineId: string; warning?: string } | { error: string }>;
export async function insertTastingWineUnidentified(supabase: Db, userId: string, tastingId: string, draft: WineIdentityDraft): Promise<{ wineId: string; position: number } | WriteRefusal>;
export async function insertIncompleteGlass(supabase: Db, userId: string, tastingId: string, draft: WineIdentityDraft, via: "scan" | "byhand"): Promise<{ wineId: string; position: number; missing: WineFieldKey[] } | { error: string }>;
export async function loadFlightGlassCore(supabase: Db, wineId: string): Promise<{ draft: WineIdentityDraft; incomplete: boolean; unidentified: boolean; glass: number; canEdit: boolean } | { error: string }>;
export async function saveFlightGlassCore(supabase: Db, userId: string, input: { wineId: string; draft: WineIdentityDraft; unidentified: boolean; leaveForLater: boolean }): Promise<{ ok: true; wineId: string; catalogWineId: string | null; incomplete?: { missing: WineFieldKey[] }; finishedIncomplete: boolean } | WriteRefusal>;
// AddedViaDb = NonNullable<Database["public"]["Tables"]["wines"]["Row"]["added_via"]>
```

**Tests:** No vitest — these are server-only modules. The rules they call are tested in F1, F3 and F6. The flows are verified in V1 items 2, 3, 5, 11, 17, 19 and 21.

**Steps**
- [ ] Implement the helpers in `tasting-wine-writes.ts`.
- [ ] Prune `wines/new/actions.ts` and delete `wine-form.tsx`.
- [ ] Rewrite both pages as redirects.
- [ ] Run `npm test` and the Working Rules 4 checks.

**Acceptance**
- `rg -n "\baddWine\b|\bupdateWine\b|searchCatalogWines|addWineUnidentified|\bWineForm\b|ByHandIdentity" "src/app/tastings/[id]/wines"` prints nothing.
- `rg -n "resolveTastingAdder" "src/app/tastings/[id]/wines/new/tasting-wine-writes.ts"` shows every insert helper calling it.
- tsc is clean outside the debt set.

**Closes**
- **Decisions:** D2 (flight writes); D7 (the incomplete-glass write, finish, edit); D11 (the lot intent and the running-flight pour); D13 (legacy routes; no adds on CLOSED).
- **Findings:**
  - byhand-7 (the unidentified path); byhand-5 (the `wines/new` creators);
  - scan-5, sources-1, create-5, entry-1 (write side);
  - scan-7, sources-5, entry-2 (server guard).
- **Spec:** §2.1 row 8; §C.6 rows `/wines/new` and `/edit`; §C.7; §C.8 (writes); §D.4 #1.

---

### F11 — Sheet contracts, the matrix, `addedVia`

**Depends on:** F10

**OWNS**
- modify `src/components/add-wine/types.ts`
- create `src/components/add-wine/matrix.ts`
- create `src/components/add-wine/matrix.test.ts`
- create `src/components/add-wine/added-via.ts`
- create `src/components/add-wine/added-via.test.ts`

**Round-1:**
- **Replaces** round 1's `{ kind: "rate" }` and "Rate this wine" with `{ kind: "note" }` and "Start the note" (D4).
- **Keeps** round 1's identical result-row buttons: one label per destination, except for the two action changes D9 allows ("+1 bottle", "Open").

**Does**
- **`types.ts`.** Replace the contracts block with spec §C.1, verbatim: `AddWineDestination` with `note`, `AddWineStart`, `AddWineOpenOptions` with `edit`, `AddedVia`, `AddSource`, `AddedWine`, `AddResult`, `NotePick`, and `FlightHint` with `phase`.
  - `SearchGroups.catalog` and `.tasted` rows gain `producerId: string`, `wineName: string | null`, `appellationId: string` and `vintageLabel: string` (spec §C.1; F13 fills them). `.tasted` rows also gain `inFlight: boolean` (sources-8).
  - **`FlightHint.phase` lands optional:** `phase?: "live" | "self-paced" | "next"`.
    - **Keep** `live?: boolean`, marked `/** @deprecated removed in S5c */`.
    - `flight-hint-registrar.tsx` still passes `live` and no `phase` until T10, and it sits outside the compile-debt set. A required `phase` would break this task's own tsc gate.
    - S5c makes `phase` required once T10 has landed.
  - Remove `{ kind: "rate" }`, `RatePick`, `ByHandIdentity`, `PendingScan`, `PendingFix`, the `WineFormInitial` imports, and `SheetContext.isDesktop` / `hasCamera`. Follow rule 5: remove each only when every remaining importer is inside the debt set.
  - View prop types stay until each S task rewrites them.
- **`matrix.ts`.** `DestinationKind`, `SheetMatrix` (spec §C.2 plus `inFlightMeta: string`), and `sheetMatrix(destination, canScan)`.
  - It holds every cell of the four §C.2 tables.
  - Cells marked "today's …, unchanged" copy the current strings from `desktop-format.ts`:
    - :141-162: the footer sentences for 0 and 1 glasses, and for no destination;
    - :220-254: the upload copy for no destination.
  - `confirm.note` for a flight calls `flightNote` from `./scan-copy`.
  - `CellarSummary` is imported type-only from `./desktop-format`.
  - It also exports `flightHintSubtitle(hint: { tastingName: string; phase: "live" | "self-paced" | "next" })` → "{name}, live now" | "{name}, in progress" | "{name}, next up". The copy in `scan-copy.ts` stays until S5c.
  - A disabled in-flight row returns `label: "In flight"`; `inFlightMeta` is `"in flight"` (the phone copy).
  - `partialRead` gains `skipConfirm`, true only for note. For a flight whose `revealMode` is OPEN, `partialRead` is `{ single: "by-hand", stacked: "pending-row", skipConfirm: false }` (spec §C.8).
  - With no destination, `footer.primary` and `byHand.primary` are "Choose where it goes".
- **`added-via.ts`.** `addedVia(source: AddSource): AddedVia | null`, per the §C.1 table; `plusOne` → null.

**Interfaces — produces**
- The spec §C.1 types, verbatim.
- `sheetMatrix`, `SheetMatrix`, `DestinationKind`, `flightHintSubtitle`, `addedVia`.

**Tests (write first)**

`src/components/add-wine/matrix.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { flightHintSubtitle, sheetMatrix } from "./matrix";
import type { AddWineDestination } from "./types";

const flight: AddWineDestination = { kind: "flight", tastingId: "t1", tastingName: "Barolo night", revealMode: "BLIND", wineSource: "HOST_PROVIDES", position: 4 };
const dest = { flight, cellar: { kind: "cellar" }, note: { kind: "note" }, catalog: { kind: "catalog" }, none: null } as const;
type K = keyof typeof dest;
const all: K[] = ["flight", "cellar", "note", "catalog", "none"];
const m = (k: K, canScan: boolean) => sheetMatrix(dest[k] as AddWineDestination | null, canScan);

describe("header, camera, search field", () => {
  it.each([
    ["flight", true, "Barolo night", "Add wine · glass 4", "Add wine · glass 4", "Adding to the flight"],
    ["flight", false, "Barolo night · blind", "Add wine · glass 4", "Add wine · glass 4", "Adding to the flight"],
    ["cellar", true, "Cellar", "Add a bottle", "Add a bottle", "Adding to the cellar"],
    ["note", true, "Taste & rate", "Which wine?", "Which wine?", null],
    ["note", false, "Taste & rate", "Which wine are you tasting?", "Which wine are you tasting?", null],
    ["catalog", false, "Catalog", "Add a wine", "Add a wine", "Adding to the catalog"],
    ["none", true, null, "Scan", "Scanned", "Adding wines"],
    ["none", false, null, "Add wine", "Add wine", "Adding wines"],
  ] as const)("%s canScan=%s", (k, canScan, eyebrow, home, read, multiTitle) => {
    const x = m(k, canScan);
    expect([x.eyebrow, x.title("home"), x.title("read"), x.multiTitle, x.home]).toEqual([eyebrow, home, read, multiTitle, canScan ? "camera" : "desktop"]);
    expect(x.searchPlaceholder).toBe(canScan ? "Or search wine catalog" : "Search by producer, wine or appellation");
  });
  it("laptop eyebrow names the reveal mode", () => {
    expect(sheetMatrix({ ...flight, revealMode: "SEMI_BLIND" }, false).eyebrow).toBe("Barolo night · semi-blind");
    expect(sheetMatrix({ ...flight, revealMode: "OPEN" }, false).eyebrow).toBe("Barolo night · open");
  });
  it.each([
    ["flight", ["cellar", "byhand"], true, "↵ adds the first hit"],
    ["cellar", ["byhand"], true, "↵ adds the first hit"],
    ["note", ["cellar", "byhand"], false, "↵ opens a note on the first hit"],
    ["catalog", ["byhand"], true, "↵ opens the first hit"],
    ["none", ["cellar", "byhand"], true, "↵ adds the first hit"],
  ] as const)("%s chips, Many, Enter hint", (k, chips, showMany, hint) => {
    expect([m(k, true).chips, m(k, true).showMany, m(k, false).enterHint]).toEqual([chips, showMany, hint]);
  });
  it("flight hint subtitles (entry-4)", () => {
    expect(flightHintSubtitle({ tastingName: "Barolo night", phase: "live" })).toBe("Barolo night, live now");
    expect(flightHintSubtitle({ tastingName: "Barolo night", phase: "self-paced" })).toBe("Barolo night, in progress");
    expect(flightHintSubtitle({ tastingName: "Barolo night", phase: "next" })).toBe("Barolo night, next up");
  });
});

describe("search and rows", () => {
  const row = (k: K, source: "lot" | "catalog" | "tasted", o: { inFlight?: boolean; owned?: boolean } = {}) =>
    m(k, false).row({ source, inFlight: o.inFlight ?? false, owned: o.owned ?? false });
  it("groups", () => all.forEach((k) => expect(m(k, true).searchGroups).toEqual(k === "catalog" ? ["catalog", "tasted"] : ["cellar", "catalog", "tasted"])));
  it("row labels and actions (D9)", () => {
    expect(row("flight", "lot")).toEqual({ label: "Add as glass 4", action: "add", disabled: false, affordance: "plus" });
    expect(row("flight", "catalog", { inFlight: true })).toEqual({ label: "In flight", action: "add", disabled: true, affordance: "plus" });
    expect(row("cellar", "lot", { owned: true })).toEqual({ label: "+1 bottle", action: "plusOne", disabled: false, affordance: "plus" });
    expect(row("cellar", "catalog")).toEqual({ label: "Add to cellar", action: "add", disabled: false, affordance: "plus" });
    expect(row("note", "tasted")).toEqual({ label: "Start the note", action: "pick", disabled: false, affordance: "chevron" });
    expect(row("catalog", "catalog")).toEqual({ label: "Open", action: "open", disabled: false, affordance: "chevron" });
    expect(row("none", "lot")).toEqual({ label: "Add", action: "choose", disabled: false, affordance: "plus" });
  });
  it("subtitles, consume, cellar source, counts", () => {
    expect(m("flight", true).cellarGroupSubtitle?.(6)).toBe("6 bottles you can pour tonight");
    expect(m("cellar", true).cellarGroupSubtitle).toBeNull();
    expect(all.map((k) => m(k, true).consumeLabel)).toEqual(["Take it out of the cellar when we pour it", null, "Take a bottle out of the cellar when I save the note", null, "Take it out of the cellar when we pour it"]);
    expect(all.map((k) => m(k, true).cellarSource)).toEqual([true, false, true, false, true]);
    expect([m("catalog", false).resultCount(3), m("flight", false).resultCount(31), m("flight", false).inFlightMeta]).toEqual(["3 near matches", "31 found", "in flight"]);
  });
});

describe("laptop surfaces", () => {
  it("upload zone", () => {
    expect(m("flight", false).upload).toEqual({ multiple: true, title: "Upload label photos", body: "Drop in the photos you took of the bottles — several at once. Each one is read and matched exactly as it is on the phone, and lands in this flight.", drop: "Drop photos here", choose: "or choose files · JPG, PNG, up to 5MB each" });
    expect(m("cellar", false).upload).toEqual({ multiple: true, title: "Upload label photos", body: "Several at once — a delivery of six is one drop. Each lands in your cellar.", drop: "Drop photos here", choose: "or choose files" });
    expect(m("note", false).upload).toEqual({ multiple: false, title: "Upload a label photo", body: "Read and matched exactly as it is on the phone, then the note opens.", drop: "Drop a photo here", choose: "or choose a file" });
    expect(m("catalog", false).upload).toEqual({ multiple: true, title: "Upload label photos", body: "Read a label and it fills the form below — still checked against the catalog before it is written.", drop: "Drop photos here", choose: "or choose files" });
  });
  it("tiles, lead line, neither-of-these", () => {
    const s = { bottles: 38, readyToDrink: 6 };
    expect([m("flight", false).cellarTileSubtitle?.(s), m("note", false).cellarTileSubtitle?.(s), m("cellar", false).cellarTileSubtitle]).toEqual(["38 bottles · 6 ready to drink", "38 bottles · rating one you own is the common case", null]);
    expect(all.map((k) => m(k, false).byHandTileSubtitle)).toEqual(Array(5).fill("Producer, name, vintage, colour"));
    expect(all.map((k) => m(k, false).lotPreviewTile)).toEqual([false, true, false, false, false]);
    expect(m("note", false).leadLine).toBe("Scanning lives on your phone and tablet, where the camera faces the bottle. It is not offered here.");
    expect(m("catalog", false).leadLine).toBe("First, check it is not already here");
    expect(all.map((k) => m(k, false).neitherOfThese)).toEqual([false, false, false, true, false]);
  });
});

describe("footers, confirm, by hand, afterwards", () => {
  it("footer", () => {
    expect(m("flight", true).footer).toMatchObject({ primary: "Add as glass 4", secondary: "Add and scan the next", button: "Done" });
    expect(m("flight", false).footer.secondary).toBeNull();
    expect(m("flight", false).footer.sentence(0)).toBe("Glasses 1–3 are set. Adding does not close this — keep going until the flight is full.");
    expect([m("cellar", false).footer.primary, m("cellar", false).footer.sentence(0), m("cellar", false).footer.sentence(2)]).toEqual(["Add to cellar", "Nothing added to your cellar yet. Adding does not close this — keep going.", "Added 2 to your cellar so far. Adding does not close this — keep going."]);
    expect(m("note", false).footer).toMatchObject({ primary: "Start the note", button: "Close" });
    expect(m("note", false).footer.sentence(0)).toBe(m("note", false).leadLine);
    expect(m("catalog", false).footer).toMatchObject({ primary: "Add to the catalog", button: "Done" });
    expect(m("catalog", false).footer.sentence(0)).toBe("Adding here only records the wine. The sheet then asks what you want to do with it.");
    expect(m("none", false).footer).toMatchObject({ primary: "Choose where it goes", button: "Done" });
  });
  it("confirm", () => {
    expect(m("flight", true).confirm).toEqual({ eyebrowMatch: "Matched in the catalog", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: "Add as glass 4", primaryNoMatch: "Add as glass 4", note: "Only you see this until the reveal. Tasters see “glass 4”." });
    expect(m("catalog", true).confirm).toEqual({ eyebrowMatch: "Already in the catalog · nothing new will be written", eyebrowNoMatch: "Not in the catalog yet", primaryMatch: "Yes, that is the wine", primaryNoMatch: "Add it", note: "Confirming only tells us we have the right wine. What happens to it comes next." });
    expect([m("note", true).confirm.primaryMatch, m("cellar", true).confirm.primaryNoMatch, m("none", true).confirm.eyebrowMatch]).toEqual(["Start the note", "Add to cellar", "Found in the catalog"]);
  });
  it("by hand (D8, byhand-8)", () => {
    expect([m("flight", true).byHand.eyebrow, m("flight", true).byHand.primary(false), m("flight", true).byHand.primary(true), m("flight", true).byHand.unidentifiedToggle]).toEqual(["Add wine · glass 4 · by hand", "Add as glass 4", "Save · glass 4", true]);
    expect(m("flight", true).byHand.footerNote).toBe("Only you see this until the reveal. It joins the catalog once this glass is revealed.");
    const rest = ["cellar", "note", "catalog", "none"] as const;
    expect(rest.map((k) => m(k, true).byHand.eyebrow)).toEqual(["Cellar · by hand", "Taste & rate · by hand", "Catalog · by hand", "Add wine · by hand"]);
    expect(rest.map((k) => m(k, true).byHand.primary(false))).toEqual(["Add to cellar", "Start the note", "Add to the catalog", "Choose where it goes"]);
    rest.forEach((k) => expect([m(k, true).byHand.footerNote, m(k, true).byHand.unidentifiedToggle]).toEqual(["Saved to the catalog too, so nobody types it again.", false]));
  });
  it("partial reads and follow-ups (D7, D3)", () => {
    expect(all.map((k) => m(k, true).partialRead)).toEqual([
      { single: "incomplete-glass", stacked: "incomplete-glass", skipConfirm: false }, { single: "by-hand", stacked: "pending-row", skipConfirm: false },
      { single: "by-hand", stacked: "by-hand", skipConfirm: true }, { single: "by-hand", stacked: "pending-row", skipConfirm: false }, { single: "by-hand", stacked: "pending-row", skipConfirm: false },
    ]);
    expect(sheetMatrix({ ...flight, revealMode: "OPEN" }, true).partialRead).toEqual({ single: "by-hand", stacked: "pending-row", skipConfirm: false });
    expect(all.map((k) => m(k, true).followUps)).toEqual([[], [], [], ["cellar", "note"], []]);
  });
});
```

`src/components/add-wine/added-via.test.ts`
```ts
import { expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import { addedVia } from "./added-via";

it.each([
  [{ kind: "catalog", catalogWineId: "c", via: "scan" }, "SCAN"],
  [{ kind: "catalog", catalogWineId: "c", via: "search" }, "CATALOG"],
  [{ kind: "lot", lotId: "l", consume: true }, "CELLAR"],
  [{ kind: "identity", draft: emptyDraft(), via: "scan", readId: null }, "SCAN"],
  [{ kind: "identity", draft: emptyDraft(), via: "byhand", readId: null }, "BY_HAND"],
  [{ kind: "incomplete", draft: emptyDraft(), via: "scan" }, "SCAN"],
  [{ kind: "incomplete", draft: emptyDraft(), via: "byhand" }, "BY_HAND"],
  [{ kind: "unidentified", draft: emptyDraft() }, "BY_HAND"],
  [{ kind: "plusOne", lotId: "l" }, null],
] as const)("%j → %s", (source, via) => expect(addedVia(source)).toBe(via));
```

**Steps**
- [ ] Write both tests and watch them fail.
- [ ] Rewrite the `types.ts` contracts, and implement `matrix.ts` and `added-via.ts`. The tests pass.
- [ ] Run the Working Rules 4 checks.

**Acceptance**
- `npx vitest run src/components/add-wine/matrix.test.ts src/components/add-wine/added-via.test.ts` is green.
- `rg -n 'kind: "rate"' src/components/add-wine/types.ts src/components/add-wine/matrix.ts` prints nothing.
- tsc is clean outside the debt set, with no errors in `types.ts`, `matrix.ts` or `added-via.ts`.

**Closes**
- **Decisions:** D4 (the matrix; rate → note); D9 (the labels); D12 (the none column).
- **Findings:** byhand-8 (`byHand.footerNote`); entry-4 (phase copy); sources-8 (the tasted `inFlight` type).
- **Screen:** handoff **M**.
- **Spec:** §C.1, §C.2.

---
### F12 — `canScan`, downscale, sheet state, the knowledge rule

**Depends on:** F11

**OWNS**
- create `src/components/add-wine/use-can-scan.ts`
- create `src/components/add-wine/use-can-scan.test.ts`
- modify `src/components/add-wine/use-camera.ts`
- modify `src/components/add-wine/use-camera.test.ts`
- create `src/components/add-wine/downscale-image.ts`
- modify `src/components/scan/scan-button.tsx`
- create `src/components/add-wine/sheet-state.ts`
- create `src/components/add-wine/sheet-state.test.ts`
- create `src/components/add-wine/flight-knowledge.ts`
- create `src/components/add-wine/flight-knowledge.test.ts`

**Round-1:**
- **Replaces** round 1's touch-only routing (`startViewFor(start, isTouchPrimary())` and the header button's touch aria-label) with `canScan` (D5).
- **Keeps** round 1's 1600 px JPEG camera capture; `MAX_SIDE` now imports `READ_MAX_SIDE`.

**Does**
- **`use-can-scan.ts`** (spec §C.3).
  - `detectCanScan(env)` is verbatim.
  - `forcedCanScan(env: { NODE_ENV?: string; NEXT_PUBLIC_FORCE_CAN_SCAN?: string }): boolean` is true only when `NODE_ENV !== "production"` and the flag is `"1"`.
  - `useCanScan(): boolean | null`:
    - keeps a module-level cache;
    - checks the forced value first — call it with the literal `process.env.NODE_ENV` and `process.env.NEXT_PUBLIC_FORCE_CAN_SCAN` so Next inlines them;
    - otherwise calls `detectCanScan({ matchMedia: window.matchMedia.bind(window), mediaDevices: navigator.mediaDevices })`;
    - re-runs on a `(pointer: coarse)` change and on the `mediaDevices` `devicechange` event.
- **`use-camera.ts`.**
  - `MAX_SIDE` = `READ_MAX_SIDE` from `./downscale-image`.
  - `startViewFor(start: AddWineStart | undefined, canScan: boolean): "camera" | "cellar" | "byhand" | "desktop"`:
    - `cellar` and `byhand` open those views;
    - `camera`, `search` and undefined open the camera when `canScan` is true, otherwise the laptop view.
  - `homeViewFor(canScan)`.
  - Unchanged: `useMediaQuery` (the shared width hook, D14), `cameraSupported` and `useCamera`.
  - Mark `TOUCH_PRIMARY_QUERY`, `isTouchPrimary`, `useTouchPrimary`, `viewForDevice` and `DeviceRoutedView` as `/** @deprecated removed in S6 */`.
- **`downscale-image.ts`.** Spec §A.4, verbatim: `READ_MAX_SIDE`, `ImageDecodeError`, `downscaleForRead`.
- **`scan-button.tsx`** (spec §C.3, consumer table).
  - `useCanScan()` decides the icon and label:

    | `useCanScan()` | Icon | aria-label |
    |---|---|---|
    | true | lucide `Camera` | "Scan a label" |
    | false | lucide `ImagePlus` (round 1's mouse glyph, so a mouse device never swaps after hydration) | "Upload a label photo" |
    | null | today's CSS `pointer-coarse` glyph swap | "Scan or upload a label" |

  - Destination logic is unchanged.
- **`sheet-state.ts`** (spec §C.4).
  - `SheetView`, `ScanItem`, `ByHandSession` and `SheetState` are spec §C.4 verbatim, including `start`, `positionOverride`, `addedRowKeys`, `lastRack` and `closing`.
  - Add the action union and the selectors below.
  - The reducer encodes rules 1–10:
    1. A by-hand session is reused when `openByHand` repeats the same origin; the passed draft is then ignored.
    2. Items leave `read` or `pending` only through `itemAdded`.
    3. A failed row is never cleared by another item's actions.
    4. `adoptFailed` resets `adopted` and returns to `choose`.
    5. `requestClose` sets `closeAsk` when `unfinishedCount > 0`; otherwise it sets `closing: true`.
    6. `back` pops the history and skips `reading`, `lot` and `choose`. An empty history goes to the home view.
    7. `enqueue` with more than one item sets `multi: true` (spec §C.4 rule 3).
    8. `positionAdvanced` sets `positionOverride` and never touches `requested`. `rowAdded` appends its key to `addedRowKeys`.
  - `itemRowCopy` follows the spec §C.5 A4 table:

    | Item | Label | Actions |
    |---|---|---|
    | added | its label; detail "glass N" for a flight, or "Added to the catalog" / "Already in the catalog" for the catalog | — |
    | incomplete | "{title} · {describeUnread(missing)}" | fix |
    | pending | "{title} · {describeUnread(missing)}" | fix, remove |
    | failed | "Couldn't read this photo" | retry, remove |
    | uploading or reading | "Reading the label…" | — |

  - `routeAdd` decides `choose` for any add with no destination. A lot with no destination is never written.
  - `stackPartialRead(s, missing, matrix)` = `s.multi && missing.length > 0 && matrix.partialRead.stacked === "pending-row"`.
  - `markAddedInFlight(groups, keys)` returns the groups with every row whose key (`lot:<id>`, `wine:<catalogWineId>`) is in `keys` marked `inFlight: true`.
- **`flight-knowledge.ts`** (spec §C.9). `callerKnowsWine` is verbatim, and it decides both the in-flight marker and the glass number. There is no semi-blind or open exception (D10).

**Interfaces — produces**
```ts
// use-can-scan.ts
export async function detectCanScan(env: { matchMedia: (q: string) => { matches: boolean }; mediaDevices: MediaDevices | undefined }): Promise<boolean>;
export function forcedCanScan(env: { NODE_ENV?: string; NEXT_PUBLIC_FORCE_CAN_SCAN?: string }): boolean;
export function useCanScan(): boolean | null;
// use-camera.ts
export function startViewFor(start: AddWineStart | undefined, canScan: boolean): "camera" | "cellar" | "byhand" | "desktop";
export function homeViewFor(canScan: boolean): "camera" | "desktop";
export function useMediaQuery(query: string): boolean;   // unchanged
// downscale-image.ts — spec §A.4
// sheet-state.ts
export type SheetAction =
  | { type: "canScanResolved"; canScan: boolean }
  | { type: "go"; view: SheetView }
  | { type: "back" }
  | { type: "setMulti"; multi: boolean }
  | { type: "enqueue"; items: { id: string; photoUrl: string; blob: Blob }[] }
  | { type: "itemUploaded"; id: string; imagePath: string }
  | { type: "itemRead"; id: string; read: LabelPhotoRead; stack: boolean }   // stack → a pending row, no confirm view
  | { type: "itemFailed"; id: string; error?: string }
  | { type: "itemRetry"; id: string }
  | { type: "itemRemove"; id: string }
  | { type: "itemAdded"; id: string | null; added: AddedWine }
  | { type: "itemAddFailed"; id: string; error: string }
  | { type: "openByHand"; origin: ByHandSession["origin"]; draft: WineIdentityDraft; focusField: WineFieldKey | null; unidentified?: boolean }
  | { type: "byHandChange"; draft: WineIdentityDraft }
  | { type: "byHandUnidentified"; on: boolean }
  | { type: "byHandAttempted"; focusField: WineFieldKey | null }
  | { type: "byHandDiscard" }
  | { type: "byHandSaved" }
  | { type: "searchQuery"; query: string }
  | { type: "desktopQuery"; query: string }
  | { type: "desktopFocus"; row: number }
  | { type: "consume"; surface: "desktop" | "cellar"; consume: boolean }
  | { type: "cellarFilter"; filter: CellarFilter }
  | { type: "cellarSelect"; lotId: string | null }
  | { type: "openLot"; source: AddSource }
  | { type: "lotField"; field: "quantity" | "rack" | "price"; value: number | string }
  | { type: "choose"; source: AddSource | null; itemId: string | null; title: string; missing: WineFieldKey[] }
  | { type: "adopt"; destination: AddWineDestination }
  | { type: "adoptFailed"; error: string }
  | { type: "followUp"; catalogWineId: string; title: string; written: boolean }
  | { type: "followUpDone" }
  | { type: "requestClose" }
  | { type: "cancelClose" }
  | { type: "discardAndClose" }
  | { type: "positionAdvanced"; position: number }
  | { type: "rowAdded"; key: string }
  | { type: "error"; error: string | null };
export function initialSheetState(p: { destination: AddWineDestination | null; options: AddWineOpenOptions; canScan: boolean | null; initialLot?: AddSource | null }): SheetState;
export function sheetReducer(s: SheetState, a: SheetAction): SheetState;
export function currentDestination(s: SheetState): AddWineDestination | null;   // adopted ?? requested
export function unfinishedCount(s: SheetState): number;
export function footerCount(s: SheetState): number;                              // added + incomplete flight glasses
export type ItemRowCopy = { tone: "added" | "incomplete" | "pending" | "failed" | "reading"; label: string; detail: string | null; actions: ("fix" | "remove" | "retry")[] };
export function itemRowCopy(item: ScanItem, destination: AddWineDestination | null): ItemRowCopy;
export function routeAdd(s: SheetState, source: AddSource): { next: "choose" | "lot" | "catalog-then-lot" | "note" | "write" };
export function stackPartialRead(s: SheetState, missing: readonly WineFieldKey[], matrix: SheetMatrix): boolean;
export function markAddedInFlight(groups: SearchGroups, keys: readonly string[]): SearchGroups;
// flight-knowledge.ts
export function callerKnowsWine(w: { hostId: string; wineSource: WineSourceMode; isRevealed: boolean; contributorUserId: string | null }, userId: string): boolean;
```
S5a and S5b may add actions to `SheetAction`, but never rename or remove one.

**Tests (write first)**

`src/components/add-wine/use-can-scan.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { detectCanScan, forcedCanScan } from "./use-can-scan";

const mm = (coarse: boolean) => () => ({ matches: coarse });
const devices = (kinds: string[], extra: Record<string, unknown> = {}) =>
  ({ enumerateDevices: async () => kinds.map((kind) => ({ kind })), getUserMedia: async () => ({}), ...extra }) as unknown as MediaDevices;

describe("detectCanScan (D5)", () => {
  it("coarse pointer + a videoinput", async () => expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: devices(["audioinput", "videoinput"]) })).toBe(true));
  it("coarse pointer, no videoinput", async () => expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: devices(["audioinput"]) })).toBe(false));
  it("fine pointer", async () => expect(await detectCanScan({ matchMedia: mm(false), mediaDevices: devices(["videoinput"]) })).toBe(false));
  it("no enumerateDevices → getUserMedia presence", async () =>
    expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: { getUserMedia: async () => ({}) } as unknown as MediaDevices })).toBe(true));
  it("enumerateDevices throws → getUserMedia presence", async () =>
    expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: devices([], { enumerateDevices: async () => { throw new Error("denied"); } }) })).toBe(true));
  it("no mediaDevices", async () => expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: undefined })).toBe(false));
});

it("forcedCanScan only outside production", () => {
  expect(forcedCanScan({ NODE_ENV: "development", NEXT_PUBLIC_FORCE_CAN_SCAN: "1" })).toBe(true);
  expect(forcedCanScan({ NODE_ENV: "production", NEXT_PUBLIC_FORCE_CAN_SCAN: "1" })).toBe(false);
  expect(forcedCanScan({ NODE_ENV: "development" })).toBe(false);
});
```

`src/components/add-wine/use-camera.test.ts`: replace the touch-based `startViewFor`/`homeViewFor`/`viewForDevice` cases (:41-57) with the cases below. Keep the file's other cases.
```ts
import { describe, expect, it } from "vitest";
import { homeViewFor, startViewFor } from "./use-camera";

describe("routing by canScan (D5)", () => {
  it.each([
    ["cellar", false, "cellar"], ["byhand", true, "byhand"], ["camera", true, "camera"], ["search", true, "camera"],
    [undefined, true, "camera"], ["camera", false, "desktop"], ["search", false, "desktop"], [undefined, false, "desktop"],
  ] as const)("start %s canScan %s → %s", (start, canScan, view) => expect(startViewFor(start, canScan)).toBe(view));
  it("home", () => expect([homeViewFor(true), homeViewFor(false)]).toEqual(["camera", "desktop"]));
});
```

`src/components/add-wine/sheet-state.test.ts`
```ts
import { describe, expect, it } from "vitest";
import type { LabelPhotoRead } from "@/app/scan/actions";
import { emptyDraft } from "../../lib/wine-identity/complete";
import { sheetMatrix } from "./matrix";
import {
  currentDestination, footerCount, initialSheetState, itemRowCopy, markAddedInFlight, routeAdd, sheetReducer, stackPartialRead, unfinishedCount,
  type ScanItem, type SheetAction, type SheetState,
} from "./sheet-state";
import type { AddWineDestination, SearchGroups } from "./types";

const flight: AddWineDestination = { kind: "flight", tastingId: "t1", tastingName: "Barolo night", revealMode: "BLIND", wineSource: "HOST_PROVIDES", position: 4 };
const partial: LabelPhotoRead = {
  ok: true, readId: "r1",
  draft: { ...emptyDraft(), producer: { kind: "existing", id: "p", name: "Cigliuti" }, colour: "RED", style: "STILL", countryId: "it", regionId: "pie", appellationId: "bbr", blend: [{ grape: { kind: "existing", id: "neb", name: "Nebbiolo" }, percentage: null }] },
  missing: ["vintage"], match: null, display: { title: "Cigliuti, Barbaresco", meta: "Barbaresco DOCG · Piedmont · Italy · Nebbiolo", newProducer: false }, confidence: "high",
};
const run = (s: SheetState, ...actions: SheetAction[]) => actions.reduce(sheetReducer, s);
const scanned = (destination: AddWineDestination | null, n = 1) =>
  run(initialSheetState({ destination, options: {}, canScan: true }),
    { type: "enqueue", items: Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, photoUrl: `blob:${i + 1}`, blob: new Blob() })) });

describe("sheetReducer (spec C.4)", () => {
  it("edits survive navigation (RC8)", () => {
    let s = run(scanned(flight), { type: "itemUploaded", id: "i1", imagePath: "catalog/staging/u/scan-1.jpg" }, { type: "itemRead", id: "i1", read: partial, stack: false });
    expect(s.view).toBe("confirm");
    s = run(s, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: partial.draft, focusField: "vintage" });
    s = run(s, { type: "byHandChange", draft: { ...s.byHand!.draft, regionId: "pie2", appellationId: "bbr2", wineName: "Serraboella" } });
    s = run(s, { type: "back" });
    expect(s.view).toBe("confirm");
    s = run(s, { type: "openByHand", origin: { kind: "item", itemId: "i1" }, draft: partial.draft, focusField: "vintage" });
    expect(s.view).toBe("byhand");
    expect(s.byHand!.draft).toMatchObject({ regionId: "pie2", appellationId: "bbr2", wineName: "Serraboella" });
  });
  it("a failed add keeps the item and its error", () => {
    const s = run(scanned({ kind: "cellar" }), { type: "setMulti", multi: true }, { type: "itemRead", id: "i1", read: partial, stack: true }, { type: "itemAddFailed", id: "i1", error: "This wine needs a vintage." });
    expect(s.items[0]).toMatchObject({ id: "i1", status: "pending", error: "This wine needs a vintage." });
  });
  it("a failed chooser add resets adopted and returns to choose (scan-4)", () => {
    let s = run(initialSheetState({ destination: null, options: {}, canScan: true }),
      { type: "choose", source: { kind: "catalog", catalogWineId: "c1", via: "scan" }, itemId: null, title: "Vietti, Barolo 2017", missing: [] },
      { type: "adopt", destination: flight });
    expect(currentDestination(s)).toEqual(flight);
    s = run(s, { type: "adoptFailed", error: "This tasting is finished — reopen it to add wines." });
    expect([s.adopted, s.view, s.error]).toEqual([null, "choose", "This tasting is finished — reopen it to add wines."]);
  });
  it("a failed read keeps its row while the queue drains (scan-8)", () => {
    const s = run(scanned({ kind: "catalog" }, 3), { type: "itemFailed", id: "i2" }, { type: "itemRead", id: "i1", read: partial, stack: true }, { type: "itemRead", id: "i3", read: partial, stack: true });
    expect(s.items.map((i) => i.status)).toEqual(["pending", "failed", "pending"]);
  });
  it("Done with unfinished rows asks first; an incomplete flight glass never counts (D7)", () => {
    let s = run(scanned({ kind: "cellar" }), { type: "itemRead", id: "i1", read: partial, stack: true }, { type: "requestClose" });
    expect([s.closeAsk, s.closing]).toEqual([{ unfinished: 1 }, false]);
    s = run(scanned(flight), { type: "itemAdded", id: "i1", added: { label: "Cigliuti, Barbaresco", destination: "flight", catalogWineId: null, glass: 4, wineId: "w4", incomplete: { missing: ["vintage"] } } }, { type: "requestClose" });
    expect([unfinishedCount(s), s.closeAsk, s.closing]).toEqual([0, null, true]);
  });
  it("routeAdd never pours a lot without a destination (D12)", () => {
    const none = initialSheetState({ destination: null, options: {}, canScan: false });
    expect(routeAdd(none, { kind: "lot", lotId: "l1", consume: true })).toEqual({ next: "choose" });
    const cellar = initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: false });
    expect(routeAdd(cellar, { kind: "catalog", catalogWineId: "c1", via: "search" })).toEqual({ next: "lot" });
    expect(routeAdd(cellar, { kind: "identity", draft: partial.draft, via: "byhand", readId: null })).toEqual({ next: "catalog-then-lot" });
    expect(routeAdd(cellar, { kind: "plusOne", lotId: "l1" })).toEqual({ next: "write" });
    expect(routeAdd(initialSheetState({ destination: { kind: "note" }, options: {}, canScan: false }), { kind: "catalog", catalogWineId: "c1", via: "search" })).toEqual({ next: "note" });
    expect(routeAdd(initialSheetState({ destination: flight, options: {}, canScan: false }), { kind: "lot", lotId: "l1", consume: true })).toEqual({ next: "write" });
  });
  it("resolves the first view once canScan is known (C.3)", () => {
    let s = initialSheetState({ destination: flight, options: { start: "camera" }, canScan: null });
    expect(s.view).toBe("resolving");
    s = run(s, { type: "canScanResolved", canScan: false });
    expect(s.view).toBe("desktop");
  });
  it("a laptop queue of partial cellar reads stacks as pending rows (C.4 rule 3)", () => {
    const cellarMatrix = sheetMatrix({ kind: "cellar" }, false);
    let s = run(initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: false }),
      { type: "enqueue", items: [{ id: "i1", photoUrl: "blob:1", blob: new Blob() }, { id: "i2", photoUrl: "blob:2", blob: new Blob() }] });
    expect(s.multi).toBe(true);
    expect(stackPartialRead(s, partial.missing, cellarMatrix)).toBe(true);
    s = run(s, { type: "itemRead", id: "i1", read: partial, stack: true }, { type: "itemRead", id: "i2", read: partial, stack: true });
    expect(s.items.map((i) => i.status)).toEqual(["pending", "pending"]);
    const single = run(initialSheetState({ destination: { kind: "cellar" }, options: {}, canScan: false }), { type: "enqueue", items: [{ id: "i1", photoUrl: "blob:1", blob: new Blob() }] });
    expect(stackPartialRead(single, partial.missing, cellarMatrix)).toBe(false);
  });
  it("itemRowCopy covers every tone; footerCount counts incomplete flight glasses (A4)", () => {
    const item = (o: Partial<ScanItem>): ScanItem => ({ id: "i", photoUrl: "blob:x", blob: null, imagePath: null, status: "reading", read: null, draft: null, added: null, error: null, ...o });
    expect(itemRowCopy(item({ status: "added", added: { label: "Vietti, Barolo 2017", destination: "flight", catalogWineId: "c", glass: 3, wineId: "w" } }), flight)).toEqual({ tone: "added", label: "Vietti, Barolo 2017", detail: "glass 3", actions: [] });
    expect(itemRowCopy(item({ status: "incomplete", read: partial }), flight)).toMatchObject({ tone: "incomplete", label: "Cigliuti, Barbaresco · no vintage read", actions: ["fix"] });
    expect(itemRowCopy(item({ status: "pending", read: partial }), { kind: "cellar" })).toMatchObject({ tone: "pending", actions: ["fix", "remove"] });
    expect(itemRowCopy(item({ status: "failed" }), null)).toEqual({ tone: "failed", label: "Couldn't read this photo", detail: null, actions: ["retry", "remove"] });
    expect(itemRowCopy(item({ status: "uploading" }), null)).toMatchObject({ tone: "reading", label: "Reading the label…" });
    const s = run(scanned(flight, 2),
      { type: "itemAdded", id: "i1", added: { label: "Vietti", destination: "flight", catalogWineId: "c", glass: 4, wineId: "w4" } },
      { type: "itemAdded", id: "i2", added: { label: "Cigliuti", destination: "flight", catalogWineId: null, glass: 5, wineId: "w5", incomplete: { missing: ["vintage"] } } });
    expect(footerCount(s)).toBe(2);
  });
  it("a poured row is disabled at once; the position advances without touching requested (C.4 rule 11)", () => {
    const groups: SearchGroups = { cellar: [], tasted: [], catalog: [{ catalogWineId: "c1", title: "Vietti, Barolo 2017", subtitle: null, imageUrl: null, avgScore: null, noteCount: 0, inFlight: false, producerId: "p", wineName: "Castiglione", appellationId: "a", vintageLabel: "2017" }] };
    const s = run(initialSheetState({ destination: flight, options: {}, canScan: false }), { type: "rowAdded", key: "wine:c1" }, { type: "positionAdvanced", position: 5 });
    expect(markAddedInFlight(groups, s.addedRowKeys).catalog[0].inFlight).toBe(true);
    expect([currentDestination(s), s.requested]).toEqual([{ ...flight, position: 5 }, flight]);
  });
});
```

`src/components/add-wine/flight-knowledge.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { callerKnowsWine } from "./flight-knowledge";

const w = (o: Partial<Parameters<typeof callerKnowsWine>[0]> = {}) =>
  ({ hostId: "h", wineSource: "HOST_PROVIDES", isRevealed: false, contributorUserId: null, ...o }) as Parameters<typeof callerKnowsWine>[0];
describe("callerKnowsWine (sources-3, create-3)", () => {
  it("host of a host-provides tasting", () => expect(callerKnowsWine(w(), "h")).toBe(true));
  it("bring-your-own host: a guest's bottle is hidden, their own is known", () => {
    expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "g" }), "h")).toBe(false);
    expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "h" }), "h")).toBe(true);
  });
  it("the contributor", () => expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "g" }), "g")).toBe(true));
  it("anyone, once revealed", () => expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "g", isRevealed: true }), "x")).toBe(true));
  it("no semi-blind exception: a hidden candidate is not known (D10)", () =>
    expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "g" }), "x")).toBe(false));
});
```

**Steps**
- [ ] Write the four test files and watch them fail.
- [ ] Implement `use-can-scan.ts`, `downscale-image.ts`, `sheet-state.ts` and `flight-knowledge.ts`. Edit `use-camera.ts` and `scan-button.tsx`. The tests pass.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- `npx vitest run src/components/add-wine/use-can-scan.test.ts src/components/add-wine/use-camera.test.ts src/components/add-wine/sheet-state.test.ts src/components/add-wine/flight-knowledge.test.ts` is green.
- tsc reports no errors in these OWNS files.

**Closes**
- **Decisions:** D5; D6 (failed-row state); D7 (the close-ask; items survive failures); D10 (the knowledge rule); D12 (`routeAdd`).
- **Findings and root causes:** RC8, scan-4, scan-8, sources-2 (state), sources-3 and create-3 (the rule).
- **Spec:** §A.4, §C.3, §C.4, §C.9 (pure).

---

### F13 — Sheet server actions

**Depends on:** F12, T5

**OWNS**
- modify `src/components/add-wine/actions.ts`
- modify `src/components/add-wine/cellar-actions.ts`
- modify `src/components/add-wine/by-hand-actions.ts`
- create `src/components/add-wine/self-named-appellation.ts`
- create `src/components/add-wine/self-named-appellation.test.ts`
- modify `src/app/tastings/[id]/wines/new/actions.ts` (deletes the deprecated `addTastingWineFromCellarLot` wrapper; nothing else)

**Round-1:**
- **Keeps** round 1's note (rate) rule: an identity is found or created in the catalog before the note opens, now through `upsertCatalogWine`.
- **Keeps** `producerHomeRegion` unchanged. It returns country and region only — round 1's "no producer guessing".

**Does**
- **`addToFlight(destination, source): AddResult`.** Dispatches per the spec §C.1 table, passing `addedVia(source)`:

  | Source | Handler |
  |---|---|
  | `catalog` | `insertTastingWineFromCatalogRow` |
  | `lot` | `insertTastingWineFromLot`, passing its warning through |
  | `identity` | `insertTastingWineFromIdentity` |
  | `unidentified` | `insertTastingWineUnidentified` |
  | `incomplete` | `insertIncompleteGlass`, setting `AddedWine.incomplete` |
  | `plusOne` | error |

  Returns `AddedWine { label, destination: "flight", catalogWineId, glass: position, wineId }`, and revalidates the tasting page as today.
- **`addToCellar(source, lot: { quantity: number; rack: string; price: string; currency: string } | null): AddResult`.**

  | Source | Behaviour |
  |---|---|
  | `catalog` | `addCellarLot({ catalogWineId, ...lot })` |
  | `identity` | `prepareCompleteWine` + `upsertCatalogWine`, then `addCellarLot` with the catalog id only |
  | `plusOne` | `increaseCellarLotQuantity(lotId, 1)`, no lot fields |
  | `lot` | error |

  Returns `AddedWine { destination: "cellar", lotId }`.
- **`addToCatalog(source): AddResult`.**

  | Source | Behaviour |
  |---|---|
  | `identity` | `prepareCompleteWine` + `upsertCatalogWine` → `AddedWine { destination: "catalog", catalogWineId, written }` |
  | `catalog` | `labelFor(catalogWineId)` with `written: false` |
  | anything else | error |

- **`loadCatalogWineDraft(catalogWineId): Promise<WineIdentityDraft | null>`.** Loads the catalog wine with its producer name and blend, then `draftFromCatalogWine`. The shell uses it for "By hand" from a matched read (spec §C.5 A3).
- **`suggestGrapeForAppellation(appellationId)`** (spec §B.8).
  - **Place grapes.** Follow `appellations.wine_place_id` → `wine_place_grapes` with `role = 'PRINCIPAL'` and `permitted`, including grape names and `share_pct`.
  - **Catalog counts.** Up to 500 `catalog_wines` rows with this `appellation_id`, `merged_into is null` and `blind_pending = false`, grouped by `primary_grape_id`, with names.
  - Both go to `pickGrapeSuggestion`.
- **`loadFlightGlassForEdit(wineId)`** wraps `loadFlightGlassCore`.
- **`saveFlightGlass({ wineId, draft, unidentified, leaveForLater })`** wraps `saveFlightGlassCore`.
  - When the result is `finishedIncomplete` and the tasting is running in ASYNC mode, it awaits `maybeAutoRevealWine(supabase, wineId)` from `@/app/tastings/[id]/play/auto-reveal` (T5).
  - It revalidates the tasting page and returns `AddResult`.
- **`searchAddWine`.**
  - Tasted rows carry `inFlight` (sources-8).
  - `search_catalog_wines` returns names only, so after the RPC one `catalog_wines` select `in("id", …)` fills every catalog and tasted row's `producerId`, `wineName`, `appellationId` and `vintageLabel` (spec §C.1).
  - `flightCatalogIds` applies spec §C.9. It loads `host_id` and `wine_source`, plus each wine's `is_revealed` and its contributor's user id, and keeps a catalog id only when `callerKnowsWine` allows it.
- **`cellar-actions.ts`.**
  - In `listCellarForSheet` and `flightGlasses`, both the glass number and `inFlight` follow `callerKnowsWine`.
  - New `ownedBottlesFor(catalogWineId): Promise<{ bottles: number; rack: string | null } | null>` feeds the E1 chooser subtitle.
- **`by-hand-actions.ts`.** Keep `producerSummary`, and add:
  ```ts
  export type ByHandReferences = {
    countries: { id: string; name: string }[];
    regions: { id: string; name: string; countryId: string }[];
    grapes: { id: string; name: string }[];
    typeDesignations: { id: string; name: string; category: string | null; countryId: string | null }[];
  };
  export async function loadByHandReferences(): Promise<ByHandReferences>;   // small tables; type designations .eq("is_active", true).order("sort_order"); page regions with .range if > 1000
  export async function regionSelfNamedAppellation(regionId: string, regionName: string): Promise<{ id: string; name: string } | null>;
  // = findSelfNamedAppellation(region, fetchPage), where fetchPage(from, to) selects appellations
  //   .eq("region_id", regionId).ilike("name", escapeLike(regionName) + "%").order("name").range(from, to).
  // No limit-25 search, so a crowd of earlier-sorting names can never hide the row (RC5).
  ```
- **`self-named-appellation.ts`** (pure; spec §C.5 A7, §D.4 #8):
  ```ts
  export function justTheRegionOption(region: { id: string; name: string }, rows: readonly { id: string; name: string }[]): { id: string; name: string } | null;
  export async function findSelfNamedAppellation(
    region: { id: string; name: string },
    fetchPage: (from: number, to: number) => Promise<{ id: string; name: string }[]>,
    pageSize?: number,                               // default 1000
  ): Promise<{ id: string; name: string } | null>;   // reads pages until a short one, then justTheRegionOption
  export function appellationPlaceholder(hasSelfNamed: boolean): string;            // "Just the region" | "Pick one"
  export function appellationHint(regionName: string | null, hasSelfNamed: boolean): string;
  export function escapeLike(s: string): string;                                      // escapes \ % _
  ```
- **Delete:** `resolveIdentity` and `blendOf` (add-wine/actions.ts:544-594), and the deprecated `addTastingWineFromCellarLot` wrapper in `wines/new/actions.ts`.

**Interfaces — produces**
```ts
export async function addToFlight(destination: Extract<AddWineDestination, { kind: "flight" }>, source: AddSource): Promise<AddResult>;
export async function addToCellar(source: AddSource, lot: { quantity: number; rack: string; price: string; currency: string } | null): Promise<AddResult>;
export async function addToCatalog(source: AddSource): Promise<AddResult>;
export async function loadCatalogWineDraft(catalogWineId: string): Promise<WineIdentityDraft | null>;
export async function suggestGrapeForAppellation(appellationId: string): Promise<{ grape: { id: string; name: string }; source: "place" | "catalog" } | null>;
export async function loadFlightGlassForEdit(wineId: string): Promise<{ draft: WineIdentityDraft; incomplete: boolean; unidentified: boolean; glass: number; canEdit: boolean } | { error: string }>;
export async function saveFlightGlass(input: { wineId: string; draft: WineIdentityDraft; unidentified: boolean; leaveForLater: boolean }): Promise<AddResult>;
export async function ownedBottlesFor(catalogWineId: string): Promise<{ bottles: number; rack: string | null } | null>;
// plus ByHandReferences, loadByHandReferences, regionSelfNamedAppellation, the self-named-appellation.ts exports,
// and the existing searchAddWine / producerHomeRegion / listCellarForSheet / getCellarSummary
```

**Tests (write first)** — `src/components/add-wine/self-named-appellation.test.ts`. The `"use server"` modules have no vitest: the pure rules they call are tested in F6, F11, F12 and here, and V1 items 3, 5, 6, 7, 12, 18 and 19 verify the flows.
```ts
import { describe, expect, it } from "vitest";
import { appellationHint, appellationPlaceholder, escapeLike, findSelfNamedAppellation, justTheRegionOption } from "./self-named-appellation";

describe("the self-named appellation (spec §C.5 A7, RC5)", () => {
  it("justTheRegionOption", () => {
    expect(justTheRegionOption({ id: "r", name: "Bourgogne" }, [{ id: "a1", name: "Bourgogne Aligoté AOC" }, { id: "a2", name: "Bourgogne AOC" }])).toEqual({ id: "a2", name: "Bourgogne AOC" });
    expect(justTheRegionOption({ id: "r", name: "Langhe" }, [{ id: "a1", name: "Barolo DOCG" }])).toBeNull();
  });
  it("page cap: 1364 unordered rows with the self-named row after row 1000", async () => {
    const rows = Array.from({ length: 1364 }, (_, i) => ({ id: `x${i}`, name: `Bourgogne Village ${String(i).padStart(4, "0")} AOC` }));
    rows.splice(1200, 0, { id: "self", name: "Bourgogne AOC" });
    expect(await findSelfNamedAppellation({ id: "r", name: "Bourgogne" }, async (from, to) => rows.slice(from, to + 1))).toEqual({ id: "self", name: "Bourgogne AOC" });
  });
  it("more than 25 earlier-sorting names never hide it", async () => {
    const rows = [...Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, name: `Côtes du Rhône Villages ${i} AOC` })), { id: "self", name: "Rhône AOC" }];
    expect(await findSelfNamedAppellation({ id: "r", name: "Rhône" }, async (from, to) => rows.slice(from, to + 1), 25)).toEqual({ id: "self", name: "Rhône AOC" });
  });
  it("placeholder, hint and escaping", () => {
    expect([appellationPlaceholder(true), appellationPlaceholder(false)]).toEqual(["Just the region", "Pick one"]);
    const base = "Ordered by the region above when there is one; a plain list when there is not. Nothing is selected for you.";
    expect(appellationHint(null, false)).toBe(base);
    expect(appellationHint("Langhe", false)).toBe(`${base} Langhe has no region-wide appellation — pick the one on the label.`);
    expect(appellationHint("Bourgogne", true)).toBe(base);
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});
```

**Steps**
- [ ] Implement the actions above and delete the replaced code.
- [ ] Run `npm test` and the Working Rules 4 checks.

**Acceptance**
- `rg -n "resolveIdentity|blendOf|addTastingWineFromCellarLot|ByHandIdentity" src/components/add-wine/actions.ts "src/app/tastings/[id]/wines/new"` prints nothing.
- `npx vitest run src/components/add-wine/self-named-appellation.test.ts` is green.
- tsc reports no errors in `actions.ts`, `cellar-actions.ts`, `by-hand-actions.ts`, `self-named-appellation.ts` or `wines/new/actions.ts`.
- `rg -n "inFlightVisible|regionAppellationCandidates" src` prints nothing.

**Closes**
- **Decisions:** D2 (the sheet writes); D7 (edit, finish, leave for later); D9 (+1 bottle); D10 (sources-8, and sources-3 server side); D11 (lot dispatch).
- **Findings:** byhand-7 (dispatch); byhand-5 (the self-named lookup behind "Just the region"); sources-2 (the row ids behind the D1 metas).
- **Root cause:** RC5 (a targeted, paged self-named lookup, with its page-cap test).
- **Spec:** §B.8 (server); §B.9 rows for cellar, catalog and note; §C.1 dispatch; §C.8 actions; §C.9 (server).

---
## Track L — Live label verification (main session)

### L1 — Live reads of the label test set, and the resolver fixes they expose

**Depends on:** F7 (committed) and M1 (`label_reads` and `find_producer_by_folded_name` live)

**Who runs it.** The main session makes the live calls (D1; spec §G.5). One fix agent handles the resolver misses; it works fixture-only and has no API access.

**OWNS**
- create `.superpowers/add-wine-v2/vitest.live.config.mts` (gitignored; never committed)
- create `.superpowers/add-wine-v2/live-label-check.test.ts` (gitignored; never committed)
- modify `.superpowers/export-reference-snapshot.mjs` (gitignored)
- create `src/lib/label-scan/__fixtures__/live/*.json`
- create `src/lib/wine-identity/live-replay.test.ts`
- modify `src/lib/wine-identity/__fixtures__/reference-snapshot.json`
- modify `src/lib/wine-identity/resolve.ts`, `src/lib/wine-identity/resolve.test.ts` and `src/lib/label-scan/region-canonical.ts` — the fix agent, for resolver misses only
- modify `src/lib/label-scan/label-read-schema.ts` — only after the owner approves a prompt change (spec §F.3 Q22)

**Round-1:** Touches no round-1 behaviour.

**Does** (spec §G.5 "L1", §A.7)
- Load the `claude-api` skill first.
- **Harness.**
  - `vitest.live.config.mts` aliases `server-only` to `node_modules/server-only/empty.js` and `@` to `src`, and loads `.env.local` through `loadEnvConfig` from `@next/env`. It includes only `live-label-check.test.ts`, with `testTimeout: 120_000`.
  - The check is skipped unless `LABEL_LIVE=1`, and throws if `LABEL_READ_FIXTURE` is set.
  - It counts its own calls and stops at 15, printing each call's `usage` as soon as the call returns.
- **Run it once:** `LABEL_LIVE=1 npx vitest run --config .superpowers/add-wine-v2/vitest.live.config.mts`. Each of the 15 entries gets exactly one `readLabel` call, following spec §G.5 L1 steps 1–4: insert the `label_reads` row with the service-role client, then resolve, match, and diff against `expected`.
- **Report**, pasted into the session log:
  - the per-entry, per-field table;
  - hit rates for appellation, region, producer, grape, vintage, colour and style;
  - how often the confident match found each entry's `catalogWineId`;
  - total tokens, and the result of spec §A.7's cost query.
- **Record.**
  - Copy each stored `read` into `src/lib/label-scan/__fixtures__/live/<slug>.json`, named by producer and vintage (e.g. `saint-georges-2012.json`).
  - Re-run the snapshot export with every country, region, appellation, producer and grape the reads touch.
  - Write `live-replay.test.ts`: for each fixture, `resolveLabelRead` against the snapshot keeps today's resolved fields.
- **Fix resolver misses** (the fix agent). A resolver miss is a read that carried the right text but did not resolve. For each one:
  1. Add a failing assertion to `live-replay.test.ts` or `resolve.test.ts`.
  2. Fix `resolve.ts` or `region-canonical.ts`.
  3. Re-run `npx vitest run src/lib/wine-identity`.

  No re-read is needed: the stored read replays for free.
- **Model misses** — the read's text itself was wrong — go to the owner, with their tokens. A prompt or schema change needs the owner's yes, and its re-reads count against the 30-read cap.

**Tests:** `live-replay.test.ts` (committed, zero API cost) and the resolver assertions the fix agent adds. The live check itself is gitignored and never runs in `npm test`.

**Steps**
- [ ] Write the config and the check. Run it with `LABEL_LIVE` unset: every case is skipped and no call is made.
- [ ] Run it once with `LABEL_LIVE=1`. Paste the report and the token log.
- [ ] Record the fixtures and the snapshot, and write `live-replay.test.ts`.
- [ ] The fix agent fixes each resolver miss, test first. `npm test` stays green.
- [ ] Report the model misses to the owner.

**Acceptance**
- `select count(*) from label_reads where model = 'claude-sonnet-5'` returns at most 15 after L1, and at most 30 by the end of V3.
- Every live read has a fixture under `__fixtures__/live/`, and `npx vitest run src/lib/wine-identity/live-replay.test.ts` is green.
- No resolver miss is left open. Every model miss is listed for the owner.

**Closes:** D1 (the reader and the resolver verified end to end with real reads, token usage logged); the owner's "I want appellation all the time", measured as a hit rate; spec §G.5 (L1), §A.7 (real cost).

---

## Track S — The add-wine sheet (sequential chain, after F)

The S chain rebuilds the sheet in this order:
- **S1–S4** rewrite the views against the F11 contracts and the F12 state. By hand splits into its pure logic (S3a) and its form (S3b).
- **S5a–S5c** rewire the shell in three compiling steps: the adds hook `use-sheet-adds.ts` (S5a), the shell `add-wine-sheet.tsx` (S5b), then the provider, the launchers and the deprecation sweep (S5c).
- **S6** moves the create-sheet step onto the matrix.
- **S7** changes the lobby's Wines card.

Only S5b touches `add-wine-sheet.tsx`. Until then it is compile debt (Working Rule 4).

Every view reads the matrix and none branches on the destination kind. This is checked by grep gate 4 in spec §G.1.

---

### S1 — Camera, read-and-confirm, the multi stack, the follow-up, the chooser

**Depends on:** F13

**OWNS**
- modify `src/components/add-wine/camera-view.tsx`
- create `src/components/add-wine/read-confirm.tsx`
- delete `src/components/add-wine/scan-confirm.tsx`
- modify `src/components/add-wine/multi-add-stack.tsx`
- create `src/components/add-wine/follow-up-view.tsx`
- modify `src/components/add-wine/types.ts` — the prop types of these four views only

**Round-1**
- **Replaces** round 1's confirm screen:
  - the alternates list and "Use this";
  - the text-link recovery "Rescan · Search by name · By hand";
  - a chip computed from confidence alone.

  It becomes one match card, three outlined buttons and a completeness chip (D6). It also **replaces** the camera's Catalog chip (D4).
- **Keeps** round 1's hidden Many for the single-wine destination (now `note`), plus the camera copy "Camera not available — use Library or search", "Fill the frame with the label" and "Flash auto".

**Does** (spec §C.5 A2, A3/D2b, A4, D3, E1/E1b)

**CameraView** (A2; B2, C2 and D2 use the same view)

Props:
```ts
export type CameraViewProps = {
  matrix: SheetMatrix; destination: AddWineDestination | null; multi: boolean; items: ScanItem[]; addedCount: number;
  onCapture: (blob: Blob) => void; onLibrary: (files: File[]) => void;
  onOpenSearch: () => void;          // the shell unhides the parked search and focuses its input in the same tap
  onChip: (chip: "cellar" | "byhand") => void; onMany: () => void; onDone: () => void;
  onItemAction: (itemId: string, action: "fix" | "remove" | "retry") => void;
};
```

- **Search field.** Above the viewfinder, a field-styled button shows `matrix.searchPlaceholder` ("Or search wine catalog") and calls `onOpenSearch`.
- **Viewfinder.** 16 px radius, gold corner brackets, "Fill the frame with the label", and the "Flash auto" chip at the top left.
- **Shutter row.**
  - A 74 px shutter.
  - Library on the left. It accepts multiple files when `matrix.upload.multiple`.
  - Many on the right, shown only when `matrix.showMany`.
- **Source chips.** One per `matrix.chips` ("My cellar", "By hand"). There is no Catalog chip.
- **In Many.** The multi stack sits above the viewfinder. For a flight the line reads "Next bottle · glass N", and the footer reads "Done · {addedCount} wines added".
- **Unchanged:** the denied or busy camera fallback. Reword the FastCork comment at :24.

**ReadConfirm** (A3 = D2b, plus the E1/E1b footer)

Props:
```ts
export type ReadConfirmProps = {
  item: ScanItem; matrix: SheetMatrix; destination: AddWineDestination | null; canScan: boolean;
  flightHint: FlightHint | null;
  cellarHint: { owned: { bottles: number; rack: string | null } | null; totalBottles: number } | null;
  sourceIsLot: boolean; busy: boolean; error: string | null;
  onPrimary: () => void; onScanNext: () => void; onFix: () => void; onByHand: () => void;
  onSearch: (query: string) => void; onRescan: () => void; onRetry: () => void; onRemove: () => void;
  onChoose: (choice: "flight" | "cellar" | "note" | "catalog") => void;
};
```

- **States.**
  - `uploading` or `reading`: `ReadingView`, moved here from add-wine-sheet.tsx:991-1008 — the photo, the scanline, `WineGlassLoader` and "Reading the label…".
  - `failed`: an inline row "Couldn't read this photo" with Retry and Remove.
  - `read`: the layout below.
- **Layout.**
  - The photo stays at the top; a light panel fills the lower two-thirds.
  - `display.title` is set in Cormorant at 21 px, with `display.meta` muted below it.
  - A pending producer reads "{name} · new producer".
- **Read chip.**

  | Read | Chip |
  |---|---|
  | `missing` empty, confidence not low | "READ OK" — a gold pill with `--gold-dark` text |
  | `missing` empty, confidence low | "CHECK THE READ" |
  | fields missing | `describeUnread(missing).toUpperCase()`, with a bordered "Fix" beside it |

- **Match card.** Shown only when `item.read.match` is set.
  - The eyebrow is `matrix.confirm.eyebrowMatch`. The card has a gold border, a check disc, `match.title` and `match.meta`.
  - With no match there is no card, and the eyebrow is `matrix.confirm.eyebrowNoMatch`.
  - There is no alternates list.
- **Recovery.** "Wrong bottle?" followed by three equal outlined `Button`s with lucide icons: `RotateCcw` "Rescan", `Search` "Search", `Pencil` "By hand".
  - Search calls `onSearch("{producer} {wineName}")`.
- **Footer, with a destination.**
  - The `matrix.confirm.note` line, when set.
  - The primary button reads `matrix.confirm.primaryMatch` or `primaryNoMatch`.
  - For a flight on a device that can scan, `matrix.footer.secondary` "Add and scan the next" calls `onScanNext`.
- **Footer, with no destination** (E1/E1b, spec §C.5 E1).
  - **The identity.**
    - Match: ✓ "Found in the catalog", the match title and its meta.
    - No match: "Not in the catalog yet", with the read's title and meta.
    - Incomplete: a `describeMissing` line with "Fix".
  - **The recovery row** (spec §2.1 row 6).
  - **"Where does it go?"** followed by these rows:
    1. "Tonight's flight · glass {position}", gold, with `flightHintSubtitle(flightHint)`. Only when `flightHint` exists.
    2. "My cellar".
       - Subtitle when owned: "{n} bottle(s) · rack {R} · pick a rack after", leaving out the rack when it is null.
       - Otherwise: "Quantity and rack next · {totalBottles} bottles".
       - Gold when there is no flight row. Hidden when `sourceIsLot`.
    3. "Rate it now" · "Opens a WSET note for this bottle".
    4. The text row "Just remember it — save to the catalog only". Hidden when `sourceIsLot`.
- **Export.** Export these rows as `Chooser`. S5b's `choose` view reuses them under the header "Add wine".

**MultiAddStack** (A4, dark tone)

- Renders one row per item from `itemRowCopy(item, destination)`.
  - Added: a gold ✓, the label and "glass N".
  - Incomplete or pending: "!", the text and a bordered "Fix"; pending rows also get a remove ✕.
  - Failed: "Couldn't read this photo" · "Retry" · "Remove".
  - Reading: a thumbnail · "Reading the label…".
- Remove the `PendingFixStrip` import and the unused `nextGlass` prop.

**FollowUpView** (D3)

- Props: `{ followUp: { catalogWineId: string; title: string; written: boolean }; onCellar: () => void; onNote: () => void; onDone: () => void }`.
- Header: ✓ "Added to the catalog" when a row was written, otherwise "Already in the catalog".
- The wine's title.
- Rows:
  - "Add it to my cellar" · "Quantity and rack" ›
  - "Taste & rate it now" · "Opens a note on this bottle" ›
- A text button "Done — add another wine".

**Everywhere in S1**

- Delete `scan-confirm.tsx`. Its only importer is `add-wine-sheet.tsx`, which is compile debt until S5b.
- No `destination?.kind ===` or `dest.kind ===`. Read everything from `matrix`, `flightHint` and `sourceIsLot`.
- Use the repo primitives (`Button`, `Badge`, `Card`). Every tap target is at least 44 px, and the Base UI `nativeButton` rule applies.

**Tests:** No vitest; these are components. Their copy comes from the matrix (F11), `itemRowCopy` (F12) and `describeUnread` / `describeMissing` (F1), which are all tested. V1 items 2, 4 and 10, and V2 items 1, 3, 5 and 6, verify them.

**Steps**
- [ ] Add the prop types to `types.ts`.
- [ ] Rewrite `camera-view.tsx` and `multi-add-stack.tsx`.
- [ ] Create `read-confirm.tsx` and `follow-up-view.tsx`.
- [ ] Delete `scan-confirm.tsx`.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- tsc reports no errors in these OWNS files. `add-wine-sheet.tsx` may still be red.
- `rg -n "destination\??\.kind ===|dest\.kind ===|Use this|Search by name|HARD TO READ" src/components/add-wine/camera-view.tsx src/components/add-wine/read-confirm.tsx src/components/add-wine/multi-add-stack.tsx src/components/add-wine/follow-up-view.tsx` prints nothing.
- `npx eslint` on OWNS is clean.

**Closes**
- **Decisions:** D4 (camera chips), D6, D12 (chooser UI).
- **Screens:** A2, A3, A4 (phone), D2b, D3, E1, E1b, B2, C2, D2.
- **Findings:** scan-1 (one card), scan-3 ("new producer"), scan-8 (failed row UI), entry-4 (chooser subtitle).
- **Root cause:** RC12 (recovery on the chooser).
- **Spec:** §2.1 rows 5, 6, 9.

---

### S2 — Search, the cellar source, the lot step

**Depends on:** S1

**OWNS**
- modify `src/components/add-wine/search-view.tsx`
- modify `src/components/add-wine/cellar-view.tsx`
- create `src/components/add-wine/cellar-lot-step.tsx`
- delete `src/components/add-wine/destination-footer.tsx`
- modify `src/components/add-wine/row-format.ts`
- modify `src/components/add-wine/row-format.test.ts`
- modify `src/components/add-wine/types.ts` — these views' prop types only

**Round-1**
- **Keeps** round 1's identical + disc on every phone row, and the lot step's copy and merge card.
- **Replaces** the in-list consume checkbox with a footer strip (A5).
- **Replaces** the cellar view's destination modes (the catalog no-op mode and the disabled `none` mode) with `matrix.cellarSource`.

**Does** (spec §C.5 A5, A6, the B1–B3 lot-step bullet)

**SearchView** (A5)

Props:
```ts
export type SheetRowAction = ReturnType<SheetMatrix["row"]>["action"];
export type SearchViewProps = {
  matrix: SheetMatrix; query: string; onQuery: (q: string) => void; inputRef: React.Ref<HTMLInputElement>;
  groups: SearchGroups | null; loading: boolean; consume: boolean; onConsume: (v: boolean) => void;
  onRow: (row: { source: "lot" | "catalog" | "tasted"; catalogWineId: string; lotId?: string }, action: SheetRowAction) => void;
  onByHand: () => void;
};
```

- **Mounting.** The shell keeps the view mounted and hidden. The query lives in sheet state.
- **Count and groups.**
  - The count reads `matrix.resultCount(n)`.
  - Groups follow `matrix.searchGroups` order: "In your cellar" · "In the catalog" · "You have tasted before".
  - "In your cellar" carries `matrix.cellarGroupSubtitle` when set.
- **Row metas.** `searchCellarMeta`, `catalogMeta` and `tastedMeta`.
- **Dedupe.** A wine you own is listed once, as its lot rows.
- **Rows.**
  - `matrix.row(...)` decides each row's action and affordance: a + disc or a chevron.
  - Disabled rows show `matrix.inFlightMeta`.
  - Tasted rows use their own `inFlight`. Delete the borrowed `inFlightIds` set (search-view.tsx:126-129).
- **Footer strip.**
  - When any lot row is listed and `matrix.consumeLabel` is set: `ConsumeCheckbox`, checked by default.
  - Then "Nothing matches?" · "Add it by hand".
  - The empty state still reads "No matches".
- **Removed:** the inline Scan button for touch devices without a camera (search-view.tsx:113). The header Scan pill belongs to the shell (S5b).

**CellarView** (A6)

Props:
```ts
export type CellarViewProps = {
  matrix: SheetMatrix; sheet: CellarSheet | null; filter: CellarFilter; onFilter: (f: CellarFilter) => void;
  selectedLotId: string | null; onSelect: (lotId: string | null) => void; consume: boolean; onConsume: (v: boolean) => void;
  onAdd: () => void;
};
```

- **Header.** Rendered by the shell: eyebrow = the matrix title, title "From my cellar", trailing "{n} bottles".
- **Filters and rows.**
  - Filter chips: "Drink now {n}", "Rack A", and so on.
  - Each row shows its title and `cellarLotMeta(lot)`.
  - In-flight lots are disabled, with "in flight".
  - Tapping a row selects it (✓).
- **Footer.** `ConsumeCheckbox` with `matrix.consumeLabel` (checked), then a primary button reading `matrix.footer.primary`.
- **Empty cellar.** Unchanged: "Your cellar has no bottles in stock." + "Scan or search instead".
- **Cleanup.**
  - Delete the catalog and `none` modes (cellar-view.tsx:125-168, 207-217).
  - Keep exporting `ConsumeCheckbox`.

**CellarLotStep** (the lot step)

- **Origin.** Today's `DestinationFooter` cellar branch (destination-footer.tsx:138-344), renamed.
- **Copy.** Unchanged:
  - "Into your cellar"
  - "How many bottles, and where do they live? Price is optional."
  - a Bottles stepper and a Rack datalist
  - "Price per bottle · {currency} (optional)"
  - the merge card: "You already have this wine in your cellar." / "Add N to the existing lot" / "Keep as a separate lot"
- **Fields.** Controlled from sheet state: `quantity`, `rack`, `price`, `onField`.
- **Source and duplicate check.**
  - The source is always `{ kind: "catalog", catalogWineId }`. S5a writes an identity to the catalog first.
  - So the duplicate check (`findMyCellarLotsForWine`) always runs.
  - No secondary button: `matrix.footer.secondary` is null for the cellar, and Many covers repeated scans.
- **Deleted:** the unreachable flight and catalog/rate branches (destination-footer.tsx:35-98).

**row-format.ts**

- `cellarLotMeta(lot)` reads "rack B · 2 bottles · already glass 1" when `lot.inFlight && lot.glass != null`. Otherwise it reads as today.

**Tests** — add to `src/components/add-wine/row-format.test.ts` as a regression pin. `cellarLotMeta` already names the glass only when `inFlight && glass != null` (row-format.ts:89-100), so this test passes before any change. There is no red step.
```ts
import { cellarLotMeta, type CellarSheetLot } from "./row-format";

const lot: CellarSheetLot = { lotId: "l1", catalogWineId: "c1", title: "Vietti, Barolo Castiglione 2017", imageUrl: null, rack: "B", quantity: 2, drinkNow: true, inFlight: true, glass: 1 };
it("an in-flight lot names its glass only when the caller may know it (C.9)", () => {
  expect(cellarLotMeta(lot)).toBe("rack B · 2 bottles · already glass 1");
  expect(cellarLotMeta({ ...lot, glass: null })).toBe(cellarLotMeta({ ...lot, inFlight: false, glass: null }));
});
```

**Steps**
- [ ] Add the regression test; it passes as it is. Keep `cellarLotMeta`'s rule.
- [ ] Rewrite `search-view.tsx` and `cellar-view.tsx`.
- [ ] Create `cellar-lot-step.tsx` and delete `destination-footer.tsx`.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- `npx vitest run src/components/add-wine/row-format.test.ts` is green.
- tsc reports no errors in these OWNS files.
- `rg -n "destination\??\.kind ===|dest\.kind ===|inFlightIds" src/components/add-wine/search-view.tsx src/components/add-wine/cellar-view.tsx src/components/add-wine/cellar-lot-step.tsx` prints nothing.

**Closes**
- **Decisions:** D9 (+1 bottle on phone rows), D10 (A5, A6), D11 (footer checkbox).
- **Screens:** A5, A6, B3 (phone rows), the lot step behind B1/B2.
- **Findings:** sources-8 (phone list), sources-3 (only known glass numbers), and the UI side of sources-1, entry-1 and scan-5.

---

### S3a — By-hand logic (pure)

**Depends on:** S2

**OWNS**
- modify `src/components/add-wine/by-hand-logic.ts`
- modify `src/components/add-wine/by-hand-logic.test.ts`

**Round-1**
- **Keeps** round 1's producer-home-region rule and both of its guards (by-hand-logic.ts:146-175):
  - it writes only fields that nobody set, or that a previous producer's link filled;
  - it changes nothing once an appellation is chosen;
  - a producer with no link clears the link-filled fields.

  It now works on `WineIdentityDraft` provenance, and carries the note "Filled from {producer}'s region link. Change either if the bottle disagrees."
- **Keeps** the gold suggestion-row idea, as "Did you mean {name}? · Use".
- **Replaces** the required wine name, "Still missing: …" and the round-1 state helpers (`stateFromPrefill`, `parseYear`, `missingFields`, `buildIdentity`, `vintageOk`, `actionLabel`).

**Does** (spec §B.4, §B.7, §B.8, §C.5 A7 and A4b)
- **Exports:** `fieldChip`, `applyProducerRegion`, `pickProducerAdoption`, `grapeSuggestionNote`, `blendScoredLine`, `byHandHeader`, `regionFirstLabel` and `NO_GI_HINT`.
  - `regionFirstLabel(regionName)` → "{Region} first" (canvas A7: "Piedmont first ▾").
  - `NO_GI_HINT` = "No geographic indication on the label? In France pick Vin de France; elsewhere pick No geographic indication." (byhand-5, adapted to spec §B.5).
  - `applyProducerRegion(draft, link: { regionId: string; countryId: string } | null)`:
    - returns the draft unchanged when `draft.appellationId` is set;
    - touches country and region only where that field's provenance is absent, `none` or `producer-region`;
    - with a link, sets both, with provenance `producer-region`;
    - with no link, clears whichever fields have provenance `producer-region`, and deletes those provenance keys.
- **Deprecated here, deleted in S3b:** `stateFromPrefill`, `parseYear`, `missingFields`, `buildIdentity`, `vintageOk`, `actionLabel`, `producerRowLabel`, `pickProducerSuggestion`, the round-1 `ByHandState` type and the `WineFormInitial` import. `by-hand-form.tsx` still imports them until S3b (Working Rule 5).
- **No completeness logic of its own:** `missingWineFields` only.
- The appellation helpers (`justTheRegionOption`, `appellationPlaceholder`, `appellationHint`) live in F13's `self-named-appellation.ts`, not here.

**Tests (write first)** — replace `src/components/add-wine/by-hand-logic.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import type { WineIdentityDraft } from "../../lib/wine-identity/types";
import { sheetMatrix } from "./matrix";
import {
  NO_GI_HINT, applyProducerRegion, blendScoredLine, byHandHeader, fieldChip, grapeSuggestionNote, pickProducerAdoption, regionFirstLabel,
} from "./by-hand-logic";

const ctx = { attempted: false, focusField: null, readAttempted: false, producerRegionName: null } as const;
const cigliuti = { kind: "existing", id: "p", name: "Cigliuti" } as const;

describe("fieldChip (spec B.4)", () => {
  it("producer", () => {
    expect(fieldChip("producer", { ...emptyDraft(), producer: cigliuti }, { ...ctx, producerRegionName: "Piedmont" }).chip).toBe("matched · Piedmont");
    expect(fieldChip("producer", { ...emptyDraft(), producer: { kind: "pending", name: "Cigliuti" } }, ctx).chip).toBe("new producer");
    expect(fieldChip("producer", emptyDraft(), ctx).chip).toBe("required");
  });
  it("vintage", () => {
    const read: WineIdentityDraft = { ...emptyDraft(), vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: true }, provenance: { vintage: "label" } };
    expect(fieldChip("vintage", read, ctx).chip).toBe("read from the label");
    expect(fieldChip("vintage", emptyDraft(), { ...ctx, readAttempted: true }).chip).toBe("did not read");
    expect(fieldChip("vintage", emptyDraft(), ctx).chip).toBe("required");
    expect(fieldChip("vintage", emptyDraft(), { ...ctx, readAttempted: true, focusField: "vintage" }).chip).toBe("did not read — required");
  });
  it("wine name has a hint, never a required chip (D3)", () =>
    expect(fieldChip("wineName", emptyDraft(), ctx)).toEqual({ chip: null, note: "Leave blank if the label has no cuvée name" }));
  it("country and region from the producer link", () => {
    const d: WineIdentityDraft = { ...emptyDraft(), producer: cigliuti, countryId: "it", regionId: "pie", provenance: { country: "producer-region", region: "producer-region" } };
    expect(fieldChip("region", d, ctx).note).toBe("Filled from Cigliuti's region link. Change either if the bottle disagrees.");
  });
  it("appellation and grape", () => {
    expect(fieldChip("appellation", emptyDraft(), ctx).chip).toBe("you choose");
    expect(fieldChip("appellation", emptyDraft(), { ...ctx, readAttempted: true }).chip).toBe("did not read");
    expect(fieldChip("primaryGrape", emptyDraft(), ctx).chip).toBe("you confirm");
  });
});

describe("applyProducerRegion (round-1 rules kept: country and region only)", () => {
  const link = { regionId: "pie", countryId: "it" };
  it("fills both while untouched, never the appellation or a grape", () =>
    expect(applyProducerRegion(emptyDraft(), link)).toMatchObject({ countryId: "it", regionId: "pie", appellationId: null, blend: [], provenance: { country: "producer-region", region: "producer-region" } }));
  it("replaces a previous producer's link", () =>
    expect(applyProducerRegion(applyProducerRegion(emptyDraft(), { regionId: "bdx", countryId: "fr" }), link)).toMatchObject({ countryId: "it", regionId: "pie" }));
  it("never overwrites a manual or read value", () => {
    const manual: WineIdentityDraft = { ...emptyDraft(), countryId: "fr", provenance: { country: "manual" } };
    expect(applyProducerRegion(manual, link)).toMatchObject({ countryId: "fr", regionId: null });
  });
  it("no link leaves an untouched draft alone", () => expect(applyProducerRegion(emptyDraft(), null)).toEqual(emptyDraft()));
  it("a producer with no link clears the previous producer's link-filled fields", () => {
    const cleared = applyProducerRegion(applyProducerRegion(emptyDraft(), link), null);
    expect([cleared.countryId, cleared.regionId, cleared.provenance.country, cleared.provenance.region]).toEqual([null, null, undefined, undefined]);
  });
  it("changes nothing once an appellation is chosen", () => {
    const chosen: WineIdentityDraft = { ...applyProducerRegion(emptyDraft(), link), appellationId: "bbr" };
    expect(applyProducerRegion(chosen, { regionId: "bdx", countryId: "fr" })).toEqual(chosen);
    expect(applyProducerRegion(chosen, null)).toEqual(chosen);
  });
});

describe("pickProducerAdoption (byhand-1)", () => {
  const hits = [{ id: "p1", name: "Château Palmer", regionId: "bdx" }, { id: "p2", name: "Château Pape Clément", regionId: "bdx" }];
  it("adopts a folded-equal hit", () => expect(pickProducerAdoption("chateau palmer", hits)).toEqual({ adopt: hits[0] }));
  it("suggests the top hit otherwise", () => expect(pickProducerAdoption("Chateau Pal", hits)).toEqual({ suggest: hits[0] }));
  it("stays pending with no hits", () => expect(pickProducerAdoption("Domaine Nouveau", [])).toEqual({ pending: "Domaine Nouveau" }));
});

describe("grape suggestion note, blend line, headers, labels", () => {
  it("suggestion notes (B.8)", () => {
    expect(grapeSuggestionNote({ grape: "Nebbiolo", appellation: "Barbaresco DOCG", source: "place" })).toBe("Barbaresco DOCG is Nebbiolo by law — that is the appellation talking, not the producer. Change it if the bottle disagrees.");
    expect(grapeSuggestionNote({ grape: "Nebbiolo", appellation: "Langhe DOC", source: "catalog" })).toBe("Most Langhe DOC wines in the catalog are Nebbiolo. Change it if the bottle disagrees.");
  });
  it("blend scored line", () => expect(blendScoredLine(["Merlot", "Cabernet Franc", "Malbec"])).toBe("Scored as Merlot (primary) · Cabernet Franc (secondary)"));
  it("A7 and A4b headers", () => {
    const flight = sheetMatrix({ kind: "flight", tastingId: "t", tastingName: "Barolo night", revealMode: "BLIND", wineSource: "HOST_PROVIDES", position: 6 }, true);
    expect(byHandHeader({ matrix: flight, finishing: null, gaps: 0 })).toEqual({ eyebrow: "Add wine · glass 6 · by hand", title: "A wine we have never seen", badge: null, intro: null });
    expect(byHandHeader({ matrix: flight, finishing: { glass: 6 }, gaps: 1 })).toEqual({ eyebrow: "Glass 6 · already added", title: "Finish this wine", badge: "1 GAP", intro: "Filled in from your scan. Correct anything the camera got wrong." });
    expect(byHandHeader({ matrix: sheetMatrix({ kind: "cellar" }, true), finishing: { glass: null }, gaps: 2 })).toMatchObject({ eyebrow: "Cellar · by hand", badge: "2 GAPS" });
  });
  it("the appellation list label and the no-GI hint (A7, byhand-5)", () => {
    expect(regionFirstLabel("Piedmont")).toBe("Piedmont first");
    expect(NO_GI_HINT).toBe("No geographic indication on the label? In France pick Vin de France; elsewhere pick No geographic indication.");
  });
});
```

**Steps**
- [ ] Replace the test file and watch it fail.
- [ ] Rewrite `by-hand-logic.ts` until it passes. Mark the round-1 exports deprecated.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- `npx vitest run src/components/add-wine/by-hand-logic.test.ts` is green.
- tsc reports no errors in `by-hand-logic.ts`.

**Closes**
- **Decisions:** D3 (the rule in the chips), D8 (field rules).
- **Findings:** byhand-1 (adoption rule), byhand-3, byhand-5 (the hint).
- **Root cause:** RC10 (country and region only; round 1's guards kept).

---

### S3b — By hand: the form (A7, A4b)

**Depends on:** S3a

**OWNS**
- modify `src/components/add-wine/by-hand-form.tsx`
- modify `src/components/add-wine/by-hand-logic.ts` — only to delete the exports S3a deprecated
- modify `src/components/searchable-combobox.tsx`
- modify `src/components/add-wine/types.ts` — `ByHandFormProps` only
- modify `src/app/catalog/new/actions.ts` — only to delete `createProducer`, once `rg` shows no importer

**Round-1**
- **Keeps** the producer-home-region prefill (S3a's rule) and the gold "Did you mean {name}? · Use" row.
- **Replaces:**
  - the required wine name (D3);
  - Style hidden in More detail with a STILL default (D8, byhand-2);
  - the Red / White / Other colour control;
  - "Scan instead";
  - "Still missing: …";
  - reference lists fetched on every mount;
  - mounting only when first needed (add-wine-sheet.tsx:852) — the shell now mounts the form hidden from the first paint (spec §C.4 rule 9).

**Does** (spec §C.5 A7 and A4b; §B.4; §B.7; §B.8)

**Props**
```ts
export type ByHandFormProps = {
  session: ByHandSession | null;                 // null: the shell has mounted the form hidden; render emptyDraft(), inert
  matrix: SheetMatrix; destination: AddWineDestination | null;
  references: ByHandReferences;                  // from F13's loadByHandReferences(), loaded once by the shell
  finishing: { glass: number | null } | null;    // the A4b header when set
  busy: boolean; error: string | null; userId: string;
  onChange: (draft: WineIdentityDraft) => void; onUnidentified: (on: boolean) => void;
  onSave: () => void; onLeaveForLater: (() => void) | null; onSearchInstead: () => void;
  fieldRefs: React.MutableRefObject<Partial<Record<WineFieldKey, HTMLElement | null>>>;  // registered even while hidden, so the shell can focus inside the tap
};
```

**Header**
- The strings come from `byHandHeader({ matrix, finishing, gaps })`: eyebrow, title, the "{k} GAP(S)" badge, and the intro. "Search instead" calls `onSearchInstead`.

**"I can't identify this bottle"**
- Rendered only when `matrix.byHand.unidentifiedToggle` is set.
- When on:
  - The required fields become `UNIDENTIFIED_WINE_FIELDS`.
  - This note appears, verbatim (spec §2.1 row 17): "Unidentified wines are kept out of the shared catalog — no community rating, not searchable, excluded from stats. Only vintage, country, region and grape are required. Use this only when the bottle genuinely can't be identified."
  - The footer note becomes "Kept out of the shared catalog".

**Fields, in order**

1. **Producer.** A `SearchableCombobox` over `searchProducers`, grouped under "Specific to {region}".
   - The chip comes from `fieldChip`.
   - After each search, `pickProducerAdoption(typed, hits)` decides:
     - `adopt` → set the existing producer; the chip reads "matched".
     - `suggest` → show the row "Did you mean {name}? · Use".
     - `pending` → show the hint "New producer — we'll add it when you save."
   - Picking or adopting an existing producer calls `producerHomeRegion`, then `applyProducerRegion` with its link. A pending producer, or one with no link, calls `applyProducerRegion(draft, null)`.
2. **Vintage.** A segmented control: Year · NV · Tawny.
   - Year: a controlled 4-digit input, placeholder "YYYY", `inputMode="numeric"`. It renders whenever the kind is YEAR or unset, so Fix always has an input to focus.
   - Tawny: a base-ui `Select` of 10 · 20 · 30 · 40, with an `items` map of labels (CLAUDE.md's Select rule). Choosing Tawny sets Style to Fortified and locks Style while Tawny stays selected.
3. **Wine name.** Optional, with the hint from `fieldChip("wineName")`.
4. **Colour and Style.** Side by side, with no defaults.
   - Colour: Red · White · Rosé · Other (= Orange).
   - Style: Still · Sparkling · Sweet · Fortified.
5. **Country and Region.** Two `ReferenceCombobox`es.
   - Region is disabled until a country is chosen.
   - Changing the country clears a region and appellation that no longer belong.
   - The "None" region displays as "No geographic indication".
   - The producer-region note shows here, and `NO_GI_HINT` sits under the pair.
6. **Appellation.** The chip reads "you choose".
   - With a region, the list's section label is `regionFirstLabel(regionName)`, and the list is ordered:
     1. "Just the region · {name}", from `await regionSelfNamedAppellation(regionId, regionName)` (F13);
     2. `listAppellationsForRegions([regionId])`, paged;
     3. search.
   - The placeholder is `appellationPlaceholder` and the hint is `appellationHint`, both from `self-named-appellation.ts` (F13).
   - With no region, the field uses `searchAppellations`.
   - The None region's appellation displays as "No geographic indication".
7. **Grape.** A `ReferenceCombobox` over `references.grapes`, bound to blend row 0. The chip reads "you confirm".
   - When the appellation changes, call `suggestGrapeForAppellation`.
   - A "suggested" chip named after the grape fills the field on tap, with provenance `appellation-suggestion`.
   - The note beneath comes from `grapeSuggestionNote`.
8. **More detail.** Collapsed, with the subline "Second grape, designation, alcohol, a photo". Inside:
   - `GrapeBlendEditor` for further blend rows, with optional %, plus the line from `blendScoredLine`;
   - `TypeDesignationField`;
   - Alcohol %;
   - Description;
   - Label photo (`ImageUploader`): the tasting id folder for a flight, otherwise `catalog/staging/${userId}`.

**Footer**
- The note is `matrix.byHand.footerNote`, or the unidentified note.
- The primary button reads `matrix.byHand.primary(finishing !== null)`.
- "Leave it for later" appears when `onLeaveForLater` is set.
- After an attempted save with gaps, the line "This wine {describeMissing}." shows above the button. The gaps come from `missingWineFields(draft, { unidentified })`.

**Behaviour**
- Every input is controlled.
- Every combobox keeps its synchronous-focus behaviour.
- `fieldRefs` is registered on every render, hidden or not.
- A read's full blend, with percentages, flows through untouched (byhand-4, byhand-6).
- No completeness logic of its own: `missingWineFields` only.

**by-hand-logic.ts**
- Delete the exports S3a deprecated, once `rg` shows no importer.

**searchable-combobox.tsx**
- Hide the `Add "{query}"` row whenever a result satisfies `foldName(result.label) === foldName(query)`. Import `foldName` from `@/lib/wine-identity/fold`.
- Everything else stays: `keepMounted` and synchronous focus.

**catalog/new/actions.ts**
- Delete `createProducer` once `rg -n "\bcreateProducer\b" src --glob '!src/app/tastings/**'` shows only its definition.

**Tests:** None new. S3a tests the logic, and F13 tests the appellation helpers. V1 item 6 and V2 item 4 verify the form.

**Steps**
- [ ] Rewrite `by-hand-form.tsx` and add the props type.
- [ ] Edit `searchable-combobox.tsx`, delete the deprecated by-hand exports and `createProducer`.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- tsc reports no errors in these OWNS files.
- `rg -n "Still missing|Scan instead|stateFromPrefill|missingFields\(|buildIdentity|WineFormInitial|ByHandState" src/components/add-wine/by-hand-form.tsx src/components/add-wine/by-hand-logic.ts` prints nothing.

**Closes**
- **Decisions:** D3 (UI), D7 (the A4b form), D8.
- **Screens:** A7, A4b.
- **Findings:** byhand-1 (UI and combobox), byhand-2, byhand-3 (UI), byhand-4, byhand-5 ("Just the region" and the hint), byhand-6, byhand-7 (toggle), byhand-8 (renders the matrix note).
- **Root causes:** RC5 (uses the targeted lookup), RC7, RC8 (a controlled form, mounted from the first paint).
- **Spec:** §2.1 rows 3, 4, 7, 16 and 17.

---
### S4 — The laptop view (A8, B1, B3, C1, D1)

**Depends on:** S3b

**OWNS**
- modify `src/components/add-wine/desktop-view.tsx`
- modify `src/components/add-wine/desktop-format.ts`
- modify `src/components/add-wine/desktop-format.test.ts`
- modify `src/components/add-wine/desktop-actions.ts`
- delete `src/components/add-wine/pending-fix.tsx`
- modify `src/components/add-wine/types.ts` (`DesktopViewProps` only)

**Round-1**
- **Keeps** round 1's identical outlined `RowActionButton` on every result row, at round 1's 36 px (a laptop target). The label changes only when the action changes: "+1 bottle" or "Open" (D9). `RowActionButton` stays exported for the create sheet, and gains an `href` variant for "Open".
- **Replaces:**
  - the per-row "keep it in the cellar" and consume toggles → the footer checkbox;
  - "↵ adds/picks the first hit" → Enter on the focused row, with the hint text from the matrix;
  - the rate footer sentence "Pick the wine you are tasting — its note opens next." → the C1 lead line;
  - `DesktopPendingRow`'s year/NV strip → the A4 rows.

**Does** (spec §C.5 A8, B1, B3, C1, D1)

- **Props:**
  ```ts
  export type DesktopViewProps = {
    matrix: SheetMatrix; destination: AddWineDestination | null;
    query: string; onQuery: (q: string) => void; inputRef: React.Ref<HTMLInputElement>;
    groups: SearchGroups | null; loading: boolean;
    focusedRow: number; onFocusRow: (row: number) => void;
    consume: boolean; onConsume: (v: boolean) => void;
    items: ScanItem[]; draftForMeta: WineIdentityDraft | null;   // D1 metas compare against the latest read or by-hand draft
    cellarSummary: CellarSummary | null; lastRack: string | null; addedCount: number;
    onRow: (row: DesktopRow, action: SheetRowAction) => void;
    onFiles: (files: File[]) => void; onCellarTile: () => void; onByHand: () => void; onNeither: () => void;
    onItemAction: (itemId: string, action: "fix" | "remove" | "retry") => void;
    onFooterButton: () => void;
  };
  ```
- **Header.** Rendered by the shell (eyebrow `matrix.eyebrow`, e.g. "Barolo night · blind").
- **Above the search.** The lead line `matrix.leadLine` when set, then a full-width search field with placeholder `matrix.searchPlaceholder`. The focused row carries the `matrix.enterHint` hint.
- **Results.**
  - Rows come from `flattenSearchGroups(groups, { includeCellar: matrix.searchGroups.includes("cellar") })`.
  - Each row names its source: "In your cellar · rack B · 2 bottles · ★ 91", "Catalog · ★ 95 · 22 notes", or "You have tasted it · you rated it 92 in May".
  - Every row carries `RowActionButton` labelled `matrix.row(...).label`. Disabled rows read "In flight".
  - For the catalog destination the button reads "Open". It is `RowActionButton`'s new `href` variant: a Next `Link` to `/catalog/{id}` with exactly the button's classes, so every row still carries the same button (round 1).
  - The row meta is `catalogRowMeta(row, draftForMeta)`. It reads the row's `producerId`, `wineName`, `appellationId` and `vintageLabel` (spec §C.1; F11 types them, F13 fills them).
  - The count reads `matrix.resultCount(n)`.
  - When `matrix.neitherOfThese` is set, "Neither of these" · "Continue and create a new entry" follows the results and calls `onNeither`.
- **Keyboard.**
  - ArrowDown and ArrowUp call `onFocusRow(clampFocus(focusedRow ± 1, rowCount))`. Focus never wraps.
  - Enter acts on the focused row. It defaults to `firstAddableIndex(rows)`. Enter on a disabled row — in flight, or just added (spec §C.4 rule 11) — does nothing.
  - With no destination, Enter sends `action: "choose"`. It never pours a lot (sources-2).
- **Below the results.**
  - The upload zone uses `matrix.upload` and `pickImageFiles` (5 MB; `multiple` from the matrix).
  - Beside it, three tiles:
    - "From my cellar", when `matrix.cellarSource`; subtitle `matrix.cellarTileSubtitle(cellarSummary)`.
    - "Add it by hand", subtitle `matrix.byHandTileSubtitle`.
    - For the cellar only (`matrix.lotPreviewTile`): the non-interactive "Then: quantity, rack, price" tile, with chips from `lotPreviewChips(lastRack)`.
- **Footer.**
  - When the results include lot rows and `matrix.consumeLabel` is set, a footer checkbox shows, checked by default. It replaces the per-row toggles (desktop-view.tsx:184-195, 311-336).
  - Above the footer, the A4 rows (light tone) come from `itemRowCopy`: added, incomplete, pending, failed and reading.
  - Then `matrix.footer.sentence(addedCount)` and a button labelled `matrix.footer.button`. Adding never closes the sheet.
- **`desktop-format.ts`.**
  - **Add** `catalogRowMeta`, `lotPreviewChips`, `clampFocus` and `firstAddableIndex`.
  - **Change** `flattenSearchGroups` to copy `inFlight` onto tasted-only rows (sources-8).
  - **Keep** `MAX_PHOTO_BYTES` and `pickImageFiles`.
  - **Keep as wrappers** `rowActionLabel` and `enterHint`, marked `/** @deprecated removed in S6 */`, delegating to `sheetMatrix`.
  - **Delete** `footerButtonLabel`, `footerSentence`, `uploadZoneCopy`, `uploadZoneLabels`, `cellarTileSubtitle` and their tests. The matrix owns them now, tested in F11.
  - Reword the FastCork comment at :199.
- **Other files.**
  - `desktop-actions.ts`: `getCellarSummary` is unchanged; reword its comments only.
  - Delete `pending-fix.tsx`.
  - Reword the FastCork comments in `desktop-view.tsx` at :56 and :219.

**Tests (write first)** — `src/components/add-wine/desktop-format.test.ts` (add these; delete the cases for the removed helpers)
```ts
import { describe, expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import type { WineIdentityDraft } from "../../lib/wine-identity/types";
import { catalogRowMeta, clampFocus, firstAddableIndex, flattenSearchGroups, lotPreviewChips } from "./desktop-format";

describe("catalogRowMeta (D1, spec §2.1 row 13)", () => {
  const draft: WineIdentityDraft = { ...emptyDraft(), producer: { kind: "existing", id: "p1", name: "Cigliuti" }, wineName: "Serraboella", appellationId: "a1", vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: true } };
  it("typed text only", () => expect(catalogRowMeta({ producerId: "p1", wineName: "Serraboella", appellationId: "a1", vintageLabel: "2016" }, null)).toBe("Already in the catalog · 2016"));
  it("same wine, other vintage", () => expect(catalogRowMeta({ producerId: "p1", wineName: "serraboella", appellationId: "a1", vintageLabel: "2016" }, draft)).toBe("Already in the catalog · different vintage"));
  it("same producer, other wine", () => expect(catalogRowMeta({ producerId: "p1", wineName: null, appellationId: "a2", vintageLabel: "2017" }, draft)).toBe("Already in the catalog · different wine"));
});
it("lotPreviewChips (B1)", () => {
  expect(lotPreviewChips(null)).toEqual(["1 bottle", "Rack", "Price"]);
  expect(lotPreviewChips("B")).toEqual(["1 bottle", "Rack B", "Price"]);
});
it("keyboard focus never wraps (D9)", () => {
  expect([clampFocus(-1, 5), clampFocus(7, 5), clampFocus(2, 5), clampFocus(0, 0)]).toEqual([0, 4, 2, -1]);
  expect([firstAddableIndex([{ disabled: true }, { disabled: false }]), firstAddableIndex([{ disabled: true }])]).toEqual([1, -1]);
});
it("a tasted-only row keeps its own inFlight (sources-8)", () => {
  const rows = flattenSearchGroups({ cellar: [], catalog: [], tasted: [{ catalogWineId: "c9", title: "Vietti, Barolo 2016", imageUrl: null, myScore: 92, tastedOn: "2026-05-02", inFlight: true, producerId: "p9", wineName: null, appellationId: "a9", vintageLabel: "2016" }] }, { includeCellar: false });
  expect(rows.find((r) => r.catalogWineId === "c9")?.inFlight).toBe(true);
});
```
If `DesktopRow` names the id field differently, adapt the property names in the last test; keep the assertion.

**Steps**
- [ ] Update the tests and watch them fail. Implement the new helpers until they pass.
- [ ] Rewrite `desktop-view.tsx`, delete `pending-fix.tsx`, and add the props type.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- `npx vitest run src/components/add-wine/desktop-format.test.ts` is green.
- tsc reports no errors in these OWNS files.
- `rg -n "pending-fix|PendingFixStrip|keep it in the cellar|picks the first hit|footerSentence|uploadZoneCopy|destination\??\.kind ===" src/components/add-wine/desktop-view.tsx src/components/add-wine/desktop-format.ts` prints nothing.

**Closes**
- **Decisions:** D9, D10 (laptop), D11 (footer checkbox).
- **Screens:** A8, B1, B3, C1, D1, A4 (laptop rows).
- **Findings:** sources-2 (Enter goes to the chooser, and never pours twice), sources-8, scan-8 (laptop failed row); the UI side of entry-1 and sources-1.
- **Spec:** §2.1 row 14.

---

### S5a — The sheet's adds hook (`use-sheet-adds.ts`)

**Depends on:** S4

**OWNS**
- create `src/components/add-wine/use-sheet-adds.ts`
- modify `src/components/add-wine/sheet-state.ts` and `sheet-state.test.ts` (add actions only; never rename one)
- modify `src/components/add-wine/format.ts`
- modify `src/components/add-wine/format.test.ts`

**Round-1**
- **Replaces** round 1's `rate` wiring (`pickToRate` and the "Taste & rate" branches) with `note` + `NotePick`. It also replaces silently adopting the hinted flight for a lot picked with no destination: the chooser now opens instead.
- **Keeps** round 1's rule that an identity picked for a note is written to the catalog before the note opens, now through `addToCatalog` on the unified path.

This task is the shell's write dispatch (spec §C.2 grep gate). It exists so the rewrite lands in compiling steps: the hook compiles on its own, and S5b's shell then imports it.

**Does** (spec §C.2 "After an add"; §C.4 rules 2, 5–7 and 11; §C.5 A3, A4b, D3 and E1 actions)
- **`useSheetAdds({ state, stateRef, dispatch, matrix, userId, flightHint, onNote, onClose, refresh, refreshSearch })`** returns `{ performAdd, primaryFromConfirm, choose, followUpCellar, followUpNote, followUpDone, saveByHand, leaveForLater, openEdit, requestClose, discardAndClose }`.
  - `refresh` is `router.refresh`.
  - `refreshSearch()` re-runs `searchAddWine` for the current query with the current tasting id (rule 11).
  - The hook imports no view.
- **`performAdd(source)`** is dispatched by `routeAdd`:
  - `choose` → dispatch `choose` with the display title and `missing`.
  - `lot` → `openLot(source)`.
  - `catalog-then-lot` → `addToCatalog(identity)`, then `openLot({ kind: "catalog", catalogWineId, via: "search" })`, so the duplicate check always runs.
  - `note` → a `NotePick` from `notePickPlan`:
    - a catalog source → pick;
    - a lot → pick, carrying `consume`;
    - a complete identity → `addToCatalog` first, then pick;
    - an incomplete draft → open By hand first.

    Then `onNote(pick)` and close.
  - `write`:
    - flight → `addToFlight`;
    - cellar → `addToCellar`, with `state.lot` or `plusOne`;
    - catalog → `addToCatalog`.

    Then `itemAdded` or `added`.
    - After a flight add from a search or cellar row: `rowAdded` with the row's key, then `refreshSearch()`.
    - After a flight add in multi mode or on a laptop: `positionAdvanced` to the server's glass + 1.
    - A single catalog add → `followUp` (D3). A catalog add in multi mode, or from a laptop queue, becomes a stacked "Added to the catalog" or "Already in the catalog" row.
- **`primaryFromConfirm(item)`**, for a partial read:
  - `matrix.partialRead.single === "incomplete-glass"` → `{ kind: "incomplete", draft, via: "scan" }`;
  - otherwise → `openByHand` with origin `item`, focused on the first missing field.
- **A chooser pick** → `adopt(destination)` (from the flight hint, cellar, note or catalog), then `performAdd`. A failed add → `adoptFailed(error)`.
- **After an add** (spec §C.2):
  - Flight, cellar and note are terminal.
  - On a phone, a single add closes the sheet, with `refresh()` for flight and cellar.
  - In multi mode or on a laptop, the sheet stays open.
  - "Add and scan the next" → `setMulti(true)` plus `go(home)`.
- **Fix and By hand from the confirm view:** a partial read → `openByHand` with origin `item`. A matched read → origin `match`, with the draft from `loadCatalogWineDraft(catalogWineId)` plus the read's photo.
- **`saveByHand()`:**
  - Compute `missingWineFields(draft, { unidentified })`.
  - With gaps: dispatch `byHandAttempted`, and return the first missing field. The shell focuses it synchronously.
  - When complete:
    - origin `new`, `item` or `match` → `performAdd({ kind: "identity", draft, via: origin.kind === "new" ? "byhand" : "scan", readId })`, or `{ kind: "unidentified", draft }` when unidentified;
    - origin `glass` → `saveFlightGlass({ wineId, draft, unidentified, leaveForLater: false })`.
- **`leaveForLater()`:**
  - A new or item session: when `matrix.partialRead.stacked === "pending-row"` (cellar, catalog, an OPEN flight), keep or create the pending row and return to the stack. Otherwise `performAdd({ kind: "incomplete", draft, via })`.
  - An incomplete `glass` → `saveFlightGlass({ …, leaveForLater: true })`.
- **`openEdit(wineId)`** (`options.edit`): `loadFlightGlassForEdit(wineId)` → `openByHand` with origin `glass`. An incomplete glass gets the finishing header. It resolves with the first missing field, which the shell focuses on a mouse device and flags on a touch device (spec §C.4 rule 9).
- **Close:** `requestClose` → `closeAsk`, or `closing` → `onClose()`, plus `refresh()` if anything went into a flight or the cellar. `discardAndClose` drops unfinished rows.
- **Rules:** no `window.confirm`, and no nested dialogs.
- **`format.ts`.**
  - Rename `ratePickPlan` → `notePickPlan` and `RatePickPlan` → `NotePickPlan`. The result carries a `NotePick`, and an identity with gaps plans `by-hand-first`.
  - Delete `identityFromPrefill`, `scanTitle`, `wineTitleFromExtracted`, `wineMetaFromExtracted`, and the `ExtractedLabel` / `WineFormInitial` imports.
  - Keep `starLabel` and `glassLabel`, and keep `vintageLabel` wherever it is still imported.

**Tests (write first)**

`src/components/add-wine/format.test.ts` — replace the `identityFromPrefill` and `ratePickPlan` cases:
```ts
import { expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import type { WineIdentityDraft } from "../../lib/wine-identity/types";
import { notePickPlan } from "./format";

const complete: WineIdentityDraft = {
  ...emptyDraft(), producer: { kind: "existing", id: "p", name: "Vietti" }, vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: false },
  colour: "RED", style: "STILL", countryId: "it", regionId: "pie", appellationId: "barolo",
  blend: [{ grape: { kind: "existing", id: "neb", name: "Nebbiolo" }, percentage: null }],
};
it("notePickPlan: a catalog source picks directly", () =>
  expect(notePickPlan({ kind: "catalog", catalogWineId: "c1", via: "search" })).toEqual({ kind: "pick", pick: { catalogWineId: "c1" } }));
it("notePickPlan: a lot carries its wine and consume", () =>
  expect(notePickPlan({ kind: "lot", lotId: "l1", consume: true, catalogWineId: "c1" })).toEqual({ kind: "pick", pick: { catalogWineId: "c1", lotId: "l1", consume: true } }));
it("notePickPlan: a complete identity is written to the catalog first", () =>
  expect(notePickPlan({ kind: "identity", draft: complete, via: "byhand", readId: null }).kind).toBe("catalog-first"));
it("notePickPlan: an identity with gaps opens By hand first (D7)", () =>
  expect(notePickPlan({ kind: "identity", draft: emptyDraft(), via: "scan", readId: null }).kind).toBe("by-hand-first"));
```

`src/components/add-wine/sheet-state.test.ts` — append:
```ts
it("an edit session opens the by-hand form with the glass origin", () => {
  const s = run(initialSheetState({ destination: flight, options: { edit: { wineId: "w3" } }, canScan: true }),
    { type: "openByHand", origin: { kind: "glass", wineId: "w3", incomplete: true }, draft: partial.draft, focusField: "vintage" });
  expect([s.view, s.byHand?.origin]).toEqual(["byhand", { kind: "glass", wineId: "w3", incomplete: true }]);
});
```

**Steps**
- [ ] Add the tests; they fail on `notePickPlan`.
- [ ] Implement `format.ts`, then `use-sheet-adds.ts`. The tests pass.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- `npx vitest run src/components/add-wine/format.test.ts src/components/add-wine/sheet-state.test.ts` is green.
- tsc reports no errors in `use-sheet-adds.ts`, `format.ts` or `sheet-state.ts`.
- `rg -n "window.confirm|flightFromHint" src/components/add-wine/use-sheet-adds.ts` prints nothing.

**Closes**
- **Decisions:** D4 (rate → note wiring), D7 (Fix routing, "Leave it for later", the close ask, edit), D12 (chooser adoption and reset; no silent adoption).
- **Screens:** A4b (routing), C1 and C2 (the note pick), D3 (wiring), E1 and E1b (adoption).
- **Findings:** scan-4, sources-2 (no silent adoption; in flight right after an add), entry-3 (a lot goes through the chooser).
- **Root cause:** RC12.

---

### S5b — The sheet shell (`add-wine-sheet.tsx`)

**Depends on:** S5a

**OWNS**
- modify `src/components/add-wine/add-wine-sheet.tsx`
- modify `src/components/add-wine/sheet-state.ts` and `sheet-state.test.ts` (add actions only; never rename one)

**Round-1**
- **Replaces** touch-only initial and home views with `canScan`, and mounting `ByHandForm` only when first needed with mounting it hidden from the first paint.
- **Keeps** Many forced off for the single-wine destination (now `note`).

**Does** (spec §A.4 upload path; §C.3 "First paint"; §C.4 rules 1, 3, 4 and 8–11)

**State and first paint**
- `useReducer(sheetReducer, initialSheetState({ destination, options, canScan: null, initialLot }))`. Async handlers read `stateRef.current`.
- `useCanScan()` → `dispatch({ type: "canScanResolved" })`. While `view === "resolving"`, render only the header and `WineGlassLoader`.
- Wire every handler from `useSheetAdds(...)` (S5a).

**Header**
- ✕, then the eyebrow and title from the matrix: `title("home")`, or `title("read")` once a read exists.
- In multi mode: `matrix.multiTitle` with a "+N added" badge.
- The trailing slot, by view:
  - search view when `canScan` → a "Scan" pill that returns to the camera;
  - cellar view → "{n} bottles";
  - by-hand view → "Search instead" (from `byHandHeader`).

**Mounted, hidden views** (rule 9)
- `SearchView` and `ByHandForm` mount from the first paint after `resolving`, hidden when not current. `ByHandForm` gets `session: null` until a session exists.
- Opening search, Fix and By hand run `flushSync(() => dispatch(...))`, then `.focus()` in the same click handler: the search input, or `fieldRefs.current[firstMissing]`.
- After `openEdit` resolves, and after a query-param open, focus the field when `canScan` is false; otherwise scroll it into view.

**The read pipeline** — one item at a time from `queue`:
1. `downscaleForRead(blob)`. An `ImageDecodeError` → `itemFailed`.
2. Upload to `catalog/staging/${userId}/scan-${Date.now()}-${rand}.jpg` with `contentType: "image/jpeg"` → `itemUploaded`.
3. `readLabelPhoto({ imagePath })`:
   - `ok` with `stackPartialRead(state, read.missing, matrix)` → `itemRead` with `stack: true`, a pending row with no confirm view;
   - `ok` with gaps and `matrix.partialRead.skipConfirm` (note) → `itemRead`, then `openByHand` with origin `item` and the gap flagged, with no confirm view (D7);
   - any other `ok` → `itemRead` and the confirm view. Auto-add is never allowed (D6);
   - otherwise → `itemFailed` with the reason.
- **Retry.** If the item is already uploaded, read it again; otherwise upload the kept blob again.
- **Failures** never stop the queue. A queued photo's "Reading the label…" row renders at enqueue.

**Search and rows**
- Search calls `searchAddWine(query, currentDestination(state)?.tastingId ?? flightHint?.tastingId)`.
- Search and desktop views receive `markAddedInFlight(groups, state.addedRowKeys)`.

**Data loaded once per open**
- `loadByHandReferences()`, kept in a ref.
- For the chooser, `cellarHint` = `getCellarSummary()` plus `ownedBottlesFor(match.catalogWineId)`.

**Close**
- `closeAsk` renders a footer "{n} wine not added yet" / "{n} wines not added yet", with "Discard" and "Keep going". No modal.

**Rules**
- ← dispatches `back`.
- No `window.confirm`, and no nested dialogs; the sheet stays mounted.
- Reword the FastCork comments at :286 and :330.

**Tests:** None new, unless this task adds a `SheetAction`; then its reducer case gets a failing test first. V1 items 1, 2, 10, 18 and 32, and V2 items 1–4, verify the shell.

**Steps**
- [ ] Rewrite `add-wine-sheet.tsx` on the reducer and the S5a hook.
- [ ] Run `npm test` and the Working Rules 4 checks.

**Acceptance**
- tsc reports no errors in `add-wine-sheet.tsx` or `sheet-state.ts`.
- `rg -n "byHandMounted|destRef|multiRef|identifyWineFromLabel|resolveWinePrefill" src/components/add-wine/add-wine-sheet.tsx` prints nothing.
- `rg -n "flushSync" src/components/add-wine/add-wine-sheet.tsx` matches.

**Closes**
- **Decisions:** D5 (routing), D6 (the pipeline and failed rows), D7 (a note's partial read skips confirm).
- **Screens:** handoff M (every view on the matrix).
- **Findings:** scan-8, sources-2 (the hint's tasting id; in-flight rows).
- **Root cause:** RC8 (views mounted from the first paint).
- **Spec:** §A.4 (upload path), §C.3 (first paint), §C.4 rules 3, 4, 9 and 11.

---

### S5c — Provider, launcher, registrar, deprecation sweep

**Depends on:** S5b, T10

**OWNS**
- modify `src/components/add-wine-context.tsx`
- modify `src/components/taste-launcher-context.tsx`
- modify `src/components/tasting-scan-registrar.tsx`
- modify `src/components/add-wine-button.tsx`
- modify `src/components/add-wine/scan-copy.ts`
- modify `src/components/add-wine/scan-copy.test.ts`
- modify `src/components/add-wine/types.ts` (final cleanup)
- modify `src/lib/label-scan/extract.ts` (delete the deprecated `ExtractedLabel` type only)
- modify `src/app/scan/actions.ts` (delete the deprecated `ScanMatch` / `ScanResult` types only)
- modify `src/app/catalog/new/new-wine-form.tsx` (delete `WineFormInitial.vintagePrompt` only)

**Round-1**
- **Replaces** round 1's `rate` destination in the provider and the launcher with `note`.
- **Keeps** `openTaste("rate")` as the launcher API name.

**Does** (spec §C.1 final `FlightHint`, §C.6 "Dead context API", §D.4 #2)

**`add-wine-context.tsx`**
- Key the sheet with an open counter, so every open starts fresh.
- Delete `openScan`, `openBulkScan`, `openTastingScan`, `openAddWine("tasting")` and `AddWineOpts.catalog` / `cellarNew`. `rg` them first; they have no callers.
- `AddWineKind` becomes `"catalog" | "cellar"`. Keep `openAddWine("cellar", { cellarWine })`, which opens the lot step through `initialLot`.
- **Flight hint.**
  - A registered `ActiveTasting` now carries `phase`, and keeps its own phase.
  - Otherwise use the Overview hint.
  - Remove the forced `live: false` at add-wine-context.tsx:245-256.
- **Note.** A `NotePick` opens `NewNoteModal`, keyed per pick, passing `cellarConsume` only when `consume && lotId`.
- The currency is still loaded lazily, for a cellar or null destination.

**Other files**
- **`tasting-scan-registrar.tsx`.** Accepts optional `timingMode?: TimingMode` and `status?: TastingStatus`. `phase` = `status === "DRAFT" ? "next" : timingMode === "ASYNC" ? "self-paced" : "live"`, passed on the `ActiveTasting`.
- **`taste-launcher-context.tsx`.** `openTaste("rate")` → `openAddWineSheet({ kind: "note" })`.
- **`add-wine-button.tsx`.** Its `kind` type follows the narrowed `AddWineKind`. Check with `rg` that no caller passes "tasting".
- **`scan-copy.ts`.**
  - Delete `primaryAddLabel`, `consumeLabel`, `flightHintSubtitle`, `addedWhere`, `shouldStackPending`, `parseVintageYear`, `pendingProblemLabel`, `confidenceChip` and their tests.
  - Keep `flightNote` and its tests.
- **`types.ts`.**
  - `FlightHint.phase` becomes required. T10 made every producer pass it.
  - Delete `FlightHint.live` and every remaining old type: `PendingScan`, `PendingFix`, `RatePick`, `ByHandIdentity`, and `SheetContext.isDesktop` / `hasCamera`.
- **`extract.ts`, `scan/actions.ts`, `new-wine-form.tsx`.** Delete the deprecated types, and delete `vintagePrompt` once `rg` shows no reader.

**Tests (write first):** in `scan-copy.test.ts`, delete the cases for the removed helpers and keep the `flightNote` cases. They must still pass.

**Steps**
- [ ] Rewrite the context, the launcher, the registrar and the button.
- [ ] Run the deprecation sweep.
- [ ] Run `npm test`, the Working Rules 4 checks and the grep gates below.

**Acceptance**
- `npm test` is green.
- These gates from spec §G.1 print nothing:
  - gate 2 — `rg -n "identityFromPrefill|resolveIdentity|resolveWinePrefill|createScannedWine|missingFields\(|buildIdentity|vintagePrompt|shouldStackPending|parseVintageYear|Still missing|are required\." src`
  - gate 3 — `rg -n -i fastcork src .env.example`
  - gate 4 — `rg -n "destination\??\.kind ===|dest\.kind ===" src/components/add-wine --glob '!matrix.ts' --glob '!add-wine-sheet.tsx' --glob '!use-sheet-adds.ts' --glob '!sheet-state.ts' --glob '!actions.ts'`
  - gate 5 — `rg -n 'kind: "rate"' src`
- `rg -n "live\??: boolean|live: (true|false)" src/components/add-wine src/components/add-wine-context.tsx src/app/overview` prints nothing.
- tsc reports errors only in `src/app/tastings/new/flight-step.tsx`, which S6 fixes.

**Closes**
- **Decisions:** D4 (the launchers; rate → note), D12 (the context keeps the phase).
- **Findings:** entry-3 (the context keeps the phase), entry-4 (`phase` required everywhere).
- **Spec:** §C.1 (final shape), §C.5 C1/C2 "One wine", §C.6 "Dead context API".

---

### S6 — Create-sheet step 2 on the matrix

**Depends on:** S5c, T1, T2

**OWNS**
- modify `src/app/tastings/new/flight-step.tsx`
- modify `src/app/tastings/new/actions.ts` (`listFlight` only)
- modify `src/components/add-wine/use-camera.ts` and `use-camera.test.ts` (delete the deprecated touch exports)
- modify `src/components/add-wine/desktop-format.ts` and `desktop-format.test.ts` (delete the deprecated `rowActionLabel` / `enterHint` wrappers)
- modify `src/components/new-tasting-sheet.tsx` (the `<FlightStep …/>` call site only)

**Round-1**
- **Replaces** round 1's touch-based first chip label (`useTouchPrimary`) → `canScan`.
- **Replaces** inline cellar hits added as catalog wines → lot adds that carry the draw-down intent.
- **Keeps** the identical `RowActionButton` on step-2 search rows, and the width-based `isDesktop` for inline search (now the shared `useMediaQuery`, T2).

**Does** (spec §C.6 row "Create sheet step 2", §C.7 last bullet, §C.9, §D.1 #6)
- **Chips.** They follow the flight destination's matrix:
  - "Scan a label" when `canScan` is true, otherwise "Upload photos" → `start: "camera"`;
  - "My cellar", when `matrix.cellarSource` → `start: "cellar"`;
  - "By hand" → `start: "byhand"`.
- **Inline laptop search.**
  - Row labels come from `sheetMatrix(destination, false).row(...)` on `RowActionButton`.
  - Lot hits → `addToFlight(destination, { kind: "lot", lotId, consume })`. A footer checkbox "Take it out of the cellar when we pour it" is checked by default.
  - Catalog hits → `{ kind: "catalog", catalogWineId, via: "search" }`.
  - In-flight rows follow the server's flags (F13 applies the knowledge rule).
- **Captions (create-6).** At flight-step.tsx:256-264 and 389-396:
  - `PARTICIPANT_CONTRIBUTED` → "Reorder · tasters see whose bottle each glass is";
  - `HOST_PROVIDES` keeps "Reorder · tasters only ever see the number".
- **`listFlight`** (tastings/new/actions.ts:364-479).
  - The identity line and glass knowledge follow `callerKnowsWine`.
  - For the adder's incomplete glasses, read `wine_identity_drafts`. Title: "{producer name}, {wine name}", leaving out empty parts. Meta: `flightRowNeeds(missing)`, rendered in `--gold-dark`.
  - Other people's hidden glasses carry no identity.
- **Deletions.**
  - From `use-camera.ts`: `TOUCH_PRIMARY_QUERY`, `isTouchPrimary`, `useTouchPrimary`, `viewForDevice` and `DeviceRoutedView`, with their tests.
  - From `desktop-format.ts`: the deprecated wrappers, with their tests.
- **`new-tasting-sheet.tsx`.** Change the `<FlightStep …/>` props only if the signature changed.

**Tests:** None new. `use-camera.test.ts` keeps only the F12 routing cases. V1 item 13 verifies step 2.

**Steps**
- [ ] Rewrite `flight-step.tsx` and `listFlight`.
- [ ] Delete the deprecated exports.
- [ ] Run `npm test` and a bare `npx tsc --noEmit`.

**Acceptance**
- A bare `npx tsc --noEmit` prints nothing: the compile-debt window closes here.
- `rg -n "useTouchPrimary|isTouchPrimary|viewForDevice|rowActionLabel|enterHint\(" src` prints nothing.
- `npm test` is green.

**Closes**
- **Decisions:** D13 (step 2 on the matrix), D10 (create-3 via `listFlight`), D11 (the create-5 UI; lot intent).
- **Findings:** create-6; sources-1 and entry-1 (step-2 lot adds); sources-3 (`listFlight`).
- **Handoff:** decision 5.
- **Spec:** §C.6, §C.7 (step 2), §D.1 #6.

---

### S7 — The flight page Wines card (A1) and the query launcher

**Depends on:** S6, T4

**OWNS**
- modify `src/app/tastings/[id]/page.tsx`
- modify `src/app/tastings/[id]/wine-flight-list.tsx`
- modify `src/app/tastings/[id]/tasting-add-wine-button.tsx`
- create `src/app/tastings/[id]/sheet-from-query.tsx`

**Round-1**
- **Keeps** everything round 1 left on the lobby: Start, the cogwheel, the Participants card, the ▲▼ optimistic reorder, and the Hidden / Added / Revealed badges.
- **Replaces** nothing from round 1. It replaces the older "Yet to add a wine:" line and the Edit link to `/wines/[wineId]/edit`.

**Does** (spec §C.5 A1, §C.6 lobby rows, §C.9)

**Who can add**
- `canAddWine` (page.tsx:120-123) = `tasting.status !== "CLOSED" && (wine_source === "HOST_PROVIDES" ? isHost : myStatus === "JOINED")`.
- It gates every Add button (:246, :500-504, :564-568) and `TastingScanRegistrar` (:417-425). The registrar now also receives `timingMode` and `status`.

**Add button**
- `AddToFlightButton` sits in the Wines card's title row.
- Label: "Add wine" for `HOST_PROVIDES`, otherwise "Add a wine".
- Subtitle, for the host of a host-provides tasting only: "{n} wines · only you can see them", or "1 wine · only you can see them". Nobody else gets one (spec §2.1 row 15).
- It opens `{ kind: "flight", tastingId, tastingName, revealMode, wineSource, position: wines.length + 1 }` with no `start`.

**Rows** (`wine-flight-list.tsx`)
- Every row keeps "Wine N" or `contributorLabel`, the badges, ▲▼ and `RevealButton`.
- The adder's own rows (host of a glass with no contributor, or the contributor) get two lines:
  - **Complete glass.**
    - Line 1: the wine's title.
    - Line 2: "{appellation} · {region} · {primary grape} · {source}".
    - `{source}` comes from `added_via`: SCAN "scanned", CATALOG "from the catalog", CELLAR "from my cellar", BY_HAND "by hand". It is left out when null.
  - **Incomplete glass** (no answer key).
    - Line 1: the draft's title.
    - Line 2: `flightRowNeeds(missing)` in `--gold-dark`.
    - A glass with no answer key and no draft row (a failed second write, spec §C.8) shows `flightRowNeeds(COMPLETE_WINE_FIELDS)`.
- **Data.**
  - Delete `hostWineIdentity` (page.tsx:146-195).
  - Names come from `lookupAppellationAndProducerNames`.
  - Drafts come from `wine_identity_drafts` for the tasting's wine ids; RLS returns only the viewer's own.

**Edit** (adder only)
- A complete glass is editable while the tasting is DRAFT and the wine is unrevealed.
- An incomplete glass is editable while the tasting is not CLOSED and the wine is unrevealed.
- The Edit control calls `openAddWineSheet(destination, { start: "byhand", edit: { wineId } })`. It replaces the link at wine-flight-list.tsx:97-107. The glass loads before the form can focus, so the field is focused on a mouse device and only flagged on a touch device (spec §C.4 rule 9).

**Bring your own**
- Every JOINED participant without a wine gets a row "waiting for {name} to add it", even when the flight is empty.
- Delete "Yet to add a wine:" (page.tsx:250-267).

**`sheet-from-query.tsx`** (client)
- Props: `{ destination: AddWineDestination | null; canAddWine: boolean; editableWineIds: string[] }`.
- `?addWine=byhand` (when `canAddWine`) → `openAddWineSheet(destination, { start: "byhand" })`.
- `?editWine=<id>` (when the id is in `editableWineIds`) → `openAddWineSheet(destination, { start: "byhand", edit: { wineId } })`.
- It runs once (ref guard), then calls `router.replace` without the parameter. Mount it on the lobby.

**Leave alone:** T4's edits (the toggles, the invite card and the `HostControls` props).

**Tests:** None new. The knowledge rule and wording are tested in F12 and F3. V1 items 2, 3, 11, 12, 17 and 21 verify the page.

**Steps**
- [ ] Rewrite the Wines card data and rows.
- [ ] Add `sheet-from-query.tsx` and mount it.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- A bare `npx tsc --noEmit` prints nothing.
- `rg -n "Yet to add a wine|hostWineIdentity" "src/app/tastings/[id]"` prints nothing.
- `rg -n "/edit" "src/app/tastings/[id]/wine-flight-list.tsx"` prints nothing.

**Closes**
- **Decisions:** D7 (the flight page line), D10 (identity-line rule), D13.
- **Screen:** handoff A1.
- **Findings:** scan-7, sources-5 and entry-2 (UI); sources-3 (lobby).
- **Spec:** §C.5 A1, and the §C.6 lobby and query-launcher rows.

---
## Track T — Flow fixes outside the sheet

T tasks run in parallel with F and S wherever their OWNS lists are disjoint (see "Parallelism and Sequencing"). None of them edits `database.types.ts`.

---

### T1 — Create setup rules

**Depends on:** —

**OWNS**
- modify `src/app/tastings/new/actions.ts`
- modify `src/app/tastings/new/new-tasting-form.tsx`
- modify `src/app/tastings/new/setup-copy.ts`
- modify `src/app/tastings/new/setup-copy.test.ts`

**Round-1:** Keeps round 1's optional cover photo (`imageUrl` in `SetupValues` and the photo field on the form) and round 1's setup-copy additions. It replaces nothing from round 1.

**Does**
- **§D.1 #1 — guided pacing is for LIVE tastings only.**
  - `setupColumns` (actions.ts:63-73) stores `sequential_guessing: f.revealMode === "BLIND" && f.timingMode === "LIVE" && f.flow === "GUIDED"`. This covers both create and `updateTastingSetup`.
  - `new-tasting-form.tsx` (:249-278) renders the Flow select and the "Guided means…" line only for BLIND + LIVE.
  - In `setup-copy.ts`, `rulesSummary`, `rulesSummaryShort` and `readySummary` mention Guided or Free only for LIVE tastings.
- **§D.1 #3 — the wine source is locked once the flight has bottles.**
  - `updateTastingSetup` (:231) refuses before any write when the stored `wine_source` differs from `fields.wineSource` and the tasting has at least one wine. It returns `{ error: "Remove the wines first — who brings the wines can't change once the flight has bottles." }`.
  - `new-tasting-form.tsx` accepts `wineCount?: number` (default 0). When it is above 0, the form disables the other wine-source option and shows that same sentence as its hint.
- **§D.1 #5 — the leaderboard setting.**
  - The Leaderboard select renders only when BLIND && LIVE && GUIDED.
  - Otherwise, the collapsed-card hint (:249-255) no longer promises "a quieter leaderboard".
  - Under the same condition only, `rulesSummary` includes its standings part and `rulesSummaryShort` includes "per attribute" / "per wine".
  - The defaults stay "Guided · standings after each attribute · Danish Championship scoring" and "Guided · per attribute".
- **Leave alone:** `createTasting`'s return value, `getJoinLink` and `listFlight` (S6 owns `listFlight`).

**Tests (write first)** — add to `src/app/tastings/new/setup-copy.test.ts`, and update any existing case that expects Guided or standings wording for a self-paced tasting:
```ts
import { describe, expect, it } from "vitest";
import { defaultSetup, readySummary, rulesSummary, rulesSummaryShort } from "./setup-copy";

describe("Guided pacing and the leaderboard only for Live + Guided (create-1, create-8)", () => {
  const live = defaultSetup("BLIND");
  it("keeps the LIVE + Guided defaults", () => {
    expect(rulesSummary(live)).toBe("Guided · standings after each attribute · Danish Championship scoring");
    expect(rulesSummaryShort(live)).toBe("Guided · per attribute");
  });
  it("self-paced drops Guided/Free and every standings wording", () => {
    const selfPaced = { ...live, timingMode: "ASYNC" as const };
    for (const s of [rulesSummary(selfPaced), rulesSummaryShort(selfPaced)]) expect(s).not.toMatch(/Guided|Free|standings|per attribute|per wine/);
  });
  it("LIVE + Free drops the standings wording", () => {
    const free = { ...live, flow: "FREE" as const };
    expect(rulesSummary(free)).not.toMatch(/standings/);
    expect(rulesSummaryShort(free)).not.toMatch(/per attribute|per wine/);
  });
  it("readySummary omits guided/free for self-paced, and shows the invited count (play-1, create-7)", () => {
    expect(readySummary({ setup: live, wineCount: 2, invitedCount: 3, dateText: null })).toEqual(["Blind", "live", "guided", "2 wines so far", "no date", "3 invited", "add more as you pour"]);
    expect(readySummary({ setup: { ...live, timingMode: "ASYNC" }, wineCount: 1, invitedCount: 0, dateText: null })).toEqual(["Blind", "self-paced", "1 wine so far", "no date", "0 invited", "add more as you pour"]);
  });
});
```

**Steps**
- [ ] Add the tests and watch them fail.
- [ ] Update `setup-copy.ts` until they pass.
- [ ] Update the form and the actions.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- `npx vitest run src/app/tastings/new/setup-copy.test.ts` is green.
- tsc is clean.
- `rg -n "sequential_guessing" src/app/tastings/new/actions.ts` shows the LIVE condition.

**Closes:** create-1, play-1 and reveal-2 (storage, form, copy); create-4 (server and form); create-8 (form and copy); spec §D.1 #1, #3, #5.

---

### T2 — Create sheet, invites, the share link, Start and End copy

**Depends on:** T1, T3

**OWNS**
- modify `src/components/new-tasting-sheet.tsx`
- modify `src/app/tastings/new/invite-field.tsx`
- modify `src/app/tastings/new/invite-step.tsx`
- create `src/app/tastings/new/join-link-row.tsx`
- modify `src/app/tastings/[id]/host-controls.tsx`
- create `src/lib/tasting-lifecycle-copy.ts`
- create `src/lib/tasting-lifecycle-copy.test.ts`
- create `src/app/tastings/new/invite-emails.ts`
- create `src/app/tastings/new/invite-emails.test.ts`

**Round-1:** Keeps round 1's cover photo upload in step 1 and the three-step layout. It replaces nothing from round 1.

**Does**
- **§D.1 #2 — the share link (create-2).**
  - Move step 3's link row (the `getJoinLink` call, the URL text and Copy) into `join-link-row.tsx`.
  - Render it in `invite-step.tsx`, and in the draft menu of `host-controls.tsx` next to "Invite more people".
  - Show it while the tasting is DRAFT. For OPEN tastings, also show it while IN_PROGRESS.
  - For non-OPEN tastings, add the hint "Works until you start the tasting."
- **§D.1 #4 — typed invite addresses count (create-7).**
  - `InviteField` gains `onChange?: (emails: string[]) => void`.
  - `new-tasting-sheet.tsx` holds `typedEmails`.
  - `collectEmails()` becomes `collectInviteEmails(selectedEmails, typedEmails, hostEmail)`, and `readySummary`'s invited count uses it.
  - "Save as draft" still sends the invitations.
- **Wine count.** Pass `wineCount={rows.length}` to `NewTastingForm` (T1's prop) when the host goes back to step 1.
- **§D.1 #7 — where Start lands (reveal-5).** Both Start paths route through `startLandsOnConsole({ timingMode, revealMode, wineSource })`: new-tasting-sheet.tsx:314-317 and host-controls.tsx:83-96.
- **§C.7 — Start messages.** Both Start surfaces show `startTasting`'s `{ error }` inline. After a success, they show its `warning` inline (T3's `LobbyActionState`).
- **§D.1 #8 — End copy (reveal-4).**
  - `HostControls` accepts `unrevealedGlasses?: { glass: number; state: "hidden" | "half" }[]`.
  - Its End confirm (host-controls.tsx:311-322) shows `endTastingConfirm(unrevealedGlasses ?? [])`.
  - Remove "This can't be undone" from the End confirm. The Delete-tasting confirm keeps it (host-controls.tsx:137-138).
- **§D.1 #9 — one media-query hook.** Delete the private `useMediaQuery` in `new-tasting-sheet.tsx` (:45-57) and import `useMediaQuery` from `@/components/add-wine/use-camera`.
- **`tasting-lifecycle-copy.ts`** (pure):
  ```ts
  export function startLandsOnConsole(t: { timingMode: TimingMode; revealMode: RevealMode; wineSource: WineSourceMode }): boolean; // LIVE && BLIND && HOST_PROVIDES
  export function endTastingConfirm(glasses: readonly { glass: number; state: "hidden" | "half" }[]): string;
  export function notRevealedEyebrow(glass: number, of: number): string;                                                   // "Not revealed · glass 5 of 6"
  ```
- **`invite-emails.ts`** (pure). `collectInviteEmails(selected: string[], typed: string[], hostEmail: string | null): string[]` trims and lowercases every address, drops empty ones and the host's own address, and dedupes while keeping first-seen order.

**Tests (write first)**

`src/lib/tasting-lifecycle-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { endTastingConfirm, notRevealedEyebrow, startLandsOnConsole } from "./tasting-lifecycle-copy";

describe("startLandsOnConsole (reveal-5)", () => {
  it.each([
    [{ timingMode: "LIVE", revealMode: "BLIND", wineSource: "HOST_PROVIDES" }, true],
    [{ timingMode: "LIVE", revealMode: "BLIND", wineSource: "PARTICIPANT_CONTRIBUTED" }, false],
    [{ timingMode: "LIVE", revealMode: "SEMI_BLIND", wineSource: "HOST_PROVIDES" }, false],
    [{ timingMode: "ASYNC", revealMode: "BLIND", wineSource: "HOST_PROVIDES" }, false],
  ] as const)("%j → %s", (t, v) => expect(startLandsOnConsole(t)).toBe(v));
});

describe("endTastingConfirm (reveal-4)", () => {
  const tail = "You can reopen it from the tasting page.";
  it.each([
    [[], `End the tasting? ${tail}`],
    [[{ glass: 6, state: "hidden" }], `Glass 6 hasn't been revealed — its answer stays hidden. ${tail}`],
    [[{ glass: 5, state: "half" }], `Glass 5 is half revealed — its answer stays hidden. ${tail}`],
    [[{ glass: 5, state: "half" }, { glass: 6, state: "hidden" }], `Glass 5 is half revealed and glass 6 hasn't been revealed — their answers stay hidden. ${tail}`],
    [[{ glass: 6, state: "hidden" }, { glass: 7, state: "hidden" }], `Glasses 6 and 7 haven't been revealed — their answers stay hidden. ${tail}`],
    [[{ glass: 2, state: "half" }, { glass: 3, state: "half" }, { glass: 4, state: "hidden" }, { glass: 5, state: "hidden" }, { glass: 6, state: "hidden" }],
      `Glasses 2 and 3 are half revealed and glasses 4, 5 and 6 haven't been revealed — their answers stay hidden. ${tail}`],
  ] as const)("%j", (glasses, text) => expect(endTastingConfirm(glasses)).toBe(text));
  it("never says it can't be undone", () => expect(endTastingConfirm([{ glass: 1, state: "hidden" }])).not.toMatch(/can't be undone/));
  it("eyebrow", () => expect(notRevealedEyebrow(5, 6)).toBe("Not revealed · glass 5 of 6"));
});
```

`src/app/tastings/new/invite-emails.test.ts`
```ts
import { expect, it } from "vitest";
import { collectInviteEmails } from "./invite-emails";

it("dedupes friend chips and typed addresses, drops blanks and the host (create-7)", () =>
  expect(collectInviteEmails(["A@x.com"], [" a@x.com ", "b@y.com", "", "host@z.com"], "HOST@z.com")).toEqual(["a@x.com", "b@y.com"]));
it("works without a host address", () => expect(collectInviteEmails([], ["c@d.com"], null)).toEqual(["c@d.com"]));
```

**Steps**
- [ ] Write both test files and watch them fail. Implement both pure modules until they pass.
- [ ] Rework `new-tasting-sheet.tsx`, `invite-field.tsx`, `invite-step.tsx`, `join-link-row.tsx` and `host-controls.tsx`.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- Both test files are green.
- tsc is clean.
- `rg -n "function useMediaQuery" src/components/new-tasting-sheet.tsx` prints nothing.
- `rg -n "moves to History" "src/app/tastings/[id]/host-controls.tsx"` prints nothing: the old End confirm is gone.
- The Delete-tasting confirm keeps "This can't be undone." (host-controls.tsx:137-138). Deleting really is irreversible, and §D.1 #8 changes only the End confirm.
- V1 items 13, 15, 25, 28, 29 and 30 verify this task.

**Closes:** create-2; create-7; reveal-5 (Start routing); reveal-4 (lobby confirm); D14 (shared media hook); spec §D.1 #2, #4, #7, #8, #9, and §C.7 (Start messages).

---

### T3 — Lobby server actions and invites

**Depends on:** F3

**OWNS**
- modify `src/app/tastings/[id]/actions.ts`
- modify `src/lib/notifications.ts`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **`startTasting`** (spec §C.7 steps 1–4):
  1. As today, the caller must be the host and the tasting must have at least one wine.
  2. Run `listIncompleteGlasses` → `startRefusal`. A non-null result is returned as `{ error }`.
  3. Run `update tastings set status = 'IN_PROGRESS'` with `.eq("id", id).eq("status", "DRAFT").select("id")`. If no row comes back, return `{ error: "This tasting has already started." }`.
  4. Call `rpc("draw_down_flight_cellar_lots", { p_tasting_id })`.
     - For each row whose `outcome` is not `"drawn"`, add the warning line "Glass {glass}: the bottle couldn't be taken out of the cellar."
     - Join the lines with a space and return `{ success: <existing success text>, warning? }`.
- **`LobbyActionState`** becomes `{ error: string } | { success: string; warning?: string } | null`.
- **`setSequentialGuessing`** (:231): when the tasting's `timing_mode` is ASYNC, return without updating (create-1).
- **`respondToInvite`** (:338-357): for `accept`, read the tasting's status first. If it is CLOSED, return early without updating.
  - Keep the `Promise<void>` signature, because the lobby form action binds it.
  - T4's card stops offering Accept on a CLOSED tasting and shows "This tasting has finished" instead.
  - Decline stays allowed.
- **`getPendingInvites`** (`notifications.ts`:23-46): select the tasting's `status` and skip CLOSED tastings.
- **Unchanged:** `removeWine` and `deleteTasting`. Under D11 there is nothing to give back.

**Tests:** None new. These are server actions, and F3's `incomplete.test.ts` tests the wording they use. These V1 items verify the behaviour:
- 3 and 5: the Start gate, and the draw-down at Start;
- 14: the sequential toggle ignored for a self-paced tasting;
- 26: the CLOSED invite and the bell.

**Steps**
- [ ] Implement the changes above.
- [ ] Run `npm test` and the Working Rules 4 checks.

**Acceptance**
- `rg -n "draw_down_flight_cellar_lots|startRefusal|listIncompleteGlasses" "src/app/tastings/[id]/actions.ts"` shows all three.
- `rg -n "status" src/lib/notifications.ts` shows the CLOSED filter.
- tsc is clean.

**Closes:** D7 (Start gate); D11 (draw-down at Start, never twice); scan-5, sources-1, create-5 and entry-1 (Start side); create-1, play-1 and reveal-2 (lobby toggle, server side); entry-6 (server and bell); spec §C.7 Start, §D.1 #1 (`setSequentialGuessing`), §D.4 #5.

---

### T4 — Lobby page flow fixes

**Depends on:** T2

**OWNS**
- modify `src/app/tastings/[id]/page.tsx`

**Round-1:** Touches no round-1 behaviour. The Wines card and the Add button belong to S7.

**Does**
- **§D.1 #1.** Pass `showSequentialToggle={tasting.reveal_mode === "BLIND" && tasting.timing_mode === "LIVE"}`.
- **§D.1 #5.** Pass `showLeaderboardToggle={tasting.reveal_mode === "BLIND" && tasting.timing_mode === "LIVE" && tasting.sequential_guessing}`.
- **§D.4 #5 (entry-6), the invite card at :362-389.**
  - When `myStatus === "INVITED" && tasting.status === "CLOSED"`, the card reads "This tasting has finished". It has no Accept, and Decline stays.
  - DRAFT and IN_PROGRESS tastings keep Accept and Decline.
- **§D.1 #8 (reveal-4).** Build the unrevealed glasses in list order: every wine with `!is_revealed` becomes `{ glass, state: reveal_step > 0 ? "half" : "hidden" }`. Pass them to `HostControls` as `unrevealedGlasses`.
- **Leave alone** the Wines card, the Add buttons, `canAddWine` and `TastingScanRegistrar`. S7 owns them.

**Tests:** None; this is a component. V1 items 14, 15 and 26 verify it.

**Steps**
- [ ] Make the four edits.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- tsc is clean.
- `rg -n "showSequentialToggle|showLeaderboardToggle|unrevealedGlasses|This tasting has finished" "src/app/tastings/[id]/page.tsx"` shows all four.

**Closes:** create-1, play-1 and reveal-2 (lobby toggle); create-8 (lobby); entry-6 (lobby card); reveal-4 (lobby list); spec §D.1 #1, #5, #8, §D.4 #5.

---

### T5 — Play server guards and the auto-reveal module

**Depends on:** F3

**OWNS**
- modify `src/app/tastings/[id]/play/actions.ts`
- modify `src/app/tastings/[id]/play/reveal-actions.ts`
- create `src/app/tastings/[id]/play/auto-reveal.ts`
- create `src/lib/guess-guards.ts`
- create `src/lib/guess-guards.test.ts`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **`auto-reveal.ts`.** `import "server-only"`; this is not a `"use server"` module.
  - Move `maybeAutoRevealWine` out of `play/actions.ts` (:25-69) as `export async function maybeAutoRevealWine(supabase, wineId)`.
  - It keeps its ASYNC-only rule.
  - It also returns silently when `listIncompleteGlasses` lists the wine (C.8).
- **`sequentialOrderError`** (:75): select `timing_mode`, and return null unless the tasting is LIVE (create-1).
- **`semiBlindMatchesFrozen(supabase, tastingId)`** = `matchesFrozen(revealMode, wines)`. While it is frozen, these return `{ error: "The reveal has started — matches are final." }` (play-2):
  - `submitAllMatchGuesses` (:376);
  - `lockGuesses` (:328);
  - `unlockGuess` (:287), for semi-blind tastings only.
- **`guessableWineError(supabase, tastingId, wineId, participantId)`** (play-8).
  - It selects `is_revealed, reveal_step, contributor_participant_id` with `.eq("id", wineId).eq("tasting_id", tastingId)` and passes the row to `guessBlockReason`.
  - Call sites:
    - `submitGuess` (:150) and `lockGuess` (:232), right after `resolveGuesser`;
    - `submitAllMatchGuesses`, for every wine — any error refuses the whole batch;
    - `lockGuesses`, which skips the guesser's own wines.
- **Incomplete glasses (C.8).**
  - `revealWine` (:442-473), `revealNextCategory` and `revealFull` (reveal-actions.ts:24-62) return `{ error: revealRefusal(rows, wineId) }` whenever that is non-null.
- **`revealFull` refuses CLOSED tastings** (entry-2's related gap). Today it calls `reveal_wine` with no status check. It now reads the tasting's status first and returns `{ error: "This tasting is finished — reveals are closed." }`, the message `revealWine` already uses (play/actions.ts:462-463).
  - `lockGuess` and `lockGuesses` skip `score_own_guess` for an incomplete glass.
- **New server action `scoreLockedGuess(tastingId: string, wineId: string): Promise<LockResult>`.** It is idempotent: it resolves the caller's guess, and calls `score_own_guess` only when that guess is locked, the guess is unscored, and the glass is complete.
- **`guess-guards.ts`** (pure):
  ```ts
  export function guessBlockReason(wine: { isRevealed: boolean; revealStep: number; contributorParticipantId: string | null } | null, participantId: string): string | null;
  export function matchesFrozen(revealMode: RevealMode, wines: readonly { isRevealed: boolean; revealStep: number }[]): boolean;
  ```

**Tests (write first)** — `src/lib/guess-guards.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { guessBlockReason, matchesFrozen } from "./guess-guards";

describe("guessBlockReason (play-8)", () => {
  const wine = { isRevealed: false, revealStep: 0, contributorParticipantId: null };
  it.each([
    [null, "This glass isn't in this tasting."],
    [{ ...wine, revealStep: 1 }, "The reveal for this glass has started — guessing is closed."],
    [{ ...wine, isRevealed: true }, "The reveal for this glass has started — guessing is closed."],
    [{ ...wine, contributorParticipantId: "me" }, "This is your bottle — you don't guess it."],
    [wine, null],
  ] as const)("%j → %s", (w, reason) => expect(guessBlockReason(w, "me")).toBe(reason));
});
describe("matchesFrozen (play-2)", () => {
  it("semi-blind freezes once any glass is revealed or partly revealed", () => {
    expect(matchesFrozen("SEMI_BLIND", [{ isRevealed: false, revealStep: 0 }, { isRevealed: false, revealStep: 2 }])).toBe(true);
    expect(matchesFrozen("SEMI_BLIND", [{ isRevealed: false, revealStep: 0 }])).toBe(false);
  });
  it("never for blind", () => expect(matchesFrozen("BLIND", [{ isRevealed: true, revealStep: 5 }])).toBe(false));
});
```

**Steps**
- [ ] Write the test and watch it fail. Implement `guess-guards.ts` until it passes.
- [ ] Create `auto-reveal.ts`, then change `play/actions.ts` and `reveal-actions.ts`.
- [ ] Run `npm test` and the Working Rules 4 checks.

**Acceptance**
- `npx vitest run src/lib/guess-guards.test.ts` is green.
- `rg -n "async function maybeAutoRevealWine" "src/app/tastings/[id]/play"` matches only `auto-reveal.ts`.
- tsc is clean.

**Closes:** play-2 (server); play-8; entry-2 (`revealFull`'s CLOSED check); create-1, play-1 and reveal-2 (play server); D7 (reveal and lock gates); spec §C.8 (reveal, lock, auto-reveal), §D.1 #1 (`sequentialOrderError`), §D.2 #1, #6. V1 items 21, 22 and 23 verify it.

---

### T6 — Guess and match ladders

**Depends on:** —

**OWNS**
- modify `src/app/tastings/[id]/play/guess-ladder.tsx`
- modify `src/app/tastings/[id]/play/match-ladder.tsx`
- modify `src/app/tastings/[id]/play/field-picker.tsx`
- modify `src/app/tastings/[id]/play/ladder-types.ts`
- create `src/app/tastings/[id]/play/lock-copy.ts`
- create `src/app/tastings/[id]/play/lock-copy.test.ts`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **§D.2 #2 — a region pick sets its country (play-3).**
  - In `pick()`, case `region`, always set `country_id: picked.country_id`. Remove the `!g.country_id` condition and its comment.
  - `pickerGroups("region")` gives each "Everything else" option `sub: <country name>`.
- **§D.2 #3 — ASYNC + IMMEDIATE lock copy (play-4).**
  - `GuessLadderProps` and `MatchLadder`'s props gain optional `timingMode?: TimingMode` and `asyncRevealPolicy?: AsyncRevealPolicy`. Without them, today's copy stays.
  - In ASYNC + IMMEDIATE, use `lockButtonLabel` and `lockFooter`.
  - The ladder's `onLock` first asks `window.confirm(lockConfirm({ glass, blank: pointsAtStake(guess) === 0 }))`.
- **§D.2 #4 — the extras note (play-5).** Replace the note at guess-ladder.tsx:806-819 with `LADDER_EXTRAS_NOTE`.
- **§D.2 #5 — no skip in the match ladder (play-7).**
  - `FieldPickerProps` (ladder-types.ts) gains `skipLabel?: string | null`, default "Not sure — skip it". `null` hides the button and "Next" takes the full width (field-picker.tsx:303-311).
  - `match-ladder.tsx`:
    - passes `skipLabel={null}`;
    - the row text "Skip, or pick a wine" (:245) becomes "Pick a wine";
    - the footer helper (:278) becomes `MATCH_FOOTER`.
- **§D.2 #1, UI half (play-2).** `MatchLadder` accepts optional `frozen?: boolean`. When it is true and no rows are locked, render "The reveal has started — matches are closed" instead of the ladder.
- **`lock-copy.ts`** (pure). Its exports are exactly the names the test imports.

**Tests (write first)** — `src/app/tastings/[id]/play/lock-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { LADDER_EXTRAS_NOTE, MATCH_FOOTER, lockButtonLabel, lockConfirm, lockFooter } from "./lock-copy";

const immediate = { timingMode: "ASYNC", asyncRevealPolicy: "IMMEDIATE" } as const;
describe("lock copy (play-4)", () => {
  it("labels in ASYNC + IMMEDIATE", () => {
    expect(lockButtonLabel({ ...immediate, glass: 3, match: false })).toBe("Submit glass 3 and see the answer");
    expect(lockButtonLabel({ ...immediate, glass: 3, match: true })).toBe("Submit all glasses and see the answers");
  });
  it("keeps today's copy elsewhere", () => {
    expect(lockButtonLabel({ timingMode: "LIVE", asyncRevealPolicy: "AFTER_ALL", glass: 3, match: false })).toBeNull();
    expect(lockFooter({ timingMode: "ASYNC", asyncRevealPolicy: "AFTER_ALL" })).toBeNull();
  });
  it("footer and confirms", () => {
    expect(lockFooter(immediate)).toBe("Saved as you go. Submitting scores this glass and shows you the answer — it can't be changed afterwards.");
    expect(lockConfirm({ glass: 3, blank: false })).toBe("Submit glass 3? You'll see the answer, and it can't be changed afterwards.");
    expect(lockConfirm({ glass: 3, blank: true })).toBe("You haven't answered anything — submit a blank guess for 0 points?");
  });
  it("ladder and match copy (play-5, play-7)", () => {
    expect(LADDER_EXTRAS_NOTE).toBe("Secondary grape and type designation only score if the wine has one (2 pts each). They're under More for every glass.");
    expect(MATCH_FOOTER).toBe("Every glass needs a match — a wrong match just scores 0. Locking saves every match at once and shows the others you are ready.");
  });
});
```

**Steps**
- [ ] Write the test and watch it fail. Implement `lock-copy.ts` until it passes.
- [ ] Change the four components.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- `npx vitest run "src/app/tastings/[id]/play/lock-copy.test.ts"` is green.
- tsc is clean.
- `rg -n "Skip, or pick a wine|appear only if the wine has them" "src/app/tastings/[id]/play"` prints nothing.

**Closes:** play-2 (match-ladder UI), play-3, play-4, play-5, play-7; spec §D.2 #1–#5.

---

### T7 — Standings, results and the reveal view

**Depends on:** —

**OWNS**
- modify `src/lib/stats-math.ts`
- modify `src/lib/stats-math.test.ts`
- modify `src/app/tastings/[id]/standings-panel.tsx`
- modify `src/app/tastings/[id]/results/page.tsx`
- modify `src/app/tastings/[id]/play/reveal-view.tsx`
- modify `src/lib/guess-ladder-math.test.ts`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **§D.3 #2 — one ranking helper (reveal-6).**
  - `rankRows<T>(rows, score)` ranks densely, like `competitorRank`: highest score first, stable among ties.
  - `rankLabel({ rank, tied })` returns "=2" for a tie, otherwise "2".
  - Use both in `standings-panel.tsx`:107-117, `reveal-view.tsx`:235-242 and 377-411, and `results/page.tsx`.
  - The top-row highlight, the crown and the delta pill key on `rank === 1`, never on the list index.
- **`results/page.tsx`.**
  - Totals come from `getTastingLeaderboard`.
  - Competitors are the JOINED participants, minus the host when the tasting is HOST_PROVIDES (the same rule as StandingsPanel).
  - A semi-blind tasting shows `total/{wines}`.
  - The per-wine breakdown covers fully revealed wines only.
  - "Completed", "Final", the crown and the medals render only when `tasting.status === "CLOSED"`. Before that, the heading reads "Standings so far" (:256, :327, :344-371).
- **§D.3 #1 — nothing on record (reveal-3, UI).** In `RevealView` (:201-233):
  - keep null points as null;
  - a null truth shows "Not recorded" with a neutral "not scored" verdict, not the rose miss style;
  - the hero verdict and each row's miss check require `points !== null`.
- **§D.3 #3 — per-wine leaderboards (reveal-7, UI).** `RevealView` gains the prop `leaderboardReveal: "PER_ATTRIBUTE" | "PER_WINE"`, which T8 passes. Under `PER_WINE`, hide the rank delta while a glass is only partly revealed. Keep the glass-so-far delta.
- **`guess-ladder-math.test.ts`.** Add the `rankDelta` case with a null `lastRoundPoints`.

**Tests (write first)**

Add to `src/lib/stats-math.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { rankLabel, rankRows } from "./stats-math";

describe("rankRows (reveal-6)", () => {
  it("dense ranks, highest first, stable among ties", () => {
    const rows = [{ id: "a", t: 8 }, { id: "b", t: 10 }, { id: "c", t: 8 }, { id: "d", t: 5 }];
    expect(rankRows(rows, (r) => r.t).map((x) => [x.row.id, x.rank, x.tied])).toEqual([["b", 1, false], ["a", 2, true], ["c", 2, true], ["d", 3, false]]);
  });
  it("empty", () => expect(rankRows([], () => 0)).toEqual([]));
  it("labels ties", () => expect([rankLabel({ rank: 2, tied: true }), rankLabel({ rank: 1, tied: false })]).toEqual(["=2", "1"]));
});
```

Add to `src/lib/guess-ladder-math.test.ts`:
```ts
it("rankDelta treats a null last_round_points as no change (reveal-7)", () =>
  expect(rankDelta([{ participantId: "gustav", total: 10, lastRoundPoints: null }, { participantId: "ida", total: 12, lastRoundPoints: 6 }], "gustav")).toEqual({ before: 1, after: 2 }));
```

**Steps**
- [ ] Add the tests and watch the `rankRows` ones fail.
- [ ] Implement `rankRows` and `rankLabel` until they pass.
- [ ] Change the three surfaces.
- [ ] Run the Working Rules 4 and 6 checks.

**Acceptance**
- `npx vitest run src/lib/stats-math.test.ts src/lib/guess-ladder-math.test.ts` is green.
- tsc is clean.
- `rg -n "i \+ 1" "src/app/tastings/[id]/standings-panel.tsx" "src/app/tastings/[id]/play/reveal-view.tsx" "src/app/tastings/[id]/results/page.tsx"` shows no rank computed from the index.

**Closes:** reveal-3 (UI); reveal-6 (the helper, plus the lobby panel, reveal view and results page); reveal-7 (UI and test); spec §D.3 #1–#3 (UI parts).

---
### T8 — The play experience and the locked-in state

**Depends on:** F3, T5, T6, T7

**OWNS**
- modify `src/app/tastings/[id]/play/play-experience.tsx`
- modify `src/app/tastings/[id]/play/locked-in.tsx`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **Sequential guessing is LIVE-only (§D.1 #1).** At :328:
  `const sequential = tasting.timing_mode === "LIVE" && tasting.sequential_guessing && !isSemiBlind`.
- **Matches freeze at the first reveal (§D.2 #1).**
  - Compute `frozen = matchesFrozen(tasting.reveal_mode, wines)` and pass `frozen` to `MatchLadder`.
  - When there are locked rows, render `LockedIn` with `canChange: false`.
- **Ladder props (§D.2 #3).** Pass `timingMode` and `asyncRevealPolicy` to `GuessLadder` and `MatchLadder`.
- **Ranks (§D.3 #2).** Use `rankRows` / `rankLabel` at :470-477.
- **Per-wine leaderboards (§D.3 #3, reveal-7).** Pass `leaderboardReveal={tasting.leaderboard_reveal}` to `RevealView` (:946-954), the prop T7 adds. The tasting row is already loaded with `select("*")`.
- **Incomplete glasses (§C.8).**
  - Load `listIncompleteGlasses(supabase, tasting.id)` on the server.
  - `LockedInData` gains three fields:

    | Field | Value |
    |---|---|
    | `canChange: boolean` | defaults to true |
    | `pendingNotice: string \| null` | `pendingAnswerNotice(glass)` for an incomplete glass in ASYNC + IMMEDIATE |
    | `needsScoring: boolean` | IMMEDIATE only: the glass is complete and my locked guess is unscored |

  - `LockedIn`:
    - hides "Change it" when `!canChange`;
    - shows `pendingNotice`;
    - when `needsScoring`, calls `scoreLockedGuess(tastingId, wineId)` once, from an effect guarded by a ref. `AutoRefresh` then picks up the new state.

**Tests:** None new. The pure helpers are tested in T5, T7 and F3. G2 reviewer 4 and these V1 items verify this task:
- 14: LIVE-only pacing;
- 21: an incomplete glass can still be guessed;
- 22: deferred scoring runs once;
- 23: the semi-blind freeze.

**Steps**
- [ ] Make the edits above.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- tsc is clean.
- `rg -n 'timing_mode === "LIVE" && tasting.sequential_guessing' "src/app/tastings/[id]/play/play-experience.tsx"` matches.
- `rg -n "scoreLockedGuess" "src/app/tastings/[id]/play/locked-in.tsx"` matches.

**Closes:**
- create-1, play-1, reveal-2 (play gating); play-2 (freeze UI); play-4 (props); reveal-6 (play surface); reveal-7 (passes the leaderboard setting).
- D7 (deferred-scoring UI).
- Spec §C.8 "How locking defers scoring", §D.1 #1, §D.2 #1 and #3, §D.3 #2.

---

### T9 — The host console

**Depends on:** F3, T2, T7

**OWNS**
- modify `src/app/tastings/[id]/host/page.tsx`
- modify `src/app/tastings/[id]/host/console.tsx`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **Sequential guessing is LIVE-only (§D.1 #1).** Apply the rule in `host/page.tsx`:117-118.
- **A way back (§D.1 #7, reveal-5).** While the tasting is running, the console header shows a "Tasting page" link to `/tastings/{id}`, not only once it has finished.
- **End copy (§D.1 #8, reveal-4).**
  - `FINISH_CONFIRM` (console.tsx:87-88) becomes `endTastingConfirm(unrevealed)`, built from the console's glasses.
  - A finished tasting that still has an unrevealed glass shows the eyebrow `notRevealedEyebrow(n, m)` (:283-285).
- **Nothing on record (§D.3 #1, reveal-3).**
  - A step with nothing on record reads "No {label} on record for this glass — this step scores nobody." (console.tsx:379-384).
  - Correct the `STEP_LABEL` comment in `host/page.tsx`.
- **Ranks (§D.3 #2).** Use `rankRows` / `rankLabel` at console.tsx:474-481.
- **Per-wine standings (§D.3 #3, reveal-7).** Under PER_WINE, `standingsAfter` reads "after glass {revealedCount}", or "nothing revealed yet" (host/page.tsx:341-355).
- **Hide chips from a competing host (§D.3 #4, reveal-1).**
  1. Find the host's participant row.
  2. Compute `hostGuesses = wine_source !== "HOST_PROVIDES" && reveal_mode !== "SEMI_BLIND" && wine.contributor_participant_id !== hostParticipant?.id`.
  3. When `hostGuesses && !wine.is_revealed && revealStep === 0`, send `[{ key: "country", label: "Country", missing: false, state: "next" }]`. Never send `[]`.
  4. From step 1 on, send the full `inPlaySteps(answer)`.
- **Add a wine (§C.6).** "Add a wine" passes `start: "camera"`. Delete the `(min-width: 768px)` query (console.tsx:166-180).
- **Incomplete glasses (§C.8).**
  - Load `listIncompleteGlasses`.
  - For an incomplete glass, `buildGlass` sends no reveal chips and sets `refusal: revealRefusal(rows, wineId)`.
  - The console shows that sentence and disables "Reveal everything" for the glass.

**Tests:** None new. The helpers are tested in T2, T7 and F3. These V1 items verify it:
- 15: the End copy;
- 20: a growing flight;
- 21: the incomplete-glass refusal;
- 25: a competing bring-your-own host at step 0.

reveal-5's verifier items 1–2, a self-lock line for a host who is also guessing, are not built (spec §F.3 Q19).

**Steps**
- [ ] Make the edits above.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- tsc is clean.
- `rg -n "min-width: 768px|can't be undone" "src/app/tastings/[id]/host"` prints nothing.
- `rg -n "revealRefusal|hostGuesses" "src/app/tastings/[id]/host/page.tsx"` matches both.

**Closes:**
- reveal-1; the console side of reveal-3, reveal-4, reveal-6 and reveal-7; reveal-5 (the console link); create-1, play-1, reveal-2 (host page).
- D13 (console start); D7 (the console's reveal gate).
- Spec §C.6 console row, §C.8, §D.1 #1, #7 and #8, §D.3 #1–#4.

---

### T10 — The Overview banner and flight hint

**Depends on:** F11

**OWNS**
- modify `src/lib/overview-types.ts`
- modify `src/lib/overview-data.ts`
- modify `src/lib/overview-math.ts`
- modify `src/lib/overview-math.test.ts`
- modify `src/app/overview/banner.tsx`
- modify `src/app/overview/flight-hint-registrar.tsx`
- modify `src/app/taste/tasting-card.tsx`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **Live banner and hint (§D.4 #2).**
  - `LiveBanner` gains `canAddWine: boolean` and `timingMode: TimingMode`.
  - `overview-data.ts` sets `canAddWine = wine_source === "HOST_PROVIDES" ? host_id === userId : myStatus === "JOINED"`.
  - `banner.tsx` renders the live `FlightHintRegistrar` only when `banner.canAddWine`, as it already does for next-up (:26-53).
  - The registrar passes `phase` — LIVE → "live", ASYNC → "self-paced", next-up → "next" — and stops setting `live`.
  - The banner copy comes from `liveBannerCopy(timingMode, hostName)`:

    | Timing | Dot | Eyebrow | Button |
    |---|---|---|---|
    | LIVE | `LiveDot` (ping) | "Live now · {host}" | "Back to the table" |
    | ASYNC | a still dot | "In progress · self-paced · {host}" | "Continue guessing" |

  - On `/taste`, `tasting-card.tsx` shows `tastingCardStatus(status, timingMode)` for IN_PROGRESS: "Live now" only for LIVE, otherwise "In progress".
- **Next-up waiting rows (§D.4 #3).** The per-participant "Empty" bring-your-own slot lines (overview-data.ts:416-427; banner.tsx:169-190) become "waiting for {name} to add it" rows.
- **`overview-math.ts` additions** (pure): `bannerPhase`, `liveBannerCopy`, `tastingCardStatus`.

**Tests (write first)** — add to `src/lib/overview-math.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { bannerPhase, liveBannerCopy, tastingCardStatus } from "./overview-math";

describe("a self-paced tasting reads 'in progress' (entry-4)", () => {
  it("phase", () => expect([bannerPhase("LIVE"), bannerPhase("ASYNC")]).toEqual(["live", "self-paced"]));
  it("banner copy", () => {
    expect(liveBannerCopy("LIVE", "Ida")).toEqual({ dot: "ping", eyebrow: "Live now · Ida", cta: "Back to the table" });
    expect(liveBannerCopy("ASYNC", "Ida")).toEqual({ dot: "still", eyebrow: "In progress · self-paced · Ida", cta: "Continue guessing" });
  });
  it("taste card", () =>
    expect([tastingCardStatus("IN_PROGRESS", "LIVE"), tastingCardStatus("IN_PROGRESS", "ASYNC"), tastingCardStatus("DRAFT", "LIVE")]).toEqual(["Live now", "In progress", null]));
});
```

**Steps**
- [ ] Add the tests and watch them fail.
- [ ] Implement the three helpers until the tests pass.
- [ ] Change the data, the banner, the registrar and the card.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- `npx vitest run src/lib/overview-math.test.ts` is green.
- tsc is clean outside the debt set.
- `rg -n "live: true|live: false" src/app/overview` prints nothing.

**Closes:**
- scan-4, sources-2, entry-3, entry-4. V2 items 5, 8, 9 and 10 verify them.
- D12 (hint registration); handoff E1/E1b (whether the flight row is present).
- Spec §D.4 #2 and #3.

---

### T11 — Cellar launcher copy and the About fold

**Depends on:** —

**OWNS**
- modify `src/components/nav-links.ts`
- modify `src/app/cellar/page.tsx`
- modify `src/app/cellar/cellar-bottles-table.tsx`
- modify `src/app/overview/cellar-card.tsx`
- modify `src/app/about/page.tsx`

**Round-1:** Keeps round 1's merged Taste menu (Taste Blind · Taste & Rate · Training Room, nav-links.ts:37-43) untouched. Only the Cellar child's label changes.

**Does**
- **Cellar launchers (§D.4 #6).**
  - The label becomes "Add a bottle" in three places:
    - nav-links.ts:62 (the Cellar child only; the Catalog child keeps "Add a wine");
    - cellar/page.tsx:416;
    - cellar-bottles-table.tsx:286.
  - In `cellar-card.tsx`, the dashed empty tile "Add your first bottle" was a Link to `/cellar`. It becomes `ActionButtonClient` with `launch="cellar"` and the tile's classes.
- **About (§D.4 #7).**
  - Remove the separate Taste Semi-Blind card (about/page.tsx:39-43).
  - The Taste Blind body becomes: "Nothing is known in advance — or, semi-blind, the wines are known and the order is not. Guess country, region, grape, vintage and producer, or match each glass to a candidate; the host reveals field by field and the points land as they go."
  - The heading (:189-190) becomes "Three ways to taste".
  - The grid's `xl:grid-cols-4` becomes `xl:grid-cols-3`.

**Tests:** None; this task changes copy and components only. V1 item 7 opens the cellar launcher.

**Steps**
- [ ] Make the edits above.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- tsc is clean.
- `rg -n "Taste Semi-Blind|Four ways to taste" src/app/about/page.tsx` prints nothing.
- `rg -n "Add a bottle" src/components/nav-links.ts src/app/cellar/page.tsx src/app/cellar/cellar-bottles-table.tsx` matches all three.

**Closes:** entry-8, N1 (the About fold), spec §D.4 #6 and #7, the §C.6 cellar rows.

---

### T12 — The legacy identity picker's appellation field

**Depends on:** F13. F9 edited this file earlier.

**OWNS**
- modify `src/components/wine/wine-identity-fields.tsx`

**Round-1:** Touches no round-1 behaviour.

**Does (§D.4 #8)**
- The appellation combobox loses `allowClear`.
- **Placeholder.** `appellationPlaceholder(justTheRegion)`, where `justTheRegion = (await regionSelfNamedAppellation(regionId, regionName)) !== null`. The helpers come from F13's `self-named-appellation.ts` and `by-hand-actions.ts`.
- **First option.** "Just the region · {name}" when that option exists.
- **Removed copy.** "None — just the region above".

**Tests:** None new; F13 tests the helpers.

**Steps**
- [ ] Make the edits above.
- [ ] Run the checks in Working Rules 4 and 6.

**Acceptance**
- `rg -n "allowClear|None — just the region above" src/components/wine/wine-identity-fields.tsx` prints nothing.
- tsc is clean.

**Closes:** byhand-5 (the legacy picker), RC7, spec §D.4 #8 (WineIdentityFields).

---

### T13 — Reveal SQL: `20260912105000_reveal_step_null_scoring` + `20260912106000_leaderboard_round_wine`

**Depends on:** —

**OWNS**
- create `supabase/migrations/20260912105000_reveal_step_null_scoring.sql`
- create `supabase/migrations/20260912106000_leaderboard_round_wine.sql`

**Round-1:** Touches no round-1 behaviour.

**Does**
- **`105000` (spec §E.6).**
  - Recreate these two functions verbatim, changing only the producer and vintage branches §E.6 shows:
    - `reveal_next_category(uuid, smallint)`, from `20260819094000_reveal_next_category_auth_fix.sql`;
    - `reveal_own_next_category(uuid, smallint)`, from `20260819096000_reveal_own_next_category.sql`.
  - Keep each function's signature, `security definer`, `set search_path = public`, the host or owner gate, the CLOSED refusal, the compare-and-set step and `in_play_steps`.
  - One `do` block, in this order:
    1. Capture `v_before`.
    2. `alter table public.guesses disable trigger guesses_block_after_reveal;`. The backfill mostly updates guesses on revealed wines, and that trigger refuses such writes (init_schema.sql:195-209).
    3. Run the guarded backfill.
    4. `alter table public.guesses enable trigger guesses_block_after_reveal;`
    5. Assert:
       - both functions are SECURITY DEFINER with `search_path=public`;
       - `pg_get_functiondef` of each contains `v_ans.producer_id is null then null` and `v_ans.vintage_kind is null then null`;
       - `coalesce(sum(total_points), 0)` still equals `v_before`;
       - no scored, non-semi-blind guess on a null-producer answer still has a non-null `producer_points`, and none on a null-vintage answer still has a non-null `vintage_points`;
       - `guesses_block_after_reveal` is enabled again (`pg_trigger.tgenabled = 'O'`).
  - Correct the stale "NOT NULL" comment about `in_play_steps` inside this migration's comments.
- **`106000` (spec §E.7).**
  - Recreate `get_tasting_leaderboard(uuid)` with the §E.7 SQL.
    - `t` and `countable` stay unchanged from 20260905100000.
    - The new parts are `live_round`, `async_round` and the `last_round_points` rules.
  - Assertions, copied from 20260905100000:
    - the function is SECURITY DEFINER with `search_path=public`;
    - the `guesses read` policy still gates on `is_revealed`;
    - no permissive SELECT policy on `guesses` references `reveal_step`.
  - The §E.7 behavioural assertions, using the §E.0 synthetic-rollback pattern:
    - under PER_ATTRIBUTE, the contributor of the partly revealed round wine gets null, a guesser on it gets a number, and a participant with a scored guess elsewhere but no row on it gets 0;
    - under PER_WINE, the last fully revealed wine is the round wine.
- **Dry runs.** Dry-run each file on its own.

**Tests:** The SQL assertions. Red-run each assertion block first, as in F2.

**Steps**
- [ ] Red-run both assertion blocks.
- [ ] Write both migrations.
- [ ] Dry-run to `DRY-OK 20260912105000 reveal_step_null_scoring` and `DRY-OK 20260912106000 leaderboard_round_wine`.

**Acceptance:** Both `DRY-OK` lines are pasted into the report.

**Closes:** reveal-3 (SQL), reveal-7 (SQL), spec §E.6 and §E.7.

---

### T14 — `blind_pending` unmark: `20260912104000_blind_pending_unmark_on_delete`

**Depends on:** —

**OWNS**
- create `supabase/migrations/20260912104000_blind_pending_unmark_on_delete.sql`

**Round-1:** Touches no round-1 behaviour.

**Does**
- Write the §E.5 SQL verbatim, followed by a `do` block asserting:
  - the trigger exists on `wine_answers` for DELETE and UPDATE;
  - the function is SECURITY DEFINER with `search_path=public`;
  - after the backfill, the count of stale `blind_pending` rows is 0.
- Dry-run the file.

**Tests:** The SQL assertions. Red-run the assertion block first.

**Steps**
- [ ] Red-run the assertion block.
- [ ] Write the migration.
- [ ] Dry-run to `DRY-OK 20260912104000 blind_pending_unmark_on_delete`.

**Acceptance:** The `DRY-OK` line is pasted into the report.

**Closes:** sources-4, spec §E.5, §D.4 #4.

---
## Track M — Apply migrations live (main session only)

**Rules**
- Work strictly in ledger order.
- Dry-run each file immediately before its live apply.
- Stop at the first `FAILED`. Never edit an already-applied migration.

**Running the read-only spot checks.** Use `node --input-type=module` with `pg` and `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`, the same connection `scratch-apply.mjs` uses. Paste every output into the session log.

### M1 — Apply 100000 and 101000

**Depends on:** F2 (committed)

- [ ] `node scripts/scratch-apply.mjs --file supabase/migrations/20260912100100_label_reads.sql --mode dry` → `DRY-OK`, then `--mode live` → `LIVE-APPLIED 20260912100100 label_reads`.
- [ ] `node scripts/scratch-apply.mjs --file supabase/migrations/20260912101000_producer_folded_lookup.sql --mode dry` → `DRY-OK`, then `--mode live` → `LIVE-APPLIED 20260912101000 producer_folded_lookup`.
- [ ] Spot check:
  ```sql
  select to_regprocedure('public.find_producer_by_folded_name(text,uuid)') is not null as lookup_ok,
         to_regprocedure('public.find_or_create_producer(text,uuid)') is not null as create_ok;
  select column_name, is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'label_reads' order by ordinal_position;
  ```

**Closes:** E.1 and E.2 applied live; D1 retention live.

### M2 — Apply 102000 and 103000

**Depends on:** F3 (committed), M1

- [ ] Dry-run, then live-apply `20260912102000_wine_identity_drafts.sql`.
- [ ] Dry-run `20260912103000_cellar_pour_intent.sql` on its own. `is_wine_adder` exists now, so this should print `DRY-OK`. Then live-apply it.
- [ ] Spot check:
  ```sql
  select p, to_regprocedure(p) is not null as ok from unnest(array[
    'public.is_wine_adder(uuid)', 'public.tasting_incomplete_glasses(uuid)',
    'public.draw_down_flight_cellar_lots(uuid)', 'public.pour_cellar_lot_into_glass(uuid)']) p;
  select column_name from information_schema.columns where table_schema = 'public' and table_name = 'wines'
   and column_name in ('added_via','cellar_lot_id','consume_on_start','cellar_consumption_id');   -- must return only added_via
  select to_regclass('public.wine_identity_drafts') is not null as drafts_ok,
         to_regclass('public.wine_pour_intents') is not null as intents_ok;
  ```

**Closes:** E.3 and E.4 applied live.

### M3 — Apply 104000, 105000 and 106000

**Depends on:** M2, T13, T14

- [ ] Dry-run, then live-apply each, in this order:
  1. `20260912104000_blind_pending_unmark_on_delete.sql`
  2. `20260912105000_reveal_step_null_scoring.sql`
  3. `20260912106000_leaderboard_round_wine.sql`

**Closes:** E.5, E.6 and E.7 applied live.

### M4 — Post-apply checks (spec §G.3)

**Depends on:** M3

- [ ] Run the M1 and M2 spot checks again together. All six `to_regprocedure` checks must be true. `wines.added_via`, `label_reads.outcome` and the three new tables must exist, and `wines` must have no `cellar_lot_id` column.
- [ ] Each migration's behavioural assertions (spec §E.0) ran inside its live apply. The seven `LIVE-APPLIED` lines are the proof; paste them.
- [ ] Owner-only RLS is checked against real sessions in V1 item 31, once a draft and a read exist.
- [ ] Run `select version, name from supabase_migrations.schema_migrations where version like '20260912%' order by version;`. It must return seven rows, in ledger order.
- [ ] G1's `npx tsc --noEmit` confirms the app compiles against `database.types.ts`.

---

## Track G — Integration gate, adversarial review, fixes

### G1 — Integration gate

**Depends on:** every F, S and T task committed, and L1

**OWNS:** none. The task is read-only and reports in the session.

**Steps**
- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
  - `next build` is what Vercel runs.
  - It catches what tsc cannot: a client bundle importing `server-only` code (`fixture.ts` with `node:fs`, `server/write.ts`), a `"use server"` file exporting anything but async functions, and Next 16 route or config errors.
  - Read the relevant guide in `node_modules/next/dist/docs/` before fixing a failure (AGENTS.md).
- [ ] Run spec §G.1 gates 2–5, verbatim.
  - **Gate 2.** Must print nothing:
    `rg -n "identityFromPrefill|resolveIdentity|resolveWinePrefill|createScannedWine|missingFields\(|buildIdentity|vintagePrompt|shouldStackPending|parseVintageYear|Still missing|are required\." src`
  - **Gate 3.** Must print nothing:
    `rg -n -i "fastcork" src .env.example`
  - **Gate 4.** Must print nothing:
    `rg -n "destination\??\.kind ===|dest\.kind ===" src/components/add-wine --glob '!matrix.ts' --glob '!add-wine-sheet.tsx' --glob '!use-sheet-adds.ts' --glob '!sheet-state.ts' --glob '!actions.ts'`
  - **Gate 5.** Must print nothing:
    `rg -n 'kind: "rate"' src`
- [ ] Run the plan's extra gates.
  - **Pure-module imports.** Every hit must be an `import type` line; inspect each.
    `rg -n 'from "@/' src/lib/wine-identity --glob '!server/**' --glob '!*.test.ts'`
  - **No server-only in pure modules.** Must print nothing:
    `rg -n "server-only" src/lib/wine-identity --glob '!server/**'`
  - **Removed modules stay removed.** Must print nothing:
    `rg -n "useTouchPrimary|isTouchPrimary|viewForDevice|pending-fix|scan-confirm|destination-footer|wines/new/wine-form|inFlightVisible|regionAppellationCandidates|noneSentinel" src`
  - **No pour intent on `wines`.** Inspect each hit of `rg -n "cellar_lot_id|consume_on_start|cellar_consumption_id" src --glob '!src/lib/supabase/database.types.ts'`. Each must read or write `wine_pour_intents`.
  - **Live-read cap.** `select count(*) from label_reads where model = 'claude-sonnet-5'` is at most 15 before V3.
  - **API transport.** `rg -n "api\.anthropic\.com|fastcork\.com" src` must print nothing, and `rg -n "claude-sonnet-5" src` must match only `src/lib/label-scan/extract.ts`.
  - **Bounded reference reads.** Every `appellations` or `producers` select must be filtered by id, by region, or by a limit. Inspect each hit; none may be unbounded.
    `rg -n '\.from\("(appellations|producers)"\)' src --glob '!**/*.test.ts'`
  - **All seven migrations exist.**
    `ls supabase/migrations | grep 20260912` lists exactly seven files.
  - **Lockfile clean.** `git diff 9258219 HEAD -- package-lock.json | grep '^-' | grep -c libc` prints `0`. Compare commits, not the working tree: the working tree keeps the owner's `libc` deletions on purpose (P0).
- [ ] List every failure as a G3 item, naming its owning task from the OWNS lists.

**Acceptance:** Every command above is green, or its failures are listed for G3.

### G2 — Adversarial review

**Depends on:** G1

**OWNS:** none (read-only)

Run five read-only reviewers in parallel. Each one receives:
- the spec, the ledger, `audit-findings.json`, the handoff files, CLAUDE.md, AGENTS.md and this plan;
- `git diff 9258219..HEAD`, limited to its scope.

Each reviewer tries to break the "Closes" claims of the tasks in its scope. It reports each finding as `{ file:line, severity: high|medium|low, claim broken, reproduction, owning task }`.

1. **Reader and resolver** (F4–F7).
   - Coding agents and tests make zero API calls. L1's live reads stayed within the cap, and every call's usage was logged and stored.
   - The fixture switch is production-safe (`fixtureAllowed`).
   - `readLabelPhoto` validates the path (`isOwnStagingPath`), and the retention insert happens for every billed call, `not-read` included.
   - `serverLookup.searchAppellations` sends `appellationSearchPattern`, and the snapshot lookup mirrors the RPC's punctuation behaviour instead of folding it away.
   - No-GI France resolves to Vin de France.
   - Resolver steps 1–12: no first-hit fallback, country scoping, the cru strip.
   - The confident match never uses a `blind_pending` row, never anchors on a bare title word, and never treats an unread vintage as a wildcard.
   - The cost statement holds: `effort: "low"`, no tools, `max_tokens` 16000.
2. **Completeness and writes** (F1, F3, F8–F10, F13, T3, T5).
   - No second completeness check anywhere; grep and read.
   - Every server write refuses with field keys.
   - `unidentified_wine_id` is cleared on re-link.
   - The draw-down is idempotent and consumes only the adder's lot.
   - The pour intent lives only in the owner-only `wine_pour_intents`, never on `wines`, and a contributor's intent is written by an INSERT.
   - An OPEN tasting never gets an incomplete glass.
   - The unidentified branch clears `catalog_wine_id` in the same statement.
   - No cleanup relies on a delete that RLS forbids.
   - The 105000 backfill re-enables `guesses_block_after_reveal`, and the behavioural assertions roll back their synthetic rows.
   - CLOSED and JOINED guards cover every insert path.
   - A curated blend is never overwritten.
   - All new SQL follows the RLS helper rule.
   - The migration assertions test what they claim.
3. **The sheet against the handoff** (F11, F12, S1–S7).
   - Every screen id — M, A1–A8, A4b, B1–B3, C1–C2, D1–D3, D2b, E1, E1b — is checked against `handoff-canvas-text.txt` copy and the spec §C.2 tables.
   - Branching happens only through the matrix.
   - The first paint for `canScan` is correct.
   - Focus is synchronous: `ByHandForm` and the search view are mounted from the first paint, and Fix runs `flushSync` then `.focus()`.
   - Desktop hover states match the handoff's "States and behaviour", using tokens: rows take the parchment ground; pills and icon buttons a gold border on white; the primary and gold buttons their hover tokens.
   - Enter on a disabled row does nothing, and a just-added row reads "In flight" at once.
   - "Open" uses `RowActionButton`'s `href` variant.
   - Edits survive navigation.
   - Failed reads show as rows.
   - The close-ask prompt appears.
   - No destination is chosen silently.
   - Touch targets on phones and tablets are at least 44 px; the laptop row button stays 36 px.
   - The Base UI `nativeButton` rule is followed.
4. **Flow fixes** (T1, T2, T4, T6–T14).
   - Each D14 bullet matches the spec §D text, including exact copy.
   - Pacing is LIVE-only everywhere: form, storage, lobby, play, server and host page.
   - Semi-blind matches freeze.
   - The End copy is right.
   - The results page shows "Final" only when the tasting is finished.
   - `RevealView` receives `leaderboardReveal`, and hides the rank delta mid-glass under PER_WINE.
   - `revealFull` refuses CLOSED tastings.
5. **Cross-cutting rules.**
   - The CLAUDE.md gotchas: RLS recursion, reference-table reads, controlled inputs under `AutoRefresh`.
   - Nothing from D15 was built.
   - No removed behaviour was reintroduced.
   - Every scheduled deprecation was deleted.
   - The lockfile is clean.

**Output:** one consolidated list. The main session accepts or rejects each finding, with a reason.

### G3 — Review fixes, re-gate, push

**Depends on:** G2

**OWNS:** set per fix group. Each group owns exactly the files its accepted findings name. Groups are disjoint, and groups that share a file are merged.

**Steps**
- [ ] Group the accepted findings by file.
- [ ] Run one fix agent per group, in parallel. Where a fix touches a pure module, write the failing test first.
- [ ] Re-run all of G1, including `npm run build`. Repeat until it is green.
- [ ] The main session commits each group and runs `npm run build` once more on the final tree. Then it runs `git push origin master` (owner preference: straight to master, no PR).

**Closes:** every accepted G2 finding.

### G4 — Documentation that ships with the code

**Depends on:** G1

Runs in parallel with G2; their files are disjoint.

**OWNS**
- modify `CLAUDE.md`
- modify `docs/superpowers/specs/2026-09-12-add-wine-sheet-and-tasting-flow-design.md`
- modify `docs/superpowers/plans/2026-09-12-add-wine-sheet-and-tasting-flow.md`

**Does** (spec §G.6, §A.8)
- **CLAUDE.md.**
  - **Add-wine sheet note.** Rewrite it to cover:
    - `readLabelPhoto` with `claude-sonnet-5` structured output, `effort: "low"`, about $0.01 per scan;
    - `label_reads` retention;
    - `LABEL_READ_FIXTURE`;
    - that FastCork is removed.
  - **New paragraphs:**
    - the wine-identity module: the only definition of complete, wine name optional, one write path;
    - the matrix and `canScan`: a coarse pointer plus a video input, with the development-only `NEXT_PUBLIC_FORCE_CAN_SCAN`;
    - D7 incomplete glasses: `wine_identity_drafts`, the Start and reveal gates, `tasting_incomplete_glasses`;
    - D11: the cellar draw-down happens at Start.
  - **"Appellation is optional" paragraph.** Rewrite it per §G.6 (byhand-5).
  - **"One wine at a time" rule.** Add "LIVE tastings only".
  - **Legacy form.** Note that `wine-form.tsx` is gone and that both legacy routes redirect into the sheet.
  - **Rules this work changes** (spec §G.6). Rewrite each where CLAUDE.md states it:
    - "Start lands on the host console for LIVE + BLIND tastings" becomes LIVE + BLIND + HOST_PROVIDES; a bring-your-own host lands on the lobby.
    - "+N last round": in LIVE tastings the round wine is chosen per tasting (the lowest partly revealed glass, else the newest scored one). ASYNC stays per participant.
    - "Still waiting for {name} to add their wine" becomes "waiting for {name} to add it".
    - Round 1's `(pointer: coarse)` routing note and its `rowActionLabel` note are replaced by `canScan` and the matrix.
  - **No geographic indication:** Vin de France in France, None elsewhere (spec §B.5).
  - **D11:** `wine_pour_intents`, and why the intent is not on `wines`.
  - **Live reads:** `label_reads.outcome`, the L1 harness, the replay fixtures under `__fixtures__/live/`, and D1's 30-read cap.
- **Old flows spec.**
  - Add a one-line pointer to the new spec near line 207, and another in its "Contracts" section.
  - Correct line 314: there is no skip in the match ladder (play-7).
- **Old flows plan.** Add a one-line pointer near lines 9 and 20.
- **Applied history.** Never rewrite it.

**Acceptance**
- `rg -n -i fastcork CLAUDE.md` matches only in the sentence saying it was removed.
- The pointers exist.
- If G3 later changes behaviour that a doc line describes, the G3 fix group updates that CLAUDE.md line.

**Closes:** spec §G.6, §A.8 (docs); play-7 (doc line); byhand-5 (doc); create-1 (doc).

---

## Track V — Browser verification (main session)

**Setup (once)**
- **Fixture.** In `.env.local`, set `LABEL_READ_FIXTURE=src/lib/label-scan/__fixtures__/produttori-barbaresco-2018.json`. Restart the dev server whenever an env var changes.
- **Seed data.** Run a gitignored `.superpowers/add-wine-v2/seed-verification.mjs`, using the Supabase admin client and no Anthropic call.
  - The demo accounts have no `profiles` rows (CLAUDE.md), and tastings and cellar lots reference `profiles`, so the seed creates those rows first.
  - It then creates everything spec §G.4 "Data" lists, for the demo people:
    - a host's DRAFT blind `HOST_PROVIDES` tasting;
    - a DRAFT `PARTICIPANT_CONTRIBUTED` tasting with two JOINED participants;
    - two cellar lots of 2 bottles each, owned by the host;
    - the catalog wine Produttori del Barbaresco · Barbaresco DOCG · 2018 · RED;
    - an IN_PROGRESS LIVE blind `HOST_PROVIDES` tasting with a JOINED guest;
    - an IN_PROGRESS ASYNC blind `HOST_PROVIDES` tasting with the IMMEDIATE reveal policy and a JOINED guest;
    - an IN_PROGRESS LIVE semi-blind tasting with two glasses, and a guest whose matches are locked;
    - an IN_PROGRESS LIVE blind bring-your-own tasting where the host and a guest each contributed a glass;
    - an IN_PROGRESS tasting with one revealed glass, on which two guests have equal scored totals;
    - a CLOSED tasting, and a second CLOSED tasting where a demo user is still INVITED;
    - a DRAFT **self-paced** blind tasting;
    - a label photo longer than 1600 px on its long edge.
- **Sessions.** Mint them with `.superpowers/demo-session.mjs`. Minting again switches users, because all tabs share one cookie jar.
- **Dev server.** Start `npm run dev` in the Browser pane. Keep the pane visible during interactive checks.
- **Failures.** Each failure becomes a fix in the owning task's files, using the G3 procedure. Then re-run the affected check.

### V1 — Mouse device (`desktop` preset)

**Depends on:** G3, G4, M4

- [ ] **1–32.** Run spec §G.4 mouse items 1–32 exactly as written, checking every quoted string verbatim. The numbering is shared with the spec, and tasks cite these items by number:
  - 1–12: search-led add, partial read, Start gate, confident match, cellar draw-down at Start, by hand, the cellar page, the catalog, Taste & rate, failed reads, a CLOSED tasting, a bring-your-own host.
  - 13–16: create sheet step 2, a self-paced tasting, End with a hidden glass, the legacy add route.
  - 17–20: the legacy edit route, Enter twice, both kinds of pour (removing a draft glass; a running flight), a growing flight.
  - 21–24: an incomplete glass in a running tasting, deferred scoring (ASYNC + IMMEDIATE), the semi-blind freeze, a region pick that sets its country.
  - 25–30: a competing bring-your-own host at step 0, a CLOSED invite, ties and "Standings so far", the share link in the draft menu, the wine-source lock, typed invites.
  - 31–32: owner-only drafts and reads from another user's session; the downscaled upload.

### V2 — Phone emulation

**Depends on:** V1

- [ ] **Setup.**
  1. Set `NEXT_PUBLIC_FORCE_CAN_SCAN=1` in `.env.local` and restart.
  2. Apply the `mobile` preset and reload.
- [ ] **1–10.** Run spec §G.4 phone items 1–10 exactly as written. They include the guest with no flight rights (8), a lot with no destination going through the chooser (9), and that guest's lot pick (10).
- [ ] **Reset.** Return to the `desktop` preset and unset `NEXT_PUBLIC_FORCE_CAN_SCAN`.

### V3 — One live read through the UI (inside D1's cap)

**Depends on:** V2 green. D1's development approval covers this read. No new approval is needed while the running total stays within 30 live reads.

- [ ] Check the running total first: `select count(*) from label_reads where model = 'claude-sonnet-5'` must be below 30.
- [ ] Run spec §G.5 "V3" steps 1–5:
  1. Unset `LABEL_READ_FIXTURE` and restart.
  2. Scan one real bottle, once.
  3. Check the `label_reads` row: `model = 'claude-sonnet-5'`, its `outcome`, the tokens, the `read` shape and the `image_path` prefix.
  4. Report the tokens, and the cost from the §A.7 query.
  5. If the read exposed a resolver case, copy the stored `read` into a new live fixture with its replay assertion.
- [ ] **Limits.** One read. No batch, and no retries beyond the SDK's one. Going past 30 live reads in total needs a new approval from the owner.

---
## Appendix A — Traceability: the 55 audit findings

Every finding in `audit-findings.json` appears exactly once below.

"Left for owner" means D15: do not build it. When several tasks are listed, the first one carries the core fix.

| Finding | Severity | Kind | Disposition | Tasks |
|---|---|---|---|---|
| scan-1 | high | defect | fixed | F6 (rule), F7 (server match), S1 (one match card) |
| scan-2 | high | defect | fixed | F7 (match candidates), F8 (`withoutBlindPending`), F9 (cellar and unidentified searches) |
| scan-3 | high | defect | fixed (item 3's caveat superseded, spec §F.3 Q20) | F5 (no first hit, pending producer), F2 (folded lookup SQL), F8 (`resolveProducer`), S1 ("new producer"), S3a/S3b (adoption) |
| scan-4 | medium | defect | fixed | F12 (`adopted` resets), S5a (chooser), T10 (hint only when the viewer can add) |
| scan-5 | medium | defect | fixed | F3 (103000), F10 (lot intent), T3 (draw-down at Start), S2 (copy) |
| scan-6 | medium | judgment | D15 left for owner | in-flight marking only: F13, S2 |
| scan-7 | medium | defect | fixed | F10 (`resolveTastingAdder`), S7 (`canAddWine`, registrar gating) |
| scan-8 | low | defect | fixed | F12 (failed rows survive), S1 (phone row), S4 (laptop row), S5b (queue) |
| sources-1 | high | defect | fixed | F3, F10, T3, S2, S4, S6 |
| sources-2 | high | defect | fixed | T10 (live hint gated), F12 (`routeAdd`, `markAddedInFlight`), S4 (Enter → chooser, never twice), S5a (no silent adoption; in flight after an add), S5b (the hint's tasting id) |
| sources-3 | high | defect | fixed | F12 (knowledge rule), F13 (`flightCatalogIds`, cellar actions), S6 (`listFlight`), S7 (lobby) |
| sources-4 | medium | defect | fixed | T14 (104000), applied in M3 |
| sources-5 | medium | defect | fixed | F10 (server guard), S7 (UI) |
| sources-6 | medium | judgment | D15 left for owner | — |
| sources-7 | low | judgment | D15 left for owner | — |
| sources-8 | low | defect | fixed | F11 (type), F13 (`searchAddWine`), S2 (phone list), S4 (`flattenSearchGroups`) |
| byhand-1 | high | defect | fixed | F2 (SQL), F8 (`resolveProducer`), F9 and F10 (`createProducer` via the RPC), S3a (adoption rule), S3b (combobox) |
| byhand-2 | medium | judgment | fixed | S3b (Style visible, no default) |
| byhand-3 | medium | defect | fixed | F1 (`COMPLETE_WINE_FIELDS`), S3a/S3b (optional in the form) |
| byhand-4 | medium | defect | fixed | F8 (`fillCatalogWine`, full blend), S3b (blend preserved) |
| byhand-5 | medium | defect | fixed | S3b ("Just the region", the no-GI hint), F13 (the targeted self-named lookup), T12 (legacy picker), F9 and F10 (`createRegion`/`createCountry`), G4 (CLAUDE.md) |
| byhand-6 | medium | defect | fixed (item 7's chip superseded, spec §F.3 Q20) | F8, S3b |
| byhand-7 | medium | defect | fixed | F10 (`insertTastingWineUnidentified`), F13 (dispatch), S3b (toggle) |
| byhand-8 | low | judgment | fixed | F11 (`byHand.footerNote`), S3b (renders it) |
| create-1 | high | judgment | fixed | T1 (storage, form, copy), T3 (`setSequentialGuessing`), T4 (lobby toggle), T5 (`sequentialOrderError`), T8 (play), T9 (host page), G4 (doc) |
| create-2 | high | defect | fixed | T2 (`join-link-row` in step 3 and the draft menu) |
| create-3 | high | defect | fixed | F12 (rule), F13 (`searchAddWine`), S6 (`listFlight`) |
| create-4 | medium | defect | fixed | T1 (server refusal, form lock), T2 (passes `wineCount`) |
| create-5 | medium | defect | fixed | F3, F10, T3, S6 |
| create-6 | medium | judgment | fixed (caption only) | S6 |
| create-7 | medium | defect | fixed | T2 (`collectInviteEmails`) |
| create-8 | low | defect | fixed | T1 (form, copy), T4 (lobby toggle) |
| play-1 | high | defect | fixed | T1, T3, T4, T5, T8, T9 |
| play-2 | high | defect | fixed | T5 (server freeze), T6 (match ladder), T8 (play experience, locked-in) |
| play-3 | medium | defect | fixed | T6 |
| play-4 | medium | defect | fixed | T6 (copy, confirms), T8 (props) |
| play-5 | medium | defect | fixed | T6 |
| play-7 | low | defect | fixed | T6, G4 (old spec line 314) |
| play-8 | low | defect | fixed | T5 (`guessableWineError`) |
| reveal-1 | high | defect | fixed | T9 |
| reveal-2 | high | defect | fixed | T1, T3, T4, T5, T8, T9 |
| reveal-3 | medium | defect | fixed | T13 (105000), T7 (reveal view), T9 (console note) |
| reveal-4 | medium | defect | fixed | T2 (lobby confirm), T4 (unrevealed list), T9 (console) |
| reveal-5 | medium | defect | fixed (verifier items 1–2 not built, spec §F.3 Q19) | T2 (both Start paths), T9 (console "Tasting page" link) |
| reveal-6 | medium | defect | fixed | T7 (`rankRows`, standings, results, reveal view), T8 (play), T9 (console) |
| reveal-7 | medium | defect | fixed | T13 (106000), T7 (reveal view prop, `rankDelta` test), T8 (passes `leaderboardReveal`), T9 (`standingsAfter`) |
| reveal-8 | low | judgment | D15 left for owner | — |
| entry-1 | high | defect | fixed | F3, F10, T3, S2, S4, S6 |
| entry-2 | high | defect | fixed | F10 (server), T5 (`revealFull` CLOSED check), S7 (UI) |
| entry-3 | high | defect | fixed (item 4 declined, spec §F.3 Q18) | T10 (live banner `canAddWine`), S5a (a lot goes through the chooser), S5c (context phase) |
| entry-4 | medium | defect | fixed | T10 (banner, card), F11 (`flightHintSubtitle`), S1 (chooser subtitle), S5c (`phase` required) |
| entry-5 | medium | judgment | D15 left for owner | — |
| entry-6 | medium | defect | fixed | T3 (server, bell), T4 (lobby card) |
| entry-7 | low | judgment | D15 left for owner | — |
| entry-8 | low | judgment | fixed | T11 |

**Totals:** 55 findings.
- **49 fixed.** This includes the "judgment" findings the ledger decided to fix: byhand-2, byhand-8, create-1, create-6, entry-8.
- **6 left for the owner (D15):** scan-6, sources-6, sources-7, reveal-8, entry-5, entry-7.
  - D10's in-flight marking already covers part of scan-6 (F13, S2).
  - D15's seventh item, handoff decision 1 (auto-add on a confident match), is not an audit finding and is not built.

---

## Appendix B — Traceability: handoff screens

| Screen | What it is | Tasks |
|---|---|---|
| M | The matrix (destination × `canScan`) | F11 (lookup and tests); S1–S5b read it; S5c (gate 4, no destination branching) |
| A1 | The flight page Wines card | S7 (T4 before it on the same file) |
| A2 | The sheet on open (camera) | S1 (view), F12 (`canScan` routing), S5b (wiring) |
| A3 | Read and confirm | S1 (`ReadConfirm`), F5/F6/F7 (read, resolver, match), S5b (pipeline), L1 (live reads) |
| A4 | Add and keep going (multi stack) | S1 (phone stack), S4 (laptop rows), F12 (`itemRowCopy`) |
| A4b | Fixing a partial read | S3b (finishing form), S5a (Fix routing, "Leave it for later"), F10 (incomplete-glass write), F3 (drafts) |
| A5 | Search | S2, F13 (`searchAddWine` tasted `inFlight`) |
| A6 | From my cellar | S2, F13 (knowledge rule in cellar actions) |
| A7 | By hand | S3a, S3b, F13 (references, grape suggestion, self-named lookup), F8 (write path) |
| A8 | The flight on a laptop | S4 |
| B1 | Into the cellar, laptop | S4 (view, lot preview tile), S2 (lot step) |
| B2 | Into the cellar, phone | S1 (camera with the cellar matrix) |
| B3 | Identical buttons; "+1 bottle" | S4 (laptop rows), S2 (phone rows), F13 (`plusOne`) |
| C1 | Taste & rate, laptop | S4 (view), S5a (`NotePick` → note) |
| C2 | Taste & rate, phone | S1 (camera, Many hidden), S5a, S5b |
| D1 | Catalog, laptop (search first, "Open") | S4 |
| D2 | Catalog, phone (camera) | S1 |
| D2b | Catalog read and confirm (same component as A3) | S1 |
| D3 | Catalog follow-ups | S1 (`follow-up-view.tsx`), S5a (adoption to cellar or note) |
| E1 | No destination, with a tasting | S1 (chooser UI), S5a (adoption and reset), T10 (hint only when the viewer can add) |
| E1b | No destination, no tasting | S1, S5a, T10 |
| N1 | The nav merge | Already on master (nav-links.ts:37-43); T11 (About folds Semi-Blind into Taste Blind) |

---

## Appendix C — Traceability: diagnosis root causes

| Root cause | Title (short) | Disposition | Tasks |
|---|---|---|---|
| RC1 | FastCork returns no appellation, country or designation | **superseded by D1** | F4 (structured schema), F7 (Sonnet reader) |
| RC2 | `splitRegion` flattens region into appellation | **superseded by D1** | F4, F7 (FastCork mapping deleted) |
| RC3 | Resolver matches geography as whole strings | fixed | F5 (country-scoped resolver, synonyms and their tests, the punctuation-tolerant search pattern), L1 (live reads) |
| RC4 | Unfiltered and fallback picks fill wrong geography | fixed | F5 (no first hit, country filter, cru strip only trailing) |
| RC5 | Unpaged self-named appellation lookup | fixed | F7 (old lookup deleted), F5 (resolver never defaults to it), F13 (`regionSelfNamedAppellation`: a targeted, paged prefix query, with the page-cap test), S3b ("Just the region") |
| RC6 | No shared definition of complete | fixed | F1 (module), then every consumer: F8, F9, F10, F13, S1–S5c, T3, T5, T9 |
| RC7 | Appellation required but presented as optional | fixed | S3b, T12, F9 and F10 (creators keep the shape) |
| RC8 | By-hand edits lost on Back | fixed | F12 (sheet owns the draft), S3b (controlled form), S5b (views mounted from the first paint) |
| RC9 | `wine_type` / full-name mapping pollutes colour and names | **superseded by D1** | F4 (colour and style enums in the schema) |
| RC10 | Second, producer-based resolver | fixed | F5 (step 7: region only; the cross-country test), S3a (`applyProducerRegion`: country and region only, with round 1's guards) |
| RC11 | Sheet drops profile, price and full blend | fixed (blend half) / **superseded by D1** (profile and price half) | F8 (`fillCatalogWine` full blend), S3b (blend preserved); profile and price: FastCork removed in F7, spec §F.3 Q9 |
| RC12 | Chooser gives fewer escape routes | fixed | S1 (recovery buttons on E1/E1b), S5a |

---

## Appendix D — Ledger decisions → tasks

| Decision | Tasks |
|---|---|
| D1 Sonnet 5 reader, FastCork removed, live verification | P0, F4, F7, L1, M1, G4, V3 |
| D2 One complete wine | F1, F3, F8, F9, F10, F13, S1, S2, S3a, S3b, S4, S5a, S5b, T3, T5, T9 |
| D3 Wine name optional | F1, S3a, S3b |
| D4 Matrix, rate → note | F11, S1, S5a, S5c |
| D5 `canScan` | F12, S5b, S6 |
| D6 One read-and-confirm component | F5, F6, F7, F12, S1, S5b, L1 |
| D7 Partial reads, "Leave it for later" | F3, F10, F12, F13, S3b, S5a, S5b, S7, T3, T5, T8, T9 |
| D8 By hand | F5, F6, F13, S3a, S3b |
| D9 Laptop | F11, S2, S4, F13 (`plusOne`) |
| D10 Search, cellar source, knowledge rule | F12, F13, S2, S4, S6, S7 |
| D11 Draw-down at the pour | F3, F10, T3, S2, S4, S6 |
| D12 No destination | F11, F12, S1, S5a, S5c, T10 |
| D13 Flight page and entry points | F10, S6, S7, T9 |
| D14 Flow fixes | T1–T14, S6 (create-6) |
| D15 Left for owner | not built — see Appendix A |
| Migrations list | F2 (100000, 101000), F3 (102000, 103000), T14 (104000), T13 (105000, 106000); applied in M1–M3 |

---

## Appendix E — Spec sections → tasks

| Spec section | Tasks |
|---|---|
| §1–§2 Purpose, deviations | Global Constraints; each deviation row in the task that builds it (rows 1 F1/S3a; 2 F3/F10/T3; 3 S3b; 4 S3b; 5 S1; 6 S1; 7 S3b; 8 F10; 9 S1; 10 F4; 11 F3; 12 S1/S4; 13 S4; 14 F11/S4; 15 S7; 16 S3b; 17 S3b) |
| §A.1 Files, dependencies | P0, F4, F7 |
| §A.2 The Sonnet 5 call | F7 |
| §A.3 Schema | F4 |
| §A.4 Downscale | F12 (module), S5b (pipeline) |
| §A.5 Server action, retention | F7 |
| §A.6 Fixture switch | F4 (fixtures), F7 (switch) |
| §A.7 Cost statement | Global Constraints, L1, V3 |
| §A.8 FastCork removal | F7, F9, S1, S4, S5b, S5c, G4 |
| §B.1–§B.4 Module, types, contract, provenance | F1 (core), F3 (incomplete wording), S3a (`fieldChip`) |
| §B.5 Resolver | F5, F7 (`serverLookup`), L1 |
| §B.6 Confident match | F6, F7, F8, F9 |
| §B.7 Producer folded lookup | F2, F8, F9, F10, S3a, S3b |
| §B.8 Grape suggestion | F6, F13, S3a, S3b |
| §B.9 Unified write path | F8, F9, F10, F13, S5a |
| §C.1 Contracts | F11 |
| §C.2 Matrix | F11 |
| §C.3 `canScan` | F12, S5b, S6, T9 |
| §C.4 Shell state | F12, S5a, S5b |
| §C.5 Screens | A1 S7 · A2 S1 · A3/D2b S1 · A4 S1/S4 · A4b S3b/S5a · A5 S2 · A6 S2 · A7 S3a/S3b · A8 S4 · B1–B3 S2/S4 · C1–C2 S1/S4/S5a · D1–D3 S1/S4/S5a · E1/E1b S1/S5a · N1 T11 |
| §C.6 Entry points | F10, S5c, S6, S7, T9, T10, T11 |
| §C.7 Draw-down | F3, F10, T3, S2, S4, S6 |
| §C.8 Partial reads, incomplete glasses | F3, F10, F13, T3, T5, T8, T9, S3b, S5a, S5b, S7 |
| §C.9 Knowledge rule | F12, F13, S6, S7 |
| §D.0 Finding map | Appendix A |
| §D.1 Create | T1, T2, T3, T4, T5, T8, T9, S6 |
| §D.2 Play | T5, T6, T8, G4 |
| §D.3 Reveal | T7, T9, T13 |
| §D.4 Entry points and data | F9, F10, T3, T4, T10, T11, T12, T14 |
| §E.0–§E.8 Schema | F2, F3, T13, T14; applied in M1–M3 |
| §F.1 Left for owner | not built |
| §F.2–§F.3 Flags and open questions | reported by the orchestrator; not built |
| §G.1 Unit tests and gates | every task's Tests; G1 |
| §G.2 Fixture scan tests | F4, F5 |
| §G.3 SQL | every migration task; M1–M4 |
| §G.4 Browser checks | V1, V2 |
| §G.5 Live reads | L1, V3 |
| §G.6 Documentation | G4 |
