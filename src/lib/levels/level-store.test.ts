import { describe, expect, it } from "vitest";
import { createLevelStore } from "./level-store";
import type { LevelSnapshot, XpEvent } from "./types";

const CHECKED = "2026-09-27T12:00:00.000Z";

let nextId = 100;
function ev(kind: string, xp: number, xpAfter: number, extra: Partial<XpEvent> = {}): XpEvent {
  return {
    id: nextId++,
    kind,
    xp,
    xpAfter,
    units: null,
    achievement: null,
    createdAt: "2026-09-27T11:59:00.000Z",
    ...extra,
  };
}
function snap(userId: string, xp: number, unseen: XpEvent[] = [], welcome = false): LevelSnapshot {
  return { userId, xp, level: Math.max(1, Math.floor(xp / 100)), welcome, checkedAt: CHECKED, unseen };
}
/** A store the toaster has already told the tab is visible. */
function visibleStore() {
  const s = createLevelStore();
  s.setActive(true);
  return s;
}

describe("level store: levels", () => {
  it("is keyed by user", () => {
    const s = createLevelStore();
    s.publish(snap("a", 120));
    s.publish(snap("b", 900));
    expect(s.getLevel("a")).toEqual({ xp: 120, level: 1 });
    expect(s.getLevel("b")).toEqual({ xp: 900, level: 9 });
    expect(s.getLevel("c")).toBeNull();
  });

  it("keeps the highest XP, and the same object while nothing grows", () => {
    const s = createLevelStore();
    s.publish(snap("a", 500));
    const first = s.getLevel("a");
    s.publish(snap("a", 300)); // an older render arriving late
    expect(s.getLevel("a")).toBe(first);
    s.publish(snap("a", 700));
    expect(s.getLevel("a")).toEqual({ xp: 700, level: 7 });
  });
});

