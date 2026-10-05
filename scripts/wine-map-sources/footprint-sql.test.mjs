// Footprint cleanup fp-1. Two halves:
//   * pure (always): parameters, ladder, ordering, pending, SQL fragments, the
//     frozen Migration A and the rendered Migration W against the committed files,
//     every builder wired;
//   * geometry fixtures (FOOTPRINT_DB=1): the pure step (CORE_SQL, which reads no
//     table) run on synthetic shapes in ONE read-only transaction against the
//     database in .env.local (withReadOnly: BEGIN READ ONLY, always rolled back):
//     gaps, arms, holes, slivers, legal overlaps, separate islands, idempotency
//     and the area-change refusal.
//   node --test scripts/wine-map-sources/footprint-sql.test.mjs
//   FOOTPRINT_DB=1 node --test scripts/wine-map-sources/footprint-sql.test.mjs
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  CONTEXT_SQL, CORE_COLUMNS, CORE_PARAM_KEYS, CORE_SQL, FOOTPRINT_VERSION, MIGRATION_A, MIGRATION_A_SHA256, MIGRATION_A_VERSION, MIGRATION_W,
  MIGRATION_W_VERSION, PARAMS, STEP_SOURCES, WATER_COVERAGE, WATER_DOC, WATER_PROVENANCE, WATER_ROWS, WATER_ROWS_PARAM, WATER_ROWS_SHA256,
  WATER_TABLE, contextSql, ewkbBbox, independentFailuresSql, ladderReason, md5Lf, metricsOf, missingParams, renderMigrationW,
  renderTriggerRehearsal, renderWrapperRehearsal, rungs, waterCovered, waterRowsNear,
} from "./footprint-sql.mjs";
import {
  assertStampParams, bboxesMeet, cleanGeomCte, createPending, generationAfterCleanup, methodAfterCleanup, methodAfterCleanupSql,
  orderBatch, rawFromGeoJson, rungParams, stepProblems, withCleanupStamp, EINZELLAGE_CLEANED_NOTE,
} from "./footprint-cleanup.mjs";

// ---------------------------------------------------------------- pure

test("fp-1 parameters are the design's and frozen", () => {
  assert.equal(PARAMS.version, FOOTPRINT_VERSION);
  assert.equal(PARAMS.gap_m, 20);
  assert.equal(PARAMS.arm_m, 10);
  assert.equal(PARAMS.hole_share, 0.001);
  assert.equal(PARAMS.hole_min_m2, 2000);
  assert.equal(PARAMS.hole_max_m2, 250000);
  assert.equal(PARAMS.crumb_min_m2, 1000);
  assert.equal(PARAMS.crumb_max_m2, 1000, "owner 2026-10-04: keep parcels over 0.1 ha (the cap was 5,000 m²)");
  assert.equal(PARAMS.grid_deg, 0.000001);
  assert.equal(PARAMS.grow_max, 0.1);
  assert.equal(PARAMS.shrink_max, 0.03);
  assert.ok(Object.isFrozen(PARAMS));
});

test("the ladder accepts within [-3 %, +10 %] and never more parts", () => {
  const r = (before, after, pb = 3, pa = 1, valid = true) =>
    ({ area_m2_before: before, area_m2_after: after, parts_before: pb, parts_after: pa, valid });
  assert.equal(ladderReason(r(1000, 1100)), null);
  assert.equal(ladderReason(r(1000, 1100.01)), "grow");
  assert.equal(ladderReason(r(1000, 970)), null);
  assert.equal(ladderReason(r(1000, 969.9)), "shrink");
  assert.equal(ladderReason(r(1000, 1000, 1, 2)), "parts");
  assert.equal(ladderReason(r(1000, 1000, 1, 1, false)), "invalid");
  assert.equal(ladderReason(r(0, 0)), "invalid");
  assert.equal(ladderReason(null), "invalid");
});

test("the rungs are full, then close-only (no opening)", () => {
  const [[a, pa], [b, pb]] = rungs();
  assert.equal(a, "full");
  assert.equal(pa.arm_m, 10);
  assert.equal(b, "close-only");
  assert.equal(pb.arm_m, 0);
  assert.equal(pb.gap_m, PARAMS.gap_m);
});

test("metrics are every core column but the geometry, as JSON scalars", () => {
  const row = Object.fromEntries(CORE_COLUMNS.map((c, i) => [c, c === "clean4" ? "0106" : c === "valid" || c === "unchanged" ? true : String(i)]));
  const m = metricsOf(row);
  assert.equal("clean4" in m, false);
  assert.equal(m.valid, true);
  assert.equal(m.parts_before, CORE_COLUMNS.indexOf("parts_before"));
  assert.equal(Object.keys(m).length, CORE_COLUMNS.length - 1);
});

test("new overlap counts real ground only; sub-grid slivers (mean width < 0.1 m) are counted apart", () => {
  // Muscat de Rivesaltes, whole-map dry run 2026-10-04: one 16 m² piece 4 cm wide along its 1,397 km²
  // overlap with its neighbours, i.e. 1e-6 degree overlay noise, would otherwise trip the promote's
  // <= 1 m² assertion.
  assert.ok(CORE_COLUMNS.includes("new_overlap_sliver_m2"));
  assert.match(CORE_SQL, /filter \(where w >= 0\.1\)[^\n]*new_overlap_m2,/);
  assert.match(CORE_SQL, /filter \(where w < 0\.1\)[^\n]*new_overlap_sliver_m2,/);
});

test("batches run deepest tier first, then ascending area, then key", () => {
  const rows = [
    { key: "b", tier: 3, area: 10 }, { key: "a", tier: 4, area: 50 }, { key: "c", tier: 4, area: 5 },
    { key: "d", tier: 4, area: 5 }, { key: "e", tier: 0, area: 1 },
  ];
  assert.deepEqual(orderBatch(rows).map((r) => r.key), ["c", "d", "a", "b", "e"]);
});

test("pending carries cleaned outputs only, filtered by bbox", () => {
  const p = createPending();
  p.add("u1", { hex: "AA", bbox: [7, 49, 7.01, 49.01], cleanup: { status: "cleaned" } });
  p.add("u2", { hex: "BB", bbox: [8, 50, 8.01, 50.01], cleanup: { status: "unchanged" } });
  p.add("u3", { hex: "CC", bbox: [9, 51, 9.01, 51.01], cleanup: { status: "cleaned" } });
  assert.equal(p.size, 2);
  assert.equal(p.get("u2"), null);
  assert.deepEqual(p.near([7.005, 49.005, 7.02, 49.02]), { u1: "AA" });
  assert.deepEqual(Object.keys(p.near(null)).sort(), ["u1", "u3"]);
  assert.equal(bboxesMeet([0, 0, 1, 1], [1.005, 0, 2, 1], 0.01), true);
  assert.equal(bboxesMeet([0, 0, 1, 1], [1.05, 0, 2, 1], 0.01), false);
});

