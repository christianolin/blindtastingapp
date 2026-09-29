// The scoring outputs US-1 must leave unchanged (spec §15 US-1): every stored
// point on the affected tastings' guesses, each affected user's totals (what
// getProfileStats sums), each tasting's leaderboard as its host sees it, and
// what the US answer keys and US catalog wines point at. Runs inside a
// read-only transaction; the leaderboard impersonates the host with set local
// role, which a read-only transaction allows.
//
// The answer keys and catalog wines carry their region/appellation ids AND the
// names they display. US-1 changes some of those on purpose (it renames
// "California AVA" to "California" in place, re-points a merged row's
// references to the kept row, moves Walla Walla Valley AVA under Washington),
// so the after-snapshot is never compared with the before-snapshot as is:
// expectedScoringAfter(before, spec) applies exactly those spec changes first,
// and anything else that moved is a failure.
export const AFFECTED_TASTINGS = ["83a1a1cc-3275-4472-90c3-a00398eea4cf", "42e8c830-a545-491c-bec8-1272e8aaba72", "c22c4b09-bf16-4dbe-9973-e2a4f469a99f"];
const POINTS = "country_points, region_points, appellation_points, primary_grape_points, secondary_grape_points, producer_points, type_designation_points, vintage_points, total_points";

export async function scoringSnapshot(c) {
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  const guesses = await q(`select g.id, ${POINTS} from guesses g join wines w on w.id = g.wine_id where w.tasting_id = any ($1::uuid[]) order by g.id`, [AFFECTED_TASTINGS]);
  const user_totals = await q(`select tp.user_id, count(*) filter (where g.scored_at is not null)::int as scored, coalesce(sum(g.total_points), 0)::int as total
      from guesses g join tasting_participants tp on tp.id = g.participant_id
     where tp.user_id in (select user_id from tasting_participants where tasting_id = any ($1::uuid[]))
     group by tp.user_id order by tp.user_id`, [AFFECTED_TASTINGS]);
  const leaderboards = {};
  // Put the caller's claims back afterwards, so a rehearsal that snapshots and
  // then runs the migration in the same transaction does not run it as a host.
  const [{ prev }] = await q("select current_setting('request.jwt.claims', true) as prev");
  for (const t of await q("select id, host_id from tastings where id = any ($1::uuid[]) order by id", [AFFECTED_TASTINGS])) {
    await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [t.host_id]);
    await c.query("set local role authenticated");
    leaderboards[t.id] = (await c.query("select * from get_tasting_leaderboard($1) order by participant_id", [t.id])).rows;
    await c.query("reset role");
  }
  await c.query("select set_config('request.jwt.claims', coalesce($1, ''), true)", [prev]);
  const answer_keys = await q(`select wa.wine_id, co.name as country, wa.region_id, r.name as region, wa.appellation_id, a.name as appellation
      from wine_answers wa join regions r on r.id = wa.region_id join countries co on co.id = r.country_id left join appellations a on a.id = wa.appellation_id
     where co.name = 'United States' order by wa.wine_id`);
  const catalog_wines = await q(`select w.id, w.region_id, r.name as region, w.appellation_id, a.name as appellation from catalog_wines w
      join regions r on r.id = w.region_id join appellations a on a.id = w.appellation_id join countries co on co.id = r.country_id
     where co.name = 'United States' order by w.id`);
  return { guesses, user_totals, leaderboards, answer_keys, catalog_wines };
}

// Pure. The snapshot US-1 should leave behind, given the one taken before it:
// the guesses, user totals and leaderboards unchanged; each answer key and
// catalog wine re-pointed by the spec's merges (to the kept row, its region)
// and moves (to the new region), then renamed by id through spec.renames.
export function expectedScoringAfter(before, spec) {
  for (const t of ["answer_keys", "catalog_wines"]) {
    for (const row of before[t]) {
      if (!("appellation_id" in row) || !("region_id" in row)) throw new Error(`the before-snapshot's ${t} rows carry no ids; re-run capture-us1-scoring.mjs BEFORE the apply`);
    }
  }
  const merged = new Map(spec.merges.map((m) => [m.loser_id, m]));
  const moved = new Map(spec.moves.map((m) => [m.id, m]));
  const renamed = new Map(spec.renames.map((r) => [r.id, r]));
  const after = (row) => {
    let out = { ...row };
    const m = merged.get(out.appellation_id);
    if (m) out = { ...out, appellation_id: m.kept_id, appellation: m.kept_name, region_id: m.kept_region_id, region: m.kept_region };
    const mv = moved.get(out.appellation_id);
    if (mv) out = { ...out, region_id: mv.to_region_id, region: mv.to_region };
    const rn = renamed.get(out.appellation_id);
    if (rn) {
      if (out.appellation !== rn.old && out.appellation !== rn.new) throw new Error(`${out.appellation_id} displays ${out.appellation}, which is neither ${rn.old} nor ${rn.new}`);
      out = { ...out, appellation: rn.new };
    }
    return out;
  };
  return { ...before, answer_keys: before.answer_keys.map(after), catalog_wines: before.catalog_wines.map(after) };
}
