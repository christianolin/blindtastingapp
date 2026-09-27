# Archetype Editor Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/archetypes` opens a typical wine's profile in the Taste & Rate note's own popup and sheet — tabs Wine · I Appearance · II Nose · III Palate · IV Conclusions, one section on screen at a time, every range edited on the note's own sliders — while the Library, the map, the training room and the note form draw exactly what they draw today.

**Architecture:** WsetSheet's frame (sticky bar, section tabs, section state, footer step, Save, discard confirm) moves verbatim into `src/components/wset/sheet-shell.tsx`, which WsetSheet and the new editor both compose. `SnapSlider` and `QualitySlider` gain an editable range mode driven by the pure `src/lib/wset/range-edit.ts`; `ArchetypeSheet` gains an `edit` prop that turns its four WSET sections into those sliders plus the note's `AromaPicker` with a ★ per chosen term. The editor's working copy and every rule a change carries live in the pure `src/app/admin/archetypes/profile-draft.ts`; `updateArchetype` and `validateProfile` stay the save path (plus the archetype's two grape columns). Before anything moves, a byte-for-byte markup snapshot (react-dom/server in vitest) pins every existing surface of the sheet family.

**Tech Stack:** Next.js 16 (App Router), React 19.2, TypeScript, Tailwind v4 tokens, `@base-ui/react` Dialog (shadcn wrappers), Supabase (no schema change), vitest 3 (node environment; `react-dom/server` for markup tests).

**Spec:** this design, see the plan's Design section.

**Base:** code on the `training-room` branch at c683851 or later. Branch off `master` only once `training-room` has merged into it; until then branch off `training-room`. Task 1 Step 1 checks this.

**Prototype:** every file in this plan was built and verified in a scratch copy of `training-room` at c683851 before the plan was written: the six markup snapshots stayed byte-identical through Tasks 2–4, all new tests pass, `npx tsc --noEmit` and `npx eslint` are clean. The browser checklist (Task 6) has not been run.

> **Controller note (2026-09-27, binding):** the training room is merged and live — this branch starts from master at 2cd2d53, which contains c683851 PLUS a later fix round that the plan was not written against: `src/components/wset/wset-sheet.tsx` gained an optional `titleRef` prop (the room focuses the sheet title on every view switch), and `src/app/admin/archetypes/archetype-editor.tsx` gained 44 px touch classes, `text-base md:text-sm` fields, `triggerClassName` on its comboboxes and an `aria-labelledby` on the map search (`useId`). Where a step quotes the older text of those files, apply the step's intent on top of the current text and keep `titleRef` working (the shell must render the title with the same ref/tabIndex behaviour when `titleRef` is passed). Task 1's snapshots are taken at the current HEAD, so they already include these changes. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Global Constraints

- **Base:** the working tree contains c683851 (`git merge-base --is-ancestor c683851 HEAD`).
- **Tokens only:** colours are CSS variables (`var(--primary)`, `var(--gold)`, `var(--card)`, `var(--border-strong)`, …) or token classes (`bg-card`, `text-muted-foreground`, `border-border`, `text-destructive`, …). No new hex or rgb literals; code moved verbatim keeps its existing shadow `rgba(42,33,30,…)` values.
- **Touch targets:** every new tappable control is at least 44 px on touch — `min-h-11` (and `min-w-11` for icon buttons) with `md:pointer-fine:min-h-0` / `md:pointer-fine:min-w-0` for a laptop pointer. One documented exception: a range row's "clear" uses a `::before` 44 px strip (Design D8).
- **base-ui:** no `asChild`. A `Button` composed with `render={<Link/>}` needs `nativeButton={false}`; a `Button` passed as another component's `render` target must not have it. This plan adds no such composition: new controls are plain `<button>`s, and the Dialog is `DialogContent showCloseButton={false}`.
- **Every form value is React state:** controlled inputs only; the editor's working copy is one `useReducer`; `MapPlaceField`'s query and hits are state.
- **`"use server"` files export only async functions:** `actions.ts` gains no export. Shared types live in plain modules (`profile-rules.ts`, `profile-draft.ts`, `editor-copy.ts`).
- **Tests:** pure logic in plain modules with relative runtime imports, tested with vitest; components through `react-dom/server` markup tests (no jsdom), `npx tsc --noEmit`, `npx eslint` and the Task 6 browser checklist.
- **No database writes, no migrations, no Anthropic API calls** (AGENTS.md).
- **Read-only surfaces unchanged:** `npx vitest run src/components/wset/sheet-markup.test.tsx` passes, unchanged, at the end of every task. Never pass `-u` to it after Task 1.
- **Copy:** WSET section/row names, Close, the section step, "clear", "Varies" and the quality words come from `src/lib/wset/i18n.ts` (EN/DA, as in the note form); the Wine tab and the save/discard lines are English (admin), in `editor-copy.ts`. No i18n key is added.
- **Curator gating unchanged:** `page.tsx`'s `requireContributor()`, `actions.ts`'s `ensureContributor()`, the tables' RLS.
- **Commits:** identity and trailer exactly as in this command (subject per task):

```bash
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Review Focus

1. **A saved range whose bound is off the edit ladder** (a batch row, or a colour or style changed elsewhere, e.g. alcohol `["MEDIUM_PLUS","HIGH"]` on a still wine): the row shows its words and a "clear", draws no band, the first tap seeds a fresh band, and Save names the scale. Pinned in Task 4 ("a saved range with a bound off the edit ladder…").
2. **Five tabs on a 360 px phone:** every name fits its column ("Appearance" is the widest), while the note sheet's four-tab strip keeps its exact markup. Pinned in Task 2 (`sheet-shell.test.tsx`, "five tabs…") and Task 1's snapshots; eyeballed in Task 6.
3. **A save that fails** (validation, or the server action throwing): the message shows on phones too — a full-width footer line, not the desktop-only progress block — Save reads "Retry save", the sheet stays open and dirty, and the next edit clears the message. Pinned in Task 2 ("puts a notice on its own full-width line…"); walked in Task 6.
4. **Aromas chosen before a colour change that the picker now hides** (blackcurrant on a wine switched to white): they stay chosen, visible and removable, with their ★. Pinned in Task 4 ("keeps an aroma the picker now hides…").
5. **Round trips that are not changes:** clearing a range and setting it back is not "dirty" (no discard prompt); picking the region it already has keeps the appellation (the old editor wiped it). Pinned in Task 5 (`isDirty` and `applyDraft` tests).

---

## Design

**Owner request (2026-09-26):** "Could also be nice to improve the admin page. Right now the way you edit typical wines is very different layout-wise. Might as well re-use the one we already use for taste and rate."

**D1 — The modal shell.** `/admin/archetypes` keeps its list (`PlacementEditor`: each archetype's name, "Shown on" places, add/remove place). "Edit profile" opens `ArchetypeEditor` in a base-ui `Dialog` whose `DialogContent` takes `SHEET_DIALOG_CLASS` — the exact class string `NewNoteModal` uses today, moved into `sheet-shell.tsx` and imported by both — with `showCloseButton={false}` and an sr-only `DialogTitle`. Phones: full screen. Laptop: the 92vh dialog, up to 1400 px wide. One editor open at a time; a save's `router.refresh()` keeps it open (it is keyed by archetype id and holds its own state).

**D2 — Shell sharing: extracted, not copied.** `sheet-shell.tsx` exports, moved verbatim out of `wset-sheet.tsx`: `PRIMARY_BUTTON`, `SHEET_DIALOG_CLASS`, `useSheetSteps` (the one-section-at-a-time state, `goTo` with the dialog-scroll reset / page scroll-into-view, and the footer step from the pure `footerStep` in `src/lib/wset/sheet-steps.ts`), `SheetFrame` (the `.wset-sheet` root), `SheetBar` (the sticky bar), `SheetHeaderRow` (✕ · eyebrow + title + phone progress · EN/DA · Close · a `trailing` slot for the note's ⋯ menu), `SheetTabs`, `SheetBody` (the scroll column and the note page's optional lg+ column), `SheetFooter` (+ an optional full-width `notice`), `SheetFooterProgress`, `SheetStepButton`, `SheetSaveButton` and `DiscardConfirm`. WsetSheet composes them; its sections, its ⋯ menu and delete confirm, and the training room's footer-action button stay in `wset-sheet.tsx`. Extraction over a thin wrapper: the pieces are self-contained JSX whose only shared state is the section state, which moves whole into `useSheetSteps`; a wrapper would have to copy about 300 lines of bar, tab, footer and dialog markup, and two copies drift. The risk to the note form is controlled by Task 1: three WsetSheet variants (note page, Taste & Rate modal, training room) are pinned byte for byte before the move and must not change.

**D3 — Tabs and their counts.** Wine, Appearance, Nose, Palate, Conclusion (the four WSET names from i18n, `conclusion_short` for the last; "Wine" is English). Each tab shows `done/total`, ✓ once complete — the note sheet's look. Wine counts what a save needs: name, country, region, appellation, primary grape (5). Appearance: ranges set of intensity and hue (2). Nose: intensity, development, plus one for "any nose aroma" (3). Palate: sweetness, acidity, tannin, alcohol, body, flavour intensity, finish, plus mousse on sparkling, plus one for "any palate aroma" (8, or 9). Conclusions: the quality range (1). A range the current style no longer edits is not counted. The phone tab grid has five columns and names 10 px below `sm` (11 px from `sm`), so "Appearance" fits a 360 px screen; the four-tab strip keeps its exact markup. The bar's phone progress and the footer's desktop count sum the tabs.

**D4 — The footer.** Desktop: the count, "of {total} set", and "A name, where it scores and a grape are required. Every range is optional." Then the step button — "Next: {section} →" ("{section} →" on phones) while a tab lies ahead, "← {section}" from the last, the note's i18n strings — and Save, at every tab as in the note sheet, so Save is on the last step and a curator who fixed one range can save at once. Save states (English): "Save profile", "Saving…", "Saved ✓" (gold, 2.2 s), "Retry save". A validation or server error is a full-width footer line with `role="alert"`, at every width; the next edit clears it.

**D5 — Closing.** ✕ (phones), Close (laptop), Escape and the backdrop all call `requestClose`: an open discard confirm closes first; a dirty draft asks ("Discard your changes?" / "Your changes to this typical wine haven't been saved and will be lost." / Keep editing / Discard — English); a clean one closes. Dirty = the draft differs from what was last saved or opened, range keys compared in sorted order. After a save the baseline is the draft that was sent, so edits made while the save was on its way still count as unsaved.

**D6 — The Wine tab** (the editor's own `SectionCard`, a wine-glass icon in the numeral square, "where it scores" on the right; English labels, the old editor's wording): Name; Colour and Style as `PillGroup` pills (a second tap on the chosen pill does nothing); Country → Region (`ReferenceCombobox`) → Appellation (region-scoped `SearchableCombobox` with "Just the region · …" first, the old editor's cached per-region list); Primary grape and Second grape (`ReferenceCombobox` over the grapes `loadByHandReferences` already reads; the second is clearable and optional — D11); Designations (chips + `TypeDesignationField` to add); Typical age (from/to number inputs, years from vintage — typical age lives here, not in Conclusions); Map place (optional: a chip and a debounced search where only the newest search lands); Description (textarea). A colour change drops a hue range whose low bound is not a hue of the new colour (the old `changeColour`, now `satForColour`); a style change runs `satForStyle`. A new country drops a region of another country and its appellation; a new region drops the appellation; the region it already has keeps it.

**D7 — The four WSET tabs are `ArchetypeSheet` with `edit`.** The same `SectionCard`s (numerals I–IV, "typical" on the right), the same rows in the same order, the same i18n labels (EN/DA follow the bar's toggle), one card visible and the others mounted with `hidden`. Appearance: intensity (the full five-stop ladder), colour (`HUES_BY_COLOUR[colour]`). Nose: intensity, development, aroma characteristics. Palate: sweetness (seven stops), acidity, tannin, mousse (SPARKLING only), alcohol (`ALCOHOL_STOPS` unfortified, `FORTIFIED_ALCOHOL_STOPS` fortified), body, flavour intensity, flavour characteristics, finish. Conclusions: the quality range. The ladders are exactly `profile-rules.ts`'s `scalesFor` (`editorLadders`), which its test already pins to the matcher's `ladderFor`, so the editor offers what `validateProfile` accepts and the room reads. Edit mode draws no header (the bar has the name) and no "In a nutshell" (the Wine tab has the description). With no `edit` the component renders byte for byte as before.

**D8 — A range row.** Title; the band as words in the value slot ("Acidity · medium(+) → high"); "clear" at the far end of the title line (i18n `clear`); the slider, per-stop labels on `sm`+. Unset: "Varies" under the title (the read-only word) and the faded track the note uses for an unrated scale. The rule (`range-edit.ts`, the old `EditableRange`'s): a tap outside the band extends the nearer end; a tap inside moves the nearer end in (a tie goes to the low end); a tap on an end changes nothing; with no band a tap seeds a one-stop band; a press that slides on moves the end it took, holding the other (crossing it swaps the ends). A saved bound off the ladder: words and "clear" show, no band is drawn, the first tap seeds fresh, and Save names the scale.
*Keyboard (decided):* every stop stays a focusable button, as in the note's single-value slider; Enter or Space on a stop is a tap on it; each stop reports `aria-pressed` (inside the band or not). No arrow-key model: the note's slider has none, and a second keyboard model on the same control family would diverge; Tab + Enter reaches every stop and follows the tap rule. "clear" is a real button, named "clear: {row}".
*Touch:* the slider keeps its 44 px hit layer. "clear" takes a `::before` 44 px strip (dropped on a laptop pointer) instead of `min-h-11`: a 44 px-tall button would grow the title line the moment a band appears and move the slider under the finger mid-edit.

**D9 — Quality** is `QualitySlider` in range mode: the same weighted 50–100 track, knee and ticks; a gold band between two gold caps; the score line reads "88–96" (a one-score range reads "90") with the band word of its top ("Outstanding"); the same tap/slide rule on whole scores; ticks are buttons with `aria-pressed`. Unset: "—" and the dashed ghost thumb. "clear" in the title line.

**D10 — Aromas** are the note's `AromaPicker` (origin tabs, clusters, the phone bottom sheet, "Copy from nose" on the palate) with a new optional `signature` prop: a ★ toggle before every chosen term in the phone summary and the desktop "Selected" strip; pressed = a signature. The row's sub line: "Signature terms — an exact hit earns a bonus" (the old editor's). The data stays `{ termId, signature }[]` per nose and palate; `withTermIds` keeps a term's signature across re-picks. Without `signature` the picker renders byte for byte as before.

**D11 — The data contract.** `updateArchetype`, `validateProfile`, `satForStyle`, `scalesFor`, `aromaRows`, `designationRows`, the columns and the delete-then-insert of links are unchanged — plus one addition the Wine tab needs: `primary_grape_id` and `secondary_grape_id`. Both columns exist (`primary_grape_id` NOT NULL, FK ON DELETE RESTRICT; `secondary_grape_id` nullable) and the "archetypes write" policy already admits curators to the whole row; the old editor simply never wrote them. `validateProfile` adds, right after the identity check: "Pick a primary grape.", `MALFORMED` for a second grape that is neither null nor an id, and "The second grape must differ from the primary grape.". The FK is the existence check. Nothing else reads the admin types.

**D12 — Unchanged elsewhere.** The Library (`/knowledge/archetypes/[id]`), the map's `ArchetypeModal`, the training room's `ArchetypeDetail` and every note sheet: no behaviour change, markup pinned by `sheet-markup.test.tsx` (six variants, captured before Task 2), plus a browser smoke check in Task 6. `EditableRange` (`range-input.tsx`) is deleted — the old editor was its only importer.

**Out of scope:** `section-nav.tsx`'s unused `SectionNav` component; how new archetypes arrive (still reviewed data migrations); placement editing (unchanged); any migration.

## File map

| File | Task | Responsibility |
| --- | --- | --- |
| `vitest.config.mts` | 1 | the `@/` alias, so markup tests can render components |
| `src/components/wset/sheet-markup.test.tsx` + `__snapshots__/markup/*.html` | 1 | byte-for-byte markup of the read-only archetype sheet and the note sheet |
| `src/lib/wset/sheet-steps.ts` (+ test) | 2 | the footer's one step |
| `src/components/wset/sheet-shell.tsx` (+ test) | 2 | the shared sheet frame (D2) |
| `src/components/wset/wset-sheet.tsx` | 2, 4 | composes the shell (2); `Row` gains `labelId`/`action`, `SectionCard.numeral` takes a node (4) |
| `src/components/new-note-modal.tsx` | 2 | imports `SHEET_DIALOG_CLASS` |
| `src/lib/wset/range-edit.ts` (+ test) | 3 | the band tap/slide rule |
| `src/components/wset/snap-slider.tsx` | 3 | editable range mode |
| `src/components/wset/quality-slider.tsx` | 3 | range mode |
| `src/components/wset/range-sliders.test.tsx` | 3 | both range modes' first paint |
| `src/components/wset/aroma-picker.tsx` | 4 | the optional ★ per chosen term |
| `src/components/wset/archetype-sheet.tsx` (+ `archetype-sheet-edit.test.tsx`) | 4 | the `edit` mode |
| `src/app/admin/archetypes/profile-rules.ts` (+ test) | 5 | grapes in the profile types, the references and `validateProfile` |
| `src/app/admin/archetypes/profile-draft.ts` (+ test) | 5 | the editor's working copy and its rules |
| `src/app/admin/archetypes/actions.ts`, `page.tsx` | 5 | write and read the grapes |
| `src/app/admin/archetypes/editor-copy.ts` | 6 | the editor's English copy |
| `src/app/admin/archetypes/map-place-field.tsx` | 6 | the map-place picker, moved out of the old editor |
| `src/app/admin/archetypes/wine-section.tsx` | 6 | the Wine tab |
| `src/app/admin/archetypes/archetype-editor.tsx` | 6 | rewritten: the modal editor |
| `src/app/admin/archetypes/placement-editor.tsx` | 6 | opens the modal |
| `src/components/wset/range-input.tsx` | 6 | deleted |
| `CLAUDE.md` | 6 | the training-room bullet's admin sentence |

---

### Task 1: Pin the sheet family's markup

The guard every later task runs. It captures what the read-only archetype sheet (Library, map, training room) and the note sheet (note page, Taste & Rate modal, training room) render today, before any of them changes. It is a characterization test: its first run writes the snapshots.

**Files:**
- Modify: `vitest.config.mts` (whole file)
- Create: `src/components/wset/sheet-markup.test.tsx`
- Create (generated): `src/components/wset/__snapshots__/markup/{archetype-red,archetype-sparkling-answers,archetype-fortified,wset-note-page,wset-note-modal,wset-training}.html`

**Interfaces:**
- Consumes: `ArchetypeSheet`, `ArchetypeView` (`archetype-sheet.tsx`), `WsetSheet` (`wset-sheet.tsx`), as they are at c683851.
- Produces: `npx vitest run src/components/wset/sheet-markup.test.tsx` — the unchanged-markup gate for Tasks 2–6; the `@/` alias in vitest, which Tasks 2–4's markup tests rely on.

- [ ] **Step 1: Check the base**

Run: `git merge-base --is-ancestor c683851 HEAD && echo base-ok`
Expected: `base-ok`. Anything else: stop — the branch lacks the training room (see **Base**).

- [ ] **Step 2: Give vitest the app's `@/` alias**

Replace `vitest.config.mts` with:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The app's `@/` alias (tsconfig paths), so a markup test can render a
    // component that imports through it (src/components/wset/*.test.tsx).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Pure logic, plus static markup through react-dom/server — no jsdom, so
    // this stays fast and dependency-light. Add an environment here if a
    // component ever needs a DOM.
    environment: "node",
    // .tsx too: the old glob matched only .test.ts, so a component test would
    // have been skipped silently rather than failing for want of a DOM.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 3: Write the markup test**

Create `src/components/wset/sheet-markup.test.tsx`:

```tsx
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AromaTerm, WsetNoteState } from "../../lib/wset/types";
import { ArchetypeSheet, type ArchetypeView } from "./archetype-sheet";
import { WsetSheet } from "./wset-sheet";

// The markup every existing surface of the WSET sheet family draws, pinned
// before the admin typical-wine editor started sharing these components
// (plan 2026-09-26-archetype-editor-sheet): the read-only archetype sheet
// (Library, map, training room) and the note sheet (note page, Taste & Rate
// modal, training room). Same markup, same CSS: same pixels. An intended
// change to one of these surfaces is committed with
// `npx vitest run src/components/wset/sheet-markup.test.tsx -u` and its diff
// read in review.
//
// renderToStaticMarkup runs in node (no DOM): what it pins is the first paint
// — every section is in it, the three not on screen carry `hidden`.

/** One tag per line, so a change reads as a diff. React's useId values
    (`_R_…_`) follow the component tree, not anything drawn, so they are masked. */
function markup(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/_R_[0-9a-z]+_/gi, "_R_id_").replace(/></g, ">\n<");
}

const noop = () => {};
const noopSave = async () => {};

const TERMS: AromaTerm[] = [
  { id: "t-blackcurrant", family: "FRUIT", origin: "PRIMARY", groupName: "Black fruit", term: "blackcurrant", sortOrder: 1 },
  { id: "t-lemon", family: "FRUIT", origin: "PRIMARY", groupName: "Citrus fruit", term: "lemon", sortOrder: 2 },
  { id: "t-vanilla", family: "SPICE", origin: "SECONDARY", groupName: "Oak", term: "vanilla", sortOrder: 3 },
  { id: "t-leather", family: "OTHER", origin: "TERTIARY", groupName: "Red wine", term: "leather", sortOrder: 4 },
];

