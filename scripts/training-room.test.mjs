// Training room DB suite (spec docs/superpowers/specs/2026-09-25-training-room-design.md
// §10): the TRAINING branch of wset_notes_one_identity, record_training_attempt
// (fresh attempts, re-reveals, the championship points, D17's style verdict,
// the hue rule, idempotency, refusals and grants), training_attempts' RLS and
// grants, the account-deletion scrub and the 15-row archetype back-fill of
// 20260925120000_training_room.sql; and the region pick of
// 20260927100000_training_region_guess.sql (region-guess addendum §3: its
// scoring, checks, columns and re-reveal).
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles, catalog wines and archetypes created
// inside that transaction: no real person's row decides a result or is written.
//
//   node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout \
//     scripts/training-room.test.mjs
//
// Dry run before a migration is live: TRAINING_ROOM_APPLY lists migration
// files (comma-separated, in order) that each test applies inside its own
// rolled-back transaction first, e.g.
//   TRAINING_ROOM_APPLY=supabase/migrations/20260927100000_training_region_guess.sql \
//     node --env-file=.env.local --test scripts/training-room.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const APPLY = (process.env.TRAINING_ROOM_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);
const RPC_SIG = "public.record_training_attempt(jsonb,jsonb,jsonb)";

const client = new pg.Client(pgConfig());
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

// Throwaway people that exist only inside the current transaction.
async function freshProfiles(n) {
  await asOwner();
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'training-room-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`Training room test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

// Runs `fn` inside a savepoint that is always rolled back, and checks it failed
// with `code` (and `message`, when given).
async function expectError(fn, code, message) {
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
  if (message !== undefined) assert.equal(error.message, message);
}

// Live reference ids by exact name (owner role).
async function refs() {
  await asOwner();
  const one = async (what, sql, params) => {
    const r = await client.query(sql, params);
    assert.equal(r.rowCount, 1, `${what} should be exactly one live row`);
    return r.rows[0].id;
  };
  const appellation = (region, name) =>
    one(
      `${region} / ${name}`,
      `select a.id from appellations a join regions r on r.id = a.region_id
         join countries c on c.id = r.country_id
        where c.name = 'France' and r.name = $1 and a.name = $2`,
      [region, name],
    );
  const byName = (table, name) => one(`${table} ${name}`, `select id from ${table} where name = $1`, [name]);
  const region = (country, name) =>
    one(
      `${country} / ${name}`,
      "select r.id from regions r join countries c on c.id = r.country_id where c.name = $1 and r.name = $2",
      [country, name],
    );
  return {
    france: await byName("countries", "France"),
    spain: await byName("countries", "Spain"),
    bordeaux: await region("France", "Bordeaux"),
    bourgogne: await region("France", "Bourgogne"),
    rioja: await region("Spain", "Rioja"),
    margauxAoc: await appellation("Bordeaux", "Margaux AOC"),
    vosneAoc: await appellation("Bourgogne", "Vosne-Romanée AOC"),
    chablisAoc: await appellation("Bourgogne", "Chablis AOC"),
    cabernet: await byName("grapes", "Cabernet Sauvignon"),
    merlot: await byName("grapes", "Merlot"),
    cabFranc: await byName("grapes", "Cabernet Franc"),
    pinotNoir: await byName("grapes", "Pinot Noir"),
    chardonnay: await byName("grapes", "Chardonnay"),
    tempranillo: await byName("grapes", "Tempranillo"),
    grenache: await byName("grapes", "Grenache"),
    grandCruClasse: await byName("type_designations", "Grand Cru Classé"),
    reserva: await byName("type_designations", "Reserva"),
    granReserva: await byName("type_designations", "Gran Reserva"),
    crianza: await byName("type_designations", "Crianza"),
    margaux: await byName("wine_archetypes", "A typical Margaux"),
    coteDeNuits: await byName("wine_archetypes", "A typical Côte de Nuits"),
    vosne: await byName("wine_archetypes", "A typical Vosne-Romanée"),
    producer: (await client.query("select id from producers order by id limit 1")).rows[0].id,
    term: (await client.query("select id from wset_aroma_terms where group_name = 'Black fruit' and term = 'blackcurrant'"))
      .rows[0].id,
  };
}

// A catalog wine written by the owner inside the transaction; a fresh wine
// name keeps it clear of catalog_wines_identity_key.
async function wine(createdBy, f) {
  await asOwner();
  const w = {
    secondary: null,
    designation: null,
    vintageKind: "YEAR",
    vintageYear: 2015,
    tawnyYears: null,
    colour: "RED",
    style: "STILL",
    ...f,
  };
  const r = await client.query(
    `insert into catalog_wines
       (country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id,
        type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, colour, style,
        wine_name, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             'Training room test ' || gen_random_uuid()::text, $13)
     returning id`,
    [
      w.country,
      w.region,
      w.appellation,
      w.primary,
      w.secondary,
      w.producer,
      w.designation,
      w.vintageKind,
      w.vintageYear,
      w.tawnyYears,
      w.colour,
      w.style,
      createdBy,
    ],
  );
  return r.rows[0].id;
}

// The RPC as the current role.
async function record(note, aromas, attempt) {
  const r = await client.query("select public.record_training_attempt($1::jsonb, $2::jsonb, $3::jsonb) as r", [
    JSON.stringify(note),
    JSON.stringify(aromas),
    JSON.stringify(attempt),
  ]);
  return r.rows[0].r;
}

// A fresh session for `who`: a new session key and started-at unless given.
async function fresh(who, { note = { colour_hue: "RUBY", sweetness: "DRY" }, aromas = [], ...attempt } = {}) {
  await asUser(who);
  return record(note, aromas, {
    session_key: randomUUID(),
    started_at: "2026-09-25T18:14:00Z",
    candidates_snapshot: [],
    ...attempt,
  });
}

const margauxBottle = (r, extra = {}) => ({
  country: r.france,
  region: r.bordeaux,
  appellation: r.margauxAoc,
  primary: r.cabernet,
  secondary: r.merlot,
  producer: r.producer,
  ...extra,
});

async function attemptRow(id) {
  await asOwner();
  return (await client.query("select * from training_attempts where id = $1", [id])).rows[0];
}
async function noteRow(id) {
  await asOwner();
  return (await client.query("select * from wset_notes where id = $1", [id])).rows[0];
}

test("the one-identity constraint admits a TRAINING note without a glass and still refuses OPEN", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const note = (
      await client.query("insert into wset_notes (author_id, context_kind) values ($1, 'TRAINING') returning id", [a])
    ).rows[0].id;
    await expectError(
      () => client.query("insert into wset_notes (author_id, context_kind) values ($1, 'OPEN')", [a]),
      "23514",
    );
    await expectError(
      () => client.query("insert into wset_notes (author_id, context_kind) values ($1, 'BLIND')", [a]),
      "23514",
    );
    const seen = async (who) => {
      await asUser(who);
      return (await client.query("select count(*)::int n from wset_notes where id = $1", [note])).rows[0].n;
    };
    assert.equal(await seen(a), 1, "its author reads it");
    assert.equal(await seen(b), 0, "nobody else does");
  });
});

