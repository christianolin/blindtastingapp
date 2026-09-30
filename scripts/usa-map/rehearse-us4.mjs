// US-4's whole chain, rehearsed against live in ONE transaction that is always
// rolled back (plan 2026-09-30-usa-wine-map-us4 Tasks 14-15): catalog ->
// knowledge -> stage -> promote, the refusals, the rollback drills, and the
// read-only checks as a signed-in reader. No commit path: the only terminal
// statement is the rollback in `finally`.
//
// It holds wine_place_neighbours_state's row for its whole run (7 in-transaction
// refreshes, about 9 minutes): run the activity check first, never two at once,
// only as often as the plan says.
//
//   node --env-file=.env.local scripts/usa-map/rehearse-us4.mjs [--sitting]
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import { loadStageInputs, stageWave } from "../wine-map-sources/usa-stage-lib.mjs";
import { previewRelease } from "./export-preview.mjs";
import { archetypeFacts, archetypeProblems, expectationRows, exportPreviewRows, shortlists } from "./us2-checks.mjs";
import {
  CHILDREN, CLICK_KEYS, clickResolution, EXPECTED_EDGES, NEARBY_KEYS, placeDetails, promotedFacts, scopeRelationships,
  waveFacts, willametteLink,
} from "./us4-checks.mjs";
import { loadWave } from "./waves.mjs";

const argv = process.argv.slice(2);
const SITTING = argv.includes("--sitting");
if (argv.some((a) => a !== "--sitting")) { console.error("usage: rehearse-us4.mjs [--sitting]"); process.exit(2); }
const wave = await loadWave("us4");
const us2 = await loadWave("us2");
const link = await willametteLink();
const stageInputs = await loadStageInputs({ wave, readFileFn: readFile, sha256hexFn: sha256hex });
const head = execSync("git rev-parse HEAD").toString().trim();
const EXPECTED_PATH = "data/wine-map/review/usa-us4-expected-boundaries.json";
const REHEARSAL_PATH = `data/wine-map/review/usa-us4-rehearsal${SITTING ? "-sitting" : ""}.json`;
const REFRESH_LIMIT_S = 300;
const W = "united-states.washington.";
const O = "united-states.oregon.";
// Refusal G's probe: a DRAFT place under New York that no wave knows about.
const PROBE_SQL = `insert into public.wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'us4-rehearsal-probe', 'united-states.new-york.us4-rehearsal-probe', 'US-4 rehearsal probe', 'APPELLATION', 2, 6, 6,
       true, 'AVA', 'regional', 'DRAFT', 999, p.id
  from public.wine_places p where p.canonical_key = 'united-states.new-york'`;

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const client = new pg.Client({ connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""), ssl: { rejectUnauthorized: false } });
const notices = [];
client.on("notice", (n) => notices.push(n.message));

const t0 = Date.now();
const timings = {};
const secs = (from) => Math.round((Date.now() - from) / 100) / 10;
const log = (msg) => console.log(`[${secs(t0).toFixed(1)} s] ${msg}`);
async function step(name, fn) {
  const s = Date.now();
  const out = await fn();
  timings[name] = secs(s);
  log(`${name}: ${timings[name]} s`);
  return out;
}
const q = async (sql, params) => (await client.query(sql, params)).rows;
const recorded = async (v) => (await q("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).length > 0;
const run = async (path) => client.query(await readFile(path, "utf8"));
function refreshSeconds(label, from) {
  const hit = notices.slice(from).map((m) => new RegExp(`^${label}: neighbour refresh (-?\\d+) rows in ([\\d.]+) s$`).exec(m)).find(Boolean);
  assert.ok(hit, `no refresh notice for ${label}`);
  return { rows: Number(hit[1]), seconds: Number(hit[2]) };
}
const refreshes = {};
async function refreshing(name, label, fn) {
  const from = notices.length;
  const out = await step(name, fn);
  refreshes[name] = refreshSeconds(label, from);
  assert.ok(refreshes[name].rows >= 0 && refreshes[name].seconds < REFRESH_LIMIT_S, `${name}: refresh ${JSON.stringify(refreshes[name])}`);
  return out;
}
const refusals = {};
async function expectRefusal(name, pattern, fn) {
  await client.query(`savepoint refusal_${name}`);
  try {
    await fn();
  } catch (e) {
    assert.match(e.message, pattern, `refusal ${name}: wrong error`);
    refusals[name] = e.message.slice(0, 300);
    log(`refusal ${name}: ${refusals[name]}`);
    return;
  } finally {
    await client.query(`rollback to savepoint refusal_${name}`);
  }
  assert.fail(`refusal ${name}: expected ${pattern}, but it succeeded`);
}
const stage = (label) => stageWave(client, {
  wave, ...stageInputs, revision: releaseVersion(), importer: `scripts/usa-map/rehearse-us4.mjs@${head}`, label, log: () => {},
});
const byName = (m) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));

