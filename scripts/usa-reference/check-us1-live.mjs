// READ-ONLY post-apply check of US-1 (spec §15 US-1). Exit 1 on any failure.
// Usage: node scripts/usa-reference/check-us1-live.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { REF_QUERIES } from "./us1-queries.mjs";
import { expectedScoringAfter, scoringSnapshot } from "./us1-scoring-snapshot.mjs";
import { SPEC_PATH, US1_VERSION } from "./us1-spec-lib.mjs";

const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
let before = null;
try { before = JSON.parse(await readFile(".superpowers/usa-us1/scoring-before.json", "utf8")); } catch { console.log("WARN: no scoring-before.json; scoring comparison skipped"); }
await withReadOnly(async (c) => {
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  assert.equal((await q("select count(*)::int as n from supabase_migrations.schema_migrations where version = $1", [US1_VERSION]))[0].n, 1, "US-1 is recorded");
  const [{ id: us }] = await q("select id from countries where name = 'United States'");
  const regions = (await q("select id from regions where country_id = $1 order by id", [us])).map((r) => r.id);
  assert.deepEqual(regions, spec.post.region_ids, "26 US regions");
  const apps = await q("select id, name, region_id from appellations where region_id = any ($1) order by id", [regions]);
  assert.equal(apps.length, spec.post.appellation_count);
  assert.deepEqual(apps.filter((a) => a.name.endsWith(" AVA")).map((a) => a.name).sort(), [...spec.post.ava_names].sort());
  // The 6 state and 15 county names US-1 stripped of a false " AVA" must not exist any more.
  const forbidden = new Set(spec.renames.filter((r) => r.step !== "4_legal_names").map((r) => r.old));
  assert.deepEqual(apps.filter((a) => forbidden.has(a.name)).map((a) => a.name), [], "no US state or county row ends in \" AVA\"");
  const appIds = apps.map((a) => a.id);
  for (const [t, sql] of REF_QUERIES) assert.deepEqual((await c.query(sql, [regions, appIds])).rows[0].refs, spec.post.references[t], t);
  // Not a bare deepEqual with `before`: US-1 renames and re-points some US rows on
  // purpose (expectedScoringAfter), and every other difference is a failure.
  if (before) assert.deepEqual(await scoringSnapshot(c), expectedScoringAfter(before, spec), "scoring outputs unchanged (after the spec's own renames, merges and moves)");
  console.log("US-1 LIVE CHECK OK");
});
