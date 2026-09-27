import { describe, expect, it } from "vitest";
import { CATCH_UP_MS, TOAST_MS, WELCOME_MS, buildToasts, cleanSeenIds, freshEvents, splitXp } from "./toasts";
import type { XpEvent } from "./types";

const CHECKED = "2026-09-27T12:00:00.000Z";
const NOW = Date.parse(CHECKED);
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

let nextId = 1;
function ev(kind: string, xp: number, xpAfter: number, extra: Partial<XpEvent> = {}): XpEvent {
  return { id: nextId++, kind, xp, xpAfter, units: null, achievement: null, createdAt: at(5_000), ...extra };
}
const opts = (o: Partial<{ welcome: boolean; xp: number; checkedAt: string }> = {}) => ({
  userId: "u1",
  welcome: false,
  xp: 0,
  checkedAt: CHECKED,
  ...o,
});

describe("buildToasts: the XP card", () => {
  it("is one card per render for every activity row", () => {
    const events = [ev("tasting_finished", 40, 440)];
    const { toasts, silentIds } = buildToasts(events, opts({ xp: 440 }));
    expect(toasts.map((t) => [t.kind, t.title, t.detail, t.eventIds, t.durationMs])).toEqual([
      ["xp", "+40 XP · Tasting finished", null, [events[0].id], TOAST_MS],
    ]);
    expect(silentIds).toEqual([]);
  });

  it("counts glasses and bottles", () => {
    const events = [
      ev("guess", 25, 100, { units: 15 }),
      ev("guess_match", 20, 120, { units: 1 }),
      ev("guess", 12, 132, { units: 2 }),
    ];
    expect(buildToasts(events, opts()).toasts[0].title).toBe("+57 XP · 3 glasses revealed");
    const bottles = [ev("cellar_add", 60, 60, { units: 12 })];
    expect(buildToasts(bottles, opts()).toasts[0].title).toBe("+60 XP · 12 bottles added");
  });

  it("names no count when an award reached its unit cap (a 24-bottle lot pays 20, 10 opened pay 6)", () => {
    expect(buildToasts([ev("cellar_add", 100, 100, { units: 20 })], opts()).toasts[0].title).toBe(
      "+100 XP · Bottles added",
    );
    expect(buildToasts([ev("drink", 90, 90, { units: 6 })], opts()).toasts[0].title).toBe("+90 XP · Bottles opened");
    const mixed = [ev("cellar_add", 100, 100, { units: 20 }), ev("cellar_add", 15, 115, { units: 3 })];
    expect(buildToasts(mixed, opts()).toasts[0].title).toBe("+115 XP · Bottles added");
  });

  it("merges two kinds, the bigger first, the second lower-cased", () => {
    const events = [ev("drink", 15, 15, { units: 1 }), ev("guess", 30, 45, { units: 20 })];
    expect(buildToasts(events, opts()).toasts[0].title).toBe("+45 XP · Glass revealed & bottle opened");
  });

  it("says '& more' past two kinds", () => {
    const events = [
      ev("note", 20, 20),
      ev("drink", 15, 35, { units: 1 }),
      ev("cellar_add", 5, 40, { units: 1 }),
    ];
    expect(buildToasts(events, opts()).toasts[0].title).toBe("+40 XP · Tasting note & more");
  });

  it("collapses into 'while you were away' once a row is older than 10 minutes", () => {
    const events = [ev("note", 20, 20, { createdAt: at(CATCH_UP_MS + 1) }), ev("drink", 15, 35, { units: 1 })];
    expect(buildToasts(events, opts()).toasts[0].title).toBe("+35 XP while you were away");
    const fresh = [ev("note", 20, 20, { createdAt: at(CATCH_UP_MS - 1) })];
    expect(buildToasts(fresh, opts()).toasts[0].title).toBe("+20 XP · Tasting note");
  });

  it("still sums a kind it has no label for", () => {
    expect(buildToasts([ev("mystery", 12, 12)], opts()).toasts[0].title).toBe("+12 XP");
  });
});

describe("buildToasts: the achievement card", () => {
  it("names one achievement", () => {
    const events = [ev("achievement", 150, 1150, { achievement: "cellar_100" })];
    const [card] = buildToasts(events, opts()).toasts;
    expect([card.kind, card.title, card.detail]).toEqual(["achievement", "Achievement · Serious cellar", "+150 XP"]);
  });

  it("merges two or more", () => {
    const events = [
      ev("achievement", 25, 25, { achievement: "first_bottle" }),
      ev("achievement", 50, 75, { achievement: "cellar_25" }),
    ];
    const [card] = buildToasts(events, opts()).toasts;
    expect([card.title, card.detail]).toEqual(["2 achievements · First bottle, Well stocked", "+75 XP"]);
  });

  it("marks a key it has no copy for silently, never renders it", () => {
    const unknown = ev("achievement", 30, 30, { achievement: "sommelier_of_the_year" });
    const { toasts, silentIds } = buildToasts([unknown], opts());
    expect(toasts.map((t) => t.kind)).toEqual([]);
    expect(silentIds).toEqual([unknown.id]);
  });
});

