import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import concaveman from "concaveman";

const CONCAVITY = 2;
const EDGE_THRESHOLD_DIVISOR = 30;
const COORDINATE_PRECISION = 4;
const MAX_EDGE_DIAGONAL_SHARE = 0.2;
const MIN_COMPONENT_AREA_SHARE = 0.02;

const EXPECTED_SLUGS = [
  "bordeaux",
  "medoc",
  "haut-medoc",
  "saint-estephe",
  "pauillac",
  "saint-julien",
  "margaux",
  "pessac-leognan",
  "graves",
  "sauternes",
  "barsac",
  "saint-emilion",
  "pomerol",
];

const SOURCE_MIGRATION = new URL(
  "../supabase/migrations/20260726090000_wine_map_inao_boundaries.sql",
  import.meta.url,
);
const OUTPUT_MIGRATION = new URL(
  "../supabase/migrations/20260726100000_wine_map_concave_boundaries.sql",
  import.meta.url,
);

function positionsEqual(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function segmentsIntersect(startA, endA, startB, endB) {
  const crossAbStart =
    (endA[0] - startA[0]) * (startB[1] - startA[1]) -
    (endA[1] - startA[1]) * (startB[0] - startA[0]);
  const crossAbEnd =
    (endA[0] - startA[0]) * (endB[1] - startA[1]) -
    (endA[1] - startA[1]) * (endB[0] - startA[0]);
  const crossCdStart =
    (endB[0] - startB[0]) * (startA[1] - startB[1]) -
    (endB[1] - startB[1]) * (startA[0] - startB[0]);
  const crossCdEnd =
    (endB[0] - startB[0]) * (endA[1] - startB[1]) -
    (endB[1] - startB[1]) * (endA[0] - startB[0]);
  const crossesAb =
    (crossAbStart > 0 && crossAbEnd < 0) ||
    (crossAbStart < 0 && crossAbEnd > 0);
  const crossesCd =
    (crossCdStart > 0 && crossCdEnd < 0) ||
    (crossCdStart < 0 && crossCdEnd > 0);

  if (crossesAb && crossesCd) {
    return true;
  }

  return (
    (crossAbStart === 0 &&
      startB[0] >= Math.min(startA[0], endA[0]) &&
      startB[0] <= Math.max(startA[0], endA[0]) &&
      startB[1] >= Math.min(startA[1], endA[1]) &&
      startB[1] <= Math.max(startA[1], endA[1])) ||
    (crossAbEnd === 0 &&
      endB[0] >= Math.min(startA[0], endA[0]) &&
      endB[0] <= Math.max(startA[0], endA[0]) &&
      endB[1] >= Math.min(startA[1], endA[1]) &&
      endB[1] <= Math.max(startA[1], endA[1])) ||
    (crossCdStart === 0 &&
      startA[0] >= Math.min(startB[0], endB[0]) &&
      startA[0] <= Math.max(startB[0], endB[0]) &&
      startA[1] >= Math.min(startB[1], endB[1]) &&
      startA[1] <= Math.max(startB[1], endB[1])) ||
    (crossCdEnd === 0 &&
      endA[0] >= Math.min(startB[0], endB[0]) &&
      endA[0] <= Math.max(startB[0], endB[0]) &&
      endA[1] >= Math.min(startB[1], endB[1]) &&
      endA[1] <= Math.max(startB[1], endB[1]))
  );
}

function roundPosition([longitude, latitude]) {
  const scale = 10 ** COORDINATE_PRECISION;
  return [
    Math.round(longitude * scale) / scale,
    Math.round(latitude * scale) / scale,
  ];
}

function removeAdjacentDuplicates(positions) {
  return positions.filter(
    (position, index) =>
      index === 0 || !positionsEqual(position, positions[index - 1]),
  );
}

function closeRing(positions) {
  if (positions.length === 0) {
    return [];
  }

  const ring = positions.map((position) => [...position]);
  if (!positionsEqual(ring[0], ring.at(-1))) {
    ring.push([...ring[0]]);
  }
  return ring;
}

function exteriorRings(geometry) {
  const exteriorRings =
    geometry?.type === "Polygon"
      ? [geometry.coordinates?.[0]]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates?.map((polygon) => polygon?.[0])
        : null;

  if (!exteriorRings || exteriorRings.some((ring) => !Array.isArray(ring))) {
    throw new TypeError("Expected a Polygon or MultiPolygon geometry");
  }

  return exteriorRings;
}

function uniqueExteriorPositions(exteriorRings) {
  const unique = new Map();
  for (const ring of exteriorRings) {
    for (const position of ring) {
      if (
        !Array.isArray(position) ||
        position.length < 2 ||
        !Number.isFinite(position[0]) ||
        !Number.isFinite(position[1])
      ) {
        throw new TypeError("Source geometry contains an invalid position");
      }

      const pair = [position[0], position[1]];
      unique.set(`${pair[0]},${pair[1]}`, pair);
    }
  }

  return [...unique.values()];
}

function exteriorArea(ring) {
  let doubleArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    doubleArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(doubleArea / 2);
}

function longestEdgeShare(envelope) {
  const [ring] = envelope.coordinates;
  const latitudes = ring.map(([, latitude]) => latitude);
  const referenceLatitude =
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const longitudeKm = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180);
  const latitudeKm = 110.574;
  const projected = ring.map(([longitude, latitude]) => [
    longitude * longitudeKm,
    latitude * latitudeKm,
  ]);
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const diagonal = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  const longestEdge = Math.max(
    ...projected.slice(1).map((position, index) =>
      Math.hypot(
        position[0] - projected[index][0],
        position[1] - projected[index][1],
      ),
    ),
  );

  return longestEdge / diagonal;
}

