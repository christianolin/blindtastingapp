// The one writer of the wine map's global state and selection feature-state
// (spec docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §5.3). React never calls setGlobalStateProperty or setFeatureState itself:
// every change lands in the desired snapshot first, and one idempotent apply()
// reconciles the map with it.
//
// Why one writer, and why a snapshot rather than a queue of writes:
//  - Writes throw while the style is not loaded ("Style is not done
//    loading."), which is the case between the map's creation and Carto's
//    style.json landing — exactly when a cold ?place= deep link resolves — and
//    again for a frame after MapLibre's full-rebuild fallback (a theme diff
//    that failed), when map.style is a brand-new, unloaded Style. A throw from
//    a React effect would take the page down.
//  - That rebuild starts with EMPTY global state and fresh sources (feature
//    state gone), while React's values have not changed, so nothing would
//    re-send them. Re-applying the whole snapshot on every style.load
//    restores them; on the ordinary diff path the style and sources survive
//    and apply() finds nothing to do.
//  - The readiness flag is cleared on `styledataloading` and set on `load` /
//    `style.load`. Never map.isStyleLoaded(): it is false whenever a tile is
//    loading, including straight after our own write reloads a source.
//
// Writes are skipped when unchanged: a global-state value against what this
// style last took (by reference) and then against map.getGlobalState() (deep),
// feature-state against what this source object last took. A rebuilt style or
// a re-created source is a new object, so both records reset with it.
// A global-state name this sync wrote that a later snapshot no longer carries
// is reset — a `wm_deep_*` flag to false, any other name to null — so a stale
// `true` never lingers in the map.
// Selection flags are only ever removed BY NAME, on every source that held
// them (not just the new selection's): the world source also carries the
// handoff's `handed` flag, which a key-less removeFeatureState would wipe.
import { deepStateName, type DesiredGlobalState } from "./map-state";
import type { SelectionFlags, SelectionStates } from "./selection-state";

type FeatureTarget = { source: string; sourceLayer: string; id: string };

export type SyncMap = {
  style: object | undefined;
  getGlobalState(): Record<string, unknown>;
  setGlobalStateProperty(name: string, value: unknown): unknown;
  getSource(id: string): unknown;
  setFeatureState(target: FeatureTarget, state: Record<string, unknown>): unknown;
  removeFeatureState(target: FeatureTarget, key?: string): unknown;
  on(type: string, fn: (...a: unknown[]) => void): unknown;
  off(type: string, fn: (...a: unknown[]) => void): unknown;
};

// Every wine source carries both source-layers, and a place's polygon and its
// label share one promoted id.
const SOURCE_LAYERS = ["places", "labels"] as const;
const FLAGS = ["sel", "child", "rel"] as const;

/** Structural equality for the JSON-shaped values global state holds.
    null and undefined differ, as they do in MapLibre's own deepEqual: an
    explicit null must still be written over a never-set name. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  const bRecord = b as Record<string, unknown>;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue((a as Record<string, unknown>)[key], bRecord[key]),
  );
}

const DEEP_PREFIX = deepStateName("");

/** What a name goes back to once the snapshot stops carrying it: a depth flag
    to an explicit false (not deep), anything else to null. */
function resetValue(name: string): false | null {
  return name.startsWith(DEEP_PREFIX) ? false : null;
}

type AppliedSource = { source: unknown; states: Map<string, SelectionFlags> };

export class MapStateSync {
  private readonly map: SyncMap;
  private desired: { global: DesiredGlobalState; selection: SelectionStates } = {
    global: {},
    selection: new Map(),
  };
  // Constructed from onLoad, when the style has loaded; a write that throws
  // anyway is caught and retried on the next apply().
  private ready = true;
  private disposed = false;
  private appliedStyle: object | undefined = undefined;
  private readonly appliedGlobal = new Map<string, unknown>();
  private readonly appliedSelection = new Map<string, AppliedSource>();

