// ShardController against a fake map that behaves like MapLibre 5.24 where it
// matters: Style.addSource throws on a duplicate id; Style.addLayer fires an
// error (no throw, nothing added) for a duplicate id or a missing `before`,
// and for a layer whose source is missing inserts it into the order FIRST and
// then throws (the TypeError _updateLayer raises); removeSource refuses while
// a layer still reads the source; map.style is replaced by an unloaded object
// on a full rebuild. Layer order is modelled, so ordering is asserted rather
// than assumed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_PALETTES, type MapPalette } from "./map-palette";
import { GS } from "./map-state";
import { ShardController, type ControllerMap, type ShardDesired } from "./shard-controller";
import { shardFilter, shardLayerSpecs, shardOverlaySpecs } from "./shard-specs";

type Spec = {
  id: string;
  type: string;
  source?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown;
};
type Call = [string, ...unknown[]];

const WORLD_LAYERS = [
  "world-fills",
  "world-outlines",
  "world-region-fills",
  "world-region-outlines",
  "world-selected-casing",
  "world-selected-ring",
  "world-labels",
  "world-selected-label",
];
const MUTATIONS = new Set([
  "addSource",
  "addLayer",
  "setPaintProperty",
  "setFilter",
  "removeLayer",
  "removeSource",
  "moveLayer",
  "setGlobalStateProperty",
]);

class FakeStyle {
  sources = new Map<string, unknown>();
  layers = new Map<string, Spec>();
  order: string[] = [];
  _loaded = true;
  constructor(private readonly host: FakeMap) {}

  addSource(id: string, spec: unknown, o: { validate: false }) {
    this.host.record(["addSource", id, o]);
    this.host.clock.t += this.host.addCostMs;
    if (this.host.notLoaded) throw new Error("Style is not done loading.");
    if (this.sources.has(id)) throw new Error(`Source "${id}" already exists.`);
    this.sources.set(id, spec);
  }

  addLayer(spec: Spec, before: string | undefined, o: { validate: false }) {
    this.host.record(["addLayer", spec.id, before, o]);
    if (this.host.throwOnAddLayer === spec.id) throw new Error(`boom ${spec.id}`);
    if (this.layers.has(spec.id) || this.host.refuseLayer === spec.id) {
      this.host.errors.push(`Layer "${spec.id}" refused`);
      return;
    }
    const index = before ? this.order.indexOf(before) : this.order.length;
    if (before && index === -1) {
      this.host.errors.push(`Cannot add layer "${spec.id}" before non-existing layer "${before}".`);
      return;
    }
    this.order.splice(index, 0, spec.id);
    this.layers.set(spec.id, { ...spec });
    if (this.host.throwAfterInsert === spec.id || (spec.source && !this.sources.has(spec.source))) {
      throw new TypeError("Cannot read properties of undefined (reading 'getSource')");
    }
  }

  setPaintProperty(layer: string, name: string, value: unknown, o: { validate: false }) {
    this.host.record(["setPaintProperty", layer, name, o]);
    const spec = this.layers.get(layer);
    if (!spec) return;
    spec.paint = { ...spec.paint, [name]: value };
  }

  setFilter(layer: string, filter: unknown, o: { validate: false }) {
    this.host.record(["setFilter", layer, o]);
    const spec = this.layers.get(layer);
    if (spec) spec.filter = filter;
  }
}

class FakeMap implements ControllerMap {
  style: FakeStyle | undefined;
  calls: Call[] = [];
  errors: string[] = [];
  globalState: Record<string, unknown> = {};
  clock = { t: 0 };
  addCostMs = 0;
  notLoaded = false;
  throwOnAddLayer: string | null = null;
  throwAfterInsert: string | null = null;
  refuseLayer: string | null = null;
  private listeners = new Map<string, Set<(...a: unknown[]) => void>>();

  constructor({ world = true } = {}) {
    this.style = new FakeStyle(this);
    this.style.order.push("background", "water");
    if (world) this.addWorldLayers();
  }

