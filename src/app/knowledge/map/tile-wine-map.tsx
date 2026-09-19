"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
// Dark-theme dressing for MapLibre's own controls; must follow maplibre-gl.css.
import "./map-chrome.css";
import type { WineMapManifest } from "@/lib/wine-map/manifest";
import {
  latchRampedRegions,
  paletteArms,
} from "@/lib/wine-map/fill-palette";
import {
  englishName,
  englishTextFieldExpression,
} from "@/lib/wine-map/localize-names";
import {
  BASEMAP_STYLE_URL,
  basemapTweaks,
  SHARD_SOURCE_PREFIX,
  shardSourceId,
  tuneBasemapStyle,
  withWineLayers,
  WORLD_SOURCE_ID,
} from "@/lib/wine-map/basemap";
import {
  classificationShades,
  districtColor,
  MAP_PALETTES,
  SHADE_STEPS,
  shiftLightness,
  type MapPalette,
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

// Zoom at which fillColorExpression steps from the region hue to the per-area /
// classification palette. The legend keys off the same number so it never
// advertises colours the map is not painting yet.
const AREA_PALETTE_ZOOM = 8;

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

// Default for the areaSlugs prop. A module constant, not a `= []` default:
// a fresh array per render would re-key every memo below it on every render.
const NO_SLUGS: string[] = [];

// Multiplier for the world archive's region layers: 0 once the region's own
// shard has loaded (feature-state `handed`, set by the effect on
// handedOffShards), 1 otherwise. Applied to fill/line/text opacity in place of
// a filter, so a handoff never rewrites a layer — see the world Source below.
const WORLD_HANDED_FACTOR = [
  "case",
  ["boolean", ["feature-state", "handed"], false],
  0,
  1,
];

// Region hue spread across the tint ramp. Built ONCE per palette at module
// load, never per render: a theme flip swaps which table the paint reads, and
// that is the only time the reference changes.
function regionMatchExpression(palette: MapPalette) {
  return [
    "match",
    ["get", "region"],
    ...Object.entries(palette.regions).flatMap(([key, color]) => [
      key,
      [
        "match",
        ["to-number", ["coalesce", ["get", "tint"], 2]],
        ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(color, step)]),
        color,
      ],
    ]),
    palette.fallback,
  ];
}
const REGION_MATCH: Record<Theme, unknown[]> = {
  light: regionMatchExpression(MAP_PALETTES.light),
  dark: regionMatchExpression(MAP_PALETTES.dark),
};

// Classification source: the `classification` tile property (appellation
// level, or Champagne's échelle village rating), falling back to `level`
// for tiles from before the property existed. It drives the fill-intensity
// ramp — stronger, more saturated shades of the area hue for higher
// classifications (darker in light, brighter in dark) — leaving gold reserved
// for selection alone.
const classificationExpr = [
  "coalesce",
  ["get", "classification"],
  ["get", "level"],
  "",
];

// The no-filter state for layers whose filter is sometimes absent. MapLibre
// rejects `undefined` in addLayer (the layer then never mounts), so "no
// filter" must be an always-true expression instead.
const PASS_FILTER = ["boolean", true] as unknown as boolean;

// Same trap as PASS_FILTER, one property over: react-map-gl feeds `layout`
// straight into addLayer, and MapLibre rejects `undefined` there — the layer is
// silently dropped, with no error and no console warning. Passing
// `layout={cond ? {...} : undefined}` therefore removed EVERY fill layer from
// the style whenever the condition was false, which is the normal case. Both
// states must be real objects.
const LAYER_VISIBLE = { visibility: "visible" } as const;
const LAYER_HIDDEN = { visibility: "none" } as const;

// District hues (districtColor), their classification shades and the tint ramp
// live in lib/wine-map/map-palette, one fixed table per theme, keyed by the
// same slug hash so the fill expression's palette arms and the legend swatches
// cannot drift apart.

// Hue-grouping unit: village-level in Burgundy, sub-region in Champagne
// (the `area_key` tile property), falling back to the district group for
// tiles from before the property existed.
const areaExpr = ["coalesce", ["get", "area_key"], ["get", "group"], ""];

// Selection no longer recolours the shape — places keep their true palette
// colour and selection reads as a gold outline ring drawn above everything
// (plus a slight opacity lift in fillPaint). The world layers' region colour is
// REGION_MATCH[paintTheme], read inside the component.

