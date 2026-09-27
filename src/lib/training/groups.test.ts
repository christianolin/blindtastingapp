import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import { LEXICON, POOL, arch } from "./__fixtures__/archetypes";
import { TRAINING_COPY } from "./copy";
import {
  findMember,
  groupExpanded,
  groupRanking,
  regionPanelView,
  toggleGroup,
} from "./groups";
import { rankCandidates } from "./match";
import type { CapReason, RankedCandidate, RegionGroup } from "./types";

// The ranking grouped by region (region-guess addendum R1-R3). Every list
// below is in rankCandidates' own order (spec §5.8): uncapped numbers desc,
// uncapped nulls, then capped.

function rc(key: string, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: arch(key), closeness, capped, explanation: null, signatureHits: [] };
}

const summary = (groups: RegionGroup[]) =>
  groups.map((g) => ({
    region: g.region.name,
    closeness: g.closeness,
    capped: g.capped,
    best: g.best.candidate.id,
    members: g.members.map((m) => m.candidate.id),
  }));

const SCORED = [
  rc("margaux", 91),
  rc("vosne", 88),
  rc("cote-rotie", 85),
  rc("cote-de-nuits", 80),
  rc("cdp", 60),
  rc("bandol", 50),
  rc("sauternes", 15, "colour"),
  rc("chablis", 15, "colour"),
  rc("champagne", 12, "colour"),
  rc("sancerre", null, "colour"),
];

describe("groupRanking", () => {
  it("groups by region, stands each at its best member and keeps members in ranking order", () => {
    expect(summary(groupRanking(SCORED))).toEqual([
      { region: "Bordeaux", closeness: 91, capped: null, best: "arch-margaux", members: ["arch-margaux", "arch-sauternes"] },
      {
        region: "Bourgogne",
        closeness: 88,
        capped: null,
        best: "arch-vosne",
        members: ["arch-vosne", "arch-cote-de-nuits", "arch-chablis"],
      },
      { region: "Rhône", closeness: 85, capped: null, best: "arch-cote-rotie", members: ["arch-cote-rotie", "arch-cdp"] },
      { region: "Provence", closeness: 50, capped: null, best: "arch-bandol", members: ["arch-bandol"] },
      { region: "Champagne", closeness: 12, capped: "colour", best: "arch-champagne", members: ["arch-champagne"] },
      { region: "Loire", closeness: null, capped: "colour", best: "arch-sancerre", members: ["arch-sancerre"] },
    ]);
  });

  it("carries the region and its country, keyed by the region id", () => {
    const [bordeaux] = groupRanking(SCORED);
    expect(bordeaux.key).toBe("region-Bordeaux");
    expect(bordeaux.region).toEqual({ id: "region-Bordeaux", name: "Bordeaux" });
    expect(bordeaux.country).toEqual({ id: "country-France", name: "France" });
  });

  it("a capped member never lifts its group above the best uncapped one", () => {
    const groups = groupRanking([rc("vosne", 40), rc("margaux", 10), rc("sauternes", 15, "colour")]);
    expect(summary(groups).map((g) => [g.region, g.closeness, g.capped, g.best])).toEqual([
      ["Bourgogne", 40, null, "arch-vosne"],
      ["Bordeaux", 10, null, "arch-margaux"],
    ]);
  });

  it("puts a group without a number after the numbered ones and before the capped ones", () => {
    const groups = groupRanking([rc("margaux", 70), rc("tannin-free-white", null), rc("chablis", 15, "colour")]);
    expect(summary(groups).map((g) => [g.region, g.closeness, g.capped])).toEqual([
      ["Bordeaux", 70, null],
      ["Niederösterreich", null, null],
      ["Bourgogne", 15, "colour"],
    ]);
  });

  it("breaks a tie by country, then region (the matcher broke it by wine name)", () => {
    const groups = groupRanking([rc("bandol", 80), rc("sancerre", 80), rc("tannin-free-white", 80)]);
    expect(groups.map((g) => g.region.name)).toEqual(["Niederösterreich", "Loire", "Provence"]);
  });

  it("before any answer: every group, by country then region, with no number", () => {
    const ranked = rankCandidates(emptyNoteState(), { bubbles: null, fortified: null }, POOL, LEXICON);
    const groups = groupRanking(ranked);
    expect(groups.map((g) => `${g.country.name} / ${g.region.name}`)).toEqual([
      "Austria / Niederösterreich",
      "France / Alsace",
      "France / Bordeaux",
      "France / Bourgogne",
      "France / Champagne",
      "France / Loire",
      "France / Provence",
      "France / Rhône",
      "Portugal / Porto",
    ]);
    expect(groups.every((g) => g.closeness === null && g.capped === null)).toBe(true);
    expect(groups.flatMap((g) => g.members)).toHaveLength(POOL.length);
  });

  it("is empty for an empty ranking", () => {
    expect(groupRanking([])).toEqual([]);
  });
});