  record(call: Call) {
    this.calls.push(call);
  }
  mutations(): Call[] {
    return this.calls.filter(([name]) => MUTATIONS.has(name));
  }
  addWorldLayers() {
    const style = this.style!;
    style.sources.set("wine-world", { type: "vector" });
    for (const id of WORLD_LAYERS) {
      style.order.push(id);
      style.layers.set(id, { id, type: "line", source: "wine-world" });
    }
  }
  /** MapLibre's full-rebuild fallback: a new, unloaded Style built from the
      serialized old one (here: every layer `keep` accepts). */
  rebuild(keep: (id: string) => boolean) {
    const prev = this.style!;
    const next = new FakeStyle(this);
    next._loaded = false;
    next.order = prev.order.filter(keep);
    for (const id of next.order) next.layers.set(id, { ...prev.layers.get(id)! });
    for (const [id, spec] of prev.sources) {
      if (next.order.some((layer) => next.layers.get(layer)?.source === id)) next.sources.set(id, spec);
    }
    this.style = next;
  }

  getSource(id: string) {
    return this.style?.sources.get(id);
  }
  getLayer(id: string) {
    return this.style?.layers.get(id);
  }
  removeLayer(id: string) {
    this.record(["removeLayer", id]);
    const style = this.style!;
    if (!style.layers.delete(id)) return this;
    style.order.splice(style.order.indexOf(id), 1);
    return this;
  }
  removeSource(id: string) {
    this.record(["removeSource", id]);
    const style = this.style!;
    if ([...style.layers.values()].some((layer) => layer.source === id)) {
      this.errors.push(`Source "${id}" cannot be removed while a layer is using it.`);
      return this;
    }
    style.sources.delete(id);
    return this;
  }
  moveLayer(id: string, before?: string) {
    this.record(["moveLayer", id, before]);
    const order = this.style!.order;
    order.splice(order.indexOf(id), 1);
    order.splice(before ? order.indexOf(before) : order.length, 0, id);
    return this;
  }
  getLayersOrder() {
    return [...this.style!.order];
  }
  setGlobalStateProperty(name: string, value: unknown) {
    this.record(["setGlobalStateProperty", name, value]);
    this.globalState[name] = value;
    return this;
  }
  getGlobalState() {
    return this.globalState;
  }
  setFeatureState() {
    return this;
  }
  removeFeatureState() {
    return this;
  }
  on(type: string, fn: (...a: unknown[]) => void) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return this;
  }
  off(type: string, fn: (...a: unknown[]) => void) {
    this.listeners.get(type)?.delete(fn);
    return this;
  }
  emit(type: string, event?: unknown) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
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
    /** Runs the frame that is due; returns how many callbacks ran. */
    flush() {
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb();
      return due.length;
    },
    /** Runs frames until nothing is scheduled; returns how many ran. */
    drain() {
      let count = 0;
      while (pending.size > 0 && count < 100) {
        this.flush();
        count += 1;
      }
      return count;
    },
    get pending() {
      return pending.size;
    },
  };
}

const URLS: Record<string, string> = Object.fromEntries(
  ["alsace", "bordeaux", "bourgogne", "champagne", "loire", "mosel", "toscana"].map((key) => [
    key,
    `https://tiles.test/${key}.pmtiles`,
  ]),
);
const COUNTRY: Record<string, string> = {
  alsace: "france", bordeaux: "france", bourgogne: "france", champagne: "france",
  loire: "france", mosel: "germany", toscana: "italy",
};
const SLUGS: Record<string, string[]> = {
  bourgogne: ["chablis", "cote-de-beaune", "cote-de-nuits", "gevrey-chambertin", "vosne-romanee"],
  champagne: ["cote-des-blancs", "montagne-de-reims", "vallee-de-la-marne"],
};