const result = { _generated_by: "scripts/usa-map/rehearse-us4.mjs", wave: "us4", git_head: head };
let expected;
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 2700000");
  result.rehearsed_at = (await q("select now() t"))[0].t.toISOString();

  // 1. Pre-flight.
  assert.ok(await recorded(us2.versions.promote), "the US-2 promote is not live");
  assert.ok(!(await recorded(wave.versions.promote)), "the US-4 promote is already recorded live");
  result.cache_before = (await q("select fresh, built_at from public.wine_place_neighbours_state"))[0];
  result.applied_in_transaction = [];
  const usBefore = (await expectationRows(client)).length;
  assert.equal(usBefore, 166, "166 current united-states boundaries before US-4 (US-0 .. US-3)");
  const before = await step("shortlists_before", () => shortlists(client));
  assert.deepEqual(archetypeProblems(await archetypeFacts(client, [link]), [link]), [], "the Willamette typical wine before US-4");

  // 2. The catalog (a second run refuses) and the knowledge.
  if (!(await recorded(wave.versions.catalog))) {
    await refreshing("catalog", "US-4 catalog", () => run(wave.files.catalog));
    result.applied_in_transaction.push(wave.files.catalog);
  }
  await expectRefusal("P_catalog_twice", /US-4 catalog: its places already exist/, () => run(wave.files.catalog));
  if (!(await recorded(wave.versions.knowledge))) {
    await step("knowledge", () => run(wave.files.knowledge));
    result.applied_in_transaction.push(wave.files.knowledge);
  }
  assert.equal((await waveFacts(client, wave)).places, wave.places.length);

  // 3. Refusals before the stage (Review Focus 3).
  await expectRefusal("G_remove_while_another_place_exists", /other places under Washington, Oregon or New York exist/, async () => {
    await client.query(PROBE_SQL);
    await run(wave.rollbackFiles.remove);
  });
  await expectRefusal("A_promote_before_stage", /expected exactly one DRAFT, non-current boundary per place/, () => run(wave.files.promote));

  // 4. Stage, exactly as the CLI's dry run; a second stage refuses.
  const stageReport = await step("stage", () => stage("STAGED-REHEARSAL"));
  await expectRefusal("C_stage_twice", /united-states boundaries already exist/, () => stage("x"));

  // 5. Drill 1: unstage, re-stage, unstage again (the file is re-appliable).
  const rollbacks = {};
  await client.query("savepoint s1");
  {
    await refreshing("drill_unstage", "US-4 unstage", () => run(wave.rollbackFiles.unstage));
    let f = await waveFacts(client, wave);
    rollbacks.unstage = { boundaries: f.current_validated + f.draft_boundaries, draft_places: f.places - f.verified, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unstage), [0, wave.places.length, true]);
    await step("drill_restage", () => stage("x"));
    await refreshing("drill_unstage_again", "US-4 unstage", () => run(wave.rollbackFiles.unstage));
    f = await waveFacts(client, wave);
    rollbacks.unstage_again = { boundaries: f.current_validated + f.draft_boundaries, draft_places: f.places - f.verified, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unstage_again), [0, wave.places.length, true]);
  }
  await client.query("rollback to savepoint s1");

  // 6. Drill 2: remove, then the catalog and knowledge apply again as committed.
  await client.query("savepoint s2");
  {
    await refreshing("drill_remove", "US-4 remove", () => run(wave.rollbackFiles.remove));
    rollbacks.remove = {
      places: (await waveFacts(client, wave)).places,
      history_rows: (await q("select count(*)::int n from supabase_migrations.schema_migrations where version = any($1)",
        [[wave.versions.catalog, wave.versions.knowledge]]))[0].n,
    };
    assert.deepEqual(Object.values(rollbacks.remove), [0, 0]);
    await refreshing("drill_reapply_catalog", "US-4 catalog", () => run(wave.files.catalog));
    await step("drill_reapply_knowledge", () => run(wave.files.knowledge));
    rollbacks.remove.reapplied_places = (await waveFacts(client, wave)).places;
    assert.equal(rollbacks.remove.reapplied_places, wave.places.length);
  }
  await client.query("rollback to savepoint s2");

  // 7. Refusal D: the unpublish before the promote.
  await expectRefusal("D_unpublish_before_promote", /US-4 unpublish: not VERIFIED with one current boundary/, () => run(wave.rollbackFiles.unpublish));

  // 8. The promote.
  await refreshing("promote", "US-4 promote", () => run(wave.files.promote));
  result.applied_in_transaction.push(wave.files.promote);
  result.state_shares = notices.filter((m) => /^US-4 promote: state share /.test(m));
  assert.equal(result.state_shares.length, 2, "Walla Walla Valley and Columbia Gorge");

  // 9. Refusals after the promote.
  await expectRefusal("E_remove_after_promote", /keys are locked \(the promote ran\)/, () => run(wave.rollbackFiles.remove));
  await expectRefusal("U_unstage_after_promote", /US-4 unstage: missing or not DRAFT/, () => run(wave.rollbackFiles.unstage));

  // 10. The promoted state.
  const facts = await waveFacts(client, wave);
  assert.deepEqual(facts, promotedFacts(wave), JSON.stringify(facts));

  // 11. The expected boundary-expectations hunk (every united-states row).
  expected = await expectationRows(client);
  assert.equal(expected.length, usBefore + wave.places.length);
  for (const p of wave.places) {
    const row = expected.find((r) => r.canonical_key === p.key);
    assert.deepEqual([row?.boundary_method, row?.source_feature_id, row?.documented],
      ["GENERALIZED_FROM_OFFICIAL_SOURCE", p.ucd_ava_id, true], p.key);
  }

  // 12. The tile preview.
  const preview = previewRelease(await step("export_preview", () => exportPreviewRows(client)));
  assert.deepEqual(preview.world, ["united-states", ...us2.states.map((s) => s.key)].sort());
  const shard = (k) => [preview.shards[k].keys.length, preview.shards[k].max_zoom];
  assert.deepEqual(shard("washington"), [wave.after.perState.WA.places, 11]);
  assert.deepEqual(shard("oregon"), [wave.after.perState.OR.places, 11]);
  assert.deepEqual(shard("new-york"), [wave.after.perState.NY.places, 9]);
  assert.deepEqual(shard("california"), [156, 12]);
  assert.equal(preview.outline.length, 12);
  assert.ok(preview.outline.includes("united-states.new-york.hudson-river-region"));
  assert.deepEqual(preview.outside, []);

  // 13. The details panel, as a signed-in reader.
  const details = await step("details", () => placeDetails(client, wave.places.map((p) => p.key)));
  for (const [key, d] of Object.entries(details)) assert.ok(d && d.article && d.grapes > 0 && d.styles > 0, `${key}: ${JSON.stringify(d)}`);
  const kids = await placeDetails(client, Object.keys(CHILDREN));
  for (const [key, want] of Object.entries(CHILDREN)) assert.equal(kids[key].children, want, `children of ${key}`);
  const rocks = details[`${O}the-rocks-district-of-milton-freewater`].ancestors;
  assert.ok(rocks.includes("united-states.oregon") && !rocks.some((k) => k.startsWith("united-states.washington")), `Rocks breadcrumb ${rocks}`);
  assert.ok(details[`${W}columbia-valley.yakima-valley.candy-mountain`].ancestors.includes(`${W}columbia-valley.yakima-valley`), "Candy Mountain under Yakima Valley");
  const rels = await scopeRelationships(client);
  assert.equal(rels.length, wave.after.scopeEdges);
  for (const e of EXPECTED_EDGES) assert.ok(rels.some((r) => r.type === e.type && r.source === e.source && r.target === e.target), JSON.stringify(e));
  const clicks = await clickResolution(client, CLICK_KEYS);
  for (const c of clicks) assert.equal(c.resolved, c.key, `a click on ${c.key}`);
  const nearby = await placeDetails(client, NEARBY_KEYS);

  // 14. The grape shortlists (§10.3, decision 9).
  const after = await step("shortlists_after", () => shortlists(client));
  for (const st of ["Washington", "Oregon", "New York"]) assert.equal(after[st].source, "map", st);
  assert.equal(after.Washington.grapes[0], "Cabernet Sauvignon");
  assert.equal(after.Oregon.grapes[0], "Pinot Noir");
  assert.equal(after["New York"].grapes[0], "Riesling");
  assert.deepEqual(after.California.grapes, before.California.grapes, "California's shortlist is untouched");

  // 15. The Willamette typical wine, unchanged (decision 10).
  const arch = await archetypeFacts(client, [link]);
  assert.deepEqual(archetypeProblems(arch, [link]), []);

  // 16. Drill 3: unpublish.
  await client.query("savepoint s3");
  {
    await refreshing("drill_unpublish", "US-4 unpublish", () => run(wave.rollbackFiles.unpublish));
    const f = await waveFacts(client, wave);
    rollbacks.unpublish = { verified: f.verified, current: f.current_validated, locked: f.locked, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unpublish), [0, 0, wave.places.length, true]);
    assert.deepEqual(archetypeProblems(await archetypeFacts(client, [link]), [link]), [], "the Willamette wine after the unpublish");
  }
  await client.query("rollback to savepoint s3");

  // 17. The evidence (written after the rollback below).
  Object.assign(result, {
    timings_s: byName(timings),
    refreshes: byName(refreshes),
    refusals: byName(refusals),
    rollbacks,
    facts,
    parent_inside_lowest: stageReport.filter((r) => r.parent_inside != null)
      .sort((a, b) => a.parent_inside - b.parent_inside).slice(0, 5).map((r) => ({ key: r.key, parent_inside: r.parent_inside })),
    drift_highest: stageReport.slice().sort((a, b) => b.drift - a.drift).slice(0, 5).map((r) => ({ key: r.key, drift: r.drift })),
    containment_lowest: stageReport.slice().sort((a, b) => a.containment - b.containment).slice(0, 5).map((r) => ({ key: r.key, containment: r.containment })),
    clicks,
    nearby: Object.fromEntries(NEARBY_KEYS.map((key) => [key, nearby[key]?.nearby ?? []])),
    shortlist: Object.fromEntries(Object.keys(before).map((st) => [st, {
      before_source: before[st].source, before: before[st].grapes,
      after_source: after[st].source, after: after[st].grapes, after_place: after[st].placeName,
      colours: byName({ ...before[st].colours, ...after[st].colours }),
    }])),
    export_preview: { world: preview.world, outline: preview.outline,
      shards: Object.fromEntries(Object.entries(preview.shards).map(([key, s]) => [key, { keys: s.keys.length, max_zoom: s.max_zoom, bytes: s.bytes }])) },
    archetypes: { name: link.name, home: arch.archetypes[0].home, placements: arch.archetypes[0].placements },
    stage_report: stageReport,
    notices: notices.filter((m) => /neighbour refresh|US-4/.test(m)),
  });
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

result.total_s = secs(t0);
result.mode = SITTING ? "sitting" : "pre-sitting";
await writeFile(REHEARSAL_PATH, `${JSON.stringify(result, null, 2)}\n`);
const expectedText = `${JSON.stringify(expected, null, 2)}\n`;
if (SITTING) {
  const committed = (await readFile(EXPECTED_PATH, "utf8")).replace(/\r\n/g, "\n");
  log(`wrote ${REHEARSAL_PATH}`);
  if (committed !== expectedText) {
    console.error(`REHEARSAL FAILED: the expected boundaries differ from the committed ${EXPECTED_PATH}; stop the sitting and investigate`);
    process.exit(1);
  }
  log(`the expected boundaries equal the committed ${EXPECTED_PATH}`);
} else {
  await writeFile(EXPECTED_PATH, expectedText);
  log(`wrote ${REHEARSAL_PATH} and ${EXPECTED_PATH}`);
}
console.log("REHEARSAL OK");
