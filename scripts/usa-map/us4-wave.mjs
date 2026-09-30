// Phase US-4 of the USA map (spec 2026-09-29 §15 US-4): every AVA of
// Washington, Oregon and New York in one wave, read from the three committed
// tree reports (data/wine-map/usa-{washington,oregon,new-york}-tree.json) and
// TTB's list, and nothing else. Pure. Every US-4 migration, the stage and the
// rehearsal take their keys from here, so none of them can disagree with the
// tree reports.
import { artifactFor, COUNTRY_KEY, us2Wave, US2_VERSIONS } from "./us2-wave.mjs";
import { overrideMin, treeOrder } from "./us3-wave.mjs";

// In the country's sort order (New York 20, Oregon 30, Washington 40), which is tree order.
export const US4_STATES = Object.freeze([
  Object.freeze({ code: "NY", key: "united-states.new-york", name: "New York" }),
  Object.freeze({ code: "OR", key: "united-states.oregon", name: "Oregon" }),
  Object.freeze({ code: "WA", key: "united-states.washington", name: "Washington" }),
]);
export const SCOPE_KEYS = Object.freeze(US4_STATES.map((s) => s.key));
export const inScope = (k) => SCOPE_KEYS.some((s) => k === s || k.startsWith(`${s}.`));
// Suffix 4747 (D23). If a newer live version exists on the apply day, change
// them here and re-render (render-us4-sql.mjs); the applier does not enforce order.
export const US4_VERSIONS = Object.freeze({ catalog: "20260930224747", knowledge: "20260930234747", promote: "20261001004747" });
const mig = (v, name) => `supabase/migrations/${v}_${name}.sql`;
export const US4_FILES = Object.freeze({
  catalog: mig(US4_VERSIONS.catalog, "usa_us4_catalog"),
  knowledge: mig(US4_VERSIONS.knowledge, "usa_us4_knowledge"),
  promote: mig(US4_VERSIONS.promote, "usa_us4_promote"),
});
// Outside supabase/migrations/ and unversioned (spec §25): run with apply-rollback.mjs.
export const US4_ROLLBACK_FILES = Object.freeze({
  unstage: "scripts/usa-map/usa_us4_unstage.sql",
  remove: "scripts/usa-map/usa_us4_remove.sql",
  unpublish: "scripts/usa-map/usa_us4_unpublish.sql",
});
export const US4_KNOWLEDGE = "data/wine-map/place-profiles-usa-us4.json";
// D7: >= 99.5% measured inside, or >= 90% when UC Davis's `within` names the container.
const PARENT_MIN = Object.freeze({ measured: 0.995, legal_record: 0.9 });
const byEdge = (a, b) => a.source_key.localeCompare(b.source_key) || a.target_key.localeCompare(b.target_key) || a.type.localeCompare(b.type);

export function us4Wave(trees, ttb) {
  for (const s of US4_STATES) {
    const t = trees[s.code];
    if (!t || t.state !== s.code || t.state_key !== s.key) throw new Error(`no ${s.name} tree report`);
  }
  const us2 = us2Wave(trees);
  const country = trees.WA.places.find((p) => p.key === COUNTRY_KEY);
  const own = US4_STATES.flatMap((s) => trees[s.code].places.filter((p) => p.key !== COUNTRY_KEY));
  const allPlaces = [country, ...own];
  const byKey = new Map(allPlaces.map((p) => [p.key, p]));

  const priorKeys = us2.places.map((p) => p.key).filter((k) => k === COUNTRY_KEY || inScope(k)).sort();
  const priorSet = new Set(priorKeys);
  for (const p of own) {
    if (p.kind !== "APPELLATION" && !priorSet.has(p.key)) throw new Error(`${p.key} (${p.kind}) is in no earlier wave`);
  }
  const waveSet = new Set(own.filter((p) => p.kind === "APPELLATION").map((p) => p.key));
  for (const k of waveSet) {
    const parent = byKey.get(k).parent_key;
    if (!waveSet.has(parent) && !priorSet.has(parent)) throw new Error(`${k}: parent ${parent} is in no earlier wave and not in US-4`);
  }
  const places = treeOrder([...waveSet], allPlaces, COUNTRY_KEY);
  const known = new Set([...priorSet, ...waveSet]);

  // An edge ships with the wave its second endpoint lands in (US-3 decision 2).
  const allEdges = Object.values(trees).flatMap((t) => t.edges);
  const edges = allEdges
    .filter((e) => known.has(e.source_key) && known.has(e.target_key) && (waveSet.has(e.source_key) || waveSet.has(e.target_key)))
    .sort(byEdge);

  const ttbOf = (p) => {
    const t = (p.cfr_section && ttb.avas.find((x) => x.cfr_section === p.cfr_section))
      || ttb.avas.find((x) => x.name === p.name && x.states.includes(p.map_state));
    if (!t) throw new Error(`${p.key}: not in TTB's list`);
    return t;
  };
  const parentChecks = places.filter((p) => p.parent_basis).map((p) => {
    const min = p.parent_basis === "override" ? overrideMin(p) : PARENT_MIN[p.parent_basis];
    if (min === undefined) throw new Error(`${p.key}: parent_basis ${p.parent_basis} has no threshold`);
    return { key: p.key, parent_key: p.parent_key, basis: p.parent_basis, tree_inside: p.parent_inside, min,
      parent_ucd_ava_id: byKey.get(p.parent_key).ucd_ava_id };
  });
  const ucd = places.map((p) => {
    const t = ttbOf(p);
    return { key: p.key, ucd_ava_id: p.ucd_ava_id, state: p.map_state, artifact: artifactFor(p.map_state),
      legal_states: p.legal_states, area_km2: p.area_km2, cfr_section: p.cfr_section ?? t.cfr_section,
      established: t.established, name: p.name };
  });
  const crossState = allPlaces
    .filter((p) => known.has(p.key) && (p.legal_states?.length ?? 0) > 1)
    .map((p) => ({
      key: p.key, ucd_ava_id: p.ucd_ava_id, map_state: p.map_state, legal_states: p.legal_states,
      state_edges: allEdges.filter((e) => e.source_key === p.key && e.basis === "state_share").map((e) => e.target_key).sort(),
    }))
    .sort((a, b) => a.ucd_ava_id.localeCompare(b.ucd_ava_id));
  const deferred = [...new Set(US4_STATES.flatMap((s) => (trees[s.code].deferred ?? []).map((d) => d.ucd_ava_id)))].sort();
  const under = (key) => [...known].filter((k) => k === key || k.startsWith(`${key}.`));
  const perState = Object.fromEntries(US4_STATES.map((s) => [s.code, {
    places: under(s.key).length,
    ava: under(s.key).filter((k) => byKey.get(k).appellation_system === "AVA").length,
  }]));

  return {
    name: "us4", batch: null, places, edges,
    outlineKeys: places.filter((p) => p.display === "outline").map((p) => p.key).sort(),
    derived: [], derivedCheck: null, ucd, parentChecks,
    states: US4_STATES.map((s) => ({ ...s })),
    prior: { verified: priorKeys, present: [] }, priorKeys,
    crossState, deferred,
    after: {
      perState,
      scopeEdges: allEdges.filter((e) => known.has(e.source_key) && known.has(e.target_key)
        && (inScope(e.source_key) || inScope(e.target_key))).length,
    },
    scopeKeys: [...SCOPE_KEYS],
    versions: US4_VERSIONS, files: US4_FILES, rollbackFiles: US4_ROLLBACK_FILES,
    knowledgeSource: US4_KNOWLEDGE, priorPromote: US2_VERSIONS.promote,
  };
}
