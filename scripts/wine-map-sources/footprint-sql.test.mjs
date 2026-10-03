// Footprint cleanup fp-1. Two halves:
//   * pure (always): parameters, ladder, ordering, pending, SQL fragments, the
//     rendered Migration A against the committed file, every builder wired;
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
import {
  CORE_COLUMNS, CORE_SQL, FOOTPRINT_VERSION, MIGRATION_A, PARAMS, ladderReason, metricsOf, renderMigrationA, rungs,
} from "./footprint-sql.mjs";
import {
  bboxesMeet, cleanGeomCte, createPending, generationAfterCleanup, methodAfterCleanup, methodAfterCleanupSql,
  orderBatch, rawFromGeoJson, withCleanupStamp, EINZELLAGE_CLEANED_NOTE,
} from "./footprint-cleanup.mjs";

// ---------------------------------------------------------------- pure

test("fp-1 parameters are the design's and frozen", () => {
  assert.equal(PARAMS.version, FOOTPRINT_VERSION);
  assert.equal(PARAMS.gap_m, 20);
  assert.equal(PARAMS.arm_m, 10);
  assert.equal(PARAMS.hole_share, 0.001);
  assert.equal(PARAMS.hole_min_m2, 2000);
  assert.equal(PARAMS.hole_max_m2, 250000);
  assert.equal(PARAMS.crumb_max_m2, 5000);
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

test("Migration A is rendered from the module (no drift)", async () => {
  // line endings aside (core.autocrlf checkouts)
  const committed = (await readFile(MIGRATION_A, "utf8")).replace(/\r\n/g, "\n");
  assert.equal(committed, renderMigrationA());
});

test("Migration A locks EXECUTE to the owner and refuses unstamped writes", () => {
  const sql = renderMigrationA();
  for (const fn of ["wine_footprint_clean_core(", "wine_footprint_clean(", "wine_place_boundaries_require_cleanup("]) {
    const line = sql.split(/\r?\n/).find((l) => l.startsWith(`revoke all on function public.${fn}`));
    assert.ok(line, `no revoke for ${fn}`);
    assert.match(line, /from public, anon, authenticated, service_role;$/);
  }
  assert.match(sql, /before insert or update of display_geometry on public\.wine_place_boundaries/);
  assert.match(sql, /errcode = '23514'/);
  assert.match(sql, /footprint-cleanup\.mjs/);
  assert.ok(sql.includes(CORE_SQL), "the core function body is CORE_SQL verbatim");
  assert.doesNotMatch(sql, /\binsert into\b|\bdelete from\b|\bupdate public\.wine/i, "Migration A changes no data");
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
    const core = async (raw, { blk = null, par = null, prot = null, params = PARAMS } = {}) =>
      (await c.query(CORE_SQL, [raw, blk, par, prot, JSON.stringify(params)])).rows[0];
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