  private readonly onStyleLoading = () => {
    this.ready = false;
  };
  // Synchronous, inside the event: a style.load listener that throws turns a
  // successful theme diff into MapLibre's full rebuild, so apply() must not.
  private readonly onStyleLoaded = () => {
    this.ready = true;
    this.apply();
  };
  // A shard source that mounted after the last apply() (or was re-created)
  // gets its bucket once its metadata lands. Once per source load, and a
  // no-op diff when nothing is missing.
  private readonly onSourceData = (event: unknown) => {
    try {
      const e = event as { sourceDataType?: string; sourceId?: string } | undefined;
      if (e?.sourceDataType !== "metadata" || !e.sourceId) return;
      if (this.desired.selection.has(e.sourceId)) this.apply();
    } catch {
      // A listener must never throw into MapLibre's event loop.
    }
  };

  constructor(map: SyncMap) {
    this.map = map;
    map.on("styledataloading", this.onStyleLoading);
    map.on("style.load", this.onStyleLoaded);
    map.on("load", this.onStyleLoaded);
    map.on("sourcedata", this.onSourceData);
  }

  setDesired(next: { global: DesiredGlobalState; selection: SelectionStates }): void {
    this.desired = next;
    this.apply();
  }

  /** Idempotent and never throws. */
  apply(): void {
    if (this.disposed || !this.ready) return;
    try {
      const style = this.map.style;
      if (!style) return;
      if (style !== this.appliedStyle) {
        this.appliedStyle = style;
        this.appliedGlobal.clear();
        this.appliedSelection.clear();
      }
      this.applyGlobal();
      this.applySelection();
    } catch {
      // Not loaded after all, or a source vanished mid-pass. Whatever was not
      // recorded as applied is retried by the next apply() or style.load.
    }
  }

  dispose(): void {
    this.disposed = true;
    this.map.off("styledataloading", this.onStyleLoading);
    this.map.off("style.load", this.onStyleLoaded);
    this.map.off("load", this.onStyleLoaded);
    this.map.off("sourcedata", this.onSourceData);
  }

  private applyGlobal() {
    const wanted = this.desired.global;
    const current = this.map.getGlobalState();
    for (const [name, value] of Object.entries(wanted)) {
      if (this.appliedGlobal.has(name) && this.appliedGlobal.get(name) === value) continue;
      if (!(name in current) || !sameValue(current[name], value)) {
        this.map.setGlobalStateProperty(name, value);
      }
      this.appliedGlobal.set(name, value);
    }
    // A name this sync wrote that the snapshot no longer carries is reset
    // rather than keeping a stale value: desiredGlobalState omits a country's
    // depth flag once that country is neither known nor deep, and a `true`
    // left behind would keep its shards at full depth.
    for (const name of [...this.appliedGlobal.keys()]) {
      if (name in wanted) continue;
      const reset = resetValue(name);
      if (!(name in current) || !sameValue(current[name], reset)) {
        this.map.setGlobalStateProperty(name, reset);
      }
      this.appliedGlobal.delete(name);
    }
  }

  private applySelection() {
    const wanted = this.desired.selection;
    for (const sourceId of new Set([...wanted.keys(), ...this.appliedSelection.keys()])) {
      const source = this.map.getSource(sourceId);
      if (!source) {
        // Not mounted (or unmounted): its feature-state went with it. Sent in
        // full once the source exists.
        this.appliedSelection.delete(sourceId);
        continue;
      }
      const record = this.appliedSelection.get(sourceId);
      const before = record && record.source === source ? record.states : new Map<string, SelectionFlags>();
      const after = wanted.get(sourceId) ?? new Map<string, SelectionFlags>();
      for (const [id, flags] of before) {
        const keep = after.get(id);
        for (const name of FLAGS) {
          if (!flags[name] || keep?.[name]) continue;
          for (const sourceLayer of SOURCE_LAYERS) {
            this.map.removeFeatureState({ source: sourceId, sourceLayer, id }, name);
          }
        }
      }
      for (const [id, flags] of after) {
        const had = before.get(id);
        const add: Record<string, true> = {};
        for (const name of FLAGS) if (flags[name] && !had?.[name]) add[name] = true;
        if (Object.keys(add).length === 0) continue;
        for (const sourceLayer of SOURCE_LAYERS) {
          this.map.setFeatureState({ source: sourceId, sourceLayer, id }, add);
        }
      }
      if (after.size > 0) this.appliedSelection.set(sourceId, { source, states: after });
      else this.appliedSelection.delete(sourceId);
    }
  }
}
