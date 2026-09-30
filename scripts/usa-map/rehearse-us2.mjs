// The whole US-2 chain, rehearsed against live in ONE transaction that is
// always rolled back (plan 2026-09-29-usa-wine-map-us2 Task 14): catalog ->
// knowledge -> stage -> promote -> archetype links, the five out-of-order
// refusals, the three rollback drills, and the read-only checks as a signed-in
// reader. It has no commit path: its only terminal statement is the rollback
// in `finally`. It writes two local evidence files after the rollback:
//   data/wine-map/review/usa-us2-rehearsal.json
//   data/wine-map/review/usa-us2-expected-boundaries.json
// The owner-review file is rendered from the first (render-usa-us2-review.mjs),
// so those two are the pre-sitting evidence, committed with the review file.
//
// --sitting (sitting step 3) leaves both alone: it writes
//   data/wine-map/review/usa-us2-rehearsal-sitting.json
// (its timings, git head and date change on every run, and the review file the
// owner approved must not move with them), and it FAILS unless the expected
// boundaries it measures equal the committed file byte for byte, since the
// sitting's live checks (check-us2-live.mjs, the splice --check) compare
// against that file.
//
// While it runs it holds wine_place_neighbours_state's row (every catalogue
// write marks the cache stale): run the activity check first
// (scripts/usa-map/activity-check.mjs), never two at once, and only as often
// as the plan says. Several refreshes run in-transaction (about 1-2 min each).
//
//   node --env-file=.env.local scripts/usa-map/rehearse-us2.mjs [--sitting]
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import { loadStageInputs, roleOf, stageWave } from "../wine-map-sources/usa-stage-lib.mjs";
import { previewRelease } from "./export-preview.mjs";
import { loadLinks } from "./render-us2-sql.mjs";
import {
  archetypeFacts, archetypeProblems, contexts, expectationRows, exportPreviewRows, postPromoteFacts, shortlists,
} from "./us2-checks.mjs";
import { loadTrees, us2Wave, US2_FILES, US2_ROLLBACK_FILES, US2_VERSIONS } from "./us2-wave.mjs";

const SITTING = process.argv.slice(2).includes("--sitting");
for (const a of process.argv.slice(2)) if (a !== "--sitting") throw new Error(`unknown argument ${a}`);
const EXPECTED_PATH = "data/wine-map/review/usa-us2-expected-boundaries.json";
const REHEARSAL_PATH = SITTING
  ? "data/wine-map/review/usa-us2-rehearsal-sitting.json"
  : "data/wine-map/review/usa-us2-rehearsal.json";
const REFRESH_LIMIT_S = 300;
/** Great-circle km between two [lon, lat] points (the room's dot moves). */
const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
};

const wave = us2Wave(await loadTrees());
const links = await loadLinks();
const stageInputs = await loadStageInputs({ wave, readFileFn: readFile, sha256hexFn: sha256hex });
const head = execSync("git rev-parse HEAD").toString().trim();

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const client = new pg.Client({
  connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""),
  ssl: { rejectUnauthorized: false },
});
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
const n = async (sql, params) => Number((await q(sql, params))[0].n);
const recorded = async (v) => (await n("select count(*) n from supabase_migrations.schema_migrations where version = $1", [v])) > 0;
const file = (path) => readFile(path, "utf8");
/** The seconds a REFRESH_BLOCK notice reported for `label`, from the notices since `from`. */
function refreshSeconds(label, from) {
  const hit = notices.slice(from).map((m) => new RegExp(`^${label}: neighbour refresh (-?\\d+) rows in ([\\d.]+) s$`).exec(m)).find(Boolean);
  assert.ok(hit, `no refresh notice for ${label}`);
  return { rows: Number(hit[1]), seconds: Number(hit[2]) };
}
const refusals = {};
async function expectRefusal(name, pattern, fn) {
  await client.query(`savepoint refusal_${name}`);
  try {
    await fn();
  } catch (e) {
    assert.match(e.message, pattern, `refusal ${name}: wrong error`);
    refusals[name] = e.message;
    log(`refusal ${name}: ${e.message}`);
    return;
  } finally {
    await client.query(`rollback to savepoint refusal_${name}`);
  }
  assert.fail(`refusal ${name}: expected ${pattern}, but it succeeded`);
}
const US_PLACES = "(canonical_key = 'united-states' or canonical_key like 'united-states.%')";
const usPlaces = () => n(`select count(*) n from public.wine_places where ${US_PLACES}`);
const usBoundaries = () => n(`select count(*) n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
  where p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%'`);
