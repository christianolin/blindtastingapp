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
import type { WineMapManifest } from "@/lib/wine-map/manifest";
import { cn } from "@/lib/utils";

// Free, un-keyed Carto vector basemap — same as the legacy map.
const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

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

// Deterministic colour per region (canonical-key segment carried as the
// `region` tile property). Every live region is named — the fallback used to
// equal Bordeaux's claret, which painted Sud-Ouest/Beaujolais/Jura/etc. the
// identical maroon (owner: "Sud-Ouest and Bordeaux are too similar").
// Neighbouring regions get contrasting hue families: Bordeaux claret vs
// Sud-Ouest amber, Rhône rust vs Provence olive-gold, Bourgogne petrol vs
// Beaujolais plum.
export const REGION_COLORS: Record<string, string> = {
  france: "#6B6257",
  alsace: "#44548C",
  beaujolais: "#9A4E7A",
  bordeaux: "#5C1A2B",
  bourgogne: "#1F4E5F",
  champagne: "#8A6D3B",
  corse: "#A34D2B",
  jura: "#7A4E8C",
  "languedoc-roussillon": "#2F7A78",
  loire: "#2F6B4F",
  piemonte: "#7B2233",
  provence: "#9A6A2F",
  rhone: "#7A3B2E",
  savoie: "#5C7A3B",
  "sud-ouest": "#B0722C",
  toscana: "#C0872E",
  // Spain: the country outline is neutral context (like France's); each
  // comunidad shard gets its own hue as its DO wave ships (the comunidad REGION
  // node carries a region-overview boundary = union of its DOs' municipios).
  spain: "#6B6257",
  "castilla-y-leon": "#A8324A",
  cataluna: "#B5642A",
  aragon: "#6E7A34",
  murcia: "#8C3E7A",
  andalucia: "#C99A2E",
  galicia: "#2E7A5C",
  valencia: "#C0503A",
  "castilla-la-mancha": "#A6842E",
  "trentino-alto-adige": "#3A6E8C",
  veneto: "#4E8A5C",
  sicilia: "#C25A2C",
};
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
  "languedoc-roussillon": "Languedoc-Roussillon",
  rhone: "Rhône",
  "sud-ouest": "Sud-Ouest",
};
const FALLBACK_COLOR = "#6B6257";
const SELECTED_COLOR = "#B78E42";

const regionMatch = [
  "match",
  ["get", "region"],
  ...Object.entries(REGION_COLORS).flat(),
  FALLBACK_COLOR,
];

// Classification source: the `classification` tile property (appellation
// level, or Champagne's échelle village rating), falling back to `level`
// for tiles from before the property existed. It drives the fill-intensity
// ramp — darker, more saturated shades of the area hue for higher
// classifications — leaving gold reserved for selection alone.
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

// Curated palette for district colouring; slug-hashed so a group keeps its
// colour across sessions and republish cycles.
const DISTRICT_PALETTE = [
  "#8C2D3C", "#3E6B54", "#4A5D8C", "#9A6A2F", "#5C7A3B", "#7A4E8C",
  "#2F7A78", "#A34D2B", "#5B4A8C", "#3B6E8C", "#8C6D3B", "#6B4430",
];
export function districtColor(slug: string) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return DISTRICT_PALETTE[h % DISTRICT_PALETTE.length];
}

// Classification reads as INTENSITY of the area hue (vineyard-atlas style):
// grand cru darkest and most saturated, premier cru a step lighter, village
// land the plain hue. Shades are computed here in JS because MapLibre
// expressions cannot manipulate colours.
function shade(hex: string, lightness: number, saturation = 0) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l2 = Math.max(0, Math.min(1, l * lightness));
  const s2 = Math.max(0, Math.min(1, s + saturation));
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [r2, g2, b2] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}
export function classificationShades(hex: string) {
  // Owner: the previous 0.52/0.74 steps read too alike at wash opacity —
  // grand cru now drops to 45% lightness with a strong saturation push,
  // premier cru sits clearly between it and the plain village hue.
  return {
    grand_cru: shade(hex, 0.45, 0.3),
    premier_cru: shade(hex, 0.68, 0.14),
    base: hex,
  };
}

// Hue-grouping unit: village-level in Burgundy, sub-region in Champagne
// (the `area_key` tile property), falling back to the district group for
// tiles from before the property existed.
const areaExpr = ["coalesce", ["get", "area_key"], ["get", "group"], ""];

// Selection no longer recolours the shape — places keep their true palette
// colour and selection reads as a gold outline ring drawn above everything
// (plus a slight opacity lift in fillPaint).
const regionColor = regionMatch as unknown as string;

