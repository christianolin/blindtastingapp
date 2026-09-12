// The current-boundary set, pinned. Read-only, and deliberately so.
//
// This was the "all migrated places have valid reviewed current boundaries"
// test inside world-wine-map-foundation.test.mjs. It is the only check in that
// suite that guards the MAP rather than the schema, and it is the only one that
// touches nothing: every statement here is a select.
//
// The rest of the foundation suite writes. Most of it rolls back, but the
// concurrency test commits two wine_places rows and removes them in a finally,
// and it opens extra connections, switches role, and waits on an advisory lock
// with a five-second ceiling. That is fine to run deliberately against a
// database you are willing to have fixtures land in. It is not fine on every
// pull request, so the two are separated and only this half is wired into CI.
//
// WHAT IT PROTECTS. boundary-expectations.json pins the reviewed boundary set,
// and generate-boundary-expectations.mjs regenerates it from live. The
// convention is that the JSON diff is part of a flip's review evidence -- but
// nothing enforced it, and nothing ran this test: vitest only collects
// src/**/*.test.ts and the tiles workflow ran neither. It drifted by 104 Italian
// rows and 9 changed Spanish/Italian ones across several merges before anyone
// noticed, which is exactly as long as it takes for a pinned snapshot to stop
// meaning anything.
//
// WHEN IT FAILS. Either a boundary changed and the snapshot was not
// regenerated -- run generate-boundary-expectations.mjs and commit the diff --
// or a boundary changed that nobody intended, which is the case worth catching.
// The diff names the canonical_key, so the two are easy to tell apart.
//
// Requires DB_PASSWORD.
// Usage: node --test scripts/wine-map-sources/boundary-expectations.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";

const EXPECTED_BOUNDARIES = JSON.parse(
  await readFile(new URL("../../data/wine-map/boundary-expectations.json", import.meta.url), "utf8"),
);

const client = new pg.Client(pgConfig());
before(() => client.connect());
after(() => client.end());

test("every current boundary is validated, valid and labelled", async () => {
  const { rows } = await client.query(
    `select count(*)::int total,
            count(*) filter (where b.quality_status = 'VALIDATED')::int validated,
            count(*) filter (where b.is_current)::int current,
            count(*) filter (where extensions.ST_IsValid(b.display_geometry))::int valid,
            count(*) filter (where extensions.ST_Covers(b.display_geometry, b.label_point))::int labelled
       from wine_place_boundaries b`,
  );
  const b = rows[0];
  assert.ok(b.total > 1300, `expected a populated boundary table, got ${b.total}`);
  assert.equal(b.validated, b.total, "every boundary must be VALIDATED");
  assert.equal(b.valid, b.total, "every boundary must be geometrically valid");
  assert.equal(b.labelled, b.total, "every boundary's label_point must sit inside its polygon");
  assert.ok(b.current > 0 && b.current <= b.total);
});

test("the current boundary set matches boundary-expectations.json", async () => {
  const { rows } = await client.query(
    `select p.canonical_key, b.boundary_method, s.source_feature_id,
            snapshot.normalized_checksum_sha256,
            snapshot.raw_snapshot_uri,
            snapshot.raw_checksum_sha256,
            snapshot.provenance_note is not null documented
       from wine_place_boundaries b
       join wine_places p on p.id = b.wine_place_id
       join wine_boundary_source_snapshots snapshot on snapshot.id = b.source_snapshot_id
       join wine_boundary_sources s on s.id = snapshot.source_id
      where b.is_current
      order by p.canonical_key`,
  );
  // Report the shape of the drift before deepEqual dumps 3 000 rows at you.
  const live = new Map(rows.map((r) => [r.canonical_key, JSON.stringify(r)]));
  const pinned = new Map(EXPECTED_BOUNDARIES.map((r) => [r.canonical_key, JSON.stringify(r)]));
  const added = [...live.keys()].filter((k) => !pinned.has(k));
  const removed = [...pinned.keys()].filter((k) => !live.has(k));
  const changed = [...live.keys()].filter((k) => pinned.has(k) && pinned.get(k) !== live.get(k));
  assert.deepEqual(
    { added, removed, changed },
    { added: [], removed: [], changed: [] },
    "live boundaries differ from boundary-expectations.json. If the change was intended, "
    + "re-run scripts/wine-map-sources/generate-boundary-expectations.mjs and commit the diff",
  );
  assert.deepEqual(rows, EXPECTED_BOUNDARIES);
});

test("every boundary resolves to a unique, documented source", async () => {
  const { rows } = await client.query(
    `select count(distinct s.id)::int sources,
            count(distinct snapshot.id)::int snapshots,
            count(distinct (s.source_namespace, s.source_feature_id))::int identities,
            count(*)::int linked_boundaries
       from wine_place_boundaries b
       join wine_boundary_source_snapshots snapshot on snapshot.id = b.source_snapshot_id
       join wine_boundary_sources s on s.id = snapshot.source_id`,
  );
  const prov = rows[0];
  const { rows: all } = await client.query("select count(*)::int n from wine_place_boundaries");
  assert.equal(prov.linked_boundaries, all[0].n, "every boundary must resolve to a snapshot and source");
  assert.equal(prov.sources, prov.identities, "source identities must be unique");
  assert.ok(prov.snapshots >= prov.sources, `snapshots (${prov.snapshots}) below sources (${prov.sources})`);
});
