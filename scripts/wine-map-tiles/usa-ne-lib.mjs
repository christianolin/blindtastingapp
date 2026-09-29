// Pure helpers for the Natural Earth USA extraction (spec 2026-09-29 §5.2,
// §8.2 "Country component filter").
export const LOWER48_BOX = Object.freeze({ minLon: -125, minLat: 24, maxLon: -66.5, maxLat: 49.5 });

export function polygonsOf(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`unexpected geometry ${geometry?.type}`);
}

const inside = ([lon, lat], b) => lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;

/** Components whose OUTER ring lies fully inside the box: the lower 48. */
export function lower48(geometry, box = LOWER48_BOX) {
  return polygonsOf(geometry).filter((polygon) => polygon[0].every((p) => inside(p, box)));
}

export function roundPolygon(polygon, decimals) {
  const f = 10 ** decimals;
  const rings = [];
  for (const [index, ring] of polygon.entries()) {
    const out = [];
    for (const [x, y] of ring) {
      const p = [Math.round(x * f) / f, Math.round(y * f) / f];
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
    }
    const first = out[0];
    const last = out[out.length - 1];
    if (first && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
    if (out.length >= 4) rings.push(out);
    else if (index === 0) return null;
  }
  return rings;
}

function inRing([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function pointInPolygons(point, polygons) {
  return polygons.some(([outer, ...holes]) => inRing(point, outer) && !holes.some((h) => inRing(point, h)));
}
