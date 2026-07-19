import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createConcaveEnvelope,
  parseBoundaryUpdates,
  validateEnvelope,
} from "./generate-wine-map-concave-boundaries.mjs";

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

function countPositions(value) {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((coordinate) => typeof coordinate === "number")
  ) {
    return 1;
  }

  return Array.isArray(value)
    ? value.reduce((total, child) => total + countPositions(child), 0)
    : 0;
}

function longestEdgeShare(geometry) {
  const vertices = geometry.coordinates[0].slice(0, -1);
  const latitudes = vertices.map(([, latitude]) => latitude);
  const referenceLatitude =
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const longitudeKm = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180);
  const latitudeKm = 110.574;
  const projected = vertices.map(([longitude, latitude]) => [
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
    ...projected.map((position, index) => {
      const next = projected[(index + 1) % projected.length];
      return Math.hypot(next[0] - position[0], next[1] - position[1]);
    }),
  );

  return longestEdge / diagonal;
}

test("creates one closed concave polygon from fragmented polygons", () => {
  const fragmentedU = {
    type: "MultiPolygon",
    coordinates: [
      [[[0, 0], [0, 4], [1.5, 3], [0, 0]]],
      [[[0, 0], [4, 0], [2.5, 3], [1.5, 3], [0, 0]]],
      [[[4, 0], [4, 4], [2.5, 3], [4, 0]]],
    ],
  };

  const envelope = createConcaveEnvelope(fragmentedU);

  assert.equal(envelope.type, "Polygon");
  assert.equal(envelope.coordinates.length, 1);

  const [ring] = envelope.coordinates;
  assert.deepEqual(ring[0], ring.at(-1));
  for (const position of ring) {
    assert.equal(position.length, 2);
    assert.ok(position.every(Number.isFinite));
  }

  assert.ok(
    ring.some(
      ([longitude, latitude]) =>
        longitude > 0 && longitude < 4 && latitude > 0 && latitude < 4,
    ),
    "expected the hull to retain the U-shaped indentation",
  );
  assert.doesNotThrow(() => validateEnvelope(envelope));
});

test("validateEnvelope rejects malformed polygons", () => {
  assert.throws(() =>
    validateEnvelope({
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
    }),
  );
});

test("parses every parcel-derived boundary in source order", async () => {
  const sql = await readFile(SOURCE_MIGRATION, "utf8");
  const updates = parseBoundaryUpdates(sql);

  assert.deepEqual(
    updates.map(({ slug }) => slug),
    EXPECTED_SLUGS,
  );
});

test("creates a valid smaller envelope for every source boundary", async () => {
  const sql = await readFile(SOURCE_MIGRATION, "utf8");
  const updates = parseBoundaryUpdates(sql);

  for (const { slug, geometry } of updates) {
    const envelope = createConcaveEnvelope(geometry);

    assert.doesNotThrow(() => validateEnvelope(envelope), slug);
    assert.ok(
      countPositions(envelope.coordinates) < countPositions(geometry.coordinates),
      `${slug} should contain fewer positions than its source geometry`,
    );
  }
});

test("keeps every generated edge at or below 20 percent of its envelope diagonal", async () => {
  const sql = await readFile(SOURCE_MIGRATION, "utf8");
  const updates = parseBoundaryUpdates(sql);
  const violations = updates.flatMap(({ slug, geometry }) => {
    const share = longestEdgeShare(createConcaveEnvelope(geometry));
    return share > 0.2
      ? [{ slug, percentOfDiagonal: Number((share * 100).toFixed(2)) }]
      : [];
  });

  assert.deepEqual(
    violations,
    [],
    `edges over 20 percent: ${violations
      .map(({ slug, percentOfDiagonal }) => `${slug} ${percentOfDiagonal}%`)
      .join(", ")}`,
  );
});

test("generated migration exactly matches valid source envelopes in source order", async () => {
  const [sourceSql, outputSql] = await Promise.all([
    readFile(SOURCE_MIGRATION, "utf8"),
    readFile(OUTPUT_MIGRATION, "utf8"),
  ]);
  const sourceUpdates = parseBoundaryUpdates(sourceSql);
  const outputUpdates = parseBoundaryUpdates(outputSql);
  const generatedUpdates = sourceUpdates.map(({ slug, geometry }) => ({
    slug,
    geometry: createConcaveEnvelope(geometry),
  }));

  assert.deepEqual(
    outputUpdates.map(({ slug }) => slug),
    EXPECTED_SLUGS,
  );
  assert.deepEqual(outputUpdates, generatedUpdates);
  for (const { slug, geometry } of outputUpdates) {
    assert.doesNotThrow(() => validateEnvelope(geometry), slug);
  }
});
