# Training Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A solo blind-tasting practice room at `/taste/training`: the WSET form with a live-ranked list of typical wines beside it, a reveal through the add-wine sheet, a championship-style self-score, and a history — plus the archetype model and content pipeline that feed it.

**Architecture:** Pure matching on the device over a per-request pool read of `wine_archetypes` (extended with scoring FKs, designations, typical age and signature aromas); one SECURITY DEFINER RPC `record_training_attempt` writes the WSET note (through `save_wset_note`, forcing the identity fields itself) and a `training_attempts` row with SQL-computed points, idempotent on a device-minted session key; the page is a server component that hands `TrainingCandidate[]`, the aroma lexicon and the viewer's history to one client component with three states (landing / session / result). Content arrives as JSON → fail-closed data migrations.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, base-ui (shadcn), Supabase Postgres/RLS, vitest (node, no DOM, relative imports for pure modules), node `--test` DB suites (rolled back).

**Spec:** `docs/superpowers/specs/2026-09-25-training-room-design.md` (D1–D22 are fixed owner decisions; §3–§9 are the contract; the "since the critique" notes are binding).

## Global Constraints

- Every guessable field is a reference-table FK; archetypes carry `country_id`, `region_id`, `appellation_id` resolved by exact **live** name at write time (spec D8, §4.1, §4.7); never name-match at runtime.
- Point values: country 2, region 3, appellation 5, primary grape 8, secondary grape 2, type designation 2, vintage 2/1/0 with `reveal_wine`'s rule — defined once in `record_training_attempt`; a DB test pins them to `reveal_wine`'s (spec D7).
- Matching constants (spec §5): step scores 1.0 / 0.6 / 0.2 / 0; weights sweetness, tannin, acidity 1.5; body 1.2; alcohol, colourHue, mousse 1.0; noseIntensity, flavourIntensity, finish 0.8; development, appearanceIntensity 0.6; aromas 2.0; signature +1.0 per exact hit, max 2, a pure bonus, closeness capped at 100; cap 15 %; null closeness when the denominator is 0; alcohol skipped whenever either side is fortified.
- Ladders (spec §4.4): full enum order from `src/lib/wset/types.ts` for every graded scale except alcohol (`ALCOHOL_STOPS`, three steps) and hue (`HUES_BY_COLOUR[candidate.colour]`).
- Copy verbatim from spec §9; English only.
- Every new RPC: EXECUTE `authenticated` only; revoke from PUBLIC, anon, service_role explicitly. `training_attempts`: SELECT own only; no client INSERT/UPDATE/DELETE grant.
- Migrations carry same-transaction pre/post-state asserts and are written, never applied, by implementers. The migration applier is `node --env-file=.env.local <scratchpad>/apply-migration.mjs <file> [--dry]` (main session only).
- `"use server"` files export only async functions; shared types live in plain modules; pure modules use relative imports so vitest can load them.
- Tokens only (no hex), light default, `.dark` follows; ≥ 44 px tap targets on touch (`min-h-11 md:pointer-fine:min-h-0`); every form value is React state.
- Base UI: `Button render={<Link/>}` needs `nativeButton={false}`; `Select` needs `items`; combobox search inputs focus synchronously inside `onOpenChange(true)`; `DropdownMenuItem render={<Link/>}`, never `asChild`.
- Never touch the owner's checkout `C:\Users\Public\repos\blindtastingapp`; work only in `C:\Users\Public\repos\blindtastingapp-training`.
- No Anthropic API calls anywhere in this plan (AGENTS.md).

## Review Focus

1. A note with a scale the candidate lacks (a white with no `tannin` range) or an off-ladder range bound must not be penalised — the scale leaves both numerator and denominator (Task 3).
2. `record_training_attempt`: a repeated `session_key` returns the first attempt; `attempt_id` of another user or of an already-scored attempt is refused (42501 / P0001) and nothing is written; a RUBY hue revealed as a WHITE wine saves with `colour_hue` null and `hue_cleared` true (Task 1).
3. A capped candidate never ranks above an uncapped numbered one; `null` bubbles/fortified never cap; an ORANGE candidate is uncapped on GOLD (Task 3, Task 10).
4. A `TRAINING` note without identity saves (constraint branch) while an `OPEN` note without identity is still refused (Task 1).
5. The reveal sheet hands the pick to the room and never opens `NewNoteModal`, never consumes a cellar lot, and ignores a stale pick from an earlier open (Task 7).

## Interface Contracts

### Types — `src/lib/training/types.ts` (plain module)
```ts
import type { WineColour, WineStyle, WsetNoteState } from "@/lib/wset/types";
export type Range = [string, string];
export type Named = { id: string; name: string };
export type TrainingCandidate = {
  id: string; name: string; description: string | null;
  colour: WineColour; style: WineStyle;
  country: Named; region: Named; appellation: Named & { isRegional: boolean };
  primaryGrape: Named; secondaryGrape: Named | null;
  designations: Named[];
  typicalAge: [number, number] | null;
  sat: Record<string, Range | undefined>;
  aromas: { termId: string; term: string; group: string; kind: "NOSE" | "PALATE"; signature: boolean }[];
  placeCanonicalKey: string | null;
  qualityLow: number | null; qualityHigh: number | null;
};
export type MatchExtras = { bubbles: boolean | null; fortified: boolean | null };
export type CapReason = "colour" | "bubbles" | "fortified";
export type RankedCandidate = {
  candidate: TrainingCandidate;
  closeness: number | null;          // 0..100; null when nothing answered applies
  capped: CapReason | null;
  explanation: string | null;        // spec §5.7
  signatureHits: string[];           // exact terms hit
};
export type RankingSnapshot = { archetypeId: string; name: string; closeness: number | null; rank: number; capped: CapReason | null }[];
export type AromaLexicon = Record<string, { term: string; group: string }>;   // by term id
export type VintageGuess = { kind: "YEAR"; year: number } | { kind: "NV" } | { kind: "TAWNY"; years: number } | null;
export type TrainingDraft = {
  userId: string; sessionKey: string; startedAt: string;
  note: WsetNoteState; extras: MatchExtras;
  pickedArchetypeId: string | null; vintage: VintageGuess;
};
export type PointCategory = "country" | "region" | "appellation" | "primaryGrape" | "secondaryGrape" | "typeDesignation" | "vintage";
export type AttemptRow = {
  id: string; createdAt: string;
  picked: Named | null; vintage: VintageGuess;
  actual: { catalogWineId: string; label: string | null; lineage: string | null } | null;
  actualArchetype: Named | null;
  hueCleared: boolean; noteColourHue: string | null;
  points: Record<PointCategory, number | null>;
  total: number | null; possible: number | null;
  snapshot: RankingSnapshot;
};
```

### Pure functions
- `src/lib/training/match.ts`: `rankCandidates(note: WsetNoteState, extras: MatchExtras, pool: TrainingCandidate[], lexicon: AromaLexicon): RankedCandidate[]`; `explain(input: { candidate: TrainingCandidate; closeness: number | null; capped: CapReason | null; signatureHits: string[]; losses: { scale: string; loss: number; direction: "higher" | "lower" | null }[]; aromaLoss: { loss: number; group: string | null } | null }): string | null`; `snapshotRanking(ranked: RankedCandidate[]): RankingSnapshot`; `ladderFor(scale: string, candidate: TrainingCandidate): string[] | null`; `stepScore(d: number): number`; `WEIGHTS`, `CAP_MAX = 15`.
- `src/lib/training/copy.ts`: `TRAINING_COPY` (every §9 fixed string) plus `shortName(name)`, `coverageLine(countries: { name: string; count: number }[], total: number): string`, `stripLine(ranked: RankedCandidate[]): string`, `lineageLine(c: TrainingCandidate): string`, `resultTotalLine(total: number, possible: number): string`, `tallyLine(t: { scored: number; grapeHits: number; appellationHits: number }): string`, `attemptRowLine(row: AttemptRow): string`, `capReasonLine(reason: CapReason, ctx: { noteColour: WineColour | null; candidateColour: WineColour }): string`, `styleVerdictLine(v: { rank: number; n: number; pct: number | null; capped: CapReason | null } | null): string`, `hueClearedLine(hue: string, colour: WineColour): string`.
- `src/lib/training/history-math.ts`: `tally(rows: Pick<AttemptRow, "points" | "total">[]): { scored: number; grapeHits: number; appellationHits: number }`.
- `src/lib/training/draft.ts` (client): `readDraft(userId): TrainingDraft | null`, `writeDraft(d: TrainingDraft): void`, `clearDraft(userId): void`, `draftKey(userId): string`, `newSessionKey(): string` — via `src/lib/safe-storage.ts` (add `clearValue(key)` there if it has no remove helper).
- `src/lib/wset/note-state.ts`: `noteToPayload(state: WsetNoteState, ids: { catalogWineId: string | null; unidentifiedWineId?: string | null; contextKind: NoteContextKind; tastingWineId: string | null }): Record<string, unknown>` and `aromasToPayload(state: WsetNoteState): { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean }[]` — extracted from `note-editor.tsx`, which then imports them.
- `src/lib/training/pool.ts` (server-only): `readTrainingPool(supabase): Promise<TrainingCandidate[]>`; `readTrainingHistory(supabase, userId, cursor?: { createdAt: string; id: string }): Promise<{ rows: AttemptRow[]; nextCursor: { createdAt: string; id: string } | null }>` (20 per page, follows `catalog_wines.merged_into`); `readTrainingTally(supabase, userId)`; `coverageCountries(pool): { name: string; count: number }[]`; `candidateToArchetypeView(c: TrainingCandidate): ArchetypeView`.

### Server actions — `src/app/taste/training/actions.ts` (`"use server"`)
```ts
export type FinishInput = {
  sessionKey: string; startedAt: string;
  note: Record<string, unknown>;        // noteToPayload(state, { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null }) — the RPC forces the identity fields anyway
  aromas: { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean }[];
  pickedArchetypeId: string | null; vintage: VintageGuess;
  actualCatalogWineId: string | null;
  snapshot: RankingSnapshot;
};
export type FinishResult =
  | { ok: true; attemptId: string; noteId: string; points: Record<PointCategory, number | null>; total: number | null; possible: number | null; actualArchetypeId: string | null; hueCleared: boolean }
  | { error: string };
export async function finishTrainingSession(input: FinishInput): Promise<FinishResult>;
export async function revealTrainingAttempt(attemptId: string, catalogWineId: string): Promise<FinishResult>;
export async function loadMoreTrainingHistory(cursor: { createdAt: string; id: string }): Promise<{ rows: AttemptRow[]; nextCursor: { createdAt: string; id: string } | null }>;
```

### RPC — `record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb) returns jsonb`
`p_attempt = { attempt_id?, session_key, started_at, picked_archetype_id?, guessed_vintage_kind?, guessed_vintage_year?, guessed_vintage_tawny_years?, actual_catalog_wine_id?, candidates_snapshot }`; returns `{ attempt_id, note_id, points: { country, region, appellation, primary_grape, secondary_grape, type_designation, vintage }, total, possible, actual_archetype_id, hue_cleared }` (spec §6.2, all five steps).

### Components (client unless noted)
- `src/app/taste/training/page.tsx` (server): `AppHeader title="Training room"`, reads pool, terms (`wset_aroma_terms`), first history page, tally, user → `<TrainingRoom userId candidates terms history tally coverage />`.
- `training-room.tsx`: `TrainingRoom({ userId, candidates, terms, history, tally, coverage })` — states landing/session/result; owns note state via `WsetSheet onChange`, extras, pick, vintage; draft persistence + `storage` listener; calls `finishTrainingSession` / `revealTrainingAttempt`.
- `candidates-panel.tsx` (lg column), `candidates-strip.tsx` + `candidates-sheet.tsx` (below lg), `your-call.tsx` (with the vintage picker groups from the ladder), `result-view.tsx`, `history-list.tsx`, `archetype-detail.tsx` (wraps `ArchetypeSheet` with `answers`).
- `WsetSheet` new props: `onChange?(state)`, `footerAction?: { label: string; onClick(): void }`, `belowBar?: ReactNode`, `aside?: ReactNode | null`, `onClose?(): void`, `bubbles?: { value: boolean | null; onChange(v: boolean | null): void }`, `fortified?: { value: boolean | null; onChange(v: boolean | null): void }`; `onSave` optional when `footerAction` is given.
- `ArchetypeSheet({ a, answers?, idPrefix? })`; `ArchetypeView` gains `lineage: string` and a nullable place.
- Add-wine: `AddWineDestination` note variant `{ kind: "note"; reveal?: true }`; `AddWineOpenOptions.onNotePick?: (pick: NotePick) => void`.
- Nav: `NavChild.preview?: boolean`; `navChildState(child): "link" | "soon" | "preview"`.

---


## Controller rulings (read before any task; they override the task text where they conflict)

- **R1 `wine_archetypes.wine_place_id` typing.** Task 1 flips `database.types.ts`'s `wine_archetypes.Row.wine_place_id` (and Insert/Update) to `string | null` in the same commit as the migration, and adds the minimal non-null guard at every existing reader that stops compiling (`src/app/knowledge/designations/page.tsx` and `src/lib/wset/archetype-detail.ts` — filter null ids out of the `.in(...)` lookup and fall back to an empty place name), so `npx tsc --noEmit` is green after Task 1. Task 13's "flip the type" step becomes a check that it already is nullable. Task 6 then rewrites those readers properly (lineage instead of the empty fallback).
- **R2 `candidateToArchetypeView`** lives in the pure module `src/lib/training/archetype-view.ts` (Task 6). `src/lib/training/pool.ts` re-exports it; client components import from `archetype-view.ts`.
- **R3 `justTheRegionOption`** is imported from `src/components/add-wine/self-named-appellation.ts` (its real home), not `src/lib/self-named-appellation.ts`.
- **R4 Copy helper names.** Task 2 defines the copy module; later tasks use ITS names. Where a later task's code names a helper Task 2 does not define, the implementer of that later task adds the helper to `src/lib/training/copy.ts` **under Task 2's naming style** with a test, instead of importing a name that does not exist — and never creates a second helper for the same string (e.g. use Task 2's `sheetTitle`, do not add `sheetTitleLine`; add `percentLabel` only if no equivalent exists). Every string still comes verbatim from spec §9.
- **R5 `noteToPayload` `contextKind`** is `NoteContextKind | null` (null = let `save_wset_note` keep or default the context), as Task 4 defines it; the room passes `"TRAINING"`.
- **R6 `safe-storage`** gains `clearValue(getStorage, key): boolean` beside `readValue`/`writeValue`/`clearFlag` (Task 2's signature wins over the header's `clearValue(key)`).
- **R7 The DB suite `scripts/training-room.test.mjs` is written by Task 1 and Task 13 but RUN ONLY BY THE MAIN SESSION** (it applies the migrations inside rolled-back transactions against the live database). Implementers' gates for those tasks are `node --check` on the scripts, vitest, tsc and eslint; the plan's "run the suite" steps are executed by the main session after the task lands.
- **R8 Invented copy** (reveal-matrix upload body, by-hand eyebrow, cellar tile tail, admin validation strings, `SAVE_REFUSED`) is allowed where spec §9 is silent; keep it short, English, in `copy.ts` or the matrix, and list it in the task report for the owner's copy review.
- **R9 Live archetype names.** The 15 live rows are named "A typical Côte de Nuits" (no " red") and "A typical Côte de Beaune" (a WHITE Chardonnay archetype); the back-fill uses the live strings exactly as Task 1 already does.
- **R10 Task order is 1 → 14.** Tasks 10 and 11 cannot pass tsc until 3, 5, 6, 7 are merged; that is the order they run in. Task 11 edits Task 10's `training-room.tsx` by exact anchors — Task 10's implementer must keep those anchors verbatim (they are quoted in Task 11).

## Planner notes (contract deviations, kept for the implementers)

#### From training-room-schema.md

# Training room plan — part: schema and content pipeline (Tasks 1, 13)

**Contract notes** (where this part had to choose; the spec wins over the header, and every name the header lists is kept):
1. **Live names differ from spec §4.1's table** (read-only, production, 2026-09-25). The live archetypes are `A typical Côte de Nuits` (no " red") and `A typical Côte de Beaune`, and the second is a **WHITE** Chardonnay archetype, not "(red)". The back-fill uses the live strings with the spec's appellations (both take the regional `Bourgogne AOC`). The live grape is `Semillon` (no accent), not "Sémillon". Every other string in the table matched live exactly, as did the appellations `Cote Chalonnaise AOC` and `Macon AOC` (no accents) and `Margaux AOC` (Bordeaux also holds a bare `Margaux` that nothing references).
2. **`database.types.ts` `wine_archetypes.Row.wine_place_id` stays `string` in Task 1 and becomes `string | null` in Task 13.** Task 6's part lists `string | null` as consumed from Task 1, but flipping it in Task 1 fails `npx tsc --noEmit` for Tasks 2–5 at exactly three places Task 6 rewrites (`src/app/knowledge/designations/page.tsx` lines 63 and 71, `src/lib/wset/archetype-detail.ts` line 46; verified in a scratch copy). Task 6's new code guards `wine_place_id` with a truthiness check and a `(string | null)[]` filter, so it compiles against either type. `Insert.wine_place_id` is `string | null` (optional) from Task 1, so Task 12's editor can write null. No live row is null before batch 1 lands, which is Task 13; Task 13 flips the Row type and runs `tsc`.
3. `wine_archetypes.primary_grape_id`'s foreign key becomes `ON DELETE RESTRICT`. It was `ON DELETE SET NULL`, which on a NOT NULL column can only fail with a not-null error.
4. `training_attempts` has every column and check of spec §6.1, with explicit constraint names, plus one extra check (`candidates_snapshot` must be a JSON array). `wine_archetypes` gets one named check for typical age (both values ≥ 0 and low ≤ high).
5. `record_training_attempt`'s refusals. These are SQL errors, not §9 UI copy, and Task 9 shows them verbatim: `not signed in` (42501), `a new session takes no note id` (42501), `that session is not yours` (42501), `already revealed` (P0001), `no such wine`, `no such typical wine`, `a session key is required`, `name the wine to reveal`, `the attempt must be an object`, `the note must be an object`, `the aromas must be a list`, `the ranking must be a list` (all 22023). A fresh attempt with no `started_at` uses `now()`. A re-reveal whose note already carries an identity leaves the note alone and still scores the named wine.
6. The batch JSON puts `mousse` as a top-level key next to `sat`, not inside it (Prosecco, Franciacorta, Cava). The generator folds it into `sat.mousse`, the key the matcher and the live Champagne row use. `missingReferenceRows` supports `regions` ({country, region}), `appellations` ({country, region, appellation}) and `grapes` ({name}); it has no countries. Spec §4.7 says an appellation may be added only when its region has "no candidate row". This part reads that as: no appellation in that region whose name, folded (accents, case, punctuation and a trailing AOC/AOP/DOC/DOCG/DOCa/DO/DOP/AVA/DAC/IGT/IGP/GI/PDO/PGI dropped), equals the new name folded. Batch 1 lists nothing.
7. Task 13 creates four files beyond the two the task list names, so the validator and the generator share one pure, tested core. They are `scripts/training/archetype-ladders.mjs` (the §4.4 ladders as plain JS), `scripts/training/archetype-batch.mjs` (the shape checks and the SQL writer), `scripts/training/archetype-batch.test.mjs` (node --test, no database) and `src/lib/training/archetype-ladders.test.ts` (vitest, which pins the JS ladders to `src/lib/wset/vocab.ts` and `types.ts`). The validator also checks the ladders against the live enums on every run.
8. The DB suite `scripts/training-room.test.mjs` connects to production and applies migrations inside transactions that always roll back. As with `scripts/friend-requests.test.mjs`, **only the main session runs it**; an implementer runs `node --check` and eslint on it. Every other database step in this part is read-only (`begin read only` … `rollback`) and safe for an implementer.

**Verified before writing** (read-only against production, 2026-09-25; everything else in a scratch copy of this worktree with `node_modules` junctioned in):
- The migration's whole pre-state block passes against live, run read-only. Both new function bodies compile as read-only DO blocks: PL/pgSQL syntax-checks every embedded statement at compile time, and a planted typo fails with 42601. The post-state and back-fill blocks compile too.
- The 15 back-fill lookups each resolve to exactly one live row (query in Task 1 Step 6).
- The md5 values pinned in the post-state were computed from the exact file text below. The live `scrub_deleted_account` md5, `5a08d60e3af617b6368d3a85cbe05f94`, equals the md5 of the 20260925003000 file's body, so the recreate starts from the true live body.
- After the `database.types.ts` edits, `tsc --noEmit` exits 0. After Task 13's scripts, the validator passes on `data/training/archetypes-batch-1.json` (87 archetypes, 0 errors, 0 warnings) and refuses a broken copy with 6 errors. The generator writes the migration, whose own resolution queries resolve 87/87 archetypes, 881/881 aroma links and 34/34 designation links against live. The pure tests pass (7 node, 3 vitest), and eslint is clean on every script.
- Live constants: `reveal_wine`'s points are country 2, region 3, appellation 5, primary grape 8, secondary grape 2, designation 2, vintage 2 / 1. The enums are in full order: `wset_sweetness` `DRY,OFF_DRY,MEDIUM_DRY,MEDIUM,MEDIUM_SWEET,SWEET,LUSCIOUS`; `wset_appearance_intensity` `PALE,MEDIUM_MINUS,MEDIUM,MEDIUM_PLUS,DEEP`; `wset_level` `LOW,MEDIUM_MINUS,MEDIUM,MEDIUM_PLUS,HIGH`; `vintage_kind` `YEAR,NV,TAWNY`; `wset_note_context` `OPEN,BLIND,TRAINING`.

---
#### From training-room-pure.md

# Training room plan — part: pure foundations (Tasks 2, 3, 4)

**Contract notes** (deviations from the plan header, each compatible with every call the header shows; follow these):
1. `noteToPayload`'s `ids.contextKind` is `NoteContextKind | null`, not `NoteContextKind`: `NoteEditor` passes `null` today (a plain Taste & Rate note), and `save_wset_note` reads a null `context_kind` as "keep the note's context" on update and `OPEN` on insert. Forcing a non-null value would rewrite an edited BLIND note's context to OPEN. The room passes `"TRAINING"`.
2. `src/lib/training/types.ts` imports its WSET types from `"../wset/types"` (relative, the repo's pure-module idiom), not `"@/lib/wset/types"`; the types are identical.
3. `clearValue` in `src/lib/safe-storage.ts` is `clearValue(getStorage, key): boolean`, the same shape as that file's `readValue`/`writeValue`/`clearFlag` (the header wrote `clearValue(key)`).
4. `readDraft`, `writeDraft` and `clearDraft` take an optional last argument `getStorage` (default: the browser's `localStorage`) so vitest can pass a fake. `writeDraft` and `clearDraft` return `boolean` (saved / removed) instead of `void`; a caller may ignore the result. `draft.ts` also exports `DRAFT_KEY_PREFIX` and `draftClearedBy(event, userId)` for the room's `storage` listener (spec §7.2).
5. Optional additions, no required parameter changed: `capReasonLine`'s ctx gains `candidateStyle?: WineStyle` (without it "Bubbles noted" / "No bubbles noted" and "Fortified" / "Not fortified" cannot be told apart, because both directions share the reason `"bubbles"` or `"fortified"`); `styleVerdictLine` gains an optional second `ctx` (the same shape) to name a colour cap in full; `explain`'s input gains `noteColour?: WineColour | null`; `attemptRowLine` gains `opts?: { timeZone?: string }`.
6. Copy follows spec §9 over §5.7's short form: the colour cap reads "Looks like a red wine, not a white". Three grammar fixes to the §9 templates: "an orange" (not "a orange"); a BROWN hue, the only hue `colourFromHue` cannot place, reads "Looks like a white or red wine, not a rosé" (BROWN only ever caps a rosé); a pool of exactly one reads "1 typical wine so far".
7. `attemptRowLine` returns the row text without "Reveal now". That is a button the history list renders after the text, with `TRAINING_COPY.revealNow` as its label. `tallyLine` returns `""` while nothing is scored, and the list hides the line.
8. A capped candidate's explanation is always its cap reason, even when nothing that applies has been answered (bubbles: yes on its own). Spec §5.6 says the Unlikely group shows each row "with its reason".
9. **For Task 1 (found while copying the fixtures from production, read-only, 2026-09-25):** two live archetype names differ from spec §4.1's table. The live rows are `A typical Côte de Nuits` (no " red") and `A typical Côte de Beaune`, and that second one is a **WHITE** Chardonnay archetype (`colour = WHITE`, `primary_grape = Chardonnay`), not "(red)". The back-fill must use the live strings. Its regional `Bourgogne AOC` row is still right for it.
10. `candidateToArchetypeView` is not in these tasks; the task list places it in Task 6 (`src/lib/training/archetype-view.ts`).

**Verified before writing:** every file below was built in a scratch copy of this worktree (`src/`, `tsconfig.json`, `vitest.config.mts`, `eslint.config.mjs`, `package.json`, with `node_modules` junctioned in). There, `npx tsc --noEmit` reports 0 errors, `npx eslint` on every touched file is clean, and vitest passes the numbers stated in each step. The fixtures' SAT and aroma data were read read-only from production (`begin read only` … `rollback`) with this query:

```sql
select a.name, a.colour, a.style, a.sat, g1.name as primary_grape, g2.name as secondary_grape,
       (select json_agg(json_build_array(t.term, t.group_name, x.kind) order by x.kind, t.sort_order)
          from wine_archetype_aromas x join wset_aroma_terms t on t.id = x.term_id
         where x.archetype_id = a.id) as aromas
from wine_archetypes a
left join grapes g1 on g1.id = a.primary_grape_id
left join grapes g2 on g2.id = a.secondary_grape_id
order by a.sort_order, a.name;
```

It returned exactly the 15 rows the fixture file below carries. Sauternes had null grapes live, and the fixture gives it the grapes Task 1 back-fills.

---
#### From training-room-components.md

# Training room plan — part: components (Tasks 5–8)

**Contract notes** (where this part refines the plan header; the spec wins where they differ):

1. `candidateToArchetypeView` lives in the **pure** module `src/lib/training/archetype-view.ts` (the task list names it there), not in `pool.ts`: `pool.ts` is server-only and the room's client `archetype-detail.tsx` must be able to import it. The signature is the contract's, `candidateToArchetypeView(c: TrainingCandidate): ArchetypeView`. Task 9 may re-export it from `pool.ts` (`export { candidateToArchetypeView } from "./archetype-view";`) so the header's list still holds.
2. `ArchetypeView` (spec §7.2 "a nullable place"): `placeName: string | null` (null when the archetype has no map place, D9) and a new `lineage: string` (D11). `candidateToArchetypeView` sets `placeName` = `lineage`, as the task list says.
3. `ArchetypeSheet`'s `answers` prop is typed `ArchetypeAnswers = Partial<Record<ArchetypeScale, string | null>>` (from `src/lib/wset/archetype-scale.ts`). A whole `WsetNoteState` is assignable to it, so Task 10 can pass `answers={note}`.
4. The spec's "fetchArchetype in `src/lib/wset/queries.ts`" is implemented in `src/lib/wset/archetype-detail.ts`, which `queries.ts` already re-exports unchanged.
5. `WsetSheet`: `onSave` and `footerAction` are a union — exactly one of "`onSave` required" or "`footerAction` given, `onSave` optional" type-checks. `belowBar` is rendered bare (no wrapper margin) directly under the section tabs; the section scroll margin grows by exactly 44 px when it is present. When `fortified` is passed, the alcohol row always shows the four-stop row `[LOW, MEDIUM, HIGH, FORTIFIED]` (even while `fortified.value === true`, when `effectiveStyle` is FORTIFIED) — D19: fortification is never a five-stop distance in the room.
6. New WSET i18n keys (the dictionary parity tests require every key in EN **and** DA): `bubbles`, `bubbles_none`, `bubbles_sparkling`, `fortified_stop` (Task 5), `your_answer` (Task 6), `preview` (Task 8, "Preview" in both languages per §3.1/D20).
7. Reveal-matrix strings that §9 does not list, needed because `noteMatrix` "reads `reveal` for every note string": upload body *Read and matched exactly as it is on the phone, then your result shows.*, by-hand eyebrow *Reveal the bottle · by hand*, laptop cellar tile tail *if the bottle came from your cellar*. Flagged for the owner's copy review.
8. A pick handed back through `onNotePick` always carries `consume: false` (belt and braces with the reveal matrix's hidden toggle and the reveal sheet's `consume` defaults).

---
#### From training-room-app.md

# Training room — app part (Tasks 9, 10, 11, 12, 14)

Part of `docs/superpowers/plans/2026-09-25-training-room.md`. Every shell command
starts with `cd /c/Users/Public/repos/blindtastingapp-training && …`.

**Contract notes** (where this part had to choose; the spec wins over the header):

1. `candidateToArchetypeView` is produced by Task 6 in `src/lib/training/archetype-view.ts`
   (task list). The header puts it in `pool.ts`, which is `server-only` and so cannot be
   imported by a client component; `pool.ts` re-exports it so both statements hold.
   Client code imports it from `@/lib/training/archetype-view`.
2. `FinishInput` / `FinishResult` are declared in the header inside `actions.ts`; the Global
   Constraint ("`use server` files export only async functions; shared types live in plain
   modules") wins, so they live in the plain module `src/lib/training/action-types.ts`
   with exactly the header's shapes. That module also declares `HistoryCursor`,
   `HistoryPage`, `TrainingTally`, `AromaPayload` and `TrainingAttemptDetail`.
3. The result screen needs the saved note's id (for *See the note*) and the revealed
   wine's colour (for *Your colour call … it was a {colour} wine*); `AttemptRow` carries
   neither. This part adds one read-only action, `loadTrainingAttempt(attemptId):
   Promise<TrainingAttemptDetail | null>`, backed by `readTrainingAttemptDetail` in
   `pool.ts`. The three header actions are unchanged.
4. `justTheRegionOption` lives in `src/components/add-wine/self-named-appellation.ts`
   (the header/spec say `src/lib/self-named-appellation.ts`, which does not exist).
5. Copy consumed from Task 2 (`src/lib/training/copy.ts`). Besides the header's
   functions (`shortName`, `coverageLine`, `stripLine`, `lineageLine`, `resultTotalLine`,
   `tallyLine`, `attemptRowLine`, `hueClearedLine`, `styleVerdictLine`) this part reads
   these `TRAINING_COPY` keys: `eyebrow, title, promise, start, discard, discardArmed,
   footerAction, candidatesHeading, beforeAnswers, unlikely, yourCall, whichWine,
   somethingElse, notInList, vintageOptional, revealBottle, cantFindOut, youDidntPick,
   wherePointed, notRevealed, anotherGlass, seeNote, done, rowLabels (Record<PointCategory,
   string>), markRight, markWrong, markNone, yourSessions, showMore, noSessions, revealNow,
   badge, notRevealedRow, unreadableWine`, and these helpers: `continueLine(time)`,
   `sheetTitleLine(time)`, `showAllLine(n)`, `itWasLine(wine)`, `vintageGuessLabel(v)`,
   `youSaidLine(pickName, vintage)`, `percentLabel(closeness)`. Task 10 Step 1 adds
   whichever of them Task 2 did not define, with the exact §9 values below.
6. Assumed behaviour of Task 2 functions: `coverageLine(countries, 0)` returns the
   empty-pool line; `attemptRowLine(row)` for an unrevealed row ends at "Not revealed"
   (the *Reveal now* control is a separate button); `hueClearedLine(hue, colour)` gets
   the hue's display word from `LABELS` in `src/lib/wset/vocab.ts` ("ruby").
7. Task 6: `ArchetypeSheet`'s `answers` prop must accept a `WsetNoteState` (the room
   passes the whole note; typing it `Partial<WsetNoteState>` satisfies that).
8. Task 1: the code below reads `training_attempts` with the spec §6.1 column names,
   `wine_archetypes.country_id/region_id/appellation_id/typical_age_low/typical_age_high`,
   nullable `wine_archetypes.wine_place_id`, `wine_archetype_aromas.signature`,
   `wine_archetype_designations(archetype_id, type_designation_id)` and the RPC
   `record_training_attempt(p_note, p_aromas, p_attempt)`; every raw row is cast through
   `unknown` to the local raw types, so the exact `database.types.ts` spelling of the
   RPC's `Args` (`unknown` or `Json`) does not matter.

---

---

### Task 1: Schema migration, database types and the DB suite

**Files:**
- Create: `supabase/migrations/20260925120000_training_room.sql`
- Create (test): `scripts/training-room.test.mjs`
- Modify: `src/lib/supabase/database.types.ts`, in five places: lines 1288–1320 (`wine_archetypes` Row/Insert), 1323–1338 (`wine_archetype_aromas`, followed by the new `wine_archetype_designations`), line 1340 (the new `training_attempts` goes before `wine_archetype_placements`), lines 1366–1367 (the `wset_notes` comment) and lines 2205–2211 (`record_training_attempt` at the end of `Functions`)

**Interfaces:**
- Consumes: nothing from other tasks. From live: `save_wset_note(jsonb, jsonb)` (SECURITY INVOKER, md5 `9ac29b18bbda5b08bcd9a12e19beb932`), `wset_hue_fits_colour(wset_colour_hue, wine_colour)` (md5 `96339c7d5a5a84074ffc33db8e89d6ba`), `scrub_deleted_account(uuid)` (md5 `5a08d60e3af617b6368d3a85cbe05f94`), `reveal_wine(uuid)`'s point constants.
- Produces (Tasks 6, 9, 10, 11, 12, 13 rely on these exact names):
  - `wine_archetypes`: `wine_place_id uuid` (nullable), `country_id uuid not null → countries`, `region_id uuid not null → regions`, `appellation_id uuid not null → appellations`, `primary_grape_id uuid not null`, `typical_age_low smallint`, `typical_age_high smallint`.
  - `wine_archetype_aromas.signature boolean not null default false`.
  - `wine_archetype_designations (archetype_id, type_designation_id)`, PK on both. Read: `authenticated`. Write: `profiles.is_curator`.
  - `training_attempts` with the spec §6.1 columns. `SELECT` for `authenticated` where `author_id = auth.uid()`; no client write.
  - `record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb) returns jsonb`. `p_attempt = { attempt_id?, session_key, started_at, picked_archetype_id?, guessed_vintage_kind?, guessed_vintage_year?, guessed_vintage_tawny_years?, actual_catalog_wine_id?, candidates_snapshot }`. Returns `{ attempt_id, note_id, points: { country, region, appellation, primary_grape, secondary_grape, type_designation, vintage }, total, possible, actual_archetype_id, hue_cleared }`. EXECUTE: `authenticated` only.
  - `wset_notes_one_identity` admits `num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0 and tasting_wine_id is null and context_kind = 'TRAINING'`.
  - `database.types.ts`: `Tables.wine_archetypes` (the new columns; Row `wine_place_id: string` until Task 13), `Tables.wine_archetype_aromas.Row.signature`, `Tables.wine_archetype_designations`, `Tables.training_attempts`, `Functions.record_training_attempt: { Args: { p_note: Json; p_aromas: Json; p_attempt: Json }; Returns: Json }`.

- [ ] **Step 1: Write the DB suite (the failing test).** Create `scripts/training-room.test.mjs`:

```js
// Training room DB suite (spec docs/superpowers/specs/2026-09-25-training-room-design.md
// §10): the TRAINING branch of wset_notes_one_identity, record_training_attempt
// (fresh attempts, re-reveals, the championship points, D17's style verdict,
// the hue rule, idempotency, refusals and grants), training_attempts' RLS and
// grants, the account-deletion scrub and the 15-row archetype back-fill of
// 20260925120000_training_room.sql.
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles, catalog wines and archetypes created
// inside that transaction: no real person's row decides a result or is written.
//
//   node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout \
//     scripts/training-room.test.mjs
//
// Dry run before a migration is live: TRAINING_ROOM_APPLY lists migration
// files (comma-separated, in order) that each test applies inside its own
// rolled-back transaction first, e.g.
//   TRAINING_ROOM_APPLY=supabase/migrations/20260925120000_training_room.sql \
//     node --env-file=.env.local --test scripts/training-room.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const APPLY = (process.env.TRAINING_ROOM_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);
const RPC_SIG = "public.record_training_attempt(jsonb,jsonb,jsonb)";

const client = new pg.Client(pgConfig());
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb) {
  await client.query("begin");
  try {
    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
    return await cb();
  } finally {
    await client.query("rollback");
  }
}

async function asOwner() {
  await client.query("reset role");
}
// A signed-in caller; `null` is a request with no user (auth.uid() is null).
async function asUser(id) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(id ? { sub: id, role: "authenticated" } : { role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}

// Throwaway people that exist only inside the current transaction.
async function freshProfiles(n) {
  await asOwner();
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'training-room-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`Training room test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

// Runs `fn` inside a savepoint that is always rolled back, and checks it failed
// with `code` (and `message`, when given).
async function expectError(fn, code, message) {
  await client.query("savepoint expect_error");
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await client.query("rollback to savepoint expect_error");
  assert.ok(error, `expected SQLSTATE ${code}, but it succeeded`);
  assert.equal(error.code, code, error.message);
  if (message !== undefined) assert.equal(error.message, message);
}

// Live reference ids by exact name (owner role).
async function refs() {
  await asOwner();
  const one = async (what, sql, params) => {
    const r = await client.query(sql, params);
    assert.equal(r.rowCount, 1, `${what} should be exactly one live row`);
    return r.rows[0].id;
  };
  const appellation = (region, name) =>
    one(
      `${region} / ${name}`,
      `select a.id from appellations a join regions r on r.id = a.region_id
         join countries c on c.id = r.country_id
        where c.name = 'France' and r.name = $1 and a.name = $2`,
      [region, name],
    );
  const byName = (table, name) => one(`${table} ${name}`, `select id from ${table} where name = $1`, [name]);
  const region = (country, name) =>
    one(
      `${country} / ${name}`,
      "select r.id from regions r join countries c on c.id = r.country_id where c.name = $1 and r.name = $2",
      [country, name],
    );
  return {
    france: await byName("countries", "France"),
    spain: await byName("countries", "Spain"),
    bordeaux: await region("France", "Bordeaux"),
    bourgogne: await region("France", "Bourgogne"),
    margauxAoc: await appellation("Bordeaux", "Margaux AOC"),
    vosneAoc: await appellation("Bourgogne", "Vosne-Romanée AOC"),
    chablisAoc: await appellation("Bourgogne", "Chablis AOC"),
    cabernet: await byName("grapes", "Cabernet Sauvignon"),
    merlot: await byName("grapes", "Merlot"),
    cabFranc: await byName("grapes", "Cabernet Franc"),
    pinotNoir: await byName("grapes", "Pinot Noir"),
    chardonnay: await byName("grapes", "Chardonnay"),
    tempranillo: await byName("grapes", "Tempranillo"),
    grenache: await byName("grapes", "Grenache"),
    grandCruClasse: await byName("type_designations", "Grand Cru Classé"),
    reserva: await byName("type_designations", "Reserva"),
    granReserva: await byName("type_designations", "Gran Reserva"),
    crianza: await byName("type_designations", "Crianza"),
    margaux: await byName("wine_archetypes", "A typical Margaux"),
    coteDeNuits: await byName("wine_archetypes", "A typical Côte de Nuits"),
    vosne: await byName("wine_archetypes", "A typical Vosne-Romanée"),
    producer: (await client.query("select id from producers order by id limit 1")).rows[0].id,
    term: (await client.query("select id from wset_aroma_terms where group_name = 'Black fruit' and term = 'blackcurrant'"))
      .rows[0].id,
  };
}

// A catalog wine written by the owner inside the transaction; a fresh wine
// name keeps it clear of catalog_wines_identity_key.
async function wine(createdBy, f) {
  await asOwner();
  const w = {
    secondary: null,
    designation: null,
    vintageKind: "YEAR",
    vintageYear: 2015,
    tawnyYears: null,
    colour: "RED",
    style: "STILL",
    ...f,
  };
  const r = await client.query(
    `insert into catalog_wines
       (country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id,
        type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, colour, style,
        wine_name, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             'Training room test ' || gen_random_uuid()::text, $13)
     returning id`,
    [
      w.country,
      w.region,
      w.appellation,
      w.primary,
      w.secondary,
      w.producer,
      w.designation,
      w.vintageKind,
      w.vintageYear,
      w.tawnyYears,
      w.colour,
      w.style,
      createdBy,
    ],
  );
  return r.rows[0].id;
}

// The RPC as the current role.
async function record(note, aromas, attempt) {
  const r = await client.query("select public.record_training_attempt($1::jsonb, $2::jsonb, $3::jsonb) as r", [
    JSON.stringify(note),
    JSON.stringify(aromas),
    JSON.stringify(attempt),
  ]);
  return r.rows[0].r;
}

// A fresh session for `who`: a new session key and started-at unless given.
async function fresh(who, { note = { colour_hue: "RUBY", sweetness: "DRY" }, aromas = [], ...attempt } = {}) {
  await asUser(who);
  return record(note, aromas, {
    session_key: randomUUID(),
    started_at: "2026-09-25T18:14:00Z",
    candidates_snapshot: [],
    ...attempt,
  });
}

const margauxBottle = (r, extra = {}) => ({
  country: r.france,
  region: r.bordeaux,
  appellation: r.margauxAoc,
  primary: r.cabernet,
  secondary: r.merlot,
  producer: r.producer,
  ...extra,
});

async function attemptRow(id) {
  await asOwner();
  return (await client.query("select * from training_attempts where id = $1", [id])).rows[0];
}
async function noteRow(id) {
  await asOwner();
  return (await client.query("select * from wset_notes where id = $1", [id])).rows[0];
}

test("the one-identity constraint admits a TRAINING note without a glass and still refuses OPEN", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const note = (
      await client.query("insert into wset_notes (author_id, context_kind) values ($1, 'TRAINING') returning id", [a])
    ).rows[0].id;
    await expectError(
      () => client.query("insert into wset_notes (author_id, context_kind) values ($1, 'OPEN')", [a]),
      "23514",
    );
    await expectError(
      () => client.query("insert into wset_notes (author_id, context_kind) values ($1, 'BLIND')", [a]),
      "23514",
    );
    const seen = async (who) => {
      await asUser(who);
      return (await client.query("select count(*)::int n from wset_notes where id = $1", [note])).rows[0].n;
    };
    assert.equal(await seen(a), 1, "its author reads it");
    assert.equal(await seen(b), 0, "nobody else does");
  });
});

test("a fresh attempt writes a TRAINING note and scores a known pair with the championship table", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const snapshot = [{ archetypeId: r.margaux, name: "A typical Margaux", closeness: 91, rank: 1, capped: null }];
    const out = await fresh(a, {
      aromas: [{ term_id: r.term, sensed_on_nose: true, sensed_on_palate: false }],
      started_at: "2026-09-24T23:30:00-02:00",
      picked_archetype_id: r.margaux,
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2015,
      actual_catalog_wine_id: w,
      candidates_snapshot: snapshot,
    });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 5,
      primary_grape: 8,
      secondary_grape: 2,
      type_designation: null,
      vintage: 2,
    });
    assert.equal(out.total, 22);
    assert.equal(out.possible, 22);
    assert.equal(out.hue_cleared, false);
    assert.equal(out.actual_archetype_id, r.margaux);

    const n = await noteRow(out.note_id);
    assert.equal(n.author_id, a);
    assert.equal(n.context_kind, "TRAINING");
    assert.equal(n.catalog_wine_id, w);
    assert.equal(n.tasting_wine_id, null);
    assert.equal(n.unidentified_wine_id, null);
    assert.equal(n.colour_hue, "RUBY");
    const tasted = (await client.query("select tasted_on::text d from wset_notes where id = $1", [out.note_id])).rows[0].d;
    assert.equal(tasted, "2026-09-25", "tasted_on is the UTC date of started_at");
    const aromaRows = (await client.query("select term_id, sensed_on_nose from wset_note_aromas where note_id = $1", [out.note_id]))
      .rows;
    assert.deepEqual(aromaRows, [{ term_id: r.term, sensed_on_nose: true }]);

    const row = await attemptRow(out.attempt_id);
    assert.equal(row.author_id, a);
    assert.equal(row.note_id, out.note_id);
    assert.equal(row.picked_archetype_id, r.margaux);
    assert.equal(row.guessed_vintage_kind, "YEAR");
    assert.equal(row.guessed_vintage_year, 2015);
    assert.equal(row.actual_catalog_wine_id, w);
    assert.equal(row.note_colour_hue, "RUBY");
    assert.deepEqual(row.candidates_snapshot, snapshot);
    assert.ok(row.scored_at);
  });
});

test("a regional pick against a village wine earns the region (3), not the appellation (5)", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, {
      country: r.france,
      region: r.bourgogne,
      appellation: r.vosneAoc,
      primary: r.pinotNoir,
      producer: r.producer,
    });
    const out = await fresh(a, { picked_archetype_id: r.coteDeNuits, actual_catalog_wine_id: w });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 8,
      secondary_grape: null,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 13);
    assert.equal(out.possible, 18);
    assert.equal(out.actual_archetype_id, r.vosne, "the bottle's own style is the Vosne-Romanée archetype");
  });
});

test("vintage: exact 2, one year off 1, otherwise 0; NV and tawny score exact only; no guess is null", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const base = { country: r.france, region: r.bordeaux, appellation: r.margauxAoc, primary: r.cabernet, producer: r.producer };
    const y2015 = await wine(a, base);
    const nv = await wine(a, { ...base, vintageKind: "NV", vintageYear: null });
    const tawny = await wine(a, { ...base, vintageKind: "TAWNY", vintageYear: null, tawnyYears: 20, style: "FORTIFIED" });
    const cases = [
      [y2015, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2015 }, 2],
      [y2015, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2014 }, 1],
      [y2015, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2016 }, 1],
      [y2015, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2013 }, 0],
      [y2015, { guessed_vintage_kind: "NV" }, 0],
      [nv, { guessed_vintage_kind: "NV" }, 2],
      [nv, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2015 }, 0],
      [tawny, { guessed_vintage_kind: "TAWNY", guessed_vintage_tawny_years: 20 }, 2],
      [tawny, { guessed_vintage_kind: "TAWNY", guessed_vintage_tawny_years: 10 }, 0],
      [y2015, {}, null],
    ];
    for (const [w, guess, points] of cases) {
      const out = await fresh(a, { actual_catalog_wine_id: w, ...guess });
      assert.equal(out.points.vintage, points, JSON.stringify(guess));
      assert.equal(out.possible, points === null ? 18 : 20, `possible for ${JSON.stringify(guess)}`);
    }
  });
});

test("second grape and designation: null when the wine has none, 0 when missed, full when hit", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const gcc = await wine(a, margauxBottle(r, { designation: r.grandCruClasse }));
    let out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: gcc });
    assert.equal(out.points.secondary_grape, 2);
    assert.equal(out.points.type_designation, 0, "the pick carries no designation yet");
    assert.equal(out.total, 20);
    assert.equal(out.possible, 22);

    await asOwner();
    await client.query(
      "insert into wine_archetype_designations (archetype_id, type_designation_id) values ($1, $2)",
      [r.margaux, r.grandCruClasse],
    );
    out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: gcc });
    assert.equal(out.points.type_designation, 2);
    assert.equal(out.total, 22);

    const plain = await wine(a, margauxBottle(r, { secondary: null }));
    out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: plain });
    assert.equal(out.points.secondary_grape, null);
    assert.equal(out.points.type_designation, null);
    assert.equal(out.possible, 18);

    const franc = await wine(a, margauxBottle(r, { secondary: r.cabFranc }));
    out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: franc });
    assert.equal(out.points.secondary_grape, 0);
  });
});

test("no pick scores 0 on every category that applies", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const out = await fresh(a, { picked_archetype_id: null, actual_catalog_wine_id: w });
    assert.deepEqual(out.points, {
      country: 0,
      region: 0,
      appellation: 0,
      primary_grape: 0,
      secondary_grape: 0,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 0);
    assert.equal(out.possible, 20);
  });
});

test("the same session key twice returns the first attempt and writes nothing more", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const key = randomUUID();
    const first = await fresh(a, { session_key: key, picked_archetype_id: r.margaux, actual_catalog_wine_id: w });
    const second = await fresh(a, { session_key: key, picked_archetype_id: r.coteDeNuits, actual_catalog_wine_id: null });
    assert.deepEqual(second, first);
    await asOwner();
    const counts = (
      await client.query(
        `select (select count(*)::int from training_attempts where author_id = $1) attempts,
                (select count(*)::int from wset_notes where author_id = $1) notes`,
        [a],
      )
    ).rows[0];
    assert.deepEqual(counts, { attempts: 1, notes: 1 });
  });
});

test("a hue that does not fit the revealed wine is dropped from the note and kept on the attempt", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const white = await wine(a, {
      country: r.france,
      region: r.bourgogne,
      appellation: r.chablisAoc,
      primary: r.chardonnay,
      producer: r.producer,
      colour: "WHITE",
    });
    const out = await fresh(a, { note: { colour_hue: "RUBY" }, actual_catalog_wine_id: white });
    assert.equal(out.hue_cleared, true);
    assert.equal((await noteRow(out.note_id)).colour_hue, null);
    const row = await attemptRow(out.attempt_id);
    assert.equal(row.note_colour_hue, "RUBY");
    assert.equal(row.hue_cleared, true);

    const kept = await fresh(a, { note: { colour_hue: "LEMON" }, actual_catalog_wine_id: white });
    assert.equal(kept.hue_cleared, false);
    assert.equal((await noteRow(kept.note_id)).colour_hue, "LEMON");
  });
});

test("an unrevealed attempt, then Reveal now: only the note's identity and the score are written", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const r = await refs();
    const unrevealed = await fresh(a, {
      note: { colour_hue: "RUBY" },
      picked_archetype_id: r.margaux,
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2014,
      candidates_snapshot: [{ archetypeId: r.margaux, name: "A typical Margaux", closeness: 80, rank: 1, capped: null }],
    });
    assert.deepEqual(unrevealed.points, {
      country: null,
      region: null,
      appellation: null,
      primary_grape: null,
      secondary_grape: null,
      type_designation: null,
      vintage: null,
    });
    assert.equal(unrevealed.total, null);
    assert.equal(unrevealed.possible, null);
    const before = await noteRow(unrevealed.note_id);
    assert.equal(before.catalog_wine_id, null);
    assert.equal(before.context_kind, "TRAINING");

    // Someone else's note, whose id a crafted payload names.
    const other = await fresh(b, { note: { colour_hue: "GARNET" } });
    const w = await wine(a, margauxBottle(r));
    await asUser(a);
    const out = await record(
      { id: other.note_id, colour_hue: "PURPLE", sweetness: "LUSCIOUS" },
      [{ term_id: r.term, sensed_on_nose: true, sensed_on_palate: true }],
      {
        attempt_id: unrevealed.attempt_id,
        actual_catalog_wine_id: w,
        picked_archetype_id: r.coteDeNuits,
        guessed_vintage_kind: "NV",
        candidates_snapshot: [],
      },
    );
    assert.equal(out.attempt_id, unrevealed.attempt_id);
    assert.equal(out.points.appellation, 5, "scored with the stored pick, not the payload's");
    assert.equal(out.points.vintage, 1, "scored with the stored vintage (2014 vs 2015)");
    assert.equal(out.total, 21);
    const row = await attemptRow(unrevealed.attempt_id);
    assert.equal(row.picked_archetype_id, r.margaux);
    assert.equal(row.candidates_snapshot.length, 1, "the stored ranking is kept");
    const after = await noteRow(unrevealed.note_id);
    assert.equal(after.catalog_wine_id, w);
    assert.equal(after.colour_hue, "RUBY");
    assert.equal(after.sweetness, null, "the payload's note fields are ignored");
    assert.equal((await noteRow(other.note_id)).colour_hue, "GARNET", "the foreign note is untouched");
  });
});

test("Reveal now refuses another person's attempt and an attempt already revealed; nothing is written", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const unrevealed = await fresh(a, {});
    await asUser(b);
    await expectError(
      () => record({}, [], { attempt_id: unrevealed.attempt_id, actual_catalog_wine_id: w }),
      "42501",
      "that session is not yours",
    );
    assert.equal((await attemptRow(unrevealed.attempt_id)).scored_at, null);
    assert.equal((await noteRow(unrevealed.note_id)).catalog_wine_id, null);

    await asUser(a);
    await record({}, [], { attempt_id: unrevealed.attempt_id, actual_catalog_wine_id: w });
    await asUser(a);
    await expectError(
      () => record({}, [], { attempt_id: unrevealed.attempt_id, actual_catalog_wine_id: w }),
      "P0001",
      "already revealed",
    );

    // A hue that does not fit is cleared on a re-reveal too.
    const white = await wine(a, {
      country: r.france,
      region: r.bourgogne,
      appellation: r.chablisAoc,
      primary: r.chardonnay,
      producer: r.producer,
      colour: "WHITE",
    });
    const ruby = await fresh(a, { note: { colour_hue: "RUBY" } });
    await asUser(a);
    const out = await record({}, [], { attempt_id: ruby.attempt_id, actual_catalog_wine_id: white });
    assert.equal(out.hue_cleared, true);
    assert.equal((await noteRow(ruby.note_id)).colour_hue, null);
    assert.equal((await attemptRow(ruby.attempt_id)).note_colour_hue, "RUBY");
  });
});

test("refusals: no user, a fresh note id, and no EXECUTE for anon, service_role or PUBLIC", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(null);
    await expectError(() => record({}, [], { session_key: randomUUID() }), "42501", "not signed in");
    const theirs = await fresh(b, {});
    await asUser(a);
    await expectError(
      () => record({ id: theirs.note_id }, [], { session_key: randomUUID() }),
      "42501",
      "a new session takes no note id",
    );
    await asOwner();
    const grants = (
      await client.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('service_role', $1, 'EXECUTE') as service,
                has_function_privilege('authenticated', $1, 'EXECUTE') as authed,
                exists (select 1 from pg_proc p, aclexplode(p.proacl) x
                         where p.oid = to_regprocedure($1) and x.grantee = 0) as public`,
        [RPC_SIG],
      )
    ).rows[0];
    assert.deepEqual(grants, { anon: false, service: false, authed: true, public: false });
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await client.query("set local role anon");
    await expectError(() => record({}, [], { session_key: randomUUID() }), "42501");
  });
});

test("training_attempts: the author reads their own rows and no client writes any", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const out = await fresh(a, {});
    const seen = async (who) => {
      await asUser(who);
      return (await client.query("select count(*)::int n from training_attempts where id = $1", [out.attempt_id])).rows[0]
        .n;
    };
    assert.equal(await seen(a), 1);
    assert.equal(await seen(b), 0);
    await asUser(a);
    await expectError(
      () =>
        client.query("insert into training_attempts (author_id, session_key, note_id) values ($1, $2, $3)", [
          a,
          randomUUID(),
          out.note_id,
        ]),
      "42501",
    );
    await expectError(() => client.query("update training_attempts set total_points = 99 where author_id = $1", [a]), "42501");
    await expectError(() => client.query("delete from training_attempts where author_id = $1", [a]), "42501");
    await asUser(null);
    await client.query("set local role anon");
    await expectError(() => client.query("select 1 from training_attempts"), "42501");
  });
});

test("the seven maxima equal reveal_wine's constants", async () => {
  await withRollback(async () => {
    await asOwner();
    const def = async (sig) =>
      (await client.query("select pg_get_functiondef(to_regprocedure($1)) d", [sig])).rows[0].d;
    const reveal = await def("public.reveal_wine(uuid)");
    const training = await def(RPC_SIG);
    const pick = (text, re, what) => {
      const m = text.match(re);
      assert.ok(m, `${what} not found`);
      return Number(m[1]);
    };
    const fromReveal = {
      country: pick(reveal, /country_points\s*=\s*case\s+when\s+g\.country_id\s*=\s*v_answer\.country_id\s+then\s+(\d+)/, "country"),
      region: pick(reveal, /region_points\s*=\s*case\s+when\s+g\.region_id\s*=\s*v_answer\.region_id\s+then\s+(\d+)/, "region"),
      appellation: pick(reveal, /when\s+g\.appellation_id\s*=\s*v_answer\.appellation_id\s+then\s+(\d+)/, "appellation"),
      primaryGrape: pick(
        reveal,
        /primary_grape_points\s*=\s*case\s+when\s+g\.primary_grape_id\s*=\s*v_answer\.primary_grape_id\s+then\s+(\d+)/,
        "primary grape",
      ),
      secondaryGrape: pick(reveal, /when\s+g\.secondary_grape_id\s*=\s*v_answer\.secondary_grape_id\s+then\s+(\d+)/, "secondary"),
      typeDesignation: pick(reveal, /when\s+g\.type_designation_id\s*=\s*v_answer\.type_designation_id\s+then\s+(\d+)/, "designation"),
      vintage: pick(reveal, /and\s+g\.vintage_year\s*=\s*v_answer\.vintage_year\s+then\s+(\d+)/, "vintage"),
      vintageNear: pick(reveal, /abs\(g\.vintage_year\s*-\s*v_answer\.vintage_year\)\s*=\s*1\s+then\s+(\d+)/, "vintage near"),
    };
    const constant = (name) => pick(training, new RegExp(`${name}\\s+constant\\s+smallint\\s*:=\\s*(\\d+);`), name);
    const fromTraining = {
      country: constant("c_country"),
      region: constant("c_region"),
      appellation: constant("c_appellation"),
      primaryGrape: constant("c_primary_grape"),
      secondaryGrape: constant("c_secondary_grape"),
      typeDesignation: constant("c_type_designation"),
      vintage: constant("c_vintage"),
      vintageNear: constant("c_vintage_near"),
    };
    assert.deepEqual(fromTraining, fromReveal);
    assert.deepEqual(fromTraining, {
      country: 2,
      region: 3,
      appellation: 5,
      primaryGrape: 8,
      secondaryGrape: 2,
      typeDesignation: 2,
      vintage: 2,
      vintageNear: 1,
    });
  });
});

test("D17: the bottle's own style, with ties broken by designation, pick, second grape, sort order", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    await asOwner();
    const region = (
      await client.query("insert into regions (country_id, name) values ($1, $2) returning id", [
        r.spain,
        `Training test region ${randomUUID()}`,
      ])
    ).rows[0].id;
    const appellation = async (name) =>
      (await client.query("insert into appellations (region_id, name) values ($1, $2) returning id", [region, name]))
        .rows[0].id;
    const doca = await appellation("Training test DOCa");
    const other = await appellation("Training test other DO");
    const archetype = async (name, { at = doca, secondary = null, sort, designation = null }) => {
      const id = (
        await client.query(
          `insert into wine_archetypes
             (name, colour, style, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, sort_order)
           values ($1, 'RED', 'STILL', $2, $3, $4, $5, $6, $7) returning id`,
          [name, r.spain, region, at, r.tempranillo, secondary, sort],
        )
      ).rows[0].id;
      if (designation) {
        await client.query(
          "insert into wine_archetype_designations (archetype_id, type_designation_id) values ($1, $2)",
          [id, designation],
        );
      }
      return id;
    };
    const reserva = await archetype("A typical test Reserva", { sort: 1, designation: r.reserva });
    const granReserva = await archetype("A typical test Gran Reserva", { sort: 2, designation: r.granReserva });
    const blend = await archetype("A typical test blend", { sort: 3, secondary: r.grenache });
    const neighbour = await archetype("A typical test neighbour", { at: other, sort: 99 });
    const bottle = (extra) =>
      wine(a, { country: r.spain, region, appellation: doca, primary: r.tempranillo, producer: r.producer, ...extra });
    const actual = async (w, pick = null) =>
      (await fresh(a, { picked_archetype_id: pick, actual_catalog_wine_id: w })).actual_archetype_id;

    assert.equal(await actual(await bottle({ designation: r.granReserva })), granReserva, "designation first");
    assert.equal(await actual(await bottle({ designation: r.crianza }), reserva), reserva, "then the pick");
    assert.equal(await actual(await bottle({ designation: r.crianza }), granReserva), granReserva, "the pick, either way");
    assert.equal(await actual(await bottle({ designation: r.crianza, secondary: r.grenache })), blend, "then the second grape");
    assert.equal(await actual(await bottle({ designation: r.crianza })), reserva, "then sort order");
    assert.equal(
      await actual(await bottle({ appellation: other, designation: r.granReserva })),
      neighbour,
      "the same appellation beats a region-and-grape match",
    );
    assert.equal(await actual(await bottle({ style: "SPARKLING" })), null, "no archetype of that style: none");
  });
});

test("account deletion removes the person's attempts; deleting a note removes its attempt", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await fresh(a, {});
    await fresh(a, {});
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [a]);
    const left = (await client.query("select count(*)::int n from training_attempts where author_id = $1", [a])).rows[0].n;
    assert.equal(left, 0);

    const out = await fresh(b, {});
    await asUser(b);
    await client.query("delete from wset_notes where id = $1", [out.note_id]);
    assert.equal(await attemptRow(out.attempt_id), undefined, "the attempt goes with its note");
  });
});

test("the 15 live archetypes are back-filled by live name and every archetype names a grape", async () => {
  await withRollback(async () => {
    await asOwner();
    const missing = (
      await client.query(
        `select count(*)::int n from wine_archetypes
          where country_id is null or region_id is null or appellation_id is null or primary_grape_id is null`,
      )
    ).rows[0].n;
    assert.equal(missing, 0);
    const rows = (
      await client.query(
        `select a.name, c.name country, r.name region, ap.name appellation
           from wine_archetypes a
           join countries c on c.id = a.country_id
           join regions r on r.id = a.region_id
           join appellations ap on ap.id = a.appellation_id
          where a.name = any($1::text[])
          order by a.name collate "C"`,
        [
          [
            "A typical Alsace Riesling",
            "A typical Bandol",
            "A typical Chablis",
            "A typical Champagne",
            "A typical Châteauneuf-du-Pape",
            "A typical Côte Chalonnaise",
            "A typical Côte de Beaune",
            "A typical Côte de Nuits",
            "A typical Côte-Rôtie",
            "A typical Margaux",
            "A typical Mâconnais",
            "A typical Petit Chablis",
            "A typical Sancerre",
            "A typical Sauternes",
            "A typical Vosne-Romanée",
          ],
        ],
      )
    ).rows.map((x) => `${x.name} -> ${x.country} / ${x.region} / ${x.appellation}`);
    assert.deepEqual(rows, [
      "A typical Alsace Riesling -> France / Alsace / Alsace AOC",
      "A typical Bandol -> France / Provence / Bandol AOC",
      "A typical Chablis -> France / Bourgogne / Chablis AOC",
      "A typical Champagne -> France / Champagne / Champagne AOC",
      "A typical Châteauneuf-du-Pape -> France / Rhône / Châteauneuf-du-Pape AOC",
      "A typical Côte Chalonnaise -> France / Bourgogne / Cote Chalonnaise AOC",
      "A typical Côte de Beaune -> France / Bourgogne / Bourgogne AOC",
      "A typical Côte de Nuits -> France / Bourgogne / Bourgogne AOC",
      "A typical Côte-Rôtie -> France / Rhône / Côte-Rôtie AOC",
      "A typical Margaux -> France / Bordeaux / Margaux AOC",
      "A typical Mâconnais -> France / Bourgogne / Macon AOC",
      "A typical Petit Chablis -> France / Bourgogne / Petit Chablis AOC",
      "A typical Sancerre -> France / Loire / Sancerre AOC",
      "A typical Sauternes -> France / Bordeaux / Sauternes AOC",
      "A typical Vosne-Romanée -> France / Bourgogne / Vosne-Romanée AOC",
    ]);
    const sauternes = (
      await client.query(
        `select g1.name p, g2.name s from wine_archetypes a
           join grapes g1 on g1.id = a.primary_grape_id join grapes g2 on g2.id = a.secondary_grape_id
          where a.name = 'A typical Sauternes'`,
      )
    ).rows[0];
    assert.deepEqual(sauternes, { p: "Semillon", s: "Sauvignon Blanc" });
  });
});
```

- [ ] **Step 2: Check the suite parses and lints**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --check scripts/training-room.test.mjs && npx eslint scripts/training-room.test.mjs`
Expected: no output from either.

(Main session only, before the migration exists.) Run `cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/training-room.test.mjs`
Expected: FAIL, 16 tests, 0 pass. With no `TRAINING_ROOM_APPLY`, the first test fails at `insert into wset_notes ... 'TRAINING'` with 23514 (`wset_notes_one_identity`). The RPC tests fail with 42883 (`function public.record_training_attempt(jsonb, jsonb, jsonb) does not exist`). The D17 and back-fill tests fail with 42703 (`column "country_id" ... does not exist`). The maxima test fails with a TypeError, because `pg_get_functiondef` of a missing function is null.

- [ ] **Step 3: Write the migration.** Create `supabase/migrations/20260925120000_training_room.sql` with exactly this content. The two function bodies are md5-pinned in the post-state, so copy them byte for byte, with no reformatting and no trailing spaces:

```sql
-- Training room: the archetype scoring identity, signature aromas, archetype
-- designations, training attempts, the TRAINING note shape and the one RPC
-- that writes a session's result.
--
-- Spec: docs/superpowers/specs/2026-09-25-training-room-design.md (§4.1-§4.3,
-- §6.1-§6.4; D5, D7-D10, D14-D17). Plan:
-- docs/superpowers/plans/2026-09-25-training-room.md, Task 1. Additive for the
-- deployed app (D22): nothing it runs reads the new columns or tables, and
-- every live archetype keeps its map place.
--
-- Written against the LIVE state (read-only, 2026-09-25), never an older
-- migration file alone:
-- * wine_archetypes: 15 rows, all with a wine_place_id; primary_grape_id is
--   null on "A typical Sauternes" alone. The live names differ from the
--   spec's table in two places: "A typical Côte de Nuits" (not "... red") and
--   "A typical Côte de Beaune" (not "... (red)"; it is a WHITE, Chardonnay
--   archetype). Its constraints are the pkey, the two quality checks and
--   three foreign keys (wine_place_id ON DELETE CASCADE, primary and
--   secondary grape ON DELETE SET NULL).
-- * wine_archetype_aromas: 157 rows, primary key (archetype_id, term_id, kind).
-- * The back-fill's live spellings: regions Bourgogne, Champagne, Bordeaux,
--   Loire, Alsace, Rhône, Provence (France); appellations "Vosne-Romanée AOC",
--   "Bourgogne AOC", "Chablis AOC", "Petit Chablis AOC", "Cote Chalonnaise
--   AOC", "Macon AOC", "Champagne AOC", "Margaux AOC" (Bordeaux also holds a
--   bare "Margaux" that nothing references), "Sauternes AOC", "Sancerre AOC",
--   "Alsace AOC", "Côte-Rôtie AOC", "Châteauneuf-du-Pape AOC", "Bandol AOC";
--   grapes "Semillon" (no accent) and "Sauvignon Blanc". All NFC.
-- * wset_notes_one_identity admits exactly one identity, or none on a BLIND
--   note tied to a glass (20260914094500). wset_notes: 10 OPEN, 5 BLIND, 0
--   TRAINING rows.
-- * scrub_deleted_account(uuid) md5 5a08d60e3af617b6368d3a85cbe05f94 (the
--   20260925003000 body): recreated below with one statement added.
--   save_wset_note(jsonb,jsonb) md5 9ac29b18bbda5b08bcd9a12e19beb932 (SECURITY
--   INVOKER) and wset_hue_fits_colour(wset_colour_hue,wine_colour) md5
--   96339c7d5a5a84074ffc33db8e89d6ba are called, not changed.
-- * No training_attempts, wine_archetype_designations or
--   record_training_attempt in any signature.
--
-- What this migration does:
-- 1. wine_archetypes: wine_place_id nullable (D9); country_id, region_id,
--    appellation_id (D8) and typical_age_low/high (D10); the 15 live rows
--    back-filled by exact live name (spec §4.1), Sauternes' grapes
--    (Semillon, Sauvignon Blanc); then the three FKs and primary_grape_id
--    NOT NULL. primary_grape_id's foreign key becomes ON DELETE RESTRICT: SET
--    NULL on a NOT NULL column could only ever fail with a not-null error.
-- 2. wine_archetype_aromas.signature (D5).
-- 3. wine_archetype_designations (§4.3), RLS as wine_archetype_aromas.
-- 4. training_attempts (§6.1): SELECT own for authenticated, no client write.
-- 5. wset_notes_one_identity gains the TRAINING branch (§6.3, D15).
-- 6. scrub_deleted_account deletes the person's attempts (§6.4).
-- 7. record_training_attempt(jsonb, jsonb, jsonb) (§6.2), SECURITY DEFINER,
--    EXECUTE for authenticated only.
--
-- Rule 1: an attempt names a wine only after its taster revealed it, and only
-- to that taster; the note it writes is an ordinary note (public once it has
-- an identity, author-only before). No tasting, glass, guess or answer key is
-- read or written.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. Nothing this migration creates exists yet.
  if to_regclass('public.training_attempts') is not null
     or to_regclass('public.wine_archetype_designations') is not null then
    raise exception 'training_attempts or wine_archetype_designations already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'record_training_attempt';
  if v_text is not null then
    raise exception 'record_training_attempt already exists: %; re-read live before applying', v_text;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and ((table_name = 'wine_archetypes'
                     and column_name in ('country_id', 'region_id', 'appellation_id',
                                         'typical_age_low', 'typical_age_high'))
                    or (table_name = 'wine_archetype_aromas' and column_name = 'signature'))) then
    raise exception 'an archetype column this migration adds already exists';
  end if;

  -- 2. The 15 live archetypes, by name.
  select string_agg(a.name, ' | ' order by a.name collate "C") into v_text from public.wine_archetypes a;
  if v_text is distinct from
       'A typical Alsace Riesling | A typical Bandol | A typical Chablis | A typical Champagne | '
       || 'A typical Châteauneuf-du-Pape | A typical Côte Chalonnaise | A typical Côte de Beaune | '
       || 'A typical Côte de Nuits | A typical Côte-Rôtie | A typical Margaux | A typical Mâconnais | '
       || 'A typical Petit Chablis | A typical Sancerre | A typical Sauternes | A typical Vosne-Romanée' then
    raise exception 'wine_archetypes is not the 15 live rows this file back-fills: %', v_text;
  end if;
  if exists (select 1 from public.wine_archetypes where wine_place_id is null)
     or (select string_agg(name, ',') from public.wine_archetypes where primary_grape_id is null)
          is distinct from 'A typical Sauternes' then
    raise exception 'wine_archetypes place/grape nullability is not the live state (Sauternes alone lacks a grape)';
  end if;

  -- 3. Their constraints, and the aroma links' key.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetypes'::regclass;
  if v_text is distinct from
       'wine_archetypes_pkey PRIMARY KEY (id); '
       || 'wine_archetypes_primary_grape_id_fkey FOREIGN KEY (primary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_quality_high_check CHECK (((quality_high IS NULL) OR ((quality_high >= 50) AND (quality_high <= 100)))); '
       || 'wine_archetypes_quality_low_check CHECK (((quality_low IS NULL) OR ((quality_low >= 50) AND (quality_low <= 100)))); '
       || 'wine_archetypes_secondary_grape_id_fkey FOREIGN KEY (secondary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_wine_place_id_fkey FOREIGN KEY (wine_place_id) REFERENCES wine_places(id) ON DELETE CASCADE' then
    raise exception 'wine_archetypes constraints differ from the live state this file was written against: %', v_text;
  end if;
  if (select pg_get_constraintdef(k.oid) from pg_constraint k
       where k.conrelid = 'public.wine_archetype_aromas'::regclass and k.contype = 'p')
     is distinct from 'PRIMARY KEY (archetype_id, term_id, kind)' then
    raise exception 'wine_archetype_aromas primary key is not (archetype_id, term_id, kind)';
  end if;

  -- 4. The note constraint this file recreates.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from
       'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) '
       || 'AND (context_kind = ''BLIND''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not the live constraint this file was written against';
  end if;

  -- 5. The bodies recreated or called below.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.scrub_deleted_account(uuid)',                     '5a08d60e3af617b6368d3a85cbe05f94'),
    ('public.save_wset_note(jsonb,jsonb)',                     '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_text;
  end if;

  -- 6. The enum labels the RPC writes.
  if not ('TRAINING' = any (enum_range(null::wset_note_context)::text[]))
     or enum_range(null::vintage_kind)::text[] is distinct from array['YEAR', 'NV', 'TAWNY'] then
    raise exception 'wset_note_context lacks TRAINING or vintage_kind is not YEAR, NV, TAWNY';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. wine_archetypes: the scoring identity (D8), typical age (D10), an
--    optional map place (D9).
-- ---------------------------------------------------------------------------
alter table public.wine_archetypes
  alter column wine_place_id drop not null,
  add column country_id uuid,
  add column region_id uuid,
  add column appellation_id uuid,
  add column typical_age_low smallint,
  add column typical_age_high smallint,
  add constraint wine_archetypes_typical_age_check check (
    (typical_age_low is null or typical_age_low >= 0)
    and (typical_age_high is null or typical_age_high >= 0)
    and (typical_age_low is null or typical_age_high is null or typical_age_low <= typical_age_high)
  );

-- The spec §4.1 back-fill, by the live spellings (header). District
-- archetypes take the regional row: "Cote de Nuits-Villages AOC" and "Cote de
-- Beaune AOC" are minor appellations, not the districts.
drop table if exists pg_temp._archetype_backfill;
create temp table _archetype_backfill on commit drop as
select f.archetype,
       array(select a.id from public.wine_archetypes a where a.name = f.archetype) as archetype_ids,
       array(select c.id from public.countries c where c.name = f.country) as country_ids,
       array(select r.id from public.regions r join public.countries c on c.id = r.country_id
              where c.name = f.country and r.name = f.region) as region_ids,
       array(select ap.id from public.appellations ap
               join public.regions r on r.id = ap.region_id
               join public.countries c on c.id = r.country_id
              where c.name = f.country and r.name = f.region and ap.name = f.appellation) as appellation_ids
from (values
  ('A typical Vosne-Romanée',       'France', 'Bourgogne', 'Vosne-Romanée AOC'),
  ('A typical Côte de Nuits',       'France', 'Bourgogne', 'Bourgogne AOC'),
  ('A typical Côte de Beaune',      'France', 'Bourgogne', 'Bourgogne AOC'),
  ('A typical Chablis',             'France', 'Bourgogne', 'Chablis AOC'),
  ('A typical Petit Chablis',       'France', 'Bourgogne', 'Petit Chablis AOC'),
  ('A typical Côte Chalonnaise',    'France', 'Bourgogne', 'Cote Chalonnaise AOC'),
  ('A typical Mâconnais',           'France', 'Bourgogne', 'Macon AOC'),
  ('A typical Champagne',           'France', 'Champagne', 'Champagne AOC'),
  ('A typical Margaux',             'France', 'Bordeaux',  'Margaux AOC'),
  ('A typical Sauternes',           'France', 'Bordeaux',  'Sauternes AOC'),
  ('A typical Sancerre',            'France', 'Loire',     'Sancerre AOC'),
  ('A typical Alsace Riesling',     'France', 'Alsace',    'Alsace AOC'),
  ('A typical Côte-Rôtie',          'France', 'Rhône',     'Côte-Rôtie AOC'),
  ('A typical Châteauneuf-du-Pape', 'France', 'Rhône',     'Châteauneuf-du-Pape AOC'),
  ('A typical Bandol',              'France', 'Provence',  'Bandol AOC')
) as f (archetype, country, region, appellation);

do $$
declare
  v_text text;
begin
  select string_agg(format('%s: archetype %s, country %s, region %s, appellation %s',
                           b.archetype, cardinality(b.archetype_ids), cardinality(b.country_ids),
                           cardinality(b.region_ids), cardinality(b.appellation_ids)), '; ')
    into v_text
  from _archetype_backfill b
  where cardinality(b.archetype_ids) <> 1 or cardinality(b.country_ids) <> 1
     or cardinality(b.region_ids) <> 1 or cardinality(b.appellation_ids) <> 1;
  if v_text is not null or (select count(*) from _archetype_backfill) <> 15 then
    raise exception 'a back-fill name does not resolve to exactly one live row: %', coalesce(v_text, 'row count');
  end if;
  if (select count(*) from public.grapes where name in ('Semillon', 'Sauvignon Blanc')) <> 2 then
    raise exception 'grapes Semillon and Sauvignon Blanc are not both live';
  end if;
end $$;

update public.wine_archetypes a
   set country_id = b.country_ids[1],
       region_id = b.region_ids[1],
       appellation_id = b.appellation_ids[1]
  from _archetype_backfill b
 where a.id = b.archetype_ids[1];

update public.wine_archetypes
   set primary_grape_id = (select g.id from public.grapes g where g.name = 'Semillon'),
       secondary_grape_id = (select g.id from public.grapes g where g.name = 'Sauvignon Blanc')
 where name = 'A typical Sauternes' and primary_grape_id is null;

alter table public.wine_archetypes
  alter column country_id set not null,
  alter column region_id set not null,
  alter column appellation_id set not null,
  alter column primary_grape_id set not null,
  add constraint wine_archetypes_country_id_fkey foreign key (country_id) references public.countries(id),
  add constraint wine_archetypes_region_id_fkey foreign key (region_id) references public.regions(id),
  add constraint wine_archetypes_appellation_id_fkey foreign key (appellation_id) references public.appellations(id);
alter table public.wine_archetypes drop constraint wine_archetypes_primary_grape_id_fkey;
alter table public.wine_archetypes add constraint wine_archetypes_primary_grape_id_fkey
  foreign key (primary_grape_id) references public.grapes(id) on delete restrict;
create index wine_archetypes_country_idx on public.wine_archetypes (country_id);
create index wine_archetypes_region_idx on public.wine_archetypes (region_id);
create index wine_archetypes_appellation_idx on public.wine_archetypes (appellation_id);

-- ---------------------------------------------------------------------------
-- 2. Signature aromas (D5): picking that exact term earns the bonus.
-- ---------------------------------------------------------------------------
alter table public.wine_archetype_aromas add column signature boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Archetype designations (§4.3), RLS as wine_archetype_aromas.
-- ---------------------------------------------------------------------------
create table public.wine_archetype_designations (
  archetype_id uuid not null references public.wine_archetypes(id) on delete cascade,
  type_designation_id uuid not null references public.type_designations(id) on delete cascade,
  primary key (archetype_id, type_designation_id)
);
create index wine_archetype_designations_designation_idx
  on public.wine_archetype_designations (type_designation_id);
alter table public.wine_archetype_designations enable row level security;
create policy "archetype designations read" on public.wine_archetype_designations
  for select to authenticated using (true);
create policy "archetype designations write" on public.wine_archetype_designations
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_curator))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_curator));
revoke all on table public.wine_archetype_designations from public, anon;

-- ---------------------------------------------------------------------------
-- 4. training_attempts (§6.1, verbatim, with explicit constraint names).
-- ---------------------------------------------------------------------------
create table public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  session_key uuid not null,
  note_id uuid not null unique references public.wset_notes(id) on delete cascade,
  picked_archetype_id uuid references public.wine_archetypes(id) on delete set null,
  guessed_vintage_kind vintage_kind,
  guessed_vintage_year smallint
    constraint training_attempts_guessed_vintage_year_check check (guessed_vintage_year between 1900 and 2100),
  guessed_vintage_tawny_years smallint,
  actual_catalog_wine_id uuid references public.catalog_wines(id) on delete restrict,
  actual_archetype_id uuid references public.wine_archetypes(id) on delete set null,
  note_colour_hue wset_colour_hue,
  hue_cleared boolean not null default false,
  candidates_snapshot jsonb not null default '[]',
  country_points smallint,
  region_points smallint,
  appellation_points smallint,
  primary_grape_points smallint,
  secondary_grape_points smallint,
  type_designation_points smallint,
  vintage_points smallint,
  total_points smallint,
  possible_points smallint,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  constraint training_attempts_author_id_session_key_key unique (author_id, session_key),
  constraint training_attempts_scored_when_revealed check ((actual_catalog_wine_id is null) = (scored_at is null)),
  constraint training_attempts_vintage_year_shape
    check (guessed_vintage_kind is null or (guessed_vintage_kind = 'YEAR') = (guessed_vintage_year is not null)),
  constraint training_attempts_vintage_tawny_shape
    check (guessed_vintage_kind is distinct from 'TAWNY' or guessed_vintage_tawny_years is not null),
  constraint training_attempts_snapshot_is_array check (jsonb_typeof(candidates_snapshot) = 'array')
);
create index training_attempts_history_idx on public.training_attempts (author_id, created_at desc, id desc);
alter table public.training_attempts enable row level security;
create policy "training attempts read own" on public.training_attempts
  for select to authenticated using (author_id = auth.uid());
revoke all on table public.training_attempts from public, anon, authenticated;
grant select on public.training_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The TRAINING note shape (§6.3, D15): no identity and no glass until the
--    reveal. Every other shape is unchanged; the read policy already makes an
--    identity-less note author-only.
-- ---------------------------------------------------------------------------
alter table public.wset_notes drop constraint wset_notes_one_identity;
alter table public.wset_notes add constraint wset_notes_one_identity check (
  num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
  or (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
      and tasting_wine_id is not null
      and context_kind = 'BLIND')
  or (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
      and tasting_wine_id is null
      and context_kind = 'TRAINING')
);

-- ---------------------------------------------------------------------------
-- 6. scrub_deleted_account: 20260925003000's body with one addition, the
--    training_attempts delete in step 6 (every call), before the notes. The
--    note cascade would remove them anyway; explicit is clearer (§6.4).
--    `create or replace` keeps its ACL (owner only).
-- ---------------------------------------------------------------------------
create or replace function public.scrub_deleted_account(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_deleted_at timestamptz;
  v_tasting uuid;
  v_gone int;
begin
  -- 0. Serialise on the profile. No profile: nothing of theirs is in public.
  select deleted_at into v_deleted_at from profiles where id = p_user_id for update;
  if not found then
    return;
  end if;

  if v_deleted_at is null then
    -- 1. Hosted, never started, nobody else JOINED or INVITED: nothing is recorded yet (D6a).
    delete from tastings t
     where t.host_id = p_user_id and t.status = 'DRAFT' and t.started_at is null
       and not exists (select 1 from tasting_participants p
                        where p.tasting_id = t.id and p.user_id <> p_user_id
                          and p.status in ('JOINED', 'INVITED'));
    -- 2. Every other hosted tasting that is not finished: finish it, reveal nothing (D6b).
    update tastings set status = 'CLOSED' where host_id = p_user_id and status <> 'CLOSED';
    -- 3. Their places (D6c).
    delete from tasting_places tp using tastings t
     where tp.tasting_id = t.id and t.host_id = p_user_id;
    -- 4. Seats in other people's never-started tastings: their glasses, then the seat (D7a).
    for v_tasting in
      select tp.tasting_id from tasting_participants tp join tastings t on t.id = tp.tasting_id
       where tp.user_id = p_user_id and t.host_id <> p_user_id
         and t.status = 'DRAFT' and t.started_at is null
    loop
      perform 1 from wines where tasting_id = v_tasting for update;
      delete from wines w using tasting_participants tp
       where w.tasting_id = v_tasting and w.contributor_participant_id = tp.id
         and tp.tasting_id = v_tasting and tp.user_id = p_user_id;
      get diagnostics v_gone = row_count;
      if v_gone > 0 then
        -- remove_flight_glass's two statements, so (tasting_id, position) never collides.
        with ordered as (select id, row_number() over (order by position) as ord
                           from wines where tasting_id = v_tasting)
        update wines w set position = -o.ord from ordered o where w.id = o.id;
        update wines set position = -position where tasting_id = v_tasting and position < 0;
      end if;
      delete from tasting_participants where tasting_id = v_tasting and user_id = p_user_id;
    end loop;
    -- 5. Started, unfinished tastings of others: an unanswered seat nothing points at (D7b).
    delete from tasting_participants tp using tastings t
     where tp.tasting_id = t.id and tp.user_id = p_user_id and t.host_id <> p_user_id
       and t.status <> 'CLOSED' and tp.status <> 'JOINED'
       and not exists (select 1 from guesses g where g.participant_id = tp.id)
       and not exists (select 1 from wines w where w.contributor_participant_id = tp.id);
  end if;

  -- 6. Only theirs; every call, so a later call sweeps what a leftover token wrote (D8, D12).
  -- The training room (20260925120000): attempts go before the notes they point at.
  delete from training_attempts where author_id = p_user_id;
  delete from wset_notes where author_id = p_user_id;
  delete from cellar_consumptions where owner_id = p_user_id;
  delete from cellar_lots where owner_id = p_user_id;
  delete from friend_requests where requester_id = p_user_id or recipient_id = p_user_id;
  delete from friendships where user_id = p_user_id or friend_id = p_user_id;
  delete from platform_invites where inviter_id = p_user_id;
  delete from wine_pour_intents where owner_id = p_user_id;
  delete from wine_identity_drafts where owner_id = p_user_id;
  delete from label_reads where user_id = p_user_id;
  if to_regclass('public.auth_sessions') is not null then
    execute 'delete from public.auth_sessions where user_id = $1' using p_user_id;
  end if;
  if to_regclass('public.auth_tokens') is not null then
    execute 'delete from public.auth_tokens where user_id = $1' using p_user_id;
  end if;
  if to_regclass('public.auth_credentials') is not null then
    execute 'delete from public.auth_credentials where user_id = $1' using p_user_id;
  end if;

  -- 7. Scrub and stamp last: deleted_at marks a completed run (D5).
  if v_deleted_at is null then
    update profiles
       set display_name = 'Deleted user',
           email = 'deleted+' || p_user_id::text || '@blindr.invalid',
           avatar_url = null, bio = null, location = null, phone = null,
           favorite_wine_type = null, last_seen_at = null,
           role = 'MEMBER', cellar_visibility = 'PRIVATE', preferred_currency = 'DKK',
           deleted_at = now()
     where id = p_user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. record_training_attempt (§6.2, steps 1-5). SECURITY DEFINER: the note is
--    written through save_wset_note, which runs here as the table owner with
--    RLS bypassed, so this function enforces what the policies would (D14):
--    the caller is signed in; the note is forced to TRAINING, no glass, no
--    unidentified wine, the revealed catalog wine (or none); a fresh attempt
--    takes no client note id; a re-reveal touches only the caller's own row.
--    Points are the championship table's (D7), defined once here and pinned
--    to reveal_wine's by scripts/training-room.test.mjs.
-- ---------------------------------------------------------------------------
create function public.record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  -- The championship maxima (spec D7); the DB suite pins each to reveal_wine's.
  c_country constant smallint := 2;
  c_region constant smallint := 3;
  c_appellation constant smallint := 5;
  c_primary_grape constant smallint := 8;
  c_secondary_grape constant smallint := 2;
  c_type_designation constant smallint := 2;
  c_vintage constant smallint := 2;
  c_vintage_near constant smallint := 1;
  v_uid uuid := auth.uid();
  v_attempt training_attempts%rowtype;
  v_attempt_id uuid;
  v_session uuid;
  v_started timestamptz;
  v_wine_id uuid;
  v_wine catalog_wines%rowtype;
  v_pick_id uuid;
  v_pick wine_archetypes%rowtype;
  v_has_pick boolean := false;
  v_note jsonb;
  v_hue wset_colour_hue;
  v_identities int;
  v_cleared boolean := false;
  v_note_id uuid;
  v_kind vintage_kind;
  v_score boolean := false;
  v_country smallint;
  v_region smallint;
  v_appellation smallint;
  v_primary smallint;
  v_secondary smallint;
  v_designation smallint;
  v_vintage smallint;
  v_actual uuid;
begin
  -- 1. Signed in.
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_attempt is null or jsonb_typeof(p_attempt) <> 'object' then
    raise exception 'the attempt must be an object' using errcode = 'invalid_parameter_value';
  end if;
  v_attempt_id := nullif(p_attempt ->> 'attempt_id', '')::uuid;
  v_wine_id := nullif(p_attempt ->> 'actual_catalog_wine_id', '')::uuid;
  if v_wine_id is not null then
    -- Read as the definer: "catalog read" may hide a blind_pending row from
    -- the caller, and the score is still computed (step 4).
    select * into v_wine from catalog_wines where id = v_wine_id;
    if not found then
      raise exception 'no such wine' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if v_attempt_id is null then
    -- 2. A fresh attempt, idempotent on (caller, session key): a second tab
    --    or a reload returns the first attempt unchanged.
    v_session := nullif(p_attempt ->> 'session_key', '')::uuid;
    if v_session is null then
      raise exception 'a session key is required' using errcode = 'invalid_parameter_value';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('training-session:' || v_uid::text || ':' || v_session::text, 0));
    select * into v_attempt from training_attempts where author_id = v_uid and session_key = v_session;
    if not found then
      if p_note is null or jsonb_typeof(p_note) <> 'object' then
        raise exception 'the note must be an object' using errcode = 'invalid_parameter_value';
      end if;
      if nullif(p_note ->> 'id', '') is not null then
        raise exception 'a new session takes no note id' using errcode = 'insufficient_privilege';
      end if;
      if p_aromas is not null and jsonb_typeof(p_aromas) <> 'array' then
        raise exception 'the aromas must be a list' using errcode = 'invalid_parameter_value';
      end if;
      if jsonb_typeof(coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)) <> 'array' then
        raise exception 'the ranking must be a list' using errcode = 'invalid_parameter_value';
      end if;
      v_pick_id := nullif(p_attempt ->> 'picked_archetype_id', '')::uuid;
      if v_pick_id is not null and not exists (select 1 from wine_archetypes where id = v_pick_id) then
        raise exception 'no such typical wine' using errcode = 'invalid_parameter_value';
      end if;
      v_started := coalesce(nullif(p_attempt ->> 'started_at', '')::timestamptz, now());
      v_hue := nullif(p_note ->> 'colour_hue', '')::wset_colour_hue;
      v_note := (p_note - 'id') || jsonb_build_object(
        'context_kind', 'TRAINING',
        'tasting_wine_id', null,
        'unidentified_wine_id', null,
        'catalog_wine_id', v_wine_id,
        'tasted_on', (v_started at time zone 'UTC')::date);
      -- 2b. A hue that does not fit the revealed wine's colour would be refused
      --     by wset_notes_check_hue: drop it from the note, keep it on the attempt.
      if v_wine_id is not null and not wset_hue_fits_colour(v_hue, v_wine.colour) then
        v_note := jsonb_set(v_note, '{colour_hue}', 'null'::jsonb);
        v_cleared := true;
      end if;
      v_note_id := save_wset_note(v_note, coalesce(p_aromas, '[]'::jsonb));
      v_kind := nullif(p_attempt ->> 'guessed_vintage_kind', '')::vintage_kind;
      insert into training_attempts (
        author_id, session_key, note_id, picked_archetype_id,
        guessed_vintage_kind, guessed_vintage_year, guessed_vintage_tawny_years,
        note_colour_hue, hue_cleared, candidates_snapshot
      ) values (
        v_uid, v_session, v_note_id, v_pick_id,
        v_kind,
        case when v_kind = 'YEAR' then (p_attempt ->> 'guessed_vintage_year')::smallint end,
        case when v_kind = 'TAWNY' then (p_attempt ->> 'guessed_vintage_tawny_years')::smallint end,
        v_hue, v_cleared, coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)
      )
      returning * into v_attempt;
      v_score := v_wine_id is not null;
    end if;
  else
    -- 3. A re-reveal of the caller's own unscored attempt: only the note's
    --    identity and the score are written; p_note, p_aromas, the pick, the
    --    vintage and the ranking are ignored.
    select * into v_attempt from training_attempts
     where id = v_attempt_id and author_id = v_uid
     for update;
    if not found then
      raise exception 'that session is not yours' using errcode = 'insufficient_privilege';
    end if;
    if v_attempt.scored_at is not null then
      raise exception 'already revealed' using errcode = 'P0001';
    end if;
    if v_wine_id is null then
      raise exception 'name the wine to reveal' using errcode = 'invalid_parameter_value';
    end if;
    select n.colour_hue, num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id)
      into v_hue, v_identities
      from wset_notes n where n.id = v_attempt.note_id
     for update;
    if v_identities = 0 then
      v_cleared := not wset_hue_fits_colour(v_hue, v_wine.colour);
      update wset_notes
         set catalog_wine_id = v_wine_id,
             colour_hue = case when wset_hue_fits_colour(colour_hue, v_wine.colour) then colour_hue end
       where id = v_attempt.note_id and num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0;
    end if;
    v_score := true;
  end if;

  -- 4. Score against the named wine with the picked archetype's FKs, grapes
  --    and designations; a missing pick scores 0 on every category that applies.
  if v_score then
    if v_attempt.picked_archetype_id is not null then
      select * into v_pick from wine_archetypes where id = v_attempt.picked_archetype_id;
      v_has_pick := found;
    end if;
    v_country := case when v_has_pick and v_pick.country_id = v_wine.country_id then c_country else 0 end;
    v_region := case when v_has_pick and v_pick.region_id = v_wine.region_id then c_region else 0 end;
    v_appellation := case when v_has_pick and v_pick.appellation_id = v_wine.appellation_id then c_appellation else 0 end;
    v_primary := case when v_has_pick and v_pick.primary_grape_id = v_wine.primary_grape_id then c_primary_grape else 0 end;
    v_secondary := case
      when v_wine.secondary_grape_id is null then null
      when v_has_pick and v_pick.secondary_grape_id = v_wine.secondary_grape_id then c_secondary_grape
      else 0
    end;
    v_designation := case
      when v_wine.type_designation_id is null then null
      when v_has_pick and exists (select 1 from wine_archetype_designations d
                                   where d.archetype_id = v_pick.id
                                     and d.type_designation_id = v_wine.type_designation_id) then c_type_designation
      else 0
    end;
    -- reveal_wine's vintage rule; null when no vintage was guessed.
    v_vintage := case
      when v_attempt.guessed_vintage_kind is null then null
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'NV' then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'TAWNY'
        and v_attempt.guessed_vintage_tawny_years = v_wine.vintage_tawny_years then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and v_attempt.guessed_vintage_year = v_wine.vintage_year then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and abs(v_attempt.guessed_vintage_year - v_wine.vintage_year) = 1 then c_vintage_near
      else 0
    end;
    -- D17: the wine's own style. Same appellation, colour and style; else same
    -- region, primary grape, colour and style. Ties: the wine's designation,
    -- then the taster's pick, then an equal second grape, sort_order, id.
    select a.id into v_actual
      from wine_archetypes a
     where a.colour = v_wine.colour and a.style = v_wine.style
       and (a.appellation_id = v_wine.appellation_id
            or (a.region_id = v_wine.region_id and a.primary_grape_id = v_wine.primary_grape_id))
     order by (a.appellation_id = v_wine.appellation_id) desc,
              exists (select 1 from wine_archetype_designations d
                       where d.archetype_id = a.id
                         and d.type_designation_id = v_wine.type_designation_id) desc,
              (a.id is not distinct from v_attempt.picked_archetype_id) desc,
              (a.secondary_grape_id is not distinct from v_wine.secondary_grape_id) desc,
              a.sort_order,
              a.id
     limit 1;
    update training_attempts
       set actual_catalog_wine_id = v_wine_id,
           actual_archetype_id = v_actual,
           hue_cleared = v_cleared,
           country_points = v_country,
           region_points = v_region,
           appellation_points = v_appellation,
           primary_grape_points = v_primary,
           secondary_grape_points = v_secondary,
           type_designation_points = v_designation,
           vintage_points = v_vintage,
           total_points = v_country + v_region + v_appellation + v_primary
             + coalesce(v_secondary, 0) + coalesce(v_designation, 0) + coalesce(v_vintage, 0),
           possible_points = c_country + c_region + c_appellation + c_primary_grape
             + case when v_secondary is null then 0 else c_secondary_grape end
             + case when v_designation is null then 0 else c_type_designation end
             + case when v_vintage is null then 0 else c_vintage end,
           scored_at = now()
     where id = v_attempt.id
    returning * into v_attempt;
  end if;

  -- 5. The attempt as stored.
  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'note_id', v_attempt.note_id,
    'points', jsonb_build_object(
      'country', v_attempt.country_points,
      'region', v_attempt.region_points,
      'appellation', v_attempt.appellation_points,
      'primary_grape', v_attempt.primary_grape_points,
      'secondary_grape', v_attempt.secondary_grape_points,
      'type_designation', v_attempt.type_designation_points,
      'vintage', v_attempt.vintage_points),
    'total', v_attempt.total_points,
    'possible', v_attempt.possible_points,
    'actual_archetype_id', v_attempt.actual_archetype_id,
    'hue_cleared', v_attempt.hue_cleared);
end $$;

-- Supabase's default privileges grant EXECUTE on a new function to PUBLIC,
-- anon, authenticated and service_role. auth.uid() is null for anon and
-- service_role, so they lose it too (the transfer_tasting_host OD-1 precedent).
revoke all on function public.record_training_attempt(jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.record_training_attempt(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
begin
  -- 1. wine_archetypes: the new and changed columns.
  select string_agg(format('%s %s%s', a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.wine_archetypes'::regclass and not a.attisdropped
    and a.attname in ('wine_place_id', 'country_id', 'region_id', 'appellation_id', 'primary_grape_id',
                      'typical_age_low', 'typical_age_high');
  if v_text is distinct from
       'appellation_id uuid not null, country_id uuid not null, primary_grape_id uuid not null, '
       || 'region_id uuid not null, typical_age_high int2, typical_age_low int2, wine_place_id uuid' then
    raise exception 'wine_archetypes columns differ from spec §4.1: %', v_text;
  end if;

  -- 2. Its constraints and the three new indexes.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetypes'::regclass;
  if v_text is distinct from
       'wine_archetypes_appellation_id_fkey FOREIGN KEY (appellation_id) REFERENCES appellations(id); '
       || 'wine_archetypes_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(id); '
       || 'wine_archetypes_pkey PRIMARY KEY (id); '
       || 'wine_archetypes_primary_grape_id_fkey FOREIGN KEY (primary_grape_id) REFERENCES grapes(id) ON DELETE RESTRICT; '
       || 'wine_archetypes_quality_high_check CHECK (((quality_high IS NULL) OR ((quality_high >= 50) AND (quality_high <= 100)))); '
       || 'wine_archetypes_quality_low_check CHECK (((quality_low IS NULL) OR ((quality_low >= 50) AND (quality_low <= 100)))); '
       || 'wine_archetypes_region_id_fkey FOREIGN KEY (region_id) REFERENCES regions(id); '
       || 'wine_archetypes_secondary_grape_id_fkey FOREIGN KEY (secondary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_typical_age_check CHECK ((((typical_age_low IS NULL) OR (typical_age_low >= 0)) AND '
       || '((typical_age_high IS NULL) OR (typical_age_high >= 0)) AND '
       || '((typical_age_low IS NULL) OR (typical_age_high IS NULL) OR (typical_age_low <= typical_age_high)))); '
       || 'wine_archetypes_wine_place_id_fkey FOREIGN KEY (wine_place_id) REFERENCES wine_places(id) ON DELETE CASCADE' then
    raise exception 'wine_archetypes constraints differ from spec §4.1: %', v_text;
  end if;
  if (select count(*) from pg_indexes i
       where i.schemaname = 'public' and i.tablename = 'wine_archetypes'
         and i.indexname in ('wine_archetypes_country_idx', 'wine_archetypes_region_idx',
                             'wine_archetypes_appellation_idx')) <> 3 then
    raise exception 'an index on the three new wine_archetypes foreign keys is missing';
  end if;

  -- 3. The back-fill, row by row (spec §4.1), and Sauternes' grapes.
  select string_agg(format('%s -> %s / %s / %s', a.name, c.name, r.name, ap.name), '; ' order by a.name collate "C")
    into v_text
  from public.wine_archetypes a
  join public.countries c on c.id = a.country_id
  join public.regions r on r.id = a.region_id
  join public.appellations ap on ap.id = a.appellation_id;
  if v_text is distinct from
       'A typical Alsace Riesling -> France / Alsace / Alsace AOC; '
       || 'A typical Bandol -> France / Provence / Bandol AOC; '
       || 'A typical Chablis -> France / Bourgogne / Chablis AOC; '
       || 'A typical Champagne -> France / Champagne / Champagne AOC; '
       || 'A typical Châteauneuf-du-Pape -> France / Rhône / Châteauneuf-du-Pape AOC; '
       || 'A typical Côte Chalonnaise -> France / Bourgogne / Cote Chalonnaise AOC; '
       || 'A typical Côte de Beaune -> France / Bourgogne / Bourgogne AOC; '
       || 'A typical Côte de Nuits -> France / Bourgogne / Bourgogne AOC; '
       || 'A typical Côte-Rôtie -> France / Rhône / Côte-Rôtie AOC; '
       || 'A typical Margaux -> France / Bordeaux / Margaux AOC; '
       || 'A typical Mâconnais -> France / Bourgogne / Macon AOC; '
       || 'A typical Petit Chablis -> France / Bourgogne / Petit Chablis AOC; '
       || 'A typical Sancerre -> France / Loire / Sancerre AOC; '
       || 'A typical Sauternes -> France / Bordeaux / Sauternes AOC; '
       || 'A typical Vosne-Romanée -> France / Bourgogne / Vosne-Romanée AOC' then
    raise exception 'the back-fill is not spec §4.1''s table: %', v_text;
  end if;
  if (select format('%s / %s', g1.name, g2.name)
        from public.wine_archetypes a
        join public.grapes g1 on g1.id = a.primary_grape_id
        join public.grapes g2 on g2.id = a.secondary_grape_id
       where a.name = 'A typical Sauternes') is distinct from 'Semillon / Sauvignon Blanc' then
    raise exception 'A typical Sauternes is not Semillon / Sauvignon Blanc';
  end if;
  if exists (select 1 from public.wine_archetypes where wine_place_id is null) then
    raise exception 'a live archetype lost its map place';
  end if;

  -- 4. Signature aromas: a new column, false on every existing link.
  if not exists (select 1 from pg_attribute a
                 join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                 where a.attrelid = 'public.wine_archetype_aromas'::regclass and a.attname = 'signature'
                   and a.atttypid = 'boolean'::regtype and a.attnotnull
                   and pg_get_expr(d.adbin, d.adrelid) = 'false')
     or exists (select 1 from public.wine_archetype_aromas where signature) then
    raise exception 'wine_archetype_aromas.signature is not boolean not null default false, false everywhere';
  end if;

  -- 5. wine_archetype_designations: its key, both cascades, RLS and the two policies.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetype_designations'::regclass;
  if v_text is distinct from
       'wine_archetype_designations_archetype_id_fkey FOREIGN KEY (archetype_id) REFERENCES wine_archetypes(id) ON DELETE CASCADE; '
       || 'wine_archetype_designations_pkey PRIMARY KEY (archetype_id, type_designation_id); '
       || 'wine_archetype_designations_type_designation_id_fkey FOREIGN KEY (type_designation_id) REFERENCES type_designations(id) ON DELETE CASCADE' then
    raise exception 'wine_archetype_designations constraints differ from spec §4.3: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', p.polname, p.polcmd, p.polroles::regrole[]::text,
                           case when p.polcmd = 'r' then pg_get_expr(p.polqual, p.polrelid)
                                when pg_get_expr(p.polqual, p.polrelid) like '%is_curator%'
                                     and pg_get_expr(p.polwithcheck, p.polrelid) like '%is_curator%' then 'curator'
                                else 'other' end),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.wine_archetype_designations'::regclass;
  if v_text is distinct from
       'archetype designations read r {authenticated} true; archetype designations write * {authenticated} curator'
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.wine_archetype_designations'::regclass)
     or has_table_privilege('anon', 'public.wine_archetype_designations', 'SELECT') then
    raise exception 'wine_archetype_designations RLS is not "read: authenticated, write: curators": %', v_text;
  end if;

  -- 6. training_attempts: the columns of spec §6.1, in order.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g') end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.training_attempts'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id uuid not null default gen_random_uuid(), author_id uuid not null, session_key uuid not null, '
       || 'note_id uuid not null, picked_archetype_id uuid, guessed_vintage_kind vintage_kind, '
       || 'guessed_vintage_year int2, guessed_vintage_tawny_years int2, actual_catalog_wine_id uuid, '
       || 'actual_archetype_id uuid, note_colour_hue wset_colour_hue, hue_cleared bool not null default false, '
       || 'candidates_snapshot jsonb not null default ''[]''::jsonb, country_points int2, region_points int2, '
       || 'appellation_points int2, primary_grape_points int2, secondary_grape_points int2, '
       || 'type_designation_points int2, vintage_points int2, total_points int2, possible_points int2, '
       || 'scored_at timestamptz, created_at timestamptz not null default now()' then
    raise exception 'training_attempts columns differ from spec §6.1: %', v_text;
  end if;

  -- 7. Its constraints and the history index.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from
       'training_attempts_actual_archetype_id_fkey FOREIGN KEY (actual_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_actual_catalog_wine_id_fkey FOREIGN KEY (actual_catalog_wine_id) REFERENCES catalog_wines(id) ON DELETE RESTRICT; '
       || 'training_attempts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'training_attempts_author_id_session_key_key UNIQUE (author_id, session_key); '
       || 'training_attempts_guessed_vintage_year_check CHECK (((guessed_vintage_year >= 1900) AND (guessed_vintage_year <= 2100))); '
       || 'training_attempts_note_id_fkey FOREIGN KEY (note_id) REFERENCES wset_notes(id) ON DELETE CASCADE; '
       || 'training_attempts_note_id_key UNIQUE (note_id); '
       || 'training_attempts_picked_archetype_id_fkey FOREIGN KEY (picked_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_pkey PRIMARY KEY (id); '
       || 'training_attempts_scored_when_revealed CHECK (((actual_catalog_wine_id IS NULL) = (scored_at IS NULL))); '
       || 'training_attempts_snapshot_is_array CHECK ((jsonb_typeof(candidates_snapshot) = ''array''::text)); '
       || 'training_attempts_vintage_tawny_shape CHECK (((guessed_vintage_kind IS DISTINCT FROM ''TAWNY''::vintage_kind) OR (guessed_vintage_tawny_years IS NOT NULL))); '
       || 'training_attempts_vintage_year_shape CHECK (((guessed_vintage_kind IS NULL) OR ((guessed_vintage_kind = ''YEAR''::vintage_kind) = (guessed_vintage_year IS NOT NULL))))' then
    raise exception 'training_attempts constraints differ from spec §6.1: %', v_text;
  end if;
  if not exists (select 1 from pg_indexes i
                 where i.schemaname = 'public' and i.tablename = 'training_attempts'
                   and i.indexname = 'training_attempts_history_idx'
                   and i.indexdef like '% USING btree (author_id, created_at DESC, id DESC)') then
    raise exception 'training_attempts_history_idx is missing or is not (author_id, created_at desc, id desc)';
  end if;

  -- 8. RLS on (not forced), exactly the one read policy; authenticated holds
  --    SELECT alone, anon and PUBLIC nothing, no column grant anywhere.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.training_attempts'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'training_attempts row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from 'training attempts read own r permissive {authenticated} (author_id = auth.uid()) -' then
    raise exception 'training_attempts policies differ from spec §6.1: %', v_text;
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.training_attempts'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a table privilege on training_attempts';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.training_attempts'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on training_attempts are %, expected SELECT only', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute t
             where t.attrelid = 'public.training_attempts'::regclass and t.attnum > 0 and t.attacl is not null) then
    raise exception 'training_attempts carries a column-level grant';
  end if;

  -- 9. The note constraint's three shapes (spec §6.3).
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from
       'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) '
       || 'AND (context_kind = ''BLIND''::wset_note_context)) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NULL) '
       || 'AND (context_kind = ''TRAINING''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not spec §6.3''s constraint';
  end if;

  -- 10. Every function this file creates or recreates: security, search_path,
  --     volatility, language, return type, arguments, body (md5 of prosrc with
  --     any CR stripped) and who holds EXECUTE ("OWNER" is the owner).
  for v_fn in
    select s.sig, s.rettype, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.record_training_attempt(jsonb,jsonb,jsonb)', 'jsonb', 'p_note jsonb, p_aromas jsonb, p_attempt jsonb',
       '79b65a0e38ea00be8b8adcc771abcc60', 'OWNER,authenticated'),
      ('public.scrub_deleted_account(uuid)', 'void', 'p_user_id uuid', 'b9aa8d71a00dda3aec526a2ec6950f1d', 'OWNER')
    ) as s (sig, rettype, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if not v_fn.prosecdef
       or v_fn.config_now is distinct from '{search_path=public}'
       or v_fn.volatile_now is distinct from 'v'
       or v_fn.lanname is distinct from 'plpgsql'
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'EXECUTE on record_training_attempt is not authenticated-only';
  end if;

  -- 11. What the RPC calls without changing it.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.save_wset_note(jsonb,jsonb)',                       '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'a function the RPC calls changed: %', v_text;
  end if;

  raise notice 'training room: % archetypes back-filled; training_attempts acl %',
    (select count(*) from public.wine_archetypes where appellation_id is not null),
    (select c.relacl::text from pg_class c where c.oid = 'public.training_attempts'::regclass);
end $$;
```

- [ ] **Step 4: Check the two pinned body md5s match the file**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node --input-type=module -e "$(cat <<'EOF'
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/20260925120000_training_room.sql", "utf8");
const md5 = (sig) => {
  const a = sql.indexOf("$$", sql.indexOf(sig)) + 2;
  return createHash("md5").update(sql.slice(a, sql.indexOf("$$", a)).replace(/\r/g, "")).digest("hex");
};
console.log("scrub", md5("create or replace function public.scrub_deleted_account"));
console.log("rpc", md5("create function public.record_training_attempt"));
EOF
)"
```
Expected, exactly:
```
scrub b9aa8d71a00dda3aec526a2ec6950f1d
rpc 79b65a0e38ea00be8b8adcc771abcc60
```
If either differs, the body was not copied verbatim. Fix the copy; never edit the pinned value to match.

- [ ] **Step 5: Run the pre-state against live and compile both bodies (read-only)**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local --input-type=module -e "$(cat <<'EOF'
// Read-only: the pre-state block against live, and both function bodies compiled as DO blocks.
import { readFileSync } from "node:fs";
import pg from "pg";
import { pgConfig } from "./scripts/wine-map-tiles/lib.mjs";
const sql = readFileSync("supabase/migrations/20260925120000_training_room.sql", "utf8").replace(/\r/g, "");
const pre = sql.slice(sql.indexOf("do $$"), sql.indexOf("end $$;") + "end $$;".length);
const body = (sig) => {
  const a = sql.indexOf("$$", sql.indexOf(sig)) + 2;
  return sql.slice(a, sql.indexOf("$$", a));
};
const asDo = (b, params) =>
  `do $$${b.replace("declare\n", `declare\n${params}`).replace("\nbegin\n", "\nbegin\n  if true then return; end if;\n")}$$;`;
const rpc = body("create function public.record_training_attempt")
  .replace("v_attempt training_attempts%rowtype;", "v_attempt record;")
  .replace("  return jsonb_build_object(", "  perform jsonb_build_object(");
const scrub = body("create or replace function public.scrub_deleted_account");
const c = new pg.Client(pgConfig());
await c.connect();
await c.query("begin read only");
try {
  await c.query(pre);
  console.log("pre-state: OK");
  await c.query(asDo(rpc, "  p_note jsonb;\n  p_aromas jsonb;\n  p_attempt jsonb;\n"));
  console.log("record_training_attempt: compiles");
  await c.query(asDo(scrub, "  p_user_id uuid;\n"));
  console.log("scrub_deleted_account: compiles");
} finally {
  await c.query("rollback");
  await c.end();
}
EOF
)"
```
Expected:
```
pre-state: OK
record_training_attempt: compiles
scrub_deleted_account: compiles
```
(`training_attempts%rowtype` is swapped for `record` only here, because the table does not exist live yet.)

- [ ] **Step 6: Confirm the back-fill resolves (read-only)**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local --input-type=module -e "$(cat <<'EOF'
import { readFileSync } from "node:fs";
import pg from "pg";
import { pgConfig } from "./scripts/wine-map-tiles/lib.mjs";
const sql = readFileSync("supabase/migrations/20260925120000_training_room.sql", "utf8").replace(/\r/g, "");
const start = sql.indexOf("select f.archetype,");
const select = sql.slice(start, sql.indexOf(") as f (archetype, country, region, appellation);", start)) +
  ") as f (archetype, country, region, appellation)";
const c = new pg.Client(pgConfig());
await c.connect();
await c.query("begin read only");
try {
  const { rows } = await c.query(`select count(*)::int as rows,
      count(*) filter (where cardinality(archetype_ids) = 1 and cardinality(country_ids) = 1
                         and cardinality(region_ids) = 1 and cardinality(appellation_ids) = 1)::int as resolved
    from (${select}) x`);
  console.log(rows[0]);
} finally {
  await c.query("rollback");
  await c.end();
}
EOF
)"
```
Expected: `{ rows: 15, resolved: 15 }`

- [ ] **Step 7: Add the new columns, tables and RPC to `src/lib/supabase/database.types.ts`.** The file uses CRLF line endings; the Edit tool keeps them. Five edits.

Edit 1. Replace the `wine_archetypes` Row and Insert (lines 1288–1320):
```ts
      wine_archetypes: {
        Row: {
          id: string;
          wine_place_id: string;
          name: string;
          colour: WineColour;
          style: WineStyle;
          primary_grape_id: string | null;
          secondary_grape_id: string | null;
          description: string | null;
          sat: { [key: string]: [string, string] };
          quality_low: number | null;
          quality_high: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id: string;
          name: string;
          colour: WineColour;
          style?: WineStyle;
          primary_grape_id?: string | null;
          secondary_grape_id?: string | null;
          description?: string | null;
          sat?: { [key: string]: [string, string] };
          quality_low?: number | null;
          quality_high?: number | null;
          sort_order?: number;
          created_at?: string;
        };
```
with
```ts
      wine_archetypes: {
        Row: {
          id: string;
          // Nullable in the database since 20260925120000 (training-room spec
          // D9). Typed `string` until Task 13 of the training-room plan, once
          // Tasks 6, 9 and 12 made every reader tolerate null; no live row is
          // null before batch 1 (20260925130000).
          wine_place_id: string;
          name: string;
          colour: WineColour;
          style: WineStyle;
          // 20260925120000 (spec D8, §4.1): the scoring identity, resolved by
          // exact live name when a batch is written, never at runtime.
          country_id: string;
          region_id: string;
          appellation_id: string;
          primary_grape_id: string;
          secondary_grape_id: string | null;
          description: string | null;
          sat: { [key: string]: [string, string] };
          quality_low: number | null;
          quality_high: number | null;
          // Years from vintage at which the style is usually met (spec D10).
          typical_age_low: number | null;
          typical_age_high: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id?: string | null;
          name: string;
          colour: WineColour;
          style?: WineStyle;
          country_id: string;
          region_id: string;
          appellation_id: string;
          primary_grape_id: string;
          secondary_grape_id?: string | null;
          description?: string | null;
          sat?: { [key: string]: [string, string] };
          quality_low?: number | null;
          quality_high?: number | null;
          typical_age_low?: number | null;
          typical_age_high?: number | null;
          sort_order?: number;
          created_at?: string;
        };
```

Edit 2. Replace the `wine_archetype_aromas` block (lines 1323–1338 plus the blank line after it):
```ts
      wine_archetype_aromas: {
        Row: {
          archetype_id: string;
          term_id: string;
          kind: "NOSE" | "PALATE";
        };
        Insert: {
          archetype_id: string;
          term_id: string;
          kind?: "NOSE" | "PALATE";
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_archetype_aromas"]["Insert"]
        >;
        Relationships: [];
      };
```
with
```ts
      wine_archetype_aromas: {
        Row: {
          archetype_id: string;
          term_id: string;
          kind: "NOSE" | "PALATE";
          // 20260925120000 (spec D5): picking this exact term earns the bonus.
          signature: boolean;
        };
        Insert: {
          archetype_id: string;
          term_id: string;
          kind?: "NOSE" | "PALATE";
          signature?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_archetype_aromas"]["Insert"]
        >;
        Relationships: [];
      };

      // 20260925120000 (training-room spec §4.3): 0..n type designations per
      // archetype. Read: authenticated; write: curators (as the aroma links).
      wine_archetype_designations: {
        Row: {
          archetype_id: string;
          type_designation_id: string;
        };
        Insert: {
          archetype_id: string;
          type_designation_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_archetype_designations"]["Insert"]
        >;
        Relationships: [];
      };
```

Edit 3. Replace the opening line of `wine_archetype_placements` (line 1340):
```ts
      wine_archetype_placements: {
```
with
```ts
      // 20260925120000 (training-room spec §6.1): one row per training
      // session. SELECT own for authenticated; no client INSERT, UPDATE or
      // DELETE grant: only record_training_attempt writes it. Every *_points
      // column is null when that category did not apply or nothing was
      // revealed; scored_at is set exactly when actual_catalog_wine_id is.
      training_attempts: {
        Row: {
          id: string;
          author_id: string;
          session_key: string;
          note_id: string;
          picked_archetype_id: string | null;
          guessed_vintage_kind: VintageKind | null;
          guessed_vintage_year: number | null;
          guessed_vintage_tawny_years: number | null;
          actual_catalog_wine_id: string | null;
          actual_archetype_id: string | null;
          note_colour_hue: WsetColourHue | null;
          hue_cleared: boolean;
          // The full ranking frozen at the reveal (RankingSnapshot, spec §5.8).
          candidates_snapshot: Json;
          country_points: number | null;
          region_points: number | null;
          appellation_points: number | null;
          primary_grape_points: number | null;
          secondary_grape_points: number | null;
          type_designation_points: number | null;
          vintage_points: number | null;
          total_points: number | null;
          possible_points: number | null;
          scored_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          session_key: string;
          note_id: string;
          picked_archetype_id?: string | null;
          guessed_vintage_kind?: VintageKind | null;
          guessed_vintage_year?: number | null;
          guessed_vintage_tawny_years?: number | null;
          actual_catalog_wine_id?: string | null;
          actual_archetype_id?: string | null;
          note_colour_hue?: WsetColourHue | null;
          hue_cleared?: boolean;
          candidates_snapshot?: Json;
          country_points?: number | null;
          region_points?: number | null;
          appellation_points?: number | null;
          primary_grape_points?: number | null;
          secondary_grape_points?: number | null;
          type_designation_points?: number | null;
          vintage_points?: number | null;
          total_points?: number | null;
          possible_points?: number | null;
          scored_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["training_attempts"]["Insert"]
        >;
        Relationships: [];
      };

      wine_archetype_placements: {
```

Edit 4. Replace the `wset_notes` comment (lines 1366–1367):
```ts
          // revealed (M5's wset_notes_one_identity: exactly one of the two,
          // or neither alongside a BLIND context_kind + tasting_wine_id).
```
with
```ts
          // revealed (M5's wset_notes_one_identity: exactly one of the two,
          // or neither alongside a BLIND context_kind + tasting_wine_id, or
          // neither on a TRAINING note with no glass until the training
          // room's reveal, 20260925120000).
```

Edit 5. Replace the end of `Functions` (lines 2205–2211):
```ts
      attach_catalog_wine_photo: {
        Args: { p_catalog_wine_id: string; p_image_path: string; p_via: string };
        Returns: string;
      };
    };
  };
};
```
with
```ts
      attach_catalog_wine_photo: {
        Args: { p_catalog_wine_id: string; p_image_path: string; p_via: string };
        Returns: string;
      };
      // 20260925120000 (training-room spec §6.2): saves a training session's
      // TRAINING note and its training_attempts row, scoring the pick against
      // the revealed catalog wine in SQL. SECURITY DEFINER; EXECUTE for
      // authenticated only. p_attempt: { attempt_id?, session_key, started_at,
      // picked_archetype_id?, guessed_vintage_kind?, guessed_vintage_year?,
      // guessed_vintage_tawny_years?, actual_catalog_wine_id?,
      // candidates_snapshot }. Returns { attempt_id, note_id, points: {
      // country, region, appellation, primary_grape, secondary_grape,
      // type_designation, vintage }, total, possible, actual_archetype_id,
      // hue_cleared }. Refusals, verbatim: "not signed in" (42501), "a new
      // session takes no note id" (42501), "that session is not yours"
      // (42501), "already revealed" (P0001); "no such wine", "no such typical
      // wine", "a session key is required", "name the wine to reveal" and a
      // malformed argument (22023).
      record_training_attempt: {
        Args: { p_note: Json; p_aromas: Json; p_attempt: Json };
        Returns: Json;
      };
    };
  };
};
```

- [ ] **Step 8: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx tsc --noEmit && npx eslint scripts/training-room.test.mjs src/lib/supabase/database.types.ts && node --check scripts/training-room.test.mjs`
Expected: `tsc` exits 0 with no output; eslint prints nothing; `node --check` prints nothing.

- [ ] **Step 9 (main session only): Dry-run the migration and the DB suite against production, rolled back**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local <scratchpad>/apply-migration.mjs supabase/migrations/20260925120000_training_room.sql --dry`
Expected: `DRY RUN OK: 20260925120000_training_room ran in <n> ms and was rolled back`. Every pre-state and post-state assert ran against live inside that transaction; any `FAILED (rolled back): …` names the assert that refused.

Run: `cd /c/Users/Public/repos/blindtastingapp-training && TRAINING_ROOM_APPLY=supabase/migrations/20260925120000_training_room.sql node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/training-room.test.mjs`
Expected: `# tests 16`, `# pass 16`, `# fail 0`. These tests cover every §10 DB case: the TRAINING constraint branch (OPEN and BLIND without identity still refused, author-only read), a fresh attempt scoring 22/22 with the note forced to TRAINING and `tasted_on` the UTC date, a regional pick scoring 13/18 against a village wine, vintage 2/1/0 for YEAR/NV/TAWNY with a null when nothing was guessed, second grape and designation as null, 0 and full, a null pick scoring all zeros, idempotency on `session_key`, the RUBY-on-WHITE hue clearing (fresh and re-reveal), Reveal now using only the stored pick, vintage and ranking, refusals of another person's `attempt_id` (42501) and of an attempt already revealed (P0001), refusals for anon, for a missing user and for a client note id, the client write and read grants, the maxima pinned to `reveal_wine`, D17's order (appellation, then designation, then pick, then second grape, then sort order, and none for a style not in the pool), the scrub, the cascade on note delete, and the back-fill table.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add supabase/migrations/20260925120000_training_room.sql src/lib/supabase/database.types.ts scripts/training-room.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): archetype identity, training_attempts and record_training_attempt" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Pure foundations — types, copy, history tally, device draft

**Files:**
- Create: `src/lib/training/types.ts`
- Create: `src/lib/training/__fixtures__/archetypes.ts` (test fixtures shared by Tasks 2 and 3; not a test file, vitest includes `*.test.ts` only)
- Create: `src/lib/training/copy.ts`
- Test: `src/lib/training/copy.test.ts`
- Create: `src/lib/training/history-math.ts`
- Test: `src/lib/training/history-math.test.ts`
- Modify: `src/lib/safe-storage.ts` (append after line 90, the end of `writeValue`)
- Modify: `src/lib/safe-storage.test.ts` (line 2 import; append after line 139)
- Create: `src/lib/training/draft.ts`
- Test: `src/lib/training/draft.test.ts`

**Interfaces:**
- Consumes: `WineColour`, `WineStyle`, `WsetNoteState` (`src/lib/wset/types.ts`); `LABELS` (`src/lib/wset/vocab.ts`); `emptyNoteState()` (`src/lib/wset/note-state.ts`); `readValue`, `writeValue`, `StorageLike` (`src/lib/safe-storage.ts`).
- Produces (later tasks rely on these exact names):
  - `types.ts`: `Range`, `Named`, `TrainingCandidate`, `MatchExtras`, `CapReason`, `RankedCandidate`, `RankingSnapshot`, `AromaLexicon`, `VintageGuess`, `TrainingDraft`, `PointCategory`, `AttemptRow`, exactly as in the plan header.
  - `copy.ts`: `TRAINING_COPY` with the keys `navLabel`, `previewPill`, `eyebrow`, `title`, `promise`, `coverageEmpty`, `start`, `discard`, `discardArmed`, `footerAction`, `candidatesHeading`, `beforeAnswers`, `nothingFits`, `unlikelyGroup`, `colourDarker`, `colourLighter`, `fitsSoFar`, `capBubbles`, `capNoBubbles`, `capFortified`, `capNotFortified`, `yourCall`, `whichWine`, `somethingElse`, `notInList`, `vintageOptional`, `revealBottle`, `cantFindOut`, `revealEyebrow`, `revealTitle`, `revealRowAction`, `revealPrimary`, `revealEnterHint`, `revealByHandPrimary`, `noPick`, `wherePointed`, `notInPool`, `notRevealed`, `anotherGlass`, `seeNote`, `done`, `markHit`, `markMiss`, `markNotApplicable`, `yourSessions`, `notRevealedShort`, `revealNow`, `showMore`, `noSessions`, `trainingBadge`, `unrevealedBadge`, `unreadableWine`.
  - `copy.ts` also exports `CLOSE_WINDOW` (10), `RESULT_ROW_ORDER: readonly PointCategory[]`, `RESULT_ROW_LABELS: Record<PointCategory, string>`, `resultMark(points: number | null): string`, `SCALE_LABELS: Record<string, string>`, and these functions:
    - `shortName(name: string): string`
    - `coverageLine(countries: readonly { name: string; count: number }[], total: number): string`
    - `stripLine(ranked: readonly RankedCandidate[]): string`
    - `lineageLine(c: TrainingCandidate): string`
    - `resultTotalLine(total: number, possible: number): string`
    - `tallyLine(t: { scored: number; grapeHits: number; appellationHits: number }): string`
    - `shortDate(iso: string, timeZone?: string): string` ("24 Sep")
    - `clockTime(iso: string, timeZone?: string): string` ("20:14")
    - `continueLine(time: string): string`
    - `sheetTitle(time: string): string`
    - `showAllLine(n: number): string`
    - `vintageGuessLabel(v: VintageGuess): string | null`
    - `youSaidLine(pickName: string, vintage: VintageGuess): string`
    - `itWasLine(wine: string | null): string`
    - `attemptRowLine(row: AttemptRow, opts?: { timeZone?: string }): string`
    - `capReasonLine(reason: CapReason, ctx: { noteColour: WineColour | null; candidateColour: WineColour; candidateStyle?: WineStyle }): string`
    - `styleVerdictLine(v: { rank: number; n: number; pct: number | null; capped: CapReason | null } | null, ctx?): string`
    - `hueClearedLine(hue: string, colour: WineColour): string`
    - `scaleLossLine(scale: string, direction: "higher" | "lower"): string`
    - `groupLossLine(group: string): string`
    - `signatureLine(term: string): string`
  - `history-math.ts`: `tally(rows: readonly Pick<AttemptRow, "points" | "total">[]): { scored: number; grapeHits: number; appellationHits: number }`.
  - `safe-storage.ts`: `clearValue(getStorage: () => StorageLike | null, key: string): boolean`.
  - `draft.ts`: `DRAFT_KEY_PREFIX`, `draftKey(userId)`, `newSessionKey()`, `readDraft(userId, getStorage?)`, `writeDraft(d, getStorage?)`, `clearDraft(userId, getStorage?)`, `draftClearedBy(event: { key: string | null; newValue: string | null }, userId): boolean`.
  - Fixtures: `POOL: TrainingCandidate[]` (the 15 live archetypes, then `tannin-free-white` (Austria) and `vintage-port`), `arch(key)`, `tid(group, term)`, `LEXICON: AromaLexicon`.

- [ ] **Step 1: Write the shared types**

Create `src/lib/training/types.ts`:

```ts
// The training room's shared types (spec 2026-09-25-training-room-design.md
// §7.1; plan Interface Contracts). A plain module — no "use server", no React,
// no runtime code — so the server page, the server actions, the pure matcher
// and the client room can all import it. Relative type imports only: vitest
// has no `@/` alias (the imports are erased anyway, but the repo's pure modules
// keep them relative so nobody has to check).
import type { WineColour, WineStyle, WsetNoteState } from "../wset/types";

/** A SAT range on a scale's ladder: [low, high] enum values (spec §4.4). */
export type Range = [string, string];

export type Named = { id: string; name: string };

/** One archetype as the room sees it (spec §4.6): the scoring identity as
    reference FKs with their display names, the SAT ranges and the aromas. */
export type TrainingCandidate = {
  id: string;
  name: string;
  description: string | null;
  colour: WineColour;
  style: WineStyle;
  country: Named;
  region: Named;
  appellation: Named & { isRegional: boolean };
  primaryGrape: Named;
  secondaryGrape: Named | null;
  designations: Named[];
  typicalAge: [number, number] | null;
  sat: Record<string, Range | undefined>;
  aromas: {
    termId: string;
    term: string;
    group: string;
    kind: "NOSE" | "PALATE";
    signature: boolean;
  }[];
  placeCanonicalKey: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
};

/** Facts the form states beside the SAT scales (D19). null = not answered. */
export type MatchExtras = { bubbles: boolean | null; fortified: boolean | null };

export type CapReason = "colour" | "bubbles" | "fortified";

export type RankedCandidate = {
  candidate: TrainingCandidate;
  /** 0..100; null when nothing answered applies to this candidate. */
  closeness: number | null;
  capped: CapReason | null;
  /** Spec §5.7; null before anything answered applies. */
  explanation: string | null;
  /** The exact signature terms the taster picked (every hit, in the
      candidate's aroma order; only the first two earn the bonus). */
  signatureHits: string[];
};

/** The whole ranking, frozen into the attempt at reveal (spec §5.8). */
export type RankingSnapshot = {
  archetypeId: string;
  name: string;
  closeness: number | null;
  rank: number;
  capped: CapReason | null;
}[];

/** wset_aroma_terms by term id → its term and group_name (spec §5.1). */
export type AromaLexicon = Record<string, { term: string; group: string }>;

export type VintageGuess =
  | { kind: "YEAR"; year: number }
  | { kind: "NV" }
  | { kind: "TAWNY"; years: number }
  | null;

/** An unfinished session, kept on the device only (D13). */
export type TrainingDraft = {
  userId: string;
  sessionKey: string;
  startedAt: string;
  note: WsetNoteState;
  extras: MatchExtras;
  pickedArchetypeId: string | null;
  vintage: VintageGuess;
};

export type PointCategory =
  | "country"
  | "region"
  | "appellation"
  | "primaryGrape"
  | "secondaryGrape"
  | "typeDesignation"
  | "vintage";

/** One row of Your sessions (spec §3.6). */
export type AttemptRow = {
  id: string;
  createdAt: string;
  picked: Named | null;
  vintage: VintageGuess;
  actual: { catalogWineId: string; label: string | null; lineage: string | null } | null;
  actualArchetype: Named | null;
  hueCleared: boolean;
  noteColourHue: string | null;
  points: Record<PointCategory, number | null>;
  total: number | null;
  possible: number | null;
  snapshot: RankingSnapshot;
};
```

- [ ] **Step 2: Write the fixtures (the 15 live archetypes + two synthetic)**

Create `src/lib/training/__fixtures__/archetypes.ts`:

```ts
// Test fixtures for the training room's pure modules: the 15 live archetypes
// as they stood on 2026-09-25 (names, colour, style, grapes, sat ranges and
// the nose/palate aroma links with their wset_aroma_terms group_name — read
// read-only from production; the sat data is the seed migrations'
// 20260829222000/…225000 values, the palate lists 20260829228000's), plus two
// synthetic rows the spec's tests call for (§10): a white with no tannin range
// and no aromas, and a Vintage Port (data/training/archetypes-batch-1.json's
// entry). Country/region/appellation names follow spec §4.1's back-fill table.
// Ids are readable stand-ins, not live uuids; a term id is "{group}/{term}".
//
// Signatures: the live rows carry none yet (the column is new, default false).
// Three are flagged HERE ONLY so the bonus has something to hit — Alsace
// Riesling's petrol, Sancerre's gooseberry, Margaux's cedar.
//
// Not a test file (vitest includes *.test.ts only), so it runs nothing itself.
import type { WineColour, WineStyle } from "../../wset/types";
import type { AromaLexicon, Range, TrainingCandidate } from "../types";

/** "{group}/{term}" — the fixture term id. */
export const tid = (group: string, term: string) => `${group}/${term}`;

type Seed = {
  key: string;
  name: string;
  colour: WineColour;
  style: WineStyle;
  country: string;
  region: string;
  appellation: string;
  regional: boolean;
  grapes: [string, string | null];
  sat: Record<string, Range>;
  nose: [string, string][]; // [term, group]
  palate: [string, string][];
  signatures?: string[]; // terms flagged signature (both kinds)
};

const SEEDS: Seed[] = [
  {
    key: "vosne",
    name: "A typical Vosne-Romanée",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Vosne-Romanée AOC",
    regional: false,
    grapes: ["Pinot Noir", null],
    sat: {
      appearanceIntensity: ["MEDIUM", "MEDIUM"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["MEDIUM", "MEDIUM_PLUS"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM", "MEDIUM_PLUS"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["rose", "Floral"], ["violet", "Floral"], ["raspberry", "Red fruit"], ["strawberry", "Red fruit"], ["red cherry", "Red fruit"], ["forest floor", "Red wine"]],
    palate: [["red cherry", "Red fruit"], ["red plum", "Red fruit"], ["earth", "Red wine"], ["mushroom", "Red wine"], ["forest floor", "Red wine"], ["savoury", "Red wine"]],
  },
  {
    key: "chablis",
    name: "A typical Chablis",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Chablis AOC",
    regional: false,
    grapes: ["Chardonnay", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON_GREEN", "LEMON"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "YOUTHFUL"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["grapefruit", "Citrus fruit"], ["lemon", "Citrus fruit"], ["wet stones", "Other"], ["biscuit", "Yeast"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["lime", "Citrus fruit"], ["wet stones", "Other"], ["flint", "Other"]],
  },
  {
    key: "sancerre",
    name: "A typical Sancerre",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Loire",
    appellation: "Sancerre AOC",
    regional: false,
    grapes: ["Sauvignon Blanc", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON_GREEN", "LEMON"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "YOUTHFUL"],
      sweetness: ["DRY", "DRY"],
      acidity: ["HIGH", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM", "MEDIUM_PLUS"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["gooseberry", "Green fruit"], ["grapefruit", "Citrus fruit"], ["lime", "Citrus fruit"], ["grass", "Herbaceous"], ["blackcurrant leaf", "Herbaceous"], ["wet stones", "Other"]],
    palate: [["gooseberry", "Green fruit"], ["grapefruit", "Citrus fruit"], ["lime", "Citrus fruit"], ["wet stones", "Other"], ["flint", "Other"]],
    signatures: ["gooseberry"],
  },
  {
    key: "cdp",
    name: "A typical Châteauneuf-du-Pape",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Rhône",
    appellation: "Châteauneuf-du-Pape AOC",
    regional: false,
    grapes: ["Grenache", "Syrah"],
    sat: {
      appearanceIntensity: ["MEDIUM", "DEEP"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["DEVELOPING", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_MINUS", "MEDIUM"],
      tannin: ["MEDIUM", "MEDIUM_PLUS"],
      alcohol: ["MEDIUM", "HIGH"],
      body: ["MEDIUM_PLUS", "FULL"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["blackberry", "Black fruit"], ["black cherry", "Black fruit"], ["black plum", "Black fruit"], ["dried herbs", "Herbal"], ["black pepper", "Spice"], ["liquorice", "Spice"]],
    palate: [["black cherry", "Black fruit"], ["black plum", "Black fruit"], ["dried herbs", "Herbal"], ["liquorice", "Spice"], ["leather", "Red wine"], ["tar", "Red wine"]],
  },
  {
    key: "cote-rotie",
    name: "A typical Côte-Rôtie",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Rhône",
    appellation: "Côte-Rôtie AOC",
    regional: false,
    grapes: ["Syrah", null],
    sat: {
      appearanceIntensity: ["MEDIUM", "DEEP"],
      colourHue: ["PURPLE", "RUBY"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["MEDIUM_PLUS", "HIGH"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_PLUS", "FULL"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["violet", "Floral"], ["blackberry", "Black fruit"], ["black pepper", "Spice"], ["smoke", "Oak"], ["leather", "Red wine"]],
    palate: [["blackberry", "Black fruit"], ["black pepper", "Spice"], ["smoke", "Oak"], ["leather", "Red wine"], ["game", "Red wine"]],
  },
  {
    key: "margaux",
    name: "A typical Margaux",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Bordeaux",
    appellation: "Margaux AOC",
    regional: false,
    grapes: ["Cabernet Sauvignon", "Merlot"],
    sat: {
      appearanceIntensity: ["MEDIUM", "DEEP"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["MEDIUM_PLUS", "HIGH"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_PLUS", "FULL"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["blackcurrant", "Black fruit"], ["black cherry", "Black fruit"], ["mint", "Herbal"], ["vanilla", "Oak"], ["cedar", "Oak"], ["tobacco", "Red wine"]],
    palate: [["blackcurrant", "Black fruit"], ["black cherry", "Black fruit"], ["cedar", "Oak"], ["leather", "Red wine"], ["tobacco", "Red wine"]],
    signatures: ["cedar"],
  },
  {
    key: "sauternes",
    name: "A typical Sauternes",
    colour: "WHITE",
    style: "SWEET",
    country: "France",
    region: "Bordeaux",
    appellation: "Sauternes AOC",
    regional: false,
    grapes: ["Semillon", "Sauvignon Blanc"],
    sat: {
      appearanceIntensity: ["MEDIUM", "DEEP"],
      colourHue: ["GOLD", "AMBER"],
      noseIntensity: ["PRONOUNCED", "PRONOUNCED"],
      development: ["DEVELOPING", "FULLY_DEVELOPED"],
      sweetness: ["SWEET", "LUSCIOUS"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "HIGH"],
      body: ["FULL", "FULL"],
      flavourIntensity: ["PRONOUNCED", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apricot", "Stone fruit"], ["vanilla", "Oak"], ["orange marmalade", "White wine"], ["ginger", "White wine"], ["honey", "White wine"]],
    palate: [["caramel", "Red wine"], ["dried apricot", "White wine"], ["orange marmalade", "White wine"], ["ginger", "White wine"], ["honey", "White wine"]],
  },
  {
    key: "champagne",
    name: "A typical Champagne",
    colour: "WHITE",
    style: "SPARKLING",
    country: "France",
    region: "Champagne",
    appellation: "Champagne AOC",
    regional: true,
    grapes: ["Chardonnay", "Pinot Noir"],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON_GREEN", "GOLD"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "OFF_DRY"],
      acidity: ["HIGH", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["MEDIUM_PLUS", "LONG"],
      mousse: ["CREAMY", "CREAMY"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["biscuit", "Yeast"], ["bread", "Yeast"], ["brioche", "Yeast"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["toast", "Yeast"], ["brioche", "Yeast"], ["cream", "Malolactic"], ["hazelnut", "White wine"]],
  },
  {
    key: "alsace-riesling",
    name: "A typical Alsace Riesling",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Alsace",
    appellation: "Alsace AOC",
    regional: true,
    grapes: ["Riesling", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON_GREEN", "LEMON"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "OFF_DRY"],
      acidity: ["HIGH", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["lime", "Citrus fruit"], ["apricot", "Stone fruit"], ["petrol", "White wine"], ["honey", "White wine"]],
    palate: [["apple", "Green fruit"], ["lime", "Citrus fruit"], ["peach", "Stone fruit"], ["wet stones", "Other"], ["petrol", "White wine"]],
    signatures: ["petrol"],
  },
  {
    key: "bandol",
    name: "A typical Bandol",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Provence",
    appellation: "Bandol AOC",
    regional: false,
    grapes: ["Mourvèdre", null],
    sat: {
      appearanceIntensity: ["DEEP", "DEEP"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["HIGH", "HIGH"],
      alcohol: ["MEDIUM", "HIGH"],
      body: ["FULL", "FULL"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["blackberry", "Black fruit"], ["black cherry", "Black fruit"], ["dried herbs", "Herbal"], ["black pepper", "Spice"], ["liquorice", "Spice"], ["leather", "Red wine"]],
    palate: [["blackberry", "Black fruit"], ["black cherry", "Black fruit"], ["liquorice", "Spice"], ["leather", "Red wine"], ["game", "Red wine"], ["tar", "Red wine"]],
  },
  {
    key: "petit-chablis",
    name: "A typical Petit Chablis",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Petit Chablis AOC",
    regional: false,
    grapes: ["Chardonnay", null],
    sat: {
      appearanceIntensity: ["PALE", "PALE"],
      colourHue: ["LEMON_GREEN", "LEMON"],
      noseIntensity: ["MEDIUM_MINUS", "MEDIUM"],
      development: ["YOUTHFUL", "YOUTHFUL"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["LIGHT", "MEDIUM_MINUS"],
      flavourIntensity: ["MEDIUM_MINUS", "MEDIUM"],
      finish: ["MEDIUM_MINUS", "MEDIUM"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["grapefruit", "Citrus fruit"], ["lemon", "Citrus fruit"], ["wet stones", "Other"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["lime", "Citrus fruit"], ["wet stones", "Other"]],
  },
  {
    key: "cote-de-nuits",
    name: "A typical Côte de Nuits",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Bourgogne AOC",
    regional: true,
    grapes: ["Pinot Noir", null],
    sat: {
      appearanceIntensity: ["MEDIUM", "MEDIUM"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["MEDIUM", "MEDIUM_PLUS"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM", "MEDIUM_PLUS"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["violet", "Floral"], ["raspberry", "Red fruit"], ["red cherry", "Red fruit"], ["black cherry", "Black fruit"], ["forest floor", "Red wine"]],
    palate: [["red cherry", "Red fruit"], ["black cherry", "Black fruit"], ["earth", "Red wine"], ["mushroom", "Red wine"], ["forest floor", "Red wine"], ["savoury", "Red wine"]],
  },
  {
    key: "cote-de-beaune",
    name: "A typical Côte de Beaune",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Bourgogne AOC",
    regional: true,
    grapes: ["Chardonnay", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON", "GOLD"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM", "MEDIUM_PLUS"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["biscuit", "Yeast"], ["vanilla", "Oak"], ["honey", "White wine"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["toast", "Yeast"], ["butter", "Malolactic"], ["vanilla", "Oak"], ["hazelnut", "White wine"]],
  },
  {
    key: "maconnais",
    name: "A typical Mâconnais",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Macon AOC",
    regional: false,
    grapes: ["Chardonnay", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON", "GOLD"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "YOUTHFUL"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["MEDIUM", "MEDIUM_PLUS"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["apricot", "Stone fruit"], ["honey", "White wine"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["peach", "Stone fruit"], ["melon", "Tropical fruit"], ["hazelnut", "White wine"]],
  },
  {
    key: "cote-chalonnaise",
    name: "A typical Côte Chalonnaise",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Cote Chalonnaise AOC",
    regional: false,
    grapes: ["Pinot Noir", null],
    sat: {
      appearanceIntensity: ["MEDIUM", "MEDIUM"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["MEDIUM", "MEDIUM"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM", "MEDIUM"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["MEDIUM", "MEDIUM_PLUS"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["raspberry", "Red fruit"], ["strawberry", "Red fruit"], ["red cherry", "Red fruit"], ["dried herbs", "Herbal"]],
    palate: [["strawberry", "Red fruit"], ["red cherry", "Red fruit"], ["red plum", "Red fruit"], ["earth", "Red wine"], ["savoury", "Red wine"]],
  },
  // --- synthetic (spec §10) ---------------------------------------------------
  {
    key: "tannin-free-white",
    name: "A typical Tannin-free White",
    colour: "WHITE",
    style: "STILL",
    country: "Austria",
    region: "Niederösterreich",
    appellation: "Niederösterreich",
    regional: true,
    grapes: ["Grüner Veltliner", null],
    sat: {
      sweetness: ["DRY", "DRY"],
      acidity: ["HIGH", "HIGH"],
      body: ["MEDIUM", "MEDIUM"],
    },
    nose: [],
    palate: [],
  },
  {
    key: "vintage-port",
    name: "A typical Vintage Port",
    colour: "RED",
    style: "FORTIFIED",
    country: "Portugal",
    region: "Porto",
    appellation: "Porto DOC",
    regional: false,
    grapes: ["Touriga Nacional", "Touriga Franca"],
    sat: {
      appearanceIntensity: ["DEEP", "DEEP"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["DEVELOPING", "FULLY_DEVELOPED"],
      sweetness: ["MEDIUM_SWEET", "SWEET"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["MEDIUM_PLUS", "HIGH"],
      // FORTIFIED_ALCOHOL_STOPS, for the reference sheet only (D19)
      alcohol: ["MEDIUM_PLUS", "HIGH"],
      body: ["FULL", "FULL"],
      flavourIntensity: ["PRONOUNCED", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
    },
    nose: [["blackberry", "Black fruit"], ["black plum", "Black fruit"], ["violet", "Floral"], ["liquorice", "Spice"], ["cooked blackberry", "Red wine"]],
    palate: [["blackberry", "Black fruit"], ["black plum", "Black fruit"], ["prune", "Red wine"], ["liquorice", "Spice"], ["chocolate", "Oak"]],
  },
];

function toCandidate(s: Seed): TrainingCandidate {
  const sig = new Set(s.signatures ?? []);
  const link = (kind: "NOSE" | "PALATE") => ([term, group]: [string, string]) => ({
    termId: tid(group, term),
    term,
    group,
    kind,
    signature: sig.has(term),
  });
  return {
    id: `arch-${s.key}`,
    name: s.name,
    description: null,
    colour: s.colour,
    style: s.style,
    country: { id: `country-${s.country}`, name: s.country },
    region: { id: `region-${s.region}`, name: s.region },
    appellation: { id: `app-${s.appellation}`, name: s.appellation, isRegional: s.regional },
    primaryGrape: { id: `grape-${s.grapes[0]}`, name: s.grapes[0] },
    secondaryGrape: s.grapes[1] ? { id: `grape-${s.grapes[1]}`, name: s.grapes[1] } : null,
    designations: [],
    typicalAge: null,
    sat: s.sat,
    aromas: [...s.nose.map(link("NOSE")), ...s.palate.map(link("PALATE"))],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  };
}

/** Every fixture candidate: the 15 live archetypes, then the two synthetic. */
export const POOL: TrainingCandidate[] = SEEDS.map(toCandidate);

/** One fixture by its key ("margaux", "vintage-port", …). */
export function arch(key: string): TrainingCandidate {
  const c = POOL.find((p) => p.id === `arch-${key}`);
  if (!c) throw new Error(`no fixture archetype ${key}`);
  return c;
}

// Terms a taster may pick that no fixture archetype links (live
// wset_aroma_terms rows), so group disagreement has something to be.
const EXTRA_TERMS: [string, string][] = [
  ["green bell pepper", "Herbaceous"],
  ["banana", "Tropical fruit"],
  ["coconut", "Oak"],
  ["lavender", "Herbal"],
];

/** term id → { term, group } over every fixture aroma plus EXTRA_TERMS. */
export const LEXICON: AromaLexicon = (() => {
  const out: AromaLexicon = {};
  for (const c of POOL) for (const a of c.aromas) out[a.termId] = { term: a.term, group: a.group };
  for (const [term, group] of EXTRA_TERMS) out[tid(group, term)] = { term, group };
  return out;
})();
```

- [ ] **Step 3: Write the failing copy test**

Create `src/lib/training/copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { arch } from "./__fixtures__/archetypes";
import {
  CLOSE_WINDOW,
  RESULT_ROW_LABELS,
  RESULT_ROW_ORDER,
  TRAINING_COPY,
  capReasonLine,
  clockTime,
  continueLine,
  coverageLine,
  groupLossLine,
  hueClearedLine,
  itWasLine,
  lineageLine,
  resultMark,
  resultTotalLine,
  scaleLossLine,
  sheetTitle,
  shortDate,
  shortName,
  showAllLine,
  signatureLine,
  stripLine,
  styleVerdictLine,
  tallyLine,
  vintageGuessLabel,
  youSaidLine,
} from "./copy";
import type { CapReason, RankedCandidate } from "./types";

// Spec 2026-09-25-training-room-design.md §9: every string verbatim.

function rc(key: string, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: arch(key), closeness, capped, explanation: null, signatureHits: [] };
}

describe("TRAINING_COPY (spec §9, verbatim)", () => {
  it("holds every fixed string", () => {
    expect(TRAINING_COPY).toEqual({
      navLabel: "Training Room",
      previewPill: "Preview",
      eyebrow: "Training room · Preview",
      title: "Taste blind. Then find out.",
      promise:
        "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
      coverageEmpty: "No typical wines yet — the room opens once the first batch lands.",
      start: "Start a session",
      discard: "Discard",
      discardArmed: "Tap again to discard",
      footerAction: "Your call →",
      candidatesHeading: "What it could be",
      beforeAnswers: "Start describing the wine",
      nothingFits: "Nothing fits yet — check colour and bubbles",
      unlikelyGroup: "Unlikely from what you've said",
      colourDarker: "Colour darker than typical",
      colourLighter: "Colour lighter than typical",
      fitsSoFar: "Fits what you've said so far",
      capBubbles: "Bubbles noted",
      capNoBubbles: "No bubbles noted",
      capFortified: "Fortified",
      capNotFortified: "Not fortified",
      yourCall: "Your call",
      whichWine: "Which wine is it?",
      somethingElse: "Something else…",
      notInList: "It's not in the list",
      vintageOptional: "Vintage (optional)",
      revealBottle: "Reveal the bottle",
      cantFindOut: "I can't find out",
      revealEyebrow: "Reveal the bottle",
      revealTitle: "Which bottle was it?",
      revealRowAction: "This is it",
      revealPrimary: "This is it",
      revealEnterHint: "↵ reveals the first hit",
      revealByHandPrimary: "This is it",
      noPick: "You didn't pick a wine",
      wherePointed: "Where your note pointed",
      notInPool: "This style isn't in the pool yet",
      notRevealed: "Not revealed — your note is kept. Reveal now from Your sessions.",
      anotherGlass: "Another glass",
      seeNote: "See the note",
      done: "Done",
      markHit: "✓",
      markMiss: "✗",
      markNotApplicable: "—",
      yourSessions: "Your sessions",
      notRevealedShort: "Not revealed",
      revealNow: "Reveal now",
      showMore: "Show more",
      noSessions: "No sessions yet",
      trainingBadge: "Training",
      unrevealedBadge: "Training room · not revealed",
      unreadableWine: "a wine you can't see yet",
    });
  });

  it("fills the templated lines", () => {
    expect(continueLine("20:14")).toBe("Continue your session · started 20:14");
    expect(sheetTitle("20:14")).toBe("Unknown wine · started 20:14");
    expect(showAllLine(17)).toBe("Show all 17");
    expect(itWasLine("Château Talbot 2016")).toBe("It was Château Talbot 2016");
    expect(itWasLine(null)).toBe("It was a wine you can't see yet");
    expect(resultTotalLine(14, 22)).toBe("14 of 22");
    expect(scaleLossLine("tannin", "higher")).toBe("Tannin higher than typical");
    expect(scaleLossLine("flavourIntensity", "lower")).toBe("Flavour intensity lower than typical");
    expect(scaleLossLine("colourHue", "higher")).toBe("Colour darker than typical");
    expect(scaleLossLine("colourHue", "lower")).toBe("Colour lighter than typical");
    expect(groupLossLine("Black fruit")).toBe("Black fruit isn't typical");
    expect(signatureLine("petrol")).toBe("✓ petrol — a signature");
  });

  it("labels the seven result rows in order and marks them", () => {
    expect(RESULT_ROW_ORDER.map((c) => RESULT_ROW_LABELS[c])).toEqual([
      "Country",
      "Region",
      "Appellation",
      "Grape",
      "Second grape",
      "Designation",
      "Vintage",
    ]);
    expect(resultMark(8)).toBe("✓");
    expect(resultMark(1)).toBe("✓"); // vintage off by one year
    expect(resultMark(0)).toBe("✗");
    expect(resultMark(null)).toBe("—");
  });
});

describe("shortName", () => {
  it("strips a leading 'A typical ' in any case", () => {
    expect(shortName("A typical Pauillac")).toBe("Pauillac");
    expect(shortName("a Typical Côte de Beaune (red)")).toBe("Côte de Beaune (red)");
  });
  it("leaves any other name alone", () => {
    expect(shortName("Pauillac")).toBe("Pauillac");
    expect(shortName("Typical Pauillac")).toBe("Typical Pauillac");
    expect(shortName("Not a typical Pauillac")).toBe("Not a typical Pauillac");
  });
});

describe("coverageLine", () => {
  it("0 countries: the empty-pool sentence", () => {
    expect(coverageLine([], 0)).toBe("No typical wines yet — the room opens once the first batch lands.");
  });
  it("1 country", () => {
    expect(coverageLine([{ name: "France", count: 15 }], 15)).toBe(
      "15 typical wines so far — France. More each week.",
    );
    expect(coverageLine([{ name: "France", count: 1 }], 1)).toBe("1 typical wine so far — France. More each week.");
  });
  it("4 countries: all named, by count then name, no 'and more'", () => {
    expect(
      coverageLine(
        [
          { name: "Spain", count: 4 },
          { name: "France", count: 20 },
          { name: "Italy", count: 4 },
          { name: "Germany", count: 2 },
        ],
        30,
      ),
    ).toBe("30 typical wines so far — France, Italy, Spain and Germany. More each week.");
  });
  it("6 countries: four named and 'and more'", () => {
    expect(
      coverageLine(
        [
          { name: "Portugal", count: 3 },
          { name: "France", count: 36 },
          { name: "Austria", count: 3 },
          { name: "Italy", count: 16 },
          { name: "Germany", count: 7 },
          { name: "Spain", count: 11 },
        ],
        76,
      ),
    ).toBe("76 typical wines so far — France, Italy, Spain, Germany and more. More each week.");
  });
});

describe("stripLine", () => {
  it("uses a 10-point window", () => {
    expect(CLOSE_WINDOW).toBe(10);
  });
  it("leader plus the other uncapped candidates within 10 points", () => {
    // 91 − 85 = 6 and 91 − 81 = 10 count; 91 − 80 = 11 and the capped one do not.
    const ranked = [
      rc("margaux", 91),
      rc("cote-rotie", 85),
      rc("bandol", 81),
      rc("cdp", 80),
      rc("chablis", 15, "colour"),
    ];
    expect(stripLine(ranked)).toBe("Top match: Margaux 91 % · 2 more close");
  });
  it("k = 1", () => {
    expect(stripLine([rc("margaux", 91), rc("bandol", 81), rc("cdp", 70)])).toBe(
      "Top match: Margaux 91 % · 1 more close",
    );
  });
  it("k = 0: just the leader", () => {
    expect(stripLine([rc("margaux", 20), rc("chablis", 15, "colour")])).toBe("Top match: Margaux 20 %");
  });
  it("a leader with no number: the pre-answer hint", () => {
    expect(stripLine([rc("margaux", null), rc("bandol", null)])).toBe("Start describing the wine");
    expect(stripLine([])).toBe("Start describing the wine");
  });
  it("every candidate capped", () => {
    expect(stripLine([rc("chablis", 15, "colour"), rc("margaux", null, "bubbles")])).toBe(
      "Nothing fits yet — check colour and bubbles",
    );
  });
});

describe("lineageLine", () => {
  it("a specific appellation: appellation · region, country · grapes", () => {
    expect(lineageLine(arch("margaux"))).toBe("Margaux AOC · Bordeaux, France · Cabernet Sauvignon, Merlot");
    expect(lineageLine(arch("chablis"))).toBe("Chablis AOC · Bourgogne, France · Chardonnay");
  });
  it("a regional appellation drops itself", () => {
    expect(lineageLine(arch("cote-de-nuits"))).toBe("Bourgogne, France · Pinot Noir");
    expect(lineageLine(arch("champagne"))).toBe("Champagne, France · Chardonnay, Pinot Noir");
  });
});

describe("tallyLine", () => {
  it("n of m right on the grape · k on the appellation", () => {
    expect(tallyLine({ scored: 9, grapeHits: 6, appellationHits: 4 })).toBe(
      "6 of 9 right on the grape · 4 on the appellation",
    );
  });
  it("is empty before anything is scored", () => {
    expect(tallyLine({ scored: 0, grapeHits: 0, appellationHits: 0 })).toBe("");
  });
});

describe("vintage and 'You said'", () => {
  it("words a guess as the guess ladder does", () => {
    expect(vintageGuessLabel(null)).toBeNull();
    expect(vintageGuessLabel({ kind: "YEAR", year: 2016 })).toBe("2016");
    expect(vintageGuessLabel({ kind: "NV" })).toBe("NV");
    expect(vintageGuessLabel({ kind: "TAWNY", years: 20 })).toBe("20 years tawny");
  });
  it("You said {shortName}{, vintage}", () => {
    expect(youSaidLine("A typical Pauillac", null)).toBe("You said Pauillac");
    expect(youSaidLine("A typical Pauillac", { kind: "YEAR", year: 2016 })).toBe("You said Pauillac, 2016");
    expect(youSaidLine("A typical Champagne", { kind: "NV" })).toBe("You said Champagne, NV");
  });
});

describe("cap reasons", () => {
  it("colour names both colours, with the right article", () => {
    expect(capReasonLine("colour", { noteColour: "RED", candidateColour: "WHITE" })).toBe(
      "Looks like a red wine, not a white",
    );
    expect(capReasonLine("colour", { noteColour: "WHITE", candidateColour: "ROSE" })).toBe(
      "Looks like a white wine, not a rosé",
    );
    expect(capReasonLine("colour", { noteColour: "RED", candidateColour: "ORANGE" })).toBe(
      "Looks like a red wine, not an orange",
    );
    // BROWN names no colour (it caps only a rosé).
    expect(capReasonLine("colour", { noteColour: null, candidateColour: "ROSE" })).toBe(
      "Looks like a white or red wine, not a rosé",
    );
  });
  it("bubbles and fortification read the direction from the candidate's style", () => {
    expect(capReasonLine("bubbles", { noteColour: null, candidateColour: "RED", candidateStyle: "STILL" })).toBe(
      "Bubbles noted",
    );
    expect(
      capReasonLine("bubbles", { noteColour: null, candidateColour: "WHITE", candidateStyle: "SPARKLING" }),
    ).toBe("No bubbles noted");
    expect(capReasonLine("fortified", { noteColour: null, candidateColour: "RED", candidateStyle: "STILL" })).toBe(
      "Fortified",
    );
    expect(
      capReasonLine("fortified", { noteColour: null, candidateColour: "RED", candidateStyle: "FORTIFIED" }),
    ).toBe("Not fortified");
  });
});

describe("styleVerdictLine", () => {
  it("rank of n at pct", () => {
    expect(styleVerdictLine({ rank: 2, n: 17, pct: 92, capped: null })).toBe("Its style was your #2 of 17 at 92 %");
    expect(styleVerdictLine({ rank: 9, n: 17, pct: null, capped: null })).toBe("Its style was your #9 of 17");
  });
  it("ruled out, with the reason", () => {
    expect(
      styleVerdictLine(
        { rank: 16, n: 17, pct: 15, capped: "colour" },
        { noteColour: "RED", candidateColour: "WHITE", candidateStyle: "STILL" },
      ),
    ).toBe("You had ruled its style out (Looks like a red wine, not a white)");
    expect(styleVerdictLine({ rank: 16, n: 17, pct: 15, capped: "bubbles" })).toBe(
      "You had ruled its style out (bubbles)",
    );
  });
  it("not in the pool", () => {
    expect(styleVerdictLine(null)).toBe("This style isn't in the pool yet");
  });
});

describe("hueClearedLine", () => {
  it("names the hue as the sheet words it and the wine's colour", () => {
    expect(hueClearedLine("RUBY", "WHITE")).toBe("Your colour call (ruby) didn't fit — it was a white wine.");
    expect(hueClearedLine("LEMON_GREEN", "ORANGE")).toBe(
      "Your colour call (lemon-green) didn't fit — it was an orange wine.",
    );
  });
});

describe("dates", () => {
  it("24 Sep and 20:14 in the given zone", () => {
    expect(shortDate("2026-09-24T18:14:00.000Z", "UTC")).toBe("24 Sep");
    expect(clockTime("2026-09-24T18:14:00.000Z", "UTC")).toBe("18:14");
    expect(clockTime("2026-09-24T18:14:00.000Z", "Europe/Copenhagen")).toBe("20:14");
    // Just before midnight UTC is the next day in Copenhagen.
    expect(shortDate("2026-09-24T23:30:00.000Z", "Europe/Copenhagen")).toBe("25 Sep");
    expect(clockTime("2026-01-05T07:05:00.000Z", "UTC")).toBe("07:05");
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/copy.test.ts`
Expected: FAIL. `Failed to resolve import "./copy" from "src/lib/training/copy.test.ts"` (the module does not exist yet).

- [ ] **Step 5: Write `copy.ts`**

Create `src/lib/training/copy.ts`:

```ts
// Every string the training room shows (spec 2026-09-25-training-room-design.md
// §9, English only — D20), and the pure helpers that fill its templates. Pure:
// relative imports only, no React, no DB, no browser globals, so vitest loads it.
import type { WineColour, WineStyle } from "../wset/types";
import { LABELS } from "../wset/vocab";
import type {
  AttemptRow,
  CapReason,
  PointCategory,
  RankedCandidate,
  TrainingCandidate,
  VintageGuess,
} from "./types";

/** The strip's "more close" window: other uncapped candidates within this many
    points of the leader (spec §9, strip). */
export const CLOSE_WINDOW = 10;

/** The fixed strings, verbatim from spec §9. Templated lines are functions below. */
export const TRAINING_COPY = {
  // nav label / pill
  navLabel: "Training Room",
  previewPill: "Preview",
  // landing
  eyebrow: "Training room · Preview",
  title: "Taste blind. Then find out.",
  promise:
    "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
  coverageEmpty: "No typical wines yet — the room opens once the first batch lands.",
  start: "Start a session",
  discard: "Discard",
  discardArmed: "Tap again to discard",
  // session
  footerAction: "Your call →",
  candidatesHeading: "What it could be",
  beforeAnswers: "Start describing the wine",
  nothingFits: "Nothing fits yet — check colour and bubbles",
  unlikelyGroup: "Unlikely from what you've said",
  // explanation lines without a template
  colourDarker: "Colour darker than typical",
  colourLighter: "Colour lighter than typical",
  fitsSoFar: "Fits what you've said so far",
  // cap reasons without a template
  capBubbles: "Bubbles noted",
  capNoBubbles: "No bubbles noted",
  capFortified: "Fortified",
  capNotFortified: "Not fortified",
  // your call
  yourCall: "Your call",
  whichWine: "Which wine is it?",
  somethingElse: "Something else…",
  notInList: "It's not in the list",
  vintageOptional: "Vintage (optional)",
  revealBottle: "Reveal the bottle",
  cantFindOut: "I can't find out",
  // reveal sheet (the add-wine note matrix, reveal variant)
  revealEyebrow: "Reveal the bottle",
  revealTitle: "Which bottle was it?",
  revealRowAction: "This is it",
  revealPrimary: "This is it",
  revealEnterHint: "↵ reveals the first hit",
  revealByHandPrimary: "This is it",
  // result
  noPick: "You didn't pick a wine",
  wherePointed: "Where your note pointed",
  notInPool: "This style isn't in the pool yet",
  notRevealed: "Not revealed — your note is kept. Reveal now from Your sessions.",
  anotherGlass: "Another glass",
  seeNote: "See the note",
  done: "Done",
  // result rows' marks
  markHit: "✓",
  markMiss: "✗",
  markNotApplicable: "—",
  // history
  yourSessions: "Your sessions",
  notRevealedShort: "Not revealed",
  revealNow: "Reveal now",
  showMore: "Show more",
  noSessions: "No sessions yet",
  // badges
  trainingBadge: "Training",
  unrevealedBadge: "Training room · not revealed",
  // unreadable / gone wine
  unreadableWine: "a wine you can't see yet",
} as const;

/** The result table's seven rows, in order (spec §3.5, §9 "result rows"). */
export const RESULT_ROW_ORDER: readonly PointCategory[] = [
  "country",
  "region",
  "appellation",
  "primaryGrape",
  "secondaryGrape",
  "typeDesignation",
  "vintage",
];

export const RESULT_ROW_LABELS: Record<PointCategory, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primaryGrape: "Grape",
  secondaryGrape: "Second grape",
  typeDesignation: "Designation",
  vintage: "Vintage",
};

/** ✓ when the category earned points, ✗ when it applied and earned none, — when
    it did not apply (null). */
export function resultMark(points: number | null): string {
  if (points === null) return TRAINING_COPY.markNotApplicable;
  return points > 0 ? TRAINING_COPY.markHit : TRAINING_COPY.markMiss;
}

/** The "{Scale}" word of an explanation line, per matched sat key (the admin
    editor's row labels). colourHue has its own darker/lighter lines. */
export const SCALE_LABELS: Record<string, string> = {
  appearanceIntensity: "Appearance intensity",
  colourHue: "Colour",
  noseIntensity: "Nose intensity",
  development: "Development",
  sweetness: "Sweetness",
  acidity: "Acidity",
  tannin: "Tannin",
  alcohol: "Alcohol",
  body: "Body",
  mousse: "Mousse",
  flavourIntensity: "Flavour intensity",
  finish: "Finish",
};

/** Strips a leading "A typical " (any case); otherwise the name unchanged. */
export function shortName(name: string): string {
  const m = /^a typical /i.exec(name);
  return m ? name.slice(m[0].length) : name;
}

// "France" · "France and Italy" · "France, Italy and Spain"
function listAll(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The landing's coverage line (spec §3.2, §9). Countries by count desc, then
 * name; four named and "and more" when there are five or more; fewer than
 * five all named, no "and more"; one country "{n} typical wines so far — {c1}.
 * More each week."; an empty pool its own sentence (the room hides Start).
 */
export function coverageLine(
  countries: readonly { name: string; count: number }[],
  total: number,
): string {
  if (total <= 0 || countries.length === 0) return TRAINING_COPY.coverageEmpty;
  const sorted = [...countries].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"),
  );
  const names = sorted.map((c) => c.name);
  const head = `${total} typical ${total === 1 ? "wine" : "wines"} so far — `;
  if (names.length >= 5) return `${head}${names.slice(0, 4).join(", ")} and more. More each week.`;
  return `${head}${listAll(names)}. More each week.`;
}

/**
 * The phone strip under the sheet's bar (spec §3.3, §9). `ranked` is
 * rankCandidates' output, already in §5.8 order (uncapped numbered first).
 */
export function stripLine(ranked: readonly RankedCandidate[]): string {
  if (ranked.length === 0) return TRAINING_COPY.beforeAnswers;
  const leader = ranked.find((r) => r.capped === null);
  if (!leader) return TRAINING_COPY.nothingFits;
  if (leader.closeness === null) return TRAINING_COPY.beforeAnswers;
  const top = leader.closeness;
  const k = ranked.filter(
    (r) =>
      r !== leader &&
      r.capped === null &&
      r.closeness !== null &&
      top - r.closeness <= CLOSE_WINDOW,
  ).length;
  const head = `Top match: ${shortName(leader.candidate.name)} ${top} %`;
  return k === 0 ? head : `${head} · ${k} more close`;
}

/** "{Appellation} · {Region}, {Country} · {grapes}"; a regional appellation
    drops its own part: "{Region}, {Country} · {grapes}" (D11, §9). */
export function lineageLine(c: TrainingCandidate): string {
  const grapes = [c.primaryGrape.name, c.secondaryGrape?.name]
    .filter((g): g is string => Boolean(g))
    .join(", ");
  const place = `${c.region.name}, ${c.country.name}`;
  const origin = c.appellation.isRegional ? place : `${c.appellation.name} · ${place}`;
  return `${origin} · ${grapes}`;
}

/** "{n} of {m}" */
export function resultTotalLine(total: number, possible: number): string {
  return `${total} of ${possible}`;
}

/**
 * "{n} of {m} right on the grape · {k} on the appellation" — n grape hits, m
 * scored attempts, k appellation hits. Empty when nothing has been scored yet:
 * the history then hides the line (and shows "No sessions yet" only when it
 * has no rows at all).
 */
export function tallyLine(t: { scored: number; grapeHits: number; appellationHits: number }): string {
  if (t.scored === 0) return "";
  return `${t.grapeHits} of ${t.scored} right on the grape · ${t.appellationHits} on the appellation`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(iso: string, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: Number(get("month")), hour: get("hour"), minute: get("minute") };
}

/** "24 Sep" in the viewer's zone (or `timeZone`). A fixed month table, not
    Intl's short month, which reads "Sept" under en-GB. */
export function shortDate(iso: string, timeZone?: string): string {
  const p = dateParts(iso, timeZone);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "20:14" in the viewer's zone (or `timeZone`). */
export function clockTime(iso: string, timeZone?: string): string {
  const p = dateParts(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "Continue your session · started {time}" */
export function continueLine(time: string): string {
  return `Continue your session · started ${time}`;
}

/** "Unknown wine · started {time}" — the session sheet's title. */
export function sheetTitle(time: string): string {
  return `Unknown wine · started ${time}`;
}

/** "Show all {n}" */
export function showAllLine(n: number): string {
  return `Show all ${n}`;
}

/** The guessed vintage as the guess ladder words it: "2016", "NV",
    "20 years tawny"; null when no vintage was guessed. */
export function vintageGuessLabel(v: VintageGuess): string | null {
  if (v === null) return null;
  if (v.kind === "YEAR") return String(v.year);
  if (v.kind === "NV") return "NV";
  return `${v.years} years tawny`;
}

/** "You said {shortName}{, vintage}" */
export function youSaidLine(pickName: string, vintage: VintageGuess): string {
  const v = vintageGuessLabel(vintage);
  return `You said ${shortName(pickName)}${v ? `, ${v}` : ""}`;
}

/** "It was {wine}"; an unreadable wine reads "a wine you can't see yet". */
export function itWasLine(wine: string | null): string {
  return `It was ${wine ?? TRAINING_COPY.unreadableWine}`;
}

/**
 * One history row's text (spec §3.6, §9 "history"):
 * "24 Sep · You said Pauillac · It was Saint-Julien · 14 of 22",
 * "24 Sep · You didn't pick a wine · It was … · 0 of 22",
 * "24 Sep · You said Pauillac · Not revealed". An unrevealed row's
 * "Reveal now" is a button the list renders after this text
 * (TRAINING_COPY.revealNow), so it is not part of the string.
 */
export function attemptRowLine(row: AttemptRow, opts?: { timeZone?: string }): string {
  const parts = [shortDate(row.createdAt, opts?.timeZone)];
  parts.push(row.picked ? `You said ${shortName(row.picked.name)}` : TRAINING_COPY.noPick);
  if (row.actual === null) {
    parts.push(TRAINING_COPY.notRevealedShort);
  } else {
    parts.push(itWasLine(row.actual.label));
    if (row.total !== null && row.possible !== null) {
      parts.push(resultTotalLine(row.total, row.possible));
    }
  }
  return parts.join(" · ");
}

const COLOUR_WORDS: Record<WineColour, string> = {
  WHITE: "white",
  ROSE: "rosé",
  RED: "red",
  ORANGE: "orange",
};

// "a white" · "an orange"
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

/**
 * A capped candidate's reason (spec §5.6, §9 "cap reasons"). Colour:
 * "Looks like a {note colour} wine, not a {candidate colour}" — the note's
 * colour is `colourFromHue(note.colourHue)`; null only for BROWN, which caps
 * only a rosé, so it reads "a white or red wine". Bubbles and fortification
 * read the direction from the candidate's style: a sparkling candidate is
 * capped because the note said no bubbles, a fortified one because the note
 * said not fortified; without `candidateStyle` the still/unfortified side is
 * assumed.
 */
export function capReasonLine(
  reason: CapReason,
  ctx: { noteColour: WineColour | null; candidateColour: WineColour; candidateStyle?: WineStyle },
): string {
  if (reason === "colour") {
    const said = ctx.noteColour ? COLOUR_WORDS[ctx.noteColour] : "white or red";
    return `Looks like ${withArticle(said)} wine, not ${withArticle(COLOUR_WORDS[ctx.candidateColour])}`;
  }
  if (reason === "bubbles") {
    return ctx.candidateStyle === "SPARKLING" ? TRAINING_COPY.capNoBubbles : TRAINING_COPY.capBubbles;
  }
  return ctx.candidateStyle === "FORTIFIED" ? TRAINING_COPY.capNotFortified : TRAINING_COPY.capFortified;
}

const CAP_WORDS: Record<CapReason, string> = {
  colour: "colour",
  bubbles: "bubbles",
  fortified: "fortification",
};

/**
 * The result's style verdict (spec §3.5, D17). `v` is the real wine's style
 * looked up in the frozen snapshot (null: not in the pool). A capped style
 * names its reason through capReasonLine when `ctx` is given, else one word.
 * A style with no percentage drops "at {pct} %".
 */
export function styleVerdictLine(
  v: { rank: number; n: number; pct: number | null; capped: CapReason | null } | null,
  ctx?: { noteColour: WineColour | null; candidateColour: WineColour; candidateStyle?: WineStyle },
): string {
  if (v === null) return TRAINING_COPY.notInPool;
  if (v.capped !== null) {
    const reason = ctx ? capReasonLine(v.capped, ctx) : CAP_WORDS[v.capped];
    return `You had ruled its style out (${reason})`;
  }
  const at = v.pct === null ? "" : ` at ${v.pct} %`;
  return `Its style was your #${v.rank} of ${v.n}${at}`;
}

/** "Your colour call ({hue}) didn't fit — it was a {colour} wine." */
export function hueClearedLine(hue: string, colour: WineColour): string {
  const word = LABELS[hue] ?? hue.toLowerCase();
  return `Your colour call (${word}) didn't fit — it was ${withArticle(COLOUR_WORDS[colour])} wine.`;
}

/** "{Scale} higher than typical" / "lower"; colour reads darker / lighter
    (the hue ladders run light → dark). */
export function scaleLossLine(scale: string, direction: "higher" | "lower"): string {
  if (scale === "colourHue") {
    return direction === "higher" ? TRAINING_COPY.colourDarker : TRAINING_COPY.colourLighter;
  }
  return `${SCALE_LABELS[scale] ?? scale} ${direction} than typical`;
}

/** "{Group} isn't typical" */
export function groupLossLine(group: string): string {
  return `${group} isn't typical`;
}

/** "✓ {term} — a signature" */
export function signatureLine(term: string): string {
  return `✓ ${term} — a signature`;
}
```

- [ ] **Step 6: Run the copy test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/copy.test.ts`
Expected: PASS, 1 file, **28 tests**. If the two `dates` assertions for `Europe/Copenhagen` fail, the Node build lacks full ICU. Node 24's official builds ship it, so check `node -p "Intl.DateTimeFormat().resolvedOptions().timeZone"` before changing any code.

- [ ] **Step 7: Write the failing history test**

Create `src/lib/training/history-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TRAINING_COPY, attemptRowLine } from "./copy";
import { tally } from "./history-math";
import type { AttemptRow, PointCategory } from "./types";

// Your sessions (spec §3.6): the tally line's counts and every row's text.

const NO_POINTS: Record<PointCategory, number | null> = {
  country: null,
  region: null,
  appellation: null,
  primaryGrape: null,
  secondaryGrape: null,
  typeDesignation: null,
  vintage: null,
};

function row(patch: Partial<AttemptRow>): AttemptRow {
  return {
    id: "attempt-1",
    createdAt: "2026-09-24T18:14:00.000Z",
    picked: { id: "arch-pauillac", name: "A typical Pauillac" },
    vintage: null,
    actual: null,
    actualArchetype: null,
    hueCleared: false,
    noteColourHue: null,
    points: NO_POINTS,
    total: null,
    possible: null,
    snapshot: [],
    ...patch,
  };
}

const scored = (primaryGrape: number, appellation: number | null, total: number) =>
  row({
    actual: { catalogWineId: "wine-1", label: "Château Talbot 2016", lineage: null },
    points: { ...NO_POINTS, country: 2, region: 3, appellation, primaryGrape, secondaryGrape: 0 },
    total,
    possible: 22,
  });

describe("tally", () => {
  it("counts scored attempts only, and grape/appellation hits among them", () => {
    const rows = [
      scored(8, 5, 18), // grape ✓ appellation ✓
      scored(8, 0, 13), // grape ✓
      scored(0, 5, 10), // appellation ✓
      scored(0, 0, 5), // neither
      row({}), // unrevealed: not scored
      row({ picked: null }), // unrevealed, no pick
    ];
    expect(tally(rows)).toEqual({ scored: 4, grapeHits: 2, appellationHits: 2 });
  });

  it("an appellation that did not apply (null) is not a hit", () => {
    expect(tally([scored(8, null, 13)])).toEqual({ scored: 1, grapeHits: 1, appellationHits: 0 });
  });

  it("nothing yet", () => {
    expect(tally([])).toEqual({ scored: 0, grapeHits: 0, appellationHits: 0 });
    expect(tally([row({})])).toEqual({ scored: 0, grapeHits: 0, appellationHits: 0 });
  });
});

describe("attemptRowLine", () => {
  const utc = { timeZone: "UTC" };

  it("a pick, revealed and scored", () => {
    expect(attemptRowLine(scored(8, 0, 14), utc)).toBe(
      "24 Sep · You said Pauillac · It was Château Talbot 2016 · 14 of 22",
    );
  });

  it("no pick, revealed", () => {
    const r = { ...scored(0, 0, 0), picked: null };
    expect(attemptRowLine(r, utc)).toBe("24 Sep · You didn't pick a wine · It was Château Talbot 2016 · 0 of 22");
  });

  it("a wine the viewer cannot read", () => {
    const r = scored(8, 5, 18);
    r.actual = { catalogWineId: "wine-1", label: null, lineage: null };
    expect(attemptRowLine(r, utc)).toBe("24 Sep · You said Pauillac · It was a wine you can't see yet · 18 of 22");
  });

  it("not revealed: the list adds the Reveal now button after it", () => {
    expect(attemptRowLine(row({}), utc)).toBe("24 Sep · You said Pauillac · Not revealed");
    expect(attemptRowLine(row({ picked: null }), utc)).toBe("24 Sep · You didn't pick a wine · Not revealed");
    expect(TRAINING_COPY.revealNow).toBe("Reveal now");
  });
});
```

- [ ] **Step 8: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/history-math.test.ts`
Expected: FAIL. `Failed to resolve import "./history-math"`.

- [ ] **Step 9: Write `history-math.ts`**

Create `src/lib/training/history-math.ts`:

```ts
// The history's tally (spec §3.6): over every attempt the viewer has, the
// scored ones, how many named the right grape (primary_grape_points > 0) and
// how many the right appellation (appellation_points > 0). Pure: relative
// imports only.
import type { AttemptRow } from "./types";

export function tally(rows: readonly Pick<AttemptRow, "points" | "total">[]): {
  scored: number;
  grapeHits: number;
  appellationHits: number;
} {
  let scored = 0;
  let grapeHits = 0;
  let appellationHits = 0;
  for (const r of rows) {
    if (r.total === null) continue; // not revealed yet: not scored
    scored += 1;
    if ((r.points.primaryGrape ?? 0) > 0) grapeHits += 1;
    if ((r.points.appellation ?? 0) > 0) appellationHits += 1;
  }
  return { scored, grapeHits, appellationHits };
}
```

- [ ] **Step 10: Run it and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/history-math.test.ts`
Expected: PASS, **7 tests**.

- [ ] **Step 11: Write the failing `clearValue` test**

In `src/lib/safe-storage.test.ts`, replace line 2:

```ts
import { clearFlag, readFlag, readValue, writeFlag, writeValue } from "./safe-storage";
```

with:

```ts
import { clearFlag, clearValue, readFlag, readValue, writeFlag, writeValue } from "./safe-storage";
```

and append after the last line (line 139, the closing `});` of "safe-storage: clearing a flag"):

```ts
// clearValue exists for the training room's device draft (spec
// 2026-09-25-training-room-design.md D13): Discard and a finished session
// remove the stored JSON rather than leave a stale value behind.
describe("safe-storage: clearing a value", () => {
  it("removes a value it wrote, and only that key", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    writeValue(() => storage, "a", "{\"x\":1}");
    writeValue(() => storage, "b", "keep");
    expect(clearValue(() => storage, "a")).toBe(true);
    expect(readValue(() => storage, "a")).toBeNull();
    expect([...store.keys()]).toEqual(["b"]);
  });

  it("overwrites with an empty string when the storage has no removeItem", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeValue(() => storage, "a", "{\"x\":1}");
    expect(clearValue(() => storage, "a")).toBe(true);
    expect(readValue(() => storage, "a")).toBe("");
  });

  it("is false, not a throw, when storage is missing or blocked", () => {
    expect(clearValue(() => null, "a")).toBe(false);
    expect(clearValue(() => { throw new Error("SecurityError"); }, "a")).toBe(false);
    const hostile = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => { throw new Error("SecurityError"); },
    };
    expect(clearValue(() => hostile, "a")).toBe(false);
  });
});
```

- [ ] **Step 12: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/safe-storage.test.ts`
Expected: FAIL. The 3 new tests fail with a TypeError saying `clearValue` is not a function, and the 12 existing tests pass.

- [ ] **Step 13: Add `clearValue`**

Append to `src/lib/safe-storage.ts`, after its last line (line 90, the closing `}` of `writeValue`):

```ts
/**
 * Removes a stored value. False when there is no storage or the removal
 * throws. Overwrites with "" when the storage has no `removeItem`; a caller
 * that parses the value (the training room's draft) treats "" as nothing
 * stored, the same as null.
 */
export function clearValue(getStorage: () => StorageLike | null, key: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    if (storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, "");
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 14: Run it and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/safe-storage.test.ts`
Expected: PASS, **15 tests**.

- [ ] **Step 15: Write the failing draft test**

Create `src/lib/training/draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import {
  DRAFT_KEY_PREFIX,
  clearDraft,
  draftClearedBy,
  draftKey,
  newSessionKey,
  readDraft,
  writeDraft,
} from "./draft";
import type { TrainingDraft } from "./types";

// The device draft (spec D13): one JSON value per user, never on the server.

function fakeStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return { store, get: () => storage };
}

const USER = "11111111-2222-4333-8444-555555555555";

function draft(patch: Partial<TrainingDraft> = {}): TrainingDraft {
  return {
    userId: USER,
    sessionKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
    startedAt: "2026-09-24T18:14:00.000Z",
    note: { ...emptyNoteState(), tannin: "HIGH", noseTermIds: ["t1"] },
    extras: { bubbles: false, fortified: null },
    pickedArchetypeId: "arch-margaux",
    vintage: { kind: "YEAR", year: 2016 },
    ...patch,
  };
}

describe("draftKey", () => {
  it("is blindr-training-draft:<userId>", () => {
    expect(DRAFT_KEY_PREFIX).toBe("blindr-training-draft:");
    expect(draftKey(USER)).toBe(`blindr-training-draft:${USER}`);
  });
});

describe("write, read, clear", () => {
  it("round-trips a draft", () => {
    const s = fakeStorage();
    expect(writeDraft(draft(), s.get)).toBe(true);
    expect(readDraft(USER, s.get)).toEqual(draft());
  });

  it("keeps NV, tawny and no vintage, and no pick", () => {
    const s = fakeStorage();
    for (const vintage of [{ kind: "NV" } as const, { kind: "TAWNY", years: 20 } as const, null]) {
      writeDraft(draft({ vintage, pickedArchetypeId: null }), s.get);
      expect(readDraft(USER, s.get)?.vintage).toEqual(vintage);
      expect(readDraft(USER, s.get)?.pickedArchetypeId).toBeNull();
    }
  });

  it("clears only this user's draft", () => {
    const s = fakeStorage();
    writeDraft(draft(), s.get);
    writeDraft(draft({ userId: "other" }), s.get);
    expect(clearDraft(USER, s.get)).toBe(true);
    expect(readDraft(USER, s.get)).toBeNull();
    expect([...s.store.keys()]).toEqual(["blindr-training-draft:other"]);
  });

  it("reads null when there is no draft or no storage", () => {
    expect(readDraft(USER, fakeStorage().get)).toBeNull();
    expect(readDraft(USER, () => null)).toBeNull();
    expect(readDraft(USER, () => { throw new Error("SecurityError"); })).toBeNull();
    expect(writeDraft(draft(), () => null)).toBe(false);
  });

  it("fills a note saved by an older build from the empty note", () => {
    const s = fakeStorage();
    const old = draft();
    const olderNote: Record<string, unknown> = { ...old.note };
    delete olderNote.mousse;
    delete olderNote.tanninNature;
    s.get().setItem(draftKey(USER), JSON.stringify({ ...old, note: olderNote }));
    const read = readDraft(USER, s.get);
    expect(read?.note.mousse).toBeNull();
    expect(read?.note.tanninNature).toEqual([]);
    expect(read?.note.tannin).toBe("HIGH");
  });

  it("refuses a malformed draft", () => {
    const s = fakeStorage();
    const put = (v: unknown) => s.get().setItem(draftKey(USER), typeof v === "string" ? v : JSON.stringify(v));
    const bad: unknown[] = [
      "not json",
      "",
      "null",
      draft({ userId: "someone-else" }),
      draft({ sessionKey: "not-a-uuid" }),
      draft({ startedAt: "yesterday" }),
      { ...draft(), note: null },
      { ...draft(), note: { ...draft().note, noseTermIds: "t1" } },
      { ...draft(), extras: { bubbles: "yes", fortified: null } },
      { ...draft(), pickedArchetypeId: 42 },
      { ...draft(), vintage: { kind: "YEAR" } },
      { ...draft(), vintage: { kind: "MAGNUM" } },
    ];
    for (const v of bad) {
      put(v);
      expect(readDraft(USER, s.get)).toBeNull();
    }
  });
});

describe("newSessionKey", () => {
  it("mints a v4 uuid, different each time", () => {
    const a = newSessionKey();
    const b = newSessionKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("draftClearedBy (the storage listener)", () => {
  it("is true when another tab removed this user's draft or cleared storage", () => {
    expect(draftClearedBy({ key: draftKey(USER), newValue: null }, USER)).toBe(true);
    expect(draftClearedBy({ key: draftKey(USER), newValue: "" }, USER)).toBe(true);
    expect(draftClearedBy({ key: null, newValue: null }, USER)).toBe(true);
  });
  it("is false for a write to the draft or another key", () => {
    expect(draftClearedBy({ key: draftKey(USER), newValue: "{}" }, USER)).toBe(false);
    expect(draftClearedBy({ key: draftKey("other"), newValue: null }, USER)).toBe(false);
    expect(draftClearedBy({ key: "blindr-theme", newValue: null }, USER)).toBe(false);
  });
});
```

- [ ] **Step 16: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/draft.test.ts`
Expected: FAIL. `Failed to resolve import "./draft"`.

- [ ] **Step 17: Write `draft.ts`**

Create `src/lib/training/draft.ts`:

```ts
// The unfinished training session, kept on the device only (spec
// 2026-09-25-training-room-design.md D13, §7.2): nothing is on the server
// before the reveal. One JSON value per user under
// `blindr-training-draft:<userId>`, read and written through safe-storage's
// try/catch, so a blocked or full store means "no draft" / "not saved", never
// a crash. Every function takes an optional storage getter (default: the
// browser's localStorage) so vitest can pass a fake; no browser global is
// touched at module level.
import { clearValue, readValue, writeValue, type StorageLike } from "../safe-storage";
import { emptyNoteState } from "../wset/note-state";
import type { MatchExtras, TrainingDraft, VintageGuess } from "./types";

export const DRAFT_KEY_PREFIX = "blindr-training-draft:";

export function draftKey(userId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}`;
}

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A fresh session key (training_attempts.session_key, a uuid): v4 from
    crypto.getRandomValues, which — unlike randomUUID — needs no secure context. */
export function newSessionKey(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isTriState(v: unknown): v is boolean | null {
  return v === null || v === true || v === false;
}

function isExtras(v: unknown): v is MatchExtras {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return isTriState(e.bubbles) && isTriState(e.fortified);
}

function isVintage(v: unknown): v is VintageGuess {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  const g = v as Record<string, unknown>;
  if (g.kind === "NV") return true;
  if (g.kind === "YEAR") return Number.isInteger(g.year);
  if (g.kind === "TAWNY") return Number.isInteger(g.years);
  return false;
}

const NOTE_ARRAYS = ["observations", "faults", "tanninNature", "noseTermIds", "palateTermIds"] as const;

/**
 * This user's draft, or null when there is none, it cannot be read, it is not
 * valid JSON, or its shape is wrong (a draft from another user, a bad session
 * key or timestamp, a malformed pick, extras or vintage). A note saved by an
 * older build is filled up from `emptyNoteState()`, so a field added later
 * starts unrated rather than undefined.
 */
export function readDraft(
  userId: string,
  getStorage: () => StorageLike | null = browserStorage,
): TrainingDraft | null {
  const raw = readValue(getStorage, draftKey(userId));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const d = parsed as Record<string, unknown>;
  if (d.userId !== userId) return null;
  if (typeof d.sessionKey !== "string" || !UUID_RE.test(d.sessionKey)) return null;
  if (typeof d.startedAt !== "string" || Number.isNaN(Date.parse(d.startedAt))) return null;
  if (typeof d.note !== "object" || d.note === null) return null;
  const note = { ...emptyNoteState(), ...(d.note as object) };
  for (const k of NOTE_ARRAYS) if (!Array.isArray(note[k])) return null;
  if (!isExtras(d.extras)) return null;
  if (d.pickedArchetypeId !== null && typeof d.pickedArchetypeId !== "string") return null;
  if (!isVintage(d.vintage)) return null;
  return {
    userId,
    sessionKey: d.sessionKey,
    startedAt: d.startedAt,
    note,
    extras: { bubbles: d.extras.bubbles, fortified: d.extras.fortified },
    pickedArchetypeId: d.pickedArchetypeId,
    vintage: d.vintage,
  };
}

/** Stores the draft under its user's key. False when it could not be saved. */
export function writeDraft(
  d: TrainingDraft,
  getStorage: () => StorageLike | null = browserStorage,
): boolean {
  return writeValue(getStorage, draftKey(d.userId), JSON.stringify(d));
}

/** Removes this user's draft (Discard, a finished session). */
export function clearDraft(
  userId: string,
  getStorage: () => StorageLike | null = browserStorage,
): boolean {
  return clearValue(getStorage, draftKey(userId));
}

/**
 * Did this `storage` event clear the user's draft in another tab? True for
 * that key removed (or emptied) and for `localStorage.clear()` (key null);
 * the room then returns to the landing (spec §7.2).
 */
export function draftClearedBy(
  event: { key: string | null; newValue: string | null },
  userId: string,
): boolean {
  if (event.key === null) return true;
  return event.key === draftKey(userId) && !event.newValue;
}
```

- [ ] **Step 18: Run the task's tests**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training src/lib/safe-storage.test.ts`
Expected: PASS, 4 files: copy 28, history-math 7, draft 10, safe-storage 15, so **60 tests**.

- [ ] **Step 19: Type-check and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx tsc --noEmit && npx eslint src/lib/training src/lib/safe-storage.ts src/lib/safe-storage.test.ts`
Expected: tsc exits 0 with no output, and eslint prints nothing.

- [ ] **Step 20: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/types.ts src/lib/training/__fixtures__/archetypes.ts src/lib/training/copy.ts src/lib/training/copy.test.ts src/lib/training/history-math.ts src/lib/training/history-math.test.ts src/lib/training/draft.ts src/lib/training/draft.test.ts src/lib/safe-storage.ts src/lib/safe-storage.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): types, copy, history tally and the device draft" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The matcher

**Files:**
- Create: `src/lib/training/match.ts`
- Test: `src/lib/training/match.test.ts`

**Interfaces:**
- Consumes (from Task 2): the types in `src/lib/training/types.ts`; from `src/lib/training/copy.ts`: `TRAINING_COPY.fitsSoFar`, `capReasonLine`, `groupLossLine`, `scaleLossLine`, `shortName`, `signatureLine`; the fixtures `POOL`, `arch`, `tid`, `LEXICON`. From the repo: `ALCOHOL_STOPS`, `BODY_STOPS`, `DEVELOPMENT_STOPS`, `FINISH_STOPS`, `HUES_BY_COLOUR`, `INTENSITY_STOPS`, `LEVEL_STOPS`, `colourFromHue` (`src/lib/wset/vocab.ts`), and `emptyNoteState` (tests only).
- Produces (Tasks 9, 10, 11 rely on these):
  - `rankCandidates(note: WsetNoteState, extras: MatchExtras, pool: TrainingCandidate[], lexicon: AromaLexicon): RankedCandidate[]`, in §5.8 order. Every candidate is kept.
  - `snapshotRanking(ranked: RankedCandidate[]): RankingSnapshot`, the whole list with 1-based `rank`.
  - `explain(input: { candidate; closeness; capped; signatureHits; losses; aromaLoss; noteColour? }): string | null`
  - `ladderFor(scale: string, candidate: TrainingCandidate): string[] | null`
  - `stepScore(d: number): number`
  - `WEIGHTS`, `CAP_MAX = 15`, `SIGNATURE_BONUS = 1`, `SIGNATURE_MAX_HITS = 2`, `EXPLAIN_THRESHOLD = 0.3`, `MATCHED_SCALES`, `MatchedScale`.
- Rules this file implements (spec §5, read before editing):
  - Answered scales that the candidate carries are scored on their ladder.
  - A scale is skipped, leaving both the numerator and the denominator, when any of these holds: the candidate has no range for it; the answer or a range bound is off the ladder (this includes a hue off the candidate colour's row); it is alcohol and either side is fortified; it is mousse on a candidate that is not sparkling.
  - The aroma term counts only when the taster picked a term the lexicon knows and the candidate has aroma links.
  - The signature bonus is added to the numerator only (never the denominator). At most two hits count, and the result is capped at 100.
  - `null` closeness when the denominator is 0.
  - A capped closeness becomes `min(c, 15)`, and a null closeness stays null.

- [ ] **Step 1: Write the failing matcher test**

Create `src/lib/training/match.test.ts` (every expected number has its arithmetic in the comment beside it):

```ts
import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import type { WsetNoteState } from "../wset/types";
import { LEXICON, POOL, arch, tid } from "./__fixtures__/archetypes";
import {
  CAP_MAX,
  WEIGHTS,
  explain,
  ladderFor,
  rankCandidates,
  snapshotRanking,
  stepScore,
} from "./match";
import type { MatchExtras, RankedCandidate, TrainingCandidate } from "./types";

// The training room's matcher (spec 2026-09-25-training-room-design.md §5).
// Every expected closeness below is worked by hand in the comment beside it:
// closeness = min(100, round(100 · (Σ wᵢ·s(dᵢ) + 2·a + bonus) / (Σ wᵢ + 2·[aromas]))).

const NONE: MatchExtras = { bubbles: null, fortified: null };

function note(partial: Partial<WsetNoteState>): WsetNoteState {
  return { ...emptyNoteState(), ...partial };
}

function rank(
  n: Partial<WsetNoteState>,
  extras: MatchExtras = NONE,
  pool: TrainingCandidate[] = POOL,
): RankedCandidate[] {
  return rankCandidates(note(n), extras, pool, LEXICON);
}

function get(ranked: RankedCandidate[], key: string): RankedCandidate {
  const r = ranked.find((x) => x.candidate.id === `arch-${key}`);
  if (!r) throw new Error(`no ranked ${key}`);
  return r;
}

/** A fixture with some fields replaced (a new id so it never collides). */
function variant(key: string, patch: Partial<TrainingCandidate>, id = `${key}-variant`): TrainingCandidate {
  return { ...arch(key), ...patch, id: `arch-${id}` };
}

describe("stepScore and the constants", () => {
  it("scores in range 1.0, one step 0.6, two 0.2, further 0", () => {
    expect(stepScore(0)).toBe(1);
    expect(stepScore(1)).toBe(0.6);
    expect(stepScore(2)).toBe(0.2);
    expect(stepScore(3)).toBe(0);
    expect(stepScore(6)).toBe(0);
  });

  it("carries the plan header's weights and cap", () => {
    expect(WEIGHTS).toEqual({
      sweetness: 1.5,
      tannin: 1.5,
      acidity: 1.5,
      body: 1.2,
      alcohol: 1.0,
      colourHue: 1.0,
      mousse: 1.0,
      noseIntensity: 0.8,
      flavourIntensity: 0.8,
      finish: 0.8,
      development: 0.6,
      appearanceIntensity: 0.6,
      aromas: 2.0,
    });
    expect(CAP_MAX).toBe(15);
  });
});

describe("ladderFor", () => {
  it("uses the full enum order, not the slider's stops", () => {
    expect(ladderFor("appearanceIntensity", arch("margaux"))).toEqual([
      "PALE",
      "MEDIUM_MINUS",
      "MEDIUM",
      "MEDIUM_PLUS",
      "DEEP",
    ]);
    expect(ladderFor("sweetness", arch("margaux"))).toEqual([
      "DRY",
      "OFF_DRY",
      "MEDIUM_DRY",
      "MEDIUM",
      "MEDIUM_SWEET",
      "SWEET",
      "LUSCIOUS",
    ]);
    expect(ladderFor("tannin", arch("margaux"))).toEqual(["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"]);
    expect(ladderFor("development", arch("margaux"))).toEqual([
      "YOUTHFUL",
      "DEVELOPING",
      "FULLY_DEVELOPED",
      "TIRED_PAST_BEST",
    ]);
  });

  it("takes hue from the candidate's colour row", () => {
    expect(ladderFor("colourHue", arch("margaux"))).toEqual(["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"]);
    expect(ladderFor("colourHue", arch("chablis"))).toEqual(["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"]);
  });

  it("measures unfortified alcohol on three stops and never a fortified one", () => {
    expect(ladderFor("alcohol", arch("margaux"))).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(ladderFor("alcohol", arch("vintage-port"))).toBeNull();
  });

  it("matches mousse on sparkling only, and never clarity", () => {
    expect(ladderFor("mousse", arch("champagne"))).toEqual(["DELICATE", "CREAMY", "AGGRESSIVE"]);
    expect(ladderFor("mousse", arch("margaux"))).toBeNull();
    expect(ladderFor("clarity", arch("margaux"))).toBeNull();
  });
});

describe("distance on a single scale", () => {
  // Margaux tannin [MEDIUM_PLUS, HIGH]; only tannin answered, so
  // closeness = 100 · 1.5·s / 1.5 = 100·s.
  it("in range scores 100", () => {
    expect(get(rank({ tannin: "HIGH" }), "margaux").closeness).toBe(100);
  });
  it("one step below scores 60", () => {
    expect(get(rank({ tannin: "MEDIUM" }), "margaux").closeness).toBe(60);
  });
  it("two steps below scores 20", () => {
    expect(get(rank({ tannin: "MEDIUM_MINUS" }), "margaux").closeness).toBe(20);
  });
  it("three steps below scores 0", () => {
    expect(get(rank({ tannin: "LOW" }), "margaux").closeness).toBe(0);
  });

  it("places a bound the slider cannot produce on the full ladder", () => {
    // Appearance [MEDIUM_PLUS, DEEP] (spec §4.4's example): DEEP 1.0, MEDIUM
    // one step below MEDIUM_PLUS 0.6, PALE three steps below 0.
    const c = variant("margaux", { sat: { appearanceIntensity: ["MEDIUM_PLUS", "DEEP"] } });
    expect(get(rank({ appearanceIntensity: "DEEP" }, NONE, [c]), "margaux-variant").closeness).toBe(100);
    expect(get(rank({ appearanceIntensity: "MEDIUM" }, NONE, [c]), "margaux-variant").closeness).toBe(60);
    expect(get(rank({ appearanceIntensity: "PALE" }, NONE, [c]), "margaux-variant").closeness).toBe(0);
  });

  it("measures sweetness across the enum's MEDIUM the slider skips", () => {
    // Vintage Port sweetness [MEDIUM_SWEET, SWEET]: MEDIUM_DRY is index 2,
    // MEDIUM_SWEET index 4 → d = 2 → 0.2 → 20.
    expect(get(rank({ sweetness: "MEDIUM_DRY" }), "vintage-port").closeness).toBe(20);
  });

  it("measures unfortified alcohol on three stops: medium → high is one step", () => {
    // Margaux alcohol [MEDIUM, MEDIUM]; HIGH is one step on LOW/MEDIUM/HIGH → 60.
    expect(get(rank({ alcohol: "HIGH" }), "margaux").closeness).toBe(60);
  });
});

describe("skipped scales", () => {
  it("skips a scale the candidate does not carry (a white with no tannin range)", () => {
    // tannin HIGH + acidity HIGH.
    const r = rank({ tannin: "HIGH", acidity: "HIGH" });
    // Tannin-free white: tannin skipped; acidity [HIGH, HIGH] in range → 1.5/1.5 = 100.
    expect(get(r, "tannin-free-white").closeness).toBe(100);
    // Chablis: acidity [MEDIUM_PLUS, HIGH] 1.5·1 + tannin [LOW, LOW] d4 1.5·0
    // = 1.5 / 3.0 = 0.5 → 50.
    expect(get(r, "chablis").closeness).toBe(50);
  });

  it("skips a scale whose range bound is off its ladder", () => {
    // acidity ["EXTREME", "HIGH"] is not on the level ladder → skipped; only
    // body counts: [MEDIUM_MINUS, MEDIUM] holds MEDIUM → 1.2/1.2 = 100 (with
    // acidity LOW counted it would have been (0 + 1.2) / 2.7 = 44).
    const c = variant("chablis", { sat: { ...arch("chablis").sat, acidity: ["EXTREME", "HIGH"] } });
    expect(get(rank({ acidity: "LOW", body: "MEDIUM" }, NONE, [c]), "chablis-variant").closeness).toBe(100);
  });

  it("skips an answer that is not on the candidate's ladder", () => {
    // MEDIUM_PLUS is not an unfortified alcohol stop; only tannin counts.
    expect(get(rank({ alcohol: "MEDIUM_PLUS", tannin: "HIGH" }), "margaux").closeness).toBe(100);
  });

  it("skips mousse on a still candidate", () => {
    const r = rank({ mousse: "CREAMY" });
    expect(get(r, "champagne").closeness).toBe(100);
    expect(get(r, "margaux").closeness).toBeNull();
  });

  it("gives null with nothing answered, and with only scales the candidate lacks", () => {
    for (const r of rank({})) expect(r.closeness).toBeNull();
    // Only tannin answered: the tannin-free white carries no tannin → null.
    expect(get(rank({ tannin: "HIGH" }), "tannin-free-white").closeness).toBeNull();
  });

  it("ignores clarity, quality, price and readiness (D18)", () => {
    const r = rank({ clarity: "HAZY", qualityScore: 95, priceCategory: "PREMIUM", readiness: "TOO_OLD" });
    for (const x of r) expect(x.closeness).toBeNull();
  });
});

describe("weights", () => {
  it("weighs each scale by §5.3", () => {
    // Margaux: tannin MEDIUM d1 → 1.5·0.6 = 0.9; finish LONG in range → 0.8;
    // appearance PALE vs [MEDIUM, DEEP] on the full ladder d2 → 0.6·0.2 = 0.12.
    // (0.9 + 0.8 + 0.12) / (1.5 + 0.8 + 0.6) = 1.82 / 2.9 = 0.6276 → 63.
    expect(
      get(rank({ tannin: "MEDIUM", finish: "LONG", appearanceIntensity: "PALE" }), "margaux").closeness,
    ).toBe(63);
  });
});

describe("aromas", () => {
  it("credits the share of the taster's groups the archetype carries", () => {
    // Margaux groups {Black fruit, Herbal, Oak, Red wine}. Picked blackberry
    // (Black fruit), vanilla (Oak), grass (Herbaceous): a = 2/3.
    // 2·(2/3) / 2 = 0.667 → 67 (no signature picked: cedar is Margaux's).
    const r = rank({
      noseTermIds: [tid("Black fruit", "blackberry"), tid("Oak", "vanilla")],
      palateTermIds: [tid("Herbaceous", "grass")],
    });
    expect(get(r, "margaux").closeness).toBe(67);
  });

  it("counts a term picked on nose and palate once", () => {
    const t = tid("Black fruit", "blackberry");
    const r = rank({ noseTermIds: [t, tid("Herbaceous", "grass")], palateTermIds: [t] });
    // groups {Black fruit, Herbaceous}; Margaux carries one → a = 1/2 → 50.
    expect(get(r, "margaux").closeness).toBe(50);
  });

  it("skips the aroma term for a candidate with no aromas", () => {
    // acidity HIGH + blackberry.
    const r = rank({ acidity: "HIGH", noseTermIds: [tid("Black fruit", "blackberry")] });
    // Tannin-free white has no aroma links: acidity alone → 100.
    expect(get(r, "tannin-free-white").closeness).toBe(100);
    // Chablis: acidity 1.5 + aromas 2·0 (no Black fruit) = 1.5 / 3.5 = 0.4286 → 43.
    expect(get(r, "chablis").closeness).toBe(43);
  });

  it("ignores a picked term the lexicon does not know", () => {
    const r = rank({ noseTermIds: ["not-a-term"] });
    for (const x of r) expect(x.closeness).toBeNull();
  });
});

describe("signature bonus", () => {
  const riesling = {
    acidity: "HIGH" as const,
    tannin: "MEDIUM" as const,
    noseTermIds: [tid("White wine", "petrol"), tid("Citrus fruit", "lime"), tid("Tropical fruit", "banana")],
  };

  it("adds a full scale's share per hit", () => {
    // Alsace Riesling: acidity [HIGH, HIGH] 1.5·1 = 1.5; tannin MEDIUM vs
    // [LOW, LOW] d2 1.5·0.2 = 0.3; groups {White wine, Citrus fruit, Tropical
    // fruit} vs {Green fruit, Citrus fruit, Stone fruit, White wine, Other}
    // a = 2/3 → 2·(2/3) = 1.333. den = 1.5 + 1.5 + 2 = 5.
    // base = 3.1333 / 5 = 62.67; petrol is a signature → + 100·1/5 = 20
    // → round(82.67) = 83.
    const r = get(rank(riesling), "alsace-riesling");
    expect(r.closeness).toBe(83);
    expect(r.signatureHits).toEqual(["petrol"]);
  });

  it("never lowers anyone: the same note without the flag scores the base", () => {
    const plain = variant("alsace-riesling", {
      aromas: arch("alsace-riesling").aromas.map((a) => ({ ...a, signature: false })),
    });
    // 62.67 → 63 without the bonus; 83 with it.
    const r = get(rank(riesling, NONE, [plain]), "alsace-riesling-variant");
    expect(r.closeness).toBe(63);
    expect(r.signatureHits).toEqual([]);
  });

  it("a missed signature costs nothing", () => {
    // acidity HIGH + lime, no petrol: flagged and unflagged score the same.
    // acidity 1.5 + aromas 2·1 (Citrus fruit is Riesling's) = 3.5 / 3.5 → 100;
    // add tannin MEDIUM (0.3 of 1.5) so it is not at the ceiling:
    // (1.5 + 0.3 + 2) / 5 = 0.76 → 76 either way.
    const n = { acidity: "HIGH" as const, tannin: "MEDIUM" as const, noseTermIds: [tid("Citrus fruit", "lime")] };
    const plain = variant("alsace-riesling", {
      aromas: arch("alsace-riesling").aromas.map((a) => ({ ...a, signature: false })),
    });
    expect(get(rank(n), "alsace-riesling").closeness).toBe(76);
    expect(get(rank(n, NONE, [plain]), "alsace-riesling-variant").closeness).toBe(76);
  });

  it("counts at most two hits", () => {
    // Sancerre with three signatures (gooseberry, grass, blackcurrant leaf).
    const three = variant("sancerre", {
      aromas: arch("sancerre").aromas.map((a) => ({
        ...a,
        signature: ["gooseberry", "grass", "blackcurrant leaf"].includes(a.term),
      })),
    });
    // acidity LOW vs [HIGH, HIGH] d4 → 0; body FULL vs [MEDIUM_MINUS, MEDIUM]
    // d2 → 1.2·0.2 = 0.24; tannin HIGH vs [LOW, LOW] d4 → 0; sweetness LUSCIOUS
    // vs [DRY, DRY] d6 → 0; groups {Green fruit, Herbaceous} both Sancerre's
    // → a = 1 → 2. den = 1.5 + 1.2 + 1.5 + 1.5 + 2 = 7.7; num = 2.24.
    // base 29.09; two hits count → + 200/7.7 = 25.97 → round(55.06) = 55
    // (all three would have given 68).
    const r = get(
      rank(
        {
          acidity: "LOW",
          body: "FULL",
          tannin: "HIGH",
          sweetness: "LUSCIOUS",
          noseTermIds: [
            tid("Green fruit", "gooseberry"),
            tid("Herbaceous", "grass"),
            tid("Herbaceous", "blackcurrant leaf"),
          ],
        },
        NONE,
        [three],
      ),
      "sancerre-variant",
    );
    expect(r.closeness).toBe(55);
    expect(r.signatureHits).toEqual(["gooseberry", "grass", "blackcurrant leaf"]);
  });

  it("caps closeness at 100", () => {
    // acidity HIGH 1.5 + petrol (White wine) a = 1 → 2: 3.5 / 3.5 = 100;
    // + 100/3.5 = 28.6 → 128.6 → capped at 100.
    const r = get(rank({ acidity: "HIGH", noseTermIds: [tid("White wine", "petrol")] }), "alsace-riesling");
    expect(r.closeness).toBe(100);
  });
});

describe("caps (tri-state)", () => {
  it("null extras and no hue never cap", () => {
    for (const r of rank({ tannin: "HIGH" })) expect(r.capped).toBeNull();
  });

  it("bubbles: yes caps non-sparkling, no caps sparkling", () => {
    const yes = rank({}, { bubbles: true, fortified: null });
    expect(get(yes, "champagne").capped).toBeNull();
    expect(get(yes, "margaux").capped).toBe("bubbles");
    const no = rank({}, { bubbles: false, fortified: null });
    expect(get(no, "champagne").capped).toBe("bubbles");
    expect(get(no, "margaux").capped).toBeNull();
  });

  it("fortified: yes caps unfortified, no caps fortified", () => {
    const yes = rank({}, { bubbles: null, fortified: true });
    expect(get(yes, "vintage-port").capped).toBeNull();
    expect(get(yes, "margaux").capped).toBe("fortified");
    const no = rank({}, { bubbles: null, fortified: false });
    expect(get(no, "vintage-port").capped).toBe("fortified");
    expect(get(no, "margaux").capped).toBeNull();
  });

  it("colour: a hue off the candidate's colour row caps it", () => {
    const r = rank({ colourHue: "RUBY" });
    expect(get(r, "chablis").capped).toBe("colour");
    expect(get(r, "margaux").capped).toBeNull();
  });

  it("an ORANGE candidate is uncapped on GOLD; a red one is capped", () => {
    const orange = variant("tannin-free-white", { colour: "ORANGE" }, "orange");
    const r = rank({ colourHue: "GOLD" }, NONE, [orange, arch("margaux")]);
    expect(get(r, "orange").capped).toBeNull();
    expect(get(r, "margaux").capped).toBe("colour");
  });

  it("BROWN fits white and red, not rosé", () => {
    const rose = variant("tannin-free-white", { colour: "ROSE" }, "rose");
    const r = rank({ colourHue: "BROWN" }, NONE, [arch("chablis"), arch("margaux"), rose]);
    expect(get(r, "chablis").capped).toBeNull();
    expect(get(r, "margaux").capped).toBeNull();
    expect(get(r, "rose").capped).toBe("colour");
  });

  it("caps a number at 15 and keeps a null null", () => {
    // Chablis on RUBY + acidity HIGH: hue skipped (off the white row), acidity
    // in range → 100 → capped at 15.
    expect(get(rank({ colourHue: "RUBY", acidity: "HIGH" }), "chablis").closeness).toBe(15);
    // bubbles only: Margaux capped with nothing answered that applies → null.
    const m = get(rank({}, { bubbles: true, fortified: null }), "margaux");
    expect(m.capped).toBe("bubbles");
    expect(m.closeness).toBeNull();
  });

  it("a capped candidate never outranks an uncapped numbered one", () => {
    // RUBY + tannin LOW: Chablis tannin [LOW, LOW] in range → 100 → capped 15
    // (RUBY is off the white row, so hue is skipped for it). Margaux, uncapped:
    // hue RUBY in [RUBY, GARNET] 1.0 + tannin LOW vs [MEDIUM_PLUS, HIGH] d3 0
    // → 1.0 / 2.5 = 0.4 → 40.
    const r = rank({ colourHue: "RUBY", tannin: "LOW" });
    const ids = r.map((x) => x.candidate.id);
    expect(get(r, "margaux").closeness).toBe(40);
    expect(get(r, "chablis").closeness).toBe(15);
    expect(ids.indexOf("arch-margaux")).toBeLessThan(ids.indexOf("arch-chablis"));
    const firstCapped = r.findIndex((x) => x.capped !== null);
    expect(r.slice(firstCapped).every((x) => x.capped !== null)).toBe(true);
  });
});

describe("fortification skips alcohol both ways (D19)", () => {
  it("a fortified candidate never scores alcohol", () => {
    // Port: alcohol LOW skipped; sweetness SWEET in [MEDIUM_SWEET, SWEET] → 100.
    expect(get(rank({ alcohol: "LOW", sweetness: "SWEET" }), "vintage-port").closeness).toBe(100);
  });

  it("a note that says fortified skips alcohol on every candidate", () => {
    // Margaux, fortified true: alcohol HIGH skipped, tannin HIGH in range →
    // 100 → capped (not fortified) at 15.
    const yes = get(rank({ alcohol: "HIGH", tannin: "HIGH" }, { bubbles: null, fortified: true }), "margaux");
    expect(yes.capped).toBe("fortified");
    expect(yes.closeness).toBe(15);
    // fortified false: alcohol HIGH vs [MEDIUM, MEDIUM] d1 → 0.6; tannin 1.5
    // → (1.5 + 0.6) / 2.5 = 0.84 → 84.
    const no = get(rank({ alcohol: "HIGH", tannin: "HIGH" }, { bubbles: null, fortified: false }), "margaux");
    expect(no.capped).toBeNull();
    expect(no.closeness).toBe(84);
  });
});

describe("explanations (§5.7)", () => {
  it("is null before anything that applies is answered", () => {
    for (const r of rank({})) expect(r.explanation).toBeNull();
  });

  it("explains every cap", () => {
    expect(get(rank({ colourHue: "RUBY" }), "chablis").explanation).toBe("Looks like a red wine, not a white");
    expect(get(rank({}, { bubbles: true, fortified: null }), "margaux").explanation).toBe("Bubbles noted");
    expect(get(rank({}, { bubbles: false, fortified: null }), "champagne").explanation).toBe("No bubbles noted");
    expect(get(rank({}, { bubbles: null, fortified: true }), "margaux").explanation).toBe("Fortified");
    expect(get(rank({}, { bubbles: null, fortified: false }), "vintage-port").explanation).toBe("Not fortified");
    const rose = variant("tannin-free-white", { colour: "ROSE" }, "rose");
    expect(get(rank({ colourHue: "BROWN" }, NONE, [rose]), "rose").explanation).toBe(
      "Looks like a white or red wine, not a rosé",
    );
    const orange = variant("tannin-free-white", { colour: "ORANGE" }, "orange");
    expect(get(rank({ colourHue: "RUBY" }, NONE, [orange]), "orange").explanation).toBe(
      "Looks like a red wine, not an orange",
    );
  });

  it("names the largest scale loss and its direction", () => {
    // Riesling note above: tannin loss 1.5·(1 − 0.2) = 1.2 beats aromas 2·(1/3) = 0.67.
    const r = rank({
      acidity: "HIGH",
      tannin: "MEDIUM",
      noseTermIds: [tid("White wine", "petrol"), tid("Citrus fruit", "lime"), tid("Tropical fruit", "banana")],
    });
    expect(get(r, "alsace-riesling").explanation).toBe("Tannin higher than typical");
    expect(get(rank({ tannin: "LOW" }), "margaux").explanation).toBe("Tannin lower than typical");
  });

  it("words hue as darker or lighter", () => {
    // Margaux [RUBY, GARNET] on the red row: BROWN d2 (loss 0.8) → darker;
    // PURPLE d1 (loss 0.4) → lighter.
    expect(get(rank({ colourHue: "BROWN" }), "margaux").explanation).toBe("Colour darker than typical");
    expect(get(rank({ colourHue: "PURPLE" }), "margaux").explanation).toBe("Colour lighter than typical");
  });

  it("names the taster's missing group with the most picked terms", () => {
    // Margaux: grass + green bell pepper (Herbaceous ×2), banana (Tropical
    // fruit ×1), blackcurrant (Black fruit, Margaux's): a = 1/3, loss 1.33.
    const r = rank({
      noseTermIds: [
        tid("Herbaceous", "grass"),
        tid("Herbaceous", "green bell pepper"),
        tid("Tropical fruit", "banana"),
        tid("Black fruit", "blackcurrant"),
      ],
    });
    expect(get(r, "margaux").explanation).toBe("Herbaceous isn't typical");
  });

  it("below 0.3: a signature hit, else 'Fits what you've said so far'", () => {
    // acidity HIGH + petrol on Riesling: no loss at all, petrol hit.
    expect(
      get(rank({ acidity: "HIGH", noseTermIds: [tid("White wine", "petrol")] }), "alsace-riesling").explanation,
    ).toBe("✓ petrol — a signature");
    expect(get(rank({ tannin: "HIGH" }), "margaux").explanation).toBe("Fits what you've said so far");
    // development FULLY_DEVELOPED vs [YOUTHFUL, DEVELOPING]: d1, loss
    // 0.6·0.4 = 0.24 < 0.3 → still "fits" (closeness 0.36/0.6 = 60).
    const dev = get(rank({ development: "FULLY_DEVELOPED" }), "margaux");
    expect(dev.closeness).toBe(60);
    expect(dev.explanation).toBe("Fits what you've said so far");
    // nose PRONOUNCED vs [MEDIUM, MEDIUM_PLUS]: d1, loss 0.8·0.4 = 0.32 ≥ 0.3.
    expect(get(rank({ noseIntensity: "PRONOUNCED" }), "margaux").explanation).toBe(
      "Nose intensity higher than typical",
    );
  });

  it("explain() is pure over its inputs", () => {
    const c = arch("margaux");
    expect(
      explain({ candidate: c, closeness: null, capped: null, signatureHits: [], losses: [], aromaLoss: null }),
    ).toBeNull();
    expect(
      explain({
        candidate: c,
        closeness: 40,
        capped: null,
        signatureHits: ["cedar"],
        losses: [{ scale: "body", loss: 0.96, direction: "lower" }],
        aromaLoss: { loss: 1.0, group: "Tropical fruit" },
      }),
    ).toBe("Tropical fruit isn't typical");
    // A tie goes to the scale seen first.
    expect(
      explain({
        candidate: c,
        closeness: 40,
        capped: null,
        signatureHits: [],
        losses: [
          { scale: "acidity", loss: 0.6, direction: "higher" },
          { scale: "tannin", loss: 0.6, direction: "lower" },
        ],
        aromaLoss: null,
      }),
    ).toBe("Acidity higher than typical");
    expect(
      explain({
        candidate: c,
        closeness: 90,
        capped: null,
        signatureHits: ["cedar"],
        losses: [{ scale: "body", loss: 0.24, direction: "lower" }],
        aromaLoss: null,
      }),
    ).toBe("✓ cedar — a signature");
  });
});

describe("order (§5.8)", () => {
  it("before any answer: grouped by country, then name", () => {
    const names = rank({}).map((r) => r.candidate.name);
    expect(names[0]).toBe("A typical Tannin-free White"); // Austria
    expect(names[1]).toBe("A typical Alsace Riesling"); // France, first by name
    expect(names[names.length - 2]).toBe("A typical Vosne-Romanée"); // France, last
    expect(names[names.length - 1]).toBe("A typical Vintage Port"); // Portugal
  });

  it("ranks a left-bank claret note: Margaux first, then by closeness", () => {
    // Every scale answered + blackcurrant/cedar/tobacco on the nose and
    // blackcurrant/leather on the palate. Σw over the 11 scales = 11.3,
    // + aromas 2 = 13.3 (Port skips alcohol: 12.3).
    const r = rank({
      appearanceIntensity: "DEEP",
      colourHue: "GARNET",
      noseIntensity: "MEDIUM",
      development: "DEVELOPING",
      sweetness: "DRY",
      acidity: "MEDIUM_PLUS",
      tannin: "HIGH",
      alcohol: "MEDIUM",
      body: "FULL",
      flavourIntensity: "MEDIUM",
      finish: "LONG",
      noseTermIds: [tid("Black fruit", "blackcurrant"), tid("Oak", "cedar"), tid("Red wine", "tobacco")],
      palateTermIds: [tid("Black fruit", "blackcurrant"), tid("Red wine", "leather")],
    });
    // Margaux: every scale in range, groups {Black fruit, Oak, Red wine} all
    // its own → 13.3/13.3 → 100 (+ cedar, capped at 100).
    // Côte-Rôtie: hue GARNET vs [PURPLE, RUBY] d1 (−0.4), nose and flavour
    // MEDIUM vs [MEDIUM_PLUS, …] d1 (−0.32 each), aromas a = 1:
    // (11.3 − 1.04 + 2) / 13.3 = 12.26 / 13.3 = 0.9218 → 92.
    // Bandol: nose, flavour d1 (−0.64), no Oak → a = 2/3:
    // (11.3 − 0.64 + 1.333) / 13.3 = 0.9018 → 90.
    // Châteauneuf: nose, flavour d1 (−0.64), acidity MEDIUM_PLUS vs
    // [MEDIUM_MINUS, MEDIUM] d1 (−0.6), tannin HIGH vs [MEDIUM, MEDIUM_PLUS]
    // d1 (−0.6), a = 2/3: (11.3 − 1.84 + 1.333) / 13.3 = 0.8115 → 81.
    // Vintage Port (alcohol skipped): nose d1 (−0.32), sweetness DRY vs
    // [MEDIUM_SWEET, SWEET] d4 (−1.5), flavour MEDIUM vs [PRONOUNCED] d2
    // (−0.64), a = 1: (10.3 − 2.46 + 2) / 12.3 = 9.84 / 12.3 = 0.8 → 80.
    expect(r.slice(0, 5).map((x) => [x.candidate.name, x.closeness])).toEqual([
      ["A typical Margaux", 100],
      ["A typical Côte-Rôtie", 92],
      ["A typical Bandol", 90],
      ["A typical Châteauneuf-du-Pape", 81],
      ["A typical Vintage Port", 80],
    ]);
    expect(get(r, "cote-rotie").explanation).toBe("Colour darker than typical");
    expect(get(r, "bandol").explanation).toBe("Oak isn't typical");
    expect(get(r, "vintage-port").explanation).toBe("Sweetness lower than typical");
    // GARNET caps every white; they close the list.
    const whites = r.filter((x) => x.candidate.colour === "WHITE");
    expect(whites.every((x) => x.capped === "colour")).toBe(true);
    expect(r.slice(-whites.length).every((x) => x.candidate.colour === "WHITE")).toBe(true);
  });

  it("breaks a tie by short name", () => {
    const beta = variant("margaux", { name: "A typical Beta" }, "beta");
    const alpha = variant("margaux", { name: "A typical Alpha" }, "alpha");
    const r = rank({ tannin: "HIGH" }, NONE, [beta, alpha]);
    expect(r.map((x) => x.candidate.name)).toEqual(["A typical Alpha", "A typical Beta"]);
  });

  it("puts capped nulls after capped numbers", () => {
    // RUBY + acidity HIGH: tannin-free white capped with 100 → 15; a white
    // with no acidity range (Chablis without sat) stays null, capped.
    const bare = variant("chablis", { sat: {} }, "bare");
    const r = rank({ colourHue: "RUBY", acidity: "HIGH" }, NONE, [bare, arch("tannin-free-white")]);
    expect(r.map((x) => [x.candidate.id, x.closeness])).toEqual([
      ["arch-tannin-free-white", 15],
      ["arch-bare", null],
    ]);
  });
});

describe("snapshotRanking", () => {
  it("freezes the whole list with 1-based ranks", () => {
    const r = rank({ colourHue: "RUBY", tannin: "LOW" });
    const s = snapshotRanking(r);
    expect(s).toHaveLength(POOL.length);
    expect(s.map((x) => x.rank)).toEqual(POOL.map((_, i) => i + 1));
    expect(s[0]).toEqual({
      archetypeId: r[0].candidate.id,
      name: r[0].candidate.name,
      closeness: r[0].closeness,
      rank: 1,
      capped: null,
    });
    const chablis = s.find((x) => x.archetypeId === "arch-chablis");
    expect(chablis).toEqual({
      archetypeId: "arch-chablis",
      name: "A typical Chablis",
      closeness: 15,
      rank: s.findIndex((x) => x.archetypeId === "arch-chablis") + 1,
      capped: "colour",
    });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/match.test.ts`
Expected: FAIL. `Failed to resolve import "./match" from "src/lib/training/match.test.ts"`.

- [ ] **Step 3: Write `match.ts`**

Create `src/lib/training/match.ts`:

```ts
// The training room's matcher (spec 2026-09-25-training-room-design.md §5):
// every archetype keeps a closeness score over the fields the taster has
// answered so far, and the list is sorted by it — ranking, never filtering
// (D3). Pure: relative imports only, no React, no DB, so vitest loads it and
// the room re-ranks on the device on every change (D6).
import type { WineColour, WsetNoteState } from "../wset/types";
import {
  ALCOHOL_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  colourFromHue,
} from "../wset/vocab";
import {
  TRAINING_COPY,
  capReasonLine,
  groupLossLine,
  scaleLossLine,
  shortName,
  signatureLine,
} from "./copy";
import type {
  AromaLexicon,
  CapReason,
  MatchExtras,
  RankedCandidate,
  RankingSnapshot,
  TrainingCandidate,
} from "./types";

/** The matched sat keys, in the order the explanation's tie-break walks them
    (spec §4.4). clarity is stored on the live rows and never matched (D18). */
export const MATCHED_SCALES = [
  "appearanceIntensity",
  "colourHue",
  "noseIntensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "alcohol",
  "body",
  "mousse",
  "flavourIntensity",
  "finish",
] as const;
export type MatchedScale = (typeof MATCHED_SCALES)[number];

/** Spec §5.3. `aromas` is the group-agreement term. */
export const WEIGHTS: Record<MatchedScale | "aromas", number> = {
  sweetness: 1.5,
  tannin: 1.5,
  acidity: 1.5,
  body: 1.2,
  alcohol: 1.0,
  colourHue: 1.0,
  mousse: 1.0,
  noseIntensity: 0.8,
  flavourIntensity: 0.8,
  finish: 0.8,
  development: 0.6,
  appearanceIntensity: 0.6,
  aromas: 2.0,
};

/** Each exact signature hit adds this, at most SIGNATURE_MAX_HITS times — a
    pure bonus that never enters the denominator (D5). */
export const SIGNATURE_BONUS = 1.0;
export const SIGNATURE_MAX_HITS = 2;

/** A contradicted colour, bubbles or fortification caps closeness here (D3). */
export const CAP_MAX = 15;

/** Below this largest weighted loss the explanation praises instead (§5.7). */
export const EXPLAIN_THRESHOLD = 0.3;

// Full enum orders (spec §4.4, "since the critique"): the note sliders offer
// fewer stops on some scales (appearance: PALE / MEDIUM / DEEP; sweetness has
// no MEDIUM), but a range bound may be any enum value, so distance is taken on
// the whole enum. Kept in lockstep with the string unions in ../wset/types.
const APPEARANCE_LADDER = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
const SWEETNESS_LADDER = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
];
const MOUSSE_LADDER = ["DELICATE", "CREAMY", "AGGRESSIVE"];

/**
 * The ladder a scale is measured on for this candidate, or null when the scale
 * is not matched for it: clarity and unknown keys; alcohol on a FORTIFIED
 * candidate (D19: never a distance); mousse on anything but SPARKLING. Hue is
 * the candidate colour's own hue row; unfortified alcohol is ALCOHOL_STOPS
 * (three steps, so medium → high is one step).
 */
export function ladderFor(scale: string, candidate: TrainingCandidate): string[] | null {
  switch (scale) {
    case "appearanceIntensity":
      return APPEARANCE_LADDER;
    case "colourHue":
      return HUES_BY_COLOUR[candidate.colour];
    case "noseIntensity":
    case "flavourIntensity":
      return INTENSITY_STOPS;
    case "development":
      return DEVELOPMENT_STOPS;
    case "sweetness":
      return SWEETNESS_LADDER;
    case "acidity":
    case "tannin":
      return LEVEL_STOPS;
    case "alcohol":
      return candidate.style === "FORTIFIED" ? null : ALCOHOL_STOPS;
    case "body":
      return BODY_STOPS;
    case "finish":
      return FINISH_STOPS;
    case "mousse":
      return candidate.style === "SPARKLING" ? MOUSSE_LADDER : null;
    default:
      return null;
  }
}

/** s(d): in range 1.0, one step out 0.6, two 0.2, further 0 (D4). */
export function stepScore(d: number): number {
  if (d <= 0) return 1;
  if (d === 1) return 0.6;
  if (d === 2) return 0.2;
  return 0;
}

// Steps from `value` to the nearer bound of [lo, hi] on `ladder`, and which
// bound was exceeded; null when the value or either bound is off the ladder
// (the scale is then skipped for this candidate, spec §4.4).
function distance(
  ladder: readonly string[],
  value: string,
  range: readonly [string, string],
): { d: number; direction: "higher" | "lower" | null } | null {
  const v = ladder.indexOf(value);
  const a = ladder.indexOf(range[0]);
  const b = ladder.indexOf(range[1]);
  if (v < 0 || a < 0 || b < 0) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (v < lo) return { d: lo - v, direction: "lower" };
  if (v > hi) return { d: v - hi, direction: "higher" };
  return { d: 0, direction: null };
}

function capFor(note: WsetNoteState, extras: MatchExtras, c: TrainingCandidate): CapReason | null {
  if (note.colourHue !== null && !HUES_BY_COLOUR[c.colour].includes(note.colourHue)) {
    return "colour";
  }
  if (
    (extras.bubbles === true && c.style !== "SPARKLING") ||
    (extras.bubbles === false && c.style === "SPARKLING")
  ) {
    return "bubbles";
  }
  if (
    (extras.fortified === true && c.style !== "FORTIFIED") ||
    (extras.fortified === false && c.style === "FORTIFIED")
  ) {
    return "fortified";
  }
  return null;
}

/**
 * The one explanation line of a candidate row (spec §5.7). A capped candidate
 * explains its cap. Otherwise null when nothing answered applies; else the
 * largest weighted loss (the first in MATCHED_SCALES order on a tie, aromas
 * after every scale) names a scale direction or the taster's aroma group the
 * archetype lacks; below EXPLAIN_THRESHOLD a signature hit reads
 * "✓ {term} — a signature" and no hit "Fits what you've said so far".
 * `noteColour` is `colourFromHue(note.colourHue)`, for the colour cap line.
 */
export function explain(input: {
  candidate: TrainingCandidate;
  closeness: number | null;
  capped: CapReason | null;
  signatureHits: string[];
  losses: { scale: string; loss: number; direction: "higher" | "lower" | null }[];
  aromaLoss: { loss: number; group: string | null } | null;
  noteColour?: WineColour | null;
}): string | null {
  const { candidate, capped } = input;
  if (capped !== null) {
    return capReasonLine(capped, {
      noteColour: input.noteColour ?? null,
      candidateColour: candidate.colour,
      candidateStyle: candidate.style,
    });
  }
  if (input.losses.length === 0 && input.aromaLoss === null) return null;
  let top: { kind: "scale"; scale: string; loss: number; direction: "higher" | "lower" | null } | {
    kind: "aroma";
    loss: number;
    group: string | null;
  } | null = null;
  for (const l of input.losses) {
    if (top === null || l.loss > top.loss) top = { kind: "scale", ...l };
  }
  if (input.aromaLoss && (top === null || input.aromaLoss.loss > top.loss)) {
    top = { kind: "aroma", ...input.aromaLoss };
  }
  if (top === null || top.loss < EXPLAIN_THRESHOLD) {
    return input.signatureHits.length > 0
      ? signatureLine(input.signatureHits[0])
      : TRAINING_COPY.fitsSoFar;
  }
  if (top.kind === "aroma") {
    return top.group ? groupLossLine(top.group) : TRAINING_COPY.fitsSoFar;
  }
  // A loss ≥ 0.3 always comes from a distance > 0, so direction is set.
  return top.direction ? scaleLossLine(top.scale, top.direction) : TRAINING_COPY.fitsSoFar;
}

function scoreOne(
  note: WsetNoteState,
  extras: MatchExtras,
  c: TrainingCandidate,
  lexicon: AromaLexicon,
  noteTermIds: string[],
): RankedCandidate {
  let num = 0;
  let den = 0;
  const losses: { scale: string; loss: number; direction: "higher" | "lower" | null }[] = [];

  for (const scale of MATCHED_SCALES) {
    const value = note[scale];
    if (value === null) continue;
    // D19: fortification is never a distance — skip alcohol on either side.
    if (scale === "alcohol" && (extras.fortified === true || c.style === "FORTIFIED")) continue;
    const range = c.sat[scale];
    if (!range) continue; // a scale the archetype does not carry leaves both sums
    const ladder = ladderFor(scale, c);
    if (!ladder) continue;
    const dist = distance(ladder, value, range);
    if (!dist) continue; // off-ladder hue, bound or answer: skipped
    const w = WEIGHTS[scale];
    const s = stepScore(dist.d);
    num += w * s;
    den += w;
    losses.push({ scale, loss: w * (1 - s), direction: dist.direction });
  }

  // Aromas (§5.5): the share of the taster's groups the archetype also carries.
  let aromaLoss: { loss: number; group: string | null } | null = null;
  const perGroup = new Map<string, number>();
  for (const id of noteTermIds) {
    const entry = lexicon[id];
    if (entry) perGroup.set(entry.group, (perGroup.get(entry.group) ?? 0) + 1);
  }
  if (perGroup.size > 0 && c.aromas.length > 0) {
    const archGroups = new Set(c.aromas.map((a) => a.group));
    const shared = [...perGroup.keys()].filter((g) => archGroups.has(g)).length;
    const a = shared / perGroup.size;
    num += WEIGHTS.aromas * a;
    den += WEIGHTS.aromas;
    // The taster's group the archetype lacks with the most picked terms;
    // ties by group name.
    const missing = [...perGroup.entries()]
      .filter(([g]) => !archGroups.has(g))
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "en"));
    aromaLoss = { loss: WEIGHTS.aromas * (1 - a), group: missing[0]?.[0] ?? null };
  }

  // Signature hits: the taster's exact term ids ∩ the archetype's signature
  // terms, each term once, in the archetype's aroma order.
  const picked = new Set(noteTermIds);
  const hitIds = new Set<string>();
  const signatureHits: string[] = [];
  for (const a of c.aromas) {
    if (a.signature && picked.has(a.termId) && !hitIds.has(a.termId)) {
      hitIds.add(a.termId);
      signatureHits.push(a.term);
    }
  }
  const bonus = SIGNATURE_BONUS * Math.min(signatureHits.length, SIGNATURE_MAX_HITS);

  let closeness: number | null =
    den === 0 ? null : Math.min(100, Math.round((100 * (num + bonus)) / den));
  const capped = capFor(note, extras, c);
  if (capped !== null && closeness !== null) closeness = Math.min(closeness, CAP_MAX);

  const explanation = explain({
    candidate: c,
    closeness,
    capped,
    signatureHits,
    losses,
    aromaLoss,
    noteColour: colourFromHue(note.colourHue),
  });
  return { candidate: c, closeness, capped, explanation, signatureHits };
}

function byName(a: TrainingCandidate, b: TrainingCandidate): number {
  return shortName(a.name).localeCompare(shortName(b.name), "en") || a.id.localeCompare(b.id);
}

// §5.8: uncapped with a number (closeness desc), then uncapped nulls
// (country, then name), then capped (closeness desc, nulls last); ties by
// shortName, then id so the order is total.
function bucket(r: RankedCandidate): number {
  if (r.capped !== null) return 2;
  return r.closeness === null ? 1 : 0;
}

function compareRanked(x: RankedCandidate, y: RankedCandidate): number {
  const bx = bucket(x);
  const by = bucket(y);
  if (bx !== by) return bx - by;
  if (bx === 1) {
    return (
      x.candidate.country.name.localeCompare(y.candidate.country.name, "en") ||
      byName(x.candidate, y.candidate)
    );
  }
  if (x.closeness !== y.closeness) {
    if (x.closeness === null) return 1;
    if (y.closeness === null) return -1;
    return y.closeness - x.closeness;
  }
  return byName(x.candidate, y.candidate);
}

/** Every candidate, scored and sorted (spec §5). Nothing is removed (D3). */
export function rankCandidates(
  note: WsetNoteState,
  extras: MatchExtras,
  pool: TrainingCandidate[],
  lexicon: AromaLexicon,
): RankedCandidate[] {
  const noteTermIds = [...new Set([...note.noseTermIds, ...note.palateTermIds])];
  return pool
    .map((c) => scoreOne(note, extras, c, lexicon, noteTermIds))
    .sort(compareRanked);
}

/** The whole ranking, frozen for the attempt (spec §5.8): rank is 1-based. */
export function snapshotRanking(ranked: RankedCandidate[]): RankingSnapshot {
  return ranked.map((r, i) => ({
    archetypeId: r.candidate.id,
    name: r.candidate.name,
    closeness: r.closeness,
    rank: i + 1,
    capped: r.capped,
  }));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/match.test.ts`
Expected: PASS, **51 tests**. If one of the worked numbers is off, recompute it by hand from the comment before touching `match.ts`: the comment is the spec's arithmetic.

- [ ] **Step 5: Run every training test, type-check and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training && npx tsc --noEmit && npx eslint src/lib/training`
Expected: 4 files, **96 tests** pass (copy 28, history-math 7, draft 10, match 51). tsc exits 0, and eslint prints nothing.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/match.ts src/lib/training/match.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): the matcher — ladders, weights, caps, explanations and the ranking snapshot" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The note payload builders, extracted from NoteEditor

**Files:**
- Modify: `src/lib/wset/note-state.ts` (import after line 2; append after line 67, the end of `noteStateFromRow`)
- Test: `src/lib/wset/note-state.test.ts` (new)
- Modify: `src/app/catalog/[wineId]/notes/note-editor.tsx` (imports after line 7; replace lines 62–95)

**Interfaces:**
- Consumes: `WsetNoteState` (`src/lib/wset/types.ts`), `NoteContextKind` (`src/lib/wset/queries.ts`, a type-only import; `queries.ts` already imports `note-state.ts`, and the cycle is erased at runtime).
- Produces (Tasks 9 and 10 build `FinishInput.note` / `.aromas` with these):
  - `noteToPayload(state: WsetNoteState, ids: { catalogWineId: string | null; unidentifiedWineId?: string | null; contextKind: NoteContextKind | null; tastingWineId: string | null }): Record<string, unknown>` returns exactly the 27 keys `save_wset_note` reads.
  - `aromasToPayload(state: WsetNoteState): { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean }[]`
- Behaviour kept: NoteEditor sends the same values as before. The one new key, `unidentified_wine_id: null`, is read by the RPC exactly as an absent key: `(p_note->>'unidentified_wine_id')::uuid` is null either way.

- [ ] **Step 1: Write the failing payload test**

Create `src/lib/wset/note-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aromasToPayload, emptyNoteState, noteToPayload } from "./note-state";
import type { WsetNoteState } from "./types";

// The keys save_wset_note reads from p_note (its live body, recreated in
// supabase/migrations/20260914094500_hidden_glass_notes.sql: every
// `p_note->>'…'` / `p_note->'…'`), which record_training_attempt passes on.
// A key the client spells differently is silently dropped by the RPC, so the
// set must match exactly.
const RPC_NOTE_KEYS = [
  "id",
  "catalog_wine_id",
  "unidentified_wine_id",
  "context_kind",
  "tasting_wine_id",
  "tasted_on",
  "clarity",
  "appearance_intensity",
  "colour_hue",
  "observations",
  "condition",
  "faults",
  "nose_intensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "tannin_nature",
  "alcohol",
  "body",
  "mousse",
  "flavour_intensity",
  "finish",
  "quality_score",
  "price_category",
  "readiness",
  "taster_notes",
];

const RATED: WsetNoteState = {
  id: "note-1",
  tastedOn: "2026-09-24",
  clarity: "CLEAR",
  appearanceIntensity: "DEEP",
  colourHue: "GARNET",
  observations: ["LEGS_TEARS"],
  condition: "CLEAN",
  faults: [],
  noseIntensity: "MEDIUM_PLUS",
  development: "DEVELOPING",
  sweetness: "DRY",
  acidity: "MEDIUM_PLUS",
  tannin: "HIGH",
  tanninNature: ["FINE_GRAINED"],
  alcohol: "MEDIUM",
  body: "FULL",
  mousse: null,
  flavourIntensity: "MEDIUM_PLUS",
  finish: "LONG",
  qualityScore: 93,
  priceCategory: "PREMIUM",
  readiness: "NEEDS_TIME",
  tasterNotes: "cedar, pencil shavings",
  noseTermIds: ["t-blackcurrant", "t-cedar"],
  palateTermIds: ["t-cedar", "t-leather"],
};

describe("noteToPayload", () => {
  it("spells exactly the keys save_wset_note reads", () => {
    const p = noteToPayload(emptyNoteState(), { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null });
    expect(Object.keys(p).sort()).toEqual([...RPC_NOTE_KEYS].sort());
  });

  it("maps every sheet field to its column", () => {
    expect(
      noteToPayload(RATED, { catalogWineId: "wine-1", contextKind: "BLIND", tastingWineId: "glass-1" }),
    ).toEqual({
      id: "note-1",
      catalog_wine_id: "wine-1",
      unidentified_wine_id: null,
      context_kind: "BLIND",
      tasting_wine_id: "glass-1",
      tasted_on: "2026-09-24",
      clarity: "CLEAR",
      appearance_intensity: "DEEP",
      colour_hue: "GARNET",
      observations: ["LEGS_TEARS"],
      condition: "CLEAN",
      faults: [],
      nose_intensity: "MEDIUM_PLUS",
      development: "DEVELOPING",
      sweetness: "DRY",
      acidity: "MEDIUM_PLUS",
      tannin: "HIGH",
      tannin_nature: ["FINE_GRAINED"],
      alcohol: "MEDIUM",
      body: "FULL",
      mousse: null,
      flavour_intensity: "MEDIUM_PLUS",
      finish: "LONG",
      quality_score: 93,
      price_category: "PREMIUM",
      readiness: "NEEDS_TIME",
      taster_notes: "cedar, pencil shavings",
    });
  });

  it("passes an unidentified wine and a null context through", () => {
    const p = noteToPayload(RATED, {
      catalogWineId: null,
      unidentifiedWineId: "unid-1",
      contextKind: null,
      tastingWineId: null,
    });
    expect(p.unidentified_wine_id).toBe("unid-1");
    expect(p.context_kind).toBeNull();
    expect(p.catalog_wine_id).toBeNull();
  });
});

describe("aromasToPayload", () => {
  it("unions nose and palate ids, each once, flagged where sensed", () => {
    expect(aromasToPayload(RATED)).toEqual([
      { term_id: "t-blackcurrant", sensed_on_nose: true, sensed_on_palate: false },
      { term_id: "t-cedar", sensed_on_nose: true, sensed_on_palate: true },
      { term_id: "t-leather", sensed_on_nose: false, sensed_on_palate: true },
    ]);
  });

  it("is empty for a note with no aromas", () => {
    expect(aromasToPayload(emptyNoteState())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/note-state.test.ts`
Expected: FAIL, 5 tests, each with a TypeError saying `noteToPayload` (or `aromasToPayload`) is not a function.

- [ ] **Step 3: Add the builders to `note-state.ts`**

In `src/lib/wset/note-state.ts`, replace lines 1–2:

```ts
import type { Database } from "@/lib/supabase/database.types";
import type { WsetNoteState } from "./types";
```

with:

```ts
import type { Database } from "@/lib/supabase/database.types";
import type { NoteContextKind } from "./queries";
import type { WsetNoteState } from "./types";
```

and append after the last line (the closing `}` of `noteStateFromRow`):

```ts
// The p_note payload save_wset_note reads (and record_training_attempt passes
// on), built from sheet state: camelCase state to the RPC's snake_case keys.
// The one place those keys are spelled on the client: NoteEditor and the
// training room both call it (training-room spec §7.2). A null contextKind
// keeps an existing note's context on update and means OPEN on insert (the
// RPC's coalesce); unidentifiedWineId defaults to null, which the RPC reads
// the same as an absent key.
export function noteToPayload(
  state: WsetNoteState,
  ids: {
    catalogWineId: string | null;
    unidentifiedWineId?: string | null;
    contextKind: NoteContextKind | null;
    tastingWineId: string | null;
  },
): Record<string, unknown> {
  return {
    id: state.id,
    catalog_wine_id: ids.catalogWineId,
    unidentified_wine_id: ids.unidentifiedWineId ?? null,
    context_kind: ids.contextKind,
    tasting_wine_id: ids.tastingWineId,
    tasted_on: state.tastedOn,
    clarity: state.clarity,
    appearance_intensity: state.appearanceIntensity,
    colour_hue: state.colourHue,
    observations: state.observations,
    condition: state.condition,
    faults: state.faults,
    nose_intensity: state.noseIntensity,
    development: state.development,
    sweetness: state.sweetness,
    acidity: state.acidity,
    tannin: state.tannin,
    tannin_nature: state.tanninNature,
    alcohol: state.alcohol,
    body: state.body,
    mousse: state.mousse,
    flavour_intensity: state.flavourIntensity,
    finish: state.finish,
    quality_score: state.qualityScore,
    price_category: state.priceCategory,
    readiness: state.readiness,
    taster_notes: state.tasterNotes,
  };
}

// The p_aromas payload: the union of nose and palate term ids (nose order
// first, each id once), each flagged where it was sensed.
export function aromasToPayload(
  state: WsetNoteState,
): { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean }[] {
  const ids = [...new Set([...state.noseTermIds, ...state.palateTermIds])];
  return ids.map((termId) => ({
    term_id: termId,
    sensed_on_nose: state.noseTermIds.includes(termId),
    sensed_on_palate: state.palateTermIds.includes(termId),
  }));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/note-state.test.ts`
Expected: PASS, **5 tests**.

- [ ] **Step 5: Make NoteEditor use them**

In `src/app/catalog/[wineId]/notes/note-editor.tsx`, replace line 7:

```ts
import { NOTES_ARCHIVE_HREF } from "@/lib/wset/note-saved";
```

with:

```ts
import { NOTES_ARCHIVE_HREF } from "@/lib/wset/note-saved";
import { aromasToPayload, noteToPayload } from "@/lib/wset/note-state";
import type { NoteContextKind } from "@/lib/wset/queries";
```

Then replace the payload block inside `onSave`. That block runs from `const pNote = {` (originally line 62) through the `}));` that closes `pAromas` (originally line 95):

```ts
      const pNote = {
        id: state.id,
        catalog_wine_id: wineId,
        context_kind: contextKind,
        tasting_wine_id: tastingWineId,
        tasted_on: state.tastedOn,
        clarity: state.clarity,
        appearance_intensity: state.appearanceIntensity,
        colour_hue: state.colourHue,
        observations: state.observations,
        condition: state.condition,
        faults: state.faults,
        nose_intensity: state.noseIntensity,
        development: state.development,
        sweetness: state.sweetness,
        acidity: state.acidity,
        tannin: state.tannin,
        tannin_nature: state.tanninNature,
        alcohol: state.alcohol,
        body: state.body,
        mousse: state.mousse,
        flavour_intensity: state.flavourIntensity,
        finish: state.finish,
        quality_score: state.qualityScore,
        price_category: state.priceCategory,
        readiness: state.readiness,
        taster_notes: state.tasterNotes,
      };
      const ids = [...new Set([...state.noseTermIds, ...state.palateTermIds])];
      const pAromas = ids.map((termId) => ({
        term_id: termId,
        sensed_on_nose: state.noseTermIds.includes(termId),
        sensed_on_palate: state.palateTermIds.includes(termId),
      }));
```

with:

```ts
      // The payload keys live once, in note-state.ts (noteToPayload /
      // aromasToPayload), shared with the training room. contextKind passes
      // through unchanged: null keeps an existing note's context and means
      // OPEN on insert; the database enum refuses anything else.
      const pNote = noteToPayload(state, {
        catalogWineId: wineId,
        contextKind: contextKind as NoteContextKind | null,
        tastingWineId,
      });
      const pAromas = aromasToPayload(state);
```

Nothing else in the file changes. The 23514 retry below still spreads `{ ...pNote, colour_hue: null }` and tests `pNote.colour_hue !== null`, which works on a `Record<string, unknown>`, and `save_wset_note`'s Args are typed `unknown`.

- [ ] **Step 6: Gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset src/lib/training src/lib/safe-storage.test.ts && npx tsc --noEmit && npx eslint src/lib/wset/note-state.ts src/lib/wset/note-state.test.ts "src/app/catalog/[wineId]/notes/note-editor.tsx"`
Expected: PASS: `src/lib/wset` 10 files / 101 tests (96 existing + the 5 new note-state tests; `aroma-icons.test.ts` reads `public/emoji`, so run it from the worktree root), training 4 files / 96 tests, safe-storage 15, so **212 tests**. tsc exits 0, and eslint prints nothing.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/wset/note-state.ts src/lib/wset/note-state.test.ts "src/app/catalog/[wineId]/notes/note-editor.tsx" && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "refactor(training): noteToPayload and aromasToPayload shared by NoteEditor and the room" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: WsetSheet — onChange, footerAction, belowBar, aside, onClose, Bubbles, the fortified stop, effectiveStyle

**Files:**
- Create: `src/lib/wset/sheet-extras.ts`
- Test: `src/lib/wset/sheet-extras.test.ts`
- Modify: `src/lib/wset/i18n.ts` (UI_EN after line 301 `required_sparkling`; UI_DA after line 513 `required_sparkling`)
- Modify: `src/components/wset/wset-sheet.tsx` (lines 3, 6–19, 63, 77–83, 200–230, 258–273, 324–345, 414–471, 564–569, 571–590, 593–608, 648–661, 742–787)

**Interfaces:**
- Consumes: nothing from other tasks (existing `sectionProgress`, `ALCOHOL_STOPS`, `FORTIFIED_ALCOHOL_STOPS` from `src/lib/wset/vocab.ts`; `PillGroup`, `SnapSlider`).
- Produces (Task 10 relies on these):
  - `src/lib/wset/sheet-extras.ts`: `type AlcoholStop = Level | "FORTIFIED"`; `FORTIFIED_STOP`; `effectiveStyle(style: WineStyle | null, bubbles: boolean | null | undefined, fortified: boolean | null | undefined): WineStyle`; `alcoholStopsFor(style: WineStyle, withFortifiedStop: boolean): readonly AlcoholStop[]`; `alcoholShown(alcohol: Level | null, fortified: boolean | null): AlcoholStop | null`; `alcoholPick(stop: AlcoholStop | null): { alcohol: Level | null; fortified: boolean | null }`; `type BubblesPill = "NONE" | "SPARKLING"`; `BUBBLES_OPTIONS`; `bubblesPill(v)`; `bubblesFromPill(p)`; `mousseAfterBubbles(style, bubbles, fortified, mousse)`.
  - `WsetSheet` props added: `onChange?: (state: WsetNoteState) => void`; `footerAction?: WsetFooterAction` (`{ label: string; onClick: () => void }`); `belowBar?: ReactNode`; `aside?: ReactNode | null`; `onClose?: () => void`; `bubbles?: WsetTriState`; `fortified?: WsetTriState` (`{ value: boolean | null; onChange: (v: boolean | null) => void }`); `onSave` optional only when `footerAction` is given. Exported types `WsetFooterAction`, `WsetTriState`.
  - Every caller that passes none of the new props (NoteEditor → NewNoteModal, NoteModal) renders exactly as before.

- [ ] **Step 1: Write the failing test** — create `src/lib/wset/sheet-extras.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeT, uiStrings } from "./i18n";
import type { WsetNoteState } from "./types";
import { ALCOHOL_STOPS, FORTIFIED_ALCOHOL_STOPS, sectionProgress } from "./vocab";
import {
  BUBBLES_OPTIONS,
  FORTIFIED_STOP,
  alcoholPick,
  alcoholShown,
  alcoholStopsFor,
  bubblesFromPill,
  bubblesPill,
  effectiveStyle,
  mousseAfterBubbles,
} from "./sheet-extras";

// Training-room spec §3.3 and D19: an unknown wine's answers imply its style,
// and the alcohol row's fourth stop states fortification without ever being a
// distance on the five-stop ladder.
const blank: WsetNoteState = {
  id: null,
  tastedOn: "2026-09-25",
  clarity: null,
  appearanceIntensity: null,
  colourHue: null,
  observations: [],
  condition: null,
  faults: [],
  noseIntensity: null,
  development: null,
  sweetness: null,
  acidity: null,
  tannin: null,
  tanninNature: [],
  alcohol: null,
  body: null,
  mousse: null,
  flavourIntensity: null,
  finish: null,
  qualityScore: null,
  priceCategory: null,
  readiness: null,
  tasterNotes: "",
  noseTermIds: [],
  palateTermIds: [],
};

describe("effectiveStyle", () => {
  it("a known style always wins over the toggles", () => {
    expect(effectiveStyle("STILL", true, true)).toBe("STILL");
    expect(effectiveStyle("SWEET", true, null)).toBe("SWEET");
    expect(effectiveStyle("SPARKLING", false, null)).toBe("SPARKLING");
  });
  it("an unknown wine: bubbles first, then fortified, else still; null and undefined never count", () => {
    expect(effectiveStyle(null, true, true)).toBe("SPARKLING");
    expect(effectiveStyle(null, false, true)).toBe("FORTIFIED");
    expect(effectiveStyle(null, null, true)).toBe("FORTIFIED");
    expect(effectiveStyle(null, null, null)).toBe("STILL");
    expect(effectiveStyle(null, undefined, undefined)).toBe("STILL");
    expect(effectiveStyle(null, false, false)).toBe("STILL");
  });
  it("Palate counts 9 while Bubbles is on and 8 otherwise", () => {
    expect(sectionProgress(blank, effectiveStyle(null, true, null)).palate).toEqual([0, 9]);
    expect(sectionProgress(blank, effectiveStyle(null, false, null)).palate).toEqual([0, 8]);
    expect(sectionProgress(blank, effectiveStyle(null, null, true)).palate).toEqual([0, 8]);
  });
});

describe("the alcohol row", () => {
  it("offers the fourth stop only when the fortified toggle is wired, whatever the style", () => {
    expect(alcoholStopsFor("STILL", true)).toEqual(["LOW", "MEDIUM", "HIGH", "FORTIFIED"]);
    expect(alcoholStopsFor("FORTIFIED", true)).toEqual(["LOW", "MEDIUM", "HIGH", "FORTIFIED"]);
    expect(alcoholStopsFor("STILL", false)).toBe(ALCOHOL_STOPS);
    expect(alcoholStopsFor("SPARKLING", false)).toBe(ALCOHOL_STOPS);
    expect(alcoholStopsFor("FORTIFIED", false)).toBe(FORTIFIED_ALCOHOL_STOPS);
  });
  it("hands the slider the same array on every render", () => {
    expect(alcoholStopsFor("STILL", true)).toBe(alcoholStopsFor("STILL", true));
  });
  it("a pick: the fortified stop is high alcohol and fortified; any other stop is not fortified; clearing is unknown", () => {
    expect(alcoholPick(FORTIFIED_STOP)).toEqual({ alcohol: "HIGH", fortified: true });
    expect(alcoholPick("HIGH")).toEqual({ alcohol: "HIGH", fortified: false });
    expect(alcoholPick("LOW")).toEqual({ alcohol: "LOW", fortified: false });
    expect(alcoholPick(null)).toEqual({ alcohol: null, fortified: null });
  });
  it("shows the fortified stop while fortified is on, the level otherwise", () => {
    expect(alcoholShown("HIGH", true)).toBe("FORTIFIED");
    expect(alcoholShown("HIGH", false)).toBe("HIGH");
    expect(alcoholShown("MEDIUM", null)).toBe("MEDIUM");
    expect(alcoholShown(null, null)).toBeNull();
  });
});

describe("the Bubbles toggle", () => {
  it("maps tri-state to two pills and back", () => {
    expect(BUBBLES_OPTIONS).toEqual(["NONE", "SPARKLING"]);
    expect([bubblesPill(null), bubblesPill(true), bubblesPill(false)]).toEqual([null, "SPARKLING", "NONE"]);
    expect([bubblesFromPill(null), bubblesFromPill("SPARKLING"), bubblesFromPill("NONE")]).toEqual([null, true, false]);
  });
  it("keeps a mousse only while the wine still reads sparkling", () => {
    expect(mousseAfterBubbles(null, true, null, "CREAMY")).toBe("CREAMY");
    expect(mousseAfterBubbles(null, false, null, "CREAMY")).toBeNull();
    expect(mousseAfterBubbles(null, null, null, "CREAMY")).toBeNull();
    expect(mousseAfterBubbles("SPARKLING", false, null, "CREAMY")).toBe("CREAMY");
    expect(mousseAfterBubbles(null, true, null, null)).toBeNull();
  });
});

describe("copy", () => {
  it("the new sheet strings exist in English and Danish", () => {
    const en = makeT("en");
    expect([en("bubbles"), en("bubbles_none"), en("bubbles_sparkling"), en("fortified_stop")]).toEqual([
      "Bubbles",
      "none",
      "sparkling",
      "fortified (15 %+)",
    ]);
    const da = uiStrings("da");
    expect([da.bubbles, da.bubbles_none, da.bubbles_sparkling, da.fortified_stop]).toEqual([
      "Bobler",
      "ingen",
      "mousserende",
      "hedvin (15 %+)",
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/sheet-extras.test.ts`

Expected: FAIL — `Failed to resolve import "./sheet-extras"` (the module does not exist yet); 0 tests run.

- [ ] **Step 3: Write the module** — create `src/lib/wset/sheet-extras.ts`:

```ts
// The training room's additions to the WSET sheet (training-room spec §3.3,
// D19): the style an unknown wine's answers imply, the Appearance "Bubbles"
// toggle's tri-state mapping, and the alcohol row's display-only fourth stop,
// "fortified (15 %+)". WsetSheet reads these; nothing here renders.
//
// Pure: relative runtime imports only, so vitest (no `@/` alias) can load it.
import type { Level, Mousse, WineStyle } from "./types";
import { ALCOHOL_STOPS, FORTIFIED_ALCOHOL_STOPS } from "./vocab";

/** A stop on the alcohol row: a level, or the display-only fortified stop. */
export type AlcoholStop = Level | "FORTIFIED";

export const FORTIFIED_STOP = "FORTIFIED" as const;

// The unfortified ladder plus the fourth stop. One constant, so the slider is
// handed the same array on every render.
const ALCOHOL_STOPS_WITH_FORTIFIED: readonly AlcoholStop[] = [...ALCOHOL_STOPS, FORTIFIED_STOP];

/**
 * The style the sheet draws with: the wine's own when it is known, else what
 * the taster has said — bubbles make it sparkling, then fortified makes it
 * fortified, else still. `null` (not answered) and `undefined` (no toggle)
 * never count. Drives the mousse row, the alcohol ladder and sectionProgress.
 */
export function effectiveStyle(
  style: WineStyle | null,
  bubbles: boolean | null | undefined,
  fortified: boolean | null | undefined,
): WineStyle {
  if (style !== null) return style;
  if (bubbles === true) return "SPARKLING";
  if (fortified === true) return "FORTIFIED";
  return "STILL";
}

/**
 * The alcohol row's stops. With the fortified toggle wired, always the three
 * unfortified stops plus "FORTIFIED" (D19: never a five-stop distance);
 * without it, today's rule — the five-stop ladder for a fortified wine.
 */
export function alcoholStopsFor(style: WineStyle, withFortifiedStop: boolean): readonly AlcoholStop[] {
  if (withFortifiedStop) return ALCOHOL_STOPS_WITH_FORTIFIED;
  return style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
}

/** The value the row shows: the fortified stop while fortified is on. */
export function alcoholShown(alcohol: Level | null, fortified: boolean | null): AlcoholStop | null {
  return fortified === true ? FORTIFIED_STOP : alcohol;
}

/**
 * What a pick on the row writes: the fortified stop is high alcohol and
 * fortified; any other stop is that level and not fortified; clearing leaves
 * both unknown.
 */
export function alcoholPick(stop: AlcoholStop | null): { alcohol: Level | null; fortified: boolean | null } {
  if (stop === null) return { alcohol: null, fortified: null };
  if (stop === FORTIFIED_STOP) return { alcohol: "HIGH", fortified: true };
  return { alcohol: stop, fortified: false };
}

/** The Bubbles toggle's two pills; neither selected is "not answered". */
export type BubblesPill = "NONE" | "SPARKLING";
export const BUBBLES_OPTIONS: readonly BubblesPill[] = ["NONE", "SPARKLING"];

export function bubblesPill(value: boolean | null): BubblesPill | null {
  if (value === null) return null;
  return value ? "SPARKLING" : "NONE";
}

export function bubblesFromPill(pill: BubblesPill | null): boolean | null {
  if (pill === null) return null;
  return pill === "SPARKLING";
}

/** A mousse survives a Bubbles answer only while the wine still reads sparkling. */
export function mousseAfterBubbles(
  style: WineStyle | null,
  bubbles: boolean | null,
  fortified: boolean | null,
  mousse: Mousse | null,
): Mousse | null {
  return effectiveStyle(style, bubbles, fortified) === "SPARKLING" ? mousse : null;
}
```

- [ ] **Step 4: Add the four sheet strings to both dictionaries** — in `src/lib/wset/i18n.ts`:

Replace (UI_EN, line 301)
```ts
  required_sparkling: "required — sparkling",
```
with
```ts
  required_sparkling: "required — sparkling",
  // training room (spec §3.3, D19): an unknown wine states its bubbles and
  // fortification
  bubbles: "Bubbles",
  bubbles_none: "none",
  bubbles_sparkling: "sparkling",
  fortified_stop: "fortified (15 %+)",
```

Replace (UI_DA, line 513)
```ts
  required_sparkling: "påkrævet — mousserende",
```
with
```ts
  required_sparkling: "påkrævet — mousserende",
  bubbles: "Bobler",
  bubbles_none: "ingen",
  bubbles_sparkling: "mousserende",
  fortified_stop: "hedvin (15 %+)",
```

- [ ] **Step 5: Run the test and the dictionary parity tests**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/sheet-extras.test.ts src/app/taste/taste-archive-math.test.ts src/app/taste/notes/notes-search.test.ts src/lib/wset/hidden-note.test.ts`

Expected: PASS — `sheet-extras.test.ts` 10 passed; the three parity files pass unchanged (identical EN/DA key sets).

- [ ] **Step 6: WsetSheet — imports and constants.** In `src/components/wset/wset-sheet.tsx`:

Replace line 3
```ts
import { useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
```
with
```ts
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
```

Replace lines 6–19
```ts
import {
  APPEARANCE_INTENSITY_STOPS,
  INTENSITY_STOPS,
  DEVELOPMENT_STOPS,
  SWEETNESS_STOPS,
  LEVEL_STOPS,
  TANNIN_NATURE,
  ALCOHOL_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  BODY_STOPS,
  FINISH_STOPS,
  colourFromHue,
  sectionProgress,
} from "@/lib/wset/vocab";
```
with
```ts
import {
  APPEARANCE_INTENSITY_STOPS,
  INTENSITY_STOPS,
  DEVELOPMENT_STOPS,
  SWEETNESS_STOPS,
  LEVEL_STOPS,
  TANNIN_NATURE,
  BODY_STOPS,
  FINISH_STOPS,
  colourFromHue,
  sectionProgress,
} from "@/lib/wset/vocab";
import {
  BUBBLES_OPTIONS,
  alcoholPick,
  alcoholShown,
  alcoholStopsFor,
  bubblesFromPill,
  bubblesPill,
  effectiveStyle,
  mousseAfterBubbles,
} from "@/lib/wset/sheet-extras";
```

Replace line 63
```ts
const SECTION_SCROLL_MT = "scroll-mt-[190px] sm:scroll-mt-[160px]";
```
with
```ts
const SECTION_SCROLL_MT = "scroll-mt-[190px] sm:scroll-mt-[160px]";
// With a `belowBar` strip (the training room's 44px "Top match" line) the
// sticky bar is 44px taller.
const SECTION_SCROLL_MT_BELOW_BAR = "scroll-mt-[234px] sm:scroll-mt-[204px]";
```

Replace lines 77–83
```ts
/** What a modal needs from the open sheet. */
export type WsetSheetHandle = {
  /** Close the way the header's Close does: an open confirm or menu is
      dismissed first; then a dirty note asks before discarding and a clean one
      exits. Modals route Escape and their backdrop through this. */
  requestClose: () => void;
};
```
with
```ts
/** What a modal needs from the open sheet. */
export type WsetSheetHandle = {
  /** Close the way the header's Close does: an open confirm or menu is
      dismissed first; then a dirty note asks before discarding and a clean one
      exits. Modals route Escape and their backdrop through this. */
  requestClose: () => void;
};

/** The training room's footer: one action in place of Save, at every section. */
export type WsetFooterAction = { label: string; onClick: () => void };

/** A fact the form states (training-room D19): null until answered. */
export type WsetTriState = { value: boolean | null; onChange: (v: boolean | null) => void };

// Save, or the footer action in its place. With `footerAction` the Save button
// and its states are gone, so `onSave` is optional there and required anywhere
// else — every existing caller still has to pass it.
type WsetSaveProps =
  | { onSave: (state: WsetNoteState) => Promise<void>; footerAction?: undefined }
  | { onSave?: (state: WsetNoteState) => Promise<void>; footerAction: WsetFooterAction };
```

- [ ] **Step 7: WsetSheet — the signature.** Replace lines 200–230
```tsx
export function WsetSheet({
  wine,
  title,
  terms,
  initial,
  onSave,
  onDiscard,
  onDelete,
  embedded = false,
  ref,
}: {
  /** Null colour/style is the hidden-glass case (blind-tasting B8): the
      family is not known yet. WineColourControl and AromaPicker already
      degrade to "every family" / "every group" on null; sectionProgress
      below falls back to STILL, since it has no null branch of its own. */
  wine: { colour: WineColour | null; style: WineStyle | null };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
  onSave: (state: WsetNoteState) => Promise<void>;
  /** Exit without saving; renders Close (✕ on phones), which confirms a
      discard while the note has unsaved changes. */
  onDiscard?: () => void;
  /** Delete this saved note permanently (confirms first). Only passed for
      notes that already exist; the caller owns navigation afterwards. */
  onDelete?: () => Promise<void> | void;
  // In a dialog: single column (no live-note aside), header and footer pinned
  // to the popup edges while the sections scroll between them.
  embedded?: boolean;
  ref?: React.Ref<WsetSheetHandle>;
}) {
```
with
```tsx
export function WsetSheet({
  wine,
  title,
  terms,
  initial,
  onSave,
  onDiscard,
  onDelete,
  embedded = false,
  ref,
  onChange,
  footerAction,
  belowBar,
  aside,
  onClose,
  bubbles,
  fortified,
}: {
  /** Null colour/style is the hidden-glass case (blind-tasting B8) and the
      training room's unknown wine: the family is not known yet.
      WineColourControl and AromaPicker already degrade to "every family" /
      "every group" on null; the drawn style is `effectiveStyle` (STILL unless
      the Bubbles / fortified answers say otherwise). */
  wine: { colour: WineColour | null; style: WineStyle | null };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
  /** Exit without saving; renders Close (✕ on phones), which confirms a
      discard while the note has unsaved changes. */
  onDiscard?: () => void;
  /** Delete this saved note permanently (confirms first). Only passed for
      notes that already exist; the caller owns navigation afterwards. */
  onDelete?: () => Promise<void> | void;
  // In a dialog: single column (no live-note aside), header and footer pinned
  // to the popup edges while the sections scroll between them.
  embedded?: boolean;
  ref?: React.Ref<WsetSheetHandle>;
  /** Every committed change of the note (the training room's live ranking and
      its on-device draft). Also called once with the initial state. */
  onChange?: (state: WsetNoteState) => void;
  /** Rendered inside the sticky bar, under the section tabs, so it sticks
      with them. The section scroll margin allows 44px for it. */
  belowBar?: ReactNode;
  /** The lg+ column beside the sections. Omitted: the live tasting note.
      `null`: no column at all — the sheet renders single-column and the
      caller owns the layout. */
  aside?: ReactNode | null;
  /** ✕ / Close with no discard confirm (the caller keeps the note). Takes
      precedence over `onDiscard`. */
  onClose?: () => void;
  /** Appearance's Bubbles toggle (none / sparkling); "sparkling" switches the
      mousse row on for an unknown wine. */
  bubbles?: WsetTriState;
  /** The alcohol row's display-only fourth stop, "fortified (15 %+)". */
  fortified?: WsetTriState;
} & WsetSaveProps) {
```

- [ ] **Step 8: WsetSheet — onChange, effective style, progress.** Replace lines 258–273
```tsx
  const set = useCallback(
    <K extends keyof WsetNoteState>(key: K, value: WsetNoteState[K]) =>
      setState((s) => ({ ...s, [key]: value })),
    [],
  );

  // The live note reads in the active language: term labels are translated, and
  // the prose stitching gets Danish scale words + the Danish quality band.
  const termLabels = useMemo(
    () => new Map(terms.map((tm) => [tm.id, translateTerm(tm.term, lang)])),
    [terms, lang],
  );
  const prog = useMemo(
    () => sectionProgress(state, wine.style ?? "STILL"),
    [state, wine.style],
  );
```
with
```tsx
  const set = useCallback(
    <K extends keyof WsetNoteState>(key: K, value: WsetNoteState[K]) =>
      setState((s) => ({ ...s, [key]: value })),
    [],
  );

  // The training room re-ranks on every change and keeps a draft. It hears
  // the committed state after render; useEffectEvent, so a new `onChange`
  // identity on each parent render never re-fires the effect.
  const reportChange = useEffectEvent((next: WsetNoteState) => {
    onChange?.(next);
  });
  useEffect(() => {
    reportChange(state);
  }, [state]);

  // The live note reads in the active language: term labels are translated, and
  // the prose stitching gets Danish scale words + the Danish quality band.
  const termLabels = useMemo(
    () => new Map(terms.map((tm) => [tm.id, translateTerm(tm.term, lang)])),
    [terms, lang],
  );
  // The style the sheet draws with (training-room §3.3): the wine's own, else
  // what the Bubbles / fortified answers imply, else STILL.
  const shownStyle = effectiveStyle(wine.style, bubbles?.value, fortified?.value);
  const prog = useMemo(
    () => sectionProgress(state, shownStyle),
    [state, shownStyle],
  );
  const sectionScrollMt = belowBar ? SECTION_SCROLL_MT_BELOW_BAR : SECTION_SCROLL_MT;
  const showAside = !embedded && aside !== null;
  const bubbleLabels: Record<string, string> = {
    NONE: t("bubbles_none"),
    SPARKLING: t("bubbles_sparkling"),
  };
  // With the fortified toggle the alcohol row names its fourth stop; the rest
  // of the labels are the scale's own.
  const alcoholLabels = fortified ? { ...L, FORTIFIED: t("fortified_stop") } : L;
  const alcoholValue = fortified ? alcoholShown(state.alcohol, fortified.value) : state.alcohol;
```

- [ ] **Step 9: WsetSheet — save without onSave, close without the confirm.** Replace lines 324–345
```tsx
  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      await onSave(state);
      setBaseline(state);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2200);
    } catch {
      setSaveState("error");
    }
  }, [onSave, state]);

  const saveLabel =
    saveState === "saving" ? t("saving")
    : saveState === "saved" ? t("saved")
    : saveState === "error" ? t("retry_save")
    : t("save_note");

  const discard = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else onDiscard?.();
  }, [dirty, onDiscard]);
```
with
```tsx
  const handleSave = useCallback(async () => {
    // Only reachable with a Save button, which renders only without a
    // footerAction — and then onSave is required by the prop types.
    if (!onSave) return;
    setSaveState("saving");
    try {
      await onSave(state);
      setBaseline(state);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2200);
    } catch {
      setSaveState("error");
    }
  }, [onSave, state]);

  const saveLabel =
    saveState === "saving" ? t("saving")
    : saveState === "saved" ? t("saved")
    : saveState === "error" ? t("retry_save")
    : t("save_note");

  // `onClose` exits at once (the caller keeps the note, e.g. the training
  // room's on-device draft); otherwise a dirty note asks before discarding.
  const discard = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    if (dirty) setConfirmDiscard(true);
    else onDiscard?.();
  }, [dirty, onClose, onDiscard]);
  const closable = onClose !== undefined || onDiscard !== undefined;
```

- [ ] **Step 10: WsetSheet — the header's ✕ and Close follow `closable`.** Replace (line 414)
```tsx
          {onDiscard ? (
            <button
              type="button"
              aria-label={t("close")}
```
with
```tsx
          {closable ? (
            <button
              type="button"
              aria-label={t("close")}
```
and replace (line 461)
```tsx
          {onDiscard ? (
            // Always "Close": a clean note exits, a dirty one asks first (the
```
with
```tsx
          {closable ? (
            // Always "Close": a clean note exits, a dirty one asks first (the
```

- [ ] **Step 11: WsetSheet — `belowBar` inside the sticky bar.** Replace lines 564–569
```tsx
                  {complete ? "✓" : `${s.done}/${s.total}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
```
with
```tsx
                  {complete ? "✓" : `${s.done}/${s.total}`}
                </span>
              </button>
            );
          })}
        </div>
        {/* Inside the sticky bar, so it sticks with the tabs (the training
            room's "Top match" strip below lg). Rendered bare: spacing is the
            caller's; sectionScrollMt allows its 44px. */}
        {belowBar}
      </div>
```

- [ ] **Step 12: WsetSheet — `aside`.** Replace lines 577–590
```tsx
          "grid grid-cols-1 items-start gap-6",
          !embedded && "lg:grid-cols-[264px_minmax(0,1fr)]",
          // The modal scrolls HERE, between the anchored header and footer.
          embedded && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4",
        )}
      >
        {embedded ? null : (
        <aside className="sticky top-[114px] hidden flex-col gap-4 lg:flex">
          <LiveTastingNote sections={noteSections} heading={t("tasting_note_live")} emptyText={t("note_empty")} />
          <p style={{ fontSize: 10.5, color: "var(--placeholder)" }}>
            {t("footer_wset")}
          </p>
        </aside>
        )}
```
with
```tsx
          "grid grid-cols-1 items-start gap-6",
          showAside && "lg:grid-cols-[264px_minmax(0,1fr)]",
          // The modal scrolls HERE, between the anchored header and footer.
          embedded && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4",
        )}
      >
        {showAside ? (
          <aside className="sticky top-[114px] hidden flex-col gap-4 lg:flex">
            {aside === undefined ? (
              <>
                <LiveTastingNote sections={noteSections} heading={t("tasting_note_live")} emptyText={t("note_empty")} />
                <p style={{ fontSize: 10.5, color: "var(--placeholder)" }}>
                  {t("footer_wset")}
                </p>
              </>
            ) : (
              aside
            )}
          </aside>
        ) : null}
```

- [ ] **Step 13: WsetSheet — section scroll margin.** Use the Edit tool with `replace_all: true`: replace `className={cn(SECTION_SCROLL_MT, ` with `className={cn(sectionScrollMt, ` (four occurrences: lines 593, 610, 631, 691).

- [ ] **Step 14: WsetSheet — the Bubbles row.** Replace lines 602–604
```tsx
            <Row label={t("colour")} value={valueLabel(state.colourHue, L)}>
              <WineColourControl colour={wine.colour} hue={state.colourHue} onChange={(v) => set("colourHue", v)} labels={L} lang={lang} />
            </Row>
```
with
```tsx
            <Row label={t("colour")} value={valueLabel(state.colourHue, L)}>
              <WineColourControl colour={wine.colour} hue={state.colourHue} onChange={(v) => set("colourHue", v)} labels={L} lang={lang} />
            </Row>
            {bubbles ? (
              // Training room (D19): tri-state — neither pill is "not
              // answered"; a second tap clears. "Sparkling" switches the mousse
              // row on; leaving it drops a mousse the wine no longer has.
              <Row label={t("bubbles")} value={valueLabel(bubblesPill(bubbles.value), bubbleLabels)}>
                <PillGroup
                  options={BUBBLES_OPTIONS}
                  labels={bubbleLabels}
                  value={bubblesPill(bubbles.value)}
                  onChange={(v) => {
                    const next = bubblesFromPill(v);
                    bubbles.onChange(next);
                    const mousse = mousseAfterBubbles(wine.style, next, fortified?.value ?? null, state.mousse);
                    if (mousse !== state.mousse) set("mousse", mousse);
                  }}
                />
              </Row>
            ) : null}
```

- [ ] **Step 15: WsetSheet — the alcohol row and the mousse row.** Replace lines 649–661
```tsx
              <Row label={t("alcohol")} value={valueLabel(state.alcohol, L)}>
                <SnapSlider
                  stops={wine.style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS}
                  labels={L}
                  value={state.alcohol}
                  onChange={(v) => set("alcohol", v)}
                />
              </Row>
              <Row label={t("body")} value={valueLabel(state.body, L)}>
                <SnapSlider stops={BODY_STOPS} labels={L} value={state.body} onChange={(v) => set("body", v)} />
              </Row>
            </RowPair>
            {wine.style === "SPARKLING" ? (
```
with
```tsx
              <Row label={t("alcohol")} value={valueLabel(alcoholValue, alcoholLabels)}>
                <SnapSlider
                  stops={alcoholStopsFor(shownStyle, fortified !== undefined)}
                  labels={alcoholLabels}
                  value={alcoholValue}
                  onChange={(v) => {
                    // The fourth stop writes HIGH + fortified; any other stop
                    // is that level and not fortified (D19).
                    const pick = alcoholPick(v);
                    set("alcohol", pick.alcohol);
                    fortified?.onChange(pick.fortified);
                  }}
                />
              </Row>
              <Row label={t("body")} value={valueLabel(state.body, L)}>
                <SnapSlider stops={BODY_STOPS} labels={L} value={state.body} onChange={(v) => set("body", v)} />
              </Row>
            </RowPair>
            {shownStyle === "SPARKLING" ? (
```

- [ ] **Step 16: WsetSheet — the footer.** Replace lines 751–753
```tsx
          <p className="mt-1 text-[10.5px] leading-[1.45] text-muted-foreground">
            {t("nothing_required")}
          </p>
```
with
```tsx
          {footerAction ? null : (
            <p className="mt-1 text-[10.5px] leading-[1.45] text-muted-foreground">
              {t("nothing_required")}
            </p>
          )}
```
and replace lines 772–786
```tsx
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving"}
            className={cn(
              "min-h-11 rounded-[10px] p-[13px] text-[14px] font-semibold whitespace-nowrap shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors disabled:opacity-70 max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[19px] sm:py-[11px] sm:text-[13.5px]",
              // Ink on the gold "Saved" fill (6.5:1), like every bg-gold button
              // in the app; parchment is only for text on bordeaux.
              saveState === "saved"
                ? "bg-gold text-foreground hover:bg-gold-deep"
                : PRIMARY_BUTTON,
            )}
          >
            {saveLabel}
          </button>
```
with
```tsx
          {footerAction ? (
            // The training room's "Your call →" in place of Save, at every
            // section (spec §3.3).
            <button
              type="button"
              onClick={footerAction.onClick}
              className={cn(
                "min-h-11 rounded-[10px] p-[13px] text-[14px] font-semibold whitespace-nowrap shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[19px] sm:py-[11px] sm:text-[13.5px]",
                PRIMARY_BUTTON,
              )}
            >
              {footerAction.label}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === "saving"}
              className={cn(
                "min-h-11 rounded-[10px] p-[13px] text-[14px] font-semibold whitespace-nowrap shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors disabled:opacity-70 max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[19px] sm:py-[11px] sm:text-[13.5px]",
                // Ink on the gold "Saved" fill (6.5:1), like every bg-gold button
                // in the app; parchment is only for text on bordeaux.
                saveState === "saved"
                  ? "bg-gold text-foreground hover:bg-gold-deep"
                  : PRIMARY_BUTTON,
              )}
            >
              {saveLabel}
            </button>
          )}
```

- [ ] **Step 17: Confirm nothing still names the removed identifiers**

`cd /c/Users/Public/repos/blindtastingapp-training && grep -n "SECTION_SCROLL_MT,\|wine.style ===\|ALCOHOL_STOPS\|{onDiscard ? (" src/components/wset/wset-sheet.tsx`

Expected: no output (every use now goes through `sectionScrollMt`, `shownStyle`, `alcoholStopsFor` and `closable`).

- [ ] **Step 18: Run the gates**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset src/app/taste src/app/catalog && npx tsc --noEmit && npx eslint src/components/wset/wset-sheet.tsx src/lib/wset/sheet-extras.ts src/lib/wset/sheet-extras.test.ts src/lib/wset/i18n.ts
```

Expected: vitest — every file passes (sheet-extras 10 new; vocab, note-summary, hidden-note and both parity suites unchanged); `tsc` exits 0 (NoteEditor's `onSave` satisfies the first `WsetSaveProps` branch); eslint prints no problems.

- [ ] **Step 19: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/wset/sheet-extras.ts src/lib/wset/sheet-extras.test.ts src/lib/wset/i18n.ts src/components/wset/wset-sheet.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): WsetSheet onChange, footer action, below-bar slot, aside, bubbles and the fortified stop" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: ArchetypeSheet answers, idPrefix and lineage; fetchArchetype and the Library cards tolerate a null place; candidateToArchetypeView

**Files:**
- Create: `src/lib/wset/archetype-scale.ts`
- Test: `src/lib/wset/archetype-scale.test.ts`
- Create: `src/lib/training/archetype-view.ts`
- Test: `src/lib/training/archetype-view.test.ts`
- Modify: `src/lib/wset/i18n.ts` (UI_EN after line 354 `typical_range`; UI_DA after line 562 `typical_range` — line numbers before Task 5's inserts; locate by the anchor string)
- Modify: `src/components/wset/snap-slider.tsx` (lines 258–262)
- Modify (full rewrite): `src/components/wset/archetype-sheet.tsx`
- Modify (full rewrite): `src/lib/wset/archetype-detail.ts`
- Modify: `src/lib/wset/archetype-detail.test.ts`
- Modify: `src/app/knowledge/designations/page.tsx` (lines 23–72)
- Modify: `src/app/knowledge/archetypes/archetype-browser.tsx` (lines 7–13, 44–46)

**Interfaces:**
- Consumes:
  - Task 1: `database.types.ts` `wine_archetypes.Row` with `wine_place_id: string | null`, `country_id: string`, `region_id: string`, `appellation_id: string`, `primary_grape_id: string` (non-null), `secondary_grape_id: string | null`.
  - Task 2: `src/lib/training/types.ts` — `Named`, `TrainingCandidate`; `src/lib/training/copy.ts` — `lineageLine(c: TrainingCandidate): string` (pure, relative imports).
  - Existing: `justTheRegionOption(region, rows)` from `src/components/add-wine/self-named-appellation.ts`.
- Produces:
  - `src/lib/wset/archetype-scale.ts`: `type ArchetypeScale` (the twelve matched keys), `type ArchetypeAnswers = Partial<Record<ArchetypeScale, string | null>>`, `APPEARANCE_INTENSITY_LADDER`, `SWEETNESS_LADDER`, `archetypeScale(scale, a: { colour; style; sat }): { stops: readonly string[]; range: [string, string] | undefined }`.
  - `ArchetypeView` = `{ name; colour; style; placeName: string | null; lineage: string; grapes; description; qualityLow; qualityHigh; sat; aromas; flavours }`.
  - `ArchetypeSheet({ a, answers?, idPrefix? })` — `idPrefix` (default `""`) prefixes the four section ids, so the sheet can sit on a page that already renders `WsetSheet`'s `appearance`/`nose`/`palate`/`conclusions`; `answers` draws each answer as a ring on its range and adds "you: {value}" to the row.
  - `src/lib/training/archetype-view.ts`: `candidateToArchetypeView(c: TrainingCandidate): ArchetypeView`; `lineageForParts(p: LineageParts): string`; `isRegionalAppellation(region: Named, appellation: Named): boolean`; `type LineageParts`.
  - `SnapSlider` in range mode draws `value` as an answer ring when it is on `stops`.

- [ ] **Step 1: Write the failing test for the display ladders** — create `src/lib/wset/archetype-scale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeT, uiStrings } from "./i18n";
import {
  APPEARANCE_INTENSITY_LADDER,
  SWEETNESS_LADDER,
  archetypeScale,
} from "./archetype-scale";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "./vocab";

// Training-room spec §4.4: a range may use an enum value the note slider does
// not offer (batch 1's Pauillac appearance [MEDIUM_PLUS, DEEP]). The read-only
// sheet draws such a scale on its full enum ladder; a range the slider can
// already show is drawn exactly as before.
const red = (sat: Record<string, [string, string] | undefined>) => ({ colour: "RED" as const, style: "STILL" as const, sat });

describe("archetypeScale", () => {
  it("a range on the slider's stops is drawn on them, unchanged (the 15 live rows)", () => {
    expect(archetypeScale("appearanceIntensity", red({ appearanceIntensity: ["PALE", "MEDIUM"] }))).toEqual({
      stops: APPEARANCE_INTENSITY_STOPS,
      range: ["PALE", "MEDIUM"],
    });
    expect(archetypeScale("tannin", red({ tannin: ["MEDIUM_PLUS", "HIGH"] }))).toEqual({ stops: LEVEL_STOPS, range: ["MEDIUM_PLUS", "HIGH"] });
  });
  it("an appearance bound the slider lacks moves the scale onto the five-step enum ladder", () => {
    expect(APPEARANCE_INTENSITY_LADDER).toEqual(["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"]);
    expect(archetypeScale("appearanceIntensity", red({ appearanceIntensity: ["MEDIUM_PLUS", "DEEP"] }))).toEqual({
      stops: APPEARANCE_INTENSITY_LADDER,
      range: ["MEDIUM_PLUS", "DEEP"],
    });
  });
  it("sweetness MEDIUM (not on the slider) uses the seven-step ladder; a slider range keeps the six stops", () => {
    expect(SWEETNESS_LADDER).toEqual(["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"]);
    expect(archetypeScale("sweetness", red({ sweetness: ["DRY", "MEDIUM"] })).stops).toBe(SWEETNESS_LADDER);
    expect(archetypeScale("sweetness", { colour: "WHITE", style: "SWEET", sat: { sweetness: ["SWEET", "LUSCIOUS"] } }).stops).toBe(SWEETNESS_STOPS);
  });
  it("hue is drawn on the archetype colour's hues; a hue off that colour is not drawn", () => {
    expect(archetypeScale("colourHue", red({ colourHue: ["RUBY", "GARNET"] }))).toEqual({ stops: HUES_BY_COLOUR.RED, range: ["RUBY", "GARNET"] });
    expect(archetypeScale("colourHue", { colour: "WHITE", style: "STILL", sat: { colourHue: ["RUBY", "RUBY"] } }).range).toBeUndefined();
  });
  it("alcohol: three stops unfortified, five fortified; an unfortified five-step bound is still drawn", () => {
    expect(archetypeScale("alcohol", red({ alcohol: ["MEDIUM", "HIGH"] })).stops).toBe(ALCOHOL_STOPS);
    expect(archetypeScale("alcohol", { colour: "RED", style: "FORTIFIED", sat: { alcohol: ["MEDIUM_PLUS", "HIGH"] } }).stops).toBe(FORTIFIED_ALCOHOL_STOPS);
    expect(archetypeScale("alcohol", red({ alcohol: ["MEDIUM_PLUS", "HIGH"] }))).toEqual({ stops: FORTIFIED_ALCOHOL_STOPS, range: ["MEDIUM_PLUS", "HIGH"] });
  });
  it("a scale the archetype lacks, or a bound on no ladder, is not drawn ('Varies')", () => {
    expect(archetypeScale("tannin", { colour: "WHITE", style: "STILL", sat: {} })).toEqual({ stops: LEVEL_STOPS, range: undefined });
    expect(archetypeScale("tannin", red({ tannin: ["LOUD", "HIGH"] })).range).toBeUndefined();
  });
  it("mousse is drawn on its three values", () => {
    expect(archetypeScale("mousse", { colour: "WHITE", style: "SPARKLING", sat: { mousse: ["DELICATE", "CREAMY"] } })).toEqual({
      stops: ["DELICATE", "CREAMY", "AGGRESSIVE"],
      range: ["DELICATE", "CREAMY"],
    });
  });
  it("the answer line exists in English and Danish", () => {
    expect(makeT("en")("your_answer", { value: "high" })).toBe("you: high");
    expect(uiStrings("da").your_answer).toBe("dig: {value}");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/archetype-scale.test.ts`

Expected: FAIL — `Failed to resolve import "./archetype-scale"`.

- [ ] **Step 3: Write the module** — create `src/lib/wset/archetype-scale.ts`:

```ts
// Which ladder an archetype's range is drawn on in the read-only archetype
// sheet (training-room spec §4.4). A range whose bounds are both on the note
// slider's stops is drawn on those stops, exactly as before; a bound the
// slider does not offer (batch 1's appearance [MEDIUM_PLUS, DEEP], a sweetness
// of MEDIUM) moves that one scale onto its full enum ladder; a bound on
// neither is not drawn, and the sheet says "Varies".
//
// Pure: relative runtime imports only, so vitest (no `@/` alias) can load it.
import type { WineColour, WineStyle } from "./types";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "./vocab";

/** The SAT keys an archetype carries a range for (spec §4.4; clarity is not drawn). */
export type ArchetypeScale =
  | "appearanceIntensity"
  | "colourHue"
  | "noseIntensity"
  | "development"
  | "sweetness"
  | "acidity"
  | "tannin"
  | "alcohol"
  | "body"
  | "flavourIntensity"
  | "finish"
  | "mousse";

/** A taster's answers to draw on the ranges; a whole WsetNoteState fits. */
export type ArchetypeAnswers = Partial<Record<ArchetypeScale, string | null>>;

type Range = [string, string];

// The full Postgres enum orders (wset_appearance_intensity, wset_sweetness —
// read live 2026-09-25); the other graded scales' sliders already offer every
// value.
export const APPEARANCE_INTENSITY_LADDER: readonly string[] = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
export const SWEETNESS_LADDER: readonly string[] = ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"];
const MOUSSE_STOPS: readonly string[] = ["DELICATE", "CREAMY", "AGGRESSIVE"];

function laddersFor(
  scale: ArchetypeScale,
  colour: WineColour,
  style: WineStyle,
): { slider: readonly string[]; ladder: readonly string[] } {
  switch (scale) {
    case "appearanceIntensity":
      return { slider: APPEARANCE_INTENSITY_STOPS, ladder: APPEARANCE_INTENSITY_LADDER };
    case "colourHue":
      return { slider: HUES_BY_COLOUR[colour], ladder: HUES_BY_COLOUR[colour] };
    case "noseIntensity":
    case "flavourIntensity":
      return { slider: INTENSITY_STOPS, ladder: INTENSITY_STOPS };
    case "development":
      return { slider: DEVELOPMENT_STOPS, ladder: DEVELOPMENT_STOPS };
    case "sweetness":
      return { slider: SWEETNESS_STOPS, ladder: SWEETNESS_LADDER };
    case "acidity":
    case "tannin":
      return { slider: LEVEL_STOPS, ladder: LEVEL_STOPS };
    case "alcohol":
      // A fortified archetype is written on the five-stop ladder (D19); an
      // unfortified bound off the three stops is still worth drawing there.
      return style === "FORTIFIED"
        ? { slider: FORTIFIED_ALCOHOL_STOPS, ladder: FORTIFIED_ALCOHOL_STOPS }
        : { slider: ALCOHOL_STOPS, ladder: FORTIFIED_ALCOHOL_STOPS };
    case "body":
      return { slider: BODY_STOPS, ladder: BODY_STOPS };
    case "finish":
      return { slider: FINISH_STOPS, ladder: FINISH_STOPS };
    case "mousse":
      return { slider: MOUSSE_STOPS, ladder: MOUSSE_STOPS };
    default: {
      const unknown: never = scale;
      throw new Error(`Unknown archetype scale: ${String(unknown)}`);
    }
  }
}

/** The stops a scale is drawn on, and the range to draw (undefined: "Varies"). */
export function archetypeScale(
  scale: ArchetypeScale,
  a: { colour: WineColour; style: WineStyle; sat: Record<string, Range | undefined> },
): { stops: readonly string[]; range: Range | undefined } {
  const { slider, ladder } = laddersFor(scale, a.colour, a.style);
  const range = a.sat[scale];
  if (!range) return { stops: slider, range: undefined };
  const holds = (stops: readonly string[]) => stops.includes(range[0]) && stops.includes(range[1]);
  if (holds(slider)) return { stops: slider, range };
  if (holds(ladder)) return { stops: ladder, range };
  return { stops: slider, range: undefined };
}
```

- [ ] **Step 4: Add `your_answer` to both dictionaries** — in `src/lib/wset/i18n.ts`:

Replace (UI_EN)
```ts
  typical_range: "typical range",
```
with
```ts
  typical_range: "typical range",
  // training room: the taster's own answer beside an archetype's range
  your_answer: "you: {value}",
```
Replace (UI_DA)
```ts
  typical_range: "typisk interval",
```
with
```ts
  typical_range: "typisk interval",
  your_answer: "dig: {value}",
```

- [ ] **Step 5: Run the test**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/archetype-scale.test.ts src/app/taste/taste-archive-math.test.ts`

Expected: PASS — archetype-scale 8 passed; the parity suite still passes.

- [ ] **Step 6: SnapSlider draws an answer on a range.** In `src/components/wset/snap-slider.tsx` replace lines 258–263
```tsx
                  }}
                />
              ) : null}
            </div>
            {interactive ? (
```
with
```tsx
                  }}
                />
              ) : null}
              {range !== null && index !== null && index >= 0 ? (
                // Read-only range mode with a value: the taster's own answer
                // (training room), a gold ring over the band so it reads in or
                // out of the typical range. A value off these stops draws none.
                <div
                  aria-hidden
                  data-slot="range-answer"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: `${pct(index)}%`,
                    transform: "translate(-50%, -50%)",
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    pointerEvents: "none",
                    zIndex: 1,
                    background: "var(--card)",
                    border: "3px solid var(--gold-dark)",
                  }}
                />
              ) : null}
            </div>
            {interactive ? (
```

- [ ] **Step 7: Rewrite `src/components/wset/archetype-sheet.tsx`** (full file):

```tsx
"use client";

import type { WineColour, WineStyle } from "@/lib/wset/types";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import {
  archetypeScale,
  type ArchetypeAnswers,
  type ArchetypeScale,
} from "@/lib/wset/archetype-scale";
import { SnapSlider } from "./snap-slider";
import { Row, SectionCard } from "./wset-sheet";
import { AromaIcon } from "./aroma-icon";
import { useWsetLang } from "@/lib/wset/wset-lang";
import {
  makeT,
  labelsFor,
  translateTerm,
  translateBand,
  type WsetLang,
} from "@/lib/wset/i18n";

type Range = [string, string];

export type { ArchetypeAnswers };

export type ArchetypeView = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  /** The map place's name; null when the archetype has none (training-room D9). */
  placeName: string | null;
  /** "Pauillac · Bordeaux, France · Cabernet Sauvignon, Merlot" (D11), so no
      appellation is a bare word. */
  lineage: string;
  grapes: string;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: Record<string, Range | undefined>;
  aromas: string[];
  flavours: string[];
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

// Read-only band on the same slider used in the editable sheet, with the
// taster's answer (if any) drawn on it. Module-level (not declared inside
// ArchetypeSheet's render) so React keeps one component identity across
// renders — the react-hooks/static-components rule.
function RangeSlider({
  stops,
  range,
  value,
  labels,
  variesText,
}: {
  stops: readonly string[];
  range: Range | undefined;
  value: string | null;
  labels: Record<string, string>;
  variesText: string;
}) {
  if (!range)
    return <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{variesText}</p>;
  return (
    <SnapSlider
      stops={stops}
      labels={labels}
      value={value}
      range={range as readonly [string, string]}
      readOnly
    />
  );
}

// Read-only aroma / flavour pills, shared by the Nose and Palate sections.
// The icon keeps the English term (its identity); the text is translated.
function AromaPills({ terms, lang }: { terms: string[]; lang: WsetLang }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {terms.map((term) => (
        <span
          key={term}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            borderRadius: 999,
            padding: "4px 11px",
            fontSize: 12.5,
            background: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          <AromaIcon term={term} family="" size={17} />
          {translateTerm(term, lang)}
        </span>
      ))}
    </div>
  );
}

// The map's "a typical wine from here" — the WSET sheet's look, read-only, with
// each scale drawn as its low→high band. Language follows the shared sheet
// toggle; `L`/`lang` are passed down to the read-only helpers explicitly.
//
// Training room (spec §3.3, §7.2): `answers` draws the taster's answers on the
// ranges ("you: high" beside each band), and `idPrefix` keeps the four section
// ids unique on a page that also renders WsetSheet's own sections.
export function ArchetypeSheet({
  a,
  answers,
  idPrefix = "",
}: {
  a: ArchetypeView;
  answers?: ArchetypeAnswers;
  idPrefix?: string;
}) {
  const { lang } = useWsetLang();
  const t = makeT(lang);
  const L = labelsFor(lang);
  const varies = t("varies");

  // A low→high band as words, in the active language.
  const rangeLabel = (r: Range | undefined): string => {
    if (!r) return "—";
    return r[0] === r[1]
      ? L[r[0]] ?? r[0]
      : `${L[r[0]] ?? r[0]} → ${L[r[1]] ?? r[1]}`;
  };
  const answerOf = (key: ArchetypeScale): string | null => answers?.[key] ?? null;
  // The row's sub line: the typical band, then the taster's answer if any.
  const sub = (key: ArchetypeScale): string => {
    const base = rangeLabel(archetypeScale(key, a).range);
    const value = answerOf(key);
    return value ? `${base} · ${t("your_answer", { value: L[value] ?? value })}` : base;
  };
  const band = (key: ArchetypeScale) => {
    const s = archetypeScale(key, a);
    return <RangeSlider stops={s.stops} range={s.range} value={answerOf(key)} labels={L} variesText={varies} />;
  };

  const q =
    a.qualityLow != null && a.qualityHigh != null
      ? `${a.qualityLow}–${a.qualityHigh} · ${translateBand(qualityBand(a.qualityHigh), lang)}`
      : "—";
  // D11: the lineage names where it is from and its grapes; a view without
  // one falls back to the place and the grapes.
  const where = a.lineage || [a.placeName, a.grapes].filter(Boolean).join(" · ");

  return (
    <div style={{ color: "var(--foreground)" }}>
      <div style={{ marginBottom: 16 }}>
        <span className="font-heading" style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)" }}>
          {a.name}
        </span>
        <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 2 }}>
          {where ? `${where} · ` : ""}
          {cap(L[a.colour] ?? a.colour)} · {cap(L[a.style] ?? a.style)} — {t("typical_profile")}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <SectionCard id={`${idPrefix}appearance`} numeral="I" title={t("appearance")} rated={t("typical")}>
          <Row label={t("intensity")} sub={sub("appearanceIntensity")}>
            {band("appearanceIntensity")}
          </Row>
          <Row label={t("colour")} sub={sub("colourHue")}>
            {band("colourHue")}
          </Row>
        </SectionCard>

        <SectionCard id={`${idPrefix}nose`} numeral="II" title={t("nose")} rated={t("typical")}>
          <Row label={t("intensity")} sub={sub("noseIntensity")}>
            {band("noseIntensity")}
          </Row>
          <Row label={t("development")} sub={sub("development")}>
            {band("development")}
          </Row>
          {a.aromas.length > 0 ? (
            <Row wide label={t("aroma_characteristics")} sub={t("typical")}>
              <AromaPills terms={a.aromas} lang={lang} />
            </Row>
          ) : null}
        </SectionCard>

        <SectionCard id={`${idPrefix}palate`} numeral="III" title={t("palate")} rated={t("typical")}>
          <Row label={t("sweetness")} sub={sub("sweetness")}>
            {band("sweetness")}
          </Row>
          <Row label={t("acidity")} sub={sub("acidity")}>
            {band("acidity")}
          </Row>
          <Row label={t("tannin")} sub={sub("tannin")}>
            {band("tannin")}
          </Row>
          {a.style === "SPARKLING" && a.sat.mousse ? (
            <Row label={t("mousse")} sub={t("sparkling")}>
              <span style={{ fontSize: 13, color: "var(--foreground)" }}>{sub("mousse")}</span>
            </Row>
          ) : null}
          <Row label={t("alcohol")} sub={sub("alcohol")}>
            {band("alcohol")}
          </Row>
          <Row label={t("body")} sub={sub("body")}>
            {band("body")}
          </Row>
          <Row label={t("flavour_intensity")} sub={sub("flavourIntensity")}>
            {band("flavourIntensity")}
          </Row>
          {a.flavours.length > 0 ? (
            <Row wide label={t("flavour_characteristics")} sub={t("typical")}>
              <AromaPills terms={a.flavours} lang={lang} />
            </Row>
          ) : null}
          <Row label={t("finish")} sub={sub("finish")}>
            {band("finish")}
          </Row>
        </SectionCard>

        <SectionCard id={`${idPrefix}conclusions`} numeral="IV" title={t("conclusions")} rated={t("typical")}>
          <Row label={t("quality")} sub={t("typical_range")}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{q}</span>
          </Row>
          {a.description ? (
            <Row wide label={t("in_a_nutshell")}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--foreground)" }}>{a.description}</p>
            </Row>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Write the failing test for the candidate view** — create `src/lib/training/archetype-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { candidateToArchetypeView, isRegionalAppellation, lineageForParts } from "./archetype-view";
import { lineageLine } from "./copy";
import type { TrainingCandidate } from "./types";

// Training-room spec §4.6 and D11: the detail sheet's view of a candidate, and
// the lineage line — the same line whether it is built from a pool candidate
// or from an archetype's reference ids (the Library, the map's sheet).
const pauillac: TrainingCandidate = {
  id: "a-pauillac",
  name: "A typical Pauillac",
  description: "Cassis and cedar over firm tannin.",
  colour: "RED",
  style: "STILL",
  country: { id: "c-fr", name: "France" },
  region: { id: "r-bdx", name: "Bordeaux" },
  appellation: { id: "ap-pauillac", name: "Pauillac", isRegional: false },
  primaryGrape: { id: "g-cs", name: "Cabernet Sauvignon" },
  secondaryGrape: { id: "g-me", name: "Merlot" },
  designations: [],
  typicalAge: [8, 30],
  sat: { tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] },
  aromas: [
    { termId: "t-cassis", term: "blackcurrant", group: "Black fruit", kind: "NOSE", signature: true },
    { termId: "t-cedar", term: "cedar", group: "Oak", kind: "NOSE", signature: true },
    { termId: "t-cassis", term: "blackcurrant", group: "Black fruit", kind: "PALATE", signature: false },
  ],
  placeCanonicalKey: "france.bordeaux.haut-medoc.pauillac",
  qualityLow: 89,
  qualityHigh: 98,
};

const bourgogne: TrainingCandidate = {
  ...pauillac,
  id: "a-cdn",
  name: "A typical Côte de Nuits red",
  region: { id: "r-bourgogne", name: "Bourgogne" },
  appellation: { id: "ap-bourgogne", name: "Bourgogne AOC", isRegional: true },
  primaryGrape: { id: "g-pn", name: "Pinot Noir" },
  secondaryGrape: null,
  aromas: [],
  placeCanonicalKey: null,
};

describe("candidateToArchetypeView", () => {
  it("builds the sheet's view: lineage as the place line, grapes, nose and palate terms", () => {
    expect(candidateToArchetypeView(pauillac)).toEqual({
      name: "A typical Pauillac",
      colour: "RED",
      style: "STILL",
      placeName: "Pauillac · Bordeaux, France · Cabernet Sauvignon, Merlot",
      lineage: "Pauillac · Bordeaux, France · Cabernet Sauvignon, Merlot",
      grapes: "Cabernet Sauvignon · Merlot",
      description: "Cassis and cedar over firm tannin.",
      qualityLow: 89,
      qualityHigh: 98,
      sat: { tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] },
      aromas: ["blackcurrant", "cedar"],
      flavours: ["blackcurrant"],
    });
  });
  it("uses copy.ts's lineageLine, so the room and the sheet never disagree", () => {
    expect(candidateToArchetypeView(pauillac).lineage).toBe(lineageLine(pauillac));
    expect(candidateToArchetypeView(bourgogne).lineage).toBe(lineageLine(bourgogne));
  });
  it("a regional appellation leaves the appellation out; no place and no aromas are fine", () => {
    const view = candidateToArchetypeView(bourgogne);
    expect(view.lineage).toBe("Bourgogne, France · Pinot Noir");
    expect([view.grapes, view.aromas, view.flavours]).toEqual(["Pinot Noir", [], []]);
  });
});

describe("isRegionalAppellation", () => {
  it("is the region's self-named row, suffix aside", () => {
    expect(isRegionalAppellation({ id: "r", name: "Bourgogne" }, { id: "a", name: "Bourgogne AOC" })).toBe(true);
    expect(isRegionalAppellation({ id: "r", name: "Bourgogne" }, { id: "a", name: "Bourgogne Aligoté AOC" })).toBe(false);
    expect(isRegionalAppellation({ id: "r", name: "Bordeaux" }, { id: "a", name: "Pauillac AOC" })).toBe(false);
  });
});

describe("lineageForParts", () => {
  it("formats reference names exactly as lineageLine formats a candidate", () => {
    expect(
      lineageForParts({
        country: pauillac.country,
        region: pauillac.region,
        appellation: { id: "ap-pauillac", name: "Pauillac" },
        primaryGrape: pauillac.primaryGrape,
        secondaryGrape: pauillac.secondaryGrape,
      }),
    ).toBe(lineageLine(pauillac));
    expect(
      lineageForParts({
        country: bourgogne.country,
        region: bourgogne.region,
        appellation: { id: "ap-bourgogne", name: "Bourgogne AOC" },
        primaryGrape: bourgogne.primaryGrape,
        secondaryGrape: null,
      }),
    ).toBe("Bourgogne, France · Pinot Noir");
  });
});
```

- [ ] **Step 9: Run it and watch it fail**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/archetype-view.test.ts`

Expected: FAIL — `Failed to resolve import "./archetype-view"`.

- [ ] **Step 10: Write the module** — create `src/lib/training/archetype-view.ts`:

```ts
// The read-only archetype sheet's view of a training-room candidate, and the
// lineage line for an archetype read straight from its reference ids (the
// Library cards, the map's archetype sheet). Training-room spec §4.6, D11.
//
// Pure: relative runtime imports only (vitest has no `@/` alias), so the
// room's client detail sheet and a server page can both use it. pool.ts is
// server-only, which is why this lives here and not there.
import type { ArchetypeView } from "@/components/wset/archetype-sheet";
import { justTheRegionOption } from "../../components/add-wine/self-named-appellation";
import { lineageLine } from "./copy";
import type { Named, TrainingCandidate } from "./types";

/** The reference names a lineage line is made of. */
export type LineageParts = {
  country: Named;
  region: Named;
  appellation: Named;
  primaryGrape: Named;
  secondaryGrape: Named | null;
};

/** The region's own self-named appellation ("Bourgogne AOC" for Bourgogne):
    the lineage then leaves the appellation out (spec §4.6). */
export function isRegionalAppellation(region: Named, appellation: Named): boolean {
  return justTheRegionOption(region, [appellation]) !== null;
}

/**
 * The lineage line from reference names. It goes through copy.ts's
 * lineageLine on purpose: lineageLine reads only the place, grape names and
 * `isRegional`, so the rest of this shell is inert, and the two can never
 * format a lineage differently.
 */
export function lineageForParts(p: LineageParts): string {
  return lineageLine({
    id: "",
    name: "",
    description: null,
    colour: "RED",
    style: "STILL",
    country: p.country,
    region: p.region,
    appellation: { ...p.appellation, isRegional: isRegionalAppellation(p.region, p.appellation) },
    primaryGrape: p.primaryGrape,
    secondaryGrape: p.secondaryGrape,
    designations: [],
    typicalAge: null,
    sat: {},
    aromas: [],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  });
}

/** The ArchetypeSheet view of a pool candidate; its place line is the lineage. */
export function candidateToArchetypeView(c: TrainingCandidate): ArchetypeView {
  const lineage = lineageLine(c);
  return {
    name: c.name,
    colour: c.colour,
    style: c.style,
    placeName: lineage,
    lineage,
    grapes: [c.primaryGrape.name, c.secondaryGrape?.name]
      .filter((g): g is string => Boolean(g))
      .join(" · "),
    description: c.description,
    qualityLow: c.qualityLow,
    qualityHigh: c.qualityHigh,
    sat: c.sat,
    aromas: c.aromas.filter((x) => x.kind === "NOSE").map((x) => x.term),
    flavours: c.aromas.filter((x) => x.kind === "PALATE").map((x) => x.term),
  };
}
```

- [ ] **Step 11: Run it**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/archetype-view.test.ts`

Expected: PASS — 5 passed. (If the lineage assertions fail while the `lineageLine` equality ones pass, Task 2's `lineageLine` does not follow spec §9 / D11 — fix `copy.ts`, not this module.)

- [ ] **Step 12: Update the fetchArchetype test first** — in `src/lib/wset/archetype-detail.test.ts`:

Replace lines 5–7
```ts
import { describe, expect, it } from "vitest";
import { fetchArchetype } from "./archetype-detail";
import { stubClient, type RecordedQuery } from "../testing/stub-postgrest";
```
with
```ts
import { describe, expect, it } from "vitest";
import { fetchArchetype } from "./archetype-detail";
import { lineageForParts } from "../training/archetype-view";
import { stubClient, type RecordedQuery } from "../testing/stub-postgrest";
```

Replace lines 9–51 (the `ARCHETYPE` fixture and `archetypeClient`)
```ts
const ARCHETYPE = {
  id: "a1",
  name: "A typical Chablis",
  colour: "WHITE",
  style: "STILL",
  wine_place_id: "p1",
  primary_grape_id: "g1",
  secondary_grape_id: null,
  description: "Lean and mineral.",
  quality_low: "GOOD",
  quality_high: "VERY_GOOD",
  sat: "DRY",
};

function archetypeClient(overrides?: {
  archetype?: unknown;
  aromas?: Array<{ term_id: string; kind: string }>;
}) {
  const aromas = overrides?.aromas ?? [
    { term_id: "t2", kind: "NOSE" },
    { term_id: "t1", kind: "NOSE" },
    { term_id: "t3", kind: "PALATE" },
  ];
  return stubClient({
    tables: {
      wine_archetypes: () => ({
        data: "archetype" in (overrides ?? {}) ? overrides?.archetype : ARCHETYPE,
        error: null,
      }),
      wine_places: () => ({ data: { name: "Chablis" }, error: null }),
      grapes: () => ({ data: [{ id: "g1", name: "Chardonnay" }], error: null }),
      wine_archetype_aromas: () => ({ data: aromas, error: null }),
```
with
```ts
const ARCHETYPE = {
  id: "a1",
  name: "A typical Chablis",
  colour: "WHITE",
  style: "STILL",
  wine_place_id: "p1",
  country_id: "c1",
  region_id: "r1",
  appellation_id: "ap1",
  primary_grape_id: "g1",
  secondary_grape_id: null,
  description: "Lean and mineral.",
  quality_low: "GOOD",
  quality_high: "VERY_GOOD",
  sat: "DRY",
};

function archetypeClient(overrides?: {
  archetype?: unknown;
  aromas?: Array<{ term_id: string; kind: string }>;
  names?: { region?: string; appellation?: string };
}) {
  const aromas = overrides?.aromas ?? [
    { term_id: "t2", kind: "NOSE" },
    { term_id: "t1", kind: "NOSE" },
    { term_id: "t3", kind: "PALATE" },
  ];
  return stubClient({
    tables: {
      wine_archetypes: () => ({
        data: "archetype" in (overrides ?? {}) ? overrides?.archetype : ARCHETYPE,
        error: null,
      }),
      wine_places: () => ({ data: { name: "Chablis" }, error: null }),
      grapes: () => ({ data: [{ id: "g1", name: "Chardonnay" }], error: null }),
      countries: () => ({ data: { name: "France" }, error: null }),
      regions: () => ({ data: { name: overrides?.names?.region ?? "Bourgogne" }, error: null }),
      appellations: () => ({ data: { name: overrides?.names?.appellation ?? "Chablis AOC" }, error: null }),
      wine_archetype_aromas: () => ({ data: aromas, error: null }),
```

Replace lines 66–99 (the "five requests" and "same view" tests)
```ts
  it("makes exactly five requests, and asks each table once", async () => {
    const { client, calls } = archetypeClient();

    await fetchArchetype(client, "a1");

    expect(calls.queries.map((q) => q.table).sort()).toEqual([
      "grapes",
      "wine_archetype_aromas",
      "wine_archetypes",
      "wine_places",
      "wset_aroma_terms",
    ]);
  });

  it("returns the same view as before: place, grapes and sorted aroma terms", async () => {
    const { client } = archetypeClient();

    const view = await fetchArchetype(client, "a1");

    expect(view).toEqual({
      name: "A typical Chablis",
      colour: "WHITE",
      style: "STILL",
      placeName: "Chablis",
      grapes: "Chardonnay",
      description: "Lean and mineral.",
      qualityLow: "GOOD",
      qualityHigh: "VERY_GOOD",
      sat: "DRY",
      // Sorted by the terms' own sort_order, not by link order.
      aromas: ["Lemon", "Chalk"],
      flavours: ["Green apple"],
    });
  });
```
with
```ts
  it("makes exactly eight requests, and asks each table once", async () => {
    const { client, calls } = archetypeClient();

    await fetchArchetype(client, "a1");

    expect(calls.queries.map((q) => q.table).sort()).toEqual([
      "appellations",
      "countries",
      "grapes",
      "regions",
      "wine_archetype_aromas",
      "wine_archetypes",
      "wine_places",
      "wset_aroma_terms",
    ]);
  });

  it("returns place, lineage, grapes and sorted aroma terms", async () => {
    const { client } = archetypeClient();

    const view = await fetchArchetype(client, "a1");

    expect(view).toEqual({
      name: "A typical Chablis",
      colour: "WHITE",
      style: "STILL",
      placeName: "Chablis",
      lineage: lineageForParts({
        country: { id: "c1", name: "France" },
        region: { id: "r1", name: "Bourgogne" },
        appellation: { id: "ap1", name: "Chablis AOC" },
        primaryGrape: { id: "g1", name: "Chardonnay" },
        secondaryGrape: null,
      }),
      grapes: "Chardonnay",
      description: "Lean and mineral.",
      qualityLow: "GOOD",
      qualityHigh: "VERY_GOOD",
      sat: "DRY",
      // Sorted by the terms' own sort_order, not by link order.
      aromas: ["Lemon", "Chalk"],
      flavours: ["Green apple"],
    });
  });

  it("an archetype with no map place (D9) asks for none and still has its lineage", async () => {
    const { client, calls } = archetypeClient({ archetype: { ...ARCHETYPE, wine_place_id: null } });

    const view = await fetchArchetype(client, "a1");

    expect(calls.queries.some((q) => q.table === "wine_places")).toBe(false);
    expect(view?.placeName).toBeNull();
    expect(view?.lineage).not.toBe("");
  });

  it("a regional appellation leaves the appellation out of the lineage", async () => {
    const { client } = archetypeClient({ names: { appellation: "Bourgogne AOC" } });

    const view = await fetchArchetype(client, "a1");

    expect(view?.lineage).toBe("Bourgogne, France · Chardonnay");
  });
```

- [ ] **Step 13: Run it and watch the new assertions fail**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/archetype-detail.test.ts`

Expected: FAIL — "makes exactly eight requests" (5 tables seen), "returns place, lineage…" (no `lineage` key) and "a regional appellation…" (`lineage` undefined) fail; "no map place" fails (a `wine_places` request is made); the other three pass.

- [ ] **Step 14: Rewrite `src/lib/wset/archetype-detail.ts`** (full file):

```ts
// A single "typical wine from here" reference profile, assembled for the
// read-only ArchetypeSheet the wine map (and the Library) opens. Place name,
// the reference names of the lineage, grape names and aroma terms are looked
// up separately (a small reference set) to sidestep embed-relationship typing.
//
// Its own module, with type-only `@/` imports, so vitest (node, no path alias)
// can load it; ./queries re-exports it for every existing importer. Same split
// as ./archetype-query, and for the same reason.
//
// Spec: docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §12.7;
// training-room spec D9 (the place is optional) and D11 (the lineage line).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ArchetypeView } from "@/components/wset/archetype-sheet";
import { lineageForParts } from "../training/archetype-view";

export async function fetchArchetype(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ArchetypeView | null> {
  // The aroma links are keyed by the id this function was CALLED with, not by
  // anything on the archetype row, so they never needed to wait for it. Starting
  // them here instead of in the round below lets the aroma TERMS — which do
  // depend on them — resolve a whole network round trip sooner: the sheet opens
  // in two rounds rather than three, at ~340 ms of round trip each on the
  // production trace. Nothing about any query itself changes.
  const linkPromise = supabase
    .from("wine_archetype_aromas")
    .select("term_id, kind")
    .eq("archetype_id", id);

  const { data: row } = await supabase
    .from("wine_archetypes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) {
    // Settle the request that is already out, so an unknown id leaves no
    // floating promise behind.
    await linkPromise;
    return null;
  }

  const grapeIds = [row.primary_grape_id, row.secondary_grape_id].filter(
    (v): v is string => Boolean(v),
  );
  // D9: an archetype may have no map place; then no place is asked for.
  const noPlace = Promise.resolve({ data: null as { name: string } | null });
  const [placeRes, grapesRes, linkRes, countryRes, regionRes, appellationRes] = await Promise.all([
    row.wine_place_id
      ? supabase.from("wine_places").select("name").eq("id", row.wine_place_id).maybeSingle()
      : noPlace,
    grapeIds.length
      ? supabase.from("grapes").select("id, name").in("id", grapeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    linkPromise,
    supabase.from("countries").select("name").eq("id", row.country_id).maybeSingle(),
    supabase.from("regions").select("name").eq("id", row.region_id).maybeSingle(),
    supabase.from("appellations").select("name").eq("id", row.appellation_id).maybeSingle(),
  ]);

  const grapeName = new Map((grapesRes.data ?? []).map((g) => [g.id, g.name] as const));
  const grapes = [row.primary_grape_id, row.secondary_grape_id]
    .map((gid) => (gid ? grapeName.get(gid) : null))
    .filter((v): v is string => Boolean(v))
    .join(" · ");
  const lineage = lineageForParts({
    country: { id: row.country_id, name: countryRes.data?.name ?? "" },
    region: { id: row.region_id, name: regionRes.data?.name ?? "" },
    appellation: { id: row.appellation_id, name: appellationRes.data?.name ?? "" },
    primaryGrape: { id: row.primary_grape_id, name: grapeName.get(row.primary_grape_id) ?? "" },
    secondaryGrape: row.secondary_grape_id
      ? { id: row.secondary_grape_id, name: grapeName.get(row.secondary_grape_id) ?? "" }
      : null,
  });

  const links = linkRes.data ?? [];
  const noseIds = links.filter((l) => l.kind === "NOSE").map((l) => l.term_id);
  const palateIds = links.filter((l) => l.kind === "PALATE").map((l) => l.term_id);
  const allIds = Array.from(new Set([...noseIds, ...palateIds]));
  const termById = new Map<string, { term: string; sort_order: number }>();
  if (allIds.length > 0) {
    const { data: terms } = await supabase
      .from("wset_aroma_terms")
      .select("id, term, sort_order")
      .in("id", allIds);
    for (const t of terms ?? []) termById.set(t.id, { term: t.term, sort_order: t.sort_order });
  }
  const sortedTerms = (ids: string[]) =>
    ids
      .map((tid) => termById.get(tid))
      .filter((t): t is { term: string; sort_order: number } => Boolean(t))
      .sort((x, y) => x.sort_order - y.sort_order)
      .map((t) => t.term);

  return {
    name: row.name,
    colour: row.colour,
    style: row.style,
    placeName: placeRes.data?.name ?? null,
    lineage,
    grapes,
    description: row.description,
    qualityLow: row.quality_low,
    qualityHigh: row.quality_high,
    sat: row.sat,
    aromas: sortedTerms(noseIds),
    flavours: sortedTerms(palateIds),
  };
}
```

- [ ] **Step 15: Run it**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/archetype-detail.test.ts`

Expected: PASS — 7 passed.

- [ ] **Step 16: The Library cards print the lineage.** In `src/app/knowledge/archetypes/archetype-browser.tsx` replace lines 7–13
```tsx
export type ArchetypeCard = {
  id: string;
  name: string;
  colour: string;
  style: string;
  placeName: string;
};
```
with
```tsx
export type ArchetypeCard = {
  id: string;
  name: string;
  colour: string;
  style: string;
  /** The map place's name, "" when the archetype has none (training-room D9). */
  placeName: string;
  /** "Pauillac · Bordeaux, France · Cabernet Sauvignon, Merlot" (D11). */
  lineage: string;
};
```
and replace lines 44–46
```tsx
            <span className="text-sm text-muted-foreground">
              {[a.placeName, cap(a.colour), cap(a.style)].filter(Boolean).join(" · ")}
            </span>
```
with
```tsx
            <span className="text-sm text-muted-foreground">
              {[a.lineage || a.placeName, cap(a.colour), cap(a.style)].filter(Boolean).join(" · ")}
            </span>
```

- [ ] **Step 17: The Library page reads the lineage and skips null places.** In `src/app/knowledge/designations/page.tsx`:

Replace lines 1–7
```tsx
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { getDesignationsPageData } from "@/lib/designations/page-data";
import { LibraryTabs } from "./library-tabs";
import type { GrapeRow } from "./grape-library";
import type { ArchetypeCard } from "../archetypes/archetype-browser";
```
with
```tsx
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { getDesignationsPageData } from "@/lib/designations/page-data";
import { lineageForParts } from "@/lib/training/archetype-view";
import { LibraryTabs } from "./library-tabs";
import type { GrapeRow } from "./grape-library";
import type { ArchetypeCard } from "../archetypes/archetype-browser";
```

Replace lines 27–30
```tsx
    supabase
      .from("wine_archetypes")
      .select("id, name, colour, style, wine_place_id")
      .order("sort_order"),
```
with
```tsx
    supabase
      .from("wine_archetypes")
      .select(
        "id, name, colour, style, wine_place_id, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id",
      )
      .order("sort_order"),
```

Replace lines 56–72
```tsx
  const archRows = archRes.data ?? [];
  const archPlaceIds = [...new Set(archRows.map((a) => a.wine_place_id))];
  const archPlaceName = new Map<string, string>();
  if (archPlaceIds.length > 0) {
    const { data: aps } = await supabase
      .from("wine_places")
      .select("id, name")
      .in("id", archPlaceIds);
    for (const p of aps ?? []) archPlaceName.set(p.id, p.name);
  }
  const archetypes: ArchetypeCard[] = archRows.map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    placeName: archPlaceName.get(a.wine_place_id) ?? "",
  }));
```
with
```tsx
  const archRows = archRes.data ?? [];
  const distinct = (ids: (string | null)[]) =>
    [...new Set(ids.filter((v): v is string => v !== null))];
  // D9: an archetype may have no map place — only real places are looked up.
  const archPlaceIds = distinct(archRows.map((a) => a.wine_place_id));
  const countryIds = distinct(archRows.map((a) => a.country_id));
  const regionIds = distinct(archRows.map((a) => a.region_id));
  const appellationIds = distinct(archRows.map((a) => a.appellation_id));
  const noRows = { data: [] as { id: string; name: string }[] };
  const [archPlacesRes, countriesRes, regionsRes, appellationsRes] = await Promise.all([
    archPlaceIds.length > 0
      ? supabase.from("wine_places").select("id, name").in("id", archPlaceIds)
      : noRows,
    countryIds.length > 0
      ? supabase.from("countries").select("id, name").in("id", countryIds)
      : noRows,
    regionIds.length > 0
      ? supabase.from("regions").select("id, name").in("id", regionIds)
      : noRows,
    appellationIds.length > 0
      ? supabase.from("appellations").select("id, name").in("id", appellationIds)
      : noRows,
  ]);
  const nameMap = (rows: { id: string; name: string }[] | null) =>
    new Map((rows ?? []).map((r) => [r.id, r.name] as const));
  const archPlaceName = nameMap(archPlacesRes.data);
  const countryName = nameMap(countriesRes.data);
  const regionName = nameMap(regionsRes.data);
  const appellationName = nameMap(appellationsRes.data);
  // The grapes are already loaded above for the grape library.
  const grapeName = new Map(grapes.map((g) => [g.id, g.name] as const));
  const named = (id: string, names: Map<string, string>) => ({ id, name: names.get(id) ?? "" });
  const archetypes: ArchetypeCard[] = archRows.map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    placeName: a.wine_place_id ? (archPlaceName.get(a.wine_place_id) ?? "") : "",
    // D11: every card names where it is from, so no appellation is a bare word.
    lineage: lineageForParts({
      country: named(a.country_id, countryName),
      region: named(a.region_id, regionName),
      appellation: named(a.appellation_id, appellationName),
      primaryGrape: named(a.primary_grape_id, grapeName),
      secondaryGrape: a.secondary_grape_id ? named(a.secondary_grape_id, grapeName) : null,
    }),
  }));
```

- [ ] **Step 18: Run the gates**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset src/lib/training/archetype-view.test.ts src/app/taste && npx tsc --noEmit && npx eslint src/lib/wset/archetype-scale.ts src/lib/wset/archetype-scale.test.ts src/lib/wset/archetype-detail.ts src/lib/wset/archetype-detail.test.ts src/lib/training/archetype-view.ts src/lib/training/archetype-view.test.ts src/components/wset/archetype-sheet.tsx src/components/wset/snap-slider.tsx src/app/knowledge/designations/page.tsx src/app/knowledge/archetypes/archetype-browser.tsx src/lib/wset/i18n.ts
```

Expected: vitest — archetype-scale 8, archetype-view 5, archetype-detail 7 and every other file pass; `tsc` exits 0 (`ArchetypeModal` and `/knowledge/archetypes/[id]` still pass `a={view}` only); eslint prints no problems.

- [ ] **Step 19: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/wset/archetype-scale.ts src/lib/wset/archetype-scale.test.ts src/lib/wset/i18n.ts src/components/wset/snap-slider.tsx src/components/wset/archetype-sheet.tsx src/lib/training/archetype-view.ts src/lib/training/archetype-view.test.ts src/lib/wset/archetype-detail.ts src/lib/wset/archetype-detail.test.ts src/app/knowledge/designations/page.tsx src/app/knowledge/archetypes/archetype-browser.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): archetype sheet draws answers and lineage; a map place is optional" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The add-wine sheet's reveal variant

**Files:**
- Create: `src/components/add-wine/note-pick.ts`
- Test: `src/components/add-wine/note-pick.test.ts`
- Modify: `src/components/add-wine/types.ts` (lines 28–29, 33–51)
- Modify: `src/components/add-wine/matrix.ts` (lines 104–114, 288–334)
- Modify: `src/components/add-wine/matrix.test.ts` (append after line 293)
- Modify: `src/components/add-wine/sheet-state.ts` (imports at lines 18–29; lines 627–628)
- Modify: `src/components/add-wine/use-sheet-adds.ts` (lines 87, 463–471)
- Modify: `src/components/add-wine-context.tsx` (imports lines 30–35; lines 82, 124–131, 228–261, 288–292)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (Task 10 and Task 11 call these):
  - `AddWineDestination` note variant `{ kind: "note"; reveal?: true }`.
  - `AddWineOpenOptions.onNotePick?: (pick: NotePick) => void` — the pick of the open that passed it, handed back instead of opening `NewNoteModal`, always with `consume: false`; a pick from an earlier, replaced open is dropped.
  - Usage: `openAddWineSheet({ kind: "note", reveal: true }, { onNotePick: (pick) => … })` from `useAddWine()`.
  - `src/components/add-wine/note-pick.ts`: `isRevealDestination(d)`, `revealSafePick(pick, d)`, `routeNotePick({ seq, currentSeq, pick, handBack })`, `type NotePickRoute`.

- [ ] **Step 1: Write the failing test** — create `src/components/add-wine/note-pick.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isRevealDestination, revealSafePick, routeNotePick } from "./note-pick";
import { initialSheetState } from "./sheet-state";
import type { AddWineDestination, NotePick } from "./types";

// Training-room spec §3.4 and Review Focus 5: the reveal sheet hands the pick
// back to the room, never opens NewNoteModal, never draws a cellar lot down,
// and ignores a stale pick from an earlier open.
const reveal: AddWineDestination = { kind: "note", reveal: true };
const lotPick: NotePick = { catalogWineId: "c1", lotId: "l1", consume: true };

describe("isRevealDestination", () => {
  it("is only a note destination with reveal", () => {
    expect(isRevealDestination(reveal)).toBe(true);
    expect(isRevealDestination({ kind: "note" })).toBe(false);
    expect(isRevealDestination({ kind: "cellar" })).toBe(false);
    expect(isRevealDestination(null)).toBe(false);
  });
});

describe("revealSafePick", () => {
  it("a reveal pick never consumes, and keeps its wine and lot", () => {
    expect(revealSafePick(lotPick, reveal)).toEqual({ catalogWineId: "c1", lotId: "l1", consume: false });
  });
  it("a Taste & rate pick is left exactly as it was", () => {
    expect(revealSafePick(lotPick, { kind: "note" })).toBe(lotPick);
  });
});

describe("routeNotePick", () => {
  it("drops a pick from an earlier, replaced open — with or without a hand-back", () => {
    expect(routeNotePick({ seq: 1, currentSeq: 2, pick: lotPick, handBack: true })).toEqual({ kind: "ignore" });
    expect(routeNotePick({ seq: 1, currentSeq: 2, pick: lotPick, handBack: false })).toEqual({ kind: "ignore" });
  });
  it("hands the current open's pick back when it passed onNotePick, never consuming", () => {
    expect(routeNotePick({ seq: 2, currentSeq: 2, pick: lotPick, handBack: true })).toEqual({
      kind: "hand-back",
      pick: { catalogWineId: "c1", lotId: "l1", consume: false },
    });
  });
  it("opens the note as today when the open passed no onNotePick", () => {
    expect(routeNotePick({ seq: 2, currentSeq: 2, pick: lotPick, handBack: false })).toEqual({ kind: "open-note", pick: lotPick });
  });
});

describe("the reveal sheet starts with nothing to draw down", () => {
  it("consume is off on both surfaces for a reveal, on for Taste & rate", () => {
    const r = initialSheetState({ destination: reveal, options: {}, canScan: false });
    expect([r.desktop.consume, r.cellar.consume]).toEqual([false, false]);
    const n = initialSheetState({ destination: { kind: "note" }, options: {}, canScan: false });
    expect([n.desktop.consume, n.cellar.consume]).toEqual([true, true]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/add-wine/note-pick.test.ts`

Expected: FAIL — `Failed to resolve import "./note-pick"`.

- [ ] **Step 3: The destination and the option.** In `src/components/add-wine/types.ts` replace lines 28–29
```ts
  /** Taste & rate: one wine, then its WSET note opens (D4; was "rate"). */
  | { kind: "note" };
```
with
```ts
  /** Taste & rate: one wine, then its WSET note opens (D4; was "rate").
      `reveal` (training room, spec §3.4): the reveal wording, no cellar
      draw-down, and the pick goes back to the opener's `onNotePick`. */
  | { kind: "note"; reveal?: true };
```
and replace lines 50–51
```ts
  preselect?: { catalogWineId?: string; unidentifiedWineId?: string; tastingWineId?: string };
};
```
with
```ts
  preselect?: { catalogWineId?: string; unidentifiedWineId?: string; tastingWineId?: string };
  /** note only (training room, spec §3.4): the pick is handed back here
      instead of opening NewNoteModal — only for the open that passed it; a
      pick from an earlier, replaced open is dropped. A handed-back pick never
      consumes a cellar lot. */
  onNotePick?: (pick: NotePick) => void;
};
```

- [ ] **Step 4: Write the pure module** — create `src/components/add-wine/note-pick.ts`:

```ts
// The training room's reveal (spec §3.4): a note pick that goes back to the
// page that opened the sheet instead of opening NewNoteModal, and never draws
// a cellar bottle down — a bottle poured blind was opened by someone else.
// The provider (add-wine-context.tsx) and the adds hook (use-sheet-adds.ts)
// call these; they live here so vitest can pin them.
//
// Pure: type-only imports, so vitest (no `@/` alias) can load it.
import type { AddWineDestination, NotePick } from "./types";

/** A note destination opened by the training room's "Reveal the bottle". */
export function isRevealDestination(destination: AddWineDestination | null): boolean {
  return destination?.kind === "note" && destination.reveal === true;
}

/** A reveal pick with the draw-down switched off; any other pick unchanged. */
export function revealSafePick(pick: NotePick, destination: AddWineDestination | null): NotePick {
  return isRevealDestination(destination) ? { ...pick, consume: false } : pick;
}

export type NotePickRoute =
  | { kind: "ignore" }
  | { kind: "hand-back"; pick: NotePick }
  | { kind: "open-note"; pick: NotePick };

/**
 * Where a sheet's note pick goes. `seq` is the open that picked, `currentSeq`
 * the provider's latest open: a pick from a replaced open is dropped. The
 * current open hands the pick back when it passed `onNotePick` (never
 * consuming), and otherwise opens the note as Taste & rate always has.
 */
export function routeNotePick(p: {
  seq: number;
  currentSeq: number;
  pick: NotePick;
  handBack: boolean;
}): NotePickRoute {
  if (p.seq !== p.currentSeq) return { kind: "ignore" };
  if (p.handBack) return { kind: "hand-back", pick: { ...p.pick, consume: false } };
  return { kind: "open-note", pick: p.pick };
}
```

- [ ] **Step 5: The reveal sheet opens with consume off.** In `src/components/add-wine/sheet-state.ts` replace
```ts
import { homeViewFor, startViewFor } from "./use-camera";
```
with
```ts
import { isRevealDestination } from "./note-pick";
import { homeViewFor, startViewFor } from "./use-camera";
```
and replace lines 627–628
```ts
    desktop: { query: "", focusedRow: 0, consume: true },
    cellar: { filter: null, selectedLotId: null, consume: true },
```
with
```ts
    // The training room's reveal never draws a bottle down (spec §3.4); its
    // matrix hides the toggle, so the default is all that could say otherwise.
    desktop: { query: "", focusedRow: 0, consume: !isRevealDestination(p.destination) },
    cellar: { filter: null, selectedLotId: null, consume: !isRevealDestination(p.destination) },
```

- [ ] **Step 6: Run the test**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/add-wine/note-pick.test.ts`

Expected: PASS — 8 passed.

- [ ] **Step 7: Write the failing matrix test** — append to the end of `src/components/add-wine/matrix.test.ts` (after line 293):

```ts

describe("the training room's reveal (a note destination with reveal, spec §3.4 and §9)", () => {
  const reveal: AddWineDestination = { kind: "note", reveal: true };
  it.each([true, false])("canScan=%s: the reveal wording, no consume toggle, still a single pick", (canScan) => {
    const x = sheetMatrix(reveal, canScan);
    const plain = sheetMatrix({ kind: "note" }, canScan);
    expect(x.kind).toBe("note");
    expect([x.eyebrow, x.title("home"), x.title("read"), x.enterHint]).toEqual([
      "Reveal the bottle",
      "Which bottle was it?",
      "Which bottle was it?",
      "↵ reveals the first hit",
    ]);
    expect((["lot", "catalog", "tasted"] as const).map((source) => x.row({ source, inFlight: false, owned: false }))).toEqual(
      Array(3).fill({ label: "This is it", action: "pick", disabled: false, affordance: "chevron" }),
    );
    expect(x.consumeLabel).toBeNull();
    expect([x.footer.primary, x.confirm.primaryMatch, x.confirm.primaryNoMatch, x.byHand.primary(false), x.byHand.primary(true)]).toEqual(
      Array(5).fill("This is it"),
    );
    expect(x.byHand.eyebrow).toBe("Reveal the bottle · by hand");
    expect(x.upload).toEqual({ ...plain.upload, body: "Read and matched exactly as it is on the phone, then your result shows." });
    expect(x.cellarTileSubtitle?.({ bottles: 38, readyToDrink: 6 })).toBe("38 bottles · if the bottle came from your cellar");
    // Everything else is Taste & rate's own.
    expect([
      x.home, x.searchPlaceholder, x.showMany, x.multiTitle, x.chips, x.searchGroups, x.cellarSource,
      x.partialRead, x.followUps, x.leadLine, x.footer.button, x.confirm.eyebrowMatch, x.byHand.footerNote,
    ]).toEqual([
      plain.home, plain.searchPlaceholder, plain.showMany, plain.multiTitle, plain.chips, plain.searchGroups, plain.cellarSource,
      plain.partialRead, plain.followUps, plain.leadLine, plain.footer.button, plain.confirm.eyebrowMatch, plain.byHand.footerNote,
    ]);
  });
  it("a plain note keeps Taste & rate's wording and its consume toggle", () => {
    expect(sheetMatrix({ kind: "note" }, true).eyebrow).toBe("Taste & rate");
    expect(sheetMatrix({ kind: "note" }, false).consumeLabel).toBe("Take a bottle out of the cellar when I save the note");
  });
});
```

- [ ] **Step 8: Run it and watch it fail**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/add-wine/matrix.test.ts`

Expected: FAIL — both `canScan=true` and `canScan=false` reveal cases fail on the first assertion (eyebrow is "Taste & rate"); every pre-existing test and the "plain note" test pass.

- [ ] **Step 9: The reveal matrix.** In `src/components/add-wine/matrix.ts`:

Replace lines 111–112
```ts
    case "note":
      return noteMatrix(canScan);
```
with
```ts
    case "note":
      return noteMatrix(canScan, destination.reveal === true);
```

Replace lines 288–334 (the whole `noteMatrix` function)
```ts
function noteMatrix(canScan: boolean): SheetMatrix {
  return {
    kind: "note",
```
… through its closing
```ts
    // D7: a partial read opens A7 directly, skipping the confirm screen.
    partialRead: { single: "by-hand", stacked: "by-hand", skipConfirm: true },
    followUps: TERMINAL,
  };
}
```
with
```ts
// Training room (spec §3.4, §9): the note flow, naming the bottle poured blind.
const THIS_IS_IT = "This is it";
const REVEAL_EYEBROW = "Reveal the bottle";

function noteMatrix(canScan: boolean, reveal: boolean): SheetMatrix {
  const note: SheetMatrix = {
    kind: "note",
    ...shared(canScan),
    eyebrow: "Taste & rate",
    title: () => (canScan ? "Which wine?" : "Which wine are you tasting?"),
    multiTitle: null,
    enterHint: "↵ opens a note on the first hit",
    chips: CELLAR_AND_BY_HAND,
    // A note is a single pick.
    showMany: false,
    searchGroups: ALL_GROUPS,
    cellarGroupSubtitle: null,
    row: () => ({ label: "Start the note", action: "pick", disabled: false, affordance: "chevron" }),
    consumeLabel: "Take a bottle out of the cellar when I save the note",
    cellarSource: true,
    upload: {
      multiple: false,
      title: "Upload a label photo",
      body: "Read and matched exactly as it is on the phone, then the note opens.",
      drop: "Drop a photo here",
      choose: "or choose a file",
    },
    cellarTileSubtitle: cellarTile(() => "rating one you own is the common case"),
    lotPreviewTile: false,
    leadLine: NOTE_LEAD_LINE,
    neitherOfThese: false,
    resultCount: found,
    footer: { primary: "Start the note", secondary: null, button: "Close", sentence: () => NOTE_LEAD_LINE },
    confirm: {
      eyebrowMatch: MATCHED,
      eyebrowNoMatch: NOT_IN_CATALOG,
      primaryMatch: "Start the note",
      primaryNoMatch: "Start the note",
      note: null,
    },
    byHand: {
      eyebrow: "Taste & rate · by hand",
      footerNote: CATALOG_TOO,
      primary: () => "Start the note",
      unidentifiedToggle: false,
    },
    // D7: a partial read opens A7 directly, skipping the confirm screen.
    partialRead: { single: "by-hand", stacked: "by-hand", skipConfirm: true },
    followUps: TERMINAL,
  };
  if (!reveal) return note;
  return {
    ...note,
    eyebrow: REVEAL_EYEBROW,
    title: () => "Which bottle was it?",
    enterHint: "↵ reveals the first hit",
    row: () => ({ label: THIS_IS_IT, action: "pick", disabled: false, affordance: "chevron" }),
    // A bottle poured blind was opened by someone else: never drawn down.
    consumeLabel: null,
    upload: { ...note.upload, body: "Read and matched exactly as it is on the phone, then your result shows." },
    cellarTileSubtitle: cellarTile(() => "if the bottle came from your cellar"),
    footer: { ...note.footer, primary: THIS_IS_IT },
    confirm: { ...note.confirm, primaryMatch: THIS_IS_IT, primaryNoMatch: THIS_IS_IT },
    byHand: { ...note.byHand, eyebrow: `${REVEAL_EYEBROW} · by hand`, primary: () => THIS_IS_IT },
  };
}
```

- [ ] **Step 10: Run the matrix tests**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/add-wine/matrix.test.ts`

Expected: PASS — every test, the three new ones included.

- [ ] **Step 11: The adds hook never consumes on a reveal.** In `src/components/add-wine/use-sheet-adds.ts` replace line 87
```ts
import { notePickPlan } from "./format";
```
with
```ts
import { notePickPlan } from "./format";
import { revealSafePick } from "./note-pick";
```
and replace lines 463–471
```ts
  function handOff(pick: NotePick, from: Pick<AddContext, "itemId" | "byHand" | "ticket" | "imagePath">): void {
    // The photo is of the picked wine, even if the pick is then held in the
    // close-ask and dropped with "Keep going".
    attachScan(scanPhotoTarget({ destination: "note", catalogWineId: pick.catalogWineId }, from.imagePath));
```
with
```ts
  function handOff(picked: NotePick, from: Pick<AddContext, "itemId" | "byHand" | "ticket" | "imagePath">): void {
    // Training room (spec §3.4): a reveal pick never draws a bottle down,
    // whatever the (hidden) consume state says. Stored the same way in a
    // close-ask, so Discard hands on the safe pick too.
    const pick = revealSafePick(picked, currentDestination(stateRef.current));
    // The photo is of the picked wine, even if the pick is then held in the
    // close-ask and dropped with "Keep going".
    attachScan(scanPhotoTarget({ destination: "note", catalogWineId: pick.catalogWineId }, from.imagePath));
```
(The rest of `handOff` — `send({ type: "notePicked", pick, … })`, `onNote(pick)`, `closeNow()` — is unchanged and now uses the safe `pick`.)

- [ ] **Step 12: The provider hands the pick back.** In `src/components/add-wine-context.tsx`:

Replace lines 30–35
```tsx
import type {
  AddWineDestination,
  AddWineOpenOptions,
  FlightHint,
  NotePick,
} from "@/components/add-wine/types";
```
with
```tsx
import type {
  AddWineDestination,
  AddWineOpenOptions,
  FlightHint,
  NotePick,
} from "@/components/add-wine/types";
import { routeNotePick } from "@/components/add-wine/note-pick";
```

Replace line 82
```tsx
  /** Any destination. `{ kind: "note" }` is Taste & rate: pick one wine, then its WSET note opens. */
```
with
```tsx
  /** Any destination. `{ kind: "note" }` is Taste & rate: pick one wine, then its WSET note opens.
      `{ kind: "note", reveal: true }` with `onNotePick` is the training room's
      reveal: the pick comes back to the caller and no note opens. */
```

Replace lines 130–131
```tsx
  const openCount = useRef(0);
  const pickCount = useRef(0);
```
with
```tsx
  const openCount = useRef(0);
  const pickCount = useRef(0);
  // The open `openCount` names, so a note pick reaches THAT open's
  // `onNotePick` (the training room's reveal) and never an earlier one's.
  const currentOpen = useRef<OpenSheet | null>(null);
```

Replace lines 228–261
```tsx
  const openSheet = useCallback(
    (
      destination: AddWineDestination | null,
      options: AddWineOpenOptions,
      initialLot: InitialLot | null,
    ) => {
      ensureCurrency(destination);
      openCount.current += 1;
      setSheet({ seq: openCount.current, destination, options, initialLot });
    },
    [ensureCurrency],
  );

  // BT-R5 (S13c): the record glass's "Rate it" preselects an existing catalog
  // wine and skips the pick — the sheet never opens; NewNoteModal opens
  // directly on that wine, with the glass attached (tastingWineId,
  // contextKind: "BLIND"), the same way a chooser pick would hand off.
  const openAddWineSheet = useCallback(
    (destination: AddWineDestination | null, options: AddWineOpenOptions = {}) => {
      const catalogWineId = options.preselect?.catalogWineId;
      if (destination?.kind === "note" && catalogWineId) {
        pickCount.current += 1;
```
with
```tsx
  const openSheet = useCallback(
    (
      destination: AddWineDestination | null,
      options: AddWineOpenOptions,
      initialLot: InitialLot | null,
    ) => {
      ensureCurrency(destination);
      openCount.current += 1;
      const open: OpenSheet = { seq: openCount.current, destination, options, initialLot };
      currentOpen.current = open;
      setSheet(open);
    },
    [ensureCurrency],
  );

  // BT-R5 (S13c): the record glass's "Rate it" preselects an existing catalog
  // wine and skips the pick — the sheet never opens; NewNoteModal opens
  // directly on that wine, with the glass attached (tastingWineId,
  // contextKind: "BLIND"), the same way a chooser pick would hand off.
  const openAddWineSheet = useCallback(
    (destination: AddWineDestination | null, options: AddWineOpenOptions = {}) => {
      const catalogWineId = options.preselect?.catalogWineId;
      if (destination?.kind === "note" && catalogWineId) {
        // Training room: a preselected pick goes straight back too, and never
        // opens a note or consumes.
        if (options.onNotePick) {
          options.onNotePick({ catalogWineId, consume: false });
          return;
        }
        pickCount.current += 1;
```

Replace lines 288–292
```tsx
  const pickNote = useCallback((seq: number, pick: NotePick) => {
    if (seq !== openCount.current) return;
    pickCount.current += 1;
    setNote({ seq: pickCount.current, pick, tastingWineId: null, contextKind: null });
  }, []);
```
with
```tsx
  const pickNote = useCallback((seq: number, pick: NotePick) => {
    // Training room (spec §3.4): the open that passed `onNotePick` gets its
    // pick back (never consuming) and no NewNoteModal opens; a pick from a
    // replaced open is dropped either way.
    const open = currentOpen.current;
    const route = routeNotePick({
      seq,
      currentSeq: openCount.current,
      pick,
      handBack: open?.options.onNotePick !== undefined,
    });
    if (route.kind === "ignore") return;
    if (route.kind === "hand-back") {
      open?.options.onNotePick?.(route.pick);
      return;
    }
    pickCount.current += 1;
    setNote({ seq: pickCount.current, pick: route.pick, tastingWineId: null, contextKind: null });
  }, []);
```

- [ ] **Step 13: Run the gates**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/add-wine src/app/tastings/new && npx tsc --noEmit && npx eslint src/components/add-wine/note-pick.ts src/components/add-wine/note-pick.test.ts src/components/add-wine/types.ts src/components/add-wine/matrix.ts src/components/add-wine/matrix.test.ts src/components/add-wine/sheet-state.ts src/components/add-wine/use-sheet-adds.ts src/components/add-wine-context.tsx
```

Expected: vitest — every add-wine file passes (note-pick 8 new, matrix +3 new, sheet-state and format unchanged); `tsc` exits 0 (the `never` exhaustiveness in `sheetMatrix`, `routeAdd` and `chosenDestination` still holds — the note variant only gained an optional field); eslint prints no problems.

- [ ] **Step 14: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/components/add-wine/note-pick.ts src/components/add-wine/note-pick.test.ts src/components/add-wine/types.ts src/components/add-wine/matrix.ts src/components/add-wine/matrix.test.ts src/components/add-wine/sheet-state.ts src/components/add-wine/use-sheet-adds.ts src/components/add-wine-context.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): the add-wine sheet's reveal variant hands the pick back" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Nav preview — the Training Room link and its Preview pill

**Files:**
- Modify: `src/components/nav-links.ts` (lines 7–13, 47)
- Test: `src/components/nav-links.test.ts` (create)
- Modify: `src/components/app-sidebar.tsx` (lines 21–26, 318–330, 354–362)
- Modify: `src/components/mobile-nav.tsx` (line 24, lines 131–143, 167–175)
- Modify: `src/app/taste/start-tasting-menu.tsx` (lines 1–15, 42–47)
- Modify: `src/lib/wset/i18n.ts` (UI_EN `soon: "Soon",`; UI_DA `soon: "Snart",`)
- Modify: `src/app/taste/taste-archive-math.test.ts` (line 67)
- Modify: `src/app/about/page.tsx` (lines 23–29, 44–50, 276–291)

**Interfaces:**
- Consumes: nothing from other tasks. The `/taste/training` route itself is Task 10's; until it lands the links 404, which is why this task is committed after Task 10 is reachable in the same deploy (all tasks ship together, spec §11 step 2).
- Produces: `NavChild.preview?: boolean`; `navChildState(child: NavChild): "link" | "soon" | "preview"`; `NAV_CHILD_PILL: { soon: "Soon"; preview: "Preview" }`; the WSET i18n key `preview`.

- [ ] **Step 1: Write the failing test** — create `src/components/nav-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NAV_CHILD_PILL, NAV_LINKS, navChildState } from "./nav-links";

// Training-room spec §3.1 / D12: the Training Room is a live link with a
// Preview pill, drawn through one helper by the sidebar and the phone drawer.
describe("navChildState", () => {
  it("a plain child is a link", () => {
    expect(navChildState({ href: "/taste/notes", label: "Tasting notes" })).toBe("link");
  });
  it("a teaser is soon", () => {
    expect(navChildState({ href: "/somewhere", label: "Somewhere", soon: true })).toBe("soon");
  });
  it("a preview is a live link with a pill", () => {
    expect(navChildState({ href: "/taste/training", label: "Training Room", preview: true })).toBe("preview");
  });
  it("soon wins when both are set, so a teaser never becomes clickable by accident", () => {
    expect(navChildState({ href: "/x", label: "X", soon: true, preview: true })).toBe("soon");
  });
  it("names the two pills", () => {
    expect(NAV_CHILD_PILL).toEqual({ soon: "Soon", preview: "Preview" });
  });
  it("Taste lists the Training Room as a preview link to /taste/training, and nothing as soon", () => {
    const taste = NAV_LINKS.find((l) => l.key === "taste");
    expect(taste?.children?.find((c) => c.label === "Training Room")).toEqual({
      href: "/taste/training",
      label: "Training Room",
      preview: true,
    });
    expect(taste?.children?.some((c) => c.soon)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/nav-links.test.ts`

Expected: FAIL — `navChildState is not a function` / `NAV_CHILD_PILL` undefined (TypeError in every test); the file loads.

- [ ] **Step 3: The nav data and helper.** In `src/components/nav-links.ts` replace lines 7–13
```ts
export type NavChild = {
  href: string;
  label: string;
  modal?: "catalog" | "cellar" | "taste-blind" | "taste-rate";
  // A teaser sub-item: rendered greyed-out with a "Soon" tag, not clickable.
  soon?: boolean;
};
```
with
```ts
export type NavChild = {
  href: string;
  label: string;
  modal?: "catalog" | "cellar" | "taste-blind" | "taste-rate";
  // A teaser sub-item: rendered greyed-out with a "Soon" tag, not clickable.
  soon?: boolean;
  // A live sub-item still in preview (training-room D12): a real link with a
  // "Preview" tag.
  preview?: boolean;
};

export type NavChildState = "link" | "soon" | "preview";

/** How the sidebar and the phone drawer draw a sub-item. `soon` wins, so a
    teaser can never turn into a link by accident. */
export function navChildState(child: NavChild): NavChildState {
  if (child.soon) return "soon";
  if (child.preview) return "preview";
  return "link";
}

/** The pill beside a teaser or a preview item (same shape and tokens). */
export const NAV_CHILD_PILL: Record<Exclude<NavChildState, "link">, string> = {
  soon: "Soon",
  preview: "Preview",
};
```
and replace line 47
```ts
      { href: "/taste", label: "Training Room", soon: true },
```
with
```ts
      { href: "/taste/training", label: "Training Room", preview: true },
```

- [ ] **Step 4: Run it**

`cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/nav-links.test.ts`

Expected: PASS — 6 passed.

- [ ] **Step 5: The sidebar.** In `src/components/app-sidebar.tsx` replace lines 21–26
```tsx
import {
  navWithAdmin,
  isNavActive,
  type NavChild,
  type NavLink,
} from "@/components/nav-links";
```
with
```tsx
import {
  NAV_CHILD_PILL,
  navChildState,
  navWithAdmin,
  isNavActive,
  type NavChild,
  type NavLink,
} from "@/components/nav-links";
```
Replace lines 318–330
```tsx
                  {link.children.map((child) => {
                    if (child.soon) {
                      return (
                        <span
                          key={child.label}
                          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-primary-foreground/35"
                        >
                          {child.label}
                          <span className="rounded-full bg-primary-foreground/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase">
                            Soon
                          </span>
                        </span>
                      );
                    }
```
with
```tsx
                  {link.children.map((child) => {
                    const childState = navChildState(child);
                    if (childState === "soon") {
                      return (
                        <span
                          key={child.label}
                          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-primary-foreground/35"
                        >
                          {child.label}
                          <span className="rounded-full bg-primary-foreground/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase">
                            {NAV_CHILD_PILL.soon}
                          </span>
                        </span>
                      );
                    }
```
and replace lines 354–362
```tsx
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={childClass}
                      >
                        {child.label}
                      </Link>
```
with
```tsx
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={cn(childClass, childState === "preview" && "flex items-center gap-2")}
                      >
                        {child.label}
                        {childState === "preview" ? (
                          <span className="rounded-full bg-primary-foreground/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase">
                            {NAV_CHILD_PILL.preview}
                          </span>
                        ) : null}
                      </Link>
```

- [ ] **Step 6: The phone drawer.** In `src/components/mobile-nav.tsx` replace line 24
```tsx
import { type NavLink, type NavChild, isNavActive } from "@/components/nav-links";
```
with
```tsx
import {
  NAV_CHILD_PILL,
  navChildState,
  type NavLink,
  type NavChild,
  isNavActive,
} from "@/components/nav-links";
```
Replace lines 131–143
```tsx
                          {link.children.map((child) => {
                            if (child.soon) {
                              return (
                                <span
                                  key={child.label}
                                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-primary-foreground/35"
                                >
                                  {child.label}
                                  <span className="rounded-full bg-primary-foreground/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase">
                                    Soon
                                  </span>
                                </span>
                              );
                            }
```
with
```tsx
                          {link.children.map((child) => {
                            const childState = navChildState(child);
                            if (childState === "soon") {
                              return (
                                <span
                                  key={child.label}
                                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-primary-foreground/35"
                                >
                                  {child.label}
                                  <span className="rounded-full bg-primary-foreground/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase">
                                    {NAV_CHILD_PILL.soon}
                                  </span>
                                </span>
                              );
                            }
```
and replace lines 167–175
```tsx
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={close}
                                aria-current={childActive ? "page" : undefined}
                                className={childClass}
                              >
                                {child.label}
                              </Link>
```
with
```tsx
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={close}
                                aria-current={childActive ? "page" : undefined}
                                className={cn(childClass, childState === "preview" && "flex items-center gap-2")}
                              >
                                {child.label}
                                {childState === "preview" ? (
                                  <span className="rounded-full bg-primary-foreground/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase">
                                    {NAV_CHILD_PILL.preview}
                                  </span>
                                ) : null}
                              </Link>
```

- [ ] **Step 7: The `preview` string, and the archive's key list.** In `src/lib/wset/i18n.ts` replace (UI_EN)
```ts
  soon: "Soon",
```
with
```ts
  soon: "Soon",
  preview: "Preview",
```
and replace (UI_DA)
```ts
  soon: "Snart",
```
with
```ts
  soon: "Snart",
  // English on purpose: the training room is English-only in its preview (D20).
  preview: "Preview",
```
In `src/app/taste/taste-archive-math.test.ts` replace line 67
```ts
  "soon", "loading_tastings", "tastings_one", "tastings_many", "finished_count",
```
with
```ts
  "soon", "preview", "loading_tastings", "tastings_one", "tastings_many", "finished_count",
```

- [ ] **Step 8: The `/taste` start menu item becomes a link.** In `src/app/taste/start-tasting-menu.tsx` replace lines 1–4
```tsx
"use client";

import { ChevronDown, EyeOff, NotebookPen, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
```
with
```tsx
"use client";

import Link from "next/link";
import { ChevronDown, EyeOff, NotebookPen, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
```
and replace lines 42–47
```tsx
        <DropdownMenuItem disabled>
          <Target /> {t("training_room")}
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            {t("soon")}
          </span>
        </DropdownMenuItem>
```
with
```tsx
        {/* Training room (spec §3.1): a real link with the Preview pill. */}
        <DropdownMenuItem render={<Link href="/taste/training" />}>
          <Target /> {t("training_room")}
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            {t("preview")}
          </span>
        </DropdownMenuItem>
```

- [ ] **Step 9: The About tile says Preview.** In `src/app/about/page.tsx` replace lines 23–29
```tsx
type Mode = {
  icon: LucideIcon;
  title: string;
  body: string;
  border: string;
  soon?: boolean;
};
```
with
```tsx
type Mode = {
  icon: LucideIcon;
  title: string;
  body: string;
  border: string;
  /** Live, but still in preview (training-room D12). */
  preview?: boolean;
};
```
replace lines 44–50
```tsx
  {
    icon: Target,
    title: "Training Room",
    body: "Drill regions, grapes and appellations on your own, between tastings. In development.",
    border: "border border-dashed border-border",
    soon: true,
  },
```
with
```tsx
  {
    icon: Target,
    title: "Training Room",
    body: "Drill regions, grapes and appellations on your own, between tastings. Preview.",
    border: "border border-dashed border-border",
    preview: true,
  },
```
and replace lines 278–291
```tsx
      <Icon
        size={22}
        strokeWidth={1.75}
        className={mode.soon ? "text-muted-foreground" : "text-primary"}
        aria-hidden
      />
      <h3 className="flex items-center gap-2 font-heading text-[22px] leading-[1.1] font-semibold max-md:text-[20px]">
        {mode.title}
        {mode.soon ? (
          <span className="rounded-full border border-gold px-[7px] py-[2px] font-mono text-[10px] tracking-[.1em] text-gold-dark">
            SOON
          </span>
        ) : null}
      </h3>
```
with
```tsx
      <Icon size={22} strokeWidth={1.75} className="text-primary" aria-hidden />
      <h3 className="flex items-center gap-2 font-heading text-[22px] leading-[1.1] font-semibold max-md:text-[20px]">
        {mode.title}
        {mode.preview ? (
          <span className="rounded-full border border-gold px-[7px] py-[2px] font-mono text-[10px] tracking-[.1em] text-gold-dark">
            PREVIEW
          </span>
        ) : null}
      </h3>
```

- [ ] **Step 10: Confirm no teaser rendering is left behind**

`cd /c/Users/Public/repos/blindtastingapp-training && grep -rn "child\.soon\|mode\.soon\|In development\|t(\"soon\")" src`

Expected: no output.

- [ ] **Step 11: Run the gates**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/nav-links.test.ts src/app/taste src/lib/wset && npx tsc --noEmit && npx eslint src/components/nav-links.ts src/components/nav-links.test.ts src/components/app-sidebar.tsx src/components/mobile-nav.tsx src/app/taste/start-tasting-menu.tsx src/app/taste/taste-archive-math.test.ts src/app/about/page.tsx src/lib/wset/i18n.ts
```

Expected: vitest — nav-links 6 new pass; `taste-archive-math.test.ts` passes (the `preview` key is in both dictionaries with the same placeholders, and its "every literal t(\"…\") in start-tasting-menu.tsx" check finds `preview`); every other file passes; `tsc` exits 0; eslint prints no problems.

- [ ] **Step 12: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/components/nav-links.ts src/components/nav-links.test.ts src/components/app-sidebar.tsx src/components/mobile-nav.tsx src/app/taste/start-tasting-menu.tsx src/app/taste/taste-archive-math.test.ts src/app/about/page.tsx src/lib/wset/i18n.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): Training Room is a live link with a Preview pill" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: Server reads and actions

**Files:**
- Create: `src/lib/training/action-types.ts`
- Create: `src/lib/training/pool-shape.ts`
- Test: `src/lib/training/pool-shape.test.ts`
- Create: `src/lib/training/attempt-payload.ts`
- Test: `src/lib/training/attempt-payload.test.ts`
- Create: `src/lib/training/pool.ts`
- Create: `src/app/taste/training/actions.ts`

**Interfaces:**
- Consumes: Task 1 — tables/columns of Contract note 8 and the RPC. Task 2 —
  `src/lib/training/types.ts` (`AttemptRow`, `CapReason`, `Named`, `PointCategory`,
  `RankingSnapshot`, `TrainingCandidate`, `VintageGuess`) and
  `tally(rows: Pick<AttemptRow, "points" | "total">[]): { scored: number; grapeHits: number; appellationHits: number }`
  from `src/lib/training/history-math.ts`. Task 6 —
  `candidateToArchetypeView(c: TrainingCandidate): ArchetypeView` from
  `src/lib/training/archetype-view.ts`.
- Produces (used by Tasks 10 and 11):
  - `src/lib/training/action-types.ts`: `HistoryCursor = { createdAt: string; id: string }`,
    `HistoryPage = { rows: AttemptRow[]; nextCursor: HistoryCursor | null }`,
    `AromaPayload`, `FinishInput`, `FinishResult` (header shapes), `TrainingTally`,
    `TrainingAttemptDetail = { row: AttemptRow; noteId: string; wineColour: WineColour | null }`.
  - `src/lib/training/attempt-payload.ts`: `SAVE_REFUSED`, `SNAPSHOT_MAX`, `isUuid`,
    `isHistoryCursor`, `attemptPayload`, `revealPayload`, `finishResultFromRpc`.
  - `src/lib/training/pool-shape.ts` (pure): `HISTORY_PAGE = 20`, `MAX_MERGE_HOPS`,
    `ATTEMPT_COLUMNS`, `CATALOG_DISPLAY_COLUMNS`, `shapeCandidates`, `coverageCountries`,
    `vintageFromColumns`, `vintageColumns`, `parseSnapshot`, `finalWineId`,
    `actualWineLineage`, `wineDisplay`, `shapeAttemptRow`, `historyOrFilter`, `pageOf`,
    `tallyRows`.
  - `src/lib/training/pool.ts` (server-only): `readTrainingPool(supabase): Promise<TrainingCandidate[]>`
    (`cache()`d), `readTrainingHistory(supabase, userId, cursor?): Promise<HistoryPage>`,
    `readTrainingAttemptDetail(supabase, userId, attemptId): Promise<TrainingAttemptDetail | null>`,
    `readTrainingTally(supabase, userId): Promise<TrainingTally>`, re-exports
    `coverageCountries` and `candidateToArchetypeView`.
  - `src/app/taste/training/actions.ts` (`"use server"`):
    `finishTrainingSession(input: FinishInput): Promise<FinishResult>`,
    `revealTrainingAttempt(attemptId: string, catalogWineId: string): Promise<FinishResult>`,
    `loadMoreTrainingHistory(cursor: HistoryCursor): Promise<HistoryPage>`,
    `loadTrainingAttempt(attemptId: string): Promise<TrainingAttemptDetail | null>`.

- [ ] **Step 1: Confirm Task 1's types are in place**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && grep -n "training_attempts: {\|wine_archetype_designations: {\|record_training_attempt: {\|typical_age_low\|signature: boolean" src/lib/supabase/database.types.ts`
Expected: at least one line for each of the five patterns. If any is missing, Task 1 is not
done — stop and finish it first.

- [ ] **Step 2: Write the plain types module `src/lib/training/action-types.ts`**

```ts
// Shapes the training room's server actions take and return (training-room
// spec §6.5). A plain module, not the "use server" file: that one may export
// only async functions (CLAUDE.md, "A `use server` file exports only async
// functions"), so the client and the actions both import these with
// `import type`.
import type { WineColour } from "../wset/types";
import type { AttemptRow, PointCategory, RankingSnapshot, VintageGuess } from "./types";

/** The history list's keyset cursor: the last row's raw `created_at` and id. */
export type HistoryCursor = { createdAt: string; id: string };

export type HistoryPage = { rows: AttemptRow[]; nextCursor: HistoryCursor | null };

/** One `wset_note_aromas` row as `save_wset_note` takes it. */
export type AromaPayload = { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean };

export type FinishInput = {
  sessionKey: string;
  startedAt: string;
  /** noteToPayload(state, { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null });
      the RPC forces the identity fields anyway (D14). */
  note: Record<string, unknown>;
  aromas: AromaPayload[];
  pickedArchetypeId: string | null;
  vintage: VintageGuess;
  actualCatalogWineId: string | null;
  snapshot: RankingSnapshot;
};

export type FinishResult =
  | {
      ok: true;
      attemptId: string;
      noteId: string;
      points: Record<PointCategory, number | null>;
      total: number | null;
      possible: number | null;
      actualArchetypeId: string | null;
      hueCleared: boolean;
    }
  | { error: string };

/** "6 of 9 right on the grape · 4 on the appellation" — history-math's tally(). */
export type TrainingTally = { scored: number; grapeHits: number; appellationHits: number };

/** What the result screen renders: the stored attempt as a history row, plus the
    saved note's id (See the note) and the revealed wine's colour (the hue line). */
export type TrainingAttemptDetail = {
  row: AttemptRow;
  noteId: string;
  wineColour: WineColour | null;
};
```

- [ ] **Step 3: Write the failing test `src/lib/training/pool-shape.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  HISTORY_PAGE,
  actualWineLineage,
  coverageCountries,
  finalWineId,
  historyOrFilter,
  pageOf,
  parseSnapshot,
  shapeAttemptRow,
  shapeCandidates,
  tallyRows,
  vintageColumns,
  vintageFromColumns,
  wineDisplay,
  type AttemptRaw,
  type CatalogDisplayRaw,
  type PoolRaw,
  type WineDisplay,
} from "./pool-shape";

const ARCH_PAUILLAC = "00000000-0000-4000-8000-00000000a001";
const ARCH_BOURGOGNE = "00000000-0000-4000-8000-00000000a002";
const WINE_OLD = "00000000-0000-4000-8000-00000000b001";
const WINE_NEW = "00000000-0000-4000-8000-00000000b002";
const WINE_HIDDEN = "00000000-0000-4000-8000-00000000b003";
const ATTEMPT = "00000000-0000-4000-8000-00000000c001";
const NOTE = "00000000-0000-4000-8000-00000000d001";

function pool(overrides: Partial<PoolRaw> = {}): PoolRaw {
  return {
    archetypes: [
      {
        id: ARCH_PAUILLAC,
        name: "A typical Pauillac",
        description: "Cedar and cassis.",
        colour: "RED",
        style: "STILL",
        country_id: "fr",
        region_id: "bdx",
        appellation_id: "pauillac",
        primary_grape_id: "cs",
        secondary_grape_id: "me",
        typical_age_low: 8,
        typical_age_high: 25,
        sat: { tannin: ["MEDIUM_PLUS", "HIGH"], clarity: ["CLEAR", "CLEAR"], broken: ["HIGH"] },
        quality_low: 88,
        quality_high: 96,
        wine_place_id: "place-pauillac",
        sort_order: 2,
      },
      {
        id: ARCH_BOURGOGNE,
        name: "A typical Bourgogne rouge",
        description: null,
        colour: "RED",
        style: "STILL",
        country_id: "fr",
        region_id: "bgn",
        appellation_id: "bourgogne",
        primary_grape_id: "pn",
        secondary_grape_id: null,
        typical_age_low: null,
        typical_age_high: 6,
        sat: {},
        quality_low: null,
        quality_high: null,
        wine_place_id: null,
        sort_order: 1,
      },
    ],
    aromas: [
      { archetype_id: ARCH_PAUILLAC, term_id: "t-cassis", kind: "NOSE", signature: false },
      { archetype_id: ARCH_PAUILLAC, term_id: "t-cedar", kind: "NOSE", signature: true },
      { archetype_id: ARCH_PAUILLAC, term_id: "t-gone", kind: "PALATE", signature: false },
    ],
    terms: [
      { id: "t-cassis", term: "blackcurrant", group_name: "Black fruit" },
      { id: "t-cedar", term: "cedar", group_name: "Oak" },
    ],
    designations: [
      { archetype_id: ARCH_PAUILLAC, type_designation_id: "d-grand" },
      { archetype_id: ARCH_PAUILLAC, type_designation_id: "d-first" },
    ],
    names: {
      countries: [{ id: "fr", name: "France" }],
      regions: [
        { id: "bdx", name: "Bordeaux" },
        { id: "bgn", name: "Bourgogne" },
      ],
      appellations: [
        { id: "pauillac", name: "Pauillac AOC" },
        { id: "bourgogne", name: "Bourgogne AOC" },
      ],
      grapes: [
        { id: "cs", name: "Cabernet Sauvignon" },
        { id: "me", name: "Merlot" },
        { id: "pn", name: "Pinot Noir" },
      ],
      typeDesignations: [
        { id: "d-first", name: "Premier Grand Cru Classé" },
        { id: "d-grand", name: "Grand Cru Classé" },
      ],
    },
    placeKeys: [{ id: "place-pauillac", canonical_key: "france.bordeaux.haut-medoc.pauillac" }],
    ...overrides,
  };
}

function attempt(overrides: Partial<AttemptRaw> = {}): AttemptRaw {
  return {
    id: ATTEMPT,
    created_at: "2026-09-24T18:00:00.123456+00:00",
    note_id: NOTE,
    picked_archetype_id: ARCH_PAUILLAC,
    guessed_vintage_kind: "YEAR",
    guessed_vintage_year: 2015,
    guessed_vintage_tawny_years: null,
    actual_catalog_wine_id: WINE_OLD,
    actual_archetype_id: ARCH_BOURGOGNE,
    note_colour_hue: "RUBY",
    hue_cleared: false,
    candidates_snapshot: [
      { archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null },
    ],
    country_points: 2,
    region_points: 3,
    appellation_points: 0,
    primary_grape_points: 8,
    secondary_grape_points: null,
    type_designation_points: 0,
    vintage_points: 1,
    total_points: 14,
    possible_points: 22,
    ...overrides,
  };
}

const CTX = {
  archetypeNames: new Map([
    [ARCH_PAUILLAC, "A typical Pauillac"],
    [ARCH_BOURGOGNE, "A typical Bourgogne rouge"],
  ]),
  mergedInto: new Map<string, string | null>([
    [WINE_OLD, WINE_NEW],
    [WINE_NEW, null],
  ]),
  wines: new Map<string, WineDisplay>([
    [
      WINE_NEW,
      {
        label: "Château Léoville Barton Saint-Julien AOC 2016",
        lineage: "Saint-Julien AOC · Bordeaux, France",
        colour: "RED",
      },
    ],
  ]),
};

const NO_POINTS = {
  country: null,
  region: null,
  appellation: null,
  primaryGrape: null,
  secondaryGrape: null,
  typeDesignation: null,
  vintage: null,
};

describe("shapeCandidates", () => {
  it("orders by sort_order and names every reference", () => {
    const [first, second] = shapeCandidates(pool());
    expect(first.id).toBe(ARCH_BOURGOGNE);
    expect(second).toMatchObject({
      id: ARCH_PAUILLAC,
      name: "A typical Pauillac",
      description: "Cedar and cassis.",
      colour: "RED",
      style: "STILL",
      country: { id: "fr", name: "France" },
      region: { id: "bdx", name: "Bordeaux" },
      appellation: { id: "pauillac", name: "Pauillac AOC", isRegional: false },
      primaryGrape: { id: "cs", name: "Cabernet Sauvignon" },
      secondaryGrape: { id: "me", name: "Merlot" },
      typicalAge: [8, 25],
      placeCanonicalKey: "france.bordeaux.haut-medoc.pauillac",
      qualityLow: 88,
      qualityHigh: 96,
    });
  });

  it("marks a region's self-named appellation as regional and tolerates a null place", () => {
    const [bourgogne] = shapeCandidates(pool());
    expect(bourgogne.appellation).toEqual({ id: "bourgogne", name: "Bourgogne AOC", isRegional: true });
    expect(bourgogne.secondaryGrape).toBeNull();
    expect(bourgogne.typicalAge).toBeNull();
    expect(bourgogne.placeCanonicalKey).toBeNull();
    expect(bourgogne.aromas).toEqual([]);
    expect(bourgogne.designations).toEqual([]);
  });

  it("joins aromas with their term and group, keeps signature and drops unknown terms", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.aromas).toEqual([
      { termId: "t-cassis", term: "blackcurrant", group: "Black fruit", kind: "NOSE", signature: false },
      { termId: "t-cedar", term: "cedar", group: "Oak", kind: "NOSE", signature: true },
    ]);
  });

  it("orders designations by the type designation order", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.designations).toEqual([
      { id: "d-first", name: "Premier Grand Cru Classé" },
      { id: "d-grand", name: "Grand Cru Classé" },
    ]);
  });

  it("drops malformed sat entries and keeps every well-formed key", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.sat).toEqual({ tannin: ["MEDIUM_PLUS", "HIGH"], clarity: ["CLEAR", "CLEAR"] });
  });

  it("leaves out an archetype whose appellation the viewer cannot read", () => {
    const names = { ...pool().names, appellations: [{ id: "bourgogne", name: "Bourgogne AOC" }] };
    expect(shapeCandidates(pool({ names })).map((c) => c.id)).toEqual([ARCH_BOURGOGNE]);
  });
});

describe("coverageCountries", () => {
  it("counts by country, most first, then by name", () => {
    const [bourgogne, pauillac] = shapeCandidates(pool());
    const italy = { ...pauillac, id: "it-1", country: { id: "it", name: "Italy" } };
    const austria = { ...pauillac, id: "at-1", country: { id: "at", name: "Austria" } };
    expect(coverageCountries([bourgogne, pauillac, austria, italy, { ...italy, id: "it-2" }])).toEqual([
      { name: "France", count: 2 },
      { name: "Italy", count: 2 },
      { name: "Austria", count: 1 },
    ]);
    expect(coverageCountries([])).toEqual([]);
  });
});

describe("vintage columns", () => {
  it("reads and writes the guessed vintage triple", () => {
    expect(vintageFromColumns("YEAR", 2016, null)).toEqual({ kind: "YEAR", year: 2016 });
    expect(vintageFromColumns("NV", null, null)).toEqual({ kind: "NV" });
    expect(vintageFromColumns("TAWNY", null, 20)).toEqual({ kind: "TAWNY", years: 20 });
    expect(vintageFromColumns(null, null, null)).toBeNull();
    expect(vintageFromColumns("YEAR", null, null)).toBeNull();
    expect(vintageColumns({ kind: "YEAR", year: 2016 })).toEqual({
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2016,
      guessed_vintage_tawny_years: null,
    });
    expect(vintageColumns({ kind: "NV" })).toEqual({
      guessed_vintage_kind: "NV",
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: null,
    });
    expect(vintageColumns({ kind: "TAWNY", years: 20 })).toEqual({
      guessed_vintage_kind: "TAWNY",
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: 20,
    });
    expect(vintageColumns(null)).toEqual({
      guessed_vintage_kind: null,
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: null,
    });
  });
});

describe("parseSnapshot", () => {
  it("keeps well-formed entries only", () => {
    const good = { archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null };
    const capped = {
      archetypeId: ARCH_BOURGOGNE,
      name: "A typical Bourgogne rouge",
      closeness: 15,
      rank: 2,
      capped: "colour",
    };
    expect(
      parseSnapshot([good, capped, { ...good, closeness: 140 }, { ...good, capped: "weird" }, { ...good, rank: 0 }, null, "x"]),
    ).toEqual([good, capped]);
    expect(parseSnapshot([{ ...good, closeness: null }])).toEqual([{ ...good, closeness: null }]);
    expect(parseSnapshot({ not: "a list" })).toEqual([]);
  });
});

describe("finalWineId", () => {
  it("follows merges, stops on a cycle and keeps an id it never read", () => {
    const merged = new Map<string, string | null>([
      ["a", "b"],
      ["b", "c"],
      ["c", null],
      ["x", "y"],
      ["y", "x"],
    ]);
    expect(finalWineId("a", merged)).toBe("c");
    expect(finalWineId("c", merged)).toBe("c");
    expect(finalWineId("x", merged)).toBe("y");
    expect(finalWineId("q", merged)).toBe("q");
  });
});

describe("actualWineLineage", () => {
  it("names a specific appellation, the grapes and the designation", () => {
    expect(
      actualWineLineage({
        appellation: "Saint-Julien AOC",
        region: "Bordeaux",
        country: "France",
        primaryGrape: "Cabernet Sauvignon",
        secondaryGrape: "Merlot",
        designation: "Grand Cru Classé",
      }),
    ).toBe("Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon, Merlot · Grand Cru Classé");
  });

  it("drops a regional appellation and needs a region and a country", () => {
    expect(
      actualWineLineage({
        appellation: "Bourgogne AOC",
        region: "Bourgogne",
        country: "France",
        primaryGrape: "Pinot Noir",
        secondaryGrape: null,
        designation: null,
      }),
    ).toBe("Bourgogne, France · Pinot Noir");
    expect(
      actualWineLineage({
        appellation: "Bourgogne AOC",
        region: null,
        country: "France",
        primaryGrape: "Pinot Noir",
        secondaryGrape: null,
        designation: null,
      }),
    ).toBeNull();
  });
});

describe("wineDisplay", () => {
  it("builds the catalog label and lineage from the embeds", () => {
    const row: CatalogDisplayRaw = {
      id: WINE_NEW,
      colour: "RED",
      wine_name: null,
      vintage_kind: "YEAR",
      vintage_year: 2016,
      vintage_tawny_years: null,
      producer: { name: "Château Léoville Barton" },
      country: [{ name: "France" }],
      region: { name: "Bordeaux" },
      appellation: { name: "Saint-Julien AOC" },
      primary_grape: { name: "Cabernet Sauvignon" },
      secondary_grape: null,
      type_designation: { name: "Grand Cru Classé" },
    };
    expect(wineDisplay(row)).toEqual({
      label: "Château Léoville Barton Saint-Julien AOC 2016",
      lineage: "Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon · Grand Cru Classé",
      colour: "RED",
    });
  });
});

describe("shapeAttemptRow", () => {
  it("shapes a scored attempt and follows a merged wine", () => {
    expect(shapeAttemptRow(attempt(), CTX)).toEqual({
      id: ATTEMPT,
      createdAt: "2026-09-24T18:00:00.123456+00:00",
      picked: { id: ARCH_PAUILLAC, name: "A typical Pauillac" },
      vintage: { kind: "YEAR", year: 2015 },
      actual: {
        catalogWineId: WINE_NEW,
        label: "Château Léoville Barton Saint-Julien AOC 2016",
        lineage: "Saint-Julien AOC · Bordeaux, France",
      },
      actualArchetype: { id: ARCH_BOURGOGNE, name: "A typical Bourgogne rouge" },
      hueCleared: false,
      noteColourHue: "RUBY",
      points: {
        country: 2,
        region: 3,
        appellation: 0,
        primaryGrape: 8,
        secondaryGrape: null,
        typeDesignation: 0,
        vintage: 1,
      },
      total: 14,
      possible: 22,
      snapshot: [{ archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null }],
    });
  });

  it("shapes an unrevealed attempt and a wine the viewer cannot read", () => {
    const unrevealed = shapeAttemptRow(
      attempt({
        picked_archetype_id: null,
        guessed_vintage_kind: null,
        guessed_vintage_year: null,
        actual_catalog_wine_id: null,
        actual_archetype_id: null,
        country_points: null,
        region_points: null,
        appellation_points: null,
        primary_grape_points: null,
        type_designation_points: null,
        vintage_points: null,
        total_points: null,
        possible_points: null,
      }),
      CTX,
    );
    expect(unrevealed.picked).toBeNull();
    expect(unrevealed.vintage).toBeNull();
    expect(unrevealed.actual).toBeNull();
    expect(unrevealed.actualArchetype).toBeNull();
    expect(unrevealed.points).toEqual(NO_POINTS);
    expect(unrevealed.total).toBeNull();

    const hidden = shapeAttemptRow(attempt({ actual_catalog_wine_id: WINE_HIDDEN }), CTX);
    expect(hidden.actual).toEqual({ catalogWineId: WINE_HIDDEN, label: null, lineage: null });
  });
});

describe("history paging", () => {
  it("builds the keyset filter from the raw timestamp", () => {
    expect(historyOrFilter({ createdAt: "2026-09-24T18:00:00.123456+00:00", id: ATTEMPT })).toBe(
      `created_at.lt."2026-09-24T18:00:00.123456+00:00",and(created_at.eq."2026-09-24T18:00:00.123456+00:00",id.lt.${ATTEMPT})`,
    );
  });

  it("cuts a page at twenty and points the cursor at its last row", () => {
    expect(HISTORY_PAGE).toBe(20);
    const rows = Array.from({ length: HISTORY_PAGE + 1 }, (_, i) => ({ created_at: `t${i}`, id: `id-${i}` }));
    const cursorOf = (r: { created_at: string; id: string }) => ({ createdAt: r.created_at, id: r.id });
    const full = pageOf(rows, cursorOf);
    expect(full.rows).toHaveLength(20);
    expect(full.nextCursor).toEqual({ createdAt: "t19", id: "id-19" });
    const short = pageOf(rows.slice(0, 5), cursorOf);
    expect(short.rows).toHaveLength(5);
    expect(short.nextCursor).toBeNull();
  });

  it("maps the light tally select onto tally()'s input", () => {
    expect(
      tallyRows([
        { primary_grape_points: 8, appellation_points: 0, total_points: 11 },
        { primary_grape_points: null, appellation_points: null, total_points: null },
      ]),
    ).toEqual([
      { points: { ...NO_POINTS, primaryGrape: 8, appellation: 0 }, total: 11 },
      { points: NO_POINTS, total: null },
    ]);
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/pool-shape.test.ts`
Expected: FAIL — `Failed to resolve import "./pool-shape"`.

- [ ] **Step 5: Write `src/lib/training/pool-shape.ts`**

```ts
// Pure shaping behind the training room's server reads (training-room spec
// §4.6, §3.6, §6.1). pool.ts runs the queries as the viewer and hands the raw
// rows here; nothing in this file touches Supabase, React or server-only, so
// vitest pins every rule. Runtime imports are relative only (vitest has no
// `@/` alias).
import { justTheRegionOption } from "../../components/add-wine/self-named-appellation";
import { catalogWineTitle } from "../wset/wine-title";
import type { VintageKind } from "../supabase/database.types";
import type { WineColour, WineStyle } from "../wset/types";
import type { HistoryCursor } from "./action-types";
import type {
  AttemptRow,
  CapReason,
  Named,
  PointCategory,
  RankingSnapshot,
  TrainingCandidate,
  VintageGuess,
} from "./types";

/** Rows per history page (spec §3.6). */
export const HISTORY_PAGE = 20;
/** How far a merged catalog wine is followed — a cycle guard, not a real depth. */
export const MAX_MERGE_HOPS = 5;

// --- The candidate pool (spec §4.6) --------------------------------------------

export type ArchetypeRaw = {
  id: string;
  name: string;
  description: string | null;
  colour: WineColour;
  style: WineStyle;
  country_id: string;
  region_id: string;
  appellation_id: string;
  primary_grape_id: string;
  secondary_grape_id: string | null;
  typical_age_low: number | null;
  typical_age_high: number | null;
  /** jsonb — shaped defensively, a malformed entry is dropped. */
  sat: unknown;
  quality_low: number | null;
  quality_high: number | null;
  wine_place_id: string | null;
  sort_order: number;
};
export type ArchetypeAromaRaw = {
  archetype_id: string;
  term_id: string;
  kind: "NOSE" | "PALATE";
  signature: boolean;
};
export type AromaTermRaw = { id: string; term: string; group_name: string };
export type ArchetypeDesignationRaw = { archetype_id: string; type_designation_id: string };
export type PoolRaw = {
  archetypes: ArchetypeRaw[];
  aromas: ArchetypeAromaRaw[];
  terms: AromaTermRaw[];
  designations: ArchetypeDesignationRaw[];
  names: {
    countries: Named[];
    regions: Named[];
    appellations: Named[];
    grapes: Named[];
    /** In type_designations.sort_order — the order a candidate lists them. */
    typeDesignations: Named[];
  };
  placeKeys: { id: string; canonical_key: string }[];
};

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

function named(row: Named | undefined): Named | null {
  return row ? { id: row.id, name: row.name } : null;
}

function cleanSat(raw: unknown): Record<string, [string, string] | undefined> {
  const out: Record<string, [string, string] | undefined> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    ) {
      out[key] = [value[0], value[1]];
    }
  }
  return out;
}

/**
 * The pool as TrainingCandidate[], in sort_order then name. An archetype whose
 * scoring identity the viewer cannot name (a reference row missing from the
 * reads) is left out rather than shown half-named (D8, D11).
 */
export function shapeCandidates(raw: PoolRaw): TrainingCandidate[] {
  const index = (rows: readonly Named[]) => new Map(rows.map((r) => [r.id, r] as const));
  const countries = index(raw.names.countries);
  const regions = index(raw.names.regions);
  const appellations = index(raw.names.appellations);
  const grapes = index(raw.names.grapes);
  const designationById = index(raw.names.typeDesignations);
  const designationRank = new Map(raw.names.typeDesignations.map((d, i) => [d.id, i] as const));
  const termById = new Map(raw.terms.map((t) => [t.id, t] as const));
  const placeKey = new Map(raw.placeKeys.map((p) => [p.id, p.canonical_key] as const));
  const aromasOf = groupBy(raw.aromas, (a) => a.archetype_id);
  const designationsOf = groupBy(raw.designations, (d) => d.archetype_id);

  const ordered = [...raw.archetypes].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const out: TrainingCandidate[] = [];
  for (const a of ordered) {
    const country = named(countries.get(a.country_id));
    const region = named(regions.get(a.region_id));
    const appellation = named(appellations.get(a.appellation_id));
    const primaryGrape = named(grapes.get(a.primary_grape_id));
    if (!country || !region || !appellation || !primaryGrape) continue;

    const aromas = (aromasOf.get(a.id) ?? []).flatMap((link) => {
      const term = termById.get(link.term_id);
      return term
        ? [{ termId: link.term_id, term: term.term, group: term.group_name, kind: link.kind, signature: link.signature }]
        : [];
    });
    const designations = (designationsOf.get(a.id) ?? [])
      .map((d) => named(designationById.get(d.type_designation_id)))
      .filter((d): d is Named => d !== null)
      .sort((x, y) => (designationRank.get(x.id) ?? 0) - (designationRank.get(y.id) ?? 0));

    out.push({
      id: a.id,
      name: a.name,
      description: a.description,
      colour: a.colour,
      style: a.style,
      country,
      region,
      appellation: { ...appellation, isRegional: justTheRegionOption(region, [appellation]) !== null },
      primaryGrape,
      secondaryGrape: a.secondary_grape_id ? named(grapes.get(a.secondary_grape_id)) : null,
      designations,
      typicalAge:
        a.typical_age_low !== null && a.typical_age_high !== null
          ? [a.typical_age_low, a.typical_age_high]
          : null,
      sat: cleanSat(a.sat),
      aromas,
      placeCanonicalKey: a.wine_place_id ? (placeKey.get(a.wine_place_id) ?? null) : null,
      qualityLow: a.quality_low,
      qualityHigh: a.quality_high,
    });
  }
  return out;
}

/** The coverage line's countries: how many candidates each, most first, then by name. */
export function coverageCountries(pool: readonly TrainingCandidate[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of pool) counts.set(c.country.name, (counts.get(c.country.name) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// --- Attempts (spec §6.1, §3.6) -----------------------------------------------------

export function vintageFromColumns(
  kind: VintageKind | null,
  year: number | null,
  tawnyYears: number | null,
): VintageGuess {
  if (kind === "YEAR" && year !== null) return { kind: "YEAR", year };
  if (kind === "NV") return { kind: "NV" };
  if (kind === "TAWNY" && tawnyYears !== null) return { kind: "TAWNY", years: tawnyYears };
  return null;
}

export function vintageColumns(v: VintageGuess): {
  guessed_vintage_kind: VintageKind | null;
  guessed_vintage_year: number | null;
  guessed_vintage_tawny_years: number | null;
} {
  return {
    guessed_vintage_kind: v ? v.kind : null,
    guessed_vintage_year: v && v.kind === "YEAR" ? v.year : null,
    guessed_vintage_tawny_years: v && v.kind === "TAWNY" ? v.years : null,
  };
}

const CAPS: readonly CapReason[] = ["colour", "bubbles", "fortified"];

/** The stored ranking (candidates_snapshot jsonb), keeping only well-formed entries. */
export function parseSnapshot(raw: unknown): RankingSnapshot {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    const { archetypeId, name, closeness, rank, capped } = e;
    if (typeof archetypeId !== "string" || typeof name !== "string") return [];
    if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1) return [];
    if (closeness !== null && (typeof closeness !== "number" || closeness < 0 || closeness > 100)) return [];
    if (capped !== null && !CAPS.includes(capped as CapReason)) return [];
    return [
      {
        archetypeId,
        name,
        closeness: closeness as number | null,
        rank,
        capped: capped as CapReason | null,
      },
    ];
  });
}

/** Follows catalog_wines.merged_into from `start` (spec §6.1: merges are followed on read). */
export function finalWineId(start: string, mergedInto: ReadonlyMap<string, string | null>): string {
  let id = start;
  const seen = new Set([id]);
  for (let hop = 0; hop < MAX_MERGE_HOPS; hop++) {
    const next = mergedInto.get(id);
    if (!next || seen.has(next)) return id;
    seen.add(next);
    id = next;
  }
  return id;
}

/** "Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon, Merlot · Grand Cru Classé";
    a region's self-named appellation is left out, as the candidate lineage does. */
export function actualWineLineage(p: {
  appellation: string | null;
  region: string | null;
  country: string | null;
  primaryGrape: string | null;
  secondaryGrape: string | null;
  designation: string | null;
}): string | null {
  if (!p.region || !p.country) return null;
  const regional =
    p.appellation !== null &&
    justTheRegionOption({ id: "region", name: p.region }, [{ id: "appellation", name: p.appellation }]) !== null;
  const place =
    p.appellation && !regional ? `${p.appellation} · ${p.region}, ${p.country}` : `${p.region}, ${p.country}`;
  const grapes = [p.primaryGrape, p.secondaryGrape].filter((g): g is string => Boolean(g)).join(", ");
  return [place, grapes, p.designation].filter((part): part is string => Boolean(part)).join(" · ");
}

type One<T> = T | T[] | null;
function nameOf(rel: One<{ name: string }> | undefined): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

/** The revealed wine's display read. Embeds need the FK hints (two grape FKs). */
export const CATALOG_DISPLAY_COLUMNS: string =
  "id, colour, wine_name, vintage_kind, vintage_year, vintage_tawny_years, " +
  "producer:producers(name), country:countries(name), region:regions(name), " +
  "appellation:appellations(name), " +
  "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
  "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name), " +
  "type_designation:type_designations(name)";

export type CatalogDisplayRaw = {
  id: string;
  colour: WineColour | null;
  wine_name: string | null;
  vintage_kind: VintageKind | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  producer: One<{ name: string }>;
  country: One<{ name: string }>;
  region: One<{ name: string }>;
  appellation: One<{ name: string }>;
  primary_grape: One<{ name: string }>;
  secondary_grape: One<{ name: string }>;
  type_designation: One<{ name: string }>;
};

export type WineDisplay = { label: string; lineage: string | null; colour: WineColour | null };

export function wineDisplay(row: CatalogDisplayRaw): WineDisplay {
  return {
    label: catalogWineTitle({
      producerName: nameOf(row.producer),
      wineName: row.wine_name,
      vintageKind: row.vintage_kind ?? "YEAR",
      vintageYear: row.vintage_year,
      vintageTawnyYears: row.vintage_tawny_years,
      appellationName: nameOf(row.appellation),
    }),
    lineage: actualWineLineage({
      appellation: nameOf(row.appellation),
      region: nameOf(row.region),
      country: nameOf(row.country),
      primaryGrape: nameOf(row.primary_grape),
      secondaryGrape: nameOf(row.secondary_grape),
      designation: nameOf(row.type_designation),
    }),
    colour: row.colour,
  };
}

/** Every training_attempts column the room reads (spec §6.1). */
export const ATTEMPT_COLUMNS: string =
  "id, created_at, note_id, picked_archetype_id, guessed_vintage_kind, guessed_vintage_year, " +
  "guessed_vintage_tawny_years, actual_catalog_wine_id, actual_archetype_id, note_colour_hue, " +
  "hue_cleared, candidates_snapshot, country_points, region_points, appellation_points, " +
  "primary_grape_points, secondary_grape_points, type_designation_points, vintage_points, " +
  "total_points, possible_points";

export type AttemptRaw = {
  id: string;
  created_at: string;
  note_id: string;
  picked_archetype_id: string | null;
  guessed_vintage_kind: VintageKind | null;
  guessed_vintage_year: number | null;
  guessed_vintage_tawny_years: number | null;
  actual_catalog_wine_id: string | null;
  actual_archetype_id: string | null;
  note_colour_hue: string | null;
  hue_cleared: boolean;
  candidates_snapshot: unknown;
  country_points: number | null;
  region_points: number | null;
  appellation_points: number | null;
  primary_grape_points: number | null;
  secondary_grape_points: number | null;
  type_designation_points: number | null;
  vintage_points: number | null;
  total_points: number | null;
  possible_points: number | null;
};

type PointColumns = Partial<
  Pick<
    AttemptRaw,
    | "country_points"
    | "region_points"
    | "appellation_points"
    | "primary_grape_points"
    | "secondary_grape_points"
    | "type_designation_points"
    | "vintage_points"
  >
>;

function pointsOf(raw: PointColumns): Record<PointCategory, number | null> {
  return {
    country: raw.country_points ?? null,
    region: raw.region_points ?? null,
    appellation: raw.appellation_points ?? null,
    primaryGrape: raw.primary_grape_points ?? null,
    secondaryGrape: raw.secondary_grape_points ?? null,
    typeDesignation: raw.type_designation_points ?? null,
    vintage: raw.vintage_points ?? null,
  };
}

export function shapeAttemptRow(
  raw: AttemptRaw,
  ctx: {
    archetypeNames: ReadonlyMap<string, string>;
    mergedInto: ReadonlyMap<string, string | null>;
    wines: ReadonlyMap<string, WineDisplay>;
  },
): AttemptRow {
  const archetype = (id: string | null): Named | null => {
    const name = id ? ctx.archetypeNames.get(id) : undefined;
    return id && name !== undefined ? { id, name } : null;
  };
  let actual: AttemptRow["actual"] = null;
  if (raw.actual_catalog_wine_id) {
    const catalogWineId = finalWineId(raw.actual_catalog_wine_id, ctx.mergedInto);
    const wine = ctx.wines.get(catalogWineId);
    actual = { catalogWineId, label: wine?.label ?? null, lineage: wine?.lineage ?? null };
  }
  return {
    id: raw.id,
    createdAt: raw.created_at,
    picked: archetype(raw.picked_archetype_id),
    vintage: vintageFromColumns(
      raw.guessed_vintage_kind,
      raw.guessed_vintage_year,
      raw.guessed_vintage_tawny_years,
    ),
    actual,
    actualArchetype: archetype(raw.actual_archetype_id),
    hueCleared: raw.hue_cleared,
    noteColourHue: raw.note_colour_hue,
    points: pointsOf(raw),
    total: raw.total_points,
    possible: raw.possible_points,
    snapshot: parseSnapshot(raw.candidates_snapshot),
  };
}

/** PostgREST `or=` for "older than the cursor": (created_at, id) < (cursor). The
    raw timestamp keeps its microseconds (a JS Date would drop them). */
export function historyOrFilter(cursor: HistoryCursor): string {
  return (
    `created_at.lt."${cursor.createdAt}",` +
    `and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`
  );
}

/** A page read with limit HISTORY_PAGE + 1: the extra row only says "there is more". */
export function pageOf<T>(
  rows: readonly T[],
  cursorOf: (row: T) => HistoryCursor,
): { rows: T[]; nextCursor: HistoryCursor | null } {
  if (rows.length <= HISTORY_PAGE) return { rows: [...rows], nextCursor: null };
  const page = rows.slice(0, HISTORY_PAGE);
  return { rows: page, nextCursor: cursorOf(page[page.length - 1]) };
}

/** The tally's one light select, shaped for history-math's tally(). */
export function tallyRows(
  raw: readonly { primary_grape_points: number | null; appellation_points: number | null; total_points: number | null }[],
): Pick<AttemptRow, "points" | "total">[] {
  return raw.map((r) => ({
    points: pointsOf({ primary_grape_points: r.primary_grape_points, appellation_points: r.appellation_points }),
    total: r.total_points,
  }));
}
```

- [ ] **Step 6: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/pool-shape.test.ts`
Expected: PASS — 18 tests in 1 file.

- [ ] **Step 7: Write the failing test `src/lib/training/attempt-payload.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { FinishInput } from "./action-types";
import {
  SAVE_REFUSED,
  SNAPSHOT_MAX,
  attemptPayload,
  finishResultFromRpc,
  isHistoryCursor,
  isUuid,
  revealPayload,
} from "./attempt-payload";

const SESSION = "00000000-0000-4000-8000-00000000e001";
const ARCH = "00000000-0000-4000-8000-00000000a001";
const WINE = "00000000-0000-4000-8000-00000000b001";
const TERM = "00000000-0000-4000-8000-00000000f001";
const ATTEMPT = "00000000-0000-4000-8000-00000000c001";
const NOTE = "00000000-0000-4000-8000-00000000d001";
const ENTRY = { archetypeId: ARCH, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null };

function input(overrides: Partial<FinishInput> = {}): FinishInput {
  return {
    sessionKey: SESSION,
    startedAt: "2026-09-25T18:14:00.000Z",
    note: { id: null, colour_hue: "RUBY" },
    aromas: [{ term_id: TERM, sensed_on_nose: true, sensed_on_palate: false }],
    pickedArchetypeId: ARCH,
    vintage: { kind: "YEAR", year: 2016 },
    actualCatalogWineId: WINE,
    snapshot: [ENTRY],
    ...overrides,
  };
}

const NULL_POINTS = {
  country: null,
  region: null,
  appellation: null,
  primaryGrape: null,
  secondaryGrape: null,
  typeDesignation: null,
  vintage: null,
};

describe("attemptPayload", () => {
  it("builds the RPC's p_attempt from a valid input", () => {
    expect(attemptPayload(input())).toEqual({
      attempt: {
        session_key: SESSION,
        started_at: "2026-09-25T18:14:00.000Z",
        picked_archetype_id: ARCH,
        guessed_vintage_kind: "YEAR",
        guessed_vintage_year: 2016,
        guessed_vintage_tawny_years: null,
        actual_catalog_wine_id: WINE,
        candidates_snapshot: [ENTRY],
      },
    });
    expect(attemptPayload(input({ pickedArchetypeId: null, actualCatalogWineId: null, vintage: null }))).toEqual({
      attempt: {
        session_key: SESSION,
        started_at: "2026-09-25T18:14:00.000Z",
        picked_archetype_id: null,
        guessed_vintage_kind: null,
        guessed_vintage_year: null,
        guessed_vintage_tawny_years: null,
        actual_catalog_wine_id: null,
        candidates_snapshot: [ENTRY],
      },
    });
  });

  it("maps NV and tawny guesses to their columns", () => {
    const nv = attemptPayload(input({ vintage: { kind: "NV" } }));
    expect(nv).toMatchObject({
      attempt: { guessed_vintage_kind: "NV", guessed_vintage_year: null, guessed_vintage_tawny_years: null },
    });
    const tawny = attemptPayload(input({ vintage: { kind: "TAWNY", years: 20 } }));
    expect(tawny).toMatchObject({
      attempt: { guessed_vintage_kind: "TAWNY", guessed_vintage_year: null, guessed_vintage_tawny_years: 20 },
    });
  });

  it("refuses a bad session key, start time, pick or wine id", () => {
    for (const bad of [
      input({ sessionKey: "nope" }),
      input({ startedAt: "yesterday" }),
      input({ pickedArchetypeId: "x" }),
      input({ actualCatalogWineId: "x" }),
    ]) {
      expect(attemptPayload(bad)).toEqual({ error: SAVE_REFUSED });
    }
  });

  it("refuses an off-range vintage", () => {
    for (const vintage of [
      { kind: "YEAR" as const, year: 1850 },
      { kind: "YEAR" as const, year: 2016.5 },
      { kind: "TAWNY" as const, years: 0 },
    ]) {
      expect(attemptPayload(input({ vintage }))).toEqual({ error: SAVE_REFUSED });
    }
  });

  it("refuses a malformed or oversized snapshot", () => {
    expect(attemptPayload(input({ snapshot: [{ ...ENTRY, rank: 0 }] }))).toEqual({ error: SAVE_REFUSED });
    const huge = Array.from({ length: SNAPSHOT_MAX + 1 }, (_, i) => ({ ...ENTRY, rank: i + 1 }));
    expect(attemptPayload(input({ snapshot: huge }))).toEqual({ error: SAVE_REFUSED });
  });

  it("refuses malformed aromas or a note that is not an object", () => {
    expect(
      attemptPayload(input({ aromas: [{ term_id: "x", sensed_on_nose: true, sensed_on_palate: false }] })),
    ).toEqual({ error: SAVE_REFUSED });
    expect(attemptPayload(input({ note: [] as unknown as Record<string, unknown> }))).toEqual({
      error: SAVE_REFUSED,
    });
  });
});

describe("revealPayload", () => {
  it("sends only the attempt and the wine, and refuses bad ids", () => {
    expect(revealPayload(ATTEMPT, WINE)).toEqual({
      attempt: { attempt_id: ATTEMPT, actual_catalog_wine_id: WINE },
    });
    expect(revealPayload("x", WINE)).toEqual({ error: SAVE_REFUSED });
    expect(revealPayload(ATTEMPT, "")).toEqual({ error: SAVE_REFUSED });
  });
});

describe("finishResultFromRpc", () => {
  it("maps the RPC's snake_case answer", () => {
    expect(
      finishResultFromRpc({
        attempt_id: ATTEMPT,
        note_id: NOTE,
        points: {
          country: 2,
          region: 3,
          appellation: 0,
          primary_grape: 8,
          secondary_grape: null,
          type_designation: null,
          vintage: 1,
        },
        total: 14,
        possible: 20,
        actual_archetype_id: ARCH,
        hue_cleared: true,
      }),
    ).toEqual({
      ok: true,
      attemptId: ATTEMPT,
      noteId: NOTE,
      points: {
        country: 2,
        region: 3,
        appellation: 0,
        primaryGrape: 8,
        secondaryGrape: null,
        typeDesignation: null,
        vintage: 1,
      },
      total: 14,
      possible: 20,
      actualArchetypeId: ARCH,
      hueCleared: true,
    });
    expect(
      finishResultFromRpc({
        attempt_id: ATTEMPT,
        note_id: NOTE,
        points: null,
        total: null,
        possible: null,
        actual_archetype_id: null,
        hue_cleared: false,
      }),
    ).toEqual({
      ok: true,
      attemptId: ATTEMPT,
      noteId: NOTE,
      points: NULL_POINTS,
      total: null,
      possible: null,
      actualArchetypeId: null,
      hueCleared: false,
    });
  });

  it("refuses an answer without both ids", () => {
    expect(finishResultFromRpc(null)).toEqual({ error: SAVE_REFUSED });
    expect(finishResultFromRpc({ note_id: NOTE })).toEqual({ error: SAVE_REFUSED });
  });
});

describe("isHistoryCursor", () => {
  it("admits a raw timestamp and a uuid, nothing that could break the filter", () => {
    expect(isHistoryCursor({ createdAt: "2026-09-24T18:00:00.123456+00:00", id: ATTEMPT })).toBe(true);
    expect(isHistoryCursor({ createdAt: "2026-09-24T18:00:00Z", id: ATTEMPT })).toBe(true);
    expect(isHistoryCursor({ createdAt: '2026-09-24T18:00:00Z",id.gt.0', id: ATTEMPT })).toBe(false);
    expect(isHistoryCursor({ createdAt: "2026-09-24T18:00:00Z", id: "1" })).toBe(false);
    expect(isHistoryCursor(null)).toBe(false);
    expect(isUuid(ATTEMPT)).toBe(true);
    expect(isUuid("x")).toBe(false);
  });
});
```

- [ ] **Step 8: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/attempt-payload.test.ts`
Expected: FAIL — `Failed to resolve import "./attempt-payload"`.

- [ ] **Step 9: Write `src/lib/training/attempt-payload.ts`**

```ts
// The server's own check of what the room sends before record_training_attempt
// runs (training-room spec §6.2, §6.5): the actions never trust the client's
// shape, and map the RPC's snake_case answer back. Pure, relative imports only,
// so vitest pins it.
import { parseSnapshot, vintageColumns } from "./pool-shape";
import type { AromaPayload, FinishInput, FinishResult, HistoryCursor } from "./action-types";
import type { PointCategory, VintageGuess } from "./types";

/** Every refusal this module makes, and the room's fallback for a thrown action. */
export const SAVE_REFUSED = "That session could not be saved.";
/** A few hundred archetypes at most; far above any real ranking, far below abuse. */
export const SNAPSHOT_MAX = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO 8601 as the browser (toISOString) and PostgREST (timestamptz) write it.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

const POINT_ORDER: readonly PointCategory[] = [
  "country",
  "region",
  "appellation",
  "primaryGrape",
  "secondaryGrape",
  "typeDesignation",
  "vintage",
];
const RPC_KEY: Record<PointCategory, string> = {
  country: "country",
  region: "region",
  appellation: "appellation",
  primaryGrape: "primary_grape",
  secondaryGrape: "secondary_grape",
  typeDesignation: "type_designation",
  vintage: "vintage",
};

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Guards the history cursor: it is spliced into a PostgREST `or=` filter. */
export function isHistoryCursor(v: unknown): v is HistoryCursor {
  if (!v || typeof v !== "object") return false;
  const { createdAt, id } = v as Record<string, unknown>;
  return typeof createdAt === "string" && TIMESTAMP.test(createdAt) && isUuid(id);
}

function validVintage(v: VintageGuess): boolean {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  if (v.kind === "NV") return true;
  if (v.kind === "YEAR") return Number.isInteger(v.year) && v.year >= 1900 && v.year <= 2100;
  if (v.kind === "TAWNY") return Number.isInteger(v.years) && v.years >= 1 && v.years <= 100;
  return false;
}

function validAromas(aromas: unknown): aromas is AromaPayload[] {
  return (
    Array.isArray(aromas) &&
    aromas.every((row) => {
      if (!row || typeof row !== "object") return false;
      const r = row as Record<string, unknown>;
      return (
        isUuid(r.term_id) &&
        typeof r.sensed_on_nose === "boolean" &&
        typeof r.sensed_on_palate === "boolean"
      );
    })
  );
}

/** record_training_attempt's p_attempt for a fresh attempt, or a refusal. */
export function attemptPayload(
  input: FinishInput,
): { attempt: Record<string, unknown> } | { error: string } {
  const ok =
    input !== null &&
    typeof input === "object" &&
    isUuid(input.sessionKey) &&
    typeof input.startedAt === "string" &&
    TIMESTAMP.test(input.startedAt) &&
    (input.pickedArchetypeId === null || isUuid(input.pickedArchetypeId)) &&
    (input.actualCatalogWineId === null || isUuid(input.actualCatalogWineId)) &&
    validVintage(input.vintage) &&
    input.note !== null &&
    typeof input.note === "object" &&
    !Array.isArray(input.note) &&
    validAromas(input.aromas) &&
    Array.isArray(input.snapshot) &&
    input.snapshot.length <= SNAPSHOT_MAX &&
    parseSnapshot(input.snapshot).length === input.snapshot.length;
  if (!ok) return { error: SAVE_REFUSED };
  return {
    attempt: {
      session_key: input.sessionKey,
      started_at: input.startedAt,
      picked_archetype_id: input.pickedArchetypeId,
      ...vintageColumns(input.vintage),
      actual_catalog_wine_id: input.actualCatalogWineId,
      candidates_snapshot: input.snapshot,
    },
  };
}

/** p_attempt for Reveal now: only the attempt and the wine (spec §3.6, §6.2 step 3). */
export function revealPayload(
  attemptId: string,
  catalogWineId: string,
): { attempt: Record<string, unknown> } | { error: string } {
  if (!isUuid(attemptId) || !isUuid(catalogWineId)) return { error: SAVE_REFUSED };
  return { attempt: { attempt_id: attemptId, actual_catalog_wine_id: catalogWineId } };
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The RPC's jsonb answer (spec §6.2 step 5) as a FinishResult. */
export function finishResultFromRpc(raw: unknown): FinishResult {
  if (!raw || typeof raw !== "object") return { error: SAVE_REFUSED };
  const r = raw as Record<string, unknown>;
  const attemptId = r.attempt_id;
  const noteId = r.note_id;
  if (!isUuid(attemptId) || !isUuid(noteId)) return { error: SAVE_REFUSED };
  const source =
    r.points && typeof r.points === "object" ? (r.points as Record<string, unknown>) : {};
  const points = Object.fromEntries(
    POINT_ORDER.map((c) => [c, numberOrNull(source[RPC_KEY[c]])]),
  ) as Record<PointCategory, number | null>;
  const actualArchetypeId = r.actual_archetype_id;
  return {
    ok: true,
    attemptId,
    noteId,
    points,
    total: numberOrNull(r.total),
    possible: numberOrNull(r.possible),
    actualArchetypeId: isUuid(actualArchetypeId) ? actualArchetypeId : null,
    hueCleared: r.hue_cleared === true,
  };
}
```

- [ ] **Step 10: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/attempt-payload.test.ts src/lib/training/pool-shape.test.ts`
Expected: PASS — 28 tests in 2 files (10 + 18).

- [ ] **Step 11: Write the server reads `src/lib/training/pool.ts`**

```ts
// The training room's server reads (training-room spec §4.6, §3.6): the
// candidate pool, the viewer's history page by page, one attempt, and the
// tally — all as the viewer under RLS. Server-only, not "use server": the page
// calls these during render (cache() shares one pool read per request) and
// src/app/taste/training/actions.ts wraps the history reads for the client.
// Every rule lives in the pure ./pool-shape; this file only queries.
//
// PostgREST answers at most 1000 rows per request, so whole-table reads go
// page by page and id lookups go in chunks (CLAUDE.md: never preload a table
// with a bare select).
import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WineColour } from "@/lib/wset/types";
import type { HistoryCursor, HistoryPage, TrainingAttemptDetail, TrainingTally } from "./action-types";
import { tally } from "./history-math";
import {
  ATTEMPT_COLUMNS,
  CATALOG_DISPLAY_COLUMNS,
  MAX_MERGE_HOPS,
  HISTORY_PAGE,
  finalWineId,
  historyOrFilter,
  pageOf,
  shapeAttemptRow,
  shapeCandidates,
  tallyRows,
  wineDisplay,
  type AromaTermRaw,
  type ArchetypeAromaRaw,
  type ArchetypeDesignationRaw,
  type ArchetypeRaw,
  type AttemptRaw,
  type CatalogDisplayRaw,
  type WineDisplay,
} from "./pool-shape";
import type { AttemptRow, Named, TrainingCandidate } from "./types";

export { coverageCountries } from "./pool-shape";
export { candidateToArchetypeView } from "./archetype-view";

type Client = SupabaseClient<Database>;
type Result<T> = { data: T[] | null; error: { message: string } | null };

const PAGE = 1000;
const ID_CHUNK = 150;

// A failed read fails the page: a pool or history quietly missing rows would mislead.
async function readAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<Result<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Training room: the ${what} read failed (${error.message})`);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

async function readByIds<T>(
  what: string,
  ids: readonly string[],
  read: (chunk: string[]) => PromiseLike<Result<T>>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const { data, error } = await read(unique.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`Training room: the ${what} read failed (${error.message})`);
    rows.push(...(data ?? []));
  }
  return rows;
}

const ARCHETYPE_COLUMNS: string =
  "id, name, description, colour, style, country_id, region_id, appellation_id, " +
  "primary_grape_id, secondary_grape_id, typical_age_low, typical_age_high, sat, " +
  "quality_low, quality_high, wine_place_id, sort_order";

/** Every archetype as a TrainingCandidate (spec §4.6). One read per table, joined in TS. */
export const readTrainingPool = cache(async (supabase: Client): Promise<TrainingCandidate[]> => {
  const [archetypesRaw, aromasRaw, termsRaw, designationsRaw] = await Promise.all([
    readAll("archetypes", (from, to) =>
      supabase.from("wine_archetypes").select(ARCHETYPE_COLUMNS).order("sort_order").order("id").range(from, to),
    ),
    readAll("archetype aromas", (from, to) =>
      supabase
        .from("wine_archetype_aromas")
        .select("archetype_id, term_id, kind, signature")
        .order("archetype_id")
        .order("term_id")
        .order("kind")
        .range(from, to),
    ),
    readAll("aroma terms", (from, to) =>
      supabase.from("wset_aroma_terms").select("id, term, group_name").order("sort_order").order("id").range(from, to),
    ),
    readAll("archetype designations", (from, to) =>
      supabase
        .from("wine_archetype_designations")
        .select("archetype_id, type_designation_id")
        .order("archetype_id")
        .order("type_designation_id")
        .range(from, to),
    ),
  ]);
  const archetypes = archetypesRaw as unknown as ArchetypeRaw[];
  const designations = designationsRaw as unknown as ArchetypeDesignationRaw[];
  const ids = (pick: (a: ArchetypeRaw) => string | null) =>
    archetypes.map(pick).filter((id): id is string => id !== null);

  const [countries, regions, appellations, grapes, typeDesignations, places] = await Promise.all([
    readByIds("countries", ids((a) => a.country_id), (chunk) =>
      supabase.from("countries").select("id, name").in("id", chunk),
    ),
    readByIds("regions", ids((a) => a.region_id), (chunk) =>
      supabase.from("regions").select("id, name").in("id", chunk),
    ),
    readByIds("appellations", ids((a) => a.appellation_id), (chunk) =>
      supabase.from("appellations").select("id, name").in("id", chunk),
    ),
    readByIds("grapes", [...ids((a) => a.primary_grape_id), ...ids((a) => a.secondary_grape_id)], (chunk) =>
      supabase.from("grapes").select("id, name").in("id", chunk),
    ),
    readByIds("type designations", designations.map((d) => d.type_designation_id), (chunk) =>
      supabase.from("type_designations").select("id, name, sort_order").in("id", chunk),
    ),
    // Only non-null place ids: most batch-1 archetypes have no map place (D9).
    readByIds("map places", ids((a) => a.wine_place_id), (chunk) =>
      supabase.from("wine_places").select("id, canonical_key").in("id", chunk),
    ),
  ]);

  const orderedDesignations: Named[] = [...typeDesignations]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));

  return shapeCandidates({
    archetypes,
    aromas: aromasRaw as unknown as ArchetypeAromaRaw[],
    terms: termsRaw as unknown as AromaTermRaw[],
    designations,
    names: { countries, regions, appellations, grapes, typeDesignations: orderedDesignations },
    placeKeys: places,
  });
});

// Follows merged_into from the given wines, a hop at a time (spec §6.1).
async function followMerges(supabase: Client, ids: readonly string[]): Promise<Map<string, string | null>> {
  const mergedInto = new Map<string, string | null>();
  let frontier = [...new Set(ids)];
  for (let hop = 0; hop <= MAX_MERGE_HOPS && frontier.length > 0; hop++) {
    const rows = await readByIds("merged wines", frontier, (chunk) =>
      supabase.from("catalog_wines").select("id, merged_into").in("id", chunk),
    );
    for (const r of rows) mergedInto.set(r.id, r.merged_into);
    frontier = rows
      .map((r) => r.merged_into)
      .filter((m): m is string => m !== null && !mergedInto.has(m));
  }
  return mergedInto;
}

type Hydrated = { row: AttemptRow; raw: AttemptRaw; wineColour: WineColour | null };

// Names the picks and the archetypes, follows merged wines and reads their labels.
// A wine the viewer cannot read (a hidden catalog row) keeps label null: the copy
// says "a wine you can't see yet".
async function hydrateAttempts(supabase: Client, raws: readonly AttemptRaw[]): Promise<Hydrated[]> {
  if (raws.length === 0) return [];
  const archetypeIds = raws
    .flatMap((r) => [r.picked_archetype_id, r.actual_archetype_id])
    .filter((id): id is string => id !== null);
  const wineIds = raws.map((r) => r.actual_catalog_wine_id).filter((id): id is string => id !== null);

  const [archetypes, mergedInto] = await Promise.all([
    readByIds("archetype names", archetypeIds, (chunk) =>
      supabase.from("wine_archetypes").select("id, name").in("id", chunk),
    ),
    followMerges(supabase, wineIds),
  ]);
  const finals = wineIds.map((id) => finalWineId(id, mergedInto));
  const displayRows = await readByIds("revealed wines", finals, (chunk) =>
    supabase.from("catalog_wines").select(CATALOG_DISPLAY_COLUMNS).in("id", chunk),
  );
  const wines = new Map<string, WineDisplay>(
    (displayRows as unknown as CatalogDisplayRaw[]).map((w) => [w.id, wineDisplay(w)]),
  );
  const archetypeNames = new Map(archetypes.map((a) => [a.id, a.name] as const));

  return raws.map((raw) => {
    const row = shapeAttemptRow(raw, { archetypeNames, mergedInto, wines });
    const wineColour = row.actual ? (wines.get(row.actual.catalogWineId)?.colour ?? null) : null;
    return { row, raw, wineColour };
  });
}

/** One page of the viewer's attempts, newest first (spec §3.6). */
export async function readTrainingHistory(
  supabase: Client,
  userId: string,
  cursor?: HistoryCursor,
): Promise<HistoryPage> {
  const base = supabase.from("training_attempts").select(ATTEMPT_COLUMNS).eq("author_id", userId);
  const filtered = cursor ? base.or(historyOrFilter(cursor)) : base;
  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_PAGE + 1);
  if (error) throw new Error(`Training room: the history read failed (${error.message})`);
  const page = pageOf((data ?? []) as unknown as AttemptRaw[], (r) => ({ createdAt: r.created_at, id: r.id }));
  const hydrated = await hydrateAttempts(supabase, page.rows);
  return { rows: hydrated.map((h) => h.row), nextCursor: page.nextCursor };
}

/** One of the viewer's attempts for the result screen; null when it is not theirs. */
export async function readTrainingAttemptDetail(
  supabase: Client,
  userId: string,
  attemptId: string,
): Promise<TrainingAttemptDetail | null> {
  const { data, error } = await supabase
    .from("training_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("author_id", userId)
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(`Training room: the attempt read failed (${error.message})`);
  if (!data) return null;
  const [hydrated] = await hydrateAttempts(supabase, [data as unknown as AttemptRaw]);
  return { row: hydrated.row, noteId: hydrated.raw.note_id, wineColour: hydrated.wineColour };
}

/** "6 of 9 right on the grape · 4 on the appellation" over every attempt — one light select. */
export async function readTrainingTally(supabase: Client, userId: string): Promise<TrainingTally> {
  const rows = await readAll("tally", (from, to) =>
    supabase
      .from("training_attempts")
      .select("primary_grape_points, appellation_points, total_points")
      .eq("author_id", userId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return tally(tallyRows(rows as unknown as Parameters<typeof tallyRows>[0]));
}
```

- [ ] **Step 12: Write the actions `src/app/taste/training/actions.ts`**

```ts
"use server";

// The training room's server actions (training-room spec §6.5): thin wrappers
// over record_training_attempt and the history reads. Nothing here writes a
// table directly — no client role can write training_attempts (D14). The
// input is checked again on the server (attemptPayload / revealPayload) and a
// refusal from the RPC comes back verbatim. Types live in the plain module
// src/lib/training/action-types.ts: this file exports only async functions.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type {
  FinishInput,
  FinishResult,
  HistoryCursor,
  HistoryPage,
  TrainingAttemptDetail,
} from "@/lib/training/action-types";
import {
  SAVE_REFUSED,
  attemptPayload,
  finishResultFromRpc,
  isHistoryCursor,
  isUuid,
  revealPayload,
} from "@/lib/training/attempt-payload";
import { readTrainingAttemptDetail, readTrainingHistory } from "@/lib/training/pool";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

// The room's history and the notes archive (a revealed training note appears there).
function refresh() {
  revalidatePath("/taste/training");
  revalidatePath("/taste/notes");
}

export async function finishTrainingSession(input: FinishInput): Promise<FinishResult> {
  const session = await signedIn();
  if (!session) return { error: SAVE_REFUSED };
  const payload = attemptPayload(input);
  if ("error" in payload) return payload;
  const { data, error } = await session.supabase.rpc("record_training_attempt", {
    p_note: input.note as unknown as Json,
    p_aromas: input.aromas as unknown as Json,
    p_attempt: payload.attempt as unknown as Json,
  });
  if (error) return { error: error.message };
  refresh();
  return finishResultFromRpc(data as unknown);
}

export async function revealTrainingAttempt(
  attemptId: string,
  catalogWineId: string,
): Promise<FinishResult> {
  const session = await signedIn();
  if (!session) return { error: SAVE_REFUSED };
  const payload = revealPayload(attemptId, catalogWineId);
  if ("error" in payload) return payload;
  // A re-reveal ignores p_note and p_aromas entirely (spec §6.2 step 3).
  const { data, error } = await session.supabase.rpc("record_training_attempt", {
    p_note: {} as unknown as Json,
    p_aromas: [] as unknown as Json,
    p_attempt: payload.attempt as unknown as Json,
  });
  if (error) return { error: error.message };
  refresh();
  return finishResultFromRpc(data as unknown);
}

export async function loadMoreTrainingHistory(cursor: HistoryCursor): Promise<HistoryPage> {
  const session = await signedIn();
  if (!session || !isHistoryCursor(cursor)) return { rows: [], nextCursor: null };
  return readTrainingHistory(session.supabase, session.userId, cursor);
}

export async function loadTrainingAttempt(attemptId: string): Promise<TrainingAttemptDetail | null> {
  const session = await signedIn();
  if (!session || !isUuid(attemptId)) return null;
  return readTrainingAttemptDetail(session.supabase, session.userId, attemptId);
}
```

- [ ] **Step 13: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training && npx tsc --noEmit && npx eslint src/lib/training/action-types.ts src/lib/training/pool-shape.ts src/lib/training/pool-shape.test.ts src/lib/training/attempt-payload.ts src/lib/training/attempt-payload.test.ts src/lib/training/pool.ts src/app/taste/training/actions.ts`
Expected: vitest PASS (every file under `src/lib/training`, including this task's 28 tests);
`tsc` exits 0 with no output; `eslint` prints nothing. If `tsc` reports an unknown column in a
`.select(...)` literal, the Task 1 types disagree with the spec §6.1/§4.1 names — fix
`database.types.ts` (Task 1), not this code.

- [ ] **Step 14: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/action-types.ts src/lib/training/pool-shape.ts src/lib/training/pool-shape.test.ts src/lib/training/attempt-payload.ts src/lib/training/attempt-payload.test.ts src/lib/training/pool.ts src/app/taste/training/actions.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): pool and history reads, finish and reveal actions" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The room

**Files:**
- Modify: `src/lib/training/copy.ts` and `src/lib/training/copy.test.ts` (only the names
  Task 2 did not already define — Step 1)
- Create: `src/lib/training/panel.ts`
- Test: `src/lib/training/panel.test.ts`
- Create: `src/app/taste/training/page.tsx`
- Create: `src/app/taste/training/training-room.tsx`
- Create: `src/app/taste/training/candidates-panel.tsx`
- Create: `src/app/taste/training/candidates-strip.tsx`
- Create: `src/app/taste/training/candidates-sheet.tsx`
- Create: `src/app/taste/training/archetype-detail.tsx`
- Create: `src/app/taste/training/your-call.tsx`

**Interfaces:**
- Consumes: Task 2 — `TRAINING_COPY`, `shortName`, `coverageLine`, `stripLine`,
  `lineageLine`, `tallyLine` (copy.ts); `readDraft(userId): TrainingDraft | null`,
  `writeDraft(d)`, `clearDraft(userId)`, `newSessionKey()` (draft.ts); the types. Task 3 —
  `rankCandidates(note, extras, pool, lexicon)`, `snapshotRanking(ranked)`. Task 4 —
  `noteToPayload(state, ids)`, `aromasToPayload(state)` in `src/lib/wset/note-state.ts`
  (beside the existing `emptyNoteState`). Task 5 — `WsetSheet` props `onChange`,
  `footerAction`, `belowBar`, `aside`, `onClose`, `bubbles`, `fortified`, optional
  `onSave`. Task 6 — `ArchetypeSheet({ a, answers, idPrefix })`,
  `candidateToArchetypeView`. Task 7 —
  `openAddWineSheet({ kind: "note", reveal: true }, { onNotePick })`. Task 9 —
  `readTrainingPool`, `readTrainingHistory`, `readTrainingTally`, `coverageCountries`,
  `finishTrainingSession`, `SAVE_REFUSED`, `HistoryPage`, `TrainingTally`.
- Produces (used by Task 11): `TrainingRoom` with the exact anchors Task 11 edits
  (`type View = "landing" | "session";`, the `finish` success block, the sessions `<p>`);
  `panel.ts` exports `PANEL_LIMIT`, `PanelGroup`, `PanelView`, `isBeforeAnswers`,
  `panelView`, `CALL_LIMIT`, `CALL_SEARCH_LIMIT`, `yourCallOptions`,
  `vintagePickerValue`, `vintageFromPickerId`, `VintagePick`, `tawnyYearsFromInput`.

- [ ] **Step 1: Make sure copy.ts has every name the room reads**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && for n in TRAINING_COPY continueLine sheetTitleLine showAllLine itWasLine vintageGuessLabel youSaidLine percentLabel shortName coverageLine stripLine lineageLine tallyLine resultTotalLine attemptRowLine hueClearedLine styleVerdictLine; do grep -q "export \(const\|function\) $n\b" src/lib/training/copy.ts && echo "ok $n" || echo "MISSING $n"; done; for k in eyebrow title promise start discard discardArmed footerAction candidatesHeading beforeAnswers unlikely yourCall whichWine somethingElse notInList vintageOptional revealBottle cantFindOut youDidntPick wherePointed notRevealed anotherGlass seeNote done rowLabels markRight markWrong markNone yourSessions showMore noSessions revealNow badge notRevealedRow unreadableWine; do grep -q "^  $k:" src/lib/training/copy.ts && echo "ok key $k" || echo "MISSING key $k"; done`
Expected: every line starts `ok`. For each `MISSING` line, add exactly the matching
definition below to `src/lib/training/copy.ts` (a missing `TRAINING_COPY` key goes inside
the existing `TRAINING_COPY` object with the value shown; if `TRAINING_COPY` itself is
missing, add the whole object). Add `VintageGuess` to copy.ts's `import type { … } from "./types";`
line if it is not imported yet. Values are verbatim from spec §9.

```ts
export const TRAINING_COPY = {
  eyebrow: "Training room · Preview",
  title: "Taste blind. Then find out.",
  promise:
    "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
  start: "Start a session",
  discard: "Discard",
  discardArmed: "Tap again to discard",
  footerAction: "Your call →",
  candidatesHeading: "What it could be",
  beforeAnswers: "Start describing the wine",
  unlikely: "Unlikely from what you've said",
  yourCall: "Your call",
  whichWine: "Which wine is it?",
  somethingElse: "Something else…",
  notInList: "It's not in the list",
  vintageOptional: "Vintage (optional)",
  revealBottle: "Reveal the bottle",
  cantFindOut: "I can't find out",
  youDidntPick: "You didn't pick a wine",
  wherePointed: "Where your note pointed",
  notRevealed: "Not revealed — your note is kept. Reveal now from Your sessions.",
  anotherGlass: "Another glass",
  seeNote: "See the note",
  done: "Done",
  rowLabels: {
    country: "Country",
    region: "Region",
    appellation: "Appellation",
    primaryGrape: "Grape",
    secondaryGrape: "Second grape",
    typeDesignation: "Designation",
    vintage: "Vintage",
  },
  markRight: "✓",
  markWrong: "✗",
  markNone: "—",
  yourSessions: "Your sessions",
  showMore: "Show more",
  noSessions: "No sessions yet",
  revealNow: "Reveal now",
  badge: "Training",
  notRevealedRow: "Training room · not revealed",
  unreadableWine: "a wine you can't see yet",
} as const;

/** "Continue your session · started 20:14" — `time` is already formatted. */
export function continueLine(time: string): string {
  return `Continue your session · started ${time}`;
}

/** "Unknown wine · started 20:14" — the WSET sheet's title in the room. */
export function sheetTitleLine(time: string): string {
  return `Unknown wine · started ${time}`;
}

/** "Show all 42". */
export function showAllLine(n: number): string {
  return `Show all ${n}`;
}

/** "It was {wine}". */
export function itWasLine(wine: string): string {
  return `It was ${wine}`;
}

/** A vintage guess as words: "2016", "NV", "20 years tawny" (the ladder's wording). */
export function vintageGuessLabel(v: VintageGuess): string | null {
  if (v === null) return null;
  if (v.kind === "YEAR") return String(v.year);
  if (v.kind === "NV") return "NV";
  return `${v.years} years tawny`;
}

/** "You said {shortName}{, vintage}". */
export function youSaidLine(pickName: string, vintage: VintageGuess): string {
  const v = vintageGuessLabel(vintage);
  return `You said ${shortName(pickName)}${v ? `, ${v}` : ""}`;
}

/** "91 %" — spec §9 writes a space before the sign. */
export function percentLabel(closeness: number): string {
  return `${closeness} %`;
}
```

Then add this block to the end of `src/lib/training/copy.test.ts`, adding every name it
uses that the file does not import yet to its existing `import { … } from "./copy";` line:

```ts
describe("room copy read by the room components (plan Task 10)", () => {
  it("keeps the spec §9 fixed strings", () => {
    expect(TRAINING_COPY.eyebrow).toBe("Training room · Preview");
    expect(TRAINING_COPY.title).toBe("Taste blind. Then find out.");
    expect(TRAINING_COPY.start).toBe("Start a session");
    expect(TRAINING_COPY.discardArmed).toBe("Tap again to discard");
    expect(TRAINING_COPY.footerAction).toBe("Your call →");
    expect(TRAINING_COPY.candidatesHeading).toBe("What it could be");
    expect(TRAINING_COPY.unlikely).toBe("Unlikely from what you've said");
    expect(TRAINING_COPY.notInList).toBe("It's not in the list");
    expect(TRAINING_COPY.notRevealed).toBe("Not revealed — your note is kept. Reveal now from Your sessions.");
    expect(TRAINING_COPY.rowLabels.secondaryGrape).toBe("Second grape");
    expect([TRAINING_COPY.markRight, TRAINING_COPY.markWrong, TRAINING_COPY.markNone]).toEqual(["✓", "✗", "—"]);
    expect(TRAINING_COPY.notRevealedRow).toBe("Training room · not revealed");
    expect(TRAINING_COPY.unreadableWine).toBe("a wine you can't see yet");
  });

  it("fills the room's templates", () => {
    expect(continueLine("20:14")).toBe("Continue your session · started 20:14");
    expect(sheetTitleLine("20:14")).toBe("Unknown wine · started 20:14");
    expect(showAllLine(42)).toBe("Show all 42");
    expect(itWasLine("Château Léoville Barton 2016")).toBe("It was Château Léoville Barton 2016");
    expect(youSaidLine("A typical Pauillac", null)).toBe("You said Pauillac");
    expect(youSaidLine("A typical Pauillac", { kind: "YEAR", year: 2016 })).toBe("You said Pauillac, 2016");
    expect(youSaidLine("A typical Champagne", { kind: "NV" })).toBe("You said Champagne, NV");
    expect(youSaidLine("A typical Tawny Port", { kind: "TAWNY", years: 20 })).toBe(
      "You said Tawny Port, 20 years tawny",
    );
    expect(percentLabel(91)).toBe("91 %");
  });
});
```

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/copy.test.ts`
Expected: PASS (Task 2's tests plus these 2).

- [ ] **Step 2: Write the failing test `src/lib/training/panel.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { TRAINING_COPY } from "./copy";
import {
  PANEL_LIMIT,
  isBeforeAnswers,
  panelView,
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerValue,
  yourCallOptions,
} from "./panel";
import type { CapReason, RankedCandidate, TrainingCandidate } from "./types";

function candidate(id: string, name: string, country: string, region = "Somewhere"): TrainingCandidate {
  return {
    id,
    name,
    description: null,
    colour: "RED",
    style: "STILL",
    country: { id: `c-${country}`, name: country },
    region: { id: `r-${region}`, name: region },
    appellation: { id: `a-${id}`, name: `${name} AOC`, isRegional: false },
    primaryGrape: { id: "g", name: "Syrah" },
    secondaryGrape: null,
    designations: [],
    typicalAge: null,
    sat: {},
    aromas: [],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  };
}

function ranked(c: TrainingCandidate, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: c, closeness, capped, explanation: null, signatureHits: [] };
}

const ids = (rows: RankedCandidate[]) => rows.map((r) => r.candidate.id);

const BEFORE = [
  ranked(candidate("1", "A typical Barossa Shiraz", "Australia"), null),
  ranked(candidate("2", "A typical Clare Valley Riesling", "Australia"), null),
  ranked(candidate("3", "A typical Bandol", "France"), null),
  ranked(candidate("4", "A typical Chablis", "France"), null),
  ranked(candidate("5", "A typical Margaux", "France"), null),
  ranked(candidate("6", "A typical Barolo", "Italy"), null),
  ranked(candidate("7", "A typical Soave", "Italy"), null),
];

const SCORED = [
  ranked(candidate("1", "A typical Pauillac", "France", "Bordeaux"), 91),
  ranked(candidate("2", "A typical Margaux", "France", "Bordeaux"), 84),
  ranked(candidate("3", "A typical Bandol", "France", "Provence"), 80),
  ranked(candidate("4", "A typical Barolo", "Italy", "Piemonte"), 72),
  ranked(candidate("5", "A typical Rioja Reserva", "Spain", "Rioja"), 70),
  ranked(candidate("6", "A typical Barossa Shiraz", "Australia", "South Australia"), 61),
  ranked(candidate("7", "A typical Côte-Rôtie", "France", "Rhône"), 55),
];

describe("panelView", () => {
  it("groups the first five by country before anything is answered", () => {
    const view = panelView(BEFORE, false);
    expect(view.before).toBe(true);
    expect(view.total).toBe(7);
    expect(view.hidden).toBe(2);
    expect(view.groups.map((g) => [g.heading, ids(g.rows)])).toEqual([
      ["Australia", ["1", "2"]],
      ["France", ["3", "4", "5"]],
    ]);
    expect(PANEL_LIMIT).toBe(5);
  });

  it("shows every candidate once expanded", () => {
    const view = panelView(BEFORE, true);
    expect(view.hidden).toBe(0);
    expect(view.groups.map((g) => g.heading)).toEqual(["Australia", "France", "Italy"]);
  });

  it("puts capped candidates under the unlikely heading", () => {
    const list = [
      ranked(candidate("1", "A typical Pauillac", "France"), 91),
      ranked(candidate("2", "A typical Margaux", "France"), 84),
      ranked(candidate("3", "A typical Bandol", "France"), null),
      ranked(candidate("4", "A typical Chablis", "France"), 15, "colour"),
      ranked(candidate("5", "A typical Champagne", "France"), 12, "bubbles"),
      ranked(candidate("6", "A typical Sancerre", "France"), null, "colour"),
    ];
    const view = panelView(list, false);
    expect(view.before).toBe(false);
    expect(view.groups.map((g) => [g.heading, ids(g.rows)])).toEqual([
      [null, ["1", "2", "3"]],
      [TRAINING_COPY.unlikely, ["4", "5"]],
    ]);
    expect(view.hidden).toBe(1);
  });

  it("is in before-answers mode only while nothing has a number or a cap", () => {
    const c = candidate("1", "A typical Pauillac", "France");
    expect(isBeforeAnswers([ranked(c, null)])).toBe(true);
    expect(isBeforeAnswers([])).toBe(true);
    expect(isBeforeAnswers([ranked(c, 40)])).toBe(false);
    expect(isBeforeAnswers([ranked(c, null, "bubbles")])).toBe(false);
  });
});

describe("yourCallOptions", () => {
  it("lists the top five and keeps a pick from further down", () => {
    expect(ids(yourCallOptions(SCORED, "", null))).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids(yourCallOptions(SCORED, "", "7"))).toEqual(["1", "2", "3", "4", "5", "7"]);
    expect(ids(yourCallOptions(SCORED, "", "2"))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("searches every candidate by name, region or country, accents folded", () => {
    expect(ids(yourCallOptions(SCORED, "cote rotie", null))).toEqual(["7"]);
    expect(ids(yourCallOptions(SCORED, "rhone", null))).toEqual(["7"]);
    expect(ids(yourCallOptions(SCORED, "italy", null))).toEqual(["4"]);
    expect(ids(yourCallOptions(SCORED, "zzz", null))).toEqual([]);
  });
});

describe("vintage picker mapping", () => {
  const PRESETS = [10, 20, 30, 40];

  it("names the picker row a guess sits on", () => {
    expect(vintagePickerValue(null, PRESETS)).toBe("");
    expect(vintagePickerValue({ kind: "YEAR", year: 2016 }, PRESETS)).toBe("year:2016");
    expect(vintagePickerValue({ kind: "NV" }, PRESETS)).toBe("nv");
    expect(vintagePickerValue({ kind: "TAWNY", years: 20 }, PRESETS)).toBe("tawny:20");
    expect(vintagePickerValue({ kind: "TAWNY", years: 25 }, PRESETS)).toBe("tawny:other");
  });

  it("turns a picked row back into a guess", () => {
    expect(vintageFromPickerId(null)).toEqual({ vintage: null });
    expect(vintageFromPickerId("nv")).toEqual({ vintage: { kind: "NV" } });
    expect(vintageFromPickerId("year:2016")).toEqual({ vintage: { kind: "YEAR", year: 2016 } });
    expect(vintageFromPickerId("tawny:20")).toEqual({ vintage: { kind: "TAWNY", years: 20 } });
    expect(vintageFromPickerId("tawny:other")).toEqual({ otherTawny: true });
    expect(vintageFromPickerId("junk")).toEqual({ vintage: null });
  });

  it("reads a typed tawny age of 1 to 100 whole years", () => {
    expect(tawnyYearsFromInput("25")).toBe(25);
    expect(tawnyYearsFromInput("")).toBeNull();
    expect(tawnyYearsFromInput("0")).toBeNull();
    expect(tawnyYearsFromInput("101")).toBeNull();
    expect(tawnyYearsFromInput("2.5")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/panel.test.ts`
Expected: FAIL — `Failed to resolve import "./panel"`.

- [ ] **Step 4: Write `src/lib/training/panel.ts`**

```ts
// View rules for the room's candidate list and Your call card (training-room
// spec §3.3, §5.8): the laptop column's top five and Show all, the
// before-answers country groups, the "Unlikely from what you've said" group,
// the Your call options and the vintage picker's ids. Pure, relative imports
// only, so vitest pins it.
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
} from "../../app/tastings/[id]/play/ladder-types";
import { foldName } from "../wine-identity/fold";
import { TRAINING_COPY } from "./copy";
import type { RankedCandidate, VintageGuess } from "./types";

/** Rows the laptop column shows before Show all. */
export const PANEL_LIMIT = 5;

export type PanelGroup = { key: string; heading: string | null; rows: RankedCandidate[] };
export type PanelView = { before: boolean; groups: PanelGroup[]; total: number; hidden: number };

/** Nothing answered yet that any candidate can be measured on, and nothing capped. */
export function isBeforeAnswers(ranked: readonly RankedCandidate[]): boolean {
  return ranked.every((r) => r.closeness === null && r.capped === null);
}

/**
 * The list as groups, in the matcher's order. Before any answer the groups are
 * countries (the matcher already sorts un-numbered candidates by country then
 * name); after, the uncapped rows come first without a heading and the capped
 * ones follow under "Unlikely from what you've said".
 */
export function panelView(
  ranked: readonly RankedCandidate[],
  expanded: boolean,
  limit: number = PANEL_LIMIT,
): PanelView {
  const before = isBeforeAnswers(ranked);
  const rows = expanded ? [...ranked] : ranked.slice(0, limit);
  const groups: PanelGroup[] = [];
  for (const r of rows) {
    const key = before ? `country:${r.candidate.country.name}` : r.capped ? "unlikely" : "likely";
    const heading = before ? r.candidate.country.name : r.capped ? TRAINING_COPY.unlikely : null;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, heading, rows: [r] });
  }
  return { before, groups, total: ranked.length, hidden: ranked.length - rows.length };
}

/** Your call's list without a search: the top five. */
export const CALL_LIMIT = 5;
/** Your call's search results. */
export const CALL_SEARCH_LIMIT = 20;

/**
 * The candidates Your call offers: the ranking's top five (plus the current
 * pick when it sits further down), or — with a query — every candidate whose
 * name, appellation, region or country contains it, accents and punctuation
 * folded, in ranking order.
 */
export function yourCallOptions(
  ranked: readonly RankedCandidate[],
  query: string,
  pickedId: string | null,
): RankedCandidate[] {
  const key = foldName(query);
  if (key !== "") {
    return ranked
      .filter((r) =>
        [r.candidate.name, r.candidate.appellation.name, r.candidate.region.name, r.candidate.country.name].some(
          (n) => foldName(n).includes(key),
        ),
      )
      .slice(0, CALL_SEARCH_LIMIT);
  }
  const top = ranked.slice(0, CALL_LIMIT);
  if (pickedId && !top.some((r) => r.candidate.id === pickedId)) {
    const picked = ranked.find((r) => r.candidate.id === pickedId);
    if (picked) return [...top, picked];
  }
  return top;
}

/** The guess ladder's vintage picker row a guess sits on ("" = none). */
export function vintagePickerValue(v: VintageGuess, tawnyPresets: readonly number[]): string {
  if (v === null) return "";
  if (v.kind === "YEAR") return vintageYearId(v.year);
  if (v.kind === "NV") return VINTAGE_NV_ID;
  return tawnyPresets.includes(v.years) ? vintageTawnyId(v.years) : VINTAGE_TAWNY_OTHER_ID;
}

export type VintagePick = { vintage: VintageGuess } | { otherTawny: true };

/** A picked row as a guess; "Other age…" asks for a typed age instead. */
export function vintageFromPickerId(id: string | null): VintagePick {
  if (id === null) return { vintage: null };
  if (id === VINTAGE_NV_ID) return { vintage: { kind: "NV" } };
  if (id === VINTAGE_TAWNY_OTHER_ID) return { otherTawny: true };
  if (id.startsWith("year:")) {
    const year = Number(id.slice(5));
    return Number.isInteger(year) ? { vintage: { kind: "YEAR", year } } : { vintage: null };
  }
  if (id.startsWith("tawny:")) {
    const years = Number(id.slice(6));
    return Number.isInteger(years) ? { vintage: { kind: "TAWNY", years } } : { vintage: null };
  }
  return { vintage: null };
}

/** A typed tawny age: whole years 1–100, as the ladder's "Other age…" accepts. */
export function tawnyYearsFromInput(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/panel.test.ts`
Expected: PASS — 9 tests in 1 file.

- [ ] **Step 6: Write `src/app/taste/training/archetype-detail.tsx`**

```tsx
"use client";

// A candidate's full profile for the room: the map's read-only archetype sheet
// with the taster's own answers drawn on its ranges (spec §3.3, §7.2), and the
// designations its label would carry (D10). `idPrefix` keeps its section ids
// apart from the WSET sheet on the same page.
import { ArchetypeSheet } from "@/components/wset/archetype-sheet";
import { candidateToArchetypeView } from "@/lib/training/archetype-view";
import type { TrainingCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";

export function ArchetypeDetail({
  candidate,
  note,
}: {
  candidate: TrainingCandidate;
  note: WsetNoteState;
}) {
  return (
    <div className="flex flex-col gap-2">
      {candidate.designations.length > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {candidate.designations.map((d) => d.name).join(" · ")}
        </p>
      ) : null}
      <ArchetypeSheet
        a={candidateToArchetypeView(candidate)}
        answers={note}
        idPrefix={`archetype-${candidate.id}-`}
      />
    </div>
  );
}
```

- [ ] **Step 7: Write `src/app/taste/training/candidates-panel.tsx`**

```tsx
"use client";

// "What it could be" — the laptop column (lg+, spec §3.3): the top five
// candidates, Show all N in place, the capped ones last under "Unlikely from
// what you've said". A row opens the candidate's profile in a popover anchored
// to it. CandidateRow and CandidateGroups are shared with the phone sheet.
// Tokens only: the bar is --primary, a capped row --muted-foreground.
import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Eyebrow } from "@/components/overview/eyebrow";
import { TRAINING_COPY, lineageLine, percentLabel, shortName, showAllLine } from "@/lib/training/copy";
import { panelView, type PanelView } from "@/lib/training/panel";
import type { RankedCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function CandidateRow({
  r,
  onOpen,
}: {
  r: RankedCandidate;
  onOpen: (anchor: HTMLElement) => void;
}) {
  const capped = r.capped !== null;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className={cn(
        "flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        TAP,
      )}
    >
      <span className={cn("text-[13.5px] leading-tight font-semibold", capped && "text-muted-foreground")}>
        {r.candidate.name}
      </span>
      <span className="text-[11.5px] leading-snug text-muted-foreground">{lineageLine(r.candidate)}</span>
      {r.closeness !== null ? (
        <span className="flex items-center gap-2">
          <span
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={r.closeness}
            aria-label={shortName(r.candidate.name)}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className={cn("block h-full rounded-full", capped ? "bg-muted-foreground" : "bg-primary")}
              style={{ width: `${r.closeness}%` }}
            />
          </span>
          <span className="w-11 shrink-0 text-right text-[12px] font-semibold tabular-nums">
            {percentLabel(r.closeness)}
          </span>
        </span>
      ) : null}
      {r.explanation ? (
        <span className="text-[11.5px] leading-snug text-muted-foreground">{r.explanation}</span>
      ) : null}
    </button>
  );
}

export function CandidateGroups({
  view,
  onOpen,
}: {
  view: PanelView;
  onOpen: (id: string, anchor: HTMLElement) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {view.groups.map((group) => (
        <div key={group.key} className="flex flex-col">
          {group.heading ? (
            <Eyebrow size="sm" className="block px-3 pt-2 pb-1">
              {group.heading}
            </Eyebrow>
          ) : null}
          <ul className="flex flex-col">
            {group.rows.map((r) => (
              <li key={r.candidate.id}>
                <CandidateRow r={r} onOpen={(anchor) => onOpen(r.candidate.id, anchor)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function CandidatesPanel({ ranked, note }: { ranked: RankedCandidate[]; note: WsetNoteState }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const view = panelView(ranked, expanded);
  const open = detail ? (ranked.find((r) => r.candidate.id === detail.id) ?? null) : null;

  return (
    <section
      aria-labelledby="training-candidates"
      className="flex flex-col gap-2 rounded-[12px] border border-border bg-card p-2"
    >
      <h2 id="training-candidates" className="px-3 pt-2 font-heading text-[19px] font-semibold">
        {TRAINING_COPY.candidatesHeading}
      </h2>
      {view.before ? (
        <p className="px-3 text-[12.5px] text-muted-foreground">{TRAINING_COPY.beforeAnswers}</p>
      ) : null}
      <CandidateGroups view={view} onOpen={(id, anchor) => setDetail({ id, anchor })} />
      {view.hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "mx-1 mb-1 flex items-center justify-center rounded-[10px] border border-border bg-background py-2 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold",
            TAP,
          )}
        >
          {showAllLine(view.total)}
        </button>
      ) : null}

      <PopoverPrimitive.Root
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setDetail(null);
        }}
        modal={false}
      >
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            anchor={detail?.anchor ?? null}
            positionMethod="fixed"
            side="left"
            align="start"
            sideOffset={12}
            collisionPadding={16}
            className="z-50"
          >
            <PopoverPrimitive.Popup
              initialFocus={false}
              className="max-h-[80vh] w-[560px] overflow-y-auto overscroll-contain rounded-2xl bg-background p-4 shadow-lg ring-1 ring-foreground/10 outline-hidden"
            >
              {open ? <ArchetypeDetail candidate={open.candidate} note={note} /> : null}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </section>
  );
}
```

- [ ] **Step 8: Write `src/app/taste/training/candidates-strip.tsx`**

```tsx
"use client";

// Below lg: the 44 px strip in the WSET sheet's sticky bar (`belowBar`, spec
// §3.3) — "Top match: Pauillac 91 % · 2 more close" — which opens the
// candidates sheet. It re-renders with every answer.
import { ChevronUp } from "lucide-react";
import { stripLine } from "@/lib/training/copy";
import type { RankedCandidate } from "@/lib/training/types";

export function CandidatesStrip({ ranked, onOpen }: { ranked: RankedCandidate[]; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="mt-2 flex h-11 w-full items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-left text-[13px] font-semibold text-foreground lg:hidden"
    >
      <span className="min-w-0 flex-1 truncate">{stripLine(ranked)}</span>
      <ChevronUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
```

- [ ] **Step 9: Write `src/app/taste/training/candidates-sheet.tsx`**

```tsx
"use client";

// Below lg: the full ranked list as the app's bottom sheet (spec §3.3, §8) —
// the tour sheet's idiom: one base-ui Dialog, rounded top, drag pill, at most
// 88dvh, the PHONE classes as max-lg: variants and a centred card from lg
// (never seen: the column takes over there). A row swaps the sheet's content
// to that candidate's profile with a back arrow — no stacked sheets. Escape
// and the backdrop close it; focus moves in on a fine pointer only (the
// Popover touch rule). The list body is the only nested scroller (§8).
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TRAINING_COPY } from "@/lib/training/copy";
import { panelView } from "@/lib/training/panel";
import type { RankedCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";
import { CandidateGroups } from "./candidates-panel";

// Overrides DialogContent's centred defaults below lg (tailwind-merge keeps the
// variants beside the defaults; a variant wins where it applies). max-w needs
// `!` to beat the default `sm:max-w-sm` between sm and lg.
const PHONE =
  "flex flex-col gap-0 overflow-hidden bg-card p-0 text-foreground max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-h-[88dvh] max-lg:w-full max-lg:max-w-none! max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-[22px_22px_0_0] max-lg:ring-0 max-lg:data-open:zoom-in-100 max-lg:data-open:slide-in-from-bottom-8";
const CARD = "lg:max-h-[80vh] lg:w-[480px] lg:max-w-[calc(100vw-2rem)] lg:rounded-2xl";

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

export function CandidatesSheet({
  open,
  onOpenChange,
  ranked,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ranked: RankedCandidate[];
  note: WsetNoteState;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? (ranked.find((r) => r.candidate.id === detailId) ?? null) : null;
  const view = panelView(ranked, true);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDetailId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={() => finePointer()}
        finalFocus={false}
        className={cn(PHONE, CARD)}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-3">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border lg:hidden" />
          <div className="flex items-center gap-1">
            {detail ? (
              <button
                type="button"
                aria-label="Back"
                onClick={() => setDetailId(null)}
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft aria-hidden className="size-5" />
              </button>
            ) : null}
            <DialogTitle className="min-w-0 font-heading text-[20px] leading-tight font-semibold">
              {detail ? detail.candidate.name : TRAINING_COPY.candidatesHeading}
            </DialogTitle>
          </div>
          {!detail && view.before ? (
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {TRAINING_COPY.beforeAnswers}
            </DialogDescription>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
          {detail ? (
            <div className="px-2">
              <ArchetypeDetail candidate={detail.candidate} note={note} />
            </div>
          ) : (
            <CandidateGroups view={view} onOpen={(id) => setDetailId(id)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 10: Write `src/app/taste/training/your-call.tsx`**

```tsx
"use client";

// "Your call" — the card under the sheet at every width (spec §3.3): which
// wine it is (the ranked candidates with their percentages, a search over
// every candidate, or "It's not in the list"), an optional vintage through the
// guess ladder's own vintage picker (years, NV, tawny ages, "Other age…"), then
// Reveal the bottle / I can't find out. Every value is React state owned by
// the room (CLAUDE.md: never an uncontrolled input).
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/overview/eyebrow";
import { FieldPicker } from "@/app/tastings/[id]/play/field-picker";
import { vintageOptions } from "@/app/tastings/[id]/play/guess-write";
import { VINTAGE_EMPTY } from "@/app/tastings/[id]/play/ladder-copy";
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
  type PickerGroup,
} from "@/app/tastings/[id]/play/ladder-types";
import {
  TRAINING_COPY,
  lineageLine,
  percentLabel,
  shortName,
  vintageGuessLabel,
} from "@/lib/training/copy";
import {
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerValue,
  yourCallOptions,
} from "@/lib/training/panel";
import type { RankedCandidate, VintageGuess } from "@/lib/training/types";
import { cn } from "@/lib/utils";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

function OptionRow({
  checked,
  onSelect,
  title,
  sub,
  pct,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  sub?: string;
  pct?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors",
        checked ? "border-primary bg-gold/10" : "border-border hover:bg-muted",
        TAP,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold">{title}</span>
        {sub ? <span className="truncate text-[11.5px] text-muted-foreground">{sub}</span> : null}
      </span>
      {pct ? <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">{pct}</span> : null}
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          checked ? "bg-primary text-primary-foreground" : "border-[1.5px] border-border",
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

export function YourCall({
  ranked,
  pickedId,
  onPick,
  vintage,
  onVintage,
  onReveal,
  onCantFindOut,
  busy,
  error,
}: {
  ranked: RankedCandidate[];
  pickedId: string | null;
  onPick: (id: string | null) => void;
  vintage: VintageGuess;
  onVintage: (v: VintageGuess) => void;
  onReveal: () => void;
  onCantFindOut: () => void;
  busy: boolean;
  error: string | null;
}) {
  // The guess ladder does the same: its picker lists years from next year down.
  const { years, tawny } = vintageOptions(new Date());
  const [query, setQuery] = useState("");
  // "It's not in the list" and "nothing picked yet" are both a null pick; this
  // flag only says which one the taster tapped.
  const [notListed, setNotListed] = useState(false);
  const [vintageOpen, setVintageOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(
    vintage?.kind === "TAWNY" && !tawny.includes(vintage.years),
  );
  const [otherText, setOtherText] = useState(
    vintage?.kind === "TAWNY" && !tawny.includes(vintage.years) ? String(vintage.years) : "",
  );
  const vintageInputRef = useRef<HTMLInputElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const options = yourCallOptions(ranked, query, pickedId);
  const otherYears = tawnyYearsFromInput(otherText);

  // The ladder's own groups, word for word (guess-ladder.tsx, "vintage").
  const groups: PickerGroup[] = [
    { heading: "Year", options: years.map((y) => ({ id: vintageYearId(y), name: String(y) })) },
    { heading: "Non-vintage", options: [{ id: VINTAGE_NV_ID, name: "NV", sub: "Non-vintage" }] },
    {
      heading: "Tawny",
      options: [
        ...tawny.map((n) => ({ id: vintageTawnyId(n), name: `${n} years` })),
        { id: VINTAGE_TAWNY_OTHER_ID, name: "Other age…" },
      ],
    },
  ];

  function pick(id: string | null, listed: boolean) {
    setNotListed(!listed);
    onPick(id);
  }

  function pickVintage(id: string | null) {
    const result = vintageFromPickerId(id);
    setVintageOpen(false);
    if ("otherTawny" in result) {
      setOtherOpen(true);
      // In the same tap: the phone keyboard only opens for a synchronous focus.
      otherInputRef.current?.focus();
      return;
    }
    setOtherOpen(false);
    onVintage(result.vintage);
  }

  function confirmOther() {
    if (otherYears === null) return;
    onVintage({ kind: "TAWNY", years: otherYears });
    setOtherOpen(false);
  }

  return (
    <section
      id="your-call"
      aria-labelledby="your-call-title"
      className="flex scroll-mt-[72px] flex-col gap-4 rounded-[12px] border border-border bg-card p-4 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <Eyebrow size="sm">{TRAINING_COPY.yourCall}</Eyebrow>
        <h2 id="your-call-title" className="font-heading text-[22px] leading-tight font-semibold">
          {TRAINING_COPY.whichWine}
        </h2>
      </div>

      <div role="radiogroup" aria-labelledby="your-call-title" className="flex flex-col gap-1.5">
        {options.map((r) => (
          <OptionRow
            key={r.candidate.id}
            checked={pickedId === r.candidate.id}
            onSelect={() => pick(r.candidate.id, true)}
            title={shortName(r.candidate.name)}
            sub={lineageLine(r.candidate)}
            pct={r.closeness !== null ? percentLabel(r.closeness) : undefined}
          />
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={TRAINING_COPY.somethingElse}
          aria-label={TRAINING_COPY.somethingElse}
          className="min-h-11 w-full rounded-[10px] border border-border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground md:text-[14px]"
        />
        <OptionRow
          checked={pickedId === null && notListed}
          onSelect={() => pick(null, false)}
          title={TRAINING_COPY.notInList}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">{TRAINING_COPY.vintageOptional}</span>
        <button
          type="button"
          onClick={() => {
            setVintageOpen(true);
            // The field picker's search input stays mounted, so this focus runs
            // inside the tap that opens it (the combobox rule).
            vintageInputRef.current?.focus();
          }}
          className={cn(
            "flex w-full items-center rounded-[10px] border border-border bg-background px-3 py-2 text-left text-[14px]",
            TAP,
            vintage === null && "text-muted-foreground",
          )}
        >
          {vintageGuessLabel(vintage) ?? VINTAGE_EMPTY}
        </button>
        {/* Collapsed rather than unmounted, so "Other age…" can focus it in the
            same tap (the ladder's own tawny input does the same). */}
        <div
          aria-hidden={!otherOpen}
          className={cn(
            "flex flex-col gap-2 rounded-[11px] border border-primary bg-card px-[13px] py-3 transition-[opacity,max-height]",
            otherOpen ? "max-h-40 opacity-100" : "pointer-events-none max-h-0 overflow-hidden border-0 px-0 py-0 opacity-0",
          )}
        >
          <span className="text-[11px] text-muted-foreground">Tawny age (years)</span>
          <div className="flex items-center gap-[10px]">
            <input
              ref={otherInputRef}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmOther();
                }
              }}
              placeholder="e.g. 25"
              tabIndex={otherOpen ? undefined : -1}
              className="min-h-11 w-24 rounded-[10px] border border-border bg-card px-3 text-[15.5px] text-foreground"
            />
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              onClick={() => setOtherOpen(false)}
              className="flex min-h-11 items-center px-2 text-[13px] font-semibold text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              disabled={otherYears === null}
              onClick={confirmOther}
              className="ml-auto flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-[16px] text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Set age
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button className={cn(TAP, "px-4")} disabled={busy} onClick={onReveal}>
          {TRAINING_COPY.revealBottle}
        </Button>
        <Button variant="ghost" className={TAP} disabled={busy} onClick={onCantFindOut}>
          {TRAINING_COPY.cantFindOut}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      <FieldPicker
        open={vintageOpen}
        field="vintage"
        points={2}
        title={TRAINING_COPY.vintageOptional}
        groups={groups}
        value={vintagePickerValue(vintage, tawny)}
        onPick={pickVintage}
        onNext={() => setVintageOpen(false)}
        nextLabel={TRAINING_COPY.done}
        search="client"
        onClose={() => setVintageOpen(false)}
        inputRef={vintageInputRef}
        searchPlaceholder="Search"
      />
    </section>
  );
}
```

- [ ] **Step 11: Write `src/app/taste/training/training-room.tsx`**

```tsx
"use client";

// The training room (training-room spec §3): one client component with the
// landing and a session (Task 11 adds the result). It owns every form value as
// React state — the note the WSET sheet reports through `onChange`, the
// Bubbles/Fortified facts, the pick and the vintage — and writes the draft to
// this device on every change (D13, src/lib/training/draft.ts). The landing
// reads the draft back through useSyncExternalStore, so Continue survives a
// reload; a finish or Discard in another tab returns a session here to the
// landing (the `storage` event). Matching runs here, on the device, on every
// change (D6).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAddWine } from "@/components/add-wine-context";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { WsetSheet } from "@/components/wset/wset-sheet";
import { TWO_TAP_WINDOW_MS, type TwoTapState } from "@/lib/console-copy";
import type { HistoryPage, TrainingTally } from "@/lib/training/action-types";
import { SAVE_REFUSED } from "@/lib/training/attempt-payload";
import { TRAINING_COPY, continueLine, sheetTitleLine, tallyLine } from "@/lib/training/copy";
import { clearDraft, newSessionKey, readDraft, writeDraft } from "@/lib/training/draft";
import { rankCandidates, snapshotRanking } from "@/lib/training/match";
import type {
  AromaLexicon,
  MatchExtras,
  RankingSnapshot,
  TrainingCandidate,
  TrainingDraft,
  VintageGuess,
} from "@/lib/training/types";
import { aromasToPayload, emptyNoteState, noteToPayload } from "@/lib/wset/note-state";
import type { AromaTerm, WineColour, WineStyle, WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { finishTrainingSession } from "./actions";
import { CandidatesPanel } from "./candidates-panel";
import { CandidatesSheet } from "./candidates-sheet";
import { CandidatesStrip } from "./candidates-strip";
import { YourCall } from "./your-call";

const TAP = "min-h-11 md:pointer-fine:min-h-0";
const UNKNOWN_WINE: { colour: WineColour | null; style: WineStyle | null } = { colour: null, style: null };

// "20:14" in the viewer's own clock. Only ever rendered client-side (a draft
// is read after hydration; a session starts with a tap).
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function scrollToCall() {
  document.getElementById("your-call")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

type View = "landing" | "session";

export function TrainingRoom({
  userId,
  candidates,
  terms,
  history,
  tally,
  coverage,
}: {
  userId: string;
  candidates: TrainingCandidate[];
  terms: AromaTerm[];
  history: HistoryPage;
  tally: TrainingTally;
  coverage: string;
}) {
  const router = useRouter();
  const { openAddWineSheet } = useAddWine();
  const [view, setView] = useState<View>("landing");
  const [session, setSession] = useState<TrainingDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);

  // The stored draft as a string, so the snapshot compares by value.
  const storedJson = useSyncExternalStore(
    subscribeStorage,
    () => {
      const draft = readDraft(userId);
      return draft ? JSON.stringify(draft) : null;
    },
    () => null,
  );
  const stored = useMemo<TrainingDraft | null>(
    () => (storedJson ? (JSON.parse(storedJson) as TrainingDraft) : null),
    [storedJson],
  );

  // Every change reaches the device draft (D13).
  useEffect(() => {
    if (session) writeDraft(session);
  }, [session]);

  // Another tab finished or discarded this session: back to the landing.
  useEffect(() => {
    if (view !== "session") return;
    const onStorage = () => {
      if (readDraft(userId) === null) {
        setSession(null);
        setSheetOpen(false);
        setView("landing");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [view, userId]);

  // Discard's two-tap window (console-copy's rule; the timeout disarms it).
  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);
  const discardState: TwoTapState = armedAt === null ? "idle" : "armed";

  const lexicon = useMemo<AromaLexicon>(
    () => Object.fromEntries(terms.map((t) => [t.id, { term: t.term, group: t.groupName }])),
    [terms],
  );
  const note = session ? session.note : null;
  const extras = session ? session.extras : null;
  const ranked = useMemo(
    () => (note && extras ? rankCandidates(note, extras, candidates, lexicon) : []),
    [note, extras, candidates, lexicon],
  );

  // Functional updates: the sheet's onChange and a Bubbles/Fortified tap can
  // land in the same tick, and neither may overwrite the other.
  const patchSession = useCallback(
    (patch: Partial<Pick<TrainingDraft, "note" | "pickedArchetypeId" | "vintage">>) =>
      setSession((s) => (s ? { ...s, ...patch } : s)),
    [],
  );
  const patchExtras = useCallback(
    (patch: Partial<MatchExtras>) =>
      setSession((s) => (s ? { ...s, extras: { ...s.extras, ...patch } } : s)),
    [],
  );

  function start() {
    setError(null);
    setArmedAt(null);
    setSession({
      userId,
      sessionKey: newSessionKey(),
      startedAt: new Date().toISOString(),
      note: emptyNoteState(),
      extras: { bubbles: null, fortified: null },
      pickedArchetypeId: null,
      vintage: null,
    });
    setView("session");
    window.scrollTo({ top: 0 });
  }

  function continueSession() {
    if (!stored) return;
    setError(null);
    setSession(stored);
    setView("session");
    window.scrollTo({ top: 0 });
  }

  function discard() {
    if (discardState !== "armed") {
      setArmedAt(Date.now());
      return;
    }
    clearDraft(userId);
    setArmedAt(null);
  }

  // ✕ returns to the landing and KEEPS the draft (spec §3.3).
  function leave() {
    setSheetOpen(false);
    setView("landing");
  }

  async function finish(draft: TrainingDraft, snapshot: RankingSnapshot, actualCatalogWineId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await finishTrainingSession({
        sessionKey: draft.sessionKey,
        startedAt: draft.startedAt,
        note: noteToPayload(draft.note, { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null }),
        aromas: aromasToPayload(draft.note),
        pickedArchetypeId: draft.pickedArchetypeId,
        vintage: draft.vintage,
        actualCatalogWineId,
        snapshot,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      clearDraft(userId);
      setSession(null);
      setSheetOpen(false);
      setView("landing");
      router.refresh();
    } catch {
      setError(SAVE_REFUSED);
    } finally {
      setBusy(false);
    }
  }

  // The add-wine sheet's reveal variant hands the pick back here; the draft and
  // ranking are taken as they stand at the tap (the sheet is modal meanwhile).
  function reveal() {
    if (!session || busy) return;
    const draft = session;
    const snapshot = snapshotRanking(ranked);
    openAddWineSheet(
      { kind: "note", reveal: true },
      {
        onNotePick: (pick) => {
          void finish(draft, snapshot, pick.catalogWineId);
        },
      },
    );
  }

  function cantFindOut() {
    if (!session || busy) return;
    void finish(session, snapshotRanking(ranked), null);
  }

  if (view === "session" && session) {
    return (
      <>
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <WsetSheet
              key={session.sessionKey}
              wine={UNKNOWN_WINE}
              title={sheetTitleLine(clock(session.startedAt))}
              terms={terms}
              initial={session.note}
              onChange={(next: WsetNoteState) => patchSession({ note: next })}
              footerAction={{ label: TRAINING_COPY.footerAction, onClick: scrollToCall }}
              belowBar={<CandidatesStrip ranked={ranked} onOpen={() => setSheetOpen(true)} />}
              aside={null}
              onClose={leave}
              bubbles={{ value: session.extras.bubbles, onChange: (v) => patchExtras({ bubbles: v }) }}
              fortified={{ value: session.extras.fortified, onChange: (v) => patchExtras({ fortified: v }) }}
            />
            <YourCall
              ranked={ranked}
              pickedId={session.pickedArchetypeId}
              onPick={(id) => patchSession({ pickedArchetypeId: id })}
              vintage={session.vintage}
              onVintage={(v: VintageGuess) => patchSession({ vintage: v })}
              onReveal={reveal}
              onCantFindOut={cantFindOut}
              busy={busy}
              error={error}
            />
          </div>
          <aside className="sticky top-[72px] hidden self-start lg:block">
            <CandidatesPanel ranked={ranked} note={session.note} />
          </aside>
        </div>
        <CandidatesSheet open={sheetOpen} onOpenChange={setSheetOpen} ranked={ranked} note={session.note} />
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{TRAINING_COPY.title}</h1>
        <p className="text-[14.5px] leading-relaxed">{TRAINING_COPY.promise}</p>
        <p className="text-[13px] text-muted-foreground">{coverage}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {stored ? (
          <>
            <Button className={cn(TAP, "px-4")} onClick={continueSession}>
              {continueLine(clock(stored.startedAt))}
            </Button>
            <Button variant="ghost" className={TAP} onClick={discard}>
              {discardState === "armed" ? TRAINING_COPY.discardArmed : TRAINING_COPY.discard}
            </Button>
          </>
        ) : candidates.length > 0 ? (
          <Button className={cn(TAP, "px-4")} onClick={start}>
            {TRAINING_COPY.start}
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="training-sessions" className="flex flex-col gap-3">
        <h2 id="training-sessions" className="font-heading text-[22px] font-semibold">
          {TRAINING_COPY.yourSessions}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {history.rows.length === 0 ? TRAINING_COPY.noSessions : tallyLine(tally)}
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 12: Write the page `src/app/taste/training/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { coverageLine } from "@/lib/training/copy";
import {
  coverageCountries,
  readTrainingHistory,
  readTrainingPool,
  readTrainingTally,
} from "@/lib/training/pool";
import type { AromaTerm } from "@/lib/wset/types";
import { TrainingRoom } from "./training-room";

export const metadata = { title: "Training room · Blindr" };

// The training room (training-room spec §3, §8): a pillar page — the app bar,
// then one client component with the landing, a session and the result. The
// pool, the aroma lexicon, the first history page and the tally are read here,
// as the viewer; nothing about a session is on the server before its reveal.
export default async function TrainingRoomPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [candidates, termRes, history, tally] = await Promise.all([
    readTrainingPool(supabase),
    supabase
      .from("wset_aroma_terms")
      .select("id, family, origin, group_name, term, sort_order")
      .order("sort_order"),
    readTrainingHistory(supabase, user.id),
    readTrainingTally(supabase, user.id),
  ]);
  const terms: AromaTerm[] = (termRes.data ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    origin: t.origin,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader title="Training room" />
      <main className="flex w-full max-w-[1500px] flex-1 flex-col p-[14px] md:p-8">
        <TrainingRoom
          userId={user.id}
          candidates={candidates}
          terms={terms}
          history={history}
          tally={tally}
          coverage={coverageLine(coverageCountries(candidates), candidates.length)}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 13: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training && npx tsc --noEmit && npx eslint src/lib/training/copy.ts src/lib/training/copy.test.ts src/lib/training/panel.ts src/lib/training/panel.test.ts src/app/taste/training`
Expected: vitest PASS (all of `src/lib/training`, including panel's 9 and copy's 2 new);
`tsc` exits 0; `eslint` prints nothing. A `tsc` error naming `onChange`, `footerAction`,
`belowBar`, `aside`, `onClose`, `bubbles`, `fortified`, `answers`, `idPrefix`, `reveal` or
`onNotePick` means Task 5, 6 or 7 is incomplete — finish it there.

- [ ] **Step 14: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/copy.ts src/lib/training/copy.test.ts src/lib/training/panel.ts src/lib/training/panel.test.ts src/app/taste/training/page.tsx src/app/taste/training/training-room.tsx src/app/taste/training/candidates-panel.tsx src/app/taste/training/candidates-strip.tsx src/app/taste/training/candidates-sheet.tsx src/app/taste/training/archetype-detail.tsx src/app/taste/training/your-call.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): the room — landing, session, live candidates and your call" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Result, history and the notes surfaces

**Files:**
- Create: `src/lib/training/result-math.ts`
- Test: `src/lib/training/result-math.test.ts`
- Create: `src/app/taste/training/result-view.tsx`
- Create: `src/app/taste/training/history-list.tsx`
- Modify: `src/app/taste/training/training-room.tsx` (Task 10's file; exact replacements below)
- Modify: `src/app/catalog/[wineId]/your-notes.tsx` (lines 1–7 imports, lines 50–54 badge)
- Modify: `src/app/taste/notes/notes-search.ts` (lines 7, 41–66, 73–85)
- Modify: `src/app/taste/notes/notes-search.test.ts` (lines 5–24 import, 34–49 helper, new tests)
- Modify: `src/app/taste/notes/notes-data.ts` (lines 172–179 title, 188–206 row)
- Modify: `src/app/taste/notes/notes-list.tsx` (imports, `NoteRowView`, the list's `NoteRowView` call)
- Modify: `src/components/wset/note-modal.tsx` (imports, the `title:` line)

**Interfaces:**
- Consumes: Task 2 — `TRAINING_COPY`, `attemptRowLine`, `hueClearedLine`, `itWasLine`,
  `percentLabel`, `resultTotalLine`, `shortName`, `styleVerdictLine`, `youSaidLine`, the
  types. Task 7 — `openAddWineSheet({ kind: "note", reveal: true }, { onNotePick })`.
  Task 9 — `revealTrainingAttempt`, `loadMoreTrainingHistory`, `loadTrainingAttempt`,
  `SAVE_REFUSED`, `HistoryPage`, `TrainingAttemptDetail`. Task 10 — `TrainingRoom`'s
  anchors.
- Produces: `result-math.ts` exports `POINT_ORDER`, `VerdictRow`, `verdictRows`,
  `POINTED_LIMIT`, `pointedTopFive`, `StyleVerdict`, `styleVerdictInput`,
  `mergeHistoryRows`; `ResultView({ detail, onAnotherGlass, onDone })`;
  `HistoryList({ initial, onRevealed })`; `NoteArchiveRow.contextKind`,
  `archiveRowHref`, `TRAINING_ROOM_HREF` in notes-search.

- [ ] **Step 1: Write the failing test `src/lib/training/result-math.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { POINT_ORDER, mergeHistoryRows, pointedTopFive, styleVerdictInput, verdictRows } from "./result-math";
import type { AttemptRow, RankingSnapshot } from "./types";

const SNAPSHOT: RankingSnapshot = [
  { archetypeId: "a3", name: "A typical Margaux", closeness: 70, rank: 3, capped: null },
  { archetypeId: "a1", name: "A typical Pauillac", closeness: 91, rank: 1, capped: null },
  { archetypeId: "a2", name: "A typical Saint-Julien", closeness: 88, rank: 2, capped: null },
  { archetypeId: "a5", name: "A typical Bandol", closeness: 40, rank: 5, capped: null },
  { archetypeId: "a4", name: "A typical Pomerol", closeness: 62, rank: 4, capped: null },
  { archetypeId: "a6", name: "A typical Chablis", closeness: 15, rank: 6, capped: "colour" },
];

function row(id: string, createdAt: string): AttemptRow {
  return {
    id,
    createdAt,
    picked: null,
    vintage: null,
    actual: null,
    actualArchetype: null,
    hueCleared: false,
    noteColourHue: null,
    points: {
      country: null,
      region: null,
      appellation: null,
      primaryGrape: null,
      secondaryGrape: null,
      typeDesignation: null,
      vintage: null,
    },
    total: null,
    possible: null,
    snapshot: [],
  };
}

describe("verdictRows", () => {
  it("always shows the seven rows in order, ✓ / ✗ / —", () => {
    const rows = verdictRows({
      country: 2,
      region: 3,
      appellation: 0,
      primaryGrape: 8,
      secondaryGrape: null,
      typeDesignation: 0,
      vintage: null,
    });
    expect(rows.map((r) => r.category)).toEqual([...POINT_ORDER]);
    expect(rows.map((r) => [r.label, r.mark, r.points])).toEqual([
      ["Country", "✓", 2],
      ["Region", "✓", 3],
      ["Appellation", "✗", 0],
      ["Grape", "✓", 8],
      ["Second grape", "—", null],
      ["Designation", "✗", 0],
      ["Vintage", "—", null],
    ]);
  });
});

describe("pointedTopFive", () => {
  it("takes the five best ranks of the frozen ranking", () => {
    expect(pointedTopFive(SNAPSHOT).map((e) => e.archetypeId)).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(pointedTopFive([])).toEqual([]);
  });
});

describe("styleVerdictInput", () => {
  it("finds the real wine's style in the whole ranking", () => {
    expect(styleVerdictInput(SNAPSHOT, "a2")).toEqual({ rank: 2, n: 6, pct: 88, capped: null });
    expect(styleVerdictInput(SNAPSHOT, "a6")).toEqual({ rank: 6, n: 6, pct: 15, capped: "colour" });
    expect(styleVerdictInput(SNAPSHOT, "zz")).toBeNull();
    expect(styleVerdictInput(SNAPSHOT, null)).toBeNull();
  });
});

describe("mergeHistoryRows", () => {
  it("drops repeats and keeps newest first, id breaking ties", () => {
    const merged = mergeHistoryRows(
      [row("c", "2026-09-24T18:00:00+00:00"), row("b", "2026-09-23T18:00:00+00:00")],
      [row("b", "2026-09-23T18:00:00+00:00"), row("a", "2026-09-23T18:00:00+00:00")],
    );
    expect(merged.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/result-math.test.ts`
Expected: FAIL — `Failed to resolve import "./result-math"`.

- [ ] **Step 3: Write `src/lib/training/result-math.ts`**

```ts
// View rules for the training room's result and history (training-room spec
// §3.5, §3.6): the seven verdict rows, the top five of the frozen ranking,
// where the real wine's style stood in it, and the history list's merge of
// its first page with the pages Show more fetched. Pure, relative imports only.
import { TRAINING_COPY } from "./copy";
import type { AttemptRow, CapReason, PointCategory, RankingSnapshot } from "./types";

/** The verdict table's rows, always all seven (spec §3.5). */
export const POINT_ORDER: readonly PointCategory[] = [
  "country",
  "region",
  "appellation",
  "primaryGrape",
  "secondaryGrape",
  "typeDesignation",
  "vintage",
];

export type VerdictRow = { category: PointCategory; label: string; mark: string; points: number | null };

/** ✓ for points, ✗ for zero, — when the category did not apply (null). */
export function verdictRows(points: Record<PointCategory, number | null>): VerdictRow[] {
  return POINT_ORDER.map((category) => {
    const p = points[category];
    return {
      category,
      label: TRAINING_COPY.rowLabels[category],
      mark: p === null ? TRAINING_COPY.markNone : p > 0 ? TRAINING_COPY.markRight : TRAINING_COPY.markWrong,
      points: p,
    };
  });
}

/** "Where your note pointed" shows this many. */
export const POINTED_LIMIT = 5;

export function pointedTopFive(snapshot: RankingSnapshot): RankingSnapshot {
  return [...snapshot].sort((a, b) => a.rank - b.rank).slice(0, POINTED_LIMIT);
}

export type StyleVerdict = { rank: number; n: number; pct: number | null; capped: CapReason | null };

/** Where the real wine's own archetype (D17) stood in the full ranking; null when
    there is none or the ranking never had it ("This style isn't in the pool yet"). */
export function styleVerdictInput(
  snapshot: RankingSnapshot,
  actualArchetypeId: string | null,
): StyleVerdict | null {
  if (!actualArchetypeId) return null;
  const hit = snapshot.find((e) => e.archetypeId === actualArchetypeId);
  return hit ? { rank: hit.rank, n: snapshot.length, pct: hit.closeness, capped: hit.capped } : null;
}

/** The server's first page plus the Show more pages, once each, newest first. */
export function mergeHistoryRows(first: readonly AttemptRow[], more: readonly AttemptRow[]): AttemptRow[] {
  const byId = new Map<string, AttemptRow>();
  for (const r of [...first, ...more]) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
  );
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/result-math.test.ts`
Expected: PASS — 4 tests in 1 file.

- [ ] **Step 5: Write `src/app/taste/training/result-view.tsx`**

```tsx
"use client";

// The result (training-room spec §3.5): the real wine beside what you said,
// the seven-row verdict with ✓ / ✗ / —, "{n} of {m}", the hue line when the
// RPC cleared a colour call, and "Where your note pointed" — the top five of
// the frozen ranking with the real wine's style highlighted and where it
// stood. Without a reveal: "Not revealed — your note is kept…".
import { useState } from "react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { NoteModal } from "@/components/wset/note-modal";
import type { TrainingAttemptDetail } from "@/lib/training/action-types";
import {
  TRAINING_COPY,
  hueClearedLine,
  itWasLine,
  percentLabel,
  resultTotalLine,
  shortName,
  styleVerdictLine,
  youSaidLine,
} from "@/lib/training/copy";
import { pointedTopFive, styleVerdictInput, verdictRows } from "@/lib/training/result-math";
import { LABELS } from "@/lib/wset/vocab";
import { cn } from "@/lib/utils";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function ResultView({
  detail,
  onAnotherGlass,
  onDone,
}: {
  detail: TrainingAttemptDetail;
  onAnotherGlass: () => void;
  onDone: () => void;
}) {
  const { row, noteId, wineColour } = detail;
  const [noteOpen, setNoteOpen] = useState(false);
  const said = row.picked ? youSaidLine(row.picked.name, row.vintage) : TRAINING_COPY.youDidntPick;

  if (row.actual === null) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>
        <h1 className="font-heading text-[26px] leading-tight font-semibold">{said}</h1>
        <p className="text-[14px] text-muted-foreground">{TRAINING_COPY.notRevealed}</p>
        <div className="flex flex-wrap gap-3">
          <Button className={cn(TAP, "px-4")} onClick={onAnotherGlass}>
            {TRAINING_COPY.anotherGlass}
          </Button>
          <Button variant="ghost" className={TAP} onClick={onDone}>
            {TRAINING_COPY.done}
          </Button>
        </div>
      </div>
    );
  }

  const actual = row.actual;
  const rows = verdictRows(row.points);
  const top = pointedTopFive(row.snapshot);
  const actualArchetypeId = row.actualArchetype?.id ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="rounded-[12px] border border-border bg-card p-4">
          <h1 className="font-heading text-[22px] leading-tight font-semibold">
            {itWasLine(actual.label ?? TRAINING_COPY.unreadableWine)}
          </h1>
          {actual.lineage ? (
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{actual.lineage}</p>
          ) : null}
        </section>
        <section className="flex items-center rounded-[12px] border border-border bg-background p-4">
          <p className="text-[15px] font-semibold">{said}</p>
        </section>
      </div>

      <table className="w-full text-[14px]">
        <tbody>
          {rows.map((v) => (
            <tr key={v.category} className="border-b border-border-light last:border-b-0">
              <th scope="row" className="py-2 text-left font-normal text-muted-foreground">
                {v.label}
              </th>
              <td className="w-8 py-2 text-center font-semibold">{v.mark}</td>
              <td className="w-10 py-2 text-right font-semibold tabular-nums">{v.points ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {row.total !== null && row.possible !== null ? (
        <p className="font-heading text-[26px] leading-none font-semibold text-primary tabular-nums">
          {resultTotalLine(row.total, row.possible)}
        </p>
      ) : null}

      {row.hueCleared && row.noteColourHue && wineColour ? (
        <p className="text-[13px] text-muted-foreground">
          {hueClearedLine(LABELS[row.noteColourHue] ?? row.noteColourHue, wineColour)}
        </p>
      ) : null}

      <section aria-labelledby="training-pointed" className="flex flex-col gap-2">
        <h2 id="training-pointed" className="font-heading text-[19px] font-semibold">
          {TRAINING_COPY.wherePointed}
        </h2>
        <ol className="flex flex-col">
          {top.map((e) => (
            <li
              key={e.archetypeId}
              className={cn(
                "flex items-center gap-3 rounded-[8px] px-2 py-1.5 text-[13.5px]",
                e.archetypeId === actualArchetypeId && "bg-gold/15 font-semibold",
              )}
            >
              <span className="w-6 text-muted-foreground tabular-nums">{e.rank}</span>
              <span className="min-w-0 flex-1 truncate">{shortName(e.name)}</span>
              {e.closeness !== null ? <span className="tabular-nums">{percentLabel(e.closeness)}</span> : null}
            </li>
          ))}
        </ol>
        <p className="text-[13px] text-muted-foreground">
          {styleVerdictLine(styleVerdictInput(row.snapshot, actualArchetypeId))}
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button className={cn(TAP, "px-4")} onClick={onAnotherGlass}>
          {TRAINING_COPY.anotherGlass}
        </Button>
        <Button variant="outline" className={TAP} onClick={() => setNoteOpen(true)}>
          {TRAINING_COPY.seeNote}
        </Button>
        <Button variant="ghost" className={TAP} onClick={onDone}>
          {TRAINING_COPY.done}
        </Button>
      </div>

      {noteOpen ? (
        <NoteModal noteId={noteId} wineId={actual.catalogWineId} onClose={() => setNoteOpen(false)} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Write `src/app/taste/training/history-list.tsx`**

```tsx
"use client";

// "Your sessions" (training-room spec §3.6): one line per attempt, newest
// first, twenty at a time with Show more (a (created_at, id) cursor), and
// Reveal now on an unrevealed attempt — the add-wine sheet's reveal variant,
// whose pick runs revealTrainingAttempt and opens the result. The parent keys
// this list on its first row, so a refreshed first page starts it afresh.
import { useState } from "react";
import { useAddWine } from "@/components/add-wine-context";
import { Button } from "@/components/ui/button";
import type { HistoryPage, TrainingAttemptDetail } from "@/lib/training/action-types";
import { SAVE_REFUSED } from "@/lib/training/attempt-payload";
import { TRAINING_COPY, attemptRowLine } from "@/lib/training/copy";
import { mergeHistoryRows } from "@/lib/training/result-math";
import type { AttemptRow } from "@/lib/training/types";
import { cn } from "@/lib/utils";
import { loadMoreTrainingHistory, loadTrainingAttempt, revealTrainingAttempt } from "./actions";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function HistoryList({
  initial,
  onRevealed,
}: {
  initial: HistoryPage;
  onRevealed: (detail: TrainingAttemptDetail | null) => void;
}) {
  const { openAddWineSheet } = useAddWine();
  const [more, setMore] = useState<AttemptRow[]>([]);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = mergeHistoryRows(initial.rows, more);

  async function showMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const page = await loadMoreTrainingHistory(cursor);
      setMore((m) => [...m, ...page.rows]);
      setCursor(page.nextCursor);
    } catch (e) {
      // The button stays; the next tap tries the same page again.
      console.error("Training room: Show more failed", e instanceof Error ? e.message : typeof e);
    } finally {
      setLoading(false);
    }
  }

  async function revealPick(row: AttemptRow, catalogWineId: string) {
    setRevealing(row.id);
    setError(null);
    try {
      const res = await revealTrainingAttempt(row.id, catalogWineId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onRevealed(await loadTrainingAttempt(row.id));
    } catch {
      setError(SAVE_REFUSED);
    } finally {
      setRevealing(null);
    }
  }

  function revealNow(row: AttemptRow) {
    if (revealing) return;
    openAddWineSheet(
      { kind: "note", reveal: true },
      {
        onNotePick: (pick) => {
          void revealPick(row, pick.catalogWineId);
        },
      },
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <ul className="overflow-hidden rounded-[12px] border border-border-strong bg-card">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-3 border-b border-border-light px-4 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-[13px] leading-snug">{attemptRowLine(row)}</span>
            {row.actual === null ? (
              <Button
                variant="outline"
                className={cn(TAP, "shrink-0")}
                disabled={revealing !== null}
                onClick={() => revealNow(row)}
              >
                {TRAINING_COPY.revealNow}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {cursor ? (
        <Button variant="outline" className={cn(TAP, "w-full")} disabled={loading} onClick={() => void showMore()}>
          {TRAINING_COPY.showMore}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Mount the result and the history in `src/app/taste/training/training-room.tsx`**

Apply these six exact replacements (each old string occurs once in Task 10's file).

(a) Imports. Replace
```tsx
import type { HistoryPage, TrainingTally } from "@/lib/training/action-types";
```
with
```tsx
import type { HistoryPage, TrainingAttemptDetail, TrainingTally } from "@/lib/training/action-types";
```
and replace
```tsx
import { finishTrainingSession } from "./actions";
import { CandidatesPanel } from "./candidates-panel";
```
with
```tsx
import { finishTrainingSession, loadTrainingAttempt } from "./actions";
import { CandidatesPanel } from "./candidates-panel";
import { HistoryList } from "./history-list";
import { ResultView } from "./result-view";
```

(b) The view type. Replace
```tsx
type View = "landing" | "session";
```
with
```tsx
type View = "landing" | "session" | "result";
```

(c) The result state. Replace
```tsx
  const [armedAt, setArmedAt] = useState<number | null>(null);
```
with
```tsx
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [result, setResult] = useState<TrainingAttemptDetail | null>(null);
```

(d) `start` clears an old result, and a shared `showResult`. Replace
```tsx
  function start() {
    setError(null);
    setArmedAt(null);
```
with
```tsx
  // After a finish or a Reveal now: the stored attempt as the result (§3.5); a
  // failed read falls back to the landing, where history shows the attempt.
  function showResult(detail: TrainingAttemptDetail | null) {
    setResult(detail);
    setView(detail ? "result" : "landing");
    window.scrollTo({ top: 0 });
    router.refresh();
  }

  function start() {
    setError(null);
    setArmedAt(null);
    setResult(null);
```

(e) `finish` opens the result. Replace
```tsx
      clearDraft(userId);
      setSession(null);
      setSheetOpen(false);
      setView("landing");
      router.refresh();
```
with
```tsx
      const detail = await loadTrainingAttempt(res.attemptId);
      clearDraft(userId);
      setSession(null);
      setSheetOpen(false);
      showResult(detail);
```

(f) Render the result, and the history on the landing. Replace
```tsx
  if (view === "session" && session) {
```
with
```tsx
  if (view === "result" && result) {
    return (
      <ResultView
        detail={result}
        onAnotherGlass={start}
        onDone={() => {
          setResult(null);
          setView("landing");
        }}
      />
    );
  }

  if (view === "session" && session) {
```
and replace
```tsx
        <p className="text-[13px] text-muted-foreground">
          {history.rows.length === 0 ? TRAINING_COPY.noSessions : tallyLine(tally)}
        </p>
      </section>
```
with
```tsx
        <p className="text-[13px] text-muted-foreground">
          {history.rows.length === 0 ? TRAINING_COPY.noSessions : tallyLine(tally)}
        </p>
        <HistoryList key={history.rows[0]?.id ?? "empty"} initial={history} onRevealed={showResult} />
      </section>
```

- [ ] **Step 8: Badge a training note in `src/app/catalog/[wineId]/your-notes.tsx`**

Replace
```tsx
import { dayMonthYear } from "@/lib/cellar/format";
```
with
```tsx
import { dayMonthYear } from "@/lib/cellar/format";
import { TRAINING_COPY } from "@/lib/training/copy";
```
and replace
```tsx
                {n.contextKind === "BLIND" ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Blind
                  </Badge>
                ) : null}
```
with
```tsx
                {n.contextKind === "BLIND" ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Blind
                  </Badge>
                ) : null}
                {n.contextKind === "TRAINING" ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    {TRAINING_COPY.badge}
                  </Badge>
                ) : null}
```

- [ ] **Step 9: Write the failing notes-search tests**

In `src/app/taste/notes/notes-search.test.ts`, add `archiveRowHref,` to the
`import { … } from "./notes-search";` list (after `archiveRowTitle,`), and in the `row()`
helper replace
```ts
    tastingWineId: null,
    tastingName: null,
```
with
```ts
    tastingWineId: null,
    tastingName: null,
    contextKind: "OPEN",
```
Then append:

```ts
describe("training notes (training room)", () => {
  it("titles an unrevealed training note and links it to the room", () => {
    expect(
      archiveRowTitle({ wineTitle: null, tastingName: null, glassNumber: null, unrevealedTraining: true }, t),
    ).toBe("Training room · not revealed");
    expect(archiveRowHref(row({ contextKind: "TRAINING", catalogWineId: null }))).toBe("/taste/training");
  });

  it("leaves every other note's title and link alone", () => {
    expect(
      archiveRowTitle({ wineTitle: "Wine", tastingName: null, glassNumber: null, unrevealedTraining: false }, t),
    ).toBe("Wine");
    expect(archiveRowHref(row({ contextKind: "TRAINING", catalogWineId: "w1" }))).toBeNull();
    expect(archiveRowHref(row({ contextKind: "OPEN", catalogWineId: null }))).toBeNull();
  });
});
```

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/app/taste/notes/notes-search.test.ts`
Expected: FAIL — `archiveRowHref is not a function` (and a type complaint about
`contextKind`/`unrevealedTraining` is not reported by vitest; tsc catches it in Step 13).

- [ ] **Step 10: Teach `src/app/taste/notes/notes-search.ts` about training notes**

Replace
```ts
import { makeT, translateTerm, type WsetLang } from "../../../lib/wset/i18n";
```
with
```ts
import { TRAINING_COPY } from "../../../lib/training/copy";
import { makeT, translateTerm, type WsetLang } from "../../../lib/wset/i18n";
```

In `NoteArchiveRow`, replace
```ts
  /** That tasting's name, when the author can still read it. */
  tastingName: string | null;
```
with
```ts
  /** That tasting's name, when the author can still read it. */
  tastingName: string | null;
  /** wset_notes.context_kind: TRAINING rows carry the "Training" chip. */
  contextKind: "OPEN" | "BLIND" | "TRAINING";
```

Replace
```ts
export function archiveRowTitle(
  input: { wineTitle: string | null; tastingName: string | null; glassNumber: number | null },
  t: NotesT,
): string {
  if (input.wineTitle) return input.wineTitle;
```
with
```ts
export function archiveRowTitle(
  input: {
    wineTitle: string | null;
    tastingName: string | null;
    glassNumber: number | null;
    /** A training-room note whose bottle was never revealed (no identity). */
    unrevealedTraining?: boolean;
  },
  t: NotesT,
): string {
  if (input.unrevealedTraining) return TRAINING_COPY.notRevealedRow;
  if (input.wineTitle) return input.wineTitle;
```

and add, directly after the `archiveRowTitle` function:

```ts
/** Where an unrevealed training note's row goes: back to the room, whose
    history offers Reveal now (training-room spec §3.6). */
export const TRAINING_ROOM_HREF = "/taste/training";

/** A row that links somewhere instead of opening the note view; null for every
    note with a wine to open. */
export function archiveRowHref(row: Pick<NoteArchiveRow, "contextKind" | "catalogWineId">): string | null {
  return row.contextKind === "TRAINING" && row.catalogWineId === null ? TRAINING_ROOM_HREF : null;
}
```

- [ ] **Step 11: Fill the new fields in `src/app/taste/notes/notes-data.ts`**

Replace
```ts
      {
        wineTitle: wineTitles[i],
        tastingName,
        glassNumber: glass ? (glassNo.get(glass.id) ?? null) : null,
      },
```
with
```ts
      {
        wineTitle: wineTitles[i],
        tastingName,
        glassNumber: glass ? (glassNo.get(glass.id) ?? null) : null,
        unrevealedTraining: note.context_kind === "TRAINING" && note.catalog_wine_id === null,
      },
```
and replace
```ts
      tastingWineId: note.tasting_wine_id,
      tastingName,
```
with
```ts
      tastingWineId: note.tasting_wine_id,
      tastingName,
      contextKind: note.context_kind,
```

- [ ] **Step 12: Render the chip and the link in `src/app/taste/notes/notes-list.tsx`**

Replace
```tsx
import { useMemo, useState } from "react";
```
with
```tsx
import Link from "next/link";
import { useMemo, useState } from "react";
```
and replace
```tsx
import { NotesFilterChips, NotesSearchField } from "./notes-filters";
import {
  NOTES_LANG,
```
with
```tsx
import { TRAINING_COPY } from "@/lib/training/copy";
import { NotesFilterChips, NotesSearchField } from "./notes-filters";
import {
  NOTES_LANG,
  archiveRowHref,
```

Replace the `NoteRowView` signature
```tsx
function NoteRowView({ row, onOpen }: { row: NoteArchiveRow; onOpen: (() => void) | null }) {
```
with
```tsx
function NoteRowView({
  row,
  onOpen,
  href,
}: {
  row: NoteArchiveRow;
  onOpen: (() => void) | null;
  /** A link instead of the note view: an unrevealed training note goes back to the room. */
  href: string | null;
}) {
```

Replace
```tsx
          <span className="shrink-0">{dayLabel(row.tastedOn, NOTES_LANG)}</span>
```
with
```tsx
          <span className="shrink-0">{dayLabel(row.tastedOn, NOTES_LANG)}</span>
          {row.contextKind === "TRAINING" ? (
            <span className="shrink-0 rounded-full border border-border bg-background px-2 py-px text-[10.5px]">
              {TRAINING_COPY.badge}
            </span>
          ) : null}
```

Replace
```tsx
        className={cn("w-2 text-[15px] leading-none text-placeholder", !onOpen && "invisible")}
```
with
```tsx
        className={cn("w-2 text-[15px] leading-none text-placeholder", !onOpen && !href && "invisible")}
```

Replace
```tsx
  return onOpen ? (
    <button
```
with
```tsx
  if (href) {
    return (
      <Link
        href={href}
        aria-describedby={describedBy}
        className={cn(
          rowClass,
          "transition-colors hover:bg-background focus-visible:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {inner}
      </Link>
    );
  }
  return onOpen ? (
    <button
```

And in `NotesList`, replace
```tsx
                  <NoteRowView
                    row={row}
                    onOpen={
```
with
```tsx
                  <NoteRowView
                    row={row}
                    href={archiveRowHref(row)}
                    onOpen={
```

- [ ] **Step 13: Badge the note modal's title in `src/components/wset/note-modal.tsx`**

Replace
```tsx
import { noteStateFromRow } from "@/lib/wset/note-state";
```
with
```tsx
import { noteStateFromRow } from "@/lib/wset/note-state";
import { TRAINING_COPY } from "@/lib/training/copy";
```
and replace
```tsx
        title: catalogWineTitle(wine),
```
with
```tsx
        // A training note carries its badge in the sheet's title (D16).
        title:
          noteRes.data.context_kind === "TRAINING"
            ? `${catalogWineTitle(wine)} · ${TRAINING_COPY.badge}`
            : catalogWineTitle(wine),
```

- [ ] **Step 14: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training src/app/taste/notes && npx tsc --noEmit && npx eslint src/lib/training/result-math.ts src/lib/training/result-math.test.ts src/app/taste/training "src/app/catalog/[wineId]/your-notes.tsx" src/app/taste/notes src/components/wset/note-modal.tsx`
Expected: vitest PASS (result-math's 4, notes-search's 2 new, everything else unchanged);
`tsc` exits 0; `eslint` prints nothing.

- [ ] **Step 15: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/result-math.ts src/lib/training/result-math.test.ts src/app/taste/training/result-view.tsx src/app/taste/training/history-list.tsx src/app/taste/training/training-room.tsx "src/app/catalog/[wineId]/your-notes.tsx" src/app/taste/notes/notes-search.ts src/app/taste/notes/notes-search.test.ts src/app/taste/notes/notes-data.ts src/app/taste/notes/notes-list.tsx src/components/wset/note-modal.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): result, history with Reveal now, Training badges on notes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Admin archetype editor

**Files:**
- Create: `src/app/admin/archetypes/profile-rules.ts`
- Test: `src/app/admin/archetypes/profile-rules.test.ts`
- Modify: `src/app/admin/archetypes/actions.ts` (imports lines 1–6; replace lines 71–121:
  `ArchetypeProfileInput` and `updateArchetype`)
- Modify (full replacement): `src/app/admin/archetypes/archetype-editor.tsx`
- Modify: `src/app/admin/archetypes/placement-editor.tsx` (lines 5–13 imports, 121–127
  props, 202 editor call)
- Modify (full replacement): `src/app/admin/archetypes/page.tsx`

**Interfaces:**
- Consumes: Task 1 — the new `wine_archetypes` columns, nullable `wine_place_id`,
  `wine_archetype_aromas.signature`, `wine_archetype_designations` (curator write RLS).
  Task 2 — `TrainingCandidate` (test fixture). Task 3 —
  `ladderFor(scale: string, candidate: TrainingCandidate): string[] | null` (the test pins
  the editor's ladders to it). Existing: `ReferenceCombobox`, `SearchableCombobox`,
  `TypeDesignationField`, `listAppellationsForRegions`, `loadByHandReferences`,
  `justTheRegionOption`, `foldName`, `searchPlaces`, `requireContributor`,
  `isContributor`.
- Produces: `profile-rules.ts` exports `AromaLink`, `ArchetypeProfile`,
  `ArchetypeProfileInput`, `EditorReferences`, `AppellationOption`, `ScaleSpec`,
  `scalesFor`, `rangeFits`, `validateProfile`, `JUST_THE_REGION`, `appellationOptions`,
  `APPELLATION_RESULTS_MAX`, `filterAppellationOptions`, `withTermIds`,
  `toggleSignature`, `aromaRows`, `designationRows`; `updateArchetype(archetypeId, input: ArchetypeProfileInput)`.

- [ ] **Step 1: Write the failing test `src/app/admin/archetypes/profile-rules.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { ladderFor } from "../../../lib/training/match";
import type { TrainingCandidate } from "../../../lib/training/types";
import type { WineColour, WineStyle } from "../../../lib/wset/types";
import {
  aromaRows,
  appellationOptions,
  designationRows,
  filterAppellationOptions,
  rangeFits,
  scalesFor,
  toggleSignature,
  validateProfile,
  withTermIds,
  type ArchetypeProfileInput,
} from "./profile-rules";

const COUNTRY = "00000000-0000-4000-8000-000000000c01";
const REGION = "00000000-0000-4000-8000-000000000c02";
const APPELLATION = "00000000-0000-4000-8000-000000000c03";
const ARCH = "00000000-0000-4000-8000-000000000c05";
const AGE = "Typical age takes two whole numbers of years, low to high.";

function candidate(colour: WineColour, style: WineStyle): TrainingCandidate {
  return {
    id: "a",
    name: "A typical test",
    description: null,
    colour,
    style,
    country: { id: "c", name: "France" },
    region: { id: "r", name: "Bordeaux" },
    appellation: { id: "p", name: "Pauillac AOC", isRegional: false },
    primaryGrape: { id: "g", name: "Cabernet Sauvignon" },
    secondaryGrape: null,
    designations: [],
    typicalAge: null,
    sat: {},
    aromas: [],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  };
}

function profile(overrides: Partial<ArchetypeProfileInput> = {}): ArchetypeProfileInput {
  return {
    name: "A typical Pauillac",
    colour: "RED",
    style: "STILL",
    description: null,
    qualityLow: 88,
    qualityHigh: 96,
    sat: {
      tannin: ["MEDIUM_PLUS", "HIGH"],
      appearanceIntensity: ["MEDIUM_PLUS", "DEEP"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [{ termId: "t1", signature: true }],
    palate: [],
    countryId: COUNTRY,
    regionId: REGION,
    appellationId: APPELLATION,
    designationIds: [],
    typicalAgeLow: 8,
    typicalAgeHigh: 25,
    winePlaceId: null,
    ...overrides,
  };
}

function scale(key: string, colour: WineColour = "RED", style: WineStyle = "STILL") {
  const found = scalesFor(colour, style).find((s) => s.key === key);
  if (!found) throw new Error(`no scale ${key}`);
  return found;
}

describe("scalesFor", () => {
  it("edits eleven scales, twelve with mousse on sparkling", () => {
    expect(scalesFor("RED", "STILL").map((s) => s.key)).toEqual([
      "appearanceIntensity",
      "colourHue",
      "noseIntensity",
      "development",
      "sweetness",
      "acidity",
      "tannin",
      "alcohol",
      "body",
      "flavourIntensity",
      "finish",
    ]);
    const sparkling = scalesFor("WHITE", "SPARKLING");
    expect(sparkling).toHaveLength(12);
    expect(sparkling[11].key).toBe("mousse");
  });

  it("uses the matcher's own ladders (still red and still white)", () => {
    for (const [colour, style] of [
      ["RED", "STILL"],
      ["WHITE", "STILL"],
    ] as const) {
      for (const s of scalesFor(colour, style)) {
        expect(ladderFor(s.key, candidate(colour, style))).toEqual([...s.ladder]);
      }
    }
  });

  it("uses the matcher's mousse ladder on sparkling", () => {
    expect(ladderFor("mousse", candidate("WHITE", "SPARKLING"))).toEqual([
      ...scale("mousse", "WHITE", "SPARKLING").ladder,
    ]);
  });
});

describe("rangeFits", () => {
  it("needs a range on its ladder, low to high, that the slider can reach", () => {
    expect(rangeFits(scale("appearanceIntensity"), ["MEDIUM_PLUS", "DEEP"])).toBe(true);
    expect(rangeFits(scale("appearanceIntensity"), ["MEDIUM_MINUS", "MEDIUM_MINUS"])).toBe(false);
    expect(rangeFits(scale("sweetness"), ["MEDIUM", "MEDIUM"])).toBe(false);
    expect(rangeFits(scale("sweetness"), ["MEDIUM", "SWEET"])).toBe(true);
    expect(rangeFits(scale("alcohol"), ["MEDIUM_PLUS", "HIGH"])).toBe(false);
    expect(rangeFits(scale("alcohol", "RED", "FORTIFIED"), ["MEDIUM_PLUS", "HIGH"])).toBe(true);
    expect(rangeFits(scale("colourHue", "WHITE"), ["RUBY", "RUBY"])).toBe(false);
    expect(rangeFits(scale("colourHue", "WHITE"), ["LEMON", "GOLD"])).toBe(true);
    expect(rangeFits(scale("tannin"), ["HIGH", "LOW"])).toBe(false);
  });
});

describe("validateProfile", () => {
  it("accepts a complete profile, with or without a quality range", () => {
    expect(validateProfile(profile())).toBeNull();
    expect(validateProfile(profile({ qualityLow: null, qualityHigh: null }))).toBeNull();
    expect(validateProfile(profile({ typicalAgeLow: null, typicalAgeHigh: null }))).toBeNull();
  });

  it("names the first thing that is wrong", () => {
    expect(validateProfile(profile({ name: "  " }))).toBe("Give it a name.");
    expect(validateProfile(profile({ appellationId: "" }))).toBe("Pick a country, region and appellation.");
    expect(validateProfile(profile({ qualityLow: 40 }))).toBe("Quality runs from 50 to 100, low to high.");
    expect(validateProfile(profile({ typicalAgeLow: 5, typicalAgeHigh: null }))).toBe(AGE);
    expect(validateProfile(profile({ typicalAgeLow: 12, typicalAgeHigh: 5 }))).toBe(AGE);
    expect(validateProfile(profile({ sat: { sweetness: ["MEDIUM", "MEDIUM"] } }))).toBe(
      "Sweetness: pick a range on its own scale.",
    );
    expect(validateProfile(profile({ winePlaceId: "x" }))).toBe("That map place is not valid.");
  });

  it("leaves keys it does not edit alone", () => {
    expect(
      validateProfile(profile({ sat: { clarity: ["HAZY", "CLEAR"], mousse: ["AGGRESSIVE", "DELICATE"] } })),
    ).toBeNull();
    expect(
      validateProfile(
        profile({ colour: "WHITE", style: "SPARKLING", sat: { mousse: ["AGGRESSIVE", "DELICATE"] } }),
      ),
    ).toBe("Mousse: pick a range on its own scale.");
  });
});

describe("appellation options", () => {
  const list = [
    { id: "a1", name: "Bourgogne Aligoté AOC" },
    { id: "a2", name: "Bourgogne AOC" },
    { id: "a3", name: "Chablis AOC" },
  ];

  it("offers the region's own appellation first, as Just the region", () => {
    expect(appellationOptions("Bourgogne", list)).toEqual([
      { id: "a2", name: "Just the region · Bourgogne AOC", matchName: "Bourgogne AOC" },
      { id: "a1", name: "Bourgogne Aligoté AOC" },
      { id: "a3", name: "Chablis AOC" },
    ]);
    expect(appellationOptions("Loire", list)[0]).toEqual({ id: "a1", name: "Bourgogne Aligoté AOC" });
  });

  it("filters by the label or the stored name, accents folded", () => {
    const options = appellationOptions("Bourgogne", list);
    expect(filterAppellationOptions(options, "aligote").map((o) => o.id)).toEqual(["a1"]);
    expect(filterAppellationOptions(options, "just").map((o) => o.id)).toEqual(["a2"]);
    expect(filterAppellationOptions(options, "")).toHaveLength(3);
  });
});

describe("aroma and designation rows", () => {
  it("keeps signatures across a re-pick and toggles one", () => {
    const links = [
      { termId: "t1", signature: true },
      { termId: "t2", signature: false },
    ];
    expect(withTermIds(links, ["t2", "t3"])).toEqual([
      { termId: "t2", signature: false },
      { termId: "t3", signature: false },
    ]);
    expect(toggleSignature(links, "t2")).toEqual([
      { termId: "t1", signature: true },
      { termId: "t2", signature: true },
    ]);
  });

  it("writes one row per term and kind, and one per designation", () => {
    expect(
      aromaRows(
        ARCH,
        [
          { termId: "t1", signature: true },
          { termId: "t1", signature: false },
        ],
        [{ termId: "t1", signature: false }],
      ),
    ).toEqual([
      { archetype_id: ARCH, term_id: "t1", kind: "NOSE", signature: true },
      { archetype_id: ARCH, term_id: "t1", kind: "PALATE", signature: false },
    ]);
    expect(designationRows(ARCH, ["d1", "d2", "d1"])).toEqual([
      { archetype_id: ARCH, type_designation_id: "d1" },
      { archetype_id: ARCH, type_designation_id: "d2" },
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/app/admin/archetypes/profile-rules.test.ts`
Expected: FAIL — `Failed to resolve import "./profile-rules"`.

- [ ] **Step 3: Write `src/app/admin/archetypes/profile-rules.ts`**

```ts
// Pure rules for the /admin/archetypes profile editor (training-room spec §4.4,
// §4.5, D21): which scales a profile edits, the ladder each range must lie on,
// the checks the editor runs before saving and updateArchetype runs again on
// the server, the appellation list with "Just the region", and the aroma and
// designation rows a save writes. Relative runtime imports only, so vitest
// loads it; the ladders are pinned to the matcher's ladderFor by the test.
import { justTheRegionOption } from "../../../components/add-wine/self-named-appellation";
import { foldName } from "../../../lib/wine-identity/fold";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "../../../lib/wset/vocab";
import type { WineColour, WineStyle } from "../../../lib/wset/types";

/** One aroma link; `signature` marks a term that is truly diagnostic (D5). */
export type AromaLink = { termId: string; signature: boolean };

/** What the editor opens on. */
export type ArchetypeProfile = {
  id: string;
  name: string;
  colour: WineColour;
  style: WineStyle;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: { [key: string]: [string, string] };
  nose: AromaLink[];
  palate: AromaLink[];
  countryId: string;
  regionId: string;
  appellationId: string;
  appellationName: string | null;
  designationIds: string[];
  typicalAgeLow: number | null;
  typicalAgeHigh: number | null;
  winePlaceId: string | null;
  winePlaceName: string | null;
};

/** What a save sends to updateArchetype. */
export type ArchetypeProfileInput = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: { [key: string]: [string, string] };
  nose: AromaLink[];
  palate: AromaLink[];
  countryId: string;
  regionId: string;
  appellationId: string;
  designationIds: string[];
  typicalAgeLow: number | null;
  typicalAgeHigh: number | null;
  winePlaceId: string | null;
};

/** The small reference lists the editor picks from (loadByHandReferences). */
export type EditorReferences = {
  countries: { id: string; name: string }[];
  regions: { id: string; name: string; countryId: string }[];
  typeDesignations: { id: string; name: string; category: string | null }[];
};

export type AppellationOption = { id: string; name: string; matchName?: string };

// Full enum order (spec §4.4) where the note's slider offers fewer stops.
const APPEARANCE_LADDER: readonly string[] = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
const SWEETNESS_LADDER: readonly string[] = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
];
const MOUSSE_LADDER: readonly string[] = ["DELICATE", "CREAMY", "AGGRESSIVE"];

/** A scale the editor edits: `ladder` is where a range may lie, `slider` what a note can say. */
export type ScaleSpec = { key: string; label: string; ladder: readonly string[]; slider: readonly string[] };

export function scalesFor(colour: WineColour, style: WineStyle): ScaleSpec[] {
  // A fortified archetype's alcohol is written on the five-stop ladder for the
  // reference sheet only (D19: never a distance).
  const alcohol = style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
  const hues = HUES_BY_COLOUR[colour];
  const scales: ScaleSpec[] = [
    { key: "appearanceIntensity", label: "Appearance intensity", ladder: APPEARANCE_LADDER, slider: APPEARANCE_INTENSITY_STOPS },
    { key: "colourHue", label: "Colour", ladder: hues, slider: hues },
    { key: "noseIntensity", label: "Nose intensity", ladder: INTENSITY_STOPS, slider: INTENSITY_STOPS },
    { key: "development", label: "Development", ladder: DEVELOPMENT_STOPS, slider: DEVELOPMENT_STOPS },
    { key: "sweetness", label: "Sweetness", ladder: SWEETNESS_LADDER, slider: SWEETNESS_STOPS },
    { key: "acidity", label: "Acidity", ladder: LEVEL_STOPS, slider: LEVEL_STOPS },
    { key: "tannin", label: "Tannin", ladder: LEVEL_STOPS, slider: LEVEL_STOPS },
    { key: "alcohol", label: "Alcohol", ladder: alcohol, slider: alcohol },
    { key: "body", label: "Body", ladder: BODY_STOPS, slider: BODY_STOPS },
    { key: "flavourIntensity", label: "Flavour intensity", ladder: INTENSITY_STOPS, slider: INTENSITY_STOPS },
    { key: "finish", label: "Finish", ladder: FINISH_STOPS, slider: FINISH_STOPS },
  ];
  if (style === "SPARKLING") {
    scales.push({ key: "mousse", label: "Mousse", ladder: MOUSSE_LADDER, slider: MOUSSE_LADDER });
  }
  return scales;
}

/** On the scale's ladder, low to high, and holding a value the note's slider can produce (§4.4). */
export function rangeFits(scale: ScaleSpec, range: readonly [string, string]): boolean {
  const lo = scale.ladder.indexOf(range[0]);
  const hi = scale.ladder.indexOf(range[1]);
  if (lo < 0 || hi < 0 || lo > hi) return false;
  return scale.ladder.slice(lo, hi + 1).some((v) => scale.slider.includes(v));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

function pairOk(lo: number | null, hi: number | null, min: number, max: number): boolean {
  if (lo === null && hi === null) return true;
  if (lo === null || hi === null) return false;
  return Number.isInteger(lo) && Number.isInteger(hi) && lo >= min && hi <= max && lo <= hi;
}

/** The first problem with a profile, in words, or null. Keys the editor does
    not show (clarity; mousse off sparkling) are left alone and survive a save. */
export function validateProfile(p: ArchetypeProfileInput): string | null {
  if (typeof p.name !== "string" || p.name.trim() === "") return "Give it a name.";
  if (!isId(p.countryId) || !isId(p.regionId) || !isId(p.appellationId)) {
    return "Pick a country, region and appellation.";
  }
  if (!pairOk(p.qualityLow, p.qualityHigh, 50, 100)) return "Quality runs from 50 to 100, low to high.";
  if (!pairOk(p.typicalAgeLow, p.typicalAgeHigh, 0, 100)) {
    return "Typical age takes two whole numbers of years, low to high.";
  }
  for (const s of scalesFor(p.colour, p.style)) {
    const range = p.sat[s.key];
    if (range !== undefined && !rangeFits(s, range)) return `${s.label}: pick a range on its own scale.`;
  }
  if (!Array.isArray(p.nose) || !Array.isArray(p.palate) || !Array.isArray(p.designationIds)) {
    return "Something in the profile is malformed.";
  }
  if (p.winePlaceId !== null && !isId(p.winePlaceId)) return "That map place is not valid.";
  return null;
}

/** The answer-key forms' wording for a region's own appellation. */
export const JUST_THE_REGION = "Just the region";

/** A region's appellations with its self-named row first as "Just the region · …". */
export function appellationOptions(
  regionName: string,
  list: readonly { id: string; name: string }[],
): AppellationOption[] {
  const self = justTheRegionOption({ id: "", name: regionName }, list);
  return [
    ...(self ? [{ id: self.id, name: `${JUST_THE_REGION} · ${self.name}`, matchName: self.name }] : []),
    ...list.filter((a) => a.id !== self?.id).map((a) => ({ id: a.id, name: a.name })),
  ];
}

export const APPELLATION_RESULTS_MAX = 50;

export function filterAppellationOptions(
  options: readonly AppellationOption[],
  query: string,
): AppellationOption[] {
  const key = foldName(query);
  const hits =
    key === ""
      ? options
      : options.filter(
          (o) =>
            foldName(o.name).includes(key) ||
            (o.matchName !== undefined && foldName(o.matchName).includes(key)),
        );
  return hits.slice(0, APPELLATION_RESULTS_MAX);
}

/** The aroma picker's new id list, each id keeping the signature it had. */
export function withTermIds(links: readonly AromaLink[], ids: readonly string[]): AromaLink[] {
  return ids.map((id) => links.find((l) => l.termId === id) ?? { termId: id, signature: false });
}

export function toggleSignature(links: readonly AromaLink[], termId: string): AromaLink[] {
  return links.map((l) => (l.termId === termId ? { ...l, signature: !l.signature } : l));
}

/** wine_archetype_aromas rows: one per (term, kind), the first link's signature winning. */
export function aromaRows(
  archetypeId: string,
  nose: readonly AromaLink[],
  palate: readonly AromaLink[],
): { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean }[] {
  const rows: { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean }[] = [];
  const seen = new Set<string>();
  for (const [kind, links] of [
    ["NOSE", nose],
    ["PALATE", palate],
  ] as const) {
    for (const link of links) {
      const key = `${kind}:${link.termId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ archetype_id: archetypeId, term_id: link.termId, kind, signature: link.signature === true });
    }
  }
  return rows;
}

export function designationRows(
  archetypeId: string,
  ids: readonly string[],
): { archetype_id: string; type_designation_id: string }[] {
  return [...new Set(ids)].map((id) => ({ archetype_id: archetypeId, type_designation_id: id }));
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/app/admin/archetypes/profile-rules.test.ts`
Expected: PASS — 11 tests in 1 file. If "uses the matcher's own ladders" fails, the matcher
and the editor disagree on a ladder: spec §4.4 decides which one is wrong.

- [ ] **Step 5: Write the new fields in `src/app/admin/archetypes/actions.ts`**

Replace
```ts
import { isContributor } from "@/lib/auth/roles";
import type { WineColour, WineStyle } from "@/lib/wset/types";
```
with
```ts
import { isContributor } from "@/lib/auth/roles";
import {
  aromaRows,
  designationRows,
  validateProfile,
  type ArchetypeProfileInput,
} from "./profile-rules";
```

Then replace everything from `export type ArchetypeProfileInput = {` to the end of the file
(the old type and the old `updateArchetype`) with:

```ts
// Save an archetype's profile: SAT ranges, quality, aromas with their signature
// flags, the scoring identity (country → region → appellation), designations,
// typical age and the optional map place (training-room spec §4.5). RLS gates
// every write to curators (contributor + admin); the app check mirrors it, and
// the profile is validated again here — the editor's own check is only a
// convenience.
export async function updateArchetype(
  archetypeId: string,
  input: ArchetypeProfileInput,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await ensureContributor();
  if (!supabase) return { error: "You don't have permission." };

  const invalid = validateProfile(input);
  if (invalid) return { error: invalid };

  const [{ data: region }, { data: appellation }] = await Promise.all([
    supabase.from("regions").select("country_id").eq("id", input.regionId).maybeSingle(),
    supabase.from("appellations").select("region_id").eq("id", input.appellationId).maybeSingle(),
  ]);
  if (!region || region.country_id !== input.countryId) {
    return { error: "That region is not in that country." };
  }
  if (!appellation || appellation.region_id !== input.regionId) {
    return { error: "That appellation is not in that region." };
  }

  const { error: upErr } = await supabase
    .from("wine_archetypes")
    .update({
      name: input.name.trim(),
      colour: input.colour,
      style: input.style,
      description: input.description,
      sat: input.sat,
      quality_low: input.qualityLow,
      quality_high: input.qualityHigh,
      country_id: input.countryId,
      region_id: input.regionId,
      appellation_id: input.appellationId,
      typical_age_low: input.typicalAgeLow,
      typical_age_high: input.typicalAgeHigh,
      wine_place_id: input.winePlaceId,
    })
    .eq("id", archetypeId);
  if (upErr) return { error: upErr.message };

  const { error: delErr } = await supabase
    .from("wine_archetype_aromas")
    .delete()
    .eq("archetype_id", archetypeId);
  if (delErr) return { error: delErr.message };
  const rows = aromaRows(archetypeId, input.nose, input.palate);
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("wine_archetype_aromas").insert(rows);
    if (insErr) return { error: insErr.message };
  }

  const { error: delDesErr } = await supabase
    .from("wine_archetype_designations")
    .delete()
    .eq("archetype_id", archetypeId);
  if (delDesErr) return { error: delDesErr.message };
  const designations = designationRows(archetypeId, input.designationIds);
  if (designations.length > 0) {
    const { error: insDesErr } = await supabase.from("wine_archetype_designations").insert(designations);
    if (insDesErr) return { error: insDesErr.message };
  }

  revalidatePath("/admin/archetypes");
  revalidatePath("/taste/training");
  return { ok: true };
}
```

- [ ] **Step 6: Replace `src/app/admin/archetypes/archetype-editor.tsx` in full**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import type { AromaTerm, WineColour, WineStyle } from "@/lib/wset/types";
import { LABELS, HUES_BY_COLOUR } from "@/lib/wset/vocab";
import { listAppellationsForRegions } from "@/lib/reference-search";
import { EditableRange } from "@/components/wset/range-input";
import { AromaPicker } from "@/components/wset/aroma-picker";
import { ReferenceCombobox } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TypeDesignationField, type TypeDesignationOption } from "@/components/type-designation-field";
import { cn } from "@/lib/utils";
import { searchPlaces, updateArchetype, type PlaceHit } from "./actions";
import {
  appellationOptions,
  filterAppellationOptions,
  scalesFor,
  toggleSignature,
  validateProfile,
  withTermIds,
  type AppellationOption,
  type ArchetypeProfile,
  type ArchetypeProfileInput,
  type AromaLink,
  type EditorReferences,
} from "./profile-rules";

const COLOURS: WineColour[] = ["WHITE", "ORANGE", "ROSE", "RED"];
const STYLES: WineStyle[] = ["STILL", "SPARKLING", "SWEET", "FORTIFIED"];
const FIELD = "rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground";
const LABEL = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

function numberOrNull(s: string): number | null {
  return s.trim() === "" ? null : Number(s);
}

// Each picked aroma as a chip; a starred one is a signature (training-room D5:
// picking that exact term earns a bonus). Module-level so React keeps one
// component identity across renders.
function SignatureToggles({
  links,
  termById,
  onToggle,
}: {
  links: AromaLink[];
  termById: Map<string, string>;
  onToggle: (termId: string) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">Signature terms — an exact hit earns a bonus</span>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <button
            key={l.termId}
            type="button"
            aria-pressed={l.signature}
            onClick={() => onToggle(l.termId)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              l.signature ? "border-gold bg-gold/15 text-foreground" : "border-border/70 text-muted-foreground",
            )}
          >
            <Star className={cn("size-3", l.signature && "fill-current")} />
            {termById.get(l.termId) ?? l.termId}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ArchetypeEditor({
  archetype,
  terms,
  references,
}: {
  archetype: ArchetypeProfile;
  terms: AromaTerm[];
  references: EditorReferences;
}) {
  const router = useRouter();
  const [name, setName] = useState(archetype.name);
  const [colour, setColour] = useState<WineColour>(archetype.colour);
  const [style, setStyle] = useState<WineStyle>(archetype.style);
  const [description, setDescription] = useState(archetype.description ?? "");
  const [qLow, setQLow] = useState(archetype.qualityLow?.toString() ?? "");
  const [qHigh, setQHigh] = useState(archetype.qualityHigh?.toString() ?? "");
  const [sat, setSat] = useState<Record<string, [string, string]>>(archetype.sat ?? {});
  const [nose, setNose] = useState<AromaLink[]>(archetype.nose);
  const [palate, setPalate] = useState<AromaLink[]>(archetype.palate);
  const [countryId, setCountryId] = useState(archetype.countryId);
  const [regionId, setRegionId] = useState(archetype.regionId);
  const [appellationId, setAppellationId] = useState(archetype.appellationId);
  const [appellationLabel, setAppellationLabel] = useState<string | null>(archetype.appellationName);
  const [designationIds, setDesignationIds] = useState<string[]>(archetype.designationIds);
  const [ageLow, setAgeLow] = useState(archetype.typicalAgeLow?.toString() ?? "");
  const [ageHigh, setAgeHigh] = useState(archetype.typicalAgeHigh?.toString() ?? "");
  const [place, setPlace] = useState<{ id: string; name: string } | null>(
    archetype.winePlaceId ? { id: archetype.winePlaceId, name: archetype.winePlaceName ?? "" } : null,
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A region's appellation list, read once per region while the editor is open.
  const appellationLists = useRef(new Map<string, AppellationOption[]>());
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const scales = scalesFor(colour, style);
  const termById = new Map(terms.map((t) => [t.id, t.term]));
  const regionOptions = references.regions
    .filter((r) => r.countryId === countryId)
    .map((r) => ({ id: r.id, name: r.name }));
  const regionName = references.regions.find((r) => r.id === regionId)?.name ?? null;
  const designationName = new Map(references.typeDesignations.map((d) => [d.id, d.name]));
  const designationOptions: TypeDesignationOption[] = references.typeDesignations.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    country_id: null,
  }));

  const setRange = (key: string, r: [string, string]) => {
    setSat((s) => ({ ...s, [key]: r }));
    setStatus("idle");
  };
  const clearRange = (key: string) =>
    setSat((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
  const changeColour = (c: WineColour) => {
    setColour(c);
    setSat((s) => {
      const hue = s.colourHue;
      if (hue && !(HUES_BY_COLOUR[c] as string[]).includes(hue[0])) {
        const next = { ...s };
        delete next.colourHue;
        return next;
      }
      return s;
    });
  };

  // The answer-key cascade: a new country drops a region from elsewhere, a new
  // region drops the appellation.
  const changeCountry = (id: string) => {
    setCountryId(id);
    if (references.regions.find((r) => r.id === regionId)?.countryId !== id) {
      setRegionId("");
      setAppellationId("");
      setAppellationLabel(null);
    }
  };
  const changeRegion = (id: string) => {
    setRegionId(id);
    setAppellationId("");
    setAppellationLabel(null);
  };

  async function searchRegionAppellations(query: string): Promise<AppellationOption[]> {
    if (!regionId || !regionName) return [];
    let options = appellationLists.current.get(regionId);
    if (!options) {
      options = appellationOptions(regionName, await listAppellationsForRegions([regionId]));
      appellationLists.current.set(regionId, options);
    }
    return filterAppellationOptions(options, query);
  }

  function runPlaceSearch(value: string) {
    setPlaceQuery(value);
    if (placeTimer.current) clearTimeout(placeTimer.current);
    if (value.trim().length < 2) {
      setPlaceHits([]);
      return;
    }
    placeTimer.current = setTimeout(() => {
      searchPlaces(value).then(setPlaceHits);
    }, 250);
  }

  function profileInput(): ArchetypeProfileInput {
    return {
      name: name.trim(),
      colour,
      style,
      description: description.trim() || null,
      qualityLow: numberOrNull(qLow),
      qualityHigh: numberOrNull(qHigh),
      sat,
      nose,
      palate,
      countryId,
      regionId,
      appellationId,
      designationIds,
      typicalAgeLow: numberOrNull(ageLow),
      typicalAgeHigh: numberOrNull(ageHigh),
      winePlaceId: place?.id ?? null,
    };
  }

  const save = () =>
    startTransition(async () => {
      const input = profileInput();
      const invalid = validateProfile(input);
      if (invalid) {
        setStatus("error");
        setError(invalid);
        return;
      }
      setError(null);
      const res = await updateArchetype(archetype.id, input);
      if ("error" in res) {
        setStatus("error");
        setError(res.error);
      } else {
        setStatus("saved");
        router.refresh();
      }
    });

  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            Colour
            <select value={colour} onChange={(e) => changeColour(e.target.value as WineColour)} className={FIELD}>
              {COLOURS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value as WineStyle)} className={FIELD}>
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <p className="text-xs font-medium text-muted-foreground">Where it scores</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={LABEL}>
            <span>Country</span>
            <ReferenceCombobox
              formFieldName="country_id"
              options={references.countries}
              value={countryId}
              onValueChange={changeCountry}
              placeholder="Pick a country"
            />
          </div>
          <div className={LABEL}>
            <span>Region</span>
            <ReferenceCombobox
              formFieldName="region_id"
              options={regionOptions}
              value={regionId}
              onValueChange={changeRegion}
              placeholder={countryId ? "Pick a region" : "Pick a country first"}
              disabled={!countryId}
            />
          </div>
          <div className={LABEL}>
            <span>Appellation</span>
            <SearchableCombobox
              formFieldName="appellation_id"
              value={appellationId}
              selectedLabel={appellationLabel}
              onValueChange={(id, label) => {
                setAppellationId(id);
                setAppellationLabel(label);
              }}
              search={searchRegionAppellations}
              placeholder={regionId ? "Just the region, or pick one" : "Pick a region first"}
              disabled={!regionId}
            />
          </div>
        </div>

        <div className={LABEL}>
          <span>Designations the label would carry</span>
          {designationIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {designationIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-foreground"
                >
                  {designationName.get(id) ?? id}
                  <button
                    type="button"
                    aria-label={`Remove ${designationName.get(id) ?? id}`}
                    onClick={() => setDesignationIds((ids) => ids.filter((x) => x !== id))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <TypeDesignationField
            formFieldName="designation_add"
            options={designationOptions}
            value=""
            onValueChange={(id) => {
              if (id) setDesignationIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
            }}
            placeholder="Add a designation"
            allowClear={false}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className={LABEL}>
            Typical age from (years)
            <input
              type="number"
              min={0}
              max={100}
              value={ageLow}
              onChange={(e) => setAgeLow(e.target.value)}
              className={cn(FIELD, "w-20")}
            />
          </label>
          <label className={LABEL}>
            to
            <input
              type="number"
              min={0}
              max={100}
              value={ageHigh}
              onChange={(e) => setAgeHigh(e.target.value)}
              className={cn(FIELD, "w-20")}
            />
          </label>
        </div>

        <div className={LABEL}>
          <span>Map place (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            {place ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-foreground">
                {place.name || place.id}
                <button
                  type="button"
                  aria-label="Remove the map place"
                  onClick={() => setPlace(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">None — not on the map</span>
            )}
            <div className="relative">
              <input
                value={placeQuery}
                onChange={(e) => runPlaceSearch(e.target.value)}
                placeholder="Search the map…"
                className={cn(FIELD, "w-48")}
              />
              {placeHits.length > 0 ? (
                <div className="absolute z-10 mt-1 max-h-64 w-72 overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {placeHits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setPlace({ id: h.id, name: h.name });
                        setPlaceQuery("");
                        setPlaceHits([]);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    >
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
                        {h.kind}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <label className={LABEL}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={FIELD} />
      </label>

      <div className="flex items-end gap-3">
        <label className={LABEL}>
          Quality from
          <input
            type="number"
            min={50}
            max={100}
            value={qLow}
            onChange={(e) => setQLow(e.target.value)}
            className={cn(FIELD, "w-20")}
          />
        </label>
        <label className={LABEL}>
          to
          <input
            type="number"
            min={50}
            max={100}
            value={qHigh}
            onChange={(e) => setQHigh(e.target.value)}
            className={cn(FIELD, "w-20")}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground">Structured tasting ranges</p>
        {scales.map((sc) => (
          <div key={sc.key} className="rounded-md border border-border/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium">{sc.label}</span>
              {sat[sc.key] ? (
                <button
                  type="button"
                  onClick={() => clearRange(sc.key)}
                  className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  clear
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground">not set — click to set</span>
              )}
            </div>
            <EditableRange
              stops={sc.ladder}
              labels={LABELS}
              value={sat[sc.key] ?? null}
              onChange={(r) => setRange(sc.key, r)}
            />
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Nose — aroma characteristics</p>
        <AromaPicker
          terms={terms}
          selectedIds={nose.map((l) => l.termId)}
          onChange={(ids) => setNose((links) => withTermIds(links, ids))}
          colour={colour}
        />
        <SignatureToggles
          links={nose}
          termById={termById}
          onToggle={(id) => setNose((links) => toggleSignature(links, id))}
        />
      </div>
      <div className="rounded-md border border-border/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Palate — flavour characteristics</p>
        <AromaPicker
          terms={terms}
          selectedIds={palate.map((l) => l.termId)}
          onChange={(ids) => setPalate((links) => withTermIds(links, ids))}
          colour={colour}
          copyFrom={{ label: "Copy from nose", ids: nose.map((l) => l.termId) }}
        />
        <SignatureToggles
          links={palate}
          termById={termById}
          onToggle={(id) => setPalate((links) => toggleSignature(links, id))}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : status === "saved" ? "Saved ✓" : "Save profile"}
        </button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Pass the references through `src/app/admin/archetypes/placement-editor.tsx`**

Replace
```tsx
import { ArchetypeEditor, type ArchetypeProfile } from "./archetype-editor";
import type { AromaTerm } from "@/lib/wset/types";
```
with
```tsx
import { ArchetypeEditor } from "./archetype-editor";
import type { ArchetypeProfile, EditorReferences } from "./profile-rules";
import type { AromaTerm } from "@/lib/wset/types";
```

Replace
```tsx
export function PlacementEditor({
  archetypes,
  terms,
}: {
  archetypes: ArchetypeAdmin[];
  terms: AromaTerm[];
}) {
```
with
```tsx
export function PlacementEditor({
  archetypes,
  terms,
  references,
}: {
  archetypes: ArchetypeAdmin[];
  terms: AromaTerm[];
  references: EditorReferences;
}) {
```

Replace
```tsx
            <ArchetypeEditor archetype={a} terms={terms} />
```
with
```tsx
            <ArchetypeEditor archetype={a} terms={terms} references={references} />
```

- [ ] **Step 8: Replace `src/app/admin/archetypes/page.tsx` in full**

```tsx
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadByHandReferences } from "@/components/add-wine/by-hand-actions";
import { requireContributor } from "@/lib/auth/roles";
import type { Database } from "@/lib/supabase/database.types";
import type { AromaTerm } from "@/lib/wset/types";
import { PlacementEditor, type ArchetypeAdmin } from "./placement-editor";
import type { EditorReferences } from "./profile-rules";

export const metadata = { title: "Typical wines · Admin · Blindr" };

type AromaLinkRow = { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean };

// PostgREST answers at most 1000 rows per request; the training room's first
// batch alone brings the aroma links close to that, so they are read in pages.
async function readAromaLinks(supabase: SupabaseClient<Database>): Promise<AromaLinkRow[]> {
  const rows: AromaLinkRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("wine_archetype_aromas")
      .select("archetype_id, term_id, kind, signature")
      .order("archetype_id")
      .order("term_id")
      .order("kind")
      .range(from, from + 999);
    if (error) throw new Error(`Typical wines: the aroma read failed (${error.message})`);
    const page = (data ?? []) as AromaLinkRow[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export default async function ArchetypesAdminPage() {
  const { supabase } = await requireContributor();

  const [
    { data: archetypes },
    { data: placements },
    aromaLinks,
    { data: termRows },
    { data: designationLinks },
    references,
  ] = await Promise.all([
    supabase
      .from("wine_archetypes")
      .select(
        "id, name, colour, style, description, quality_low, quality_high, sat, country_id, region_id, appellation_id, typical_age_low, typical_age_high, wine_place_id",
      )
      .order("sort_order"),
    supabase
      .from("wine_archetype_placements")
      .select("archetype_id, wine_place_id, sort_order")
      .order("sort_order"),
    readAromaLinks(supabase),
    supabase
      .from("wset_aroma_terms")
      .select("id, family, origin, group_name, term, sort_order")
      .order("sort_order"),
    supabase.from("wine_archetype_designations").select("archetype_id, type_designation_id"),
    loadByHandReferences(),
  ]);

  const rows = archetypes ?? [];

  const placeIds = Array.from(
    new Set([
      ...(placements ?? []).map((p) => p.wine_place_id),
      ...rows.map((a) => a.wine_place_id).filter((id): id is string => id !== null),
    ]),
  );
  const placeById = new Map<string, { name: string; kind: string; canonicalKey: string }>();
  if (placeIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name, kind, canonical_key")
      .in("id", placeIds);
    for (const p of places ?? []) {
      placeById.set(p.id, { name: p.name, kind: p.kind as string, canonicalKey: p.canonical_key });
    }
  }

  const appellationIds = Array.from(new Set(rows.map((a) => a.appellation_id)));
  const appellationName = new Map<string, string>();
  if (appellationIds.length > 0) {
    const { data: appellations } = await supabase
      .from("appellations")
      .select("id, name")
      .in("id", appellationIds);
    for (const a of appellations ?? []) appellationName.set(a.id, a.name);
  }

  const terms: AromaTerm[] = (termRows ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    origin: t.origin,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  const items: ArchetypeAdmin[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    description: a.description,
    qualityLow: a.quality_low,
    qualityHigh: a.quality_high,
    sat: a.sat,
    nose: aromaLinks
      .filter((l) => l.archetype_id === a.id && l.kind === "NOSE")
      .map((l) => ({ termId: l.term_id, signature: l.signature })),
    palate: aromaLinks
      .filter((l) => l.archetype_id === a.id && l.kind === "PALATE")
      .map((l) => ({ termId: l.term_id, signature: l.signature })),
    countryId: a.country_id,
    regionId: a.region_id,
    appellationId: a.appellation_id,
    appellationName: appellationName.get(a.appellation_id) ?? null,
    designationIds: (designationLinks ?? [])
      .filter((d) => d.archetype_id === a.id)
      .map((d) => d.type_designation_id),
    typicalAgeLow: a.typical_age_low,
    typicalAgeHigh: a.typical_age_high,
    winePlaceId: a.wine_place_id,
    winePlaceName: a.wine_place_id ? (placeById.get(a.wine_place_id)?.name ?? null) : null,
    placements: (placements ?? [])
      .filter((pl) => pl.archetype_id === a.id)
      .map((pl) => {
        const info = placeById.get(pl.wine_place_id);
        return {
          placeId: pl.wine_place_id,
          name: info?.name ?? "(unknown place)",
          kind: info?.kind ?? "",
          canonicalKey: info?.canonicalKey ?? "",
          sortOrder: pl.sort_order,
        };
      }),
  }));

  const editorReferences: EditorReferences = {
    countries: references.countries,
    regions: references.regions,
    typeDesignations: references.typeDesignations.map(({ id, name, category }) => ({ id, name, category })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Typical wines</h1>
        <p className="mt-2 text-muted-foreground">
          Edit each typical wine&apos;s tasting-sheet profile — where it scores (country, region,
          appellation), designations, typical age, appearance, nose, palate and quality ranges plus
          aromas and their signature terms — and choose which map places surface it.
        </p>
      </div>
      <PlacementEditor archetypes={items} terms={terms} references={editorReferences} />
    </div>
  );
}
```

- [ ] **Step 9: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/app/admin/archetypes && npx tsc --noEmit && npx eslint src/app/admin/archetypes`
Expected: vitest PASS — 11 tests in 1 file; `tsc` exits 0; `eslint` prints nothing.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/app/admin/archetypes/profile-rules.ts src/app/admin/archetypes/profile-rules.test.ts src/app/admin/archetypes/actions.ts src/app/admin/archetypes/archetype-editor.tsx src/app/admin/archetypes/placement-editor.tsx src/app/admin/archetypes/page.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): archetype editor — scoring identity, designations, typical age, signatures" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Content pipeline: the batch validator, the generator and the batch-1 migration

**Files:**
- Create: `scripts/training/archetype-ladders.mjs`
- Create (test): `src/lib/training/archetype-ladders.test.ts`
- Create: `scripts/training/archetype-batch.mjs`
- Create (test): `scripts/training/archetype-batch.test.mjs`
- Create: `scripts/training/validate-archetype-batch.mjs`
- Create: `scripts/training/gen-archetype-batch-migration.mjs`
- Create (generated by Step 12): `supabase/migrations/20260925130000_archetypes_batch_1.sql`
- Modify: `scripts/training-room.test.mjs` (append one test after the last line, the end of Task 1's back-fill test)
- Modify: `src/lib/supabase/database.types.ts` (the `wine_archetypes.Row.wine_place_id` lines Task 1 wrote, lines 1291–1295 after Task 1)
- Read (never written): `data/training/archetypes-batch-1.json`

**Interfaces:**
- Consumes:
  - Task 1: the columns `wine_archetypes.country_id/region_id/appellation_id/typical_age_low/typical_age_high`, the nullable `wine_place_id`, `wine_archetype_aromas.signature` and `wine_archetype_designations`. The generated SQL checks for these first and refuses with `apply 20260925120000_training_room.sql first`.
  - Tasks 6, 9, 12: every reader of `wine_archetypes.wine_place_id` tolerates null (Step 14 flips the type and runs `tsc` to prove it).
  - Existing: `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`; `INTENSITY_STOPS`, `SWEETNESS_STOPS`, `LEVEL_STOPS`, `ALCOHOL_STOPS`, `FORTIFIED_ALCOHOL_STOPS`, `BODY_STOPS`, `FINISH_STOPS`, `DEVELOPMENT_STOPS`, `APPEARANCE_INTENSITY_STOPS`, `HUES_BY_COLOUR` from `src/lib/wset/vocab.ts`.
- Produces:
  - `scripts/training/archetype-ladders.mjs`: `WINE_COLOURS`, `WINE_STYLES`, `APPEARANCE_INTENSITY`, `INTENSITY`, `DEVELOPMENT`, `SWEETNESS`, `LEVEL`, `BODY`, `FINISH`, `MOUSSE`, `ALCOHOL_STOPS`, `FORTIFIED_ALCOHOL_STOPS`, `HUES_BY_COLOUR`, `APPEARANCE_INTENSITY_SLIDER`, `SWEETNESS_SLIDER`, `MATCHED_SCALES`, `ladderFor(scale, { colour, style })`, `sliderStopsFor(scale, wine)`, `rangeProblems(scale, range, wine): string[]`.
  - `scripts/training/archetype-batch.mjs`: `entrySat(entry)`, `entryAromas(entry)`, `missingRows(batch)`, `batchProblems(batch): { errors: string[]; warnings: string[] }`, `sqlText(v)`, `batchCounts(batch)`, `batchMigrationSql(batch, { file, generatedOn }): string`.
  - `scripts/training/validate-archetype-batch.mjs`: `foldName(name)`, `liveProblems(client, batch)`, `validateBatchFile(path)`, `report(result, path)`. As a CLI it takes `[batch.json]`, defaults to batch 1, and exits 1 on any error.
  - `scripts/training/gen-archetype-batch-migration.mjs`: `generate(jsonPath, outPath, generatedOn?)`. As a CLI it takes `<batch.json> <out.sql>`.
  - `supabase/migrations/20260925130000_archetypes_batch_1.sql` (generated; apply after `20260925120000`).
  - `database.types.ts`: `wine_archetypes.Row.wine_place_id: string | null`.

- [ ] **Step 1: Write the failing ladder parity test.** Create `src/lib/training/archetype-ladders.test.ts`:

```ts
// Pins scripts/training/archetype-ladders.mjs (plain node, used by the batch
// validator and generator) to the TypeScript vocabulary, so the two cannot
// drift (training-room spec §4.4). The full-enum ladders are also checked
// against the live enums by validate-archetype-batch.mjs on every run.
import { describe, expect, it } from "vitest";
import {
  ALCOHOL_STOPS as BATCH_ALCOHOL_STOPS,
  APPEARANCE_INTENSITY,
  APPEARANCE_INTENSITY_SLIDER,
  BODY,
  DEVELOPMENT,
  FINISH,
  FORTIFIED_ALCOHOL_STOPS as BATCH_FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR as BATCH_HUES_BY_COLOUR,
  INTENSITY,
  LEVEL,
  MATCHED_SCALES,
  MOUSSE,
  SWEETNESS,
  SWEETNESS_SLIDER,
  WINE_COLOURS,
  WINE_STYLES,
} from "../../../scripts/training/archetype-ladders.mjs";
import type {
  AppearanceIntensity,
  Mousse,
  Sweetness,
  WineColour,
  WineStyle,
  WsetNoteState,
} from "../wset/types";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "../wset/vocab";

// Every member of each union, in src/lib/wset/types.ts order: `satisfies`
// refuses a misspelt member and the Exhaustive checks refuse a missing one.
const FULL_APPEARANCE = [
  "PALE",
  "MEDIUM_MINUS",
  "MEDIUM",
  "MEDIUM_PLUS",
  "DEEP",
] as const satisfies readonly AppearanceIntensity[];
const FULL_SWEETNESS = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
] as const satisfies readonly Sweetness[];
const FULL_MOUSSE = ["DELICATE", "CREAMY", "AGGRESSIVE"] as const satisfies readonly Mousse[];
const FULL_COLOURS = ["WHITE", "ROSE", "RED", "ORANGE"] as const satisfies readonly WineColour[];
const FULL_STYLES = ["STILL", "SPARKLING", "FORTIFIED", "SWEET"] as const satisfies readonly WineStyle[];
type Exhaustive<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : false;
const exhaustive: [
  Exhaustive<AppearanceIntensity, (typeof FULL_APPEARANCE)[number]>,
  Exhaustive<Sweetness, (typeof FULL_SWEETNESS)[number]>,
  Exhaustive<Mousse, (typeof FULL_MOUSSE)[number]>,
  Exhaustive<WineColour, (typeof FULL_COLOURS)[number]>,
  Exhaustive<WineStyle, (typeof FULL_STYLES)[number]>,
] = [true, true, true, true, true];

describe("archetype-ladders.mjs", () => {
  it("lists every member of the full-enum ladders in type order", () => {
    expect(exhaustive).toEqual([true, true, true, true, true]);
    expect(APPEARANCE_INTENSITY).toEqual([...FULL_APPEARANCE]);
    expect(SWEETNESS).toEqual([...FULL_SWEETNESS]);
    expect(MOUSSE).toEqual([...FULL_MOUSSE]);
    expect(WINE_COLOURS).toEqual([...FULL_COLOURS]);
    expect(WINE_STYLES).toEqual([...FULL_STYLES]);
  });

  it("matches the note's slider stops in vocab.ts", () => {
    expect(INTENSITY).toEqual(INTENSITY_STOPS);
    expect(LEVEL).toEqual(LEVEL_STOPS);
    expect(BODY).toEqual(BODY_STOPS);
    expect(FINISH).toEqual(FINISH_STOPS);
    expect(DEVELOPMENT).toEqual(DEVELOPMENT_STOPS);
    expect(BATCH_ALCOHOL_STOPS).toEqual(ALCOHOL_STOPS);
    expect(BATCH_FORTIFIED_ALCOHOL_STOPS).toEqual(FORTIFIED_ALCOHOL_STOPS);
    expect(APPEARANCE_INTENSITY_SLIDER).toEqual(APPEARANCE_INTENSITY_STOPS);
    expect(SWEETNESS_SLIDER).toEqual(SWEETNESS_STOPS);
    expect(BATCH_HUES_BY_COLOUR).toEqual(HUES_BY_COLOUR);
  });

  it("names only scales that are WsetNoteState keys", () => {
    const keys: (keyof WsetNoteState)[] = [
      "appearanceIntensity",
      "colourHue",
      "noseIntensity",
      "development",
      "sweetness",
      "acidity",
      "tannin",
      "alcohol",
      "body",
      "flavourIntensity",
      "finish",
    ];
    expect(MATCHED_SCALES).toEqual(keys);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/archetype-ladders.test.ts`
Expected: FAIL. Vitest cannot resolve `../../../scripts/training/archetype-ladders.mjs` (`Failed to load url` / `Cannot find module`), so 0 tests run.

- [ ] **Step 3: Write the ladders.** Create `scripts/training/archetype-ladders.mjs`:

```js
// The enum ladders a typical wine's SAT ranges live on (training-room spec
// §4.4), for the batch validator and generator, which run as plain node and
// cannot import src/lib/wset/vocab.ts. src/lib/training/archetype-ladders.test.ts
// pins every list here to the TypeScript source (src/lib/wset/types.ts order,
// src/lib/wset/vocab.ts stops), so the two cannot drift.

export const WINE_COLOURS = ["WHITE", "ROSE", "RED", "ORANGE"];
export const WINE_STYLES = ["STILL", "SPARKLING", "FORTIFIED", "SWEET"];

// Full enum order (low -> high), spec §4.4.
export const APPEARANCE_INTENSITY = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
export const INTENSITY = ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "PRONOUNCED"];
export const DEVELOPMENT = ["YOUTHFUL", "DEVELOPING", "FULLY_DEVELOPED", "TIRED_PAST_BEST"];
export const SWEETNESS = ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"];
export const LEVEL = ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"];
export const BODY = ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "FULL"];
export const FINISH = ["SHORT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "LONG"];
export const MOUSSE = ["DELICATE", "CREAMY", "AGGRESSIVE"];
// Alcohol: three stops on an unfortified wine, five on a fortified one.
export const ALCOHOL_STOPS = ["LOW", "MEDIUM", "HIGH"];
export const FORTIFIED_ALCOHOL_STOPS = ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"];
export const HUES_BY_COLOUR = {
  WHITE: ["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"],
  ROSE: ["PINK", "SALMON", "ORANGE"],
  RED: ["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"],
  ORANGE: ["GOLD", "AMBER", "BROWN"],
};

// What the note's sliders can produce (src/lib/wset/vocab.ts *_STOPS): a range
// must include at least one of these, or no taster can ever land inside it.
export const APPEARANCE_INTENSITY_SLIDER = ["PALE", "MEDIUM", "DEEP"];
export const SWEETNESS_SLIDER = ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"];

// The matched SAT keys (spec §4.4); mousse only on a sparkling wine.
export const MATCHED_SCALES = [
  "appearanceIntensity",
  "colourHue",
  "noseIntensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "alcohol",
  "body",
  "flavourIntensity",
  "finish",
];

// The ladder a scale's range must lie on, for a wine of this colour and style;
// null for a key that is not a matched scale here.
export function ladderFor(scale, { colour, style }) {
  switch (scale) {
    case "appearanceIntensity":
      return APPEARANCE_INTENSITY;
    case "colourHue":
      return HUES_BY_COLOUR[colour] ?? null;
    case "noseIntensity":
    case "flavourIntensity":
      return INTENSITY;
    case "development":
      return DEVELOPMENT;
    case "sweetness":
      return SWEETNESS;
    case "acidity":
    case "tannin":
      return LEVEL;
    case "alcohol":
      return style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
    case "body":
      return BODY;
    case "finish":
      return FINISH;
    case "mousse":
      return style === "SPARKLING" ? MOUSSE : null;
    default:
      return null;
  }
}

// The values the note's slider for this scale can produce.
export function sliderStopsFor(scale, wine) {
  if (scale === "appearanceIntensity") return APPEARANCE_INTENSITY_SLIDER;
  if (scale === "sweetness") return SWEETNESS_SLIDER;
  return ladderFor(scale, wine);
}

// Every problem with one [low, high] range, as sentences; [] when it is sound.
export function rangeProblems(scale, range, wine) {
  const ladder = ladderFor(scale, wine);
  if (!ladder) return [`${scale} is not a scale a ${wine.colour} ${wine.style} typical wine carries`];
  if (!Array.isArray(range) || range.length !== 2 || range.some((v) => typeof v !== "string")) {
    return [`${scale} must be a [low, high] pair of strings`];
  }
  const [lo, hi] = range;
  const problems = [];
  if (!ladder.includes(lo)) problems.push(`${scale} low "${lo}" is not on its ladder (${ladder.join(", ")})`);
  if (!ladder.includes(hi)) problems.push(`${scale} high "${hi}" is not on its ladder (${ladder.join(", ")})`);
  if (problems.length > 0) return problems;
  const from = ladder.indexOf(lo);
  const to = ladder.indexOf(hi);
  if (from > to) return [`${scale} low "${lo}" is above high "${hi}"`];
  const slider = sliderStopsFor(scale, wine);
  if (!ladder.slice(from, to + 1).some((v) => slider.includes(v))) {
    return [`${scale} [${lo}, ${hi}] holds no value the note's slider can produce`];
  }
  return [];
}
```

- [ ] **Step 4: Run the parity test and the type check**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/archetype-ladders.test.ts && npx tsc --noEmit`
Expected: `Tests 3 passed (3)`; `tsc` exits 0.

- [ ] **Step 5: Write the failing pure tests for the batch core.** Create `scripts/training/archetype-batch.test.mjs`:

```js
// Pure tests for the training-room batch checks and SQL (no database):
//   node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { batchCounts, batchMigrationSql, batchProblems, entrySat, sqlText } from "./archetype-batch.mjs";
import { ladderFor, rangeProblems } from "./archetype-ladders.mjs";

const SAT = {
  appearanceIntensity: ["PALE", "MEDIUM"],
  colourHue: ["LEMON", "GOLD"],
  noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
  development: ["YOUTHFUL", "DEVELOPING"],
  sweetness: ["DRY", "DRY"],
  acidity: ["HIGH", "HIGH"],
  tannin: ["LOW", "LOW"],
  alcohol: ["MEDIUM", "MEDIUM"],
  body: ["MEDIUM_MINUS", "MEDIUM"],
  flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
  finish: ["MEDIUM_PLUS", "LONG"],
};
const aromas = (terms) => terms.map(([group, term, signature = false]) => ({ group, term, signature }));
const entry = (over = {}) => ({
  name: "A typical Test d'Asti",
  country: "France",
  region: "Champagne",
  appellation: "Champagne AOC",
  placeCanonicalKey: null,
  colour: "WHITE",
  style: "SPARKLING",
  primaryGrape: "Chardonnay",
  secondaryGrape: "Pinot Noir",
  designations: ["Brut"],
  typicalAge: [2, 10],
  quality: [85, 95],
  sat: { ...SAT },
  mousse: ["CREAMY", "CREAMY"],
  nose: aromas([
    ["Citrus", "lemon"],
    ["Green fruit", "green apple"],
    ["Autolytic", "brioche", true],
    ["Autolytic", "toast"],
  ]),
  palate: aromas([
    ["Citrus", "lemon"],
    ["Green fruit", "green apple"],
    ["Autolytic", "brioche", true],
    ["Autolytic", "biscuit"],
  ]),
  description: "Test only.",
  ...over,
});
const batchOf = (...archetypes) => ({
  batch: 9,
  missingReferenceRows: { regions: [], appellations: [], grapes: [] },
  archetypes,
});

test("a sound entry has no errors and no warnings", () => {
  assert.deepEqual(batchProblems(batchOf(entry())), { errors: [], warnings: [] });
});

test("the committed batch-1 file is sound", () => {
  const batch = JSON.parse(readFileSync("data/training/archetypes-batch-1.json", "utf8"));
  assert.deepEqual(batchProblems(batch).errors, []);
});

test("ranges lie on their ladder and hold a value the slider can produce (spec §4.4)", () => {
  const red = { colour: "RED", style: "STILL" };
  const port = { colour: "RED", style: "FORTIFIED" };
  assert.deepEqual(rangeProblems("tannin", ["MEDIUM_PLUS", "HIGH"], red), []);
  assert.deepEqual(rangeProblems("tannin", ["MEDIUM", "LOUD"], red), [
    'tannin high "LOUD" is not on its ladder (LOW, MEDIUM_MINUS, MEDIUM, MEDIUM_PLUS, HIGH)',
  ]);
  assert.deepEqual(rangeProblems("acidity", ["HIGH", "MEDIUM"], red), ['acidity low "HIGH" is above high "MEDIUM"']);
  assert.deepEqual(rangeProblems("alcohol", ["MEDIUM", "MEDIUM_PLUS"], red), [
    'alcohol high "MEDIUM_PLUS" is not on its ladder (LOW, MEDIUM, HIGH)',
  ]);
  assert.deepEqual(rangeProblems("alcohol", ["MEDIUM_PLUS", "HIGH"], port), []);
  assert.deepEqual(rangeProblems("appearanceIntensity", ["MEDIUM_PLUS", "DEEP"], red), []);
  assert.deepEqual(rangeProblems("appearanceIntensity", ["MEDIUM_MINUS", "MEDIUM_MINUS"], red), [
    "appearanceIntensity [MEDIUM_MINUS, MEDIUM_MINUS] holds no value the note's slider can produce",
  ]);
  assert.deepEqual(rangeProblems("sweetness", ["MEDIUM", "MEDIUM"], red), [
    "sweetness [MEDIUM, MEDIUM] holds no value the note's slider can produce",
  ]);
  assert.deepEqual(rangeProblems("colourHue", ["RUBY", "GARNET"], { colour: "WHITE", style: "STILL" }), [
    'colourHue low "RUBY" is not on its ladder (LEMON_GREEN, LEMON, GOLD, AMBER, BROWN)',
    'colourHue high "GARNET" is not on its ladder (LEMON_GREEN, LEMON, GOLD, AMBER, BROWN)',
  ]);
  assert.deepEqual(rangeProblems("tannin", ["LOW"], red), ["tannin must be a [low, high] pair of strings"]);
  assert.equal(ladderFor("mousse", red), null);
  assert.deepEqual(ladderFor("colourHue", { colour: "ORANGE", style: "STILL" }), ["GOLD", "AMBER", "BROWN"]);
});

test("structural errors name the entry and the problem", () => {
  const cases = [
    [entry({ clarity: ["CLEAR", "CLEAR"] }), 'unknown key "clarity"'],
    [entry({ sat: { ...SAT, clarity: ["CLEAR", "CLEAR"] } }), `"sat.clarity" is not a matched scale`],
    [entry({ secondaryGrape: "Chardonnay" }), "the secondary grape repeats the primary"],
    [entry({ style: "STILL" }), 'only a sparkling wine carries a "mousse" range'],
    [entry({ mousse: undefined }), 'a sparkling wine needs a "mousse" range'],
    [entry({ colour: "PINKISH" }), 'colour "PINKISH" is not a wine_colour'],
    [entry({ quality: [40, 95] }), '"quality" must be [low, high] points, 50 <= low <= high <= 100'],
    [entry({ typicalAge: [10, 2] }), '"typicalAge" must be null or [low, high] whole years, 0 <= low <= high <= 100'],
    [entry({ designations: ["Brut", "Brut"] }), "a designation appears twice"],
    [entry({ placeCanonicalKey: "" }), '"placeCanonicalKey" must be a string or null'],
    [entry({ name: " A typical Test" }), '"name" must be a trimmed, non-empty string'],
    [
      entry({ nose: [...entry().nose, { group: "Citrus", term: "lemon", signature: false }] }),
      'nose lists "lemon" (Citrus) twice',
    ],
    [
      entry({ palate: [{ group: "Citrus", term: "lemon" }, ...entry().palate.slice(1)] }),
      'every "palate" aroma needs a group, a term and a boolean signature',
    ],
  ];
  for (const [e, message] of cases) {
    const { errors } = batchProblems(batchOf(e));
    assert.ok(
      errors.some((x) => x.startsWith("#1 ") && x.includes(message)),
      `${message} not in ${JSON.stringify(errors)}`,
    );
  }
  const twice = batchProblems(batchOf(entry(), entry()));
  assert.ok(twice.errors.includes("#2 A typical Test d'Asti: the name appears twice in this batch"));
  assert.deepEqual(batchProblems({ archetypes: "no" }).errors, ['the batch file needs an "archetypes" array']);
});

test("warnings let a batch through", () => {
  const noTannin = Object.fromEntries(Object.entries(SAT).filter(([k]) => k !== "tannin"));
  const ok = batchProblems(batchOf(entry({ name: "Test Brut", nose: entry().nose.slice(0, 3), sat: noTannin })));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, [
    '#1 Test Brut: the name does not start with "A typical " (spec §4.8)',
    '#1 Test Brut: no "tannin" range: the matcher skips that scale for it',
    "#1 Test Brut: 3 nose terms (the guide asks for 4-6)",
  ]);
});

test("entrySat folds the mousse range in; batchCounts counts every link", () => {
  assert.deepEqual(entrySat(entry()), { ...SAT, mousse: ["CREAMY", "CREAMY"] });
  assert.deepEqual(entrySat(entry({ style: "STILL", mousse: undefined })), SAT);
  assert.deepEqual(batchCounts(batchOf(entry(), entry({ name: "A typical Two", placeCanonicalKey: "france.champagne" }))), {
    archetypes: 2,
    aromas: 16,
    signatures: 4,
    designations: 2,
    placements: 1,
  });
});

test("the migration SQL quotes, guards and counts from the file", () => {
  const sql = batchMigrationSql(batchOf(entry()), { file: "data/training/test.json", generatedOn: "2026-09-25" });
  assert.equal(sqlText("d'Asti"), "'d''Asti'");
  assert.equal(sqlText(null), "null");
  assert.ok(sql.startsWith("-- Training room: typical wines, batch 9 (spec\n"));
  assert.ok(sql.includes("-- 1 archetypes, 8 aroma links (2 signature),\n-- 1 designation links, 0 map placements.\n"));
  assert.ok(sql.includes("-- Reference rows added: none (missingReferenceRows is empty)."));
  assert.ok(sql.includes("(1, 'A typical Test d''Asti', 'France', 'Champagne', 'Champagne AOC', null, 'WHITE'::wine_colour"));
  assert.ok(sql.includes(`'${JSON.stringify(entrySat(entry()))}'::jsonb`));
  assert.ok(sql.includes("('A typical Test d''Asti', 'NOSE', 'Autolytic', 'brioche', true)"));
  assert.ok(sql.includes("('A typical Test d''Asti', 'Brut');"));
  assert.ok(sql.includes("   where not exists (select 1 from public.wine_archetypes a where a.name = b.name)"));
  assert.ok(sql.includes("  if (select count(*) from _batch_archetypes) <> 1\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_aromas) <> 8\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_aromas where signature) <> 2\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_designations) <> 1 then"));
  assert.ok(!/insert into public\.(regions|appellations|grapes)/.test(sql));
  assert.equal(sql, batchMigrationSql(batchOf(entry()), { file: "data/training/test.json", generatedOn: "2026-09-25" }));

  const withRows = batchMigrationSql(
    {
      ...batchOf(entry()),
      missingReferenceRows: {
        regions: [{ country: "France", region: "Test Region" }],
        appellations: [{ country: "France", region: "Test Region", appellation: "Test AOC" }],
        grapes: [{ name: "Test Grape" }],
      },
    },
    { file: "x.json", generatedOn: "2026-09-25" },
  );
  assert.ok(withRows.includes("-- * region France / Test Region\n-- * appellation France / Test Region / Test AOC\n-- * grape Test Grape\n"));
  assert.ok(withRows.includes("insert into public.grapes (name) values ('Test Grape') on conflict (name) do nothing;"));
  assert.ok(withRows.indexOf("insert into public.regions") < withRows.indexOf("insert into public.appellations"));
  assert.ok(withRows.indexOf("insert into public.appellations") < withRows.indexOf("create temp table _batch_archetypes"));
});
```

- [ ] **Step 6: Run them and see them fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/training/archetype-batch.mjs`: `# pass 0`, `# fail 1`.

- [ ] **Step 7: Write the batch core.** Create `scripts/training/archetype-batch.mjs`:

```js
// Pure checks and SQL for a training-room archetype batch file
// (data/training/archetypes-batch-N.json; spec §4.4, §4.7, §4.8, D21). No
// database access here: validate-archetype-batch.mjs resolves the names against
// live, gen-archetype-batch-migration.mjs writes the migration. Tests:
// scripts/training/archetype-batch.test.mjs (node --test, no database).
import { MATCHED_SCALES, WINE_COLOURS, WINE_STYLES, rangeProblems } from "./archetype-ladders.mjs";

const ENTRY_KEYS = new Set([
  "name",
  "country",
  "region",
  "appellation",
  "placeCanonicalKey",
  "colour",
  "style",
  "primaryGrape",
  "secondaryGrape",
  "designations",
  "typicalAge",
  "quality",
  "sat",
  "mousse",
  "nose",
  "palate",
  "description",
]);

const isText = (v) => typeof v === "string" && v.trim() !== "" && v === v.trim();
const isInt = (v) => Number.isInteger(v);
const isPair = (v, ok) => Array.isArray(v) && v.length === 2 && ok(v[0], v[1]);

// The entry's full SAT profile as stored in wine_archetypes.sat: the matched
// scales plus, on a sparkling wine, the top-level "mousse" range.
export function entrySat(entry) {
  return entry.mousse === undefined ? { ...entry.sat } : { ...entry.sat, mousse: entry.mousse };
}

// Every aroma link of an entry, in file order: nose first, then palate.
export function entryAromas(entry) {
  return [
    ...(entry.nose ?? []).map((a) => ({ ...a, kind: "NOSE" })),
    ...(entry.palate ?? []).map((a) => ({ ...a, kind: "PALATE" })),
  ];
}

// The reference rows a batch may add (spec §4.7), always three arrays.
export function missingRows(batch) {
  const m = batch.missingReferenceRows ?? {};
  return { regions: m.regions ?? [], appellations: m.appellations ?? [], grapes: m.grapes ?? [] };
}

// Shape and ladder problems in one batch, before any database lookup.
// errors refuse the batch; warnings are printed and let it through.
export function batchProblems(batch) {
  const errors = [];
  const warnings = [];
  if (!batch || typeof batch !== "object" || !Array.isArray(batch.archetypes)) {
    return { errors: ['the batch file needs an "archetypes" array'], warnings };
  }
  if (!isInt(batch.batch) || batch.batch < 1) errors.push('"batch" must be a positive integer');
  if (batch.archetypes.length === 0) errors.push("the batch has no archetypes");
  const m = batch.missingReferenceRows;
  if (m !== undefined) {
    for (const key of ["regions", "appellations", "grapes"]) {
      if (!Array.isArray(m?.[key])) errors.push(`missingReferenceRows.${key} must be an array`);
    }
    if (Array.isArray(m?.regions) && m.regions.some((r) => !isText(r?.country) || !isText(r?.region))) {
      errors.push("every missingReferenceRows.regions entry needs a country and a region");
    }
    if (
      Array.isArray(m?.appellations) &&
      m.appellations.some((a) => !isText(a?.country) || !isText(a?.region) || !isText(a?.appellation))
    ) {
      errors.push("every missingReferenceRows.appellations entry needs a country, a region and an appellation");
    }
    if (Array.isArray(m?.grapes) && m.grapes.some((g) => !isText(g?.name))) {
      errors.push("every missingReferenceRows.grapes entry needs a name");
    }
  }

  const seen = new Set();
  batch.archetypes.forEach((entry, i) => {
    const at = `#${i + 1} ${entry && isText(entry.name) ? entry.name : "(no name)"}`;
    const err = (msg) => errors.push(`${at}: ${msg}`);
    const warn = (msg) => warnings.push(`${at}: ${msg}`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      err("is not an object");
      return;
    }
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) err(`unknown key "${key}"`);
    for (const key of ["name", "country", "region", "appellation", "primaryGrape", "description"]) {
      if (!isText(entry[key])) err(`"${key}" must be a trimmed, non-empty string`);
    }
    if (isText(entry.name)) {
      if (seen.has(entry.name)) err("the name appears twice in this batch");
      seen.add(entry.name);
      if (!entry.name.startsWith("A typical ")) warn('the name does not start with "A typical " (spec §4.8)');
    }
    if (entry.secondaryGrape !== null && !isText(entry.secondaryGrape)) {
      err('"secondaryGrape" must be a string or null');
    } else if (entry.secondaryGrape !== null && entry.secondaryGrape === entry.primaryGrape) {
      err("the secondary grape repeats the primary");
    }
    if (entry.placeCanonicalKey !== null && !isText(entry.placeCanonicalKey)) {
      err('"placeCanonicalKey" must be a string or null');
    }
    if (!WINE_COLOURS.includes(entry.colour)) err(`colour "${entry.colour}" is not a wine_colour`);
    if (!WINE_STYLES.includes(entry.style)) err(`style "${entry.style}" is not a wine_style`);
    if (!Array.isArray(entry.designations) || entry.designations.some((d) => !isText(d))) {
      err('"designations" must be an array of names');
    } else if (new Set(entry.designations).size !== entry.designations.length) {
      err("a designation appears twice");
    }
    if (
      entry.typicalAge !== null &&
      !isPair(entry.typicalAge, (lo, hi) => isInt(lo) && isInt(hi) && lo >= 0 && hi <= 100 && lo <= hi)
    ) {
      err('"typicalAge" must be null or [low, high] whole years, 0 <= low <= high <= 100');
    }
    if (!isPair(entry.quality, (lo, hi) => isInt(lo) && isInt(hi) && lo >= 50 && hi <= 100 && lo <= hi)) {
      err('"quality" must be [low, high] points, 50 <= low <= high <= 100');
    }

    // SAT ranges (spec §4.4): only the matched scales, each on its ladder with
    // at least one slider value inside; a mousse range exactly when sparkling.
    if (!entry.sat || typeof entry.sat !== "object" || Array.isArray(entry.sat)) {
      err('"sat" must be an object');
    } else if (WINE_COLOURS.includes(entry.colour) && WINE_STYLES.includes(entry.style)) {
      const wine = { colour: entry.colour, style: entry.style };
      for (const [scale, range] of Object.entries(entry.sat)) {
        if (!MATCHED_SCALES.includes(scale)) {
          err(`"sat.${scale}" is not a matched scale (${MATCHED_SCALES.join(", ")})`);
          continue;
        }
        for (const p of rangeProblems(scale, range, wine)) err(p);
      }
      for (const scale of MATCHED_SCALES) {
        if (!(scale in entry.sat)) warn(`no "${scale}" range: the matcher skips that scale for it`);
      }
      if (entry.style === "SPARKLING") {
        if (entry.mousse === undefined) err('a sparkling wine needs a "mousse" range');
        else for (const p of rangeProblems("mousse", entry.mousse, wine)) err(p);
      } else if (entry.mousse !== undefined) {
        err('only a sparkling wine carries a "mousse" range');
      }
    }

    // Aromas (spec §4.8): {group, term, signature}; a term once per kind.
    for (const kind of ["nose", "palate"]) {
      const list = entry[kind];
      if (!Array.isArray(list)) {
        err(`"${kind}" must be an array`);
        continue;
      }
      const terms = new Set();
      for (const a of list) {
        if (!a || !isText(a.group) || !isText(a.term) || typeof a.signature !== "boolean") {
          err(`every "${kind}" aroma needs a group, a term and a boolean signature`);
          continue;
        }
        const key = `${a.group}|${a.term}`;
        if (terms.has(key)) err(`${kind} lists "${a.term}" (${a.group}) twice`);
        terms.add(key);
      }
      if (list.length < 4 || list.length > 6) warn(`${list.length} ${kind} terms (the guide asks for 4-6)`);
    }
    if (Array.isArray(entry.nose) && Array.isArray(entry.palate)) {
      const signatures = new Set(entryAromas(entry).filter((a) => a && a.signature).map((a) => a.term));
      if (signatures.size > 3) warn(`${signatures.size} signature terms (the guide asks for at most 3)`);
    }
  });
  return { errors, warnings };
}

// A SQL string literal (null for null/undefined).
export function sqlText(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replaceAll("'", "''")}'`;
}

function sqlInt(v) {
  if (v === null || v === undefined) return "null";
  if (!Number.isInteger(v)) throw new Error(`not an integer: ${v}`);
  return String(v);
}

// The counts the migration's asserts check, computed from the file.
export function batchCounts(batch) {
  let aromas = 0;
  let signatures = 0;
  let designations = 0;
  let placements = 0;
  for (const e of batch.archetypes) {
    const links = entryAromas(e);
    aromas += links.length;
    signatures += links.filter((a) => a.signature).length;
    designations += e.designations.length;
    if (e.placeCanonicalKey) placements += 1;
  }
  return { archetypes: batch.archetypes.length, aromas, signatures, designations, placements };
}

// The data migration for one validated batch (spec D21, §4.7). Fail-closed:
// every name is resolved again inside the migration, and anything but exactly
// one live row raises. Idempotent on the archetype name: a name already in
// wine_archetypes is skipped with all its links, so a re-run is a no-op.
export function batchMigrationSql(batch, { file, generatedOn }) {
  const counts = batchCounts(batch);
  const missing = missingRows(batch);
  const lines = [];
  const out = (s = "") => lines.push(s);
  const rowsOut = (rows) => rows.forEach((r, i) => out(`  ${r}${i === rows.length - 1 ? ";" : ","}`));

  out(`-- Training room: typical wines, batch ${batch.batch} (spec`);
  out("-- docs/superpowers/specs/2026-09-25-training-room-design.md §4.7, D21).");
  out(`-- GENERATED from ${file} by scripts/training/gen-archetype-batch-migration.mjs`);
  out(`-- on ${generatedOn}. Edit the JSON and regenerate; never edit this file by hand.`);
  out("--");
  out(`-- ${counts.archetypes} archetypes, ${counts.aromas} aroma links (${counts.signatures} signature),`);
  out(`-- ${counts.designations} designation links, ${counts.placements} map placements.`);
  out("-- Every country, region, appellation, grape, designation, aroma term and map");
  out("-- place is resolved by its exact live name inside its parent; anything but");
  out("-- exactly one row raises. A name already in wine_archetypes is skipped with");
  out("-- all its links, so applying this twice is a no-op.");
  out("--");
  const listed = [
    ...missing.regions.map((r) => `region ${r.country} / ${r.region}`),
    ...missing.appellations.map((a) => `appellation ${a.country} / ${a.region} / ${a.appellation}`),
    ...missing.grapes.map((g) => `grape ${g.name}`),
  ];
  if (listed.length === 0) {
    out("-- Reference rows added: none (missingReferenceRows is empty).");
  } else {
    out("-- Reference rows added (the batch file's missingReferenceRows):");
    for (const l of listed) out(`-- * ${l}`);
  }
  out("--");
  out("-- Requires 20260925120000_training_room.sql. No begin/commit: the applier");
  out("-- owns the transaction.");
  out();
  out("set local lock_timeout = '10s';");
  out("-- A second apply inside one transaction (the DB suite's idempotency test)");
  out("-- would otherwise meet the temp tables of the first.");
  out("drop table if exists pg_temp._batch_archetypes, pg_temp._batch_aromas, pg_temp._batch_designations,");
  out("  pg_temp._batch_resolved, pg_temp._batch_new;");
  out();
  out("do $$");
  out("begin");
  out("  if to_regclass('public.wine_archetype_designations') is null");
  out("     or not exists (select 1 from information_schema.columns");
  out("                    where table_schema = 'public' and table_name = 'wine_archetype_aromas'");
  out("                      and column_name = 'signature')");
  out("     or not exists (select 1 from information_schema.columns");
  out("                    where table_schema = 'public' and table_name = 'wine_archetypes'");
  out("                      and column_name = 'appellation_id') then");
  out("    raise exception 'apply 20260925120000_training_room.sql first';");
  out("  end if;");
  out("end $$;");
  out();

  for (const r of missing.regions) {
    out("insert into public.regions (country_id, name)");
    out(`select c.id, ${sqlText(r.region)} from public.countries c where c.name = ${sqlText(r.country)}`);
    out("on conflict (country_id, name) do nothing;");
  }
  for (const a of missing.appellations) {
    out("insert into public.appellations (region_id, name)");
    out(`select r.id, ${sqlText(a.appellation)}`);
    out("  from public.regions r join public.countries c on c.id = r.country_id");
    out(` where c.name = ${sqlText(a.country)} and r.name = ${sqlText(a.region)}`);
    out("on conflict (region_id, name) do nothing;");
  }
  for (const g of missing.grapes) {
    out(`insert into public.grapes (name) values (${sqlText(g.name)}) on conflict (name) do nothing;`);
  }
  if (listed.length > 0) out();

  out("create temp table _batch_archetypes (");
  out("  ord int primary key,");
  out("  name text not null unique,");
  out("  country text not null, region text not null, appellation text not null,");
  out("  place_key text,");
  out("  colour wine_colour not null, style wine_style not null,");
  out("  primary_grape text not null, secondary_grape text,");
  out("  typical_age_low smallint, typical_age_high smallint,");
  out("  quality_low smallint not null, quality_high smallint not null,");
  out("  sat jsonb not null,");
  out("  description text not null");
  out(") on commit drop;");
  out("insert into _batch_archetypes values");
  rowsOut(
    batch.archetypes.map((e, i) => {
      const age = e.typicalAge ?? [null, null];
      return `(${[
        String(i + 1),
        sqlText(e.name),
        sqlText(e.country),
        sqlText(e.region),
        sqlText(e.appellation),
        sqlText(e.placeCanonicalKey),
        `${sqlText(e.colour)}::wine_colour`,
        `${sqlText(e.style)}::wine_style`,
        sqlText(e.primaryGrape),
        sqlText(e.secondaryGrape),
        sqlInt(age[0]),
        sqlInt(age[1]),
        sqlInt(e.quality[0]),
        sqlInt(e.quality[1]),
        `${sqlText(JSON.stringify(entrySat(e)))}::jsonb`,
        sqlText(e.description),
      ].join(", ")})`;
    }),
  );
  out();
  out("create temp table _batch_aromas (");
  out("  name text not null, kind text not null, group_name text not null, term text not null,");
  out("  signature boolean not null,");
  out("  primary key (name, kind, group_name, term)");
  out(") on commit drop;");
  const aromaRows = batch.archetypes.flatMap((e) =>
    entryAromas(e).map(
      (a) => `(${sqlText(e.name)}, ${sqlText(a.kind)}, ${sqlText(a.group)}, ${sqlText(a.term)}, ${a.signature})`,
    ),
  );
  if (aromaRows.length > 0) {
    out("insert into _batch_aromas values");
    rowsOut(aromaRows);
  }
  out();
  out("create temp table _batch_designations (");
  out("  name text not null, designation text not null,");
  out("  primary key (name, designation)");
  out(") on commit drop;");
  const desRows = batch.archetypes.flatMap((e) => e.designations.map((d) => `(${sqlText(e.name)}, ${sqlText(d)})`));
  if (desRows.length > 0) {
    out("insert into _batch_designations values");
    rowsOut(desRows);
  }
  out();
  out("-- Every name, resolved inside its parent: one array per reference, which the");
  out("-- assert below needs to hold exactly one element.");
  out("create temp table _batch_resolved on commit drop as");
  out("select b.ord, b.name,");
  out("       array(select c.id from public.countries c where c.name = b.country) as country_ids,");
  out("       array(select r.id from public.regions r join public.countries c on c.id = r.country_id");
  out("              where c.name = b.country and r.name = b.region) as region_ids,");
  out("       array(select a.id from public.appellations a");
  out("               join public.regions r on r.id = a.region_id");
  out("               join public.countries c on c.id = r.country_id");
  out("              where c.name = b.country and r.name = b.region and a.name = b.appellation) as appellation_ids,");
  out("       array(select g.id from public.grapes g where g.name = b.primary_grape) as primary_grape_ids,");
  out("       case when b.secondary_grape is null then array[null::uuid]");
  out("            else array(select g.id from public.grapes g where g.name = b.secondary_grape) end as secondary_grape_ids,");
  out("       case when b.place_key is null then array[null::uuid]");
  out("            else array(select p.id from public.wine_places p where p.canonical_key = b.place_key) end as place_ids");
  out("  from _batch_archetypes b;");
  out();
  out("do $$");
  out("declare");
  out("  v_text text;");
  out("begin");
  out(`  if (select count(*) from _batch_archetypes) <> ${counts.archetypes}`);
  out(`     or (select count(*) from _batch_aromas) <> ${counts.aromas}`);
  out(`     or (select count(*) from _batch_aromas where signature) <> ${counts.signatures}`);
  out(`     or (select count(*) from _batch_designations) <> ${counts.designations} then`);
  out("    raise exception 'the batch rows did not load in full';");
  out("  end if;");
  out("  select string_agg(format('%s: %s resolves to %s rows', r.name, x.field, x.n), '; ' order by r.ord, x.field)");
  out("    into v_text");
  out("  from _batch_resolved r");
  out("  cross join lateral (values ('country', cardinality(r.country_ids)),");
  out("                             ('region', cardinality(r.region_ids)),");
  out("                             ('appellation', cardinality(r.appellation_ids)),");
  out("                             ('primary grape', cardinality(r.primary_grape_ids)),");
  out("                             ('secondary grape', cardinality(r.secondary_grape_ids)),");
  out("                             ('map place', cardinality(r.place_ids))) as x (field, n)");
  out("  where x.n <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'a batch reference does not resolve to exactly one live row: %', v_text;");
  out("  end if;");
  out("  select string_agg(format('%s: %s (%s) resolves to %s terms', x.name, x.term, x.group_name, x.n), '; ')");
  out("    into v_text");
  out("  from (select a.name, a.term, a.group_name,");
  out("               (select count(*) from public.wset_aroma_terms t");
  out("                 where t.group_name = a.group_name and t.term = a.term) as n");
  out("          from _batch_aromas a) x");
  out("  where x.n <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'an aroma term does not resolve to exactly one live row: %', v_text;");
  out("  end if;");
  out("  select string_agg(format('%s: %s', d.name, d.designation), '; ') into v_text");
  out("  from _batch_designations d");
  out("  where (select count(*) from public.type_designations td");
  out("          where td.name = d.designation and td.is_active) <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'a designation does not resolve to exactly one active row: %', v_text;");
  out("  end if;");
  out("end $$;");
  out();
  out("create temp table _batch_new (id uuid primary key, name text not null unique) on commit drop;");
  out();
  out("with inserted as (");
  out("  insert into public.wine_archetypes (");
  out("    name, wine_place_id, country_id, region_id, appellation_id, colour, style,");
  out("    primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high,");
  out("    typical_age_low, typical_age_high, sort_order");
  out("  )");
  out("  select b.name, r.place_ids[1], r.country_ids[1], r.region_ids[1], r.appellation_ids[1],");
  out("         b.colour, b.style, r.primary_grape_ids[1], r.secondary_grape_ids[1], b.description,");
  out("         b.sat, b.quality_low, b.quality_high, b.typical_age_low, b.typical_age_high,");
  out("         (select coalesce(max(a.sort_order), 0) from public.wine_archetypes a) + b.ord");
  out("    from _batch_archetypes b");
  out("    join _batch_resolved r on r.ord = b.ord");
  out("   where not exists (select 1 from public.wine_archetypes a where a.name = b.name)");
  out("  returning id, name");
  out(")");
  out("insert into _batch_new (id, name) select id, name from inserted;");
  out();
  out("insert into public.wine_archetype_aromas (archetype_id, term_id, kind, signature)");
  out("select n.id, t.id, x.kind, x.signature");
  out("  from _batch_aromas x");
  out("  join _batch_new n on n.name = x.name");
  out("  join public.wset_aroma_terms t on t.group_name = x.group_name and t.term = x.term;");
  out();
  out("insert into public.wine_archetype_designations (archetype_id, type_designation_id)");
  out("select n.id, td.id");
  out("  from _batch_designations d");
  out("  join _batch_new n on n.name = d.name");
  out("  join public.type_designations td on td.name = d.designation and td.is_active;");
  out();
  out("-- An archetype with a map place shows there, like the live ones");
  out("-- (20260829224000's back-fill: its home place, its own sort_order).");
  out("insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)");
  out("select a.id, a.wine_place_id, a.sort_order");
  out("  from _batch_new n");
  out("  join public.wine_archetypes a on a.id = n.id");
  out(" where a.wine_place_id is not null");
  out("on conflict (archetype_id, wine_place_id) do nothing;");
  out();
  out("-- Post-state, same transaction.");
  out("do $$");
  out("declare");
  out("  v_new int;");
  out("  v_text text;");
  out("begin");
  out("  -- Every batch name is in wine_archetypes exactly once.");
  out("  select string_agg(format('%s x%s', b.name, coalesce(x.n, 0)), '; ') into v_text");
  out("  from _batch_archetypes b");
  out("  left join (select a.name, count(*) as n from public.wine_archetypes a group by a.name) x on x.name = b.name");
  out("  where coalesce(x.n, 0) <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'batch archetypes are not each present exactly once: %', v_text;");
  out("  end if;");
  out("  -- The rows THIS run wrote carry every link the file lists.");
  out("  select count(*) into v_new from _batch_new;");
  out("  select string_agg(n.name, '; ') into v_text");
  out("  from _batch_new n");
  out("  join public.wine_archetypes a on a.id = n.id");
  out("  where (select count(*) from public.wine_archetype_aromas l where l.archetype_id = n.id)");
  out("          <> (select count(*) from _batch_aromas x where x.name = n.name)");
  out("     or (select count(*) from public.wine_archetype_aromas l where l.archetype_id = n.id and l.signature)");
  out("          <> (select count(*) from _batch_aromas x where x.name = n.name and x.signature)");
  out("     or (select count(*) from public.wine_archetype_designations l where l.archetype_id = n.id)");
  out("          <> (select count(*) from _batch_designations x where x.name = n.name)");
  out("     or (select count(*) from public.wine_archetype_placements p where p.archetype_id = n.id)");
  out("          <> case when a.wine_place_id is null then 0 else 1 end;");
  out("  if v_text is not null then");
  out("    raise exception 'batch archetypes written without every link: %', v_text;");
  out("  end if;");
  out(`  raise notice 'archetypes batch ${batch.batch}: % new of ${counts.archetypes}; wine_archetypes now %',`);
  out("    v_new, (select count(*) from public.wine_archetypes);");
  out("end $$;");
  return `${lines.join("\n")}\n`;
}
```

- [ ] **Step 8: Run the pure tests**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs`
Expected: `# tests 7`, `# pass 7`, `# fail 0`. The test "the committed batch-1 file is sound" also proves every range in `data/training/archetypes-batch-1.json` lies on its §4.4 ladder.

- [ ] **Step 9: Write the validator.** Create `scripts/training/validate-archetype-batch.mjs`:

```js
// Validates a training-room archetype batch against the LIVE database,
// read-only (spec §4.4, §4.7, D21). Every country, region (inside its
// country), appellation (inside its region), grape, designation (active),
// aroma term (inside its group) and map place key must resolve to exactly one
// live row, unless the file lists it under missingReferenceRows; the live
// enums must still be the ladders scripts/training/archetype-ladders.mjs
// holds. Exits 1 on any error; warnings are printed and let it through.
//
//   node --env-file=.env.local scripts/training/validate-archetype-batch.mjs \
//     data/training/archetypes-batch-1.json
//
// gen-archetype-batch-migration.mjs runs the same check (validateBatchFile)
// and refuses to write a migration unless it passes.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";
import {
  APPEARANCE_INTENSITY,
  BODY,
  DEVELOPMENT,
  FINISH,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY,
  LEVEL,
  MOUSSE,
  SWEETNESS,
  WINE_COLOURS,
  WINE_STYLES,
} from "./archetype-ladders.mjs";
import { batchProblems, entryAromas, missingRows } from "./archetype-batch.mjs";

// Each ladder, as the live enum it must equal (full enum order, spec §4.4).
// Alcohol's full enum is the fortified ladder; every hue a colour allows must
// be a live wset_colour_hue label.
const ENUM_LADDERS = {
  wine_colour: WINE_COLOURS,
  wine_style: WINE_STYLES,
  wset_appearance_intensity: APPEARANCE_INTENSITY,
  wset_intensity: INTENSITY,
  wset_development: DEVELOPMENT,
  wset_sweetness: SWEETNESS,
  wset_level: LEVEL,
  wset_body: BODY,
  wset_finish: FINISH,
  wset_mousse: MOUSSE,
};

const SEP = String.fromCharCode(31); // chr(31) in SQL: Postgres text cannot hold a NUL
const key = (...parts) => parts.join(SEP);

// Accent-, case- and suffix-blind form of an appellation or grape name, used
// only to refuse a "missing" row that already exists under another spelling.
export function foldName(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/ (aoc|aop|doc|docg|doca|do|dop|ava|dac|igt|igp|gi|pdo|pgi)$/u, "");
}

// counts: a Map from key(...) to the number of live rows.
async function countMap(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return new Map(rows.map((r) => [r.k, Number(r.n)]));
}

// Resolves every name the batch uses. Returns { errors, warnings }.
export async function liveProblems(client, batch) {
  const errors = [];
  const warnings = [];
  const entries = batch.archetypes;
  const missing = missingRows(batch);
  const listedRegion = new Set(missing.regions.map((r) => key(r.country, r.region)));
  const listedAppellation = new Set(missing.appellations.map((a) => key(a.country, a.region, a.appellation)));
  const listedGrape = new Set(missing.grapes.map((g) => g.name));

  // 1. The live enums are still the ladders.
  const { rows: enumRows } = await client.query(
    `select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
       from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typnamespace = 'public'::regnamespace and t.typname = any($1::text[])
      group by t.typname`,
    [[...Object.keys(ENUM_LADDERS), "wset_colour_hue"]],
  );
  const live = new Map(enumRows.map((r) => [r.name, r.labels]));
  for (const [name, ladder] of Object.entries(ENUM_LADDERS)) {
    if (JSON.stringify(live.get(name)) !== JSON.stringify(ladder)) {
      errors.push(`live enum ${name} is ${JSON.stringify(live.get(name) ?? null)}, the ladder is ${JSON.stringify(ladder)}`);
    }
  }
  if (JSON.stringify(live.get("wset_level")) !== JSON.stringify(FORTIFIED_ALCOHOL_STOPS)) {
    errors.push("live enum wset_level is not the fortified alcohol ladder");
  }
  const hues = live.get("wset_colour_hue") ?? [];
  for (const [colour, list] of Object.entries(HUES_BY_COLOUR)) {
    const off = list.filter((h) => !hues.includes(h));
    if (off.length > 0) errors.push(`HUES_BY_COLOUR.${colour} holds ${off.join(", ")}, which live wset_colour_hue lacks`);
  }

  // 2. Reference rows, counted by name inside their parent.
  const countries = [...new Set(entries.map((e) => e.country).concat(missing.regions.map((r) => r.country)))];
  const countryN = await countMap(
    client,
    "select c.name as k, count(*) as n from countries c where c.name = any($1::text[]) group by c.name",
    [countries],
  );
  const regionPairs = [...new Map(entries.map((e) => [key(e.country, e.region), [e.country, e.region]])).values()];
  const regionN = await countMap(
    client,
    `select c.name || chr(31) || r.name as k, count(*) as n
       from regions r join countries c on c.id = r.country_id
      where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))
      group by c.name, r.name`,
    [regionPairs.map((p) => p[0]), regionPairs.map((p) => p[1])],
  );
  const appTriples = [
    ...new Map(entries.map((e) => [key(e.country, e.region, e.appellation), [e.country, e.region, e.appellation]])).values(),
  ];
  const appellationN = await countMap(
    client,
    `select c.name || chr(31) || r.name || chr(31) || a.name as k, count(*) as n
       from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
      where (c.name, r.name, a.name) in (select * from unnest($1::text[], $2::text[], $3::text[]))
      group by c.name, r.name, a.name`,
    [appTriples.map((t) => t[0]), appTriples.map((t) => t[1]), appTriples.map((t) => t[2])],
  );
  const grapes = [...new Set(entries.flatMap((e) => [e.primaryGrape, e.secondaryGrape]).filter(Boolean))];
  const grapeN = await countMap(
    client,
    "select g.name as k, count(*) as n from grapes g where g.name = any($1::text[]) group by g.name",
    [grapes],
  );
  const designations = [...new Set(entries.flatMap((e) => e.designations))];
  const designationN = await countMap(
    client,
    `select td.name as k, count(*) as n from type_designations td
      where td.name = any($1::text[]) and td.is_active group by td.name`,
    [designations],
  );
  const termPairs = [...new Map(entries.flatMap(entryAromas).map((a) => [key(a.group, a.term), [a.group, a.term]])).values()];
  const termN = await countMap(
    client,
    `select t.group_name || chr(31) || t.term as k, count(*) as n from wset_aroma_terms t
      where (t.group_name, t.term) in (select * from unnest($1::text[], $2::text[]))
      group by t.group_name, t.term`,
    [termPairs.map((p) => p[0]), termPairs.map((p) => p[1])],
  );
  const placeKeys = [...new Set(entries.map((e) => e.placeCanonicalKey).filter(Boolean))];
  const placeN = await countMap(
    client,
    "select p.canonical_key as k, count(*) as n from wine_places p where p.canonical_key = any($1::text[]) group by p.canonical_key",
    [placeKeys],
  );
  const { rows: liveNames } = await client.query(
    "select distinct a.name from wine_archetypes a where a.name = any($1::text[])",
    [entries.map((e) => e.name)],
  );
  const alreadyLive = new Set(liveNames.map((r) => r.name));

  // 3. The rows listed as missing must really be missing, under any spelling.
  for (const r of missing.regions) {
    if ((countryN.get(r.country) ?? 0) !== 1) errors.push(`missing region ${r.region}: country "${r.country}" is not one live row`);
  }
  const { rows: listedLive } = await client.query(
    `select c.name || chr(31) || r.name as k from regions r join countries c on c.id = r.country_id
      where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))`,
    [missing.regions.map((r) => r.country), missing.regions.map((r) => r.region)],
  );
  for (const row of listedLive) errors.push(`missingReferenceRows lists a region that is live: ${row.k.split(SEP).join(" / ")}`);
  if (missing.appellations.length > 0) {
    const { rows: siblings } = await client.query(
      `select c.name as country, r.name as region, a.name as appellation
         from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
        where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))`,
      [missing.appellations.map((a) => a.country), missing.appellations.map((a) => a.region)],
    );
    for (const a of missing.appellations) {
      const regionKnown = listedRegion.has(key(a.country, a.region)) || regionN.get(key(a.country, a.region)) === 1;
      if (!regionKnown) {
        const { rows } = await client.query(
          "select count(*)::int as n from regions r join countries c on c.id = r.country_id where c.name = $1 and r.name = $2",
          [a.country, a.region],
        );
        if (rows[0].n !== 1) errors.push(`missing appellation ${a.appellation}: region ${a.country} / ${a.region} is not one live row`);
      }
      const clash = siblings.find(
        (s) => s.country === a.country && s.region === a.region && foldName(s.appellation) === foldName(a.appellation),
      );
      if (clash) {
        errors.push(
          `missingReferenceRows lists appellation "${a.appellation}", but ${a.region} already holds "${clash.appellation}"`,
        );
      }
    }
  }
  if (missing.grapes.length > 0) {
    const { rows: allGrapes } = await client.query("select name from grapes");
    for (const g of missing.grapes) {
      const clash = allGrapes.find((x) => foldName(x.name) === foldName(g.name));
      if (clash) errors.push(`missingReferenceRows lists grape "${g.name}", but "${clash.name}" is live`);
    }
  }

  // 4. Every entry's names.
  const one = (map, k, listed) => (listed ? 1 : map.get(k) ?? 0);
  entries.forEach((e, i) => {
    const at = `#${i + 1} ${e.name}`;
    const need = (what, n) => {
      if (n !== 1) errors.push(`${at}: ${what} resolves to ${n} live rows`);
    };
    need(`country "${e.country}"`, countryN.get(e.country) ?? 0);
    const regionListed = listedRegion.has(key(e.country, e.region));
    need(`region "${e.region}" in ${e.country}`, one(regionN, key(e.country, e.region), regionListed));
    need(
      `appellation "${e.appellation}" in ${e.region}`,
      one(appellationN, key(e.country, e.region, e.appellation), listedAppellation.has(key(e.country, e.region, e.appellation))),
    );
    need(`primary grape "${e.primaryGrape}"`, one(grapeN, e.primaryGrape, listedGrape.has(e.primaryGrape)));
    if (e.secondaryGrape) {
      need(`secondary grape "${e.secondaryGrape}"`, one(grapeN, e.secondaryGrape, listedGrape.has(e.secondaryGrape)));
    }
    for (const d of e.designations) need(`designation "${d}" (active)`, designationN.get(d) ?? 0);
    for (const a of entryAromas(e)) need(`aroma term "${a.term}" in ${a.group}`, termN.get(key(a.group, a.term)) ?? 0);
    if (e.placeCanonicalKey) need(`map place "${e.placeCanonicalKey}"`, placeN.get(e.placeCanonicalKey) ?? 0);
    if (alreadyLive.has(e.name)) warnings.push(`${at}: already in wine_archetypes; the migration skips it`);
  });
  return { errors, warnings };
}

// The whole check for one file: shape first, then live (skipped when the
// shape is broken, since the lookups would only repeat the same errors).
export async function validateBatchFile(path) {
  const batch = JSON.parse(readFileSync(path, "utf8"));
  const shape = batchProblems(batch);
  if (shape.errors.length > 0) return { batch, ...shape };
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    await client.query("begin read only");
    const liveResult = await liveProblems(client, batch);
    return {
      batch,
      errors: [...shape.errors, ...liveResult.errors],
      warnings: [...shape.warnings, ...liveResult.warnings],
    };
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

export function report({ batch, errors, warnings }, path) {
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  const n = Array.isArray(batch?.archetypes) ? batch.archetypes.length : 0;
  if (errors.length === 0) console.log(`${path}: ${n} archetypes resolve (${warnings.length} warnings)`);
  else console.error(`${path}: ${errors.length} errors`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? "data/training/archetypes-batch-1.json";
  const result = await validateBatchFile(path);
  report(result, path);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
```

- [ ] **Step 10: Run the validator against live (read-only), on the real file and on a broken copy**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local scripts/training/validate-archetype-batch.mjs data/training/archetypes-batch-1.json; echo "exit $?"`
Expected, with today's file (87 entries; a JSON that has since gained entries prints its own count):
```
data/training/archetypes-batch-1.json: 87 archetypes resolve (0 warnings)
exit 0
```
If it prints `error:` lines, the JSON names something that is not exactly one live row. Fix the JSON (live spellings, suffix included), never the validator.

Then prove it refuses. This writes a broken copy to the OS temp directory, not the repository:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && BROKEN=$(node --input-type=module -e "$(cat <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const b = JSON.parse(readFileSync("data/training/archetypes-batch-1.json", "utf8"));
b.archetypes[0].appellation = "Pauillac";
b.archetypes[1].nose[0].term = "blackcurrants";
b.archetypes[2].designations = ["Grand Cru Classe"];
b.archetypes[3].placeCanonicalKey = "france.nowhere";
b.missingReferenceRows = {
  regions: [],
  appellations: [{ country: "France", region: "Bordeaux", appellation: "Margaux" }],
  grapes: [{ name: "Semillon" }],
};
const out = join(tmpdir(), "archetypes-broken.json");
writeFileSync(out, JSON.stringify(b));
console.log(out);
EOF
)") && node --env-file=.env.local scripts/training/validate-archetype-batch.mjs "$BROKEN"; echo "exit $?"
```
Expected (entries #1–#4 are Pauillac, Saint-Julien, Saint-Estèphe and Pessac-Léognan red in today's file):
```
error: missingReferenceRows lists appellation "Margaux", but Bordeaux already holds "Margaux"
error: missingReferenceRows lists grape "Semillon", but "Semillon" is live
error: #1 A typical Pauillac: appellation "Pauillac" in Bordeaux resolves to 0 live rows
error: #2 A typical Saint-Julien: aroma term "blackcurrants" in Black fruit resolves to 0 live rows
error: #3 A typical Saint-Estèphe: designation "Grand Cru Classe" (active) resolves to 0 live rows
error: #4 A typical Pessac-Léognan red: map place "france.nowhere" resolves to 0 live rows
<tmp>/archetypes-broken.json: 6 errors
exit 1
```

- [ ] **Step 11: Write the generator.** Create `scripts/training/gen-archetype-batch-migration.mjs`:

```js
// Turns a training-room archetype batch file into its data migration (spec
// D21, §4.7). Fail-closed: it runs validate-archetype-batch.mjs's full check
// first (read-only, against live) and writes nothing unless that passes.
//
//   node --env-file=.env.local scripts/training/gen-archetype-batch-migration.mjs \
//     data/training/archetypes-batch-1.json \
//     supabase/migrations/20260925130000_archetypes_batch_1.sql
//
// Re-run it whenever the JSON changes (the file may still gain entries); the
// migration's counts and asserts are computed from the JSON each time.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { batchMigrationSql } from "./archetype-batch.mjs";
import { report, validateBatchFile } from "./validate-archetype-batch.mjs";

export async function generate(jsonPath, outPath, generatedOn = new Date().toISOString().slice(0, 10)) {
  const result = await validateBatchFile(jsonPath);
  report(result, jsonPath);
  if (result.errors.length > 0) {
    throw new Error(`${jsonPath} does not validate; no migration written`);
  }
  const sql = batchMigrationSql(result.batch, { file: jsonPath, generatedOn });
  writeFileSync(outPath, sql);
  return sql;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [jsonPath, outPath] = process.argv.slice(2);
  if (!jsonPath || !outPath) {
    console.error("usage: gen-archetype-batch-migration.mjs <batch.json> <out.sql>");
    process.exit(2);
  }
  try {
    const sql = await generate(jsonPath, outPath);
    console.log(`wrote ${outPath} (${sql.split("\n").length} lines)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 12: Generate the batch-1 migration**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local scripts/training/gen-archetype-batch-migration.mjs data/training/archetypes-batch-1.json supabase/migrations/20260925130000_archetypes_batch_1.sql; echo "exit $?"`
Expected, with today's file:
```
data/training/archetypes-batch-1.json: 87 archetypes resolve (0 warnings)
wrote supabase/migrations/20260925130000_archetypes_batch_1.sql (1199 lines)
exit 0
```
and `head -8 supabase/migrations/20260925130000_archetypes_batch_1.sql` shows:
```
-- Training room: typical wines, batch 1 (spec
-- docs/superpowers/specs/2026-09-25-training-room-design.md §4.7, D21).
-- GENERATED from data/training/archetypes-batch-1.json by scripts/training/gen-archetype-batch-migration.mjs
-- on 2026-09-25. Edit the JSON and regenerate; never edit this file by hand.
--
-- 87 archetypes, 881 aroma links (133 signature),
-- 34 designation links, 69 map placements.
-- Every country, region, appellation, grape, designation, aroma term and map
```
(The date is the day you run it. A JSON that has gained entries changes the counts; the asserts inside follow the JSON.) The generator refuses a file that does not validate. For example, `node --env-file=.env.local scripts/training/gen-archetype-batch-migration.mjs "$BROKEN" /tmp/x.sql; echo "exit $?"` prints the six errors, then `... does not validate; no migration written`, then `exit 1`, and writes no file.

**Whenever `data/training/archetypes-batch-1.json` changes** (the pairs are still being split into separate archetypes), re-run this step and commit the regenerated file with the JSON.

- [ ] **Step 13: Check the generated SQL's own lookups against live (read-only)**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local --input-type=module -e "$(cat <<'EOF'
// Read-only: the generated migration's own resolution queries, run against live.
import { readFileSync } from "node:fs";
import pg from "pg";
import { pgConfig } from "./scripts/wine-map-tiles/lib.mjs";
const sql = readFileSync("supabase/migrations/20260925130000_archetypes_batch_1.sql", "utf8").replace(/\r/g, "");
const values = (start) => {
  const i = sql.indexOf(start) + start.length;
  return sql.slice(i, sql.indexOf(";\n", i));
};
const resolved = sql.slice(
  sql.indexOf("select b.ord, b.name,"),
  sql.indexOf("  from _batch_archetypes b;") + "  from _batch_archetypes b".length,
);
const checks = {
  archetypes: `with _batch_archetypes (ord, name, country, region, appellation, place_key, colour, style,
      primary_grape, secondary_grape, typical_age_low, typical_age_high, quality_low, quality_high, sat, description)
    as (values ${values("insert into _batch_archetypes values\n")}),
    r as (${resolved})
    select count(*) filter (where cardinality(country_ids) = 1 and cardinality(region_ids) = 1
        and cardinality(appellation_ids) = 1 and cardinality(primary_grape_ids) = 1
        and cardinality(secondary_grape_ids) = 1 and cardinality(place_ids) = 1)::int as ok,
      count(*)::int as total from r`,
  aromas: `with a (name, kind, group_name, term, signature) as (values ${values("insert into _batch_aromas values\n")})
    select count(*) filter (where (select count(*) from wset_aroma_terms t
                                    where t.group_name = a.group_name and t.term = a.term) = 1)::int as ok,
      count(*)::int as total from a`,
  designations: `with d (name, designation) as (values ${values("insert into _batch_designations values\n")})
    select count(*) filter (where (select count(*) from type_designations td
                                    where td.name = d.designation and td.is_active) = 1)::int as ok,
      count(*)::int as total from d`,
};
const c = new pg.Client(pgConfig());
await c.connect();
await c.query("begin read only");
try {
  for (const [what, q] of Object.entries(checks)) console.log(what, (await c.query(q)).rows[0]);
} finally {
  await c.query("rollback");
  await c.end();
}
EOF
)"
```
Expected, with today's file:
```
archetypes { ok: 87, total: 87 }
aromas { ok: 881, total: 881 }
designations { ok: 34, total: 34 }
```
(`ok` must equal `total` on every line.)

- [ ] **Step 14: `wine_place_id` becomes nullable in the types.** In `src/lib/supabase/database.types.ts`, replace the lines Task 1 wrote:
```ts
          // Nullable in the database since 20260925120000 (training-room spec
          // D9). Typed `string` until Task 13 of the training-room plan, once
          // Tasks 6, 9 and 12 made every reader tolerate null; no live row is
          // null before batch 1 (20260925130000).
          wine_place_id: string;
```
with
```ts
          // Nullable since 20260925120000 (training-room spec D9): batch 1
          // (20260925130000) adds archetypes the map has no place for.
          wine_place_id: string | null;
```
Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx tsc --noEmit`
Expected: exits 0 with no output. Tasks 6, 9 and 12 already guard the place. An error here names a reader that still assumes a place; guard it the same way (`a.wine_place_id ? … : …`, or filter nulls before `.in(...)`).

- [ ] **Step 15: Add the batch test to the DB suite.** Append this test to the end of `scripts/training-room.test.mjs`, after the back-fill test and one blank line:

```js
test("the batch-1 migration lands every archetype with its links, and a second apply is a no-op", async (t) => {
  const file = "supabase/migrations/20260925130000_archetypes_batch_1.sql";
  await withRollback(async () => {
    await asOwner();
    const ready = (await client.query("select to_regclass('public.wine_archetype_designations') is not null as ok")).rows[0]
      .ok;
    if (!ready) {
      t.skip("20260925120000 is neither live nor in TRAINING_ROOM_APPLY");
      return;
    }
    const sql = readFileSync(file, "utf8");
    if (!APPLY.some((f) => f.endsWith("20260925130000_archetypes_batch_1.sql"))) await client.query(sql);
    const batch = JSON.parse(readFileSync("data/training/archetypes-batch-1.json", "utf8"));
    const names = batch.archetypes.map((a) => a.name);
    const totals = async () =>
      (
        await client.query(
          `select (select count(*)::int from wine_archetypes) archetypes,
                  (select count(*)::int from wine_archetype_aromas) aromas,
                  (select count(*)::int from wine_archetype_designations) designations,
                  (select count(*)::int from wine_archetype_placements) placements`,
        )
      ).rows[0];
    const first = await totals();
    await client.query(sql);
    assert.deepEqual(await totals(), first, "a second apply changes nothing");

    const once = (
      await client.query("select name, count(*)::int n from wine_archetypes where name = any($1::text[]) group by name", [
        names,
      ])
    ).rows;
    assert.equal(once.length, names.length);
    assert.ok(once.every((x) => x.n === 1));

    const pauillac = (
      await client.query(
        `select c.name country, r.name region, ap.name appellation, g.name grape, wp.canonical_key place,
                (select array_agg(t.term order by t.term) from wine_archetype_aromas l
                   join wset_aroma_terms t on t.id = l.term_id
                  where l.archetype_id = a.id and l.signature and l.kind = 'NOSE') signatures,
                (select array_agg(td.name) from wine_archetype_designations d
                   join type_designations td on td.id = d.type_designation_id where d.archetype_id = a.id) designations,
                (select count(*)::int from wine_archetype_placements p where p.archetype_id = a.id) placements,
                a.typical_age_low, a.typical_age_high, a.sat -> 'tannin' tannin
           from wine_archetypes a
           join countries c on c.id = a.country_id
           join regions r on r.id = a.region_id
           join appellations ap on ap.id = a.appellation_id
           join grapes g on g.id = a.primary_grape_id
           left join wine_places wp on wp.id = a.wine_place_id
          where a.name = 'A typical Pauillac'`,
      )
    ).rows[0];
    assert.deepEqual(pauillac, {
      country: "France",
      region: "Bordeaux",
      appellation: "Pauillac AOC",
      grape: "Cabernet Sauvignon",
      place: "france.bordeaux.haut-medoc.pauillac",
      signatures: ["blackcurrant", "cedar"],
      designations: ["Grand Cru Classé"],
      placements: 1,
      typical_age_low: 8,
      typical_age_high: 30,
      tannin: ["MEDIUM_PLUS", "HIGH"],
    });
    const napa = (
      await client.query(
        `select a.wine_place_id, (select count(*)::int from wine_archetype_placements p where p.archetype_id = a.id) placements
           from wine_archetypes a where a.name = 'A typical Napa Cabernet Sauvignon'`,
      )
    ).rows[0];
    assert.deepEqual(napa, { wine_place_id: null, placements: 0 }, "an archetype without a map place stays off the map");
    const prosecco = (await client.query("select sat -> 'mousse' mousse from wine_archetypes where name = 'A typical Prosecco'"))
      .rows[0];
    assert.deepEqual(prosecco, { mousse: ["CREAMY", "AGGRESSIVE"] });
  });
});
```

- [ ] **Step 16: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/archetype-ladders.test.ts && node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs && npx tsc --noEmit && npx eslint scripts/training/archetype-ladders.mjs scripts/training/archetype-batch.mjs scripts/training/archetype-batch.test.mjs scripts/training/validate-archetype-batch.mjs scripts/training/gen-archetype-batch-migration.mjs src/lib/training/archetype-ladders.test.ts scripts/training-room.test.mjs src/lib/supabase/database.types.ts && node --check scripts/training-room.test.mjs`
Expected: vitest `Tests 3 passed (3)`; node `# pass 7`, `# fail 0`; `tsc` exits 0; eslint prints nothing; `node --check` prints nothing.

- [ ] **Step 17 (main session only): Dry-run both migrations and the DB suite, rolled back**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && TRAINING_ROOM_APPLY=supabase/migrations/20260925120000_training_room.sql,supabase/migrations/20260925130000_archetypes_batch_1.sql node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/training-room.test.mjs`
Expected: `# tests 17`, `# pass 17`, `# fail 0`. The new test re-applies the batch in the same transaction and checks that nothing changes. It also checks that every batch name is present once, that Pauillac's identity, signatures, designation, placement, typical age and tannin match the JSON, that Napa has no place and no placement, and that Prosecco's mousse range was folded into `sat`. (Once 20260925120000 is live, `TRAINING_ROOM_APPLY` needs only the batch file.) Once 20260925120000 is live, the applier's own dry run is `node --env-file=.env.local <scratchpad>/apply-migration.mjs supabase/migrations/20260925130000_archetypes_batch_1.sql --dry`, and it should print `DRY RUN OK: 20260925130000_archetypes_batch_1 ran in <n> ms and was rolled back`.

- [ ] **Step 18: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add scripts/training/archetype-ladders.mjs scripts/training/archetype-batch.mjs scripts/training/archetype-batch.test.mjs scripts/training/validate-archetype-batch.mjs scripts/training/gen-archetype-batch-migration.mjs src/lib/training/archetype-ladders.test.ts supabase/migrations/20260925130000_archetypes_batch_1.sql scripts/training-room.test.mjs src/lib/supabase/database.types.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): archetype batch validator, generator and the batch-1 migration" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: CLAUDE.md bullet and the copy cross-check

**Files:**
- Modify: `CLAUDE.md` (insert one bullet directly before the line
  `- Tasting lifecycle: a new tasting is created \`DRAFT\` ("not started"), NOT`, i.e. after
  the "First-run tour" bullet, around line 953)

**Interfaces:**
- Consumes: every earlier task's final file names (the bullet names them).
- Produces: nothing code depends on.

- [ ] **Step 1: Cross-check every spec §9 string against copy.ts**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node <<'EOF'
const fs = require("fs");
const copy = fs.readFileSync("src/lib/training/copy.ts", "utf8");
const matrix = fs.readFileSync("src/components/add-wine/matrix.ts", "utf8");
const inCopy = [
  "Training room · Preview", "Taste blind. Then find out.",
  "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
  "typical wines so far — ", " and more", "More each week.",
  "No typical wines yet — the room opens once the first batch lands.",
  "Start a session", "Continue your session · started ", "Discard", "Tap again to discard",
  "Unknown wine · started ", "Your call →", "What it could be", "Start describing the wine",
  "Top match: ", "more close", "Nothing fits yet — check colour and bubbles",
  "Unlikely from what you've said", "higher than typical", "lower than typical",
  "Colour darker than typical", "Colour lighter than typical", "isn't typical", "— a signature",
  "Fits what you've said so far", "Looks like a ", " wine, not a ", "Bubbles noted", "No bubbles noted",
  "Fortified", "Not fortified", "Show all ", "Your call", "Which wine is it?", "Something else…",
  "It's not in the list", "Vintage (optional)", "Reveal the bottle", "I can't find out",
  "It was ", "You said ", "You didn't pick a wine", "Your colour call (", ") didn't fit — it was a ",
  "Where your note pointed", "Its style was your #", "You had ruled its style out (",
  "This style isn't in the pool yet", "Not revealed — your note is kept. Reveal now from Your sessions.",
  "Another glass", "See the note", "Done", "Country", "Region", "Appellation", "Grape", "Second grape",
  "Designation", "Vintage", "✓", "✗", "—", "Your sessions", " right on the grape · ", " on the appellation",
  "Not revealed", "Reveal now", "Show more", "No sessions yet", "Training", "Training room · not revealed",
  "a wine you can't see yet", "A typical ",
];
const inMatrix = ["Reveal the bottle", "Which bottle was it?", "This is it", "↵ reveals the first hit"];
const missing = [
  ...inCopy.filter((s) => !copy.includes(s)).map((s) => `copy.ts: ${JSON.stringify(s)}`),
  ...inMatrix.filter((s) => !matrix.includes(s)).map((s) => `matrix.ts: ${JSON.stringify(s)}`),
];
if (missing.length) {
  console.error("Missing spec §9 strings:\n" + missing.join("\n"));
  process.exit(1);
}
console.log(`All ${inCopy.length + inMatrix.length} spec §9 strings found`);
EOF
```
Expected: `All 78 spec §9 strings found`. A `Missing` line names a string that drifted from
spec §9 — fix it in `copy.ts` (Task 2) or `matrix.ts` (Task 7) with the §9 wording, rerun
`npx vitest run src/lib/training src/components/add-wine`, then rerun this check.

- [ ] **Step 2: Check no room component hard-codes a §9 string**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && grep -rn "Your call →\|What it could be\|Reveal the bottle\|I can't find out\|Another glass\|Your sessions\|Training room · not revealed\|Start a session" src/app src/components --include=*.tsx`
Expected: no output (every one of them is read from `TRAINING_COPY` or the matrix).

- [ ] **Step 3: Insert the CLAUDE.md bullet**

Insert this bullet immediately before the line that begins
`- Tasting lifecycle: a new tasting is created` (keep the blank-free list formatting of the
neighbouring bullets):

```markdown
- **Training room** (2026-09-25, spec
  `docs/superpowers/specs/2026-09-25-training-room-design.md`, plan
  `docs/superpowers/plans/2026-09-25-training-room.md`, migrations
  `20260925120000_training_room.sql` and `20260925130000_archetypes_batch_1.sql`;
  DB suite `scripts/training-room.test.mjs`). `/taste/training` is a solo blind
  practice room, live for everyone behind a **Preview** pill (`NavChild.preview`
  read through `navChildState` in the sidebar, the phone drawer and the `/taste`
  start menu; no role gate, no flag). The page (`page.tsx`) reads the pool, the
  aroma lexicon, the first history page and the tally as the viewer
  (`src/lib/training/pool.ts`: server-only, `cache()`d, paged past PostgREST's
  1000-row cap, every rule in the pure `pool-shape.ts`) and hands them to one
  client component, `training-room.tsx`, with three states: landing, session,
  result. The session is the WSET sheet in unknown-wine mode (`WsetSheet` with
  `onChange`, `footerAction`, `belowBar`, `aside={null}`, `onClose`, `bubbles`,
  `fortified`) beside a ranked list of typical wines (`wine_archetypes`) that
  re-orders on every answer: the laptop column (`candidates-panel.tsx`, lg+), a
  44 px strip in the sheet's sticky bar and a bottom sheet below lg. Matching is
  pure and on the device (`src/lib/training/match.ts`): ranking, never
  filtering; soft ranges on the full enum ladders (`ALCOHOL_STOPS` for an
  unfortified alcohol, `HUES_BY_COLOUR[colour]` for hue); a scale the archetype
  lacks, or an off-ladder range bound, leaves numerator AND denominator; a
  signature aroma hit is a pure bonus (max two, closeness capped at 100); a
  contradicted colour, bubbles or fortification caps a candidate at 15 % under
  "Unlikely from what you've said", and an unanswered (`null`) fact never caps.
  The unfinished session is a device draft only (`src/lib/training/draft.ts`,
  key `blindr-training-draft:<userId>`, written on every change): nothing
  reaches the server before the reveal, ✕ keeps the draft, and a finish or
  Discard in another tab returns this one to the landing (`storage` event). The
  reveal is the add-wine sheet's `{ kind: "note", reveal: true }` with
  `onNotePick`: the pick comes back to the room, never opens `NewNoteModal`,
  never draws down a cellar lot, and a stale pick from an earlier open is
  ignored. One RPC writes the result: `record_training_attempt` (SECURITY
  DEFINER; EXECUTE `authenticated` only, revoked from PUBLIC, `anon` and
  `service_role`) saves the note through `save_wset_note` — inside a definer RLS
  is bypassed, so the RPC itself forces `context_kind = 'TRAINING'`, the
  identity fields and the author — drops a hue that does not fit the revealed
  wine (`hue_cleared`, kept on the attempt for the result's hue line), scores
  with the championship values (a DB test pins them to `reveal_wine`'s), and is
  idempotent on the device-minted `session_key`. Reveal now re-runs it with
  `attempt_id` and the wine only. The actions (`src/app/taste/training/actions.ts`)
  check every input again (`src/lib/training/attempt-payload.ts`); their types
  live in the plain `action-types.ts`. `training_attempts` is author-only SELECT
  with no client write grant; history reads follow `catalog_wines.merged_into`
  (`merge_catalog_wines` is deliberately not recreated), 20 rows a page on a
  `(created_at, id)` cursor, and a wine the viewer cannot read shows as "a wine
  you can't see yet". An identity-less TRAINING note is admitted by the
  `wset_notes_one_identity` TRAINING branch (author-only by the existing read
  policy) and shows in `/taste/notes` as "Training room · not revealed",
  linking back to the room; a revealed one is a normal public note with a
  "Training" badge (`your-notes.tsx`, the archive chip, the note modal's
  title). Deleting a revealed training note deletes its attempt (cascade).
  `/admin/archetypes` edits the scoring identity (country → region →
  appellation with "Just the region"), designations, typical age, signature
  aromas, an optional map place and mousse on sparkling; its ladders and checks
  are pure in `src/app/admin/archetypes/profile-rules.ts`, whose test pins them
  to the matcher's `ladderFor`. New archetypes arrive only as data migrations
  generated from a reviewed JSON batch (`data/training/archetypes-batch-*.json`
  → `scripts/training/gen-archetype-batch-migration.mjs`, checked read-only by
  `validate-archetype-batch.mjs`, fail-closed on any name that does not resolve
  to exactly one live row) — never through the Anthropic API (AGENTS.md). All
  room copy lives in `src/lib/training/copy.ts` (English only, D20); never
  hard-code a room string in a component.
```

- [ ] **Step 4: Check the insertion landed once, in place**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && grep -n "^- \*\*Training room\*\*\|^- \*\*First-run tour\*\*\|^- Tasting lifecycle: a new tasting" CLAUDE.md`
Expected: three lines, in the order First-run tour, Training room, Tasting lifecycle, and
exactly one `Training room` line.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "docs(training): the training room in CLAUDE.md" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
