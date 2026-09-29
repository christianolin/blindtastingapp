"use client";

// The training room's likelihood map (training-room-map spec RM11-RM25): a
// lean MapLibre map of the typical wines, one dot each, coloured and sized by
// how close each is RELATIVE TO THE LEADER, with the list's own % on the
// three best spots (more from z7, and on hover). Never TileWineMap: no
// pmtiles, no manifest, no shards, no explorer state — a basemap and one
// GeoJSON source. Its own chunk, loaded only through ./training-map-loader
// (the slot's React.lazy, and the warm-up), mounted only while the Map view is
// open, and imported only from under src/app/taste/training/ (RM1).
//
// Contracts it keeps:
// - Theme (RM21, CLAUDE.md "never pass a changing mapStyle"): `mapStyle` is
//   frozen at mount in a useState initializer — the cached tuned style when
//   the warm-up filled it, else the URL, which onLoad then tunes with
//   basemapTweaks. A flip calls setStyle(style, { diff: true, validate: false,
//   transformStyle: withWineLayers(prev, tuneBasemapStyle(next)) }), which
//   carries the wine-training source and its two layers across unchanged
//   (basemap.ts's isWineSourceId knows the id); the paint follows the style
//   that LANDED (style.load), as the explorer's paintTheme does.
// - Data (RM16): one setData per animation frame at most, and only when the
//   features' fingerprint changed; nothing while the map is not loaded
//   (onLoad adds the source with the latest features).
// - Camera (RM17): follows the fit set CAMERA_SETTLE_MS after its membership
//   last changed, until the viewer first moves the map (a movestart carrying
//   an originalEvent, the explorer's own test); then "Fit to the closest"
//   appears and the camera never moves by itself. Reduced motion: instant.
// - Failure (RM22): a lost WebGL context, or react-maplibre's start-up path
//   (onError with target null: no WebGL, or its own import("maplibre-gl")
//   rejected — a stale tab after a deploy), reports onStopped with the error,
//   and the slot tells a chunk error (only a reload helps) from a map that
//   could not start; any other error on a running map is logged and nothing
//   else happens.
// - Its first-load cost (spec §12): the chunk imports no module the room's
//   first load owns (panel.ts, use-media.ts, candidates-panel.tsx…) — a shared
//   module made the bundler split it out of the room's own and grow the load.
// - Gestures (RM20): no rotation or pitch; maplibre-gl.css supplies the
//   canvas's touch-action: none.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MapGL, { NavigationControl, type MapRef } from "react-map-gl/maplibre";
import type { Map as MaplibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Dark-theme dressing for MapLibre's own controls; must follow maplibre-gl.css.
import "../../knowledge/map/map-chrome.css";
import { Eyebrow } from "@/components/overview/eyebrow";
import { themeOfRoot, useRenderedTheme } from "@/lib/rendered-theme";
import type { Theme } from "@/lib/theme";
import { MAP_COPY } from "@/lib/training/map-copy";
import {
  CAMERA_SETTLE_MS,
  DOT_LAYOUT,
  EUROPE_BOX,
  FIT_MAX_ZOOM,
  FIT_PADDING,
  HIT_SLOP_PX,
  LABEL_FILTER,
  cameraKey,
  cameraTarget,
  chooserOrder,
  closestSpots,
  dotPaint,
  featuresFingerprint,
  hoverLabel,
  labelLayout,
  labelPaint,
  noAnswersYet,
  shouldAutoFit,
  tooltipPosition,
  trainingFeatures,
  unmappedCandidates,
  type Bbox,
  type DotCollection,
} from "@/lib/training/map-view";
import {
  BASEMAP_STYLE_URL,
  TRAINING_SOURCE_ID,
  basemapTweaks,
  cachedBasemapStyle,
  loadBasemapStyle,
  tuneBasemapStyle,
  withWineLayers,
} from "@/lib/wine-map/basemap";
import { installHoverCursor } from "@/lib/wine-map/hover-cursor";
import { MAP_PALETTES } from "@/lib/wine-map/map-palette";
import { cn } from "@/lib/utils";
import { MapDetailPopover, selectedMapIds, type MapTarget } from "./map-popover";
import type { MapOpenRequest, TrainingMapLayout, TrainingMapProps, VirtualAnchor } from "./map-types";
import { TrainingMapLegend } from "./training-map-legend";

const DOTS_LAYER = "training-dots";
const LABELS_LAYER = "training-labels";
const DEV = process.env.NODE_ENV !== "production";
// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

type Target = { box: Bbox; maxZoom: number };

/** The warm-up's basemap half (RM24): TrainingRoom calls it once this chunk
    has loaded on intent (a pointer on, or focus in, the Map tab), so a first
    open finds the style in module memory. One shared request per theme. */
export function warmBasemap(): Promise<unknown> {
  return loadBasemapStyle(themeOfRoot(document.documentElement));
}

/** Read once, at the moment it matters (a tap, a fit, the hover install). */
function mediaMatches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** The map box (spec §6.2, §6.3): on the laptop column a height that keeps the
    whole panel inside the aside with no scroll; in the sheet whatever the
    sheet's 88dvh leaves, but never under 240 px (RM20 calls a map under 200 px
    unusable; on an iPhone SE the rows under it scroll instead). map-types.ts's
    MAP_BOX_ANY is the loading placeholder's copy of these, by breakpoint. */
