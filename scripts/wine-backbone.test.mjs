// Wine backbone DB suite. Harness mirrors scripts/wset-notes.test.mjs: a pooled
// pg client (bypasses RLS as owner), withRollback for negative RLS probes, and
// actAs() to become `authenticated` with a JWT sub so auth.uid() resolves.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());

async function withRollback(cb) {
  await client.query("begin");
  try {
    return await cb();
  } finally {
    await client.query("rollback");
  }
}

before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

let cachedIds = null;
async function referenceIds() {
  if (cachedIds) return cachedIds;
  const ids = {};
  for (const [key, table] of [
    ["country", "countries"],
    ["region", "regions"],
    ["appellation", "appellations"],
    ["grape", "grapes"],
    ["producer", "producers"],
  ]) {
    const r = await client.query(`select id from ${table} order by id limit 1`);
    assert.equal(r.rowCount, 1, `${table} needs a row`);
    ids[key] = r.rows[0].id;
  }
  cachedIds = ids;
  return ids;
}

async function profilePair() {
  const r = await client.query("select id from profiles order by id limit 2");
  assert.equal(r.rowCount, 2, "need two profiles");
  return [r.rows[0].id, r.rows[1].id];
}

async function actAs(userId) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId }),
  ]);
  await client.query("set local role authenticated");
}

let catalogSeq = 0;
async function insertCatalog(ids, createdBy, opts = {}) {
  const colour = opts.colour === undefined ? "RED" : opts.colour;
  const style = opts.style === undefined ? "STILL" : opts.style;
  const producer = opts.producer === undefined ? ids.producer : opts.producer;
  // Unique per call so the bottle-identity index doesn't reject repeat inserts.
  const wineName = opts.wineName === undefined ? `Test Wine ${++catalogSeq}` : opts.wineName;
  const r = await client.query(
    `insert into catalog_wines
       (country_id, region_id, appellation_id, primary_grape_id, producer_id,
        vintage_kind, vintage_year, colour, style, wine_name, created_by)
     values ($1,$2,$3,$4,$5,'YEAR',2019,$6,$7,$8,$9) returning id`,
    [ids.country, ids.region, ids.appellation, ids.grape, producer, colour, style, wineName, createdBy],
  );
  return r.rows[0].id;
}

// ---- Task 1: catalog curation ----

test("colour is required — the strict catalog rejects null", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    await assert.rejects(
      insertCatalog(ids, me, { colour: null }),
      (e) => e.code === "23502",
    );
  });
});

test("creator can update their own catalog wine", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me);
    await actAs(me);
    const upd = await client.query("update catalog_wines set wine_name='mine' where id=$1", [id]);
    assert.equal(upd.rowCount, 1);
  });
});

test("non-creator non-curator update affects 0 rows", async () => {
  const ids = await referenceIds();
  const [me, other] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me);
    await actAs(other);
    const upd = await client.query("update catalog_wines set wine_name='hax' where id=$1", [id]);
    assert.equal(upd.rowCount, 0);
  });
});

test("a curator can update another author's catalog wine", async () => {
  const ids = await referenceIds();
  const [me, other] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me);
    await client.query("update profiles set is_curator=true where id=$1", [other]);
    await actAs(other);
    const upd = await client.query("update catalog_wines set wine_name='curated' where id=$1", [id]);
    assert.equal(upd.rowCount, 1);
  });
});

test("an update writes exactly one catalog_wine_edits audit row", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me);
    await actAs(me);
    await client.query("update catalog_wines set wine_name='audited' where id=$1", [id]);
    await client.query("reset role");
    const r = await client.query(
      "select editor_id, after->>'wine_name' as wine_name from catalog_wine_edits where catalog_wine_id=$1",
      [id],
    );
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].editor_id, me);
    assert.equal(r.rows[0].wine_name, "audited");
  });
});

// ---- Task 2: find_or_create_catalog_wine ----

