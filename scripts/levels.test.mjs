// Levels and achievements DB suite (spec
// docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md §10.1):
// the curve, the post-state, every award source and its caps, Rule 1 on masked
// pours, the achievements, RLS, the three client RPCs, account deletion, error
// isolation (L20), replay parity and the reveal's timing, for
// 20260927160000_levels_and_achievements.sql.
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles (11-12's pour owner also gets a throwaway
// auth.users row, authPeople()), catalog wines, lots and tastings created
// inside that transaction: no real person's row decides a result or is written.
// Deferred triggers fire only at COMMIT, so the drink tests run
// `set constraints all immediate` after the write.
//
//   node --env-file=.env.local --test --test-concurrency=1 scripts/levels.test.mjs
//
// Dry run before the migration is live: LEVELS_APPLY lists migration files
// (comma-separated, in order) that each test applies inside its own
// rolled-back transaction first, e.g.
//   LEVELS_APPLY=supabase/migrations/20260927160000_levels_and_achievements.sql \
//     node --env-file=.env.local --test --test-concurrency=1 scripts/levels.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const APPLY = (process.env.LEVELS_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

const client = new pg.Client(pgConfig());
/** WARNINGs raised inside the current test's transaction (L20). */
const warnings = [];
client.on("notice", (n) => {
  if (n.severity === "WARNING") warnings.push(n.message);
});
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb) {
  await client.query("begin");
  try {
    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
    warnings.length = 0;
    return await cb();
  } finally {
    await client.query("rollback");
  }
}

async function asOwner() {
  await client.query("reset role");
}
// A signed-in caller; `null` is a request with no user (auth.uid() is null).
async function asUser(id) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(id ? { sub: id, role: "authenticated" } : { role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}
async function asAnon() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
  await client.query("set local role anon");
}

// Runs `fn` inside a savepoint that is always rolled back, and checks it failed with `code`.
async function expectError(fn, code) {
  await client.query("savepoint expect_error");
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await client.query("rollback to savepoint expect_error");
  assert.ok(error, `expected SQLSTATE ${code}, but it succeeded`);
  assert.equal(error.code, code, error.message);
}

// Throwaway people that exist only inside the current transaction.
async function people(n) {
  await asOwner();
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'levels-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`Levels test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

// Throwaway people who also have an auth.users row, for a column that still
// references auth.users(id): wine_pour_intents.owner_id
// (20260912103000_cellar_pour_intent.sql:16, live per 20260919101300's header).
// profiles itself has had no FK to auth.users since 20260829265003, so
// people() needs none. The row is inserted as the owner role inside the
// rolled-back transaction, before any profile exists for its id:
// on_auth_user_created -> handle_new_user() (init_schema.sql:54, md5-pinned by
// 20260919101300) writes the profile with a plain insert (no ON CONFLICT),
// from new.id, raw_user_meta_data's display_name and new.email. The update
// after it pins display_name and email whatever that body derives. No real
// person's account is borrowed, and no FK is dropped.
async function authPeople(n) {
  await asOwner();
  const can = (await client.query("select has_table_privilege('auth.users', 'INSERT') as ok")).rows[0].ok;
  assert.ok(can, "the suite's login role needs INSERT on auth.users for a throwaway pour owner");
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const name = `Levels test auth ${i}`;
    const r = await client.query(
      `insert into auth.users (id, aud, role, email, raw_user_meta_data)
       values (gen_random_uuid(), 'authenticated', 'authenticated',
               'levels-test+' || gen_random_uuid()::text || '@blindr.invalid',
               jsonb_build_object('display_name', $1::text))
       returning id, email`,
      [name],
    );
    const { id, email } = r.rows[0];
    const p = await client.query("update profiles set display_name = $2, email = $3 where id = $1", [
      id,
      name,
      email,
    ]);
    assert.equal(p.rowCount, 1, "on_auth_user_created wrote the throwaway profile");
    ids.push(id);
  }
  return ids;
}

// Live reference ids by exact name (owner role).
let REFS = null;
async function refs() {
  if (REFS) return REFS;
  await asOwner();
  const one = async (what, sql, params) => {
    const r = await client.query(sql, params);
    assert.equal(r.rowCount, 1, `${what} should be exactly one live row`);
    return r.rows[0].id;
  };
  const byName = (table, name) => one(`${table} ${name}`, `select id from ${table} where name = $1`, [name]);
  REFS = {
    france: await byName("countries", "France"),
    spain: await byName("countries", "Spain"),
    bordeaux: await one(
      "France / Bordeaux",
      "select r.id from regions r join countries c on c.id = r.country_id where c.name = 'France' and r.name = 'Bordeaux'",
    ),
    rioja: await one(
      "Spain / Rioja",
      "select r.id from regions r join countries c on c.id = r.country_id where c.name = 'Spain' and r.name = 'Rioja'",
    ),
    margauxAoc: await one(
      "Bordeaux / Margaux AOC",
      `select a.id from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
        where c.name = 'France' and r.name = 'Bordeaux' and a.name = 'Margaux AOC'`,
    ),
    riojaApp: (
      await client.query(
        `select a.id from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
          where c.name = 'Spain' and r.name = 'Rioja' order by a.id limit 1`,
      )
    ).rows[0].id,
    cabernet: await byName("grapes", "Cabernet Sauvignon"),
    tempranillo: await byName("grapes", "Tempranillo"),
    producer: (await client.query("select id from producers order by id limit 1")).rows[0].id,
  };
  return REFS;
}

// A catalog wine written by the owner; a fresh name keeps it clear of
// catalog_wines_identity_key. Margaux, Cabernet Sauvignon, 2019 unless told.
async function catalogWine(createdBy, f = {}) {
  const r = await refs();
  await asOwner();
  const w = {
    country: r.france,
    region: r.bordeaux,
    appellation: r.margauxAoc,
    primary: r.cabernet,
    producer: r.producer,
    blindPending: false,
    ...f,
  };
  const row = await client.query(
    `insert into catalog_wines
       (country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year,
        colour, style, wine_name, created_by, blind_pending)
     values ($1, $2, $3, $4, $5, 'YEAR', 2019, 'RED', 'STILL', 'Levels test ' || gen_random_uuid()::text, $6, $7)
     returning *`,
    [w.country, w.region, w.appellation, w.primary, w.producer, createdBy, w.blindPending],
  );
  return row.rows[0];
}