const MAP_BOX: Record<TrainingMapLayout, string> = {
  column: "h-[clamp(240px,calc(100dvh-380px),520px)] w-full",
  sheet: "min-h-[240px] w-full flex-1",
};

/** A screen point inside `container`, read when the popover asks (it closes on any camera move). */
function pointAnchor(container: HTMLElement, x: number, y: number): VirtualAnchor {
  return {
    getBoundingClientRect: () => {
      const r = container.getBoundingClientRect();
      return new DOMRect(r.left + x, r.top + y, 0, 0);
    },
    contextElement: container,
  };
}

function toBounds(box: Bbox): [[number, number], [number, number]] {
  return [
    [box[0], box[1]],
    [box[2], box[3]],
  ];
}

/** Adds the dots' source and layers when missing (the first load, or a full
    style rebuild), else repaints them in `theme`'s palette. */
function ensureLayers(map: MaplibreMap, theme: Theme, data: DotCollection) {
  const palette = MAP_PALETTES[theme];
  if (!map.getSource(TRAINING_SOURCE_ID)) {
    map.addSource(TRAINING_SOURCE_ID, {
      type: "geojson",
      data,
      promoteId: "id",
    });
  }
  if (!map.getLayer(DOTS_LAYER)) {
    map.addLayer({
      id: DOTS_LAYER,
      type: "circle",
      source: TRAINING_SOURCE_ID,
      layout: DOT_LAYOUT,
      paint: dotPaint(palette),
    });
  } else {
    for (const [name, value] of Object.entries(dotPaint(palette) ?? {})) map.setPaintProperty(DOTS_LAYER, name, value);
  }
  if (!map.getLayer(LABELS_LAYER)) {
    map.addLayer({
      id: LABELS_LAYER,
      type: "symbol",
      source: TRAINING_SOURCE_ID,
      filter: LABEL_FILTER,
      layout: labelLayout(),
      paint: labelPaint(palette),
    });
  } else {
    for (const [name, value] of Object.entries(labelPaint(palette) ?? {}))
      map.setPaintProperty(LABELS_LAYER, name, value);
  }
}

const NONE: readonly string[] = [];

