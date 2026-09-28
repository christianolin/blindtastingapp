import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatCard, StatFooter, StatFooterRow } from "./stat-card";

// Pins: the Your numbers page and /u/[id]'s ProfileStatCards render these
// primitives with no optional props, so any prop added for another card must
// leave this default markup byte-identical (profile achievements card spec
// 2026-09-28 §9 steps 1 and 3).
describe("StatCard default markup", () => {
  it("renders the eyebrow title and the body", () => {
    expect(renderToStaticMarkup(<StatCard title="Title"><p>Body</p></StatCard>)).toBe(
      '<section class="flex flex-col gap-3 rounded-xl border border-border-strong bg-card p-[16px_18px] max-md:p-[14px_16px]">' +
        '<span class="font-mono uppercase text-muted-foreground text-[10px] tracking-[.12em]">Title</span>' +
        "<p>Body</p></section>",
    );
  });

  it("swaps the body for the muted note when empty", () => {
    expect(
      renderToStaticMarkup(
        <StatCard title="Title" empty="Nothing yet.">
          <p>Body</p>
        </StatCard>,
      ),
    ).toBe(
      '<section class="flex flex-col gap-3 rounded-xl border border-border-strong bg-card p-[16px_18px] max-md:p-[14px_16px]">' +
        '<span class="font-mono uppercase text-muted-foreground text-[10px] tracking-[.12em]">Title</span>' +
        '<p class="text-[12.5px] text-muted-foreground italic">Nothing yet.</p></section>',
    );
  });
});

describe("StatFooter / StatFooterRow default markup", () => {
  it("renders the rule-topped footer", () => {
    expect(renderToStaticMarkup(<StatFooter><span>x</span></StatFooter>)).toBe(
      '<div class="flex flex-col gap-[5px] border-t border-border-light pt-[11px]"><span>x</span></div>',
    );
  });

  it("renders a muted label and a bold value", () => {
    expect(renderToStaticMarkup(<StatFooterRow label="Best" value="12" />)).toBe(
      '<span class="flex items-baseline justify-between gap-3 text-[12px]">' +
        '<span class="shrink-0 text-muted-foreground">Best</span>' +
        '<span class="min-w-0 truncate text-right font-semibold tabular-nums">12</span></span>',
    );
  });
});

describe("StatCard / StatFooterRow optional props", () => {
  it("makes the title an h2 that labels the section with headingId", () => {
    const html = renderToStaticMarkup(<StatCard title="Title" headingId="t"><p>Body</p></StatCard>);
    expect(html).toContain('<section aria-labelledby="t"');
    expect(html).toContain(
      '<h2 id="t" class="leading-none"><span class="font-mono uppercase text-muted-foreground text-[10px] tracking-[.12em]">Title</span></h2>',
    );
    expect(html).not.toContain("gap-2.5");
  });

  it("puts the action on the title's row, right-aligned", () => {
    const html = renderToStaticMarkup(
      <StatCard title="Title" headingId="t" action={<button type="button">Go</button>}>
        <p>Body</p>
      </StatCard>,
    );
    expect(html).toContain(
      '<div class="flex items-center gap-2.5"><h2 id="t" class="leading-none">' +
        '<span class="font-mono uppercase text-muted-foreground text-[10px] tracking-[.12em]">Title</span></h2>' +
        '<div class="ml-auto"><button type="button">Go</button></div></div><p>Body</p>',
    );
  });

  it("merges labelClassName into the label", () => {
    expect(
      renderToStaticMarkup(<StatFooterRow label="Best" value="12" labelClassName="font-semibold text-foreground" />),
    ).toContain('<span class="shrink-0 font-semibold text-foreground">Best</span>');
  });
});
