// The scoring outputs US-1 must leave unchanged (spec §15 US-1): every stored
// point on the affected tastings' guesses, each affected user's totals (what
// getProfileStats sums), each tasting's leaderboard as its host sees it, and
// the names the two US answer keys and five US catalog wines display. Runs
// inside a read-only transaction; the leaderboard impersonates the host with
// set local role, which a read-only transaction allows.
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
  for (const t of await q("select id, host_id from tastings where id = any ($1::uuid[]) order by id", [AFFECTED_TASTINGS])) {
    await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [t.host_id]);
    await c.query("set local role authenticated");
    leaderboards[t.id] = (await c.query("select * from get_tasting_leaderboard($1) order by participant_id", [t.id])).rows;
    await c.query("reset role");
  }
  const answer_keys = await q(`select wa.wine_id, co.name as country, r.name as region, a.name as appellation
      from wine_answers wa join regions r on r.id = wa.region_id join countries co on co.id = r.country_id left join appellations a on a.id = wa.appellation_id
     where co.name = 'United States' order by wa.wine_id`);
  const catalog_wines = await q(`select w.id, r.name as region, a.name as appellation from catalog_wines w
      join regions r on r.id = w.region_id join appellations a on a.id = w.appellation_id join countries co on co.id = r.country_id
     where co.name = 'United States' order by w.id`);
  return { guesses, user_totals, leaderboards, answer_keys, catalog_wines };
}
