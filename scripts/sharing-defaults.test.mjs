// Sharing defaults DB suite (spec docs/superpowers/specs/2026-09-27-sharing-defaults-design.md
// §9.2): can_view_notes against can_view_cellar, the narrowed "wset notes
// read" policy, the community figures that follow the reader, the Rule 1
// hold / pour link / guard, the grants, shared_cellar_lots' blanked fields,
// M2's flip and notices, and account deletion.
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles, wines and tastings created inside that
// transaction: no real person's row decides a result or is written.
//
//   node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout \
//     scripts/sharing-defaults.test.mjs
//
// Dry run before the migrations are live: SHARING_DEFAULTS_APPLY lists the
// migration files (comma-separated, in order). Each test applies M1 inside
// its own rolled-back transaction first; M2 flips every live PRIVATE cellar,
// so only the tests about M2 apply it, after their own fixtures:
//   SHARING_DEFAULTS_APPLY=supabase/migrations/20260927140000_sharing_defaults.sql,supabase/migrations/20260927150000_sharing_defaults_flip.sql \
//     node --env-file=.env.local --test scripts/sharing-defaults.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const APPLY = (process.env.SHARING_DEFAULTS_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);
const M1_FILE = APPLY.find((f) => f.endsWith("20260927140000_sharing_defaults.sql")) ?? null;
const M2_FILE = APPLY.find((f) => f.endsWith("20260927150000_sharing_defaults_flip.sql")) ?? null;
// What every test applies first: everything listed but M2.
const BASE = APPLY.filter((f) => f !== M2_FILE);
const GUARD = "This wine is in one of your flights that hasn't been revealed yet. Change or delete this note after the reveal.";

const client = new pg.Client(pgConfig());
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb, files = BASE) {
  await client.query("begin");
  try {
    for (const file of files) await client.query(readFileSync(file, "utf8"));
    return await cb();
  } finally {
    await client.query("rollback");
  }
}

// The table owner with no request at all (auth.uid() is null): fixtures,
// and how the auth.users triggers and the admin client reach the scrub.
async function asOwner() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '', true)");
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
async function asServiceRole() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
  await client.query("set local role service_role");
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

// Throwaway people that exist only inside the current transaction.
async function freshProfiles(n) {
  await asOwner();
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'sharing-defaults-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`Sharing defaults test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

async function setNotes(id, value) {
  await asOwner();
  await client.query("update profiles set notes_visibility = $2 where id = $1", [id, value]);
}
async function setCellar(id, value) {
  await asOwner();
  await client.query("update profiles set cellar_visibility = $2 where id = $1", [id, value]);
}
async function befriend(a, b) {
  await asOwner();
  await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [a, b]);
}

// One live id per reference table, and three aroma terms (owner role).
let refCache = null;
async function refs() {
  if (refCache) return refCache;
  await asOwner();
  const first = async (table) => (await client.query(`select id from ${table} order by id limit 1`)).rows[0].id;
  refCache = {
    country: await first("countries"),
    region: await first("regions"),
    appellation: await first("appellations"),
    grape: await first("grapes"),
    producer: await first("producers"),
    terms: (await client.query("select id from wset_aroma_terms order by id limit 3")).rows.map((r) => r.id),
  };
  return refCache;
}

// A catalog wine written by the owner; a fresh name keeps it clear of
// catalog_wines_identity_key.
async function catalogWine(createdBy, { blindPending = false } = {}) {
  const r = await refs();
  await asOwner();
  return (
    await client.query(
      `insert into catalog_wines
         (country_id, region_id, appellation_id, primary_grape_id, producer_id,
          vintage_kind, vintage_year, colour, style, wine_name, created_by, blind_pending)
       values ($1, $2, $3, $4, $5, 'YEAR', 2019, 'RED', 'STILL',
               'Sharing defaults test ' || gen_random_uuid()::text, $6, $7)
       returning id`,
      [r.country, r.region, r.appellation, r.grape, r.producer, createdBy, blindPending],
    )
  ).rows[0].id;
}

// One glass of `tasting`, keyed to `wineId` through its answer key (owner role).
async function addGlass(tasting, wineId, contributorSeat, position) {
  await asOwner();
  const glass = (
    await client.query(
      "insert into wines (tasting_id, position, contributor_participant_id) values ($1, $2, $3) returning id",
      [tasting, position, contributorSeat],
    )
  ).rows[0].id;
  await client.query(
    `insert into wine_answers
       (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id,
        vintage_kind, vintage_year, catalog_wine_id)
     select $1, cw.country_id, cw.region_id, cw.appellation_id, cw.primary_grape_id, cw.producer_id,
            cw.vintage_kind, cw.vintage_year, cw.id
       from catalog_wines cw where cw.id = $2`,
    [glass, wineId],
  );
  return glass;
}

// A LIVE blind tasting, IN_PROGRESS, hosted by `host`, with `guests` JOINED and
// one unrevealed glass keyed to `wineId` — added by the host, or, with
// `contributor` (one of `guests`), brought by that guest (owner role).
async function flight({ host, guests = [], wineId, contributor = null }) {
  await asOwner();
  const tasting = (
    await client.query(
      `insert into tastings (name, host_id, timing_mode, wine_source, reveal_mode)
       values ('Sharing defaults test', $1, 'LIVE', $2, 'BLIND') returning id`,
      [host, contributor ? "PARTICIPANT_CONTRIBUTED" : "HOST_PROVIDES"],
    )
  ).rows[0].id;
  const seats = new Map();
  for (const user of [host, ...guests]) {
    const seat = (
      await client.query(
        "insert into tasting_participants (tasting_id, user_id, status) values ($1, $2, 'JOINED') returning id",
        [tasting, user],
      )
    ).rows[0].id;
    seats.set(user, seat);
  }
  const glass = await addGlass(tasting, wineId, contributor ? seats.get(contributor) : null, 1);
  await client.query("update tastings set status = 'IN_PROGRESS' where id = $1", [tasting]);
  return { tasting, glass, seats };
}

