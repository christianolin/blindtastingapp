"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import { Maximize2, Minimize2 } from "lucide-react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WineMapManifest } from "@/lib/wine-map/manifest";
import { shardKeyFor } from "@/lib/wine-map/shard";

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
  maxZoom: number;
};

// Deterministic colour per region (canonical-key segment carried as the
// `region` tile property); unknown regions fall back to the brand base.
export const REGION_COLORS: Record<string, string> = {
  bordeaux: "#5C1A2B",
  bourgogne: "#1F4E5F",
  champagne: "#8A6D3B",
  loire: "#2F6B4F",
  rhone: "#7A3B2E",
  alsace: "#44548C",
};
const FALLBACK_COLOR = "#5C1A2B";
const SELECTED_COLOR = "#B78E42";
// Global classification palette at village zoom (legend-learnable across
// regions): grands crus dark red, premier cru lighter red; village land and
// broader shapes keep their region hue.
export const LEVEL_COLORS = {
  grand_cru: "#7E1B26",
  premier_cru: "#C4485B",
};

const regionMatch = [
  "match",
  ["get", "region"],
  ...Object.entries(REGION_COLORS).flat(),
  FALLBACK_COLOR,
];

// Regions whose deep-zoom palette is the legal classification hierarchy
// (grand cru / premier cru / village). Everywhere else the deep palette is
// per-area district colours (Bordeaux: Medoc, Graves, Pomerol, ...) - each
// region gets the scheme that matches how its wines are organised.
export const CLASSIFICATION_REGIONS = new Set(["bourgogne"]);

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

// Selection no longer recolours the shape — places keep their true palette
// colour and selection reads as a gold outline ring drawn above everything
// (plus a slight opacity lift in fillPaint).
const regionColor = regionMatch as unknown as string;

