import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelRing } from "./level-ring";

// react-dom/server in node, like src/components/wset/sheet-markup.test.tsx:
// what is pinned is the first paint.
const ring = (xp: number, level: number, extra: { labelled?: boolean; size?: number } = {}) =>
  renderToStaticMarkup(
    <LevelRing level={level} xp={xp} size={extra.size ?? 40} tone="sidebar" labelled={extra.labelled}>
      <span>A</span>
    </LevelRing>,
  );

describe("LevelRing", () => {
  it("is an image with the level label when labelled", () => {
    const html = ring(420, 4, { labelled: true, size: 90 });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Level 4, 120 of 200 XP to level 5"');
    expect(html).not.toContain("aria-hidden");
  });

  it("hides itself inside a link (the link carries the label)", () => {
    const html = ring(420, 4);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("aria-label");
  });

  it("shows the level in the badge", () => {
    expect(ring(420, 4)).toMatch(/>4<\/span><\/span>$/);
    expect(ring(88_500, 60)).toMatch(/>60<\/span><\/span>$/);
  });

  it("fills 0 %, 37 % and 100 % of a 40 px arc", () => {
    // 40 px: r 18.75, C 117.81, arc 101.45 (310° of 360°).
    const offsets = (html: string) => [...html.matchAll(/stroke-dashoffset="([\d.]+)"/g)].map((m) => m[1]);
    expect(ring(0, 1)).toContain('stroke-dasharray="101.45 117.81"');
    expect(offsets(ring(0, 1))).toEqual(["101.45"]);
    // level 4 spans 300..500: 37 % is 374 XP.
    expect(offsets(ring(374, 4))).toEqual(["63.91"]);
    expect(offsets(ring(88_500, 60))).toEqual(["0"]);
  });

  it("uses tokens only", () => {
    const html = ring(420, 4);
    expect(html).toContain("stroke-primary-foreground/20");
    expect(html).toContain("stroke-gold");
    expect(html).toContain("bg-gold");
    expect(html).toContain("text-on-accent");
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