async function reveal(host, glass) {
  await asUser(host);
  await client.query("select public.reveal_wine($1)", [glass]);
}

// A note saved by its author through save_wset_note, as the app saves one.
async function note(author, wineId, fields = { quality_score: 88 }) {
  await asUser(author);
  return (
    await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
      JSON.stringify({ catalog_wine_id: wineId, ...fields }),
    ])
  ).rows[0].id;
}

async function aroma(noteId, termId) {
  await asOwner();
  await client.query(
    "insert into wset_note_aromas (note_id, term_id, sensed_on_nose, sensed_on_palate) values ($1, $2, true, false)",
    [noteId, termId],
  );
}

// Whether `reader` can read the note (the policy decides).
async function sees(reader, noteId) {
  await asUser(reader);
  return (await client.query("select count(*)::int as n from wset_notes where id = $1", [noteId])).rows[0].n === 1;
}

async function holdsOf(noteId) {
  await asOwner();
  return (
    await client.query("select wine_id from wset_note_holds where note_id = $1 order by wine_id", [noteId])
  ).rows.map((r) => r.wine_id);
}

async function myHeld(who, ids) {
  await asUser(who);
  return (await client.query("select t.id from public.wset_my_held_notes($1::uuid[]) as t(id)", [ids])).rows.map(
    (r) => r.id,
  );
}

// ---------------------------------------------------------------------------
// 1. can_view_notes against can_view_cellar
// ---------------------------------------------------------------------------

test("can_view_notes answers exactly as can_view_cellar for every audience and viewer; a deleted author is refused", async () => {
  await withRollback(async () => {
    const [owner, pal, oneWay, requester, stranger] = await freshProfiles(5);
    await befriend(owner, pal);
    await asOwner();
    await client.query("insert into friendships (user_id, friend_id) values ($1, $2)", [oneWay, owner]);
    await client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [requester, owner]);
    const viewers = { self: owner, pal, oneWay, requester, stranger, nobody: null };
    const expected = {
      PUBLIC: { self: true, pal: true, oneWay: true, requester: true, stranger: true, nobody: true },
      FRIENDS: { self: false, pal: true, oneWay: true, requester: false, stranger: false, nobody: false },
      PRIVATE: { self: false, pal: false, oneWay: false, requester: false, stranger: false, nobody: false },
    };
    for (const audience of ["PUBLIC", "FRIENDS", "PRIVATE"]) {
      await asOwner();
      await client.query("update profiles set cellar_visibility = $2, notes_visibility = $2 where id = $1", [
        owner,
        audience,
      ]);
      for (const [name, viewer] of Object.entries(viewers)) {
        await asUser(viewer);
        const r = (
          await client.query("select public.can_view_cellar($1) as cellar, public.can_view_notes($1) as notes", [owner])
        ).rows[0];
        assert.equal(r.notes, r.cellar, `${audience} / ${name}: the two helpers disagree`);
        assert.equal(r.notes, expected[audience][name], `${audience} / ${name}`);
      }
    }
    await setNotes(owner, "PUBLIC");
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [owner]);
    await asUser(stranger);
    assert.equal(
      (await client.query("select public.can_view_notes($1) as ok", [owner])).rows[0].ok,
      false,
      "a deleted author's notes are refused whatever notes_visibility says",
    );
  });
});

// ---------------------------------------------------------------------------
// 2-3. The read policy
// ---------------------------------------------------------------------------

test("the author reads every note of their own: identity-less, held, Only me, on an unidentified wine", async () => {
  await withRollback(async () => {
    const [author, host, guest] = await freshProfiles(3);
    const hostsWine = await catalogWine(host);
    const { glass } = await flight({ host, guests: [author, guest], wineId: hostsWine });
    await asOwner();
    const blind = (
      await client.query(
        "insert into wset_notes (author_id, context_kind, tasting_wine_id) values ($1, 'BLIND', $2) returning id",
        [author, glass],
      )
    ).rows[0].id;
    const training = (
      await client.query("insert into wset_notes (author_id, context_kind) values ($1, 'TRAINING') returning id", [
        author,
      ])
    ).rows[0].id;
    const own = await catalogWine(author);
    await flight({ host: author, guests: [guest], wineId: own });
    const held = await note(author, own);
    assert.equal((await holdsOf(held)).length, 1, "held: the author adds an unrevealed glass of the wine");
    await asOwner();
    const unidentifiedWine = (
      await client.query(
        "insert into catalog_wines_unidentified (created_by, colour, style) values ($1, 'RED', 'STILL') returning id",
        [author],
      )
    ).rows[0].id;
    await asUser(author);
    const unidentified = (
      await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
        JSON.stringify({ unidentified_wine_id: unidentifiedWine, quality_score: 80 }),
      ])
    ).rows[0].id;
    await setNotes(author, "PRIVATE");
    const onlyMe = await note(author, await catalogWine(host));
    for (const [name, id] of Object.entries({ blind, training, held, unidentified, onlyMe })) {
      assert.equal(await sees(author, id), true, `the author reads their own ${name} note`);
    }
  });
});

