// The numbers behind the wine map's `?debugPerf=1` probe (perf-probe.tsx):
// frame and long-task statistics, the fixed gesture script, a counter of
// MapLibre source reloads, and an idle wait.
//
// The probe exists so the same measurement can be taken on the owner's own
// phone as on a desktop: WebKit (every iPhone browser) has neither the
// Long Tasks nor the Long Animation Frames API, so the frame intervals seen by
// requestAnimationFrame are the one signal every browser gives.
//
// Pure: no DOM and no maplibre value import. The map is reached through narrow
// structural types, so vitest drives the reload counter and the idle wait with
// fakes.

/** One requestAnimationFrame interval: `at` is the frame's timestamp, `delta`
    the time since the previous frame, both in performance.now() milliseconds. */
export type FrameSample = { at: number; delta: number };

/** One long task or long animation frame: `at` is its startTime. */
export type TaskSample = { at: number; duration: number };

export type FrameStats = {
  frames: number;
  worst: number;
  over50: number;
  over100: number;
  p95: number;
};

/** Frame-interval statistics. A 60 Hz frame is ~16.7 ms; over 50 ms is a
    visible hitch, over 100 ms the freeze the owner reported. p95 is the
    nearest-rank percentile, so it is always one of the measured intervals. */
export function frameStats(deltas: readonly number[]): FrameStats {
  if (deltas.length === 0) return { frames: 0, worst: 0, over50: 0, over100: 0, p95: 0 };
  const sorted = [...deltas].sort((a, b) => a - b);
  return {
    frames: deltas.length,
    worst: sorted[sorted.length - 1],
    over50: deltas.filter((delta) => delta > 50).length,
    over100: deltas.filter((delta) => delta > 100).length,
    p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
  };
}

/** The intervals of the frames that ENDED inside (from, to]. */
export function deltasBetween(
  frames: readonly FrameSample[],
  from: number,
  to: number,
): number[] {
  return frames.filter((f) => f.at > from && f.at <= to).map((f) => f.delta);
}

/** Drops samples older than `windowMs` before `now`, in place. Samples are
    pushed in time order, so the old ones are always at the front. */
export function trimToWindow(samples: { at: number }[], now: number, windowMs: number): void {
  let drop = 0;
  while (drop < samples.length && samples[drop].at < now - windowMs) drop += 1;
  if (drop > 0) samples.splice(0, drop);
}

/** Which long-task entry type to observe: Long Animation Frames where the
    browser has them (they include rendering, which is where a map spends its
    frame), else classic long tasks, else none (WebKit) — never both, which
    would count one stall twice. */
export function longTaskEntryType(
  supported: readonly string[],
): "long-animation-frame" | "longtask" | null {
  if (supported.includes("long-animation-frame")) return "long-animation-frame";
  if (supported.includes("longtask")) return "longtask";
  return null;
}

export type GestureMetrics = FrameStats & {
  /** Long tasks that overlapped the gesture; null where the browser has no
      long-task API. */
  longTasks: number | null;
  worstTask: number | null;
  /** From the gesture's start to the `idle` that settled it
      (waitForSettled). */
  toIdle: number;
  reloads: number;
};

/** A long task counts toward a gesture when it OVERLAPS (from, to], not only
    when it starts inside: a Long Animation Frame's startTime is the start of
    the first task in that frame, which for a selection is the very task that
    sampled `from` and then ran React's render and the setPaintProperty
    calls. A task that ends exactly at `from` does not count. */
export function gestureMetrics(input: {
  frames: readonly FrameSample[];
  tasks: readonly TaskSample[] | null;
  from: number;
  to: number;
  reloads: number;
}): GestureMetrics {
  const { frames, tasks, from, to, reloads } = input;
  const inside = tasks
    ? tasks.filter((t) => t.at + t.duration > from && t.at <= to)
    : null;
  return {
    ...frameStats(deltasBetween(frames, from, to)),
    longTasks: inside ? inside.length : null,
    worstTask: inside ? inside.reduce((worst, t) => Math.max(worst, t.duration), 0) : null,
    toIdle: to - from,
    reloads,
  };
}

/** The fixed gesture script, so runs stay comparable across phases and
    devices: the opening view, the first zoom past z5 (the owner's lag), a fly
    into Burgundy, a zoom to climat level, two selections, and back out.

    Two selections, because from Phase 1b on the first selection of a visit
    flips `wm_has_sel` from false to true, and every wine layer's paint reads
    it: MapLibre reloads EVERY mounted source for that one change (accepted,
    spec §5.2). The second selection, a sibling village in the same shard,
    is the steady-state cost A2 judges: at most `wine-world` plus the old and
    new selected shard. */
