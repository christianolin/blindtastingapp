import { describe, expect, it } from "vitest";
import { ringGeometry } from "./ring";

describe("ringGeometry", () => {
  it("uses the small stroke, gap and badge below 64 px", () => {
    const g = ringGeometry(40, 0);
    expect([g.stroke, g.gap, g.gapDegrees, g.inner, g.badgeHeight, g.badgeFontSize, g.rotate]).toEqual([
      2.5, 1.5, 86, 32, 14, 9, -47,
    ]);
    expect(ringGeometry(34, 0).inner).toBe(26);
    expect(ringGeometry(34, 0).gapDegrees).toBe(109);
  });

  it("uses the large ones from 64 px", () => {
    const g = ringGeometry(90, 0);
    expect([g.stroke, g.gap, g.gapDegrees, g.inner, g.badgeHeight, g.badgeFontSize, g.rotate]).toEqual([
      3, 2, 42, 80, 20, 12, -69,
    ]);
    expect(ringGeometry(74, 0).inner).toBe(64);
    expect(ringGeometry(74, 0).gapDegrees).toBe(52);
  });

  // Spec §8.2: no progress hides under the badge. The badge is centred on the
  // top edge; a two-digit level with its ring-2 halo is ≈ 23 px wide below
  // 64 px and ≈ 28 px from 64 px, so each end of the arc (its round-ish cap
  // included) must sit at least that half-width from the centre line.
  it.each([34, 40, 74, 90])("keeps both ends of a %i px arc clear of a two-digit badge and its halo", (size) => {
    const g = ringGeometry(size, 0);
    const badgeHalf = (size >= 64 ? 12 : 9.5) + 2;
    const endX = g.radius * Math.sin(((g.gapDegrees / 2) * Math.PI) / 180);
    expect(endX).toBeGreaterThanOrEqual(badgeHalf + g.stroke / 2 - 0.01);
  });

  it("draws 360° − g of the circle as the track", () => {
    const g = ringGeometry(40, 0);
    // r = 18.75, C = 117.81, arc = C · 274/360
    expect([g.radius, g.circumference, g.arc]).toEqual([18.75, 117.81, 89.67]);
  });

  it("fills 0 %, 37 % and 100 % of the arc", () => {
    expect([ringGeometry(40, 0).fill, ringGeometry(40, 0).offset]).toEqual([0, 89.67]);
    expect([ringGeometry(40, 0.37).fill, ringGeometry(40, 0.37).offset]).toEqual([33.18, 56.49]);
    expect([ringGeometry(40, 1).fill, ringGeometry(40, 1).offset]).toEqual([89.67, 0]);
  });

  it("clamps a fraction outside 0..1", () => {
    expect(ringGeometry(40, 1.5).fill).toBe(ringGeometry(40, 1).fill);
    expect(ringGeometry(40, -1).fill).toBe(0);
    expect(ringGeometry(40, Number.NaN).fill).toBe(0);
  });
});