test("others read a note by its author's setting; never identity-less, unidentified, or on a wine they cannot read; aromas follow", async () => {
  await withRollback(async () => {
    const r = await refs();
    const [author, friend, stranger, requester, creator] = await freshProfiles(5);
    await befriend(author, friend);
    await asOwner();
    await client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [requester, author]);
    const wine = await catalogWine(creator);
    const n = await note(author, wine, { quality_score: 90 });
    await aroma(n, r.terms[0]);
    const aromasSeenBy = async (who) => {
      await asUser(who);
      return (await client.query("select count(*)::int as n from wset_note_aromas where note_id = $1", [n])).rows[0].n;
    };

    for (const who of [friend, stranger, requester]) assert.equal(await sees(who, n), true, "Everyone: readable");
    assert.equal(await aromasSeenBy(stranger), 1, "Everyone: its aromas too");

    await setNotes(author, "FRIENDS");
    assert.equal(await sees(friend, n), true, "Friends: the accepted friend");
    assert.equal(await sees(stranger, n), false, "Friends: not a stranger");
    assert.equal(await sees(requester, n), false, "Friends: not a pending requester");
    assert.equal(await aromasSeenBy(stranger), 0, "Friends: nor its aromas");

    await setNotes(author, "PRIVATE");
    for (const who of [friend, stranger, requester]) assert.equal(await sees(who, n), false, "Only me: nobody");
    await setNotes(author, "PUBLIC");

    const { glass } = await flight({ host: creator, guests: [author, friend], wineId: wine });
    await asOwner();
    const blind = (
      await client.query(
        "insert into wset_notes (author_id, context_kind, tasting_wine_id) values ($1, 'BLIND', $2) returning id",
        [author, glass],
      )
    ).rows[0].id;
    const training = (
      await client.query("insert into wset_notes (author_id, context_kind) values ($1, 'TRAINING') returning id", [
        author,
      ])
    ).rows[0].id;
    const unidentifiedWine = (
      await client.query(
        "insert into catalog_wines_unidentified (created_by, colour, style) values ($1, 'RED', 'STILL') returning id",
        [author],
      )
    ).rows[0].id;
    const unidentified = (
      await client.query(
        "insert into wset_notes (author_id, unidentified_wine_id, quality_score) values ($1, $2, 80) returning id",
        [author, unidentifiedWine],
      )
    ).rows[0].id;
    for (const [name, id] of Object.entries({ blind, training, unidentified })) {
      assert.equal(await sees(friend, id), false, `${name}: nobody but the author`);
    }

    const hidden = await catalogWine(creator, { blindPending: true });
    const onHidden = await note(author, hidden);
    assert.equal(await sees(stranger, onHidden), false, "a blind_pending wine's note: not a stranger");
    assert.equal(await sees(creator, onHidden), true, "a blind_pending wine's note: its creator, who reads the wine");
  });
});

// ---------------------------------------------------------------------------
// 4. Figures others see
// ---------------------------------------------------------------------------

test("ratings, descriptors, structure and usage leave out an Only-me note and a held note for others, and include your own", async () => {
  await withRollback(async () => {
    const r = await refs();
    const [a, b, c, stranger, guest] = await freshProfiles(5);
    const wine = await catalogWine(a);
    const na = await note(a, wine, { quality_score: 90, acidity: "HIGH" });
    await setNotes(b, "PRIVATE");
    const nb = await note(b, wine, { quality_score: 60, acidity: "LOW" });
    await flight({ host: c, guests: [guest], wineId: wine });
    const nc = await note(c, wine, { quality_score: 70, acidity: "MEDIUM" });
    assert.equal((await holdsOf(nc)).length, 1, "c's note is held");
    await aroma(na, r.terms[0]);
    await aroma(nb, r.terms[1]);
    await aroma(nc, r.terms[2]);

    const figures = async (who) => {
      await asUser(who);
      const ratings = (
        await client.query("select avg_score, note_count from catalog_wine_ratings where catalog_wine_id = $1", [wine])
      ).rows[0];
      const terms = (
        await client.query(
          "select term_id from catalog_wine_descriptors where catalog_wine_id = $1 order by term_id",
          [wine],
        )
      ).rows.map((x) => x.term_id);
      const acidity = (
        await client.query("select n from public.catalog_wine_structure($1) where dimension = 'acidity'", [wine])
      ).rows[0];
      return { avg: Number(ratings?.avg_score ?? NaN), count: ratings?.note_count ?? 0, terms, acidity: acidity?.n ?? 0 };
    };

    assert.deepEqual(await figures(stranger), { avg: 90, count: 1, terms: [r.terms[0]], acidity: 1 });
    assert.deepEqual(await figures(b), { avg: 75, count: 2, terms: [r.terms[0], r.terms[1]].sort(), acidity: 2 });
    assert.deepEqual(await figures(c), { avg: 80, count: 2, terms: [r.terms[0], r.terms[2]].sort(), acidity: 2 });

    await asUser(stranger);
    assert.equal(
      (await client.query("select note_count from public.catalog_wine_usage($1)", [wine])).rows[0].note_count,
      2,
      "usage counts the Only-me note (a reference count) but not the held one",
    );
    await asOwner();
    assert.equal(
      (await client.query("select prosecdef from pg_proc where oid = 'public.catalog_wine_structure(uuid)'::regprocedure"))
        .rows[0].prosecdef,
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. The hold (S10)
// ---------------------------------------------------------------------------

test("a host's note on the wine in their unrevealed glass is held: the author reads it, a guest does not, and only the author is told", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const { glass } = await flight({ host, guests: [guest], wineId: wine });
    const n = await note(host, wine);
    assert.equal(await sees(guest, n), false);
    assert.equal(await sees(host, n), true);
    assert.deepEqual(await holdsOf(n), [glass]);
    assert.deepEqual(await myHeld(host, [n]), [n]);
    assert.deepEqual(await myHeld(guest, [n]), [], "a guest learns nothing from the id");
  });
});

test("a bring-your-own contributor's note on the bottle they brought is held the same way", async () => {
  await withRollback(async () => {
    const [host, contributor, guest] = await freshProfiles(3);
    const wine = await catalogWine(contributor);
    const { glass } = await flight({ host, guests: [contributor, guest], wineId: wine, contributor });
    const n = await note(contributor, wine);
    assert.deepEqual(await holdsOf(n), [glass]);
    assert.equal(await sees(guest, n), false);
    assert.equal(await sees(host, n), false, "the host did not add this glass and does not read the note either");
    assert.equal(await sees(contributor, n), true);
  });
});

test("a guest's own note on the poured wine is not held", async () => {
  await withRollback(async () => {
    const [host, guest, stranger] = await freshProfiles(3);
    const wine = await catalogWine(host);
    await flight({ host, guests: [guest], wineId: wine });
    const n = await note(guest, wine);
    assert.deepEqual(await holdsOf(n), []);
    assert.equal(await sees(stranger, n), true);
  });
});

test("a note written before the glass stays readable after the glass is poured (no vanish)", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const n = await note(host, wine);
    assert.equal(await sees(guest, n), true);
    await flight({ host, guests: [guest], wineId: wine });
    assert.equal(await sees(guest, n), true, "keying a glass never hides an older note");
    assert.deepEqual(await holdsOf(n), []);
  });
});