const EMPTY: WsetNoteState = {
  id: null,
  tastedOn: "2026-09-26",
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

const NOTE: WsetNoteState = {
  ...EMPTY,
  clarity: "CLEAR",
  appearanceIntensity: "MEDIUM",
  colourHue: "RUBY",
  observations: ["LEGS_TEARS"],
  condition: "CLEAN",
  noseIntensity: "MEDIUM_PLUS",
  development: "DEVELOPING",
  sweetness: "DRY",
  acidity: "HIGH",
  tannin: "MEDIUM_PLUS",
  tanninNature: ["RIPE"],
  alcohol: "HIGH",
  body: "FULL",
  flavourIntensity: "PRONOUNCED",
  finish: "LONG",
  qualityScore: 92,
  priceCategory: "PREMIUM",
  readiness: "READY_CAN_IMPROVE",
  tasterNotes: "Firm and long.",
  noseTermIds: ["t-blackcurrant", "t-vanilla"],
  palateTermIds: ["t-blackcurrant"],
};

const RED: ArchetypeView = {
  name: "A typical Pauillac",
  colour: "RED",
  style: "STILL",
  placeName: "Pauillac",
  lineage: "Pauillac AOC · Bordeaux, France · Cabernet Sauvignon, Merlot",
  grapes: "Cabernet Sauvignon, Merlot",
  description: "Firm, cassis-led claret built to age.",
  qualityLow: 88,
  qualityHigh: 96,
  sat: {
    // Off the note's three stops: drawn on the full five-stop ladder.
    appearanceIntensity: ["MEDIUM_PLUS", "DEEP"],
    colourHue: ["RUBY", "GARNET"],
    noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
    development: ["YOUTHFUL", "DEVELOPING"],
    sweetness: ["DRY", "DRY"],
    acidity: ["MEDIUM_PLUS", "HIGH"],
    // High first: drawn low to high.
    tannin: ["HIGH", "MEDIUM_PLUS"],
    alcohol: ["MEDIUM", "HIGH"],
    body: ["FULL", "FULL"],
    flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
    // No finish: "Varies".
  },
  aromas: ["blackcurrant", "cedar", "vanilla"],
  flavours: ["blackcurrant", "tobacco"],
};

const SPARKLING: ArchetypeView = {
  name: "A typical Champagne",
  colour: "WHITE",
  style: "SPARKLING",
  placeName: null,
  lineage: "Champagne, France · Chardonnay, Pinot Noir",
  grapes: "Chardonnay, Pinot Noir",
  description: null,
  qualityLow: null,
  qualityHigh: null,
  sat: {
    colourHue: ["LEMON", "GOLD"],
    acidity: ["HIGH", "HIGH"],
    // MEDIUM is not a note stop: the seven-stop ladder.
    sweetness: ["MEDIUM", "MEDIUM"],
    mousse: ["DELICATE", "CREAMY"],
    finish: ["MEDIUM", "LONG"],
  },
  aromas: ["lemon"],
  flavours: [],
};

const FORTIFIED: ArchetypeView = {
  name: "A typical Tawny Port",
  colour: "RED",
  style: "FORTIFIED",
  placeName: null,
  lineage: "",
  grapes: "Touriga Nacional",
  description: null,
  qualityLow: 90,
  qualityHigh: 95,
  sat: {
    alcohol: ["MEDIUM_PLUS", "HIGH"],
    sweetness: ["SWEET", "LUSCIOUS"],
    // Not a red hue at all: "Varies".
    colourHue: ["LEMON", "LEMON"],
  },
  aromas: [],
  flavours: [],
};

describe("read-only archetype sheet markup (Library, map, training room)", () => {
  it("a red with every kind of band", async () => {
    await expect(markup(<ArchetypeSheet a={RED} />)).toMatchFileSnapshot("./__snapshots__/markup/archetype-red.html");
  });

  it("a sparkling white with the taster's answers and an id prefix", async () => {
    await expect(
      markup(<ArchetypeSheet a={SPARKLING} answers={NOTE} idPrefix="archetype-x-" />),
    ).toMatchFileSnapshot("./__snapshots__/markup/archetype-sparkling-answers.html");
  });

  it("a fortified red with no aromas, no description and a band it cannot draw", async () => {
    await expect(markup(<ArchetypeSheet a={FORTIFIED} />)).toMatchFileSnapshot(
      "./__snapshots__/markup/archetype-fortified.html",
    );
  });
});

describe("WSET note sheet markup (note page, Taste & Rate modal, training room)", () => {
  it("the note page: live-note column, a filled note", async () => {
    await expect(
      markup(
        <WsetSheet
          wine={{ colour: "RED", style: "STILL" }}
          title="Château Test 2015"
          terms={TERMS}
          initial={NOTE}
          onSave={noopSave}
          onDiscard={noop}
        />,
      ),
    ).toMatchFileSnapshot("./__snapshots__/markup/wset-note-page.html");
  });

  it("the Taste & Rate modal: embedded, a saved sparkling note with Delete", async () => {
    await expect(
      markup(
        <WsetSheet
          wine={{ colour: "WHITE", style: "SPARKLING" }}
          title="Cava Brut Nature"
          terms={TERMS}
          initial={EMPTY}
          onSave={noopSave}
          onDiscard={noop}
          onDelete={noop}
          embedded
        />,
      ),
    ).toMatchFileSnapshot("./__snapshots__/markup/wset-note-modal.html");
  });

  it("the training room: unknown wine, footer action, strip, no column, bubbles and fortified", async () => {
    await expect(
      markup(
        <WsetSheet
          wine={{ colour: null, style: null }}
          title="Training · 20:14"
          terms={TERMS}
          initial={NOTE}
          footerAction={{ label: "Your call →", onClick: noop }}
          belowBar={<div className="h-11 lg:hidden">strip</div>}
          aside={null}
          onClose={noop}
          bubbles={{ value: true, onChange: noop }}
          fortified={{ value: null, onChange: noop }}
        />,
      ),
    ).toMatchFileSnapshot("./__snapshots__/markup/wset-training.html");
  });
});
```

- [ ] **Step 4: Capture the snapshots from today's code**

Run: `npx vitest run src/components/wset/sheet-markup.test.tsx -u`
Expected: `6 passed`, `Snapshots 6 written`; six `.html` files under `src/components/wset/__snapshots__/markup/`.

- [ ] **Step 5: Confirm they are stable and sane**

Run: `npx vitest run src/components/wset/sheet-markup.test.tsx`
Expected: `6 passed`, nothing written.
Run: `grep -c "_R_id_" src/components/wset/__snapshots__/markup/wset-note-page.html` → `3` (the quality slider's masked `useId`).
Run: `grep -c "Varies" src/components/wset/__snapshots__/markup/archetype-fortified.html` → `9`.

- [ ] **Step 6: Gates**

Run: `npx vitest run` → all pass.
Run: `npx tsc --noEmit` → no output.
Run: `npx eslint vitest.config.mts src/components/wset/sheet-markup.test.tsx` → no output.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.mts src/components/wset/sheet-markup.test.tsx src/components/wset/__snapshots__/markup
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "test(wset): pin the sheet family's markup before the archetype editor shares it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The shared sheet shell

WsetSheet's frame moves into `sheet-shell.tsx` unchanged; WsetSheet composes it. The note form must render byte for byte as before (Task 1's gate).

**Files:**
- Create: `src/lib/wset/sheet-steps.ts`, `src/lib/wset/sheet-steps.test.ts`
- Create: `src/components/wset/sheet-shell.tsx`, `src/components/wset/sheet-shell.test.tsx`
- Modify: `src/components/wset/wset-sheet.tsx` (imports lines 3–56, `PRIMARY_BUTTON` lines 86–89, state lines 292–413, the whole `return (…)` of `WsetSheet`, lines 478–1072)
- Modify: `src/components/new-note-modal.tsx` (import at line 25, `DialogContent` `className` at line 347)

**Interfaces:**
- Consumes: Task 1's gate.
- Produces (`src/lib/wset/sheet-steps.ts`): `type SheetStep<Id extends string> = { id: Id; forward: boolean }`; `footerStep<Id extends string>(order: readonly Id[], active: Id): SheetStep<Id> | null`.
- Produces (`src/components/wset/sheet-shell.tsx`, all `export`):
  - `PRIMARY_BUTTON: string`, `SHEET_DIALOG_CLASS: string`
  - `useSheetSteps<Id extends string>(order: readonly Id[], embedded: boolean): { active: Id; goTo: (id: Id) => void; step: SheetStep<Id> | null; scrollRef: RefObject<HTMLDivElement | null> }`
  - `SheetFrame({ embedded, children })`, `SheetBar({ embedded, children })`
  - `SheetHeaderRow({ eyebrow: string; title: string; onClose?: () => void; progress: { done: number; total: number }; trailing?: ReactNode })`
  - `type SheetTab = { id: string; label: string; done: number; total: number }`; `SheetTabs({ tabs: readonly SheetTab[]; active: string; onSelect: (id: string) => void })`
  - `SheetBody({ embedded: boolean; column: ReactNode | null; scrollRef: RefObject<HTMLDivElement | null>; children })`
  - `SheetFooter({ embedded: boolean; progress: ReactNode; notice?: ReactNode; children })`, `SheetFooterProgress({ done: number; caption: string; note?: string | null })`
  - `SheetStepButton({ section: string; forward: boolean; onClick: () => void })`
  - `SheetSaveButton({ label: string; onClick: () => void; disabled: boolean; saved: boolean })`
  - `DiscardConfirm({ title, body, keepLabel, discardLabel: string; onKeep: () => void; onDiscard: () => void })`

- [ ] **Step 1: Write the failing step test**

Create `src/lib/wset/sheet-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { footerStep } from "./sheet-steps";

const NOTE = ["appearance", "nose", "palate", "conclusions"] as const;
const EDITOR = ["wine", "appearance", "nose", "palate", "conclusions"] as const;

describe("footerStep", () => {
  it("steps forward while a section lies ahead", () => {
    expect(footerStep(NOTE, "appearance")).toEqual({ id: "nose", forward: true });
    expect(footerStep(NOTE, "palate")).toEqual({ id: "conclusions", forward: true });
    expect(footerStep(EDITOR, "wine")).toEqual({ id: "appearance", forward: true });
  });

  it("steps back from the last section", () => {
    expect(footerStep(NOTE, "conclusions")).toEqual({ id: "palate", forward: false });
    expect(footerStep(EDITOR, "conclusions")).toEqual({ id: "palate", forward: false });
  });

  it("has no step with a single section", () => {
    expect(footerStep(["only"] as const, "only")).toBeNull();
  });

  it("an id outside the order steps to the first section, as the note sheet always did", () => {
    expect(footerStep(NOTE as readonly string[], "elsewhere")).toEqual({ id: "appearance", forward: true });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/wset/sheet-steps.test.ts`
Expected: FAIL — `Failed to resolve import "./sheet-steps"`.

- [ ] **Step 3: Write the step module**

Create `src/lib/wset/sheet-steps.ts`:

```ts
// The footer's one step in a sheet that shows one section at a time (the WSET
// note sheet, the admin typical-wine editor): forward while a section lies
// ahead, back from the last one, nothing when there is only one. The tabs in
// the sticky bar still jump anywhere. Pure, no imports, so vitest loads it.

export type SheetStep<Id extends string> = { id: Id; forward: boolean };

export function footerStep<Id extends string>(order: readonly Id[], active: Id): SheetStep<Id> | null {
  const at = order.indexOf(active);
  if (at < order.length - 1) return { id: order[at + 1], forward: true };
  if (at > 0) return { id: order[at - 1], forward: false };
  return null;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/wset/sheet-steps.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Write the failing shell test**

Create `src/components/wset/sheet-shell.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetFooter, SheetFooterProgress, SheetTabs, type SheetTab } from "./sheet-shell";

// The shared sheet frame's own choices. The note sheet's use of it is pinned
// byte for byte by sheet-markup.test.tsx.

const noop = () => {};
const tab = (id: string, label: string, done = 0, total = 2): SheetTab => ({ id, label, done, total });
const NOTE_TABS = [tab("appearance", "Appearance"), tab("nose", "Nose"), tab("palate", "Palate"), tab("conclusions", "Conclusion")];

describe("SheetTabs", () => {
  it("four tabs (the note sheet): a four-column phone grid, 11px names", () => {
    const html = renderToStaticMarkup(<SheetTabs tabs={NOTE_TABS} active="nose" onSelect={noop} />);
    expect(html).toContain('class="mt-2 gap-1 max-sm:grid max-sm:grid-cols-4 sm:flex sm:gap-2"');
    expect(html).toContain("font-size:11px");
    expect(html).not.toContain("text-[10px]");
  });

  it("five tabs (the editor): a five-column phone grid, names a size smaller so Appearance fits 360px", () => {
    const html = renderToStaticMarkup(
      <SheetTabs tabs={[tab("wine", "Wine", 5, 5), ...NOTE_TABS]} active="wine" onSelect={noop} />,
    );
    expect(html).toContain('class="mt-2 gap-1 max-sm:grid max-sm:grid-cols-5 sm:flex sm:gap-2"');
    expect((html.match(/block text-\[10px\] sm:inline sm:text-\[11px\]/g) ?? []).length).toBe(5);
    // A complete tab shows ✓; the active one is pressed.
    expect(html).toContain(">✓<");
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
  });
});

describe("SheetFooter", () => {
  it("puts a notice on its own full-width line, outside the desktop-only progress", () => {
    const html = renderToStaticMarkup(
      <SheetFooter
        embedded
        progress={<SheetFooterProgress done={3} caption="of 19 set" note={null} />}
        notice={<p role="alert">Give it a name.</p>}
      >
        <button type="button">Save profile</button>
      </SheetFooter>,
    );
    expect(html).toMatch(/^<div class="flex items-center gap-\[9px\] sm:gap-3 flex-wrap /);
    expect(html).toContain('<div class="basis-full"><p role="alert">Give it a name.</p></div><div class="min-w-0 max-sm:hidden">');
  });

  it("without a notice, no wrap and no notice line", () => {
    const html = renderToStaticMarkup(
      <SheetFooter embedded progress={<SheetFooterProgress done={3} caption="of 19 set" />}>
        <button type="button">Save profile</button>
      </SheetFooter>,
    );
    expect(html).not.toContain("flex-wrap");
    expect(html).not.toContain("basis-full");
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx vitest run src/components/wset/sheet-shell.test.tsx`
Expected: FAIL — `Failed to resolve import "./sheet-shell"`.

- [ ] **Step 7: Write the shell**

Create `src/components/wset/sheet-shell.tsx`. Every JSX block and comment in it is moved from `wset-sheet.tsx` unchanged; the only new behaviour is `SheetTabs`' five-column grid and `SheetFooter`'s `notice`, neither of which WsetSheet uses.

```tsx
"use client";

import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { makeT } from "@/lib/wset/i18n";
import { useWsetLang } from "@/lib/wset/wset-lang";
import { footerStep } from "@/lib/wset/sheet-steps";
import { Eyebrow } from "@/components/overview/eyebrow";
import { PHONE_HIT_44 } from "./pill-group";
import { cn } from "@/lib/utils";

// The WSET sheet's frame, shared by the note sheet (WsetSheet) and the admin
// typical-wine editor: the sticky bar (close, title, EN/DA, section tabs), one
// section on screen at a time, the footer (progress, the section step, Save)
// and the discard confirm. Moved out of wset-sheet.tsx unchanged — the note
// sheet's markup is pinned by sheet-markup.test.tsx.

// The bordeaux primary button, as on every other 2026-09 surface: radius 9–11,
// the ink under-shadow, the one allowed hover literal.
export const PRIMARY_BUTTON =
  "bg-primary text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-primary-hover";

/** The Taste & Rate note popup: full-screen on phones, a wide card from sm up
    (the .wset-sheet desktop scale in globals.css enlarges its type to match).
    The admin typical-wine editor opens in the same popup. */
export const SHEET_DIALOG_CLASS =
  "inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[92vh] sm:max-h-[92vh] sm:w-[calc(100vw-3rem)] sm:max-w-[1100px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-4 sm:rounded-[16px] lg:max-w-[1400px]";

/** One section on screen at a time, at every breakpoint: the tabs and the
    footer's step switch it. In a dialog (`embedded`) the sections scroll inside
    `scrollRef` and a switch resets that scroll; on a page the new section is
    scrolled in under the bar. */
export function useSheetSteps<Id extends string>(order: readonly Id[], embedded: boolean) {
  const [active, setActive] = useState<Id>(order[0]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const goTo = useCallback(
    (id: Id) => {
      setActive(id);
      // After the hidden card mounts: in the modal just reset the inner
      // scroll; on the page line the card up under the bar.
      requestAnimationFrame(() => {
        if (scrollRef.current && embedded) {
          scrollRef.current.scrollTo({ top: 0 });
        } else {
          document.getElementById(id)?.scrollIntoView();
        }
      });
    },
    [embedded],
  );
  return { active, goTo, step: footerStep(order, active), scrollRef };
}

/** The sheet's root: `.wset-sheet` carries the sheet's scale (globals.css). */
export function SheetFrame({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "wset-sheet min-w-0",
        embedded && "flex min-h-0 flex-1 flex-col",
      )}
      style={{ color: "var(--foreground)" }}
    >
      {children}
    </div>
  );
}

/** The sticky bar: SheetHeaderRow, SheetTabs and an optional strip under them. */
export function SheetBar({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "sticky z-30 mb-4 py-2.5 sm:py-3",
        // Full-bleed on phones so the bar spans the whole screen like a real
        // app header. A modal is a full-screen box with a known p-4, so a
        // plain -mx-4 reaches the edges without any viewport math (the 50vw
        // calc misbehaves inside the fixed, scrolling modal); the note page,
        // whose nesting/padding is unknown, uses the viewport calc.
        // In the modal the bar must own the very top: the dialog's p-4 left
        // a gap the content scrolled past, so the "sticky" header looked
        // detached. Negative margins cancel that padding on every side and
        // the top corners take over the dialog's own radius.
        embedded
          ? "-mx-4 -mt-4 px-4 sm:rounded-t-[16px] sm:px-6"
          : "max-sm:mx-[calc(50%-50vw)] max-sm:px-4 sm:px-1",
      )}
      style={{
        top: embedded ? 0 : 56,
        // Solid card-cream in the modal so nothing ghosts through; the page
        // keeps the translucent blur since content scrolls under it there.
        background: embedded ? "var(--card)" : "color-mix(in srgb, var(--background) 94%, transparent)",
        backdropFilter: embedded ? undefined : "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

/** The bar's first line. Desktop: eyebrow + title … EN/DA · Close · trailing.
    Phones: ✕ · title over the progress … EN/DA · trailing. Without `onClose`
    there is no ✕ and no Close. */
export function SheetHeaderRow({
  eyebrow,
  title,
  onClose,
  progress,
  trailing,
}: {
  eyebrow: string;
  title: string;
  onClose?: () => void;
  progress: { done: number; total: number };
  /** After Close: the note sheet's ⋯ menu. */
  trailing?: ReactNode;
}) {
  const { lang, setLang } = useWsetLang();
  const t = makeT(lang);
  const { done, total } = progress;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {onClose ? (
        <button
          type="button"
          aria-label={t("close")}
          onClick={onClose}
          className="-ml-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:hidden"
        >
          <X aria-hidden className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <Eyebrow size="sm" className="block max-sm:hidden">
          {eyebrow}
        </Eyebrow>
        <p className="font-heading text-[16px] leading-[1.2] font-semibold text-foreground max-sm:line-clamp-2 sm:mt-0.5 sm:truncate sm:text-[17px]">
          {title}
        </p>
        {/* Phones carry the progress in the bar; desktop keeps it in the
            footer, beside Save. */}
        <div className="mt-1 flex items-center gap-2 sm:hidden">
          <span aria-hidden className="h-[5px] max-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full bg-primary" style={{ width: `${donePct}%` }} />
          </span>
          <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
            {t("assessed_short", { done, total })}
          </span>
        </div>
      </div>
      {/* EN/DA toggle — mirrors the map's; the sheet language is shared and
          persisted, so it also drives the read-only archetype view. */}
      <div className="flex shrink-0 items-center rounded-md border border-border p-0.5 text-[11px]">
        {(["en", "da"] as const).map((lng) => (
          <button
            key={lng}
            type="button"
            onClick={() => setLang(lng)}
            aria-pressed={lang === lng}
            className={cn(PHONE_HIT_44, "rounded px-1.5 py-0.5 font-medium max-sm:min-w-9 max-sm:py-1")}
            style={{
              background: lang === lng ? "var(--primary)" : "transparent",
              color: lang === lng ? "var(--primary-foreground)" : "var(--muted-foreground)",
            }}
          >
            {lng.toUpperCase()}
          </button>
        ))}
      </div>
      {onClose ? (
        // Always "Close": a clean sheet exits, a dirty one asks first (the
        // same path Escape and the modal backdrop take).
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-[8px] border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground hover:bg-muted max-sm:hidden"
        >
          {t("close")}
        </button>
      ) : null}
      {trailing}
    </div>
  );
}

export type SheetTab = { id: string; label: string; done: number; total: number };

// Phones get one grid column per tab. Four is the note sheet; five (the
// editor's Wine + I–IV) sets the name a size smaller so "Appearance" fits a
// 360px screen.
const TAB_GRID: Record<number, string> = {
  4: "mt-2 gap-1 max-sm:grid max-sm:grid-cols-4 sm:flex sm:gap-2",
  5: "mt-2 gap-1 max-sm:grid max-sm:grid-cols-5 sm:flex sm:gap-2",
};

/** Section tabs: one section on screen at a time; each tab carries its count
    (✓ once complete). Phones get a grid of 44px targets. */
export function SheetTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly SheetTab[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const dense = tabs.length > 4;
  return (
    <div className={TAB_GRID[tabs.length] ?? TAB_GRID[5]}>
      {tabs.map((s) => {
        const on = s.id === active;
        const complete = s.total > 0 && s.done >= s.total;
        const nameColour = on ? "var(--primary-foreground)" : "var(--foreground)";
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(s.id)}
            className="rounded-[10px] px-0.5 py-[5px] max-sm:min-h-11 sm:inline-flex sm:items-baseline sm:gap-1.5 sm:px-3 sm:py-1.5"
            style={{
              border: "none",
              cursor: "pointer",
              background: on ? "var(--primary)" : "var(--accent)",
            }}
          >
            <span
              className={dense ? "block text-[10px] sm:inline sm:text-[11px]" : "block sm:inline"}
              style={dense ? { fontWeight: 600, color: nameColour } : { fontSize: 11, fontWeight: 600, color: nameColour }}
            >
              {s.label}
            </span>
            <span
              className="block sm:inline"
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: on ? "var(--primary-foreground)" : complete ? "var(--gold-dark)" : "var(--muted-foreground)",
              }}
            >
              {complete ? "✓" : `${s.done}/${s.total}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The sections' column, with the note page's optional lg+ column beside it.
    `column: null` (and always in a dialog): single column. In a dialog the
    sections scroll here, between the pinned bar and footer. */
export function SheetBody({
  embedded,
  column,
  scrollRef,
  children,
}: {
  embedded: boolean;
  column: ReactNode | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const showColumn = !embedded && column !== null;
  return (
    <div
      ref={scrollRef}
      className={cn(
        // grid-cols-1 (=minmax(0,1fr)) so the single column can't be
        // inflated past the container by a card's intrinsic content width —
        // the section boxes stay within the modal's padding on phones.
        "grid grid-cols-1 items-start gap-6",
        showColumn && "lg:grid-cols-[264px_minmax(0,1fr)]",
        // The modal scrolls HERE, between the anchored header and footer.
        embedded && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4",
      )}
    >
      {showColumn ? (
        <aside className="sticky top-[114px] hidden flex-col gap-4 lg:flex">{column}</aside>
      ) : null}

      <div className="min-w-0" style={{ display: "flex", flexDirection: "column", gap: "var(--wset-gap,18px)" }}>
        {children}
      </div>
    </div>
  );
}

/** The footer: `progress` (desktop) beside the actions. In a dialog it is the
    popup's last row, pinned while the sections scroll; on a page it sticks to
    the viewport bottom. `notice` (a save error) takes a full-width line above,
    at every width. */
export function SheetFooter({
  embedded,
  progress,
  notice,
  children,
}: {
  embedded: boolean;
  progress: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-[9px] sm:gap-3",
        notice ? "flex-wrap" : undefined,
        embedded
          ? "-mx-4 -mb-4 border-t border-border bg-card px-4 pt-[11px] pb-[max(11px,env(safe-area-inset-bottom))] sm:rounded-b-[16px] sm:px-6 sm:py-3"
          : "sticky bottom-0 z-30 mt-6 border-t border-border py-[11px] max-sm:mx-[calc(50%-50vw)] max-sm:px-4 max-sm:pb-[max(11px,env(safe-area-inset-bottom))] sm:px-1 sm:py-3",
      )}
      style={
        embedded
          ? undefined
          : { background: "color-mix(in srgb, var(--background) 94%, transparent)", backdropFilter: "blur(8px)" }
      }
    >
      {notice ? <div className="basis-full">{notice}</div> : null}
      {progress}
      <div className="flex flex-1 items-center gap-[9px] sm:ml-auto sm:flex-none">{children}</div>
    </div>
  );
}

/** Desktop progress: the count set in Cormorant, a caption, an optional line under it. */
export function SheetFooterProgress({ done, caption, note }: { done: number; caption: string; note?: string | null }) {
  return (
    <div className="min-w-0 max-sm:hidden">
      <div className="flex items-baseline gap-[7px]">
        <span className="font-heading text-[22px] leading-none font-semibold text-primary tabular-nums">{done}</span>
        <span className="text-[11.5px] text-muted-foreground">{caption}</span>
      </div>
      {note ? <p className="mt-1 text-[10.5px] leading-[1.45] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** The footer's one step: "Next: Nose →" (phones "Nose →"), or "← Palate" back from the last section. */
export function SheetStepButton({
  section,
  forward,
  onClick,
}: {
  section: string;
  forward: boolean;
  onClick: () => void;
}) {
  const { lang } = useWsetLang();
  const t = makeT(lang);
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-[10px] border border-border bg-background p-[13px] text-[13.5px] font-semibold whitespace-nowrap text-primary hover:bg-muted max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[15px] sm:py-[10px] sm:text-[13px]"
    >
      {forward ? (
        <>
          <span className="sm:hidden">{t("next_section_short", { section })}</span>
          <span className="max-sm:hidden">{t("next_section", { section })}</span>
        </>
      ) : (
        t("prev_section", { section })
      )}
    </button>
  );
}

/** Save: bordeaux, gold with ink once saved (6.5:1, like every bg-gold button). */
export function SheetSaveButton({
  label,
  onClick,
  disabled,
  saved,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  saved: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-11 rounded-[10px] p-[13px] text-[14px] font-semibold whitespace-nowrap shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors disabled:opacity-70 max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[19px] sm:py-[11px] sm:text-[13.5px]",
        // Ink on the gold "Saved" fill (6.5:1), like every bg-gold button
        // in the app; parchment is only for text on bordeaux.
        saved ? "bg-gold text-foreground hover:bg-gold-deep" : PRIMARY_BUTTON,
      )}
    >
      {label}
    </button>
  );
}

/** "Discard …?" over the sheet: Keep editing, or Discard. A backdrop tap keeps editing. */
export function DiscardConfirm({
  title,
  body,
  keepLabel,
  discardLabel,
  onKeep,
  onDiscard,
}: {
  title: string;
  body: string;
  keepLabel: string;
  discardLabel: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onKeep}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "color-mix(in srgb, var(--foreground) 45%, transparent)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 12px 40px rgba(42,33,30,0.25)",
        }}
      >
        <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>
          {title}
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 18 }}>
          {body}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onKeep}
            className="rounded-[9px] border border-border bg-transparent px-4 py-[9px] text-[13px] font-semibold text-foreground hover:bg-muted max-sm:min-h-11"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className={cn("rounded-[9px] px-4 py-[9px] text-[13px] font-semibold max-sm:min-h-11", PRIMARY_BUTTON)}
          >
            {discardLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the shell test**

Run: `npx vitest run src/components/wset/sheet-shell.test.tsx`
Expected: `4 passed`.

- [ ] **Step 9: WsetSheet — imports and the moved constant**

In `src/components/wset/wset-sheet.tsx`:

Replace

```tsx
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
import { Ellipsis, X } from "lucide-react";
```

with

```tsx
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Ellipsis } from "lucide-react";
```

Replace

```tsx
import { SnapSlider } from "./snap-slider";
import { PillGroup, PHONE_HIT_44 } from "./pill-group";
import { WineColourControl } from "./wine-colour-control";
import { AromaPicker } from "./aroma-picker";
import { QualitySlider } from "./quality-slider";
import { type SectionNavItem } from "./section-nav";
import { LiveTastingNote } from "./live-tasting-note";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

with

```tsx
import { SnapSlider } from "./snap-slider";
import { PillGroup } from "./pill-group";
import { WineColourControl } from "./wine-colour-control";
import { AromaPicker } from "./aroma-picker";
import { QualitySlider } from "./quality-slider";
import { type SectionNavItem } from "./section-nav";
import { LiveTastingNote } from "./live-tasting-note";
import {
  DiscardConfirm,
  PRIMARY_BUTTON,
  SheetBar,
  SheetBody,
  SheetFooter,
  SheetFooterProgress,
  SheetFrame,
  SheetHeaderRow,
  SheetSaveButton,
  SheetStepButton,
  SheetTabs,
  useSheetSteps,
} from "./sheet-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

Delete (it moved to `sheet-shell.tsx`):

```tsx
// The bordeaux primary button, as on every other 2026-09 surface: radius 9–11,
// the ink under-shadow, the one allowed hover literal.
const PRIMARY_BUTTON =
  "bg-primary text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-primary-hover";

```

- [ ] **Step 10: WsetSheet — the section state**

In `WsetSheet`, replace `  const { lang, setLang } = useWsetLang();` with `  const { lang } = useWsetLang();` (the EN/DA toggle moved into `SheetHeaderRow`).

Replace

```tsx
  // One WSET section on screen at a time, at every breakpoint — the tabs in
  // the sticky bar and the footer's step switch between them. (Was phone-only;
  // the owner extended it to tablet/desktop, which retired the scroll-spy rail.)
  const [mobileSection, setMobileSection] = useState<SectionId>("appearance");
  const [menuOpen, setMenuOpen] = useState(false);
  // In the modal the sections scroll INSIDE this container while the header
  // and footer stay put — switching section resets it to the top instead of
  // yanking the whole dialog around.
  const scrollRef = useRef<HTMLDivElement>(null);
```

with

```tsx
  // One WSET section on screen at a time, at every breakpoint — the tabs in
  // the sticky bar and the footer's step switch between them. (Was phone-only;
  // the owner extended it to tablet/desktop, which retired the scroll-spy rail.)
  // In the modal the sections scroll INSIDE scrollRef while the header and
  // footer stay put — switching section resets it to the top instead of
  // yanking the whole dialog around.
  const { active: mobileSection, goTo: goToSection, step, scrollRef } = useSheetSteps(SECTION_ORDER, embedded);
  const [menuOpen, setMenuOpen] = useState(false);
```

Delete the line `  const showAside = !embedded && aside !== null;` (now inside `SheetBody`).

Replace

```tsx
  const done = navItems.reduce((n, s) => n + s.done, 0);
  const total = navItems.reduce((n, s) => n + s.total, 0);
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;

  // A section's short name, as the tabs and the footer step print it.
  const sectionName = (id: SectionId) => (id === "conclusions" ? t("conclusion_short") : t(id));

  const goToSection = useCallback(
    (id: SectionId) => {
      setMobileSection(id);
      // After the hidden card mounts: in the modal just reset the inner
      // scroll; on the page line the card up under the bar.
      requestAnimationFrame(() => {
        if (scrollRef.current && embedded) {
          scrollRef.current.scrollTo({ top: 0 });
        } else {
          document.getElementById(id)?.scrollIntoView();
        }
      });
    },
    [embedded],
  );

  // The footer's one step, as drawn: forward while a section lies ahead, back
  // from the last one. The tabs above still jump anywhere.
  const at = SECTION_ORDER.indexOf(mobileSection);
  const step: { id: SectionId; forward: boolean } | null =
    at < SECTION_ORDER.length - 1
      ? { id: SECTION_ORDER[at + 1], forward: true }
      : at > 0
        ? { id: SECTION_ORDER[at - 1], forward: false }
        : null;

```

with

```tsx
  const done = navItems.reduce((n, s) => n + s.done, 0);
  const total = navItems.reduce((n, s) => n + s.total, 0);

  // A section's short name, as the tabs and the footer step print it.
  const sectionName = (id: SectionId) => (id === "conclusions" ? t("conclusion_short") : t(id));

```

- [ ] **Step 11: WsetSheet — the render**

Replace `WsetSheet`'s whole `return (…);` statement — from the line `  return (` that follows the `optionalSub` helper, through the `  );` just before the component's closing `}` at the end of the file — with the block below. The four `SectionCard`s inside it are the current ones, byte for byte, dedented by two spaces (they sit one element shallower); the ⋯ menu is the current one, now passed as `trailing`; the delete confirm is the current one.

```tsx
  return (
    <SheetFrame embedded={embedded}>
      <SheetBar embedded={embedded}>
        <SheetHeaderRow
          eyebrow={t("tasting_note")}
          title={title}
          onClose={closable ? discard : undefined}
          progress={{ done, total }}
          trailing={
            onDelete ? (
              // The ⋯ menu holds Delete for a saved note — rare and destructive,
              // so it stays out of the footer's reach.
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label={t("more_actions")}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                  className="-mr-2.5 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:mr-0 sm:size-[30px] sm:border sm:border-border"
                >
                  <Ellipsis aria-hidden className="size-4" />
                </button>
                {menuOpen ? (
                  <>
                    <div
                      aria-hidden
                      onClick={() => setMenuOpen(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                    />
                    <div
                      role="menu"
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "calc(100% + 6px)",
                        zIndex: 41,
                        minWidth: 150,
                        padding: 5,
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        boxShadow: "0 8px 28px rgba(42,33,30,0.18)",
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setDeleteError(null);
                          setConfirmDelete(true);
                        }}
                        className="block w-full rounded-[8px] px-3 py-[9px] text-left text-[13px] font-semibold text-destructive hover:bg-muted max-sm:min-h-11"
                      >
                        {t("delete_note")}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : undefined
          }
        />
        <SheetTabs
          tabs={navItems.map((s) => ({
            id: s.id,
            label: sectionName(s.id as SectionId),
            done: s.done,
            total: s.total,
          }))}
          active={mobileSection}
          onSelect={(id) => goToSection(id as SectionId)}
        />
        {/* Inside the sticky bar, so it sticks with the tabs (the training
            room's "Top match" strip below lg). Rendered bare: spacing is the
            caller's, inside its 44px; sectionScrollMt allows those 44px
            below lg only. */}
        {belowBar}
      </SheetBar>

      <SheetBody
        embedded={embedded}
        scrollRef={scrollRef}
        column={
          aside === undefined ? (
            <>
              <LiveTastingNote sections={noteSections} heading={t("tasting_note_live")} emptyText={t("note_empty")} />
              <p style={{ fontSize: 10.5, color: "var(--placeholder)" }}>
                {t("footer_wset")}
              </p>
            </>
          ) : (
            aside
          )
        }
      >
        <SectionCard id="appearance" numeral="I" title={t("appearance")} rated={t("assessed_of", { done: prog.appearance[0], total: prog.appearance[1] })} className={cn(sectionScrollMt, mobileSection !== "appearance" && "hidden")}>
          <RowPair>
            <Row label={t("clarity")} value={valueLabel(state.clarity, L)}>
              <PillGroup options={CLARITY} labels={L} value={state.clarity} onChange={(v) => set("clarity", v)} />
            </Row>
            <Row label={t("intensity")} value={valueLabel(state.appearanceIntensity, L)}>
              <SnapSlider stops={APPEARANCE_INTENSITY_STOPS} labels={L} value={state.appearanceIntensity} onChange={(v) => set("appearanceIntensity", v)} />
            </Row>
          </RowPair>
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
          <Row label={t("other_observations")} sub={optionalSub(t("optional_not_counted", { total }))}>
            <PillGroup multi options={OBSERVATIONS} labels={L} value={state.observations} onChange={(v) => set("observations", v)} />
          </Row>
        </SectionCard>

        <SectionCard id="nose" numeral="II" title={t("nose")} rated={t("assessed_of", { done: prog.nose[0], total: prog.nose[1] })} className={cn(sectionScrollMt, mobileSection !== "nose" && "hidden")}>
          <RowPair>
            <Row label={t("condition")} value={valueLabel(state.condition, L)}>
              <PillGroup options={CONDITION} labels={L} value={state.condition} onChange={(v) => set("condition", v)} />
            </Row>
            <Row label={t("intensity")} value={valueLabel(state.noseIntensity, L)}>
              <SnapSlider stops={INTENSITY_STOPS} labels={L} value={state.noseIntensity} onChange={(v) => set("noseIntensity", v)} />
            </Row>
          </RowPair>
          {state.condition === "UNCLEAN" ? (
            <Row label={t("fault")} sub={t("whats_wrong")}>
              <PillGroup multi options={FAULTS} labels={L} value={state.faults} onChange={(v) => set("faults", v)} />
            </Row>
          ) : null}
          <Row label={t("development")} value={valueLabel(state.development, L)}>
            <SnapSlider stops={DEVELOPMENT_STOPS} labels={L} value={state.development} onChange={(v) => set("development", v)} />
          </Row>
          <Row wide label={t("aroma_characteristics")} sub={t("select_all")}>
            <AromaPicker terms={terms} selectedIds={state.noseTermIds} onChange={(ids) => set("noseTermIds", ids)} colour={wine.colour ?? colourFromHue(state.colourHue)} sheetTitle={t("aroma_characteristics")} lang={lang} />
          </Row>
        </SectionCard>
        <SectionCard id="palate" numeral="III" title={t("palate")} rated={t("assessed_of", { done: prog.palate[0], total: prog.palate[1] })} className={cn(sectionScrollMt, mobileSection !== "palate" && "hidden")}>
          <RowPair>
            <Row label={t("sweetness")} value={valueLabel(state.sweetness, L)}>
              <SnapSlider stops={SWEETNESS_STOPS} labels={L} value={state.sweetness} onChange={(v) => set("sweetness", v)} />
            </Row>
            <Row label={t("acidity")} value={valueLabel(state.acidity, L)}>
              <SnapSlider stops={LEVEL_STOPS} labels={L} value={state.acidity} onChange={(v) => set("acidity", v)} />
            </Row>
          </RowPair>
          <RowPair>
            <Row label={t("tannin")} value={valueLabel(state.tannin, L)}>
              <SnapSlider stops={LEVEL_STOPS} labels={L} value={state.tannin} onChange={(v) => set("tannin", v)} />
            </Row>
            <Row label={t("tannin_nature")} sub={t("optional")}>
              <PillGroup multi options={TANNIN_NATURE} labels={L} value={state.tanninNature} onChange={(v) => set("tanninNature", v)} />
            </Row>
          </RowPair>
          <RowPair>
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
            <RowPair>
              <Row label={t("mousse")} value={valueLabel(state.mousse, L)} sub={state.mousse ? undefined : t("required_sparkling")}>
                <PillGroup options={MOUSSE} labels={L} value={state.mousse} onChange={(v) => set("mousse", v)} />
              </Row>
              <Row label={t("flavour_intensity")} value={valueLabel(state.flavourIntensity, L)}>
                <SnapSlider stops={INTENSITY_STOPS} labels={L} value={state.flavourIntensity} onChange={(v) => set("flavourIntensity", v)} />
              </Row>
            </RowPair>
          ) : (
            <Row label={t("flavour_intensity")} value={valueLabel(state.flavourIntensity, L)}>
              <SnapSlider stops={INTENSITY_STOPS} labels={L} value={state.flavourIntensity} onChange={(v) => set("flavourIntensity", v)} />
            </Row>
          )}
          <Row wide label={t("flavour_characteristics")} sub={t("taste_not_smell")}>
            <AromaPicker
              terms={terms}
              selectedIds={state.palateTermIds}
              onChange={(ids) => set("palateTermIds", ids)}
              copyFrom={{ label: t("copy_from_nose"), ids: state.noseTermIds }}
              colour={wine.colour ?? colourFromHue(state.colourHue)}
              sheetTitle={t("flavour_characteristics")}
              lang={lang}
            />
          </Row>
          <Row label={t("finish")} value={valueLabel(state.finish, L)}>
            <SnapSlider stops={FINISH_STOPS} labels={L} value={state.finish} onChange={(v) => set("finish", v)} />
          </Row>
        </SectionCard>

        <SectionCard id="conclusions" numeral="IV" title={t("conclusions")} rated={t("assessed_of", { done: prog.conclusions[0], total: prog.conclusions[1] })} className={cn(sectionScrollMt, mobileSection !== "conclusions" && "hidden")}>
          <Row label={t("score")}>
            <QualitySlider score={state.qualityScore} onChange={(v) => set("qualityScore", v)} lang={lang} />
          </Row>
          <RowPair>
            <Row label={t("price_category")} value={valueLabel(state.priceCategory, L)}>
              <PillGroup options={PRICE} labels={L} value={state.priceCategory} onChange={(v) => set("priceCategory", v)} />
            </Row>
            <Row label={t("readiness")} value={valueLabel(state.readiness, L)}>
              <PillGroup options={READINESS} labels={L} value={state.readiness} onChange={(v) => set("readiness", v)} />
            </Row>
          </RowPair>
          <Row label={t("tasters_notes")} sub={optionalSub(t("own_words_sub"))}>
            <textarea
              value={state.tasterNotes}
              onChange={(e) => set("tasterNotes", e.target.value)}
              placeholder={t("notes_placeholder")}
              style={{
                width: "100%",
                minHeight: 96,
                resize: "vertical",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--foreground)",
              }}
            />
          </Row>
        </SectionCard>
      </SheetBody>

      <SheetFooter
        embedded={embedded}
        progress={
          <SheetFooterProgress
            done={done}
            caption={t("of_total_assessed", { total })}
            note={footerAction ? null : t("nothing_required")}
          />
        }
      >
        {step ? (
          <SheetStepButton section={sectionName(step.id)} forward={step.forward} onClick={() => goToSection(step.id)} />
        ) : null}
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
          <SheetSaveButton
            label={saveLabel}
            onClick={handleSave}
            disabled={saveState === "saving"}
            saved={saveState === "saved"}
          />
        )}
      </SheetFooter>

      {confirmDiscard ? (
        <DiscardConfirm
          title={t("discard_q")}
          body={t("discard_body")}
          keepLabel={t("keep_editing")}
          discardLabel={t("discard")}
          onKeep={() => setConfirmDiscard(false)}
          onDiscard={() => {
            setConfirmDiscard(false);
            onDiscard?.();
          }}
        />
      ) : null}
      {confirmDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => (deleting ? null : setConfirmDelete(false))}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "color-mix(in srgb, var(--foreground) 45%, transparent)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 12px 40px rgba(42,33,30,0.25)",
            }}
          >
            <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>
              {t("delete_q")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: deleteError ? 8 : 18 }}>
              {t("delete_body")}
            </p>
            {deleteError ? (
              <p style={{ fontSize: 12.5, color: "var(--rose)", marginBottom: 14 }}>{deleteError}</p>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="rounded-[9px] border border-border bg-transparent px-4 py-[9px] text-[13px] font-semibold text-foreground hover:bg-muted max-sm:min-h-11"
              >
                {t("keep_note")}
              </button>
              <Button
                variant="destructive"
                className="h-auto rounded-[9px] px-4 py-[9px] text-[13px] font-semibold max-sm:min-h-11"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  setDeleteError(null);
                  try {
                    await onDelete?.();
                    // The caller navigates away / closes on success.
                  } catch (error) {
                    setDeleting(false);
                    setDeleteError(
                      error instanceof Error && error.message
                        ? error.message
                        : t("delete_error"),
                    );
                  }
                }}
              >
                {deleting ? t("deleting") : t("delete")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </SheetFrame>
  );
```

- [ ] **Step 12: Taste & Rate's modal takes the shared class**

In `src/components/new-note-modal.tsx`, after `import type { WsetSheetHandle } from "@/components/wset/wset-sheet";` add:

```tsx
import { SHEET_DIALOG_CLASS } from "@/components/wset/sheet-shell";
```

and replace

```tsx
        className="inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[92vh] sm:max-h-[92vh] sm:w-[calc(100vw-3rem)] sm:max-w-[1100px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-4 sm:rounded-[16px] lg:max-w-[1400px]"
```

with

```tsx
        className={SHEET_DIALOG_CLASS}
```

(The comment above it stays.)

- [ ] **Step 13: The note form is unchanged**

Run: `npx vitest run src/components/wset/sheet-markup.test.tsx src/components/wset/sheet-shell.test.tsx src/lib/wset/sheet-steps.test.ts src/app/catalog`
Expected: all pass; the six snapshots unchanged (a diff here means the move was not verbatim — fix the move, never `-u`).

- [ ] **Step 14: Gates**

Run: `npx vitest run` → all pass.
Run: `npx tsc --noEmit` → no output.
Run: `npx eslint src/components/wset src/lib/wset/sheet-steps.ts src/lib/wset/sheet-steps.test.ts src/components/new-note-modal.tsx` → no output.

- [ ] **Step 15: Commit**

```bash
git add src/lib/wset/sheet-steps.ts src/lib/wset/sheet-steps.test.ts src/components/wset/sheet-shell.tsx src/components/wset/sheet-shell.test.tsx src/components/wset/wset-sheet.tsx src/components/new-note-modal.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "refactor(wset): the note sheet's frame becomes a shared shell" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Editable ranges on the note's sliders

`SnapSlider` and `QualitySlider` learn to edit a low→high band; their single-value and read-only modes render byte for byte as before.

**Files:**
- Create: `src/lib/wset/range-edit.ts`, `src/lib/wset/range-edit.test.ts`
- Create: `src/components/wset/range-sliders.test.tsx`
- Modify: `src/components/wset/snap-slider.tsx` (import at line 3; the `SnapSlider` component and its comment, lines 86–347)
- Modify: `src/components/wset/quality-slider.tsx` (whole file)

**Interfaces:**
- Consumes: Task 1's gate.
- Produces (`range-edit.ts`): `type Band = readonly [number, number]`; `tapBand(band: Band | null, at: number): { band: Band; anchor: number }`; `dragBand(anchor: number, at: number): Band`; `sameBand(a: Band | null, b: Band | null): boolean`; `bandOnStops<T>(stops: readonly T[], range: readonly [T, T] | null): Band | null`; `scoreBand(range: readonly [number, number] | null): Band | null`.
- Produces (`SnapSlider`): new optional prop `onRangeChange?: (range: [T, T]) => void`. With it (and not `readOnly`), `range` is the band being edited (`null` = not set yet). Never called with an unchanged band.
- Produces (`QualitySlider`): props become `{ score: number | null; onChange: (score: number | null) => void; lang?: WsetLang }` **or** `{ range: readonly [number, number] | null; onRangeChange: (range: [number, number]) => void; lang?: WsetLang }`. Existing callers are unchanged.

- [ ] **Step 1: Write the failing rule test**

Create `src/lib/wset/range-edit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bandOnStops, dragBand, sameBand, scoreBand, tapBand } from "./range-edit";

describe("tapBand (EditableRange's rule)", () => {
  it("seeds a one-stop band on the first tap", () => {
    expect(tapBand(null, 2)).toEqual({ band: [2, 2], anchor: 2 });
  });

  it("extends the nearer end to a tap outside the band", () => {
    expect(tapBand([2, 3], 0)).toEqual({ band: [0, 3], anchor: 3 });
    expect(tapBand([2, 3], 4)).toEqual({ band: [2, 4], anchor: 2 });
  });

  it("moves the nearer end in on a tap inside the band, a tie going to the low end", () => {
    expect(tapBand([0, 4], 1)).toEqual({ band: [1, 4], anchor: 4 });
    expect(tapBand([0, 4], 3)).toEqual({ band: [0, 3], anchor: 0 });
    expect(tapBand([0, 4], 2)).toEqual({ band: [2, 4], anchor: 4 });
  });

  it("leaves the band alone on a tap at either end", () => {
    expect(tapBand([1, 3], 1).band).toEqual([1, 3]);
    expect(tapBand([1, 3], 3).band).toEqual([1, 3]);
    expect(tapBand([2, 2], 2).band).toEqual([2, 2]);
  });

  it("works on scores as well as stop indices", () => {
    expect(tapBand(null, 88)).toEqual({ band: [88, 88], anchor: 88 });
    expect(tapBand([88, 92], 96)).toEqual({ band: [88, 96], anchor: 88 });
  });
});

describe("dragBand", () => {
  it("spans the anchor and the pointer, low first", () => {
    expect(dragBand(1, 4)).toEqual([1, 4]);
    expect(dragBand(3, 0)).toEqual([0, 3]);
    expect(dragBand(2, 2)).toEqual([2, 2]);
  });

  it("a press that seeded a band and slides right grows it from the seed", () => {
    const { anchor } = tapBand(null, 1);
    expect(dragBand(anchor, 3)).toEqual([1, 3]);
  });
});

describe("sameBand", () => {
  it("compares both ends, and null only with null", () => {
    expect(sameBand([1, 2], [1, 2])).toBe(true);
    expect(sameBand([1, 2], [1, 3])).toBe(false);
    expect(sameBand(null, null)).toBe(true);
    expect(sameBand(null, [0, 0])).toBe(false);
  });
});

describe("bandOnStops", () => {
  const stops = ["LOW", "MEDIUM", "HIGH"] as const;

  it("maps a range to stop indices, low first", () => {
    expect(bandOnStops(stops, ["MEDIUM", "HIGH"])).toEqual([1, 2]);
    expect(bandOnStops(stops, ["HIGH", "LOW"])).toEqual([0, 2]);
  });

  it("is null for no range, or a bound that is not a stop", () => {
    expect(bandOnStops(stops, null)).toBeNull();
    expect(bandOnStops<string>(stops, ["MEDIUM_PLUS", "HIGH"])).toBeNull();
  });
});

describe("scoreBand", () => {
  it("orders a score range low first", () => {
    expect(scoreBand([96, 88])).toEqual([88, 96]);
    expect(scoreBand([88, 96])).toEqual([88, 96]);
    expect(scoreBand(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/wset/range-edit.test.ts`
Expected: FAIL — `Failed to resolve import "./range-edit"`.

- [ ] **Step 3: Write the rule**

Create `src/lib/wset/range-edit.ts`:

```ts
// Editing a low→high band on a scale: the rule the admin typical-wine editor's
// sliders follow (SnapSlider's and QualitySlider's editable range modes). A
// band is two positions, low first — stop indices on a SnapSlider, scores
// 50–100 on the QualitySlider. Pure, no imports, so vitest loads it.
//
// A tap (EditableRange's rule, which this replaces): outside the band extends
// the nearer end to it; inside moves the nearer end in (a tie goes to the low
// end); with no band it seeds a one-stop band. Tapping an end changes nothing
// — the row's "clear" empties a band. A press that slides on keeps the end it
// took and moves the other: the far end is the anchor.

/** Two positions on a scale, low first. */
export type Band = readonly [number, number];

/** A tap at `at`: the new band, and the anchor a drag from here holds still. */
export function tapBand(band: Band | null, at: number): { band: Band; anchor: number } {
  if (band === null) return { band: [at, at], anchor: at };
  const [lo, hi] = band;
  if (at < lo) return { band: [at, hi], anchor: hi };
  if (at > hi) return { band: [lo, at], anchor: lo };
  if (at - lo <= hi - at) return { band: [at, hi], anchor: hi };
  return { band: [lo, at], anchor: lo };
}

/** The band while a press holds `anchor` and the pointer is at `at`; crossing the anchor swaps the ends. */
export function dragBand(anchor: number, at: number): Band {
  return anchor <= at ? [anchor, at] : [at, anchor];
}

export function sameBand(a: Band | null, b: Band | null): boolean {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1];
}

/** A range's band on `stops`, low first; null when either bound is not a stop. */
export function bandOnStops<T>(stops: readonly T[], range: readonly [T, T] | null): Band | null {
  if (range === null) return null;
  const a = stops.indexOf(range[0]);
  const b = stops.indexOf(range[1]);
  if (a < 0 || b < 0) return null;
  return a <= b ? [a, b] : [b, a];
}

/** A score range as a band, low first. */
export function scoreBand(range: readonly [number, number] | null): Band | null {
  if (range === null) return null;
  return range[0] <= range[1] ? [range[0], range[1]] : [range[1], range[0]];
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/wset/range-edit.test.ts`
Expected: `11 passed`.

- [ ] **Step 5: Write the failing slider test**

Create `src/components/wset/range-sliders.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LABELS, LEVEL_STOPS } from "../../lib/wset/vocab";
import { QualitySlider } from "./quality-slider";
import { SnapSlider } from "./snap-slider";

// The editable range modes' first paint (the admin typical-wine editor). The
// read-only and single-value modes are pinned byte for byte by
// sheet-markup.test.tsx; the gestures themselves are range-edit.ts's, tested
// there, and checked by hand in the browser (plan Task 6).

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("SnapSlider, editable range mode", () => {
  it("with no band yet: a faded track, no caps, every stop a live unpressed button, the per-stop labels", () => {
    const html = renderToStaticMarkup(
      <SnapSlider stops={LEVEL_STOPS} labels={LABELS} value={null} range={null} onRangeChange={noop} />,
    );
    expect(html).toContain("opacity:0.4");
    expect(html).toContain('data-slot="slider-hit"');
    expect(count(html, 'aria-pressed="false"')).toBe(5);
    expect(html).not.toContain("disabled");
    expect(count(html, "width:16px")).toBe(0);
    expect(html).toContain('class="max-sm:hidden"');
  });

  it("with a band: two caps, and the stops inside it pressed", () => {
    const html = renderToStaticMarkup(
      <SnapSlider stops={LEVEL_STOPS} labels={LABELS} value={null} range={["MEDIUM_PLUS", "HIGH"]} onRangeChange={noop} />,
    );
    expect(html).toContain("opacity:1");
    expect(count(html, "width:16px")).toBe(2);
    expect(count(html, 'aria-pressed="true"')).toBe(2);
    expect(count(html, 'aria-pressed="false"')).toBe(3);
  });

  it("a band with a bound off these stops draws nothing, as if unset", () => {
    const html = renderToStaticMarkup(
      <SnapSlider stops={["LOW", "MEDIUM", "HIGH"]} labels={LABELS} value={null} range={["MEDIUM_PLUS", "HIGH"]} onRangeChange={noop} />,
    );
    expect(html).toContain("opacity:0.4");
    expect(count(html, "width:16px")).toBe(0);
    expect(count(html, 'aria-pressed="true"')).toBe(0);
  });

  it("readOnly wins over onRangeChange: no hit layer, disabled stops", () => {
    const html = renderToStaticMarkup(
      <SnapSlider stops={LEVEL_STOPS} labels={LABELS} value={null} range={["LOW", "MEDIUM"]} onRangeChange={noop} readOnly />,
    );
    expect(html).not.toContain('data-slot="slider-hit"');
    expect(html).not.toContain("aria-pressed");
    expect(html).toContain("disabled");
  });
});

describe("QualitySlider, range mode", () => {
  it("with a range: low–high, the top's band word, two gold caps, the ticks inside pressed", () => {
    const html = renderToStaticMarkup(<QualitySlider range={[88, 96]} onRangeChange={noop} />);
    expect(html).toContain("88–96");
    expect(html).toContain("Extraordinary");
    expect(count(html, "width:18px")).toBe(2);
    // 90 and 95 lie inside 88–96.
    expect(count(html, 'aria-pressed="true"')).toBe(2);
  });

  it("a one-score range reads as that score", () => {
    const html = renderToStaticMarkup(<QualitySlider range={[90, 90]} onRangeChange={noop} />);
    expect(html).toContain(">90<");
    expect(html).toContain("Outstanding");
  });

  it("with no range: a dash and the dashed ghost thumb", () => {
    const html = renderToStaticMarkup(<QualitySlider range={null} onRangeChange={noop} />);
    expect(html).toContain(">—<");
    expect(html).toContain("2px dashed var(--placeholder-soft)");
    expect(count(html, 'aria-pressed="true"')).toBe(0);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx vitest run src/components/wset/range-sliders.test.tsx`
Expected: FAIL — e.g. `expected '…' to contain 'data-slot="slider-hit"'` (the sliders ignore `onRangeChange` so far).

- [ ] **Step 7: SnapSlider's editable range mode**

In `src/components/wset/snap-slider.tsx`, after `import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";` add:

```tsx
import { bandOnStops, dragBand, sameBand, tapBand, type Band } from "@/lib/wset/range-edit";
```

Then replace everything from the comment line that begins `// A snapping graded slider for the WSET scales.` to the end of the file (the `SnapSlider` component; `SLIDE_SLOP`, the slide-state helpers and `useSlideGesture` above it stay) with:

```tsx
// A snapping graded slider for the WSET scales. Value is one of `stops` or null
// (the unrated ghost state). Pointer-capture drag snaps to the nearest stop.
// Read-only `range` mode draws a low→high band (both end-caps) instead of a
// single thumb — used to visualise an archetype's typical range. Editable range
// mode (`onRangeChange`, the admin's typical-wine editor) draws the same band
// and edits it by range-edit.ts's rule: a tap outside the band extends the
// nearer end, inside moves the nearer end in, the first tap seeds a one-stop
// band, and a press that slides on moves the end it took. With no band yet the
// track fades like an unrated scale.
//
// The pointer lives on an invisible 44px hit layer over the 6px track (reaching
// past both ends by the thumb's radius), not on the track itself, so a finger
// that lands a few pixels off the line still presses the scale — rated or
// unrated. A mouse sets the nearest stop on press; a finger waits for intent
// (useSlideGesture): a tap sets it on lift, a sideways drag follows once past
// the slop, and an up/down swipe is left to the browser (touch-action: pan-y)
// so the note still scrolls. The thumb stays pointer-events none and is never
// pre-rendered: the thumb appears where the first value lands. The stop dots
// stay buttons under the layer for keyboard and screen-reader users: Enter on
// one is a tap on it (in range mode each reports whether it is in the band).
export function SnapSlider<T extends string>({
  stops,
  value,
  onChange,
  labels,
  staggered,
  range = null,
  readOnly = false,
  onRangeChange,
}: {
  stops: readonly T[];
  value: T | null;
  onChange?: (value: T) => void;
  labels: Record<string, string>;
  staggered?: boolean;
  /** Read-only: the band drawn. With `onRangeChange`: the band being edited
      (null: not set yet). */
  range?: readonly [T, T] | null;
  readOnly?: boolean;
  /** Editable range mode. Never called with an unchanged band; clearing is
      the caller's own control. */
  onRangeChange?: (range: [T, T]) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  // The end a range press holds still while it slides (range-edit.ts's
  // anchor); null until the press's first write.
  const anchorRef = useRef<number | null>(null);
  const n = stops.length;
  const index = value === null ? null : stops.indexOf(value);
  const useStagger = staggered ?? n >= 4;
  const pct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const editRange = !readOnly && onRangeChange !== undefined;
  // Band mode: a read-only band, or an editable one (drawn or not yet set).
  const rangeMode = range !== null || editRange;
  // The band being edited, as stop indices; a bound off these stops draws
  // nothing and the next tap seeds a fresh band.
  const band = editRange ? bandOnStops(stops, range) : null;
  const shown = editRange && band === null ? null : range;

  // Range band bounds (sorted); -1 when no band is drawn.
  const rLo = shown ? Math.min(stops.indexOf(shown[0]), stops.indexOf(shown[1])) : -1;
  const rHi = shown ? Math.max(stops.indexOf(shown[0]), stops.indexOf(shown[1])) : -1;
  const inRange = (i: number) => shown !== null && i >= rLo && i <= rHi;
  const interactive = !readOnly && (!!onChange || editRange);

  // A band change, reported only when it changes something.
  const commitBand = useCallback(
    (next: Band) => {
      if (onRangeChange && !sameBand(band, next)) onRangeChange([stops[next[0]], stops[next[1]]]);
    },
    [band, onRangeChange, stops],
  );

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const at = Math.round(frac * (n - 1));
      if (editRange) {
        // The press's first write is a tap; the rest slide the end it took.
        const anchor = anchorRef.current;
        const next = anchor === null ? tapBand(band, at) : { band: dragBand(anchor, at), anchor };
        anchorRef.current = next.anchor;
        commitBand(next.band);
        return;
      }
      if (!onChange) return;
      onChange(stops[at]);
    },
    [band, commitBand, editRange, n, onChange, stops],
  );
  const gesture = useSlideGesture(setFromClientX);
  // Each new press starts with a tap.
  const hitHandlers = editRange
    ? {
        ...gesture,
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
          anchorRef.current = null;
          gesture.onPointerDown(e);
        },
      }
    : gesture;
  // A stop dot or a stop label: the value, or in range mode a tap on it.
  const pick = (i: number) => {
    if (editRange) {
      anchorRef.current = null;
      commitBand(tapBand(band, i).band);
      return;
    }
    onChange!(stops[i]);
  };

  const showLabelRow = rangeMode;
  return (
    // Interactive scales frame the track with just the endpoint labels
    // (Low ○──●──○ High) at every width — the chosen value reads at the row
    // title. The range modes (archetype view, editor) keep the full per-stop
    // label row on desktop: there the labels ARE the content.
    <div
      className={showLabelRow ? "px-0 sm:px-[46px]" : "px-0"}
      style={{ userSelect: "none", touchAction: "pan-y" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={showLabelRow ? "sm:hidden" : undefined}
          style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
        >
          {labels[stops[0]] ?? stops[0]}
        </span>
        <div className="min-w-0 flex-1">
          <div style={{ position: "relative" }}>
            <div
              ref={trackRef}
              style={{
                position: "relative",
                height: 6,
                borderRadius: 3,
                background: "var(--secondary)",
                // Unrated single-value sliders and an unset band fade back; a
                // drawn band is always solid.
                opacity: (rangeMode ? shown === null : index === null) ? 0.4 : 1,
                transition: "opacity 120ms",
              }}
            >
              {rangeMode ? (
                shown !== null ? (
                  <div
                    style={{
                      position: "absolute",
                      left: `${pct(rLo)}%`,
                      top: 0,
                      height: 6,
                      borderRadius: 3,
                      background: "var(--primary)",
                      width: `${pct(rHi) - pct(rLo)}%`,
                    }}
                  />
                ) : null
              ) : index !== null && index > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: 6,
                    borderRadius: 3,
                    background: "var(--primary)",
                    width: `${pct(index)}%`,
                  }}
                />
              ) : null}
              {stops.map((stop, i) => {
                const reached = rangeMode ? inRange(i) : index !== null && i <= index;
                return (
                  <button
                    key={stop}
                    type="button"
                    aria-label={labels[stop] ?? stop}
                    aria-pressed={editRange ? inRange(i) : undefined}
                    onClick={interactive ? () => pick(i) : undefined}
                    disabled={!interactive}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: `${pct(i)}%`,
                      transform: "translate(-50%, -50%)",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      padding: 0,
                      cursor: interactive ? "pointer" : "default",
                      background: reached ? "var(--primary)" : "var(--muted)",
                      border: reached ? "none" : "1px solid var(--border-strong)",
                    }}
                  />
                );
              })}
              {rangeMode ? (
                shown !== null ? (
                  [rLo, rHi].map((i, k) => (
                    <div
                      key={k}
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: `${pct(i)}%`,
                        transform: "translate(-50%, -50%)",
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        pointerEvents: "none",
                        background: "var(--primary)",
                        border: "3px solid var(--card)",
                        boxShadow: "0 1px 4px rgba(42,33,30,0.3)",
                      }}
                    />
                  ))
                ) : null
              ) : index !== null ? (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: `${pct(index)}%`,
                    transform: "translate(-50%, -50%)",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    transition: "left 80ms",
                    pointerEvents: "none",
                    background: "var(--primary)",
                    border: "3px solid var(--card)",
                    boxShadow: "0 1px 5px rgba(42,33,30,0.35)",
                  }}
                />
              ) : null}
              {shown !== null && index !== null && index >= 0 ? (
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
              // The hit layer: a sibling of the track (so the unrated fade
              // never reaches it), 44px tall and centred on the line, 11px past
              // each end so the first and last stops take a thumb-wide press.
              // pan-y lets a vertical swipe that starts here scroll the note.
              <div
                aria-hidden
                data-slot="slider-hit"
                {...hitHandlers}
                style={{
                  position: "absolute",
                  left: -11,
                  right: -11,
                  top: "50%",
                  height: 44,
                  transform: "translateY(-50%)",
                  zIndex: 1,
                  cursor: "pointer",
                  touchAction: "pan-y",
                }}
              />
            ) : null}
          </div>
        </div>
        <span
          className={showLabelRow ? "sm:hidden" : undefined}
          style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
        >
          {labels[stops[n - 1]] ?? stops[n - 1]}
        </span>
      </div>
      <div className={showLabelRow ? "max-sm:hidden" : "hidden"} style={{ position: "relative", height: useStagger ? 32 : 18, marginTop: 8 }}>
        {stops.map((stop, i) => {
          const active = rangeMode ? shown !== null && (i === rLo || i === rHi) : index === i;
          const lower = useStagger && i % 2 === 1;
          return (
            <button
              key={stop}
              type="button"
              onClick={interactive ? () => pick(i) : undefined}
              disabled={!interactive}
              style={{
                position: "absolute",
                left: `${pct(i)}%`,
                top: lower ? 15 : 0,
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                fontSize: 11,
                cursor: interactive ? "pointer" : "default",
                background: "none",
                border: "none",
                padding: 0,
                fontWeight: active ? 700 : 500,
                color: active ? "var(--foreground)" : "var(--placeholder)",
              }}
            >
              {labels[stop] ?? stop}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

What stays byte-identical, and why: with no `onRangeChange`, `editRange` is false, `shown === range`, `rangeMode === (range !== null)`, the hit layer gets `gesture` itself, and `aria-pressed` is `undefined` (omitted from the markup) — every expression reduces to the old one.

- [ ] **Step 8: QualitySlider's range mode**

Replace `src/components/wset/quality-slider.tsx` with:

```tsx
"use client";

import { useCallback, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  scoreToPct,
  pctToScore,
  qualityBand,
} from "@/lib/wset/quality-curve.mjs";
import { makeT, translateBand, type WsetLang } from "@/lib/wset/i18n";
import { dragBand, sameBand, scoreBand, tapBand, type Band } from "@/lib/wset/range-edit";
import { cn } from "@/lib/utils";
import { useSlideGesture } from "./snap-slider";

const TICKS = [50, 70, 80, 85, 90, 95, 100];

/** One score (the note), or a low→high score range (the admin's typical-wine editor). */
type QualitySliderProps =
  | {
      score: number | null;
      onChange: (score: number | null) => void;
      lang?: WsetLang;
      range?: undefined;
      onRangeChange?: undefined;
    }
  | {
      /** null: not set yet. */
      range: readonly [number, number] | null;
      /** Never called with an unchanged range; clearing is the caller's own control. */
      onRangeChange: (range: [number, number]) => void;
      lang?: WsetLang;
      score?: undefined;
      onChange?: undefined;
    };

// The weighted 100-point quality slider (WSET quality replaced by a
// Parker-style score). Track position is non-linear via the shared
// quality-curve module: 85 sits at 40% (the gold knee), 90 at 70%, so the
// 85-92 band where most wines land gets the widest travel.
//
// Why the scale is weighted is a collapsed "Why 100 points?" disclosure — read
// once, not four lines under the control every time. Its trigger sits at the
// right of the score line on desktop and under the scale on phones: two slots,
// one state, one keep-mounted panel under the scale. As in SnapSlider an
// invisible 44px hit layer over the 6px track owns the pointer, with the same
// press intent (useSlideGesture: a finger waits, so a swipe from the scale
// still scrolls). The score line and the tick labels sit above that layer, so
// the "Why 100 points?" pill always opens and a tap on "85" is exactly 85.
//
// Range mode (`onRangeChange`) edits a typical range on the same scale by
// range-edit.ts's rule, on whole scores: the score line reads "88–96" and the
// band word of its top, the track draws the band between two gold caps.
export function QualitySlider(props: QualitySliderProps) {
  const lang = props.lang ?? "en";
  const t = makeT(lang);
  const trackRef = useRef<HTMLDivElement>(null);
  // The end a range press holds still while it slides; null until the press's
  // first write.
  const anchorRef = useRef<number | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();
  const onChange = props.onChange;
  const onRangeChange = props.onRangeChange;
  const score = props.onRangeChange === undefined ? props.score : null;
  const band = props.onRangeChange === undefined ? null : scoreBand(props.range);

  // A band change, reported only when it changes something.
  const commitBand = useCallback(
    (next: Band) => {
      if (onRangeChange && !sameBand(band, next)) onRangeChange([next[0], next[1]]);
    },
    [band, onRangeChange],
  );

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      const at = pctToScore(pct);
      if (onRangeChange) {
        // The press's first write is a tap; the rest slide the end it took.
        const anchor = anchorRef.current;
        const next = anchor === null ? tapBand(band, at) : { band: dragBand(anchor, at), anchor };
        anchorRef.current = next.anchor;
        commitBand(next.band);
        return;
      }
      onChange?.(at);
    },
    [band, commitBand, onChange, onRangeChange],
  );
  const gesture = useSlideGesture(setFromClientX);
  // Each new range press starts with a tap.
  const hitHandlers = onRangeChange
    ? {
        ...gesture,
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
          anchorRef.current = null;
          gesture.onPointerDown(e);
        },
      }
    : gesture;
  // A tick dot or a tick label: that score, or in range mode a tap on it.
  const pickTick = (tick: number) => {
    if (onRangeChange) {
      anchorRef.current = null;
      commitBand(tapBand(band, tick).band);
      return;
    }
    onChange?.(tick);
  };

  const pos = score === null ? null : scoreToPct(score);
  const bandPct = band === null ? null : ([scoreToPct(band[0]), scoreToPct(band[1])] as const);
  const rangeMode = onRangeChange !== undefined;

  const whyTrigger = (className: string) => (
    <button
      type="button"
      aria-expanded={whyOpen}
      aria-controls={whyId}
      onClick={() => setWhyOpen((open) => !open)}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-[5px] text-[11.5px] font-semibold text-primary hover:bg-muted",
        className,
      )}
    >
      {t("why_100")}
      <ChevronDown
        aria-hidden
        className={cn("size-3.5 transition-transform", whyOpen && "rotate-180")}
      />
    </button>
  );

  return (
    <div>
      {/* Above the hit layer (z 1), whose 44px reaches up into this line. */}
      <div className="relative z-[2] mb-2.5 flex items-baseline gap-2.5">
        <span className="font-heading text-[31px] leading-none font-semibold text-foreground tabular-nums">
          {rangeMode
            ? band === null
              ? "—"
              : band[0] === band[1]
                ? band[0]
                : `${band[0]}–${band[1]}`
            : score === null
              ? "—"
              : score}
        </span>
        {rangeMode ? (
          band !== null ? (
            <span className="text-[12px] font-semibold text-gold-dark">
              {translateBand(qualityBand(band[1]), lang)}
            </span>
          ) : null
        ) : score !== null ? (
          <span className="text-[12px] font-semibold text-gold-dark">
            {translateBand(qualityBand(score), lang)}
          </span>
        ) : null}
        {whyTrigger("ml-auto self-center max-sm:hidden")}
      </div>
      <div style={{ padding: "0 46px", userSelect: "none", touchAction: "pan-y" }}>
        <div style={{ position: "relative" }}>
          <div
            ref={trackRef}
            style={{
              position: "relative",
              height: 6,
              borderRadius: 3,
              background: "var(--secondary)",
            }}
          >
            {rangeMode ? (
              bandPct !== null ? (
                <div
                  style={{
                    position: "absolute",
                    left: `${bandPct[0]}%`,
                    top: 0,
                    height: 6,
                    borderRadius: 3,
                    background: "var(--gold)",
                    width: `${bandPct[1] - bandPct[0]}%`,
                  }}
                />
              ) : null
            ) : pos !== null && pos > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: 6,
                  borderRadius: 3,
                  background: "var(--gold)",
                  width: `${pos}%`,
                }}
              />
            ) : null}
            {/* knee marker at score 85 (40%) */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "40%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 2,
                height: 14,
                background: "var(--gold-deep)",
              }}
            />
            {TICKS.map((tick) => {
              const tickPct = scoreToPct(tick);
              const reached = rangeMode
                ? bandPct !== null && tickPct >= bandPct[0] && tickPct <= bandPct[1]
                : pos !== null && tickPct <= pos;
              return (
                <button
                  key={tick}
                  type="button"
                  aria-label={`${t("score")} ${tick}`}
                  aria-pressed={rangeMode ? reached : undefined}
                  onClick={() => pickTick(tick)}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: `${tickPct}%`,
                    transform: "translate(-50%, -50%)",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    padding: 0,
                    cursor: "pointer",
                    background: reached ? "var(--gold-deep)" : "var(--muted)",
                    border: "1px solid var(--border-strong)",
                  }}
                />
              );
            })}
            {rangeMode ? (
              bandPct !== null ? (
                bandPct.map((p, k) => (
                  <div
                    key={k}
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: `${p}%`,
                      transform: "translate(-50%, -50%)",
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      pointerEvents: "none",
                      background: "var(--gold)",
                      border: "3px solid var(--card)",
                      boxShadow: "0 1px 5px rgba(42,33,30,0.35)",
                    }}
                  />
                ))
              ) : (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "40%",
                    transform: "translate(-50%, -50%)",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    pointerEvents: "none",
                    background: "transparent",
                    border: "2px dashed var(--placeholder-soft)",
                  }}
                />
              )
            ) : (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${pos === null ? 40 : pos}%`,
                  transform: "translate(-50%, -50%)",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  transition: "left 60ms",
                  pointerEvents: "none",
                  background: pos === null ? "transparent" : "var(--gold)",
                  border: pos === null ? "2px dashed var(--placeholder-soft)" : "3px solid var(--card)",
                  boxShadow: pos === null ? "none" : "0 1px 5px rgba(42,33,30,0.35)",
                }}
              />
            )}
          </div>
          <div
            aria-hidden
            data-slot="slider-hit"
            {...hitHandlers}
            style={{
              position: "absolute",
              left: -11,
              right: -11,
              top: "50%",
              height: 44,
              transform: "translateY(-50%)",
              zIndex: 1,
              cursor: "pointer",
              touchAction: "pan-y",
            }}
          />
        </div>
        <div style={{ position: "relative", zIndex: 2, height: 18, marginTop: 8, pointerEvents: "none" }}>
          {TICKS.map((tick) => (
            <button
              key={tick}
              type="button"
              onClick={() => pickTick(tick)}
              style={{
                position: "absolute",
                left: `${scoreToPct(tick)}%`,
                top: 0,
                transform: "translateX(-50%)",
                fontSize: 11,
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                pointerEvents: "auto",
                fontWeight: tick === 85 ? 700 : 500,
                color: tick === 85 ? "var(--gold-dark)" : "var(--muted-foreground)",
              }}
            >
              {tick}
            </button>
          ))}
        </div>
      </div>
      {/* The phone trigger alone gets the 44px strip: on desktop a strip would
          hang below the score line into the slider's hit layer. */}
      {whyTrigger(
        "mt-3 sm:hidden before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
      )}
      <p
        id={whyId}
        hidden={!whyOpen}
        className="mt-2.5 max-w-[68ch] text-[11.5px] leading-relaxed text-muted-foreground"
      >
        {t("quality_help")}
      </p>
    </div>
  );
}
```

The single-score branch of every expression is the old code; the tick dots' `aria-pressed` is `undefined` there.

- [ ] **Step 9: Run the slider tests and the gate**

Run: `npx vitest run src/components/wset/range-sliders.test.tsx src/components/wset/sheet-markup.test.tsx src/lib/wset/range-edit.test.ts`
Expected: `7 passed`, `6 passed`, `11 passed`; snapshots unchanged.

- [ ] **Step 10: Gates**

Run: `npx vitest run` → all pass.
Run: `npx tsc --noEmit` → no output.
Run: `npx eslint src/components/wset src/lib/wset/range-edit.ts src/lib/wset/range-edit.test.ts` → no output.

- [ ] **Step 11: Commit**

```bash
git add src/lib/wset/range-edit.ts src/lib/wset/range-edit.test.ts src/components/wset/range-sliders.test.tsx src/components/wset/snap-slider.tsx src/components/wset/quality-slider.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(wset): the note's sliders edit a typical range" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The archetype sheet's editable mode

One component draws an archetype everywhere; with `edit` it is the admin's four WSET tabs.

**Files:**
- Create: `src/components/wset/archetype-sheet-edit.test.tsx`
- Modify: `src/components/wset/wset-sheet.tsx` (`Row`, lines 119–168; `SectionCard`'s prop type, line 186)
- Modify: `src/components/wset/aroma-picker.tsx` (imports lines 3–5; after `splitGroupName`, line 98; props lines 111–128; phone chips lines 228–255; desktop "Selected" chips lines 416–441)
- Modify: `src/components/wset/archetype-sheet.tsx` (whole file)

**Interfaces:**
- Consumes: Task 3's `SnapSlider` `onRangeChange` and `QualitySlider` `{ range, onRangeChange }`.
- Produces (`wset-sheet.tsx`): `Row` gains `labelId?: string` (an `id` on the title span) and `action?: ReactNode` (at the far end of the title line); `SectionCard`'s `numeral` becomes `React.ReactNode`.
- Produces (`aroma-picker.tsx`): `export type AromaSignature = { ids: readonly string[]; onToggle: (termId: string) => void; label: (term: string) => string }`; `AromaPicker` gains `signature?: AromaSignature`.
- Produces (`archetype-sheet.tsx`): `export type ArchetypeSection = "appearance" | "nose" | "palate" | "conclusions"`; `export type SignedTerm = { termId: string; signature: boolean }`; `export type ArchetypeSheetEdit = { section: ArchetypeSection | null; ladders: Partial<Record<ArchetypeScale, readonly string[]>>; terms: AromaTerm[]; nose: readonly SignedTerm[]; palate: readonly SignedTerm[]; onRange: (key: ArchetypeScale, range: [string, string] | null) => void; onQuality: (range: [number, number] | null) => void; onAromas: (kind: "nose" | "palate", ids: string[]) => void; onSignature: (kind: "nose" | "palate", termId: string) => void; signatureHint: string; signatureLabel: (term: string) => string }`; `ArchetypeSheet` gains `edit?: ArchetypeSheetEdit`.

- [ ] **Step 1: Write the failing edit-mode test**

Create `src/components/wset/archetype-sheet-edit.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AromaTerm } from "../../lib/wset/types";
import { ArchetypeSheet, type ArchetypeSheetEdit, type ArchetypeView } from "./archetype-sheet";

