// The wine map's context basemap, one per app theme, and the pure half of
// swapping between them without disturbing the wine layers.
//
// A theme flip calls map.setStyle(style, { diff: true, validate: false,
// transformStyle }) with transformStyle = (prev, next) =>
// withWineLayers(prev, tuneBasemapStyle(next)). The incoming basemap is tuned
// exactly as onLoad tuned the first one (basemapTweaks is the one rule both
// apply), and our sources and layers are carried over from the outgoing style
// unchanged, so MapLibre's style diff sees them as identical and emits no
// command for them: no source is removed or re-created, no tile cache is
// dropped, feature-state survives, and layer order is kept. basemap.test.ts
// runs that diff on the real Carto styles, and runs validateStyleMin over its
// result — which is what `validate: false` trades a per-swap validation for.
//
// `style` there is the STYLE OBJECT from loadBasemapStyle/cachedBasemapStyle,
// already tuned, not the URL: given a URL MapLibre re-fetches and re-parses on
// every flip and its diff walks the untuned layers. The URL is only the
// fallback for a fetch that failed.
//
// Never swap by passing a changing `mapStyle` to react-map-gl: it calls
// setStyle(url, { diff: true }) with no transformStyle, and the diff against
// the bare Carto JSON removes every wine source and layer.
//
// No imports beyond types: page.tsx (a server component) reads BASEMAP_ORIGIN.
// The only module state is the tuned-style cache near the bottom, which is two
// empty Maps until a client actually swaps a theme.
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { Theme } from "../theme";

/** Free, un-keyed Carto vector basemaps. Both style URLs live on this origin,
    which the map page preconnects. */
export const BASEMAP_ORIGIN = "https://basemaps.cartocdn.com";

export const BASEMAP_STYLE_URL: Record<Theme, string> = {
  light: `${BASEMAP_ORIGIN}/gl/positron-gl-style/style.json`,
  dark: `${BASEMAP_ORIGIN}/gl/dark-matter-gl-style/style.json`,
};

// Basemap source-layers removed at style load: street numbers, points of
// interest, road-name labels, airport runways and building footprints — the
// clutter that carries no meaning on a wine map, including the symbol layers
// that are the costliest kind (every symbol layer joins MapLibre's global
// collision pass). Place names, water and boundaries stay; roads stay from
// BASEMAP_ROAD_MIN_ZOOM up (see REMOVED_BASEMAP_LAYER_IDS below). Positron
// ships 93 style layers and Dark Matter the same 93 ids with the same
// source-layers; these five source-layers account for 11 of them, the id list
// below for another 9, and the place-label floor for 5 more it had already
// made unrenderable (see basemapTweaks), leaving 68.
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
// no longer contending. Five layers have a maxzoom this floor reaches (the
// continent label, the first country label and the three small-city dots), so
// the floor would leave them unable to draw at any zoom; basemapTweaks removes
// those rather than keeping them in the style as dead weight.
export const PLACE_LABEL_MIN_ZOOM = 7;

