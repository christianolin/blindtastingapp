// Phase US-3 of the USA map (spec 2026-09-29 §15 US-3): California's AVAs in
// two batches, core first. Read from the committed California tree report
// (data/wine-map/usa-california-tree.json), the batch list
// (data/wine-map/usa-us3-batches.json) and TTB's list, and nothing else.
// Pure. Every US-3 migration, the stage and the rehearsals take their keys
// from here, so none of them can disagree with the tree report.
import { readFile } from "node:fs/promises";
import { artifactFor, us2Wave, US2_VERSIONS } from "./us2-wave.mjs";

export const CA_KEY = "united-states.california";
export const BATCHES_PATH = "data/wine-map/usa-us3-batches.json";
export const TTB_PATH = "data/wine-map/usa-ava-ttb-list.json";
export const US3_BATCHES = Object.freeze(["core", "rest"]);
// Suffix 4747 (D23). If a newer live version exists on the apply day, change
// them here and re-render (render-us3-sql.mjs); the applier does not enforce order.
export const US3_VERSIONS = Object.freeze({
  core: Object.freeze({ catalog: "20260930154747", knowledge: "20260930164747", promote: "20260930174747", links: "20260930184747" }),
  rest: Object.freeze({ catalog: "20260930194747", knowledge: "20260930204747", promote: "20260930214747" }),
});
const mig = (v, name) => `supabase/migrations/${v}_${name}.sql`;
export const US3_FILES = Object.freeze({
  core: Object.freeze({
    catalog: mig(US3_VERSIONS.core.catalog, "usa_us3_core_catalog"),
    knowledge: mig(US3_VERSIONS.core.knowledge, "usa_us3_core_knowledge"),
    promote: mig(US3_VERSIONS.core.promote, "usa_us3_core_promote"),
    links: mig(US3_VERSIONS.core.links, "usa_archetype_links_2"),
  }),
  rest: Object.freeze({
    catalog: mig(US3_VERSIONS.rest.catalog, "usa_us3_rest_catalog"),
    knowledge: mig(US3_VERSIONS.rest.knowledge, "usa_us3_rest_knowledge"),
    promote: mig(US3_VERSIONS.rest.promote, "usa_us3_rest_promote"),
  }),
});
// Outside supabase/migrations/ and unversioned (spec §25): run with apply-rollback.mjs.
export const US3_ROLLBACK_FILES = Object.freeze(Object.fromEntries(US3_BATCHES.map((b) => [b, Object.freeze({
  unstage: `scripts/usa-map/usa_us3_${b}_unstage.sql`,
  remove: `scripts/usa-map/usa_us3_${b}_remove.sql`,
  unpublish: `scripts/usa-map/usa_us3_${b}_unpublish.sql`,
})])));
export const US3_KNOWLEDGE = Object.freeze({
  core: "data/wine-map/place-profiles-usa-us3-core.json",
  rest: "data/wine-map/place-profiles-usa-us3-rest.json",
});
export const PRIOR_PROMOTE = Object.freeze({ core: US2_VERSIONS.promote, rest: US3_VERSIONS.core.promote });
// D7: >= 99.5% measured inside, or >= 90% when UC Davis's `within` names the container.
const PARENT_MIN = Object.freeze({ measured: 0.995, legal_record: 0.9 });
// A parent_overrides placement (basis "override", spec D7/§8.2) is not held to
// D7's thresholds: the legal record puts it there although the outlines do not
// (Contra Costa in San Francisco Bay, T.D. TTB-191, 33.6% measured). Its floor
// is the tree's own measurement less one point, so the stage (which also
// requires the tree's figure within 1e-4) and the promote (0.001 slack) still
// catch an outline that changed under it. An override the tree never measured
// cannot be checked, so it is refused here.
const OVERRIDE_SLACK = 0.01;
export const overrideMin = (p) => {
  if (typeof p.parent_inside !== "number") throw new Error(`${p.key}: parent_overrides placement was never measured against ${p.parent_key}`);
  return Math.floor((p.parent_inside - OVERRIDE_SLACK) * 1e4) / 1e4;
};

export const loadBatches = async (read = (p) => readFile(p, "utf8")) => JSON.parse(await read(BATCHES_PATH));
export const loadTtb = async (read = (p) => readFile(p, "utf8")) => JSON.parse(await read(TTB_PATH));

