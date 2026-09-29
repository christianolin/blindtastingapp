// scripts/usa-reference/us1-scoring-snapshot.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { expectedScoringAfter } from "./us1-scoring-snapshot.mjs";
import { SPEC_PATH } from "./us1-spec-lib.mjs";

const CA = "18d52236-681f-4a5a-ba98-cd0639210fb3";
const CA_ANCHOR = "ef4ebc71-aadf-4792-abae-300698f7b09f";
const base = (catalog_wines, answer_keys = []) => ({
  guesses: [{ id: "g1", total_points: 12 }], user_totals: [{ user_id: "u1", scored: 1, total: 12 }], leaderboards: { t1: [{ participant_id: "p1", total: 12 }] },
  answer_keys, catalog_wines,
});
const cw = (appellation, extra = {}) => ({ id: "639bb4bf-3ef9-4ce3-a68a-bb36f9b15682", region_id: CA, region: "California", appellation_id: CA_ANCHOR, appellation, ...extra });

test("a correct apply passes: 'California AVA' before, 'California' after (the renamed row, same id)", async () => {
  const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
  const before = base([cw("California AVA")]);
  assert.deepEqual(base([cw("California")]), expectedScoringAfter(before, spec));
});

test("an apply that left the rename undone, moved a wine or changed a point fails", async () => {
  const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
  const want = expectedScoringAfter(base([cw("California AVA")]), spec);
  assert.notDeepEqual(base([cw("California AVA")]), want);
  assert.notDeepEqual(base([cw("California", { appellation_id: "someone-else" })]), want);
  assert.notDeepEqual({ ...base([cw("California")]), guesses: [{ id: "g1", total_points: 11 }] }, want);
});

test("a merged row's reference goes to the kept row (renamed too), a moved AVA's to its new region", () => {
  const spec = {
    merges: [{ loser_id: "l", kept_id: "k", kept_name: "Sonoma County AVA", kept_region_id: "r-ca", kept_region: "California" }],
    moves: [{ id: "wwv", to_region_id: "r-wa", to_region: "Washington" }],
    renames: [{ id: "k", old: "Sonoma County AVA", new: "Sonoma County" }],
  };
  const before = base(
    [{ id: "w1", region_id: "r-ca", region: "California", appellation_id: "l", appellation: "Sonoma Co AVA" }],
    [{ wine_id: "a1", country: "United States", region_id: "r-wwv", region: "Walla Walla Valley", appellation_id: "wwv", appellation: "Walla Walla Valley AVA" }],
  );
  const after = expectedScoringAfter(before, spec);
  assert.deepEqual(after.catalog_wines, [{ id: "w1", region_id: "r-ca", region: "California", appellation_id: "k", appellation: "Sonoma County" }]);
  assert.deepEqual(after.answer_keys, [{ wine_id: "a1", country: "United States", region_id: "r-wa", region: "Washington", appellation_id: "wwv", appellation: "Walla Walla Valley AVA" }]);
});

test("a before-snapshot taken by the old names-only capture is refused, not silently compared", async () => {
  const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
  assert.throws(() => expectedScoringAfter(base([{ id: "w", region: "California", appellation: "California AVA" }]), spec), /re-run capture-us1-scoring/);
});
