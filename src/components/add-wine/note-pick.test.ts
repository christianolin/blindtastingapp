import { describe, expect, it } from "vitest";
import { isRevealDestination, revealSafePick, routeNotePick } from "./note-pick";
import { initialSheetState } from "./sheet-state";
import type { AddWineDestination, NotePick } from "./types";

// Training-room spec §3.4 and Review Focus 5: the reveal sheet hands the pick
// back to the room, never opens NewNoteModal, never draws a cellar lot down,
// and ignores a stale pick from an earlier open.
const reveal: AddWineDestination = { kind: "note", reveal: true };
const lotPick: NotePick = { catalogWineId: "c1", lotId: "l1", consume: true };

describe("isRevealDestination", () => {
  it("is only a note destination with reveal", () => {
    expect(isRevealDestination(reveal)).toBe(true);
    expect(isRevealDestination({ kind: "note" })).toBe(false);
    expect(isRevealDestination({ kind: "cellar" })).toBe(false);
    expect(isRevealDestination(null)).toBe(false);
  });
});

describe("revealSafePick", () => {
  it("a reveal pick never consumes, and keeps its wine and lot", () => {
    expect(revealSafePick(lotPick, reveal)).toEqual({ catalogWineId: "c1", lotId: "l1", consume: false });
  });
  it("a Taste & rate pick is left exactly as it was", () => {
    expect(revealSafePick(lotPick, { kind: "note" })).toBe(lotPick);
  });
});

describe("routeNotePick", () => {
  it("drops a pick from an earlier, replaced open — with or without a hand-back", () => {
    expect(routeNotePick({ seq: 1, currentSeq: 2, pick: lotPick, handBack: true })).toEqual({ kind: "ignore" });
    expect(routeNotePick({ seq: 1, currentSeq: 2, pick: lotPick, handBack: false })).toEqual({ kind: "ignore" });
  });
  it("hands the current open's pick back when it passed onNotePick, never consuming", () => {
    expect(routeNotePick({ seq: 2, currentSeq: 2, pick: lotPick, handBack: true })).toEqual({
      kind: "hand-back",
      pick: { catalogWineId: "c1", lotId: "l1", consume: false },
    });
  });
  it("opens the note as today when the open passed no onNotePick", () => {
    expect(routeNotePick({ seq: 2, currentSeq: 2, pick: lotPick, handBack: false })).toEqual({ kind: "open-note", pick: lotPick });
  });
});

describe("the reveal sheet starts with nothing to draw down", () => {
  it("consume is off on both surfaces for a reveal, on for Taste & rate", () => {
    const r = initialSheetState({ destination: reveal, options: {}, canScan: false });
    expect([r.desktop.consume, r.cellar.consume]).toEqual([false, false]);
    const n = initialSheetState({ destination: { kind: "note" }, options: {}, canScan: false });
    expect([n.desktop.consume, n.cellar.consume]).toEqual([true, true]);
  });
});
