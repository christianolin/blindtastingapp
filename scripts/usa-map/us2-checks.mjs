// The checks the US-2 rehearsal (rehearse-us2.mjs, one rolled-back
// transaction) and the read-only live check (check-us2-live.mjs) share, so the
// sitting checks exactly what the rehearsal proved (plan
// 2026-09-29-usa-wine-map-us2 Task 14). Every function takes a client inside
// an open transaction and writes nothing.
import { EXPORT_SQL_COPY } from "./export-preview.mjs";
import { readShortlist } from "./shortlist-mirror.mjs";
import { EXPECTATIONS_SQL } from "./splice-boundary-expectations.mjs";

export const US_STATES = Object.freeze({
  California: "united-states.california",
  Washington: "united-states.washington",
  Oregon: "united-states.oregon",
  "New York": "united-states.new-york",
});
export const CONTEXT_KEYS = Object.freeze([
  "united-states", "united-states.california", "united-states.washington", "united-states.oregon",
  "united-states.new-york", "united-states.california.central-valley",
]);
const US = "(p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%')";
// A throwaway signed-in reader: the RLS policies here are content-level, so any
// authenticated caller sees what every member sees.
const READER = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

/** Run fn as a signed-in reader inside a savepoint that is always rolled back. */
export async function asAuthenticated(client, fn) {
  await client.query("savepoint as_user");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [READER]);
    await client.query("set local role authenticated");
    return await fn();
  } finally {
    await client.query("rollback to savepoint as_user");
  }
}

/** get_wine_place_context per key, as a signed-in reader: article present, and counts. */
export async function contexts(client, keys = CONTEXT_KEYS) {
  return asAuthenticated(client, async () => {
    const out = {};
    for (const key of keys) {
      const ctx = (await client.query("select public.get_wine_place_context($1) ctx", [key])).rows[0].ctx;
      out[key] = ctx === null ? null : {
        article: Boolean(ctx.article && ctx.article.description),
        grapes: (ctx.grapes ?? []).length,
        styles: (ctx.styles ?? []).length,
        children: (ctx.children ?? []).length,
      };
    }
    return out;
  });
}

/** The four states' grape shortlists, through RLS as the app reads them. */
export async function shortlists(client) {
  return asAuthenticated(client, async () => {
    const out = {};
    for (const name of Object.keys(US_STATES)) out[name] = await readShortlist(client, name);
    return out;
  });
}

/** Owner reads after the promote. */
export async function postPromoteFacts(client) {
  const n = async (sql) => Number((await client.query(sql)).rows[0].n);
  return {
    places: await n(`select count(*) n from public.wine_places p where ${US}`),
    verified: await n(`select count(*) n from public.wine_places p where ${US} and p.publication_status = 'VERIFIED'`),
    current_validated: await n(`select count(*) n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where ${US} and b.is_current and b.quality_status = 'VALIDATED'`),
    draft_boundaries: await n(`select count(*) n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where ${US} and b.quality_status = 'DRAFT'`),
    relationships: await n(`select count(*) n from public.wine_place_relationships r
      join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where s.canonical_key like 'united-states%' or t.canonical_key like 'united-states%'`),
    fresh: (await client.query("select fresh from public.wine_place_neighbours_state")).rows[0].fresh,
    locked: await n(`select count(*) n from public.wine_places p where ${US} and p.canonical_key_locked_at is not null`),
    outline: await n(`select count(*) n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where ${US} and b.is_current and b.generation_parameters->>'display' = 'outline'`),
  };
}

/** generate-boundary-expectations.mjs's rows, united-states only. */
export async function expectationRows(client) {
  return (await client.query(EXPECTATIONS_SQL)).rows
    .filter((r) => r.canonical_key === "united-states" || r.canonical_key.startsWith("united-states."));
}

/** export.mjs's rows for the US plus every tier-0 row (assertMultiCountryArchive needs them). */
export async function exportPreviewRows(client) {
  return (await client.query(
    `select * from (${EXPORT_SQL_COPY}) x where x.canonical_key like 'united-states%' or x.display_tier = 0`)).rows;
}

