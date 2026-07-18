"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import bbox from "@turf/bbox";
import type { Geometry } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Database } from "@/lib/supabase/database.types";

type WineMapNode = Database["public"]["Tables"]["wine_map_nodes"]["Row"];

// Free, un-keyed Carto vector basemap — clean and muted so the polygons pop.
const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const APPELLATION_LAYER_ID = "appellation-fills";

function geometryOf(node: WineMapNode): Geometry | null {
  return (node.boundary_geojson as Geometry | null) ?? null;
}

function toFeature(node: WineMapNode) {
  const geometry = geometryOf(node);
  if (!geometry) return null;
  return {
    type: "Feature" as const,
    properties: { id: node.id, name: node.name },
    geometry,
  };
}

export function InteractiveWineMap({
  region,
  appellations,
  focusedId,
  onFocus,
}: {
  region: WineMapNode | null;
  appellations: WineMapNode[];
  focusedId: string | null;
  onFocus: (id: string) => void;
}) {
  const mapRef = useRef<MapRef>(null);

  const appellationCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: appellations
        .map(toFeature)
        .filter((f): f is NonNullable<typeof f> => f !== null),
    }),
    [appellations],
  );

  const regionFeature = useMemo(
    () => (region ? toFeature(region) : null),
    [region],
  );

  // Auto-fit: fly to the focused node's shape; if the focused node has no
  // boundary (or nothing is focused), fall back to the region's shape.
  useEffect(() => {
    const focusedNode =
      appellations.find((n) => n.id === focusedId) ??
      (region?.id === focusedId ? region : null);
    const target =
      (focusedNode && geometryOf(focusedNode)) ??
      (region && geometryOf(region));
    if (!target) return;
    const [minX, minY, maxX, maxY] = bbox(target);
    mapRef.current?.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 48, duration: 900, maxZoom: 11 },
    );
  }, [focusedId, region, appellations]);

  if (appellationCollection.features.length === 0 && !regionFeature) {
    return null;
  }

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border">
      <Map
        ref={mapRef}
        mapStyle={BASEMAP_STYLE}
        initialViewState={{ longitude: -0.58, latitude: 44.84, zoom: 7 }}
        interactiveLayerIds={[APPELLATION_LAYER_ID]}
        onClick={(e) => {
          const id = e.features?.[0]?.properties?.id;
          if (typeof id === "string") onFocus(id);
        }}
        onMouseMove={(e) => {
          const map = mapRef.current;
          if (map) {
            map.getCanvas().style.cursor = e.features?.length ? "pointer" : "";
          }
        }}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        {regionFeature ? (
          <Source id="region-boundary" type="geojson" data={regionFeature}>
            <Layer
              id="region-outline"
              type="line"
              paint={{
                "line-color": "#C3A25B",
                "line-width": 2,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
        ) : null}
        <Source id="appellations" type="geojson" data={appellationCollection}>
          <Layer
            id={APPELLATION_LAYER_ID}
            type="fill"
            paint={{
              "fill-color": [
                "case",
                ["==", ["get", "id"], focusedId ?? ""],
                "#B78E42",
                "#5C1A2B",
              ],
              "fill-opacity": [
                "case",
                ["==", ["get", "id"], focusedId ?? ""],
                0.65,
                0.35,
              ],
            }}
          />
          <Layer
            id="appellation-outlines"
            type="line"
            paint={{ "line-color": "#5C1A2B", "line-width": 1 }}
          />
          <Layer
            id="appellation-labels"
            type="symbol"
            layout={{
              "text-field": ["get", "name"],
              "text-size": 11,
            }}
            paint={{
              "text-color": "#3d1220",
              "text-halo-color": "#F5EFE3",
              "text-halo-width": 1,
            }}
          />
        </Source>
      </Map>
    </div>
  );
}
