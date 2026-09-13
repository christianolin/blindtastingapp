import { describe, expect, it } from "vitest";
import {
  allSettled,
  initialSaveQueue,
  saveQueueReducer,
  saveResultEvent,
  visibleRow,
  type SaveQueueEvent,
  type SaveQueueState,
} from "./guess-save-queue";
import { LOCKED_EDIT_REFUSAL } from "./ladder-copy";
import type { GuessRow } from "./ladder-types";

const empty: GuessRow = {
  country_id: null, region_id: null, appellation_id: null, primary_grape_id: null, secondary_grape_id: null,
  producer_id: null, type_designation_id: null, vintage_kind: null, vintage_year: null, vintage_tawny_years: null,
};
const run = (s: SaveQueueState, ...events: SaveQueueEvent[]) => events.reduce(saveQueueReducer, s);

describe("per-group save queues (B7; critic on XCUT-53)", () => {
  it("a failure reverts only its own group while another group's newer pick is pending", () => {
    let s = run(initialSaveQueue(empty),
      { type: "picked", group: "origin", values: { country_id: "it" } },               // seq 1
      { type: "picked", group: "grapes", values: { primary_grape_id: "nebbiolo" } });  // seq 2
    s = run(s, { type: "failed", group: "origin", seq: 1, error: "offline" });
    expect(visibleRow(s)).toMatchObject({ country_id: null, primary_grape_id: "nebbiolo" });
    expect(s.errors).toEqual({ origin: "offline" });
    expect(allSettled(s)).toBe(false);
  });
  it("confirmations may arrive out of order", () => {
    let s = run(initialSaveQueue(empty),
      { type: "picked", group: "origin", values: { country_id: "it" } },
      { type: "picked", group: "producer", values: { producer_id: "vietti" } });
    s = run(s, { type: "confirmed", group: "producer", seq: 2 }, { type: "confirmed", group: "origin", seq: 1 });
    expect(visibleRow(s)).toMatchObject({ country_id: "it", producer_id: "vietti" });
    expect(allSettled(s)).toBe(true);
  });
  it("a second pick in a group supersedes the first", () => {
    let s = run(initialSaveQueue(empty),
      { type: "picked", group: "grapes", values: { primary_grape_id: "barbera" } },    // seq 1
      { type: "picked", group: "grapes", values: { primary_grape_id: "nebbiolo" } });  // seq 2
    s = run(s, { type: "confirmed", group: "grapes", seq: 1 });
    expect(visibleRow(s).primary_grape_id).toBe("nebbiolo");
    expect(allSettled(s)).toBe(false);
    s = run(s, { type: "confirmed", group: "grapes", seq: 2 });
    expect(s.confirmed.primary_grape_id).toBe("nebbiolo");
  });
  it("a failure that arrives after a later successful pick in the same group keeps the later value", () => {
    const s = run(initialSaveQueue(empty),
      { type: "picked", group: "grapes", values: { primary_grape_id: "barbera" } },    // seq 1
      { type: "picked", group: "grapes", values: { primary_grape_id: "nebbiolo" } },   // seq 2
      { type: "confirmed", group: "grapes", seq: 2 },
      { type: "failed", group: "grapes", seq: 1, error: "timeout" });
    expect(visibleRow(s).primary_grape_id).toBe("nebbiolo");
    expect(s.errors).toEqual({});
  });
  it("Lock waits until every group has settled", () => {
    const s = run(initialSaveQueue(empty), { type: "picked", group: "vintage", values: { vintage_kind: "NV" } });
    expect(allSettled(s)).toBe(false);
    expect(allSettled(run(s, { type: "confirmed", group: "vintage", seq: 1 }))).toBe(true);
  });

  // Review round 1: guess-save-queue.test.ts passed on reducers broken in
  // ways that matter — a `failed` that ignored seq, and a `confirmed` that
  // never wrote confirmedSeq — because no test exercised an older-seq
  // failure racing a newer pending pick, or the 42501-after-lock path. Added
  // per spec §8.5 ("a 42501 after a lock").
  it("an older-seq failure while a newer pick in the same group is pending keeps the newer pick pending and shows no error", () => {
    const s = run(initialSaveQueue(empty),
      { type: "picked", group: "grapes", values: { primary_grape_id: "barbera" } },    // seq 1
      { type: "picked", group: "grapes", values: { primary_grape_id: "nebbiolo" } },   // seq 2 supersedes it
      { type: "failed", group: "grapes", seq: 1, error: "offline" });                  // seq 1's failure arrives late
    expect(visibleRow(s).primary_grape_id).toBe("nebbiolo");
    expect(s.errors).toEqual({});
    expect(allSettled(s)).toBe(false);
  });

  it("saveResultEvent maps a 42501 after a lock to a quiet confirmed, and otherwise to a failed", () => {
    const values = { vintage_kind: "NV" as const };
    // Locked: the lock pin fired on a save that raced it — settle quietly,
    // carrying this attempt's own values, so the pump's pending slot clears
    // (review round 1: dispatching nothing here left it uncleared forever,
    // and the pump's for (;;) loop resent the same save on every iteration).
    expect(saveResultEvent("vintage", 1, values, { error: LOCKED_EDIT_REFUSAL }, true)).toEqual({
      type: "confirmed",
      group: "vintage",
      seq: 1,
      values,
    });
    // Not locked yet: the same error is a real failure.
    expect(saveResultEvent("vintage", 1, values, { error: LOCKED_EDIT_REFUSAL }, false)).toEqual({
      type: "failed",
      group: "vintage",
      seq: 1,
      error: LOCKED_EDIT_REFUSAL,
    });
    // Locked, but a different error: still a real failure — only the lock
    // pin's own refusal is swallowed.
    expect(saveResultEvent("vintage", 1, values, { error: "offline" }, true)).toEqual({
      type: "failed",
      group: "vintage",
      seq: 1,
      error: "offline",
    });
  });

  it("a 42501-after-lock confirmed settles the group: pending clears and allSettled sees it (the pump's loop can exit)", () => {
    let s = run(initialSaveQueue(empty), { type: "picked", group: "vintage", values: { vintage_kind: "NV" } }); // seq 1
    expect(allSettled(s)).toBe(false);
    const event = saveResultEvent("vintage", 1, { vintage_kind: "NV" }, { error: LOCKED_EDIT_REFUSAL }, true);
    s = saveQueueReducer(s, event);
    expect(s.confirmed.vintage_kind).toBe("NV"); // does not revert
    expect(s.errors).toEqual({}); // quiet — no error shown
    expect(allSettled(s)).toBe(true);
  });

  // The bug review round 1 found: a "confirmed" for a seq the pending slot
  // had already moved past used to be dropped outright, even though the
  // pump only dispatches it once that attempt's own save actually landed on
  // the server — so a later failure of the newer attempt had nothing to
  // fall back to and showed a field empty when the server still held the
  // older value.
  it("an older pick's own confirm still lands after a newer pick supersedes it, and a later failure of the newer pick falls back to it", () => {
    let s = run(initialSaveQueue(empty),
      { type: "picked", group: "grapes", values: { primary_grape_id: "barbera" } },    // seq 1, sent to the server first
      { type: "picked", group: "grapes", values: { primary_grape_id: "nebbiolo" } });  // seq 2 supersedes the pending slot before seq 1's reply
    s = saveQueueReducer(s, {
      type: "confirmed",
      group: "grapes",
      seq: 1,
      values: { primary_grape_id: "barbera" }, // the pump's own record of what seq 1 sent — not pending.grapes, which is now seq 2
    });
    expect(s.confirmed.primary_grape_id).toBe("barbera"); // applied despite being stale vs. pending
    expect(visibleRow(s).primary_grape_id).toBe("nebbiolo"); // seq 2 is still pending and still shown
    expect(allSettled(s)).toBe(false);
    s = saveQueueReducer(s, { type: "failed", group: "grapes", seq: 2, error: "offline" });
    expect(visibleRow(s).primary_grape_id).toBe("barbera"); // falls back to what the server actually holds, not null
    expect(s.errors).toEqual({ grapes: "offline" });
    expect(allSettled(s)).toBe(true);
  });
});