const draftPlaces = () => n(`select count(*) n from public.wine_places where ${US_PLACES} and publication_status = 'DRAFT'`);
const fresh = async () => (await q("select fresh from public.wine_place_neighbours_state"))[0].fresh;
const byName = (m) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));

const result = { _generated_by: "scripts/usa-map/rehearse-us2.mjs", git_head: head };
let expected;
await client.connect();
try {
  // 1.
  await client.query("begin");
  await client.query("set local statement_timeout = 2700000");
  result.rehearsed_at = (await q("select now() t"))[0].t.toISOString();

  // 2. Pre-flight.
  assert.ok(!(await recorded(US2_VERSIONS.promote)), "the promote is already recorded live");
  assert.ok(!(await recorded(US2_VERSIONS.links)), "the archetype links are already recorded live");
  const catalogLive = await recorded(US2_VERSIONS.catalog);
  const knowledgeLive = await recorded(US2_VERSIONS.knowledge);
  if (!catalogLive) assert.equal(await usPlaces(), 0, "united-states places exist but the catalog is not recorded");
  assert.equal(await usBoundaries(), 0, "united-states boundaries exist already: rehearse before --stage");
  const pre = await archetypeFacts(client, links);
  for (const a of pre.archetypes) assert.equal(a.home, null, `${a.name} already has a home`);
  result.cache_before = (await q("select fresh, built_at from public.wine_place_neighbours_state"))[0];
  result.applied_in_transaction = [];

  // 3.
  const before = await step("shortlists_before", () => shortlists(client));

  // 4-5.
  if (!catalogLive) {
    const from = notices.length;
    await step("catalog", async () => client.query(await file(US2_FILES.catalog)));
    const r = refreshSeconds("US-2 catalog", from);
    timings.catalog_refresh_s = r.seconds;
    result.catalog_refresh_rows = r.rows;
    result.applied_in_transaction.push(US2_FILES.catalog);
  }
  if (!knowledgeLive) {
    await step("knowledge", async () => client.query(await file(US2_FILES.knowledge)));
    result.applied_in_transaction.push(US2_FILES.knowledge);
  }
  assert.equal(await draftPlaces(), wave.places.length);

  // 6-7. Out-of-order refusals (Review Focus 4).
  await expectRefusal("A_promote_before_stage", /expected exactly one DRAFT, non-current boundary per place/,
    async () => client.query(await file(US2_FILES.promote)));
  await expectRefusal("B_links_before_promote", /is not VERIFIED with a current boundary/,
    async () => client.query(await file(US2_FILES.links)));

  // 8. Stage, exactly as the CLI's dry run.
  const stageReport = await step("stage", () => stageWave(client, {
    wave, ...stageInputs,
    revision: releaseVersion(),
    importer: `scripts/usa-map/rehearse-us2.mjs@${head}`,
    label: "STAGED-REHEARSAL",
  }));
  result.applied_in_transaction.push("stageWave");

  // 9. A second stage refuses (Review Focus 2).
  await expectRefusal("C_stage_twice", /united-states boundaries already exist/, () => stageWave(client, {
    wave, ...stageInputs, revision: releaseVersion(), importer: "rehearsal", log: () => {},
  }));

  // 10. Drill 1: unstage.
  const rollbacks = {};
  await client.query("savepoint s1");
  {
    const from = notices.length;
    await step("drill_unstage", async () => client.query(await file(US2_ROLLBACK_FILES.unstage)));
    rollbacks.unstage = { us_boundaries: await usBoundaries(), draft_places: await draftPlaces(), fresh: await fresh(),
      refresh_s: refreshSeconds("US-2 unstage", from).seconds };
    assert.deepEqual([rollbacks.unstage.us_boundaries, rollbacks.unstage.draft_places, rollbacks.unstage.fresh], [0, 16, true]);
    // A second use (review round 2026-09-30): re-stage, which reuses the
    // immutable snapshots, then unstage again. The file itself is re-appliable;
    // apply-rollback.mjs records no history row that could refuse it.
    await step("drill_restage", () => stageWave(client, {
      wave, ...stageInputs, revision: releaseVersion(), importer: "rehearsal", log: () => {},
    }));
    assert.equal(await usBoundaries(), 16, "the re-stage wrote 16 boundaries");
    const again = notices.length;
    await step("drill_unstage_again", async () => client.query(await file(US2_ROLLBACK_FILES.unstage)));
    rollbacks.unstage_again = { us_boundaries: await usBoundaries(), draft_places: await draftPlaces(), fresh: await fresh(),
      refresh_s: refreshSeconds("US-2 unstage", again).seconds };
    assert.deepEqual([rollbacks.unstage_again.us_boundaries, rollbacks.unstage_again.draft_places, rollbacks.unstage_again.fresh], [0, 16, true]);
  }
  await client.query("rollback to savepoint s1");

  // 11. Drill 2: remove.
  await client.query("savepoint s2");
  {
    const from = notices.length;
    await step("drill_remove", async () => client.query(await file(US2_ROLLBACK_FILES.remove)));
    rollbacks.remove = {
      us_places: await usPlaces(),
      history_rows: await n("select count(*) n from supabase_migrations.schema_migrations where version = any($1)",
        [[US2_VERSIONS.catalog, US2_VERSIONS.knowledge]]),
      fresh: await fresh(),
      refresh_s: refreshSeconds("US-2 remove", from).seconds,
    };
    assert.deepEqual([rollbacks.remove.us_places, rollbacks.remove.history_rows, rollbacks.remove.fresh], [0, 0, true]);
    // The remove says both files apply again, as committed: prove it (review
    // round 2026-09-30). Petite Sirah is kept by the remove, and the knowledge
    // file's "on conflict (name) do nothing" applies over it.
    await step("drill_reapply_catalog", async () => client.query(await file(US2_FILES.catalog)));
    await step("drill_reapply_knowledge", async () => client.query(await file(US2_FILES.knowledge)));
    rollbacks.remove.reapplied = {
      draft_places: await draftPlaces(),
      petite_sirah_rows: await n("select count(*) n from public.grapes where name = 'Petite Sirah'"),
      grape_links: await n(`select count(*) n from public.wine_place_grapes g join public.wine_places p on p.id = g.wine_place_id
        where p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%'`),
      articles: await n(`select count(*) n from public.wine_place_articles a join public.wine_places p on p.id = a.wine_place_id
        where p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%'`),
    };
    const r = rollbacks.remove.reapplied;
    assert.deepEqual([r.draft_places, r.petite_sirah_rows, r.articles, r.grape_links], [16, 1, 16, 95], JSON.stringify(r));
  }
  await client.query("rollback to savepoint s2");

  // 12. Refusal D: the unpublish before the promote.
  await expectRefusal("D_unpublish_before_promote", /US-2 unpublish: .*not VERIFIED/,
    async () => client.query(await file(US2_ROLLBACK_FILES.unpublish)));

  // 13. The promote, and the §11 stop rule on both refreshes.
  {
    const from = notices.length;
    await step("promote", async () => client.query(await file(US2_FILES.promote)));
    const r = refreshSeconds("US-2 promote", from);
    timings.promote_refresh_s = r.seconds;
    result.promote_refresh_rows = r.rows;
    result.applied_in_transaction.push(US2_FILES.promote);
  }
  if (timings.catalog_refresh_s !== undefined) assert.ok(timings.catalog_refresh_s < REFRESH_LIMIT_S, "catalog refresh >= 300 s");
  assert.ok(timings.promote_refresh_s < REFRESH_LIMIT_S, "promote refresh >= 300 s");

  // 14. Refusal E: remove after the promote.
  await expectRefusal("E_remove_after_promote", /keys are locked \(the promote ran\)/,
    async () => client.query(await file(US2_ROLLBACK_FILES.remove)));

  // 15.
  const facts = await postPromoteFacts(client);
  assert.deepEqual(
    [facts.verified, facts.current_validated, facts.relationships, facts.fresh, facts.locked, facts.outline, facts.draft_boundaries],
    [16, 16, 1, true, 16, 10, 0], JSON.stringify(facts));

  // 16. The expected boundary-expectations hunk.
  expected = await expectationRows(client);
  assert.equal(expected.length, 16);
  const methodFor = { "ne-country": "MANUAL", "ne-state": "MANUAL", ucd: "GENERALIZED_FROM_OFFICIAL_SOURCE", derived: "DERIVED_FROM_DESCENDANTS" };
  for (const p of wave.places) {
    const row = expected.find((r) => r.canonical_key === p.key);
    assert.ok(row, `${p.key}: no expectation row`);
    const role = roleOf(p);
    const feature = role === "ne-country" ? "ne_50m_admin_0_countries_lakes:USA"
      : role === "ne-state" ? `ne_50m_admin_1_states_provinces_lakes:US-${p.map_state}`
        : role === "ucd" ? p.ucd_ava_id : `derived:${p.key.split(".")[2]}`;
    assert.deepEqual([row.boundary_method, row.source_feature_id, row.documented], [methodFor[role], feature, true], p.key);
  }

  // 17. The tile preview.
  const preview = previewRelease(await step("export_preview", () => exportPreviewRows(client)));
  const states = wave.states.map((s) => s.key);
  assert.deepEqual(preview.world, ["united-states", ...states].sort());
  assert.deepEqual(Object.fromEntries(Object.entries(preview.shards).map(([k, s]) => [k, [s.keys.length, s.max_zoom]])),
    { california: [6, 7], "new-york": [3, 7], oregon: [3, 7], washington: [3, 7] });
  assert.deepEqual(preview.outline, wave.outlineKeys);
  assert.deepEqual(preview.outside, []);

  // 18. The details panel, as a signed-in reader.
  const ctx = await step("contexts", () => contexts(client));
  for (const [key, c] of Object.entries(ctx)) {
    assert.ok(c && c.article && c.grapes > 0 && c.styles > 0, `${key}: ${JSON.stringify(c)}`);
  }
  assert.equal(ctx["united-states"].children, 4);
  assert.equal(ctx["united-states.california"].children, 5);

  // 19. The grape shortlists now come from the map.
  const after = await step("shortlists_after", () => shortlists(client));
  for (const [state, s] of Object.entries(after)) assert.equal(s.source, "map", `${state}: ${JSON.stringify(s)}`);

  // 20. Archetype links.
  await step("links", async () => client.query(await file(US2_FILES.links)));
  result.applied_in_transaction.push(US2_FILES.links);
  const arch = await archetypeFacts(client, links);
  assert.deepEqual(archetypeProblems(arch, links), []);
  if (arch.points) {
    assert.deepEqual([arch.points.with_point, arch.points.placed_with_point], [15, 0], "R2's check: 15 points, never a placed one");
  }

  // 21. Drill 3: unpublish.
  await client.query("savepoint s3");
  {
    const from = notices.length;
    await step("drill_unpublish", async () => client.query(await file(US2_ROLLBACK_FILES.unpublish)));
    const un = await archetypeFacts(client, links);
    rollbacks.unpublish = {
      verified: await n(`select count(*) n from public.wine_places where ${US_PLACES} and publication_status = 'VERIFIED'`),
      us_placements: un.archetypes.reduce((k, a) => k + a.placements.length, 0),
      null_homes: un.archetypes.filter((a) => a.home === null).length,
      points_restored: un.points ? links.every((l) => JSON.stringify(un.points.mine[l.archetype_id]) === JSON.stringify(l.display_point)) : null,
      with_point: un.points?.with_point ?? null,
      fresh: await fresh(),
      refresh_s: refreshSeconds("US-2 unpublish", from).seconds,
    };
    const u = rollbacks.unpublish;
    assert.deepEqual([u.verified, u.us_placements, u.null_homes, u.fresh], [0, 0, 3, true]);
    if (un.points) assert.deepEqual([u.points_restored, u.with_point], [true, 18]);
  }
  await client.query("rollback to savepoint s3");

  // 22. The evidence (written after the rollback below).
  const names = (s) => ({ source: s.source, place: s.placeName, grapes: s.grapes });
  Object.assign(result, {
    timings_s: byName(timings),
    refusals: byName(refusals),
    rollbacks,
    facts,
    contexts: ctx,
    shortlist: Object.fromEntries(Object.keys(before).map((st) => [st, {
      before_source: before[st].source, before: names(before[st]).grapes,
      after_source: after[st].source, after: names(after[st]).grapes, after_place: after[st].placeName,
      colours: byName({ ...before[st].colours, ...after[st].colours }),
    }])),
    export_preview: preview,
    archetypes: {
      links: arch.archetypes,
      room: [...arch.room].sort((a, b) => a.archetype_id.localeCompare(b.archetype_id)),
      points: arch.points && { with_point: arch.points.with_point, placed_with_point: arch.points.placed_with_point },
      // Where each wine's dot sits on the room's map before the links (R2's
      // curated point) and after (its home's label point).
      dots: links.map((l) => {
        const was = pre.points?.mine[l.archetype_id] ?? null;
        const r = arch.room.find((x) => x.archetype_id === l.archetype_id);
        const now = r && r.point_lon != null ? [r.point_lon, r.point_lat].map((v) => Math.round(v * 1000) / 1000) : null;
        return {
          name: l.name, home: l.home, before: was, after: now, after_point_key: r?.point_key ?? null,
          moved_km: was && was[0] != null && now ? km(was, now) : null,
        };
      }),
    },
    stage_report: stageReport,
    notices: notices.filter((m) => /neighbour refresh|US-2|US archetype/.test(m)),
  });
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

// 22 (cont.). Nothing above persisted: write the local evidence.
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