test("a fresh attempt writes a TRAINING note and scores a known pair with the championship table", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const snapshot = [{ archetypeId: r.margaux, name: "A typical Margaux", closeness: 91, rank: 1, capped: null }];
    const out = await fresh(a, {
      aromas: [{ term_id: r.term, sensed_on_nose: true, sensed_on_palate: false }],
      started_at: "2026-09-24T23:30:00-02:00",
      picked_archetype_id: r.margaux,
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2015,
      actual_catalog_wine_id: w,
      candidates_snapshot: snapshot,
    });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 5,
      primary_grape: 8,
      secondary_grape: 2,
      type_designation: null,
      vintage: 2,
    });
    assert.equal(out.total, 22);
    assert.equal(out.possible, 22);
    assert.equal(out.hue_cleared, false);
    assert.equal(out.actual_archetype_id, r.margaux);

    const n = await noteRow(out.note_id);
    assert.equal(n.author_id, a);
    assert.equal(n.context_kind, "TRAINING");
    assert.equal(n.catalog_wine_id, w);
    assert.equal(n.tasting_wine_id, null);
    assert.equal(n.unidentified_wine_id, null);
    assert.equal(n.colour_hue, "RUBY");
    const tasted = (await client.query("select tasted_on::text d from wset_notes where id = $1", [out.note_id])).rows[0].d;
    assert.equal(tasted, "2026-09-25", "tasted_on is the UTC date of started_at");
    const aromaRows = (await client.query("select term_id, sensed_on_nose from wset_note_aromas where note_id = $1", [out.note_id]))
      .rows;
    assert.deepEqual(aromaRows, [{ term_id: r.term, sensed_on_nose: true }]);

    const row = await attemptRow(out.attempt_id);
    assert.equal(row.author_id, a);
    assert.equal(row.note_id, out.note_id);
    assert.equal(row.picked_archetype_id, r.margaux);
    assert.equal(row.guessed_vintage_kind, "YEAR");
    assert.equal(row.guessed_vintage_year, 2015);
    assert.equal(row.actual_catalog_wine_id, w);
    assert.equal(row.note_colour_hue, "RUBY");
    assert.deepEqual(row.candidates_snapshot, snapshot);
    assert.ok(row.scored_at);
  });
});

test("a regional pick against a village wine earns the region (3), not the appellation (5)", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, {
      country: r.france,
      region: r.bourgogne,
      appellation: r.vosneAoc,
      primary: r.pinotNoir,
      producer: r.producer,
    });
    const out = await fresh(a, { picked_archetype_id: r.coteDeNuits, actual_catalog_wine_id: w });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 8,
      secondary_grape: null,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 13);
    assert.equal(out.possible, 18);
    assert.equal(out.actual_archetype_id, r.vosne, "the bottle's own style is the Vosne-Romanée archetype");
  });
});

test("vintage: exact 2, one year off 1, otherwise 0; NV and tawny score exact only; no guess is null", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const base = { country: r.france, region: r.bordeaux, appellation: r.margauxAoc, primary: r.cabernet, producer: r.producer };
    const y2015 = await wine(a, base);
    const nv = await wine(a, { ...base, vintageKind: "NV", vintageYear: null });
    const tawny = await wine(a, { ...base, vintageKind: "TAWNY", vintageYear: null, tawnyYears: 20, style: "FORTIFIED" });
    const cases = [
      [y2015, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2015 }, 2],
      [y2015, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2014 }, 1],
      [y2015, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2016 }, 1],
      [y2015, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2013 }, 0],
      [y2015, { guessed_vintage_kind: "NV" }, 0],
      [nv, { guessed_vintage_kind: "NV" }, 2],
      [nv, { guessed_vintage_kind: "YEAR", guessed_vintage_year: 2015 }, 0],
      [tawny, { guessed_vintage_kind: "TAWNY", guessed_vintage_tawny_years: 20 }, 2],
      [tawny, { guessed_vintage_kind: "TAWNY", guessed_vintage_tawny_years: 10 }, 0],
      [y2015, {}, null],
    ];
    for (const [w, guess, points] of cases) {
      const out = await fresh(a, { actual_catalog_wine_id: w, ...guess });
      assert.equal(out.points.vintage, points, JSON.stringify(guess));
      assert.equal(out.possible, points === null ? 18 : 20, `possible for ${JSON.stringify(guess)}`);
    }
  });
});

test("second grape and designation: null when the wine has none, 0 when missed, full when hit", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    // The pick starts with no designation, whatever the live Margaux carries
    // (the 2026-09-28 audit gave it Grand Cru Classé).
    await asOwner();
    await client.query("delete from wine_archetype_designations where archetype_id = $1", [r.margaux]);
    const gcc = await wine(a, margauxBottle(r, { designation: r.grandCruClasse }));
    let out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: gcc });
    assert.equal(out.points.secondary_grape, 2);
    assert.equal(out.points.type_designation, 0, "the pick carries no designation yet");
    assert.equal(out.total, 20);
    assert.equal(out.possible, 22);

    await asOwner();
    await client.query(
      "insert into wine_archetype_designations (archetype_id, type_designation_id) values ($1, $2)",
      [r.margaux, r.grandCruClasse],
    );
    out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: gcc });
    assert.equal(out.points.type_designation, 2);
    assert.equal(out.total, 22);

    const plain = await wine(a, margauxBottle(r, { secondary: null }));
    out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: plain });
    assert.equal(out.points.secondary_grape, null);
    assert.equal(out.points.type_designation, null);
    assert.equal(out.possible, 18);

    const franc = await wine(a, margauxBottle(r, { secondary: r.cabFranc }));
    out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: franc });
    assert.equal(out.points.secondary_grape, 0);
  });
});

test("no pick scores 0 on every category that applies", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const out = await fresh(a, { picked_archetype_id: null, actual_catalog_wine_id: w });
    assert.deepEqual(out.points, {
      country: 0,
      region: 0,
      appellation: 0,
      primary_grape: 0,
      secondary_grape: 0,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 0);
    assert.equal(out.possible, 20);
  });
});

