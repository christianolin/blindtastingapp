import { describe, expect, it } from "vitest";
import {
  hoverGeometry,
  hoverIsClickable,
  installHoverCursor,
  type HoverGeometry,
  type HoverMap,
  type HoverPoint,
} from "./hover-cursor";

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
    queries: [] as { point: HoverGeometry; layers: string[] }[],
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
  // The pointer leaving the canvas.
  const out = () => {
    for (const fn of [...of("mouseout")]) (fn as () => void)();
  };
  return { map, state, move, moveEnd, out, listeners };
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

// The training room's options (training-room-map spec RM15, RM18): all three
// optional; the explorer passes none and keeps every behaviour above.
describe("installHoverCursor's room options", () => {
  const DOTS = ["training-dots"];

  it("with no new option it queries the exact point and never listens for mouseout", () => {
    const { map, state, move, listeners } = fakeMap([{ properties: { tier: 3 } }], { layers: DOTS });
    const f = frames();
    installHoverCursor(map, { layers: () => DOTS, raf: f.raf, cancelRaf: f.cancelRaf });
    expect(listeners.size).toBe(2);
    move(10, 20);
    f.flush();
    expect(state.queries[0].point).toEqual([10, 20]);
  });

  it("hoverGeometry: the exact point at 0, a square of that half-size otherwise", () => {
    expect(hoverGeometry({ x: 10, y: 20 }, 0)).toEqual([10, 20]);
    expect(hoverGeometry({ x: 10, y: 20 }, 6)).toEqual([
      [4, 14],
      [16, 26],
    ]);
  });

  it("isClickable replaces the tier rule, and box queries the square", () => {
    // Room dots carry no tier: hoverIsClickable would say no past z5.
    const { map, state, move } = fakeMap([{ properties: { id: "a1" } }], { zoom: 8, layers: DOTS });
    const f = frames();
    installHoverCursor(map, {
      layers: () => DOTS,
      raf: f.raf,
      cancelRaf: f.cancelRaf,
      isClickable: (features) => features.length > 0,
      box: 6,
    });
    move(50, 60);
    f.flush();
    expect(state.queries).toEqual([
      {
        point: [
          [44, 54],
          [56, 66],
        ],
        layers: DOTS,
      },
    ]);
    expect(state.canvas.style.cursor).toBe("pointer");
  });

  it("onHover gets the hits once per frame, [] over nothing, and [] when the pointer leaves", () => {
    const { map, state, move, out, listeners } = fakeMap([{ properties: { id: "a1" } }], { layers: DOTS });
    const f = frames();
    const seen: { ids: unknown[]; point: HoverPoint }[] = [];
    const dispose = installHoverCursor(map, {
      layers: () => DOTS,
      raf: f.raf,
      cancelRaf: f.cancelRaf,
      isClickable: (features) => features.length > 0,
      onHover: (features, point) => seen.push({ ids: features.map((x) => x.properties?.id), point }),
    });
    expect(listeners.size).toBe(3);
    move(1, 1);
    move(2, 2);
    f.flush();
    expect(seen).toEqual([{ ids: ["a1"], point: { x: 2, y: 2 } }]);

    state.features = [];
    move(3, 3);
    f.flush();
    expect(seen[1]).toEqual({ ids: [], point: { x: 3, y: 3 } });

    // Leaving cancels a pending frame, clears the cursor and reports nothing under it.
    state.features = [{ properties: { id: "a1" } }];
    move(4, 4);
    state.canvas.style.cursor = "pointer";
    out();
    expect(f.pending).toBe(0);
    expect(state.canvas.style.cursor).toBe("");
    expect(seen[2]).toEqual({ ids: [], point: { x: 4, y: 4 } });

    dispose();
    expect(listeners.size).toBe(0);
  });

  it("a throwing query reports [] to onHover and no pointer", () => {
    const { map, state, move } = fakeMap([{ properties: { id: "a1" } }], { layers: DOTS });
    state.throwOnQuery = true;
    const f = frames();
    const seen: unknown[][] = [];
    installHoverCursor(map, {
      layers: () => DOTS,
      raf: f.raf,
      cancelRaf: f.cancelRaf,
      isClickable: (features) => features.length > 0,
      onHover: (features) => seen.push([...features]),
    });
    move(1, 1);
    expect(() => f.flush()).not.toThrow();
    expect(seen).toEqual([[]]);
    expect(state.canvas.style.cursor).toBe("");
  });
});
