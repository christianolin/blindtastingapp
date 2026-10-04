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
  CONTEXT_SQL, CORE_COLUMNS, CORE_SQL, FOOTPRINT_VERSION, MIGRATION_A, PARAMS, independentFailuresSql, ladderReason, metricsOf,
  renderMigrationA, renderTriggerRehearsal, renderWrapperRehearsal, rungs,
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

test("F4: Migration A qualifies its geometry types; the rehearsals share the wrapper and trigger bytes", () => {
  const sql = renderMigrationA();
  assert.match(sql, /returns table \(clean4 extensions\.geometry, /);
  const ddl = sql.split("\n").filter((l) => /^(returns|create|revoke|  p_)/.test(l)).join("\n");
  assert.doesNotMatch(ddl, /(?<!extensions\.)\bgeometry\b/, "no unqualified geometry type in the DDL");
  const fnBody = sql.slice(sql.indexOf("as $fn$\ndeclare"), sql.indexOf("$fn$;\n\ncreate or replace function public.wine_place_boundaries_require_cleanup"));
  const rehearsal = renderWrapperRehearsal({ rawHex: "00", placeId: "11111111-1111-1111-1111-111111111111" });
  // every wrapper line but the two core calls and the return appears in the rehearsal, in order
  const lines = fnBody.split("\n").slice(1).filter((l) => l.trim() && !l.includes("wine_footprint_clean_core(") && !l.includes("return query"));
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
  const { cleanFootprint } = await import("./footprint-cleanup.mjs");
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
      const ctx = (await c.query(CONTEXT_SQL, [neuberg.id, neuberg.hex, JSON.stringify({ [spielberg.id]: tiny })])).rows[0];
      const r = (await c.query("select st_area(st_difference($1::geometry, $2::geometry)::geography) left_out", [spielberg.hex, ctx.blockers])).rows[0];
      assert.ok(Number(r.left_out) < 1, `Spielberg's stored ground left unblocked: ${r.left_out} m²`);
    });

    await t.test("F3: a not-yet-written neighbour's raw, passed as pending, blocks the closing", async () => {
      // far from every boundary (North Sea), as two countries (tier 0: no containment parent): P = two 100 m
      // squares 15 m apart; Q = a strip in that gap, its raw not written yet
      const france = await place("france");
      const germany = await place("germany");
      const at = (wkt) => `st_reduceprecision(st_multi(st_transform(st_setsrid(st_geomfromtext('${wkt}'), 32632), 4326)), 0.000001)`;
      const geo = (await c.query(`select
          encode(st_asewkb(${at("MULTIPOLYGON(((300000 6100000,300100 6100000,300100 6100100,300000 6100100,300000 6100000)),((300115 6100000,300215 6100000,300215 6100100,300115 6100100,300115 6100000)))")}), 'hex') p,
          encode(st_asewkb(${at("MULTIPOLYGON(((300101 6099950,300114 6099950,300114 6100150,300101 6100150,300101 6099950)))")}), 'hex') q`)).rows[0];
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

    await t.test("F4: the core's result columns are exactly the declared types (a SQL function refuses a mismatch)", async () => {
      const raw = (await c.query("select encode(st_asewkb(st_multi(st_expand(st_setsrid(st_point(2.5, 56.5), 4326), 0.001))), 'hex') h")).rows[0].h;
      const res = await c.query(CORE_SQL, [raw, null, null, null, JSON.stringify(PARAMS)]);
      const types = new Map((await c.query("select oid::int oid, format_type(oid, null) t from pg_type where oid = any($1::oid[])",
        [res.fields.map((f) => f.dataTypeID)])).rows.map((x) => [x.oid, x.t]));
      const got = res.fields.map((f) => `${f.name} ${types.get(f.dataTypeID)}`);
      const declared = renderMigrationA().match(/returns table \((clean4 [^)]*)\)/)[1].split(", ")
        .map((s) => s.replace("extensions.geometry", "geometry"));
      assert.deepEqual(got, declared);
    });
  }, { statementTimeoutMs: 120000 });
});
