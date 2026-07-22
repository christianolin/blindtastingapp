"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, {
  FullscreenControl,
  Layer,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
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

function regionColorExpression(selectedKey: string | null) {
  return [
    "case",
    ["==", ["get", "key"], selectedKey ?? ""],
    SELECTED_COLOR,
    [
      "match",
      ["get", "region"],
      ...Object.entries(REGION_COLORS).flat(),
      FALLBACK_COLOR,
    ],
  ] as unknown as string;
}

export function TileWineMap({
  manifest,
  selectedKey,
  cameraTarget,
  onSelect,
}: {
  manifest: WineMapManifest;
  selectedKey: string | null;
  cameraTarget: CameraTarget | null;
  onSelect: (key: string) => void;
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
      "fill-color": regionColorExpression(selectedKey),
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
      ] as unknown as number,
    }),
    [selectedKey],
  );

  const attribution = useMemo(
    () => Object.values(manifest.attribution),
    [manifest],
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
    <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border">
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
          let best: { key: string; tier: number } | null = null;
          for (const feature of e.features ?? []) {
            const p = feature.properties as { key?: string; tier?: number };
            if (typeof p.key !== "string") continue;
            if (!best || (p.tier ?? 0) > best.tier) {
              best = { key: p.key, tier: p.tier ?? 0 };
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
        <FullscreenControl position="top-right" />
        <Source id="wine-world" type="vector" url={`pmtiles://${manifest.world.url}`}>
          {/* The world archive contributes only the country outline; each
              region renders from its own on-demand shard to avoid double-
              drawing (regions exist in both archives). */}
          <Layer
            id="world-fills"
            type="fill"
            source-layer="places"
            filter={["==", ["get", "key"], "france"]}
            paint={{
              "fill-color": "#5C1A2B",
              "fill-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                0.12,
                5,
                0.03,
              ] as unknown as number,
            }}
          />
          <Layer
            id="world-outlines"
            type="line"
            source-layer="places"
            filter={["==", ["get", "key"], "france"]}
            paint={{ "line-color": "#5C1A2B", "line-width": 1 }}
          />
          <Layer
            id="world-labels"
            type="symbol"
            source-layer="labels"
            filter={["==", ["get", "key"], "france"]}
            layout={{ "text-field": ["get", "name"], "text-size": 12 }}
            paint={{
              "text-color": "#3d1220",
              "text-halo-color": "#F5EFE3",
              "text-halo-width": 1,
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
                "line-color": regionColorExpression(selectedKey),
                "line-width": ["+", 0.5, ["*", 0.5, ["get", "tier"]]] as unknown as number,
              }}
            />
            <Layer
              id="shard-labels"
              type="symbol"
              source-layer="labels"
              layout={{
                "text-field": ["get", "name"],
                "text-size": 11,
                // Deeper (smaller) places label first so commune names
                // survive collision against their parent's label.
                "symbol-sort-key": ["-", 10, ["get", "tier"]] as unknown as number,
              }}
              paint={{
                "text-color": "#3d1220",
                "text-halo-color": "#F5EFE3",
                "text-halo-width": 1,
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
        <p className="mt-1">Deeper levels fade as you zoom in.</p>
      </div>
    </div>
  );
}