// Basemap layers removed by id. Both Carto styles carry the same 93 ids (they
// differ only in where `waterway_label` sits), so one list covers Positron and
// Dark Matter. None of these overlaps PRUNED_BASEMAP_SOURCE_LAYERS above.
//
// The cost being cut is not mainly pixels: EVERY style layer naming a
// source-layer runs a full filter pass over that source-layer's features in
// every tile the worker parses, whether or not a feature survives. Carto ships
// 49 layers over `transportation` alone; measured on the live map, a Cote de
// Nuits z12 frame rendered 186 basemap features of which 129 were roads.
//
// Removing a transportation layer is the LAST resort, not the first, because
// of how Carto splits the road network. A road's three states — surface,
// bridge, tunnel — are three separate layers with mutually exclusive filters
// (`["!has","brunnel"]`, `["==","brunnel","bridge"]`, `["==","brunnel",
// "tunnel"]`), and no layer draws more than its own state. Delete the tunnel
// half and every tunnelled stretch of a motorway or railway becomes a hole in
// a line that is otherwise continuous — the A7 through Tain-l'Hermitage, the
// Vosges crossings, the Mosel and Douro rail tunnels — which reads as a broken
// map, not a simpler one. Zoom-gating has no such effect and saves the same
// parse work at the gated zooms (see BASEMAP_ROAD_MIN_ZOOM), so every road,
// bridge, tunnel and rail layer that draws real geometry is GATED, and only
// these nine ids go:
//
//  - Motorway/trunk/primary ramps (6): interchange spaghetti, all at z12 —
//    exactly the zoom that measured worst. A ramp is its own slip road
//    (`["==","ramp",1]`), never a segment of the mainline, whose own layers
//    carry `["!=","ramp",1]` — so dropping the six leaves no gap anywhere.
//  - `rail_dash` and `tunnel_rail_dash` (2): a second pass over the features
//    `rail`/`tunnel_rail` already draw, purely for their cross-hatch. Both go
//    together: dropping only one would cross-hatch a railway inside tunnels
//    and not outside them. The rail lines themselves stay, solid and
//    continuous.
//  - `landuse` (1): a fill layer whose whole filter is cemeteries and
//    stadiums. `landuse_residential` stays — village extents are real context.
//
// Kept deliberately: water and rivers (wine geography is river geography),
// land cover and parks, every boundary, all 15 place labels, and from
// BASEMAP_ROAD_MIN_ZOOM up the whole road network — surface, bridge and
// tunnel alike — plus rail. That includes `road_path` (class `path` AND
// `track`, the OSM class for vineyard access roads) and the `service` layers,
// the lanes between parcels: Carto already starts all six at z15, so they
// cost nothing at the zooms the baseline measured as heavy, and at z15-z16
// they are the only ground reference for where one climat ends and the next
// begins.
export const REMOVED_BASEMAP_LAYER_IDS: ReadonlySet<string> = new Set([
  // motorway/trunk/primary ramps
  "road_pri_case_ramp",
  "road_trunk_case_ramp",
  "road_mot_case_ramp",
  "road_pri_fill_ramp",
  "road_trunk_fill_ramp",
  "road_mot_fill_ramp",
  // decoration over geometry another layer already draws
  "rail_dash",
  "tunnel_rail_dash",
  // cemeteries and stadiums
  "landuse",
]);

/** The basemap's road/rail source-layer, the one BASEMAP_ROAD_MIN_ZOOM gates. */
export const BASEMAP_ROAD_SOURCE_LAYER = "transportation";

// No road renders below this zoom. MapLibre's tile worker calls
// `layer.isHidden(tileZoom, true)` and `continue`s BEFORE it builds the
// layer's bucket or runs its filter over a single feature, so a layer gated
// above the tile's zoom costs exactly what a deleted one costs at that zoom —
// which is why every surviving road is gated rather than dropped, and why
// deleting a layer Carto already starts at z15 buys nothing below z15.
//
// Carto draws a road's CASING two or three zooms before its fill, so below
// z10 a motorway is the casing alone; gating the casing means country and
// region zoom (where a wine map shows countries and regions, not driving
// directions) become land, water, boundaries and place names. Nine layers
// actually move: road_{mot,trunk}_case_noramp, bridge_{mot,trunk}_case and
// tunnel_{mot,trunk}_case from z5, road_pri_case_noramp from z7,
// bridge_pri_case and tunnel_pri_case from z8. The other thirty-two already
// start at z10 or later.
export const BASEMAP_ROAD_MIN_ZOOM = 10;

export type BasemapTweaks = {
  /** Layer ids to remove. */
  remove: string[];
  /** Layer zoom ranges to set. Only layers whose minzoom actually moves are
      listed — see the gate below for why a no-op is not free. */
  zoomRanges: { id: string; minzoom: number; maxzoom: number }[];
};

function sourceLayerOf(layer: LayerSpecification): string | undefined {
  return "source-layer" in layer ? layer["source-layer"] : undefined;
}

/** What tuning a basemap means, as data: the one rule onLoad applies to the
    live style (removeLayer / setLayerZoomRange) and tuneBasemapStyle applies
    to an incoming style spec, so the two can never disagree — which is what
    keeps a swap's diff from re-adding pruned layers or resetting zoom ranges.
    A layer on one of OUR sources is skipped outright, so no rule here can
    reach a wine layer however its id or source-layer is spelled. */
