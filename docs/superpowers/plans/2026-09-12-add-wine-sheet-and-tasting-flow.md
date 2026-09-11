# Add-wine sheet + tasting create/play flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the flows handoff — one universal add-wine sheet (camera first, four destinations), a three-step create-tasting sheet with mode as a control, and the guess ladder / pickers / locked-in / reveal / host console that replace the eight-combobox guess form.

**Architecture:** Contracts first (`src/components/add-wine/types.ts`, the widened `CreateTastingFormState`, the new `lockGuess`/`unlockGuess` actions), then the sheet views, the create sheet and the play surfaces are built in parallel against them and wired together by an integration pass. Scoring stays in Postgres; readiness keys off the new `guesses.locked_at`; every participant-facing read goes through the existing spoiler-safe RPCs.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, base-ui primitives, Supabase (RLS + SECURITY DEFINER RPCs), FastCork label reads via the existing `identifyWineFromLabel`, `getUserMedia` for the live camera, vitest for pure maths.

**Spec:** `docs/superpowers/specs/2026-09-12-add-wine-sheet-and-tasting-flow-design.md` (contracts, decisions, per-screen rules). Code maps: `.superpowers/map-{addWine,create,play,host,primitives}.md`.

## Global Constraints

- `npx tsc --noEmit` exit 0, `npx eslint <changed files>` clean, `npx vitest run` green after every task; `npm run build` before the final push.
- Tokens, never hex (allowed exceptions: the camera ground `#15100D`, the two hover colours `#4A1523`/`#FFFFFF`, gradient strings). New tokens: `--miss`, `--console`, `--console-card`, `--console-ink`; `scanline` keyframes.
- Keep every FormData contract listed in the maps (`submitGuess` fields, `createTasting` fields, `inviteToTasting` `emails`); keep `respondToInvite`'s `(formData) => void` shape.
- All guess/sheet inputs are controlled React state (pages poll with `router.refresh()`).
- Combobox/picker focus: synchronous `.focus()` inside the tap; kept-mounted inputs; cmdk `CommandInput`.
- One FastCork credit per shutter; no other external calls in the scan path.
- No new migrations beyond `20260911100000` (already applied live).
- Commit at the end of each phase; push to master at the end.

---

### Task A: Foundation — contracts, actions, provider, sheet shell, tokens
- Files: `src/components/add-wine/{types,actions,use-camera,add-wine-sheet,destination-footer}.ts(x)` + stub views, `src/components/add-wine-context.tsx`, `src/app/tastings/[id]/wines/new/actions.ts` (export `insertTastingWineFromCatalogRow`, add `insertTastingWineFromIdentity`, OPEN `is_revealed` fix), `src/app/globals.css` (tokens + `scanline`).
- Produces: everything in the spec's "Contracts" and "Server actions" sections; `useAddWine().openAddWineSheet(destination, options)`; stub view components with final props.

### Task B1–B4: Sheet views (parallel)
- B1 `camera-view.tsx`, `scan-confirm.tsx`, `multi-add-stack.tsx` (7b/7c/7d/7i).
- B2 `search-view.tsx`, `cellar-view.tsx` (7e/7f).
- B3 `by-hand-form.tsx` (7g).
- B4 `desktop-view.tsx` (7h).

### Task INT: Integration
- Wire views into `add-wine-sheet.tsx`; delete the four modals + bulk flow; `wine-form.tsx` / `rate-wine-modal.tsx` / `scan-button.tsx` / `tasting-scan-registrar.tsx` call the sheet; `tastings/[id]/page.tsx` Wines card (7a) + `AddToFlightButton` + registrar always + "Open the host console" card; Overview banner registers the flight hint.

### Task C: Create flow
- `new-tasting-sheet.tsx`, rewritten `new-tasting-form.tsx`, `flight-step.tsx`, `invite-step.tsx`, `tastings/new/actions.ts` (`createTasting` returns `{id}`, `updateTastingSetup`, `getJoinLink`), `tastings/[id]/actions.ts` (`removeWine`), `taste-launcher-context.tsx`, `tastings/new/page.tsx`, `app/j/[code]/page.tsx`, login `next` support; delete `new-tasting-modal.tsx`.

### Task D1a: Play — actions, maths, ladder, picker
- `play/actions.ts` (`lockGuess`, `unlockGuess`; `submitGuess` stops scoring), `lib/guess-ladder-math.ts` (+test), `lib/grape-shortlist.ts`, `play/guess-ladder.tsx`, `play/field-picker.tsx`.

### Task D1b: Play — locked-in, reveal, semi-blind, composition
- `play/locked-in.tsx`, `play/reveal-view.tsx`, `play/match-ladder.tsx`, `play/play-experience.tsx` rewrite; delete `guess-form.tsx`, `match-guess-form.tsx`, `progressive-wine-reveal.tsx`.

### Task D2: Host console
- `tastings/[id]/host/page.tsx`, `host/console.tsx`.

### Task R: Review → verify → fix → check (workflow stages), then browser verification, CLAUDE.md notes, commit, push.
