// The status line under the Map detail switch (spec 2026-09-23 §7.1). Every
// string is pinned exactly: the owner approved this copy word for word.
// Controller ruling R3 adds `pastDepthZoom`: past NEIGHBOUR_MIN_ZOOM, a focus
// country with no subregion places gets an honest "nothing mapped here" line
// instead of a "zoom in" hint that would no longer be true.
import { describe, expect, it } from "vitest";
import { DETAIL_WARNING, detailStatus, selectionCueText } from "./detail-status";
import { NEIGHBOUR_MIN_ZOOM } from "./mount-policy";
import { scanPastDepthZoom } from "./focus";

type Input = Parameters<typeof detailStatus>[0];
const base: Input = {
  tree: "ready",
  detail: "one",
  fellBack: false,
  focusName: "France",
  depthVisible: true,
  otherCountriesInView: false,
  pastDepthZoom: false,
};

describe("detailStatus", () => {
  it("keeps the owner's warning verbatim", () => {
    expect(DETAIL_WARNING).toBe("Uses more resources and can cause lag.");
  });

  it("is empty while the place tree loads, whatever else is true", () => {
    expect(detailStatus({ ...base, tree: "loading" })).toEqual({ text: "", retry: false });
    expect(
      detailStatus({ ...base, tree: "loading", detail: "all", fellBack: true, pastDepthZoom: true }),
    ).toEqual({
      text: "",
      retry: false,
    });
  });

  it("offers a retry when the place tree failed", () => {
    expect(detailStatus({ ...base, tree: "failed", detail: "all" })).toEqual({
      text: "Subregion detail couldn't load.",
      retry: true,
    });
  });

  it("explains a fallback to One country", () => {
    expect(detailStatus({ ...base, fellBack: true })).toEqual({
      text: "Switched to One country after a problem last time.",
      retry: false,
    });
  });

  it("shows the warning whenever All countries is on", () => {
    expect(detailStatus({ ...base, detail: "all", focusName: null })).toEqual({
      text: "Subregions for all countries. Uses more resources and can cause lag.",
      retry: false,
    });
  });

  it("One country with no focus says how to get one", () => {
    expect(detailStatus({ ...base, focusName: null, depthVisible: false })).toEqual({
      text: "Zoom in on a country, or tap one below, to see its subregions.",
      retry: false,
    });
  });

  it("One country before the focus country's subregions draw, below the neighbour zoom", () => {
    expect(detailStatus({ ...base, depthVisible: false, pastDepthZoom: false })).toEqual({
      text: "Zoom in to see France's subregions.",
      retry: false,
    });
    // A country whose regions have no tier >= 2 places at all (Baden) reads
    // the same below NEIGHBOUR_MIN_ZOOM — more zoom may yet reveal them.
    expect(
      detailStatus({ ...base, focusName: "Germany", depthVisible: false, pastDepthZoom: false })
        .text,
    ).toBe("Zoom in to see Germany's subregions.");
  });

  it("says nothing is mapped here once past the neighbour zoom (controller ruling R3)", () => {
    // Regions such as Baden, Franken, Navarra, Saale-Unstrut and Württemberg
    // have no subregion places at all, so telling the viewer to zoom in
    // further is false once they are already at NEIGHBOUR_MIN_ZOOM (8).
    expect(NEIGHBOUR_MIN_ZOOM).toBe(8);
    expect(
      detailStatus({ ...base, focusName: "Germany", depthVisible: false, pastDepthZoom: true }),
    ).toEqual({
      text: "No subregions mapped here for Germany yet.",
      retry: false,
    });
    expect(detailStatus({ ...base, depthVisible: false, pastDepthZoom: true })).toEqual({
      text: "No subregions mapped here for France yet.",
      retry: false,
    });
  });

  it("One country with subregions drawn", () => {
    expect(detailStatus(base)).toEqual({ text: "Subregions: France.", retry: false });
    expect(detailStatus({ ...base, otherCountriesInView: true })).toEqual({
      text: "Subregions: France. Other countries show regions only.",
      retry: false,
    });
  });

  it("uses the name as displayed, local or English", () => {
    expect(detailStatus({ ...base, focusName: "Deutschland" }).text).toBe(
      "Subregions: Deutschland.",
    );
  });
});