// A tasting as DRAFT with the host's JOINED seat; `start` moves it on.
async function tasting(host, { mode = "BLIND", timing = "LIVE", policy = "AFTER_ALL" } = {}) {
  await asOwner();
  const t = (
    await client.query(
      `insert into tastings (name, host_id, timing_mode, wine_source, reveal_mode, async_reveal_policy)
       values ('Levels test', $1, $2, 'HOST_PROVIDES', $3, $4) returning id`,
      [host, timing, mode, policy],
    )
  ).rows[0].id;
  await seat(t, host);
  return t;
}
async function seat(tastingId, userId, status = "JOINED") {
  await asOwner();
  return (
    await client.query(
      "insert into tasting_participants (tasting_id, user_id, status) values ($1, $2, $3) returning id",
      [tastingId, userId, status],
    )
  ).rows[0].id;
}
async function start(tastingId) {
  await asOwner();
  await client.query("update tastings set status = 'IN_PROGRESS' where id = $1", [tastingId]);
}
async function close(tastingId) {
  await asOwner();
  await client.query("update tastings set status = 'CLOSED' where id = $1", [tastingId]);
}
// A glass whose answer key is `wine` (a catalog_wines row).
async function glass(tastingId, position, wine) {
  await asOwner();
  const id = (
    await client.query("insert into wines (tasting_id, position) values ($1, $2) returning id", [tastingId, position])
  ).rows[0].id;
  await client.query(
    `insert into wine_answers
       (wine_id, catalog_wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id,
        vintage_kind, vintage_year)
     values ($1, $2, $3, $4, $5, $6, $7, 'YEAR', 2019)`,
    [id, wine.id, wine.country_id, wine.region_id, wine.appellation_id, wine.primary_grape_id, wine.producer_id],
  );
  return id;
}
// A guess row; `exact` copies the answer (26 points: 2+3+5+8+6+2), `wrong` is
// a non-blank all-wrong guess (0 points), `blank` has no field at all.
async function guess(glassId, participantId, shape, wine, extra = {}) {
  const r = await refs();
  await asOwner();
  const f =
    shape === "exact"
      ? { country_id: wine.country_id, region_id: wine.region_id, appellation_id: wine.appellation_id,
          primary_grape_id: wine.primary_grape_id, producer_id: wine.producer_id, vintage_kind: "YEAR", vintage_year: 2019 }
      : shape === "country"
        ? { country_id: wine.country_id }
        : shape === "wrong"
          ? { country_id: r.spain }
          : {};
  const all = { ...f, ...extra };
  const cols = Object.keys(all);
  const g = await client.query(
    `insert into guesses (wine_id, participant_id${cols.map((c) => `, ${c}`).join("")})
     values ($1, $2${cols.map((_, i) => `, $${i + 3}`).join("")}) returning id`,
    [glassId, participantId, ...cols.map((c) => all[c])],
  );
  return g.rows[0].id;
}
async function reveal(host, glassId) {
  await asUser(host);
  await client.query("select reveal_wine($1)", [glassId]);
  await asOwner();
}
async function immediate() {
  await client.query("set constraints all immediate");
}
// Back to COMMIT-time firing after an immediate(): a pour must see its own
// intent and hold before the drink trigger runs, as it does in production.
async function deferred() {
  await client.query("set constraints all deferred");
}
async function ledger(userId) {
  await asOwner();
  return (
    await client.query(
      "select kind, source_key, xp, units, achievement_key from xp_events where user_id = $1 order by id",
      [userId],
    )
  ).rows;
}
const keysOf = (rows) => rows.map((r) => r.source_key);
async function xpOf(userId) {
  await asOwner();
  const r = await client.query("select xp, level from profile_levels where user_id = $1", [userId]);
  return r.rows[0] ?? { xp: 0, level: 1 };
}
async function achievementsOf(userId) {
  await asOwner();
  return (
    await client.query(
      "select achievement_key from profile_achievements where user_id = $1 order by achievement_key",
      [userId],
    )
  ).rows.map((r) => r.achievement_key);
}
async function metric(userId, key) {
  await asOwner();
  return (await client.query("select public.xp_achievement_metric($1, $2) as m", [userId, key])).rows[0].m;
}
async function addLot(userId, quantity, wine) {
  await asUser(userId);
  const id = (
    await client.query("select add_cellar_lot($1::jsonb) as id", [
      JSON.stringify({ catalog_wine_id: wine.id, quantity }),
    ])
  ).rows[0].id;
  await asOwner();
  return id;
}
async function consume(userId, lotId, quantity, reason = "DRANK") {
  await asUser(userId);
  const id = (
    await client.query("select consume_cellar_lot($1::jsonb) as id", [
      JSON.stringify({ lot_id: lotId, quantity, reason }),
    ])
  ).rows[0].id;
  await asOwner();
  return id;
}
async function note(userId, fields) {
  await asUser(userId);
  const id = (
    await client.query("select save_wset_note($1::jsonb, '[]'::jsonb) as id", [JSON.stringify(fields)])
  ).rows[0].id;
  await asOwner();
  return id;
}