describe("level store: cards", () => {
  it("shows nothing until the toaster reports the tab visible", () => {
    // AwardsFeed publishes in the same commit before the toaster's mount effect
    // reports visibility; a background tab must not show (or mark) anything.
    const s = createLevelStore();
    s.publish(snap("a", 20, [ev("note", 20, 20)], true)); // welcome + xp
    expect(s.getView().visible).toEqual([]);
    s.setActive(false); // the toaster's first report: a background tab
    expect(s.getView().visible).toEqual([]);
    expect(s.getView().announcement).toBe("");
    s.setActive(true);
    expect(s.getView().visible.map((t) => t.kind)).toEqual(["welcome", "xp"]);
  });

  it("dedupes ids across renders", () => {
    const s = visibleStore();
    const note = ev("note", 20, 20);
    s.publish(snap("a", 20, [note]));
    s.publish(snap("a", 20, [note]));
    expect(s.getView().visible.map((t) => t.eventIds)).toEqual([[note.id]]);
  });

  it("queues the welcome card once per tab", () => {
    const s = visibleStore();
    s.publish(snap("a", 0, [], true));
    s.publish(snap("a", 0, [], true));
    expect(s.getView().visible.map((t) => t.kind)).toEqual(["welcome"]);
  });

  it("shows at most three and promotes the rest as cards leave", () => {
    const s = visibleStore();
    s.publish(snap("a", 20, [ev("note", 20, 20)], true)); // welcome + xp
    s.publish(snap("a", 45, [ev("achievement", 25, 45, { achievement: "first_note" })])); // achievement
    s.publish(snap("a", 60, [ev("drink", 15, 60, { units: 1 })])); // queued: over the limit
    expect(s.getView().visible.map((t) => t.kind)).toEqual(["welcome", "xp", "achievement"]);
    const welcomeId = s.getView().visible[0].id;
    s.dismiss(welcomeId);
    expect(s.getView().visible[0].leaving).toBe(true);
    s.remove(welcomeId);
    expect(s.getView().visible.map((t) => t.title)).toEqual([
      "+20 XP · Tasting note",
      "Achievement · First impressions",
      "+15 XP · Bottle opened",
    ]);
  });

  it("holds cards while the tab is hidden", () => {
    const s = visibleStore();
    s.setActive(false);
    s.publish(snap("a", 20, [ev("note", 20, 20)]));
    expect(s.getView().visible).toEqual([]);
    s.setActive(true);
    expect(s.getView().visible.map((t) => t.kind)).toEqual(["xp"]);
    expect(s.getView().announcement).toBe("+20 XP · Tasting note");
  });

  it("announces a card's title and detail once it appears", () => {
    const s = visibleStore();
    s.publish(snap("a", 150, [ev("achievement", 150, 150, { achievement: "cellar_100" })]));
    expect(s.getView().announcement).toBe("Achievement · Serious cellar. +150 XP. Level up · You're level 3");
  });

  it("gives every appearance a new announcement key, even with the same text", () => {
    const s = visibleStore();
    s.publish(snap("a", 20, [ev("note", 20, 20)]));
    const first = s.getView();
    const id = first.visible[0].id;
    s.dismiss(id);
    s.remove(id);
    expect(s.getView().announcementKey).toBe(first.announcementKey); // nothing new appeared
    s.publish(snap("a", 40, [ev("note", 20, 40)]));
    const second = s.getView();
    expect(second.announcement).toBe(first.announcement);
    expect(second.announcementKey).not.toBe(first.announcementKey);
  });

  it("never reuses an announcement key across a user switch", () => {
    // One publish both switches the user and shows a card with the same text:
    // a reset key would leave the live region's node untouched.
    const s = visibleStore();
    s.publish(snap("a", 20, [ev("note", 20, 20)]));
    const before = s.getView();
    s.publish(snap("b", 20, [ev("note", 20, 20)]));
    const after = s.getView();
    expect(after.announcement).toBe(before.announcement);
    expect(after.announcementKey).not.toBe(before.announcementKey);
  });

  it("drops a waiting card another tab already showed", () => {
    const s = visibleStore();
    s.setActive(false);
    const note = ev("note", 20, 20);
    s.publish(snap("a", 20, [note], true));
    s.markShownElsewhere("a", [note.id], true);
    s.setActive(true);
    expect(s.getView().visible).toEqual([]);
  });

  it("keeps a waiting card another tab showed only part of", () => {
    const s = visibleStore();
    s.setActive(false);
    const a = ev("note", 20, 20);
    const b = ev("note", 20, 40);
    s.publish(snap("a", 40, [a, b]));
    s.markShownElsewhere("a", [a.id], false);
    s.setActive(true);
    expect(s.getView().visible.map((t) => t.eventIds)).toEqual([[a.id, b.id]]);
  });

  it("forgets the other person's cards when the signed-in user changes", () => {
    const s = visibleStore();
    s.publish(snap("a", 20, [ev("note", 20, 20)]));
    expect(s.getView().visible.map((t) => t.userId)).toEqual(["a"]);
    s.publish(snap("b", 0));
    expect(s.getView().userId).toBe("b");
    expect(s.getView().visible).toEqual([]);
  });

  it("hands over rows no card carries, then forgets them", () => {
    const s = createLevelStore();
    const unknown = ev("achievement", 30, 30, { achievement: "sommelier_of_the_year" });
    s.publish(snap("a", 30, [unknown]));
    expect(s.getView().silent).toEqual([unknown.id]);
    s.clearSilent([unknown.id]);
    expect(s.getView().silent).toEqual([]);
  });

  it("replaces the view object on every change and only then", () => {
    const s = createLevelStore();
    const before = s.getView();
    expect(s.getView()).toBe(before);
    s.publish(snap("a", 20, [ev("note", 20, 20)]));
    expect(s.getView()).not.toBe(before);
    const after = s.getView();
    s.dismiss("no-such-card");
    expect(s.getView()).toBe(after);
  });
});