test("the shared CTE calls the function and the stamp rides on generation_parameters", () => {
  const byId = cleanGeomCte({ placeId: "$11" });
  assert.match(byId, /^geom as \(select c\.geom g, c\.cleanup from public\.wine_footprint_clean\(\(select g from geom_raw\), \(\$11\)::uuid, /);
  const byKey = cleanGeomCte({ placeKey: "$15", pending: "$16" });
  assert.match(byKey, /canonical_key = \$15/);
  assert.match(byKey, /coalesce\(\(\$16\)::jsonb, '\{\}'::jsonb\)/);
  assert.throws(() => cleanGeomCte({}), /exactly one/);
  assert.throws(() => cleanGeomCte({ placeId: "$1", placeKey: "$2" }), /exactly one/);
  assert.equal(withCleanupStamp("$13"), "(($13)::jsonb || jsonb_build_object('cleanup', geom.cleanup))");
  assert.match(rawFromGeoJson("$1"), /ST_GeomFromGeoJSON\(\$1\), 4326\)\), 3\)\)$/);
  assert.match(methodAfterCleanupSql("'MANUAL'"), /GENERALIZED_FROM_OFFICIAL_SOURCE/);
});

test("a cleaned MANUAL footprint becomes generalized; an as-is Einzellage note is corrected", () => {
  assert.equal(methodAfterCleanup("MANUAL", "cleaned"), "GENERALIZED_FROM_OFFICIAL_SOURCE");
  assert.equal(methodAfterCleanup("MANUAL", "unchanged"), "MANUAL");
  assert.equal(methodAfterCleanup("DERIVED_FROM_DESCENDANTS", "cleaned"), "DERIVED_FROM_DESCENDANTS");
  const g = generationAfterCleanup({ engine: "weinbergsrolle-asis", generalised: false, note: "x" }, { status: "cleaned" });
  assert.equal(g.generalised, true);
  assert.equal(g.note, EINZELLAGE_CLEANED_NOTE);
  assert.deepEqual(generationAfterCleanup({ engine: "concave" }, { status: "unchanged" }),
    { engine: "concave", cleanup: { status: "unchanged" } });
});

test("Migration A is frozen: the pre-water step exactly as 851c21c rendered it (track A may apply it first)", async () => {
  // review 2026-10-05: an edit of A in place never reaches a database that recorded its version
  // already, so A never changes again; the water rule is Migration W. Line endings aside.
  const committed = (await readFile(MIGRATION_A, "utf8")).replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(committed).digest("hex"), MIGRATION_A_SHA256);
  assert.equal(MIGRATION_A_VERSION, "20261004090000");
  assert.doesNotMatch(committed, /wine_footprint_water|p_sea/, "A knows nothing of the sea");
  for (const fn of ["wine_footprint_clean_core(", "wine_footprint_clean(", "wine_place_boundaries_require_cleanup("]) {
    const line = committed.split("\n").find((l) => l.startsWith(`revoke all on function public.${fn}`));
    assert.ok(line, `no revoke for ${fn}`);
    assert.match(line, /from public, anon, authenticated, service_role;$/);
  }
  assert.match(committed, /before insert or update of display_geometry on public\.wine_place_boundaries/);
  assert.match(committed, /errcode = '23514'/);
});

test("Migration W is rendered from the module (no drift), a NEW version after A and after every version live when it was written", async () => {
  const committed = (await readFile(MIGRATION_W, "utf8")).replace(/\r\n/g, "\n");
  assert.equal(committed, renderMigrationW());
  assert.equal(MIGRATION_W_VERSION, "20261005122000");
  assert.ok(MIGRATION_W.startsWith(`supabase/migrations/${MIGRATION_W_VERSION}_`));
  // A (20261004090000) and the first German promotes (20261005115558 mittelrhein, 20261005121018 pfalz) were
  // recorded live before W was written (review 2026-10-05): W replays after them, never before
  assert.ok(MIGRATION_W_VERSION > MIGRATION_A_VERSION && MIGRATION_W_VERSION > "20261005121018", "after A and every version live when W was written");
  const names = (await readdir("supabase/migrations")).filter((n) => n.startsWith("2026100"));
  assert.ok(names.includes(MIGRATION_W.split("/").pop()) && names.includes(MIGRATION_A.split("/").pop()));
});

