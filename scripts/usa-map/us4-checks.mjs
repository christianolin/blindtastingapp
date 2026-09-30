// The checks rehearse-us4.mjs (one rolled-back transaction) and
// check-us4-live.mjs (read only) share, so the sitting checks exactly what the
// rehearsal proved. Every function writes nothing, and reads only the three
// states' keys (plus the whole catalogue for "no key under another state").
import { readFile } from "node:fs/promises";
import { SCOPE_KEYS } from "./us4-wave.mjs";

export { clickResolution, placeDetails } from "./us3-checks.mjs";

const W = "united-states.washington.";
const O = "united-states.oregon.";
const N = "united-states.new-york.";
const SCOPE = (a) => `(${SCOPE_KEYS.map((k) => `${a}.canonical_key = '${k}' or ${a}.canonical_key like '${k}.%'`).join(" or ")})`;

// §8.7: the nearby lists the main session accepts (the spec's US-4 six, plus
// Columbia Gorge and Candy Mountain).
export const NEARBY_KEYS = Object.freeze([
  `${O}willamette-valley.dundee-hills`, `${O}the-rocks-district-of-milton-freewater`, `${O}columbia-gorge`,
  `${W}columbia-valley.walla-walla-valley`, `${W}columbia-valley.yakima-valley.red-mountain`,
  `${W}columbia-valley.yakima-valley.candy-mountain`,
  `${N}finger-lakes.seneca-lake`, `${N}long-island.north-fork-of-long-island`,
]);
// A click on these selects them, not a container (smallest area wins; The Rocks
// District lies inside Walla Walla Valley, which is in another shard).
export const CLICK_KEYS = Object.freeze([
  `${W}columbia-valley.yakima-valley.red-mountain`, `${W}columbia-valley.yakima-valley.candy-mountain`,
  `${W}columbia-valley.yakima-valley.snipes-mountain`,
  `${O}the-rocks-district-of-milton-freewater`, `${O}willamette-valley.chehalem-mountains.ribbon-ridge`,
  `${O}willamette-valley.dundee-hills`,
  `${N}finger-lakes.seneca-lake`, `${N}long-island.north-fork-of-long-island`,
]);
// Children the details panel lists (VERIFIED only) after the promote.
export const CHILDREN = Object.freeze({
  "united-states.washington": 2, [`${W}columbia-valley`]: 11, [`${W}columbia-valley.yakima-valley`]: 5, [`${W}puget-sound`]: 0,
  "united-states.oregon": 4, [`${O}willamette-valley`]: 9, [`${O}willamette-valley.chehalem-mountains`]: 2,
  [`${O}southern-oregon`]: 2, [`${O}southern-oregon.rogue-valley`]: 1, [`${O}southern-oregon.umpqua-valley`]: 2,
  "united-states.new-york": 6, [`${N}finger-lakes`]: 2, [`${N}long-island`]: 2,
});
// Every relationship under the three states after the promote (decision 3).
export const EXPECTED_EDGES = Object.freeze([
  { type: "ALTERNATE_PARENT", source: `${W}columbia-valley`, target: "united-states.oregon" },
  { type: "ALTERNATE_PARENT", source: `${W}columbia-valley.walla-walla-valley`, target: "united-states.oregon" },
  { type: "ALTERNATE_PARENT", source: `${O}columbia-gorge`, target: "united-states.washington" },
  { type: "ALTERNATE_PARENT", source: `${O}the-rocks-district-of-milton-freewater`, target: `${W}columbia-valley` },
  { type: "ALTERNATE_PARENT", source: `${O}the-rocks-district-of-milton-freewater`, target: `${W}columbia-valley.walla-walla-valley` },
]);
// Decision 10: the one US typical wine under the three states keeps US-2's link.
export const LINKS_US2_PATH = "data/wine-map/usa-us2-archetype-links.json";
export const WILLAMETTE_ID = "bab8537e-b0bc-4f7c-8547-242537322f8a";
export async function willametteLink(read = (p) => readFile(p, "utf8")) {
  const link = JSON.parse(await read(LINKS_US2_PATH)).links.find((l) => l.archetype_id === WILLAMETTE_ID);
  if (!link) throw new Error(`${LINKS_US2_PATH} has no Willamette link`);
  return link;
}

/** Every relationship with an endpoint under the three states. */
export async function scopeRelationships(client) {
  return (await client.query(
    `select r.relationship_type::text type, s.canonical_key source, t.canonical_key target
       from public.wine_place_relationships r
       join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where ${SCOPE("s")} or ${SCOPE("t")} order by 2, 3, 1`)).rows;
}

/** The wave's state, the three states', and the cross-state facts (D6, D14). */
export async function waveFacts(client, wave) {
  const keys = wave.places.map((p) => p.key);
  const n = async (sql, params = []) => Number((await client.query(sql, params)).rows[0].n);
  const onKeys = "from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id where p.canonical_key = any($1::text[])";
  const perAva = async (ids) => Object.fromEntries((await client.query(
    `select f.id, (select count(*)::int from public.wine_place_boundaries b
                    join public.wine_boundary_source_snapshots ss on ss.id = b.source_snapshot_id
                    join public.wine_boundary_sources so on so.id = ss.source_id
                   where b.is_current and so.source_namespace = 'UCD_TTB_AVA' and so.source_feature_id = f.id) n
       from unnest($1::text[]) f(id) order by f.id`, [ids])).rows.map((r) => [r.id, r.n]));
  const live = {};
  for (const s of wave.states) {
    live[s.code] = await n(`select count(*) n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
      where (p.canonical_key = $1 or p.canonical_key like $1 || '.%') and p.publication_status = 'VERIFIED'
        and b.is_current and b.quality_status = 'VALIDATED'`, [s.key]);
  }
  return {
    places: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[])", [keys]),
    verified: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[]) and publication_status = 'VERIFIED'", [keys]),
    locked: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[]) and canonical_key_locked_at is not null", [keys]),
    current_validated: await n(`select count(*) n ${onKeys} and b.is_current and b.quality_status = 'VALIDATED'`, [keys]),
    draft_boundaries: await n(`select count(*) n ${onKeys} and b.quality_status = 'DRAFT'`, [keys]),
    live,
    scope_relationships: await n(`select count(*) n from public.wine_place_relationships r
      join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where ${SCOPE("s")} or ${SCOPE("t")}`),
    us_outline: await n(`select count(*) n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where (p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%')
        and b.is_current and b.generation_parameters->>'display' = 'outline'`),
    cross_state: await perAva(wave.crossState.map((c) => c.ucd_ava_id)),
    deferred: Object.values(await perAva(wave.deferred)).reduce((a, x) => a + x, 0),
    other_states: await n(`select count(*) n from public.wine_places where canonical_key like 'united-states.%'
      and split_part(canonical_key, '.', 2) not in ('california', 'washington', 'oregon', 'new-york')`),
    fresh: (await client.query("select fresh from public.wine_place_neighbours_state")).rows[0].fresh,
  };
}

/** The promoted state US-4 must reach (rehearsal and live check alike). */
export const promotedFacts = (wave) => ({
  places: wave.places.length, verified: wave.places.length, locked: wave.places.length,
  current_validated: wave.places.length, draft_boundaries: 0,
  live: Object.fromEntries(wave.states.map((s) => [s.code, wave.after.perState[s.code].places])),
  scope_relationships: wave.after.scopeEdges, us_outline: 12,
  cross_state: Object.fromEntries(wave.crossState.map((c) => [c.ucd_ava_id, 1])),
  deferred: 0, other_states: 0, fresh: true,
});
