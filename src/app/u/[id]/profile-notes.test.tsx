import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProfileNoteRow } from "../../../lib/notes/shared-notes-view";
import { ProfileNotes } from "./profile-notes";

// The first paint of a profile's "Tasting notes" (sharing-defaults spec 2026-09-27 §7.3).

const row = (i: number, held = false): ProfileNoteRow => ({
  id: `n${i}`,
  href: `/catalog/w${i}/notes/n${i}`,
  tastedOn: "2026-09-20",
  dateLabel: "20 Sep 2026",
  badge: null,
  score: "Not scored",
  summary: null,
  wineTitle: `Wine ${i}`,
  imageUrl: null,
  held,
});

const OWN = { line: "Everyone can see these", changeHref: "/profile/edit#sharing" };

describe("ProfileNotes", () => {
  it("on someone else's profile: 'Tasting notes', one link per row, no line, no held tag", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[row(1)]} fetched={1} own={null} />);
    expect(html).toContain(">Tasting notes</span>");
    expect(html).not.toContain("Your tasting notes");
    expect(html).not.toContain("can see these");
    expect(html.split("<li").slice(1)[0].match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/catalog/w1/notes/n1"');
    expect(html).toContain(">Wine 1</span>");
    expect(html).not.toContain("Hidden from others");
  });

  it("on your own: the heading, who can see them, a Change link to the Sharing card, and held tags", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[row(1, true), row(2)]} fetched={2} own={OWN} />);
    expect(html).toContain(">Your tasting notes</span>");
    expect(html).toContain("Everyone can see these ·");
    expect(html).toContain('href="/profile/edit#sharing"');
    expect(html).toContain(">Change</a>");
    expect(html.match(/Hidden from others/g)).toHaveLength(1);
  });

  it("says so when your own list is empty", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[]} fetched={0} own={OWN} />);
    expect(html).toContain("No tasting notes yet.");
    expect(html).not.toContain("<ul");
  });

  it("shows five until Show all, and 44px row links", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[1, 2, 3, 4, 5, 6].map((i) => row(i))} fetched={6} own={null} />);
    expect(html.split("<li").length - 1).toBe(5);
    expect(html).toContain(">Show all 6 notes</button>");
    expect((html.match(/<a [^>]*class="[^"]*\bmin-h-11\b/g) ?? []).length).toBe(5);
  });
});