export function TrainingMap({
  ranked,
  layout,
  popover: popoverUi,
  selectedIds: sheetSelected = NONE,
  onOpen,
  onStopped,
}: TrainingMapProps) {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const disposeHoverRef = useRef<(() => void) | null>(null);

  // The latest props, for listeners registered once in onLoad.
  // --- The laptop popover (RM18): the map's own, so it goes with the map ----
  const [popover, setPopover] = useState<MapTarget | null>(null);
  const byId = useMemo(() => new Map(ranked.map((r) => [r.candidate.id, r] as const)), [ranked]);
  // The column rings what its popover shows; the sheet, what the sheet shows.
  const selectedIds = layout === "column" ? selectedMapIds(popover) : sheetSelected;

  const latest = useRef({
    ranked,
    selectedIds,
    onOpen,
    onStopped,
  });
  useEffect(() => {
    latest.current = { ranked, selectedIds, onOpen, onStopped };
  });

  // --- Theme (RM21) ---------------------------------------------------------
  const theme = useRenderedTheme();
  // Frozen at mount, NEVER recomputed: once the warm-up or a flip fills the
  // cache, a recomputed value would change from the URL to the object and
  // react-map-gl would setStyle it with no transformStyle, dropping our source.
  const [mountStyle] = useState<StyleSpecification | string>(
    () => cachedBasemapStyle(theme) ?? BASEMAP_STYLE_URL[theme],
  );
  const [paintTheme, setPaintTheme] = useState<Theme>(theme);
  const requestedRef = useRef<Theme>(theme);
  const landingRef = useRef<Theme>(theme);
  const latestThemeRef = useRef<Theme>(theme);
  const swap = useCallback((next: Theme) => {
    const map = mapRef.current?.getMap();
    if (!map || !readyRef.current || requestedRef.current === next) return;
    requestedRef.current = next;
    const apply = (style: StyleSpecification | string) => {
      // A newer flip, or an unmount, while the style was fetched: stale.
      if (requestedRef.current !== next || mapRef.current?.getMap() !== map) return;
      map.setStyle(style, {
        diff: true,
        validate: false,
        transformStyle: (prev, incoming) => {
          landingRef.current = next;
          return withWineLayers(prev, tuneBasemapStyle(incoming));
        },
      });
    };
    const cached = cachedBasemapStyle(next);
    if (cached) {
      apply(cached);
      return;
    }
    // A failed fetch hands MapLibre the URL: it fails as it always did (an
    // `error` event, no style.load), and the map stays wholly on its old theme.
    loadBasemapStyle(next).then(apply, () => apply(BASEMAP_STYLE_URL[next]));
  }, []);
  useEffect(() => {
    latestThemeRef.current = theme;
    swap(theme);
  }, [theme, swap]);

  // --- Data (RM16) ----------------------------------------------------------
  // The latest features (what onLoad and a style rebuild add) and the
  // fingerprint of what the source holds now.
  const featuresRef = useRef<DotCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const shownRef = useRef<string>("");
  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    // The §12 budget: features + fingerprint ≤ 2 ms p95, read in a dev build
    // as the "training-map:data" performance measure.
    const t0 = performance.now();
    const features = trainingFeatures(ranked);
    const fingerprint = featuresFingerprint(features);
    if (DEV)
      performance.measure("training-map:data", {
        start: t0,
        end: performance.now(),
      });
    featuresRef.current = features;
    const map = mapRef.current?.getMap();
    if (!map || !readyRef.current || fingerprint === shownRef.current) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const source = map.getSource(TRAINING_SOURCE_ID);
      if (!source || !("setData" in source)) return;
      const data = featuresRef.current;
      (source as { setData(d: DotCollection): unknown }).setData(data);
      shownRef.current = featuresFingerprint(data);
    });
  }, [ranked]);

  // --- Selection: the open detail's dots wear the gold ring (RM14) ----------
  const selectedRef = useRef<Set<string>>(new Set());
  const applySelection = useCallback((map: MaplibreMap, ids: readonly string[]) => {
    if (!map.getSource(TRAINING_SOURCE_ID)) return;
    const next = new Set(ids);
    for (const id of selectedRef.current) {
      if (!next.has(id)) map.removeFeatureState({ source: TRAINING_SOURCE_ID, id }, "selected");
    }
    for (const id of next) map.setFeatureState({ source: TRAINING_SOURCE_ID, id }, { selected: true });
    selectedRef.current = next;
  }, []);
  const selectedKey = selectedIds.join(",");
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && readyRef.current) applySelection(map, latest.current.selectedIds);
  }, [selectedKey, applySelection]);

  // --- Camera (RM17) --------------------------------------------------------
  const [mountTarget] = useState<Target>(() => cameraTarget(ranked) ?? { box: EUROPE_BOX, maxZoom: FIT_MAX_ZOOM });
  const camKey = useMemo(() => cameraKey(ranked), [ranked]);
  const camKeyRef = useRef(camKey);
  const followedKeyRef = useRef(camKey);
  const changedAtRef = useRef(0);
  const userMovedRef = useRef(false);
  const [userMoved, setUserMoved] = useState(false);
  const target = useMemo(() => cameraTarget(ranked), [ranked]);
  const fitTo = useCallback((next: Target | null) => {
    const map = mapRef.current?.getMap();
    if (!map || !readyRef.current || !next) return;
    map.fitBounds(toBounds(next.box), {
      padding: FIT_PADDING,
      maxZoom: next.maxZoom,
      duration: mediaMatches("(prefers-reduced-motion: reduce)") ? 0 : 500,
    });
  }, []);
  useEffect(() => {
    camKeyRef.current = camKey;
    if (camKey === followedKeyRef.current) return;
    changedAtRef.current = performance.now();
    if (userMovedRef.current) return;
    // A little past the settle window, so the pure rule below never sees a
    // timer that fired a hair early by the other clock.
    const id = window.setTimeout(() => {
      if (
        !shouldAutoFit({
          userMoved: userMovedRef.current,
          membershipChangedAt: changedAtRef.current,
          now: performance.now(),
        })
      )
        return;
      if (!readyRef.current) return; // onLoad catches up
      followedKeyRef.current = camKeyRef.current;
      fitTo(cameraTarget(latest.current.ranked));
    }, CAMERA_SETTLE_MS + 20);
    return () => window.clearTimeout(id);
  }, [camKey, fitTo]);

  // --- Hover tooltip (RM15), fine pointers only ------------------------------
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  // Placed once it has a size: centred above the pointer, clamped inside the
  // map box (whose overflow clip would otherwise cut a name or % in half).
  const tipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const box = containerRef.current;
    if (!tooltip || !tip || !box) return;
    const { left, top } = tooltipPosition(
      tooltip,
      { width: tip.offsetWidth, height: tip.offsetHeight },
      { width: box.clientWidth, height: box.clientHeight },
    );
    // Before paint, so it never shows at the box's corner first.
    tip.style.transform = `translate(${left}px, ${top}px)`;
  }, [tooltip]);

  // --- Open a detail or a chooser (RM18) -------------------------------------
  const open = useCallback(
    (request: MapOpenRequest) => {
      if (layout === "column") setPopover({ ...request, chosen: null });
      else latest.current.onOpen?.(request);
    },
    [layout],
  );
  const openAt = useCallback((hitIds: readonly string[], returnFocus?: HTMLElement) => {
    const map = mapRef.current?.getMap();
    const container = containerRef.current;
    const wines = chooserOrder(hitIds, latest.current.ranked);
    if (!map || !container || wines.length === 0) return;
    const p = wines[0].candidate.mapPoint;
    const point = p ? map.project([p.lon, p.lat]) : null;
    const inside =
      point !== null &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= container.clientWidth &&
      point.y <= container.clientHeight;
    const request: MapOpenRequest = {
      ids: wines.map((w) => w.candidate.id),
      // The dot on screen; a spot scrolled out of view anchors to its button.
      anchor: inside ? pointAnchor(container, point.x, point.y) : (returnFocus ?? container),
      returnFocus: returnFocus ?? container,
    };
    open(request);
  }, [open]);

  useEffect(
    () => () => {
      disposeHoverRef.current?.();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      readyRef.current = false;
      if (DEV) delete (window as unknown as { __trainingMap?: unknown }).__trainingMap;
    },
    [],
  );

  const before = noAnswersYet(ranked);
  const spots = useMemo(() => closestSpots(ranked), [ranked]);
  const unmapped = useMemo(() => unmappedCandidates(ranked.map((r) => r.candidate)), [ranked]);
  const curated = useMemo(() => ranked.some((r) => r.candidate.mapPoint?.source === "curated"), [ranked]);

  return (
    <div className={cn("flex flex-col gap-2", layout === "sheet" && "min-h-0 flex-1")}>
      <div
        ref={containerRef}
        tabIndex={-1}
        role="group"
        aria-label={MAP_COPY.mapLabel}
        className={cn("relative overflow-hidden rounded-[10px] outline-none", MAP_BOX[layout])}
      >
        <span className="sr-only">{MAP_COPY.mapSrNote}</span>
        <MapGL
          ref={mapRef}
          mapStyle={mountStyle}
          initialViewState={{
            bounds: toBounds(mountTarget.box),
            fitBoundsOptions: {
              padding: FIT_PADDING,
              maxZoom: mountTarget.maxZoom,
            },
          }}
          dragRotate={false}
          touchPitch={false}
          pitchWithRotate={false}
          fadeDuration={0}
          onError={(e) => {
            // react-maplibre's start-up path has no map: target null. Its own
            // import("maplibre-gl") rejecting is a chunk error (only a reload
            // helps), anything else a map that could not start: the slot tells.
            if ((e.target as unknown) == null) {
              latest.current.onStopped(e.error);
              return;
            }
            console.error("[training-map]", e.error);
          }}
          onClick={(e) => {
            const map = e.target;
            if (!map.getLayer(DOTS_LAYER)) return;
            const s = mediaMatches("(pointer: coarse)") ? HIT_SLOP_PX.coarse : HIT_SLOP_PX.fine;
            const hits = map.queryRenderedFeatures(
              [
                [e.point.x - s, e.point.y - s],
                [e.point.x + s, e.point.y + s],
              ],
              { layers: [DOTS_LAYER] },
            );
            openAt(hits.map((f) => String(f.properties?.id ?? "")));
          }}
          onLoad={(e) => {
            const map = e.target;
            // MapLibre's compact attribution mounts expanded; collapse it.
            const details = map.getContainer().querySelector("details.maplibregl-ctrl-attrib");
            details?.classList.remove("maplibregl-compact-show");
            details?.removeAttribute("open");
            // Tunes a basemap mounted from the URL; a no-op on the cached,
            // already-tuned style (basemapTweaks lists only real changes).
            const tweaks = basemapTweaks(map.getStyle().layers ?? []);
            for (const id of tweaks.remove) map.removeLayer(id);
            for (const r of tweaks.zoomRanges) map.setLayerZoomRange(r.id, r.minzoom, r.maxzoom);
            map.touchZoomRotate.disableRotation();
            map.keyboard.disableRotation();
            // The latest ranking's dots, however long the map took to load.
            const features = trainingFeatures(latest.current.ranked);
            featuresRef.current = features;
            ensureLayers(map, landingRef.current, features);
            shownRef.current = featuresFingerprint(features);
            readyRef.current = true;
            applySelection(map, latest.current.selectedIds);
            map.on("style.load", () => {
              // Never throw from style.load: it turns a good diff into a rebuild.
              try {
                ensureLayers(map, landingRef.current, featuresRef.current);
                const ids = [...selectedRef.current];
                selectedRef.current = new Set();
                applySelection(map, ids);
              } catch (error) {
                console.error("[training-map] style.load", error);
              }
              setPaintTheme(landingRef.current);
            });
            map.on("webglcontextlost", () => latest.current.onStopped());
            map.on("movestart", (ev) => {
              setTooltip(null);
              if (ev.originalEvent && !userMovedRef.current) {
                userMovedRef.current = true;
                setUserMoved(true);
              }
              // Any camera move: the dot's point would drift under the popover.
              setPopover(null);
            });
            if (mediaMatches("(hover: hover) and (pointer: fine)")) {
              disposeHoverRef.current = installHoverCursor(map, {
                layers: () => [DOTS_LAYER],
                isClickable: (hits) => hits.length > 0,
                box: HIT_SLOP_PX.fine,
                onHover: (hits, point) => {
                  // The spot nearest the pointer, by its dot's point on screen.
                  const text = hoverLabel(
                    hits.map((f) => String(f.properties?.id ?? "")),
                    latest.current.ranked,
                    (p) => {
                      const at = map.project([p.lon, p.lat]);
                      return Math.hypot(at.x - point.x, at.y - point.y);
                    },
                  );
                  setTooltip((was) =>
                    text === null
                      ? null
                      : was && was.text === text && was.x === point.x && was.y === point.y
                        ? was
                        : { text, x: point.x, y: point.y },
                  );
                },
              });
            }
            // A flip, or a new fit set, that arrived while the map loaded.
            swap(latestThemeRef.current);
            if (camKeyRef.current !== followedKeyRef.current && !userMovedRef.current) {
              followedKeyRef.current = camKeyRef.current;
              fitTo(cameraTarget(latest.current.ranked));
            }
            if (DEV) (window as unknown as { __trainingMap?: MaplibreMap }).__trainingMap = map;
          }}
        >
          <NavigationControl position="top-right" showCompass={false} />
        </MapGL>
        {userMoved && target ? (
          <button
            type="button"
            onClick={() => {
              followedKeyRef.current = camKeyRef.current;
              fitTo(target);
            }}
            className={cn(
              "absolute top-2 left-2 z-10 rounded-full border border-border bg-background/90 px-3 text-[12px] font-semibold text-primary shadow-xs backdrop-blur-sm transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:py-1",
              TAP,
            )}
          >
            {MAP_COPY.fitClosest}
          </button>
        ) : null}
        {tooltip ? (
          <div
            ref={tipRef}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-10 w-max max-w-[220px] rounded-md bg-popover px-2 py-1 text-[12px] font-semibold text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {tooltip.text}
          </div>
        ) : null}
      </div>
      {/* In the sheet, what sits under the map scrolls on its own, so the map
          keeps its 240 px floor on a short phone (and with every name of an
          unplaced wine listed); the map itself is never inside a scroller. */}
      <div className={cn("flex flex-col gap-2", layout === "sheet" && "min-h-0 overflow-y-auto overscroll-contain")}>
        {spots.length > 0 ? (
          <div className="flex flex-col gap-1">
            <Eyebrow size="sm">{MAP_COPY.closestOnMap}</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {spots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => openAt(s.ids, e.currentTarget)}
                  className={cn(
                    "rounded-full border border-border bg-background px-2.5 text-[12px] font-semibold text-foreground transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:py-0.5",
                    TAP,
                  )}
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <TrainingMapLegend
          palette={MAP_PALETTES[paintTheme]}
          before={before}
          curated={curated}
          unmapped={unmapped}
          onOpenUnmapped={(id, button) => open({ ids: [id], anchor: button, returnFocus: button })}
        />
      </div>
      {layout === "column" && popoverUi ? (
        <MapDetailPopover
          ui={popoverUi.ui}
          target={popover}
          lookup={(id) => byId.get(id) ?? null}
          note={popoverUi.note}
          onChoose={(id) => setPopover((t) => (t ? { ...t, chosen: id } : t))}
          onClose={() => setPopover(null)}
        />
      ) : null}
    </div>
  );
}
