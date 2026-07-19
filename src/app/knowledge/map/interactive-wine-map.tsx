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

const FILL_LAYER_PREFIX = "area-fills-depth-";

function geometryOf(node: WineMapNode): Geometry | null {
  return (node.boundary_geojson as Geometry | null) ?? null;
}

// Nested AOCs (Margaux inside Haut-Médoc inside Bordeaux) are rendered as
// stacked translucent fills, one layer per nesting depth, painted
// shallow-first so deeper shapes always sit on top and stay clickable.
// A click can hit several overlapping polygons; it resolves to the deepest
// one, tie-broken by smaller bbox area (so a small commune wins over the
// broad appellation it overlaps at the same depth, e.g. Médoc vs Haut-Médoc).
export function InteractiveWineMap({
  viewRoot,
  items,
  focusedId,
  onFocus,
}: {
  viewRoot: WineMapNode | null;
  items: { node: WineMapNode; depth: number }[];
  focusedId: string | null;
  onFocus: (id: string) => void;
}) {
  const mapRef = useRef<MapRef>(null);

  const { collection, depths } = useMemo(() => {
    const features = items.flatMap(({ node, depth }) => {
      const geometry = geometryOf(node);
      if (!geometry) return [];
      const [minX, minY, maxX, maxY] = bbox(geometry);
      return [
        {
          type: "Feature" as const,
          properties: {
            id: node.id,
            name: node.name,
            depth,
            bboxArea: (maxX - minX) * (maxY - minY),
          },
          geometry,
        },
      ];
    });
    const depths = [...new Set(features.map((f) => f.properties.depth))].sort(
      (a, b) => a - b,
    );
    return {
      collection: { type: "FeatureCollection" as const, features },
      depths,
    };
  }, [items]);

  const rootFeature = useMemo(() => {
    const geometry = viewRoot ? geometryOf(viewRoot) : null;
    return geometry
      ? { type: "Feature" as const, properties: {}, geometry }
      : null;
  }, [viewRoot]);

  // Auto-fit: fly to the focused node's shape; if the focused node has no
  // boundary (or nothing is focused), fall back to the view root's shape.
  useEffect(() => {
    const focusedNode =
      items.find(({ node }) => node.id === focusedId)?.node ??
      (viewRoot?.id === focusedId ? viewRoot : null);
    const target =
      (focusedNode && geometryOf(focusedNode)) ??
      (viewRoot && geometryOf(viewRoot));
    if (!target) return;
    const [minX, minY, maxX, maxY] = bbox(target);
    mapRef.current?.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 48, duration: 900, maxZoom: 11 },
    );
  }, [focusedId, viewRoot, items]);

  if (collection.features.length === 0 && !rootFeature) {
    return null;
  }

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border">
      <Map
        ref={mapRef}
        mapStyle={BASEMAP_STYLE}
        initialViewState={{ longitude: -0.58, latitude: 44.84, zoom: 7 }}
        interactiveLayerIds={depths.map((d) => `${FILL_LAYER_PREFIX}${d}`)}
        onClick={(e) => {
          let best: { id: string; depth: number; bboxArea: number } | null =
            null;
          for (const f of e.features ?? []) {
            const p = f.properties as {
              id?: string;
              depth?: number;
              bboxArea?: number;
            };
            if (typeof p.id !== "string") continue;
            if (
              !best ||
              (p.depth ?? 0) > best.depth ||
              ((p.depth ?? 0) === best.depth &&
                (p.bboxArea ?? Infinity) < best.bboxArea)
            ) {
              best = {
                id: p.id,
                depth: p.depth ?? 0,
                bboxArea: p.bboxArea ?? Infinity,
              };
            }
          }
          if (best) onFocus(best.id);
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
        {rootFeature ? (
          <Source id="view-root-boundary" type="geojson" data={rootFeature}>
            <Layer
              id="view-root-outline"
              type="line"
              paint={{
                "line-color": "#C3A25B",
                "line-width": 2,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
        ) : null}
        <Source id="wine-areas" type="geojson" data={collection}>
          {depths.map((depth) => (
            <Layer
              key={depth}
              id={`${FILL_LAYER_PREFIX}${depth}`}
              type="fill"
              filter={["==", ["get", "depth"], depth]}
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
                  0.6,
                  // Deeper shapes get slightly stronger fills so nesting
                  // reads as darker islands inside their parent.
                  Math.min(0.18 + depth * 0.12, 0.55),
                ],
              }}
            />
          ))}
          <Layer
            id="area-outlines"
            type="line"
            paint={{
              "line-color": "#5C1A2B",
              "line-width": ["+", 0.5, ["*", 0.5, ["get", "depth"]]],
            }}
          />
          <Layer
            id="area-labels"
            type="symbol"
            layout={{
              "text-field": ["get", "name"],
              "text-size": 11,
              // Deeper (smaller) shapes label first so commune names survive
              // the collision pass against their parent's label.
              "symbol-sort-key": ["-", 10, ["get", "depth"]],
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
