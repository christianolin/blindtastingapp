// The status line under the Map detail switch (spec 2026-09-23 §7.1). Every
// string is pinned exactly: the owner approved this copy word for word.
// Controller ruling R3 adds `pastDepthZoom`: past NEIGHBOUR_MIN_ZOOM, a focus
// country with no subregion places gets an honest "nothing mapped here" line
// instead of a "zoom in" hint that would no longer be true.
import { describe, expect, it } from "vitest";
import { DETAIL_WARNING, detailStatus } from "./detail-status";
import { NEIGHBOUR_MIN_ZOOM } from "./mount-policy";

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
