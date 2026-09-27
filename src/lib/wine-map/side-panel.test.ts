import { describe, expect, it } from "vitest";
import {
  initialSidePanel,
  sidePanelReducer,
  type SidePanelState,
  type SidePanelTab,
} from "./side-panel";

const state = (tab: SidePanelTab, open: boolean): SidePanelState => ({ tab, open });
const TABS: SidePanelTab[] = ["explore", "details"];
const ALL = [true, false].flatMap((open) => TABS.map((tab) => state(tab, open)));

describe("initialSidePanel", () => {
  it("opens on Explore when the page loads without ?place=", () => {
    expect(initialSidePanel(null)).toEqual(state("explore", true));
  });

  it("opens on Details when the page loads with ?place=", () => {
    expect(initialSidePanel("france.bordeaux")).toEqual(state("details", true));
  });
});

describe("sidePanelReducer", () => {
  it("select sets Details and never opens a collapsed column", () => {
    expect(sidePanelReducer(state("explore", true), { type: "select" })).toEqual(
      state("details", true),
    );
    expect(sidePanelReducer(state("explore", false), { type: "select" })).toEqual(
      state("details", false),
    );
  });

  it("select on Details changes nothing and keeps the same object", () => {
    for (const open of [true, false]) {
      const before = state("details", open);
      expect(sidePanelReducer(before, { type: "select" })).toBe(before);
    }
  });

  it("tab sets that tab and never changes open", () => {
    for (const before of ALL) {
      for (const tab of TABS) {
        const after = sidePanelReducer(before, { type: "tab", tab });
        expect(after).toEqual(state(tab, before.open));
        if (tab === before.tab) expect(after).toBe(before);
      }
    }
  });

  it("toggle flips open and keeps the tab", () => {
    for (const before of ALL) {
      const after = sidePanelReducer(before, { type: "toggle" });
      expect(after).toEqual(state(before.tab, !before.open));
      expect(sidePanelReducer(after, { type: "toggle" })).toEqual(before);
    }
  });
});