test("Migration W loads the sea, swaps in the 7-argument core and the water wrapper, locks EXECUTE, checks itself", () => {
  const sql = renderMigrationW();
  assert.match(sql, /^do \$pre\$\n[\s\S]*Migration W needs Migration A \(20261004090000\) applied first/m, "refuses to run before A");
  for (const fn of ["wine_footprint_clean_core(", "wine_footprint_clean("]) {
    const line = sql.split("\n").find((l) => l.startsWith(`revoke all on function public.${fn}`));
    assert.ok(line, `no revoke for ${fn}`);
    assert.match(line, /from public, anon, authenticated, service_role;$/);
  }
  assert.match(sql, /^revoke all on function public\.wine_footprint_clean_core\([^)]*, jsonb, extensions\.geometry, extensions\.geometry\) from/m);
  assert.match(sql, /^drop function if exists public\.wine_footprint_clean_core\(extensions\.geometry, extensions\.geometry, extensions\.geometry, extensions\.geometry, jsonb\);$/m,
    "A's 5-argument core goes");
  assert.doesNotMatch(sql, /create trigger|wine_place_boundaries_require_cleanup\(\)\s*returns/, "the trigger stays A's");
  assert.ok(sql.includes(`as $core$${STEP_SOURCES.core}$core$;`), "the core function body is CORE_SQL verbatim");
  assert.ok(sql.includes(`as $fn$${STEP_SOURCES.wrapper}$fn$;`), "the wrapper body is STEP_SOURCES.wrapper verbatim");
  // it changes no existing data: its only writes load its own new sea table
  const writes = sql.split("\n").filter((l) => /\binsert into\b|\bdelete from\b|\bupdate public\.|\btruncate\b/i.test(l));
  assert.equal(writes.length, WATER_ROWS.length);
  for (const l of writes) {
    assert.match(l, /^insert into public\.wine_footprint_water \(id, aoi, geom\) values \(\d+, '(europe|usa|world)', '[0-9a-f]+'::extensions\.geometry\) on conflict \(id\) do update set aoi = excluded\.aoi, geom = excluded\.geom;$/);
  }
  assert.match(sql, /revoke all on table public\.wine_footprint_water from public, anon, authenticated, service_role;/);
  assert.match(sql, /alter table public\.wine_footprint_water enable row level security;/);
  // the same-transaction checks: the rows' hash, the sources' md5, the privileges
  assert.ok(sql.includes(`<> '${WATER_ROWS_SHA256}' then`));
  assert.ok(sql.includes(`<> '${md5Lf(STEP_SOURCES.wrapper)}'`) && sql.includes(`<> '${md5Lf(STEP_SOURCES.core)}' then`));
  assert.match(sql, /has_function_privilege\('authenticated', 'public\.wine_footprint_clean_core\(/);
});

test("the live step is this module's only with the water sources, the 7-argument core and the committed sea rows", () => {
  const ok = { wrapperSrc: STEP_SOURCES.wrapper, coreSrc: STEP_SOURCES.core, coreASrc: null, waterTable: true, waterSha: WATER_ROWS_SHA256, waterRows: WATER_ROWS.length };
  assert.deepEqual(stepProblems(ok), { live: true, problems: [] });
  assert.deepEqual(stepProblems({ ...ok, wrapperSrc: STEP_SOURCES.wrapper.replace(/\n/g, "\r\n"), coreSrc: STEP_SOURCES.core.replace(/\n/g, "\r\n") }).problems, [],
    "a CRLF checkout's bodies are the same step");
  assert.equal(stepProblems({ wrapperSrc: null }).live, false);
  // track A applied Migration A first: its wrapper (no sea), its 5-argument core, no table
  const aOnly = stepProblems({ wrapperSrc: "\ndeclare\n  -- A's wrapper\nbegin\nend\n", coreSrc: null, coreASrc: "select 1", waterTable: false });
  assert.equal(aOnly.live, true);
  assert.equal(aOnly.problems.length, 4, aOnly.problems.join("\n"));
  assert.match(aOnly.problems.join("\n"), /7-argument wine_footprint_clean_core does not exist live/);
  assert.match(aOnly.problems.join("\n"), /5-argument wine_footprint_clean_core still exists/);
  assert.match(aOnly.problems.join("\n"), /not this module's wrapper/);
  assert.match(aOnly.problems.join("\n"), /wine_footprint_water does not exist live/);
  assert.match(stepProblems({ ...ok, waterSha: "f".repeat(64) }).problems[0], /holds 376 row\(s\) hashing to ffffffffffff, not the 376 committed rows/);
  assert.match(stepProblems({ ...ok, coreSrc: STEP_SOURCES.core.replace("prm.wr", "prm.cb") }).problems[0], /not this module's CORE_SQL/);
});

test("a stamp must carry the run's own params for its rung (review 2026-10-05)", () => {
  assert.deepEqual(rungParams(PARAMS, "full"), PARAMS);
  assert.equal(rungParams(PARAMS, "close-only").arm_m, 0);
  assert.equal(rungParams(PARAMS, "none").arm_m, 0, "a skipped place carries the last rung tried");
  // jsonb reorders keys: the order never matters
  const reordered = Object.fromEntries(Object.entries(PARAMS).reverse());
  assertStampParams({ rung: "full", params: reordered }, PARAMS);
  assertStampParams({ rung: "close-only", params: { ...PARAMS, arm_m: 0 } }, PARAMS);
  // a live function on Migration A ran its built-in pre-water params
  const { water_reach_m: _a, coast_reach_m: _b, coast_band_m: _c, ...preWater } = PARAMS;
  assert.throws(() => assertStampParams({ rung: "full", params: preWater }, PARAMS, "porto-ercole"),
    /stamp of porto-ercole: params differ from the run's \(rung full\) on coast_band_m, coast_reach_m, water_reach_m/);
  assert.throws(() => assertStampParams({ rung: "full", params: { ...PARAMS, crumb_max_m2: 5000 } }, PARAMS), /on crumb_max_m2/);
  assert.throws(() => assertStampParams({ rung: "close-only", params: PARAMS }, PARAMS), /on arm_m/);
});

test("params missing a key are refused, never read as NULL (review 2026-10-05)", () => {
  const unused = ["version", "denoise_m", "grow_max", "shrink_max", "near_m", "protect_min_m2"];
  assert.deepEqual([...CORE_PARAM_KEYS].sort(), Object.keys(PARAMS).filter((k) => !unused.includes(k)).sort(), "every key the core reads");
  for (const k of CORE_PARAM_KEYS) assert.ok(CORE_SQL.includes(`'${k}'`), k);
  assert.ok(CORE_SQL.includes(`p ?& array[${CORE_PARAM_KEYS.map((k) => `'${k}'`).join(", ")}] then p->>'gap_m'`));
  assert.match(CORE_SQL, /'wine_footprint_clean_core: params lack ' \|\| array_to_string/);
  assert.match(STEP_SOURCES.wrapper, /if not \(v_params \?& array\['gap_m', [^\]]*'coast_band_m', 'grow_max', 'shrink_max'\]\) then\n {4}raise exception 'wine_footprint_clean: p_params lacks a key of %'/);
  assert.deepEqual(missingParams(PARAMS), []);
  const { water_reach_m: _w, ...review4Params } = PARAMS;
  assert.deepEqual(missingParams(review4Params), ["water_reach_m"]);
});

test("the sea covers every latitude where wine grows; outside it the step refuses (review 2026-10-05)", () => {
  assert.deepEqual([...WATER_COVERAGE], [-180, -57, 180, 57]);
  assert.deepEqual(Object.keys(WATER_DOC._provenance.aoi), ["europe", "usa", "world"]);
  // europe and usa first, unchanged ids (the 2026-10-05 coastal recompute ran on them), then the rest of the band
  assert.deepEqual([...new Set(WATER_ROWS.map((r) => r.aoi))], ["europe", "usa", "world"]);
  assert.equal(WATER_ROWS.filter((r) => r.aoi !== "world").length, 70);
  assert.equal(WATER_ROWS.findIndex((r) => r.aoi === "world"), 70);
  // the places the review named now have sea near them: Santorini, Nemea, Cyprus, the Black Sea coast,
  // Malagash and Annapolis (Nova Scotia), Hawaii, the southern hemisphere
  const near = { santorini: [25.35, 36.35, 25.48, 36.47], nemea: [22.6, 37.75, 22.75, 37.88], cyprus: [32.8, 34.75, 33.0, 34.9],
    blackSea: [27.8, 43.1, 28.0, 43.3], malagash: [-63.45, 45.75, -63.35, 45.82], annapolis: [-65.6, 44.7, -64.5, 45.1],
    hawaii: [-156.4, 20.6, -156.2, 20.8], capeTown: [18.8, -34.0, 19.0, -33.8], marlborough: [173.6, -41.6, 174.1, -41.4] };
  for (const [name, b] of Object.entries(near)) {
    assert.ok(waterRowsNear(b, 0.25).length > 0, `${name}: no sea within reach`);
    assert.equal(waterCovered(b), true, name);
  }
  // within the 15 km of a former box edge the sea now continues past it (22°E, -64°)
  assert.ok(WATER_ROWS.some((r) => r.aoi === "world" && r.bbox[0] <= 22 && r.bbox[2] > 22.2 && r.bbox[1] < 40 && r.bbox[3] > 36));
  assert.equal(waterCovered([10, 56.8, 10.1, 56.9]), false, "Skagen-ish: beyond 57°N less the reach");
  assert.equal(waterCovered([179.9, -40, 180, -39]), false, "the antimeridian edge");
  assert.equal(waterCovered([-124.71, 24.5423, 18.52038, 55.05869]), true, "the whole catalogue of 2026-10-05");
  assert.match(CONTEXT_SQL, /st_coveredby\(st_expand\(\$2::geometry, 0\.25\), st_makeenvelope\(-180, -57, 180, 57, 4326\)\) water_covered/);
  assert.match(STEP_SOURCES.wrapper, /if v_ctx\.water_covered is not true then\n {4}raise exception 'wine_footprint_clean: place % \(%\) is outside the sea data/);
  assert.deepEqual(ewkbBbox(WATER_ROWS[0].hex), WATER_ROWS[0].bbox);
  assert.deepEqual(WATER_PROVENANCE.rows_sha256, WATER_ROWS_SHA256);
  assert.equal(WATER_PROVENANCE.rows, WATER_ROWS.length);
});

test("keep water out: the parameters, the sea pieces and the context", () => {
  assert.equal(PARAMS.water_reach_m, 3000);
  assert.equal(PARAMS.coast_reach_m, 300);
  assert.equal(PARAMS.coast_band_m, 15000);
  assert.equal(WATER_DOC._provenance.ne_commit, "ca96624a56bd078437bca8184e78163e5039ad19");
  assert.ok(WATER_ROWS.length > 50, "the sea pieces are committed");
  assert.deepEqual(WATER_ROWS.map((r) => r.id), WATER_ROWS.map((_, k) => k + 1));
  for (const r of WATER_ROWS) assert.match(r.hex, /^0103000020e6100000/, "a 2D SRID-4326 polygon (the column type)");
  // Porto Ercole (Maremma) has sea near it; the Pfalz has none (no German place gets water in its context)
  assert.ok(waterRowsNear([11.19, 42.37, 11.22, 42.40]).length > 0);
  assert.equal(waterRowsNear([7.9, 49.1, 8.1, 49.3]).length, 0);
  assert.ok(CONTEXT_SQL.includes("from (select w.id, w.geom g from public.wine_footprint_water w) w"));
  assert.ok(contextSql({ waterRows: WATER_ROWS_PARAM }).includes("jsonb_array_elements($4::jsonb)"));
  assert.ok(CONTEXT_SQL.includes("st_collect(wat.g order by wat.id)"), "the sea's stamp hash never depends on the read order");
  assert.equal(WATER_TABLE, "public.wine_footprint_water");
  // the rule: open pieces of the closing that are coastal, or dam a basin within the sea band, are left out
  assert.ok(CORE_SQL.includes("st_dwithin(f.geom, w.sea, prm.wr)"));
  assert.ok(CORE_SQL.includes("st_dwithin(f.geom, w.outc, prm.cr) and st_dwithin(f.geom, w.sea, prm.cb)"));
  assert.ok(CORE_SQL.includes("(coalesce(st_dwithin(f.geom, nh.h, 0.01), false) and st_dwithin(f.geom, w.sea, prm.cb))"));
  assert.equal((CORE_SQL.match(/where w\.sea is not null and st_dwithin\(c\.g, w\.sea, prm\.cb\)/g) ?? []).length, 3,
    "every keep-water-out lateral is empty far from the sea");
  assert.ok(CORE_SQL.includes("case when not coalesce(bool_or(z.wet), false) then clo0.g"), "no wet piece: the closing exactly as before");
});

// Every INSERT into wine_place_boundaries in the pipeline goes through the step.
const WRITER_DIRS = ["scripts/wine-map-sources", "scripts/wine-map-tiles"];
test("every builder's boundary INSERT goes through wine_footprint_clean with a stamp", async () => {
  const offenders = [];
  let sites = 0;
  for (const dir of WRITER_DIRS) {
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".mjs") || name.endsWith(".test.mjs") || name.startsWith("footprint-")) continue;
      const text = await readFile(`${dir}/${name}`, "utf8");
      const n = (text.match(/insert into (public\.)?wine_place_boundaries/gi) ?? []).length;
      if (!n) continue;
      sites += n;
      const calls = (text.match(/\$\{cleanGeomCte\(|\$\{cleanGeomLateral\(|\$\{cleanVariableSql\(/g) ?? []).length;
      const stamps = (text.match(/\$\{withCleanupStamp\(|\$\{STAMP_SUFFIX\}|'cleanup', v_cleanup\)/g) ?? []).length;
      if (calls < n || stamps < n) offenders.push(`${dir}/${name}: ${n} insert(s), ${calls} clean call(s), ${stamps} stamp(s)`);
    }
  }
  assert.ok(sites >= 37, `found only ${sites} boundary INSERTs`);
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------- geometry fixtures (read-only DB)

const DB = process.env.FOOTPRINT_DB === "1";
// Shapes in UTM 32N metres near the Pfalz (x 430 km, y 5,450 km), transformed to 4326 in SQL.
const X = 430000;
const Y = 5450000;
const sq = (x, y, w, h = w) => `((${X + x} ${Y + y},${X + x + w} ${Y + y},${X + x + w} ${Y + y + h},${X + x} ${Y + y + h},${X + x} ${Y + y}))`;
const ring = (x, y, w, h = w) => `(${X + x} ${Y + y},${X + x} ${Y + y + h},${X + x + w} ${Y + y + h},${X + x + w} ${Y + y},${X + x} ${Y + y})`;
const MP = (...polys) => `MULTIPOLYGON(${polys.join(",")})`;
const holed = (outer, ...holes) => `(${outer.slice(1, -1)},${holes.join(",")})`;

test("geometry fixtures (read-only, FOOTPRINT_DB=1)", { skip: !DB && "set FOOTPRINT_DB=1 to run the step on synthetic shapes" }, async (t) => {
  const { withReadOnly } = await import("./read-only-client.mjs");
  await withReadOnly(async (c) => {
    await c.query("set local search_path = public, extensions");
    const g = async (wkt) => (await c.query(
      // on the 6-decimal grid, as stored boundaries are
      "select encode(st_asewkb(st_multi(st_reduceprecision(st_transform(st_setsrid(st_geomfromtext($1), 32632), 4326), 0.000001))), 'hex') h", [wkt])).rows[0].h;
    const core = async (raw, { blk = null, par = null, prot = null, params = PARAMS, sea = null, outside = null } = {}) =>
      (await c.query(CORE_SQL, [raw, blk, par, prot, JSON.stringify(params), sea, outside])).rows[0];
    const hexOf = async (geom) => (await c.query("select encode(st_asewkb($1::geometry), 'hex') h", [geom])).rows[0].h;
    const area = async (geom) => Number((await c.query("select st_area(st_transform($1::geometry, 32632)) a", [geom])).rows[0].a);
    const delta = (r) => r.area_m2_after / r.area_m2_before - 1;

    await t.test("a clean shape comes back byte for byte", async () => {
      const raw = await g(MP(sq(0, 0, 300)));
      const r = await core(raw);
      assert.equal(r.unchanged, true);
      assert.equal(await hexOf(r.clean4), raw);
    });

    await t.test("gaps: parcels 4 m apart become one block; 60 m apart stay separate", async () => {
      const raw = await g(MP(sq(0, 0, 100), sq(104, 0, 100), sq(400, 0, 100)));
      const r = await core(raw);
      assert.equal(r.unchanged, false);
      assert.equal(r.parts_before, 3);
      assert.equal(r.parts_after, 2, "the 4 m road closes, the 196 m gap does not");
      assert.equal(r.clusters, 2);
      assert.ok(delta(r) > 0 && delta(r) < 0.02, `area ${delta(r)}`);
      assert.equal(ladderReason(r), null);
    });

    await t.test("arms: a 3 m wide, 100 m long arm is opened away; a narrow-but-real place is kept", async () => {
      const raw = await g(MP(`((${X} ${Y},${X + 200} ${Y},${X + 200} ${Y + 100},${X + 300} ${Y + 100},${X + 300} ${Y + 103},${X + 200} ${Y + 103},${X + 200} ${Y + 200},${X} ${Y + 200},${X} ${Y}))`));
      const r = await core(raw);
      assert.equal(r.parts_after, 1);
      assert.ok(r.lost_m2 > 250 && r.lost_m2 < 350, `arm area lost ${r.lost_m2}`);
      const strip = await g(MP(sq(0, 0, 400, 8)));
      const s = await core(strip);
      assert.equal(s.unchanged, true, "an 8 m strip would vanish under the opening: kept whole");
    });

    await t.test("holes: a 400 m² hole is filled, a 1 ha hole is kept", async () => {
      const raw = await g(MP(holed(sq(0, 0, 400), ring(50, 50, 20), ring(200, 200, 100))));
      const r = await core(raw);
      assert.equal(r.holes_before, 2);
      assert.equal(r.holes_after, 1);
      assert.equal(r.hole_floor_m2, 2000);
    });

    await t.test("slivers and islands: a 400 m² speck is dropped, a 1 ha island 500 m away is kept", async () => {
      const raw = await g(MP(sq(0, 0, 400), sq(900, 0, 20), sq(900, 900, 100)));
      const r = await core(raw);
      assert.equal(r.parts_before, 3);
      assert.equal(r.parts_after, 2);
      assert.equal(r.dropped_parts, 1);
      const far = await g(MP(sq(0, 0, 100), sq(300, 0, 100)));
      assert.equal((await core(far)).unchanged, true, "two separate 1 ha parcels 200 m apart stay as they are");
    });

    await t.test("crumb cap 1,000 m² (owner 2026-10-04): a 3,000 m² detached parcel is kept, a 400 m² speck goes", async () => {
      // a 100 ha place: under the old 5,000 m² cap its floor was clamp(0.5 % x 100 ha, 1,000, 5,000) = 5,000 m²
      const raw = await g(MP(sq(0, 0, 1000), sq(1500, 0, 60, 50), sq(1500, 600, 20)));
      const r = await core(raw);
      assert.equal(r.crumb_floor_m2, 1000);
      assert.equal(r.parts_before, 3);
      assert.equal(r.parts_after, 2, "the 3,000 m² parcel 500 m away stays");
      assert.equal(r.dropped_parts, 1, "only the 400 m² speck is dropped");
      assert.ok(r.lost_m2 > 350 && r.lost_m2 < 450, `lost ${r.lost_m2}`);
      const old = await core(raw, { params: { ...PARAMS, crumb_max_m2: 5000 } });
      assert.equal(old.crumb_floor_m2, 5000);
      assert.equal(old.parts_after, 1, "the 5,000 m² cap dropped it");
    });

    await t.test("blockers: closing never grows onto a non-partner; a legal partner is not a blocker", async () => {
      // two parcels with a 12 m gap; the neighbour fills that gap's middle 4 m
      const raw = await g(MP(sq(0, 0, 100), sq(112, 0, 100)));
      const nb = await g(MP(sq(104, -50, 4, 200)));
      const blocked = await core(raw, { blk: nb });
      assert.equal(blocked.new_overlap_m2, 0, "no new ground on the neighbour");
      const free = await core(raw);
      assert.ok(free.grown_m2 > blocked.grown_m2, "without the blocker (a DUAL_LABEL/OVERLAPS partner) the gap fills");
      // an existing overlap is kept, never enlarged
      const ov = await g(MP(sq(90, 0, 30, 100)));
      const kept = await core(raw, { blk: ov });
      assert.equal(kept.new_overlap_m2, 0);
      assert.ok(kept.raw_overlap_m2 > 900, "the raw overlap is reported");
    });

    await t.test("containment: no new ground outside the parent, raw ground never clipped", async () => {
      const raw = await g(MP(sq(0, 0, 100), sq(104, 0, 100)));
      const par = await g(MP(sq(-10, -10, 110, 220)));
      const r = await core(raw, { par });
      assert.equal(r.outside_parent_new_m2, 0);
      assert.ok(await area(r.clean4) >= (await area(raw)) - 0.5, "the raw part outside the parent stays");
    });

    await t.test("protected ground: a parent never drops a speck a descendant holds", async () => {
      const raw = await g(MP(sq(0, 0, 400), sq(900, 0, 20)));
      const prot = await g(MP(sq(902, 2, 10)));
      const r = await core(raw, { prot });
      assert.equal(r.parts_after, 2, "the speck holds descendant ground: kept");
      assert.equal(r.protected_lost_m2, 0);
    });

    // keep water out (owner 2026-10-03, "Keep water out (Recommended)"). The sea and the outside of the
    // national outline are gates only, so a coarse sea polygon that overlaps the land (as 1:50m does) is fine.
    const overlap = async (geom, region) => Number((await c.query(
      "select coalesce(st_area(st_intersection(st_transform($1::geometry, 32632), st_transform($2::geometry, 32632))), 0) a", [geom, region])).rows[0].a);

    await t.test("keep water out: a marina between jetties 15 m apart stays open to the sea", async () => {
      // a quay with four 12 m jetties (too wide to be opened as arms) and three 15 m x 100 m basins
      const raw = await g(MP(sq(0, 0, 300, 100), sq(0, 100, 12, 100), sq(27, 100, 12, 100), sq(54, 100, 12, 100), sq(81, 100, 12, 100)));
      const basins = await g(MP(sq(12, 100, 15, 100), sq(39, 100, 15, 100), sq(66, 100, 15, 100)));
      const sea = await g(MP(sq(-1000, 100, 3000, 2000)));
      const dry = await core(raw);
      assert.ok(await overlap(dry.clean4, basins) > 4400, "without the sea the closing fills the basins (the Porto Ercole fault)");
      assert.equal(dry.water_pieces, 0);
      const wet = await core(raw, { sea });
      assert.ok(await overlap(wet.clean4, basins) < 1, `basin water filled: ${await overlap(wet.clean4, basins)} m²`);
      assert.ok(wet.water_pieces >= 1 && wet.water_left_m2 > 4400, `water left ${wet.water_left_m2} m² in ${wet.water_pieces}`);
      assert.equal(wet.unchanged, true, "nothing else to clean: the input comes back byte for byte");
      assert.equal(await hexOf(wet.clean4), raw);
    });

    await t.test("keep water out: a road gap between two parcels still closes inland; near the sea it stays open", async () => {
      const raw = await g(MP(sq(0, 0, 100), sq(108, 0, 100)));
      const inland = await core(raw);
      assert.equal(inland.parts_after, 1, "the 8 m road closes");
      const far = await core(raw, { sea: await g(MP(sq(0, 5100, 1000))) });
      assert.equal(await hexOf(far.clean4), await hexOf(inland.clean4), "sea 5 km away: byte for byte as with no sea");
      assert.equal(far.water_pieces, 0);
      const coast = await core(raw, { sea: await g(MP(sq(0, 1100, 1000))) });
      assert.equal(coast.parts_after, 2, "1 km from the 1:50m sea the gap is taken for water: the accepted cost");
      assert.ok(coast.water_pieces >= 1);
    });

    await t.test("keep water out: the national outline's shore gates within the sea band only", async () => {
      const raw = await g(MP(sq(0, 0, 100), sq(108, 0, 100)));
      const sea = await g(MP(sq(0, 8200, 1000))); // 8 km away: beyond water_reach_m, inside coast_band_m
      const shore = await core(raw, { sea, outside: await g(MP(sq(-1000, 150, 3000, 500))) });
      assert.equal(shore.parts_after, 2, "50 m from outside the outline: coastal");
      const inland = await core(raw, { sea, outside: await g(MP(sq(-1000, 1100, 3000, 500))) });
      assert.equal(inland.parts_after, 1, "1 km from it: land, the gap closes");
      const noSea = await core(raw, { outside: await g(MP(sq(-1000, 150, 3000, 500))) });
      assert.equal(noSea.parts_after, 1, "no sea within the band (a land border, an inland lake): no gate");
    });

    await t.test("keep water out: within the sea band the closing never dams a bay into a hole", async () => {
      // a 60 m x 60 m bay behind a 15 m mouth (Long Island's creeks): beyond both reaches, inside the band
      const raw = await g(MP(sq(0, 0, 160, 50), sq(0, 50, 50, 100), sq(110, 50, 50, 100), sq(0, 150, 50, 30), sq(65, 150, 95, 30)));
      const bay = await g(MP(sq(50, 50, 60, 100)));
      const inland = await core(raw);
      assert.equal(inland.holes_after, 1, "inland the 15 m mouth closes and the bay becomes a hole (as before)");
      const band = await core(raw, { sea: await g(MP(sq(0, 8200, 1000))) });
      assert.equal(band.holes_after, 0, "8 km from the sea: the mouth stays open");
      assert.ok(band.water_pieces >= 1);
      assert.ok(await overlap(band.clean4, bay) < 1);
      const far = await core(raw, { sea: await g(MP(sq(0, 20300, 1000))) });
      assert.equal(await hexOf(far.clean4), await hexOf(inland.clean4), "beyond the band: exactly as before");
    });

    await t.test("keep water out: an inland lake edge closes as before; an enclosed hole by the sea is filled", async () => {
      // two prongs 15 m apart around a lake inlet (no water data for lakes: they are land to the rule)
      const raw = await g(MP(sq(0, 0, 215, 100), sq(0, 100, 100, 200), sq(115, 100, 100, 200)));
      const inlet = await g(MP(sq(100, 100, 15, 200)));
      const none = await core(raw);
      assert.ok(await overlap(none.clean4, inlet) > 2900, "the 15 m inlet closes");
      const far = await core(raw, { sea: await g(MP(sq(0, 20300, 1000))) });
      assert.equal(await hexOf(far.clean4), await hexOf(none.clean4), "sea 20 km away: exactly as before");
      // a 20 m hole (a pond, a yard) in ground right on the shore is the place's own: still filled
      const pond = await g(MP(holed(sq(0, 0, 400), ring(50, 50, 20))));
      const shore = await core(pond, { sea: await g(MP(sq(-1000, 400, 3000, 1000))) });
      assert.equal(shore.holes_after, 0);
      assert.equal(shore.water_pieces, 0);
    });

    await t.test("idempotent: cleaning the output again changes nothing", async () => {
      const raw = await g(MP(sq(0, 0, 100), sq(104, 0, 100), sq(208, 0, 100), holed(sq(0, 300, 300), ring(100, 400, 10))));
      const once = await core(raw);
      assert.equal(once.unchanged, false);
      const twice = await core(await hexOf(once.clean4));
      assert.equal(twice.unchanged, true);
      assert.equal(await hexOf(twice.clean4), await hexOf(once.clean4));
    });

    await t.test("area-change refusal: a comb that would more than double is refused by the ladder", async () => {
      const teeth = Array.from({ length: 20 }, (_, i) => sq(i * 7, 0, 3, 300));
      const raw = await g(MP(...teeth));
      const full = await core(raw);
      assert.equal(ladderReason(full), "grow", `full rung area ${delta(full)}`);
      const closeOnly = await core(raw, { params: rungs()[1][1] });
      assert.equal(ladderReason(closeOnly), "grow");
    });
  }, { statementTimeoutMs: 60000 });
});

// ---------------------------------------------------------------- review 2026-10-04 fixes (pure)

test("F2: a neighbour blocks with its stored row AND its pending output (only a staged DRAFT equal to it is skipped)", () => {
  assert.doesNotMatch(CONTEXT_SQL, /and not exists \(select 1 from pend where pend\.id = b\.wine_place_id\)\n/);
  assert.match(CONTEXT_SQL, /and \(b\.is_current or not exists \(select 1 from pend where pend\.id = b\.wine_place_id and pend\.g = b\.display_geometry\)\)/);
  assert.match(CONTEXT_SQL, /input_boundary_id'\)::uuid/, "a promoted wave's recorded input still blocks later waves");
});

test("F1/F7: the pass never re-derives a parent; every metric is against the stored row", async () => {
  const pass = await readFile("scripts/wine-map-sources/footprint-pass.mjs", "utf8");
  assert.doesNotMatch(pass, /DERIVE_SQL|rederived: raw|childrenOf\(/);
  assert.match(pass, /async function rawInput\(c, place\) \{/);
  const sql = await import("./footprint-sql.mjs");
  assert.equal(sql.DERIVE_SQL, undefined);
});

test("F4: Migration W qualifies its geometry types; the rehearsals share the wrapper and trigger bytes", () => {
  const sql = renderMigrationW();
  assert.match(sql, /returns table \(clean4 extensions\.geometry, /);
  const ddl = sql.split("\n").filter((l) => /^(returns|create|revoke|drop|  p_)/.test(l)).join("\n");
  assert.doesNotMatch(ddl, /(?<!extensions\.)\bgeometry\b/, "no unqualified geometry type in the DDL");
  const fnBody = sql.slice(sql.indexOf("as $fn$\ndeclare"), sql.indexOf("$fn$;\n\ndrop function if exists public.wine_footprint_clean_core"));
  assert.ok(fnBody.length > 1000, "the wrapper body was found");
  const rehearsal = renderWrapperRehearsal({ rawHex: "00", placeId: "11111111-1111-1111-1111-111111111111" });
  // every wrapper line but the two core calls and the return appears in the rehearsal, in order
  // (the context reads the sea from the table there, from $4 = the committed pieces here)
  const lines = fnBody.split("\n").slice(1).filter((l) => l.trim() && !l.includes("wine_footprint_clean_core(") && !l.includes("return query")
    && !l.includes(WATER_TABLE) && !l.includes("into v_ctx using"));
  assert.ok(rehearsal.includes(WATER_ROWS_PARAM), "the rehearsal's context reads the committed sea pieces");
  assert.ok(rehearsal.includes("into v_ctx using p_place_id, p_raw, v_pending, p_water;"));
  let at = 0;
  for (const l of lines) {
    const i = rehearsal.indexOf(l, at);
    assert.ok(i >= 0, `rehearsal lacks: ${l}`);
    at = i;
  }
  assert.equal((rehearsal.match(/execute \$core\$/g) ?? []).length, 2);
  const trig = renderTriggerRehearsal({ geomHex: "00", generationParameters: {} });
  assert.ok(trig.includes("raise exception 'wine_place_boundaries: display_geometry must come from public.wine_footprint_clean"));
  assert.ok(trig.includes("v_new.generation_parameters->'cleanup'->>'output_sha256'"));
});

test("F3: the multi-place Germany builders run the batch guard (raws pending, independent check before commit)", async () => {
  for (const f of ["build-germany-einzellagen.mjs", "stage-germany-weinbau.mjs", "stage-hessen-weinbau.mjs"]) {
    const text = await readFile(`scripts/wine-map-sources/${f}`, "utf8");
    assert.match(text, /createBatchGuard\(client, /, f);
    assert.match(text, /cleanGeomCte\(\{ place(Id|Key): "\$\d+", pending: "\$\d+" \}\)/, f);
    assert.match(text, /guard\.pendingFor\(/, f);
    assert.match(text, /await guard\.check\(/, f);
  }
  const check = independentFailuresSql({ waveSql: "select null::uuid place_id, null::geometry g_new, null::geometry g_old" });
  for (const kind of ["new_ground_on_neighbour", "outside_parent", "descendant_ground_lost"]) assert.ok(check.includes(`'${kind}'`), kind);
  assert.match(check, /x\.m2 > 1/);
});

// ---------------------------------------------------------------- review 2026-10-04 fixes (read-only DB)

const MECK = "germany.pfalz.mittelhaardt-dt-weinstrasse.hofstueck.meckenheim-";
test("review fixes against live shapes (read-only, FOOTPRINT_DB=1)", { skip: !DB && "set FOOTPRINT_DB=1" }, async (t) => {
  const { withReadOnly } = await import("./read-only-client.mjs");
  const { cleanFootprint, readContext } = await import("./footprint-cleanup.mjs");
  await withReadOnly(async (c) => {
    await c.query("set local search_path = public, extensions");
    const place = async (key) => (await c.query(
      `select p.id, b.id bid, encode(st_asewkb(b.display_geometry), 'hex') hex
         from wine_places p join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
        where p.canonical_key = $1`, [key])).rows[0];
    const neuberg = await place(`${MECK}neuberg`);
    const spielberg = await place(`${MECK}spielberg`);
    assert.ok(neuberg && spielberg, "the Meckenheim fixtures exist");

    await t.test("F2: a pending neighbour still blocks with its stored row", async () => {
      // Spielberg pending as a tiny square: its whole stored row must still be in Neuberg's blockers
      const tiny = (await c.query("select encode(st_asewkb(st_multi(st_expand(st_centroid($1::geometry), 0.0001))), 'hex') h", [spielberg.hex])).rows[0].h;
      const ctx = await readContext(c, { placeId: neuberg.id, raw: neuberg.hex, pendingJson: JSON.stringify({ [spielberg.id]: tiny }) });
      const r = (await c.query("select st_area(st_difference($1::geometry, $2::geometry)::geography) left_out", [spielberg.hex, ctx.blockers])).rows[0];
      assert.ok(Number(r.left_out) < 1, `Spielberg's stored ground left unblocked: ${r.left_out} m²`);
    });

    await t.test("F3: a not-yet-written neighbour's raw, passed as pending, blocks the closing", async () => {
      // far from every boundary and from the sea (inland Bohemia: no wine place, no water in the context),
      // as two countries (tier 0: no containment parent): P = two 100 m squares 15 m apart; Q = a strip in
      // that gap, its raw not written yet. (It sat in the North Sea before keep-water-out, which now rightly
      // keeps that 15 m of sea open.)
      const france = await place("france");
      const germany = await place("germany");
      const at = (wkt) => `st_reduceprecision(st_multi(st_transform(st_setsrid(st_geomfromtext('${wkt}'), 32632), 4326)), 0.000001)`;
      const geo = (await c.query(`select
          encode(st_asewkb(${at("MULTIPOLYGON(((850000 5500000,850100 5500000,850100 5500100,850000 5500100,850000 5500000)),((850115 5500000,850215 5500000,850215 5500100,850115 5500100,850115 5500000)))")}), 'hex') p,
          encode(st_asewkb(${at("MULTIPOLYGON(((850101 5499950,850114 5499950,850114 5500150,850101 5500150,850101 5499950)))")}), 'hex') q`)).rows[0];
      const onQ = async (pending) => {
        const res = await cleanFootprint(c, { raw: geo.p, placeId: france.id, pending, via: "inline" });
        return Number((await c.query("select st_area(st_intersection($1::geometry, $2::geometry)::geography) a", [res.hex, geo.q])).rows[0].a);
      };
      assert.ok(await onQ({}) > 500, "without the pending raw the 15 m gap closes over the strip");
      assert.ok(await onQ({ [germany.id]: geo.q }) < 1, "with it, no ground on the strip");
    });

    await t.test("F1/F3: the independent check catches new ground on a neighbour and outside the parent", async () => {
      const wave = (gNewSql) => `select p.id place_id, ${gNewSql} g_new, b.display_geometry g_old
          from wine_places p join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
         where p.canonical_key = '${MECK}neuberg'`;
      const fails = async (gNewSql) => (await c.query(independentFailuresSql({ waveSql: wave(gNewSql) }))).rows;
      assert.deepEqual(await fails("b.display_geometry"), [], "an unchanged place passes");
      const onNeighbour = await fails(`st_multi(st_union(b.display_geometry, (select st_intersection(sb.display_geometry, st_buffer(b.display_geometry::geography, 25)::geometry)
          from wine_place_boundaries sb where sb.id = '${spielberg.bid}')))`);
      assert.ok(onNeighbour.some((x) => x.kind === "new_ground_on_neighbour" && x.other_key === `${MECK}spielberg` && x.m2 > 1), JSON.stringify(onNeighbour));
      const outside = await fails("st_multi(st_union(b.display_geometry, st_expand(st_setsrid(st_point(2.5, 56.5), 4326), 0.001)))");
      assert.ok(outside.some((x) => x.kind === "outside_parent" && x.m2 > 10000), JSON.stringify(outside));
    });

    await t.test("F4: the plpgsql wrapper, run as written, equals the inline step; the trigger refuses unstamped rows", async () => {
      const notices = [];
      const onNotice = (n) => notices.push(n.message);
      c.on("notice", onNotice);
      try {
        for (const key of ["germany.mittelrhein.loreley.schloss-stahleck.bacharach-lennenborn", `${MECK}spielberg`]) {
          const p = await place(key);
          const inline = await cleanFootprint(c, { raw: p.hex, placeId: p.id, via: "inline" });
          notices.length = 0;
          await c.query(renderWrapperRehearsal({ rawHex: p.hex, placeId: p.id }));
          const msg = notices.find((m) => m.startsWith("fp1-rehearsal "));
          assert.ok(msg, `${key}: no rehearsal notice`);
          const got = JSON.parse(msg.slice("fp1-rehearsal ".length));
          assert.equal(got.out_hex, inline.hex, `${key}: output`);
          assert.equal(got.cleanup.output_sha256, inline.cleanup.output_sha256);
          assert.equal(got.cleanup.status, inline.cleanup.status);
          assert.equal(got.cleanup.rung, inline.cleanup.rung);
          assert.deepEqual(Object.keys(got.cleanup.metrics).sort(), Object.keys(inline.cleanup.metrics).sort());
          for (const [k, v] of Object.entries(inline.cleanup.metrics)) assert.equal(got.cleanup.metrics[k], v, `${key}: metric ${k}`);
          // the trigger: the stamped output passes; a wrong sha and an unstamped row are refused with 23514
          await c.query(renderTriggerRehearsal({ geomHex: got.out_hex, generationParameters: { cleanup: got.cleanup } }));
          for (const bad of [{ geomHex: p.hex, generationParameters: { cleanup: { ...got.cleanup, output_sha256: "0" } } },
            { geomHex: got.out_hex, generationParameters: {} }]) {
            await c.query("savepoint trig");
            await assert.rejects(c.query(renderTriggerRehearsal(bad)), (e) => e.code === "23514");
            await c.query("rollback to savepoint trig");
          }
        }
        await c.query("savepoint missing");
        await assert.rejects(c.query(renderWrapperRehearsal({ rawHex: neuberg.hex, placeId: "00000000-0000-0000-0000-000000000000" })),
          (e) => e.code === "23503");
        await c.query("rollback to savepoint missing");
      } finally {
        c.off("notice", onNotice);
      }
    });

    await t.test("review 2026-10-05: params without a water key are refused, not read as NULL", async () => {
      const raw = (await c.query("select encode(st_asewkb(st_multi(st_expand(st_setsrid(st_point(2.5, 56.5), 4326), 0.001))), 'hex') h")).rows[0].h;
      const { water_reach_m: _w, ...review4Params } = PARAMS;
      await c.query("savepoint nokey");
      await assert.rejects(c.query(CORE_SQL, [raw, null, null, null, JSON.stringify(review4Params), null, null]),
        (e) => e.code === "22P02" && /params lack water_reach_m/.test(e.message), "the core");
      await c.query("rollback to savepoint nokey");
      await assert.rejects(c.query(renderWrapperRehearsal({ rawHex: neuberg.hex, placeId: neuberg.id, params: review4Params })),
        (e) => e.code === "22023" && /p_params lacks a key/.test(e.message), "the wrapper");
      await c.query("rollback to savepoint nokey");
      await assert.rejects(cleanFootprint(c, { raw, placeId: neuberg.id, params: review4Params, via: "inline" }), /params lack water_reach_m/);
    });

    await t.test("review 2026-10-05: the sea reaches past 22°E; a place outside the coverage is refused", async () => {
      const france = await place("france");
      const box = async (x, y) => (await c.query(
        "select encode(st_asewkb(st_multi(st_expand(st_setsrid(st_point($1, $2), 4326), 0.005))), 'hex') h", [x, y])).rows[0].h;
      // Santorini (25.4°E) and Malagash, Nova Scotia (-63.4°): there was no sea in reach before
      for (const [x, y] of [[25.43, 36.4], [-63.4, 45.78]]) {
        const ctx = await readContext(c, { placeId: france.id, raw: await box(x, y), pendingJson: "{}" });
        assert.ok(ctx.sea, `no sea near ${x}, ${y}`);
        assert.equal(ctx.water_covered, true);
      }
      const north = await box(10.5, 56.9);
      const ctx = await readContext(c, { placeId: france.id, raw: north, pendingJson: "{}" });
      assert.equal(ctx.water_covered, false);
      await assert.rejects(cleanFootprint(c, { raw: north, placeId: france.id, via: "inline" }), (e) => e.code === "22023" && /outside the sea data/.test(e.message));
      await c.query("savepoint cover");
      await assert.rejects(c.query(renderWrapperRehearsal({ rawHex: north, placeId: france.id })),
        (e) => e.code === "22023" && /place france \(.*\) is outside the sea data/.test(e.message));
      await c.query("rollback to savepoint cover");
    });

    await t.test("review 2026-10-05: the live table's hash SQL reproduces WATER_ROWS_SHA256 over the committed rows", async () => {
      const { WATER_ROWS_SHA256_SQL } = await import("./footprint-sql.mjs");
      const asTable = `(select (x->>'id')::int id, x->>'aoi' aoi, (x->>'hex')::extensions.geometry(Polygon, 4326) geom from jsonb_array_elements($1::jsonb) x)`;
      const sql = WATER_ROWS_SHA256_SQL.replace(`from ${WATER_TABLE} w`, `from ${asTable} w`);
      assert.notEqual(sql, WATER_ROWS_SHA256_SQL);
      const r = (await c.query(sql, [JSON.stringify(WATER_ROWS.map(({ id, aoi, hex }) => ({ id, aoi, hex })))])).rows[0];
      assert.equal(r.n, WATER_ROWS.length);
      assert.equal(r.sha, WATER_ROWS_SHA256);
    });

    await t.test("review 2026-10-05: the live step is judged against the module (nothing applied yet: inline)", async () => {
      const { footprintStepFacts, footprintStepLive } = await import("./footprint-cleanup.mjs");
      const facts = await footprintStepFacts(c);
      const s = stepProblems(facts);
      if (!facts.wrapperSrc) assert.equal(s.live, false, "no Migration A live");
      assert.equal(await footprintStepLive(c), s.live && s.problems.length === 0);
      if (facts.wrapperSrc && !facts.coreSrc) assert.match(s.problems.join("\n"), /Migration W is not applied/);
    });

    await t.test("F4: the core's result columns are exactly the declared types (a SQL function refuses a mismatch)", async () => {
      const raw = (await c.query("select encode(st_asewkb(st_multi(st_expand(st_setsrid(st_point(2.5, 56.5), 4326), 0.001))), 'hex') h")).rows[0].h;
      const res = await c.query(CORE_SQL, [raw, null, null, null, JSON.stringify(PARAMS), null, null]);
      const types = new Map((await c.query("select oid::int oid, format_type(oid, null) t from pg_type where oid = any($1::oid[])",
        [res.fields.map((f) => f.dataTypeID)])).rows.map((x) => [x.oid, x.t]));
      const got = res.fields.map((f) => `${f.name} ${types.get(f.dataTypeID)}`);
      const declared = renderMigrationW().match(/returns table \((clean4 [^)]*)\)/)[1].split(", ")
        .map((s) => s.replace("extensions.geometry", "geometry"));
      assert.deepEqual(got, declared);
    });
  }, { statementTimeoutMs: 120000 });
});
