"use client";

// `?debugPerf=1`: a small overlay on the map card that measures the map where
// it actually runs — the owner's iPhone included, where there is no DevTools
// timeline. A live readout (worst frame and hitches over the last 10 s, long
// tasks where the browser reports them), and **Run test**, which plays the
// fixed gesture script (lib/wine-map/perf-stats PROBE_SCRIPT) on the real map
// and tabulates each gesture; **Copy results** puts the run on the clipboard as
// JSON with the device facts that make two runs comparable.
//
// TileWineMap loads this (next/dynamic, its own chunk) and renders it only
// when the query parameter is present, so nothing here is downloaded or runs
// — no rAF loop, no observer, no wrapper — for anyone else.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  deltasBetween,
  frameStats,
  gestureMetrics,
  installReloadCounter,
  longTaskEntryType,
  PROBE_IDLE_TIMEOUT_MS,
  PROBE_SCRIPT,
  PROBE_SETTLE_MS,
  selectionLanded,
  selectIsNoop,
  sourcesReloaded,
  trimToWindow,
  waitForIdle,
  waitForSettled,
  type FrameSample,
  type GestureMetrics,
  type ProbeSelection,
  type ProbeStep,
  type TaskSample,
} from "@/lib/wine-map/perf-stats";

// The live readout covers the last 10 s. Samples are kept longer so a slow
// gesture (up to the 20 s idle timeout) never loses its first frames.
const LIVE_WINDOW_MS = 10_000;
const KEEP_MS = PROBE_IDLE_TIMEOUT_MS + LIVE_WINDOW_MS;
const READOUT_EVERY_MS = 500;

// `reloadsCounted` false: `reloads` is not a measurement of this gesture —
// the reload counter could not hook this MapLibre, or the step was a
// selection of the key already selected (`alreadySelected`: not played, the
// explorer would have ignored it). Shown as "n/a" / "no-op", never as 0.
// `idleWaits`: how many map idles the row waited through before it settled
// (a selection whose place context arrives after the first idle takes two).
type Row = GestureMetrics & {
  name: string;
  timedOut: boolean;
  alreadySelected: boolean;
  idleWaits: number;
  reloadsCounted: boolean;
  reloadedSources: string[];
};

function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = (left: number) => {
      if (left === 0) resolve();
      else requestAnimationFrame(() => tick(left - 1));
    };
    tick(count);
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playStep(
  map: MapLibreMap,
  step: ProbeStep,
  onSelect: (key: string, source?: "map" | "ui") => void,
) {
  // `essential`: under prefers-reduced-motion MapLibre would otherwise jump
  // instead of animating, and the run would measure a different gesture.
  switch (step.kind) {
    case "jump":
      map.jumpTo({ center: step.center, zoom: step.zoom });
      return;
    case "ease":
      map.easeTo({ center: step.center, zoom: step.zoom, duration: step.durationMs, essential: true });
      return;
    case "fly":
      map.flyTo({ center: step.center, zoom: step.zoom, duration: step.durationMs, essential: true });
      return;
    case "select":
      // "map" source: the explorer never moves the camera for a map-originated
      // selection, so this measures the selection's own paint and reload cost
      // at every canvas size — the tree's path differs only by a possible fly.
      onSelect(step.key, "map");
      return;
  }
}

const ms = (value: number | null) => (value === null ? "n/a" : String(Math.round(value)));