// Camera ("zoom") expressions must sit at the top level of a paint property,
// so the zoom step wraps the selection cases rather than the reverse.
function fillColorExpression(areaSlugs: string[], rampEnabled: boolean) {
  // From z8 every area (Burgundy village, Champagne sub-region, Bordeaux
  // district) gets its own hue, and WITHIN the hue classification reads as
  // intensity: grand cru darkest, premier cru mid, village land plain.
  // Region hue covers areas not yet observed by the viewport scan.
  // The intensity ramp is RELATIVE: it only applies when at least two
  // classification levels are actually in view — an all-grand-cru region
  // like Alsace has nothing to be darker THAN, so its vineyards keep the
  // plain area hue (owner: "darkest doesn't make sense there").
  const areaMatch = areaSlugs.length
    ? [
        "match",
        areaExpr,
        ...areaSlugs.flatMap((slug) => {
          const shades = classificationShades(districtColor(slug));
          return [
            slug,
            rampEnabled
              ? [
                  "match",
                  classificationExpr,
                  "grand_cru",
                  shades.grand_cru,
                  "premier_cru",
                  shades.premier_cru,
                  shades.base,
                ]
              : shades.base,
          ];
        }),
        regionMatch,
      ]
    : regionMatch;
  return [
    "step",
    ["zoom"],
    regionMatch,
    8,
    areaMatch,
  ] as unknown as string;
}

