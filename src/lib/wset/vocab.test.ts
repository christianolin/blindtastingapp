import { describe, expect, it } from "vitest";
import { aromaVisibleFor, colourFromHue } from "./vocab";

// A-07 (v3-groups.json group 5): a hidden-glass note's colour is unknown
// until the reveal. Before the fix, WsetSheet coerced `wine.colour` to "RED"
// before it ever reached AromaPicker, so a hidden glass silently hid every
// white-fruit aroma group (green/citrus/stone/tropical) and the picker read
// as red-only. `aromaVisibleFor` is the pure filter AromaPicker calls per
// term — colour null/undefined (unknown family) must behave like ROSE/ORANGE
// and show everything, the same as a known non-RED/WHITE colour already does.
describe("colourFromHue: a hidden glass's picked hue sets the aroma colour", () => {
  it("names the one colour row that holds the hue", () => {
    expect(colourFromHue("GOLD")).toBe("WHITE");
    expect(colourFromHue("LEMON_GREEN")).toBe("WHITE");
    expect(colourFromHue("SALMON")).toBe("ROSE");
    expect(colourFromHue("RUBY")).toBe("RED");
  });
  it("names none for brown, which sits in the white and the red row, or no pick", () => {
    expect(colourFromHue("BROWN")).toBeNull();
    expect(colourFromHue(null)).toBeNull();
  });
  it("then filters the aromas like a known colour", () => {
    expect(aromaVisibleFor(colourFromHue("GOLD"), "Red fruit", "strawberry")).toBe(false);
    expect(aromaVisibleFor(colourFromHue("RUBY"), "Citrus fruit", "lemon")).toBe(false);
    expect(aromaVisibleFor(colourFromHue("RUBY"), "Red fruit", "strawberry")).toBe(true);
  });
});

describe("aromaVisibleFor: hidden-glass (unknown colour) shows every group", () => {
  it("shows white-only clusters (green/citrus/stone/tropical fruit) when colour is unknown", () => {
    expect(aromaVisibleFor(null, "Green fruit", "green apple")).toBe(true);
    expect(aromaVisibleFor(null, "Citrus fruit", "lemon")).toBe(true);
    expect(aromaVisibleFor(null, "Stone fruit", "peach")).toBe(true);
    expect(aromaVisibleFor(null, "Tropical fruit", "pineapple")).toBe(true);
    expect(aromaVisibleFor(undefined, "Green fruit", "green apple")).toBe(true);
  });

  it("still shows red-only clusters (red/black fruit) when colour is unknown", () => {
    expect(aromaVisibleFor(null, "Red fruit", "cherry")).toBe(true);
    expect(aromaVisibleFor(null, "Black fruit", "blackberry")).toBe(true);
  });

  it("still filters by family once the colour is known (unchanged for identified wines)", () => {
    expect(aromaVisibleFor("RED", "Green fruit", "green apple")).toBe(false);
    expect(aromaVisibleFor("WHITE", "Red fruit", "cherry")).toBe(false);
    expect(aromaVisibleFor("RED", "Red fruit", "cherry")).toBe(true);
    expect(aromaVisibleFor("WHITE", "Citrus fruit", "lemon")).toBe(true);
  });

  it("ROSE and ORANGE keep showing everything, same as unknown", () => {
    expect(aromaVisibleFor("ROSE", "Green fruit", "green apple")).toBe(true);
    expect(aromaVisibleFor("ORANGE", "Red fruit", "cherry")).toBe(true);
  });

  it("floral terms keep their own per-term affinity when colour is unknown", () => {
    expect(aromaVisibleFor(null, "Floral", "violet")).toBe(true);
    expect(aromaVisibleFor(null, "Floral", "acacia")).toBe(true);
    // Known colours still narrow floral per-term (violet is red-only).
    expect(aromaVisibleFor("WHITE", "Floral", "violet")).toBe(false);
  });
});