// "Is this feature's region one where the classification ramp applies?" —
// bound as the `ramp` variable of the fill-colour and fill-opacity `let`s.
// The ramp is RELATIVE: it only applies where at least two classification
// levels exist — an all-grand-cru region like Alsace has nothing to be darker
// THAN, so its vineyards keep the plain area hue (owner: "darkest doesn't make
// sense there"). Which regions qualify is discovered once per session by the
// idle-time scan (latchRampedRegions), not re-decided per viewport.
function rampExpression(rampedRegions: string[]) {
  return rampedRegions.length
    ? ["match", ["coalesce", ["get", "region"], ""], rampedRegions, true, false]
    : false;
}

// The shade family of one palette colour, evaluated against the feature:
// grand cru strongest (darkest in light, brightest in dark), premier cru mid,
// everything else spread across the tint ramp — but only where `ramp` holds;
// otherwise the tint ramp alone.
function paletteShadeExpression(color: string, palette: MapPalette) {
  const shades = classificationShades(color, palette);
  // Within an area, sites that share a classification used to render in
  // one identical colour — a whole Großlage of Einzellagen as a single
  // brown mass, with no way to see where one ends and the next begins.
  // Spread them across a lightness ramp of the area's own hue using the
  // stable per-place `tint`, so neighbours separate while the area still
  // reads as one group. This is the plain/village case only: the cru
  // shades stay exact, because there intensity carries real meaning.
  const tinted = [
    "match",
    ["to-number", ["coalesce", ["get", "tint"], 2]],
    ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(shades.base, step)]),
    shades.base,
  ];
  return [
    "case",
    ["var", "ramp"],
    [
      "match",
      classificationExpr,
      "grand_cru",
      shades.grand_cru,
      "premier_cru",
      shades.premier_cru,
      tinted,
    ],
    tinted,
  ];
}

// Camera ("zoom") expressions must sit at the top level of a paint property
// (a `let` around it is fine — MapLibre looks through `let` for the zoom
// curve), so the zoom step wraps the selection cases rather than the reverse.
//
// `areaSlugs` is the WHOLE catalogue (every `area_key`/`group` value the tiles
// can carry, derived from the place tree by areaSlugsFromTree), not the areas
// scanned so far: the table is built once and the expression never changes
// for the session except for a region joining the ramp. Two levels keep it
// small — a `match` from slug to palette index with one arm per palette
// colour (MapLibre lets an arm carry a list of labels), then a `match` from
// index to that colour's shade family — instead of one arm per slug with its
// own copy of the shade family, which is what made the old table's size a
// problem (and forced a cap on it).
// `theme` picks one of the two fixed tables — both keyed alike, so the arms
// are the same and only the colours differ; a theme flip is the only other
// thing that rebuilds this.
function fillColorExpression(areaSlugs: string[], rampedRegions: string[], theme: Theme) {
  // From z8 every area (Burgundy village, Champagne sub-region, Bordeaux
  // district) gets its own hue, and WITHIN the hue classification reads as
  // intensity: grand cru strongest, premier cru mid, village land plain.
  // Region hue covers a slug the catalogue does not know (a tile release
  // newer than the loaded tree) exactly as it covered unscanned areas before.
  const palette = MAP_PALETTES[theme];
  const regionMatch = REGION_MATCH[theme];
  const arms = paletteArms(areaSlugs, palette.districts.length);
  const present = palette.districts.map((_, i) => arms[i].length > 0);
  const paletteIndex = present.some(Boolean)
    ? [
        "match",
        areaExpr,
        ...arms.flatMap((slugs, i) => (slugs.length ? [slugs, i] : [])),
        -1,
      ]
    : -1;
  const areaMatch = present.some(Boolean)
    ? [
        "match",
        ["var", "pi"],
        ...palette.districts.flatMap((color, i) =>
          present[i] ? [i, paletteShadeExpression(color, palette)] : [],
        ),
        regionMatch,
      ]
    : regionMatch;
  return [
    "let",
    "pi",
    paletteIndex,
    "ramp",
    rampExpression(rampedRegions),
    ["step", ["zoom"], regionMatch, AREA_PALETTE_ZOOM, areaMatch],
  ] as unknown as string;
}