// The archetype sheet's editable mode (the admin typical-wine editor), first
// paint. Its read-only mode is pinned byte for byte by sheet-markup.test.tsx.

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const HIDDEN_CARD = 'class="scroll-mt-[118px] sm:scroll-mt-0 hidden"';
const SHOWN_CARD = 'class="scroll-mt-[118px] sm:scroll-mt-0"';

const TERMS: AromaTerm[] = [
  { id: "t-blackcurrant", family: "FRUIT", origin: "PRIMARY", groupName: "Black fruit", term: "blackcurrant", sortOrder: 1 },
  { id: "t-lemon", family: "FRUIT", origin: "PRIMARY", groupName: "Citrus fruit", term: "lemon", sortOrder: 2 },
];

const WHITE_SPARKLING: ArchetypeView = {
  name: "A typical Champagne",
  colour: "WHITE",
  style: "SPARKLING",
  placeName: null,
  lineage: "",
  grapes: "",
  description: "Chalky and taut.",
  qualityLow: 88,
  qualityHigh: 94,
  sat: { acidity: ["HIGH", "HIGH"], mousse: ["DELICATE", "CREAMY"] },
  aromas: [],
  flavours: [],
};

const LADDERS: ArchetypeSheetEdit["ladders"] = {
  appearanceIntensity: ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"],
  colourHue: ["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"],
  noseIntensity: ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "PRONOUNCED"],
  development: ["YOUTHFUL", "DEVELOPING", "FULLY_DEVELOPED", "TIRED_PAST_BEST"],
  sweetness: ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"],
  acidity: ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"],
  tannin: ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"],
  alcohol: ["LOW", "MEDIUM", "HIGH"],
  body: ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "FULL"],
  flavourIntensity: ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "PRONOUNCED"],
  finish: ["SHORT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "LONG"],
  mousse: ["DELICATE", "CREAMY", "AGGRESSIVE"],
};