test("the reveal releases the hold, and a note written after the reveal is never held", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const { glass } = await flight({ host, guests: [guest], wineId: wine });
    const n = await note(host, wine);
    assert.equal(await sees(guest, n), false);
    await reveal(host, glass);
    assert.equal(await sees(guest, n), true);
    assert.deepEqual(await holdsOf(n), []);
    const later = await note(host, wine);
    assert.deepEqual(await holdsOf(later), [], "the hold reads is_revealed as the reveal left it");
    assert.equal(await sees(guest, later), true);
  });
});

test("removing the glass, or deleting the tasting, before the reveal keeps the note held", async () => {
  for (const removal of ["glass", "tasting"]) {
    await withRollback(async () => {
      const [host, guest] = await freshProfiles(2);
      const wine = await catalogWine(host);
      const { tasting, glass } = await flight({ host, guests: [guest], wineId: wine });
      const n = await note(host, wine);
      await asOwner();
      if (removal === "glass") await client.query("delete from wines where id = $1", [glass]);
      else await client.query("delete from tastings where id = $1", [tasting]);
      assert.deepEqual(await holdsOf(n), [null], `${removal}: the hold stays, its glass gone`);
      assert.equal(await sees(guest, n), false, `${removal}: still hidden`);
    });
  }
});

test("an identity that arrives at another glass's reveal is held while the author adds an unrevealed glass of that wine", async () => {
  await withRollback(async () => {
    const [author, other, guest] = await freshProfiles(3);
    const wine = await catalogWine(other);
    const first = await flight({ host: other, guests: [author, guest], wineId: wine });
    await asUser(author);
    const n = (
      await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
        JSON.stringify({ context_kind: "BLIND", tasting_wine_id: first.glass, quality_score: 85 }),
      ])
    ).rows[0].id;
    const second = await flight({ host: author, guests: [guest], wineId: wine });
    await reveal(other, first.glass);
    await asOwner();
    assert.equal(
      (await client.query("select catalog_wine_id from wset_notes where id = $1", [n])).rows[0].catalog_wine_id,
      wine,
      "the reveal resolved the note",
    );
    assert.deepEqual(await holdsOf(n), [second.glass]);
    assert.equal(await sees(guest, n), false);
  });
});

test("an identity filled in by moving a note onto a revealed glass is held while the author adds an unrevealed glass of that wine", async () => {
  await withRollback(async () => {
    const [author, other, guest] = await freshProfiles(3);
    const wine = await catalogWine(other);
    // An earlier tasting the author joined, whose glass of the wine is revealed.
    const earlier = await flight({ host: other, guests: [author, guest], wineId: wine });
    await reveal(other, earlier.glass);
    // Tonight the author pours the same wine, unrevealed.
    const tonight = await flight({ host: author, guests: [guest], wineId: wine });
    // An identity-less note of the author's, on a hidden glass of a third flight.
    const third = await flight({ host: other, guests: [author, guest], wineId: await catalogWine(other) });
    await asUser(author);
    const n = (
      await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
        JSON.stringify({ context_kind: "BLIND", tasting_wine_id: third.glass, quality_score: 85 }),
      ])
    ).rows[0].id;
    assert.deepEqual(await holdsOf(n), []);
    // A crafted PATCH naming only tasting_wine_id: the resolver fills
    // catalog_wine_id in a BEFORE trigger, outside the UPDATE's SET list.
    await asUser(author);
    assert.equal(
      (await client.query("update wset_notes set tasting_wine_id = $2 where id = $1", [n, earlier.glass])).rowCount,
      1,
    );
    await asOwner();
    assert.equal(
      (await client.query("select catalog_wine_id from wset_notes where id = $1", [n])).rows[0].catalog_wine_id,
      wine,
      "the resolver gave the moved note the revealed glass's wine",
    );
    assert.deepEqual(await holdsOf(n), [tonight.glass]);
    assert.equal(await sees(guest, n), false, "a guest does not read it before tonight's reveal");
    assert.equal(await sees(author, n), true);
  });
});

test("an ASYNC IMMEDIATE guesser's note on the wine they have scored is held; a LIVE scored guess holds nothing", async () => {
  await withRollback(async () => {
    const [host, guesser, stranger] = await freshProfiles(3);
    const wine = await catalogWine(host);
    await asOwner();
    const tasting = (
      await client.query(
        `insert into tastings (name, host_id, timing_mode, async_reveal_policy, wine_source, reveal_mode)
         values ('Sharing defaults test', $1, 'ASYNC', 'IMMEDIATE', 'HOST_PROVIDES', 'BLIND') returning id`,
        [host],
      )
    ).rows[0].id;
    await client.query("insert into tasting_participants (tasting_id, user_id, status) values ($1, $2, 'JOINED')", [
      tasting,
      host,
    ]);
    const seat = (
      await client.query(
        "insert into tasting_participants (tasting_id, user_id, status) values ($1, $2, 'JOINED') returning id",
        [tasting, guesser],
      )
    ).rows[0].id;
    const glass = await addGlass(tasting, wine, null, 1);
    await client.query("update tastings set status = 'IN_PROGRESS' where id = $1", [tasting]);
    // What score_own_guess leaves behind: the guesser's own row, locked and scored.
    await client.query("insert into guesses (wine_id, participant_id, locked_at, scored_at) values ($1, $2, now(), now())", [
      glass,
      seat,
    ]);
    const n = await note(guesser, wine);
    assert.deepEqual(await holdsOf(n), [glass], "the guesser reads the answer before the reveal");
    assert.equal(await sees(stranger, n), false);
    assert.deepEqual(await myHeld(guesser, [n]), [n], "the tag tells the guesser nothing they cannot read already");

    // A LIVE guess stamped scored_at by a step reveal grants no answer, so it
    // holds nothing: the tag would name the wine to its author.
    const liveWine = await catalogWine(host);
    const live = await flight({ host, guests: [stranger], wineId: liveWine });
    await asOwner();
    await client.query("insert into guesses (wine_id, participant_id, locked_at, scored_at) values ($1, $2, now(), now())", [
      live.glass,
      live.seats.get(stranger),
    ]);
    assert.deepEqual(await holdsOf(await note(stranger, liveWine)), []);
  });
});

