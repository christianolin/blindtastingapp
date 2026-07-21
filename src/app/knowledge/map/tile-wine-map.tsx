"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WineMapManifest } from "@/lib/wine-map/manifest";

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
  const franceShard = manifest.shards.france ?? null;

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
      "fill-color": [
        "case",
        ["==", ["get", "key"], selectedKey ?? ""],
        "#B78E42",
        "#5C1A2B",
      ] as unknown as string,
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

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border">
      <Map
        ref={mapRef}
        mapStyle={BASEMAP_STYLE}
        initialViewState={{ longitude: -0.58, latitude: 44.84, zoom: 6 }}
        interactiveLayerIds={["france-fills", "world-fills"]}
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
        <Source id="wine-world" type="vector" url={`pmtiles://${manifest.world.url}`}>
          {/* The pilot always loads the france shard, so the world archive
              contributes only the country outline; Bordeaux renders from the
              shard to avoid double-drawing (it exists in both archives). */}
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
        {franceShard ? (
          <Source id="wine-france" type="vector" url={`pmtiles://${franceShard.url}`}>
            <Layer
              id="france-fills"
              type="fill"
              source-layer="places"
              paint={fillPaint}
            />
            <Layer
              id="france-outlines"
              type="line"
              source-layer="places"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "key"], selectedKey ?? ""],
                  "#B78E42",
                  "#5C1A2B",
                ] as unknown as string,
                "line-width": ["+", 0.5, ["*", 0.5, ["get", "tier"]]] as unknown as number,
              }}
            />
            <Layer
              id="france-labels"
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
    </div>
  );
}
