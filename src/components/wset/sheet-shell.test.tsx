import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetFooter, SheetFooterProgress, SheetHeaderRow, SheetTabs, type SheetTab } from "./sheet-shell";

// The shared sheet frame's own choices. The note sheet's use of it is pinned
// byte for byte by sheet-markup.test.tsx.

const noop = () => {};
const tab = (id: string, label: string, done = 0, total = 2): SheetTab => ({ id, label, done, total });
const NOTE_TABS = [tab("appearance", "Appearance"), tab("nose", "Nose"), tab("palate", "Palate"), tab("conclusions", "Conclusion")];

describe("SheetTabs", () => {
  it("four tabs (the note sheet): a four-column phone grid, 11px names", () => {
    const html = renderToStaticMarkup(<SheetTabs tabs={NOTE_TABS} active="nose" onSelect={noop} />);
    expect(html).toContain('class="mt-2 gap-1 max-sm:grid max-sm:grid-cols-4 sm:flex sm:gap-2"');
    expect(html).toContain("font-size:11px");
    expect(html).not.toContain("text-[10px]");
  });

  it("five tabs (the editor): a five-column phone grid, names a size smaller so Appearance fits 360px", () => {
    const html = renderToStaticMarkup(
      <SheetTabs tabs={[tab("wine", "Wine", 5, 5), ...NOTE_TABS]} active="wine" onSelect={noop} />,
    );
    expect(html).toContain('class="mt-2 gap-1 max-sm:grid max-sm:grid-cols-5 sm:flex sm:gap-2"');
    expect((html.match(/block text-\[10px\] sm:inline sm:text-\[11px\]/g) ?? []).length).toBe(5);
    // A complete tab shows ✓; the active one is pressed.
    expect(html).toContain(">✓<");
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
  });
});

describe("SheetFooter", () => {
  it("puts a notice on its own full-width line, outside the desktop-only progress", () => {
    const html = renderToStaticMarkup(
      <SheetFooter
        embedded
        progress={<SheetFooterProgress done={3} caption="of 19 set" note={null} />}
        notice={<p role="alert">Give it a name.</p>}
      >
        <button type="button">Save profile</button>
      </SheetFooter>,
    );
    expect(html).toMatch(/^<div class="flex items-center gap-\[9px\] sm:gap-3 flex-wrap /);
    expect(html).toContain('<div class="basis-full"><p role="alert">Give it a name.</p></div><div class="min-w-0 max-sm:hidden">');
  });

  it("without a notice, no wrap and no notice line", () => {
    const html = renderToStaticMarkup(
      <SheetFooter embedded progress={<SheetFooterProgress done={3} caption="of 19 set" />}>
        <button type="button">Save profile</button>
      </SheetFooter>,
    );
    expect(html).not.toContain("flex-wrap");
    expect(html).not.toContain("basis-full");
  });
});

describe("SheetHeaderRow", () => {
  // The training room focuses the bar's title as a session opens: a titleRef
  // makes it focusable (tabindex -1); without one it is plain text.
  it("a titleRef makes the title focusable; without one it is not", () => {
    const progress = { done: 0, total: 19 };
    const withRef = renderToStaticMarkup(
      <SheetHeaderRow eyebrow="Tasting note" title="Training · 20:14" titleRef={createRef<HTMLParagraphElement>()} progress={progress} />,
    );
    const without = renderToStaticMarkup(<SheetHeaderRow eyebrow="Tasting note" title="Château Test" progress={progress} />);
    expect(withRef).toContain('<p tabindex="-1" class="font-heading');
    expect(without).not.toContain("tabindex");
    // No onClose: no ✕ and no Close.
    expect(without).not.toContain("aria-label=");
  });
});