test("record_training_attempt's revealed note is held while its taster adds an unrevealed glass of that wine", async () => {
  await withRollback(async () => {
    const [author, guest] = await freshProfiles(2);
    const wine = await catalogWine(author);
    const { glass } = await flight({ host: author, guests: [guest], wineId: wine });
    await asUser(author);
    const out = (
      await client.query("select public.record_training_attempt($1::jsonb, '[]'::jsonb, $2::jsonb) as r", [
        JSON.stringify({ quality_score: 80 }),
        JSON.stringify({ session_key: randomUUID(), actual_catalog_wine_id: wine, candidates_snapshot: [] }),
      ])
    ).rows[0].r;
    assert.deepEqual(await holdsOf(out.note_id), [glass]);
    assert.equal(await sees(guest, out.note_id), false);
  });
});

test("resolve_unidentified_wine's arrival is held while the author adds an unrevealed glass of the target", async () => {
  await withRollback(async () => {
    const [author, guest] = await freshProfiles(2);
    const wine = await catalogWine(author);
    const { glass } = await flight({ host: author, guests: [guest], wineId: wine });
    await asOwner();
    const unidentifiedWine = (
      await client.query(
        "insert into catalog_wines_unidentified (created_by, colour, style) values ($1, 'RED', 'STILL') returning id",
        [author],
      )
    ).rows[0].id;
    await asUser(author);
    const n = (
      await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
        JSON.stringify({ unidentified_wine_id: unidentifiedWine, quality_score: 80 }),
      ])
    ).rows[0].id;
    await asUser(author);
    await client.query("select public.resolve_unidentified_wine($1, $2)", [unidentifiedWine, wine]);
    assert.deepEqual(await holdsOf(n), [glass]);
    assert.equal(await sees(guest, n), false);
  });
});

test("a curator's merge of someone else's note onto the poured wine is allowed and does not hold it (R3)", async () => {
  await withRollback(async () => {
    const [author, curator, guest, stranger] = await freshProfiles(4);
    const loser = await catalogWine(author);
    const winner = await catalogWine(curator);
    await flight({ host: author, guests: [guest], wineId: winner });
    const n = await note(author, loser);
    await asOwner();
    await client.query("update profiles set is_curator = true where id = $1", [curator]);
    await asUser(curator);
    await client.query("select public.merge_catalog_wines($1, $2)", [loser, winner]);
    await asOwner();
    assert.equal(
      (await client.query("select catalog_wine_id from wset_notes where id = $1", [n])).rows[0].catalog_wine_id,
      winner,
    );
    assert.deepEqual(await holdsOf(n), [], "a move is not an arrival: holding it would be a vanish");
    assert.equal(await sees(stranger, n), true);
  });
});

test("M1's back-fill holds a note whose author already adds an unrevealed glass of its wine", async (t) => {
  if (!M1_FILE) {
    t.skip("runs only while M1 is not live and SHARING_DEFAULTS_APPLY lists it");
    return;
  }
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const { glass } = await flight({ host, guests: [guest], wineId: wine });
    await asOwner();
    const n = (
      await client.query(
        "insert into wset_notes (catalog_wine_id, author_id, quality_score) values ($1, $2, 90) returning id",
        [wine, host],
      )
    ).rows[0].id;
    await client.query(readFileSync(M1_FILE, "utf8"));
    assert.deepEqual(await holdsOf(n), [glass]);
    assert.equal(await sees(guest, n), false);
  }, []);
});

// ---------------------------------------------------------------------------
// 6. The pour link (S11)
// ---------------------------------------------------------------------------

test("a note on the wine of its author's masked pour is held from its save, the pour link hides it too, until that glass's reveal", async () => {
  await withRollback(async () => {
    const [host, guest, stranger] = await freshProfiles(3);
    const poured = await catalogWine(host);
    const keyed = await catalogWine(host); // the glass now names another wine (a Swap)
    const { glass } = await flight({ host, guests: [guest], wineId: keyed });
    await asOwner();
    const lot = (
      await client.query(
        "insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity) values ($1, $2, 1, 2) returning id",
        [host, poured],
      )
    ).rows[0].id;
    const pour = (
      await client.query(
        "insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity) values ($1, $2, $3, 1) returning id",
        [host, lot, poured],
      )
    ).rows[0].id;
    await client.query(
      `insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start, cellar_consumption_id)
       values ($1, $2, $3, true, $4)`,
      [glass, host, lot, pour],
    );
    // The history "Rate" path saves the note first and links the pour in a
    // second request: the note must already be hidden between the two.
    const n = await note(host, poured);
    assert.deepEqual(await holdsOf(n), [glass], "held at its save, keyed to the glass that pours the bottle");
    assert.equal(await sees(stranger, n), false, "hidden before any link");
    await asUser(host);
    await client.query("update cellar_consumptions set wset_note_id = $1 where id = $2", [n, pour]);
    // With the hold row gone, the link alone still hides it (S11 in wset_note_held).
    await asOwner();
    await client.query("delete from wset_note_holds where note_id = $1", [n]);
    assert.equal(await sees(stranger, n), false, "the masked pour hides it");
    assert.equal(await sees(host, n), true);
    assert.deepEqual(await myHeld(host, [n]), [n]);
    await reveal(host, glass);
    assert.equal(await sees(stranger, n), true, "the reveal unmasks the pour");
  });
});