function desired(over: {
  keys?: string[];
  selectedShard?: string | null;
  theme?: "light" | "dark";
  ramped?: string[];
  tree?: boolean;
} = {}): ShardDesired {
  const palette: MapPalette = MAP_PALETTES[over.theme ?? "light"];
  const ramped = new Set(over.ramped ?? []);
  const tree = over.tree ?? true;
  return {
    keys: over.keys ?? ["bourgogne"],
    urls: URLS,
    selectedShard: over.selectedShard ?? null,
    palette,
    inputs: (key) => ({
      country: tree ? (COUNTRY[key] ?? null) : null,
      areaSlugs: tree ? (SLUGS[key] ?? []) : [],
      ramp: ramped.has(key),
      palette,
      fillsVisible: true,
    }),
  };
}

function setup(opts: { world?: boolean; budgetMs?: number; addCostMs?: number } = {}) {
  const map = new FakeMap({ world: opts.world ?? true });
  map.addCostMs = opts.addCostMs ?? 0;
  const f = frames();
  const controller = new ShardController(map, {
    now: () => map.clock.t,
    raf: f.raf,
    cancelRaf: f.cancelRaf,
    budgetMs: opts.budgetMs ?? 8,
  });
  return { map, frames: f, controller };
}

const idx = (map: FakeMap, id: string) => map.getLayersOrder().indexOf(id);
const base = (key: string) => [`shard-fills-${key}`, `shard-outlines-${key}`, `shard-labels-${key}`];
const overlays = (key: string) => [
  `shard-selected-casing-${key}`,
  `shard-selected-ring-${key}`,
  `shard-selected-label-${key}`,
];
const V = { validate: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ShardController", () => {
  it("1. waits for the world layers, then adds every shard above them", () => {
    const { map, frames, controller } = setup({ world: false });
    controller.setDesired(desired({ keys: ["bourgogne"] }));
    frames.drain();
    expect(map.getSource("wine-shard-bourgogne")).toBeUndefined();
    expect(map.mutations()).toEqual([]);

    // react-map-gl creates the world layers in a later render; styledata follows.
    map.addWorldLayers();
    map.emit("styledata");
    frames.drain();
    expect(controller.isAdded("bourgogne")).toBe(true);
    for (const world of WORLD_LAYERS) {
      expect(idx(map, world)).toBeLessThan(idx(map, "shard-fills-bourgogne"));
    }
  });

  it("2. adds one source and its three layers per shard, then marks the map dirty once", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "alsace"] }));
    expect(frames.flush()).toBe(1);
    expect(map.mutations()).toEqual([
      ["addSource", "wine-shard-alsace", V],
      ["addLayer", "shard-fills-alsace", undefined, V],
      ["addLayer", "shard-outlines-alsace", undefined, V],
      ["addLayer", "shard-labels-alsace", undefined, V],
      ["addSource", "wine-shard-bourgogne", V],
      ["addLayer", "shard-fills-bourgogne", undefined, V],
      ["addLayer", "shard-outlines-bourgogne", undefined, V],
      ["addLayer", "shard-labels-bourgogne", undefined, V],
      ["setGlobalStateProperty", GS.tick, 1],
    ]);
    // The source spec is exactly what shardLayerSpecs builds from the inputs.
    expect(map.getSource("wine-shard-bourgogne")).toEqual(
      shardLayerSpecs("bourgogne", URLS.bourgogne, desired().inputs("bourgogne")).source,
    );
    expect(frames.pending).toBe(0);
  });

  it("3. keeps each frame within the time budget", () => {
    // 8 ms budget, 3 ms per add: three adds fit (0, 3, 6 ms), the fourth waits.
    const { map, frames, controller } = setup({ budgetMs: 8, addCostMs: 3 });
    controller.setDesired(desired({ keys: Object.keys(URLS) }));
    const perFrame: number[] = [];
    while (frames.pending > 0) {
      const before = map.mutations().filter(([n]) => n === "addSource").length;
      frames.flush();
      perFrame.push(map.mutations().filter(([n]) => n === "addSource").length - before);
    }
    expect(perFrame).toEqual([3, 3, 1]);
    // One dirty mark per batch, never per shard.
    expect(map.mutations().filter(([n]) => n === "setGlobalStateProperty")).toHaveLength(3);
    for (const key of Object.keys(URLS)) expect(controller.isAdded(key)).toBe(true);
  });

  it("4. adds the selected shard first, then alphabetically", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["toscana", "alsace", "mosel", "bourgogne"], selectedShard: "mosel" }));
    frames.drain();
    expect(map.mutations().filter(([n]) => n === "addSource").map(([, id]) => id)).toEqual([
      "wine-shard-mosel",
      "wine-shard-alsace",
      "wine-shard-bourgogne",
      "wine-shard-toscana",
    ]);
  });

  it("5. keeps the selection overlays on top; later shards go in below them", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne"], selectedShard: "bourgogne" }));
    frames.drain();
    expect(map.getLayersOrder().slice(-6)).toEqual([...base("bourgogne"), ...overlays("bourgogne")]);

    controller.setDesired(desired({ keys: ["alsace", "bourgogne", "toscana"], selectedShard: "bourgogne" }));
    frames.drain();
    const order = map.getLayersOrder();
    expect(order.slice(-3)).toEqual(overlays("bourgogne"));
    for (const id of [...base("alsace"), ...base("toscana")]) {
      expect(idx(map, id)).toBeLessThan(idx(map, "shard-selected-casing-bourgogne"));
    }
    expect(map.calls).toContainEqual(["addLayer", "shard-fills-alsace", "shard-selected-casing-bourgogne", V]);
    // The overlays are exactly shardOverlaySpecs for the landed palette.
    expect(map.getLayer("shard-selected-ring-bourgogne")).toEqual(shardOverlaySpecs("bourgogne", MAP_PALETTES.light)[1]);
  });

  it("6. moves the overlays when the selection moves to another shard", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
    frames.drain();
    map.calls = [];
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "alsace" }));
    frames.drain();
    expect(map.mutations()).toEqual([
      ["removeLayer", "shard-selected-label-bourgogne"],
      ["removeLayer", "shard-selected-ring-bourgogne"],
      ["removeLayer", "shard-selected-casing-bourgogne"],
      ["addLayer", "shard-selected-casing-alsace", undefined, V],
      ["addLayer", "shard-selected-ring-alsace", undefined, V],
      ["addLayer", "shard-selected-label-alsace", undefined, V],
      ["setGlobalStateProperty", GS.tick, 1],
    ]);
    expect(map.getLayersOrder().slice(-3)).toEqual(overlays("alsace"));

    // Nothing selected: no overlays at all.
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: null }));
    frames.drain();
    expect(map.getLayersOrder().some((id) => id.startsWith("shard-selected-"))).toBe(false);
  });

  it("7. rolls a shard back when a layer throws, marks it failed and never retries it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    map.throwOnAddLayer = "shard-outlines-alsace";
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"] }));
    frames.drain();
    expect(map.getSource("wine-shard-alsace")).toBeUndefined();
    expect(map.getLayersOrder().filter((id) => id.includes("alsace"))).toEqual([]);
    expect(controller.isAdded("alsace")).toBe(false);
    expect(controller.isAdded("bourgogne")).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('"alsace"');

    // Never retried this visit, whatever triggers a run.
    map.throwOnAddLayer = null;
    map.calls = [];
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"] }));
    map.emit("styledata");
    controller.onStyleRebuilt();
    frames.drain();
    expect(map.calls.filter(([n, id]) => n === "addSource" && id === "wine-shard-alsace")).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("8. also removes a layer MapLibre inserted before throwing", () => {
    // A layer whose source is missing goes into the order and THEN throws; left
    // there it would fault every frame. The rollback checks every spec id.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    map.throwAfterInsert = "shard-labels-loire";
    controller.setDesired(desired({ keys: ["loire"] }));
    frames.drain();
    expect(map.getLayersOrder().filter((id) => id.includes("loire"))).toEqual([]);
    expect(map.getSource("wine-shard-loire")).toBeUndefined();
    expect(controller.isAdded("loire")).toBe(false);
  });

  it("9. treats a layer MapLibre refused with an error event as a failed add", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    map.refuseLayer = "shard-fills-champagne";
    controller.setDesired(desired({ keys: ["champagne", "mosel"] }));
    frames.drain();
    expect(map.getSource("wine-shard-champagne")).toBeUndefined();
    expect(controller.isAdded("champagne")).toBe(false);
    expect(controller.isAdded("mosel")).toBe(true);
  });

  it("10. removes overlays, then labels, outlines, fills, and the source last", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
    frames.drain();
    map.calls = [];
    controller.setDesired(desired({ keys: ["alsace"], selectedShard: null }));
    frames.drain();
    expect(map.mutations()).toEqual([
      ["removeLayer", "shard-selected-label-bourgogne"],
      ["removeLayer", "shard-selected-ring-bourgogne"],
      ["removeLayer", "shard-selected-casing-bourgogne"],
      ["removeLayer", "shard-labels-bourgogne"],
      ["removeLayer", "shard-outlines-bourgogne"],
      ["removeLayer", "shard-fills-bourgogne"],
      ["removeSource", "wine-shard-bourgogne"],
      ["setGlobalStateProperty", GS.tick, 1],
    ]);
    expect(map.errors).toEqual([]);
    expect(controller.isAdded("bourgogne")).toBe(false);
  });

  it("11. does nothing while a rebuilt style loads, then re-adds what is missing and repaints", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"] }));
    frames.drain();
    // Full rebuild: the new style carries bourgogne (transformStyle) but not alsace.
    map.rebuild((id) => !id.includes("alsace"));
    map.calls = [];
    map.emit("styledata");
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"] }));
    frames.drain();
    expect(map.mutations()).toEqual([]);

    map.style!._loaded = true;
    controller.onStyleRebuilt();
    frames.drain();
    expect(controller.isAdded("alsace")).toBe(true);
    const repainted = map.mutations().filter(([n]) => n === "setPaintProperty").map(([, layer, name]) => `${layer} ${name}`);
    expect(repainted).toEqual(expect.arrayContaining([
      "shard-fills-bourgogne fill-color",
      "shard-outlines-bourgogne line-color",
      "shard-labels-bourgogne text-color",
    ]));
  });

  it("12. a 'not done loading' throw stops the run without failing the shard", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    map.notLoaded = true;
    controller.setDesired(desired({ keys: ["bourgogne"] }));
    frames.drain();
    expect(controller.isAdded("bourgogne")).toBe(false);
    expect(error).not.toHaveBeenCalled();
    map.notLoaded = false;
    controller.onStyleRebuilt();
    frames.drain();
    expect(controller.isAdded("bourgogne")).toBe(true);
  });

  it("13. reapplyPaint rewrites every mounted shard's colours without validation", () => {
    const { map, frames, controller } = setup();
    const next = desired({ keys: ["bourgogne", "mosel"], ramped: ["bourgogne"] });
    controller.setDesired(next);
    frames.drain();
    map.calls = [];
    controller.reapplyPaint();
    frames.drain();
    const writes = map.calls.filter(([n]) => n === "setPaintProperty");
    for (const key of ["bourgogne", "mosel"]) {
      const names = writes.filter(([, layer]) => String(layer).endsWith(`-${key}`)).map(([, layer, name]) => `${layer} ${name}`);
      expect(names).toEqual(expect.arrayContaining([
        `shard-fills-${key} fill-color`,
        `shard-fills-${key} fill-opacity`,
        `shard-outlines-${key} line-color`,
        `shard-labels-${key} text-color`,
        `shard-labels-${key} text-halo-color`,
      ]));
    }
    for (const call of writes) expect(call[3]).toEqual(V);
    // The ramped shard's fill-opacity is the ramped one.
    const fills = map.getLayer("shard-fills-bourgogne")!;
    expect(fills.paint?.["fill-opacity"]).toEqual(
      (shardLayerSpecs("bourgogne", URLS.bourgogne, next.inputs("bourgogne")).layers[0] as Spec).paint?.["fill-opacity"],
    );
  });

  it("14. a theme flip repaints every shard and the overlays with the landed palette", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"], selectedShard: "bourgogne" }));
    frames.drain();
    map.calls = [];
    const dark = desired({ keys: ["bourgogne", "mosel"], selectedShard: "bourgogne", theme: "dark" });
    controller.setDesired(dark);
    frames.drain();
    for (const key of ["bourgogne", "mosel"]) {
      const expected = shardLayerSpecs(key, URLS[key], dark.inputs(key)).layers as Spec[];
      for (const layer of expected) expect(map.getLayer(layer.id)?.paint).toEqual(layer.paint);
    }
    expect(map.getLayer("shard-selected-casing-bourgogne")?.paint?.["line-color"]).toBe(MAP_PALETTES.dark.selectedCasing);
    expect(map.getLayer("shard-selected-ring-bourgogne")?.paint?.["line-color"]).toBe(MAP_PALETTES.dark.selectedRing);
    // Colours only: no filter moved and nothing was re-added.
    expect(map.mutations().filter(([n]) => n === "setFilter" || n === "addSource" || n === "addLayer")).toEqual([]);
  });

  it("15. a ramp joining rewrites only that shard", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"] }));
    frames.drain();
    map.calls = [];
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"], ramped: ["bourgogne"] }));
    frames.drain();
    const touched = new Set(map.mutations().filter(([n]) => n === "setPaintProperty").map(([, layer]) => layer));
    expect([...touched].sort()).toEqual(base("bourgogne").sort());
  });

  it("16. the tree landing re-filters by country and recolours by area, without re-adding", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"], tree: false }));
    frames.drain();
    expect(map.getLayer("shard-fills-bourgogne")?.filter).toEqual(shardFilter(null));
    map.calls = [];
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"], tree: true }));
    frames.drain();
    for (const id of base("bourgogne")) {
      expect(map.calls).toContainEqual(["setFilter", id, V]);
      expect(map.getLayer(id)?.filter).toEqual(shardFilter("france"));
    }
    for (const id of base("mosel")) expect(map.getLayer(id)?.filter).toEqual(shardFilter("germany"));
    expect(map.calls).toContainEqual(["setPaintProperty", "shard-fills-bourgogne", "fill-color", V]);
    expect(map.mutations().filter(([n]) => n === "addSource" || n === "removeSource")).toEqual([]);
  });

  it("17. the same desired state again writes nothing", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne", ramped: ["bourgogne"] }));
    frames.drain();
    map.calls = [];
    // Fresh objects, equal content: a React re-render.
    controller.setDesired(desired({ keys: ["bourgogne", "alsace"], selectedShard: "bourgogne", ramped: ["bourgogne"] }));
    map.emit("styledata");
    frames.drain();
    expect(map.mutations()).toEqual([]);
  });

  it("18. reads what is mounted from the map: a second controller adopts it", () => {
    const first = setup();
    first.controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
    first.frames.drain();
    first.controller.dispose();

    const { map } = first;
    map.calls = [];
    const f = frames();
    const second = new ShardController(map, { now: () => 0, raf: f.raf, cancelRaf: f.cancelRaf });
    expect(second.isAdded("alsace")).toBe(true);
    second.setDesired(desired({ keys: ["bourgogne"], selectedShard: "bourgogne" }));
    f.drain();
    expect(map.mutations().filter(([n]) => n === "addSource" || n === "addLayer")).toEqual([]);
    expect(map.getSource("wine-shard-alsace")).toBeUndefined();
    expect(second.isAdded("bourgogne")).toBe(true);
  });

  it("19. moves a world layer re-created above the shards back below them, in world order", () => {
    for (const recreated of ["world-labels", "world-selected-label", "world-fills"]) {
      const { map, frames, controller } = setup();
      controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
      frames.drain();
      // react-map-gl re-creating a world layer (StrictMode/Fast Refresh) appends it.
      const order = map.style!.order;
      order.splice(order.indexOf(recreated), 1);
      order.push(recreated);
      map.emit("styledata");
      frames.drain();
      const firstShard = map.getLayersOrder().findIndex((id) => id.startsWith("shard-"));
      for (const world of WORLD_LAYERS) expect(idx(map, world), `${recreated}: ${world}`).toBeLessThan(firstShard);
      // The world block keeps its own order: world-selected-label directly
      // above world-labels, so the selected name wins its collision (D4).
      expect(map.getLayersOrder().filter((id) => id.startsWith("world-")), recreated).toEqual(WORLD_LAYERS);
      expect(idx(map, "world-labels")).toBeLessThan(idx(map, "world-selected-label"));
      expect(map.getLayersOrder().slice(-3)).toEqual(overlays("bourgogne"));
    }
  });

  it("20. skips a key with no archive url", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "atlantis"] }));
    frames.drain();
    expect(controller.isAdded("bourgogne")).toBe(true);
    expect(controller.isAdded("atlantis")).toBe(false);
    expect(map.calls.filter(([n, id]) => n === "addSource" && id === "wine-shard-atlantis")).toEqual([]);
  });

  it("21. a diff landing (same style object) re-checks without rewriting anything", () => {
    // withWineLayers carries the shard layers across a theme diff verbatim;
    // the landed palette arrives through the next setDesired instead.
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
    frames.drain();
    map.calls = [];
    controller.onStyleRebuilt();
    expect(frames.pending).toBe(1);
    frames.drain();
    expect(map.mutations()).toEqual([]);
  });

  it("22. dispose cancels the pending frame and stops listening", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne"] }));
    expect(frames.pending).toBe(1);
    controller.dispose();
    expect(frames.pending).toBe(0);
    map.emit("styledata");
    map.emit("error", { sourceId: "wine-shard-bourgogne", error: new Error("Failed to fetch") });
    expect(frames.pending).toBe(0);
    frames.drain();
    expect(map.mutations()).toEqual([]);
  });

  it("23. a theme flip while shards are still being added reaches every shard, early and late", () => {
    // 8 ms budget, 3 ms per add: the first frame adds three shards, and the
    // flip lands with four still queued.
    const { map, frames, controller } = setup({ budgetMs: 8, addCostMs: 3 });
    const keys = Object.keys(URLS);
    controller.setDesired(desired({ keys, selectedShard: "bourgogne" }));
    frames.flush();
    expect(keys.filter((key) => controller.isAdded(key))).toEqual(["alsace", "bordeaux", "bourgogne"]);

    const dark = desired({ keys, theme: "dark", ramped: ["bourgogne"], selectedShard: "bourgogne" });
    controller.setDesired(dark);
    frames.drain();
    for (const key of keys) {
      expect(controller.isAdded(key), key).toBe(true);
      const expected = shardLayerSpecs(key, URLS[key], dark.inputs(key)).layers as Spec[];
      for (const layer of expected) expect(map.getLayer(layer.id)?.paint, layer.id).toEqual(layer.paint);
    }
    const [casing, ring, label] = shardOverlaySpecs("bourgogne", MAP_PALETTES.dark) as Spec[];
    expect(map.getLayer(casing.id)?.paint?.["line-color"]).toBe(MAP_PALETTES.dark.selectedCasing);
    expect(map.getLayer(ring.id)?.paint?.["line-color"]).toBe(MAP_PALETTES.dark.selectedRing);
    expect(map.getLayer(label.id)?.paint).toEqual(label.paint);
  });

  it("24. drops a shard whose archive cannot be read; a single tile's error is left alone", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "alsace" }));
    frames.drain();

    // One tile of a shard fails (MapLibre's error event carries `tile`).
    map.emit("error", { sourceId: "wine-shard-alsace", tile: {}, error: new Error("tile 404") });
    frames.drain();
    expect(controller.isAdded("alsace")).toBe(true);

    // The archive header fails (blocked, 404, offline): MapLibre marks the
    // source errored and reports it loaded. Not ready, removed, not retried.
    map.calls = [];
    map.emit("error", { sourceId: "wine-shard-alsace", error: new Error("Failed to fetch") });
    expect(controller.isAdded("alsace")).toBe(false);
    frames.drain();
    expect(map.getSource("wine-shard-alsace")).toBeUndefined();
    expect(map.getLayersOrder().filter((id) => id.includes("alsace"))).toEqual([]);
    expect(map.mutations().at(-1)).toEqual(["setGlobalStateProperty", GS.tick, 1]);
    expect(controller.isAdded("bourgogne")).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('"alsace"');

    // Other sources' errors are not the controller's; the dropped shard stays out.
    map.emit("error", { sourceId: "carto", error: new Error("basemap") });
    map.emit("error", { sourceId: "wine-world", error: new Error("world") });
    map.emit("error", { error: new Error("no source") });
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "alsace" }));
    frames.drain();
    expect(map.calls.filter(([n, id]) => n === "addSource" && id === "wine-shard-alsace")).toEqual([]);
    expect(controller.isAdded("bourgogne")).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("25. rolls back a selection overlay that fails, keeps its shard, and never retries the overlay", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // A throw before insertion, a throw after it, and a refusal by event —
    // each one after the casing is already in, so a partial set would show.
    const failures = [
      { mode: "throwOnAddLayer", id: "shard-selected-ring-bourgogne" },
      { mode: "throwAfterInsert", id: "shard-selected-ring-bourgogne" },
      { mode: "refuseLayer", id: "shard-selected-label-bourgogne" },
    ] as const;
    const overlayAdds = (map: FakeMap, key: string) =>
      map.calls.filter(([n, id]) => n === "addLayer" && overlays(key).includes(String(id)));
    for (const { mode, id } of failures) {
      error.mockClear();
      const { map, frames, controller } = setup();
      map[mode] = id;
      controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
      frames.drain();
      // No partial overlay (a casing without its ring): every overlay id is gone.
      expect(map.getLayersOrder().filter((layer) => layer.startsWith("shard-selected-")), mode).toEqual([]);
      // The shard itself stays mounted and ready; so does the other one.
      expect(controller.isAdded("bourgogne"), mode).toBe(true);
      for (const layer of base("bourgogne")) expect(map.getLayer(layer), `${mode}: ${layer}`).toBeDefined();
      expect(controller.isAdded("alsace"), mode).toBe(true);
      expect(error, mode).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0]), mode).toContain('"bourgogne"');

      // Never retried this visit, whatever triggers a run.
      map[mode] = null;
      map.calls = [];
      controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
      map.emit("styledata");
      controller.reapplyPaint();
      frames.drain();
      expect(overlayAdds(map, "bourgogne"), mode).toEqual([]);

      // The failure is that shard's alone: another shard's selection rings.
      controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "alsace" }));
      frames.drain();
      expect(map.getLayersOrder().slice(-3), mode).toEqual(overlays("alsace"));

      // Back on the failed shard: no overlays, still no retry.
      controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
      frames.drain();
      expect(map.getLayersOrder().filter((layer) => layer.startsWith("shard-selected-")), mode).toEqual([]);
      expect(overlayAdds(map, "bourgogne"), mode).toEqual([]);
      expect(controller.isAdded("bourgogne"), mode).toBe(true);
      expect(error, mode).toHaveBeenCalledTimes(1);
    }
  });
});