function edit(overrides: Partial<ArchetypeSheetEdit> = {}): ArchetypeSheetEdit {
  return {
    section: "palate",
    ladders: LADDERS,
    terms: TERMS,
    nose: [{ termId: "t-blackcurrant", signature: true }],
    palate: [{ termId: "t-lemon", signature: false }],
    onRange: noop,
    onQuality: noop,
    onAromas: noop,
    onSignature: noop,
    signatureHint: "Signature terms — an exact hit earns a bonus",
    signatureLabel: (term) => `Signature term: ${term}`,
    ...overrides,
  };
}

describe("ArchetypeSheet, editable", () => {
  it("shows only the chosen section; the others stay mounted, hidden", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit()} />);
    expect(count(html, HIDDEN_CARD)).toBe(3);
    expect(count(html, SHOWN_CARD)).toBe(1);
    expect(html).toContain(`<section id="palate" ${SHOWN_CARD}`);
  });

  it("hides all four while the editor's own Wine tab is showing", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit({ section: null })} />);
    expect(count(html, HIDDEN_CARD)).toBe(4);
  });

  it("draws no header and no description row: the editor's bar and Wine tab have them", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit()} />);
    expect(html).not.toContain("A typical Champagne");
    expect(html).not.toContain("typical profile");
    expect(html).not.toContain("In a nutshell");
    expect(html).not.toContain("Chalky and taut.");
  });

  it("gives every edited scale a live slider, and a clear to each set range and the quality", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit()} />);
    // Twelve scales on sparkling, each with a hit layer, plus the quality slider's.
    expect(count(html, 'data-slot="slider-hit"')).toBe(13);
    // acidity, mousse and the quality range are set.
    expect(count(html, 'aria-label="clear: ')).toBe(3);
    expect(html).toContain('aria-label="clear: Mousse"');
    expect(html).toContain("88–94");
  });

  it("skips a scale the editor does not edit (mousse off sparkling)", () => {
    const still: ArchetypeSheetEdit["ladders"] = { ...LADDERS };
    delete still.mousse;
    const html = renderToStaticMarkup(
      <ArchetypeSheet a={{ ...WHITE_SPARKLING, style: "STILL" }} edit={edit({ ladders: still })} />,
    );
    expect(html).not.toContain(">Mousse<");
    expect(count(html, 'data-slot="slider-hit"')).toBe(12);
  });

  it("a saved range with a bound off the edit ladder shows its words and a clear, and draws no band", () => {
    // MEDIUM_PLUS is on the fortified alcohol ladder only (a batch row, or a
    // style changed outside this editor).
    const html = renderToStaticMarkup(
      <ArchetypeSheet
        a={{ ...WHITE_SPARKLING, sat: { alcohol: ["MEDIUM_PLUS", "HIGH"] } }}
        edit={edit({ section: "palate" })}
      />,
    );
    expect(html).toContain("medium(+) → high");
    expect(html).toContain('aria-label="clear: Alcohol"');
    // No 16px band caps on any scale (the quality slider's caps are 18px).
    expect(count(html, "width:16px")).toBe(0);
  });

  it("keeps an aroma the picker now hides for this colour chosen, visible and starred", () => {
    // blackcurrant is a red-fruit term: the white picker hides it from its
    // groups, but a chosen term stays in the Selected strip with its star.
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit({ section: "nose" })} />);
    expect(html).toContain('aria-label="Signature term: blackcurrant"');
    expect(html).toContain("blackcurrant ×");
  });

  it("marks each chosen aroma's signature with a pressed star", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit()} />);
    expect(html).toContain('aria-pressed="true" aria-label="Signature term: blackcurrant"');
    expect(html).toContain('aria-pressed="false" aria-label="Signature term: lemon"');
    expect(html).toContain("Signature terms — an exact hit earns a bonus");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/wset/archetype-sheet-edit.test.tsx`
Expected: FAIL — e.g. `expected 0 to be 3` (the sheet ignores `edit` and hides nothing) and `expected '…' not to contain 'A typical Champagne'`.

- [ ] **Step 3: Row and SectionCard take what the editor needs**

In `src/components/wset/wset-sheet.tsx` replace

```tsx
export function Row({
  label: rowLabel,
  sub,
  value,
  children,
  wide,
}: {
  label: string;
  sub?: React.ReactNode;
  /** The chosen value, shown emphasised beside the title: "Acidity · high". */
  value?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const heading = (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{rowLabel}</span>
```

with

```tsx
export function Row({
  label: rowLabel,
  labelId,
  sub,
  value,
  action,
  children,
  wide,
}: {
  label: string;
  /** An id on the title, for a control that names itself by it
      (`aria-labelledby`: the admin editor's comboboxes and inputs). */
  labelId?: string;
  sub?: React.ReactNode;
  /** The chosen value, shown emphasised beside the title: "Acidity · high". */
  value?: string;
  /** At the far end of the title line (the admin editor's "clear"). */
  action?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const heading = (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span id={labelId} style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{rowLabel}</span>
```

then, a few lines on, replace

```tsx
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--primary-ink)" }}>{value}</span>
          </>
        ) : null}
      </div>
```

with

```tsx
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--primary-ink)" }}>{value}</span>
          </>
        ) : null}
        {action !== undefined ? <span style={{ marginLeft: "auto" }}>{action}</span> : null}
      </div>
