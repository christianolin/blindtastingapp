// Region shards, mounted imperatively (spec 2026-09-23 §6).
//
// react-map-gl's <Source>/<Layer> go through map.addSource/map.addLayer, and
// both ALWAYS run Style._validate, which serializes the WHOLE style for every
// call — so mounting 40-67 shards on the first zoom past z5 cost a 1.2-1.5 s
// long task, growing with the square of the style. Style.addSource/addLayer
// take {validate:false}; with the small per-shard expressions that took the
// same 67 shards to 13 ms. What the runtime no longer validates is validated
// at build time instead (shard-layer-specs.test.ts).
//
// The rules this class keeps, each one a failure the review found:
//  - Truth comes from the map. Whether a shard is mounted is read from
//    getSource/getLayer and the layer order on every run, never from private
//    bookkeeping, so StrictMode double effects, a second controller on the
//    same map and a full style rebuild all converge on the same answer.
//  - A shard is added in ONE synchronous step (source + fills + outlines +
//    labels). A source without its layers reads as "loaded" and would hand
//    the world copy off to an empty shard.
//  - A shard that throws is rolled back completely — including a layer
//    MapLibre inserted before throwing, which would otherwise fault every
//    frame on its missing source — marked failed, logged once and never
//    retried this visit; the world archive keeps drawing its region.
//  - So is a shard whose archive cannot be read (blocked, 404, offline).
//    MapLibre marks such a source errored and then reports it LOADED, which
//    would hand its region over to a shard with nothing to draw.
//  - Nothing runs while the style is not loaded: in the frame after a full
//    rebuild map.style is a new, unloaded Style, and addSource would throw.
//    onStyleRebuilt (from the style.load listener) resumes.
//  - World layers stay below every shard layer (an invisible handed-off world
//    label above a shard label would win the collision and blank it), and the
//    selected place's casing, ring and label stay above everything.
//  - Adds are budgeted per animation frame (8 ms): all 67 fit in one frame on
//    a desktop, a slow phone spreads them over a few.
//  - After a batch, one setGlobalStateProperty(wm_tick, 1): Style.* writes do
//    not mark the map dirty, and that public call always runs _update(true)
//    while reloading nothing (no layer reads wm_tick).
import type { MapPalette } from "./map-palette";
import type { SyncMap } from "./map-state-sync";
import { GS } from "./map-state";
import { SHARD_SOURCE_PREFIX, shardSourceId } from "./basemap";
import {
  shardLayerIds,
  shardLayerSpecs,
  shardOverlayIds,
  shardOverlaySpecs,
  type ShardSpecInputs,
} from "./shard-specs";

type NoValidate = { validate: false };
const NO_VALIDATE: NoValidate = { validate: false };

type ControllerStyle = {
  addSource(id: string, spec: unknown, o: NoValidate): void;
  addLayer(spec: unknown, before: string | undefined, o: NoValidate): void;
  setPaintProperty(layer: string, name: string, value: unknown, o: NoValidate): void;
  setFilter(layer: string, filter: unknown, o: NoValidate): void;
};

/** The slice of a MapLibre map the controller drives. `style` is the live
    Style (replaced on a full rebuild); removals and moves go through the
    public map methods, which mark the map dirty themselves. */
export type ControllerMap = SyncMap & {
  style: ControllerStyle | undefined;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
  removeSource(id: string): unknown;
  moveLayer(id: string, before?: string): unknown;
  getLayersOrder(): string[];
};

export type ShardDesired = {
  /** Shards that should be mounted (mountedShards). Keys with no url, or that
      failed earlier this visit, are skipped. */
  keys: readonly string[];
  /** Shard key -> archive URL (manifest.shards[key].url, no protocol). */
  urls: Readonly<Record<string, string>>;
  /** The selected place's shard: added first, and owner of the overlays. */
  selectedShard: string | null;
  /** Read at add time and on every run, so a shard added from a queued batch
      after a theme flip or the tree landing is built from the current
      inputs, never the ones current when it was queued. */
  inputs: (key: string) => ShardSpecInputs;
  /** The landed theme's palette, for the overlays. */
  palette: MapPalette;
};

