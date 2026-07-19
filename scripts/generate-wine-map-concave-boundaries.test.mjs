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
