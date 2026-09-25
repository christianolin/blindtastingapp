import { describe, expect, it } from "vitest";
import {
  BANNER_LABEL,
  MORE_HREF,
  bannerCopy,
  moreAriaLabel,
  moreLabel,
} from "./copy";

describe("active tasting banner copy (§8)", () => {
  it("every state has its exact status, dot, tone and CTA", () => {
    expect(bannerCopy("live")).toEqual({
      status: "Live now",
      dot: "ping",
      tone: "running",
      cta: "Back to the tasting",
    });
    expect(bannerCopy("in-progress")).toEqual({
      status: "In progress",
      dot: "still",
      tone: "running",
      cta: "Back to the tasting",
    });
    expect(bannerCopy("waiting")).toEqual({
      status: "Waiting to start",
      dot: "none",
      tone: "waiting",
      cta: "Back to the lobby",
    });
  });

  it("the section label and the +N more button", () => {
    expect(BANNER_LABEL).toBe("Your tasting");
    expect(MORE_HREF).toBe("/taste");
    expect(moreLabel(1)).toBe("+1 more");
    expect(moreLabel(4)).toBe("+4 more");
    expect(moreAriaLabel(1)).toBe("+1 more tasting in Taste");
    expect(moreAriaLabel(3)).toBe("+3 more tastings in Taste");
  });

  it("the accessible name contains the visible text (WCAG 2.5.3)", () => {
    for (const n of [1, 2, 7]) expect(moreAriaLabel(n).startsWith(moreLabel(n))).toBe(true);
  });
});
