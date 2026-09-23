// The probe's arithmetic and its two map hooks, with fakes: frame statistics,
// windowing, which long-task API to trust, per-gesture metrics, the reload
// counter (including a full style rebuild) and the idle wait (including the
// timeout). The overlay itself (perf-probe.tsx) is checked in the browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deltasBetween,
  frameStats,
  gestureMetrics,
  installReloadCounter,
  longTaskEntryType,
  PROBE_SCRIPT,
  sourcesReloaded,
  trimToWindow,
  waitForIdle,
  type FrameSample,
} from "./perf-stats";
import { shardKeyFor } from "./shard";

describe("frameStats", () => {
  it("counts hitches and freezes and takes the nearest-rank p95", () => {
    // 17 smooth frames, one 40 ms stutter, one 60 ms hitch, one 120 ms freeze.
    const deltas = [...Array<number>(17).fill(16.7), 40, 60, 120];
    expect(frameStats(deltas)).toEqual({
      frames: 20,
      worst: 120,
      over50: 2,
      over100: 1,
      // ceil(0.95 * 20) = 19th smallest.
      p95: 60,
    });
  });

  it("is all zeros with no frames", () => {
    expect(frameStats([])).toEqual({ frames: 0, worst: 0, over50: 0, over100: 0, p95: 0 });
  });

  it("does not count a frame of exactly 50 or 100 ms as over", () => {
    expect(frameStats([50, 100])).toMatchObject({ over50: 1, over100: 0, worst: 100 });
  });
});

describe("deltasBetween / trimToWindow", () => {
  const frames: FrameSample[] = [
    { at: 1000, delta: 16 },
    { at: 1016, delta: 16 },
    { at: 1100, delta: 84 },
    { at: 1117, delta: 17 },
  ];

  it("keeps the frames that ended inside (from, to]", () => {
    expect(deltasBetween(frames, 1000, 1100)).toEqual([16, 84]);
  });

  it("drops samples older than the window, in place", () => {
    const samples = frames.map((f) => ({ ...f }));
    trimToWindow(samples, 1117, 50);
    expect(samples.map((s) => s.at)).toEqual([1100, 1117]);
    trimToWindow(samples, 5000, 50);
    expect(samples).toEqual([]);
  });
});

describe("longTaskEntryType", () => {
  it("prefers Long Animation Frames, then long tasks, then nothing (WebKit)", () => {
    expect(longTaskEntryType(["longtask", "long-animation-frame", "paint"])).toBe(
      "long-animation-frame",
    );
    expect(longTaskEntryType(["longtask", "paint"])).toBe("longtask");
    expect(longTaskEntryType(["mark", "measure", "paint"])).toBeNull();
  });
});

describe("gestureMetrics", () => {
  const frames: FrameSample[] = [
    { at: 90, delta: 16 },
    { at: 116, delta: 26 },
    { at: 250, delta: 134 },
    { at: 266, delta: 16 },
    { at: 900, delta: 16 },
  ];

  it("summarises one gesture's frames, long tasks, time to idle and reloads", () => {
    expect(
      gestureMetrics({
        frames,
        tasks: [
          { at: 50, duration: 300 },
          { at: 120, duration: 134 },
          { at: 400, duration: 60 },
        ],
        from: 100,
        to: 500,
        reloads: 3,
      }),
    ).toEqual({
      frames: 3,
      worst: 134,
      over50: 1,
      over100: 1,
      p95: 134,
      longTasks: 2,
      worstTask: 134,
      toIdle: 400,
      reloads: 3,
    });
  });

  it("reports long tasks as n/a (null) where the browser has no API", () => {
    const metrics = gestureMetrics({ frames, tasks: null, from: 100, to: 500, reloads: 0 });
    expect(metrics.longTasks).toBeNull();
    expect(metrics.worstTask).toBeNull();
  });

  it("reports zero, not null, when the API exists and nothing was long", () => {
    const metrics = gestureMetrics({ frames, tasks: [], from: 100, to: 500, reloads: 0 });
    expect(metrics.longTasks).toBe(0);
    expect(metrics.worstTask).toBe(0);
  });
});

describe("PROBE_SCRIPT", () => {
  it("is the spec's fixed gesture list, in order", () => {
    expect(PROBE_SCRIPT.map((step) => step.kind)).toEqual([
      "jump", "ease", "fly", "ease", "select", "select", "ease",
    ]);
    expect(PROBE_SCRIPT[0]).toMatchObject({ zoom: 4.4, center: [2.4, 46.6] });
    expect(PROBE_SCRIPT[1]).toMatchObject({ zoom: 5.5, durationMs: 1000 });
    expect(PROBE_SCRIPT[2]).toMatchObject({ zoom: 9, durationMs: 1500 });
    expect(PROBE_SCRIPT[3]).toMatchObject({ zoom: 13 });
    expect(PROBE_SCRIPT[4]).toMatchObject({
      key: "france.bourgogne.cote-de-nuits.vosne-romanee",
    });
    expect(PROBE_SCRIPT[5]).toMatchObject({
      key: "france.bourgogne.cote-de-nuits.gevrey-chambertin",
    });
    expect(PROBE_SCRIPT[6]).toMatchObject({ zoom: 4.4 });
  });

  it("selects twice, two places in one shard, so the second row measures A2", () => {
    // The first selection of a visit flips wm_has_sel and reloads every
    // mounted source (Phase 1b on); only a later selection shows the
    // steady-state cost, and in the same shard it may reload at most the
    // world source and that one shard.
    const keys = PROBE_SCRIPT.flatMap((step) => (step.kind === "select" ? [step.key] : []));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys.map(shardKeyFor)).toEqual(["bourgogne", "bourgogne"]);
  });
});