/** The linked archetypes' homes and placements (owner), and the room's read of them (signed in). */
export async function archetypeFacts(client, links) {
  const ids = links.map((l) => l.archetype_id);
  const { rows } = await client.query(
    `select a.id::text, a.name, wp.canonical_key home,
            coalesce((select array_agg(pp.canonical_key order by pp.canonical_key) from public.wine_archetype_placements x
               join public.wine_places pp on pp.id = x.wine_place_id where x.archetype_id = a.id), '{}') placements
       from public.wine_archetypes a left join public.wine_places wp on wp.id = a.wine_place_id
      where a.id = any($1::uuid[]) order by a.sort_order`, [ids]);
  const hasPoints = (await client.query(
    `select count(*) = 2 live from information_schema.columns
      where table_schema = 'public' and table_name = 'wine_archetypes' and column_name in ('display_lon', 'display_lat')`)).rows[0].live;
  const points = hasPoints ? (await client.query(
    `select count(*) filter (where display_lon is not null)::int with_point,
            count(*) filter (where display_lon is not null and wine_place_id is not null)::int placed_with_point,
            coalesce(json_object_agg(id::text, json_build_array(display_lon, display_lat)) filter (where id = any($1::uuid[])), '{}'::json) mine
       from public.wine_archetypes`, [ids])).rows[0] : null;
  const room = await asAuthenticated(client, async () => (await client.query(
    `select archetype_id::text, place_key, region_key from public.training_archetype_places()
      where archetype_id = any($1::uuid[])`, [ids])).rows);
  const rm9a = (await client.query(`with recursive chain as (
      select a.id as archetype_id, p.id as place_id, p.canonical_key, p.kind, p.primary_parent_id, 0 as depth
        from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
      union all
      select c.archetype_id, p.id, p.canonical_key, p.kind, p.primary_parent_id, c.depth + 1
        from chain c join public.wine_places p on p.id = c.primary_parent_id where c.depth < 8
    ), reg as (
      select distinct on (archetype_id) archetype_id, place_id, canonical_key
        from chain where kind = 'REGION' order by archetype_id, depth
    )
    select a.name, r.canonical_key region
      from reg r join public.wine_archetypes a on a.id = r.archetype_id
     where r.canonical_key <> 'france.bourgogne'
       and not exists (select 1 from public.wine_archetype_placements x
                        where x.archetype_id = r.archetype_id and x.wine_place_id = r.place_id)
     order by a.name`)).rows;
  return { archetypes: rows, points, room, rm9a };
}

/** The differences between archetypeFacts and the linked state the links file promises. */
export function archetypeProblems(facts, links) {
  const problems = [];
  for (const l of links) {
    const a = facts.archetypes.find((x) => x.id === l.archetype_id);
    if (!a) { problems.push(`${l.name}: not found`); continue; }
    if (a.home !== l.home) problems.push(`${l.name}: home ${a.home}, expected ${l.home}`);
    const want = [...l.placements].sort();
    if (JSON.stringify(a.placements) !== JSON.stringify(want)) problems.push(`${l.name}: placements ${a.placements}, expected ${want}`);
    const room = facts.room.find((x) => x.archetype_id === l.archetype_id);
    const state = l.placements.find((k) => k.split(".").length === 2);
    if (!room || room.place_key !== l.home || room.region_key !== state) {
      problems.push(`${l.name}: the room reads ${JSON.stringify(room ?? null)}, expected place ${l.home}, region ${state}`);
    }
    if (facts.points && facts.points.mine[l.archetype_id]?.[0] != null) problems.push(`${l.name}: still carries a curated display point`);
  }
  if (facts.points && facts.points.placed_with_point !== 0) problems.push(`${facts.points.placed_with_point} placed archetypes carry a display point`);
  if (facts.rm9a.length) problems.push(`RM9a: ${facts.rm9a.map((r) => `${r.name} (${r.region})`).join("; ")}`);
  return problems;
}
