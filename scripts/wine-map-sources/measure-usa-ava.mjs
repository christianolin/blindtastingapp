// Read-only PostGIS measurement for the US tree (spec 2026-09-29 §8.2, §8.3).
// Inside `begin read only` ... `rollback` (read-only-client.mjs): the geometry
// travels as query parameters, nothing is created, and the transaction is
// rolled back whatever happens. US-2's stage script re-measures the same way
// before it writes.
//
// Ratios use planar areas in EPSG:4326 (both sides of every ratio lie in one
// AVA, so the latitude scale cancels); area_km2 is on the geography. Shares are
// measured on land: water inside an AVA (Puget Sound, San Francisco Bay, Lake
// Erie, the Finger Lakes) counts toward neither state. The 0.05° buffer is
// check-only, for §8.2's containment share.
//
// `state_shares` are raw measurements against the Natural Earth 1:50m state
// line, which is several km off along the Columbia River: they include false
// shares (Oregon land inside Washington-only AVAs). usa-tree.mjs uses a share
// only in a state TTB lists for the AVA. `containment_share` here is taken
// over the states measured at 0.5% or more (`containment_states`); the tree
// uses it only when that set is the AVA's legal set, and otherwise takes the
// single legal state's buffered share, which is the same formula.
//
// Heavy (pairwise intersections of about 220 outlines): run it once, off-peak.
// Usage: node scripts/wine-map-sources/measure-usa-ava.mjs
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { sha256hex } from "../wine-map-tiles/lib.mjs";
import { withReadOnly } from "./read-only-client.mjs";
import { DEFAULT_THRESHOLDS } from "./usa-tree.mjs";

const AVA_FILES = ["california", "washington", "oregon", "new-york"].map((s) => `data/wine-map/usa-${s}-ava.geojson`);
const STATES_FILE = "data/wine-map/usa-states-ne50m.geojson";
const OUT = "data/wine-map/usa-measurements.json";
const BUFFER_DEG = 0.05;
const CHUNK = 25;
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const GEOM = "extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON((f->'geometry')::text), 4326)), 3)";
const AVA_CTE = `a as (select f->>'id' as id, ${GEOM} as g from jsonb_array_elements($1::jsonb) f)`;
const STATE_CTE = `s as (select f->>'code' as code, ${GEOM} as g from jsonb_array_elements($2::jsonb) f)`;

const PER_AVA_SQL = `
with ${AVA_CTE}, ${STATE_CTE},
sb as (select code, g, extensions.ST_Buffer(g, ${BUFFER_DEG}) as bg from s),
u as (select extensions.ST_Union(g) as g, extensions.ST_Union(bg) as bg from sb)
select a.id,
       (extensions.ST_Area(a.g::extensions.geography) / 1e6)::float8 as area_km2,
       extensions.ST_Area(a.g) as planar,
       extensions.ST_Area(extensions.ST_Intersection(a.g, u.g)) as land,
       extensions.ST_Area(extensions.ST_Intersection(a.g, u.bg)) as land_buffered,
       coalesce((select jsonb_object_agg(sb.code, jsonb_build_array(
                   extensions.ST_Area(extensions.ST_Intersection(a.g, sb.g)),
                   extensions.ST_Area(extensions.ST_Intersection(a.g, sb.bg))))
                   from sb where extensions.ST_Intersects(a.g, sb.bg)), '{}'::jsonb) as per_state
  from a cross join u
 order by a.id`;

const CONTAINMENT_SQL = `
with a as (select f->>'id' as id, ${GEOM} as g, f->'states' as states from jsonb_array_elements($1::jsonb) f),
${STATE_CTE},
u as (select extensions.ST_Union(extensions.ST_Buffer(g, ${BUFFER_DEG})) as bg from s)
select a.id,
       extensions.ST_Area(extensions.ST_Intersection(a.g,
         (select extensions.ST_Union(extensions.ST_Buffer(s.g, ${BUFFER_DEG})) from s
           where s.code in (select jsonb_array_elements_text(a.states)))))
       / nullif(extensions.ST_Area(extensions.ST_Intersection(a.g, u.bg)), 0) as containment_share
  from a cross join u
 order by a.id`;

const PAIRS_SQL = `
with ${AVA_CTE}
select x.id as a, y.id as b, extensions.ST_Area(extensions.ST_Intersection(x.g, y.g)) as inter
  from a x join a y on x.id < y.id
 where x.id = any($2::text[]) and extensions.ST_Intersects(x.g, y.g)
 order by 1, 2`;

