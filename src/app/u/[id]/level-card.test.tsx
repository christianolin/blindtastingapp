import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { levelCardView } from "@/lib/levels/card";
import { LevelCardDetails } from "./level-card";

// The expanded card's outline (axe heading-order): on /u/[id] the only
// heading above it is ProfileHeader's h1 (StatCard's title is an Eyebrow
// span, and ProfileTastings' h2 comes after), so "Earned" and "Not yet" are
// h2 and each category under Earned an h3 — never an h3 or h4 with no h2
// before it.
describe("LevelCardDetails", () => {
  const view = levelCardView({
    xp: 420,
    level: 4,
    earned: [
      { key: "first_bottle", category: "cellar", unlockedAt: "2026-09-12T20:00:00Z", backfill: false },
      { key: "first_note", category: "notes", unlockedAt: "2026-09-12T20:00:00Z", backfill: true },
    ],
    locked: [{ key: "notes_25", category: "notes", progress: 3, target: 25, bonusXp: 75 }],
  });
  const html = renderToStaticMarkup(<LevelCardDetails view={view} panelId="panel" />);
  const headings = [...html.matchAll(/<(h\d)[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]*)<\/h\d>/g)].map((m) => `${m[1]} ${m[2]}`);

  it("titles Earned and Not yet as h2 and each earned category as h3", () => {
    expect(headings).toEqual(["h2 Earned", "h3 Cellar", "h3 Notes", "h2 Not yet"]);
  });

  it("uses no h4", () => {
    expect(html).not.toContain("<h4");
  });

  it("is the panel the toggle controls", () => {
    expect(html).toMatch(/^<div id="panel"/);
  });
});