// ---------------------------------------------------------------------------
// 1. The curve.
// ---------------------------------------------------------------------------
test("1. level_for_xp matches src/lib/levels/__fixtures__/curve.json on every row", async () => {
  const rows = JSON.parse(readFileSync("src/lib/levels/__fixtures__/curve.json", "utf8"));
  assert.equal(rows.length, 179);
  await withRollback(async () => {
    const r = await client.query(
      "select x.xp, public.level_for_xp(x.xp)::int as level from unnest($1::int[]) with ordinality as x(xp, n) order by x.n",
      [rows.map(([xp]) => xp)],
    );
    assert.deepEqual(
      r.rows.map((row) => [row.xp, row.level]),
      rows,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Post-state: seeds, copy parity, triggers, EXECUTE holders.
// ---------------------------------------------------------------------------
test("2. seeds, copy keys, triggers and grants are spec §5", async () => {
  const copy = readFileSync("src/lib/levels/copy.ts", "utf8").replace(/\r/g, "");
  const block = copy.slice(copy.indexOf("export const ACHIEVEMENTS"), copy.indexOf("\n};", copy.indexOf("export const ACHIEVEMENTS")));
  const copyKeys = [...block.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]);
  assert.equal(copyKeys.length, 20);
  await withRollback(async () => {
    await asOwner();
    const keys = (await client.query("select key from achievements where is_active order by sort_order")).rows.map(
      (r) => r.key,
    );
    assert.deepEqual(keys, copyKeys, "achievements keys (sort_order) equal copy.ts's ACHIEVEMENTS (L22)");
    const sources = (
      await client.query(
        "select kind, base_xp, unit_xp, unit_cap, daily_xp_cap, daily_count_cap from xp_sources order by kind",
      )
    ).rows;
    assert.deepEqual(sources, [
      { kind: "achievement", base_xp: 0, unit_xp: 0, unit_cap: null, daily_xp_cap: null, daily_count_cap: null },
      { kind: "cellar_add", base_xp: 0, unit_xp: 5, unit_cap: 20, daily_xp_cap: 100, daily_count_cap: null },
      { kind: "drink", base_xp: 0, unit_xp: 15, unit_cap: 6, daily_xp_cap: 90, daily_count_cap: null },
      { kind: "guess", base_xp: 10, unit_xp: 1, unit_cap: null, daily_xp_cap: null, daily_count_cap: null },
      { kind: "guess_match", base_xp: 10, unit_xp: 10, unit_cap: null, daily_xp_cap: null, daily_count_cap: null },
      { kind: "note", base_xp: 20, unit_xp: 0, unit_cap: null, daily_xp_cap: null, daily_count_cap: 5 },
      { kind: "tasting_finished", base_xp: 40, unit_xp: 0, unit_cap: null, daily_xp_cap: null, daily_count_cap: 3 },
      { kind: "tasting_hosted", base_xp: 40, unit_xp: 0, unit_cap: null, daily_xp_cap: null, daily_count_cap: 3 },
      { kind: "training", base_xp: 20, unit_xp: 1, unit_cap: null, daily_xp_cap: null, daily_count_cap: 5 },
    ]);
    const order = (
      await client.query(
        `select t.tgname from pg_trigger t
          where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal
            and pg_get_triggerdef(t.oid) like '% AFTER UPDATE OF is_revealed ON public.wines %'
          order by t.tgname collate "C"`,
      )
    ).rows.map((r) => r.tgname);
    const at = order.indexOf("wines_xp_on_reveal");
    assert.ok(at > order.indexOf("trg_catalog_wine_unmark_blind"), `fires after the unmark: ${order}`);
    assert.ok(at < order.indexOf("wset_notes_resolve_on_reveal"), `fires before the note resolve: ${order}`);
    const exec = async (role, sig) =>
      (await client.query("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, sig])).rows[0].ok;
    for (const sig of ["public.get_my_level_state()", "public.mark_xp_seen(bigint[],boolean)", "public.get_my_achievement_progress()"]) {
      assert.equal(await exec("authenticated", sig), true, sig);
      assert.equal(await exec("anon", sig), false, sig);
      assert.equal(await exec("service_role", sig), false, sig);
    }
    for (const sig of [
      "public.xp_award(uuid,text,text,integer,integer,text,timestamptz,boolean)",
      "public.xp_replay_user(uuid,boolean,boolean)",
      "public.level_for_xp(integer)",
    ]) {
      assert.equal(await exec("authenticated", sig), false, sig);
      assert.equal(await exec("service_role", sig), false, sig);
    }
  });
});

// ---------------------------------------------------------------------------
// 3-6. Guess XP.
// ---------------------------------------------------------------------------
test("3. a BLIND reveal pays each guesser 10 + points once; blank guesses and the host nothing", async () => {
  await withRollback(async () => {
    const [host, a, b, c] = await people(4);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    const pa = await seat(t, a);
    const pb = await seat(t, b);
    const pc = await seat(t, c);
    const g1 = await glass(t, 1, wine);
    await start(t);
    const ga = await guess(g1, pa, "exact", wine);
    const gb = await guess(g1, pb, "country", wine);
    await guess(g1, pc, "blank", wine, { locked_at: new Date().toISOString() });
    await reveal(host, g1);

    const la = await ledger(a);
    assert.deepEqual(
      la.filter((r) => r.kind === "guess"),
      [{ kind: "guess", source_key: `guess:${ga}`, xp: 36, units: 26, achievement_key: null }],
    );
    assert.ok(keysOf(la).includes("achievement:perfect_glass"), "26/26 unlocks Perfect glass");
    assert.deepEqual(
      (await ledger(b)).map((r) => [r.source_key, r.xp]),
      [[`guess:${gb}`, 12]],
    );
    assert.deepEqual(await ledger(c), [], "a blank locked guess earns nothing (L11)");
    assert.deepEqual(await ledger(host), [], "the HOST_PROVIDES host has no guess");

    // A second pass (the repair) finds everything paid.
    await client.query("select public.xp_award_guess($1, now(), false, true)", [ga]);
    assert.equal((await ledger(a)).filter((r) => r.kind === "guess").length, 1);
  });
});

test("4. reveal_next_category pays nothing until its last step, then the final points", async () => {
  await withRollback(async () => {
    const [host, a] = await people(2);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    const pa = await seat(t, a);
    const g1 = await glass(t, 1, wine);
    await start(t);
    const ga = await guess(g1, pa, "country", wine);
    const steps = (await client.query("select array_length(public.in_play_steps($1), 1) as n", [g1])).rows[0].n;
    assert.equal(steps, 6, "country, region, appellation, grapes, producer, vintage");
    for (let step = 0; step < steps; step += 1) {
      assert.deepEqual(await ledger(a), [], `nothing before the last step (${step} done)`);
      await asUser(host);
      await client.query("select reveal_next_category($1, $2::smallint)", [g1, step]);
    }
    assert.deepEqual(
      (await ledger(a)).map((r) => [r.source_key, r.xp, r.units]),
      [[`guess:${ga}`, 12, 2]],
    );
  });
});

test("5. ASYNC IMMEDIATE: score_own_guess pays nothing, the global reveal pays (L12)", async () => {
  await withRollback(async () => {
    const [host, a] = await people(2);
    const wine = await catalogWine(host);
    const t = await tasting(host, { timing: "ASYNC", policy: "IMMEDIATE" });
    const pa = await seat(t, a);
    const g1 = await glass(t, 1, wine);
    await start(t);
    const ga = await guess(g1, pa, "exact", wine);
    await asUser(a);
    await client.query("select score_own_guess($1)", [g1]);
    await asOwner();
    assert.ok((await client.query("select scored_at from guesses where id = $1", [ga])).rows[0].scored_at);
    assert.deepEqual(await ledger(a), [], "self-scored, not yet public");
    await reveal(host, g1);
    assert.ok(keysOf(await ledger(a)).includes(`guess:${ga}`));
  });
});

test("6. SEMI_BLIND: a match earns 20, a miss 10, an unassigned guess nothing (L10)", async () => {
  await withRollback(async () => {
    const [host, a, b, c] = await people(4);
    const w1 = await catalogWine(host);
    const w2 = await catalogWine(host);
    const t = await tasting(host, { mode: "SEMI_BLIND" });
    const pa = await seat(t, a);
    const pb = await seat(t, b);
    const pc = await seat(t, c);
    const g1 = await glass(t, 1, w1);
    const g2 = await glass(t, 2, w2);
    await start(t);
    const ga = await guess(g1, pa, "blank", w1, { guessed_wine_id: g1 });
    const gb = await guess(g1, pb, "blank", w1, { guessed_wine_id: g2 });
    await guess(g1, pc, "blank", w1);
    await reveal(host, g1);
    assert.deepEqual(
      (await ledger(a)).map((r) => [r.kind, r.source_key, r.xp, r.units]),
      [["guess_match", `guess:${ga}`, 20, 1]],
    );
    assert.deepEqual(
      (await ledger(b)).map((r) => [r.kind, r.source_key, r.xp, r.units]),
      [["guess_match", `guess:${gb}`, 10, 0]],
    );
    assert.deepEqual(await ledger(c), []);
  });
});

// ---------------------------------------------------------------------------
// 7-8. Closing a tasting.
// ---------------------------------------------------------------------------
test("7. close pays a playing guest and a host with a guest, once, three a day", async () => {
  await withRollback(async () => {
    const [host, a, b, c, d] = await people(5);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    const pa = await seat(t, a);
    await seat(t, b);
    await seat(t, c, "INVITED");
    await seat(t, d, "DECLINED");
    const g1 = await glass(t, 1, wine);
    await start(t);
    await guess(g1, pa, "country", wine);
    await reveal(host, g1);
    await close(t);
    assert.ok(keysOf(await ledger(a)).includes(`finish:${t}`));
    assert.equal((await ledger(a)).find((r) => r.source_key === `finish:${t}`).xp, 40);
    assert.ok(keysOf(await ledger(a)).includes("achievement:first_tasting"));
    assert.deepEqual(await ledger(b), [], "a JOINED guest with no scored guess");
    assert.deepEqual(await ledger(c), [], "INVITED");
    assert.deepEqual(await ledger(d), [], "DECLINED");
    assert.deepEqual(
      (await ledger(host)).map((r) => r.source_key),
      [`host:${t}`, "achievement:first_tasting", "achievement:first_host"],
    );

    // Reopen and close again: nothing twice.
    const before = (await ledger(a)).length + (await ledger(host)).length;
    await start(t);
    await close(t);
    assert.equal((await ledger(a)).length + (await ledger(host)).length, before);

    // A host alone, no revealed glass, and an OPEN board pay nothing.
    const alone = await tasting(host);
    const gAlone = await glass(alone, 1, wine);
    await start(alone);
    await reveal(host, gAlone);
    await close(alone);
    const unrevealed = await tasting(host);
    await seat(unrevealed, a);
    await glass(unrevealed, 1, wine);
    await start(unrevealed);
    await close(unrevealed);
    const open = await tasting(host, { mode: "OPEN" });
    await seat(open, a);
    const gOpen = await glass(open, 1, wine);
    await start(open);
    await reveal(host, gOpen);
    await close(open);
    const hostKeys = keysOf(await ledger(host));
    for (const id of [alone, unrevealed, open]) assert.ok(!hostKeys.includes(`host:${id}`), `no host XP for ${id}`);
    assert.ok(!keysOf(await ledger(a)).includes(`finish:${open}`), "OPEN mode has no game");

    // The fourth finish of one UTC day writes no row.
    for (let i = 0; i < 3; i += 1) {
      const more = await tasting(host);
      const p = await seat(more, a);
      const g = await glass(more, 1, wine);
      await start(more);
      await guess(g, p, "country", wine);
      await reveal(host, g);
      await close(more);
    }
    assert.equal((await ledger(a)).filter((r) => r.kind === "tasting_finished").length, 3);
  });
});

test("8. winner: the top of three or more players; ties all win; two players or a 0 top do not", async () => {
  await withRollback(async () => {
    const [host, a, b, c, d, e] = await people(6);
    const wine = await catalogWine(host);
    const play = async (players) => {
      const t = await tasting(host);
      const g = await glass(t, 1, wine);
      const seats = [];
      for (const [user] of players) seats.push(await seat(t, user));
      await start(t);
      for (let i = 0; i < players.length; i += 1) await guess(g, seats[i], players[i][1], wine);
      await reveal(host, g);
      await close(t);
      return t;
    };
    await play([
      [a, "exact"],
      [b, "country"],
      [c, "wrong"],
    ]);
    assert.ok((await achievementsOf(a)).includes("winner"));
    assert.ok(!(await achievementsOf(b)).includes("winner"));
    assert.equal((await ledger(a)).find((r) => r.source_key === "achievement:winner").xp, 100);

    await play([
      [b, "country"],
      [d, "country"],
      [c, "wrong"],
    ]);
    assert.ok((await achievementsOf(b)).includes("winner"), "a tie: both win");
    assert.ok((await achievementsOf(d)).includes("winner"), "a tie: both win");

    await play([
      [e, "exact"],
      [c, "wrong"],
    ]);
    assert.ok(!(await achievementsOf(e)).includes("winner"), "two players are not a table");

    const [f, g2, h] = await people(3);
    await play([
      [f, "wrong"],
      [g2, "wrong"],
      [h, "wrong"],
    ]);
    assert.ok(!(await achievementsOf(f)).includes("winner"), "a top of 0 wins nothing");
  });
});

// ---------------------------------------------------------------------------
// 9-12. The cellar.
// ---------------------------------------------------------------------------
test("9a. a lot pays 5 a bottle, growth pays the difference, an Edit correction and a re-grow nothing", async () => {
  await withRollback(async () => {
    const [u] = await people(1);
    const wine = await catalogWine(u);
    const lot = await addLot(u, 5, wine);
    assert.deepEqual(
      (await ledger(u)).map((r) => [r.source_key, r.xp, r.units]),
      [
        [`cellar_add:${lot}:5`, 25, 5],
        ["achievement:first_bottle", 25, null],
      ],
    );
    await asUser(u);
    await client.query(
      "update cellar_lots set quantity = quantity + 3, purchased_quantity = purchased_quantity + 3 where id = $1",
      [lot],
    );
    await client.query("update cellar_lots set quantity = quantity + 2 where id = $1", [lot]);
    await client.query("update cellar_lots set purchased_quantity = 3 where id = $1", [lot]);
    await client.query("update cellar_lots set purchased_quantity = 8 where id = $1", [lot]);
    assert.deepEqual(
      (await ledger(u)).filter((r) => r.kind === "cellar_add").map((r) => [r.source_key, r.xp, r.units]),
      [
        [`cellar_add:${lot}:5`, 25, 5],
        [`cellar_add:${lot}:8`, 15, 3],
      ],
    );
  });
});

test("9b. a lot pays at most 20 bottles; the day's award that crosses 100 is clamped, later ones write nothing", async () => {
  await withRollback(async () => {
    const [u, v] = await people(2);
    const wine = await catalogWine(u);
    const big = await addLot(u, 30, wine);
    assert.deepEqual(
      (await ledger(u)).filter((r) => r.kind === "cellar_add").map((r) => [r.source_key, r.xp, r.units]),
      [[`cellar_add:${big}:20`, 100, 20]],
    );
    await addLot(v, 8, wine);
    await addLot(v, 8, wine);
    const third = await addLot(v, 8, wine);
    await addLot(v, 1, wine);
    assert.deepEqual(
      (await ledger(v)).filter((r) => r.kind === "cellar_add").map((r) => r.xp),
      [40, 40, 20],
    );
    assert.equal((await ledger(v)).find((r) => r.source_key === `cellar_add:${third}:8`).units, 8);
  });
});

test("10. a drink pays at COMMIT: 15 a bottle up to 6, 90 a day; GIFTED and lot-less nothing", async () => {
  await withRollback(async () => {
    const [u, v] = await people(2);
    const wine = await catalogWine(u);
    const lot = await addLot(u, 20, wine);
    const c1 = await consume(u, lot, 2);
    assert.equal((await ledger(u)).filter((r) => r.kind === "drink").length, 0, "deferred to COMMIT");
    await immediate();
    assert.deepEqual(
      (await ledger(u)).filter((r) => r.kind === "drink").map((r) => [r.source_key, r.xp, r.units]),
      [[`drink:${c1}`, 30, 2]],
    );
    assert.ok((await achievementsOf(u)).includes("first_drink"));
    await consume(u, lot, 1, "GIFTED");
    await asOwner();
    await client.query(
      `insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity, reason, consumed_on)
       values ($1, null, $2, 1, 'DRANK', current_date)`,
      [u, wine.id],
    );
    await immediate();
    assert.equal((await ledger(u)).filter((r) => r.kind === "drink").length, 1, "GIFTED and lot-less pay nothing");

    const vlot = await addLot(v, 20, wine);
    const c10 = await consume(v, vlot, 10);
    await immediate();
    assert.deepEqual(
      (await ledger(v)).filter((r) => r.kind === "drink").map((r) => [r.source_key, r.xp, r.units]),
      [[`drink:${c10}`, 90, 6]],
    );
    await consume(v, vlot, 1);
    await immediate();
    assert.equal((await ledger(v)).filter((r) => r.kind === "drink").length, 1, "the 90/day cap");
  });
});

test("11-12. a masked pour pays nothing until its glass is revealed; a removed glass never (Rule 1)", async () => {
  await withRollback(async () => {
    // The pour owner writes wine_pour_intents, whose owner_id references auth.users(id).
    const [host] = await authPeople(1);
    const [other] = await people(1);
    const wine = await catalogWine(host);
    const lot = await addLot(host, 3, wine);
    const onHand = async () =>
      (await client.query("select public.xp_cellar_on_hand($1) as n", [host])).rows[0].n;
    const masked = async (c) => {
      await asOwner();
      const r = await client.query(
        `select public.xp_consumption_masked($1) as mine,
                exists (select 1 from public.catalog_wine_masked_pours(array[$2::uuid]) m where m.consumption_id = $1) as theirs`,
        [c, wine.id],
      );
      assert.equal(r.rows[0].mine, r.rows[0].theirs, "xp_consumption_masked agrees with catalog_wine_masked_pours");
      return r.rows[0].mine;
    };
    const othersView = async () => {
      await asUser(other);
      const r = await client.query("select xp from profile_levels where user_id = $1", [host]);
      await asOwner();
      return r.rows[0]?.xp ?? 0;
    };

    // pour_cellar_lot_into_glass into a running flight.
    const t = await tasting(host);
    const g1 = await glass(t, 1, wine);
    const g2 = await glass(t, 2, wine);
    await start(t);
    await client.query(
      "insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1, $2, $3, false), ($4, $2, $3, false)",
      [g1, host, lot, g2],
    );
    const xpBefore = await othersView();
    const handBefore = await onHand();
    await asUser(host);
    const c1 = (await client.query("select pour_cellar_lot_into_glass($1) as id", [g1])).rows[0].id;
    const c2 = (await client.query("select pour_cellar_lot_into_glass($1) as id", [g2])).rows[0].id;
    await immediate();
    await asOwner();
    assert.equal((await ledger(host)).filter((r) => r.kind === "drink").length, 0, "no drink at the pour");
    assert.equal(await onHand(), handBefore, "a masked bottle still counts as in the cellar");
    assert.ok(!(await achievementsOf(host)).includes("first_drink"));
    assert.equal(await othersView(), xpBefore, "another member sees no change before the reveal");
    assert.equal(await masked(c1), true);

    await reveal(host, g1);
    assert.equal(await masked(c1), false);
    assert.deepEqual(
      (await ledger(host)).filter((r) => r.kind === "drink").map((r) => [r.source_key, r.xp]),
      [[`drink:${c1}`, 15]],
    );
    assert.ok((await achievementsOf(host)).includes("first_drink"));
    assert.equal(await othersView(), xpBefore + 15 + 25, "the reveal moves the public number");

    // The second glass is removed before its reveal: its pour stays masked for good.
    await asOwner();
    await client.query("delete from wines where id = $1", [g2]);
    await immediate();
    assert.equal(await masked(c2), true);
    assert.ok(!keysOf(await ledger(host)).includes(`drink:${c2}`));

    // The same through draw_down_flight_cellar_lots at Start.
    await deferred();
    const t2 = await tasting(host);
    const g3 = await glass(t2, 1, wine);
    await client.query(
      "insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1, $2, $3, true)",
      [g3, host, lot],
    );
    await start(t2);
    await asUser(host);
    const drawn = await client.query("select outcome from draw_down_flight_cellar_lots($1)", [t2]);
    assert.deepEqual(drawn.rows.map((r) => r.outcome), ["drawn"]);
    await immediate();
    await asOwner();
    const c3 = (await client.query("select cellar_consumption_id as id from wine_pour_intents where wine_id = $1", [g3]))
      .rows[0].id;
    assert.equal(await masked(c3), true);
    assert.ok(!keysOf(await ledger(host)).includes(`drink:${c3}`), "nothing at Start");
    await reveal(host, g3);
    assert.ok(keysOf(await ledger(host)).includes(`drink:${c3}`), "paid at the reveal");
  });
});

// ---------------------------------------------------------------------------
// 13-15. Notes, training, friends.
// ---------------------------------------------------------------------------
test("13. notes: 20 each, five a day; TRAINING counts but pays nothing; note_countries follows Rule 1", async () => {
  await withRollback(async () => {
    const r = await refs();
    const [u, host] = await people(2);
    const wine = await catalogWine(u);
    const n1 = await note(u, { catalog_wine_id: wine.id });
    assert.deepEqual(
      (await ledger(u)).map((row) => [row.source_key, row.xp]),
      [
        [`note:${n1}`, 20],
        ["achievement:first_note", 25],
      ],
    );
    for (let i = 0; i < 5; i += 1) await note(u, { catalog_wine_id: wine.id });
    assert.equal((await ledger(u)).filter((row) => row.kind === "note").length, 5, "the sixth of the day pays nothing");

    // An unchanged re-save does no work.
    const before = await ledger(u);
    await note(u, { id: n1, catalog_wine_id: wine.id });
    assert.deepEqual(await ledger(u), before);

    // TRAINING: no note XP, still a note (first_note).
    const [t] = await people(1);
    await asOwner();
    await client.query(
      "insert into wset_notes (author_id, context_kind, tasted_on) values ($1, 'TRAINING', current_date)",
      [t],
    );
    assert.deepEqual((await ledger(t)).map((row) => row.source_key), ["achievement:first_note"]);

    // A hidden-glass BLIND note's country counts only once its glass is
    // revealed (13b pins its XP; u's notes for today are spent here).
    const spain = { country: r.spain, region: r.rioja, appellation: r.riojaApp, primary: r.tempranillo };
    const spanish = await catalogWine(host, spain);
    const tt = await tasting(host);
    const pu = await seat(tt, u);
    const g1 = await glass(tt, 1, spanish);
    await start(tt);
    await guess(g1, pu, "country", spanish);
    const countriesBefore = await metric(u, "note_countries_10");
    await note(u, { context_kind: "BLIND", tasting_wine_id: g1 });
    assert.equal(await metric(u, "note_countries_10"), countriesBefore, "an identity-less note names no country");
    await reveal(host, g1);
    assert.equal(await metric(u, "note_countries_10"), countriesBefore + 1, "counted once its glass is revealed");

    // A blind_pending wine never counts.
    const pending = await catalogWine(host, { ...spain, blindPending: true });
    const [w] = await people(1);
    await asOwner();
    await client.query(
      "insert into wset_notes (author_id, context_kind, tasted_on, catalog_wine_id) values ($1, 'OPEN', current_date, $2)",
      [w, pending.id],
    );
    assert.equal(await metric(w, "note_countries_10"), 0);
    assert.equal(await metric(w, "first_note"), 1);
  });
});

test("13b. a hidden-glass BLIND note pays 20 at its insert", async () => {
  await withRollback(async () => {
    const [u, host] = await people(2);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    await seat(t, u);
    const g1 = await glass(t, 1, wine);
    await start(t);
    const hidden = await note(u, { context_kind: "BLIND", tasting_wine_id: g1 });
    assert.deepEqual(
      (await ledger(u)).map((row) => [row.source_key, row.xp]),
      [
        [`note:${hidden}`, 20],
        ["achievement:first_note", 25],
      ],
    );
  });
});

test("14. training: a scored round pays 20 + points once, five a day; Spot on at total = possible", async () => {
  await withRollback(async () => {
    const [u] = await people(1);
    const wine = await catalogWine(u);
    const round = async ({ scored, total = 17, possible = 26 }) => {
      await asOwner();
      const noteId = (
        await client.query(
          "insert into wset_notes (author_id, context_kind, tasted_on) values ($1, 'TRAINING', current_date) returning id",
          [u],
        )
      ).rows[0].id;
      return (
        await client.query(
          `insert into training_attempts (author_id, session_key, note_id, actual_catalog_wine_id,
             total_points, possible_points, scored_at)
           values ($1, gen_random_uuid(), $2, $3, $4, $5, $6) returning id`,
          [u, noteId, scored ? wine.id : null, scored ? total : null, scored ? possible : null, scored ? new Date().toISOString() : null],
        )
      ).rows[0].id;
    };
    const a1 = await round({ scored: true });
    assert.deepEqual(
      (await ledger(u)).filter((r) => r.kind === "training").map((r) => [r.source_key, r.xp, r.units]),
      [[`training:${a1}`, 37, 17]],
    );
    assert.ok((await achievementsOf(u)).includes("first_training"));

    const a2 = await round({ scored: false });
    assert.ok(!keysOf(await ledger(u)).includes(`training:${a2}`), "an unscored round pays nothing");
    await client.query(
      "update training_attempts set actual_catalog_wine_id = $2, total_points = 26, possible_points = 26, scored_at = now() where id = $1",
      [a2, wine.id],
    );
    await client.query("update training_attempts set scored_at = now() where id = $1", [a2]);
    assert.equal((await ledger(u)).filter((r) => r.source_key === `training:${a2}`).length, 1, "scored later, paid once");
    assert.ok((await achievementsOf(u)).includes("training_ace"), "26 of 26");

    for (let i = 0; i < 4; i += 1) await round({ scored: true });
    assert.equal((await ledger(u)).filter((r) => r.kind === "training").length, 5, "the sixth round of the day pays nothing");
  });
});

test("15. friends: an accepted request gives both first_friend; the tenth friend Full table", async () => {
  await withRollback(async () => {
    const [a, b] = await people(2);
    await asUser(a);
    await client.query("select send_friend_request($1)", [b]);
    await asUser(b);
    await client.query("select accept_friend_request($1)", [a]);
    assert.ok((await achievementsOf(a)).includes("first_friend"));
    assert.ok((await achievementsOf(b)).includes("first_friend"));
    const more = await people(9);
    await asOwner();
    for (const f of more.slice(0, 8)) {
      await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [a, f]);
    }
    assert.ok(!(await achievementsOf(a)).includes("friends_10"), "nine friends");
    await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [a, more[8]]);
    assert.ok((await achievementsOf(a)).includes("friends_10"), "ten friends");
  });
});

// ---------------------------------------------------------------------------
// 16-18. RLS and the client RPCs.
// ---------------------------------------------------------------------------
test("16. RLS: levels and public achievements are readable; cellar ones follow the cellar; the ledger is the owner's", async () => {
  await withRollback(async () => {
    const [owner, friend, stranger] = await people(3);
    const wine = await catalogWine(owner);
    await addLot(owner, 1, wine); // first_bottle (cellar gate) and a ledger row
    await note(owner, { catalog_wine_id: wine.id }); // first_note (public)
    await asOwner();
    await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [owner, friend]);
    const read = async (viewer) => {
      await asUser(viewer);
      const levels = (await client.query("select xp from profile_levels where user_id = $1", [owner])).rowCount;
      const keys = (
        await client.query("select achievement_key from profile_achievements where user_id = $1 order by 1", [owner])
      ).rows.map((r) => r.achievement_key);
      const events = (await client.query("select 1 from xp_events where user_id = $1", [owner])).rowCount;
      await asOwner();
      return { levels, keys, events };
    };
    const setVisibility = (v) => client.query("update profiles set cellar_visibility = $2 where id = $1", [owner, v]);

    assert.deepEqual((await read(owner)).keys, ["first_bottle", "first_note"], "the owner sees their own");
    assert.ok((await read(owner)).events > 0);
    await setVisibility("PUBLIC");
    assert.deepEqual(await read(stranger), { levels: 1, keys: ["first_bottle", "first_note"], events: 0 });
    await setVisibility("FRIENDS");
    assert.deepEqual((await read(friend)).keys, ["first_bottle", "first_note"]);
    assert.deepEqual((await read(stranger)).keys, ["first_note"]);
    await setVisibility("PRIVATE");
    assert.deepEqual((await read(friend)).keys, ["first_note"]);
    assert.deepEqual((await read(stranger)).keys, ["first_note"]);
    assert.equal((await read(friend)).events, 0, "nobody reads another's ledger");

    await asAnon();
    await expectError(() => client.query("select 1 from profile_levels"), "42501");
    await expectError(() => client.query("select 1 from xp_events"), "42501");
    await expectError(() => client.query("select public.get_my_level_state()"), "42501");
    await asOwner();
  });
});

test("17. mark_xp_seen marks only the caller's ids, idempotently, and clears the welcome", async () => {
  await withRollback(async () => {
    const [a, b] = await people(2);
    const wine = await catalogWine(a);
    await note(a, { catalog_wine_id: wine.id });
    await note(b, { catalog_wine_id: wine.id });
    await asOwner();
    const idsOf = async (u) =>
      (await client.query("select id from xp_events where user_id = $1 order by id", [u])).rows.map((r) => Number(r.id));
    const aIds = await idsOf(a);
    const bIds = await idsOf(b);
    await client.query("update profile_levels set welcome_pending = true where user_id = $1", [a]);
    await asUser(a);
    await client.query("select mark_xp_seen($1::bigint[], true)", [[aIds[0], bIds[0]]]);
    await client.query("select mark_xp_seen($1::bigint[], true)", [[aIds[0], bIds[0]]]);
    await asOwner();
    const seen = async (id) => (await client.query("select seen_at from xp_events where id = $1", [id])).rows[0].seen_at;
    assert.ok(await seen(aIds[0]), "the caller's own row");
    assert.equal(await seen(aIds[1]), null, "an id not passed stays unseen");
    assert.equal(await seen(bIds[0]), null, "someone else's id is ignored");
    assert.equal(
      (await client.query("select welcome_pending from profile_levels where user_id = $1", [a])).rows[0].welcome_pending,
      false,
    );
    await asUser(null);
    await expectError(() => client.query("select mark_xp_seen('{}'::bigint[], false)"), "42501");
    await asUser(a);
    await expectError(
      () => client.query("select mark_xp_seen($1::bigint[], false)", [Array.from({ length: 101 }, (_, i) => i + 1)]),
      "22023",
    );
    await asOwner();
  });
});

test("18. get_my_level_state: the shape, the defaults, the oldest 50 unseen", async () => {
  await withRollback(async () => {
    const [fresh, busy] = await people(2);
    await asUser(fresh);
    const empty = (await client.query("select get_my_level_state() as s")).rows[0].s;
    assert.deepEqual(
      { ...empty, checked_at: typeof empty.checked_at },
      { xp: 0, level: 1, welcome: false, unseen: [], checked_at: "string" },
    );
    assert.match(empty.checked_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

    await asOwner();
    await client.query(
      `insert into xp_events (user_id, kind, source_key, xp, xp_after, day)
       select $1, 'note', 'test:' || n, 1, n, current_date from generate_series(1, 55) n`,
      [busy],
    );
    const ids = (await client.query("select id from xp_events where user_id = $1 order by id", [busy])).rows.map((r) =>
      Number(r.id),
    );
    await asUser(busy);
    const s = (await client.query("select get_my_level_state() as s")).rows[0].s;
    assert.equal(s.unseen.length, 50);
    assert.deepEqual(
      s.unseen.map((e) => e.id),
      ids.slice(0, 50),
    );
    assert.deepEqual(Object.keys(s.unseen[0]).sort(), ["achievement", "created_at", "id", "kind", "units", "xp", "xp_after"]);
    await asOwner();
  });
});

// ---------------------------------------------------------------------------
// 19. Account deletion (L27).
// ---------------------------------------------------------------------------
test("19. deletion drops the person's levels; later reveals pay them nothing; a scrub-closed tasting pays its guests", async () => {
  await withRollback(async () => {
    const [gone, host, guest] = await people(3);
    const wine = await catalogWine(host);
    // gone plays in host's running tasting; their JOINED seat stays (step 5).
    const t1 = await tasting(host);
    const pGone = await seat(t1, gone);
    const g1 = await glass(t1, 1, wine);
    const g2 = await glass(t1, 2, wine);
    await start(t1);
    await guess(g1, pGone, "country", wine);
    await guess(g2, pGone, "country", wine);
    await reveal(host, g1);
    // gone hosts a started tasting with a revealed glass and a playing guest.
    const t2 = await tasting(gone);
    const pGuest = await seat(t2, guest);
    const g3 = await glass(t2, 1, wine);
    await start(t2);
    await guess(g3, pGuest, "country", wine);
    await reveal(gone, g3);
    assert.ok((await ledger(gone)).length > 0);

    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [gone]);
    assert.deepEqual(await ledger(gone), []);
    assert.deepEqual(await achievementsOf(gone), []);
    assert.equal((await client.query("select 1 from profile_levels where user_id = $1", [gone])).rowCount, 0);
    assert.ok(keysOf(await ledger(guest)).includes(`finish:${t2}`), "the scrub's close paid the guest");

    await reveal(host, g2);
    assert.deepEqual(await ledger(gone), [], "a later reveal pays a deleted account nothing");
  });
});

// ---------------------------------------------------------------------------
// 20. Error isolation (L20): an award that fails never fails its write.
// ---------------------------------------------------------------------------
test("20. a failing award is a WARNING; the reveal, the drink and the note still succeed", async () => {
  await withRollback(async () => {
    const [host, poisoned, fine] = await people(3);
    const wine = await catalogWine(host);
    // A total at integer max: any further award overflows inside xp_award.
    await asOwner();
    await client.query(
      "insert into profile_levels (user_id, xp, level) values ($1, 2147483647, 60)",
      [poisoned],
    );
    const t = await tasting(host);
    const pp = await seat(t, poisoned);
    const pf = await seat(t, fine);
    const g1 = await glass(t, 1, wine);
    await start(t);
    await guess(g1, pp, "country", wine);
    const gf = await guess(g1, pf, "country", wine);
    await reveal(host, g1);
    assert.equal((await client.query("select is_revealed from wines where id = $1", [g1])).rows[0].is_revealed, true);
    assert.deepEqual(await ledger(poisoned), []);
    assert.ok(keysOf(await ledger(fine)).includes(`guess:${gf}`), "one person's failure costs the others nothing");
    assert.ok(warnings.some((w) => w.startsWith("xp_on_glass_revealed")), warnings.join(" | "));

    const lot = (
      await client.query(
        `insert into cellar_lots (owner_id, catalog_wine_id, bottle_size_ml, quantity, purchased_quantity, currency)
         values ($1, $2, 750, 3, 3, 'DKK') returning id`,
        [poisoned, wine.id],
      )
    ).rows[0].id;
    warnings.length = 0;
    const c = await consume(poisoned, lot, 1);
    await immediate();
    assert.ok(c);
    assert.ok(warnings.some((w) => w.startsWith("xp_on_cellar_consumption")), warnings.join(" | "));
    warnings.length = 0;
    const n = await note(poisoned, { catalog_wine_id: wine.id });
    assert.ok(n);
    assert.ok(warnings.some((w) => w.startsWith("xp_on_wset_note")), warnings.join(" | "));
    assert.deepEqual(await ledger(poisoned), []);
  });
});

// ---------------------------------------------------------------------------
// 21. Replay parity (L19).
// ---------------------------------------------------------------------------
test("21. xp_replay_user rebuilds exactly what the live triggers paid", async () => {
  await withRollback(async () => {
    const [u, host, friend] = await people(3);
    const wine = await catalogWine(u);
    const lot = await addLot(u, 5, wine);
    await consume(u, lot, 1);
    await immediate();
    await note(u, { catalog_wine_id: wine.id });
    await asOwner();
    await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [u, friend]);
    const t = await tasting(host);
    const pu = await seat(t, u);
    const g1 = await glass(t, 1, wine);
    await start(t);
    await guess(g1, pu, "exact", wine);
    await reveal(host, g1);
    await close(t);

    const snapshot = async () =>
      (await ledger(u))
        .map((r) => `${r.source_key}=${r.xp}`)
        .sort();
    const live = await snapshot();
    const liveTotal = (await xpOf(u)).xp;
    assert.ok(live.length >= 8, live.join(", "));

    await asOwner();
    await client.query("delete from xp_events where user_id = $1", [u]);
    await client.query("delete from profile_achievements where user_id = $1", [u]);
    await client.query("update profile_levels set xp = 0, level = 1 where user_id = $1", [u]);
    const added = (await client.query("select public.xp_replay_user($1, true, false) as n", [u])).rows[0].n;
    assert.deepEqual(await snapshot(), live);
    assert.equal(added, liveTotal);
    assert.equal((await xpOf(u)).xp, liveTotal);
    // Idempotent: a second run adds nothing.
    assert.equal((await client.query("select public.xp_replay_user($1, false, false) as n", [u])).rows[0].n, 0);
  });
});

// ---------------------------------------------------------------------------
// 22. Timing (logged, not asserted — the pooler round trip dominates).
// ---------------------------------------------------------------------------
test("22. an 8-guesser reveal's duration", async () => {
  await withRollback(async () => {
    const [host, ...guessers] = await people(9);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    const g1 = await glass(t, 1, wine);
    const seats = [];
    for (const g of guessers) seats.push(await seat(t, g));
    await start(t);
    for (const p of seats) await guess(g1, p, "country", wine);
    await asUser(host);
    const t0 = process.hrtime.bigint();
    await client.query("select reveal_wine($1)", [g1]);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    await asOwner();
    console.log(`# 8-guesser reveal: ${ms.toFixed(1)} ms (round trip included)`);
    assert.equal((await client.query("select count(*)::int as n from xp_events where kind = 'guess' and user_id = any($1)", [guessers])).rows[0].n, 8);
  });
});
