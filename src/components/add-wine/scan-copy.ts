// Copy and small decisions shared by the camera / confirm / multi-add views
// (screens 7b, 7c, 7d, 7i). Pure — the views render what these return, so
// the strings the handoff spells out live in one place and are testable.
import type { ExtractedLabel } from "@/lib/label-scan/extract";
import { glassLabel } from "./format";
import type { AddWineDestination, AddedWine, PendingScan } from "./types";

export type ConfidenceTone = "ok" | "check" | "hard";

/** 7c read-confidence chip: "READ OK" is a gold pill, a low read gets rose. */
export function confidenceChip(confidence: ExtractedLabel["confidence"]): {
  label: string;
  tone: ConfidenceTone;
} {
  if (confidence === "high") return { label: "READ OK", tone: "ok" };
  if (confidence === "medium") return { label: "CHECK THE READ", tone: "check" };
  return { label: "HARD TO READ", tone: "hard" };
}

/** The confirm footer's primary action, per destination. */
export function primaryAddLabel(destination: AddWineDestination): string {
  if (destination.kind === "flight") return `Add as ${glassLabel(destination.position)}`;
  if (destination.kind === "cellar") return "Add to cellar";
  return "Add to the catalog";
}

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

/**
 * 7c → 7d: "Add and scan the next" on a read with no vintage and no catalog
 * match stacks a Fix row and returns to the camera — the same route the
 * multi-mode read pipeline takes — instead of the blocking by-hand form. The
 * primary button (and any other incomplete read) still opens the form.
 */
export function shouldStackPending(
  andScanNext: boolean,
  prefill: { vintagePrompt?: boolean },
  matchCount: number,
): boolean {
  return andScanNext && prefill.vintagePrompt === true && matchCount === 0;
}

/** 7i eyebrow: whether the read landed on a catalog wine. */
export function chooserEyebrow(matchCount: number): string {
  return matchCount > 0 ? "Found in the catalog" : "Read from the label";
}

/** 7i "Tonight's flight" subtitle. */
export function flightHintSubtitle(hint: { tastingName: string; live: boolean }): string {
  return `${hint.tastingName}, ${hint.live ? "live now" : "next up"}`;
}

/** 7d added-row trailer: where the bottle went. */
export function addedWhere(added: Pick<AddedWine, "destination" | "glass">): string {
  if (added.destination === "flight") {
    return added.glass != null ? glassLabel(added.glass) : "in the flight";
  }
  if (added.destination === "cellar") return "in cellar";
  return "in the catalog";
}

/** 7d pending-row trailer: what still needs fixing. */
export function pendingProblemLabel(problem: PendingScan["problem"]): string {
  return problem === "no-vintage" ? "no vintage read" : "needs details";
}

/**
 * A typed vintage: four digits, 1900 up to next year (a release can carry
 * next year's date only in the odd edge case; anything beyond is a typo).
 */
export function parseVintageYear(text: string, currentYear: number): number | null {
  const trimmed = text.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  const year = Number.parseInt(trimmed, 10);
  if (year < 1900 || year > currentYear + 1) return null;
  return year;
}