function snapshot(ids, over = {}) {
  return JSON.stringify({
    country_id: ids.country,
    region_id: ids.region,
    appellation_id: ids.appellation,
    primary_grape_id: ids.grape,
    producer_id: ids.producer,
    vintage_kind: "YEAR",
    vintage_year: 2019,
    wine_name: "Snapshot Wine",
    colour: "RED",
    style: "STILL",
    ...over,
  });
}

test("find_or_create dedups on the identity tuple", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    await actAs(me);
    const a = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids)]);
    const b = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids)]);
    assert.equal(a.rows[0].id, b.rows[0].id, "same identity resolves to one wine");
  });
});

test("find_or_create makes a distinct wine for a different producer", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  const p2r = await client.query(
    "select id from producers where id <> $1 order by id limit 1",
    [ids.producer],
  );
  assert.equal(p2r.rowCount, 1, "need a second producer");
  await withRollback(async () => {
    await actAs(me);
    const a = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids)]);
    const b = await client.query(
      "select find_or_create_catalog_wine($1::jsonb) as id",
      [snapshot(ids, { producer_id: p2r.rows[0].id })],
    );
    assert.notEqual(a.rows[0].id, b.rows[0].id);
  });
});

test("find_or_create sets created_by to the caller", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    await actAs(me);
    const a = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids)]);
    await client.query("reset role");
    const r = await client.query("select created_by from catalog_wines where id=$1", [a.rows[0].id]);
    assert.equal(r.rows[0].created_by, me);
  });
});

// ---- Task 3: protected wine_answers.catalog_wine_id ----

async function insertAnswerWine(ids, hostId) {
  const tasting = await client.query(
    "insert into tastings (name, host_id, timing_mode, wine_source) values ('bb', $1, 'LIVE', 'HOST_PROVIDES') returning id",
    [hostId],
  );
  const wine = await client.query(
    "insert into wines (tasting_id, position) values ($1, 1) returning id",
    [tasting.rows[0].id],
  );
  const catalogId = await insertCatalog(ids, hostId);
  await client.query(
    `insert into wine_answers
       (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, catalog_wine_id)
     values ($1,$2,$3,$4,$5,$6,'YEAR',2019,$7)`,
    [wine.rows[0].id, ids.country, ids.region, ids.appellation, ids.grape, ids.producer, catalogId],
  );
  return wine.rows[0].id;
}

test("the catalog link lives on wine_answers, not wines", async () => {
  const onAnswers = await client.query(
    "select 1 from information_schema.columns where table_name='wine_answers' and column_name='catalog_wine_id'",
  );
  const onWines = await client.query(
    "select 1 from information_schema.columns where table_name='wines' and column_name='catalog_wine_id'",
  );
  assert.equal(onAnswers.rowCount, 1, "wine_answers has catalog_wine_id");
  assert.equal(onWines.rowCount, 0, "wines.catalog_wine_id was dropped");
});

test("an answer can hold a catalog id; a bad id fails the FK", async () => {
  const ids = await referenceIds();
  const [host] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, host);
    const wineId = await insertAnswerWine(ids, host);
    const upd = await client.query(
      "update wine_answers set catalog_wine_id=$1 where wine_id=$2 returning catalog_wine_id",
      [catalogId, wineId],
    );
    assert.equal(upd.rows[0].catalog_wine_id, catalogId);
    await assert.rejects(
      client.query("update wine_answers set catalog_wine_id=gen_random_uuid() where wine_id=$1", [wineId]),
      (e) => e.code === "23503",
    );
  });
});

test("an outsider cannot read an unrevealed answer (so the link is hidden)", async () => {
  const ids = await referenceIds();
  const [host, outsider] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, host);
    const wineId = await insertAnswerWine(ids, host);
    await client.query("update wine_answers set catalog_wine_id=$1 where wine_id=$2", [catalogId, wineId]);
    await actAs(outsider);
    const r = await client.query("select catalog_wine_id from wine_answers where wine_id=$1", [wineId]);
    assert.equal(r.rowCount, 0, "unrevealed answer and its catalog link are invisible to an outsider");
  });
});

