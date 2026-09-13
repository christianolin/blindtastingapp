// Who may Edit, Swap, Remove and add a glass in a flight, and when (spec §3.3
// item 10, §10.3 item 7; ledger B0 "F10 / S7 edit guard", B2, Q7).
//
// The app's half of M6's rules: server actions refuse with one of these
// sentences before they touch the database, and the database functions
// (`can_edit_flight_glass`, `can_remove_flight_glass`,
// `set_flight_glass_added_via`, `move_flight_glass`) stay the floor. The
// optimistic flight list reorders with `reorderIds` / `crossesSeenGlass`, which
// rebuild the list exactly as `move_flight_glass` does.
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

/**
 * A semi-blind tasting's flight is fixed from Start: a new, swapped or removed
 * glass would change the guests' candidate list in the same refresh (rule 1).
 * Anything but DRAFT has started, legacy OPEN rows included — the database's
 * `status <> 'DRAFT'`.
 */
function semiBlindFlightFixed(t: { revealMode: RevealMode; tastingStatus: TastingStatus }): boolean {
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

/**
 * Whether a reorder changes the number of a glass the table has seen (revealed,
 * or its reveal started) — what `move_flight_glass` refuses. Like the RPC's
 * `array_position(...) <> array_position(...)`, a seen id missing from either
 * list is not compared.
 */
export function crossesSeenGlass(
  before: readonly string[],
  after: readonly string[],
  seen: ReadonlySet<string>,
): boolean {
  return before.some((id, from) => {
    if (!seen.has(id)) return false;
    const to = after.indexOf(id);
    return to !== -1 && to !== from;
  });
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
