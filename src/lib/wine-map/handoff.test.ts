// The handoff latch decides whether a region is drawn by the world archive or
// by its own shard. Wrong one way it leaves a hole (the world copy hidden over
// a shard with no tiles yet); wrong the other it draws the region twice.
import { describe, expect, it } from "vitest";
import { bboxInView, latchReady, type ShardProbe } from "./handoff";

const probes = (table: Record<string, Partial<ShardProbe>>) => (key: string): ShardProbe => ({
  added: true,
  loaded: false,
  inView: true,
  ...table[key],
});

describe("latchReady", () => {
  it("a mounted shard that has loaded in view is ready", () => {
    expect(latchReady(new Set(), ["bourgogne"], probes({ bourgogne: { loaded: true } }))).toEqual(["bourgogne"]);
  });

  it("a shard still fetching is not ready", () => {
    expect(latchReady(new Set(), ["bourgogne"], probes({}))).toEqual([]);
  });

  it("a vacuous load — loaded because nothing of it is on screen — is not ready", () => {
    const probe = probes({ alsace: { loaded: true, inView: false } });
    expect(latchReady(new Set(), ["alsace"], probe)).toEqual([]);
  });

  it("stays ready through a reload while mounted (grape, language, focus, selection)", () => {
    const probe = probes({ bourgogne: { loaded: false, inView: true }, champagne: { loaded: false, inView: false } });
    expect(latchReady(new Set(["bourgogne", "champagne"]), ["bourgogne", "champagne"], probe)).toEqual([
      "bourgogne",
      "champagne",
    ]);
  });

  it("drops a shard as soon as it is unmounted, so a remount has to load in view again", () => {
    let ready = latchReady(new Set(["bourgogne", "jura"]), ["jura"], probes({ jura: { loaded: true } }));
    expect(ready).toEqual(["jura"]);
    // Remounted: a new, empty source. Not ready until it has loaded in view.
    ready = latchReady(new Set(ready), ["bourgogne", "jura"], probes({ jura: { loaded: true } }));
    expect(ready).toEqual(["jura"]);
    ready = latchReady(new Set(ready), ["bourgogne", "jura"], probes({ bourgogne: { loaded: true }, jura: { loaded: true } }));
    expect(ready).toEqual(["bourgogne", "jura"]);
  });

  it("a shard whose source is missing is never ready, even one that was", () => {
    const probe = probes({ bourgogne: { added: false, loaded: true } });
    expect(latchReady(new Set(["bourgogne"]), ["bourgogne"], probe)).toEqual([]);
  });

  it("returns a sorted list, whatever order the mount list is in", () => {
    const probe = probes({ rhone: { loaded: true }, alsace: { loaded: true }, jura: { loaded: true } });
    expect(latchReady(new Set(), ["rhone", "alsace", "jura"], probe)).toEqual(["alsace", "jura", "rhone"]);
  });

  it("walks the whole pan: off screen, scrolled in, reloaded, unmounted", () => {
    let ready: string[] = [];
    const step = (mounted: string[], table: Record<string, Partial<ShardProbe>>) => {
      ready = latchReady(new Set(ready), mounted, probes(table));
      return ready;
    };
    expect(step(["loire"], { loire: { loaded: true, inView: false } })).toEqual([]);
    expect(step(["loire"], { loire: { loaded: false, inView: true } })).toEqual([]);
    expect(step(["loire"], { loire: { loaded: true, inView: true } })).toEqual(["loire"]);
    expect(step(["loire"], { loire: { loaded: false, inView: true } })).toEqual(["loire"]);
    expect(step(["loire"], { loire: { loaded: false, inView: false } })).toEqual(["loire"]);
    expect(step([], {})).toEqual([]);
    expect(step(["loire"], { loire: { loaded: false, inView: true } })).toEqual([]);
  });
});

describe("bboxInView", () => {
  const view: [number, number, number, number] = [2, 45, 6, 48];

  it("overlapping, touching and containing boxes are in view", () => {
    expect(bboxInView([4, 46, 5, 47], view)).toBe(true);
    expect(bboxInView([0, 40, 10, 50], view)).toBe(true);
    expect(bboxInView([6, 48, 7, 49], view)).toBe(true);
  });

  it("a box entirely beside the view is not", () => {
    expect(bboxInView([7, 45, 8, 48], view)).toBe(false);
    expect(bboxInView([2, 49, 6, 50], view)).toBe(false);
  });

  it("a shard with no bbox counts as in view", () => {
    expect(bboxInView(undefined, view)).toBe(true);
  });
});
