import { describe, expect, it } from "vitest";
import {
  CLOSED_SHEET,
  DETAILS_HALF,
  HALF_SNAP_SHARE,
  SHEET_DRAG_THRESHOLD,
  halfSnapHeightPx,
  initialSheet,
  isSheetDrag,
  sheetReducer,
  type SheetState,
} from "./sheet-state";

// The phone map's bottom sheet (spec 2026-09-25 §1 D4, §3).
const at = (snap: SheetState["snap"], tab: SheetState["tab"]): SheetState => ({
  snap,
  tab,
});

describe("initialSheet", () => {
  it("starts closed on Explore without a deep link", () => {
    expect(initialSheet(null)).toEqual(at("closed", "explore"));
    expect(CLOSED_SHEET).toEqual(at("closed", "explore"));
  });

  it("starts on Details at half for a ?place= load", () => {
    expect(initialSheet("france.bourgogne")).toEqual(at("half", "details"));
    expect(DETAILS_HALF).toEqual(at("half", "details"));
  });
});

describe("halfSnapHeightPx", () => {
  it("is half the layout viewport, as the half snap's h-[50dvh] renders", () => {
    expect(HALF_SNAP_SHARE).toBe(0.5);
    expect(halfSnapHeightPx(812)).toBe(406);
    expect(halfSnapHeightPx(667)).toBe(334);
  });
});

describe("sheetReducer: tabs", () => {
  it("a tab opens half on that tab when closed", () => {
    expect(sheetReducer(at("closed", "explore"), { type: "tab", tab: "details" })).toEqual(at("half", "details"));
    expect(sheetReducer(at("closed", "details"), { type: "tab", tab: "explore" })).toEqual(at("half", "explore"));
    expect(sheetReducer(at("closed", "explore"), { type: "tab", tab: "explore" })).toEqual(at("half", "explore"));
  });

  it("the shown tab again closes, keeping the tab", () => {
    expect(sheetReducer(at("half", "details"), { type: "tab", tab: "details" })).toEqual(at("closed", "details"));
    expect(sheetReducer(at("full", "explore"), { type: "tab", tab: "explore" })).toEqual(at("closed", "explore"));
  });

  it("the other tab switches, keeping the snap", () => {
    expect(sheetReducer(at("half", "explore"), { type: "tab", tab: "details" })).toEqual(at("half", "details"));
    expect(sheetReducer(at("full", "details"), { type: "tab", tab: "explore" })).toEqual(at("full", "explore"));
  });
});

describe("sheetReducer: chevron and Escape", () => {
  it("the chevron opens half on the current tab and closes an open sheet", () => {
    expect(sheetReducer(at("closed", "details"), { type: "toggle" })).toEqual(at("half", "details"));
    expect(sheetReducer(at("half", "explore"), { type: "toggle" })).toEqual(at("closed", "explore"));
    expect(sheetReducer(at("full", "details"), { type: "toggle" })).toEqual(at("closed", "details"));
  });

  it("Escape closes and keeps the tab; an already closed sheet is the same object", () => {
    expect(sheetReducer(at("half", "details"), { type: "close" })).toEqual(at("closed", "details"));
    expect(sheetReducer(at("full", "explore"), { type: "close" })).toEqual(at("closed", "explore"));
    const closed = at("closed", "explore");
    expect(sheetReducer(closed, { type: "close" })).toBe(closed);
  });
});

describe("sheetReducer: a selection opens Details at half", () => {
  for (const type of ["mapTap", "treePick", "deepLink"] as const) {
    it(`${type}, from every state`, () => {
      for (const state of [
        at("closed", "explore"),
        at("closed", "details"),
        at("half", "explore"),
        at("full", "explore"),
        at("full", "details"),
      ]) {
        expect(sheetReducer(state, { type })).toEqual(at("half", "details"));
      }
    });
  }

  it("a map tap while Details already shows at half is the same object", () => {
    // select() returns early for the place already selected; the sheet still
    // gets the event, and this is what it does with it.
    const shown = at("half", "details");
    expect(sheetReducer(shown, { type: "mapTap" })).toBe(shown);
  });
});

describe("sheetReducer: the drag handle", () => {
  it("up goes full from closed and half, keeping the tab", () => {
    expect(sheetReducer(at("closed", "explore"), { type: "drag", dy: -120 })).toEqual(at("full", "explore"));
    expect(sheetReducer(at("half", "details"), { type: "drag", dy: -40 })).toEqual(at("full", "details"));
  });

  it("down closes from half and full, keeping the tab", () => {
    expect(sheetReducer(at("half", "details"), { type: "drag", dy: 200 })).toEqual(at("closed", "details"));
    expect(sheetReducer(at("full", "explore"), { type: "drag", dy: 40 })).toEqual(at("closed", "explore"));
  });

  it("counts from exactly the threshold", () => {
    expect(sheetReducer(at("half", "explore"), { type: "drag", dy: -SHEET_DRAG_THRESHOLD })).toEqual(at("full", "explore"));
    expect(sheetReducer(at("half", "explore"), { type: "drag", dy: SHEET_DRAG_THRESHOLD })).toEqual(at("closed", "explore"));
  });

  it("a jitter under the threshold is a tap: the same object", () => {
    const half = at("half", "details");
    expect(sheetReducer(half, { type: "drag", dy: SHEET_DRAG_THRESHOLD - 1 })).toBe(half);
    expect(sheetReducer(half, { type: "drag", dy: -(SHEET_DRAG_THRESHOLD - 1) })).toBe(half);
    expect(sheetReducer(half, { type: "drag", dy: 0 })).toBe(half);
  });

  it("down on a closed sheet and up on a full one change nothing", () => {
    const closed = at("closed", "explore");
    expect(sheetReducer(closed, { type: "drag", dy: 80 })).toBe(closed);
    const full = at("full", "details");
    expect(sheetReducer(full, { type: "drag", dy: -80 })).toBe(full);
  });
});

describe("isSheetDrag", () => {
  it("is a drag from 32 px of travel either way", () => {
    expect(SHEET_DRAG_THRESHOLD).toBe(32);
    expect(isSheetDrag(0)).toBe(false);
    expect(isSheetDrag(31)).toBe(false);
    expect(isSheetDrag(-31)).toBe(false);
    expect(isSheetDrag(32)).toBe(true);
    expect(isSheetDrag(-32)).toBe(true);
  });
});