/** Added only once react-map-gl has created the world layers, so every shard
    layer lands above them. */
const WORLD_ANCHOR_LAYER = "world-labels";
const WORLD_LAYER_PREFIX = "world-";
/** The world layers bottom to top, as TileWineMap declares them. Their order
    among themselves matters too: world-selected-label must stay directly
    above world-labels, so the selected copy is placed first and wins its
    collision (D4). */
const WORLD_ORDER: readonly string[] = [
  "world-fills",
  "world-outlines",
  "world-region-fills",
  "world-region-outlines",
  "world-selected-casing",
  "world-selected-ring",
  "world-labels",
  "world-selected-label",
];
const SHARD_LAYER_PREFIX = "shard-";
const OVERLAY_PREFIX = "shard-selected-";
const BASE_LAYER_ID = /^shard-(?:fills|outlines|labels)-(.+)$/;
const OVERLAY_LAYER_ID = /^shard-selected-(?:casing|ring|label)-(.+)$/;
const DEFAULT_BUDGET_MS = 8;

function isNotLoaded(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Style is not done loading");
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((value, i) => value === b[i]));
}

export class ShardController {
  private readonly map: ControllerMap;
  private readonly now: () => number;
  private readonly raf: (cb: () => void) => number;
  private readonly cancelRaf: (handle: number) => void;
  private readonly budgetMs: number;
  private desired: ShardDesired | null = null;
  /** The Style object last seen loaded; any other object is mid-rebuild. */
  private readyStyle: object | undefined;
  private frame: number | null = null;
  private disposed = false;
  /** Set by any Style.* write in the current run; one wm_tick per run. */
  private wrote = false;
  private readonly failed = new Set<string>();
  private readonly overlaysFailed = new Set<string>();
  /** The inputs each mounted shard's paint and filters were written from. */
  private readonly applied = new Map<string, ShardSpecInputs>();
  private appliedOverlay: { key: string; palette: MapPalette } | null = null;
  private readonly logged = new Set<string>();
  private readonly onStyleData = () => {
    if (this.desired) this.schedule();
  };
  // An archive whose header cannot be read leaves an errored source, which
  // MapLibre reports as loaded: the readiness latch would hide the region's
  // world copy over a shard with nothing to draw. Such a shard goes the way
  // of one that threw. A single tile's error carries `tile` and is left to
  // MapLibre; the basemap's and the world source's errors are not ours.
  private readonly onError = (event: unknown) => {
    const e = event as { sourceId?: unknown; tile?: unknown } | undefined;
    if (!e || e.tile !== undefined || typeof e.sourceId !== "string") return;
    if (!e.sourceId.startsWith(SHARD_SOURCE_PREFIX)) return;
    const key = e.sourceId.slice(SHARD_SOURCE_PREFIX.length);
    if (this.failed.has(key)) return;
    this.failed.add(key);
    console.error(
      `[wine-map] shard "${key}" could not be loaded and is skipped for this visit; the world map keeps drawing its region.`,
    );
    // The next run removes what is left of it (it is no longer a target).
    this.schedule();
  };

  /** Construct from onLoad (the style is loaded then). */
  constructor(
    map: ControllerMap,
    opts: {
      now?: () => number;
      raf?: (cb: () => void) => number;
      cancelRaf?: (handle: number) => void;
      budgetMs?: number;
    } = {},
  ) {
    this.map = map;
    this.now = opts.now ?? (() => performance.now());
    this.raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancelRaf = opts.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
    this.budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
    this.readyStyle = map.style;
    // react-map-gl creates the world layers in a render after the style loads,
    // and may re-create one on top (StrictMode, Fast Refresh): every style
    // change fires styledata, and a run is cheap when there is nothing to do.
    map.on("styledata", this.onStyleData);
    map.on("error", this.onError);
  }