function createEnvelope(exteriorRings) {
  const points = uniqueExteriorPositions(exteriorRings);
  if (points.length < 3) {
    throw new TypeError("Source geometry must contain at least three unique positions");
  }

  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  const minX = Math.min(...longitudes);
  const maxX = Math.max(...longitudes);
  const minY = Math.min(...latitudes);
  const maxY = Math.max(...latitudes);
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  const hull = concaveman(points, CONCAVITY, diagonal / EDGE_THRESHOLD_DIVISOR);
  const ring = closeRing(removeAdjacentDuplicates(hull.map(roundPosition)));
  const envelope = { type: "Polygon", coordinates: [ring] };

  validateEnvelope(envelope);
  return envelope;
}

export function parseBoundaryUpdates(sql) {
  if (typeof sql !== "string") {
    throw new TypeError("SQL must be a string");
  }

  const updates = [];
  const updatePattern =
    /update\s+(?:public\.)?wine_map_nodes\s+set\s+boundary_geojson\s*=\s*'((?:[^']|'')*)'\s*(?:::jsonb)?\s+where\s+slug\s*=\s*'((?:[^']|'')+)'\s*;/giu;

  for (const match of sql.matchAll(updatePattern)) {
    const slug = match[2].replaceAll("''", "'");
    const json = match[1].replaceAll("''", "'");

    try {
      updates.push({ slug, geometry: JSON.parse(json) });
    } catch (error) {
      throw new Error(`Invalid boundary GeoJSON for ${slug}`, { cause: error });
    }
  }

  return updates;
}

export function validateEnvelope(geometry) {
  if (!geometry || geometry.type !== "Polygon") {
    throw new TypeError("Envelope must be a Polygon");
  }
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 1) {
    throw new TypeError("Envelope must contain exactly one ring");
  }

  const [ring] = geometry.coordinates;
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new TypeError("Envelope ring must contain at least four positions");
  }

  for (const position of ring) {
    if (
      !Array.isArray(position) ||
      position.length !== 2 ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1])
    ) {
      throw new TypeError("Envelope positions must be finite longitude/latitude pairs");
    }
    if (
      position[0] < -180 ||
      position[0] > 180 ||
      position[1] < -90 ||
      position[1] > 90
    ) {
      throw new RangeError("Envelope position is outside longitude/latitude bounds");
    }
  }

  if (!positionsEqual(ring[0], ring.at(-1))) {
    throw new TypeError("Envelope ring must be exactly closed");
  }

  const distinctPositions = new Set(
    ring.slice(0, -1).map((position) => `${position[0]},${position[1]}`),
  );
  if (distinctPositions.size < 3) {
    throw new TypeError("Envelope ring must contain at least three distinct positions");
  }
  if (distinctPositions.size !== ring.length - 1) {
    throw new TypeError("Envelope ring must not repeat non-closing positions");
  }

  const coordinateScale = 10 ** COORDINATE_PRECISION;
  const scaledRing = ring.map(([longitude, latitude]) => [
    Math.round(longitude * coordinateScale),
    Math.round(latitude * coordinateScale),
  ]);
  const segmentCount = ring.length - 1;
  for (let left = 0; left < segmentCount; left += 1) {
    for (let right = left + 1; right < segmentCount; right += 1) {
      const segmentsAreAdjacent =
        right === left + 1 || (left === 0 && right === segmentCount - 1);
      if (segmentsAreAdjacent) {
        continue;
      }

      if (
        segmentsIntersect(
          scaledRing[left],
          scaledRing[left + 1],
          scaledRing[right],
          scaledRing[right + 1],
        )
      ) {
        throw new TypeError("Envelope ring must not self-intersect");
      }
    }
  }

  let signedDoubleArea = 0;
  for (let index = 0; index < segmentCount; index += 1) {
    const current = scaledRing[index];
    const next = scaledRing[index + 1];
    signedDoubleArea += current[0] * next[1] - next[0] * current[1];
  }
  if (signedDoubleArea === 0) {
    throw new TypeError("Envelope ring must have non-zero signed area");
  }
}