test("the same session key twice returns the first attempt and writes nothing more", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const key = randomUUID();
    const first = await fresh(a, { session_key: key, picked_archetype_id: r.margaux, actual_catalog_wine_id: w });
    const second = await fresh(a, { session_key: key, picked_archetype_id: r.coteDeNuits, actual_catalog_wine_id: null });
    assert.deepEqual(second, first);
    await asOwner();
    const counts = (
      await client.query(
        `select (select count(*)::int from training_attempts where author_id = $1) attempts,
                (select count(*)::int from wset_notes where author_id = $1) notes`,
        [a],
      )
    ).rows[0];
    assert.deepEqual(counts, { attempts: 1, notes: 1 });
  });
});

test("a hue that does not fit the revealed wine is dropped from the note and kept on the attempt", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const white = await wine(a, {
      country: r.france,
      region: r.bourgogne,
      appellation: r.chablisAoc,
      primary: r.chardonnay,
      producer: r.producer,
      colour: "WHITE",
    });
    const out = await fresh(a, { note: { colour_hue: "RUBY" }, actual_catalog_wine_id: white });
    assert.equal(out.hue_cleared, true);
    assert.equal((await noteRow(out.note_id)).colour_hue, null);
    const row = await attemptRow(out.attempt_id);
    assert.equal(row.note_colour_hue, "RUBY");
    assert.equal(row.hue_cleared, true);

    const kept = await fresh(a, { note: { colour_hue: "LEMON" }, actual_catalog_wine_id: white });
    assert.equal(kept.hue_cleared, false);
    assert.equal((await noteRow(kept.note_id)).colour_hue, "LEMON");
  });
});

test("an unrevealed attempt, then Reveal now: only the note's identity and the score are written", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const r = await refs();
    const unrevealed = await fresh(a, {
      note: { colour_hue: "RUBY" },
      picked_archetype_id: r.margaux,
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2014,
      candidates_snapshot: [{ archetypeId: r.margaux, name: "A typical Margaux", closeness: 80, rank: 1, capped: null }],
    });
    assert.deepEqual(unrevealed.points, {
      country: null,
      region: null,
      appellation: null,
      primary_grape: null,
      secondary_grape: null,
      type_designation: null,
      vintage: null,
    });
    assert.equal(unrevealed.total, null);
    assert.equal(unrevealed.possible, null);
    const before = await noteRow(unrevealed.note_id);
    assert.equal(before.catalog_wine_id, null);
    assert.equal(before.context_kind, "TRAINING");

    // Someone else's note, whose id a crafted payload names.
    const other = await fresh(b, { note: { colour_hue: "GARNET" } });
    const w = await wine(a, margauxBottle(r));
    await asUser(a);
    const out = await record(
      { id: other.note_id, colour_hue: "PURPLE", sweetness: "LUSCIOUS" },
      [{ term_id: r.term, sensed_on_nose: true, sensed_on_palate: true }],
      {
        attempt_id: unrevealed.attempt_id,
        actual_catalog_wine_id: w,
        picked_archetype_id: r.coteDeNuits,
        guessed_vintage_kind: "NV",
        candidates_snapshot: [],
      },
    );
    assert.equal(out.attempt_id, unrevealed.attempt_id);
    assert.equal(out.points.appellation, 5, "scored with the stored pick, not the payload's");
    assert.equal(out.points.vintage, 1, "scored with the stored vintage (2014 vs 2015)");
    assert.equal(out.total, 21);
    const row = await attemptRow(unrevealed.attempt_id);
    assert.equal(row.picked_archetype_id, r.margaux);
    assert.equal(row.candidates_snapshot.length, 1, "the stored ranking is kept");
    const after = await noteRow(unrevealed.note_id);
    assert.equal(after.catalog_wine_id, w);
    assert.equal(after.colour_hue, "RUBY");
    assert.equal(after.sweetness, null, "the payload's note fields are ignored");
    assert.equal((await noteRow(other.note_id)).colour_hue, "GARNET", "the foreign note is untouched");
  });
});

test("Reveal now refuses another person's attempt and an attempt already revealed; nothing is written", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const unrevealed = await fresh(a, {});
    await asUser(b);
    await expectError(
      () => record({}, [], { attempt_id: unrevealed.attempt_id, actual_catalog_wine_id: w }),
      "42501",
      "that session is not yours",
    );
    assert.equal((await attemptRow(unrevealed.attempt_id)).scored_at, null);
    assert.equal((await noteRow(unrevealed.note_id)).catalog_wine_id, null);

    await asUser(a);
    await record({}, [], { attempt_id: unrevealed.attempt_id, actual_catalog_wine_id: w });
    await asUser(a);
    await expectError(
      () => record({}, [], { attempt_id: unrevealed.attempt_id, actual_catalog_wine_id: w }),
      "P0001",
      "already revealed",
    );

    // A hue that does not fit is cleared on a re-reveal too.
    const white = await wine(a, {
      country: r.france,
      region: r.bourgogne,
      appellation: r.chablisAoc,
      primary: r.chardonnay,
      producer: r.producer,
      colour: "WHITE",
    });
    const ruby = await fresh(a, { note: { colour_hue: "RUBY" } });
    await asUser(a);
    const out = await record({}, [], { attempt_id: ruby.attempt_id, actual_catalog_wine_id: white });
    assert.equal(out.hue_cleared, true);
    assert.equal((await noteRow(ruby.note_id)).colour_hue, null);
    assert.equal((await attemptRow(ruby.attempt_id)).note_colour_hue, "RUBY");
  });
});