/** A map with the parts the counter and the idle wait touch. */
function fakeMap() {
  class FakeStyle {
    reloaded: string[] = [];
    _reloadSource(id: string) {
      this.reloaded.push(id);
    }
  }
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const map = {
    style: new FakeStyle() as FakeStyle | undefined,
    repaints: 0,
    on(type: string, fn: (...args: unknown[]) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    off(type: string, fn: (...args: unknown[]) => void) {
      listeners.get(type)?.delete(fn);
    },
    fire(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
    triggerRepaint() {
      map.repaints += 1;
    },
    FakeStyle,
  };
  return map;
}

describe("installReloadCounter", () => {
  it("counts every reload per source and still reloads", () => {
    const map = fakeMap();
    const style = map.style!;
    const counter = installReloadCounter(map);
    expect(counter.hooked()).toBe(true);
    style._reloadSource("wine-world");
    style._reloadSource("wine-shard-bourgogne");
    style._reloadSource("wine-world");
    expect(counter.count()).toBe(3);
    expect(counter.bySource()).toEqual({ "wine-world": 2, "wine-shard-bourgogne": 1 });
    // The real method still ran, with `this` intact.
    expect(style.reloaded).toEqual(["wine-world", "wine-shard-bourgogne", "wine-world"]);
  });

  it("follows a full rebuild to the new style object", () => {
    const map = fakeMap();
    const counter = installReloadCounter(map);
    map.style = new map.FakeStyle();
    // Between the swap and style.load the new style is not wrapped yet.
    expect(counter.hooked()).toBe(false);
    map.fire("style.load");
    expect(counter.hooked()).toBe(true);
    map.style._reloadSource("wine-shard-alsace");
    expect(counter.count()).toBe(1);
  });

  it("restore puts every style back and stops listening", () => {
    const map = fakeMap();
    const first = map.style!;
    const counter = installReloadCounter(map);
    map.style = new map.FakeStyle();
    map.fire("style.load");
    const second = map.style;
    counter.restore();
    expect(counter.hooked()).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(first, "_reloadSource")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(second, "_reloadSource")).toBe(false);
    first._reloadSource("wine-world");
    expect(counter.count()).toBe(0);
    expect(map.listenerCount("style.load")).toBe(0);
  });

  it("does nothing on a map without a style yet, and hooks the style once it loads", () => {
    const map = fakeMap();
    map.style = undefined;
    const counter = installReloadCounter(map);
    expect(counter.count()).toBe(0);
    expect(counter.hooked()).toBe(false);
    map.style = new map.FakeStyle();
    map.fire("style.load");
    expect(counter.hooked()).toBe(true);
    expect(() => counter.restore()).not.toThrow();
  });

  it("is not hooked on a MapLibre whose Style has no _reloadSource", () => {
    // A later MapLibre that renamed the internal: the counter must say so
    // (the probe prints "n/a") rather than report 0 reloads, which would
    // pass A2 without measuring anything.
    const map = fakeMap();
    const renamed = { reloaded: [] as string[] };
    const counter = installReloadCounter({
      style: renamed,
      on: (type, fn) => map.on(type, fn),
      off: (type, fn) => map.off(type, fn),
    });
    expect(counter.hooked()).toBe(false);
    expect(counter.count()).toBe(0);
    expect("_reloadSource" in renamed).toBe(false);
    counter.restore();
    expect(map.listenerCount("style.load")).toBe(0);
  });
});

describe("sourcesReloaded", () => {
  it("lists the sources whose count went up, sorted", () => {
    expect(
      sourcesReloaded(
        { "wine-world": 2, "wine-shard-bourgogne": 1 },
        { "wine-world": 2, "wine-shard-bourgogne": 2, "wine-shard-alsace": 1 },
      ),
    ).toEqual(["wine-shard-alsace", "wine-shard-bourgogne"]);
  });
});

describe("waitForIdle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves at the next idle, asks for a repaint, and unsubscribes", async () => {
    vi.useFakeTimers();
    const map = fakeMap();
    const idle = waitForIdle(map, 20_000);
    expect(map.repaints).toBe(1);
    map.fire("idle");
    await expect(idle).resolves.toEqual({ timedOut: false });
    expect(map.listenerCount("idle")).toBe(0);
    // The timeout was cleared: nothing left to fire.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up after the timeout and unsubscribes", async () => {
    vi.useFakeTimers();
    const map = fakeMap();
    const idle = waitForIdle(map, 20_000);
    vi.advanceTimersByTime(20_000);
    await expect(idle).resolves.toEqual({ timedOut: true });
    expect(map.listenerCount("idle")).toBe(0);
  });
});
