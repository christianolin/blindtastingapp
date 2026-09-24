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
// Pure: no imports; TileWineMap passes the MapLibre map.

export type HoverPoint = { x: number; y: number };

type HoverFeature = { properties?: Record<string, unknown> | null };

/** The slice of a MapLibre map the cursor needs. */
export type HoverMap = {
  on(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
  on(type: "moveend", fn: () => void): unknown;
  off(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
  off(type: "moveend", fn: () => void): unknown;
  isMoving(): boolean;
  getZoom(): number;
  getLayer(id: string): unknown;
  queryRenderedFeatures(point: [number, number], options: { layers: string[] }): HoverFeature[];
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

/** Installs the listener; returns its disposer. `layers` is read per frame,
    so it follows the mounted shards without re-installing. */
export function installHoverCursor(
  map: HoverMap,
  opts: {
    layers: () => readonly string[];
    raf?: (cb: () => void) => number;
    cancelRaf?: (handle: number) => void;
  },
): () => void {
  const raf = opts.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
  const cancelRaf = opts.cancelRaf ?? ((handle: number) => cancelAnimationFrame(handle));
  let frame: number | null = null;
  let point: HoverPoint | null = null;
  const update = () => {
    frame = null;
    if (!point || map.isMoving()) return;
    let clickable = false;
    try {
      const layers = opts.layers().filter((id) => map.getLayer(id));
      clickable =
        layers.length > 0 &&
        hoverIsClickable(map.queryRenderedFeatures([point.x, point.y], { layers }), map.getZoom());
    } catch {
      // Style mid-rebuild: no pointer this frame.
    }
    map.getCanvas().style.cursor = clickable ? "pointer" : "";
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
  map.on("mousemove", onMove);
  map.on("moveend", onMoveEnd);
  return () => {
    if (frame !== null) cancelRaf(frame);
    frame = null;
    map.off("mousemove", onMove);
    map.off("moveend", onMoveEnd);
  };
}
