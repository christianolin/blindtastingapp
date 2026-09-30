// Phase US-2 of the USA map (spec 2026-09-29 §15): the country, the four wave
// states, their umbrella AVAs and the Central Valley navigation node, read from
// the committed tree reports (§8.3) and from nothing else. Pure. Every US-2
// migration, the stage and the rehearsal take their keys from here, so none of
// them can disagree with the reports the owner reviewed.
import { readFile } from "node:fs/promises";

export const STATE_SLUGS = Object.freeze({ CA: "california", WA: "washington", OR: "oregon", NY: "new-york" });
export const COUNTRY_KEY = "united-states";
// Suffix 4747 (D23). If a newer live version exists on the apply day, change
// them here and re-render (render-us2-sql.mjs); the applier does not enforce order.
export const US2_VERSIONS = Object.freeze({
  catalog: "20260930084747",
  knowledge: "20260930094747",
  promote: "20260930104747",
  links: "20260930114747",
});
export const US2_FILES = Object.freeze({
  catalog: `supabase/migrations/${US2_VERSIONS.catalog}_usa_us2_catalog.sql`,
  knowledge: `supabase/migrations/${US2_VERSIONS.knowledge}_usa_us2_knowledge.sql`,
  promote: `supabase/migrations/${US2_VERSIONS.promote}_usa_us2_promote.sql`,
  links: `supabase/migrations/${US2_VERSIONS.links}_usa_archetype_links_1.sql`,
});
// Outside supabase/migrations/ on purpose: a replay must never run a rollback.
// No version prefix either: they are applied with apply-rollback.mjs, which
// records no schema_migrations row, so each can run again (a second unstage
// after a re-stage) and none leaves a remote-only history version behind.
export const US2_ROLLBACK_FILES = Object.freeze({
  unstage: "scripts/usa-map/usa_us2_unstage.sql",
  remove: "scripts/usa-map/usa_us2_remove.sql",
  unpublish: "scripts/usa-map/usa_us2_unpublish.sql",
});
const WAVE_KINDS = new Set(["COUNTRY", "REGION", "SUBREGION"]);

export const artifactFor = (code) => `data/wine-map/usa-${STATE_SLUGS[code]}-ava.geojson`;
export const depthOf = (key) => key.split(".").length - 1;
const bySort = (a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key);

export async function loadTrees(read = (p) => readFile(p, "utf8")) {
  const trees = {};
  for (const [code, slug] of Object.entries(STATE_SLUGS)) {
    trees[code] = JSON.parse(await read(`data/wine-map/usa-${slug}-tree.json`));
  }
  return trees;
}

export function us2Wave(trees) {
  const codes = Object.keys(STATE_SLUGS);
  for (const code of codes) {
    if (!trees[code]) throw new Error(`no tree report for ${code}`);
    if (trees[code].state !== code) throw new Error(`the ${code} report says state ${trees[code].state}`);
  }
  const countries = codes.map((code) => trees[code].places.filter((p) => p.kind === "COUNTRY"));
  for (const list of countries) if (list.length !== 1) throw new Error("each report must carry exactly one COUNTRY row");
  const country = countries[0][0];
  for (const [row] of countries) {
    if (JSON.stringify(row) !== JSON.stringify(country)) throw new Error("the four reports disagree on the country row");
  }
  if (country.key !== COUNTRY_KEY) throw new Error(`country key is ${country.key}`);

  const states = codes.map((code) => {
    const regions = trees[code].places.filter((p) => p.kind === "REGION");
    if (regions.length !== 1 || regions[0].key !== trees[code].state_key) {
      throw new Error(`${code}: expected exactly its REGION ${trees[code].state_key}`);
    }
    return regions[0];
  }).sort(bySort);

  const places = [country];
  for (const state of states) {
    places.push(state);
    places.push(...trees[state.map_state].places
      .filter((p) => p.kind === "SUBREGION" && p.parent_key === state.key)
      .sort(bySort));
  }
  const keys = new Set(places.map((p) => p.key));
  for (const code of codes) {
    for (const p of trees[code].places) {
      if (WAVE_KINDS.has(p.kind) && !keys.has(p.key)) throw new Error(`${p.key} (${p.kind}) is in no wave slot`);
    }
  }

  const edges = codes.flatMap((code) => trees[code].edges)
    .filter((e) => keys.has(e.source_key) && keys.has(e.target_key))
    .sort((a, b) => a.source_key.localeCompare(b.source_key) || a.target_key.localeCompare(b.target_key));
  const outlineKeys = places.filter((p) => p.display === "outline").map((p) => p.key).sort();
  const derived = places.filter((p) => p.navigation_node).map((p) => ({
    key: p.key,
    state: p.map_state,
    members: trees[p.map_state].places
      .filter((x) => x.parent_key === p.key && x.ucd_ava_id)
      .map((x) => x.ucd_ava_id)
      .sort(),
  }));
  const ucd = places.filter((p) => p.ucd_ava_id).map((p) => ({
    key: p.key, ucd_ava_id: p.ucd_ava_id, state: p.map_state, artifact: artifactFor(p.map_state),
    legal_states: p.legal_states, area_km2: p.area_km2, cfr_section: p.cfr_section, name: p.name,
  }));
  return {
    places, edges, outlineKeys, derived, ucd,
    states: states.map((s) => ({ code: s.map_state, key: s.key, name: s.name })),
  };
}
