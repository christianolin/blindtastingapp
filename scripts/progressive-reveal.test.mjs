// Progressive-reveal DB tests. Runs against the LIVE schema (migrations are
// applied before this runs). Each test wraps its work in begin/rollback so
// nothing persists. Env: DB_PASSWORD (+ optional DB_PORT=5432).
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");
export const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

export async function withRollback(fn) {
  await client.query("begin");
  try {
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

// Make auth.uid() resolve to a given user for SECURITY DEFINER RPCs.
export async function actAs(userId) {
  await client.query(
    "select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: userId })],
  );
}

async function ref(table, name) {
  const q = "select id from " + table + " where name=$1 limit 1";
  const { rows } = await client.query(q, [name]);
  assert.ok(rows[0], table + " '" + name + "' missing");
  return rows[0].id;
}

// A LIVE + BLIND + guided tasting: host + two joined guessers, one wine with a
// full answer (France/Bordeaux/CabSauv+Merlot/2020). p1 guesses perfectly; p2
// gets country+grape right but region wrong and no secondary grape, vintage off
// by one.
export async function seedTasting({ timing = "LIVE", sequential = true } = {}) {
  // host_id / participant.user_id FK real users — use 3 existing profiles (all
  // rolled back afterwards, so this leaves no trace).
  const users = (await client.query("select id from profiles limit 3")).rows;
  assert.ok(users.length >= 3, "need >= 3 profiles to seed a test tasting");
  const hostUserId = users[0].id;
  const p1UserId = users[1].id;
  const p2UserId = users[2].id;
  const host = (
    await client.query(
      "insert into tastings (name, host_id, timing_mode, wine_source, reveal_mode, status, sequential_guessing) values ('PR test', $2, $1, 'HOST_PROVIDES', 'BLIND', 'IN_PROGRESS', $3) returning id, host_id",
      [timing, hostUserId, sequential],
    )
  ).rows[0];
  const tastingId = host.id;
  const mk = async (uid) =>
    (
      await client.query(
        "insert into tasting_participants (tasting_id, user_id, status) values ($1,$2,'JOINED') returning id",
        [tastingId, uid],
      )
    ).rows[0].id;
  const hostParticipantId = await mk(hostUserId);
  const p1 = await mk(p1UserId);
  const p2 = await mk(p2UserId);
  const wineId = (
    await client.query(
      "insert into wines (tasting_id, position) values ($1, 1) returning id",
      [tastingId],
    )
  ).rows[0].id;
  const country = await ref("countries", "France");
  const region = await ref("regions", "Bordeaux");
  const cab = await ref("grapes", "Cabernet Sauvignon");
  const merlot = await ref("grapes", "Merlot");
  const prod = (await client.query("select id from producers limit 1")).rows[0].id;
  await client.query(
    "insert into wine_answers (wine_id, country_id, region_id, primary_grape_id, secondary_grape_id, producer_id, vintage_kind, vintage_year) values ($1,$2,$3,$4,$5,$6,'YEAR',2020)",
    [wineId, country, region, cab, merlot, prod],
  );
  await client.query(
    "insert into guesses (wine_id, participant_id, country_id, region_id, primary_grape_id, secondary_grape_id, producer_id, vintage_kind, vintage_year) values ($1,$2,$3,$4,$5,$6,$7,'YEAR',2020)",
    [wineId, p1, country, region, cab, merlot, prod],
  );
  const otherRegion = (
    await client.query("select id from regions where name<>'Bordeaux' limit 1")
  ).rows[0].id;
  await client.query(
    "insert into guesses (wine_id, participant_id, country_id, region_id, primary_grape_id, vintage_kind, vintage_year) values ($1,$2,$3,$4,$5,'YEAR',2019)",
    [wineId, p2, country, otherRegion, cab],
  );
  return {
    tastingId,
    hostUserId,
    hostParticipantId,
    p1,
    p1UserId,
    p2,
    p2UserId,
    wineId,
  };
}

before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

test("schema: reveal_step + leaderboard_reveal exist with defaults", async () => {
  await withRollback(async () => {
    const { tastingId, wineId, p1 } = await seedTasting();
    const w = await client.query(
      "select reveal_step from wines where id=$1",
      [wineId],
    );
    assert.equal(w.rows[0].reveal_step, 0);
    const g = await client.query(
      "select reveal_step from guesses where wine_id=$1 and participant_id=$2",
      [wineId, p1],
    );
    assert.equal(g.rows[0].reveal_step, 0);
    const t = await client.query(
      "select leaderboard_reveal from tastings where id=$1",
      [tastingId],
    );
    assert.equal(t.rows[0].leaderboard_reveal, "PER_ATTRIBUTE");
  });
});

test("reveal_next_category: advances one category, scores it, idempotent", async () => {
  await withRollback(async () => {
    const s = await seedTasting();
    await actAs(s.hostUserId);
    const r1 = await client.query(
      "select reveal_next_category($1, $2::smallint) as step",
      [s.wineId, 0],
    );
    assert.equal(r1.rows[0].step, 1);
    const g = await client.query(
      "select country_points, region_points from guesses where wine_id=$1",
      [s.wineId],
    );
    for (const row of g.rows) assert.equal(row.country_points, 2);
    for (const row of g.rows) assert.equal(row.region_points, null);
    const w = await client.query(
      "select reveal_step, is_revealed from wines where id=$1",
      [s.wineId],
    );
    assert.equal(w.rows[0].reveal_step, 1);
    assert.equal(w.rows[0].is_revealed, false);
    const again = await client.query(
      "select reveal_next_category($1, $2::smallint) as step",
      [s.wineId, 0],
    );
    assert.equal(again.rows[0].step, 1);
  });
});

test("reveal_next_category: full sequence matches reveal_wine + sets is_revealed", async () => {
  await withRollback(async () => {
    const s = await seedTasting();
    await actAs(s.hostUserId);
    let step = 0;
    for (let i = 0; i < 5; i += 1) {
      const r = await client.query(
        "select reveal_next_category($1, $2::smallint) as step",
        [s.wineId, step],
      );
      step = r.rows[0].step;
    }
    assert.equal(step, 5);
    const w = await client.query("select is_revealed from wines where id=$1", [s.wineId]);
    assert.equal(w.rows[0].is_revealed, true);
    const g = await client.query(
      "select total_points from guesses where wine_id=$1 order by total_points desc",
      [s.wineId],
    );
    assert.equal(g.rows[0].total_points, 23);
    assert.equal(g.rows[1].total_points, 11);
  });
});

test("reveal_next_category: a plain guesser cannot advance a host-provided wine", async () => {
  await withRollback(async () => {
    const s = await seedTasting();
    await actAs(s.p1UserId);
    await assert.rejects(
      client.query("select reveal_next_category($1, $2::smallint)", [s.wineId, 0]),
      /host or the wine owner/,
    );
  });
});

test("reveal_own_next_category: self-paced, scoped to caller, wine untouched", async () => {
  await withRollback(async () => {
    const s = await seedTasting({ timing: "ASYNC" });
    await actAs(s.p2UserId);
    const r = await client.query(
      "select reveal_own_next_category($1, $2::smallint) as step",
      [s.wineId, 0],
    );
    assert.equal(r.rows[0].step, 1);
    const own = await client.query(
      "select reveal_step, country_points from guesses where wine_id=$1 and participant_id=$2",
      [s.wineId, s.p2],
    );
    assert.equal(own.rows[0].reveal_step, 1);
    assert.equal(own.rows[0].country_points, 2);
    const other = await client.query(
      "select reveal_step, country_points from guesses where wine_id=$1 and participant_id=$2",
      [s.wineId, s.p1],
    );
    assert.equal(other.rows[0].reveal_step, 0);
    assert.equal(other.rows[0].country_points, null);
    const w = await client.query(
      "select reveal_step, is_revealed from wines where id=$1",
      [s.wineId],
    );
    assert.equal(w.rows[0].reveal_step, 0);
    assert.equal(w.rows[0].is_revealed, false);
    const again = await client.query(
      "select reveal_own_next_category($1, $2::smallint) as step",
      [s.wineId, 0],
    );
    assert.equal(again.rows[0].step, 1);
  });
});

test("reveal_own_next_category: blocked in guided-live tastings", async () => {
  await withRollback(async () => {
    const s = await seedTasting();
    await actAs(s.p2UserId);
    await assert.rejects(
      client.query("select reveal_own_next_category($1, $2::smallint)", [s.wineId, 0]),
      /host-driven/,
    );
  });
});

test("get_wine_reveal: guided returns only <= reveal_step; no unrevealed answer leaks", async () => {
  await withRollback(async () => {
    const s = await seedTasting();
    await actAs(s.hostUserId);
    await client.query("select reveal_next_category($1, $2::smallint)", [s.wineId, 0]);
    await actAs(s.p2UserId);
    const r = await client.query("select get_wine_reveal($1) as j", [s.wineId]);
    const j = r.rows[0].j;
    assert.equal(j.reveal_step, 1);
    assert.deepEqual(j.revealed_keys, ["country"]);
    assert.ok("country" in j.correct);
    assert.ok(!("region" in j.correct));
    assert.ok(!("producer" in j.correct));
    assert.equal(j.guesses.length, 2);
    for (const gg of j.guesses) {
      assert.ok("country" in gg.values);
      assert.ok(!("region" in gg.values));
      assert.ok("country" in gg.points);
    }
    const ans = await client.query(
      "select region_id, producer_id from wine_answers where wine_id=$1",
      [s.wineId],
    );
    const blob = JSON.stringify(j);
    assert.ok(!blob.includes(ans.rows[0].region_id), "region answer leaked");
    assert.ok(!blob.includes(ans.rows[0].producer_id), "producer answer leaked");
  });
});

test("get_wine_reveal: self-paced scopes to the caller only", async () => {
  await withRollback(async () => {
    const s = await seedTasting({ timing: "ASYNC" });
    await actAs(s.p2UserId);
    await client.query("select reveal_own_next_category($1, $2::smallint)", [s.wineId, 0]);
    const r = await client.query("select get_wine_reveal($1) as j", [s.wineId]);
    const j = r.rows[0].j;
    assert.equal(j.reveal_step, 1);
    assert.equal(j.guesses.length, 1);
    assert.equal(j.guesses[0].participant_id, s.p2);
  });
});

test("get_wine_reveal: a non-participant gets null", async () => {
  await withRollback(async () => {
    const s = await seedTasting();
    const outsider = (
      await client.query(
        "select id from profiles where id not in (select user_id from tasting_participants where tasting_id=$1) limit 1",
        [s.tastingId],
      )
    ).rows[0].id;
    await actAs(outsider);
    const r = await client.query("select get_wine_reveal($1) as j", [s.wineId]);
    assert.equal(r.rows[0].j, null);
  });
});
