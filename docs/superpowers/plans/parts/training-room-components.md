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