test("the adder's aroma writes on a note others see on the poured wine are refused; on a held note, or by anyone else, they go through", async () => {
  await withRollback(async () => {
    const r = await refs();
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const shared = await note(host, wine, { quality_score: 80 });
    await aroma(shared, r.terms[0]);
    const guests = await note(guest, wine, { quality_score: 70 });
    await flight({ host, guests: [guest], wineId: wine });

    await asUser(host);
    await expectError(
      () =>
        client.query(
          "insert into wset_note_aromas (note_id, term_id, sensed_on_nose, sensed_on_palate) values ($1, $2, true, false)",
          [shared, r.terms[1]],
        ),
      "42501",
      GUARD,
    );
    await expectError(
      () => client.query("update wset_note_aromas set sensed_on_palate = true where note_id = $1", [shared]),
      "42501",
      GUARD,
    );
    await expectError(() => client.query("delete from wset_note_aromas where note_id = $1", [shared]), "42501", GUARD);

    // A new note on the poured wine, aromas included, is held by the time
    // save_wset_note writes its aromas: allowed, and nobody else sees it.
    await asUser(host);
    const held = (
      await client.query("select public.save_wset_note($1::jsonb, $2::jsonb) as id", [
        JSON.stringify({ catalog_wine_id: wine, quality_score: 84 }),
        JSON.stringify([{ term_id: r.terms[1], sensed_on_nose: true }]),
      ])
    ).rows[0].id;
    assert.equal((await holdsOf(held)).length, 1);
    await asUser(host);
    assert.equal(
      (await client.query("delete from wset_note_aromas where note_id = $1", [held])).rowCount,
      1,
      "the author edits a held note's aromas freely",
    );

    await asUser(guest);
    assert.equal(
      (
        await client.query(
          "insert into wset_note_aromas (note_id, term_id, sensed_on_nose, sensed_on_palate) values ($1, $2, true, false)",
          [guests, r.terms[2]],
        )
      ).rowCount,
      1,
      "a guest is not an adder",
    );
  });
});

test("another owner's masked pour pointing at my note does not hide it", async () => {
  await withRollback(async () => {
    const [author, other, stranger] = await freshProfiles(3);
    const wine = await catalogWine(author);
    const n = await note(author, wine);
    await asOwner();
    const lot = (
      await client.query(
        "insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity) values ($1, $2, 1, 2) returning id",
        [other, wine],
      )
    ).rows[0].id;
    const pour = (
      await client.query(
        "insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity, wset_note_id) values ($1, $2, $3, 1, $4) returning id",
        [other, lot, wine, n],
      )
    ).rows[0].id;
    await client.query("insert into flight_holds (consumption_id) values ($1)", [pour]);
    assert.equal(await sees(stranger, n), true);
  });
});

// ---------------------------------------------------------------------------
// 7. The guard (S12)
// ---------------------------------------------------------------------------

test("the adder's update, save_wset_note and delete of a note others see on the poured wine are refused", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const n = await note(host, wine, { quality_score: 80 });
    await flight({ host, guests: [guest], wineId: wine });
    await asUser(host);
    await expectError(
      () => client.query("update wset_notes set taster_notes = 'changed' where id = $1", [n]),
      "42501",
      GUARD,
    );
    await expectError(
      () =>
        client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb)", [
          JSON.stringify({ id: n, catalog_wine_id: wine, quality_score: 81 }),
        ]),
      "42501",
      GUARD,
    );
    await expectError(() => client.query("delete from wset_notes where id = $1", [n]), "42501", GUARD);
  });
});

test("moving any note onto the poured wine is refused", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const poured = await catalogWine(host);
    const other = await catalogWine(host);
    const n = await note(host, other);
    await flight({ host, guests: [guest], wineId: poured });
    await asUser(host);
    await expectError(
      () => client.query("update wset_notes set catalog_wine_id = $2 where id = $1", [n, poured]),
      "42501",
      GUARD,
    );
  });
});

test("the guard allows the author's writes to a held note, a non-adder's writes, and the adder's after the reveal", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const older = await note(host, wine);
    const { glass } = await flight({ host, guests: [guest], wineId: wine });

    const held = await note(host, wine);
    await asUser(host);
    assert.equal((await client.query("update wset_notes set taster_notes = 'x' where id = $1", [held])).rowCount, 1);
    await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb)", [
      JSON.stringify({ id: held, catalog_wine_id: wine, quality_score: 82 }),
    ]);
    assert.equal((await client.query("delete from wset_notes where id = $1", [held])).rowCount, 1);

    const guests = await note(guest, wine);
    await asUser(guest);
    assert.equal((await client.query("update wset_notes set taster_notes = 'g' where id = $1", [guests])).rowCount, 1);
    assert.equal((await client.query("delete from wset_notes where id = $1", [guests])).rowCount, 1);

    await reveal(host, glass);
    await asUser(host);
    assert.equal((await client.query("update wset_notes set taster_notes = 'after' where id = $1", [older])).rowCount, 1);
  });
});

