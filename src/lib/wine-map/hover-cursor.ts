// The map's pointer cursor, set from a throttled mousemove listener.
//
// It used to be react-map-gl's `onMouseMove` prop. Any hover prop makes
// react-map-gl run queryRenderedFeatures over every interactive layer (two per
// mounted shard plus the world ones) on EVERY mousemove, mid-pan included,
// just to decide between two cursors. Here: at most one query per animation
// frame, none while the map is moving (a drag or an ease owns the cursor
// then), and only over the interactive layers that exist. At moveend the
// resting pointer is re-checked once, since the map moved under it and no
// mousemove may follow.
//
// Three optional, additive options serve the training room's likelihood map
// (training-room-map spec RM15, RM18); the explorer passes none of them and
// behaves exactly as before: `isClickable` replaces hoverIsClickable (the
// room's dots carry no `tier`), `box` queries a square of that half-size
// around the pointer instead of the exact point (a 6 px dot is hard to hit
// exactly), and `onHover` receives the hits once per frame — and [] when the
// pointer leaves the canvas — to drive a tooltip.
// Pure: no imports; TileWineMap passes the MapLibre map.

export type HoverPoint = { x: number; y: number };

export type HoverFeature = { properties?: Record<string, unknown> | null };

/** A pixel point, or a [top-left, bottom-right] pixel box. */
export type HoverGeometry = [number, number] | [[number, number], [number, number]];

/** The slice of a MapLibre map the cursor needs. */
export type HoverMap = {
  on(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
  on(type: "moveend" | "mouseout", fn: () => void): unknown;
  off(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
  off(type: "moveend" | "mouseout", fn: () => void): unknown;
  isMoving(): boolean;
  getZoom(): number;
  getLayer(id: string): unknown;
  queryRenderedFeatures(geometry: HoverGeometry, options: { layers: string[] }): HoverFeature[];
  getCanvas(): { style: { cursor: string } };
};

/** Mirrors onClick's tier-0 guard: past z5 a click on the country wash is
    discarded, so the country must not advertise a pointer there either. */
export function hoverIsClickable(features: readonly HoverFeature[], zoom: number): boolean {
  return features.some((feature) => {
    const tier = feature.properties?.tier;
    return (typeof tier === "number" ? tier : 0) > 0 || zoom <= 5;
  });
}

/** The exact point, or a square of half-size `box` px around it. */
export function hoverGeometry(point: HoverPoint, box: number): HoverGeometry {
  return box > 0
    ? [
        [point.x - box, point.y - box],
        [point.x + box, point.y + box],
      ]
    : [point.x, point.y];
}

/** Installs the listener; returns its disposer. `layers` is read per frame,
    so it follows the mounted shards without re-installing. */
export function installHoverCursor(
  map: HoverMap,
  opts: {
    layers: () => readonly string[];
    raf?: (cb: () => void) => number;
    cancelRaf?: (handle: number) => void;
    /** Whether the hits under the pointer are clickable (default hoverIsClickable). */
    isClickable?: (features: readonly HoverFeature[], zoom: number) => boolean;
    /** Half-size in px of the square queried around the pointer (default 0: the exact point). */
    box?: number;
    /** The hits under the pointer, once per frame; [] when there are none or the pointer left. */
    onHover?: (features: readonly HoverFeature[], point: HoverPoint) => void;
  },
): () => void {
  const raf = opts.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
  const cancelRaf = opts.cancelRaf ?? ((handle: number) => cancelAnimationFrame(handle));
  const isClickable = opts.isClickable ?? hoverIsClickable;
  const box = opts.box ?? 0;
  const onHover = opts.onHover;
  let frame: number | null = null;
  let point: HoverPoint | null = null;
  const update = () => {
    frame = null;
    if (!point || map.isMoving()) return;
    let features: readonly HoverFeature[] = [];
    let clickable = false;
    try {
      const layers = opts.layers().filter((id) => map.getLayer(id));
      if (layers.length > 0) {
        features = map.queryRenderedFeatures(hoverGeometry(point, box), { layers });
        clickable = isClickable(features, map.getZoom());
      }
    } catch {
      // Style mid-rebuild: no pointer this frame.
      features = [];
      clickable = false;
    }
    map.getCanvas().style.cursor = clickable ? "pointer" : "";
    onHover?.(features, point);
  };
  const onMove = (e: { point: HoverPoint }) => {
    point = e.point;
    if (frame === null) frame = raf(update);
  };
  // The map settled under a resting pointer (a drag, a wheel zoom, an ease):
  // what is under it may have changed, so re-check once.
  const onMoveEnd = () => {
    if (point && frame === null) frame = raf(update);
  };
  // Only with onHover (the explorer passes none, and its listeners are
  // unchanged): the pointer left the canvas, so nothing is under it.
  const onOut = () => {
    const last = point;
    point = null;
    if (frame !== null) cancelRaf(frame);
    frame = null;
    map.getCanvas().style.cursor = "";
    if (last) onHover?.([], last);
  };
  map.on("mousemove", onMove);
  map.on("moveend", onMoveEnd);
  if (onHover) map.on("mouseout", onOut);
  return () => {
    if (frame !== null) cancelRaf(frame);
    frame = null;
    map.off("mousemove", onMove);
    map.off("moveend", onMoveEnd);
    if (onHover) map.off("mouseout", onOut);
  };
}