  setDesired(next: ShardDesired): void {
    this.desired = next;
    this.schedule();
  }

  /** Mounted with all three base layers, and not failed. What the handoff's
      readiness latch asks before it hides a region's world copy. */
  isAdded(key: string): boolean {
    if (this.failed.has(key)) return false;
    try {
      return this.present(key);
    } catch {
      return false;
    }
  }

  /** From the style.load listener: the landed style is the ready one again.
      After a full rebuild (a new Style object) every shard's paint and
      filters are rewritten once; on the usual diff path (same object, shard
      layers carried over verbatim) the next run only re-checks, and the
      landed palette arrives through setDesired. Either way whatever is
      missing is re-added on the next frame. Never throws — a throw in a
      style.load listener turns a good theme diff into a full rebuild. */
  onStyleRebuilt(): void {
    try {
      const style = this.map.style;
      if (style !== this.readyStyle) {
        this.readyStyle = style;
        this.reapplyPaint();
      } else {
        this.schedule();
      }
    } catch (error) {
      this.logOnce("rebuilt", error);
    }
  }

  /** Rewrite every mounted shard's paint and filters (and the overlays'),
      whatever was last applied. setDesired already rewrites exactly the
      shards whose inputs changed; this is the unconditional version. */
  reapplyPaint(): void {
    this.applied.clear();
    this.appliedOverlay = null;
    this.schedule();
  }

