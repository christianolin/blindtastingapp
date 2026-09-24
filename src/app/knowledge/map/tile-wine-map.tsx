"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import maplibregl, { type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
// Dark-theme dressing for MapLibre's own controls; must follow maplibre-gl.css.
import "./map-chrome.css";
import type { WineMapManifest } from "@/lib/wine-map/manifest";
import { latchRampedRegions } from "@/lib/wine-map/fill-palette";
import {
  AREA_PALETTE_ZOOM,
  selectedLabelLayout,
  selectedLabelPaint,
  selectedPlaceFilter,
  selectionCasingPaint,
  selectionRingPaint,
  staticFillPaint,
  staticLabelLayout,
  staticLabelPaint,
  staticOutlinePaint,
  worldRegionColor,
  type ShardSpecInputs,
} from "@/lib/wine-map/shard-specs";
import { englishName } from "@/lib/wine-map/localize-names";
import {
  BASEMAP_STYLE_URL,
  basemapTweaks,
  cachedBasemapStyle,
  loadBasemapStyle,
  SHARD_SOURCE_PREFIX,
  shardSourceId,
  tuneBasemapStyle,
  withWineLayers,
  WORLD_SOURCE_ID,
} from "@/lib/wine-map/basemap";
import { desiredGlobalState, grapeGateExpression } from "@/lib/wine-map/map-state";
import { MapStateSync } from "@/lib/wine-map/map-state-sync";
import { bboxInView, latchReady } from "@/lib/wine-map/handoff";
import { selectionFeatureStates } from "@/lib/wine-map/selection-state";
import type { WinePlaceTreeNode } from "@/lib/wine-map/tree";
import { installHoverCursor } from "@/lib/wine-map/hover-cursor";
import { ShardController, type ShardDesired } from "@/lib/wine-map/shard-controller";
import {
  classificationShades,
  districtColor,
  MAP_PALETTES,
} from "@/lib/wine-map/map-palette";
import { useRenderedTheme } from "@/lib/rendered-theme";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// The basemap (Carto Positron in light, Dark Matter in dark) and its tweaks
// live in lib/wine-map/basemap; every colour the map canvas draws lives in
// lib/wine-map/map-palette, one fixed table per theme.

// maplibre keeps protocols globally; registering twice throws in dev
// (React strict mode double-mounts), so guard with a module flag.
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolRegistered = true;
}

export type CameraTarget = {
  bbox: [number, number, number, number];
  /** Never end below this — a small feature's reveal zoom, so it renders. */
  minZoom: number;
  maxZoom: number;
  /** Where the selection came from. A tap on the map itself never moves the
      camera (the tapped feature is by definition on screen — owner: mobile
      recenter-and-zoom-out on tap was "quite annoying"); only tree/search/
      details navigation may fly. */
  source: "map" | "ui";
};

// Display names for the legend, by region slug (the colours are in map-palette).
const REGION_LABELS: Record<string, string> = {
  france: "France",
  spain: "Spain",
  "castilla-y-leon": "Castilla y León",
  cataluna: "Cataluña",
  aragon: "Aragón",
  murcia: "Región de Murcia",
  andalucia: "Andalucía",
  galicia: "Galicia",
  valencia: "Comunidad Valenciana",
  "castilla-la-mancha": "Castilla-La Mancha",
  navarra: "Navarra",
  extremadura: "Extremadura",
  "la-rioja": "Rioja",
  "pais-vasco": "País Vasco",
  baleares: "Illes Balears",
  madrid: "Comunidad de Madrid",
  asturias: "Asturias",
  "languedoc-roussillon": "Languedoc-Roussillon",
  rhone: "Rhône",
  "sud-ouest": "Sud-Ouest",
  germany: "Germany",
  mosel: "Mosel",
  rheinhessen: "Rheinhessen",
  pfalz: "Pfalz",
  nahe: "Nahe",
  ahr: "Ahr",
  mittelrhein: "Mittelrhein",
  portugal: "Portugal",
  minho: "Minho",
  douro: "Douro",
  dao: "Dão",
  bairrada: "Bairrada",
  "peninsula-de-setubal": "Península de Setúbal",
  alentejo: "Alentejo",
  madeira: "Madeira",
};
// Diagnostic escape hatch: `?debugFills=off` on the map URL renders outlines
// and labels but no polygon fills. Fills are the only thing that stacks —
// a pixel deep in Burgundy sits under country + region + subregion +
// appellation + village + cru, each a translucent blend — so if the map is
// fragment-bound this one switch is the difference between crawling and
// smooth, and if FPS barely moves the bottleneck is somewhere else entirely.
// Off by default; nothing reads it unless the query param is present.
function fillsDisabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugFills") === "off";
}

// `?debugClick=1` logs what every click actually hits — zoom, which interactive
// layers exist on the style, and each feature returned — and puts the map on
// window.__wineMap. Added because "clicking does nothing" has been diagnosed
// wrong from source more than once; this turns it into one line of evidence.
function clickDebugEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugClick") === "1";
}

// `?debugPerf=1` shows the perf probe (perf-probe.tsx): a live worst-frame and
// long-task readout plus a scripted gesture run whose numbers can be copied off
// a phone. Off by default; nothing records or renders without the param.
function perfProbeEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugPerf") === "1";
}

// Its own chunk, client only: a visitor without the parameter never downloads
// the probe, only this loader.
const PerfProbe = dynamic(() => import("./perf-probe").then((m) => m.PerfProbe), {
  ssr: false,
});

// Share of the on-screen wine country a single country must account for before
// the map treats you as "viewing" it and reveals its subregions. Below this the
// frame spans several countries, so everything stays at region level.
const COUNTRY_FOCUS_SHARE = 0.6;

// Release threshold for that focus. Taking focus at 0.6 and dropping it at 0.6
// made a frame sitting near the boundary flip on every small drag, blinking
// every appellation in view. Keep focus until the leader falls well clear.
const COUNTRY_RELEASE_SHARE = 0.45;

// Resolution of the grid used to measure each country's share of the visible
// wine ground by UNION rather than by summing overlapping bboxes. 48x48 over a
// viewport is far finer than the bboxes it is measuring.
const FOCUS_GRID = 48;

// Below this zoom no region shard is mounted. Verified against the catalogue:
// every shard-only place has min_zoom >= 5, so beneath it a shard can only
// contribute its region outline/fill — which the world archive also carries.
// The map therefore opens (initialViewState is z4.4) without reading a single
// shard's pmtiles header, instead of opening all 54.
const SHARD_MIN_ZOOM = 5;

// MapLibre keeps 500 tiles by default across ALL sources; panning back over
// ground you just left re-fetches and re-decodes it. Raising this trades a few
// MB of memory for not re-doing that work.
const MAX_TILE_CACHE = 1500;

// Trailing debounce for the world->shard handoff's "which shards have loaded"
// reading. A zoom gesture fires a `sourcedata` event per tile per shard —
// dozens in a burst — and each used to recompute and set state on its own.
const READY_DEBOUNCE_MS = 100;

// Default for the areaSlugsByShard prop. A module constant, not a `= {}`
// default: a fresh object per render would re-key every memo below it on
// every render.
const NO_SLUGS_BY_SHARD: Record<string, string[]> = {};

// MapLibre rejects an `undefined` filter in addLayer (the layer then never
// mounts), which is why every wine filter below carries at least the grape
// gate. The same trap, one property over: react-map-gl feeds `layout`
// straight into addLayer, and MapLibre rejects `undefined` there — the layer is
// silently dropped, with no error and no console warning. Passing
// `layout={cond ? {...} : undefined}` therefore removed EVERY fill layer from
// the style whenever the condition was false, which is the normal case. Both
// states must be real objects.
const LAYER_VISIBLE = { visibility: "visible" } as const;
const LAYER_HIDDEN = { visibility: "none" } as const;