// The fill paint every wine polygon layer shares. `hide` is the world archive's
// handed-off multiplier (WORLD_HANDED_FACTOR) or null for a shard layer; it has
// to be folded into each zoom stop's output, because the zoom interpolation
// must stay the top-level expression.
function buildFillPaint(
  selectedKey: string | null,
  selectedId: string | null,
  areaColor: string,
  rampedRegions: string[],
  hide: unknown[] | null,
) {
  const sel = ["==", ["get", "key"], selectedKey ?? ""];
  const child = ["==", ["get", "parent_id"], selectedId ?? "__none__"];
  const hasSelection = selectedKey !== null;
  // Focus wrapper per zoom stop: the selection pops, its direct children
  // keep full presence (you drill into them), everything else fades to
  // 45% of its normal opacity. The selected fill still relaxes at deep
  // zoom so children render readably on top of it.
  const focus = (selectedOpacity: number, base: unknown) => {
    const focused = hasSelection
      ? ["case", sel, selectedOpacity, child, base, ["*", base, 0.45]]
      : ["case", sel, selectedOpacity, base];
    return hide ? ["*", focused, hide] : focused;
  };
  return {
    // Every fill already has a dedicated `line` outline layer drawn over it,
    // so MapLibre's built-in fill antialiasing is a redundant second edge
    // pass per fill layer. Turning it off removes that pass outright; the
    // outline layer keeps edges crisp, so it reads the same.
    "fill-antialias": false,
    "fill-color": areaColor,
    "fill-opacity": [
      "let",
      "ramp",
      rampExpression(rampedRegions),
      [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        focus(0.6, ["min", 0.5, ["*", 0.16, ["get", "tier"]]]),
        9,
        // Classification intensity: grand cru plots read solid, premier cru
        // firm, village land a light wash — the darkness ramp IS the
        // classification signal (paired with the shaded fill hue). Where the
        // region's ramp is off every level sits at one uniform mid opacity.
        focus(0.3, [
          "match",
          classificationExpr,
          "grand_cru",
          ["case", ["var", "ramp"], 0.65, 0.4],
          "premier_cru",
          ["case", ["var", "ramp"], 0.45, 0.4],
          "communal",
          ["case", ["var", "ramp"], 0.18, 0.4],
          ["min", 0.5, ["*", 0.08, ["get", "tier"]]],
        ]),
      ],
    ] as unknown as number,
  };
}

// The selection ring: a keyline casing (cream in light, near-black in dark)
// under a gold line, drawn only on the selected feature and above the ordinary
// outlines.
function selectedFilter(selectedKey: string | null) {
  return ["==", ["get", "key"], selectedKey ?? ""] as unknown as boolean;
}

// Labels are never hidden by selection (owner: dropping progressive
// hiding) — everything renders and the collision engine trims only where
// labels would overlap. Selection instead drives a three-tier weight
// system: selected loudest, related places (children, siblings, the
// parent) full presence, distant places lighter and last in collision.
function relatedExpression(
  selectedId: string | null,
  selectedParentId: string | null,
) {
  return [
    "any",
    ["==", ["get", "parent_id"], selectedId ?? "__none__"],
    ["==", ["get", "parent_id"], selectedParentId ?? "__none__"],
    ["==", ["get", "id"], selectedParentId ?? "__none__"],
  ];
}