// Camera ("zoom") expressions must sit at the top level of a paint property,
// so the zoom step wraps the selection cases rather than the reverse.
function fillColorExpression(groupSlugs: string[], communalKeys: string[]) {
  // From z8 the palette is region-aware: classification regions colour by
  // cru level, district regions by area group (region hue for groups not
  // yet observed, or tiles predating the group property).
  const groupMatch = groupSlugs.length
    ? [
        "match",
        ["get", "group"],
        ...groupSlugs.flatMap((slug) => [slug, districtColor(slug)]),
        regionMatch,
      ]
    : regionMatch;
  // Owner: Burgundy appellations "all just look the same" — every village
  // gets its own slug-stable hue; crus keep the classification reds on top.
  const villageMatch = communalKeys.length
    ? [
        "match",
        ["get", "key"],
        ...communalKeys.flatMap((key) => [key, districtColor(key)]),
        regionMatch,
      ]
    : regionMatch;
  const classificationMatch = [
    "match",
    ["get", "level"],
    "grand_cru",
    LEVEL_COLORS.grand_cru,
    "premier_cru",
    LEVEL_COLORS.premier_cru,
    "communal",
    villageMatch,
    regionMatch,
  ];
  const deepMatch = [
    "match",
    ["get", "region"],
    [...CLASSIFICATION_REGIONS],
    classificationMatch,
    groupMatch,
  ];
  return [
    "step",
    ["zoom"],
    regionMatch,
    8,
    deepMatch,
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
}: {
  manifest: WineMapManifest;
  selectedKey: string | null;
  /** The selected place's id — lets label/fade rules target its children. */
  selectedId: string | null;
  /** The selected place's parent id — keeps sibling labels visible. */
  selectedParentId: string | null;
  cameraTarget: CameraTarget | null;
  onSelect: (key: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  ensurePmtilesProtocol();
  const mapRef = useRef<MapRef>(null);
  // On-demand shard loading: only the selected place's region shard is
  // mounted (plus the always-on world archive), so entering a region fetches
  // just that shard. Viewport-driven loading via each shard's bbox is a
  // documented follow-up.
  const activeShardKey = selectedKey ? shardKeyFor(selectedKey) : null;
  // Transitional: the live v1 manifest exposes a single "france" shard; fall
  // back to it until the first v2 promote publishes per-region shards.
  const activeShard =
    (activeShardKey ? manifest.shards[activeShardKey] : undefined) ??
    manifest.shards.france ??
    null;

  // What's actually on screen — drives the dynamic legend (sections only
  // where they apply) and the district colours. Scanned on map idle; the
  // group set only accumulates so colours stay stable while panning.
  const [viewInfo, setViewInfo] = useState<{
    regions: string[];
    groups: { slug: string; name: string }[];
    hasCru: boolean;
  }>({ regions: [], groups: [], hasCru: false });
  // globalThis: `Map` in this module is the react-map-gl component.
  const allGroupsRef = useRef<globalThis.Map<string, string>>(new globalThis.Map());
  const [paintGroups, setPaintGroups] = useState<string[]>([]);
  const allCommunalsRef = useRef<Set<string>>(new Set());
  const [paintCommunals, setPaintCommunals] = useState<string[]>([]);
  const scanView = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const layers = ["shard-fills", "world-fills"].filter((l) => map.getLayer(l));
    if (layers.length === 0) return;
    const regions = new Set<string>();
    const groups = new globalThis.Map<string, string>();
    let hasCru = false;
    for (const feature of map.queryRenderedFeatures({ layers })) {
      const p = (feature.properties ?? {}) as Record<string, unknown>;
      const region = typeof p.region === "string" ? p.region : null;
      if (region) regions.add(region);
      if (p.level === "grand_cru" || p.level === "premier_cru") hasCru = true;
      if (
        region &&
        !CLASSIFICATION_REGIONS.has(region) &&
        typeof p.group === "string" &&
        p.group
      ) {
        groups.set(p.group, typeof p.group_name === "string" ? p.group_name : p.group);
      }
      if (
        region &&
        CLASSIFICATION_REGIONS.has(region) &&
        p.level === "communal" &&
        typeof p.key === "string"
      ) {
        allCommunalsRef.current.add(p.key);
      }
    }
    for (const [slug, name] of groups) allGroupsRef.current.set(slug, name);
    setPaintGroups((prev) =>
      prev.length === allGroupsRef.current.size
        ? prev
        : [...allGroupsRef.current.keys()].sort(),
    );
    setPaintCommunals((prev) =>
      prev.length === allCommunalsRef.current.size
        ? prev
        : [...allCommunalsRef.current].sort(),
    );
    const next = {
      regions: [...regions].sort(),
      groups: [...groups.entries()]
        .map(([slug, name]) => ({ slug, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      hasCru,
    };
    setViewInfo((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, []);

  useEffect(() => {
    if (!cameraTarget) return;
    const map = mapRef.current;
    const [minX, minY, maxX, maxY] = cameraTarget.bbox;
    const fit = () =>
      map?.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 48, duration: 900, maxZoom: cameraTarget.maxZoom },
      );
    const inner = map?.getMap();
    if (!inner) {
      fit();
      return;
    }
    // Only move the camera when the selection isn't already well framed. If
    // its centre is on screen at a comfortable size (e.g. you can see the
    // neighbouring Médoc communes and click one), leave the view untouched;
    // reframe only when it's off-screen or too small/large — so tree
    // navigation to a distant place still flies there.
    const b = inner.getBounds();
    const viewW = b.getEast() - b.getWest();
    const viewH = b.getNorth() - b.getSouth();
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const centreVisible =
      cx > b.getWest() && cx < b.getEast() && cy > b.getSouth() && cy < b.getNorth();
    const spanFrac = Math.max((maxX - minX) / viewW, (maxY - minY) / viewH);
    if (centreVisible && spanFrac >= 0.18 && spanFrac <= 1.3) return;
    fit();
  }, [cameraTarget]);

  // Selection-aware paint. The zoom interpolation fades fills — the selected
  // parent included — as children appear, while outlines and labels persist
  // (spec: "the selected parent's fill fades while its outline and single
  // label remain").
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
      "fill-color": fillColorExpression(paintGroups, paintCommunals),
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        focus(0.6, ["min", 0.5, ["*", 0.16, ["get", "tier"]]]),
        9,
        focus(0.25, ["min", 0.5, ["*", 0.08, ["get", "tier"]]]),
        10,
        // Classification palette takes over: crus read as solid plots,
        // village land stays a light regional wash.
        focus(0.32, [
          "match",
          ["get", "level"],
          "grand_cru",
          0.55,
          "premier_cru",
          0.38,
          "communal",
          0.16,
          0.1,
        ]),
      ] as unknown as number,
    };
  }, [selectedKey, selectedId, paintGroups, paintCommunals]);

  const attribution = useMemo(
    () => Object.values(manifest.attribution),
    [manifest],
  );

  // World layers show the country (tier 0) and every region NOT already
  // rendered by the mounted shard — so France's regions are always visible.
  const worldFilter = useMemo(
    () =>
      [
        "any",
        ["==", ["get", "tier"], 0],
        ["!=", ["get", "region"], activeShardKey ?? ""],
      ] as unknown as boolean,
    [activeShardKey],
  );

  // Legend regions follow the viewport once the first scan lands; the
  // manifest's shard list covers the initial paint.
  const legendRegions = useMemo(() => {
    const keys = viewInfo.regions.length
      ? viewInfo.regions
      : Object.keys(manifest.shards).sort();
    return keys.map((key) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      color: REGION_COLORS[key] ?? FALLBACK_COLOR,
    }));
  }, [manifest, viewInfo.regions]);

  return (
    <div className="relative h-full overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-label={expanded ? "Exit full view" : "Full view"}
        className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background/85 p-1.5 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
      <Map
        ref={mapRef}
        mapStyle={BASEMAP_STYLE}
        initialViewState={{ longitude: 2.4, latitude: 46.6, zoom: 4.4 }}
        interactiveLayerIds={["shard-fills", "world-fills"]}
        onLoad={(e) => {
          // MapLibre's compact attribution control mounts expanded; collapse
          // it so only the "i" toggle shows until the user opens it.
          const details = e.target
            .getContainer()
            .querySelector("details.maplibregl-ctrl-attrib");
          details?.classList.remove("maplibregl-compact-show");
          details?.removeAttribute("open");
        }}
        onClick={(e) => {
          // Smallest-wins: deepest tier first, then the smallest footprint —
          // so a click inside an enclave (Canon-Fronsac within Fronsac's
          // envelope, La Tâche under the village) always hits the most
          // specific shape. min_zoom breaks residual ties on old tiles
          // without the area property.
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
              tier > best.tier ||
              (tier === best.tier &&
                (area < best.area ||
                  (area === best.area && minZoom > best.minZoom)))
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
          onSelect(best.key);
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
        <Source id="wine-world" type="vector" url={`pmtiles://${manifest.world.url}`}>
          {/* The world archive carries the country plus every region, so
              selecting France shows all its regions. A region already served
              by the mounted shard is filtered out to avoid double-drawing. */}
          <Layer
            id="world-fills"
            type="fill"
            source-layer="places"
            filter={worldFilter}
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
            filter={worldFilter}
            paint={{
              "line-color": regionColor,
              "line-width": ["case", ["==", ["get", "tier"], 0], 1, 1.5] as unknown as number,
            }}
          />
          <Layer
            id="world-selected-casing"
            type="line"
            source-layer="places"
            filter={selectedFilter(selectedKey)}
            paint={{ "line-color": "#FFFDF7", "line-width": 5, "line-opacity": 0.85 }}
          />
          <Layer
            id="world-selected-ring"
            type="line"
            source-layer="places"
            filter={selectedFilter(selectedKey)}
            paint={{ "line-color": SELECTED_COLOR, "line-width": 2.5 }}
          />
          <Layer
            id="world-labels"
            type="symbol"
            source-layer="labels"
            filter={worldFilter}
            layout={labelLayout(selectedKey, selectedId, selectedParentId)}
            paint={labelPaint(selectedKey, selectedId, selectedParentId)}
          />
        </Source>
        {activeShard ? (
          <Source id="wine-shard" type="vector" url={`pmtiles://${activeShard.url}`}>
            <Layer
              id="shard-fills"
              type="fill"
              source-layer="places"
              paint={fillPaint}
            />
            <Layer
              id="shard-outlines"
              type="line"
              source-layer="places"
              paint={{
                // Outlines follow the fill palette (classification colours at
                // village zoom) so deep levels aren't ringed in region teal.
                "line-color": fillColorExpression(paintGroups, paintCommunals),
                "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]] as unknown as number,
              }}
            />
            <Layer
              id="shard-selected-casing"
              type="line"
              source-layer="places"
              filter={selectedFilter(selectedKey)}
              paint={{ "line-color": "#FFFDF7", "line-width": 5, "line-opacity": 0.85 }}
            />
            <Layer
              id="shard-selected-ring"
              type="line"
              source-layer="places"
              filter={selectedFilter(selectedKey)}
              paint={{ "line-color": SELECTED_COLOR, "line-width": 2.5 }}
            />
            <Layer
              id="shard-labels"
              type="symbol"
              source-layer="labels"
              layout={labelLayout(selectedKey, selectedId, selectedParentId)}
              paint={labelPaint(selectedKey, selectedId, selectedParentId)}
            />
          </Source>
        ) : null}
      </Map>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-border bg-background/85 px-2.5 py-2 text-[11px] leading-tight text-muted-foreground backdrop-blur-sm">
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
        {viewInfo.hasCru ? (
          <>
            <p className="mb-1 mt-2 font-medium text-foreground">Classification</p>
            <ul className="flex flex-col gap-0.5">
              <li className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-sm"
                  style={{ backgroundColor: LEVEL_COLORS.grand_cru }}
                />
                Grand Cru
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-sm"
                  style={{ backgroundColor: LEVEL_COLORS.premier_cru }}
                />
                Premier Cru
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm border border-border bg-transparent" />
                Villages (own colour each)
              </li>
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
