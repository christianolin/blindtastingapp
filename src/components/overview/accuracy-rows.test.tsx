import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccuracyRows, toneForPct } from "./accuracy-rows";

// Pins: the hit-rate rows on Your numbers and /u/[id]'s Accuracy card must not
// move when a tone is added for another card (profile achievements card spec
// 2026-09-28 §9 steps 2 and 4).
describe("AccuracyRows default markup", () => {
  it("renders a hit-rate row with the default tone, widths and value", () => {
    expect(renderToStaticMarkup(<AccuracyRows rows={[{ label: "Country", pct: 64 }]} />)).toBe(
      '<div class="flex flex-col gap-[9px] max-md:gap-2">' +
        '<span class="flex items-center gap-[9px] text-[11.5px]" title="Country: 64%">' +
        '<span class="shrink-0 truncate text-muted-foreground" style="width:72px">Country</span>' +
        '<span class="block flex-1 overflow-hidden rounded-full bg-muted" style="height:7px">' +
        '<span class="block h-full rounded-full bg-primary" style="width:64%"></span></span>' +
        '<span class="shrink-0 text-muted-foreground tabular-nums text-right" style="width:30px">64%</span>' +
        "</span></div>",
    );
  });
});

describe("toneForPct", () => {
  it("is bordeaux from 50, gold from 30, rose below", () => {
    expect(toneForPct(50)).toBe("primary");
    expect(toneForPct(30)).toBe("gold");
    expect(toneForPct(29)).toBe("rose");
  });
});

describe("the level tone", () => {
  it("fills gold-deep on the muted track", () => {
    const html = renderToStaticMarkup(
      <AccuracyRows rows={[{ label: "To level 5", pct: 60, value: "120 / 200 XP", tone: "level" }]} valueWidth="auto" />,
    );
    expect(html).toContain('<span class="block h-full rounded-full bg-gold-deep" style="width:60%"></span>');
    expect(html).toContain("bg-muted");
  });
});