// Typography hierarchy: regions largest (uppercase, spaced), then steadily
// smaller through subregions, appellations and crus — the map itself
// communicates depth. The selected place gets the highest visual priority
// (owner brief): larger, darkest, strongest halo, first in collision;
// neighbours stay readable a clear step lighter.
const LABEL_TIER_SIZE = [
  "match", ["get", "tier"], 0, 16, 1, 15, 2, 13.5, 3, 12, 4, 11, 10,
];
function labelLayout(
  selectedKey: string | null,
  selectedId: string | null,
  selectedParentId: string | null,
  english: boolean,
) {
  const base = {
    "text-field": (english
      ? englishTextFieldExpression()
      : ["get", "name"]) as unknown as string,
    "text-transform": [
      "match", ["get", "tier"], 0, "uppercase", 1, "uppercase", "none",
    ] as unknown as "none",
    "text-letter-spacing": [
      "match", ["get", "tier"], 0, 0.1, 1, 0.08, 0.02,
    ] as unknown as number,
  };
  if (!selectedKey) {
    return {
      ...base,
      "text-size": LABEL_TIER_SIZE as unknown as number,
      "symbol-sort-key": ["-", 10, ["get", "tier"]] as unknown as number,
    };
  }
  const sel = ["==", ["get", "key"], selectedKey];
  const related = relatedExpression(selectedId, selectedParentId);
  return {
    ...base,
    "text-size": [
      "+", LABEL_TIER_SIZE, ["case", sel, 2.5, related, 0, -0.5],
    ] as unknown as number,
    "symbol-sort-key": [
      "case", sel, -2, related, -1, ["-", 10, ["get", "tier"]],
    ] as unknown as number,
  };
}
function labelPaint(
  selectedKey: string | null,
  selectedId: string | null,
  selectedParentId: string | null,
  palette: MapPalette,
) {
  const { label } = palette;
  if (!selectedKey) {
    return {
      "text-color": label.text,
      "text-opacity": 1 as unknown as number,
      "text-halo-color": label.halo,
      "text-halo-width": 1.7 as unknown as number,
    };
  }
  const sel = ["==", ["get", "key"], selectedKey];
  const related = relatedExpression(selectedId, selectedParentId);
  return {
    "text-color": [
      "case", sel, label.selected, related, label.related, label.distant,
    ] as unknown as string,
    "text-opacity": ["case", sel, 1, related, 0.95, 0.8] as unknown as number,
    "text-halo-color": label.halo,
    "text-halo-width": ["case", sel, 2.2, related, 1.7, 1.3] as unknown as number,
  };
}

