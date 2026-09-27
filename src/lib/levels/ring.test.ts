import { describe, expect, it } from "vitest";
import { ringGeometry } from "./ring";

describe("ringGeometry", () => {
  it("uses the small stroke, gap and badge below 64 px", () => {
    const g = ringGeometry(40, 0);
    expect([g.stroke, g.gap, g.gapDegrees, g.inner, g.badgeHeight, g.badgeFontSize, g.rotate]).toEqual([
      2.5, 1.5, 50, 32, 14, 9, -65,
    ]);
    expect(ringGeometry(34, 0).inner).toBe(26);
  });

  it("uses the large ones from 64 px", () => {
    const g = ringGeometry(90, 0);
    expect([g.stroke, g.gap, g.gapDegrees, g.inner, g.badgeHeight, g.badgeFontSize, g.rotate]).toEqual([
      3, 2, 36, 80, 20, 12, -72,
    ]);
    expect(ringGeometry(74, 0).inner).toBe(64);
  });

  it("draws 360° − g of the circle as the track", () => {
    const g = ringGeometry(40, 0);
    // r = 18.75, C = 117.81, arc = C · 310/360
    expect([g.radius, g.circumference, g.arc]).toEqual([18.75, 117.81, 101.45]);
  });

  it("fills 0 %, 37 % and 100 % of the arc", () => {
    expect([ringGeometry(40, 0).fill, ringGeometry(40, 0).offset]).toEqual([0, 101.45]);
    expect([ringGeometry(40, 0.37).fill, ringGeometry(40, 0.37).offset]).toEqual([37.54, 63.91]);
    expect([ringGeometry(40, 1).fill, ringGeometry(40, 1).offset]).toEqual([101.45, 0]);
  });

  it("clamps a fraction outside 0..1", () => {
    expect(ringGeometry(40, 1.5).fill).toBe(ringGeometry(40, 1).fill);
    expect(ringGeometry(40, -1).fill).toBe(0);
    expect(ringGeometry(40, Number.NaN).fill).toBe(0);
  });
});
