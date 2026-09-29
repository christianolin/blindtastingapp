// READ-ONLY. Builds data/usa-reference/us1-spec.json and the pre-image from
// the owner-approved draft, the producer research, the regenerated tree
// reports and one `begin read only` read of live. Nothing is written live.
// Usage: node scripts/usa-reference/build-us1-spec.mjs [--check]
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { REF_QUERIES } from "./us1-queries.mjs";
import { buildUs1Spec, PREIMAGE_PATH, PRODUCER_STATES_PATH, SPEC_PATH } from "./us1-spec-lib.mjs";

const check = process.argv.includes("--check");
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const draft = await json("data/usa-reference/us1-cleanup-draft.json");
const producerStates = await json(PRODUCER_STATES_PATH);
const ttbNames = (await json("data/wine-map/usa-ava-ttb-list.json")).avas.map((t) => t.name);
const mapStates = {};
for (const s of ["california", "washington", "oregon", "new-york"]) {
  const r = await json(`data/wine-map/usa-${s}-tree.json`);
  for (const p of r.places.filter((x) => x.ucd_ava_id)) mapStates[p.name] = p.map_state;
  for (const d of r.deferred) mapStates[d.name] = d.map_state;
}
let existingSpec = null;
try { existingSpec = await json(SPEC_PATH); } catch { /* first build */ }

const live = await withReadOnly(async (c) => {
  const q = async (sql, params) => (await c.query(sql, params)).rows;
  const [{ id: country_id }] = await q("select id from countries where name = 'United States'");
  const regions = await q("select id, name, country_id, map_status::text as map_status, wine_place_id from regions where country_id = $1 order by id", [country_id]);
  const regionIds = regions.map((r) => r.id);
  const appellations = await q("select id, name, region_id, map_status::text as map_status, wine_place_id from appellations where region_id = any ($1) order by id", [regionIds]);
  const appIds = appellations.map((a) => a.id);
  const pseudoIds = Object.values(draft.steps["7_pseudo_regions"]).map((v) => v.region_id);
  const references = {};
  for (const [table, sql] of REF_QUERIES) references[table] = (await c.query(sql, [regionIds, appIds])).rows[0].refs;
  return {
    country_id, regions, appellations, references,
    producers: await q("select id, name, region_id from producers where region_id = any ($1) order by id", [pseudoIds]),
    region_grapes: await q("select region_id, grape_id, role from region_grapes where region_id = any ($1) order by region_id, grape_id", [regionIds]),
    fk_catalogue: await q(`select c.conrelid::regclass::text as "table", a.attname::text as "column", c.confrelid::regclass::text as ref
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid in ('public.appellations'::regclass, 'public.regions'::regclass)`),
  };
});

const { spec, preimage } = buildUs1Spec({ draft, producerStates, mapStates, live, ttbNames, existingSpec, newId: randomUUID });
const readAt = new Date().toISOString();
const out = { spec: { ...spec, built_at: readAt }, preimage: { ...preimage, read_at: readAt } };
if (check) {
  const strip = (x) => JSON.stringify({ ...x, built_at: undefined, read_at: undefined });
  const same = strip(out.spec) === strip(existingSpec) && strip(out.preimage) === strip(await json(PREIMAGE_PATH));
  console.log(same ? "US-1 spec and pre-image match live" : "US-1 spec or pre-image DIFFER from live: rebuild, re-render, re-rehearse");
  process.exit(same ? 0 : 1);
}
await writeFile(SPEC_PATH, `${JSON.stringify(out.spec, null, 2)}\n`);
await writeFile(PREIMAGE_PATH, `${JSON.stringify(out.preimage, null, 2)}\n`);
console.log(`pre ${spec.pre.region_ids.length} regions / ${spec.pre.appellation_count} appellations / ${spec.pre.ava_suffixed} " AVA"; post ${spec.post.region_ids.length} / ${spec.post.appellation_count} / ${spec.post.ava_suffixed}`);
console.log(`moves ${spec.moves.length}, merges ${spec.merges.length}, renames ${spec.renames.length}, pseudo-regions ${spec.pseudo_regions.length}, new rows ${spec.new_rows.length}`);
