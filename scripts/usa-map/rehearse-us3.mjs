// One US-3 batch's whole chain, rehearsed against live in ONE transaction that
// is always rolled back (plan 2026-09-30-usa-wine-map-us3 Tasks 22-24):
// catalog -> knowledge -> stage -> promote (-> archetype links step 2 for
// core), the out-of-order refusals, the rollback drills, and the read-only
// checks as a signed-in reader. For --batch rest while the core is not live,
// the core chain runs first in the same transaction (no drills). No commit
// path: the only terminal statement is the rollback in `finally`.
//
// It holds wine_place_neighbours_state's row for its whole run (8-9
// in-transaction refreshes, about 10 minutes): run the activity check first,
// never two at once, only as often as the plan says.
//
//   node --env-file=.env.local scripts/usa-map/rehearse-us3.mjs --batch core|rest [--sitting]
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import { loadStageInputs, stageWave } from "../wine-map-sources/usa-stage-lib.mjs";
import { previewRelease } from "./export-preview.mjs";
import { loadLinks2 } from "./render-us3-sql.mjs";
import { archetypeFacts, archetypeProblems, expectationRows, exportPreviewRows, shortlists } from "./us2-checks.mjs";
import {
  batchFacts, caRelationships, CHILDREN, CLICK_KEYS, clickResolution, EXPECTED_EDGES, NEARBY_KEYS, placeDetails, promotedFacts,
} from "./us3-checks.mjs";
import { CA_KEY } from "./us3-wave.mjs";
import { loadWave } from "./waves.mjs";

const argv = process.argv.slice(2);
const batch = argv.includes("--batch") ? argv[argv.indexOf("--batch") + 1] : null;
const SITTING = argv.includes("--sitting");
if (!["core", "rest"].includes(batch) || argv.some((a) => !["--batch", "core", "rest", "--sitting"].includes(a))) {
  console.error("usage: rehearse-us3.mjs --batch core|rest [--sitting]");
  process.exit(2);
}
const core = await loadWave("us3-core");
const rest = await loadWave("us3-rest");
const us2 = await loadWave("us2");
const wave = batch === "core" ? core : rest;
const links = await loadLinks2();
const stageInputs = await loadStageInputs({ wave, readFileFn: readFile, sha256hexFn: sha256hex });
const head = execSync("git rev-parse HEAD").toString().trim();
const EXPECTED_PATH = `data/wine-map/review/usa-us3-${batch}-expected-boundaries.json`;
const REHEARSAL_PATH = `data/wine-map/review/usa-us3-${batch}-rehearsal${SITTING ? "-sitting" : ""}.json`;
const REFRESH_LIMIT_S = 300;
const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
};

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
const file = (path) => readFile(path, "utf8");
const run = async (path) => client.query(await file(path));
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
const stage = (w, label) => stageWave(client, {
  wave: w, ...stageInputs, revision: releaseVersion(), importer: `scripts/usa-map/rehearse-us3.mjs@${head}`, label, log: () => {},
});
const byName = (m) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
const tag = `US-3 ${batch}`;