export function PerfProbe({
  getMap,
  onSelect,
  selectedKey,
  contextKey,
}: {
  /** The live MapLibre instance (react-map-gl's MapRef.getMap()), or null
      before the map exists. */
  getMap: () => MapLibreMap | null;
  onSelect: (key: string, source?: "map" | "ui") => void;
  /** The explorer's selected key. */
  selectedKey: string | null;
  /** The key of the place whose context (the selection fallback: its
      children and parent) has arrived; lags selectedKey while a new
      selection's context loads. */
  contextKey: string | null;
}) {
  const framesRef = useRef<FrameSample[]>([]);
  const tasksRef = useRef<TaskSample[]>([]);
  // The latest props, refreshed after every commit. A run is one long async
  // loop, so it reads onSelect and the selection through this ref at the
  // moment it needs them: the onSelect it started with is the explorer's
  // select() closed over the selection BEFORE step 5, and calling that for
  // step 6 would hit its same-key early return and measure nothing.
  const latestRef = useRef<{ onSelect: typeof onSelect; selection: ProbeSelection }>({
    onSelect,
    selection: { selectedKey, contextKey },
  });
  useEffect(() => {
    latestRef.current = { onSelect, selection: { selectedKey, contextKey } };
  });
  // Whether the probe is still mounted, and how to stop the run in progress:
  // an unmount (leaving the page, the map's error boundary remounting it)
  // stops the run between steps and puts the reload counter back at once.
  const lifeRef = useRef<{ alive: boolean; stop: (() => void) | null }>({
    alive: true,
    stop: null,
  });
  useEffect(() => {
    const life = lifeRef.current;
    life.alive = true;
    return () => {
      life.alive = false;
      life.stop?.();
    };
  }, []);
  // Read once: the entry types never change within a page load.
  const [taskApi] = useState(() =>
    longTaskEntryType(
      typeof PerformanceObserver === "undefined"
        ? []
        : (PerformanceObserver.supportedEntryTypes ?? []),
    ),
  );
  const [live, setLive] = useState({ worst: 0, over50: 0, tasks: null as number | null });
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Every frame interval, continuously.
  useEffect(() => {
    let handle = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) framesRef.current.push({ at: now, delta: now - last });
      last = now;
      trimToWindow(framesRef.current, now, KEEP_MS);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  // Long tasks / long animation frames, where the browser reports them.
  useEffect(() => {
    if (!taskApi) return;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          tasksRef.current.push({ at: entry.startTime, duration: entry.duration });
        }
        trimToWindow(tasksRef.current, performance.now(), KEEP_MS);
      });
      observer.observe({ type: taskApi, buffered: false });
    } catch {
      // An observer the browser refuses just means no long-task column.
      observer = null;
    }
    return () => observer?.disconnect();
  }, [taskApi]);

  // The live readout.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const stats = frameStats(deltasBetween(framesRef.current, now - LIVE_WINDOW_MS, now));
      setLive({
        worst: stats.worst,
        over50: stats.over50,
        tasks: taskApi
          ? tasksRef.current.filter((t) => t.at >= now - LIVE_WINDOW_MS).length
          : null,
      });
    }, READOUT_EVERY_MS);
    return () => window.clearInterval(id);
  }, [taskApi]);

  const run = useCallback(async () => {
    const life = lifeRef.current;
    const map = getMap();
    if (!map) {
      setNote("The map is not ready yet.");
      return;
    }
    setRunning(true);
    setRows([]);
    setReport(null);
    setShowReport(false);
    setNote(null);
    const notes: string[] = [];
    const addNote = (text: string) => {
      notes.push(text);
      setNote(notes.join(" "));
    };

    const reloads = installReloadCounter(map);
    // Every frame the map draws — with the reload count, the "something is
    // still happening" signal that keeps a row open (waitForSettled).
    let renders = 0;
    const onRender = () => {
      renders += 1;
    };
    map.on("render", onRender);
    // Resolves an idle wait in progress at once when the run stops, so an
    // unmount does not leave the loop waiting out the 20 s timeout first.
    let abortWait: () => void = () => {};
    const aborted = new Promise<{ timedOut: boolean }>((resolve) => {
      abortWait = () => resolve({ timedOut: true });
    });
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      abortWait();
      map.off("render", onRender);
      reloads.restore();
    };
    life.stop = stop;

    if (!reloads.hooked()) {
      addNote("No reload counts: this MapLibre has no Style#_reloadSource.");
    }
    const done: Row[] = [];
    try {
      for (const step of PROBE_SCRIPT) {
        if (!life.alive) return;
        const alreadySelected =
          step.kind === "select" && selectIsNoop(latestRef.current.selection, step.key);
        if (alreadySelected) {
          addNote(`${step.name}: already selected, so that row measures nothing.`);
        }
        const reloadsBefore = reloads.count();
        const sourcesBefore = reloads.bySource();
        const from = performance.now();
        if (!alreadySelected) playStep(map, step, latestRef.current.onSelect);
        // Two frames so the camera is moving (or React has committed the
        // selection) before listening for idle — otherwise the idle of the
        // frame before the gesture could end it at once.
        await frames(2);
        if (!life.alive) return;
        const settled = await waitForSettled(
          {
            waitIdle: (timeoutMs) => Promise.race([waitForIdle(map, timeoutMs), aborted]),
            // A selection is only done once its own place context is in:
            // that context supplies the selection fallback (its children and
            // parent), which can move the emphasis a second time — after a
            // network round trip.
            landed: () =>
              step.kind !== "select" ||
              alreadySelected ||
              selectionLanded(latestRef.current.selection, step.key),
            activity: () => renders + reloads.count(),
            quiet: () => map.loaded(),
            pause,
            now: () => performance.now(),
          },
          { timeoutMs: PROBE_IDLE_TIMEOUT_MS, settleMs: PROBE_SETTLE_MS },
        );
        if (!life.alive) return;
        // A settled row already waited PROBE_SETTLE_MS after its idle, which
        // gave the long-task observer time to deliver; a timed-out one not.
        if (settled.timedOut) await pause(PROBE_SETTLE_MS);
        done.push({
          name: step.name,
          timedOut: settled.timedOut,
          alreadySelected,
          idleWaits: settled.idles,
          reloadsCounted: !alreadySelected && reloads.hooked(),
          reloadedSources: sourcesReloaded(sourcesBefore, reloads.bySource()),
          ...gestureMetrics({
            frames: framesRef.current,
            tasks: taskApi ? tasksRef.current : null,
            from,
            to: settled.to,
            reloads: reloads.count() - reloadsBefore,
          }),
        });
        setRows([...done]);
      }
      const canvas = map.getCanvas();
      setReport(
        JSON.stringify(
          {
            ranAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
            devicePixelRatio: window.devicePixelRatio,
            canvas: { width: canvas.clientWidth, height: canvas.clientHeight },
            cores: navigator.hardwareConcurrency ?? null,
            longTaskApi: taskApi,
            gestures: done,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      // The phone has no console: a failure has to show up on the overlay.
      if (life.alive) {
        addNote(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      stop();
      if (life.stop === stop) life.stop = null;
      if (life.alive) setRunning(false);
    }
  }, [getMap, taskApi]);

  const copy = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setNote("Copied.");
    } catch {
      // Clipboard refused (permissions, an old WebKit): show the JSON so it
      // can be selected by hand.
      setNote("Copy failed — select the text below.");
      setShowReport(true);
    }
  }, [report]);

  return (
    <div className="absolute left-2 top-[112px] z-10 w-[300px] max-w-[calc(100%-1rem)] rounded-md border border-border bg-background/90 p-2 text-[11px] leading-tight text-foreground shadow-sm backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Perf probe</span>
        <span className="tabular-nums text-muted-foreground">
          10 s: worst {ms(live.worst)} ms · &gt;50 ms {live.over50} · long{" "}
          {live.tasks ?? "n/a"}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded border border-border px-2 py-0.5 font-medium disabled:opacity-50"
        >
          {running ? "Running…" : "Run test"}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!report}
          className="rounded border border-border px-2 py-0.5 font-medium disabled:opacity-50"
        >
          Copy results
        </button>
      </div>
      <p className="mt-1 text-muted-foreground">
        Cold numbers: run once per page load, before touching the map.
      </p>
      {note ? <p className="mt-1 text-muted-foreground">{note}</p> : null}
      {rows.length > 0 ? (
        <table className="mt-1.5 w-full tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-normal">Gesture</th>
              <th className="text-right font-normal">Worst</th>
              <th className="text-right font-normal">&gt;50</th>
              <th className="text-right font-normal">&gt;100</th>
              <th className="text-right font-normal">Long</th>
              <th className="text-right font-normal">Idle</th>
              <th className="text-right font-normal">Rel.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="pr-1">{row.name}</td>
                <td className="text-right">{ms(row.worst)}</td>
                <td className="text-right">{row.over50}</td>
                <td className="text-right">{row.over100}</td>
                <td className="text-right">
                  {row.longTasks === null ? "n/a" : `${row.longTasks} (${ms(row.worstTask)})`}
                </td>
                <td className="text-right">
                  {ms(row.toIdle)}
                  {row.timedOut ? "+" : ""}
                </td>
                <td className="text-right">
                  {row.alreadySelected ? "no-op" : row.reloadsCounted ? row.reloads : "n/a"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {report && showReport ? (
        <textarea
          readOnly
          value={report}
          className="mt-1.5 h-24 w-full rounded border border-border bg-background p-1 font-mono text-[10px]"
        />
      ) : null}
    </div>
  );
}
