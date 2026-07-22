// Client-side region generalizer: cluster parcels by 8-neighbor grid
// adjacency, one adaptive concave envelope per cluster (concaveman — the
// engine class behind the Phase 1 Bordeaux footprints), then Douglas-Peucker
// simplify each hull so a region footprint is a few hundred vertices rather
// than raw parcel detail. Exists because server-side GEOS closing exceeds
// the free-tier instance above ~10k parcels.
import concaveman from "concaveman";

const r4 = (n) => Math.round(n * 1e4) / 1e4;

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Iterative Ramer-Douglas-Peucker on a closed ring (first === last); the
// stack form avoids deep recursion on dense hulls.
function simplifyRing(ring, epsilon) {
  const open = ring.slice(0, -1);
  if (open.length < 4) return ring;
  const keep = new Array(open.length).fill(false);
  keep[0] = true;
  keep[open.length - 1] = true;
  const stack = [[0, open.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = lo + 1; i < hi; i += 1) {
      const dist = perpDistance(open[i], open[lo], open[hi]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (maxDist > epsilon && index !== -1) {
      keep[index] = true;
      stack.push([lo, index], [index, hi]);
    }
  }
  const simplified = open.filter((_, i) => keep[i]);
  if (simplified.length < 3) return ring;
  simplified.push([...simplified[0]]);
  return simplified;
}

export function buildConcaveGeometry(
  collection,
  {
    gridSize = 0.05,
    minComponentShare = 0.02,
    concavity = 2,
    simplifyTolerance = 0.005,
  } = {},
) {
  const cells = new Map();
  for (const feature of collection.features) {
    const rings =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates[0]]
        : feature.geometry.coordinates.map((poly) => poly[0]);
    const pts = rings.flat(1).map(([x, y]) => [r4(x), r4(y)]);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const key = `${Math.floor(cx / gridSize)}:${Math.floor(cy / gridSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(...pts);
  }

  const parent = new Map([...cells.keys()].map((key) => [key, key]));
  const find = (key) => {
    let cursor = key;
    while (parent.get(cursor) !== cursor) {
      parent.set(cursor, parent.get(parent.get(cursor)));
      cursor = parent.get(cursor);
    }
    return cursor;
  };
  for (const key of cells.keys()) {
    const [x, y] = key.split(":").map(Number);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const neighbor = `${x + dx}:${y + dy}`;
        if (neighbor !== key && cells.has(neighbor)) {
          parent.set(find(neighbor), find(key));
        }
      }
    }
  }

  const clusters = new Map();
  for (const [key, pts] of cells) {
    const root = find(key);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(...pts);
  }

  const rings = [...clusters.values()].map((pts) => {
    const hull = concaveman(pts, concavity).map(([x, y]) => [r4(x), r4(y)]);
    const [fx, fy] = hull[0];
    const [lx, ly] = hull[hull.length - 1];
    if (fx !== lx || fy !== ly) hull.push([fx, fy]);
    return simplifyRing(hull, simplifyTolerance).map(([x, y]) => [r4(x), r4(y)]);
  });
  const total = rings.reduce((sum, ring) => sum + ringArea(ring), 0);
  const kept = rings.filter(
    (ring) => ringArea(ring) / total >= minComponentShare,
  );
  if (kept.length === 0) {
    throw new Error("concave engine produced no components");
  }
  return { type: "MultiPolygon", coordinates: kept.map((ring) => [ring]) };
}