describe("buildToasts: the level-up card", () => {
  it("shows the highest level reached across several rows", () => {
    // 290 → 300 (level 4) → 520 (level 5)
    const events = [
      ev("guess", 10, 300),
      ev("achievement", 25, 325, { achievement: "first_tasting" }),
      ev("tasting_finished", 40, 365),
      ev("achievement", 155, 520, { achievement: "perfect_glass" }),
    ];
    const cards = buildToasts(events, opts({ xp: 520 })).toasts;
    expect(cards.map((c) => c.kind)).toEqual(["xp", "achievement", "level"]);
    const level = cards[2];
    expect([level.title, level.tone, level.eventIds]).toEqual(["Level up · You're level 5", "gold", []]);
  });

  it("is absent when the level did not change", () => {
    expect(buildToasts([ev("note", 20, 70)], opts()).toasts.map((c) => c.kind)).toEqual(["xp"]);
  });
});

describe("buildToasts: the welcome card", () => {
  it("comes first and replaces the level-up card", () => {
    const events = [ev("note", 20, 520), ev("achievement", 25, 545, { achievement: "first_note" })];
    const cards = buildToasts(events, opts({ welcome: true, xp: 545 })).toasts;
    expect(cards.map((c) => [c.kind, c.title])).toEqual([
      ["welcome", "You're level 5"],
      ["xp", "+20 XP · Tasting note"],
      ["achievement", "Achievement · First impressions"],
    ]);
    expect(cards[0]).toMatchObject({
      welcome: true,
      durationMs: WELCOME_MS,
      detail: "Levels are here — your tastings, cellar and notes so far already count.",
    });
  });

  it("invites a newcomer with no XP", () => {
    const [card] = buildToasts([], opts({ welcome: true, xp: 0 })).toasts;
    expect([card.title, card.detail]).toEqual([
      "You're level 1",
      "Levels are here — taste, cellar and note wines to earn XP.",
    ]);
  });

  it("never makes more than three cards in one batch", () => {
    const events = [
      ev("guess", 30, 480),
      ev("achievement", 100, 580, { achievement: "perfect_glass" }),
    ];
    expect(buildToasts(events, opts({ welcome: true, xp: 580 })).toasts).toHaveLength(3);
    expect(buildToasts(events, opts({ welcome: false, xp: 580 })).toasts).toHaveLength(3);
  });
});

describe("freshEvents", () => {
  it("drops rows already queued or shown in this tab", () => {
    const a = ev("note", 20, 20);
    const b = ev("note", 20, 40);
    expect(freshEvents([a, b], new Set([a.id]))).toEqual([b]);
  });
});

describe("splitXp", () => {
  it("separates the leading +N XP", () => {
    expect(splitXp("+40 XP · Tasting finished")).toEqual({ xp: "+40 XP", rest: " · Tasting finished" });
    expect(splitXp("+1,234 XP while you were away")).toEqual({ xp: "+1,234 XP", rest: " while you were away" });
    expect(splitXp("+150 XP")).toEqual({ xp: "+150 XP", rest: "" });
    expect(splitXp("Level up · You're level 4")).toBeNull();
  });
});

describe("cleanSeenIds", () => {
  it("accepts up to 100 positive integers, deduped", () => {
    expect(cleanSeenIds([3, 1, 3])).toEqual([3, 1]);
    expect(cleanSeenIds([])).toEqual([]);
    expect(cleanSeenIds(Array.from({ length: 100 }, (_, i) => i + 1))).toHaveLength(100);
  });
  it("refuses anything else", () => {
    expect(cleanSeenIds(Array.from({ length: 101 }, (_, i) => i + 1))).toBeNull();
    expect(cleanSeenIds([0])).toBeNull();
    expect(cleanSeenIds([-1])).toBeNull();
    expect(cleanSeenIds([1.5])).toBeNull();
    expect(cleanSeenIds(["1"])).toBeNull();
    expect(cleanSeenIds(null)).toBeNull();
    expect(cleanSeenIds("1,2")).toBeNull();
  });
});
