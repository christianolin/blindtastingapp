import { describe, expect, it } from "vitest";
import { detailsTopDue } from "./details-scroll";

describe("detailsTopDue", () => {
  it("resets a shown card for a place it has not been reset for", () => {
    expect(detailsTopDue(true, "france.bourgogne", "france")).toBe(true);
    expect(detailsTopDue(true, "france", null)).toBe(true);
  });

  it("waits while the card is collapsed: a display:none body cannot scroll", () => {
    expect(detailsTopDue(false, "france.bourgogne", "france")).toBe(false);
  });

  it("resets on reopening for a place picked while collapsed", () => {
    // Selected Burgundy while collapsed (not shown), then shown again.
    const resetFor = "france";
    expect(detailsTopDue(false, "france.bourgogne", resetFor)).toBe(false);
    expect(detailsTopDue(true, "france.bourgogne", resetFor)).toBe(true);
  });

  it("keeps the scroll for a plain collapse and reopen of the same place", () => {
    expect(detailsTopDue(true, "france", "france")).toBe(false);
  });

  it("has nothing to reset before any place is selected", () => {
    expect(detailsTopDue(true, null, null)).toBe(false);
  });
});