```

and in `SectionCard`'s props replace `  numeral: string;` with

```tsx
  /** "I"–"IV", or an icon (the admin editor's Wine section). */
  numeral: React.ReactNode;
```

(An absent `labelId` renders no `id` attribute and an absent `action` renders nothing: the snapshots do not move.)

- [ ] **Step 4: AromaPicker's ★**

In `src/components/wset/aroma-picker.tsx`:

After `import { createPortal } from "react-dom";` add `import { Star } from "lucide-react";`.

After the `splitGroupName` function add:

```tsx
/** Marks chosen terms as signatures (the admin typical-wine editor, training-room D5). */
export type AromaSignature = {
  ids: readonly string[];
  onToggle: (termId: string) => void;
  /** The ★ button's name for a term, e.g. "Signature term: cassis". */
  label: (term: string) => string;
};

// The ★ before a chosen term: pressed = a signature. A 44px target on touch
// (min-h-11), the 26px circle alone on a laptop pointer. Module-level so React
// keeps one component identity across renders.
function SignatureStar({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onToggle}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full md:pointer-fine:min-h-0 md:pointer-fine:min-w-0"
    >
      <span
        aria-hidden
        className="inline-flex size-[26px] items-center justify-center rounded-full border"
        style={{
          borderColor: on ? "var(--gold)" : "var(--border-strong)",
          background: on ? "color-mix(in srgb, var(--gold) 18%, var(--card))" : "var(--card)",
          color: on ? "var(--gold-dark)" : "var(--muted-foreground)",
        }}
      >
        <Star className="size-3.5" fill={on ? "currentColor" : "none"} />
      </span>
    </button>
  );
}
```

In `AromaPicker`'s destructured props add `signature,` after `lang = "en",`, and in its prop type add after `lang?: WsetLang;`:

```tsx
  /** A ★ before every chosen term (phones' summary and the desktop
      "Selected" strip). Omitted: the note form's picker, unchanged. */
  signature?: AromaSignature;
