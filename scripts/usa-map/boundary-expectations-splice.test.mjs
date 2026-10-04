import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareHunk, EXPECTATIONS_PATH, EXPECTATIONS_SQL, scopeFromArgs, scopeOf, serialize, spliceCountry, spliceScope,
} from "./splice-boundary-expectations.mjs";

const r = (canonical_key, over = {}) => ({
  canonical_key, boundary_method: "MANUAL", source_feature_id: `f:${canonical_key}`,
  normalized_checksum_sha256: "A", raw_snapshot_uri: null, raw_checksum_sha256: null, documented: true, ...over,
});

test("splice keeps every other country's committed row and reports the drift", () => {
  const existing = [r("france"), r("spain"), r("spain.x")];
  const fresh = [r("france", { normalized_checksum_sha256: "B" }), r("spain"), r("spain.x"),
    r("united-states.a"), r("united-states.b")];
  const { rows, otherCountryDiffs } = spliceCountry(existing, fresh, "united-states");
  assert.deepEqual(rows, [r("france"), r("spain"), r("spain.x"), r("united-states.a"), r("united-states.b")]);
  assert.deepEqual(otherCountryDiffs, ["france"]);
});

test("splice replaces stale united-states rows and never keeps one live no longer has", () => {
  const existing = [r("france"), r("united-states.a"), r("united-states.gone")];
  const fresh = [r("france"), r("united-states.a", { normalized_checksum_sha256: "C" })];
  const { rows, otherCountryDiffs } = spliceCountry(existing, fresh, "united-states");
  assert.deepEqual(rows, [r("france"), r("united-states.a", { normalized_checksum_sha256: "C" })]);
  assert.deepEqual(otherCountryDiffs, []);
});

test("compareHunk names a US row the expected file lacks, or one that differs", () => {
  const expected = [r("united-states.a")];
  assert.deepEqual(compareHunk(expected, [r("france"), r("united-states.a")]), []);
  assert.deepEqual(compareHunk(expected, [r("united-states.a"), r("united-states.b")]), ["united-states.b"]);
  assert.deepEqual(compareHunk(expected, [r("united-states.a", { documented: false })]), ["united-states.a"]);
  assert.deepEqual(compareHunk(expected, []), ["united-states.a"]);
});

test("the committed file round-trips byte for byte, and the SELECT is the generator's", async () => {
  const text = (await readFile(EXPECTATIONS_PATH, "utf8")).replace(/\r\n/g, "\n");
  assert.equal(serialize(JSON.parse(text)), text);
  const gen = (await readFile("scripts/wine-map-sources/generate-boundary-expectations.mjs", "utf8")).replace(/\r\n/g, "\n");
  assert.ok(gen.includes(`\`${EXPECTATIONS_SQL}\``), "EXPECTATIONS_SQL drifted from generate-boundary-expectations.mjs");
});

test("a footprint wave splices exactly the places it changed, in the live order (review 2026-10-04)", async () => {
  const existing = [r("france"), r("germany.mittelrhein.a"), r("germany.mittelrhein.b"), r("germany.pfalz.c"), r("spain")];
  const fresh = [
    r("france", { normalized_checksum_sha256: "B" }), // someone else's drift
    r("germany.mittelrhein.a", { boundary_method: "GENERALIZED_FROM_OFFICIAL_SOURCE" }), // the wave
    r("germany.mittelrhein.b", { boundary_method: "GENERALIZED_FROM_OFFICIAL_SOURCE" }), // not changed by the wave
    r("germany.pfalz.c"), r("italy.new"), r("spain"),
  ];
  const review = { places: [{ key: "germany.mittelrhein.a", changed: true }, { key: "germany.mittelrhein.b", changed: false }] };
  const { mine } = await scopeFromArgs(["--keys-from", "review.json"], async () => JSON.stringify(review));
  const { rows, otherCountryDiffs } = spliceScope(existing, fresh, mine);
  assert.deepEqual(rows, [r("france"), fresh[1], r("germany.mittelrhein.b"), r("germany.pfalz.c"), r("spain")]);
  assert.deepEqual(otherCountryDiffs, ["france", "germany.mittelrhein.b", "italy.new"]);
  const region = spliceScope(existing, fresh, scopeOf({ prefixes: ["germany.mittelrhein"] }));
  assert.deepEqual(region.rows.map((x) => x.boundary_method), ["MANUAL", "GENERALIZED_FROM_OFFICIAL_SOURCE", "GENERALIZED_FROM_OFFICIAL_SOURCE", "MANUAL", "MANUAL"]);
  assert.equal((await scopeFromArgs([])).label, "united-states");
  assert.equal((await scopeFromArgs(["--scope", "germany.mittelrhein,germany.pfalz"])).label, "germany.mittelrhein, germany.pfalz");
  assert.throws(() => scopeOf({ prefixes: [] }), /empty scope/);
});

test("splice keeps a committed out-of-scope row live no longer has, in its place", () => {
  const existing = [r("a"), r("b.gone"), r("c"), r("united-states.x")];
  const fresh = [r("a"), r("c"), r("united-states.x", { documented: false })];
  const { rows, otherCountryDiffs } = spliceCountry(existing, fresh, "united-states");
  assert.deepEqual(rows.map((x) => x.canonical_key), ["a", "b.gone", "c", "united-states.x"]);
  assert.equal(rows[3].documented, false);
  assert.deepEqual(otherCountryDiffs, ["b.gone"]);
});
