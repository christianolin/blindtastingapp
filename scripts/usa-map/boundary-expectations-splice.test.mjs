import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareHunk, EXPECTATIONS_PATH, EXPECTATIONS_SQL, serialize, spliceCountry } from "./splice-boundary-expectations.mjs";

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