describe("findMember", () => {
  it("finds a wine in whichever group holds it", () => {
    const groups = groupRanking(SCORED);
    expect(findMember(groups, "arch-cdp")?.closeness).toBe(60);
    expect(findMember(groups, "arch-nope")).toBeNull();
  });
});

describe("regionPanelView", () => {
  const groups = groupRanking([...SCORED.slice(0, 6), rc("alsace-riesling", 40), ...SCORED.slice(6)]);

  it("shows the top five groups until Show all, with the top one's key", () => {
    const view = regionPanelView(groups, false);
    expect(view.total).toBe(7);
    expect(view.hidden).toBe(2);
    expect(view.before).toBe(false);
    expect(view.topKey).toBe("region-Bordeaux");
    expect(view.sections.map((s) => [s.heading, s.groups.map((g) => g.region.name)])).toEqual([
      [null, ["Bordeaux", "Bourgogne", "Rhône", "Provence", "Alsace"]],
    ]);
  });

  it("shows every group once Show all is on, the capped ones under the unlikely heading", () => {
    const view = regionPanelView(groups, true);
    expect(view.hidden).toBe(0);
    expect(view.sections.map((s) => [s.key, s.heading, s.groups.map((g) => g.region.name)])).toEqual([
      ["likely", null, ["Bordeaux", "Bourgogne", "Rhône", "Provence", "Alsace"]],
      ["unlikely", TRAINING_COPY.unlikelyGroup, ["Champagne", "Loire"]],
    ]);
  });

  it("is in before-answers mode only while no wine has a number or a cap", () => {
    const empty = rankCandidates(emptyNoteState(), { bubbles: null, fortified: null }, POOL, LEXICON);
    expect(regionPanelView(groupRanking(empty), false).before).toBe(true);
    // A capped wine in an otherwise un-numbered group still ends it.
    expect(regionPanelView(groupRanking([rc("vosne", null), rc("chablis", 15, "colour")]), false).before).toBe(false);
    expect(regionPanelView([], false)).toEqual({ before: true, sections: [], total: 0, hidden: 0, topKey: null });
  });
});

describe("group rows open and close", () => {
  it("only the top group starts open", () => {
    expect(groupExpanded("region-Bordeaux", "region-Bordeaux", {})).toBe(true);
    expect(groupExpanded("region-Rhône", "region-Bordeaux", {})).toBe(false);
    expect(groupExpanded("region-Rhône", null, {})).toBe(false);
  });

  it("a tap flips a row from what it shows, and the choice sticks", () => {
    const top = "region-Bordeaux";
    let state = toggleGroup({}, top, top);
    expect(groupExpanded(top, top, state)).toBe(false);
    state = toggleGroup(state, "region-Rhône", top);
    expect(groupExpanded("region-Rhône", top, state)).toBe(true);
    // Rhône becomes the top group: it stays open, Bordeaux stays closed.
    expect(groupExpanded("region-Rhône", "region-Rhône", state)).toBe(true);
    expect(groupExpanded(top, "region-Rhône", state)).toBe(false);
    expect(toggleGroup(state, "region-Rhône", top)).toEqual({ [top]: false, "region-Rhône": false });
  });
});