// ---- Task 5: backfill + enforce NOT NULL ----

test("every wine_answers row resolves to exactly one identity", async () => {
  // catalog_wine_id is nullable now — an unidentified pour sets unidentified_wine_id
  // instead; the wine_answers_one_identity CHECK enforces that exactly one is set.
  const check = await client.query(
    "select 1 from pg_constraint where conname='wine_answers_one_identity'",
  );
  assert.equal(check.rowCount, 1, "the exactly-one-identity check exists");
  const bad = await client.query(
    "select count(*)::int n from wine_answers where num_nonnulls(catalog_wine_id, unidentified_wine_id) <> 1",
  );
  assert.equal(bad.rows[0].n, 0, "no answer violates the one-identity invariant");
});

test("every wine_answers row is linked to a catalog wine", async () => {
  const r = await client.query(
    "select count(*)::int as n from wine_answers where catalog_wine_id is null",
  );
  assert.equal(r.rows[0].n, 0);
});

test("a new answer without a catalog link is rejected", async () => {
  const ids = await referenceIds();
  const [host] = await profilePair();
  await withRollback(async () => {
    const tasting = await client.query(
      "insert into tastings (name, host_id, timing_mode, wine_source) values ('bb', $1, 'LIVE', 'HOST_PROVIDES') returning id",
      [host],
    );
    const wine = await client.query(
      "insert into wines (tasting_id, position) values ($1, 1) returning id",
      [tasting.rows[0].id],
    );
    await assert.rejects(
      client.query(
        `insert into wine_answers
           (wine_id, country_id, region_id, primary_grape_id, producer_id, vintage_kind, vintage_year)
         values ($1,$2,$3,$4,$5,'YEAR',2019)`,
        [wine.rows[0].id, ids.country, ids.region, ids.grape, ids.producer],
      ),
      (e) => e.code === "23514",
    );
  });
});

// ---- Task 6: wset_notes context ----

test("wset_notes context defaults to OPEN and accepts BLIND + tasting_wine_id", async () => {
  const ids = await referenceIds();
  const [me, host] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, me);
    const openNote = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1,$2) returning context_kind, tasting_wine_id",
      [catalogId, me],
    );
    assert.equal(openNote.rows[0].context_kind, "OPEN");
    assert.equal(openNote.rows[0].tasting_wine_id, null);

    const wineId = await insertAnswerWine(ids, host);
    const blindNote = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id, context_kind, tasting_wine_id) values ($1,$2,'BLIND',$3) returning context_kind, tasting_wine_id",
      [catalogId, me, wineId],
    );
    assert.equal(blindNote.rows[0].context_kind, "BLIND");
    assert.equal(blindNote.rows[0].tasting_wine_id, wineId);
  });
});

// ---- Task 7: merge_catalog_wines ----

