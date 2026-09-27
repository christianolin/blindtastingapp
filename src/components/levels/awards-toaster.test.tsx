import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AwardsToaster } from "./awards-toaster";

// The server render (and the first client render, before AwardsFeed publishes)
// is the empty view: the polite live region exists before any card text
// arrives, and the card stack never blocks the page beneath it.
describe("AwardsToaster first paint", () => {
  it("renders an empty polite status region and no card", () => {
    const html = renderToStaticMarkup(<AwardsToaster userId="u1" />);
    expect(html).toContain('<div role="status" aria-live="polite" class="sr-only"></div>');
    expect(html).not.toContain("XP");
  });
  it("stacks cards in a fixed, click-through corner above the sheets", () => {
    const html = renderToStaticMarkup(<AwardsToaster userId="u1" />);
    expect(html).toMatch(/class="pointer-events-none fixed z-\[60\] flex flex-col gap-2 [^"]*md:right-4 md:bottom-4 md:w-80"/);
  });
});
