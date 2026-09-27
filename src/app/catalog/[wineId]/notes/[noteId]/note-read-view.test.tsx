import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteReadView, type NoteReadViewProps } from "./note-read-view";

// Someone else's note, read-only (sharing-defaults spec 2026-09-27 S17, §7.4).

const PROPS: NoteReadViewProps = {
  wineId: "w1",
  wineTitle: "Château Margaux Grand Vin 2015",
  author: { id: "u2", name: "Gustav", avatarUrl: null },
  tastedLine: "Tasted 20 Sep 2026",
  badge: "Blind",
  score: "91 · Outstanding",
  sections: [
    { caption: "Appearance", prose: "Clear, deep ruby." },
    { caption: "Taster", prose: "Firm and long." },
  ],
};

describe("NoteReadView", () => {
  it("shows the wine, the author, the date, the badge, the score and the prose in order", () => {
    const html = renderToStaticMarkup(<NoteReadView {...PROPS} />);
    expect(html).toContain(">Tasting note</span>");
    expect(html).toContain('<a class="hover:underline" href="/catalog/w1">Château Margaux Grand Vin 2015</a>');
    expect(html).toContain('href="/u/u2"');
    expect(html).toContain("Gustav</a>");
    expect(html).toContain("<span>· Tasted 20 Sep 2026</span>");
    expect(html).toContain(">Blind</span>");
    expect(html).toContain(">91 · Outstanding</p>");
    expect(html.indexOf("Clear, deep ruby.")).toBeLessThan(html.indexOf("Firm and long."));
  });

  it("never offers an edit, delete or share control", () => {
    const html = renderToStaticMarkup(<NoteReadView {...PROPS} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
    expect(html.match(/<a /g)).toHaveLength(2);
  });

  it("says so when nothing was recorded", () => {
    const html = renderToStaticMarkup(<NoteReadView {...PROPS} sections={[]} score="Not scored" />);
    expect(html).toContain("Nothing recorded yet.");
    expect(html).toContain(">Not scored</p>");
  });
});