const inputs = {};
const avas = new Map();
for (const file of AVA_FILES) {
  const buf = await readFile(file);
  inputs[file] = sha256hex(buf);
  for (const f of JSON.parse(buf.toString("utf8")).features) {
    const id = f.properties.ava_id;
    const geom = JSON.stringify(f.geometry);
    const seen = avas.get(id);
    assert.ok(!seen || seen.geom === geom, `${id}: different geometry in two state files`);
    avas.set(id, { id, geom });
  }
}
const statesBuf = await readFile(STATES_FILE);
inputs[STATES_FILE] = sha256hex(statesBuf);
const stateJson = JSON.stringify(JSON.parse(statesBuf.toString("utf8")).features
  .map((f) => ({ code: f.properties.code, geometry: f.geometry })));
const ids = [...avas.keys()].sort();
const avaJson = JSON.stringify(ids.map((id) => ({ id, geometry: JSON.parse(avas.get(id).geom) })));
console.log(`${ids.length} distinct AVAs; payload ${(avaJson.length / 1e6).toFixed(1)} MB`);

const t0 = Date.now();
const out = await withReadOnly(async (client) => {
  const perAva = (await client.query(PER_AVA_SQL, [avaJson, stateJson])).rows;
  assert.equal(perAva.length, ids.length, "every AVA must come back from the per-AVA query");
  console.log(`per-AVA areas and state shares: ${Date.now() - t0} ms`);
  const measured = {};
  for (const row of perAva) {
    assert.ok(row.planar > 0, `${row.id}: empty geometry after MakeValid`);
    const stateShares = {};
    const bufferedShares = {};
    for (const [code, [inter, interBuffered]] of Object.entries(row.per_state)) {
      if (row.land > 0 && inter > 0) stateShares[code] = r6(inter / row.land);
      if (row.land_buffered > 0 && interBuffered > 0) bufferedShares[code] = r6(interBuffered / row.land_buffered);
    }
    measured[row.id] = {
      area_km2: Math.round(row.area_km2 * 1000) / 1000,
      land_share: r6(row.land / row.planar),
      state_shares: sortKeys(stateShares),
      buffered_shares: sortKeys(bufferedShares),
      planar: row.planar,
    };
  }
  const withStates = ids.map((id) => ({
    id,
    geometry: JSON.parse(avas.get(id).geom),
    states: Object.entries(measured[id].state_shares)
      .filter(([, s]) => s >= DEFAULT_THRESHOLDS.stateEdgeMin).map(([c]) => c),
  }));
  const t1 = Date.now();
  for (const row of (await client.query(CONTAINMENT_SQL, [JSON.stringify(withStates), stateJson])).rows) {
    measured[row.id].containment_states = withStates.find((w) => w.id === row.id).states;
    measured[row.id].containment_share = row.containment_share === null ? null : r6(row.containment_share);
  }
  console.log(`containment shares: ${Date.now() - t1} ms`);
  const pairs = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const t2 = Date.now();
    for (const { a, b, inter } of (await client.query(PAIRS_SQL, [avaJson, ids.slice(i, i + CHUNK)])).rows) {
      if (inter > 0) pairs.push({ a, b, a_in_b: r6(inter / measured[a].planar), b_in_a: r6(inter / measured[b].planar) });
    }
    console.log(`pairs ${Math.min(i + CHUNK, ids.length)}/${ids.length}: ${Date.now() - t2} ms`);
  }
  return { measured, pairs };
});

const avasOut = {};
for (const id of ids) {
  const m = out.measured[id];
  avasOut[id] = {
    area_km2: m.area_km2,
    land_share: m.land_share,
    state_shares: m.state_shares,
    buffered_shares: m.buffered_shares,
    containment_states: m.containment_states,
    containment_share: m.containment_share,
  };
}
out.pairs.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
await writeFile(OUT, `${JSON.stringify({
  _generated_by: "scripts/wine-map-sources/measure-usa-ava.mjs (read-only: begin read only ... rollback)",
  _inputs: inputs,
  measured_at: new Date().toISOString(),
  buffer_degrees: BUFFER_DEG,
  avas: avasOut,
  pairs: out.pairs,
}, null, 1)}\n`);
console.log(`wrote ${OUT}: ${ids.length} AVAs, ${out.pairs.length} intersecting pairs, ${Date.now() - t0} ms total`);
