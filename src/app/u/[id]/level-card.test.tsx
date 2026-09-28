import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { levelCardView } from "@/lib/levels/card";
import type { ProfileLevel } from "@/lib/levels/types";
import { LevelCard, LevelCardDetails } from "./level-card";

// Profile achievements card spec 2026-09-28 §6 and §10. The card's title is a
// real h2 (StatCard's headingId), so "Earned" and "Not yet" are h3 and each
// category under them an h4 — no level skipped, and no h2 inside the panel.
const headingsOf = (html: string) =>
  [...html.matchAll(/<(h\d)[^>]*>([\s\S]*?)<\/h\d>/g)].map((m) => `${m[1]} ${m[2].replace(/<[^>]+>/g, "")}`);

const OWN: ProfileLevel = {
  xp: 420,
  level: 4,
  earned: [
    { key: "first_bottle", category: "cellar", unlockedAt: "2026-09-12T20:00:00Z", backfill: false },
    { key: "first_note", category: "notes", unlockedAt: "2026-09-12T20:00:00Z", backfill: true },
  ],
  locked: [{ key: "notes_25", category: "notes", progress: 3, target: 25, bonusXp: 75 }],
};

const OWN_NONE: ProfileLevel = {
  xp: 30,
  level: 1,
  earned: [],
  locked: [{ key: "cellar_25", category: "cellar", progress: 12, target: 25, bonusXp: 50 }],
};

// Someone else with nothing visible. "None earned" and "all hidden" (a
// PRIVATE cellar's achievements filtered out by RLS) arrive as this same
// input, so their markup is the same: nothing can tell them apart.
const OTHER_NONE: ProfileLevel = { xp: 0, level: 1, earned: [], locked: null };

// useId values are not snapshotted: ids are only compared with each other.
const idOf = (html: string, re: RegExp) => html.match(re)?.[1];

describe("LevelCardDetails", () => {
  const html = renderToStaticMarkup(<LevelCardDetails view={levelCardView(OWN)} panelId="panel" />);

  it("titles Earned and Not yet as h3 and each category as h4", () => {
    expect(headingsOf(html)).toEqual(["h3 Earned", "h4 Cellar", "h4 Notes", "h3 Not yet", "h4 Notes"]);
  });

  it("uses no h2 and no h5", () => {
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("<h5");
  });

  it("is the panel the toggle controls", () => {
    expect(html).toMatch(/^<div id="panel"/);
  });

  it("states each row's state and numbers in text", () => {
    expect(html).toContain("+75 XP");
    expect(html).toContain("3 / 25");
    expect(html).toContain("Earned: ");
    expect(html).toContain("Not yet: ");
    expect(html).toContain("Before levels");
  });
});

describe("LevelCard", () => {
  const html = renderToStaticMarkup(<LevelCard level={OWN} />);

  it("is labelled by its h2 title", () => {
    expect(headingsOf(html)[0]).toBe("h2 Level &amp; achievements");
    const h2Id = idOf(html, /<h2 id="([^"]+)"/);
    expect(h2Id).toBeTruthy();
    expect(idOf(html, /^<section aria-labelledby="([^"]+)"/)).toBe(h2Id);
  });

  it("has a collapsed toggle that controls the panel", () => {
    expect(html).toContain('aria-expanded="false"');
    const controls = idOf(html, /aria-controls="([^"]*)"/);
    expect(controls).toBeTruthy();
    expect(controls).not.toBe(idOf(html, /<h2 id="([^"]+)"/));
    expect(html).toContain("All achievements");
  });

  it("keeps both toggle labels in one cell, the idle one invisible, so the header never reflows", () => {
    expect(html).toContain('<span class="[grid-area:1/1]">All achievements</span>');
    expect(html).toContain('<span class="[grid-area:1/1] invisible">Show fewer</span>');
  });

  it("gives the summary grid a shrinkable phone column, so Latest truncates", () => {
    expect(html).toContain('class="grid grid-cols-1 gap-[13px] md:grid-cols-2');
  });

  it("keeps the lists closed while collapsed", () => {
    expect(html).not.toContain(">Earned<");
    expect(html).not.toContain("<h3");
  });

  it("shows your own count against the total, spoken as N of M", () => {
    expect(html).toContain('<span aria-hidden="true">2/3</span><span class="sr-only">2 of 3</span>');
    expect(html).toContain("To level 5");
    expect(html).toContain("120 / 200 XP");
    expect(html).toContain("Latest");
    expect(html).toContain("First bottle · 12 Sep 2026");
    expect(html).toContain("Closest");
    expect(html).toContain("Note taker · 3 / 25");
  });

  it("renders the same with liveUserId (the server snapshot keeps the server props)", () => {
    const live = renderToStaticMarkup(<LevelCard level={OWN} liveUserId="user-1" />);
    const ids = (s: string) => [...s.matchAll(/(?:id|aria-labelledby|aria-controls)="([^"]+)"/g)].map((m) => m[1]);
    const strip = (s: string) => ids(s).reduce((acc, id) => acc.split(id).join("ID"), s);
    expect(strip(live)).toBe(strip(html));
  });
});

describe("LevelCard on someone else's profile with none visible (Rule 1)", () => {
  const html = renderToStaticMarkup(<LevelCard level={OTHER_NONE} />);

  it("has no toggle and says so plainly", () => {
    expect(html).not.toContain("<button");
    expect(html).toContain("No achievements yet.");
  });

  it("states no total, no progress and no Closest", () => {
    expect(html).not.toMatch(/\d\/\d/);
    expect(html).not.toContain("Not yet");
    expect(html).not.toContain("Closest");
    expect(html).not.toContain('sr-only">0 of');
  });
});

describe("LevelCard on your own profile with nothing earned", () => {
  const html = renderToStaticMarkup(<LevelCard level={OWN_NONE} />);

  it("still offers every achievement, and names the closest", () => {
    expect(html).toContain("<button");
    expect(html).toContain("All achievements");
    expect(html).toContain('<p class="text-[12.5px] text-muted-foreground italic">No achievements yet.</p>');
    expect(html).toContain("Closest");
    expect(html).toContain("Well stocked · 12 / 25");
  });
});

describe("token hygiene", () => {
  const markup = [
    renderToStaticMarkup(<LevelCard level={OWN} />),
    renderToStaticMarkup(<LevelCard level={OTHER_NONE} />),
    renderToStaticMarkup(<LevelCardDetails view={levelCardView(OWN)} panelId="panel" />),
  ].join("");

  it("uses tokens only: no hex, no dark: overrides, no translucent hover, no bg-secondary", () => {
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(markup).not.toContain("dark:");
    expect(markup).not.toContain("/80");
    expect(markup).not.toContain("bg-secondary");
  });

  it("draws the level bars gold-deep on the muted track", () => {
    expect(markup).toContain("bg-gold-deep");
    expect(markup).toContain('style="height:6px"');
  });
});