const result = { _generated_by: "scripts/usa-map/rehearse-us3.mjs", batch, git_head: head };
let expected;
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 2700000");
  result.rehearsed_at = (await q("select now() t"))[0].t.toISOString();

  // 1. Pre-flight.
  assert.ok(await recorded(us2.versions.promote), "the US-2 promote is not live");
  assert.ok(!(await recorded(wave.versions.promote)), `the ${batch} promote is already recorded live`);
  if (batch === "core") assert.ok(!(await recorded(core.versions.links)), "archetype links step 2 is already recorded live");
  result.cache_before = (await q("select fresh, built_at from public.wine_place_neighbours_state"))[0];
  result.applied_in_transaction = [];
  result.prepended = [];

  // 2. The rest batch needs the core live: run the core chain first if it is not.
  if (batch === "rest" && !(await recorded(core.versions.promote))) {
    if (!(await recorded(core.versions.catalog))) {
      await refreshing("prepend_core_catalog", "US-3 core catalog", () => run(core.files.catalog));
      result.prepended.push(core.files.catalog);
    }
    if (!(await recorded(core.versions.knowledge))) { await step("prepend_core_knowledge", () => run(core.files.knowledge)); result.prepended.push(core.files.knowledge); }
    await step("prepend_core_stage", () => stage(core, "STAGED-PREPEND"));
    await refreshing("prepend_core_promote", "US-3 core promote", () => run(core.files.promote));
    result.prepended.push("stageWave(us3-core)", core.files.promote);
  }

  const before = await step("shortlists_before", () => shortlists(client));

  // 3. Review Focus 3: the rest catalog refuses before the core catalog exists.
  if (batch === "core" && !(await recorded(core.versions.catalog))) {
    await expectRefusal("R_rest_catalog_before_core", /an earlier wave is missing or not VERIFIED/, () => run(rest.files.catalog));
  }

  // 4. This batch's catalog and knowledge.
  if (!(await recorded(wave.versions.catalog))) {
    await refreshing("catalog", `${tag} catalog`, () => run(wave.files.catalog));
    result.applied_in_transaction.push(wave.files.catalog);
  }
  if (!(await recorded(wave.versions.knowledge))) {
    await step("knowledge", () => run(wave.files.knowledge));
    result.applied_in_transaction.push(wave.files.knowledge);
  }
  assert.equal((await batchFacts(client, wave)).places, wave.places.length);

  // 5. Out-of-order refusals (Review Focus 3 and 5).
  if (batch === "core") {
    await expectRefusal("G_core_remove_while_rest_exists", /other California places exist \(remove the later batch first\)/, async () => {
      await run(rest.files.catalog);
      await run(core.rollbackFiles.remove);
    });
  }
  await expectRefusal("A_promote_before_stage", /expected exactly one DRAFT, non-current boundary per place/, () => run(wave.files.promote));
  if (batch === "core") await expectRefusal("B_links_before_promote", /is not VERIFIED with a current boundary/, () => run(core.files.links));

  // 6. Stage, exactly as the CLI's dry run; a second stage refuses.
  const stageReport = await step("stage", () => stage(wave, "STAGED-REHEARSAL"));
  await expectRefusal("C_stage_twice", /united-states boundaries already exist/, () => stage(wave, "x"));
  if (batch === "core") {
    await expectRefusal("S_rest_stage_before_core_promote", /an earlier wave is not live/, () => stage(rest, "x"));
  }

  // 7. Drill 1: unstage, re-stage, unstage again (the file is re-appliable).
  const rollbacks = {};
  await client.query("savepoint s1");
  {
    await refreshing("drill_unstage", `${tag} unstage`, () => run(wave.rollbackFiles.unstage));
    let f = await batchFacts(client, wave);
    rollbacks.unstage = { boundaries: f.current_validated + f.draft_boundaries, draft_places: f.places - f.verified, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unstage), [0, wave.places.length, true]);
    await step("drill_restage", () => stage(wave, "x"));
    await refreshing("drill_unstage_again", `${tag} unstage`, () => run(wave.rollbackFiles.unstage));
    f = await batchFacts(client, wave);
    rollbacks.unstage_again = { boundaries: f.current_validated + f.draft_boundaries, draft_places: f.places - f.verified, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unstage_again), [0, wave.places.length, true]);
  }
  await client.query("rollback to savepoint s1");

  // 8. Drill 2: remove, then catalog and knowledge apply again as committed.
  await client.query("savepoint s2");
  {
    await refreshing("drill_remove", `${tag} remove`, () => run(wave.rollbackFiles.remove));
    rollbacks.remove = {
      places: (await batchFacts(client, wave)).places,
      history_rows: (await q("select count(*)::int n from supabase_migrations.schema_migrations where version = any($1)",
        [[wave.versions.catalog, wave.versions.knowledge]]))[0].n,
    };
    assert.deepEqual(Object.values(rollbacks.remove), [0, 0]);
    await refreshing("drill_reapply_catalog", `${tag} catalog`, () => run(wave.files.catalog));
    await step("drill_reapply_knowledge", () => run(wave.files.knowledge));
    rollbacks.remove.reapplied_places = (await batchFacts(client, wave)).places;
    assert.equal(rollbacks.remove.reapplied_places, wave.places.length);
  }
  await client.query("rollback to savepoint s2");

  // 9. Refusal D: the unpublish before the promote.
  await expectRefusal("D_unpublish_before_promote", new RegExp(`${tag} unpublish: not VERIFIED with one current boundary`),
    () => run(wave.rollbackFiles.unpublish));

  // 10. The promote.
  await refreshing("promote", `${tag} promote`, () => run(wave.files.promote));
  result.applied_in_transaction.push(wave.files.promote);
  if (batch === "rest") result.central_valley = notices.find((m) => /Central Valley against its members/.test(m)) ?? null;

  // 11. Refusals after the promote.
  await expectRefusal("E_remove_after_promote", /keys are locked \(the promote ran\)/, () => run(wave.rollbackFiles.remove));
  if (batch === "rest") {
    await expectRefusal("H_core_unpublish_while_rest_live", /a later batch is live \(unpublish it first\)/, () => run(core.rollbackFiles.unpublish));
  }

  // 12. The promoted state.
  const facts = await batchFacts(client, wave);
  assert.deepEqual(facts, promotedFacts(wave), JSON.stringify(facts));

  // 13. The expected boundary-expectations hunk (every united-states row).
  expected = await expectationRows(client);
  assert.equal(expected.length, 16 + (batch === "core" ? 86 : 150));
  for (const p of wave.places) {
    const row = expected.find((r) => r.canonical_key === p.key);
    assert.deepEqual([row?.boundary_method, row?.source_feature_id, row?.documented],
      ["GENERALIZED_FROM_OFFICIAL_SOURCE", p.ucd_ava_id, true], p.key);
  }

  // 14. The tile preview.
  const preview = previewRelease(await step("export_preview", () => exportPreviewRows(client)));
  assert.deepEqual(preview.world, ["united-states", ...us2.states.map((s) => s.key)].sort());
  assert.deepEqual([preview.shards.california.keys.length, preview.shards.california.max_zoom], [wave.after.caPlaces, 12]);
  assert.equal(preview.outline.length, 11);
  assert.ok(preview.outline.includes(`${CA_KEY}.central-coast.san-francisco-bay`));
  assert.deepEqual(preview.outside, []);

  // 15. The details panel, as a signed-in reader.
  const details = await step("details", () => placeDetails(client, wave.places.map((p) => p.key)));
  for (const [key, d] of Object.entries(details)) assert.ok(d && d.article && d.grapes > 0 && d.styles > 0, `${key}: ${JSON.stringify(d)}`);
  const kids = await placeDetails(client, Object.keys(CHILDREN[batch]));
  for (const [key, want] of Object.entries(CHILDREN[batch])) assert.equal(kids[key].children, want, `children of ${key}`);
  if (batch === "core") {
    const rrv = details[`${CA_KEY}.north-coast.northern-sonoma.russian-river-valley`].ancestors;
    assert.ok(rrv.includes(`${CA_KEY}.north-coast`) && rrv.includes(`${CA_KEY}.north-coast.northern-sonoma`), `RRV breadcrumb ${rrv}`);
    assert.ok(!rrv.includes(`${CA_KEY}.north-coast.sonoma-coast`));
  }
  const rels = await caRelationships(client);
  assert.equal(rels.length, wave.after.caEdges);
  for (const e of EXPECTED_EDGES[batch]) assert.ok(rels.some((r) => r.type === e.type && r.source === e.source && r.target === e.target), JSON.stringify(e));
  const clicks = await clickResolution(client, CLICK_KEYS[batch]);
  for (const c of clicks) assert.equal(c.resolved, c.key, `a click on ${c.key}`);
  const nearby = await placeDetails(client, NEARBY_KEYS[batch]);

  // 16. The grape shortlists (§10.3).
  const after = await step("shortlists_after", () => shortlists(client));
  assert.equal(after.California.source, "map");

  // 17. Archetype links step 2 (core).
  let arch = null;
  let dots = null;
  if (batch === "core") {
    const pre = await archetypeFacts(client, links);
    await step("links", () => run(core.files.links));
    result.applied_in_transaction.push(core.files.links);
    arch = await archetypeFacts(client, links);
    assert.deepEqual(archetypeProblems(arch, links), []);
    if (arch.points) assert.deepEqual([arch.points.with_point, arch.points.placed_with_point], [15, 0]);
    await expectRefusal("F_links_twice", /pre-state is not step 1/, () => run(core.files.links));
    const point = (facts, id) => {
      const r = facts.room.find((x) => x.archetype_id === id);
      return r && r.point_lon != null ? [r.point_lon, r.point_lat].map((v) => Math.round(v * 1000) / 1000) : null;
    };
    dots = links.map((l) => {
      const was = point(pre, l.archetype_id);
      const now = point(arch, l.archetype_id);
      return { name: l.name, home: l.home, before: was, after: now, moved_km: was && now ? km(was, now) : null };
    });
  }

  // 18. Drill 3: unpublish (core: links back to step 1).
  await client.query("savepoint s3");
  {
    await refreshing("drill_unpublish", `${tag} unpublish`, () => run(wave.rollbackFiles.unpublish));
    const f = await batchFacts(client, wave);
    rollbacks.unpublish = { verified: f.verified, current: f.current_validated, locked: f.locked, fresh: f.fresh };
    assert.deepEqual(Object.values(rollbacks.unpublish), [0, 0, wave.places.length, true]);
    if (batch === "core") {
      const back = await archetypeFacts(client, links);
      for (const l of links) {
        const a = back.archetypes.find((x) => x.id === l.archetype_id);
        assert.deepEqual([a.home, a.placements], [l.from.home, [...l.from.placements].sort()], `${l.name} back to step 1`);
      }
      rollbacks.unpublish.links_back_to_step_1 = true;
    }
  }
  await client.query("rollback to savepoint s3");

  // 19. The evidence (written after the rollback below).
  const names = (s) => s.grapes;
  Object.assign(result, {
    timings_s: byName(timings),
    refreshes: byName(refreshes),
    refusals: byName(refusals),
    rollbacks,
    facts,
    parent_inside_lowest: stageReport.filter((r) => r.parent_inside != null)
      .sort((a, b) => a.parent_inside - b.parent_inside).slice(0, 5).map((r) => ({ key: r.key, parent_inside: r.parent_inside })),
    drift_highest: stageReport.slice().sort((a, b) => b.drift - a.drift).slice(0, 5).map((r) => ({ key: r.key, drift: r.drift })),
    clicks,
    nearby: Object.fromEntries(NEARBY_KEYS[batch].map((key) => [key, nearby[key]?.nearby ?? []])),
    shortlist: Object.fromEntries(Object.keys(before).map((st) => [st, {
      before_source: before[st].source, before: names(before[st]),
      after_source: after[st].source, after: names(after[st]), after_place: after[st].placeName,
      colours: byName({ ...before[st].colours, ...after[st].colours }),
    }])),
    export_preview: { world: preview.world, outline: preview.outline,
      shards: Object.fromEntries(Object.entries(preview.shards).map(([key, s]) => [key, { keys: s.keys.length, max_zoom: s.max_zoom, bytes: s.bytes }])) },
    archetypes: arch && { links: arch.archetypes, dots },
    stage_report: stageReport,
    notices: notices.filter((m) => /neighbour refresh|US-3|US archetype|Central Valley/.test(m)),
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
