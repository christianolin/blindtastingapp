// Copy shared by the add-wine sheet's matrix and views. Pure — they render what
// these return, so the strings the handoff spells out live in one place and
// are testable.
import type { WineIdentityDraft } from "../../lib/wine-identity/types";
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

/**
 * The confirm screen's one muted line about where the appellation came from
 * when the label did not print it (owner fixes B and C, 2026-09-19; spec §8):
 * the same wine's other vintages in the catalog (resolver step 7.6), or the
 * scan's one follow-up lookup. Null for every other source, and once the
 * appellation is gone. It reads the sheet's draft, so an edit drops it.
 */
export function appellationSourceNote(draft: WineIdentityDraft): string | null {
  if (!draft.appellationId) return null;
  switch (draft.provenance.appellation) {
    case "catalog-sibling":
      return "Appellation from other vintages of this wine";
    case "lookup":
      return "Appellation looked up — it is not on the label";
    default:
      return null;
  }
}

/** A complete read's chip: "READ OK", or "CHECK THE READ" when the model rated
    its own read low (§2.1 row 9), or when the appellation was looked up rather
    than read (owner fix C: not on the label, so the user should check it). An
    appellation from other vintages keeps READ OK: it is our own data, and every
    vintage agreed. A read with gaps names them instead. */
export function readOkChip(
  confidence: "high" | "medium" | "low",
  draft: WineIdentityDraft,
): { label: string; tone: "ok" | "check" } {
  return confidence === "low" || draft.provenance.appellation === "lookup"
    ? { label: "CHECK THE READ", tone: "check" }
    : { label: "READ OK", tone: "ok" };
}
