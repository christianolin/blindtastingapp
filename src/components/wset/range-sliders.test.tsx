import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LABELS, LEVEL_STOPS } from "../../lib/wset/vocab";
import { QualitySlider } from "./quality-slider";
import { SnapSlider } from "./snap-slider";

// The editable range modes' first paint (the admin typical-wine editor). The
// read-only and single-value modes are pinned byte for byte by
// sheet-markup.test.tsx; the gestures themselves are range-edit.ts's, tested
// there, and checked by hand in the browser (plan Task 6).

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("SnapSlider, editable range mode", () => {
  it("with no band yet: a faded track, no caps, every stop a live unpressed button, the per-stop labels", () => {
    const html = renderToStaticMarkup(
      <SnapSlider stops={LEVEL_STOPS} labels={LABELS} value={null} range={null} onRangeChange={noop} />,
    );
    expect(html).toContain("opacity:0.4");
    expect(html).toContain('data-slot="slider-hit"');
    expect(count(html, 'aria-pressed="false"')).toBe(5);
    expect(html).not.toContain("disabled");
    expect(count(html, "width:16px")).toBe(0);
    expect(html).toContain('class="max-sm:hidden"');
  });

  it("with a band: two caps, and the stops inside it pressed", () => {
    const html = renderToStaticMarkup(
      <SnapSlider stops={LEVEL_STOPS} labels={LABELS} value={null} range={["MEDIUM_PLUS", "HIGH"]} onRangeChange={noop} />,
    );
    expect(html).toContain("opacity:1");
    expect(count(html, "width:16px")).toBe(2);
    expect(count(html, 'aria-pressed="true"')).toBe(2);
    expect(count(html, 'aria-pressed="false"')).toBe(3);
  });

  it("a band with a bound off these stops draws nothing, as if unset", () => {
    const html = renderToStaticMarkup(
      <SnapSlider stops={["LOW", "MEDIUM", "HIGH"]} labels={LABELS} value={null} range={["MEDIUM_PLUS", "HIGH"]} onRangeChange={noop} />,
    );
    expect(html).toContain("opacity:0.4");
    expect(count(html, "width:16px")).toBe(0);
    expect(count(html, 'aria-pressed="true"')).toBe(0);
  });

  it("readOnly wins over onRangeChange: no hit layer, disabled stops", () => {
    const html = renderToStaticMarkup(
      <SnapSlider stops={LEVEL_STOPS} labels={LABELS} value={null} range={["LOW", "MEDIUM"]} onRangeChange={noop} readOnly />,
    );
    expect(html).not.toContain('data-slot="slider-hit"');
    expect(html).not.toContain("aria-pressed");
    expect(html).toContain("disabled");
  });
});

describe("QualitySlider, range mode", () => {
  it("with a range: low–high, the top's band word, two gold caps, the ticks inside pressed", () => {
    const html = renderToStaticMarkup(<QualitySlider range={[88, 96]} onRangeChange={noop} />);
    expect(html).toContain("88–96");
    expect(html).toContain("Extraordinary");
    expect(count(html, "width:18px")).toBe(2);
    // 90 and 95 lie inside 88–96.
    expect(count(html, 'aria-pressed="true"')).toBe(2);
  });

  it("a one-score range reads as that score", () => {
    const html = renderToStaticMarkup(<QualitySlider range={[90, 90]} onRangeChange={noop} />);
    expect(html).toContain(">90<");
    expect(html).toContain("Outstanding");
  });

  it("with no range: a dash and the dashed ghost thumb", () => {
    const html = renderToStaticMarkup(<QualitySlider range={null} onRangeChange={noop} />);
    expect(html).toContain(">—<");
    expect(html).toContain("2px dashed var(--placeholder-soft)");
    expect(count(html, 'aria-pressed="true"')).toBe(0);
  });
});
