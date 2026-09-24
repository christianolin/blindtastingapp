// MapStateSync against a fake map that behaves like MapLibre 5.24 where it
// matters: global-state and feature-state writes throw until the style has
// loaded; a full rebuild replaces map.style with a new object whose global
// state is empty and whose sources are new objects with no feature-state; a
// diff swap keeps all three; removing a key from a feature with no state
// record is MapLibre's coalesceChanges trap, so the fake throws there. Every
// case is one a live visitor can reach — a
// cold deep link before Carto's style lands, a theme flip that falls back to a
// rebuild, a shard mounting after the selection, a fast run of selections.
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, expectTypeOf, it } from "vitest";
import { keyLookupMap } from "./key-gate";
import { desiredGlobalState } from "./map-state";
import { MapStateSync, type SyncMap } from "./map-state-sync";
import { FIXTURE_TREE } from "./__fixtures__/place-tree";
import { selectionFeatureStates, type SelectionStates } from "./selection-state";

type Target = { source: string; sourceLayer: string; id: string };
type Listener = (...a: unknown[]) => void;
type Call =
  | { op: "global"; name: string; value: unknown }
  | { op: "set"; target: Target; state: Record<string, unknown> }
  | { op: "remove"; target: Target; key: string | undefined };

class FakeMap implements SyncMap {
  style: object | undefined = { generation: 0 };
  loaded = true;
  calls: Call[] = [];
  /** Key removals from a feature with no state record. MapLibre accepts the
      call and throws from its next render (coalesceChanges), outside
      MapStateSync's try, so a throw alone would be swallowed here: the fake
      throws AND records it, and tests assert this stays empty. */
  violations: { target: Target; key: string }[] = [];
  private globalState: Record<string, unknown> = {};
  private readonly sources = new Map<string, object>();
  private readonly featureStates = new Map<string, Record<string, unknown>>();
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(sourceIds: string[]) {
    for (const id of sourceIds) this.sources.set(id, { id });
  }

  private checkLoaded() {
    if (!this.loaded) throw new Error("Style is not done loading.");
  }
  getGlobalState() {
    return this.globalState;
  }
  setGlobalStateProperty(name: string, value: unknown) {
    this.checkLoaded();
    this.calls.push({ op: "global", name, value });
    this.globalState[name] = value;
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  setFeatureState(target: Target, state: Record<string, unknown>) {
    this.checkLoaded();
    if (!this.sources.has(target.source)) return;
    this.calls.push({ op: "set", target, state });
    const key = `${target.source}|${target.sourceLayer}|${target.id}`;
    this.featureStates.set(key, { ...this.featureStates.get(key), ...state });
  }
  removeFeatureState(target: Target, key?: string) {
    this.checkLoaded();
    this.calls.push({ op: "remove", target, key });
    // A source that is not there: MapLibre fires an error event, no throw.
    if (!this.sources.has(target.source)) return;
    const id = `${target.source}|${target.sourceLayer}|${target.id}`;
    const state = this.featureStates.get(id);
    if (!state) {
      if (key === undefined) return;
      // coalesceChanges runs `delete state[sourceLayer][feature][key]` on a
      // missing record: a TypeError out of every frame.
      this.violations.push({ target, key });
      throw new TypeError(`Cannot convert undefined or null to object (${id}, ${key})`);
    }
    if (key === undefined) this.featureStates.delete(id);
    else delete state[key];
  }
  on(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  off(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  fire(type: string, event: unknown = {}) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  /** Feature-state as MapLibre would read it for paint. */
  stateOf(source: string, sourceLayer: string, id: string) {
    return this.featureStates.get(`${source}|${sourceLayer}|${id}`) ?? {};
  }
  /** Every selection flag (sel/child/rel) on the map, `handed` left out, keyed
      `source|sourceLayer|id`; a feature with none of them is absent. */
  selectionFlags() {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, state] of this.featureStates) {
      const flags = Object.fromEntries(Object.entries(state).filter(([name]) => name !== "handed"));
      if (Object.keys(flags).length > 0) out[key] = flags;
    }
    return out;
  }
  addSource(id: string) {
    this.sources.set(id, { id, generation: Math.random() });
  }
  /** A <Source> unmounting: the source and its feature-state go. */
  removeSource(id: string) {
    for (const key of [...this.featureStates.keys()]) {
      if (key.startsWith(`${id}|`)) this.featureStates.delete(key);
    }
    this.sources.delete(id);
  }
  /** Unmount + remount: a new source object, its feature-state gone. */
  recreateSource(id: string) {
    this.removeSource(id);
    this.addSource(id);
  }
  /** MapLibre's full-rebuild fallback: a new Style, not loaded for a frame. */
  startRebuild() {
    this.style = { generation: Math.random() };
    this.loaded = false;
    this.globalState = {};
    this.featureStates.clear();
    for (const id of [...this.sources.keys()]) this.addSource(id);
    this.fire("styledataloading");
  }
  land() {
    this.loaded = true;
    this.fire("style.load");
  }
}

const WORLD = "wine-world";
const BOURGOGNE = "wine-shard-bourgogne";
const BORDEAUX = "wine-shard-bordeaux";
const TOSCANA = "wine-shard-toscana";
const VOSNE = "france.bourgogne.cote-de-nuits.vosne-romanee";

function snapshot(selectedKey: string | null, extra: Partial<Parameters<typeof desiredGlobalState>[0]> = {}) {
  return {
    global: desiredGlobalState({
      visibleKeys: null,
      english: true,
      selectedKey,
      deepCountries: ["france"],
      knownCountries: ["france", "italy"],
      ...extra,
    }),
    selection: selectionFeatureStates({ roots: FIXTURE_TREE, selectedKey, fallback: null }),
  };
}

/** The selection flags a map must hold for `selection`: every feature on both
    of its source-layers, on the sources that are mounted. */
function expectedFlags(map: FakeMap, selection: SelectionStates) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [source, bucket] of selection) {
    if (!map.getSource(source)) continue;
    for (const [id, flags] of bucket) {
      for (const sourceLayer of ["places", "labels"]) out[`${source}|${sourceLayer}|${id}`] = { ...flags };
    }
  }
  return out;
}

