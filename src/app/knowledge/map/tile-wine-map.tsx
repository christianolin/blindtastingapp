"use client";

import { useEffect, useMemo, useRef } from "react";
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

const levelMatch = [
  "match",
  ["get", "level"],
  "grand_cru",
  LEVEL_COLORS.grand_cru,
  "premier_cru",
  LEVEL_COLORS.premier_cru,
  regionMatch,
];

function regionColorExpression(selectedKey: string | null) {
  return [
    "case",
    ["==", ["get", "key"], selectedKey ?? ""],
    SELECTED_COLOR,
    regionMatch,
  ] as unknown as string;
}

// Camera ("zoom") expressions must sit at the top level of a paint property,
// so the zoom step wraps the selection cases rather than the reverse.
function fillColorExpression(selectedKey: string | null) {
  const selected = ["==", ["get", "key"], selectedKey ?? ""];
  return [
    "step",
    ["zoom"],
    ["case", selected, SELECTED_COLOR, regionMatch],
    10,
    ["case", selected, SELECTED_COLOR, levelMatch],
  ] as unknown as string;
}

export function TileWineMap({
  manifest,
  selectedKey,
  cameraTarget,
  onSelect,
  expanded,
  onToggleExpanded,
}: {
  manifest: WineMapManifest;
  selectedKey: string | null;
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

  useEffect(() => {
    if (!cameraTarget) return;
    const [minX, minY, maxX, maxY] = cameraTarget.bbox;
    mapRef.current?.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 48, duration: 900, maxZoom: cameraTarget.maxZoom },
    );
  }, [cameraTarget]);

  // Selection-aware paint. The zoom interpolation fades fills — the selected
  // parent included — as children appear, while outlines and labels persist
  // (spec: "the selected parent's fill fades while its outline and single
  // label remain").
  const fillPaint = useMemo(
    () => ({
      "fill-color": fillColorExpression(selectedKey),
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        [
          "case",
          ["==", ["get", "key"], selectedKey ?? ""],
          0.55,
          ["min", 0.5, ["*", 0.16, ["get", "tier"]]],
        ],
        9,
        [
          "case",
          ["==", ["get", "key"], selectedKey ?? ""],
          0.18,
          ["min", 0.5, ["*", 0.08, ["get", "tier"]]],
        ],
        10,
        // Classification palette takes over: crus read as solid plots,
        // village land stays a light regional wash.
        [
          "case",
          ["==", ["get", "key"], selectedKey ?? ""],
          0.4,
          [
            "match",
            ["get", "level"],
            "grand_cru",
            0.55,
            "premier_cru",
            0.38,
            "communal",
            0.16,
            0.1,
          ],
        ],
      ] as unknown as number,
    }),
    [selectedKey],
  );

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

  const legendRegions = useMemo(
    () =>
      Object.keys(manifest.shards)
        .sort()
        .map((key) => ({
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
          color: REGION_COLORS[key] ?? FALLBACK_COLOR,
        })),
    [manifest],
  );

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
        initialViewState={{ longitude: -0.58, latitude: 44.84, zoom: 6 }}
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
          if (best) onSelect(best.key);
        }}
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
              "fill-color": regionColorExpression(selectedKey),
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
              "line-color": regionColorExpression(selectedKey),
              "line-width": ["case", ["==", ["get", "tier"], 0], 1, 1.5] as unknown as number,
            }}
          />
          <Layer
            id="world-labels"
            type="symbol"
            source-layer="labels"
            filter={worldFilter}
            layout={{ "text-field": ["get", "name"], "text-size": 12 }}
            paint={{
              "text-color": "#2b0f18",
              "text-halo-color": "#FFFDF7",
              "text-halo-width": 1.7,
            }}
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
                "line-color": fillColorExpression(selectedKey),
                "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]] as unknown as number,
              }}
            />
            <Layer
              id="shard-labels"
              type="symbol"
              source-layer="labels"
              layout={{
                "text-field": ["get", "name"],
                "text-size": 12,
                // Deeper (smaller) places label first so commune names
                // survive collision against their parent's label.
                "symbol-sort-key": ["-", 10, ["get", "tier"]] as unknown as number,
              }}
              paint={{
                // Strong near-white halo keeps names legible on the solid
                // cru fills (owner: labels were muddy on dark red).
                "text-color": "#2b0f18",
                "text-halo-color": "#FFFDF7",
                "text-halo-width": 1.7,
              }}
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
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: "#B78E42" }}
            />
            Selected
          </li>
        </ul>
        <p className="mb-1 mt-2 font-medium text-foreground">Village zoom</p>
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
            Village (region colour)
          </li>
        </ul>
      </div>
    </div>
  );
}