// Every wine layer's filter, layout and paint is static for the session
// (lib/wine-map/shard-specs). The grape filter, Local/English, the focus
// country's depth and the selection are MapLibre global state and
// feature-state, written by one MapStateSync (lib/wine-map/map-state-sync).
// Built once here; react-map-gl compares props by identity and then deep
// equality, so after a layer mounts none of these is ever re-sent.
type FillPaint = NonNullable<Extract<LayerSpecification, { type: "fill" }>["paint"]>;
type LinePaint = NonNullable<Extract<LayerSpecification, { type: "line" }>["paint"]>;
type SymbolPaint = NonNullable<Extract<LayerSpecification, { type: "symbol" }>["paint"]>;
type SymbolLayout = NonNullable<Extract<LayerSpecification, { type: "symbol" }>["layout"]>;
// Every world label; the grape gate is the only thing that ever narrows it.
const GRAPE_GATE = grapeGateExpression() as unknown as boolean;
// Tier 0 only — the country wash. It used to carry the grape gate too, which
// passes tier 0 unconditionally, so the gate never changed what it drew.
const WORLD_COUNTRY_FILTER = ["==", ["get", "tier"], 0] as unknown as boolean;
// Every region (tier >= 1), grape-gated. A handed-off region is zeroed by
// feature-state, not filtered.
const WORLD_REGION_FILTER = [
  "all",
  [">=", ["get", "tier"], 1],
  grapeGateExpression(),
] as unknown as boolean;
// The selected place only: its ring, its casing and its label.
const SELECTED_PLACE_FILTER = selectedPlaceFilter() as unknown as boolean;
const LABEL_LAYOUT = staticLabelLayout() as SymbolLayout;
const SELECTED_LABEL_LAYOUT = selectedLabelLayout() as SymbolLayout;

// Every colour a wine polygon paints comes from lib/wine-map/shard-specs: one
// colour expression per region shard (that shard's own region hue and area
// slugs, with the classification ramp as a per-shard constant; built by
// shardLayerSpecs when ShardController mounts the shard) and
// worldRegionColor for the world archive. District hues, their classification
// shades and the tint ramp live in lib/wine-map/map-palette, one fixed table
// per theme, keyed by the same slug hash so the fill expression's palette arms
// and the legend swatches cannot drift apart.
//
// Selection does not recolour a shape — places keep their true palette colour
// and selection reads as a gold outline ring drawn above everything (plus a
// slight opacity lift in the fill paint).
//
// The ramp is RELATIVE: it only applies where at least two classification
// levels exist — an all-grand-cru region like Alsace has nothing to be darker
// THAN, so its vineyards keep the plain area hue (owner: "darkest doesn't make
// sense there"). Which regions qualify is discovered once per session by the
// idle-time scan (latchRampedRegions), not re-decided per viewport.