/** The places whose keys are in `keys`, depth first under rootKey, siblings by sort_order then key. */
export function treeOrder(keys, allPlaces, rootKey) {
  const want = new Set(keys);
  const kids = new Map();
  for (const p of allPlaces) {
    if (!p.parent_key) continue;
    if (!kids.has(p.parent_key)) kids.set(p.parent_key, []);
    kids.get(p.parent_key).push(p);
  }
  for (const list of kids.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
  const out = [];
  const walk = (key) => {
    for (const c of kids.get(key) ?? []) {
      if (want.has(c.key)) out.push(c);
      walk(c.key);
    }
  };
  walk(rootKey);
  if (out.length !== want.size) throw new Error(`tree order found ${out.length} of ${want.size} places under ${rootKey}`);
  return out;
}

/** ceil(n / max) near-equal chunks (spec §18: at most 40 places per review file). */
export function reviewChunks(list, max = 40) {
  const k = Math.ceil(list.length / max);
  const size = Math.ceil(list.length / k);
  return Array.from({ length: k }, (_, i) => list.slice(i * size, (i + 1) * size));
}

export function us3Wave(trees, batches, ttb, batch) {
  if (!US3_BATCHES.includes(batch)) throw new Error(`unknown US-3 batch ${batch} (use core or rest)`);
  const tree = trees.CA;
  if (!tree || tree.state !== "CA" || tree.state_key !== CA_KEY) throw new Error("no California tree report");
  const us2 = us2Wave(trees);
  const us2Keys = us2.places.map((p) => p.key);
  const us2Set = new Set(us2Keys);
  const byKey = new Map(tree.places.map((p) => [p.key, p]));
  const avas = tree.places.filter((p) => p.kind === "APPELLATION");

  const core = new Set();
  for (const k of batches.core.named) {
    if (byKey.get(k)?.kind !== "APPELLATION") throw new Error(`core: ${k} is not an AVA in the California tree`);
    core.add(k);
  }
  for (const k of batches.core.with_children) {
    if (!core.has(k)) throw new Error(`core: with_children ${k} is not a named core AVA`);
    for (const p of avas) if (p.parent_key === k) core.add(p.key);
  }
  const closure = [];
  for (const k of [...core]) {
    for (let p = byKey.get(k); !us2Set.has(p.parent_key); p = byKey.get(p.parent_key)) {
      const parent = byKey.get(p.parent_key);
      if (!parent) throw new Error(`${k}: its parent chain leaves the tree at ${p.parent_key}`);
      if (!core.has(parent.key)) { core.add(parent.key); closure.push(parent.key); }
    }
  }
  const rest = new Set(avas.filter((p) => !core.has(p.key)).map((p) => p.key));
  const waveSet = batch === "core" ? core : rest;
  const prior = { verified: us2Keys, present: batch === "core" ? [] : treeOrder([...core], tree.places, CA_KEY).map((p) => p.key) };
  const priorSet = new Set([...prior.verified, ...prior.present]);
  for (const k of waveSet) {
    const parent = byKey.get(k).parent_key;
    if (!waveSet.has(parent) && !priorSet.has(parent)) throw new Error(`${k}: parent ${parent} is in no earlier wave and not in this batch`);
  }
  const places = treeOrder([...waveSet], tree.places, CA_KEY);
  const all = new Set([...priorSet, ...waveSet]);

  const ttbOf = (p) => {
    const t = (p.cfr_section && ttb.avas.find((x) => x.cfr_section === p.cfr_section))
      || ttb.avas.find((x) => x.name === p.name && x.states.includes("CA"));
    if (!t) throw new Error(`${p.key}: not in TTB's list`);
    return t;
  };
  const edges = tree.edges
    .filter((e) => all.has(e.source_key) && all.has(e.target_key) && (waveSet.has(e.source_key) || waveSet.has(e.target_key)))
    .sort((a, b) => a.source_key.localeCompare(b.source_key) || a.target_key.localeCompare(b.target_key) || a.type.localeCompare(b.type));
  const parentChecks = places.filter((p) => p.parent_basis).map((p) => {
    const min = p.parent_basis === "override" ? overrideMin(p) : PARENT_MIN[p.parent_basis];
    if (min === undefined) throw new Error(`${p.key}: parent_basis ${p.parent_basis} has no threshold`);
    return { key: p.key, parent_key: p.parent_key, basis: p.parent_basis, tree_inside: p.parent_inside, min,
      parent_ucd_ava_id: byKey.get(p.parent_key).ucd_ava_id };
  });
  const derivedCheck = us2.derived
    .filter((d) => d.state === "CA")
    .map((d) => ({ key: d.key, members: tree.places.filter((x) => x.parent_key === d.key)
      .map((x) => ({ key: x.key, ucd_ava_id: x.ucd_ava_id })).sort((a, b) => a.ucd_ava_id.localeCompare(b.ucd_ava_id)) }))
    .find((d) => d.members.every((m) => all.has(m.key)) && d.members.some((m) => waveSet.has(m.key))) ?? null;
  const ucd = places.map((p) => {
    const t = ttbOf(p);
    return { key: p.key, ucd_ava_id: p.ucd_ava_id, state: "CA", artifact: artifactFor("CA"), legal_states: p.legal_states,
      area_km2: p.area_km2, cfr_section: p.cfr_section ?? t.cfr_section, established: t.established, name: p.name };
  });
  const underCa = (k) => k === CA_KEY || k.startsWith(`${CA_KEY}.`);
  return {
    name: `us3-${batch}`, batch, places, edges,
    outlineKeys: places.filter((p) => p.display === "outline").map((p) => p.key).sort(),
    derived: [], derivedCheck, ucd, parentChecks, closure: closure.sort(),
    states: [{ code: "CA", key: CA_KEY, name: "California" }],
    prior, priorKeys: [...priorSet].sort(),
    after: {
      caPlaces: [...all].filter(underCa).length,
      caAva: tree.places.filter((p) => all.has(p.key) && p.appellation_system === "AVA").length,
      caEdges: tree.edges.filter((e) => all.has(e.source_key) && all.has(e.target_key)).length,
    },
    scopeKey: CA_KEY, versions: US3_VERSIONS[batch], files: US3_FILES[batch], rollbackFiles: US3_ROLLBACK_FILES[batch],
    knowledgeSource: US3_KNOWLEDGE[batch], priorPromote: PRIOR_PROMOTE[batch],
  };
}
