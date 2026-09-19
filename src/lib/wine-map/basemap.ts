// The wine map's context basemap, one per app theme, and the pure half of
// swapping between them without disturbing the wine layers.
//
// A theme flip calls map.setStyle(BASEMAP_STYLE_URL[theme], { diff: true,
// transformStyle }) with transformStyle = (prev, next) =>
// withWineLayers(prev, tuneBasemapStyle(next)). The incoming basemap is tuned
// exactly as onLoad tuned the first one (basemapTweaks is the one rule both
// apply), and our sources and layers are carried over from the outgoing style
// unchanged, so MapLibre's style diff sees them as identical and emits no
// command for them: no source is removed or re-created, no tile cache is
// dropped, feature-state survives, and layer order is kept. basemap.test.ts
// runs that diff on the real Carto styles.
//
// Never swap by passing a changing `mapStyle` to react-map-gl: it calls
// setStyle(url, { diff: true }) with no transformStyle, and the diff against
// the bare Carto JSON removes every wine source and layer.
//
// No imports beyond types: page.tsx (a server component) reads BASEMAP_ORIGIN.
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { Theme } from "../theme";

/** Free, un-keyed Carto vector basemaps. Both style URLs live on this origin,
    which the map page preconnects. */
export const BASEMAP_ORIGIN = "https://basemaps.cartocdn.com";

export const BASEMAP_STYLE_URL: Record<Theme, string> = {
  light: `${BASEMAP_ORIGIN}/gl/positron-gl-style/style.json`,
  dark: `${BASEMAP_ORIGIN}/gl/dark-matter-gl-style/style.json`,
};

// Basemap source-layers removed at style load. Roads, place names, water and
// boundaries all stay — this is only the clutter that carries no meaning on a
// wine map: street numbers, points of interest, road-name labels, airport
// runways and building footprints. Positron ships 93 style layers; these
// account for roughly a third of them, including the symbol layers that are the
// costliest kind (every symbol layer joins MapLibre's global collision pass).
// Dark Matter has the same 93 layer ids with the same source-layers.
export const PRUNED_BASEMAP_SOURCE_LAYERS: ReadonlySet<string> = new Set([
  "housenumber",
  "poi",
  "transportation_name",
  "aeroway",
  "building",
]);

// Give the wine labels the low-zoom stage: MapLibre places lower (basemap)
// symbol layers first, so the basemap's own "FRANCE" and city names were
// winning collisions against our region labels (BORDEAUX/BOURGOGNE/BEAUJOLAIS
// silently dropped). The basemap's place labels start at z7+, where they return
// as useful village-zoom context (Épernay, Châlons…) and our tier-1 labels are
// no longer contending. Where a layer's own maxzoom is below this (the
// continent and first country labels) it ends with minzoom > maxzoom, which
// hides it — deliberately, and valid to MapLibre's style validator.
export const PLACE_LABEL_MIN_ZOOM = 7;

export type BasemapTweaks = {
  /** Layer ids to remove. */
  remove: string[];
  /** Layer zoom ranges to set. */
  zoomRanges: { id: string; minzoom: number; maxzoom: number }[];
};

function sourceLayerOf(layer: LayerSpecification): string | undefined {
  return "source-layer" in layer ? layer["source-layer"] : undefined;
}

/** What tuning a basemap means, as data: the one rule onLoad applies to the
    live style (removeLayer / setLayerZoomRange) and tuneBasemapStyle applies
    to an incoming style spec, so the two can never disagree — which is what
    keeps a swap's diff from re-adding pruned layers or resetting zoom ranges.
    Our own layers (source-layers `places`/`labels`) never match. */
export function basemapTweaks(layers: readonly LayerSpecification[]): BasemapTweaks {
  const remove: string[] = [];
  const zoomRanges: BasemapTweaks["zoomRanges"] = [];
  for (const layer of layers) {
    const sourceLayer = sourceLayerOf(layer);
    if (sourceLayer && PRUNED_BASEMAP_SOURCE_LAYERS.has(sourceLayer)) {
      remove.push(layer.id);
    } else if (layer.type === "symbol" && sourceLayer === "place") {
      zoomRanges.push({
        id: layer.id,
        minzoom: Math.max(PLACE_LABEL_MIN_ZOOM, layer.minzoom ?? 0),
        maxzoom: layer.maxzoom ?? 24,
      });
    }
  }
  return { remove, zoomRanges };
}

/** The basemap style with basemapTweaks applied. Does not mutate its input. */
export function tuneBasemapStyle(style: StyleSpecification): StyleSpecification {
  const { remove, zoomRanges } = basemapTweaks(style.layers);
  const dropped = new Set(remove);
  const ranges = new Map(zoomRanges.map((range) => [range.id, range]));
  return {
    ...style,
    layers: style.layers
      .filter((layer) => !dropped.has(layer.id))
      .map((layer) => {
        const range = ranges.get(layer.id);
        return range ? { ...layer, minzoom: range.minzoom, maxzoom: range.maxzoom } : layer;
      }),
  };
}

/** The world archive's source id (tier 0 countries plus every region). */
export const WORLD_SOURCE_ID = "wine-world";
/** Every region shard's source id is this prefix plus the shard key. */
export const SHARD_SOURCE_PREFIX = "wine-shard-";

export function shardSourceId(key: string): string {
  return `${SHARD_SOURCE_PREFIX}${key}`;
}

/** Is this one of the map's own sources, as opposed to the basemap's? */
export function isWineSourceId(id: string): boolean {
  return (
    id === WORLD_SOURCE_ID ||
    (id.startsWith(SHARD_SOURCE_PREFIX) && id.length > SHARD_SOURCE_PREFIX.length)
  );
}

function wineSourceOf(layer: LayerSpecification): string | null {
  return "source" in layer && typeof layer.source === "string" && isWineSourceId(layer.source)
    ? layer.source
    : null;
}

/** transformStyle for a basemap swap: the incoming style plus every wine
    source and layer of the outgoing one, copied as they are (promoteId,
    filters, Local/English text-field, visibility and paint included), with the
    wine layers after the basemap in their existing order — the order
    `world-labels` relies on to lose collisions to the shard labels above it.
    Anything in `next` that already claims a wine id is dropped first, so no id
    is ever duplicated. With no outgoing style there is nothing to carry. */
export function withWineLayers(
  prev: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  if (!prev) return next;
  const wineSources = Object.entries(prev.sources).filter(([id]) => isWineSourceId(id));
  const wineLayers = prev.layers.filter((layer) => wineSourceOf(layer) !== null);
  const wineLayerIds = new Set(wineLayers.map((layer) => layer.id));
  return {
    ...next,
    sources: {
      ...Object.fromEntries(Object.entries(next.sources).filter(([id]) => !isWineSourceId(id))),
      ...Object.fromEntries(wineSources),
    },
    layers: [
      ...next.layers.filter(
        (layer) => wineSourceOf(layer) === null && !wineLayerIds.has(layer.id),
      ),
      ...wineLayers,
    ],
  };
}