// The size rule (design 2026-09-30): at z8 or deeper, a subregion the rule
// alone still hides keeps "Zoom in" rather than "No subregions mapped here".
describe("detailStatus with a size-hidden subregion", () => {
  it("keeps 'Zoom in to see {F}'s subregions.' when the probe found one", () => {
    const pastDepthZoom = scanPastDepthZoom({
      scanZoom: 8.5,
      scanFocus: "france",
      focusCountry: "france",
      depthHidden: true,
    });
    expect(
      detailStatus({ ...base, focusName: "France", depthVisible: false, pastDepthZoom }).text,
    ).toBe("Zoom in to see France's subregions.");
  });

  it("still says 'No subregions mapped here for {F} yet.' when it found none", () => {
    const pastDepthZoom = scanPastDepthZoom({
      scanZoom: 8.5,
      scanFocus: "france",
      focusCountry: "france",
      depthHidden: false,
    });
    expect(
      detailStatus({ ...base, focusName: "France", depthVisible: false, pastDepthZoom }).text,
    ).toBe("No subregions mapped here for France yet.");
  });
});

// Review 2026-09-30: a drill-down (Northern Rhône at z7.5) could land where
// every child is still under the size threshold, while the line said
// "Subregions: France." The selected place's own children now speak first.
describe("detailStatus with a selection whose children are size-hidden", () => {
  const shown = { ...base, focusName: "France", depthVisible: true };
  it("says to zoom in for the selected place when none of its children is drawn", () => {
    expect(
      detailStatus({ ...shown, selection: { name: "Rhône septentrional", drawn: 0, hidden: 8 } }).text,
    ).toBe("Zoom in to see the subregions of Rhône septentrional.");
  });

  it("says 'all the subregions' when some are drawn", () => {
    expect(detailStatus({ ...shown, selection: { name: "Bourgogne", drawn: 2, hidden: 4 } }).text).toBe(
      "Zoom in to see all the subregions of Bourgogne.",
    );
  });

  it("says nothing new when every child in view is drawn, or there is no selection", () => {
    expect(detailStatus({ ...shown, selection: { name: "Bourgogne", drawn: 6, hidden: 0 } }).text).toBe(
      "Subregions: France.",
    );
    expect(detailStatus({ ...shown, selection: null }).text).toBe("Subregions: France.");
  });

  it("never replaces loading, failure, the fallback notice or the All countries warning", () => {
    const selection = { name: "Jura", drawn: 0, hidden: 4 };
    expect(detailStatus({ ...shown, selection, tree: "loading" }).text).toBe("");
    expect(detailStatus({ ...shown, selection, tree: "failed" }).retry).toBe(true);
    expect(detailStatus({ ...shown, selection, fellBack: true }).text).toMatch(/^Switched/);
    expect(detailStatus({ ...shown, selection, detail: "all" }).text).toMatch(/^Subregions for all countries/);
  });

  // Review 2026-09-30: the map counts a selection's size-hidden children in
  // All mode too, but the status line never said so.
  it("follows the All countries warning with the cue in All mode", () => {
    expect(
      detailStatus({ ...shown, detail: "all", selection: { name: "Napa Valley", drawn: 0, hidden: 15 } }).text,
    ).toBe("Subregions for all countries. Uses more resources and can cause lag. Zoom in to see the subregions of Napa Valley.");
    expect(detailStatus({ ...shown, detail: "all", selection: { name: "Napa Valley", drawn: 15, hidden: 0 } }).text).toBe(
      "Subregions for all countries. Uses more resources and can cause lag.",
    );
  });

  it("selectionCueText is the cue alone, or null", () => {
    expect(selectionCueText(null)).toBeNull();
    expect(selectionCueText(undefined)).toBeNull();
    expect(selectionCueText({ name: "Napa Valley", drawn: 3, hidden: 0 })).toBeNull();
    expect(selectionCueText({ name: "Napa Valley", drawn: 0, hidden: 15 })).toBe("Zoom in to see the subregions of Napa Valley.");
    expect(selectionCueText({ name: "Bourgogne", drawn: 2, hidden: 4 })).toBe("Zoom in to see all the subregions of Bourgogne.");
  });
});
