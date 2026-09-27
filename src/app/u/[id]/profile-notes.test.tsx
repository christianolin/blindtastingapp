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
  scoreValue: "Not scored",
  scoreBand: null,
});

const OWN = { line: "Everyone can see these", changeHref: "/profile/edit#sharing" };

describe("ProfileNotes", () => {
  it("on someone else's profile: 'Tasting notes', one link per row, no line, no held tag", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[row(1)]} capped={false} own={null} />);
    expect(html).toContain(">Tasting notes</span>");
    expect(html).not.toContain("Your tasting notes");
    expect(html).not.toContain("can see these");
    expect(html.split("<li").slice(1)[0].match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/catalog/w1/notes/n1"');
    expect(html).toContain(">Wine 1</span>");
    expect(html).not.toContain("Hidden from others");
  });

  it("on your own: the heading, who can see them, a Change link to the Sharing card, and held tags", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[row(1, true), row(2)]} capped={false} own={OWN} />);
    expect(html).toContain(">Your tasting notes</span>");
    expect(html).toContain("Everyone can see these ·");
    expect(html).toContain('href="/profile/edit#sharing"');
    expect(html).toContain(">Change</a>");
    expect(html.match(/Hidden from others/g)).toHaveLength(1);
  });

  it("gives the Change link a 44px tap target on touch, in a line that still wraps as one sentence", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[row(1)]} capped={false} own={OWN} />);
    expect(html).toMatch(/<a class="[^"]*\bmin-h-11\b[^"]*\bmd:pointer-fine:min-h-0\b[^"]*" href="\/profile\/edit#sharing">/);
    expect(html).toMatch(/<p class="[^"]*\bflex flex-wrap\b[^"]*"><span>Everyone can see these ·<\/span><a /);
  });

  it("stacks the band under the number, so a phone keeps the wine title's width", () => {
    const scored: ProfileNoteRow = { ...row(1), score: "88 · Very good", scoreValue: "88", scoreBand: "Very good" };
    const html = renderToStaticMarkup(<ProfileNotes rows={[scored]} capped={false} own={null} />);
    expect(html).toContain('<span class="font-semibold tabular-nums">88</span>');
    expect(html).toContain('<span class="block text-xs text-muted-foreground">Very good</span>');
    expect(html).not.toContain("88 · Very good");
  });

  it("says so when your own list is empty", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[]} capped={false} own={OWN} />);
    expect(html).toContain("No tasting notes yet.");
    expect(html).not.toContain("<ul");
  });

  it("shows five until Show all, and 44px row links", () => {
    const html = renderToStaticMarkup(
      <ProfileNotes rows={[1, 2, 3, 4, 5, 6].map((i) => row(i))} capped={false} own={null} />,
    );
    expect(html.split("<li").length - 1).toBe(5);
    expect(html).toContain(">Show all 6 notes</button>");
    expect((html.match(/<a [^>]*class="[^"]*\bmin-h-11\b/g) ?? []).length).toBe(5);
  });

  it("says the list is cut only when it was", () => {
    expect(renderToStaticMarkup(<ProfileNotes rows={[row(1)]} capped own={null} />)).toContain(
      "Showing the 50 most recent notes.",
    );
    expect(renderToStaticMarkup(<ProfileNotes rows={[row(1)]} capped={false} own={null} />)).not.toContain(
      "most recent notes",
    );
  });
});
