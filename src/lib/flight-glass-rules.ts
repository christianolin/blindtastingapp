// Who may Edit, Swap, Remove and add a glass in a flight, and when (spec §3.3
// item 10, §10.3 item 7; ledger B0 "F10 / S7 edit guard", B2, Q7).
//
// The app's half of M6's rules: server actions refuse with one of these
// sentences before they touch the database, and the database functions
// (`can_edit_flight_glass`, `can_remove_flight_glass`,
// `set_flight_glass_added_via`, `move_flight_glass`) stay the floor. The
// optimistic flight list reorders with `reorderIds` / `crossesSeenGlass`, which
// rebuild the list and refuse a move exactly as `move_flight_glass` does, and
// `moveRefusalSentence` turns that RPC's own refusals into the same copy.
//
// Pure: type imports only, so vitest loads it without the `@/` alias.

import type { RevealMode, TastingStatus } from "./supabase/database.types";

export type FlightGlassState = {
  tastingStatus: TastingStatus;
  revealMode: RevealMode;
  isRevealed: boolean;
  revealStep: number;
  /** From `is_wine_adder`: the host for an `added_by_host` glass; the contributor for their own. */
  viewerIsAdder: boolean;
  viewerIsHost: boolean;
  /** A glass after this one in list order is revealed or has `reveal_step > 0`. */
  laterGlassSeen: boolean;
};

// F10's sentences, word for word (tasting-wine-writes.ts).
export const TASTING_CLOSED = "This tasting is finished — reopen it to add wines.";
export const ALREADY_REVEALED = "This wine has already been revealed.";
export const NOT_ADDER = "Only the person who added this glass can edit it.";

// Spec copy (§3.3 item 10).
export const GLASS_STEP_STARTED = "This glass's reveal has started — it can't be changed now.";
export const LATER_GLASS_SEEN = "A later glass has already been revealed — this one can't be removed now.";
export const SEMI_BLIND_FLIGHT_FIXED =
  "A semi-blind flight is fixed once the tasting starts — the list of wines can't change.";

// `move_flight_glass`'s numbering refusal (M6,
// 20260914095500_flight_edits_until_first_step.sql), "a glass the table has
// already seen cannot change its number", made presentable. Its after-Start
// twin, which also names guessed glasses, shows the same sentence.
export const SEEN_GLASS_REORDER_REFUSAL = "A glass the table has already seen cannot change its number.";

/**
 * A semi-blind tasting's flight is fixed from Start: a new, swapped, removed or
 * reordered glass would change the guests' candidate list in the same refresh
 * (rule 1). Anything but DRAFT has started, legacy OPEN rows included — the
 * database's `status <> 'DRAFT'`.
 */
export function semiBlindFlightFixed(t: { revealMode: RevealMode; tastingStatus: TastingStatus }): boolean {
  return t.revealMode === "SEMI_BLIND" && t.tastingStatus !== "DRAFT";
}

/**
 * Edit: the adder, while the tasting is not CLOSED and the glass is unrevealed
 * with `reveal_step = 0` — in DRAFT and while running (B0). The glass's state
 * is named before who is asking. An OPEN (Taste & rate) glass is inserted
 * revealed and reads ALREADY_REVEALED, so the app never edits it, as today.
 */
export function glassEditRefusal(s: FlightGlassState): string | null {
  if (s.tastingStatus === "CLOSED") return TASTING_CLOSED;
  if (s.isRevealed) return ALREADY_REVEALED;
  if (s.revealStep > 0) return GLASS_STEP_STARTED;
  if (!s.viewerIsAdder) return NOT_ADDER;
  return null;
}

/**
 * Swap (re-point the answer key on the same glass): Edit's rule, and never a
 * semi-blind glass once the tasting has started. Mirrors
 * `set_flight_glass_added_via`.
 */
export function glassSwapRefusal(s: FlightGlassState): string | null {
  if (s.tastingStatus === "CLOSED") return TASTING_CLOSED;
  if (semiBlindFlightFixed(s)) return SEMI_BLIND_FLIGHT_FIXED;
  return glassEditRefusal(s);
}

/**
 * Remove: Edit's rule, or the host for any glass while DRAFT (the create
 * sheet's clean-up); never a semi-blind glass once started; never while a
 * later glass has been seen, because removing renumbers it and "Glass N" must
 * not change for a glass the table has seen (MISSED-01). An OPEN board is
 * exempt from that last rule — every glass on it is inserted revealed. Mirrors
 * `can_remove_flight_glass`.
 */
export function glassRemoveRefusal(s: FlightGlassState): string | null {
  if (s.tastingStatus === "CLOSED") return TASTING_CLOSED;
  if (semiBlindFlightFixed(s)) return SEMI_BLIND_FLIGHT_FIXED;
  const hostClearsDraft = s.tastingStatus === "DRAFT" && s.viewerIsHost;
  if (!hostClearsDraft) {
    const refusal = glassEditRefusal(s);
    if (refusal) return refusal;
  }
  if (s.laterGlassSeen && s.revealMode !== "OPEN") return LATER_GLASS_SEEN;
  return null;
}

/**
 * Adding a glass: refused once a semi-blind tasting has started (Q7). Only the
 * semi-blind rule — the add path keeps its own CLOSED and membership checks.
 */
