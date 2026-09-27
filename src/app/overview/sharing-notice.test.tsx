import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The server action is never called on first paint; the mock keeps the
// server client's imports (next/headers) out of this node test.
vi.mock("@/lib/sharing/actions", () => ({ dismissSharingNotice: vi.fn(async () => true) }));

import { sharingNoticeCopy } from "../../lib/sharing/notice";
import { SharingNotice } from "./sharing-notice";

// The Overview notice's first paint (sharing-defaults spec 2026-09-27 §7.5).

const copy = sharingNoticeCopy({
  cellarFlipped: true,
  notesShared: true,
  cellar: "PUBLIC",
  notes: "PUBLIC",
  dismissedAt: null,
})!;

describe("SharingNotice", () => {
  it("shows the eyebrow, the copy, the settings link and Got it", () => {
    const html = renderToStaticMarkup(<SharingNotice userId="u1" copy={copy} />);
    expect(html).toContain(">Sharing</span>");
    expect(html).toContain(`>${copy.title}</h2>`);
    expect(html).toContain(`>${copy.body}</p>`);
    expect(html).toMatch(/<a [^>]*href="\/profile\/edit#sharing"[^>]*>Change who can see them<\/a>/);
    expect(html).toContain(">Got it</button>");
  });

  it("gives both actions a 44px tap target on touch", () => {
    const html = renderToStaticMarkup(<SharingNotice userId="u1" copy={copy} />);
    expect((html.match(/class="[^"]*\bmin-h-11\b[^"]*"/g) ?? []).length).toBe(2);
  });

  it("is a quiet bordered card, not the bordeaux banner", () => {
    const html = renderToStaticMarkup(<SharingNotice userId="u1" copy={copy} />);
    expect(html).toContain("border-border bg-card");
    expect(html).not.toContain("bg-primary");
  });
});