// The selection ring: cream casing under a gold line, drawn only on the
// selected feature and above the ordinary outlines.
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
) {
  const base = {
    "text-field": ["get", "name"] as unknown as string,
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
) {
  if (!selectedKey) {
    return {
      "text-color": "#2b0f18",
      "text-opacity": 1 as unknown as number,
      "text-halo-color": "#FFFDF7",
      "text-halo-width": 1.7 as unknown as number,
    };
  }
  const sel = ["==", ["get", "key"], selectedKey];
  const related = relatedExpression(selectedId, selectedParentId);
  return {
    "text-color": [
      "case", sel, "#1d0a11", related, "#3a2830", "#7a666f",
    ] as unknown as string,
    "text-opacity": ["case", sel, 1, related, 0.95, 0.8] as unknown as number,
    "text-halo-color": "#FFFDF7",
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
}) {
  ensurePmtilesProtocol();
  const mapRef = useRef<MapRef>(null);
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
  const shardKeys = useMemo(
    () => shardEntries.map(([key]) => key),
    [shardEntries],
  );

  // What's actually on screen — drives the dynamic legend (sections only
  // where they apply) and the district colours. Scanned on map idle; the
  // group set only accumulates so colours stay stable while panning.
  const [viewInfo, setViewInfo] = useState<{
    regions: string[];
    groups: { slug: string; name: string }[];
    classifications: string[];
  }>({ regions: [], groups: [], classifications: [] });
  // globalThis: `Map` in this module is the react-map-gl component.
  const allGroupsRef = useRef<globalThis.Map<string, string>>(new globalThis.Map());
  const [paintGroups, setPaintGroups] = useState<string[]>([]);
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
    const layers = [
      "world-fills",
      ...shardKeys.map((key) => `shard-fills-${key}`),
    ].filter((l) => map.getLayer(l));
    if (layers.length === 0) return;
    const regions = new Set<string>();
    const groups = new globalThis.Map<string, string>();
    const classifications = new Set<string>();
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
    for (const [slug, name] of groups) allGroupsRef.current.set(slug, name);
    setPaintGroups((prev) =>
      prev.length === allGroupsRef.current.size
        ? prev
        : [...allGroupsRef.current.keys()].sort(),
    );
    const next = {
      regions: [...regions].sort(),
      groups: [...groups.entries()]
        .map(([slug, name]) => ({ slug, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      classifications: [...classifications].sort(),
    };
    setViewInfo((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
    // shardKeys is genuinely needed: with an empty dep array this closed over
    // the first render's value, which is [] until the manifest resolves — so
    // the scan would only ever look at world-fills and the legend would never
    // see a shard layer. shardKeys is memoized off the manifest, so it changes
    // once; scanView is passed straight to onIdle, which re-binds for free.
  }, [shardKeys]);

  useEffect(() => {
    if (!cameraTarget) return;
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
  }, [cameraTarget]);

  // Selection-aware paint. The zoom interpolation fades fills — the selected
  // parent included — as children appear, while outlines and labels persist
  // (spec: "the selected parent's fill fades while its outline and single
  // label remain").
  // The classification ramp is comparative by nature: with only one level in
  // view (all-grand-cru Alsace) there is nothing to be darker than, so the
  // ramp switches off and every plot keeps its plain area hue at a uniform
  // mid opacity.
  const rampEnabled = viewInfo.classifications.length >= 2;

  const fillPaint = useMemo(() => {
    const sel = ["==", ["get", "key"], selectedKey ?? ""];
    const child = ["==", ["get", "parent_id"], selectedId ?? "__none__"];
    const hasSelection = selectedKey !== null;
    // Focus wrapper per zoom stop: the selection pops, its direct children
    // keep full presence (you drill into them), everything else fades to
    // 45% of its normal opacity. The selected fill still relaxes at deep
    // zoom so children render readably on top of it.
    const focus = (selectedOpacity: number, base: unknown) =>
      hasSelection
        ? ["case", sel, selectedOpacity, child, base, ["*", base, 0.45]]
        : ["case", sel, selectedOpacity, base];
    return {
      "fill-color": fillColorExpression(paintGroups, rampEnabled),
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        focus(0.6, ["min", 0.5, ["*", 0.16, ["get", "tier"]]]),
        9,
        // Classification intensity: grand cru plots read solid, premier cru
        // firm, village land a light wash — the darkness ramp IS the
        // classification signal (paired with the shaded fill hue).
        focus(0.3, [
          "match",
          classificationExpr,
          "grand_cru",
          rampEnabled ? 0.65 : 0.4,
          "premier_cru",
          rampEnabled ? 0.45 : 0.4,
          "communal",
          rampEnabled ? 0.18 : 0.4,
          ["min", 0.5, ["*", 0.08, ["get", "tier"]]],
        ]),
      ] as unknown as number,
    };
  }, [selectedKey, selectedId, paintGroups, rampEnabled]);

  const attribution = useMemo(
    () => Object.values(manifest.attribution),
    [manifest],
  );

  // World layers show the country (tier 0) and any region NOT served by a
  // mounted shard — with every shard mounted that means the shards own all
  // region rendering and the world archive only contributes France itself.
  const worldFilter = useMemo(
    () =>
      [
        "any",
        ["==", ["get", "tier"], 0],
        ["!", ["in", ["get", "region"], ["literal", shardKeys]]],
      ] as unknown as boolean,
    [shardKeys],
  );

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
  const gatedWorldFilter = useMemo(
    () =>
      (keyGate ? ["all", worldFilter, keyGate] : worldFilter) as unknown as boolean,
    [worldFilter, keyGate],
  );
  const selectedGate = useMemo(
    () =>
      (keyGate
        ? ["all", selectedFilter(selectedKey), keyGate]
        : selectedFilter(selectedKey)) as unknown as boolean,
    [selectedKey, keyGate],
  );


  // Legend regions follow the viewport once the first scan lands; the
  // manifest's shard list covers the initial paint.
  const legendRegions = useMemo(() => {
    const keys = viewInfo.regions.length
      ? viewInfo.regions
      : Object.keys(manifest.shards).sort();
    return keys.map((key) => ({
      key,
      label: REGION_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
      color: REGION_COLORS[key] ?? FALLBACK_COLOR,
    }));
  }, [manifest, viewInfo.regions]);

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
        mapStyle={BASEMAP_STYLE}
        initialViewState={{ longitude: 2.4, latitude: 46.6, zoom: 4.4 }}
        interactiveLayerIds={[
          "world-fills",
          ...shardKeys.map((key) => `shard-fills-${key}`),
        ]}
        onLoad={(e) => {
          // MapLibre's compact attribution control mounts expanded; collapse
          // it so only the "i" toggle shows until the user opens it.
          const details = e.target
            .getContainer()
            .querySelector("details.maplibregl-ctrl-attrib");
          details?.classList.remove("maplibregl-compact-show");
          details?.removeAttribute("open");
          // Give the wine labels the low-zoom stage: MapLibre places lower
          // (basemap) symbol layers first, so Positron's own "FRANCE" and
          // city names were winning collisions against our region labels
          // (BORDEAUX/BOURGOGNE/BEAUJOLAIS silently dropped). Push the
          // basemap's place labels to z7+, where they return as useful
          // village-zoom context (Épernay, Châlons…) and our tier-1 labels
          // are no longer contending.
          for (const layer of e.target.getStyle().layers ?? []) {
            if (
              layer.type === "symbol" &&
              "source-layer" in layer &&
              layer["source-layer"] === "place"
            ) {
              e.target.setLayerZoomRange(
                layer.id,
                Math.max(7, layer.minzoom ?? 0),
                layer.maxzoom ?? 24,
              );
            }
          }
        }}
        onClick={(e) => {
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
        onIdle={scanView}
        onMouseMove={(e) => {
          const map = mapRef.current;
          if (map) {
            map.getCanvas().style.cursor = e.features?.length ? "pointer" : "";
          }
        }}
        attributionControl={{ compact: true, customAttribution: attribution }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Zoom +/- plus a pitch-aware compass: drag the compass to rotate
            the bearing, click it to reset north and level the camera
            (visualizePitch shows the current tilt). Top-left keeps clear of
            the expand button (top-right) and the legend (bottom-left). */}
        <NavigationControl position="top-left" visualizePitch />
        <Source id="wine-world" type="vector" url={`pmtiles://${manifest.world.url}`}>
          {/* The world archive carries the country plus every region, so
              selecting France shows all its regions. A region already served
              by the mounted shard is filtered out to avoid double-drawing. */}
          <Layer
            id="world-fills"
            type="fill"
            source-layer="places"
            filter={gatedWorldFilter}
            paint={{
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
            filter={gatedWorldFilter}
            paint={{
              "line-color": regionColor,
              "line-width": ["case", ["==", ["get", "tier"], 0], 1, 1.5] as unknown as number,
            }}
          />
          <Layer
            id="world-selected-casing"
            type="line"
            source-layer="places"
            filter={selectedGate}
            paint={{ "line-color": "#FFFDF7", "line-width": 5, "line-opacity": 0.85 }}
          />
          <Layer
            id="world-selected-ring"
            type="line"
            source-layer="places"
            filter={selectedGate}
            paint={{ "line-color": SELECTED_COLOR, "line-width": 2.5 }}
          />
          <Layer
            id="world-labels"
            type="symbol"
            source-layer="labels"
            filter={gatedWorldFilter}
            layout={labelLayout(selectedKey, selectedId, selectedParentId)}
            paint={labelPaint(selectedKey, selectedId, selectedParentId)}
          />
        </Source>
        {shardEntries.map(([key, shard]) => (
          <Source
            key={key}
            id={`wine-shard-${key}`}
            type="vector"
            url={`pmtiles://${shard.url}`}
          >
            <Layer
              id={`shard-fills-${key}`}
              type="fill"
              source-layer="places"
              filter={keyGate ?? PASS_FILTER}
              paint={fillPaint}
            />
            <Layer
              id={`shard-outlines-${key}`}
              type="line"
              source-layer="places"
              filter={keyGate ?? PASS_FILTER}
              paint={{
                // Outlines follow the fill palette (classification colours at
                // village zoom) so deep levels aren't ringed in region teal.
                "line-color": fillColorExpression(paintGroups, rampEnabled),
                "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]] as unknown as number,
              }}
            />
            <Layer
              id={`shard-selected-casing-${key}`}
              type="line"
              source-layer="places"
              filter={selectedGate}
              paint={{ "line-color": "#FFFDF7", "line-width": 5, "line-opacity": 0.85 }}
            />
            <Layer
              id={`shard-selected-ring-${key}`}
              type="line"
              source-layer="places"
              filter={selectedGate}
              paint={{ "line-color": SELECTED_COLOR, "line-width": 2.5 }}
            />
            <Layer
              id={`shard-labels-${key}`}
              type="symbol"
              source-layer="labels"
              filter={keyGate ?? PASS_FILTER}
              layout={labelLayout(selectedKey, selectedId, selectedParentId)}
              paint={labelPaint(selectedKey, selectedId, selectedParentId)}
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
              style={{ borderColor: "#B78E42" }}
            />
            Selected (gold ring)
          </li>
        </ul>
        {viewInfo.groups.length > 0 ? (
          <>
            <p className="mb-1 mt-2 font-medium text-foreground">Areas</p>
            <ul className="flex flex-col gap-0.5">
              {viewInfo.groups.slice(0, 9).map((group) => (
                <li key={group.slug} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-sm"
                    style={{ backgroundColor: districtColor(group.slug) }}
                  />
                  {group.name}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {viewInfo.classifications.length > 0
          ? (() => {
              // Shade chips borrow the first visible area's hue so the
              // legend ramp matches what's on screen: darker = higher
              // classification.
              const sample = viewInfo.groups[0]
                ? districtColor(viewInfo.groups[0].slug)
                : FALLBACK_COLOR;
              const shades = classificationShades(sample);
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
                        {rampEnabled ? "Grand cru (darkest)" : "Grand cru"}
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