const globals = (map: FakeMap) => map.calls.filter((c) => c.op === "global");

describe("MapStateSync", () => {
  it("takes a live MapLibre map as is", () => {
    expectTypeOf<MapLibreMap>().toExtend<SyncMap>();
  });

  it("writes every global-state name and the selection, on both source-layers", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    new MapStateSync(map).setDesired(snapshot(VOSNE));
    expect(map.getGlobalState()).toEqual({
      wm_keys: null,
      wm_local: false,
      wm_has_sel: true,
      wm_sel_key: VOSNE,
      wm_deep_france: true,
      wm_deep_italy: false,
    });
    for (const sourceLayer of ["places", "labels"]) {
      expect(map.stateOf(BOURGOGNE, sourceLayer, VOSNE)).toEqual({ sel: true });
      expect(map.stateOf(BOURGOGNE, sourceLayer, `${VOSNE}.la-tache`)).toEqual({ child: true, rel: true });
      expect(map.stateOf(BOURGOGNE, sourceLayer, "france.bourgogne.cote-de-nuits")).toEqual({ rel: true });
    }
  });

  it("re-sends nothing that has not changed, even as a new but equal object", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    const sync = new MapStateSync(map);
    const keys = ["france.bourgogne", VOSNE];
    sync.setDesired(snapshot(VOSNE, { visibleKeys: keys }));
    const before = map.calls.length;
    sync.setDesired(snapshot(VOSNE, { visibleKeys: keys }));
    sync.apply();
    // A different array with the same keys builds a fresh lookup object; it is
    // compared with the map's value and not written.
    sync.setDesired(snapshot(VOSNE, { visibleKeys: [...keys] }));
    expect(map.calls.length).toBe(before);
    expect(map.getGlobalState().wm_keys).toEqual(keyLookupMap(keys));
  });

  it("a write before the style has loaded is deferred to load, not lost", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    map.loaded = false;
    const sync = new MapStateSync(map);
    expect(() => sync.setDesired(snapshot(VOSNE))).not.toThrow();
    expect(map.calls).toEqual([]);
    map.loaded = true;
    map.fire("load");
    expect(map.getGlobalState().wm_sel_key).toBe(VOSNE);
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({ sel: true });
  });

  it("holds writes between styledataloading and style.load, then applies the latest", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot("france.bourgogne"));
    map.startRebuild();
    map.calls = [];
    sync.setDesired(snapshot(VOSNE, { english: false }));
    expect(map.calls).toEqual([]);
    map.land();
    expect(map.getGlobalState()).toMatchObject({ wm_sel_key: VOSNE, wm_local: true });
    expect(map.stateOf(BOURGOGNE, "labels", VOSNE)).toEqual({ sel: true });
  });

  it("a full rebuild re-sends everything, though nothing changed in React", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot("france.bourgogne", { visibleKeys: [VOSNE] }));
    const applied = { ...map.getGlobalState() };
    map.startRebuild();
    map.land();
    expect(map.getGlobalState()).toEqual(applied);
    expect(map.stateOf(WORLD, "places", "bourgogne")).toEqual({ sel: true });
    expect(map.stateOf(WORLD, "labels", "france")).toEqual({ rel: true });
    expect(map.stateOf(BOURGOGNE, "places", "france.bourgogne")).toEqual({ sel: true });
    expect(map.stateOf(BORDEAUX, "places", "france.bordeaux")).toEqual({ rel: true });
  });

  it("a diff-path style.load (same style, same sources) writes nothing", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    new MapStateSync(map).setDesired(snapshot(VOSNE));
    map.calls = [];
    map.fire("style.load");
    expect(map.calls).toEqual([]);
  });

  it("clears the previous selection's flags by name, never key-less, and keeps `handed`", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    // The handoff effect's own flag on Bourgogne's world copy.
    map.setFeatureState({ source: WORLD, sourceLayer: "places", id: "bourgogne" }, { handed: true });
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot("france.bourgogne"));
    expect(map.stateOf(WORLD, "places", "bourgogne")).toEqual({ handed: true, sel: true });
    for (const next of ["france.bordeaux.medoc", VOSNE, "italy"]) sync.setDesired(snapshot(next));
    expect(map.stateOf(WORLD, "places", "bourgogne")).toEqual({ handed: true });
    // Exactly one selected place is left, on both of its source-layers.
    expect(map.stateOf(WORLD, "places", "italy")).toEqual({ sel: true });
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({});
    expect(map.stateOf(BORDEAUX, "places", "france.bordeaux.medoc")).toEqual({});
    for (const call of map.calls) {
      if (call.op !== "remove") continue;
      expect(["sel", "child", "rel"]).toContain(call.key);
    }
  });

  it("after any run of selections across shards and countries, exactly the current one is flagged", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX, TOSCANA]);
    // The handoff's flags on two world regions, one per source-layer.
    const handed: Target[] = [
      { source: WORLD, sourceLayer: "places", id: "bourgogne" },
      { source: WORLD, sourceLayer: "labels", id: "bordeaux" },
    ];
    for (const target of handed) map.setFeatureState(target, { handed: true });
    const sync = new MapStateSync(map);
    const run = [
      "france.bourgogne",
      VOSNE,
      "france.bordeaux.medoc",
      "italy.toscana.chianti",
      "france",
      null,
      `${VOSNE}.la-tache`,
      "italy",
      "france.bourgogne.cote-de-beaune.meursault",
      "france.bordeaux",
      "italy.toscana",
      "france.bourgogne.cote-de-nuits",
      null,
    ];
    for (const key of run) {
      const next = snapshot(key);
      sync.setDesired(next);
      // Nothing from an earlier selection lingers on any source, the new
      // selection's sources or any other.
      expect(map.selectionFlags(), `after ${key}`).toEqual(expectedFlags(map, next.selection));
      for (const target of handed) {
        expect(map.stateOf(target.source, target.sourceLayer, target.id).handed, `handed after ${key}`).toBe(true);
      }
    }
    for (const call of map.calls) {
      if (call.op !== "remove") continue;
      expect(["sel", "child", "rel"]).toContain(call.key);
    }
  });

  it("never removes a key from a feature with no state: a re-created source, then a rebuilt style", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(VOSNE));
    // Unmount + remount: the new Bourgogne source has no feature-state, and
    // the selection then moves within Bourgogne.
    map.recreateSource(BOURGOGNE);
    expect(() => sync.setDesired(snapshot("france.bourgogne.cote-de-beaune.meursault"))).not.toThrow();
    // A full rebuild: every source new, every record gone; then it moves again.
    map.startRebuild();
    map.land();
    const last = snapshot("france.bordeaux.medoc");
    expect(() => sync.setDesired(last)).not.toThrow();
    expect(map.violations).toEqual([]);
    expect(map.selectionFlags()).toEqual(expectedFlags(map, last.selection));
  });

  it("a shard that mounts after the selection gets its flags when its metadata lands", () => {
    const map = new FakeMap([WORLD]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(VOSNE));
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({});
    map.addSource(BOURGOGNE);
    map.fire("sourcedata", { sourceId: BOURGOGNE, sourceDataType: "content" });
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({});
    map.fire("sourcedata", { sourceId: BOURGOGNE, sourceDataType: "metadata" });
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({ sel: true });
  });

  it("a shard that unmounts and remounts gets its flags again", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(VOSNE));
    map.recreateSource(BOURGOGNE);
    sync.apply();
    expect(map.stateOf(BOURGOGNE, "labels", VOSNE)).toEqual({ sel: true });
  });

  it("a shard unmounted during a run of selections comes back with only the current one's flags", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(VOSNE));
    map.removeSource(BOURGOGNE);
    sync.setDesired(snapshot("france.bourgogne.cote-de-beaune.meursault"));
    const current = snapshot("france.bourgogne.cote-de-nuits");
    sync.setDesired(current);
    map.addSource(BOURGOGNE);
    map.fire("sourcedata", { sourceId: BOURGOGNE, sourceDataType: "metadata" });
    expect(map.selectionFlags()).toEqual(expectedFlags(map, current.selection));
    expect(map.stateOf(BOURGOGNE, "places", "france.bourgogne.cote-de-nuits")).toEqual({ sel: true });
  });

  it("resets a depth flag that drops out of the snapshot to false, so a stale true never lingers", () => {
    const map = new FakeMap([WORLD]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(null, { deepCountries: ["france", "italy"] }));
    expect(map.getGlobalState().wm_deep_italy).toBe(true);
    // desiredGlobalState omits a country that is neither known nor deep.
    const next = snapshot(null, { knownCountries: ["france"] });
    expect("wm_deep_italy" in next.global).toBe(false);
    sync.setDesired(next);
    expect(map.getGlobalState().wm_deep_italy).toBe(false);
    expect(globals(map).filter((c) => c.name === "wm_deep_italy").map((c) => c.value)).toEqual([true, false]);
    // Reset once, not again on every later pass.
    sync.setDesired(snapshot(VOSNE, { knownCountries: ["france"] }));
    sync.apply();
    expect(globals(map).filter((c) => c.name === "wm_deep_italy")).toHaveLength(2);
  });

  it("resets any other name it wrote that the snapshot stops carrying to null", () => {
    const map = new FakeMap([WORLD]);
    const sync = new MapStateSync(map);
    const first = snapshot(null);
    sync.setDesired({ ...first, global: { ...first.global, wm_tick: 1 } });
    expect(map.getGlobalState().wm_tick).toBe(1);
    sync.setDesired(snapshot(null));
    expect(map.getGlobalState().wm_tick).toBeNull();
    expect(globals(map).filter((c) => c.name === "wm_tick").map((c) => c.value)).toEqual([1, null]);
  });

  it("a dropped depth flag that is already false is not written again", () => {
    const map = new FakeMap([WORLD]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(null));
    expect(map.getGlobalState().wm_deep_italy).toBe(false);
    sync.setDesired(snapshot(null, { knownCountries: ["france"] }));
    expect(map.getGlobalState().wm_deep_italy).toBe(false);
    expect(globals(map).filter((c) => c.name === "wm_deep_italy")).toHaveLength(1);
  });

  it("a reset that throws is retried, not forgotten", () => {
    const map = new FakeMap([WORLD]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(null, { deepCountries: ["france", "italy"] }));
    map.loaded = false;
    expect(() => sync.setDesired(snapshot(null, { knownCountries: ["france"] }))).not.toThrow();
    expect(map.getGlobalState().wm_deep_italy).toBe(true);
    map.loaded = true;
    sync.apply();
    expect(map.getGlobalState().wm_deep_italy).toBe(false);
  });

  it("never throws out of apply() or the style.load listener", () => {
    const boom = () => {
      throw new Error("boom");
    };
    const listeners = new Map<string, Listener>();
    const map: SyncMap = {
      get style(): object {
        throw new Error("boom");
      },
      getGlobalState: boom,
      setGlobalStateProperty: boom,
      getSource: boom,
      setFeatureState: boom,
      removeFeatureState: boom,
      on: (type, fn) => listeners.set(type, fn),
      off: (type) => listeners.delete(type),
    };
    const sync = new MapStateSync(map);
    expect(() => sync.setDesired(snapshot(VOSNE))).not.toThrow();
    expect(() => sync.apply()).not.toThrow();
    expect(() => listeners.get("style.load")!()).not.toThrow();
    expect(() => listeners.get("sourcedata")!({ sourceId: BOURGOGNE, sourceDataType: "metadata" })).not.toThrow();
  });

  it("dispose() removes its listeners and stops writing", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    const sync = new MapStateSync(map);
    expect(map.listenerCount()).toBe(4);
    sync.dispose();
    expect(map.listenerCount()).toBe(0);
    sync.setDesired(snapshot(VOSNE));
    map.fire("style.load");
    expect(map.calls).toEqual([]);
  });
});
