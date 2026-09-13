// A note on a hidden glass (blind-tasting ledger B8; spec §9.3, §9.5).
// Reverses "No WSET note can be written while a glass is locked": a taster
// guessing a still-hidden glass may write a WSET note on it — locked or not
// — kept private to its author (nobody else, not even the host, can read it)
// until the glass is revealed, at which point it resolves to the glass's
// wine and counts as a rating. Pure: relative imports only, no React, no DB.
import type { ColourHue, WineColour } from "./types";
import { HUES_BY_COLOUR } from "./vocab";

/** A tasting status wide enough for the pure check below — mirrors the DB
    enum (`TastingStatus`) without importing the Supabase types module. */
export type HiddenNoteTastingStatus = "DRAFT" | "OPEN" | "IN_PROGRESS" | "CLOSED";

/**
 * May this viewer note this glass right now? Offered only to an eligible
 * guesser (never the host-provides host or the bottle's own contributor —
 * that eligibility is computed by the caller), on a glass that has not yet
 * been revealed, in a tasting that is running (`IN_PROGRESS`, or the legacy
 * `OPEN` status — CLAUDE.md's "anything ≠ DRAFT counts as started").
 */
export function canNoteHiddenGlass(input: {
  status: HiddenNoteTastingStatus;
  isRevealed: boolean;
  eligible: boolean;
}): boolean {
  return (
    (input.status === "IN_PROGRESS" || input.status === "OPEN") &&
    !input.isRevealed &&
    input.eligible
  );
}

/** "{tastingName} · {glassLabel}" — the hidden-note sheet's title (spec copy). */
export function hiddenNoteTitle(tastingName: string, glassLabel: string): string {
  return `${tastingName} · ${glassLabel}`;
}

/** One family's hues, grouped for the hue control (spec §9.3 item 2). */
export type HueGroup = { family: WineColour; hues: ColourHue[] };

// The families offered when the wine's own colour is unknown — white, rosé,
// red, in that order (spec copy). ORANGE is a real catalog colour but not
// offered here: a taster describing a hidden glass picks among the three
// classic families, same as the spec draws it.
const UNKNOWN_FAMILIES: WineColour[] = ["WHITE", "ROSE", "RED"];

/**
 * The hue groups the colour control renders: the wine's own family alone
 * when it is known, or every family (white, rosé, red) when it is not — a
 * hidden glass before its reveal has no known colour yet.
 */
export function hueGroupsFor(family: WineColour | null): HueGroup[] {
  const families = family === null ? UNKNOWN_FAMILIES : [family];
  return families.map((f) => ({ family: f, hues: HUES_BY_COLOUR[f] }));
}

/** The dictionary key for the sheet's hint under the title (`i18n.ts`). */
export const HIDDEN_NOTE_HINT = "hidden_note_hint";
