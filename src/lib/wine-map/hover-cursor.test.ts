import { describe, expect, it } from "vitest";
import { hoverIsClickable, installHoverCursor, type HoverMap, type HoverPoint } from "./hover-cursor";

type Feature = { properties?: Record<string, unknown> | null };

type Listener = (e: { point: HoverPoint }) => void;

function fakeMap(features: Feature[] = [], opts: { zoom?: number; layers?: string[] } = {}) {
  // Keyed by event type: the cursor listens to mousemove and moveend.
  const byType = new Map<string, Set<Listener>>();
  const of = (type: string) => {
    let set = byType.get(type);
    if (!set) byType.set(type, (set = new Set()));
    return set;
  };
  const listeners = {
    get size() {
      let n = 0;
      for (const set of byType.values()) n += set.size;
      return n;
    },
  };
  const present = new Set(opts.layers ?? ["world-region-fills", "shard-fills-bourgogne"]);
  const state = {
    moving: false,
    zoom: opts.zoom ?? 9,
    features,
    throwOnQuery: false,
    queries: [] as { point: [number, number]; layers: string[] }[],
    canvas: { style: { cursor: "" } },
  };
  const map: HoverMap = {
    on: (type: string, fn: Listener) => of(type).add(fn),
    off: (type: string, fn: Listener) => of(type).delete(fn),
    isMoving: () => state.moving,
    getZoom: () => state.zoom,
    getLayer: (id) => (present.has(id) ? { id } : undefined),
    queryRenderedFeatures: (point, options) => {
      if (state.throwOnQuery) throw new Error("Style is not done loading.");
      state.queries.push({ point, layers: options.layers });
      return state.features;
    },
    getCanvas: () => state.canvas,
  };
  const move = (x: number, y: number) => {
    for (const fn of [...of("mousemove")]) fn({ point: { x, y } });
  };
  // The camera settling after a drag, a wheel zoom or an ease.
  const moveEnd = () => {
    for (const fn of [...of("moveend")]) (fn as () => void)();
  };
  return { map, state, move, moveEnd, listeners };
}

function frames() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    raf: (cb: () => void) => {
      const handle = next++;
      pending.set(handle, cb);
      return handle;
    },
    cancelRaf: (handle: number) => {
      pending.delete(handle);
    },
    flush() {
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb();
    },
    get pending() {
      return pending.size;
    },
  };
}

const LAYERS = ["world-region-fills", "world-labels", "shard-fills-bourgogne", "shard-fills-alsace"];

describe("hoverIsClickable", () => {
  it("mirrors the click resolver's tier-0 guard", () => {
    expect(hoverIsClickable([{ properties: { tier: 2 } }], 9)).toBe(true);
    expect(hoverIsClickable([{ properties: { tier: 0 } }], 6)).toBe(false);
    expect(hoverIsClickable([{ properties: { tier: 0 } }], 5)).toBe(true);
    expect(hoverIsClickable([{ properties: null }], 7)).toBe(false);
    expect(hoverIsClickable([], 4)).toBe(false);
  });
});

describe("installHoverCursor", () => {
  it("queries once per frame, at the latest point, over the layers that exist", () => {
    const { map, state, move } = fakeMap([{ properties: { tier: 3 } }]);
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    for (let i = 0; i < 5; i += 1) move(10 + i, 20);
    expect(f.pending).toBe(1);
    f.flush();
    expect(state.queries).toEqual([
      { point: [14, 20], layers: ["world-region-fills", "shard-fills-bourgogne"] },
    ]);
    expect(state.canvas.style.cursor).toBe("pointer");
  });

  it("does not query while the map is moving", () => {
    const { map, state, move } = fakeMap([{ properties: { tier: 3 } }]);
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    state.canvas.style.cursor = "pointer";
    state.moving = true;
    move(1, 1);
    f.flush();
    expect(state.queries).toEqual([]);
    expect(state.canvas.style.cursor).toBe("pointer");
  });

  it("clears the pointer over the country wash past z5, and over nothing", () => {
    const { map, state, move } = fakeMap([{ properties: { tier: 0 } }], { zoom: 6 });
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    state.canvas.style.cursor = "pointer";
    move(1, 1);
    f.flush();
    expect(state.canvas.style.cursor).toBe("");
    state.features = [];
    state.zoom = 4;
    move(2, 2);
    f.flush();
    expect(state.canvas.style.cursor).toBe("");
  });

  it("skips the query when no interactive layer exists yet, and survives a throwing one", () => {
    const { map, state, move } = fakeMap([{ properties: { tier: 3 } }], { layers: [] });
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    move(1, 1);
    f.flush();
    expect(state.queries).toEqual([]);
    expect(state.canvas.style.cursor).toBe("");

    const second = fakeMap([{ properties: { tier: 3 } }]);
    second.state.throwOnQuery = true;
    installHoverCursor(second.map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    second.move(1, 1);
    expect(() => f.flush()).not.toThrow();
    expect(second.state.canvas.style.cursor).toBe("");
  });

  it("re-checks the cursor once at moveend, with no further mousemove", () => {
    const { map, state, move, moveEnd } = fakeMap([{ properties: { tier: 3 } }], { zoom: 6 });
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    // No pointer on the map yet: a moveend has nothing to re-check.
    moveEnd();
    expect(f.pending).toBe(0);

    move(5, 5);
    f.flush();
    expect(state.queries).toHaveLength(1);
    expect(state.canvas.style.cursor).toBe("pointer");

    // A drag (or an ease) moves the map under the resting pointer: now only
    // the country wash is under it, and no mousemove follows.
    state.moving = true;
    state.features = [{ properties: { tier: 0 } }];
    state.moving = false;
    moveEnd();
    expect(f.pending).toBe(1);
    f.flush();
    expect(state.queries).toHaveLength(2);
    expect(state.queries[1].point).toEqual([5, 5]);
    expect(state.canvas.style.cursor).toBe("");
  });

  it("the disposer cancels the pending frame and removes the listener", () => {
    const { map, state, move, listeners } = fakeMap([{ properties: { tier: 3 } }]);
    const f = frames();
    const dispose = installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    move(1, 1);
    dispose();
    expect(f.pending).toBe(0);
    expect(listeners.size).toBe(0);
    move(2, 2);
    f.flush();
    expect(state.queries).toEqual([]);
  });
});