export function semiBlindAddRefusal(t: { revealMode: RevealMode; tastingStatus: TastingStatus }): string | null {
  return semiBlindFlightFixed(t) ? SEMI_BLIND_FLIGHT_FIXED : null;
}

/**
 * The flight after moving `wineId` to the 1-based place `toIndex`, built as
 * `move_flight_glass` builds it: take the glass out, insert it at that place.
 * Null for a glass not in the flight or a place outside 1..length (the RPC's
 * "no such place in the flight").
 */
export function reorderIds(ids: readonly string[], wineId: string, toIndex: number): string[] | null {
  if (!ids.includes(wineId)) return null;
  if (!Number.isInteger(toIndex) || toIndex < 1 || toIndex > ids.length) return null;
  const rest = ids.filter((id) => id !== wineId);
  return [...rest.slice(0, toIndex - 1), wineId, ...rest.slice(toIndex - 1)];
}

/** What a reorder must also respect once the tasting has started (M6 decision 5). */
export type ReorderGuard = {
  /** The tasting has started: anything but DRAFT, or a stamped `started_at`. */
  started?: boolean;
  /** A started semi-blind flight (`semiBlindFlightFixed`): nothing moves. */
  semiBlindFlightFixed?: boolean;
  /** Glasses that have a guess row. After Start they keep their number too. */
  guessed?: ReadonlySet<string>;
};

/**
 * Whether `move_flight_glass` refuses this reorder (M6 decision 5), so the
 * optimistic list refuses it before any round trip:
 * - a started semi-blind flight moves nothing;
 * - a glass the table has seen (revealed, or its reveal started) never changes
 *   its number, in DRAFT too. Like the RPC's `array_position(...) <>
 *   array_position(...)`, a seen id missing from either list is not compared;
 * - after Start, no glass from the moved glass's old place to its new one, both
 *   ends included, may be seen or guessed.
 * An unchanged order refuses nothing: the list never sends one.
 */
export function crossesSeenGlass(
  before: readonly string[],
  after: readonly string[],
  seen: ReadonlySet<string>,
  guard: ReorderGuard = {},
): boolean {
  const first = before.findIndex((id, i) => after[i] !== id);
  if (first === -1) return false;
  if (guard.semiBlindFlightFixed) return true;
  const renumbersSeen = before.some((id, from) => {
    if (!seen.has(id)) return false;
    const to = after.indexOf(id);
    return to !== -1 && to !== from;
  });
  if (renumbersSeen) return true;
  if (!guard.started) return false;
  // One move shifts every glass between its two places, so the range is the
  // run of places whose glass differs.
  let last = before.length - 1;
  while (last > first && after[last] === before[last]) last -= 1;
  return before.slice(first, last + 1).some((id) => seen.has(id) || guard.guessed?.has(id) === true);
}

// `move_flight_glass`'s own sentences (M6) → the lobby's copy. Any other
// refusal is shown as the RPC wrote it.
const MOVE_REFUSAL_COPY: ReadonlyMap<string, string> = new Map([
  ["a semi-blind flight is fixed once the tasting has started", SEMI_BLIND_FLIGHT_FIXED],
  ["a glass the table has already seen cannot change its number", SEEN_GLASS_REORDER_REFUSAL],
  [
    "a glass that has been guessed or seen cannot change its number once the tasting has started",
    SEEN_GLASS_REORDER_REFUSAL,
  ],
]);

/** The lobby's sentence for a `move_flight_glass` refusal, or null for any other message. */
export function moveRefusalSentence(message: string): string | null {
  const key = message.trim().replace(/\.$/, "").toLowerCase();
  return MOVE_REFUSAL_COPY.get(key) ?? null;
}

/**
 * The 1-based place a drag drops on (spec §2.3 item 6), ready for `reorderIds`
 * and `moveFlightGlass`: one place for every rect whose midpoint lies strictly
 * above the pointer, kept within the flight (1..rects, and 1 for an empty list).
 * Rects are in the pointer's coordinate space (`getBoundingClientRect()` with
 * `clientY`), and every rect passed counts.
 *
 * The drag recipe: pass every row in list order, but replace the dragged row's
 * rect with `{ top: pointerY, height: 0 }`. Its midpoint is then never above the
 * pointer, the list keeps its full length for the clamp, and the glass lands
 * after exactly the other rows whose midpoints are above the pointer. Measure
 * the other rows where they rest in the list (at pointerdown, if rows move
 * while dragging).
 *
 * Anything else drops one place off:
 * - the dragged row's original rect counts itself once the pointer passes its
 *   own midpoint (dragging row 1 of three 40px rows to y=22 gives 2, not 1);
 * - its rect drawn under the pointer (a transform) counts itself whenever the
 *   row was grabbed below its centre;
 * - leaving the row out shortens the clamp, so the last place is unreachable
 *   (dragging row 1 of 3 below the flight gives 2, not 3).
 */
export function dropIndex(rowRects: readonly { top: number; height: number }[], pointerY: number): number {
  const above = rowRects.filter((row) => row.top + row.height / 2 < pointerY).length;
  return Math.min(1 + above, Math.max(1, rowRects.length));
}
