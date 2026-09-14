// Guessing, picker and waiting copy (S8, S8b, S9, S10, S10b; spec §8.3; ledger
// B7). Pure — no React, no Supabase — so the wording is pinned by
// ladder-copy.test.ts. Runtime imports are relative only (vitest has no `@/`).
import { MAX_POINTS } from "../../../../lib/guess-ladder-math";
import { ordinal } from "../../../../lib/stats-math";
import { modeWord } from "../../../../lib/tasting-eyebrow";
import type { RevealMode } from "@/lib/supabase/database.types";
import type { LadderField } from "./ladder-types";

type Presentation = { phone: boolean };

// ── S8 / S8b: the ladder ────────────────────────────────────────────────────

export function introHeading(glass: number): string {
  return `What is in glass ${glass}?`;
}

export const INTRO_SENTENCE = "Each row saves as you answer it. Skip anything you cannot call.";

/** "10 / 30 at stake" (laptop) · "10 / 30 pts at stake" (phone). The ceiling
 *  is the constant MAX_POINTS — never a per-wine maximum (rule 1). */
export function stakeLine(points: number, { phone }: Presentation): string {
  return phone ? `${points} / ${MAX_POINTS} pts at stake` : `${points} / ${MAX_POINTS} at stake`;
}

export const VINTAGE_LABEL = "Vintage · 1 pt if a year out";
export const VINTAGE_EMPTY = "Year, NV or tawny — or skip";

/** "14 pts" · "1 pt" — the singular is plan copy, as the picker's points pill
 *  already says (flows review). */
function points(n: number): string {
  return `${n} ${n === 1 ? "pt" : "pts"}`;
}

/** "2nd of 7 · 14 pts" (laptop) · "2nd · 14 pts" (phone); a shared place
 *  reads "=2nd" (PLAY-07). */
export function rankChipLabel(
  r: { rank: number; tied: boolean; competitors: number; points: number },
  { phone }: Presentation,
): string {
  const place = `${r.tied ? "=" : ""}${ordinal(r.rank)}`;
  return phone
    ? `${place} · ${points(r.points)}`
    : `${place} of ${r.competitors} · ${points(r.points)}`;
}

export function lockButtonText(glass: number): string {
  return `Lock in glass ${glass}`;
}

export function lockFooterText({ phone }: Presentation): string {
  return phone
    ? "Saved as you go. Locking stops edits and shows the others you are ready."
    : "Saved as you go. Locking stops edits and tells the table you are ready.";
}

/** A save or edit refused because the glass is locked in (spec copy). */
export const LOCKED_EDIT_REFUSAL = "Change it first — this glass is locked in.";

/** The laptop header eyebrow (PLAY-05). */
export function laptopEyebrow(host: string): string {
  return `Live · ${host} is hosting`;
}

/** The phone header title: "Nebbiolo vs Sangiovese · blind". A mode with no
 *  word (OPEN) shows the name alone. */
export function phoneLadderTitle(tasting: string, revealMode: RevealMode): string {
  const word = modeWord(revealMode);
  return word ? `${tasting} · ${word}` : tasting;
}

/** Under the phone flight bar: "5 of 7 locked". */
export function lockedCountShort(k: number, n: number): string {
  return `${k} of ${n} locked`;
}

/** The laptop rail's roster heading, and S10's: "5 of 7 locked in". */
export function lockedInRosterHeading(k: number, n: number): string {
  return `${k} of ${n} locked in`;
}

export function standingsAfterHeading(glass: number): string {
  return `Standings after glass ${glass}`;
}

// ── S9: the picker ──────────────────────────────────────────────────────────

/** "1,240" — grouped with commas the same way on the server and the client. */
export function formatCount(n: number): string {
  const whole = Math.round(n);
  const digits = String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return whole < 0 ? `-${digits}` : digits;
}

/** What each picker searches, in the plural. */
const SEARCH_NOUN: Record<LadderField, string> = {
  country: "countries",
  region: "regions",
  appellation: "appellations",
  primary_grape: "grapes",
  secondary_grape: "grapes",
  producer: "producers",
  type_designation: "designations",
  vintage: "vintages",
};

/** "Search 1,240 grapes" (phone) · "Type to search all 1,240 grapes" (laptop). */
export function searchPlaceholder(field: LadderField, count: number, { phone }: Presentation): string {
  const noun = SEARCH_NOUN[field];
  return phone
    ? `Search ${formatCount(count)} ${noun}`
    : `Type to search all ${formatCount(count)} ${noun}`;
}

/** The grape shortlist heading (replaces "Grown in {region}"). */
export function shortlistHeading(region: string): string {
  return `Common grapes in ${region}`;
}

export function everythingElseHeading(count: number): string {
  return `Everything else · all ${formatCount(count)}`;
}

/** Appended to a row's context line when the viewer picks that id often. */
export const OFTEN_SUFFIX = " · you guess this often";

// ── S10 / S10b: waiting ─────────────────────────────────────────────────────

/** Follows `decidingLine(names)`. Phones name no one; laptops name the host. */
export function waitingTail(host: string | null): string {
  return host && host.trim() !== ""
    ? `The reveal starts when everyone is in, or when ${host} moves on.`
    : "The reveal starts when everyone is in — or when the host moves on.";
}
