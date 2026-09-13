// Per-field-group save queue for the guess ladder (spec §8.3 item 5; BT-Y1;
// critic on XCUT-53). Pure — no React, no Supabase — so the race cases are
// pinned by guess-save-queue.test.ts. Runtime imports are relative only
// (vitest has no `@/` alias). `LOCKED_EDIT_REFUSAL` is a plain string
// constant from ladder-copy.ts (BT-P5), so importing it keeps this file pure.
//
// One slot per GuessFieldGroup holds only the newest pending pick for that
// group — a second pick in a group supersedes the first (spec §8.3 item 5).
// The visible row is the last server-confirmed row overlaid with every
// group's still-pending values.
//
// A "confirmed" whose seq no longer matches the group's pending slot is NOT
// dropped outright (review round 1: it used to be, which lost a save that
// had actually landed on the server once a newer pick superseded its pending
// slot before the reply arrived — a later failure of that newer pick then
// had nothing to fall back to and showed an empty field the server did not
// agree with). Instead `confirmedSeq` — a per-group high-water mark — decides
// whether the event is truly stale (`seq <= confirmedSeq[group]`, already
// superseded by an equal-or-later confirm) or a real, out-of-order success
// for an attempt that is no longer the pending one: that case still merges
// into `confirmed` (using the event's own `values`, since the pending slot
// itself may already hold a different attempt's values) but leaves `pending`
// and `errors` alone — the newer attempt is still outstanding and owns those.
// A "failed" event is still dropped whenever it does not match the current
// pending slot, exactly as before: a failure must never revert a value or
// raise an error for an attempt a newer pick has already superseded.
import { LOCKED_EDIT_REFUSAL } from "./ladder-copy";
import type { GuessFieldGroup } from "./guess-write";
import type { GuessRow } from "./ladder-types";

export type SaveQueueState = {
  confirmed: GuessRow; // the last server-confirmed row
  pending: Partial<Record<GuessFieldGroup, { seq: number; values: Partial<GuessRow> }>>; // the newest unconfirmed pick per group
  confirmedSeq: Partial<Record<GuessFieldGroup, number>>; // a seq at or below this per group is stale and ignored
  errors: Partial<Record<GuessFieldGroup, string>>;
  nextSeq: number;
};

export type SaveQueueEvent =
  | { type: "picked"; group: GuessFieldGroup; values: Partial<GuessRow> } // takes the next seq
  // `values` is optional only so the plan's illustrative event literals
  // (and the tests below that use them) keep compiling without it; the real
  // pump (guess-ladder.tsx, via saveResultEvent) always supplies its own
  // attempt's values, which is what makes the out-of-order-success case above
  // possible to apply correctly.
  | { type: "confirmed"; group: GuessFieldGroup; seq: number; values?: Partial<GuessRow> }
  | { type: "failed"; group: GuessFieldGroup; seq: number; error: string };

export function initialSaveQueue(row: GuessRow): SaveQueueState {
  return { confirmed: row, pending: {}, confirmedSeq: {}, errors: {}, nextSeq: 1 };
}

function withoutGroup<T>(
  record: Partial<Record<GuessFieldGroup, T>>,
  group: GuessFieldGroup,
): Partial<Record<GuessFieldGroup, T>> {
  if (!(group in record)) return record;
  const next = { ...record };
  delete next[group];
  return next;
}

export function saveQueueReducer(state: SaveQueueState, event: SaveQueueEvent): SaveQueueState {
  switch (event.type) {
    case "picked":
      // A new pick always takes the next seq and replaces whatever this
      // group's pending slot held — the second pick supersedes the first.
      // A fresh attempt clears any error the last attempt left behind.
      return {
        ...state,
        nextSeq: state.nextSeq + 1,
        pending: { ...state.pending, [event.group]: { seq: state.nextSeq, values: event.values } },
        errors: withoutGroup(state.errors, event.group),
      };
    case "confirmed": {
      const already = state.confirmedSeq[event.group] ?? 0;
      // Truly stale: an equal-or-later confirm already settled this group.
      if (event.seq <= already) return state;
      const slot = state.pending[event.group];
      const matchesPending = slot !== undefined && slot.seq === event.seq;
      // This attempt's own values, when the event carries them (the real
      // pump always does); otherwise only usable when it's still the
      // pending slot, since that is the only place the plan's `{ type:
      // "confirmed", group, seq }` literals (no values) could get them from.
      const values = event.values ?? (matchesPending ? slot.values : undefined);
      return {
        ...state,
        confirmed: values ? { ...state.confirmed, ...values } : state.confirmed,
        // Only the attempt that is still the pending one gets cleared — a
        // late success for a superseded attempt must not swallow the newer
        // pick that replaced it (that pick's own confirm/fail owns this
        // group's pending slot and error).
        pending: matchesPending ? withoutGroup(state.pending, event.group) : state.pending,
        confirmedSeq: { ...state.confirmedSeq, [event.group]: event.seq },
        errors: matchesPending ? withoutGroup(state.errors, event.group) : state.errors,
      };
    }
    case "failed": {
      const slot = state.pending[event.group];
      // Stale: a later pick in the same group already confirmed or is still
      // pending — this failure must not revert its value or raise its error.
      if (!slot || slot.seq !== event.seq) return state;
      return {
        ...state,
        pending: withoutGroup(state.pending, event.group),
        errors: { ...state.errors, [event.group]: event.error },
      };
    }
  }
}

/** The last confirmed row, overlaid with every group's still-pending values. */
export function visibleRow(state: SaveQueueState): GuessRow {
  let row = state.confirmed;
  for (const slot of Object.values(state.pending)) {
    if (slot) row = { ...row, ...slot.values };
  }
  return row;
}

/** No group has a save still in flight — safe to lock. */
export function allSettled(state: SaveQueueState): boolean {
  return Object.keys(state.pending).length === 0;
}

/**
 * Maps one save attempt's server result to the event the pump should
 * dispatch (review round 1: this mapping used to live inline in the pump's
 * for-loop, untested, and its "quiet" branch dispatched nothing at all — the
 * pending slot it should have cleared stayed forever, so the loop resent the
 * same save every iteration). `locked` is whether "Lock in glass N" has
 * already committed on this client (guess-ladder.tsx's `lockedRef`): a
 * 42501 (`LOCKED_EDIT_REFUSAL`) that lands after that point is the lock pin
 * firing on a save that raced it, not a real failure — the ladder is already
 * on its way to "Locked in" (spec §8.3 item 5), so it settles quietly as a
 * confirmed carrying this attempt's own values (not a revert, not an error)
 * rather than a failed — which is also what lets the pump's `for (;;)` loop
 * see the pending slot cleared and exit instead of retrying forever.
 */
export function saveResultEvent(
  group: GuessFieldGroup,
  seq: number,
  values: Partial<GuessRow>,
  result: { ok: true } | { error: string },
  locked: boolean,
): SaveQueueEvent {
  if ("error" in result) {
    if (locked && result.error === LOCKED_EDIT_REFUSAL) {
      return { type: "confirmed", group, seq, values };
    }
    return { type: "failed", group, seq, error: result.error };
  }
  return { type: "confirmed", group, seq, values };
}