test("service_role and the account scrub are not judged by the guard", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(guest);
    const n = await note(host, wine);
    await flight({ host, guests: [guest], wineId: wine });
    await asServiceRole();
    assert.equal((await client.query("update wset_notes set taster_notes = 'svc' where id = $1", [n])).rowCount, 1);
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [host]);
    assert.equal(
      (await client.query("select count(*)::int as n from wset_notes where author_id = $1", [host])).rows[0].n,
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Grants and ACLs
// ---------------------------------------------------------------------------

test("the profiles client UPDATE grant is exactly the eleven columns", async () => {
  await withRollback(async () => {
    const r = await client.query(
      `select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
                order by a.attname::text collate "C", x.privilege_type collate "C") as acl
         from pg_attribute a, aclexplode(a.attacl) x
        where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped`,
    );
    assert.equal(
      r.rows[0].acl,
      "avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE," +
        "last_seen_at:UPDATE,location:UPDATE,notes_visibility:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE",
    );
  });
});

test("sharing_notices: a person reads and dismisses only their own row, writes nothing else; anon reads nothing", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asOwner();
    await client.query(
      "insert into sharing_notices (user_id, cellar_flipped, notes_shared) values ($1, true, false), ($2, false, true)",
      [a, b],
    );
    await asUser(a);
    assert.deepEqual(
      (await client.query("select user_id from sharing_notices where user_id = any($1)", [[a, b]])).rows.map(
        (r) => r.user_id,
      ),
      [a],
    );
    assert.equal((await client.query("update sharing_notices set dismissed_at = now() where user_id = $1", [b])).rowCount, 0);
    assert.equal((await client.query("update sharing_notices set dismissed_at = now() where user_id = $1", [a])).rowCount, 1);
    await expectError(() => client.query("update sharing_notices set cellar_flipped = false where user_id = $1", [a]), "42501");
    await expectError(
      () => client.query("insert into sharing_notices (user_id, cellar_flipped, notes_shared) values ($1, true, true)", [a]),
      "42501",
    );
    await expectError(() => client.query("delete from sharing_notices where user_id = $1", [a]), "42501");
    await asAnon();
    await expectError(() => client.query("select * from sharing_notices"), "42501");
  });
});

test("wset_note_holds and sharing_m1_open_cellars grant nothing to any client role", async () => {
  await withRollback(async () => {
    for (const table of ["public.wset_note_holds", "public.sharing_m1_open_cellars"]) {
      for (const role of ["anon", "authenticated"]) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          assert.equal(
            (await client.query("select has_table_privilege($1, $2, $3) as ok", [role, table, privilege])).rows[0].ok,
            false,
            `${table} ${role} ${privilege}`,
          );
        }
      }
    }
    const [a] = await freshProfiles(1);
    await asUser(a);
    await expectError(() => client.query("select * from wset_note_holds"), "42501");
    await expectError(() => client.query("select * from sharing_m1_open_cellars"), "42501");
  });
});

test("the new functions' EXECUTE is exactly spec §3.1's", async () => {
  await withRollback(async () => {
    const r = await client.query(
      `select p.oid::regprocedure::text as sig,
              (select string_agg(x.g, ',' order by x.g collate "C")
                 from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                            when a.grantee = p.proowner then 'OWNER'
                                            else pg_get_userbyid(a.grantee)::text end as g
                         from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x) as grantees
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = any($1)
        order by 1`,
      [
        [
          "can_view_notes",
          "wset_note_held",
          "wset_my_held_notes",
          "catalog_wine_unrevealed_glasses_of",
          "wset_notes_hold_on_identity",
          "wines_release_note_holds",
          "wset_notes_rule1_guard",
          "wset_note_aromas_rule1_guard",
          "drop_deleted_profile_sharing_notice",
        ],
      ],
    );
    assert.deepEqual(Object.fromEntries(r.rows.map((x) => [x.sig, x.grantees])), {
      "can_view_notes(uuid)": "OWNER,authenticated,service_role",
      "catalog_wine_unrevealed_glasses_of(uuid,uuid)": "OWNER",
      "drop_deleted_profile_sharing_notice()": "OWNER",
      "wines_release_note_holds()": "OWNER",
      "wset_my_held_notes(uuid[])": "OWNER,authenticated",
      "wset_note_aromas_rule1_guard()": "OWNER",
      "wset_note_held(uuid)": "OWNER,authenticated",
      "wset_notes_hold_on_identity()": "OWNER",
      "wset_notes_rule1_guard()": "OWNER",
    });
  });
});

// ---------------------------------------------------------------------------
// 9. shared_cellar_lots (S13)
// ---------------------------------------------------------------------------