export function basemapTweaks(layers: readonly LayerSpecification[]): BasemapTweaks {
  const remove: string[] = [];
  const zoomRanges: BasemapTweaks["zoomRanges"] = [];
  /**
   * Raise a layer's floor — but say nothing when it is already above it.
   *
   * A no-op zoom range is NOT free at onLoad, which is the one moment the map
   * can least afford work. `map.setLayerZoomRange` calls `_update(true)`
   * whatever happens, and `Style.setLayerZoomRange`'s own early-return
   * (`layer.minzoom === minzoom && layer.maxzoom === maxzoom`) is defeated for
   * the 15 Carto layers that carry no maxzoom at all, because handing it
   * `maxzoom ?? 24` is a change from `undefined`. It then runs `_updateLayer`,
   * which marks the layer's source `'reload'` and PAUSES its tile manager —
   * so a no-op could pause the basemap's tiles and queue a reload of every one
   * in flight, during the first paint.
   *
   * Of the 56 ranges this used to emit over Carto's styles, 40 changed
   * nothing. Now 11 are emitted: the nine road casings that drew from country
   * zoom and the two place labels that still have a zoom left to draw at. The
   * layers left out keep their own minzoom AND their own maxzoom, in the live
   * style and in a tuned one alike, so the two still agree and a swap's diff
   * stays free of setLayerZoomRange (pinned in basemap.test.ts).
   *
   * A floor that reaches a layer's own CEILING removes it instead. MapLibre
   * hides a layer when `zoom >= maxzoom` (the ceiling is exclusive,
   * StyleLayer.isHidden), so minzoom >= maxzoom can never draw at any zoom —
   * gating it only leaves dead weight that every style diff still walks and
   * every serialize still copies. Five of Carto's place layers are exactly
   * that under the z7 floor: place_country_1 (z2-7), place_continent (z0-2)
   * and the three small-city dots place_city_dot_r{7,4,2} (z4-7, z5-7, z6-7).
   * Removing them is invisible by construction — the floor had already
   * silenced them — and the rule follows the floor, so moving
   * PLACE_LABEL_MIN_ZOOM re-decides it rather than stranding a stale list.
   */
  const gateTo = (layer: LayerSpecification, floor: number) => {
    const was = layer.minzoom ?? 0;
    if (was >= floor) return;
    if (layer.maxzoom != null && floor >= layer.maxzoom) {
      remove.push(layer.id);
      return;
    }
    zoomRanges.push({ id: layer.id, minzoom: floor, maxzoom: layer.maxzoom ?? 24 });
  };
  for (const layer of layers) {
    if (wineSourceOf(layer) !== null) continue;
    const sourceLayer = sourceLayerOf(layer);
    if (
      REMOVED_BASEMAP_LAYER_IDS.has(layer.id) ||
      (sourceLayer && PRUNED_BASEMAP_SOURCE_LAYERS.has(sourceLayer))
    ) {
      remove.push(layer.id);
    } else if (sourceLayer === BASEMAP_ROAD_SOURCE_LAYER) {
      gateTo(layer, BASEMAP_ROAD_MIN_ZOOM);
    } else if (layer.type === "symbol" && sourceLayer === "place") {
      gateTo(layer, PLACE_LABEL_MIN_ZOOM);
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

// The tuned style for each theme, kept in module memory for the life of the
// tab. A theme flip used to hand setStyle a URL, which makes MapLibre fetch
// and parse the style every time; with the object in hand the second and later
// flips do no network work at all and MapLibre's diff never sees an untuned
// layer. Nothing mutates a cached style: Style.setState deep-clones what it is
// given, and tuneBasemapStyle/withWineLayers both return fresh objects.
const tunedStyles = new Map<Theme, StyleSpecification>();
const pendingStyles = new Map<Theme, Promise<StyleSpecification>>();

/** The tuned basemap style for a theme if it has already been fetched, else
    null — so a caller can swap synchronously when it can. */
export function cachedBasemapStyle(theme: Theme): StyleSpecification | null {
  return tunedStyles.get(theme) ?? null;
}

/** Fetch a theme's basemap style once and keep it tuned. Concurrent callers
    share one request; a failure caches nothing, so a later call retries.
    `fetchImpl` is a test seam — the default calls the global fetch as a
    method of the global, never as a detached function. */
export async function loadBasemapStyle(
  theme: Theme,
  fetchImpl?: (url: string) => Promise<Response>,
): Promise<StyleSpecification> {
  const cached = tunedStyles.get(theme);
  if (cached) return cached;
  const pending = pendingStyles.get(theme);
  if (pending) return pending;
  const get = fetchImpl ?? ((url: string) => globalThis.fetch(url));
  const request = (async () => {
    const response = await get(BASEMAP_STYLE_URL[theme]);
    if (!response.ok) {
      throw new Error(`Basemap style request failed: ${response.status}`);
    }
    const tuned = tuneBasemapStyle((await response.json()) as StyleSpecification);
    tunedStyles.set(theme, tuned);
    return tuned;
  })().finally(() => {
    pendingStyles.delete(theme);
  });
  pendingStyles.set(theme, request);
  return request;
}

/** Tests only: module memory otherwise lives as long as the tab. */
export function resetBasemapStyleCache(): void {
  tunedStyles.clear();
  pendingStyles.clear();
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