export function TileWineMap({
  manifest,
  selectedKey,
  cameraTarget,
  onSelect,
  expanded,
  onToggleExpanded,
  visibleKeys = null,
  shardCountries = {},
  areaSlugsByShard = NO_SLUGS_BY_SHARD,
  english = false,
  selectedContextKey = null,
  tree = null,
  selectionFallback = null,
}: {
  manifest: WineMapManifest;
  selectedKey: string | null;
  /** The key of the place whose context the explorer has loaded. It lags
      selectedKey while a new selection's context is loading. Read only by the
      `?debugPerf=1` probe, to know when a selection has fully landed (the
      context can still move the emphasis, through selectionFallback). */
  selectedContextKey?: string | null;
  cameraTarget: CameraTarget | null;
  onSelect: (key: string, source?: "map" | "ui") => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** When non-null, only these canonical keys render (the country outline
      stays for context). Computed by the explorer's filters — grapes today,
      styles/designations later — so hiding needs no tile rebuild. */
  visibleKeys?: string[] | null;
  /** shard key (canonical_key segment 1) -> country slug, derived from the
      place tree. Lets the map show subregion-and-deeper detail for one country
      at a time; other countries stay at region level. Empty = no gating. */
  shardCountries?: Record<string, string>;
  /** shard key -> every `area_key`/`group` value that shard's tiles can
      carry, derived from the place tree (areaSlugsByShard). Each shard's fill
      palette is built from its own list once, so it never changes with the
      viewport. Empty until the tree loads: region hues only, as before the
      first scan. */
  areaSlugsByShard?: Record<string, string[]>;
  /** English-names toggle: relabels the map, legend and tree from the curated
      local->English dictionary (Italia->Italy, Toscana->Tuscany). Client-side
      only — no tile rebuild. */
  english?: boolean;
  /** The verified place tree, when it has loaded: the selection's children,
      siblings and parent for the map's emphasis (lib/wine-map/selection-state). */
  tree?: readonly WinePlaceTreeNode[] | null;
  /** The place context's children and parent, for the emphasis while the tree
      is missing; null when there is none for the current selection. */
  selectionFallback?: { childKeys: string[]; parentKey: string | null } | null;
}) {
  ensurePmtilesProtocol();
  const mapRef = useRef<MapRef>(null);
  // Mounts and unmounts the region shards (Phase 1c). Created in onLoad for
  // that map instance (recreated by an effect after a Fast Refresh), disposed
  // on unmount.
  const controllerRef = useRef<ShardController | null>(null);
  // Removes the hover cursor's mousemove listener; installed alongside.
  const disposeHoverRef = useRef<(() => void) | null>(null);

  // Dark mode. The map follows the theme <html> is rendering (its `dark`
  // class), live: Carto Dark Matter + the dark palette in dark, Positron + the
  // light palette in light, without a reload and without losing the camera,
  // selection, filters or Local/English choice.
  //
  // The basemap is swapped by swapBasemap below, NOT through react-map-gl's
  // mapStyle prop, which stays frozen at the theme the map was created with: a
  // changing mapStyle makes react-map-gl call setStyle(url, { diff: true })
  // with no transformStyle, and the diff against the bare Carto JSON removes
  // every wine source and layer (tile caches and feature-state with them).
  // swapBasemap's transformStyle carries them across unchanged instead, so the
  // diff touches the basemap alone (lib/wine-map/basemap, withWineLayers).
  //
  // D8 in the spec: the wine layers and the legend paint `paintTheme`, which
  // only moves once a swapped style has actually landed (`style.load`) — a
  // failed style fetch leaves the map wholly on its old theme rather than dark
  // wine colours on Positron. `styleEpoch` counts those landings so the handoff
  // effect re-sends its feature-state after each one.
  //
  // This is the only theme subscription in the map tree: the explorer, which
  // owns the manifest fetch, never re-renders on a theme flip.
  const theme = useRenderedTheme();
  const [initialTheme] = useState(theme);
  const [paintTheme, setPaintTheme] = useState<Theme>(theme);
  const [styleEpoch, setStyleEpoch] = useState(0);
  const palette = MAP_PALETTES[paintTheme];
  // The basemap last asked for, so a repeat request is a no-op; the one whose
  // style transformStyle was last applied, for the style.load that follows.
  const requestedBasemapRef = useRef<Theme>(theme);
  const landingBasemapRef = useRef<Theme>(theme);
  // The theme to catch up to if it changed before the map had loaded.
  const latestThemeRef = useRef<Theme>(theme);
  const mapReadyRef = useRef(false);
  const swapBasemap = useCallback((next: Theme) => {
    const map = mapRef.current?.getMap();
    if (!map || !mapReadyRef.current || requestedBasemapRef.current === next) return;
    requestedBasemapRef.current = next;
    // A diff of basemap-only operations. A flip back before this lands diffs
    // to nothing and never fires style.load. A failure fires `error` and no
    // style.load; since requestedBasemapRef already names the new theme,
    // flipping away and back retries it.
    //
    // setStyle is handed the STYLE OBJECT, already tuned and cached in module
    // memory (lib/wine-map/basemap), not the URL: given a URL MapLibre fetches
    // and parses the style on every flip, and its diff then walks the untuned
    // layers we are about to drop. Cached, the second and later flips do no
    // network work at all. `transformStyle` is unchanged and still the one
    // contract — withWineLayers(prev, tuneBasemapStyle(incoming)) — and
    // tuneBasemapStyle is idempotent, so tuning an already-tuned style is a
    // no-op. `mapStyle` on <Map> stays frozen; never route a swap through it.
    //
    // `validate: false` skips MapLibre re-validating the whole next style on
    // every flip. What a swap produces is validated at build time instead:
    // basemap.test.ts runs validateStyleMin over exactly this style, against
    // the real Carto fixtures. If a style were ever invalid anyway, setState
    // throws and MapLibre falls back to a full rebuild, which still runs
    // transformStyle and so still carries the wine layers across.
    const apply = (style: StyleSpecification | string) => {
      // A newer flip while we were fetching wins; this reply is stale. So does
      // an unmount — the ref is cleared, and setStyle on a removed map throws.
      if (requestedBasemapRef.current !== next || mapRef.current?.getMap() !== map) return;
      map.setStyle(style, {
        diff: true,
        validate: false,
        transformStyle: (prev, incoming) => {
          landingBasemapRef.current = next;
          return withWineLayers(prev, tuneBasemapStyle(incoming));
        },
      });
    };
    const cached = cachedBasemapStyle(next);
    if (cached) {
      apply(cached);
      return;
    }
    // Two arguments, not .then().catch(): the fallback must cover the FETCH
    // failing, never a throw from apply itself, or one bad setStyle would
    // immediately run a second one.
    loadBasemapStyle(next).then(apply, () => {
      // Our own fetch failed: hand MapLibre the URL so the failure behaves
      // exactly as it did before — an `error` event, no style.load, the map
      // left wholly on its old theme, and a retry on the next flip back
      // (nothing was cached, so that retry really does re-fetch).
      apply(BASEMAP_STYLE_URL[next]);
    });
  }, []);
  useEffect(() => {
    latestThemeRef.current = theme;
    swapBasemap(theme);
  }, [theme, swapBasemap]);
  // On-demand shard loading: only the selected place's region shard is
  // mounted (plus the always-on world archive), so entering a region fetches
  // just that shard. Viewport-driven loading via each shard's bbox is a
  // documented follow-up.
  // Every region shard is mounted permanently: pmtiles is range-requested,
  // so a shard whose bbox is off-screen fetches nothing, and per-feature
  // reveal zooms baked into the tiles progressively expose districts,
  // villages and crus as the user zooms — no selection required (the old
  // selection-gated mounting meant zoom alone never revealed a region's
  // interior, which read as a bug on touch devices).
  const shardEntries = useMemo(
    () => Object.entries(manifest.shards).sort(([a], [b]) => a.localeCompare(b)),
    [manifest],
  );

  // A place belongs to exactly one shard (canonical_key segment 1), so on the
  // other 53 shards the selected-casing/ring layers are filtered to nothing by
  // construction — they can never draw a pixel. Mounting that pair only on the
  // owning shard drops ~106 dead layers with no visual change at all.
  const selectedShard = useMemo(
    () => (selectedKey ? (selectedKey.split(".")[1] ?? null) : null),
    [selectedKey],
  );

  // Viewport-gated mounting. An off-screen shard draws nothing, so unmounting
  // it is invisible by definition; what it saves is the per-frame bookkeeping,
  // symbol-collision and queryRenderedFeatures cost of its source + layers.
  //
  // The world->shard handoff (feature-state `handed` on the world source, set
  // by the effect on handedOffShards) is keyed on the shards that have actually
  // LOADED, so a region whose shard is unmounted (below SHARD_MIN_ZOOM that is
  // all of them) is drawn by the world archive's world-region-* layers, which
  // reuse the shards' own fill/outline paint. Do NOT re-key this to every
  // shard key: below SHARD_MIN_ZOOM nothing would draw a region at all.
  //
  // Hysteresis: mount at 50% padding, unmount only once past 150%, so panning
  // never thrashes sources.
  //
  // This is the mount TARGET, set in one go. ShardController
  // (lib/wine-map/shard-controller) adds the shards themselves, a few per
  // animation frame within its 8 ms budget, so nothing here staggers.
  const [mountedShards, setMountedShards] = useState<string[]>([]);
  // Which country owns the view: the one whose shards cover most of the
  // viewport. Only consulted when nothing is selected — a selection always wins.
  const [viewportCountry, setViewportCountry] = useState<string | null>(null);
  // Every country with ANY presence on screen. A selection only pins focus
  // while its country is one of these — see focusCountry.
  const [viewportCountries, setViewportCountries] = useState<string[]>([]);
  const syncMountedShards = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = map.getBounds();
    const [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const [dx, dy] = [e - w, n - s];

    // Union, not sum. Region bboxes overlap heavily (Italy has 20 of them), so
    // adding per-shard intersections double-counts and systematically favours
    // whichever country is split into the most overlapping pieces — it once
    // ranked Spain over Italy on a frame Italy dominated. Rasterising the
    // viewport into a coarse grid and marking covered cells gives the real
    // "share of on-screen wine ground" the threshold is supposed to mean.
    const covered: Record<string, Set<number>> = {};
    const anyCovered = new Set<number>();
    for (const [key, shard] of shardEntries) {
      const country = shardCountries[key];
      if (!country || !shard.bbox) continue;
      const [minX, minY, maxX, maxY] = shard.bbox;
      const cx0 = Math.max(0, Math.floor(((minX - w) / dx) * FOCUS_GRID));
      const cx1 = Math.min(FOCUS_GRID - 1, Math.ceil(((maxX - w) / dx) * FOCUS_GRID) - 1);
      const cy0 = Math.max(0, Math.floor(((minY - s) / dy) * FOCUS_GRID));
      const cy1 = Math.min(FOCUS_GRID - 1, Math.ceil(((maxY - s) / dy) * FOCUS_GRID) - 1);
      if (cx1 < cx0 || cy1 < cy0) continue;
      const cells = (covered[country] ??= new Set<number>());
      for (let gx = cx0; gx <= cx1; gx += 1) {
        for (let gy = cy0; gy <= cy1; gy += 1) {
          const cell = gy * FOCUS_GRID + gx;
          cells.add(cell);
          anyCovered.add(cell);
        }
      }
    }
    // "Viewing a country" means one country actually dominates the view — not
    // merely that it happens to be the largest sliver of a continent-wide
    // frame. Below the threshold there is no focus country at all, and nothing
    // renders deeper than region level anywhere.
    const ranked = Object.entries(covered).sort((a, b) => b[1].size - a[1].size);
    const total = anyCovered.size;
    const present = ranked.map(([country]) => country).sort();
    setViewportCountries((prev) =>
      prev.length === present.length && prev.every((c, i) => c === present[i]) ? prev : present,
    );
    setViewportCountry((prev) => {
      if (!ranked.length || total === 0) return prev === null ? prev : null;
      const [leader, cells] = ranked[0];
      const share = cells.size / total;
      // Hysteresis, matching the mount set right below: take focus at
      // COUNTRY_FOCUS_SHARE, but keep it until share drops under
      // COUNTRY_RELEASE_SHARE. A single hard threshold made a ~20px drag along
      // the Rhone/Provence border flip focus on and off, blinking every
      // appellation in three regions in and out on alternate gestures.
      if (share >= COUNTRY_FOCUS_SHARE) return prev === leader ? prev : leader;
      if (prev && covered[prev] && covered[prev].size / total >= COUNTRY_RELEASE_SHARE) return prev;
      return prev === null ? prev : null;
    });
    const hit = (bbox: [number, number, number, number] | undefined, pad: number) => {
      // No bbox (transitional v1 manifest) => never hide it.
      if (!bbox) return true;
      const [minX, minY, maxX, maxY] = bbox;
      return (
        maxX >= w - dx * pad && minX <= e + dx * pad &&
        maxY >= s - dy * pad && minY <= n + dy * pad
      );
    };
    // Below SHARD_MIN_ZOOM a shard has nothing the world archive lacks: every
    // shard-only feature has min_zoom >= 5, so all a shard contributes down
    // there is its region — which the world archive also carries, and which the
    // world-region-* layers now paint identically. Mounting none of them means
    // the map opens without reading 54 pmtiles headers.
    const zoom = map.getZoom();
    setMountedShards((prev) => {
      const prevSet = new Set(prev);
      const next = shardEntries
        .filter(
          ([key, shard]) =>
            key === selectedShard ||
            (zoom >= SHARD_MIN_ZOOM &&
              (hit(shard.bbox, 0.5) ||
                (prevSet.has(key) && hit(shard.bbox, 1.5)))),
        )
        .map(([key]) => key);
      return next.length === prev.length && next.every((k, i) => k === prev[i])
        ? prev
        : next;
    });
  }, [shardEntries, selectedShard, shardCountries]);
  // Re-evaluates on selection too, so a shard selected from the tree is mounted
  // even if the camera never moves.
  useEffect(() => {
    syncMountedShards();
  }, [syncMountedShards]);

  // Mounting a shard <Source> only STARTS its cold pmtiles header fetch. Keying
  // the world->shard handoff on `mountedShards` therefore told the world archive
  // to drop a region the instant the shard appeared, leaving it with no fill, no
  // outline and no label — a hole with the country wash showing through — until
  // the round trip finished. Worse on a tree selection, which force-mounts the
  // shard and drew a gold ring around an empty hole. Track what has actually
  // loaded and hand over only then; the brief overlap where both draw is a
  // moment of doubled opacity, which reads far better than a gap.
  //
  // Readiness is a LATCH per mount (lib/wine-map/handoff, latchReady): a shard
  // is ready once it has loaded while its bbox touches the view, and stays
  // ready until it is unmounted. It used to be a live isSourceLoaded reading,
  // which goes false on every reload — and a grape pick, a Local/English
  // toggle, a focus change and the first selection all reload sources — so
  // each of them briefly un-handed its regions and drew them twice (double
  // opacity, a doubled outline, a second label). The two ways a latch could
  // lie are both closed:
  //   - Re-mount. Unmounting a Source removes its tiles. An unmounted shard
  //     drops out of the latch, and the effect after flushReady reads every
  //     committed mount list, so a remount must load in view all over again.
  //   - Vacuous load. A shard mounted by the 50% pad while its region is still
  //     off screen needs no tiles, so MapLibre reports it loaded at once;
  //     loaded only counts while its bbox intersects the view.
  const [readyShards, setReadyShards] = useState<string[]>([]);
  const recomputeReady = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const bounds = map.getBounds();
    const view: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    // Probed here rather than inside the state updater, so the updater stays
    // pure. globalThis: `Map` in this module is the react-map-gl component.
    const probes = new globalThis.Map(
      mountedShards.map((key) => {
        const id = shardSourceId(key);
        let added = false;
        let loaded = false;
        try {
          // Added means the controller added the source AND all three layers:
          // a shard still queued behind the frame budget, or one that failed
          // and was rolled back, is never ready, so its world copy keeps drawing.
          added = controllerRef.current?.isAdded(key) ?? false;
          loaded = added && map.isSourceLoaded(id);
        } catch {
          // Style mid-rebuild: neither added nor loaded this time round.
        }
        const inView = bboxInView(manifest.shards[key]?.bbox, view);
        return [key, { added, loaded, inView }] as const;
      }),
    );
    setReadyShards((prev) => {
      const next = latchReady(new Set(prev), mountedShards, (key) => probes.get(key)!);
      return prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next;
    });
  }, [mountedShards, manifest]);
  // A gesture's `sourcedata` burst — one event per tile per shard — used to
  // run recomputeReady (a getSource/isSourceLoaded sweep plus a state update)
  // for every event. Trailing-debounce it so a burst produces one update once
  // the tiles have settled; moveend still forces an immediate one below. The
  // ref keeps the timer's callback on the latest recomputeReady (it re-binds
  // on mountedShards) without re-creating the scheduler.
  const recomputeReadyRef = useRef(recomputeReady);
  useEffect(() => {
    recomputeReadyRef.current = recomputeReady;
  }, [recomputeReady]);
  const readyTimer = useRef<number | null>(null);
  const scheduleReady = useCallback(() => {
    if (readyTimer.current !== null) window.clearTimeout(readyTimer.current);
    readyTimer.current = window.setTimeout(() => {
      readyTimer.current = null;
      recomputeReadyRef.current();
    }, READY_DEBOUNCE_MS);
  }, []);
  const flushReady = useCallback(() => {
    if (readyTimer.current !== null) {
      window.clearTimeout(readyTimer.current);
      readyTimer.current = null;
    }
    recomputeReadyRef.current();
  }, []);
  // Every committed mount list is read once, straight away: an unmount and a
  // remount can then never both slip between two readings of the latch.
  useEffect(() => {
    flushReady();
  }, [mountedShards, flushReady]);
  useEffect(
    () => () => {
      if (readyTimer.current !== null) window.clearTimeout(readyTimer.current);
    },
    [],
  );
  const handleSourceData = useCallback(
    (e: { sourceId?: string }) => {
      if (!e.sourceId || !e.sourceId.startsWith(SHARD_SOURCE_PREFIX)) return;
      scheduleReady();
    },
    [scheduleReady],
  );
  // Mounted AND actually loaded. Intersecting again is belt-and-braces:
  // recomputeReady already derives from mountedShards, but a shard can unmount
  // between that run and this render.
  const handedOffShards = useMemo(() => {
    const ready = new Set(readyShards);
    return mountedShards.filter((key) => ready.has(key));
  }, [mountedShards, readyShards]);

  // The handoff itself. The world archive's region layers used to FILTER OUT
  // handed-off regions, which meant every shard load or unmount rewrote three
  // layer filters — and a filter change makes MapLibre reload the source's
  // tiles, so the map re-decoded the world archive on every handoff. Now those
  // filters are static and the region's world copy is hidden through
  // feature-state instead: the world Source promotes the `region` property to
  // the feature id (a region's polygon and each of its island labels share
  // it — one id per region, which is exactly the grain a handoff has), and
  // WORLD_HANDED_FACTOR zeroes the fill, line and text opacity of any feature
  // whose state says `handed`. Feature-state is a per-source table keyed by
  // id, applied to tiles as they load, so setting it here covers tiles that
  // arrive later, and the id is derived from the shard key alone — no tile
  // query. Only the difference against what was last applied is written.
  // If the source is not there yet (or the style is still loading) nothing is
  // recorded as applied, so the next change re-applies the whole set.
  //
  // After a basemap swap lands (styleEpoch moves) every handed key is sent
  // again, not just the new ones. On the usual diff path the world source
  // survives with its state, so that write is idempotent; on MapLibre's
  // full-rebuild fallback the source is re-created and its state is gone, and
  // this is what restores it. Keys that left the set are still cleared from
  // `prev` as always, so a shard un-handed in the same render as the landing
  // cannot keep its world copy hidden.
  const appliedHandoffRef = useRef<Set<string>>(new Set());
  const appliedEpochRef = useRef(0);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const next = new Set(handedOffShards);
    const prev = appliedHandoffRef.current;
    const resend = appliedEpochRef.current !== styleEpoch;
    try {
      if (!map.getSource(WORLD_SOURCE_ID)) return;
      for (const sourceLayer of ["places", "labels"]) {
        for (const key of next) {
          if (prev.has(key) && !resend) continue;
          map.setFeatureState(
            { source: WORLD_SOURCE_ID, sourceLayer, id: key },
            { handed: true },
          );
        }
        for (const key of prev) {
          if (next.has(key)) continue;
          map.removeFeatureState(
            { source: WORLD_SOURCE_ID, sourceLayer, id: key },
            "handed",
          );
        }
      }
      appliedHandoffRef.current = next;
      appliedEpochRef.current = styleEpoch;
    } catch {
      // Style not loaded yet: leave `prev` alone so the next change re-applies.
    }
  }, [handedOffShards, styleEpoch]);
  const noFills = useMemo(() => fillsDisabled(), []);
  const debugClick = useMemo(() => clickDebugEnabled(), []);
  const perfProbe = useMemo(() => perfProbeEnabled(), []);
  // The probe's handle on the live MapLibre instance; read when a run starts,
  // so it always drives the map that exists then.
  const getProbeMap = useCallback(() => mapRef.current?.getMap() ?? null, []);

  // A selection pins the focus country, but ONLY while that country is still on
  // screen. selectedKey is never cleared by the explorer, so keying focus on it
  // unconditionally meant the first selection of the session — a tree click, or
  // just arriving via ?place=... — pinned depth to that country permanently:
  // pan to Tuscany afterwards and its shard mounts but stays clamped to
  // tier <= 1, so Chianti and every Tuscan subzone could never appear at any
  // zoom. Once the selection is off screen, focus follows the viewport again.
  const focusCountry = useMemo(() => {
    const selectedCountry = selectedKey ? (selectedKey.split(".")[0] ?? null) : null;
    if (selectedCountry && viewportCountries.includes(selectedCountry)) return selectedCountry;
    return viewportCountry;
  }, [selectedKey, viewportCountries, viewportCountry]);

  // The one writer of every global-state value and of the selection's
  // feature-state (lib/wine-map/map-state-sync), created in onLoad. React only
  // ever changes the desired snapshot: a value computed before the map existed
  // (a ?place= deep link, the stored language) is applied at load, a style
  // rebuild re-sends all of it, and no write can throw into React.
  const stateSyncRef = useRef<MapStateSync | null>(null);
  const knownCountries = useMemo(
    () => [...new Set(Object.values(shardCountries))].sort(),
    [shardCountries],
  );
  const desiredGlobal = useMemo(
    () =>
      desiredGlobalState({
        visibleKeys,
        english,
        selectedKey,
        deepCountries: focusCountry ? [focusCountry] : [],
        knownCountries,
      }),
    [visibleKeys, english, selectedKey, focusCountry, knownCountries],
  );
  const selectionStates = useMemo(
    () => selectionFeatureStates({ roots: tree, selectedKey, fallback: selectionFallback }),
    [tree, selectedKey, selectionFallback],
  );
  const desiredStateRef = useRef({ global: desiredGlobal, selection: selectionStates });
  // A layout effect, not a passive one: react-map-gl applies filter and layer
  // changes during render, and MapLibre sends them to the worker on its next
  // frame. Writing the global state before that frame means those parses
  // already see it — the tree landing (new depth terms), or a selection's new
  // ring and label layers, parse once with the right values instead of once
  // with stale ones and again after a passive effect caught up.
  useLayoutEffect(() => {
    desiredStateRef.current = { global: desiredGlobal, selection: selectionStates };
    stateSyncRef.current?.setDesired(desiredStateRef.current);
  }, [desiredGlobal, selectionStates]);
  useEffect(() => {
    // Normally onLoad creates the sync. But Fast Refresh (dev) cleans up and
    // re-runs every effect while the MapLibre instance survives, and onLoad
    // never fires again — without this the sync would stay disposed and the
    // map would stop following the selection, grape and language until a
    // reload.
    const map = mapRef.current?.getMap();
    if (map && mapReadyRef.current && !stateSyncRef.current) {
      stateSyncRef.current = new MapStateSync(map);
      stateSyncRef.current.setDesired(desiredStateRef.current);
    }
    return () => {
      stateSyncRef.current?.dispose();
      stateSyncRef.current = null;
    };
  }, []);

  // What's actually on screen — drives the dynamic LEGEND only (sections only
  // where they apply). Scanned on map idle. It used to feed the fill palette's
  // colour table too, which meant a paint rewrite whenever a new area scrolled
  // into view; the table now comes from the whole catalogue (areaSlugs) and
  // nothing below the legend depends on this state.
  const [viewInfo, setViewInfo] = useState<{
    scanned: boolean;
    zoom: number;
    regions: string[];
    groups: { slug: string; name: string }[];
    classifications: string[];
  }>({ scanned: false, zoom: 0, regions: [], groups: [], classifications: [] });
  // Regions where the classification ramp applies, discovered once and never
  // revoked (see latchRampedRegions). The only scan-driven input the paint
  // still has, and it changes at most once per region per session.
  const [rampedRegions, setRampedRegions] = useState<string[]>([]);
  // The legend covers much of a phone screen (owner screenshots), so make it
  // collapsible: collapsed by default below lg, expanded from lg up. The map is
  // dynamic ssr:false, so `window` exists at first render (no hydration flash).
  const [legendOpen, setLegendOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );
  const scanView = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Same reason as interactiveLayerIds: regions live on world-region-fills
    // whenever their shard is unmounted, so omitting it left the legend blind
    // to every region at the opening zoom.
    //
    // Under ?debugFills=off the fill layers are visibility:none, and MapLibre
    // excludes hidden layers from queryRenderedFeatures — scanning them there
    // returned nothing, so the legend went blank and (back when the scan fed
    // the colour table) every OUTLINE collapsed to the region hue. That made
    // the diagnostic change the legend and outlines as well as fills, which is
    // not the clean isolation it claims. The outline layers carry the same
    // features and properties, so scan those instead and the A/B differs in
    // fills alone.
    //
    // A handed-off region is now present TWICE in these results — its shard
    // copy and the world archive's hidden copy (opacity 0, not filtered out) —
    // with identical properties. Everything below collects into sets and maps
    // keyed by region/area/classification, so the duplicate collapses.
    const layers = (
      noFills
        ? [
            "world-outlines",
            "world-region-outlines",
            ...mountedShards.map((key) => `shard-outlines-${key}`),
          ]
        : [
            "world-fills",
            "world-region-fills",
            ...mountedShards.map((key) => `shard-fills-${key}`),
          ]
    ).filter((l) => map.getLayer(l));
    if (layers.length === 0) return;
    const regions = new Set<string>();
    // globalThis: `Map` in this module is the react-map-gl component.
    const groups = new globalThis.Map<string, string>();
    const classifications = new Set<string>();
    // Per-region classification levels, for the ramp latch.
    const levelsByRegion = new globalThis.Map<string, Set<string>>();
    for (const feature of map.queryRenderedFeatures({ layers })) {
      const p = (feature.properties ?? {}) as Record<string, unknown>;
      const region = typeof p.region === "string" ? p.region : null;
      if (region) regions.add(region);
      // Legend rows appear only for classes actually in view: Burgundy shows
      // village/premier/grand, Champagne its rated villages, Alsace its
      // grand-cru vineyards.
      const cls =
        typeof p.classification === "string" && p.classification
          ? p.classification
          : typeof p.level === "string"
            ? p.level
            : null;
      if (cls === "grand_cru" || cls === "premier_cru" || cls === "communal") {
        classifications.add(cls);
        if (region) {
          let levels = levelsByRegion.get(region);
          if (!levels) levelsByRegion.set(region, (levels = new Set()));
          levels.add(cls);
        }
      }
      const areaKey =
        typeof p.area_key === "string" && p.area_key
          ? p.area_key
          : typeof p.group === "string" && p.group
            ? p.group
            : null;
      if (region && areaKey) {
        const areaName =
          typeof p.area_name === "string" && p.area_name
            ? p.area_name
            : typeof p.group_name === "string" && p.group_name
              ? p.group_name
              : areaKey;
        groups.set(areaKey, areaName);
      }
    }
    // Latch, never revoke: returns the same array when nothing new was seen,
    // so this is a no-op state update on every scan after discovery.
    setRampedRegions((prev) => latchRampedRegions(prev, levelsByRegion));
    const next = {
      scanned: true,
      zoom: map.getZoom(),
      regions: [...regions].sort(),
      groups: [...groups.entries()]
        .map(([slug, name]) => ({ slug, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      classifications: [...classifications].sort(),
    };
    setViewInfo((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
    // mountedShards is genuinely needed: with an empty dep array this closed
    // over the first render's value, so the scan would only ever look at
    // world-fills and the legend would never see a shard layer. It tracks the
    // viewport-gated mount set, so the scan queries only layers that actually
    // exist; scanView is passed straight to onIdle, which re-binds for free.
  }, [mountedShards, noFills]);

  // queryRenderedFeatures over every fill layer is not cheap, and onIdle fires
  // at the end of each gesture — so a burst of small pans/zooms ran a full
  // scan per gesture. Coalesce them; the legend lands a beat after you stop
  // moving instead of after every twitch.
  const scanTimer = useRef<number | null>(null);
  const scheduleScan = useCallback(() => {
    if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    scanTimer.current = window.setTimeout(() => {
      scanTimer.current = null;
      scanView();
    }, 250);
  }, [scanView]);
  useEffect(
    () => () => {
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    },
    [],
  );

  // A cameraTarget that arrives BEFORE the map instance exists used to be
  // dropped: @vis.gl/react-maplibre creates the map inside an async import, so
  // mapRef.current is still null on TileWineMap's first commit, and on a cold
  // deep link the place context usually resolves before that chunk lands. The
  // effect no-opped, cameraTarget never changed again, and the link framed
  // nothing — intermittently, depending on which fetch won. Stash it and replay
  // on load instead.
  const pendingCameraRef = useRef<CameraTarget | null>(null);
  const applyCameraTarget = useCallback((cameraTarget: CameraTarget) => {
    // Map-originated selections never reframe: you tapped the shape, so it
    // is on screen; the gold ring appearing is feedback enough.
    if (cameraTarget.source === "map") return;
    const map = mapRef.current;
    const [minX, minY, maxX, maxY] = cameraTarget.bbox;
    const bounds: [[number, number], [number, number]] = [
      [minX, minY],
      [maxX, maxY],
    ];
    const inner = map?.getMap();
    // Fit the footprint, but never end below the selection's reveal zoom: a
    // bbox fit alone can land under a small feature's min_zoom, so it (and its
    // gold ring) wouldn't render until the user zoomed in by hand.
    const apply = () => {
      const cam = inner?.cameraForBounds(bounds, {
        padding: 48,
        maxZoom: cameraTarget.maxZoom,
      });
      if (inner && cam) {
        inner.easeTo({
          center: cam.center,
          zoom: Math.max(cam.zoom ?? 0, cameraTarget.minZoom),
          duration: 900,
        });
      } else {
        map?.fitBounds(bounds, {
          padding: 48,
          duration: 900,
          maxZoom: cameraTarget.maxZoom,
        });
      }
    };
    if (!inner) {
      apply();
      return;
    }
    // Leave the view untouched only when the selection is already well framed
    // AND already past its reveal zoom (otherwise the feature/ring isn't on
    // screen yet); reframe when it's off-screen, too small/large, or too far
    // out — so tree navigation to a distant or deep place still flies there.
    const b = inner.getBounds();
    const viewW = b.getEast() - b.getWest();
    const viewH = b.getNorth() - b.getSouth();
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const centreVisible =
      cx > b.getWest() &&
      cx < b.getEast() &&
      cy > b.getSouth() &&
      cy < b.getNorth();
    const spanFrac = Math.max((maxX - minX) / viewW, (maxY - minY) / viewH);
    const zoomedEnough = inner.getZoom() >= cameraTarget.minZoom - 0.01;
    if (centreVisible && zoomedEnough && spanFrac >= 0.18 && spanFrac <= 1.3)
      return;
    apply();
  }, []);

  useEffect(() => {
    if (!cameraTarget) return;
    if (!mapRef.current?.getMap()) {
      pendingCameraRef.current = cameraTarget;
      return;
    }
    applyCameraTarget(cameraTarget);
  }, [cameraTarget, applyCameraTarget]);

  // The legend's reading of the ramp: on when a region in view is a ramped
  // one. Legend-only — the paint reads rampedRegions through the expression.
  const rampEnabled = useMemo(
    () => viewInfo.regions.some((region) => rampedRegions.includes(region)),
    [viewInfo.regions, rampedRegions],
  );
  // The fill colour only steps from the region hue to the per-area/
  // classification palette at z8, so below that the legend's Areas and
  // Classification chips described colours that appeared nowhere on the map —
  // a Gevrey-Chambertin swatch in district red while every polygon on
  // screen was still Bourgogne petrol. Same threshold as the step.
  const areaPaletteLive = viewInfo.zoom >= AREA_PALETTE_ZOOM;

  // Static paint (lib/wine-map/shard-specs). Nothing here moves with the
  // selection any more: the selected place, its children and its relatives are
  // feature-state, and "something is selected" is the wm_has_sel global — all
  // written by MapStateSync. The world layers' paint below re-keys only on the
  // landed theme. The region shards' paint (their area slugs, the ramp latch)
  // is built by ShardController from the same builders; see shardDesired.
  // The world archive's country and region colour: every region's hue, one
  // cached expression per theme, so the reference only changes on a flip.
  // World features carry no area slugs, so this paints them exactly as the
  // shard expressions paint the same region (shard-specs.test.ts).
  const regionColor = worldRegionColor(palette) as unknown as string;
  // The country wash and its outline (world-fills, world-outlines). Memoized
  // like every other paint here, so a re-render (every `styledata`) hands
  // react-map-gl the same object.
  const worldCountryFillPaint = useMemo(
    () => ({
      // See staticFillPaint: the outline layer supplies the edge, so the
      // built-in fill antialias pass is redundant work.
      "fill-antialias": false,
      "fill-color": regionColor,
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        ["case", ["==", ["get", "tier"], 0], 0.1, 0.35],
        6,
        ["case", ["==", ["get", "tier"], 0], 0.04, 0.28],
        9,
        ["case", ["==", ["get", "tier"], 0], 0.02, 0.12],
      ] as unknown as number,
    }),
    [regionColor],
  );
  const worldCountryOutlinePaint = useMemo(
    () => ({
      "line-color": regionColor,
      "line-width": ["case", ["==", ["get", "tier"], 0], 1, 1.5] as unknown as number,
    }),
    [regionColor],
  );
  // The world archive's copy of the shard paint, with the handed-off
  // multiplier folded in (see the effect on handedOffShards).
  const worldRegionFillPaint = useMemo(
    () => staticFillPaint({ color: regionColor, ramp: false, worldHandoff: true }) as FillPaint,
    [regionColor],
  );
  const worldRegionOutlinePaint = useMemo(
    () => staticOutlinePaint({ color: regionColor, worldHandoff: true }) as LinePaint,
    [regionColor],
  );
  // Label paint: the selected / related / distant weights come from
  // feature-state, so there is one object per theme. World labels also vanish
  // with their handed-off region.
  const worldLabelPaint = useMemo(
    () => staticLabelPaint({ palette, worldHandoff: true }) as SymbolPaint,
    [palette],
  );
  const worldSelectedLabelPaint = useMemo(
    () => selectedLabelPaint({ palette, worldHandoff: true }) as SymbolPaint,
    [palette],
  );
  // The world ring and keyline casing; the shard overlays are built from the
  // same two builders (shardOverlaySpecs), so both archives ring alike.
  const selectedCasingPaint = useMemo(() => selectionCasingPaint(palette), [palette]);
  const selectedRingPaint = useMemo(() => selectionRingPaint(palette), [palette]);

  // Phase 1c: the region shards are mounted by ShardController with
  // {validate:false} instead of <Source>/<Layer> JSX, whose map.addSource/
  // addLayer serialize the whole style on every call (the first-zoom freeze).
  // React only describes what should be mounted and from which inputs; the
  // controller diffs that against the map on the next frame and rewrites
  // paint or filters only for shards whose inputs changed — a landed theme,
  // a ramp latch, the tree arriving with countries and area slugs.
  //
  // Subregion depth, one country at a time: a shard outside the focus country
  // renders only its regions (tier <= 1), so neighbours stay on the map as
  // context instead of every country exploding into subregions at once. The
  // rule is that country's wm_deep_<country> flag, read by each of its shards'
  // filters (shardFilter, from `country` below); a shard whose country the
  // tree does not name is left at full depth rather than blanked. So a
  // shard's filters change only when the tree lands, and a focus change is
  // one global-state write that reloads just the two countries' shards.
  const shardUrls = useMemo(
    () => Object.fromEntries(shardEntries.map(([key, shard]) => [key, shard.url])),
    [shardEntries],
  );
  const shardDesired = useMemo<ShardDesired>(
    () => ({
      keys: mountedShards,
      urls: shardUrls,
      selectedShard,
      palette,
      inputs: (key: string): ShardSpecInputs => ({
        // Own properties only: a shard key never reads a country or a slug
        // list off the object prototype.
        country: Object.prototype.hasOwnProperty.call(shardCountries, key)
          ? shardCountries[key]
          : null,
        areaSlugs: Object.prototype.hasOwnProperty.call(areaSlugsByShard, key)
          ? areaSlugsByShard[key]
          : [],
        ramp: rampedRegions.includes(key),
        palette,
        fillsVisible: !noFills,
      }),
    }),
    [mountedShards, shardUrls, selectedShard, palette, shardCountries, areaSlugsByShard, rampedRegions, noFills],
  );
  // onLoad reads this: the effect below may run before the map exists.
  const shardDesiredRef = useRef(shardDesired);
  useEffect(() => {
    shardDesiredRef.current = shardDesired;
    controllerRef.current?.setDesired(shardDesired);
  }, [shardDesired]);

  // Clicks (react-map-gl's interactiveLayerIds) and the hover cursor query the
  // same layers: this is the list Task 11 left on the prop, moved here so the
  // cursor can read it too. Ids of shards the controller has not added yet
  // are harmless: both filter the list through map.getLayer first.
  const interactiveLayerIds = useMemo(
    () => [
      ...(noFills
        ? [
            "world-outlines",
            "world-region-outlines",
            ...mountedShards.map((key) => `shard-outlines-${key}`),
          ]
        : [
            "world-fills",
            "world-region-fills",
            ...mountedShards.map((key) => `shard-fills-${key}`),
          ]),
      "world-labels",
      ...mountedShards.map((key) => `shard-labels-${key}`),
      // The selected place's own label: its ordinary copy loses to it by
      // collision, so this is what a click on that name lands on.
      "world-selected-label",
      ...(selectedShard ? [`shard-selected-label-${selectedShard}`] : []),
    ],
    [mountedShards, noFills, selectedShard],
  );
  const interactiveLayerIdsRef = useRef(interactiveLayerIds);
  useEffect(() => {
    interactiveLayerIdsRef.current = interactiveLayerIds;
  }, [interactiveLayerIds]);
  useEffect(() => {
    // onLoad creates the controller and the hover listener. But Fast Refresh
    // (dev) cleans up and re-runs every effect while the MapLibre instance
    // survives, and onLoad never fires again, so without this the shards
    // would stop following the view and the cursor would freeze until a
    // reload — the same reason the state sync above is recreated. A new
    // controller adopts the shards already on the map: it reads what is
    // mounted from the map, never from its own bookkeeping.
    const map = mapRef.current?.getMap();
    if (map && mapReadyRef.current) {
      if (!controllerRef.current) {
        controllerRef.current = new ShardController(map);
        controllerRef.current.setDesired(shardDesiredRef.current);
      }
      if (!disposeHoverRef.current) {
        disposeHoverRef.current = installHoverCursor(map, {
          layers: () => interactiveLayerIdsRef.current,
        });
      }
    }
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      disposeHoverRef.current?.();
      disposeHoverRef.current = null;
    };
  }, []);

  const attribution = useMemo(
    () => Object.values(manifest.attribution),
    [manifest],
  );

  // Legend regions follow the viewport once the first scan lands; the
  // manifest's shard list covers the initial paint only. An empty result from a
  // scan that DID run is meaningful — panning onto the Alps or open sea shows no
  // wine ground — and used to be misread as "not scanned yet", expanding the
  // legend to all 54 regions over a frame containing none.
  const legendRegions = useMemo(() => {
    const keys = viewInfo.scanned
      ? viewInfo.regions
      : Object.keys(manifest.shards).sort();
    return keys.map((key) => {
      const local = REGION_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
      return {
        key,
        label: english ? englishName(local) : local,
        color: palette.regions[key] ?? palette.fallback,
      };
    });
  }, [manifest, viewInfo.scanned, viewInfo.regions, english, palette]);

  return (
    <div className="relative h-full overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-label={expanded ? "Exit full view" : "Full view"}
        // Full view is a desktop affordance only — on phones it just swaps one
        // stacked column for another, so it's hidden below lg.
        className="absolute right-2 top-2 z-10 hidden rounded-md border border-border bg-background/85 p-1.5 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground lg:block"
      >
        {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
      <Map
        ref={mapRef}
        // Frozen at the theme the map was created with: later flips go
        // through swapBasemap, never this prop (see the dark-mode note at the
        // top of the component). A dark user's map is created on Dark Matter
        // directly, never loading Positron first.
        mapStyle={BASEMAP_STYLE_URL[initialTheme]}
        initialViewState={{ longitude: 2.4, latitude: 46.6, zoom: 4.4 }}
        // world-region-fills is load-bearing here, not decoration: since the
        // world archive took over regions whose shard is unmounted — which
        // below SHARD_MIN_ZOOM is ALL of them — it is the only layer carrying a
        // region at the opening zoom. Leaving it out made clicking a region
        // fall through to the country fill beneath it, so the map opened unable
        // to drill into a region, which is its primary gesture.
        // Mirrors scanView's swap: ?debugFills=off sets the fill layers to
        // visibility:none, and MapLibre excludes hidden layers from
        // queryRenderedFeatures — leaving them listed here made the whole map
        // inert in that mode, no click and no hover cursor at any zoom. The
        // outline layers carry the same key/tier/area/min_zoom the resolver
        // reads, and line layers hit-test fine.
        // Labels are hit-testable too. Clicking a place's NAME is the obvious
        // gesture — often the only practical target, since a climat like
        // La Tache is a few pixels of polygon next to a much larger label — but
        // the symbol layers were never listed here, so clicking a name did
        // nothing at all. They carry the same key/tier/area properties as the
        // polygons (labelFeatures reuses tileProperties), so the smallest-wins
        // resolver handles them unchanged.
        // A handed-off region reaches the resolver twice — the shard's copy
        // and the world archive's hidden one (opacity 0 is still rendered,
        // so queryRenderedFeatures returns it) — with the same key, tier and
        // area, so smallest-wins picks the same place either way.
        interactiveLayerIds={interactiveLayerIds}
        // Tiles and labels cross-fade in by default, which keeps compositing
        // extra passes alive for 300ms after every tile lands — constant while
        // panning or zooming. They pop in instead; on a GPU-bound map that is a
        // straight win.
        fadeDuration={0}
        maxTileCacheSize={MAX_TILE_CACHE}
        onSourceData={handleSourceData}
        onMoveEnd={() => {
          syncMountedShards();
          // A shard whose region has just scrolled into view now genuinely
          // needs tiles, so its vacuous "loaded" must be re-tested here — at
          // once, not after the debounce.
          flushReady();
        }}
        onLoad={(e) => {
          // MapLibre's compact attribution control mounts expanded; collapse
          // it so only the "i" toggle shows until the user opens it.
          const details = e.target
            .getContainer()
            .querySelector("details.maplibregl-ctrl-attrib");
          details?.classList.remove("maplibregl-compact-show");
          details?.removeAttribute("open");
          // Tune the basemap (lib/wine-map/basemap, basemapTweaks): push its
          // place labels to z7+ so our region labels win the low-zoom
          // collisions, gate its roads to z10+, and drop the clutter a wine
          // map never uses — 25 of Carto's 93 layers, leaving 68. Measured:
          // a z14 tile over the Cote de Nuits carries 341 basemap features and
          // 11,049 vertices against 66 features and 637 vertices of ours, and
          // a z12 frame there rendered 186 basemap features of which 129 were
          // roads — so the context map, not the wine data, is the bulk of what
          // every frame draws, and every style layer naming a source-layer
          // also costs a filter pass over it in every tile the worker parses.
          // The same rule tunes every swapped-in basemap (tuneBasemapStyle),
          // so a theme flip's diff never re-adds what this removes.
          //
          // basemapTweaks lists only the 11 zoom ranges that actually move a
          // layer, never a no-op: setLayerZoomRange always calls _update(true),
          // and for a layer carrying no maxzoom it also pauses the basemap's
          // tile manager and queues a reload — during the first paint.
          const tweaks = basemapTweaks(e.target.getStyle().layers ?? []);
          for (const id of tweaks.remove) e.target.removeLayer(id);
          for (const range of tweaks.zoomRanges) {
            e.target.setLayerZoomRange(range.id, range.minzoom, range.maxzoom);
          }
          // Theme flips from here on swap the basemap in place; a landed swap
          // repaints the wine layers and legend (paintTheme) and has the
          // handoff effect re-send its feature-state (styleEpoch). Fires only
          // after a swap (or MapLibre's rare full-rebuild fallback), never on
          // a gesture.
          mapReadyRef.current = true;
          // The one global-state and feature-state writer. It applies what
          // React has already computed (a deep link's selection, the stored
          // language) at once, and again after every style.load.
          stateSyncRef.current?.dispose();
          stateSyncRef.current = new MapStateSync(e.target);
          stateSyncRef.current.setDesired(desiredStateRef.current);
          // Region shards (Phase 1c). One controller per map instance; it waits
          // for react-map-gl's world layers itself, and starts from the latest
          // desired state (the effect that feeds it may already have run).
          controllerRef.current?.dispose();
          controllerRef.current = new ShardController(e.target);
          controllerRef.current.setDesired(shardDesiredRef.current);
          // Hover cursor: at most one query per frame, none mid-gesture.
          disposeHoverRef.current?.();
          disposeHoverRef.current = installHoverCursor(e.target, {
            layers: () => interactiveLayerIdsRef.current,
          });
          e.target.on("style.load", () => {
            // The controller records the landed style and schedules its
            // re-add (and, after a full rebuild, its repaint) for the next
            // frame. MapStateSync's own style.load listener was registered
            // earlier in this onLoad, so it fires first: the landed global
            // state and selection flags are already applied when those shards
            // go in. onStyleRebuilt never throws; the try is this listener's
            // rule regardless — a throw in a style.load listener turns a good
            // theme diff into MapLibre's full rebuild.
            try {
              controllerRef.current?.onStyleRebuilt();
            } catch {
              // Nothing to recover: the next setDesired runs the controller again.
            }
            setPaintTheme(landingBasemapRef.current);
            setStyleEpoch((n) => n + 1);
          });
          // A flip that landed while the map was still loading.
          swapBasemap(latestThemeRef.current);
          // First gating pass once the map has real bounds.
          syncMountedShards();
          if (debugClick) {
            (window as unknown as { __wineMap?: unknown }).__wineMap = e.target;
            console.log("[wine-map] map exposed as window.__wineMap");
          }
          // Replay a camera target that arrived before the map existed.
          const pending = pendingCameraRef.current;
          if (pending) {
            pendingCameraRef.current = null;
            applyCameraTarget(pending);
          }
        }}
        onClick={(e) => {
          if (debugClick) {
            const m = mapRef.current?.getMap();
            const ids = [
              "world-fills",
              "world-region-fills",
              "world-outlines",
              "world-region-outlines",
              "world-labels",
              ...mountedShards.flatMap((k) => [`shard-fills-${k}`, `shard-labels-${k}`]),
            ];
            console.log("[wine-map click]", {
              zoom: m?.getZoom(),
              mountedShards,
              focusCountry,
              layersPresent: ids.filter((id) => m?.getLayer(id)),
              layersMissing: ids.filter((id) => !m?.getLayer(id)),
              features: (e.features ?? []).map((f) => ({
                layer: f.layer?.id,
                key: (f.properties as { key?: string } | null)?.key,
                tier: (f.properties as { tier?: number } | null)?.tier,
              })),
            });
          }
          // Smallest-wins: the smallest footprint under the click is the most
          // specific place the user aimed at, so AREA leads and tier/min_zoom
          // only break ties. An enclave (Canon-Fronsac within Fronsac, La Tâche
          // under the village) is smaller so it still wins — but a superimposed
          // blanket appellation like Graves Supérieures (a deep tier that
          // legally covers the whole of Graves, larger than Pessac-Léognan
          // sitting inside it) no longer shadows the specific appellations
          // beneath it (owner: "can't click Pessac-Léognan, only Graves Sup.").
          let best: {
            key: string;
            tier: number;
            area: number;
            minZoom: number;
          } | null = null;
          for (const feature of e.features ?? []) {
            const p = feature.properties as {
              key?: string;
              tier?: number;
              area?: number;
              min_zoom?: number;
            };
            if (typeof p.key !== "string") continue;
            const tier = p.tier ?? 0;
            const area = typeof p.area === "number" && p.area > 0 ? p.area : Infinity;
            const minZoom = p.min_zoom ?? 0;
            if (
              !best ||
              area < best.area ||
              (area === best.area &&
                (tier > best.tier ||
                  (tier === best.tier && minZoom > best.minZoom)))
            ) {
              best = { key: p.key, tier, area, minZoom };
            }
          }
          if (!best) return;
          // The country fill covers the gaps between regions, so a stray
          // click beside a region resolves to the country and would fling
          // the camera out. Once you're past region zoom, ignore country
          // selection — reach France via the tree instead.
          if (best.tier === 0 && (mapRef.current?.getZoom() ?? 0) > 5) return;
          onSelect(best.key, "map");
        }}
        onIdle={scheduleScan}
        attributionControl={{ compact: true, customAttribution: attribution }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Zoom +/- plus a pitch-aware compass: drag the compass to rotate
            the bearing, click it to reset north and level the camera
            (visualizePitch shows the current tilt). Top-left keeps clear of
            the expand button (top-right) and the legend (bottom-left). */}
        <NavigationControl position="top-left" visualizePitch />
        {/* promoteId: the `region` property becomes the feature id, for the
            handoff's feature-state (a region's polygon in `places` and each
            of its island labels in `labels` all carry it; a country's tier-0
            row carries its own key, which no shard key ever equals). The
            selection's sel/child/rel flags (lib/wine-map/selection-state)
            ride on the same ids next to `handed`; MapStateSync and the
            handoff effect each remove only their own flags, by name. */}
        <Source
          id={WORLD_SOURCE_ID}
          type="vector"
          url={`pmtiles://${manifest.world.url}`}
          promoteId="region"
        >
          {/* The world archive carries the country plus every region, so
              selecting France shows all its regions. A region already served
              by a loaded shard is drawn at opacity 0 (feature-state `handed`)
              rather than filtered out, so the handoff rewrites no layer. The
              hidden copy still costs a draw — one full-tile fill pass per
              handed-off region under the view — and still hit-tests and
              scans; both resolve to the same key/tier as the shard's copy.
              Every filter, layout and paint below is static for the session
              (module constants and palette-keyed memos). */}
          <Layer
            id="world-fills"
            type="fill"
            source-layer="places"
            // The country wash fades to 0.02 opacity by z9 — invisible, but
            // still a full-viewport translucent blend every frame on top of
            // every region/appellation/site fill beneath it. Stop drawing it
            // once it stops being perceptible. Outlines are unaffected, and
            // regions are drawn by their shard (which viewport gating
            // guarantees is mounted whenever one is on screen).
            maxzoom={8}
            filter={WORLD_COUNTRY_FILTER}
            layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
            paint={worldCountryFillPaint}
          />
          <Layer
            id="world-outlines"
            type="line"
            source-layer="places"
            filter={WORLD_COUNTRY_FILTER}
            paint={worldCountryOutlinePaint}
          />
          {/* Regions no loaded shard is covering, drawn with the shards' own
              fill and outline paint. Below SHARD_MIN_ZOOM no shard is mounted at
              all, so these are what render the regions — identical pixels, but
              from one already-open archive instead of 54. */}
          <Layer
            id="world-region-fills"
            type="fill"
            source-layer="places"
            filter={WORLD_REGION_FILTER}
            paint={worldRegionFillPaint}
            layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
          />
          <Layer
            id="world-region-outlines"
            type="line"
            source-layer="places"
            filter={WORLD_REGION_FILTER}
            paint={worldRegionOutlinePaint}
          />
          <Layer
            id="world-selected-casing"
            type="line"
            source-layer="places"
            filter={SELECTED_PLACE_FILTER}
            paint={selectedCasingPaint}
          />
          <Layer
            id="world-selected-ring"
            type="line"
            source-layer="places"
            filter={SELECTED_PLACE_FILTER}
            paint={selectedRingPaint}
          />
          {/* A handed-off region's world label is invisible (text-opacity 0)
              but still occupies its collision box, so it must LOSE that
              collision to the shard's own label. MapLibre places symbol
              layers from the TOP of the style down (PauseablePlacement starts
              at order.length - 1), and the first placed wins — so the loser
              has to sit BELOW the shard label layers. It does:
              ShardController adds shards only once world-labels exists,
              always above the world layers, and moves any world layer
              react-map-gl re-creates on top back below them, in this order.
              Do not move this layer above the shards' labels to "give it
              priority"; that would let the invisible copy blank the visible
              one. */}
          <Layer
            id="world-labels"
            type="symbol"
            source-layer="labels"
            filter={GRAPE_GATE}
            layout={LABEL_LAYOUT}
            paint={worldLabelPaint}
          />
          {/* A selected country or region's own label, larger and first in
              collision (D4: the ordinary label layers no longer change size
              or order with the selection). Directly above world-labels, so
              it beats the ordinary copy of itself, and still below every
              shard layer, so while its region is handed off its invisible
              copy loses to the shard's selected label exactly as world-labels
              loses to shard-labels. */}
          <Layer
            id="world-selected-label"
            type="symbol"
            source-layer="labels"
            filter={SELECTED_PLACE_FILTER}
            layout={SELECTED_LABEL_LAYOUT}
            paint={worldSelectedLabelPaint}
          />
        </Source>
      </Map>
      {perfProbe ? (
        <PerfProbe
          getMap={getProbeMap}
          onSelect={onSelect}
          selectedKey={selectedKey}
          contextKey={selectedContextKey}
        />
      ) : null}
      <div className="absolute bottom-2 left-2 max-w-[75%] rounded-md border border-border bg-background/85 text-[11px] leading-tight text-muted-foreground backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-medium text-foreground"
        >
          <ChevronUp
            className={cn(
              "size-3.5 transition-transform",
              legendOpen ? "" : "rotate-180",
            )}
          />
          Legend
        </button>
        <div
          className={cn(
            "max-h-[45vh] overflow-y-auto px-2.5 pb-2",
            legendOpen ? "" : "hidden",
          )}
        >
          <p className="mb-1 font-medium text-foreground">Regions</p>
        <ul className="flex flex-col gap-0.5">
          {legendRegions.map((region) => (
            <li key={region.key} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-sm"
                style={{ backgroundColor: region.color }}
              />
              {region.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-sm border-2 bg-transparent"
              style={{ borderColor: palette.selectedRing }}
            />
            Selected (gold ring)
          </li>
        </ul>
        {areaPaletteLive && viewInfo.groups.length > 0 ? (
          <>
            <p className="mb-1 mt-2 font-medium text-foreground">Areas</p>
            <ul className="flex flex-col gap-0.5">
              {viewInfo.groups.slice(0, 9).map((group) => (
                <li key={group.slug} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-sm"
                    style={{ backgroundColor: districtColor(group.slug, palette) }}
                  />
                  {group.name}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {areaPaletteLive && viewInfo.classifications.length > 0
          ? (() => {
              // Shade chips borrow the first visible area's hue so the
              // legend ramp matches what's on screen: the stronger shade
              // (darker in light, brighter in dark) = higher classification.
              const sample = viewInfo.groups[0]
                ? districtColor(viewInfo.groups[0].slug, palette)
                : palette.fallback;
              const shades = classificationShades(sample, palette);
              return (
                <>
                  <p className="mb-1 mt-2 font-medium text-foreground">
                    Classification
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {viewInfo.classifications.includes("grand_cru") ? (
                      <li className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2.5 rounded-sm"
                          style={{
                            backgroundColor: rampEnabled
                              ? shades.grand_cru
                              : shades.base,
                          }}
                        />
                        {rampEnabled
                          ? `Grand cru (${palette.grandCruLegend})`
                          : "Grand cru"}
                      </li>
                    ) : null}
                    {viewInfo.classifications.includes("premier_cru") ? (
                      <li className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2.5 rounded-sm"
                          style={{
                            backgroundColor: rampEnabled
                              ? shades.premier_cru
                              : shades.base,
                          }}
                        />
                        Premier cru
                      </li>
                    ) : null}
                    {viewInfo.classifications.includes("communal") ? (
                      <li className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2.5 rounded-sm opacity-60"
                          style={{ backgroundColor: shades.base }}
                        />
                        Village
                      </li>
                    ) : null}
                  </ul>
                </>
              );
            })()
          : null}
        </div>
      </div>
    </div>
  );
}