test("merge repoints notes and answers, tombstones the loser, keeps the snapshot", async () => {
  const ids = await referenceIds();
  const [me, host] = await profilePair();
  await withRollback(async () => {
    const loser = await insertCatalog(ids, me);
    const winner = await insertCatalog(ids, me);
    const note = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1,$2) returning id",
      [loser, me],
    );
    const tasting = await client.query(
      "insert into tastings (name, host_id, timing_mode, wine_source) values ('bb', $1, 'LIVE', 'HOST_PROVIDES') returning id",
      [host],
    );
    const wine = await client.query(
      "insert into wines (tasting_id, position) values ($1, 1) returning id",
      [tasting.rows[0].id],
    );
    await client.query(
      `insert into wine_answers
         (wine_id, country_id, region_id, primary_grape_id, producer_id, vintage_kind, vintage_year, catalog_wine_id)
       values ($1,$2,$3,$4,$5,'YEAR',2019,$6)`,
      [wine.rows[0].id, ids.country, ids.region, ids.grape, ids.producer, loser],
    );

    await actAs(me);
    await client.query("select merge_catalog_wines($1,$2)", [loser, winner]);
    await client.query("reset role");

    const n = await client.query("select catalog_wine_id from wset_notes where id=$1", [note.rows[0].id]);
    assert.equal(n.rows[0].catalog_wine_id, winner, "note repointed to winner");
    const a = await client.query(
      "select catalog_wine_id, country_id, producer_id from wine_answers where wine_id=$1",
      [wine.rows[0].id],
    );
    assert.equal(a.rows[0].catalog_wine_id, winner, "answer link repointed");
    assert.equal(a.rows[0].country_id, ids.country, "snapshot country untouched");
    assert.equal(a.rows[0].producer_id, ids.producer, "snapshot producer untouched");
    const l = await client.query("select merged_into from catalog_wines where id=$1", [loser]);
    assert.equal(l.rows[0].merged_into, winner, "loser tombstoned");
  });
});

test("merge by a non-creator non-curator is rejected", async () => {
  const ids = await referenceIds();
  const [me, other] = await profilePair();
  await withRollback(async () => {
    const loser = await insertCatalog(ids, me);
    const winner = await insertCatalog(ids, me);
    await actAs(other);
    await assert.rejects(
      client.query("select merge_catalog_wines($1,$2)", [loser, winner]),
      (e) => /not authorised/.test(e.message),
    );
  });
});

// ---- P3: wine-hub aggregates ----