  /** Stops scheduling and listening. Leaves the layers alone: this runs on
      unmount, and map.remove() disposes of them with the style. */
  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) this.cancelRaf(this.frame);
    this.frame = null;
    try {
      this.map.off("styledata", this.onStyleData);
      this.map.off("error", this.onError);
    } catch {
      // The map is already gone.
    }
  }

  private schedule(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.raf(() => {
      this.frame = null;
      this.run();
    });
  }

  private loadedStyle(): ControllerStyle | null {
    const style = this.map.style;
    if (!style || style !== this.readyStyle) return null;
    // react-maplibre's own guard (source.ts, layer.ts). A missing field (a
    // fake, or a rename) reads as loaded; identity above still covers the
    // rebuild window.
    if ((style as { _loaded?: unknown })._loaded === false) return null;
    return style;
  }

  private present(key: string): boolean {
    const ids = shardLayerIds(key);
    return Boolean(
      this.map.getSource(shardSourceId(key)) &&
        this.map.getLayer(ids.fills) &&
        this.map.getLayer(ids.outlines) &&
        this.map.getLayer(ids.labels),
    );
  }

  /** Selected shard first (it carries the ring), then alphabetical — the
      order the JSX mounted them in, so border label collisions resolve as
      before. */
  private targetKeys(d: ShardDesired): string[] {
    const keys = [...new Set(d.keys)]
      .filter((key) => d.urls[key] !== undefined && !this.failed.has(key))
      .sort((a, b) => a.localeCompare(b));
    const selected = d.selectedShard;
    if (selected === null || !keys.includes(selected)) return keys;
    return [selected, ...keys.filter((key) => key !== selected)];
  }

  private run(): void {
    const d = this.desired;
    if (this.disposed || !d) return;
    const style = this.loadedStyle();
    if (!style) return;
    this.wrote = false;
    try {
      if (!this.map.getLayer(WORLD_ANCHOR_LAYER)) return;
      const target = this.targetKeys(d);
      const wanted = new Set(target);
      const base = new Set<string>();
      const owners = new Set<string>();
      for (const id of this.map.getLayersOrder()) {
        const b = BASE_LAYER_ID.exec(id);
        if (b) base.add(b[1]);
        const o = OVERLAY_LAYER_ID.exec(id);
        if (o) owners.add(o[1]);
      }
      // Removals are immediate and unbudgeted: they are cheap, and an
      // off-screen shard's layers cost every frame until they go.
      for (const key of base) if (!wanted.has(key)) this.removeShard(key);
      const owner = d.selectedShard !== null && wanted.has(d.selectedShard) ? d.selectedShard : null;
      for (const key of owners) if (key !== owner) this.removeOverlays(key);
      if (owner !== null && this.present(owner)) this.ensureOverlays(style, owner, d.palette);

      const start = this.now();
      let units = 0;
      for (const key of target) {
        if (units > 0 && this.now() - start >= this.budgetMs) {
          this.schedule();
          break;
        }
        if (this.present(key)) {
          const inputs = d.inputs(key);
          const was = this.applied.get(key);
          const paint = !was || was.palette !== inputs.palette || was.ramp !== inputs.ramp ||
            !sameList(was.areaSlugs, inputs.areaSlugs);
          const filter = !was || was.country !== inputs.country;
          if (!paint && !filter) continue;
          this.rewrite(style, key, d.urls[key], inputs, { paint, filter });
        } else if (this.addShard(style, key, d) && key === owner) {
          this.ensureOverlays(style, owner, d.palette);
        }
        units += 1;
      }
      this.keepWorldBelow();
    } catch (error) {
      // Not loaded after all: style.load -> onStyleRebuilt resumes.
      if (!isNotLoaded(error)) this.logOnce("run", error);
    } finally {
      if (this.wrote) this.tick();
    }
  }

  private addShard(style: ControllerStyle, key: string, d: ShardDesired): boolean {
    const inputs = d.inputs(key);
    const specs = shardLayerSpecs(key, d.urls[key], inputs);
    try {
      // Leftovers of a half-present shard; nothing to do in the normal case.
      this.removeShard(key);
      this.wrote = true;
      style.addSource(specs.sourceId, specs.source, NO_VALIDATE);
      if (!this.map.getSource(specs.sourceId)) throw new Error(`${specs.sourceId} was not added`);
      const before = this.firstOverlayId();
      for (const layer of specs.layers) {
        style.addLayer(layer, before, NO_VALIDATE);
        // A refused layer fires an error event rather than throwing.
        if (!this.map.getLayer(layer.id)) throw new Error(`${layer.id} was not added`);
      }
      this.applied.set(key, inputs);
      return true;
    } catch (error) {
      // Not this shard's fault: stop the run and let style.load resume it.
      if (isNotLoaded(error)) throw error;
      this.removeShard(key);
      this.failed.add(key);
      console.error(
        `[wine-map] shard "${key}" could not be added and is skipped for this visit; the world map keeps drawing its region.`,
        error,
      );
      return false;
    }
  }

  private rewrite(
    style: ControllerStyle,
    key: string,
    url: string,
    inputs: ShardSpecInputs,
    what: { paint: boolean; filter: boolean },
  ): void {
    this.wrote = true;
    try {
      for (const layer of shardLayerSpecs(key, url, inputs).layers) {
        if (what.paint) {
          for (const [name, value] of Object.entries(layer.paint ?? {})) {
            style.setPaintProperty(layer.id, name, value, NO_VALIDATE);
          }
        }
        if (what.filter && "filter" in layer && layer.filter !== undefined) {
          style.setFilter(layer.id, layer.filter, NO_VALIDATE);
        }
      }
    } catch (error) {
      if (isNotLoaded(error)) throw error;
      this.logOnce(`rewrite:${key}`, error);
    }
    // Recorded even after a failure, so a bad value is not retried every frame.
    this.applied.set(key, inputs);
  }

  private ensureOverlays(style: ControllerStyle, key: string, palette: MapPalette): void {
    if (this.overlaysFailed.has(key)) return;
    const specs = shardOverlaySpecs(key, palette);
    if (specs.every((layer) => this.map.getLayer(layer.id))) {
      const was = this.appliedOverlay;
      if (was && was.key === key && was.palette === palette) return;
      this.wrote = true;
      try {
        for (const layer of specs) {
          for (const [name, value] of Object.entries(layer.paint ?? {})) {
            style.setPaintProperty(layer.id, name, value, NO_VALIDATE);
          }
        }
      } catch (error) {
        if (isNotLoaded(error)) throw error;
        this.logOnce(`overlay-paint:${key}`, error);
      }
      this.appliedOverlay = { key, palette };
      return;
    }
    try {
      this.removeOverlays(key);
      this.wrote = true;
      // Appended: the top of the style, above every shard added so far and,
      // through firstOverlayId, every shard added later.
      for (const layer of specs) {
        style.addLayer(layer, undefined, NO_VALIDATE);
        if (!this.map.getLayer(layer.id)) throw new Error(`${layer.id} was not added`);
      }
      this.appliedOverlay = { key, palette };
    } catch (error) {
      if (isNotLoaded(error)) throw error;
      this.removeOverlays(key);
      this.overlaysFailed.add(key);
      console.error(`[wine-map] the selection ring for shard "${key}" could not be added.`, error);
    }
  }

  /** Overlays first, then labels, outlines, fills, and the source last: a
      source cannot go while a layer still reads it. */
  private removeShard(key: string): void {
    this.removeOverlays(key);
    const ids = shardLayerIds(key);
    for (const id of [ids.labels, ids.outlines, ids.fills]) this.removeLayer(id);
    const source = shardSourceId(key);
    try {
      if (this.map.getSource(source)) {
        this.map.removeSource(source);
        this.wrote = true;
      }
    } catch (error) {
      if (isNotLoaded(error)) throw error;
      this.logOnce(`remove:${source}`, error);
    }
    this.applied.delete(key);
  }

  private removeOverlays(key: string): void {
    const ids = shardOverlayIds(key);
    for (const id of [ids.label, ids.ring, ids.casing]) this.removeLayer(id);
    if (this.appliedOverlay?.key === key) this.appliedOverlay = null;
  }

  private removeLayer(id: string): void {
    try {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
        this.wrote = true;
      }
    } catch (error) {
      if (isNotLoaded(error)) throw error;
      this.logOnce(`remove:${id}`, error);
    }
  }

  private firstOverlayId(): string | undefined {
    return this.map.getLayersOrder().find((id) => id.startsWith(OVERLAY_PREFIX));
  }

  /** Puts every world layer back below the first shard layer, in
      WORLD_ORDER. react-map-gl appends a re-created world layer at the very
      top, and moving only that one would land a re-created world-labels
      ABOVE world-selected-label, handing the selected name's collision to
      its ordinary copy. So from the lowest misplaced layer in WORLD_ORDER
      upward, every world layer that exists is moved, in that order, to just
      below the first shard layer; a misplaced world id WORLD_ORDER does not
      know follows them. */
  private keepWorldBelow(): void {
    const order = this.map.getLayersOrder();
    const first = order.findIndex((id) => id.startsWith(SHARD_LAYER_PREFIX));
    if (first < 0) return;
    const misplaced = order.slice(first + 1).filter((id) => id.startsWith(WORLD_LAYER_PREFIX));
    if (misplaced.length === 0) return;
    const ranks = misplaced.map((id) => WORLD_ORDER.indexOf(id)).filter((rank) => rank >= 0);
    const from = ranks.length > 0 ? Math.min(...ranks) : WORLD_ORDER.length;
    const present = new Set(order);
    const moves = [
      ...WORLD_ORDER.slice(from).filter((id) => present.has(id)),
      ...misplaced.filter((id) => !WORLD_ORDER.includes(id)),
    ];
    // Each move lands directly under the first shard layer, so moving them
    // bottom to top leaves them in that order.
    for (const id of moves) this.map.moveLayer(id, order[first]);
  }

  private tick(): void {
    try {
      this.map.setGlobalStateProperty(GS.tick, 1);
    } catch (error) {
      if (!isNotLoaded(error)) this.logOnce("tick", error);
    }
  }

  private logOnce(tag: string, error: unknown): void {
    if (this.logged.has(tag)) return;
    this.logged.add(tag);
    console.error(`[wine-map] shard controller: ${tag}`, error);
  }
}