```

In the phone summary (`<div className="sm:hidden">`), the `selectedIds.map` callback currently ends `return ( <button key={id} … aria-label={t("remove", …)} …>…</button> );`. Change `return (` to `const chip = (` and, after that element's closing `);`, add:

```tsx
            if (!signature) return chip;
            return (
              <span key={id} className="inline-flex items-center gap-0.5">
                <SignatureStar
                  on={signature.ids.includes(id)}
                  label={signature.label(translateTerm(term.term, lang))}
                  onToggle={() => signature.onToggle(id)}
                />
                {chip}
              </span>
            );
```

Do the same in the desktop "Selected" strip (the `selectedIds.map` inside `<div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>`): `return (` → `const chip = (`, then after its `);`:

```tsx
              if (!signature) return chip;
              return (
                <span key={id} className="inline-flex items-center gap-0.5">
                  <SignatureStar
                    on={signature.ids.includes(id)}
                    label={signature.label(translateTerm(term.term, lang))}
                    onToggle={() => signature.onToggle(id)}
                  />
                  {chip}
                </span>
              );
```

The two chip `<button>` elements themselves are not edited.

- [ ] **Step 5: The archetype sheet's `edit` mode**

Replace `src/components/wset/archetype-sheet.tsx` with:

```tsx
"use client";

import type { AromaTerm, WineColour, WineStyle } from "@/lib/wset/types";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import {
  archetypeScale,
  type ArchetypeAnswers,
  type ArchetypeScale,
} from "@/lib/wset/archetype-scale";
import { SnapSlider } from "./snap-slider";
import { QualitySlider } from "./quality-slider";
import { AromaPicker } from "./aroma-picker";
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

/** The four WSET sections an archetype is drawn in. */
export type ArchetypeSection = "appearance" | "nose" | "palate" | "conclusions";

/** A chosen aroma and whether it is a signature (training-room D5). */
export type SignedTerm = { termId: string; signature: boolean };

/** Makes the sheet the admin typical-wine editor's four WSET sections. The
    Library, the map and the training room pass none. `a` still carries the
    colour, style, ranges and quality being edited. */
export type ArchetypeSheetEdit = {
  /** The section on screen; the other three stay mounted, hidden. null: none
      (the editor's own Wine tab is showing). */
  section: ArchetypeSection | null;
  /** The scales edited and the ladder each is edited on (profile-rules'
      scalesFor). A scale not here is not drawn. */
  ladders: Partial<Record<ArchetypeScale, readonly string[]>>;
  terms: AromaTerm[];
  nose: readonly SignedTerm[];
  palate: readonly SignedTerm[];
  /** null clears the range. */
  onRange: (key: ArchetypeScale, range: Range | null) => void;
  /** null clears the quality range. */
  onQuality: (range: [number, number] | null) => void;
  onAromas: (kind: "nose" | "palate", ids: string[]) => void;
  onSignature: (kind: "nose" | "palate", termId: string) => void;
  /** Admin copy (English): the aroma rows' sub line and the ★ button's name. */
  signatureHint: string;
  signatureLabel: (term: string) => string;
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

// The editor's "clear" at the end of a range row's title. Its 44px touch strip
// is a ::before (no layout change), so setting or clearing a band never moves
// the slider under the finger; a laptop pointer gets the word alone.
function ClearRange({ text, rowLabel, onClear }: { text: string; rowLabel: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`${text}: ${rowLabel}`}
      className="relative text-[11.5px] font-semibold text-muted-foreground before:absolute before:-inset-x-2.5 before:top-1/2 before:h-11 before:-translate-y-1/2 hover:text-foreground md:pointer-fine:before:hidden"
    >
      {text}
    </button>
  );
}

// The map's "a typical wine from here" — the WSET sheet's look, read-only, with
// each scale drawn as its low→high band. Language follows the shared sheet
// toggle; `L`/`lang` are passed down to the read-only helpers explicitly.
//
// Training room (spec §3.3, §7.2): `answers` draws the taster's answers on the
// ranges ("you: high" beside each band), and `idPrefix` keeps the four section
// ids unique on a page that also renders WsetSheet's own sections.
//
// Admin (`edit`, plan 2026-09-26-archetype-editor-sheet): the same four
// sections and rows, each band an editable slider on the editor's ladder with
// its words as the row's value and a "clear"; the aroma rows are the note
// form's picker with a ★ per chosen term; quality is the note's quality slider
// as a range. No header (the editor's bar has the name), no description row
// (the editor's Wine tab has it), and one section on screen at a time.
export function ArchetypeSheet({
  a,
  answers,
  idPrefix = "",
  edit,
}: {
  a: ArchetypeView;
  answers?: ArchetypeAnswers;
  idPrefix?: string;
  edit?: ArchetypeSheetEdit;
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

  // One scale's row. Read-only: the band's words under the title and the band
  // drawn, or "Varies". Editing: the words as the row's value (or "Varies"
  // under the title while unset), a clear, and the slider on the edit ladder.
  const scaleRow = (key: ArchetypeScale, label: string) => {
    if (!edit) {
      return (
        <Row label={label} sub={sub(key)}>
          {band(key)}
        </Row>
      );
    }
    const stops = edit.ladders[key];
    if (!stops) return null;
    const range = a.sat[key];
    return (
      <Row
        label={label}
        value={range ? rangeLabel(range) : undefined}
        sub={range ? undefined : varies}
        action={range ? <ClearRange text={t("clear")} rowLabel={label} onClear={() => edit.onRange(key, null)} /> : undefined}
      >
        <SnapSlider
          stops={stops}
          labels={L}
          value={null}
          range={range ?? null}
          onRangeChange={(r) => edit.onRange(key, r)}
        />
      </Row>
    );
  };

  // The aroma rows while editing: the note form's picker, a ★ per chosen term.
  const aromaRow = (kind: "nose" | "palate") => {
    if (!edit) return null;
    const links = edit[kind];
    const ids = links.map((l) => l.termId);
    const title = kind === "nose" ? t("aroma_characteristics") : t("flavour_characteristics");
    return (
      <Row wide label={title} sub={edit.signatureHint}>
        <AromaPicker
          terms={edit.terms}
          selectedIds={ids}
          onChange={(next) => edit.onAromas(kind, next)}
          copyFrom={kind === "palate" ? { label: t("copy_from_nose"), ids: edit.nose.map((l) => l.termId) } : undefined}
          colour={a.colour}
          sheetTitle={title}
          lang={lang}
          signature={{
            ids: links.filter((l) => l.signature).map((l) => l.termId),
            onToggle: (termId) => edit.onSignature(kind, termId),
            label: edit.signatureLabel,
          }}
        />
      </Row>
    );
  };

  // While editing, one section on screen at a time; read-only, all four.
  const hiddenUnless = (section: ArchetypeSection) =>
    edit && edit.section !== section ? "hidden" : undefined;

  const quality =
    a.qualityLow != null && a.qualityHigh != null ? ([a.qualityLow, a.qualityHigh] as [number, number]) : null;
  const q = quality ? `${quality[0]}–${quality[1]} · ${translateBand(qualityBand(quality[1]), lang)}` : "—";
  // D11: the lineage names where it is from and its grapes; a view without
  // one falls back to the place and the grapes.
  const where = a.lineage || [a.placeName, a.grapes].filter(Boolean).join(" · ");

  const sections = (
    <>
      <SectionCard
        id={`${idPrefix}appearance`}
        numeral="I"
        title={t("appearance")}
        rated={t("typical")}
        className={hiddenUnless("appearance")}
      >
        {scaleRow("appearanceIntensity", t("intensity"))}
        {scaleRow("colourHue", t("colour"))}
      </SectionCard>

      <SectionCard
        id={`${idPrefix}nose`}
        numeral="II"
        title={t("nose")}
        rated={t("typical")}
        className={hiddenUnless("nose")}
      >
        {scaleRow("noseIntensity", t("intensity"))}
        {scaleRow("development", t("development"))}
        {edit ? (
          aromaRow("nose")
        ) : a.aromas.length > 0 ? (
          <Row wide label={t("aroma_characteristics")} sub={t("typical")}>
            <AromaPills terms={a.aromas} lang={lang} />
          </Row>
        ) : null}
      </SectionCard>

      <SectionCard
        id={`${idPrefix}palate`}
        numeral="III"
        title={t("palate")}
        rated={t("typical")}
        className={hiddenUnless("palate")}
      >
        {scaleRow("sweetness", t("sweetness"))}
        {scaleRow("acidity", t("acidity"))}
        {scaleRow("tannin", t("tannin"))}
        {edit ? (
          scaleRow("mousse", t("mousse"))
        ) : a.style === "SPARKLING" && a.sat.mousse ? (
          <Row label={t("mousse")} sub={t("sparkling")}>
            <span style={{ fontSize: 13, color: "var(--foreground)" }}>{sub("mousse")}</span>
          </Row>
        ) : null}
        {scaleRow("alcohol", t("alcohol"))}
        {scaleRow("body", t("body"))}
        {scaleRow("flavourIntensity", t("flavour_intensity"))}
        {edit ? (
          aromaRow("palate")
        ) : a.flavours.length > 0 ? (
          <Row wide label={t("flavour_characteristics")} sub={t("typical")}>
            <AromaPills terms={a.flavours} lang={lang} />
          </Row>
        ) : null}
        {scaleRow("finish", t("finish"))}
      </SectionCard>

      <SectionCard
        id={`${idPrefix}conclusions`}
        numeral="IV"
        title={t("conclusions")}
        rated={t("typical")}
        className={hiddenUnless("conclusions")}
      >
        {edit ? (
          <Row
            label={t("quality")}
            sub={t("typical_range")}
            action={
              quality ? (
                <ClearRange text={t("clear")} rowLabel={t("quality")} onClear={() => edit.onQuality(null)} />
              ) : undefined
            }
          >
            <QualitySlider range={quality} onRangeChange={(r) => edit.onQuality(r)} lang={lang} />
          </Row>
        ) : (
          <Row label={t("quality")} sub={t("typical_range")}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{q}</span>
          </Row>
        )}
        {!edit && a.description ? (
          <Row wide label={t("in_a_nutshell")}>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--foreground)" }}>{a.description}</p>
          </Row>
        ) : null}
      </SectionCard>
    </>
  );

  // The editor lays the four cards straight into its own sheet column.
  if (edit) return sections;

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

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{sections}</div>
    </div>
  );
}
```

Without `edit`: `scaleRow` returns the old `<Row label sub>{band}</Row>`, `hiddenUnless` gives `undefined`, and the header and the four cards are the old ones — the snapshots do not move.

- [ ] **Step 6: Run the tests and the gate**

Run: `npx vitest run src/components/wset`
Expected: all pass — `archetype-sheet-edit.test.tsx` 8, `sheet-markup.test.tsx` 6 (unchanged), `range-sliders.test.tsx` 7, `sheet-shell.test.tsx` 4.

- [ ] **Step 7: Gates**

Run: `npx vitest run` → all pass.
Run: `npx tsc --noEmit` → no output.
Run: `npx eslint src/components/wset` → no output.

- [ ] **Step 8: Commit**

```bash
git add src/components/wset/archetype-sheet.tsx src/components/wset/archetype-sheet-edit.test.tsx src/components/wset/aroma-picker.tsx src/components/wset/wset-sheet.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(wset): the archetype sheet gains an editable mode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The editor's working copy, and the grapes

The pure rules the editor runs on, and the one addition to the save path (D11). The old inline editor keeps working through this task.

**Files:**
- Modify: `src/app/admin/archetypes/profile-rules.ts` (`ArchetypeProfile` lines 27–47, `ArchetypeProfileInput` lines 50–67, `EditorReferences` lines 70–74, `validateProfile` after line 172)
- Modify: `src/app/admin/archetypes/profile-rules.test.ts` (constants line 23, `profile()` line 65, three `validateProfile` tests)
- Create: `src/app/admin/archetypes/profile-draft.ts`, `src/app/admin/archetypes/profile-draft.test.ts`
- Modify: `src/app/admin/archetypes/actions.ts` (comment lines 74–79, update lines 111–113)
- Modify: `src/app/admin/archetypes/page.tsx` (select line 68, items lines 139–140, references lines 162–166, intro lines 176–178)
- Modify: `src/app/admin/archetypes/archetype-editor.tsx` (`profileInput()`, lines 237–256 — a two-line bridge; Task 6 replaces the file)

**Interfaces:**
- Consumes: `ArchetypeView`, `ArchetypeScale` (types only).
- Produces (`profile-rules.ts`): `ArchetypeProfile` and `ArchetypeProfileInput` gain `primaryGrapeId: string; secondaryGrapeId: string | null`; `EditorReferences` gains `grapes: { id: string; name: string }[]`.
- Produces (`profile-draft.ts`): `EDITOR_SECTIONS` (`readonly ["wine","appearance","nose","palate","conclusions"]`), `type EditorSection`, `type ArchetypeDraft`, `type DraftAction`, `draftFromProfile(p: ArchetypeProfile): ArchetypeDraft`, `draftToInput(d: ArchetypeDraft): ArchetypeProfileInput`, `satForColour(sat, colour)`, `applyDraft(d: ArchetypeDraft, a: DraftAction): ArchetypeDraft`, `isDirty(draft, baseline): boolean`, `editorLadders(colour, style): Partial<Record<ArchetypeScale, readonly string[]>>`, `draftView(d): ArchetypeView`, `type EditorProgress = { sections: Record<EditorSection, [number, number]>; done: number; total: number }`, `archetypeProgress(d): EditorProgress`.

- [ ] **Step 1: Write the failing grape checks**

In `src/app/admin/archetypes/profile-rules.test.ts`:

After `const ARCH = "00000000-0000-4000-8000-000000000c05";` add

```ts
const GRAPE = "00000000-0000-4000-8000-000000000c06";
const GRAPE_2 = "00000000-0000-4000-8000-000000000c07";
```

In `profile()`, after `    appellationId: APPELLATION,` add

```ts
    primaryGrapeId: GRAPE,
    secondaryGrapeId: null,
```

In "accepts a complete profile, with or without a quality range", after `    expect(validateProfile(profile())).toBeNull();` add

```ts
    expect(validateProfile(profile({ secondaryGrapeId: GRAPE_2 }))).toBeNull();
```

In "names the first thing that is wrong", after the `appellationId: ""` line add

```ts
    expect(validateProfile(profile({ primaryGrapeId: "" }))).toBe("Pick a primary grape.");
    expect(validateProfile(profile({ secondaryGrapeId: GRAPE }))).toBe(
      "The second grape must differ from the primary grape.",
    );
```

In "refuses malformed input without throwing…", after the `designationIds: ["not-an-id"]` line add

```ts
    expect(bad({ secondaryGrapeId: "not-an-id" })).toBe(MALFORMED);
    expect(bad({ secondaryGrapeId: undefined })).toBe(MALFORMED);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/admin/archetypes/profile-rules.test.ts`
Expected: FAIL — `expected null to be 'Pick a primary grape.'`.

- [ ] **Step 3: Grapes in the profile rules**

In `src/app/admin/archetypes/profile-rules.ts`:

In `ArchetypeProfile`, after `  appellationName: string | null;` add

```ts
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
```

In `ArchetypeProfileInput`, after `  appellationId: string;` add the same two lines.

In `EditorReferences`, after the `regions` line add

```ts
  grapes: { id: string; name: string }[];
```

In `validateProfile`, after

```ts
  if (!isId(p.countryId) || !isId(p.regionId) || !isId(p.appellationId)) {
    return "Pick a country, region and appellation.";
  }
```

add

```ts
  if (!isId(p.primaryGrapeId)) return "Pick a primary grape.";
  if (p.secondaryGrapeId !== null && !isId(p.secondaryGrapeId)) return MALFORMED;
  if (p.secondaryGrapeId === p.primaryGrapeId) return "The second grape must differ from the primary grape.";
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/app/admin/archetypes/profile-rules.test.ts`
Expected: `16 passed`.

- [ ] **Step 5: Write the failing draft test**

Create `src/app/admin/archetypes/profile-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FORTIFIED_ALCOHOL_STOPS, ALCOHOL_STOPS } from "../../../lib/wset/vocab";
import {
  EDITOR_SECTIONS,
  applyDraft,
  archetypeProgress,
  draftFromProfile,
  draftToInput,
  draftView,
  editorLadders,
  isDirty,
  satForColour,
  type ArchetypeDraft,
} from "./profile-draft";
import { scalesFor, validateProfile, type ArchetypeProfile } from "./profile-rules";

const COUNTRY = "00000000-0000-4000-8000-000000000c01";
const REGION = "00000000-0000-4000-8000-000000000c02";
const APPELLATION = "00000000-0000-4000-8000-000000000c03";
const GRAPE = "00000000-0000-4000-8000-000000000c06";
const OTHER_COUNTRY = "00000000-0000-4000-8000-000000000c11";
const OTHER_REGION = "00000000-0000-4000-8000-000000000c12";
const PLACE = "00000000-0000-4000-8000-000000000c21";

const REGIONS = [
  { id: REGION, countryId: COUNTRY },
  { id: OTHER_REGION, countryId: OTHER_COUNTRY },
];

function profile(overrides: Partial<ArchetypeProfile> = {}): ArchetypeProfile {
  return {
    id: "00000000-0000-4000-8000-000000000c05",
    name: "A typical Pauillac",
    colour: "RED",
    style: "STILL",
    description: "Firm.",
    qualityLow: 88,
    qualityHigh: 96,
    sat: { tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] },
    nose: [{ termId: "t1", signature: true }],
    palate: [],
    countryId: COUNTRY,
    regionId: REGION,
    appellationId: APPELLATION,
    appellationName: "Pauillac AOC",
    primaryGrapeId: GRAPE,
    secondaryGrapeId: null,
    designationIds: [],
    typicalAgeLow: 8,
    typicalAgeHigh: 25,
    winePlaceId: PLACE,
    winePlaceName: "Pauillac",
    ...overrides,
  };
}

const draft = (overrides: Partial<ArchetypeProfile> = {}): ArchetypeDraft => draftFromProfile(profile(overrides));

describe("draftFromProfile / draftToInput", () => {
  it("round-trips a saved profile into exactly what updateArchetype got before", () => {
    expect(draftToInput(draft())).toEqual({
      name: "A typical Pauillac",
      colour: "RED",
      style: "STILL",
      description: "Firm.",
      qualityLow: 88,
      qualityHigh: 96,
      sat: { tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] },
      nose: [{ termId: "t1", signature: true }],
      palate: [],
      countryId: COUNTRY,
      regionId: REGION,
      appellationId: APPELLATION,
      primaryGrapeId: GRAPE,
      secondaryGrapeId: null,
      designationIds: [],
      typicalAgeLow: 8,
      typicalAgeHigh: 25,
      winePlaceId: PLACE,
    });
    expect(validateProfile(draftToInput(draft()))).toBeNull();
  });

  it("trims the name and description, blanks to null, and reads the age inputs as typed", () => {
    let d = draft({ description: null, typicalAgeLow: null, typicalAgeHigh: null, winePlaceId: null });
    expect(d.description).toBe("");
    expect(d.ageLow).toBe("");
    d = applyDraft(d, { type: "name", value: "  A typical Margaux  " });
    d = applyDraft(d, { type: "description", value: "   " });
    d = applyDraft(d, { type: "age", end: "low", value: "5" });
    d = applyDraft(d, { type: "age", end: "high", value: "" });
    const input = draftToInput(d);
    expect(input.name).toBe("A typical Margaux");
    expect(input.description).toBeNull();
    expect(input.typicalAgeLow).toBe(5);
    expect(input.typicalAgeHigh).toBeNull();
    expect(input.winePlaceId).toBeNull();
    expect(validateProfile(input)).toBe("Typical age takes two whole numbers of years, low to high.");
  });

  it("sends an unpicked second grape as null", () => {
    const d = applyDraft(draft({ secondaryGrapeId: GRAPE.replace("c06", "c07") }), { type: "secondaryGrape", id: "" });
    expect(draftToInput(d).secondaryGrapeId).toBeNull();
  });
});

describe("applyDraft", () => {
  it("a new colour drops a hue range off its ladder, as the old editor did", () => {
    const white = applyDraft(draft(), { type: "colour", value: "WHITE" });
    expect(white.colour).toBe("WHITE");
    expect(white.sat.colourHue).toBeUndefined();
    expect(white.sat.tannin).toEqual(["MEDIUM_PLUS", "HIGH"]);
    // BROWN is a red hue and a white hue: it stays.
    const brown = applyDraft(draft({ sat: { colourHue: ["BROWN", "BROWN"] } }), { type: "colour", value: "WHITE" });
    expect(brown.sat.colourHue).toEqual(["BROWN", "BROWN"]);
  });

  it("a new style goes through satForStyle: mousse off sparkling, alcohol off its ladder", () => {
    const sparkling = draft({ colour: "WHITE", style: "SPARKLING", sat: { mousse: ["DELICATE", "CREAMY"] } });
    expect(applyDraft(sparkling, { type: "style", value: "STILL" }).sat).toEqual({});
    const fortified = draft({ style: "FORTIFIED", sat: { alcohol: ["MEDIUM_PLUS", "HIGH"] } });
    expect(applyDraft(fortified, { type: "style", value: "STILL" }).sat).toEqual({});
  });

  it("sets and clears one range, leaving the rest", () => {
    let d = applyDraft(draft(), { type: "range", key: "acidity", range: ["HIGH", "HIGH"] });
    expect(d.sat.acidity).toEqual(["HIGH", "HIGH"]);
    d = applyDraft(d, { type: "range", key: "tannin", range: null });
    expect(d.sat).toEqual({ colourHue: ["RUBY", "GARNET"], acidity: ["HIGH", "HIGH"] });
    expect(applyDraft(d, { type: "range", key: "finish", range: null })).toBe(d);
  });

  it("sets and clears the quality range as a pair", () => {
    let d = applyDraft(draft(), { type: "quality", range: [85, 90] });
    expect([d.qualityLow, d.qualityHigh]).toEqual([85, 90]);
    d = applyDraft(d, { type: "quality", range: null });
    expect([d.qualityLow, d.qualityHigh]).toEqual([null, null]);
  });

  it("keeps each aroma's signature across a re-pick, and toggles one", () => {
    let d = applyDraft(draft(), { type: "aromas", kind: "nose", ids: ["t1", "t2"] });
    expect(d.nose).toEqual([
      { termId: "t1", signature: true },
      { termId: "t2", signature: false },
    ]);
    d = applyDraft(d, { type: "signature", kind: "nose", termId: "t2" });
    expect(d.nose[1]).toEqual({ termId: "t2", signature: true });
    d = applyDraft(d, { type: "aromas", kind: "palate", ids: ["t3"] });
    expect(d.palate).toEqual([{ termId: "t3", signature: false }]);
    expect(d.nose).toHaveLength(2);
  });

  it("cascades country → region → appellation like the answer-key forms", () => {
    const same = applyDraft(draft(), { type: "country", id: COUNTRY, regions: REGIONS });
    expect([same.regionId, same.appellationId]).toEqual([REGION, APPELLATION]);
    const moved = applyDraft(draft(), { type: "country", id: OTHER_COUNTRY, regions: REGIONS });
    expect([moved.countryId, moved.regionId, moved.appellationId, moved.appellationLabel]).toEqual([
      OTHER_COUNTRY,
      "",
      "",
      null,
    ]);
    const region = applyDraft(draft(), { type: "region", id: OTHER_REGION });
    expect([region.regionId, region.appellationId, region.appellationLabel]).toEqual([OTHER_REGION, "", null]);
  });

  it("picking the region it already has keeps the appellation", () => {
    const d = draft();
    expect(applyDraft(d, { type: "region", id: REGION })).toBe(d);
  });

  it("adds a designation once and removes it", () => {
    let d = applyDraft(draft(), { type: "addDesignation", id: "d1" });
    d = applyDraft(d, { type: "addDesignation", id: "d1" });
    d = applyDraft(d, { type: "addDesignation", id: "" });
    expect(d.designationIds).toEqual(["d1"]);
    expect(applyDraft(d, { type: "removeDesignation", id: "d1" }).designationIds).toEqual([]);
  });

  it("sets and removes the map place", () => {
    const d = applyDraft(draft(), { type: "place", place: null });
    expect(draftToInput(d).winePlaceId).toBeNull();
    expect(applyDraft(d, { type: "place", place: { id: PLACE, name: "Pauillac" } }).place).toEqual({
      id: PLACE,
      name: "Pauillac",
    });
  });
});

describe("satForColour", () => {
  it("returns the same object when the hue fits", () => {
    const sat: { [key: string]: [string, string] } = { colourHue: ["RUBY", "GARNET"] };
    expect(satForColour(sat, "RED")).toBe(sat);
    expect(satForColour({}, "WHITE")).toEqual({});
  });
});

describe("isDirty", () => {
  it("is false on open, true after an edit, false again once edited back", () => {
    const base = draft();
    expect(isDirty(base, base)).toBe(false);
    const edited = applyDraft(base, { type: "name", value: "Something else" });
    expect(isDirty(edited, base)).toBe(true);
    expect(isDirty(applyDraft(edited, { type: "name", value: base.name }), base)).toBe(false);
  });

  it("clearing a range and setting it back is no change", () => {
    const base = draft();
    const cleared = applyDraft(base, { type: "range", key: "tannin", range: null });
    const back = applyDraft(cleared, { type: "range", key: "tannin", range: ["MEDIUM_PLUS", "HIGH"] });
    expect(isDirty(back, base)).toBe(false);
  });
});

describe("editorLadders", () => {
  it("offers exactly scalesFor's scales and ladders", () => {
    for (const [colour, style] of [
      ["RED", "STILL"],
      ["WHITE", "SPARKLING"],
      ["RED", "FORTIFIED"],
    ] as const) {
      const ladders = editorLadders(colour, style);
      expect(Object.keys(ladders)).toEqual(scalesFor(colour, style).map((s) => s.key));
    }
    expect(editorLadders("RED", "STILL").alcohol).toEqual(ALCOHOL_STOPS);
    expect(editorLadders("RED", "FORTIFIED").alcohol).toEqual(FORTIFIED_ALCOHOL_STOPS);
    expect(editorLadders("RED", "STILL").mousse).toBeUndefined();
    expect(editorLadders("WHITE", "SPARKLING").mousse).toEqual(["DELICATE", "CREAMY", "AGGRESSIVE"]);
  });
});

describe("draftView", () => {
  it("draws the draft's colour, style, ranges and quality", () => {
    const v = draftView(draft());
    expect(v).toMatchObject({ colour: "RED", style: "STILL", qualityLow: 88, qualityHigh: 96, description: "Firm." });
    expect(v.sat).toEqual({ tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] });
  });
});

describe("archetypeProgress", () => {
  it("counts each tab like the note sheet: 5 · 2 · 3 · 8 · 1 on a still red", () => {
    const p = archetypeProgress(draft());
    expect(p.sections).toEqual({
      wine: [5, 5],
      appearance: [1, 2],
      nose: [1, 3],
      palate: [1, 8],
      conclusions: [1, 1],
    });
    expect([p.done, p.total]).toEqual([9, 19]);
    expect(Object.keys(p.sections)).toEqual([...EDITOR_SECTIONS]);
  });

  it("adds mousse to Palate on sparkling, and counts what Wine still lacks", () => {
    const p = archetypeProgress(
      draft({ colour: "WHITE", style: "SPARKLING", sat: { mousse: ["DELICATE", "CREAMY"] }, appellationId: "", name: " " }),
    );
    expect(p.sections.palate).toEqual([1, 9]);
    expect(p.sections.wine).toEqual([3, 5]);
  });

  it("does not count a range the style no longer edits", () => {
    const p = archetypeProgress(draft({ sat: { mousse: ["DELICATE", "CREAMY"] } }));
    expect(p.sections.palate).toEqual([0, 8]);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx vitest run src/app/admin/archetypes/profile-draft.test.ts`
Expected: FAIL — `Failed to resolve import "./profile-draft"`.

- [ ] **Step 7: Write the draft module**

Create `src/app/admin/archetypes/profile-draft.ts`:

```ts
// The admin typical-wine editor's working copy (plan
// 2026-09-26-archetype-editor-sheet): one plain object held in one reducer.
// Every rule a field change carries lives here — the answer-key cascade, a new
// colour dropping a hue range off its ladder, a new style going through
// satForStyle — plus what a save sends, the tab order, each tab's count, the
// view and ladders the shared ArchetypeSheet draws, and whether anything
// changed. Pure, relative runtime imports only, so vitest loads it.
import type { ArchetypeView } from "../../../components/wset/archetype-sheet";
import type { ArchetypeScale } from "../../../lib/wset/archetype-scale";
import type { WineColour, WineStyle } from "../../../lib/wset/types";
import { HUES_BY_COLOUR } from "../../../lib/wset/vocab";
import {
  satForStyle,
  scalesFor,
  toggleSignature,
  withTermIds,
  type AromaLink,
  type ArchetypeProfile,
  type ArchetypeProfileInput,
} from "./profile-rules";

/** The editor's tabs, in order: its own Wine tab, then the WSET sheet's four. */
export const EDITOR_SECTIONS = ["wine", "appearance", "nose", "palate", "conclusions"] as const;
export type EditorSection = (typeof EDITOR_SECTIONS)[number];

type Sat = { [key: string]: [string, string] };

export type ArchetypeDraft = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  /** "" = none. */
  description: string;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: Sat;
  nose: AromaLink[];
  palate: AromaLink[];
  countryId: string;
  regionId: string;
  appellationId: string;
  /** The picked appellation's name, for the combobox before a search loads. */
  appellationLabel: string | null;
  primaryGrapeId: string;
  /** "" = none. */
  secondaryGrapeId: string;
  designationIds: string[];
  /** The typical-age inputs as typed: "" = unset. */
  ageLow: string;
  ageHigh: string;
  place: { id: string; name: string } | null;
};

export type DraftAction =
  | { type: "name"; value: string }
  | { type: "colour"; value: WineColour }
  | { type: "style"; value: WineStyle }
  | { type: "description"; value: string }
  | { type: "range"; key: ArchetypeScale; range: [string, string] | null }
  | { type: "quality"; range: [number, number] | null }
  | { type: "aromas"; kind: "nose" | "palate"; ids: string[] }
  | { type: "signature"; kind: "nose" | "palate"; termId: string }
  | { type: "country"; id: string; regions: readonly { id: string; countryId: string }[] }
  | { type: "region"; id: string }
  | { type: "appellation"; id: string; label: string | null }
  | { type: "primaryGrape"; id: string }
  | { type: "secondaryGrape"; id: string }
  | { type: "addDesignation"; id: string }
  | { type: "removeDesignation"; id: string }
  | { type: "age"; end: "low" | "high"; value: string }
  | { type: "place"; place: { id: string; name: string } | null };

export function draftFromProfile(p: ArchetypeProfile): ArchetypeDraft {
  return {
    name: p.name,
    colour: p.colour,
    style: p.style,
    description: p.description ?? "",
    qualityLow: p.qualityLow,
    qualityHigh: p.qualityHigh,
    sat: p.sat ?? {},
    nose: p.nose,
    palate: p.palate,
    countryId: p.countryId,
    regionId: p.regionId,
    appellationId: p.appellationId,
    appellationLabel: p.appellationName,
    primaryGrapeId: p.primaryGrapeId,
    secondaryGrapeId: p.secondaryGrapeId ?? "",
    designationIds: p.designationIds,
    ageLow: p.typicalAgeLow?.toString() ?? "",
    ageHigh: p.typicalAgeHigh?.toString() ?? "",
    place: p.winePlaceId ? { id: p.winePlaceId, name: p.winePlaceName ?? "" } : null,
  };
}

function numberOrNull(s: string): number | null {
  return s.trim() === "" ? null : Number(s);
}

/** What a save sends to updateArchetype (validateProfile checks it first). */
export function draftToInput(d: ArchetypeDraft): ArchetypeProfileInput {
  return {
    name: d.name.trim(),
    colour: d.colour,
    style: d.style,
    description: d.description.trim() || null,
    qualityLow: d.qualityLow,
    qualityHigh: d.qualityHigh,
    sat: d.sat,
    nose: d.nose,
    palate: d.palate,
    countryId: d.countryId,
    regionId: d.regionId,
    appellationId: d.appellationId,
    primaryGrapeId: d.primaryGrapeId,
    secondaryGrapeId: d.secondaryGrapeId || null,
    designationIds: d.designationIds,
    typicalAgeLow: numberOrNull(d.ageLow),
    typicalAgeHigh: numberOrNull(d.ageHigh),
    winePlaceId: d.place?.id ?? null,
  };
}

/** The ranges after a colour change, as the old editor's changeColour did it:
    a hue range whose low bound is not a hue of the new colour goes. The same
    object back when nothing goes. */
export function satForColour(sat: Sat, colour: WineColour): Sat {
  const hue = sat.colourHue;
  if (hue && !(HUES_BY_COLOUR[colour] as string[]).includes(hue[0])) {
    const next = { ...sat };
    delete next.colourHue;
    return next;
  }
  return sat;
}

export function applyDraft(d: ArchetypeDraft, a: DraftAction): ArchetypeDraft {
  switch (a.type) {
    case "name":
      return { ...d, name: a.value };
    case "colour":
      return { ...d, colour: a.value, sat: satForColour(d.sat, a.value) };
    case "style":
      // A new style drops what it cannot hold: an alcohol range off its
      // ladder, mousse off sparkling.
      return { ...d, style: a.value, sat: satForStyle(d.sat, d.colour, a.value) };
    case "description":
      return { ...d, description: a.value };
    case "range": {
      if (a.range) return { ...d, sat: { ...d.sat, [a.key]: a.range } };
      if (!(a.key in d.sat)) return d;
      const sat = { ...d.sat };
      delete sat[a.key];
      return { ...d, sat };
    }
    case "quality":
      return a.range
        ? { ...d, qualityLow: a.range[0], qualityHigh: a.range[1] }
        : { ...d, qualityLow: null, qualityHigh: null };
    case "aromas":
      return a.kind === "nose"
        ? { ...d, nose: withTermIds(d.nose, a.ids) }
        : { ...d, palate: withTermIds(d.palate, a.ids) };
    case "signature":
      return a.kind === "nose"
        ? { ...d, nose: toggleSignature(d.nose, a.termId) }
        : { ...d, palate: toggleSignature(d.palate, a.termId) };
    case "country": {
      // The answer-key cascade: a region of another country goes, and its
      // appellation with it.
      const keep = a.regions.find((r) => r.id === d.regionId)?.countryId === a.id;
      return keep
        ? { ...d, countryId: a.id }
        : { ...d, countryId: a.id, regionId: "", appellationId: "", appellationLabel: null };
    }
    case "region":
      // A new region drops the appellation; the same one picked again keeps it.
      if (a.id === d.regionId) return d;
      return { ...d, regionId: a.id, appellationId: "", appellationLabel: null };
    case "appellation":
      return { ...d, appellationId: a.id, appellationLabel: a.label };
    case "primaryGrape":
      return { ...d, primaryGrapeId: a.id };
    case "secondaryGrape":
      return { ...d, secondaryGrapeId: a.id };
    case "addDesignation":
      return !a.id || d.designationIds.includes(a.id) ? d : { ...d, designationIds: [...d.designationIds, a.id] };
    case "removeDesignation":
      return { ...d, designationIds: d.designationIds.filter((x) => x !== a.id) };
    case "age":
      return a.end === "low" ? { ...d, ageLow: a.value } : { ...d, ageHigh: a.value };
    case "place":
      return { ...d, place: a.place };
  }
}

// A draft in one canonical form: range keys sorted, so clearing a range and
// setting it back to what it was reads as no change.
function canonical(d: ArchetypeDraft): string {
  const sat = Object.fromEntries(Object.entries(d.sat).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
  return JSON.stringify({ ...d, sat });
}

/** Whether the draft differs from what was last saved (or opened). */
export function isDirty(draft: ArchetypeDraft, baseline: ArchetypeDraft): boolean {
  return canonical(draft) !== canonical(baseline);
}

/** The scales the editor edits and the ladder each is edited on: scalesFor's,
    so the editor offers exactly what validateProfile accepts and the matcher
    reads (alcohol by style, mousse on sparkling only). */
export function editorLadders(colour: WineColour, style: WineStyle): Partial<Record<ArchetypeScale, readonly string[]>> {
  const ladders: Partial<Record<ArchetypeScale, readonly string[]>> = {};
  for (const s of scalesFor(colour, style)) ladders[s.key as ArchetypeScale] = s.ladder;
  return ladders;
}

/** What the shared ArchetypeSheet draws: the draft's colour, style, ranges and quality. */
export function draftView(d: ArchetypeDraft): ArchetypeView {
  return {
    name: d.name,
    colour: d.colour,
    style: d.style,
    placeName: null,
    lineage: "",
    grapes: "",
    description: d.description.trim() || null,
    qualityLow: d.qualityLow,
    qualityHigh: d.qualityHigh,
    sat: d.sat,
    aromas: [],
    flavours: [],
  };
}

const SECTION_SCALES: Record<"appearance" | "nose" | "palate", readonly ArchetypeScale[]> = {
  appearance: ["appearanceIntensity", "colourHue"],
  nose: ["noseIntensity", "development"],
  palate: ["sweetness", "acidity", "tannin", "mousse", "alcohol", "body", "flavourIntensity", "finish"],
};

export type EditorProgress = {
  /** [set, total] per tab. */
  sections: Record<EditorSection, [number, number]>;
  done: number;
  total: number;
};

/** Each tab's count, as the note sheet counts its sections: Wine counts what a
    save needs (name, country, region, appellation, primary grape); a WSET
    section counts its ranges set of those edited, plus one for "any aroma" on
    Nose and Palate; Conclusions counts the quality range. */
export function archetypeProgress(d: ArchetypeDraft): EditorProgress {
  const edited = new Set(scalesFor(d.colour, d.style).map((s) => s.key));
  const count = (keys: readonly ArchetypeScale[]): [number, number] => {
    const shown = keys.filter((k) => edited.has(k));
    return [shown.filter((k) => d.sat[k] !== undefined).length, shown.length];
  };
  const [appearanceDone, appearanceTotal] = count(SECTION_SCALES.appearance);
  const [noseDone, noseTotal] = count(SECTION_SCALES.nose);
  const [palateDone, palateTotal] = count(SECTION_SCALES.palate);
  const wine = [d.name.trim(), d.countryId, d.regionId, d.appellationId, d.primaryGrapeId];
  const sections: Record<EditorSection, [number, number]> = {
    wine: [wine.filter((v) => v !== "").length, wine.length],
    appearance: [appearanceDone, appearanceTotal],
    nose: [noseDone + (d.nose.length > 0 ? 1 : 0), noseTotal + 1],
    palate: [palateDone + (d.palate.length > 0 ? 1 : 0), palateTotal + 1],
    conclusions: [d.qualityLow !== null && d.qualityHigh !== null ? 1 : 0, 1],
  };
  let done = 0;
  let total = 0;
  for (const id of EDITOR_SECTIONS) {
    done += sections[id][0];
    total += sections[id][1];
  }
  return { sections, done, total };
}
```

- [ ] **Step 8: Run it to see it pass**

Run: `npx vitest run src/app/admin/archetypes`
Expected: `profile-draft.test.ts` 20 passed, `profile-rules.test.ts` 16 passed.

- [ ] **Step 9: The save writes the grapes, the page reads them**

In `src/app/admin/archetypes/actions.ts` replace the comment

```ts
// Save an archetype's profile: SAT ranges, quality, aromas with their signature
// flags, the scoring identity (country → region → appellation), designations,
// typical age and the optional map place (training-room spec §4.5). RLS gates
```

with

```ts
// Save an archetype's profile: SAT ranges, quality, aromas with their signature
// flags, the scoring identity (country → region → appellation, primary and
// second grape), designations, typical age and the optional map place
// (training-room spec §4.5; the grapes since the sheet editor, plan
// 2026-09-26-archetype-editor-sheet). RLS gates
```

and in the `.update({…})`, after `      appellation_id: input.appellationId,` add

```ts
      primary_grape_id: input.primaryGrapeId,
      secondary_grape_id: input.secondaryGrapeId,
```

In `src/app/admin/archetypes/page.tsx`: in the `wine_archetypes` select string, after `appellation_id, ` insert `primary_grape_id, secondary_grape_id, `; in the `items` mapping, after `    appellationName: appellationName.get(a.appellation_id) ?? null,` add

```ts
    primaryGrapeId: a.primary_grape_id,
    secondaryGrapeId: a.secondary_grape_id,
```

in `editorReferences`, after `    regions: references.regions,` add `    grapes: references.grapes,`; and in the intro paragraph replace

```tsx
          Edit each typical wine&apos;s tasting-sheet profile — where it scores (country, region,
          appellation), designations, typical age, appearance, nose, palate and quality ranges plus
          aromas and their signature terms — and choose which map places surface it.
```

with

```tsx
          Edit each typical wine&apos;s tasting-sheet profile — where it scores (country, region,
          appellation, grapes), designations, typical age, appearance, nose, palate and quality
          ranges plus aromas and their signature terms — and choose which map places surface it.
```

- [ ] **Step 10: Bridge the old editor until Task 6**

In `src/app/admin/archetypes/archetype-editor.tsx`'s `profileInput()`, after `      appellationId,` add

```ts
      primaryGrapeId: archetype.primaryGrapeId,
      secondaryGrapeId: archetype.secondaryGrapeId,
```

(It saves the grapes the archetype already has; Task 6 replaces this file.)

- [ ] **Step 11: Gates**

Run: `npx vitest run` → all pass.
Run: `npx tsc --noEmit` → no output.
Run: `npx eslint src/app/admin/archetypes` → no output.

- [ ] **Step 12: Commit**

```bash
git add src/app/admin/archetypes/profile-rules.ts src/app/admin/archetypes/profile-rules.test.ts src/app/admin/archetypes/profile-draft.ts src/app/admin/archetypes/profile-draft.test.ts src/app/admin/archetypes/actions.ts src/app/admin/archetypes/page.tsx src/app/admin/archetypes/archetype-editor.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(admin): typical-wine drafts, and the grapes join the profile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The editor in the note's shell

**Files:**
- Create: `src/app/admin/archetypes/editor-copy.ts`
- Create: `src/app/admin/archetypes/map-place-field.tsx`
- Create: `src/app/admin/archetypes/wine-section.tsx`
- Modify: `src/app/admin/archetypes/archetype-editor.tsx` (whole file — the modal editor)
- Modify: `src/app/admin/archetypes/placement-editor.tsx` (imports line 12, state line 136, the Edit button lines 156–163, the inline editor lines 201–203)
- Delete: `src/components/wset/range-input.tsx`
- Modify: `CLAUDE.md` (the Training room bullet's `/admin/archetypes` sentence)

**Interfaces:**
- Consumes: Task 2's shell (`SHEET_DIALOG_CLASS`, `SheetFrame`, `SheetBar`, `SheetHeaderRow`, `SheetTabs`, `SheetBody`, `SheetFooter`, `SheetFooterProgress`, `SheetStepButton`, `SheetSaveButton`, `DiscardConfirm`, `useSheetSteps`); Task 4's `Row` (`labelId`, `action`), `SectionCard` (node `numeral`), `ArchetypeSheet` (`edit`); Task 5's `profile-draft.ts` and `EditorReferences.grapes`.
- Produces: `ArchetypeEditor({ archetype: ArchetypeProfile; terms: AromaTerm[]; references: EditorReferences; onClose: () => void })`; `WineSection({ hidden: boolean; draft: ArchetypeDraft; onChange: (a: DraftAction) => void; references: EditorReferences })`; `MapPlaceField({ value: { id: string; name: string } | null; onChange: (place: { id: string; name: string } | null) => void; labelledBy: string })`; `EDITOR_COPY`.

- [ ] **Step 1: The editor's copy**

Create `src/app/admin/archetypes/editor-copy.ts`:

```ts
// The admin typical-wine editor's own words (English: the admin is not
// translated). The WSET sections, their rows, Close and the section step come
// from the sheet's i18n (src/lib/wset/i18n.ts), as in the note form; the Wine
// tab and the save/discard lines keep the old editor's wording where it had one.
export const EDITOR_COPY = {
  editProfile: "Edit profile",
  eyebrow: "Typical wine",
  untitled: "Untitled typical wine",
  wineTab: "Wine",
  wineRated: "where it scores",
  name: "Name",
  colour: "Colour",
  style: "Style",
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  pickCountry: "Pick a country",
  pickRegion: "Pick a region",
  pickCountryFirst: "Pick a country first",
  pickAppellation: "Just the region, or pick one",
  pickRegionFirst: "Pick a region first",
  primaryGrape: "Primary grape",
  secondGrape: "Second grape",
  pickGrape: "Pick a grape",
  noSecondGrape: "None",
  optional: "optional",
  designations: "Designations the label would carry",
  addDesignation: "Add a designation",
  removeItem: (name: string) => `Remove ${name}`,
  typicalAge: "Typical age (years)",
  typicalAgeFrom: "Typical age from (years)",
  typicalAgeTo: "Typical age to (years)",
  to: "to",
  mapPlace: "Map place (optional)",
  mapPlaceNone: "None — not on the map",
  mapPlaceSearch: "Search the map…",
  removePlace: "Remove the map place",
  description: "Description",
  signatureHint: "Signature terms — an exact hit earns a bonus",
  signatureLabel: (term: string) => `Signature term: ${term}`,
  ofTotalSet: (total: number) => `of ${total} set`,
  footerNote: "A name, where it scores and a grape are required. Every range is optional.",
  save: "Save profile",
  saving: "Saving…",
  saved: "Saved ✓",
  retry: "Retry save",
  saveFailed: "The save did not go through. Try again.",
  discardTitle: "Discard your changes?",
  discardBody: "Your changes to this typical wine haven't been saved and will be lost.",
  keepEditing: "Keep editing",
  discard: "Discard",
} as const;
```

- [ ] **Step 2: The map-place picker, moved out of the old editor**

Create `src/app/admin/archetypes/map-place-field.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { searchPlaces, type PlaceHit } from "./actions";
import { EDITOR_COPY } from "./editor-copy";

type Place = { id: string; name: string };

// The optional map place (training-room D9): the chosen place as a chip, and a
// debounced name search over the map. Moved from the old archetype-editor.tsx:
// only the newest search may land, and a failed one shows nothing.
export function MapPlaceField({
  value,
  onChange,
  labelledBy,
}: {
  value: Place | null;
  onChange: (place: Place | null) => void;
  labelledBy: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every keystroke and pick: only the newest search may land.
  const request = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Cancels the pending search and drops any reply still on its way.
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    request.current += 1;
  }

  function search(next: string) {
    setQuery(next);
    stop();
    if (next.trim().length < 2) {
      setHits([]);
      return;
    }
    const mine = request.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      searchPlaces(next)
        .then((found) => {
          if (mine === request.current) setHits(found);
        })
        .catch(() => {
          // A failed search shows nothing; it never reopens a closed list.
          if (mine === request.current) setHits([]);
        });
    }, 250);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[12.5px] text-foreground">
          {value.name || value.id}
          <button
            type="button"
            aria-label={EDITOR_COPY.removePlace}
            onClick={() => onChange(null)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground md:pointer-fine:min-h-0 md:pointer-fine:min-w-0 md:pointer-fine:p-1.5"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ) : (
        <span className="text-[12px] text-muted-foreground">{EDITOR_COPY.mapPlaceNone}</span>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={EDITOR_COPY.mapPlaceSearch}
          aria-labelledby={labelledBy}
          className="min-h-11 w-56 rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] text-foreground md:pointer-fine:min-h-0"
        />
        {hits.length > 0 ? (
          <div className="absolute z-10 mt-1 max-h-64 w-72 overflow-auto rounded-[10px] border border-border bg-popover shadow-md">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  stop();
                  onChange({ id: h.id, name: h.name });
                  setQuery("");
                  setHits([]);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-muted md:pointer-fine:min-h-0"
              >
                <span className="truncate">{h.name}</span>
                <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">{h.kind}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: The Wine tab**

Create `src/app/admin/archetypes/wine-section.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { Wine, X } from "lucide-react";
import { Row, RowPair, SectionCard } from "@/components/wset/wset-sheet";
import { PillGroup } from "@/components/wset/pill-group";
import { ReferenceCombobox } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TypeDesignationField, type TypeDesignationOption } from "@/components/type-designation-field";
import { LABELS } from "@/lib/wset/vocab";
import { listAppellationsForRegions, type SearchOption } from "@/lib/reference-search";
import { createKeyedCache } from "@/lib/wine-map/keyed-cache";
import { MapPlaceField } from "./map-place-field";
import { EDITOR_COPY } from "./editor-copy";
import type { ArchetypeDraft, DraftAction } from "./profile-draft";
import {
  PROFILE_COLOURS,
  PROFILE_STYLES,
  appellationListCacheable,
  appellationOptions,
  filterAppellationOptions,
  type AppellationOption,
  type EditorReferences,
} from "./profile-rules";

// 44 px on touch, the control's own size on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";
const INPUT = `${TAP} w-full rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] text-foreground`;

// The editor's first tab: what the typical wine is and where it scores —
// everything the old inline editor had above its ranges, drawn with the WSET
// sheet's own SectionCard and rows. English labels (admin).
export function WineSection({
  hidden,
  draft,
  onChange,
  references,
}: {
  hidden: boolean;
  draft: ArchetypeDraft;
  onChange: (action: DraftAction) => void;
  references: EditorReferences;
}) {
  const ids = {
    name: useId(),
    country: useId(),
    region: useId(),
    appellation: useId(),
    primaryGrape: useId(),
    secondGrape: useId(),
    age: useId(),
    place: useId(),
    description: useId(),
  };
  // A region's appellation list, read once per region while the editor is
  // open. A failed or empty read is not kept (every region has at least its
  // self-named appellation), so the next search reads it again.
  const [appellationLists] = useState(() =>
    createKeyedCache<null, SearchOption[]>({
      capacity: 50,
      load: (_client, regionId) => listAppellationsForRegions([regionId]),
      cacheable: appellationListCacheable,
    }),
  );

  const regionOptions = references.regions
    .filter((r) => r.countryId === draft.countryId)
    .map((r) => ({ id: r.id, name: r.name }));
  const regionName = references.regions.find((r) => r.id === draft.regionId)?.name ?? null;
  const designationName = new Map(references.typeDesignations.map((d) => [d.id, d.name]));
  const designationOptions: TypeDesignationOption[] = references.typeDesignations.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    country_id: null,
  }));

  async function searchRegionAppellations(query: string): Promise<AppellationOption[]> {
    if (!draft.regionId || !regionName) return [];
    try {
      const list = await appellationLists.load(null, draft.regionId);
      return filterAppellationOptions(appellationOptions(regionName, list), query);
    } catch {
      return [];
    }
  }

  return (
    <SectionCard
      id="wine"
      numeral={<Wine aria-hidden className="size-4" />}
      title={EDITOR_COPY.wineTab}
      rated={EDITOR_COPY.wineRated}
      className={hidden ? "hidden" : undefined}
    >
      <Row label={EDITOR_COPY.name} labelId={ids.name}>
        <input
          aria-labelledby={ids.name}
          value={draft.name}
          onChange={(e) => onChange({ type: "name", value: e.target.value })}
          className={INPUT}
        />
      </Row>

      <RowPair>
        <Row label={EDITOR_COPY.colour} value={LABELS[draft.colour]}>
          <PillGroup
            options={PROFILE_COLOURS}
            labels={LABELS}
            value={draft.colour}
            onChange={(v) => {
              // A second tap on the chosen pill clears it in PillGroup; a
              // typical wine always has a colour, so that tap does nothing.
              if (v) onChange({ type: "colour", value: v });
            }}
          />
        </Row>
        <Row label={EDITOR_COPY.style} value={LABELS[draft.style]}>
          <PillGroup
            options={PROFILE_STYLES}
            labels={LABELS}
            value={draft.style}
            onChange={(v) => {
              if (v) onChange({ type: "style", value: v });
            }}
          />
        </Row>
      </RowPair>

      <RowPair>
        <Row label={EDITOR_COPY.country} labelId={ids.country}>
          <ReferenceCombobox
            formFieldName="country_id"
            options={references.countries}
            value={draft.countryId}
            onValueChange={(id) => onChange({ type: "country", id, regions: references.regions })}
            placeholder={EDITOR_COPY.pickCountry}
            createLabel="countries"
            labelledBy={ids.country}
            triggerClassName={TAP}
          />
        </Row>
        <Row label={EDITOR_COPY.region} labelId={ids.region}>
          <ReferenceCombobox
            formFieldName="region_id"
            options={regionOptions}
            value={draft.regionId}
            onValueChange={(id) => onChange({ type: "region", id })}
            placeholder={draft.countryId ? EDITOR_COPY.pickRegion : EDITOR_COPY.pickCountryFirst}
            createLabel="regions"
            labelledBy={ids.region}
            disabled={!draft.countryId}
            triggerClassName={TAP}
          />
        </Row>
      </RowPair>

      <Row label={EDITOR_COPY.appellation} labelId={ids.appellation}>
        <SearchableCombobox
          formFieldName="appellation_id"
          value={draft.appellationId}
          selectedLabel={draft.appellationLabel}
          onValueChange={(id, label) => onChange({ type: "appellation", id, label })}
          search={searchRegionAppellations}
          placeholder={draft.regionId ? EDITOR_COPY.pickAppellation : EDITOR_COPY.pickRegionFirst}
          createLabel="appellations"
          labelledBy={ids.appellation}
          disabled={!draft.regionId}
          triggerClassName={TAP}
        />
      </Row>

      <RowPair>
        <Row label={EDITOR_COPY.primaryGrape} labelId={ids.primaryGrape}>
          <ReferenceCombobox
            formFieldName="primary_grape_id"
            options={references.grapes}
            value={draft.primaryGrapeId}
            onValueChange={(id) => onChange({ type: "primaryGrape", id })}
            placeholder={EDITOR_COPY.pickGrape}
            createLabel="grapes"
            labelledBy={ids.primaryGrape}
            triggerClassName={TAP}
          />
        </Row>
        <Row label={EDITOR_COPY.secondGrape} sub={EDITOR_COPY.optional} labelId={ids.secondGrape}>
          <ReferenceCombobox
            formFieldName="secondary_grape_id"
            options={references.grapes}
            value={draft.secondaryGrapeId}
            onValueChange={(id) => onChange({ type: "secondaryGrape", id })}
            placeholder={EDITOR_COPY.noSecondGrape}
            createLabel="grapes"
            labelledBy={ids.secondGrape}
            allowClear
            triggerClassName={TAP}
          />
        </Row>
      </RowPair>

      <Row wide label={EDITOR_COPY.designations}>
        {draft.designationIds.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {draft.designationIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-border pl-2.5 text-[12.5px] text-foreground"
              >
                {designationName.get(id) ?? id}
                <button
                  type="button"
                  aria-label={EDITOR_COPY.removeItem(designationName.get(id) ?? id)}
                  onClick={() => onChange({ type: "removeDesignation", id })}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground md:pointer-fine:min-h-0 md:pointer-fine:min-w-0 md:pointer-fine:p-1.5"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <TypeDesignationField
          formFieldName="designation_add"
          options={designationOptions}
          value=""
          onValueChange={(id) => onChange({ type: "addDesignation", id })}
          placeholder={EDITOR_COPY.addDesignation}
          allowClear={false}
        />
      </Row>

      <RowPair>
        <Row label={EDITOR_COPY.typicalAge} labelId={ids.age}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              aria-label={EDITOR_COPY.typicalAgeFrom}
              value={draft.ageLow}
              onChange={(e) => onChange({ type: "age", end: "low", value: e.target.value })}
              className={`${INPUT} w-20`}
            />
            <span className="text-[12px] text-muted-foreground">{EDITOR_COPY.to}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              aria-label={EDITOR_COPY.typicalAgeTo}
              value={draft.ageHigh}
              onChange={(e) => onChange({ type: "age", end: "high", value: e.target.value })}
              className={`${INPUT} w-20`}
            />
          </div>
        </Row>
        <Row label={EDITOR_COPY.mapPlace} labelId={ids.place}>
          <MapPlaceField
            value={draft.place}
            onChange={(place) => onChange({ type: "place", place })}
            labelledBy={ids.place}
          />
        </Row>
      </RowPair>

      <Row wide label={EDITOR_COPY.description} labelId={ids.description}>
        <textarea
          aria-labelledby={ids.description}
          value={draft.description}
          onChange={(e) => onChange({ type: "description", value: e.target.value })}
          rows={3}
          className="min-h-24 w-full resize-y rounded-[12px] border border-border bg-card px-3.5 py-3 text-[13px] leading-relaxed text-foreground"
        />
      </Row>
    </SectionCard>
  );
}
```

- [ ] **Step 4: The modal editor**

Replace `src/app/admin/archetypes/archetype-editor.tsx` with:

```tsx
"use client";

import { useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import type { AromaTerm } from "@/lib/wset/types";
import { makeT } from "@/lib/wset/i18n";
import { useWsetLang } from "@/lib/wset/wset-lang";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ArchetypeSheet } from "@/components/wset/archetype-sheet";
import {
  DiscardConfirm,
  SHEET_DIALOG_CLASS,
  SheetBar,
  SheetBody,
  SheetFooter,
  SheetFooterProgress,
  SheetFrame,
  SheetHeaderRow,
  SheetSaveButton,
  SheetStepButton,
  SheetTabs,
  useSheetSteps,
} from "@/components/wset/sheet-shell";
import { updateArchetype } from "./actions";
import { EDITOR_COPY } from "./editor-copy";
import {
  EDITOR_SECTIONS,
  applyDraft,
  archetypeProgress,
  draftFromProfile,
  draftToInput,
  draftView,
  editorLadders,
  isDirty,
  type DraftAction,
  type EditorSection,
} from "./profile-draft";
import { validateProfile, type ArchetypeProfile, type EditorReferences } from "./profile-rules";
import { WineSection } from "./wine-section";

type SaveState = "idle" | "saving" | "saved" | "error";

// A typical wine's profile in the Taste & Rate note's shell (plan
// 2026-09-26-archetype-editor-sheet): the same popup (full-screen on phones, a
// dialog on a laptop), sticky bar, one section on screen at a time, "Next: … →"
// and Save in the footer, Close asking before it drops unsaved changes. The
// Wine tab is this editor's own; the four WSET tabs are the shared
// ArchetypeSheet in its editable mode, so an archetype looks the same here as
// in the Library, on the map and in the training room.
export function ArchetypeEditor({
  archetype,
  terms,
  references,
  onClose,
}: {
  archetype: ArchetypeProfile;
  terms: AromaTerm[];
  references: EditorReferences;
  onClose: () => void;
}) {
  const router = useRouter();
  const { lang } = useWsetLang();
  const t = makeT(lang);
  const [draft, dispatch] = useReducer(applyDraft, archetype, draftFromProfile);
  // What the profile looked like when last saved (or opened): Close asks
  // before discarding only while the draft differs from it.
  const [baseline, setBaseline] = useState(() => draftFromProfile(archetype));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { active, goTo, step, scrollRef } = useSheetSteps(EDITOR_SECTIONS, true);

  const dirty = isDirty(draft, baseline);
  const progress = archetypeProgress(draft);
  const title = draft.name.trim() || EDITOR_COPY.untitled;

  // Every change clears a save error: the message was about the draft before it.
  const change = (action: DraftAction) => {
    dispatch(action);
    if (saveState === "error") setSaveState("idle");
    if (error !== null) setError(null);
  };

  // Close, Escape and the backdrop: an open confirm closes first; then a dirty
  // draft asks, a clean one exits.
  const requestClose = () => {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  async function save() {
    const input = draftToInput(draft);
    const invalid = validateProfile(input);
    if (invalid) {
      setSaveState("error");
      setError(invalid);
      return;
    }
    const saving = draft;
    setError(null);
    setSaveState("saving");
    let result: { error: string } | { ok: true };
    try {
      result = await updateArchetype(archetype.id, input);
    } catch {
      result = { error: EDITOR_COPY.saveFailed };
    }
    if ("error" in result) {
      setSaveState("error");
      setError(result.error);
      return;
    }
    // Clean again: Close exits without asking, unless the curator kept
    // editing while the save was on its way.
    setBaseline(saving);
    setSaveState("saved");
    setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2200);
    router.refresh();
  }

  const saveLabel =
    saveState === "saving"
      ? EDITOR_COPY.saving
      : saveState === "saved"
        ? EDITOR_COPY.saved
        : saveState === "error"
          ? EDITOR_COPY.retry
          : EDITOR_COPY.save;

  // A tab's name, as the tabs and the footer step print it.
  const tabLabel = (id: EditorSection) =>
    id === "wine" ? EDITOR_COPY.wineTab : id === "conclusions" ? t("conclusion_short") : t(id);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent showCloseButton={false} className={SHEET_DIALOG_CLASS}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <SheetFrame embedded>
          <SheetBar embedded>
            <SheetHeaderRow
              eyebrow={EDITOR_COPY.eyebrow}
              title={title}
              onClose={requestClose}
              progress={{ done: progress.done, total: progress.total }}
            />
            <SheetTabs
              tabs={EDITOR_SECTIONS.map((id) => ({
                id,
                label: tabLabel(id),
                done: progress.sections[id][0],
                total: progress.sections[id][1],
              }))}
              active={active}
              onSelect={(id) => goTo(id as EditorSection)}
            />
          </SheetBar>

          <SheetBody embedded scrollRef={scrollRef} column={null}>
            <WineSection hidden={active !== "wine"} draft={draft} onChange={change} references={references} />
            <ArchetypeSheet
              a={draftView(draft)}
              edit={{
                section: active === "wine" ? null : active,
                ladders: editorLadders(draft.colour, draft.style),
                terms,
                nose: draft.nose,
                palate: draft.palate,
                onRange: (key, range) => change({ type: "range", key, range }),
                onQuality: (range) => change({ type: "quality", range }),
                onAromas: (kind, ids) => change({ type: "aromas", kind, ids }),
                onSignature: (kind, termId) => change({ type: "signature", kind, termId }),
                signatureHint: EDITOR_COPY.signatureHint,
                signatureLabel: EDITOR_COPY.signatureLabel,
              }}
            />
          </SheetBody>

          <SheetFooter
            embedded
            progress={
              <SheetFooterProgress
                done={progress.done}
                caption={EDITOR_COPY.ofTotalSet(progress.total)}
                note={EDITOR_COPY.footerNote}
              />
            }
            notice={
              error ? (
                <p role="alert" className="text-[12.5px] leading-snug text-destructive">
                  {error}
                </p>
              ) : null
            }
          >
            {step ? (
              <SheetStepButton section={tabLabel(step.id)} forward={step.forward} onClick={() => goTo(step.id)} />
            ) : null}
            <SheetSaveButton
              label={saveLabel}
              onClick={save}
              disabled={saveState === "saving"}
              saved={saveState === "saved"}
            />
          </SheetFooter>

          {confirmDiscard ? (
            <DiscardConfirm
              title={EDITOR_COPY.discardTitle}
              body={EDITOR_COPY.discardBody}
              keepLabel={EDITOR_COPY.keepEditing}
              discardLabel={EDITOR_COPY.discard}
              onKeep={() => setConfirmDiscard(false)}
              onDiscard={() => {
                setConfirmDiscard(false);
                onClose();
              }}
            />
          ) : null}
        </SheetFrame>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: The list opens it**

In `src/app/admin/archetypes/placement-editor.tsx`:

After `import { ArchetypeEditor } from "./archetype-editor";` add `import { EDITOR_COPY } from "./editor-copy";`.

Replace `  const [openId, setOpenId] = useState<string | null>(null);` with

```tsx
  // The archetype whose profile is open in the editor sheet; a refresh after a
  // save hands it the new props without closing it.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = archetypes.find((a) => a.id === openId) ?? null;
```

Replace

```tsx
            <button
              type="button"
              onClick={() => setOpenId(openId === a.id ? null : a.id)}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3.5" />
              {openId === a.id ? "Close" : "Edit profile"}
            </button>
```

with

```tsx
            <button
              type="button"
              onClick={() => setOpenId(a.id)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:pointer-fine:min-h-0"
            >
              <Pencil aria-hidden className="size-3.5" />
              {EDITOR_COPY.editProfile}
            </button>
```

Replace

```tsx

          {openId === a.id ? (
            <ArchetypeEditor archetype={a} terms={terms} references={references} />
          ) : null}
        </div>
      ))}
    </div>
```

with

```tsx
        </div>
      ))}
      {open ? (
        <ArchetypeEditor
          key={open.id}
          archetype={open}
          terms={terms}
          references={references}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
```

- [ ] **Step 6: Retire EditableRange**

Run: `git rm src/components/wset/range-input.tsx`
Run: `git grep -n "range-input\|EditableRange" -- src`
Expected: one hit only, the comment in `src/lib/wset/range-edit.ts` ("EditableRange's rule, which this replaces").

- [ ] **Step 7: CLAUDE.md**

In `CLAUDE.md`'s **Training room** bullet replace

```
  `/admin/archetypes` edits the scoring identity (country → region →
  appellation with "Just the region"), designations, typical age, signature
  aromas, an optional map place and mousse on sparkling; its ladders and checks
  are pure in `src/app/admin/archetypes/profile-rules.ts`, whose test pins them
  to the matcher's `ladderFor`.
```

with

```
  `/admin/archetypes` lists the typical wines; "Edit profile" opens one in the
  Taste & Rate note's own popup and sheet (plan
  `docs/superpowers/plans/2026-09-26-archetype-editor-sheet.md`). The frame is
  shared: `src/components/wset/sheet-shell.tsx` (bar, tabs, one section on
  screen, footer step and Save, discard confirm) serves WsetSheet and the
  editor alike. Tabs: Wine (the editor's own `wine-section.tsx`: name,
  colour/style, country → region → appellation with "Just the region", primary
  and second grape, designations, typical age, map place, description), then
  the four WSET sections drawn by `ArchetypeSheet`'s `edit` mode — every range
  on SnapSlider/QualitySlider in editable range mode (`src/lib/wset/range-edit.ts`:
  a tap outside the band extends the nearer end, inside moves it in, the first
  tap seeds one stop, a slide moves the end the press took; "clear" empties
  it), aromas on the note's AromaPicker with a ★ per chosen term for
  signatures. The working copy and every rule a change carries (cascade,
  colour → hue, style → `satForStyle`, tab counts, dirty check) are pure in
  `profile-draft.ts`; ladders and checks stay in `profile-rules.ts`, whose test
  pins them to the matcher's `ladderFor`. `src/components/wset/sheet-markup.test.tsx`
  pins the read-only archetype sheet's and the note sheet's markup byte for
  byte (react-dom/server in vitest, through the `@/` alias in
  `vitest.config.mts`): an intended change to either is committed with `-u`
  and its diff reviewed.
```

- [ ] **Step 8: Gates**

Run: `npx vitest run` → all pass (the six snapshots unchanged).
Run: `npx tsc --noEmit` → no output.
Run: `npx eslint src/app/admin/archetypes src/components/wset` → no output.

- [ ] **Step 9: Browser checklist (the main session runs this)**

Dev server through `preview_start`; if a route 404s with an unstyled 404 page, stop the server, `rm -rf .next`, start again (CLAUDE.md). Sign in as a curator (contributor or admin). Check at 375×812 (phone preset), at 360×740 and on a laptop width; light, then dark from the theme menu. Read the console for errors (a base-ui "expected a native `<button>`" warning is a failure).

1. `/admin/archetypes`: the list looks as before; "Edit profile" opens the editor — full screen on the phone, the wide dialog on the laptop — with the bar (✕ / Close, "Typical wine", the name, EN/DA), five tabs with counts and the Wine tab showing. At 360 px no tab name overflows its column.
2. Wine: every field holds the archetype's saved values (name, pills, country, region, appellation, grapes, designations, age, map place, description). Change country → region and appellation empty; pick the same region again → the appellation stays; the appellation list offers "Just the region · …" first. Clear the second grape. Add and remove a designation. Search the map (type fast: only the last search's hits show), pick a place, remove it. At a laptop width of 1024 px or more the sheet is zoomed 1.15 (`.wset-sheet`, globals.css): every combobox list must open directly under its field and at its width. If one does not, stop and report it to the owner rather than patching the popover: these are the first comboboxes inside a zoomed `.wset-sheet`.
3. Appearance: on an unset scale the track is faded and reads "Varies"; a tap seeds a one-stop band, a tap outside extends the nearer end, a tap inside moves the nearer end in, a drag moves the end it started on; "clear" empties it and the slider does not jump under the finger when the band appears or goes. Hue offers the colour's hues; switch colour red → white on the Wine tab → a red hue range is gone.
4. Palate: mousse only on sparkling; alcohol has three stops unfortified and five fortified; switching fortified → still drops a `medium(+)` alcohol range. Keyboard: Tab to a stop, Enter → the tap rule; Tab to "clear", Enter → cleared.
5. Nose and Palate aromas: the picker (phone: "+ Add" bottom sheet; Escape closes only that sheet), ★ toggles a signature (pressed state visible), "Copy from nose" on the palate. Switch the wine to white with blackcurrant chosen → it stays in the Selected strip with its ★.
6. Conclusions: the quality range seeds, extends, shrinks and drags; the line reads e.g. "88–96 Outstanding"; "clear" empties it.
7. Footer: "Next: Appearance →" … "← Palate" from Conclusions; the tabs jump anywhere; Save → "Saving…" → "Saved ✓"; the list shows the new name behind the dialog; close and reopen → the saved values; `/taste/training` ranks with the new profile.
8. Errors: clear the name, Save → "Give it a name." as a full-width footer line on the phone and the laptop, Save reads "Retry save"; type a name → the message goes.
9. Closing: with an unsaved change ✕, Close, Escape and a backdrop tap each ask "Discard your changes?" (Keep editing keeps it; Discard closes); with none they close at once.
10. EN/DA: the WSET tab and row names, Close and the step button switch; the Wine tab stays English.
11. Unchanged (compare with production or a pre-branch build, same viewport): the Taste & Rate note modal (phone and laptop: tabs, footer, a dirty Close's discard dialog, a slider tap and drag), a note page `/catalog/<id>/notes/…` (a tab switch scrolls the section in under the bar), the training room session and a candidate's typical-wine detail, a Library page `/knowledge/archetypes/<id>`, and the map's typical-wine popup.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin/archetypes/editor-copy.ts src/app/admin/archetypes/map-place-field.tsx src/app/admin/archetypes/wine-section.tsx src/app/admin/archetypes/archetype-editor.tsx src/app/admin/archetypes/placement-editor.tsx CLAUDE.md
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(admin): edit a typical wine in the Taste & Rate sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` in Step 6 already staged the deletion.)