// Builds one revealed appearance of `catalogId` with a single scored guess whose
// per-field points come from `points`. The reveal trigger blocks guess writes on
// a revealed wine, so the guess (with its points + scored_at) is inserted while
// the wine is still unrevealed, then the wine is revealed.
async function insertScoredAppearance(ids, hostId, guesserId, catalogId, points, opts = {}) {
  const revealed = opts.revealed === undefined ? true : opts.revealed;
  const scored = opts.scored === undefined ? true : opts.scored;
  const tasting = await client.query(
    "insert into tastings (name, host_id, timing_mode, wine_source) values ('gs', $1, 'LIVE', 'HOST_PROVIDES') returning id",
    [hostId],
  );
  const tid = tasting.rows[0].id;
  const wine = await client.query(
    "insert into wines (tasting_id, position) values ($1, 1) returning id",
    [tid],
  );
  const wid = wine.rows[0].id;
  await client.query(
    `insert into wine_answers
       (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, catalog_wine_id)
     values ($1,$2,$3,$4,$5,$6,'YEAR',2019,$7)`,
    [wid, ids.country, ids.region, ids.appellation, ids.grape, ids.producer, catalogId],
  );
  const part = await client.query(
    "insert into tasting_participants (tasting_id, user_id) values ($1,$2) returning id",
    [tid, guesserId],
  );
  await client.query(
    `insert into guesses
       (wine_id, participant_id, country_points, region_points, appellation_points,
        primary_grape_points, secondary_grape_points, producer_points,
        type_designation_points, vintage_points, total_points, scored_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      wid, part.rows[0].id,
      points.country ?? 0, points.region ?? 0, points.appellation ?? 0,
      points.primary_grape ?? 0, points.secondary_grape ?? 0, points.producer ?? 0,
      points.type_designation ?? 0, points.vintage ?? 0, points.total ?? 0,
      scored ? new Date().toISOString() : null,
    ],
  );
  if (revealed) {
    await client.query("update wines set is_revealed=true where id=$1", [wid]);
  }
  return { tastingId: tid, wineId: wid };
}

test("catalog_wine_descriptors counts term mentions across notes", async () => {
  const ids = await referenceIds();
  const [me, other] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, me);
    const terms = await client.query("select id from wset_aroma_terms order by id limit 2");
    const [t1, t2] = [terms.rows[0].id, terms.rows[1].id];
    const n1 = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1,$2) returning id",
      [catalogId, me],
    );
    const n2 = await client.query(
      "insert into wset_notes (catalog_wine_id, author_id) values ($1,$2) returning id",
      [catalogId, other],
    );
    // t1 flagged by both notes, t2 by one
    await client.query(
      "insert into wset_note_aromas (note_id, term_id, sensed_on_nose) values ($1,$3,true),($2,$3,true)",
      [n1.rows[0].id, n2.rows[0].id, t1],
    );
    await client.query(
      "insert into wset_note_aromas (note_id, term_id, sensed_on_palate) values ($1,$2,true)",
      [n1.rows[0].id, t2],
    );
    const r = await client.query(
      "select term_id, mentions from catalog_wine_descriptors where catalog_wine_id=$1 order by mentions desc",
      [catalogId],
    );
    assert.equal(r.rows[0].term_id, t1);
    assert.equal(r.rows[0].mentions, 2);
    assert.equal(r.rows.find((x) => x.term_id === t2).mentions, 1);
  });
});

test("catalog_wine_guess_stats counts correct fields over revealed scored guesses", async () => {
  const ids = await referenceIds();
  const [host, guesser] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, host);
    await insertScoredAppearance(ids, host, guesser, catalogId, { country: 2, region: 2, total: 4 });
    await insertScoredAppearance(ids, host, guesser, catalogId, { country: 2, total: 2 });
    const r = await client.query("select * from catalog_wine_guess_stats($1)", [catalogId]);
    const s = r.rows[0];
    assert.equal(s.appearances, 2);
    assert.equal(s.guess_count, 2);
    assert.equal(s.country_correct, 2);
    assert.equal(s.region_correct, 1);
    assert.equal(s.appellation_correct, 0);
  });
});

test("catalog_wine_guess_stats excludes unrevealed wines and unscored guesses", async () => {
  const ids = await referenceIds();
  const [host, guesser] = await profilePair();
  await withRollback(async () => {
    const catalogId = await insertCatalog(ids, host);
    await insertScoredAppearance(ids, host, guesser, catalogId, { country: 2, total: 2 }, { revealed: false });
    await insertScoredAppearance(ids, host, guesser, catalogId, { country: 2, total: 2 }, { scored: false });
    const r = await client.query("select * from catalog_wine_guess_stats($1)", [catalogId]);
    const s = r.rows[0];
    assert.equal(s.appearances, 1);
    assert.equal(s.guess_count, 0);
    assert.equal(s.country_correct, 0);
  });
});

// ---- P5: strict catalog + unidentified wines ----

test("catalog_wines identity columns are all NOT NULL", async () => {
  const r = await client.query(
    `select column_name from information_schema.columns
     where table_name='catalog_wines'
       and column_name in ('country_id','region_id','appellation_id','wine_name','producer_id','primary_grape_id','vintage_kind','colour','style')
       and is_nullable='YES'`,
  );
  assert.equal(r.rowCount, 0, "no identity column is nullable");
});

test("find_or_create makes distinct wines for distinct wine names", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    await actAs(me);
    const a = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids, { wine_name: "Cuvee Alpha" })]);
    const b = await client.query("select find_or_create_catalog_wine($1::jsonb) as id", [snapshot(ids, { wine_name: "Cuvee Beta" })]);
    assert.notEqual(a.rows[0].id, b.rows[0].id);
  });
});

test("the bottle-identity index rejects a duplicate wine", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    await insertCatalog(ids, me, { wineName: "Dupe Wine" });
    await assert.rejects(
      insertCatalog(ids, me, { wineName: "Dupe Wine" }),
      (e) => e.code === "23505",
    );
  });
});

test("a wset_note can reference an unidentified wine (dual-FK CHECK)", async () => {
  const [me] = await profilePair();
  await withRollback(async () => {
    const u = await client.query(
      "insert into catalog_wines_unidentified (created_by, reason) values ($1, 'mystery bottle') returning id",
      [me],
    );
    // the unidentified identity alone -> accepted
    const n = await client.query(
      "insert into wset_notes (author_id, unidentified_wine_id) values ($1, $2) returning catalog_wine_id, unidentified_wine_id",
      [me, u.rows[0].id],
    );
    assert.equal(n.rows[0].catalog_wine_id, null);
    assert.equal(n.rows[0].unidentified_wine_id, u.rows[0].id);
    // neither identity -> rejected by the one-identity CHECK. Runs last: the failed
    // statement aborts the transaction, which withRollback then unwinds.
    await assert.rejects(
      client.query("insert into wset_notes (author_id) values ($1)", [me]),
      (e) => e.code === "23514",
    );
  });
});

test("search_catalog_wines requires every query token to match", async () => {
  const ids = await referenceIds();
  const [me] = await profilePair();
  await withRollback(async () => {
    const id = await insertCatalog(ids, me, { wineName: "Zzq Unique Bottling" });
    const hit = await client.query("select id from search_catalog_wines('Zzq', 20) where id=$1", [id]);
    assert.equal(hit.rowCount, 1, "a matching token finds the wine");
    const miss = await client.query(
      "select id from search_catalog_wines('Zzq notarealtoken', 20) where id=$1",
      [id],
    );
    assert.equal(miss.rowCount, 0, "an unmatched token excludes it");
  });
});

test("resolve_unidentified_wine repoints answers and tombstones the record", async () => {
  const ids = await referenceIds();
  const [me, host] = await profilePair();
  await withRollback(async () => {
    const target = await insertCatalog(ids, me, { wineName: "Resolved Target" });
    const u = await client.query(
      "insert into catalog_wines_unidentified (country_id, region_id, primary_grape_id, created_by) values ($1,$2,$3,$4) returning id",
      [ids.country, ids.region, ids.grape, me],
    );
    const uid = u.rows[0].id;
    const tasting = await client.query(
      "insert into tastings (name, host_id, timing_mode, wine_source) values ('bb', $1, 'LIVE', 'HOST_PROVIDES') returning id",
      [host],
    );
    const wine = await client.query(
      "insert into wines (tasting_id, position) values ($1, 1) returning id",
      [tasting.rows[0].id],
    );
    await client.query(
      `insert into wine_answers (wine_id, country_id, region_id, primary_grape_id, producer_id, vintage_kind, vintage_year, unidentified_wine_id)
       values ($1,$2,$3,$4,$5,'YEAR',2019,$6)`,
      [wine.rows[0].id, ids.country, ids.region, ids.grape, ids.producer, uid],
    );

    await actAs(me);
    await client.query("select resolve_unidentified_wine($1,$2)", [uid, target]);
    await client.query("reset role");

    const a = await client.query(
      "select catalog_wine_id, unidentified_wine_id from wine_answers where wine_id=$1",
      [wine.rows[0].id],
    );
    assert.equal(a.rows[0].catalog_wine_id, target, "answer repointed to the catalog wine");
    assert.equal(a.rows[0].unidentified_wine_id, null, "unidentified link cleared");
    const t = await client.query(
      "select resolved_into_catalog_wine_id from catalog_wines_unidentified where id=$1",
      [uid],
    );
    assert.equal(t.rows[0].resolved_into_catalog_wine_id, target, "unidentified tombstoned");
  });
});

test("resolve_unidentified_wine rejects a non-creator non-curator", async () => {
  const ids = await referenceIds();
  const [me, other] = await profilePair();
  await withRollback(async () => {
    const target = await insertCatalog(ids, me, { wineName: "Resolve Guard Target" });
    const u = await client.query(
      "insert into catalog_wines_unidentified (created_by) values ($1) returning id",
      [me],
    );
    await actAs(other);
    await assert.rejects(
      client.query("select resolve_unidentified_wine($1,$2)", [u.rows[0].id, target]),
      (e) => /not authorised/.test(e.message),
    );
  });
});