test("shared_cellar_lots blanks the owner-only lot fields for anyone else, keeps the location and the masked quantity", async () => {
  await withRollback(async () => {
    const [owner, viewer] = await freshProfiles(2);
    const wine = await catalogWine(owner);
    await setCellar(owner, "PUBLIC");
    await asOwner();
    const lot = (
      await client.query(
        `insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity, price_per_bottle,
                                  purchase_source, storage_location, lot_note)
         values ($1, $2, 2, 3, 120, 'Wine shop', 'Rack 3', 'Private note text') returning id`,
        [owner, wine],
      )
    ).rows[0].id;
    const pour = (
      await client.query(
        "insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity) values ($1, $2, $3, 1) returning id",
        [owner, lot, wine],
      )
    ).rows[0].id;
    await client.query("insert into flight_holds (consumption_id) values ($1)", [pour]);
    const read = async (who) => {
      await asUser(who);
      const row = (
        await client.query(
          `select lot_note, price_per_bottle, purchase_source, storage_location, quantity
             from public.shared_cellar_lots($1) where id = $2`,
          [owner, lot],
        )
      ).rows[0];
      return { ...row, price_per_bottle: row.price_per_bottle === null ? null : Number(row.price_per_bottle) };
    };
    assert.deepEqual(await read(viewer), {
      lot_note: null,
      price_per_bottle: null,
      purchase_source: null,
      storage_location: "Rack 3",
      quantity: 3,
    });
    assert.deepEqual(await read(owner), {
      lot_note: "Private note text",
      price_per_bottle: 120,
      purchase_source: "Wine shop",
      storage_location: "Rack 3",
      quantity: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// 11. Account deletion
// ---------------------------------------------------------------------------

test("an account deletion drops the notice and the notes, and the guard does not refuse the scrub", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(guest);
    await note(host, wine);
    await flight({ host, guests: [guest], wineId: wine });
    await asOwner();
    await client.query("insert into sharing_notices (user_id, cellar_flipped, notes_shared) values ($1, true, true)", [
      host,
    ]);
    // The auth.users triggers call this same function; a throwaway profile has
    // no auth user, so the suite calls it directly, with no JWT — the way the
    // admin client's and the dashboard's deletions reach it.
    await client.query("select public.scrub_deleted_account($1)", [host]);
    const left = (
      await client.query(
        `select (select count(*)::int from sharing_notices where user_id = $1) as notices,
                (select count(*)::int from wset_notes where author_id = $1) as notes,
                (select deleted_at is not null from profiles where id = $1) as deleted`,
        [host],
      )
    ).rows[0];
    assert.deepEqual(left, { notices: 0, notes: 0, deleted: true });
  });
});

// ---------------------------------------------------------------------------
// 10. M2: the flip, the default, the notices
// ---------------------------------------------------------------------------

async function cellarDefault() {
  await asOwner();
  return (
    await client.query(
      `select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility'`,
    )
  ).rows[0].column_default;
}

test("M2 flips every non-deleted PRIVATE cellar, keeps FRIENDS and deleted rows, and writes exactly the notices", async (t) => {
  if (!M2_FILE) {
    t.skip("runs only while M2 is not live and SHARING_DEFAULTS_APPLY lists it");
    return;
  }
  await withRollback(async () => {
    const people = await freshProfiles(9);
    const [privNone, privNoted, friendsNoted, placeholderOnly, publicNone, gone, heldOnly, blankText, onlyMeNoted] =
      people;
    const wine = await catalogWine(privNone);
    const cellars = {
      [privNone]: "PRIVATE",
      [privNoted]: "PRIVATE",
      [friendsNoted]: "FRIENDS",
      [placeholderOnly]: "PUBLIC",
      [publicNone]: "PUBLIC",
      [gone]: "PRIVATE",
      [heldOnly]: "PUBLIC",
      [blankText]: "PUBLIC",
      [onlyMeNoted]: "PUBLIC",
    };
    for (const [id, value] of Object.entries(cellars)) await setCellar(id, value);
    await note(privNoted, wine, { quality_score: 88 });
    await note(friendsNoted, wine, { taster_notes: "Lovely" });
    await note(placeholderOnly, wine, {}); // the empty "Save all to ratings" row
    await note(blankText, wine, { taster_notes: "  \n " });
    await flight({ host: heldOnly, guests: [publicNone], wineId: wine });
    await note(heldOnly, wine, { quality_score: 90 }); // held: never shown to anyone
    await setNotes(onlyMeNoted, "PRIVATE");
    await note(onlyMeNoted, wine, { quality_score: 70 }); // noted: the flag records facts, the card reads settings
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [gone]);

    await client.query(readFileSync(M2_FILE, "utf8"));

    await asOwner();
    const after = Object.fromEntries(
      (await client.query("select id, cellar_visibility from profiles where id = any($1)", [people])).rows.map((r) => [
        r.id,
        r.cellar_visibility,
      ]),
    );
    assert.deepEqual(after, {
      [privNone]: "PUBLIC",
      [privNoted]: "PUBLIC",
      [friendsNoted]: "FRIENDS",
      [placeholderOnly]: "PUBLIC",
      [publicNone]: "PUBLIC",
      [gone]: "PRIVATE",
      [heldOnly]: "PUBLIC",
      [blankText]: "PUBLIC",
      [onlyMeNoted]: "PUBLIC",
    });
    const notices = Object.fromEntries(
      (
        await client.query(
          "select user_id, cellar_flipped, notes_shared, dismissed_at from sharing_notices where user_id = any($1)",
          [people],
        )
      ).rows.map((r) => [r.user_id, [r.cellar_flipped, r.notes_shared, r.dismissed_at]]),
    );
    assert.deepEqual(notices, {
      [privNone]: [true, false, null],
      [privNoted]: [true, true, null],
      [friendsNoted]: [false, true, null],
      [onlyMeNoted]: [false, true, null],
    });
    assert.equal(
      (await client.query("select count(*)::int as n from profiles where deleted_at is null and cellar_visibility = 'PRIVATE'"))
        .rows[0].n,
      0,
    );
    assert.equal(await cellarDefault(), "'PUBLIC'::cellar_visibility");
  });
});

test("an account made after M2 starts with its cellar and notes visible to everyone, and no notice", async (t) => {
  const live = (await cellarDefault()) === "'PUBLIC'::cellar_visibility";
  if (!M2_FILE && !live) {
    t.skip("M2 is neither live nor in SHARING_DEFAULTS_APPLY");
    return;
  }
  await withRollback(async () => {
    if (M2_FILE) await client.query(readFileSync(M2_FILE, "utf8"));
    await asOwner();
    // handle_new_user inserts (id, display_name, email) and nothing else.
    const row = (
      await client.query(
        `insert into profiles (id, display_name, email)
         values (gen_random_uuid(), 'New account', 'sharing-defaults-new+' || gen_random_uuid()::text || '@blindr.invalid')
         returning id, cellar_visibility, notes_visibility`,
      )
    ).rows[0];
    assert.deepEqual([row.cellar_visibility, row.notes_visibility], ["PUBLIC", "PUBLIC"]);
    assert.equal(
      (await client.query("select count(*)::int as n from sharing_notices where user_id = $1", [row.id])).rows[0].n,
      0,
    );
  });
});

test("dismissSharingNotice's update, as the person, stamps only their own notice", async (t) => {
  if (!M2_FILE) {
    t.skip("runs only while M2 is not live and SHARING_DEFAULTS_APPLY lists it");
    return;
  }
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await setCellar(a, "PRIVATE");
    await setCellar(b, "PRIVATE");
    await client.query(readFileSync(M2_FILE, "utf8"));
    await asUser(a);
    const stamped = await client.query("update sharing_notices set dismissed_at = now() returning user_id");
    assert.deepEqual(
      stamped.rows.map((r) => r.user_id),
      [a],
    );
    await asOwner();
    assert.equal(
      (await client.query("select dismissed_at from sharing_notices where user_id = $1", [b])).rows[0].dismissed_at,
      null,
    );
  });
});