test("refusals: no user, a fresh note id, and no EXECUTE for anon, service_role or PUBLIC", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(null);
    await expectError(() => record({}, [], { session_key: randomUUID() }), "42501", "not signed in");
    const theirs = await fresh(b, {});
    await asUser(a);
    await expectError(
      () => record({ id: theirs.note_id }, [], { session_key: randomUUID() }),
      "42501",
      "a new session takes no note id",
    );
    await asOwner();
    const grants = (
      await client.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('service_role', $1, 'EXECUTE') as service,
                has_function_privilege('authenticated', $1, 'EXECUTE') as authed,
                exists (select 1 from pg_proc p, aclexplode(p.proacl) x
                         where p.oid = to_regprocedure($1) and x.grantee = 0) as public`,
        [RPC_SIG],
      )
    ).rows[0];
    assert.deepEqual(grants, { anon: false, service: false, authed: true, public: false });
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await client.query("set local role anon");
    await expectError(() => record({}, [], { session_key: randomUUID() }), "42501");
  });
});

test("training_attempts: the author reads their own rows and no client writes any", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const out = await fresh(a, {});
    const seen = async (who) => {
      await asUser(who);
      return (await client.query("select count(*)::int n from training_attempts where id = $1", [out.attempt_id])).rows[0]
        .n;
    };
    assert.equal(await seen(a), 1);
    assert.equal(await seen(b), 0);
    await asUser(a);
    await expectError(
      () =>
        client.query("insert into training_attempts (author_id, session_key, note_id) values ($1, $2, $3)", [
          a,
          randomUUID(),
          out.note_id,
        ]),
      "42501",
    );
    await expectError(() => client.query("update training_attempts set total_points = 99 where author_id = $1", [a]), "42501");
    await expectError(() => client.query("delete from training_attempts where author_id = $1", [a]), "42501");
    await asUser(null);
    await client.query("set local role anon");
    await expectError(() => client.query("select 1 from training_attempts"), "42501");
  });
});

test("the seven maxima equal reveal_wine's constants", async () => {
  await withRollback(async () => {
    await asOwner();
    const def = async (sig) =>
      (await client.query("select pg_get_functiondef(to_regprocedure($1)) d", [sig])).rows[0].d;
    const reveal = await def("public.reveal_wine(uuid)");
    const training = await def(RPC_SIG);
    const pick = (text, re, what) => {
      const m = text.match(re);
      assert.ok(m, `${what} not found`);
      return Number(m[1]);
    };
    const fromReveal = {
      country: pick(reveal, /country_points\s*=\s*case\s+when\s+g\.country_id\s*=\s*v_answer\.country_id\s+then\s+(\d+)/, "country"),
      region: pick(reveal, /region_points\s*=\s*case\s+when\s+g\.region_id\s*=\s*v_answer\.region_id\s+then\s+(\d+)/, "region"),
      appellation: pick(reveal, /when\s+g\.appellation_id\s*=\s*v_answer\.appellation_id\s+then\s+(\d+)/, "appellation"),
      primaryGrape: pick(
        reveal,
        /primary_grape_points\s*=\s*case\s+when\s+g\.primary_grape_id\s*=\s*v_answer\.primary_grape_id\s+then\s+(\d+)/,
        "primary grape",
      ),
      secondaryGrape: pick(reveal, /when\s+g\.secondary_grape_id\s*=\s*v_answer\.secondary_grape_id\s+then\s+(\d+)/, "secondary"),
      typeDesignation: pick(reveal, /when\s+g\.type_designation_id\s*=\s*v_answer\.type_designation_id\s+then\s+(\d+)/, "designation"),
      vintage: pick(reveal, /and\s+g\.vintage_year\s*=\s*v_answer\.vintage_year\s+then\s+(\d+)/, "vintage"),
      vintageNear: pick(reveal, /abs\(g\.vintage_year\s*-\s*v_answer\.vintage_year\)\s*=\s*1\s+then\s+(\d+)/, "vintage near"),
    };
    const constant = (name) => pick(training, new RegExp(`${name}\\s+constant\\s+smallint\\s*:=\\s*(\\d+);`), name);
    const fromTraining = {
      country: constant("c_country"),
      region: constant("c_region"),
      appellation: constant("c_appellation"),
      primaryGrape: constant("c_primary_grape"),
      secondaryGrape: constant("c_secondary_grape"),
      typeDesignation: constant("c_type_designation"),
      vintage: constant("c_vintage"),
      vintageNear: constant("c_vintage_near"),
    };
    assert.deepEqual(fromTraining, fromReveal);
    assert.deepEqual(fromTraining, {
      country: 2,
      region: 3,
      appellation: 5,
      primaryGrape: 8,
      secondaryGrape: 2,
      typeDesignation: 2,
      vintage: 2,
      vintageNear: 1,
    });
  });
});

test("D17: the bottle's own style, with ties broken by designation, pick, second grape, sort order", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    await asOwner();
    const region = (
      await client.query("insert into regions (country_id, name) values ($1, $2) returning id", [
        r.spain,
        `Training test region ${randomUUID()}`,
      ])
    ).rows[0].id;
    const appellation = async (name) =>
      (await client.query("insert into appellations (region_id, name) values ($1, $2) returning id", [region, name]))
        .rows[0].id;
    const doca = await appellation("Training test DOCa");
    const other = await appellation("Training test other DO");
    const archetype = async (name, { at = doca, secondary = null, sort, designation = null }) => {
      const id = (
        await client.query(
          `insert into wine_archetypes
             (name, colour, style, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, sort_order)
           values ($1, 'RED', 'STILL', $2, $3, $4, $5, $6, $7) returning id`,
          [name, r.spain, region, at, r.tempranillo, secondary, sort],
        )
      ).rows[0].id;
      if (designation) {
        await client.query(
          "insert into wine_archetype_designations (archetype_id, type_designation_id) values ($1, $2)",
          [id, designation],
        );
      }
      return id;
    };
    const reserva = await archetype("A typical test Reserva", { sort: 1, designation: r.reserva });
    const granReserva = await archetype("A typical test Gran Reserva", { sort: 2, designation: r.granReserva });
    const blend = await archetype("A typical test blend", { sort: 3, secondary: r.grenache });
    const neighbour = await archetype("A typical test neighbour", { at: other, sort: 99 });
    const bottle = (extra) =>
      wine(a, { country: r.spain, region, appellation: doca, primary: r.tempranillo, producer: r.producer, ...extra });
    const actual = async (w, pick = null) =>
      (await fresh(a, { picked_archetype_id: pick, actual_catalog_wine_id: w })).actual_archetype_id;

    assert.equal(await actual(await bottle({ designation: r.granReserva })), granReserva, "designation first");
    assert.equal(await actual(await bottle({ designation: r.crianza }), reserva), reserva, "then the pick");
    assert.equal(await actual(await bottle({ designation: r.crianza }), granReserva), granReserva, "the pick, either way");
    assert.equal(await actual(await bottle({ designation: r.crianza, secondary: r.grenache })), blend, "then the second grape");
    assert.equal(await actual(await bottle({ designation: r.crianza })), reserva, "then sort order");
    assert.equal(
      await actual(await bottle({ appellation: other, designation: r.granReserva })),
      neighbour,
      "the same appellation beats a region-and-grape match",
    );
    assert.equal(await actual(await bottle({ style: "SPARKLING" })), null, "no archetype of that style: none");
  });
});

test("account deletion removes the person's attempts; deleting a note removes its attempt", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await fresh(a, {});
    await fresh(a, {});
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [a]);
    const left = (await client.query("select count(*)::int n from training_attempts where author_id = $1", [a])).rows[0].n;
    assert.equal(left, 0);

    const out = await fresh(b, {});
    await asUser(b);
    await client.query("delete from wset_notes where id = $1", [out.note_id]);
    assert.equal(await attemptRow(out.attempt_id), undefined, "the attempt goes with its note");
  });
});

test("the 15 live archetypes are back-filled by live name and every archetype names a grape", async () => {
  await withRollback(async () => {
    await asOwner();
    const missing = (
      await client.query(
        `select count(*)::int n from wine_archetypes
          where country_id is null or region_id is null or appellation_id is null or primary_grape_id is null`,
      )
    ).rows[0].n;
    assert.equal(missing, 0);
    const rows = (
      await client.query(
        `select a.name, c.name country, r.name region, ap.name appellation
           from wine_archetypes a
           join countries c on c.id = a.country_id
           join regions r on r.id = a.region_id
           join appellations ap on ap.id = a.appellation_id
          where a.name = any($1::text[])
          order by a.name collate "C"`,
        [
          [
            "A typical Alsace Riesling",
            "A typical Bandol",
            "A typical Chablis",
            "A typical Champagne",
            "A typical Châteauneuf-du-Pape",
            "A typical Côte Chalonnaise",
            "A typical Côte de Beaune",
            "A typical Côte de Nuits",
            "A typical Côte-Rôtie",
            "A typical Margaux",
            "A typical Mâconnais",
            "A typical Petit Chablis",
            "A typical Sancerre",
            "A typical Sauternes",
            "A typical Vosne-Romanée",
          ],
        ],
      )
    ).rows.map((x) => `${x.name} -> ${x.country} / ${x.region} / ${x.appellation}`);
    assert.deepEqual(rows, [
      "A typical Alsace Riesling -> France / Alsace / Alsace AOC",
      "A typical Bandol -> France / Provence / Bandol AOC",
      "A typical Chablis -> France / Bourgogne / Chablis AOC",
      "A typical Champagne -> France / Champagne / Champagne AOC",
      "A typical Châteauneuf-du-Pape -> France / Rhône / Châteauneuf-du-Pape AOC",
      "A typical Côte Chalonnaise -> France / Bourgogne / Cote Chalonnaise AOC",
      "A typical Côte de Beaune -> France / Bourgogne / Bourgogne AOC",
      "A typical Côte de Nuits -> France / Bourgogne / Bourgogne AOC",
      "A typical Côte-Rôtie -> France / Rhône / Côte-Rôtie AOC",
      "A typical Margaux -> France / Bordeaux / Margaux AOC",
      "A typical Mâconnais -> France / Bourgogne / Macon-Villages AOC",
      "A typical Petit Chablis -> France / Bourgogne / Petit Chablis AOC",
      "A typical Sancerre -> France / Loire / Sancerre AOC",
      "A typical Sauternes -> France / Bordeaux / Sauternes AOC",
      "A typical Vosne-Romanée -> France / Bourgogne / Vosne-Romanée AOC",
    ]);
    const sauternes = (
      await client.query(
        `select g1.name p, g2.name s from wine_archetypes a
           join grapes g1 on g1.id = a.primary_grape_id join grapes g2 on g2.id = a.secondary_grape_id
          where a.name = 'A typical Sauternes'`,
      )
    ).rows[0];
    assert.deepEqual(sauternes, { p: "Semillon", s: "Sauvignon Blanc" });
  });
});

test("the batch-1 migration lands every archetype with its links, and a second apply is a no-op", async (t) => {
  const file = "supabase/migrations/20260925130000_archetypes_batch_1.sql";
  await withRollback(async () => {
    await asOwner();
    const ready = (await client.query("select to_regclass('public.wine_archetype_designations') is not null as ok")).rows[0]
      .ok;
    if (!ready) {
      t.skip("20260925120000 is neither live nor in TRAINING_ROOM_APPLY");
      return;
    }
    // Batch 1 names the lexicon it was written against (apple, dried fruit,
    // saltiness, flint, Yeast toast). Once 20260929090000_aroma_lexicon_v2 has
    // renamed or removed those terms, its own check refuses to resolve them, so
    // a replay can only fail: skip the replays and check the landing alone.
    const lexiconV2 = (
      await client.query(
        "select exists (select 1 from wset_aroma_terms where group_name = 'Green fruit' and term = 'green apple') as ok",
      )
    ).rows[0].ok;
    const sql = readFileSync(file, "utf8");
    if (!lexiconV2 && !APPLY.some((f) => f.endsWith("20260925130000_archetypes_batch_1.sql"))) await client.query(sql);
    const batch = JSON.parse(readFileSync("data/training/archetypes-batch-1.json", "utf8"));
    const names = batch.archetypes.map((a) => a.name);
    const totals = async () =>
      (
        await client.query(
          `select (select count(*)::int from wine_archetypes) archetypes,
                  (select count(*)::int from wine_archetype_aromas) aromas,
                  (select count(*)::int from wine_archetype_designations) designations,
                  (select count(*)::int from wine_archetype_placements) placements`,
        )
      ).rows[0];
    if (!lexiconV2) {
      const first = await totals();
      await client.query(sql);
      assert.deepEqual(await totals(), first, "a second apply changes nothing");
    }

    const once = (
      await client.query("select name, count(*)::int n from wine_archetypes where name = any($1::text[]) group by name", [
        names,
      ])
    ).rows;
    assert.equal(once.length, names.length);
    assert.ok(once.every((x) => x.n === 1));

    const pauillac = (
      await client.query(
        `select c.name country, r.name region, ap.name appellation, g.name grape, wp.canonical_key place,
                (select array_agg(t.term order by t.term) from wine_archetype_aromas l
                   join wset_aroma_terms t on t.id = l.term_id
                  where l.archetype_id = a.id and l.signature and l.kind = 'NOSE') signatures,
                (select array_agg(td.name) from wine_archetype_designations d
                   join type_designations td on td.id = d.type_designation_id where d.archetype_id = a.id) designations,
                (select array_agg(pp.canonical_key order by pp.canonical_key) from wine_archetype_placements p
                   join wine_places pp on pp.id = p.wine_place_id where p.archetype_id = a.id) placements,
                a.typical_age_low, a.typical_age_high, a.sat -> 'tannin' tannin
           from wine_archetypes a
           join countries c on c.id = a.country_id
           join regions r on r.id = a.region_id
           join appellations ap on ap.id = a.appellation_id
           join grapes g on g.id = a.primary_grape_id
           left join wine_places wp on wp.id = a.wine_place_id
          where a.name = 'A typical Pauillac'`,
      )
    ).rows[0];
    assert.deepEqual(pauillac, {
      country: "France",
      region: "Bordeaux",
      appellation: "Pauillac AOC",
      grape: "Cabernet Sauvignon",
      place: "france.bordeaux.haut-medoc.pauillac",
      signatures: ["blackcurrant", "cedar"],
      designations: ["Grand Cru Classé"],
      // Its home, and from R1b (training-room-map spec RM9) its region's page too.
      placements: (await regionPlacementsLive())
        ? ["france.bordeaux", "france.bordeaux.haut-medoc.pauillac"]
        : ["france.bordeaux.haut-medoc.pauillac"],
      typical_age_low: 8,
      typical_age_high: 30,
      tannin: ["MEDIUM_PLUS", "HIGH"],
    });
    // US typical wines (usa-wine-map spec §14.2): after step 1 (20260930114747)
    // Napa lives on North Coast and also sits on California's page; after step 2
    // (20260930184747) it lives on Napa Valley, still placed on both.
    const napa = (
      await client.query(
        `select wp.canonical_key place,
                (select array_agg(pp.canonical_key order by pp.canonical_key) from wine_archetype_placements p
                   join wine_places pp on pp.id = p.wine_place_id where p.archetype_id = a.id) placements
           from wine_archetypes a left join wine_places wp on wp.id = a.wine_place_id
          where a.name = 'A typical Napa Cabernet Sauvignon'`,
      )
    ).rows[0];
    // Step 2 (usa-wine-map spec §14.2, 20260930184747): once US-3's core is
    // promoted and linked, Napa lives on Napa Valley, still placed on North
    // Coast and California.
    if (napa.place === null) {
      assert.deepEqual(napa, { place: null, placements: null }, "an archetype without a map place stays off the map");
    } else if (napa.place === "united-states.california.north-coast") {
      assert.deepEqual(napa.placements, ["united-states.california", "united-states.california.north-coast"]);
    } else {
      assert.deepEqual(napa, {
        place: "united-states.california.north-coast.napa-valley",
        placements: ["united-states.california", "united-states.california.north-coast",
          "united-states.california.north-coast.napa-valley"],
      });
    }
    const prosecco = (await client.query("select sat -> 'mousse' mousse from wine_archetypes where name = 'A typical Prosecco'"))
      .rows[0];
    assert.deepEqual(prosecco, { mousse: ["CREAMY", "AGGRESSIVE"] });
  });
});

// --- Cru Classé de Graves (20260928130000) ---------------------------------------

test("Cru Classé de Graves follows Premier Grand Cru Classé, and both Pessac-Léognan typical wines carry it", async () => {
  const file = "supabase/migrations/20260928130000_cru_classe_de_graves.sql";
  await withRollback(async () => {
    await asOwner();
    const live = (await client.query("select count(*)::int n from type_designations where name = 'Cru Classé de Graves'")).rows[0].n === 1;
    if (!live && !APPLY.some((f) => f.endsWith("20260928130000_cru_classe_de_graves.sql"))) await client.query(readFileSync(file, "utf8"));
    const order = (await client.query("select name from type_designations where sort_order between 12 and 18 order by sort_order")).rows.map((r) => r.name);
    assert.deepEqual(order, ["Grand Cru Classé", "Premier Grand Cru Classé", "Cru Classé de Graves", "Cru Bourgeois", "Cru Artisan", "Cru Exceptionnel", "Gutswein"]);
    const row = (
      await client.query(
        `select td.category, c.name country, r.name region, td.is_active from type_designations td
           left join countries c on c.id = td.country_id left join regions r on r.id = td.region_id
          where td.name = 'Cru Classé de Graves'`,
      )
    ).rows[0];
    assert.deepEqual(row, { category: "Quality Classification", country: "France", region: "Bordeaux", is_active: true });
    const pessac = (
      await client.query(
        `select a.name, array_agg(td.name order by td.name) designations from wine_archetypes a
           join wine_archetype_designations d on d.archetype_id = a.id join type_designations td on td.id = d.type_designation_id
          where a.name in ('A typical Pessac-Léognan red', 'A typical Pessac-Léognan white') group by a.name order by a.name`,
      )
    ).rows;
    assert.deepEqual(pessac, [
      { name: "A typical Pessac-Léognan red", designations: ["Cru Classé de Graves"] },
      { name: "A typical Pessac-Léognan white", designations: ["Cru Classé de Graves"] },
    ]);
    const link = (await client.query("select td.name from wine_designations wd join type_designations td on td.id = wd.type_designation_id where wd.key = 'graves-cru-classe'")).rows;
    assert.deepEqual(link, [{ name: "Cru Classé de Graves" }]);
  });
});

// --- The region pick (region-guess addendum R6, R7; 20260927100000) --------------

test("a region pick with the right region and grape scores country 2, region 3 and grape 8", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const out = await fresh(a, { picked_region_id: r.bordeaux, picked_grape_id: r.cabernet, actual_catalog_wine_id: w });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 8,
      secondary_grape: 0,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 13);
    assert.equal(out.possible, 20, "possible depends on the wine, not the pick");
    assert.equal(out.actual_archetype_id, r.margaux, "the style verdict is unchanged");
    const row = await attemptRow(out.attempt_id);
    assert.equal(row.picked_archetype_id, null);
    assert.equal(row.picked_region_id, r.bordeaux);
    assert.equal(row.picked_grape_id, r.cabernet);

    // A designation on the wine is 0 for a region pick (it names none); the vintage scores as before.
    const gcc = await wine(a, margauxBottle(r, { designation: r.grandCruClasse }));
    const designated = await fresh(a, {
      picked_region_id: r.bordeaux,
      picked_grape_id: r.cabernet,
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2015,
      actual_catalog_wine_id: gcc,
    });
    assert.deepEqual(designated.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 8,
      secondary_grape: 0,
      type_designation: 0,
      vintage: 2,
    });
    assert.equal(designated.total, 15);
    assert.equal(designated.possible, 24);

    // A wine with no second grape: that row does not apply, as for a typical-wine pick.
    const plain = await wine(a, margauxBottle(r, { secondary: null }));
    const single = await fresh(a, { picked_region_id: r.bordeaux, actual_catalog_wine_id: plain });
    assert.equal(single.points.secondary_grape, null);
    assert.equal(single.possible, 18);
  });
});

test("a region pick with a wrong grape or none scores 5; another region only its country", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    // Merlot is this wine's second grape: a region pick's one grape is scored as the primary only.
    const wrongGrape = await fresh(a, { picked_region_id: r.bordeaux, picked_grape_id: r.merlot, actual_catalog_wine_id: w });
    assert.deepEqual(wrongGrape.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 0,
      secondary_grape: 0,
      type_designation: null,
      vintage: null,
    });
    assert.equal(wrongGrape.total, 5);
    const noGrape = await fresh(a, { picked_region_id: r.bordeaux, actual_catalog_wine_id: w });
    assert.equal(noGrape.points.primary_grape, 0);
    assert.equal(noGrape.total, 5);
    const neighbour = await fresh(a, { picked_region_id: r.bourgogne, picked_grape_id: r.cabernet, actual_catalog_wine_id: w });
    assert.deepEqual([neighbour.points.country, neighbour.points.region, neighbour.points.primary_grape], [2, 0, 8]);
    assert.equal(neighbour.total, 10);
    const abroad = await fresh(a, { picked_region_id: r.rioja, actual_catalog_wine_id: w });
    assert.deepEqual([abroad.points.country, abroad.points.region], [0, 0]);
    assert.equal(abroad.total, 0);
  });
});

test("a typical-wine pick scores exactly as before and stores no region or grape", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: w });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 5,
      primary_grape: 8,
      secondary_grape: 2,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 20);
    assert.equal(out.possible, 20);
    const row = await attemptRow(out.attempt_id);
    assert.equal(row.picked_region_id, null);
    assert.equal(row.picked_grape_id, null);
  });
});

test("both picks, a grape without a region and unknown ids are refused, and nothing is written", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    await expectError(
      () => fresh(a, { picked_archetype_id: r.margaux, picked_region_id: r.bordeaux }),
      "23514",
      'new row for relation "training_attempts" violates check constraint "training_attempts_one_pick"',
    );
    await expectError(
      () => fresh(a, { picked_grape_id: r.cabernet }),
      "23514",
      'new row for relation "training_attempts" violates check constraint "training_attempts_grape_needs_region"',
    );
    await expectError(() => fresh(a, { picked_region_id: randomUUID() }), "22023", "no such region");
    await expectError(
      () => fresh(a, { picked_region_id: r.bordeaux, picked_grape_id: randomUUID() }),
      "22023",
      "no such grape",
    );
    await asOwner();
    const counts = (
      await client.query(
        `select (select count(*)::int from training_attempts where author_id = $1) attempts,
                (select count(*)::int from wset_notes where author_id = $1) notes`,
        [a],
      )
    ).rows[0];
    assert.deepEqual(counts, { attempts: 0, notes: 0 }, "a refused call keeps neither the attempt nor its note");
  });
});

test("Reveal now scores a stored region pick and ignores the payload's pick", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const unrevealed = await fresh(a, { picked_region_id: r.bourgogne, picked_grape_id: r.pinotNoir });
    assert.equal(unrevealed.total, null);
    const w = await wine(a, {
      country: r.france,
      region: r.bourgogne,
      appellation: r.vosneAoc,
      primary: r.pinotNoir,
      producer: r.producer,
    });
    await asUser(a);
    const out = await record({}, [], {
      attempt_id: unrevealed.attempt_id,
      actual_catalog_wine_id: w,
      picked_archetype_id: r.margaux,
      picked_region_id: r.bordeaux,
    });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 8,
      secondary_grape: null,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 13);
    assert.equal(out.possible, 18);
    assert.equal(out.actual_archetype_id, r.vosne);
    const row = await attemptRow(unrevealed.attempt_id);
    assert.deepEqual([row.picked_archetype_id, row.picked_region_id, row.picked_grape_id], [null, r.bourgogne, r.pinotNoir]);
  });
});

test("training_attempts carries the two pick columns, their checks and their foreign keys", async () => {
  await withRollback(async () => {
    await asOwner();
    const defs = (
      await client.query(
        `select conname, regexp_replace(pg_get_constraintdef(oid), '\\mpublic\\.', '', 'g') def
           from pg_constraint
          where conrelid = 'public.training_attempts'::regclass
            and conname = any($1::text[])
          order by conname collate "C"`,
        [
          [
            "training_attempts_grape_needs_region",
            "training_attempts_one_pick",
            "training_attempts_picked_grape_id_fkey",
            "training_attempts_picked_region_id_fkey",
          ],
        ],
      )
    ).rows;
    assert.deepEqual(defs, [
      {
        conname: "training_attempts_grape_needs_region",
        def: "CHECK (((picked_grape_id IS NULL) OR (picked_region_id IS NOT NULL)))",
      },
      {
        conname: "training_attempts_one_pick",
        def: "CHECK (((picked_archetype_id IS NULL) OR (picked_region_id IS NULL)))",
      },
      {
        conname: "training_attempts_picked_grape_id_fkey",
        def: "FOREIGN KEY (picked_grape_id) REFERENCES grapes(id) ON DELETE SET NULL",
      },
      {
        conname: "training_attempts_picked_region_id_fkey",
        def: "FOREIGN KEY (picked_region_id) REFERENCES regions(id) ON DELETE SET NULL",
      },
    ]);
  });
});

// --- The training room on the wine map (training-room-map spec, phase R1) --------
// docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.1, §4.2, RM9a.
// Before R1a/R1b are live, name their files in TRAINING_ROOM_APPLY (R1a first).

const PLACES_SIG = "public.training_archetype_places()";

// R1b is live (or applied in this transaction) once France's Bordeaux region
// page lists a typical wine: before R1b no placement points at it.
async function regionPlacementsLive() {
  return (
    await client.query(
      `select exists (select 1 from wine_archetype_placements x
                        join wine_places p on p.id = x.wine_place_id
                       where p.canonical_key = 'france.bordeaux') as live`,
    )
  ).rows[0].live;
}

// Every file in TRAINING_ROOM_APPLY runs as the owner, as the applier runs it:
// none may leave a signed-in caller behind (R1a's own assert once left the zero
// UUID in request.jwt.claims, and audit triggers stamped it as the editor).
test("the migrations under test leave the owner's session with no auth.uid()", async () => {
  await withRollback(async () => {
    const after = (
      await client.query(
        "select auth.uid() as uid, current_user as role, nullif(current_setting('request.jwt.claims', true), '') as claims",
      )
    ).rows[0];
    assert.deepEqual(after, { uid: null, role: (await client.query("select session_user as r")).rows[0].r, claims: null });
  });
});

test("training_archetype_places: one row per archetype as a signed-in reader, authenticated only", async (t) => {
  await withRollback(async () => {
    await asOwner();
    if ((await client.query("select to_regprocedure($1) is not null as ok", [PLACES_SIG])).rows[0].ok === false) {
      t.skip("R1a is neither live nor in TRAINING_ROOM_APPLY");
      return;
    }
    const counts = (
      await client.query("select count(*)::int total, count(wine_place_id)::int placed from wine_archetypes")
    ).rows[0];
    const grants = (
      await client.query(
        `select p.prosecdef as definer, p.provolatile as volatility,
                has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                has_function_privilege('service_role', p.oid, 'EXECUTE') as service,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
                exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0) as public
           from pg_proc p where p.oid = to_regprocedure($1)`,
        [PLACES_SIG],
      )
    ).rows[0];
    assert.deepEqual(grants, { definer: false, volatility: "s", anon: false, service: false, authed: true, public: false });

    // Any signed-in caller: the function reads no profile, so none is made.
    await asUser(randomUUID());
    const got = (
      await client.query(
        `select count(*)::int total, count(place_key)::int with_key, count(region_key)::int with_region,
                count(point_lon)::int with_point,
                count(*) filter (where point_key is not null and point_key <> place_key)::int ancestor_points,
                count(*) filter (where point_lon not between -180 and 180 or point_lat not between -90 and 90)::int bad_points
           from training_archetype_places()`,
      )
    ).rows[0];
    assert.deepEqual(got, {
      total: counts.total,
      with_key: counts.placed,
      with_region: counts.placed,
      with_point: counts.placed,
      ancestor_points: 1,
      bad_points: 0,
    });
    const picks = (
      await client.query(
        `select a.name, t.place_key, t.region_key, t.region_name, t.point_key
           from training_archetype_places() t join wine_archetypes a on a.id = t.archetype_id
          where a.name in ('A typical Prosecco', 'A typical Montepulciano d''Abruzzo', 'A typical Mendoza Malbec')
          order by a.name`,
      )
    ).rows;
    // The unplaced pick is Mendoza, not Napa: the USA wave (spec §13) re-homes
    // Napa, and this test must not break when it does.
    assert.deepEqual(picks, [
      { name: "A typical Mendoza Malbec", place_key: null, region_key: null, region_name: null, point_key: null },
      {
        name: "A typical Montepulciano d'Abruzzo",
        place_key: "italy.abruzzo.montepulciano-d-abruzzo",
        region_key: "italy.abruzzo",
        region_name: "Abruzzo",
        point_key: "italy.abruzzo",
      },
      {
        name: "A typical Prosecco",
        place_key: "italy.veneto.prosecco",
        region_key: "italy.veneto",
        region_name: "Veneto",
        point_key: "italy.veneto.prosecco",
      },
    ]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await client.query("set local role anon");
    await expectError(() => client.query("select * from training_archetype_places()"), "42501");
  });
});

test("RM9a: every placed typical wine outside france.bourgogne also sits on its REGION's page", async (t) => {
  await withRollback(async () => {
    await asOwner();
    if (!(await regionPlacementsLive())) {
      t.skip("R1b is neither live nor in TRAINING_ROOM_APPLY");
      return;
    }
    const missing = (
      await client.query(
        `with recursive chain as (
           select a.id as archetype_id, p.id as place_id, p.canonical_key, p.kind, p.primary_parent_id, 0 as depth
             from wine_archetypes a join wine_places p on p.id = a.wine_place_id
           union all
           select c.archetype_id, p.id, p.canonical_key, p.kind, p.primary_parent_id, c.depth + 1
             from chain c join wine_places p on p.id = c.primary_parent_id where c.depth < 8
         ), reg as (
           select distinct on (archetype_id) archetype_id, place_id, canonical_key
             from chain where kind = 'REGION' order by archetype_id, depth
         )
         select a.name, r.canonical_key region
           from reg r join wine_archetypes a on a.id = r.archetype_id
          where r.canonical_key <> 'france.bourgogne'
            and not exists (select 1 from wine_archetype_placements x
                             where x.archetype_id = r.archetype_id and x.wine_place_id = r.place_id)
          order by a.name`,
      )
    ).rows;
    assert.deepEqual(
      missing,
      [],
      "typical wines missing their REGION placement (an editor re-home, or a batch/migration that skipped it): " +
        "add each one at its region in /admin/archetypes",
    );
    const bourgogne = (
      await client.query(
        `select count(*)::int n from wine_archetype_placements x
           join wine_places p on p.id = x.wine_place_id where p.canonical_key = 'france.bourgogne'`,
      )
    ).rows[0].n;
    assert.equal(bourgogne, 7, "Bourgogne keeps its seven curated typical wines");
  });
});

// --- Phase R2: curated display points (spec §4.3, RM23) -------------------------
// Before 20260929150000 is live, name its file in TRAINING_ROOM_APPLY.

async function displayPointsLive() {
  return (
    await client.query(
      `select count(*) = 2 as live from information_schema.columns
        where table_schema = 'public' and table_name = 'wine_archetypes'
          and column_name in ('display_lon', 'display_lat')`,
    )
  ).rows[0].live;
}

test("R2: every unplaced typical wine of the curated list carries a point a signed-in reader sees", async (t) => {
  await withRollback(async () => {
    await asOwner();
    if (!(await displayPointsLive())) {
      t.skip("R2's display points are neither live nor in TRAINING_ROOM_APPLY");
      return;
    }
    // Any signed-in caller: wine_archetypes is readable to every member.
    await asUser(randomUUID());
    const got = (
      await client.query(
        `select count(*) filter (where display_lon is not null)::int with_point,
                count(*) filter (where display_lon is not null and wine_place_id is not null)::int placed_with_point
           from wine_archetypes`,
      )
    ).rows[0];
    // 18 before the USA wave places its three, 15 after; never a placed one.
    assert.ok([15, 18].includes(got.with_point), `with_point = ${got.with_point}`);
    assert.equal(got.placed_with_point, 0);
    const wachau = (
      await client.query(
        `select display_lon, display_lat from wine_archetypes
          where name in ('A typical Wachau Grüner Veltliner', 'A typical Wachau Riesling')`,
      )
    ).rows;
    assert.deepEqual(wachau, [
      { display_lon: 15.42, display_lat: 48.39 },
      { display_lon: 15.42, display_lat: 48.39 },
    ]);
    await asOwner();
    // Both or neither, and in range (wine_archetypes_display_point_check).
    await expectError(
      () => client.query("update wine_archetypes set display_lon = 1 where name = 'A typical Pauillac'"),
      "23514",
    );
    await expectError(
      () =>
        client.query("update wine_archetypes set display_lon = 181, display_lat = 1 where name = 'A typical Pauillac'"),
      "23514",
    );
  });
});