export function TileWineMap({
  manifest,
  selectedKey,
  selectedId,
  selectedParentId,
  cameraTarget,
  onSelect,
  expanded,
  onToggleExpanded,
  visibleKeys = null,
  shardCountries = {},
  areaSlugs = NO_SLUGS,
  english = false,
}: {
  manifest: WineMapManifest;
  selectedKey: string | null;
  /** The selected place's id — lets label/fade rules target its children. */
  selectedId: string | null;
  /** The selected place's parent id — keeps sibling labels visible. */
  selectedParentId: string | null;
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
  /** Every `area_key`/`group` value the tiles can carry, derived from the
      place tree (areaSlugsFromTree). The fill palette's slug->colour table is
      built from this whole list once, so it never changes with the viewport.
      Empty until the tree loads: region hues only, as before the first scan. */
  areaSlugs?: string[];
  /** English-names toggle: relabels the map, legend and tree from the curated
      local->English dictionary (Italia->Italy, Toscana->Tuscany). Client-side
      only — no tile rebuild. */
  english?: boolean;
}) {
  ensurePmtilesProtocol();
  const mapRef = useRef<MapRef>(null);

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
    // One style fetch (HTTP-cached after the first flip) and a diff of
    // basemap-only operations. A newer request aborts an older one's fetch; a
    // flip back before the first lands diffs to nothing and never fires
    // style.load. A failed fetch fires `error` and no style.load; since
    // requestedBasemapRef already names the new theme, flipping away and back
    // retries it.
    map.setStyle(BASEMAP_STYLE_URL[next], {
      diff: true,
      transformStyle: (prev, incoming) => {
        landingBasemapRef.current = next;
        return withWineLayers(prev, tuneBasemapStyle(incoming));
      },
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
  const mountedSet = useMemo(() => new Set(mountedShards), [mountedShards]);

  // Mounting a shard <Source> only STARTS its cold pmtiles header fetch. Keying
  // the world->shard handoff on `mountedShards` therefore told the world archive
  // to drop a region the instant the shard appeared, leaving it with no fill, no
  // outline and no label — a hole with the country wash showing through — until
  // the round trip finished. Worse on a tree selection, which force-mounts the
  // shard and drew a gold ring around an empty hole. Track what has actually
  // loaded and hand over only then; the brief overlap where both draw is a
  // moment of doubled opacity, which reads far better than a gap.
  //
  // This must be a LIVE reading, not a latch. Two ways a latched "ready" lies:
  //   - Re-mount. Unmounting a Source removes its tiles, so a shard that was
  //     ready, unmounted (zooming under SHARD_MIN_ZOOM, or panning past the
  //     150% pad) and re-mounted would be treated as handed off in the very
  //     commit that re-creates it — empty — bringing the hole straight back on
  //     every crossing after the first.
  //   - Vacuous load. A shard mounted by the 50% pad while its region is still
  //     off screen needs no tiles, so MapLibre reports isSourceLoaded true
  //     immediately; pan until the region is actually visible and the handoff
  //     has already happened against a source with nothing in it.
  // Re-reading isSourceLoaded per mounted shard handles both: it goes false
  // again while a re-created or newly-in-view source fetches, the world resumes
  // drawing that region, and the hand-off waits for real tiles.
  const [readyShards, setReadyShards] = useState<string[]>([]);
  const recomputeReady = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const next = mountedShards.filter((key) => {
      const id = shardSourceId(key);
      try {
        return Boolean(map.getSource(id)) && map.isSourceLoaded(id);
      } catch {
        return false;
      }
    });
    setReadyShards((prev) =>
      prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next,
    );
  }, [mountedShards]);
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
  // fillColorExpression only steps from regionMatch to the per-area/
  // classification palette at z8, so below that the legend's Areas and
  // Classification chips described colours that appeared nowhere on the map —
  // a Gevrey-Chambertin swatch in district red while every polygon on
  // screen was still Bourgogne petrol. Same threshold as the step.
  const areaPaletteLive = viewInfo.zoom >= AREA_PALETTE_ZOOM;

  // The one colour expression every wine fill and outline layer uses. Keyed on
  // the catalogue's slug list (changes once, when the tree loads), the ramp
  // latch (at most once per region per session) and the landed theme (a rare,
  // user-initiated flip) — never on the viewport.
  const areaColor = useMemo(
    () => fillColorExpression(areaSlugs, rampedRegions, paintTheme),
    [areaSlugs, rampedRegions, paintTheme],
  );
  // The world country and region layers' plain region hue; a module-level
  // table per theme, so the reference only changes on a flip.
  const regionColor = REGION_MATCH[paintTheme] as unknown as string;

  // Selection-aware paint. The zoom interpolation fades fills — the selected
  // parent included — as children appear, while outlines and labels persist
  // (spec: "the selected parent's fill fades while its outline and single
  // label remain").
  const fillPaint = useMemo(
    () => buildFillPaint(selectedKey, selectedId, areaColor, rampedRegions, null),
    [selectedKey, selectedId, areaColor, rampedRegions],
  );
  // The world archive's copy of the same paint, with the handed-off multiplier
  // folded in (see the effect on handedOffShards).
  const worldRegionFillPaint = useMemo(
    () =>
      buildFillPaint(
        selectedKey,
        selectedId,
        areaColor,
        rampedRegions,
        WORLD_HANDED_FACTOR,
      ),
    [selectedKey, selectedId, areaColor, rampedRegions],
  );

  // Shared by the shard outlines and the world archive's region outlines, so a
  // region drawn from either source is pixel-identical.
  const outlinePaint = useMemo(
    () => ({
      // Outlines follow the fill palette (classification colours at village
      // zoom) so deep levels aren't ringed in region teal.
      "line-color": areaColor,
      "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]] as unknown as number,
    }),
    [areaColor],
  );
  const worldRegionOutlinePaint = useMemo(
    () => ({
      ...outlinePaint,
      "line-opacity": WORLD_HANDED_FACTOR as unknown as number,
    }),
    [outlinePaint],
  );
  // Shard labels share one paint object, re-keyed only by selection or theme.
  const shardLabelPaint = useMemo(
    () => labelPaint(selectedKey, selectedId, selectedParentId, palette),
    [selectedKey, selectedId, selectedParentId, palette],
  );
  // World labels: the ordinary label paint with text-opacity multiplied by the
  // handed-off factor, so a region's world label vanishes with its fill.
  const worldLabelPaint = useMemo(
    () => ({
      ...shardLabelPaint,
      "text-opacity": [
        "*",
        shardLabelPaint["text-opacity"],
        WORLD_HANDED_FACTOR,
      ] as unknown as number,
    }),
    [shardLabelPaint],
  );
  // The selection ring and the keyline casing under it, world and shard alike.
  const selectedCasingPaint = useMemo(
    () => ({ "line-color": palette.selectedCasing, "line-width": 5, "line-opacity": 0.85 }),
    [palette],
  );
  const selectedRingPaint = useMemo(
    () => ({ "line-color": palette.selectedRing, "line-width": 2.5 }),
    [palette],
  );

  const attribution = useMemo(
    () => Object.values(manifest.attribution),
    [manifest],
  );

  // World layers carry the country (tier 0) and every region. A region whose
  // shard has loaded is not filtered out any more — it is hidden through
  // feature-state (see the effect on handedOffShards), so these filters are
  // static and a handoff rewrites nothing. A region whose shard is not loaded
  // is drawn from the world archive, by the region layers below which reuse
  // the shard paint exactly. That is what lets the map open with zero shard
  // archives (see SHARD_MIN_ZOOM) without changing a pixel.

  // Attribute filters (grape today, styles/designations later): when a
  // visible-key set is active, only those canonical keys render — fills,
  // outlines and labels alike — while the country outline (tier 0) stays as
  // geographic context. null = no filtering.
  //
  // No-filter must be an ALWAYS-TRUE expression, never `undefined`:
  // react-map-gl feeds the filter prop straight into addLayer, and MapLibre's
  // style validation rejects undefined — the layer then silently never
  // mounts, which blanked the whole map until a filter change forced a
  // re-add (the "only France until I toggle the grape filter" bug).
  const keyGate = useMemo(
    () =>
      visibleKeys == null
        ? null
        : ([
            "any",
            ["==", ["get", "tier"], 0],
            ["in", ["get", "key"], ["literal", visibleKeys]],
          ] as unknown as boolean),
    [visibleKeys],
  );
  // Every world label; the grape gate is the only thing that ever narrows it.
  const gatedWorldFilter = useMemo(() => keyGate ?? PASS_FILTER, [keyGate]);
  // Tier 0 only — the country wash, which has its own opacity ramp.
  const worldCountryFilter = useMemo(
    () =>
      (keyGate
        ? ["all", ["==", ["get", "tier"], 0], keyGate]
        : ["==", ["get", "tier"], 0]) as unknown as boolean,
    [keyGate],
  );
  // Every region (tier >= 1). Painted with the shards' own fill and outline
  // paint, so handing a region between archives is invisible; the handed-off
  // ones are zeroed by feature-state, not filtered, so this only changes on a
  // grape-filter pick.
  const worldRegionFilter = useMemo(() => {
    const base = [">=", ["get", "tier"], 1];
    return (keyGate ? ["all", base, keyGate] : base) as unknown as boolean;
  }, [keyGate]);

  // Subregion depth, one country at a time. A shard outside the focus country
  // renders only its regions (tier <= 1), so neighbours stay on the map as
  // geographic context instead of every country exploding into subregions and
  // appellations at once. Regions are never hidden, and tier 2+ only reveals
  // from z5 anyway, so this is inert at country/region zoom.
  const shardFilterFor = useCallback(
    (shardKey: string) => {
      const base = keyGate ?? PASS_FILTER;
      const country = shardCountries[shardKey];
      // Full depth only for the country you are actually viewing. With no focus
      // country (a frame spanning several) nothing goes below region level, so
      // a wide view is countries + regions rather than every country at once
      // stacking subregions, appellations and sites into the same pixels.
      // Unknown shard (tree not loaded yet) is left alone rather than blanked.
      if (!country) return base;
      if (focusCountry && country === focusCountry) return base;
      return ["all", base, ["<=", ["get", "tier"], 1]] as unknown as boolean;
    },
    [keyGate, focusCountry, shardCountries],
  );
  const selectedGate = useMemo(
    () =>
      (keyGate
        ? ["all", selectedFilter(selectedKey), keyGate]
        : selectedFilter(selectedKey)) as unknown as boolean,
    [selectedKey, keyGate],
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
        interactiveLayerIds={[
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
        ]}
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
          // collisions, and drop the clutter a wine map never uses. Measured:
          // a z14 tile over the Cote de Nuits carries 341 basemap features and
          // 11,049 vertices against 66 features and 637 vertices of ours,
          // across 93 basemap style layers versus our ~16 — so the context
          // map, not the wine data, is the bulk of what every frame draws.
          // The same rule tunes every swapped-in basemap (tuneBasemapStyle),
          // so a theme flip's diff never re-adds what this removes.
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
          e.target.on("style.load", () => {
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
        onMouseMove={(e) => {
          const map = mapRef.current;
          if (!map) return;
          // Mirror onClick's tier-0 guard. Without it the country fill made
          // most of France's surface advertise a pointer at z5-8 for a click
          // that is then deliberately discarded.
          const zoom = map.getZoom();
          const clickable = (e.features ?? []).some(
            (f) => ((f.properties as { tier?: number } | null)?.tier ?? 0) > 0 || zoom <= 5,
          );
          map.getCanvas().style.cursor = clickable ? "pointer" : "";
        }}
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
            row carries its own key, which no shard key ever equals). */}
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
              scans; both resolve to the same key/tier as the shard's copy. */}
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
            filter={worldCountryFilter}
            layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
            paint={{
              // See fillPaint: the outline layer supplies the edge, so the
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
            }}
          />
          <Layer
            id="world-outlines"
            type="line"
            source-layer="places"
            filter={worldCountryFilter}
            paint={{
              "line-color": regionColor,
              "line-width": ["case", ["==", ["get", "tier"], 0], 1, 1.5] as unknown as number,
            }}
          />
          {/* Regions no loaded shard is covering, drawn with the shards' own
              fill and outline paint. Below SHARD_MIN_ZOOM no shard is mounted at
              all, so these are what render the regions — identical pixels, but
              from one already-open archive instead of 54. */}
          <Layer
            id="world-region-fills"
            type="fill"
            source-layer="places"
            filter={worldRegionFilter}
            paint={worldRegionFillPaint}
            layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
          />
          <Layer
            id="world-region-outlines"
            type="line"
            source-layer="places"
            filter={worldRegionFilter}
            paint={worldRegionOutlinePaint}
          />
          <Layer
            id="world-selected-casing"
            type="line"
            source-layer="places"
            filter={selectedGate}
            paint={selectedCasingPaint}
          />
          <Layer
            id="world-selected-ring"
            type="line"
            source-layer="places"
            filter={selectedGate}
            paint={selectedRingPaint}
          />
          {/* A handed-off region's world label is invisible (text-opacity 0)
              but still occupies its collision box, so it must LOSE that
              collision to the shard's own label. MapLibre places symbol
              layers from the TOP of the style down (PauseablePlacement starts
              at order.length - 1), and the first placed wins — so the loser
              has to sit BELOW the shard label layers. It does: the world
              Source mounts first and every shard's layers are appended above
              it when the shard mounts, so no beforeId is needed. Do not move
              this layer above the shards' labels to "give it priority"; that
              would let the invisible copy blank the visible one. */}
          <Layer
            id="world-labels"
            type="symbol"
            source-layer="labels"
            filter={gatedWorldFilter}
            layout={labelLayout(selectedKey, selectedId, selectedParentId, english)}
            paint={worldLabelPaint}
          />
        </Source>
        {shardEntries
          .filter(([key]) => mountedSet.has(key))
          .map(([key, shard]) => (
          <Source
            key={key}
            id={shardSourceId(key)}
            type="vector"
            url={`pmtiles://${shard.url}`}
          >
            <Layer
              id={`shard-fills-${key}`}
              type="fill"
              source-layer="places"
              filter={shardFilterFor(key)}
              paint={fillPaint}
              layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
            />
            <Layer
              id={`shard-outlines-${key}`}
              type="line"
              source-layer="places"
              filter={shardFilterFor(key)}
              paint={outlinePaint}
            />
            {/* Only the owning shard can match selectedKey — on every other
                shard this pair is filtered to nothing, so mounting them here
                alone is pixel-identical and drops ~106 layers. */}
            {key === selectedShard && (
              <Layer
                id={`shard-selected-casing-${key}`}
                type="line"
                source-layer="places"
                filter={selectedGate}
                paint={selectedCasingPaint}
              />
            )}
            {key === selectedShard && (
              <Layer
                id={`shard-selected-ring-${key}`}
                type="line"
                source-layer="places"
                filter={selectedGate}
                paint={selectedRingPaint}
              />
            )}
            <Layer
              id={`shard-labels-${key}`}
              type="symbol"
              source-layer="labels"
              filter={shardFilterFor(key)}
              layout={labelLayout(selectedKey, selectedId, selectedParentId, english)}
              paint={shardLabelPaint}
            />
          </Source>
        ))}
      </Map>
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
