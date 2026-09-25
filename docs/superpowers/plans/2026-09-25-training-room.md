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