export function createAllComponentEnvelope(geometry) {
  return createEnvelope(exteriorRings(geometry));
}

export function createConcaveEnvelope(geometry) {
  const envelope = createAllComponentEnvelope(geometry);
  if (longestEdgeShare(envelope) <= MAX_EDGE_DIAGONAL_SHARE) {
    return envelope;
  }

  const rings = exteriorRings(geometry);
  const areas = rings.map(exteriorArea);
  const dominantArea = Math.max(...areas);
  // Tiny detached components can force large cartographic wedges between clusters.
  const retainedRings = rings.filter(
    (_, index) => areas[index] >= dominantArea * MIN_COMPONENT_AREA_SHARE,
  );
  return createEnvelope(retainedRings);
}

function assertExpectedUpdates(updates) {
  const counts = new Map();
  for (const { slug } of updates) {
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const invalid = [
    ...EXPECTED_SLUGS.filter((slug) => counts.get(slug) !== 1),
    ...[...counts.keys()].filter((slug) => !EXPECTED_SLUGS.includes(slug)),
  ];
  if (updates.length !== EXPECTED_SLUGS.length || invalid.length > 0) {
    throw new Error(
      `Expected each of the 13 wine map slugs exactly once; invalid: ${[
        ...new Set(invalid),
      ].join(", ") || "update count"}`,
    );
  }
}

export function renderMigration(updates) {
  const header = [
    "-- Generalized concave wine map boundaries derived from official INAO AOC parcels.",
    "-- Source: IGN Geoplateforme WFS AOC-VITICOLES:aire_parcellaire (licence ouverte Etalab).",
    "-- Cartographic generalization only: these hole-free envelopes fill non-vineyard gaps",
    "-- and must not be treated as legal appellation or parcel boundaries.",
    "",
  ].join("\n");

  const statements = updates.map(({ slug, geometry }) => {
    const envelope = createConcaveEnvelope(geometry);
    return `update wine_map_nodes set boundary_geojson = '${JSON.stringify(envelope)}' where slug = '${slug.replaceAll("'", "''")}';`;
  });

  return `${header}${statements.join("\n\n")}\n`;
}

async function generateMigration() {
  const sql = await readFile(SOURCE_MIGRATION, "utf8");
  const updates = parseBoundaryUpdates(sql);
  assertExpectedUpdates(updates);

  await writeFile(OUTPUT_MIGRATION, renderMigration(updates), "utf8");
  console.log(
    `Generated ${updates.length} concave polygons in ${fileURLToPath(OUTPUT_MIGRATION)}`,
  );
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  generateMigration().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