export type ProbeStep =
  | {
      name: string;
      kind: "jump" | "ease" | "fly";
      center: [number, number];
      zoom: number;
      durationMs: number;
    }
  | { name: string; kind: "select"; key: string };

const FRANCE: [number, number] = [2.4, 46.6];
const BOURGOGNE: [number, number] = [4.84, 47.05];
const VOSNE_ROMANEE: [number, number] = [4.955, 47.16];

export const PROBE_SCRIPT: readonly ProbeStep[] = [
  { name: "Open France z4.4", kind: "jump", center: FRANCE, zoom: 4.4, durationMs: 0 },
  { name: "First zoom to z5.5", kind: "ease", center: FRANCE, zoom: 5.5, durationMs: 1000 },
  { name: "Fly to Bourgogne z9", kind: "fly", center: BOURGOGNE, zoom: 9, durationMs: 1500 },
  { name: "Zoom to z13, Vosne", kind: "ease", center: VOSNE_ROMANEE, zoom: 13, durationMs: 1500 },
  { name: "Select Vosne-Romanée", kind: "select", key: "france.bourgogne.cote-de-nuits.vosne-romanee" },
  { name: "Select Gevrey-Chambertin", kind: "select", key: "france.bourgogne.cote-de-nuits.gevrey-chambertin" },
  { name: "Zoom out to z4.4", kind: "ease", center: FRANCE, zoom: 4.4, durationMs: 1500 },
];

/** A gesture that has not settled by then is recorded as timed out rather
    than hanging the run (a tile that never loads, a hidden tab, a place
    context that never arrives). One budget per gesture, across every idle
    wait waitForSettled makes. */
export const PROBE_IDLE_TIMEOUT_MS = 20_000;

/** How long the map must stay quiet after an `idle` before a gesture's row
    closes. It also gives the long-task observer, which delivers entries
    asynchronously, time to report the gesture's last frames. */
export const PROBE_SETTLE_MS = 250;

/** What the probe knows about the explorer's selection at the last commit:
    the selected key, and the key of the place whose context has arrived
    (that context supplies selectedId / selectedParentId, which the paint
    and label rules read). */
export type ProbeSelection = { selectedKey: string | null; contextKey: string | null };

/** Selecting the key that is already selected is a no-op in the explorer
    (its select() returns early), so that row would measure nothing — and
    with zero reloads it would pass A2 without measuring anything. The probe
    marks such a row instead of playing it. With the probe reading the
    current select() and selection at each step, it only happens when the
    selection is already on that key as the step starts: a page opened with
    `?place=` on Vosne-Romanée (step 5), or an earlier run that stopped
    right after step 5. */
export function selectIsNoop(selection: ProbeSelection, key: string): boolean {
  return selection.selectedKey === key;
}

/** A selection has fully landed once the selected place's OWN context is
    in. Until then selectedId / selectedParentId still describe the previous
    place (or nothing), and their arrival — after a network round trip —
    changes the paint a second time and reloads again. A place whose context
    never arrives (missing, or the request failed) therefore times out, shown
    with "+", rather than closing its row early. */
export function selectionLanded(selection: ProbeSelection, key: string): boolean {
  return selection.selectedKey === key && selection.contextKey === key;
}

/** The map, the clock and the gesture as waitForSettled needs them. */
export type SettleProbe = {
  /** Resolves at the map's next idle, or after `timeoutMs` (waitForIdle). */
  waitIdle(timeoutMs: number): Promise<{ timedOut: boolean }>;
  /** Whether the gesture's own effect is fully in. Always true for a camera
      step; selectionLanded for a selection. */
  landed(): boolean;
  /** A count that goes up on every map render and every source reload. */
  activity(): number;
  /** Nothing is loading: MapLibre's map.loaded(). */
  quiet(): boolean;
  pause(ms: number): Promise<void>;
  now(): number;
};

/**
 * Waits until a gesture has really finished, not just reached its first
 * `idle`. A row closes at an idle after which, for a whole `settleMs` window,
 * the gesture had landed (at the idle and still at the end), nothing rendered
 * or reloaded, and nothing was loading. Otherwise it waits for the next idle
 * and checks again — this is what catches a selection's second reload wave,
 * which starts only when its place context arrives from the network. All
 * waits share one `timeoutMs` budget. `to` is the time of the idle that
 * closed the row (or of giving up); `idles` how many idles it took.
 */
