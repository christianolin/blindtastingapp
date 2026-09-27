import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OthersNoteRow } from "../../../lib/notes/shared-notes-view";
import { OthersNotes } from "./others-notes";

// The first paint of "Notes from others" (sharing-defaults spec 2026-09-27 §7.2).

const row = (i: number): OthersNoteRow => ({
  id: `n${i}`,
  href: `/catalog/w1/notes/n${i}`,
  tastedOn: "2026-09-20",
  dateLabel: "20 Sep 2026",
  badge: i === 0 ? "Blind" : null,
  score: "90 · Outstanding",
  summary: i === 0 ? "cedar, violet" : null,
  author: { id: `u${i}`, name: `Taster ${i}`, avatarUrl: null, href: `/u/u${i}` },
});

describe("OthersNotes", () => {
  it("shows five rows, each two sibling links, and offers the rest", () => {
    const html = renderToStaticMarkup(<OthersNotes rows={[0, 1, 2, 3, 4, 5, 6].map(row)} capped={false} />);
    const items = html.split("<li").slice(1);
    expect(items).toHaveLength(5);
    for (const item of items) {
      const anchors = item.match(/<a /g) ?? [];
      expect(anchors).toHaveLength(2);
      // Siblings: the first link closes before the second opens.
      expect(item.indexOf("</a>")).toBeLessThan(item.lastIndexOf("<a "));
    }
    expect(html).toContain('href="/u/u0"');
    expect(html).toContain('href="/catalog/w1/notes/n0"');
    expect(html).toContain(">Show all 7 notes</button>");
    expect(html).not.toContain("most recent notes");
  });

  it("carries the badge, the score, the summary and a 44px tap target on both links", () => {
    const html = renderToStaticMarkup(<OthersNotes rows={[row(0)]} capped={false} />);
    expect(html).toContain(">Blind</span>");
    expect(html).toContain(">90 · Outstanding</span>");
    expect(html).toContain(">cedar, violet</span>");
    expect((html.match(/<a [^>]*class="[^"]*\bmin-h-11\b/g) ?? []).length).toBe(2);
    expect(html).not.toContain("Show all");
  });

  it("says the list is cut when it was cut at the cap", () => {
    const html = renderToStaticMarkup(<OthersNotes rows={[row(0)]} capped />);
    expect(html).toContain("Showing the 50 most recent notes.");
  });
});
