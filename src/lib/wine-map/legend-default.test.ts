import { describe, expect, it } from "vitest";
import { browserMatchMedia } from "@/lib/use-is-phone";
import { LEGEND_OPEN_QUERY, legendStartsOpen } from "./legend-default";

// A matchMedia stand-in for a window `width` x `height` CSS px (16 px to the
// rem). It evaluates only what the legend query is made of, `(width >= Nrem)`
// and `(height >= Nrem)` joined by `and`, and throws on anything else, so a
// change to the query's shape fails here instead of passing by accident.
function windowOf(width: number, height: number) {
  const queries: string[] = [];
  const matchMedia = (query: string) => {
    queries.push(query);
    const matches = query.split(" and ").every((part) => {
      const feature = /^\((width|height) >= ([\d.]+)rem\)$/.exec(part.trim());
      if (!feature) throw new Error(`unexpected media feature: ${part}`);
      return (feature[1] === "width" ? width : height) >= Number(feature[2]) * 16;
    });
    return { matches };
  };
  return { matchMedia, queries };
}

describe("legendStartsOpen", () => {
  it("asks for exactly the pinned query, once", () => {
    expect(LEGEND_OPEN_QUERY).toBe("(width >= 64rem) and (height >= 56rem)");
    const view = windowOf(1920, 1000);
    legendStartsOpen(view.matchMedia);
    expect(view.queries).toEqual([LEGEND_OPEN_QUERY]);
  });

  it("is closed without matchMedia", () => {
    expect(legendStartsOpen(null)).toBe(false);
    // browserMatchMedia() fits the parameter, and is null outside a browser.
    expect(legendStartsOpen(browserMatchMedia())).toBe(false);
  });

  it("is closed below either bound", () => {
    // Just under the width bound, and just under the height bound.
    expect(legendStartsOpen(windowOf(1023, 1200).matchMedia)).toBe(false);
    expect(legendStartsOpen(windowOf(1920, 895).matchMedia)).toBe(false);
    // A 1366x768 laptop, and the owner's ~1675x865 Chrome window.
    expect(legendStartsOpen(windowOf(1366, 768).matchMedia)).toBe(false);
    expect(legendStartsOpen(windowOf(1675, 865).matchMedia)).toBe(false);
    // A phone.
    expect(legendStartsOpen(windowOf(375, 812).matchMedia)).toBe(false);
  });

  it("is open at both bounds and above", () => {
    expect(legendStartsOpen(windowOf(1024, 896).matchMedia)).toBe(true);
    expect(legendStartsOpen(windowOf(1920, 1000).matchMedia)).toBe(true);
  });
});