export async function waitForSettled(
  probe: SettleProbe,
  opts: { timeoutMs: number; settleMs: number },
): Promise<{ timedOut: boolean; to: number; idles: number }> {
  const deadline = probe.now() + opts.timeoutMs;
  let idles = 0;
  for (;;) {
    const left = deadline - probe.now();
    if (left <= 0) return { timedOut: true, to: probe.now(), idles };
    const { timedOut } = await probe.waitIdle(left);
    const to = probe.now();
    if (timedOut) return { timedOut: true, to, idles };
    idles += 1;
    const landedAtIdle = probe.landed();
    const mark = probe.activity();
    await probe.pause(opts.settleMs);
    if (landedAtIdle && probe.landed() && probe.activity() === mark && probe.quiet()) {
      return { timedOut: false, to, idles };
    }
  }
}

/** The map as the reload counter needs it: its current style object, and the
    `style.load` event that replaces that object on a full rebuild. */
export type ReloadCountable = {
  style?: unknown;
  on(type: string, listener: (...args: unknown[]) => void): unknown;
  off(type: string, listener: (...args: unknown[]) => void): unknown;
};

export type ReloadCounter = {
  count(): number;
  bySource(): Record<string, number>;
  /** Whether the style in use right now is wrapped. False on a MapLibre whose
      Style has no `_reloadSource` — the probe then shows "n/a", never a 0
      that would pass A2 without measuring anything. */
  hooked(): boolean;
  restore(): void;
};

type ReloadingStyle = { _reloadSource?: (this: unknown, id: string) => unknown };

/**
 * Counts MapLibre source reloads — every filter, layout or data-driven paint
 * change on a source's layers makes the style reload that source's tiles, and
 * that re-parse is the cost a selection or a grape pick pays. Wraps the
 * (internal) Style#_reloadSource, which MapLibre 5.24 calls as
 * `this._reloadSource(id)` from Style#update and the global-state path, and
 * re-wraps the new style after a full rebuild. Probe mode only; `restore`
 * puts every wrapped style back. maplibre-internals.test.ts fails if the
 * installed bundle stops calling it that way.
 */
export function installReloadCounter(map: ReloadCountable): ReloadCounter {
  const perSource = new Map<string, number>();
  let total = 0;
  const wrapped: {
    style: ReloadingStyle;
    own: boolean;
    original: (this: unknown, id: string) => unknown;
  }[] = [];
  const wrap = () => {
    const style = map.style as ReloadingStyle | undefined;
    if (!style || typeof style._reloadSource !== "function") return;
    if (wrapped.some((w) => w.style === style)) return;
    const original = style._reloadSource;
    const own = Object.prototype.hasOwnProperty.call(style, "_reloadSource");
    style._reloadSource = function (this: unknown, id: string) {
      total += 1;
      perSource.set(id, (perSource.get(id) ?? 0) + 1);
      return original.call(this, id);
    };
    wrapped.push({ style, own, original });
  };
  wrap();
  map.on("style.load", wrap);
  return {
    count: () => total,
    bySource: () => Object.fromEntries(perSource),
    hooked: () => wrapped.some((w) => w.style === map.style),
    restore() {
      map.off("style.load", wrap);
      for (const w of wrapped) {
        if (w.own) w.style._reloadSource = w.original;
        else delete w.style._reloadSource;
      }
      wrapped.length = 0;
    },
  };
}

/** The sources whose reload count went up between two bySource() readings. */
export function sourcesReloaded(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): string[] {
  return Object.keys(after)
    .filter((id) => after[id] > (before[id] ?? 0))
    .sort();
}

export type IdleWaitable = {
  on(type: string, listener: (...args: unknown[]) => void): unknown;
  off(type: string, listener: (...args: unknown[]) => void): unknown;
  triggerRepaint(): void;
};

/** Resolves at the map's next `idle` (camera still, every tile loaded,
    nothing pending), or after `timeoutMs` with timedOut. A map that is
    already idle fires no further `idle` until something renders, so this
    asks for one repaint. */
export function waitForIdle(
  map: IdleWaitable,
  timeoutMs: number,
): Promise<{ timedOut: boolean }> {
  return new Promise((resolve) => {
    const finish = (timedOut: boolean) => {
      map.off("idle", onIdle);
      clearTimeout(timer);
      resolve({ timedOut });
    };
    const onIdle = () => finish(false);
    map.on("idle", onIdle);
    const timer = setTimeout(() => finish(true), timeoutMs);
    map.triggerRepaint();
  });
}
