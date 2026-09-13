// "Paste a list" on create step 2 (spec §2.3 item 7; ledger B1; map CREATE-39).
// The host pastes the wines they are pouring; BT-C2 resolves each kept line
// through the catalog search and adds a glass only when exactly one catalog row
// matches. Unmatched lines are listed with By hand — a paste never adds a silent
// incomplete glass.
//
// Pure — no React, no Supabase, no server-only — so vitest pins the splitting
// and the matching. Runtime imports are relative only (vitest has no `@/`).
import { foldWords } from "../../../lib/wine-identity/fold";

/** A paste keeps at most this many lines. */
export const MAX_PASTE_LINES = 24;

/** The secondary text button under the flight (spec copy: the handoff's "Paste a
 *  list of six", without the planned count). */
export const PASTE_LIST_BUTTON = "Paste a list";
export const ADD_THESE = "Add these";

// One leading list marker: a bullet ("-", "*", "•"), or a number of up to three
// digits closed by "." or ")" that does not start a decimal ("1.5 L" and "12.5%"
// stay whole). A bare year has no closer, so "2016 Barolo" stays whole too.
const LIST_MARKER = /^(?:[-*•]|\d{1,3}[.)](?!\d))\s*/;

/** The lines of a paste: each trimmed, one list marker dropped, every run of
 *  whitespace one space; blank and marker-only lines dropped; at most
 *  `MAX_PASTE_LINES` kept lines. */
export function splitPastedLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim().replace(LIST_MARKER, "").replace(/\s+/g, " ").trim();
    if (line === "") continue;
    lines.push(line);
    if (lines.length === MAX_PASTE_LINES) break;
  }
  return lines;
}

export type PasteCandidate = { id: string; title: string };

/** The catalog wine a pasted line names, or null. Every folded token of the line
 *  (`foldWords`) must equal a folded word of the candidate's title, and exactly
 *  one catalog row may hold them all: two rows (a producer's two Barolos) or none
 *  leave the line for By hand. A line with no tokens matches nothing; the same
 *  id listed twice is one row. */
export function pickPasteMatch(line: string, candidates: readonly PasteCandidate[]): string | null {
  const tokens = foldWords(line).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  let match: string | null = null;
  for (const candidate of candidates) {
    const words = new Set(foldWords(candidate.title).split(" "));
    if (!tokens.every((token) => words.has(token))) continue;
    if (match !== null && match !== candidate.id) return null;
    match = candidate.id;
  }
  return match;
}

/** The heading over the unmatched lines: "Couldn't match {n} lines" (spec copy). */
export function couldntMatchHeading(n: number): string {
  // (plan copy) The singular; the spec writes only "Couldn't match {n} lines".
  if (n === 1) return "Couldn't match 1 line";
  return `Couldn't match ${n} lines`;
}
