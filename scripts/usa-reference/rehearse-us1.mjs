// Rehearses US-1 against live in ONE transaction that is always rolled back
// (spec §6.4, §15 US-1). Nothing is committed: this file never sends COMMIT,
// and its finally block rolls back. Order:
//   drift   - a new reference to a merging row makes the forward refuse;
//   replay  - replay mode on live data gives the same rows as live mode;
//   forward - live mode, then the applier's history row;
//   in use  - the revert refuses while a new AVA row carries a wine;
//   revert  - restores the starting snapshot exactly.
// Usage: node scripts/usa-reference/rehearse-us1.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { REF_QUERIES } from "./us1-queries.mjs";
import { FORWARD_PATH, REVERT_PATH, SPEC_PATH, US1_REVERT_VERSION, US1_VERSION } from "./us1-spec-lib.mjs";

const NAPA_ARCHETYPE = "75e4e467-3929-4844-bbc4-ffe8b12523a1"; // "A typical Napa Cabernet Sauvignon"
const env = Object.fromEntries((await readFile(".env.local", "utf8")).split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
const forward = await readFile(FORWARD_PATH, "utf8");
const revert = await readFile(REVERT_PATH, "utf8");
for (const [p, sql] of [[FORWARD_PATH, forward], [REVERT_PATH, revert]]) assert.deepEqual(topLevelTransactionStatements(sql), [], p);
const ANCHOR = `"anchor_id": "${spec.anchor_id}"`;
assert.equal(forward.split(ANCHOR).length, 2, "the anchor appears exactly once");
const replayForward = forward.replace(ANCHOR, '"anchor_id": "00000000-0000-4000-8000-000000000000"');
const sloCoastLoser = spec.merges.find((m) => m.loser_name === "SLO Coast AVA").loser_id;

const c = new pg.Client({ connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""), ssl: { rejectUnauthorized: false } });
await c.connect();

async function snapshot() {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const [{ id: us }] = await q("select id from countries where name = 'United States'");
  const regionIds = [...new Set([...spec.pre.region_ids, ...spec.post.region_ids])];
  const appIds = [...new Set([
    ...(await q("select a.id from appellations a join regions r on r.id = a.region_id where r.country_id = $1", [us])).map((r) => r.id),
    ...spec.merges.map((m) => m.loser_id), ...spec.new_rows.map((r) => r.id)])];
  const references = {};
  for (const [t, sql] of REF_QUERIES) references[t] = (await c.query(sql, [regionIds, appIds])).rows[0].refs;
  return {
    regions: await q("select id, name, country_id, map_status::text, wine_place_id from regions where country_id = $1 order by id", [us]),
    appellations: await q("select a.id, a.name, a.region_id, a.map_status::text, a.wine_place_id from appellations a join regions r on r.id = a.region_id where r.country_id = $1 order by a.id", [us]),
    producers: await q("select id, region_id from producers where id = any ($1::uuid[]) order by id", [spec.post.producers.map((p) => p.id)]),
    region_grapes: await q("select region_id, grape_id, role from region_grapes where region_id = any ($1::uuid[]) order by region_id, grape_id", [regionIds]),
    references,
    catalog_wine_edits: (await q("select count(*)::int as n from catalog_wine_edits where catalog_wine_id = any ($1::uuid[])", [spec.pre.references.catalog_wines.map((w) => w.id)]))[0].n,
    history: (await q("select version from supabase_migrations.schema_migrations where version = any ($1) order by version", [[US1_VERSION, US1_REVERT_VERSION]])).map((r) => r.version),
  };
}
const withoutHistory = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "history"));

try {
  await c.query("begin");
  await c.query("set local statement_timeout = '300s'");
  const s0 = await snapshot();
  assert.equal(s0.regions.length, 28);
  assert.equal(s0.appellations.length, 240);
  assert.deepEqual(s0.history, []);

  await c.query("savepoint drift");
  await c.query("update wine_archetypes set appellation_id = $1 where id = $2", [sloCoastLoser, NAPA_ARCHETYPE]);
  await assert.rejects(c.query(forward), /pre-state: wine_archetypes references/);
  await c.query("rollback to savepoint drift");
  console.log("drift: refused as expected");

  await c.query("savepoint replay");
  await c.query(replayForward);
  const sReplay = await snapshot();
  await c.query("rollback to savepoint replay");

  await c.query(forward);
  await c.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [US1_VERSION, "usa_reference_cleanup", [forward]]);
  const s1 = await snapshot();
  assert.deepEqual(withoutHistory(sReplay), withoutHistory(s1), "replay mode = live mode");
  console.log("replay: same rows as live mode");
  assert.equal(s1.regions.length, spec.post.region_ids.length);
  assert.equal(s1.appellations.length, spec.post.appellation_count);
  assert.equal(s1.appellations.filter((a) => a.name.endsWith(" AVA")).length, spec.post.ava_suffixed);
  assert.equal(s1.catalog_wine_edits, s0.catalog_wine_edits, "no catalog wine moved, so no audit row");
  assert.deepEqual(s1.references.guesses, s0.references.guesses, "guesses never move");
  console.log(`forward: ${s1.regions.length} regions, ${s1.appellations.length} appellations`);

  await c.query("savepoint inuse");
  await c.query("update wine_archetypes set appellation_id = $1 where id = $2", [spec.new_rows.find((r) => r.region === "California").id, NAPA_ARCHETYPE]);
  await assert.rejects(c.query(revert), /is in use/);
  await c.query("rollback to savepoint inuse");
  console.log("in use: refused as expected");

  await c.query(revert);
  await c.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [US1_REVERT_VERSION, "usa_reference_cleanup_revert", [revert]]);
  const s2 = await snapshot();
  assert.deepEqual(withoutHistory(s2), withoutHistory(s0), "the revert restores the snapshot exactly");
  assert.deepEqual(s2.history, [US1_REVERT_VERSION]);
  console.log("REHEARSAL OK: forward, replay, drift, in-use and revert all hold; everything rolled back");
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
