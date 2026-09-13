// Copy shared by the add-wine sheet's matrix and views. Pure — they render what
// these return, so the strings the handoff spells out live in one place and
// are testable.
import { glassLabel } from "./format";
import type { AddWineDestination } from "./types";

/**
 * The flight-only note under the match card. A bring-your-own bottle has no
 * "glass N" for the others yet; an OPEN tasting hides nothing, so no note.
 * SEMI_BLIND shows every answer key to every participant as the candidate
 * list (wine_answers RLS) — only the glass number is secret — so "only you
 * see this" would be a lie there.
 */
export function flightNote(destination: AddWineDestination | null): string | null {
  if (!destination || destination.kind !== "flight") return null;
  if (destination.revealMode === "OPEN") return null;
  if (destination.revealMode === "SEMI_BLIND") {
    return "Tasters see this wine on the candidate list, but not which glass it is.";
  }
  if (destination.wineSource === "PARTICIPANT_CONTRIBUTED") {
    return "Only you see this until the reveal.";
  }
  return `Only you see this until the reveal. Tasters see “${glassLabel(destination.position)}”.`;
}

/** 7i eyebrow: whether the read landed on a catalog wine. */
export function chooserEyebrow(matchCount: number): string {
  return matchCount > 0 ? "Found in the catalog" : "Read from the label";
}
