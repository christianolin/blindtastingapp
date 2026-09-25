# Training room plan — part: schema and content pipeline (Tasks 1, 13)

**Contract notes** (where this part had to choose; the spec wins over the header, and every name the header lists is kept):
1. **Live names differ from spec §4.1's table** (read-only, production, 2026-09-25). The live archetypes are `A typical Côte de Nuits` (no " red") and `A typical Côte de Beaune`, and the second is a **WHITE** Chardonnay archetype, not "(red)". The back-fill uses the live strings with the spec's appellations (both take the regional `Bourgogne AOC`). The live grape is `Semillon` (no accent), not "Sémillon". Every other string in the table matched live exactly, as did the appellations `Cote Chalonnaise AOC` and `Macon AOC` (no accents) and `Margaux AOC` (Bordeaux also holds a bare `Margaux` that nothing references).
2. **`database.types.ts` `wine_archetypes.Row.wine_place_id` stays `string` in Task 1 and becomes `string | null` in Task 13.** Task 6's part lists `string | null` as consumed from Task 1, but flipping it in Task 1 fails `npx tsc --noEmit` for Tasks 2–5 at exactly three places Task 6 rewrites (`src/app/knowledge/designations/page.tsx` lines 63 and 71, `src/lib/wset/archetype-detail.ts` line 46; verified in a scratch copy). Task 6's new code guards `wine_place_id` with a truthiness check and a `(string | null)[]` filter, so it compiles against either type. `Insert.wine_place_id` is `string | null` (optional) from Task 1, so Task 12's editor can write null. No live row is null before batch 1 lands, which is Task 13; Task 13 flips the Row type and runs `tsc`.
3. `wine_archetypes.primary_grape_id`'s foreign key becomes `ON DELETE RESTRICT`. It was `ON DELETE SET NULL`, which on a NOT NULL column can only fail with a not-null error.
4. `training_attempts` has every column and check of spec §6.1, with explicit constraint names, plus one extra check (`candidates_snapshot` must be a JSON array). `wine_archetypes` gets one named check for typical age (both values ≥ 0 and low ≤ high).
5. `record_training_attempt`'s refusals. These are SQL errors, not §9 UI copy, and Task 9 shows them verbatim: `not signed in` (42501), `a new session takes no note id` (42501), `that session is not yours` (42501), `already revealed` (P0001), `no such wine`, `no such typical wine`, `a session key is required`, `name the wine to reveal`, `the attempt must be an object`, `the note must be an object`, `the aromas must be a list`, `the ranking must be a list` (all 22023). A fresh attempt with no `started_at` uses `now()`. A re-reveal whose note already carries an identity leaves the note alone and still scores the named wine.
6. The batch JSON puts `mousse` as a top-level key next to `sat`, not inside it (Prosecco, Franciacorta, Cava). The generator folds it into `sat.mousse`, the key the matcher and the live Champagne row use. `missingReferenceRows` supports `regions` ({country, region}), `appellations` ({country, region, appellation}) and `grapes` ({name}); it has no countries. Spec §4.7 says an appellation may be added only when its region has "no candidate row". This part reads that as: no appellation in that region whose name, folded (accents, case, punctuation and a trailing AOC/AOP/DOC/DOCG/DOCa/DO/DOP/AVA/DAC/IGT/IGP/GI/PDO/PGI dropped), equals the new name folded. Batch 1 lists nothing.
7. Task 13 creates four files beyond the two the task list names, so the validator and the generator share one pure, tested core. They are `scripts/training/archetype-ladders.mjs` (the §4.4 ladders as plain JS), `scripts/training/archetype-batch.mjs` (the shape checks and the SQL writer), `scripts/training/archetype-batch.test.mjs` (node --test, no database) and `src/lib/training/archetype-ladders.test.ts` (vitest, which pins the JS ladders to `src/lib/wset/vocab.ts` and `types.ts`). The validator also checks the ladders against the live enums on every run.
8. The DB suite `scripts/training-room.test.mjs` connects to production and applies migrations inside transactions that always roll back. As with `scripts/friend-requests.test.mjs`, **only the main session runs it**; an implementer runs `node --check` and eslint on it. Every other database step in this part is read-only (`begin read only` … `rollback`) and safe for an implementer.

**Verified before writing** (read-only against production, 2026-09-25; everything else in a scratch copy of this worktree with `node_modules` junctioned in):
- The migration's whole pre-state block passes against live, run read-only. Both new function bodies compile as read-only DO blocks: PL/pgSQL syntax-checks every embedded statement at compile time, and a planted typo fails with 42601. The post-state and back-fill blocks compile too.
- The 15 back-fill lookups each resolve to exactly one live row (query in Task 1 Step 6).
- The md5 values pinned in the post-state were computed from the exact file text below. The live `scrub_deleted_account` md5, `5a08d60e3af617b6368d3a85cbe05f94`, equals the md5 of the 20260925003000 file's body, so the recreate starts from the true live body.
- After the `database.types.ts` edits, `tsc --noEmit` exits 0. After Task 13's scripts, the validator passes on `data/training/archetypes-batch-1.json` (87 archetypes, 0 errors, 0 warnings) and refuses a broken copy with 6 errors. The generator writes the migration, whose own resolution queries resolve 87/87 archetypes, 881/881 aroma links and 34/34 designation links against live. The pure tests pass (7 node, 3 vitest), and eslint is clean on every script.
- Live constants: `reveal_wine`'s points are country 2, region 3, appellation 5, primary grape 8, secondary grape 2, designation 2, vintage 2 / 1. The enums are in full order: `wset_sweetness` `DRY,OFF_DRY,MEDIUM_DRY,MEDIUM,MEDIUM_SWEET,SWEET,LUSCIOUS`; `wset_appearance_intensity` `PALE,MEDIUM_MINUS,MEDIUM,MEDIUM_PLUS,DEEP`; `wset_level` `LOW,MEDIUM_MINUS,MEDIUM,MEDIUM_PLUS,HIGH`; `vintage_kind` `YEAR,NV,TAWNY`; `wset_note_context` `OPEN,BLIND,TRAINING`.

---

### Task 1: Schema migration, database types and the DB suite

**Files:**
- Create: `supabase/migrations/20260925120000_training_room.sql`
- Create (test): `scripts/training-room.test.mjs`
- Modify: `src/lib/supabase/database.types.ts`, in five places: lines 1288–1320 (`wine_archetypes` Row/Insert), 1323–1338 (`wine_archetype_aromas`, followed by the new `wine_archetype_designations`), line 1340 (the new `training_attempts` goes before `wine_archetype_placements`), lines 1366–1367 (the `wset_notes` comment) and lines 2205–2211 (`record_training_attempt` at the end of `Functions`)

**Interfaces:**
- Consumes: nothing from other tasks. From live: `save_wset_note(jsonb, jsonb)` (SECURITY INVOKER, md5 `9ac29b18bbda5b08bcd9a12e19beb932`), `wset_hue_fits_colour(wset_colour_hue, wine_colour)` (md5 `96339c7d5a5a84074ffc33db8e89d6ba`), `scrub_deleted_account(uuid)` (md5 `5a08d60e3af617b6368d3a85cbe05f94`), `reveal_wine(uuid)`'s point constants.
- Produces (Tasks 6, 9, 10, 11, 12, 13 rely on these exact names):
  - `wine_archetypes`: `wine_place_id uuid` (nullable), `country_id uuid not null → countries`, `region_id uuid not null → regions`, `appellation_id uuid not null → appellations`, `primary_grape_id uuid not null`, `typical_age_low smallint`, `typical_age_high smallint`.
  - `wine_archetype_aromas.signature boolean not null default false`.
  - `wine_archetype_designations (archetype_id, type_designation_id)`, PK on both. Read: `authenticated`. Write: `profiles.is_curator`.
  - `training_attempts` with the spec §6.1 columns. `SELECT` for `authenticated` where `author_id = auth.uid()`; no client write.
  - `record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb) returns jsonb`. `p_attempt = { attempt_id?, session_key, started_at, picked_archetype_id?, guessed_vintage_kind?, guessed_vintage_year?, guessed_vintage_tawny_years?, actual_catalog_wine_id?, candidates_snapshot }`. Returns `{ attempt_id, note_id, points: { country, region, appellation, primary_grape, secondary_grape, type_designation, vintage }, total, possible, actual_archetype_id, hue_cleared }`. EXECUTE: `authenticated` only.
  - `wset_notes_one_identity` admits `num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0 and tasting_wine_id is null and context_kind = 'TRAINING'`.
  - `database.types.ts`: `Tables.wine_archetypes` (the new columns; Row `wine_place_id: string` until Task 13), `Tables.wine_archetype_aromas.Row.signature`, `Tables.wine_archetype_designations`, `Tables.training_attempts`, `Functions.record_training_attempt: { Args: { p_note: Json; p_aromas: Json; p_attempt: Json }; Returns: Json }`.

- [ ] **Step 1: Write the DB suite (the failing test).** Create `scripts/training-room.test.mjs`:

```js
// Training room DB suite (spec docs/superpowers/specs/2026-09-25-training-room-design.md
// §10): the TRAINING branch of wset_notes_one_identity, record_training_attempt
// (fresh attempts, re-reveals, the championship points, D17's style verdict,
// the hue rule, idempotency, refusals and grants), training_attempts' RLS and
// grants, the account-deletion scrub and the 15-row archetype back-fill of
// 20260925120000_training_room.sql.
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
//   TRAINING_ROOM_APPLY=supabase/migrations/20260925120000_training_room.sql \
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
      "A typical Mâconnais -> France / Bourgogne / Macon AOC",
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
```

- [ ] **Step 2: Check the suite parses and lints**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --check scripts/training-room.test.mjs && npx eslint scripts/training-room.test.mjs`
Expected: no output from either.

(Main session only, before the migration exists.) Run `cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/training-room.test.mjs`
Expected: FAIL, 16 tests, 0 pass. With no `TRAINING_ROOM_APPLY`, the first test fails at `insert into wset_notes ... 'TRAINING'` with 23514 (`wset_notes_one_identity`). The RPC tests fail with 42883 (`function public.record_training_attempt(jsonb, jsonb, jsonb) does not exist`). The D17 and back-fill tests fail with 42703 (`column "country_id" ... does not exist`). The maxima test fails with a TypeError, because `pg_get_functiondef` of a missing function is null.

- [ ] **Step 3: Write the migration.** Create `supabase/migrations/20260925120000_training_room.sql` with exactly this content. The two function bodies are md5-pinned in the post-state, so copy them byte for byte, with no reformatting and no trailing spaces:

```sql
-- Training room: the archetype scoring identity, signature aromas, archetype
-- designations, training attempts, the TRAINING note shape and the one RPC
-- that writes a session's result.
--
-- Spec: docs/superpowers/specs/2026-09-25-training-room-design.md (§4.1-§4.3,
-- §6.1-§6.4; D5, D7-D10, D14-D17). Plan:
-- docs/superpowers/plans/2026-09-25-training-room.md, Task 1. Additive for the
-- deployed app (D22): nothing it runs reads the new columns or tables, and
-- every live archetype keeps its map place.
--
-- Written against the LIVE state (read-only, 2026-09-25), never an older
-- migration file alone:
-- * wine_archetypes: 15 rows, all with a wine_place_id; primary_grape_id is
--   null on "A typical Sauternes" alone. The live names differ from the
--   spec's table in two places: "A typical Côte de Nuits" (not "... red") and
--   "A typical Côte de Beaune" (not "... (red)"; it is a WHITE, Chardonnay
--   archetype). Its constraints are the pkey, the two quality checks and
--   three foreign keys (wine_place_id ON DELETE CASCADE, primary and
--   secondary grape ON DELETE SET NULL).
-- * wine_archetype_aromas: 157 rows, primary key (archetype_id, term_id, kind).
-- * The back-fill's live spellings: regions Bourgogne, Champagne, Bordeaux,
--   Loire, Alsace, Rhône, Provence (France); appellations "Vosne-Romanée AOC",
--   "Bourgogne AOC", "Chablis AOC", "Petit Chablis AOC", "Cote Chalonnaise
--   AOC", "Macon AOC", "Champagne AOC", "Margaux AOC" (Bordeaux also holds a
--   bare "Margaux" that nothing references), "Sauternes AOC", "Sancerre AOC",
--   "Alsace AOC", "Côte-Rôtie AOC", "Châteauneuf-du-Pape AOC", "Bandol AOC";
--   grapes "Semillon" (no accent) and "Sauvignon Blanc". All NFC.
-- * wset_notes_one_identity admits exactly one identity, or none on a BLIND
--   note tied to a glass (20260914094500). wset_notes: 10 OPEN, 5 BLIND, 0
--   TRAINING rows.
-- * scrub_deleted_account(uuid) md5 5a08d60e3af617b6368d3a85cbe05f94 (the
--   20260925003000 body): recreated below with one statement added.
--   save_wset_note(jsonb,jsonb) md5 9ac29b18bbda5b08bcd9a12e19beb932 (SECURITY
--   INVOKER) and wset_hue_fits_colour(wset_colour_hue,wine_colour) md5
--   96339c7d5a5a84074ffc33db8e89d6ba are called, not changed.
-- * No training_attempts, wine_archetype_designations or
--   record_training_attempt in any signature.
--
-- What this migration does:
-- 1. wine_archetypes: wine_place_id nullable (D9); country_id, region_id,
--    appellation_id (D8) and typical_age_low/high (D10); the 15 live rows
--    back-filled by exact live name (spec §4.1), Sauternes' grapes
--    (Semillon, Sauvignon Blanc); then the three FKs and primary_grape_id
--    NOT NULL. primary_grape_id's foreign key becomes ON DELETE RESTRICT: SET
--    NULL on a NOT NULL column could only ever fail with a not-null error.
-- 2. wine_archetype_aromas.signature (D5).
-- 3. wine_archetype_designations (§4.3), RLS as wine_archetype_aromas.
-- 4. training_attempts (§6.1): SELECT own for authenticated, no client write.
-- 5. wset_notes_one_identity gains the TRAINING branch (§6.3, D15).
-- 6. scrub_deleted_account deletes the person's attempts (§6.4).
-- 7. record_training_attempt(jsonb, jsonb, jsonb) (§6.2), SECURITY DEFINER,
--    EXECUTE for authenticated only.
--
-- Rule 1: an attempt names a wine only after its taster revealed it, and only
-- to that taster; the note it writes is an ordinary note (public once it has
-- an identity, author-only before). No tasting, glass, guess or answer key is
-- read or written.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. Nothing this migration creates exists yet.
  if to_regclass('public.training_attempts') is not null
     or to_regclass('public.wine_archetype_designations') is not null then
    raise exception 'training_attempts or wine_archetype_designations already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'record_training_attempt';
  if v_text is not null then
    raise exception 'record_training_attempt already exists: %; re-read live before applying', v_text;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and ((table_name = 'wine_archetypes'
                     and column_name in ('country_id', 'region_id', 'appellation_id',
                                         'typical_age_low', 'typical_age_high'))
                    or (table_name = 'wine_archetype_aromas' and column_name = 'signature'))) then
    raise exception 'an archetype column this migration adds already exists';
  end if;

  -- 2. The 15 live archetypes, by name.
  select string_agg(a.name, ' | ' order by a.name collate "C") into v_text from public.wine_archetypes a;
  if v_text is distinct from
       'A typical Alsace Riesling | A typical Bandol | A typical Chablis | A typical Champagne | '
       || 'A typical Châteauneuf-du-Pape | A typical Côte Chalonnaise | A typical Côte de Beaune | '
       || 'A typical Côte de Nuits | A typical Côte-Rôtie | A typical Margaux | A typical Mâconnais | '
       || 'A typical Petit Chablis | A typical Sancerre | A typical Sauternes | A typical Vosne-Romanée' then
    raise exception 'wine_archetypes is not the 15 live rows this file back-fills: %', v_text;
  end if;
  if exists (select 1 from public.wine_archetypes where wine_place_id is null)
     or (select string_agg(name, ',') from public.wine_archetypes where primary_grape_id is null)
          is distinct from 'A typical Sauternes' then
    raise exception 'wine_archetypes place/grape nullability is not the live state (Sauternes alone lacks a grape)';
  end if;

  -- 3. Their constraints, and the aroma links' key.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetypes'::regclass;
  if v_text is distinct from
       'wine_archetypes_pkey PRIMARY KEY (id); '
       || 'wine_archetypes_primary_grape_id_fkey FOREIGN KEY (primary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_quality_high_check CHECK (((quality_high IS NULL) OR ((quality_high >= 50) AND (quality_high <= 100)))); '
       || 'wine_archetypes_quality_low_check CHECK (((quality_low IS NULL) OR ((quality_low >= 50) AND (quality_low <= 100)))); '
       || 'wine_archetypes_secondary_grape_id_fkey FOREIGN KEY (secondary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_wine_place_id_fkey FOREIGN KEY (wine_place_id) REFERENCES wine_places(id) ON DELETE CASCADE' then
    raise exception 'wine_archetypes constraints differ from the live state this file was written against: %', v_text;
  end if;
  if (select pg_get_constraintdef(k.oid) from pg_constraint k
       where k.conrelid = 'public.wine_archetype_aromas'::regclass and k.contype = 'p')
     is distinct from 'PRIMARY KEY (archetype_id, term_id, kind)' then
    raise exception 'wine_archetype_aromas primary key is not (archetype_id, term_id, kind)';
  end if;

  -- 4. The note constraint this file recreates.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from
       'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) '
       || 'AND (context_kind = ''BLIND''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not the live constraint this file was written against';
  end if;

  -- 5. The bodies recreated or called below.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.scrub_deleted_account(uuid)',                     '5a08d60e3af617b6368d3a85cbe05f94'),
    ('public.save_wset_note(jsonb,jsonb)',                     '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_text;
  end if;

  -- 6. The enum labels the RPC writes.
  if not ('TRAINING' = any (enum_range(null::wset_note_context)::text[]))
     or enum_range(null::vintage_kind)::text[] is distinct from array['YEAR', 'NV', 'TAWNY'] then
    raise exception 'wset_note_context lacks TRAINING or vintage_kind is not YEAR, NV, TAWNY';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. wine_archetypes: the scoring identity (D8), typical age (D10), an
--    optional map place (D9).
-- ---------------------------------------------------------------------------
alter table public.wine_archetypes
  alter column wine_place_id drop not null,
  add column country_id uuid,
  add column region_id uuid,
  add column appellation_id uuid,
  add column typical_age_low smallint,
  add column typical_age_high smallint,
  add constraint wine_archetypes_typical_age_check check (
    (typical_age_low is null or typical_age_low >= 0)
    and (typical_age_high is null or typical_age_high >= 0)
    and (typical_age_low is null or typical_age_high is null or typical_age_low <= typical_age_high)
  );

-- The spec §4.1 back-fill, by the live spellings (header). District
-- archetypes take the regional row: "Cote de Nuits-Villages AOC" and "Cote de
-- Beaune AOC" are minor appellations, not the districts.
drop table if exists pg_temp._archetype_backfill;
create temp table _archetype_backfill on commit drop as
select f.archetype,
       array(select a.id from public.wine_archetypes a where a.name = f.archetype) as archetype_ids,
       array(select c.id from public.countries c where c.name = f.country) as country_ids,
       array(select r.id from public.regions r join public.countries c on c.id = r.country_id
              where c.name = f.country and r.name = f.region) as region_ids,
       array(select ap.id from public.appellations ap
               join public.regions r on r.id = ap.region_id
               join public.countries c on c.id = r.country_id
              where c.name = f.country and r.name = f.region and ap.name = f.appellation) as appellation_ids
from (values
  ('A typical Vosne-Romanée',       'France', 'Bourgogne', 'Vosne-Romanée AOC'),
  ('A typical Côte de Nuits',       'France', 'Bourgogne', 'Bourgogne AOC'),
  ('A typical Côte de Beaune',      'France', 'Bourgogne', 'Bourgogne AOC'),
  ('A typical Chablis',             'France', 'Bourgogne', 'Chablis AOC'),
  ('A typical Petit Chablis',       'France', 'Bourgogne', 'Petit Chablis AOC'),
  ('A typical Côte Chalonnaise',    'France', 'Bourgogne', 'Cote Chalonnaise AOC'),
  ('A typical Mâconnais',           'France', 'Bourgogne', 'Macon AOC'),
  ('A typical Champagne',           'France', 'Champagne', 'Champagne AOC'),
  ('A typical Margaux',             'France', 'Bordeaux',  'Margaux AOC'),
  ('A typical Sauternes',           'France', 'Bordeaux',  'Sauternes AOC'),
  ('A typical Sancerre',            'France', 'Loire',     'Sancerre AOC'),
  ('A typical Alsace Riesling',     'France', 'Alsace',    'Alsace AOC'),
  ('A typical Côte-Rôtie',          'France', 'Rhône',     'Côte-Rôtie AOC'),
  ('A typical Châteauneuf-du-Pape', 'France', 'Rhône',     'Châteauneuf-du-Pape AOC'),
  ('A typical Bandol',              'France', 'Provence',  'Bandol AOC')
) as f (archetype, country, region, appellation);

do $$
declare
  v_text text;
begin
  select string_agg(format('%s: archetype %s, country %s, region %s, appellation %s',
                           b.archetype, cardinality(b.archetype_ids), cardinality(b.country_ids),
                           cardinality(b.region_ids), cardinality(b.appellation_ids)), '; ')
    into v_text
  from _archetype_backfill b
  where cardinality(b.archetype_ids) <> 1 or cardinality(b.country_ids) <> 1
     or cardinality(b.region_ids) <> 1 or cardinality(b.appellation_ids) <> 1;
  if v_text is not null or (select count(*) from _archetype_backfill) <> 15 then
    raise exception 'a back-fill name does not resolve to exactly one live row: %', coalesce(v_text, 'row count');
  end if;
  if (select count(*) from public.grapes where name in ('Semillon', 'Sauvignon Blanc')) <> 2 then
    raise exception 'grapes Semillon and Sauvignon Blanc are not both live';
  end if;
end $$;

update public.wine_archetypes a
   set country_id = b.country_ids[1],
       region_id = b.region_ids[1],
       appellation_id = b.appellation_ids[1]
  from _archetype_backfill b
 where a.id = b.archetype_ids[1];

update public.wine_archetypes
   set primary_grape_id = (select g.id from public.grapes g where g.name = 'Semillon'),
       secondary_grape_id = (select g.id from public.grapes g where g.name = 'Sauvignon Blanc')
 where name = 'A typical Sauternes' and primary_grape_id is null;

alter table public.wine_archetypes
  alter column country_id set not null,
  alter column region_id set not null,
  alter column appellation_id set not null,
  alter column primary_grape_id set not null,
  add constraint wine_archetypes_country_id_fkey foreign key (country_id) references public.countries(id),
  add constraint wine_archetypes_region_id_fkey foreign key (region_id) references public.regions(id),
  add constraint wine_archetypes_appellation_id_fkey foreign key (appellation_id) references public.appellations(id);
alter table public.wine_archetypes drop constraint wine_archetypes_primary_grape_id_fkey;
alter table public.wine_archetypes add constraint wine_archetypes_primary_grape_id_fkey
  foreign key (primary_grape_id) references public.grapes(id) on delete restrict;
create index wine_archetypes_country_idx on public.wine_archetypes (country_id);
create index wine_archetypes_region_idx on public.wine_archetypes (region_id);
create index wine_archetypes_appellation_idx on public.wine_archetypes (appellation_id);

-- ---------------------------------------------------------------------------
-- 2. Signature aromas (D5): picking that exact term earns the bonus.
-- ---------------------------------------------------------------------------
alter table public.wine_archetype_aromas add column signature boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Archetype designations (§4.3), RLS as wine_archetype_aromas.
-- ---------------------------------------------------------------------------
create table public.wine_archetype_designations (
  archetype_id uuid not null references public.wine_archetypes(id) on delete cascade,
  type_designation_id uuid not null references public.type_designations(id) on delete cascade,
  primary key (archetype_id, type_designation_id)
);
create index wine_archetype_designations_designation_idx
  on public.wine_archetype_designations (type_designation_id);
alter table public.wine_archetype_designations enable row level security;
create policy "archetype designations read" on public.wine_archetype_designations
  for select to authenticated using (true);
create policy "archetype designations write" on public.wine_archetype_designations
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_curator))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_curator));
revoke all on table public.wine_archetype_designations from public, anon;

-- ---------------------------------------------------------------------------
-- 4. training_attempts (§6.1, verbatim, with explicit constraint names).
-- ---------------------------------------------------------------------------
create table public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  session_key uuid not null,
  note_id uuid not null unique references public.wset_notes(id) on delete cascade,
  picked_archetype_id uuid references public.wine_archetypes(id) on delete set null,
  guessed_vintage_kind vintage_kind,
  guessed_vintage_year smallint
    constraint training_attempts_guessed_vintage_year_check check (guessed_vintage_year between 1900 and 2100),
  guessed_vintage_tawny_years smallint,
  actual_catalog_wine_id uuid references public.catalog_wines(id) on delete restrict,
  actual_archetype_id uuid references public.wine_archetypes(id) on delete set null,
  note_colour_hue wset_colour_hue,
  hue_cleared boolean not null default false,
  candidates_snapshot jsonb not null default '[]',
  country_points smallint,
  region_points smallint,
  appellation_points smallint,
  primary_grape_points smallint,
  secondary_grape_points smallint,
  type_designation_points smallint,
  vintage_points smallint,
  total_points smallint,
  possible_points smallint,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  constraint training_attempts_author_id_session_key_key unique (author_id, session_key),
  constraint training_attempts_scored_when_revealed check ((actual_catalog_wine_id is null) = (scored_at is null)),
  constraint training_attempts_vintage_year_shape
    check (guessed_vintage_kind is null or (guessed_vintage_kind = 'YEAR') = (guessed_vintage_year is not null)),
  constraint training_attempts_vintage_tawny_shape
    check (guessed_vintage_kind is distinct from 'TAWNY' or guessed_vintage_tawny_years is not null),
  constraint training_attempts_snapshot_is_array check (jsonb_typeof(candidates_snapshot) = 'array')
);
create index training_attempts_history_idx on public.training_attempts (author_id, created_at desc, id desc);
alter table public.training_attempts enable row level security;
create policy "training attempts read own" on public.training_attempts
  for select to authenticated using (author_id = auth.uid());
revoke all on table public.training_attempts from public, anon, authenticated;
grant select on public.training_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The TRAINING note shape (§6.3, D15): no identity and no glass until the
--    reveal. Every other shape is unchanged; the read policy already makes an
--    identity-less note author-only.
-- ---------------------------------------------------------------------------
alter table public.wset_notes drop constraint wset_notes_one_identity;
alter table public.wset_notes add constraint wset_notes_one_identity check (
  num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
  or (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
      and tasting_wine_id is not null
      and context_kind = 'BLIND')
  or (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
      and tasting_wine_id is null
      and context_kind = 'TRAINING')
);

-- ---------------------------------------------------------------------------
-- 6. scrub_deleted_account: 20260925003000's body with one addition, the
--    training_attempts delete in step 6 (every call), before the notes. The
--    note cascade would remove them anyway; explicit is clearer (§6.4).
--    `create or replace` keeps its ACL (owner only).
-- ---------------------------------------------------------------------------
create or replace function public.scrub_deleted_account(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_deleted_at timestamptz;
  v_tasting uuid;
  v_gone int;
begin
  -- 0. Serialise on the profile. No profile: nothing of theirs is in public.
  select deleted_at into v_deleted_at from profiles where id = p_user_id for update;
  if not found then
    return;
  end if;

  if v_deleted_at is null then
    -- 1. Hosted, never started, nobody else JOINED or INVITED: nothing is recorded yet (D6a).
    delete from tastings t
     where t.host_id = p_user_id and t.status = 'DRAFT' and t.started_at is null
       and not exists (select 1 from tasting_participants p
                        where p.tasting_id = t.id and p.user_id <> p_user_id
                          and p.status in ('JOINED', 'INVITED'));
    -- 2. Every other hosted tasting that is not finished: finish it, reveal nothing (D6b).
    update tastings set status = 'CLOSED' where host_id = p_user_id and status <> 'CLOSED';
    -- 3. Their places (D6c).
    delete from tasting_places tp using tastings t
     where tp.tasting_id = t.id and t.host_id = p_user_id;
    -- 4. Seats in other people's never-started tastings: their glasses, then the seat (D7a).
    for v_tasting in
      select tp.tasting_id from tasting_participants tp join tastings t on t.id = tp.tasting_id
       where tp.user_id = p_user_id and t.host_id <> p_user_id
         and t.status = 'DRAFT' and t.started_at is null
    loop
      perform 1 from wines where tasting_id = v_tasting for update;
      delete from wines w using tasting_participants tp
       where w.tasting_id = v_tasting and w.contributor_participant_id = tp.id
         and tp.tasting_id = v_tasting and tp.user_id = p_user_id;
      get diagnostics v_gone = row_count;
      if v_gone > 0 then
        -- remove_flight_glass's two statements, so (tasting_id, position) never collides.
        with ordered as (select id, row_number() over (order by position) as ord
                           from wines where tasting_id = v_tasting)
        update wines w set position = -o.ord from ordered o where w.id = o.id;
        update wines set position = -position where tasting_id = v_tasting and position < 0;
      end if;
      delete from tasting_participants where tasting_id = v_tasting and user_id = p_user_id;
    end loop;
    -- 5. Started, unfinished tastings of others: an unanswered seat nothing points at (D7b).
    delete from tasting_participants tp using tastings t
     where tp.tasting_id = t.id and tp.user_id = p_user_id and t.host_id <> p_user_id
       and t.status <> 'CLOSED' and tp.status <> 'JOINED'
       and not exists (select 1 from guesses g where g.participant_id = tp.id)
       and not exists (select 1 from wines w where w.contributor_participant_id = tp.id);
  end if;

  -- 6. Only theirs; every call, so a later call sweeps what a leftover token wrote (D8, D12).
  -- The training room (20260925120000): attempts go before the notes they point at.
  delete from training_attempts where author_id = p_user_id;
  delete from wset_notes where author_id = p_user_id;
  delete from cellar_consumptions where owner_id = p_user_id;
  delete from cellar_lots where owner_id = p_user_id;
  delete from friend_requests where requester_id = p_user_id or recipient_id = p_user_id;
  delete from friendships where user_id = p_user_id or friend_id = p_user_id;
  delete from platform_invites where inviter_id = p_user_id;
  delete from wine_pour_intents where owner_id = p_user_id;
  delete from wine_identity_drafts where owner_id = p_user_id;
  delete from label_reads where user_id = p_user_id;
  if to_regclass('public.auth_sessions') is not null then
    execute 'delete from public.auth_sessions where user_id = $1' using p_user_id;
  end if;
  if to_regclass('public.auth_tokens') is not null then
    execute 'delete from public.auth_tokens where user_id = $1' using p_user_id;
  end if;
  if to_regclass('public.auth_credentials') is not null then
    execute 'delete from public.auth_credentials where user_id = $1' using p_user_id;
  end if;

  -- 7. Scrub and stamp last: deleted_at marks a completed run (D5).
  if v_deleted_at is null then
    update profiles
       set display_name = 'Deleted user',
           email = 'deleted+' || p_user_id::text || '@blindr.invalid',
           avatar_url = null, bio = null, location = null, phone = null,
           favorite_wine_type = null, last_seen_at = null,
           role = 'MEMBER', cellar_visibility = 'PRIVATE', preferred_currency = 'DKK',
           deleted_at = now()
     where id = p_user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. record_training_attempt (§6.2, steps 1-5). SECURITY DEFINER: the note is
--    written through save_wset_note, which runs here as the table owner with
--    RLS bypassed, so this function enforces what the policies would (D14):
--    the caller is signed in; the note is forced to TRAINING, no glass, no
--    unidentified wine, the revealed catalog wine (or none); a fresh attempt
--    takes no client note id; a re-reveal touches only the caller's own row.
--    Points are the championship table's (D7), defined once here and pinned
--    to reveal_wine's by scripts/training-room.test.mjs.
-- ---------------------------------------------------------------------------
create function public.record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  -- The championship maxima (spec D7); the DB suite pins each to reveal_wine's.
  c_country constant smallint := 2;
  c_region constant smallint := 3;
  c_appellation constant smallint := 5;
  c_primary_grape constant smallint := 8;
  c_secondary_grape constant smallint := 2;
  c_type_designation constant smallint := 2;
  c_vintage constant smallint := 2;
  c_vintage_near constant smallint := 1;
  v_uid uuid := auth.uid();
  v_attempt training_attempts%rowtype;
  v_attempt_id uuid;
  v_session uuid;
  v_started timestamptz;
  v_wine_id uuid;
  v_wine catalog_wines%rowtype;
  v_pick_id uuid;
  v_pick wine_archetypes%rowtype;
  v_has_pick boolean := false;
  v_note jsonb;
  v_hue wset_colour_hue;
  v_identities int;
  v_cleared boolean := false;
  v_note_id uuid;
  v_kind vintage_kind;
  v_score boolean := false;
  v_country smallint;
  v_region smallint;
  v_appellation smallint;
  v_primary smallint;
  v_secondary smallint;
  v_designation smallint;
  v_vintage smallint;
  v_actual uuid;
begin
  -- 1. Signed in.
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_attempt is null or jsonb_typeof(p_attempt) <> 'object' then
    raise exception 'the attempt must be an object' using errcode = 'invalid_parameter_value';
  end if;
  v_attempt_id := nullif(p_attempt ->> 'attempt_id', '')::uuid;
  v_wine_id := nullif(p_attempt ->> 'actual_catalog_wine_id', '')::uuid;
  if v_wine_id is not null then
    -- Read as the definer: "catalog read" may hide a blind_pending row from
    -- the caller, and the score is still computed (step 4).
    select * into v_wine from catalog_wines where id = v_wine_id;
    if not found then
      raise exception 'no such wine' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if v_attempt_id is null then
    -- 2. A fresh attempt, idempotent on (caller, session key): a second tab
    --    or a reload returns the first attempt unchanged.
    v_session := nullif(p_attempt ->> 'session_key', '')::uuid;
    if v_session is null then
      raise exception 'a session key is required' using errcode = 'invalid_parameter_value';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('training-session:' || v_uid::text || ':' || v_session::text, 0));
    select * into v_attempt from training_attempts where author_id = v_uid and session_key = v_session;
    if not found then
      if p_note is null or jsonb_typeof(p_note) <> 'object' then
        raise exception 'the note must be an object' using errcode = 'invalid_parameter_value';
      end if;
      if nullif(p_note ->> 'id', '') is not null then
        raise exception 'a new session takes no note id' using errcode = 'insufficient_privilege';
      end if;
      if p_aromas is not null and jsonb_typeof(p_aromas) <> 'array' then
        raise exception 'the aromas must be a list' using errcode = 'invalid_parameter_value';
      end if;
      if jsonb_typeof(coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)) <> 'array' then
        raise exception 'the ranking must be a list' using errcode = 'invalid_parameter_value';
      end if;
      v_pick_id := nullif(p_attempt ->> 'picked_archetype_id', '')::uuid;
      if v_pick_id is not null and not exists (select 1 from wine_archetypes where id = v_pick_id) then
        raise exception 'no such typical wine' using errcode = 'invalid_parameter_value';
      end if;
      v_started := coalesce(nullif(p_attempt ->> 'started_at', '')::timestamptz, now());
      v_hue := nullif(p_note ->> 'colour_hue', '')::wset_colour_hue;
      v_note := (p_note - 'id') || jsonb_build_object(
        'context_kind', 'TRAINING',
        'tasting_wine_id', null,
        'unidentified_wine_id', null,
        'catalog_wine_id', v_wine_id,
        'tasted_on', (v_started at time zone 'UTC')::date);
      -- 2b. A hue that does not fit the revealed wine's colour would be refused
      --     by wset_notes_check_hue: drop it from the note, keep it on the attempt.
      if v_wine_id is not null and not wset_hue_fits_colour(v_hue, v_wine.colour) then
        v_note := jsonb_set(v_note, '{colour_hue}', 'null'::jsonb);
        v_cleared := true;
      end if;
      v_note_id := save_wset_note(v_note, coalesce(p_aromas, '[]'::jsonb));
      v_kind := nullif(p_attempt ->> 'guessed_vintage_kind', '')::vintage_kind;
      insert into training_attempts (
        author_id, session_key, note_id, picked_archetype_id,
        guessed_vintage_kind, guessed_vintage_year, guessed_vintage_tawny_years,
        note_colour_hue, hue_cleared, candidates_snapshot
      ) values (
        v_uid, v_session, v_note_id, v_pick_id,
        v_kind,
        case when v_kind = 'YEAR' then (p_attempt ->> 'guessed_vintage_year')::smallint end,
        case when v_kind = 'TAWNY' then (p_attempt ->> 'guessed_vintage_tawny_years')::smallint end,
        v_hue, v_cleared, coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)
      )
      returning * into v_attempt;
      v_score := v_wine_id is not null;
    end if;
  else
    -- 3. A re-reveal of the caller's own unscored attempt: only the note's
    --    identity and the score are written; p_note, p_aromas, the pick, the
    --    vintage and the ranking are ignored.
    select * into v_attempt from training_attempts
     where id = v_attempt_id and author_id = v_uid
     for update;
    if not found then
      raise exception 'that session is not yours' using errcode = 'insufficient_privilege';
    end if;
    if v_attempt.scored_at is not null then
      raise exception 'already revealed' using errcode = 'P0001';
    end if;
    if v_wine_id is null then
      raise exception 'name the wine to reveal' using errcode = 'invalid_parameter_value';
    end if;
    select n.colour_hue, num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id)
      into v_hue, v_identities
      from wset_notes n where n.id = v_attempt.note_id
     for update;
    if v_identities = 0 then
      v_cleared := not wset_hue_fits_colour(v_hue, v_wine.colour);
      update wset_notes
         set catalog_wine_id = v_wine_id,
             colour_hue = case when wset_hue_fits_colour(colour_hue, v_wine.colour) then colour_hue end
       where id = v_attempt.note_id and num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0;
    end if;
    v_score := true;
  end if;

  -- 4. Score against the named wine with the picked archetype's FKs, grapes
  --    and designations; a missing pick scores 0 on every category that applies.
  if v_score then
    if v_attempt.picked_archetype_id is not null then
      select * into v_pick from wine_archetypes where id = v_attempt.picked_archetype_id;
      v_has_pick := found;
    end if;
    v_country := case when v_has_pick and v_pick.country_id = v_wine.country_id then c_country else 0 end;
    v_region := case when v_has_pick and v_pick.region_id = v_wine.region_id then c_region else 0 end;
    v_appellation := case when v_has_pick and v_pick.appellation_id = v_wine.appellation_id then c_appellation else 0 end;
    v_primary := case when v_has_pick and v_pick.primary_grape_id = v_wine.primary_grape_id then c_primary_grape else 0 end;
    v_secondary := case
      when v_wine.secondary_grape_id is null then null
      when v_has_pick and v_pick.secondary_grape_id = v_wine.secondary_grape_id then c_secondary_grape
      else 0
    end;
    v_designation := case
      when v_wine.type_designation_id is null then null
      when v_has_pick and exists (select 1 from wine_archetype_designations d
                                   where d.archetype_id = v_pick.id
                                     and d.type_designation_id = v_wine.type_designation_id) then c_type_designation
      else 0
    end;
    -- reveal_wine's vintage rule; null when no vintage was guessed.
    v_vintage := case
      when v_attempt.guessed_vintage_kind is null then null
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'NV' then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'TAWNY'
        and v_attempt.guessed_vintage_tawny_years = v_wine.vintage_tawny_years then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and v_attempt.guessed_vintage_year = v_wine.vintage_year then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and abs(v_attempt.guessed_vintage_year - v_wine.vintage_year) = 1 then c_vintage_near
      else 0
    end;
    -- D17: the wine's own style. Same appellation, colour and style; else same
    -- region, primary grape, colour and style. Ties: the wine's designation,
    -- then the taster's pick, then an equal second grape, sort_order, id.
    select a.id into v_actual
      from wine_archetypes a
     where a.colour = v_wine.colour and a.style = v_wine.style
       and (a.appellation_id = v_wine.appellation_id
            or (a.region_id = v_wine.region_id and a.primary_grape_id = v_wine.primary_grape_id))
     order by (a.appellation_id = v_wine.appellation_id) desc,
              exists (select 1 from wine_archetype_designations d
                       where d.archetype_id = a.id
                         and d.type_designation_id = v_wine.type_designation_id) desc,
              (a.id is not distinct from v_attempt.picked_archetype_id) desc,
              (a.secondary_grape_id is not distinct from v_wine.secondary_grape_id) desc,
              a.sort_order,
              a.id
     limit 1;
    update training_attempts
       set actual_catalog_wine_id = v_wine_id,
           actual_archetype_id = v_actual,
           hue_cleared = v_cleared,
           country_points = v_country,
           region_points = v_region,
           appellation_points = v_appellation,
           primary_grape_points = v_primary,
           secondary_grape_points = v_secondary,
           type_designation_points = v_designation,
           vintage_points = v_vintage,
           total_points = v_country + v_region + v_appellation + v_primary
             + coalesce(v_secondary, 0) + coalesce(v_designation, 0) + coalesce(v_vintage, 0),
           possible_points = c_country + c_region + c_appellation + c_primary_grape
             + case when v_secondary is null then 0 else c_secondary_grape end
             + case when v_designation is null then 0 else c_type_designation end
             + case when v_vintage is null then 0 else c_vintage end,
           scored_at = now()
     where id = v_attempt.id
    returning * into v_attempt;
  end if;

  -- 5. The attempt as stored.
  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'note_id', v_attempt.note_id,
    'points', jsonb_build_object(
      'country', v_attempt.country_points,
      'region', v_attempt.region_points,
      'appellation', v_attempt.appellation_points,
      'primary_grape', v_attempt.primary_grape_points,
      'secondary_grape', v_attempt.secondary_grape_points,
      'type_designation', v_attempt.type_designation_points,
      'vintage', v_attempt.vintage_points),
    'total', v_attempt.total_points,
    'possible', v_attempt.possible_points,
    'actual_archetype_id', v_attempt.actual_archetype_id,
    'hue_cleared', v_attempt.hue_cleared);
end $$;

-- Supabase's default privileges grant EXECUTE on a new function to PUBLIC,
-- anon, authenticated and service_role. auth.uid() is null for anon and
-- service_role, so they lose it too (the transfer_tasting_host OD-1 precedent).
revoke all on function public.record_training_attempt(jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.record_training_attempt(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
begin
  -- 1. wine_archetypes: the new and changed columns.
  select string_agg(format('%s %s%s', a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.wine_archetypes'::regclass and not a.attisdropped
    and a.attname in ('wine_place_id', 'country_id', 'region_id', 'appellation_id', 'primary_grape_id',
                      'typical_age_low', 'typical_age_high');
  if v_text is distinct from
       'appellation_id uuid not null, country_id uuid not null, primary_grape_id uuid not null, '
       || 'region_id uuid not null, typical_age_high int2, typical_age_low int2, wine_place_id uuid' then
    raise exception 'wine_archetypes columns differ from spec §4.1: %', v_text;
  end if;

  -- 2. Its constraints and the three new indexes.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetypes'::regclass;
  if v_text is distinct from
       'wine_archetypes_appellation_id_fkey FOREIGN KEY (appellation_id) REFERENCES appellations(id); '
       || 'wine_archetypes_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(id); '
       || 'wine_archetypes_pkey PRIMARY KEY (id); '
       || 'wine_archetypes_primary_grape_id_fkey FOREIGN KEY (primary_grape_id) REFERENCES grapes(id) ON DELETE RESTRICT; '
       || 'wine_archetypes_quality_high_check CHECK (((quality_high IS NULL) OR ((quality_high >= 50) AND (quality_high <= 100)))); '
       || 'wine_archetypes_quality_low_check CHECK (((quality_low IS NULL) OR ((quality_low >= 50) AND (quality_low <= 100)))); '
       || 'wine_archetypes_region_id_fkey FOREIGN KEY (region_id) REFERENCES regions(id); '
       || 'wine_archetypes_secondary_grape_id_fkey FOREIGN KEY (secondary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_typical_age_check CHECK ((((typical_age_low IS NULL) OR (typical_age_low >= 0)) AND '
       || '((typical_age_high IS NULL) OR (typical_age_high >= 0)) AND '
       || '((typical_age_low IS NULL) OR (typical_age_high IS NULL) OR (typical_age_low <= typical_age_high)))); '
       || 'wine_archetypes_wine_place_id_fkey FOREIGN KEY (wine_place_id) REFERENCES wine_places(id) ON DELETE CASCADE' then
    raise exception 'wine_archetypes constraints differ from spec §4.1: %', v_text;
  end if;
  if (select count(*) from pg_indexes i
       where i.schemaname = 'public' and i.tablename = 'wine_archetypes'
         and i.indexname in ('wine_archetypes_country_idx', 'wine_archetypes_region_idx',
                             'wine_archetypes_appellation_idx')) <> 3 then
    raise exception 'an index on the three new wine_archetypes foreign keys is missing';
  end if;

  -- 3. The back-fill, row by row (spec §4.1), and Sauternes' grapes.
  select string_agg(format('%s -> %s / %s / %s', a.name, c.name, r.name, ap.name), '; ' order by a.name collate "C")
    into v_text
  from public.wine_archetypes a
  join public.countries c on c.id = a.country_id
  join public.regions r on r.id = a.region_id
  join public.appellations ap on ap.id = a.appellation_id;
  if v_text is distinct from
       'A typical Alsace Riesling -> France / Alsace / Alsace AOC; '
       || 'A typical Bandol -> France / Provence / Bandol AOC; '
       || 'A typical Chablis -> France / Bourgogne / Chablis AOC; '
       || 'A typical Champagne -> France / Champagne / Champagne AOC; '
       || 'A typical Châteauneuf-du-Pape -> France / Rhône / Châteauneuf-du-Pape AOC; '
       || 'A typical Côte Chalonnaise -> France / Bourgogne / Cote Chalonnaise AOC; '
       || 'A typical Côte de Beaune -> France / Bourgogne / Bourgogne AOC; '
       || 'A typical Côte de Nuits -> France / Bourgogne / Bourgogne AOC; '
       || 'A typical Côte-Rôtie -> France / Rhône / Côte-Rôtie AOC; '
       || 'A typical Margaux -> France / Bordeaux / Margaux AOC; '
       || 'A typical Mâconnais -> France / Bourgogne / Macon AOC; '
       || 'A typical Petit Chablis -> France / Bourgogne / Petit Chablis AOC; '
       || 'A typical Sancerre -> France / Loire / Sancerre AOC; '
       || 'A typical Sauternes -> France / Bordeaux / Sauternes AOC; '
       || 'A typical Vosne-Romanée -> France / Bourgogne / Vosne-Romanée AOC' then
    raise exception 'the back-fill is not spec §4.1''s table: %', v_text;
  end if;
  if (select format('%s / %s', g1.name, g2.name)
        from public.wine_archetypes a
        join public.grapes g1 on g1.id = a.primary_grape_id
        join public.grapes g2 on g2.id = a.secondary_grape_id
       where a.name = 'A typical Sauternes') is distinct from 'Semillon / Sauvignon Blanc' then
    raise exception 'A typical Sauternes is not Semillon / Sauvignon Blanc';
  end if;
  if exists (select 1 from public.wine_archetypes where wine_place_id is null) then
    raise exception 'a live archetype lost its map place';
  end if;

  -- 4. Signature aromas: a new column, false on every existing link.
  if not exists (select 1 from pg_attribute a
                 join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                 where a.attrelid = 'public.wine_archetype_aromas'::regclass and a.attname = 'signature'
                   and a.atttypid = 'boolean'::regtype and a.attnotnull
                   and pg_get_expr(d.adbin, d.adrelid) = 'false')
     or exists (select 1 from public.wine_archetype_aromas where signature) then
    raise exception 'wine_archetype_aromas.signature is not boolean not null default false, false everywhere';
  end if;

  -- 5. wine_archetype_designations: its key, both cascades, RLS and the two policies.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetype_designations'::regclass;
  if v_text is distinct from
       'wine_archetype_designations_archetype_id_fkey FOREIGN KEY (archetype_id) REFERENCES wine_archetypes(id) ON DELETE CASCADE; '
       || 'wine_archetype_designations_pkey PRIMARY KEY (archetype_id, type_designation_id); '
       || 'wine_archetype_designations_type_designation_id_fkey FOREIGN KEY (type_designation_id) REFERENCES type_designations(id) ON DELETE CASCADE' then
    raise exception 'wine_archetype_designations constraints differ from spec §4.3: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', p.polname, p.polcmd, p.polroles::regrole[]::text,
                           case when p.polcmd = 'r' then pg_get_expr(p.polqual, p.polrelid)
                                when pg_get_expr(p.polqual, p.polrelid) like '%is_curator%'
                                     and pg_get_expr(p.polwithcheck, p.polrelid) like '%is_curator%' then 'curator'
                                else 'other' end),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.wine_archetype_designations'::regclass;
  if v_text is distinct from
       'archetype designations read r {authenticated} true; archetype designations write * {authenticated} curator'
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.wine_archetype_designations'::regclass)
     or has_table_privilege('anon', 'public.wine_archetype_designations', 'SELECT') then
    raise exception 'wine_archetype_designations RLS is not "read: authenticated, write: curators": %', v_text;
  end if;

  -- 6. training_attempts: the columns of spec §6.1, in order.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g') end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.training_attempts'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id uuid not null default gen_random_uuid(), author_id uuid not null, session_key uuid not null, '
       || 'note_id uuid not null, picked_archetype_id uuid, guessed_vintage_kind vintage_kind, '
       || 'guessed_vintage_year int2, guessed_vintage_tawny_years int2, actual_catalog_wine_id uuid, '
       || 'actual_archetype_id uuid, note_colour_hue wset_colour_hue, hue_cleared bool not null default false, '
       || 'candidates_snapshot jsonb not null default ''[]''::jsonb, country_points int2, region_points int2, '
       || 'appellation_points int2, primary_grape_points int2, secondary_grape_points int2, '
       || 'type_designation_points int2, vintage_points int2, total_points int2, possible_points int2, '
       || 'scored_at timestamptz, created_at timestamptz not null default now()' then
    raise exception 'training_attempts columns differ from spec §6.1: %', v_text;
  end if;

  -- 7. Its constraints and the history index.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from
       'training_attempts_actual_archetype_id_fkey FOREIGN KEY (actual_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_actual_catalog_wine_id_fkey FOREIGN KEY (actual_catalog_wine_id) REFERENCES catalog_wines(id) ON DELETE RESTRICT; '
       || 'training_attempts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'training_attempts_author_id_session_key_key UNIQUE (author_id, session_key); '
       || 'training_attempts_guessed_vintage_year_check CHECK (((guessed_vintage_year >= 1900) AND (guessed_vintage_year <= 2100))); '
       || 'training_attempts_note_id_fkey FOREIGN KEY (note_id) REFERENCES wset_notes(id) ON DELETE CASCADE; '
       || 'training_attempts_note_id_key UNIQUE (note_id); '
       || 'training_attempts_picked_archetype_id_fkey FOREIGN KEY (picked_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_pkey PRIMARY KEY (id); '
       || 'training_attempts_scored_when_revealed CHECK (((actual_catalog_wine_id IS NULL) = (scored_at IS NULL))); '
       || 'training_attempts_snapshot_is_array CHECK ((jsonb_typeof(candidates_snapshot) = ''array''::text)); '
       || 'training_attempts_vintage_tawny_shape CHECK (((guessed_vintage_kind IS DISTINCT FROM ''TAWNY''::vintage_kind) OR (guessed_vintage_tawny_years IS NOT NULL))); '
       || 'training_attempts_vintage_year_shape CHECK (((guessed_vintage_kind IS NULL) OR ((guessed_vintage_kind = ''YEAR''::vintage_kind) = (guessed_vintage_year IS NOT NULL))))' then
    raise exception 'training_attempts constraints differ from spec §6.1: %', v_text;
  end if;
  if not exists (select 1 from pg_indexes i
                 where i.schemaname = 'public' and i.tablename = 'training_attempts'
                   and i.indexname = 'training_attempts_history_idx'
                   and i.indexdef like '% USING btree (author_id, created_at DESC, id DESC)') then
    raise exception 'training_attempts_history_idx is missing or is not (author_id, created_at desc, id desc)';
  end if;

  -- 8. RLS on (not forced), exactly the one read policy; authenticated holds
  --    SELECT alone, anon and PUBLIC nothing, no column grant anywhere.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.training_attempts'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'training_attempts row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from 'training attempts read own r permissive {authenticated} (author_id = auth.uid()) -' then
    raise exception 'training_attempts policies differ from spec §6.1: %', v_text;
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.training_attempts'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a table privilege on training_attempts';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.training_attempts'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on training_attempts are %, expected SELECT only', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute t
             where t.attrelid = 'public.training_attempts'::regclass and t.attnum > 0 and t.attacl is not null) then
    raise exception 'training_attempts carries a column-level grant';
  end if;

  -- 9. The note constraint's three shapes (spec §6.3).
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from
       'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) '
       || 'AND (context_kind = ''BLIND''::wset_note_context)) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NULL) '
       || 'AND (context_kind = ''TRAINING''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not spec §6.3''s constraint';
  end if;

  -- 10. Every function this file creates or recreates: security, search_path,
  --     volatility, language, return type, arguments, body (md5 of prosrc with
  --     any CR stripped) and who holds EXECUTE ("OWNER" is the owner).
  for v_fn in
    select s.sig, s.rettype, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.record_training_attempt(jsonb,jsonb,jsonb)', 'jsonb', 'p_note jsonb, p_aromas jsonb, p_attempt jsonb',
       '79b65a0e38ea00be8b8adcc771abcc60', 'OWNER,authenticated'),
      ('public.scrub_deleted_account(uuid)', 'void', 'p_user_id uuid', 'b9aa8d71a00dda3aec526a2ec6950f1d', 'OWNER')
    ) as s (sig, rettype, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if not v_fn.prosecdef
       or v_fn.config_now is distinct from '{search_path=public}'
       or v_fn.volatile_now is distinct from 'v'
       or v_fn.lanname is distinct from 'plpgsql'
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'EXECUTE on record_training_attempt is not authenticated-only';
  end if;

  -- 11. What the RPC calls without changing it.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.save_wset_note(jsonb,jsonb)',                       '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'a function the RPC calls changed: %', v_text;
  end if;

  raise notice 'training room: % archetypes back-filled; training_attempts acl %',
    (select count(*) from public.wine_archetypes where appellation_id is not null),
    (select c.relacl::text from pg_class c where c.oid = 'public.training_attempts'::regclass);
end $$;
```

- [ ] **Step 4: Check the two pinned body md5s match the file**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node --input-type=module -e "$(cat <<'EOF'
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/20260925120000_training_room.sql", "utf8");
const md5 = (sig) => {
  const a = sql.indexOf("$$", sql.indexOf(sig)) + 2;
  return createHash("md5").update(sql.slice(a, sql.indexOf("$$", a)).replace(/\r/g, "")).digest("hex");
};
console.log("scrub", md5("create or replace function public.scrub_deleted_account"));
console.log("rpc", md5("create function public.record_training_attempt"));
EOF
)"
```
Expected, exactly:
```
scrub b9aa8d71a00dda3aec526a2ec6950f1d
rpc 79b65a0e38ea00be8b8adcc771abcc60
```
If either differs, the body was not copied verbatim. Fix the copy; never edit the pinned value to match.

- [ ] **Step 5: Run the pre-state against live and compile both bodies (read-only)**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local --input-type=module -e "$(cat <<'EOF'
// Read-only: the pre-state block against live, and both function bodies compiled as DO blocks.
import { readFileSync } from "node:fs";
import pg from "pg";
import { pgConfig } from "./scripts/wine-map-tiles/lib.mjs";
const sql = readFileSync("supabase/migrations/20260925120000_training_room.sql", "utf8").replace(/\r/g, "");
const pre = sql.slice(sql.indexOf("do $$"), sql.indexOf("end $$;") + "end $$;".length);
const body = (sig) => {
  const a = sql.indexOf("$$", sql.indexOf(sig)) + 2;
  return sql.slice(a, sql.indexOf("$$", a));
};
const asDo = (b, params) =>
  `do $$${b.replace("declare\n", `declare\n${params}`).replace("\nbegin\n", "\nbegin\n  if true then return; end if;\n")}$$;`;
const rpc = body("create function public.record_training_attempt")
  .replace("v_attempt training_attempts%rowtype;", "v_attempt record;")
  .replace("  return jsonb_build_object(", "  perform jsonb_build_object(");
const scrub = body("create or replace function public.scrub_deleted_account");
const c = new pg.Client(pgConfig());
await c.connect();
await c.query("begin read only");
try {
  await c.query(pre);
  console.log("pre-state: OK");
  await c.query(asDo(rpc, "  p_note jsonb;\n  p_aromas jsonb;\n  p_attempt jsonb;\n"));
  console.log("record_training_attempt: compiles");
  await c.query(asDo(scrub, "  p_user_id uuid;\n"));
  console.log("scrub_deleted_account: compiles");
} finally {
  await c.query("rollback");
  await c.end();
}
EOF
)"
```
Expected:
```
pre-state: OK
record_training_attempt: compiles
scrub_deleted_account: compiles
```
(`training_attempts%rowtype` is swapped for `record` only here, because the table does not exist live yet.)

- [ ] **Step 6: Confirm the back-fill resolves (read-only)**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local --input-type=module -e "$(cat <<'EOF'
import { readFileSync } from "node:fs";
import pg from "pg";
import { pgConfig } from "./scripts/wine-map-tiles/lib.mjs";
const sql = readFileSync("supabase/migrations/20260925120000_training_room.sql", "utf8").replace(/\r/g, "");
const start = sql.indexOf("select f.archetype,");
const select = sql.slice(start, sql.indexOf(") as f (archetype, country, region, appellation);", start)) +
  ") as f (archetype, country, region, appellation)";
const c = new pg.Client(pgConfig());
await c.connect();
await c.query("begin read only");
try {
  const { rows } = await c.query(`select count(*)::int as rows,
      count(*) filter (where cardinality(archetype_ids) = 1 and cardinality(country_ids) = 1
                         and cardinality(region_ids) = 1 and cardinality(appellation_ids) = 1)::int as resolved
    from (${select}) x`);
  console.log(rows[0]);
} finally {
  await c.query("rollback");
  await c.end();
}
EOF
)"
```
Expected: `{ rows: 15, resolved: 15 }`

- [ ] **Step 7: Add the new columns, tables and RPC to `src/lib/supabase/database.types.ts`.** The file uses CRLF line endings; the Edit tool keeps them. Five edits.

Edit 1. Replace the `wine_archetypes` Row and Insert (lines 1288–1320):
```ts
      wine_archetypes: {
        Row: {
          id: string;
          wine_place_id: string;
          name: string;
          colour: WineColour;
          style: WineStyle;
          primary_grape_id: string | null;
          secondary_grape_id: string | null;
          description: string | null;
          sat: { [key: string]: [string, string] };
          quality_low: number | null;
          quality_high: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id: string;
          name: string;
          colour: WineColour;
          style?: WineStyle;
          primary_grape_id?: string | null;
          secondary_grape_id?: string | null;
          description?: string | null;
          sat?: { [key: string]: [string, string] };
          quality_low?: number | null;
          quality_high?: number | null;
          sort_order?: number;
          created_at?: string;
        };
```
with
```ts
      wine_archetypes: {
        Row: {
          id: string;
          // Nullable in the database since 20260925120000 (training-room spec
          // D9). Typed `string` until Task 13 of the training-room plan, once
          // Tasks 6, 9 and 12 made every reader tolerate null; no live row is
          // null before batch 1 (20260925130000).
          wine_place_id: string;
          name: string;
          colour: WineColour;
          style: WineStyle;
          // 20260925120000 (spec D8, §4.1): the scoring identity, resolved by
          // exact live name when a batch is written, never at runtime.
          country_id: string;
          region_id: string;
          appellation_id: string;
          primary_grape_id: string;
          secondary_grape_id: string | null;
          description: string | null;
          sat: { [key: string]: [string, string] };
          quality_low: number | null;
          quality_high: number | null;
          // Years from vintage at which the style is usually met (spec D10).
          typical_age_low: number | null;
          typical_age_high: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id?: string | null;
          name: string;
          colour: WineColour;
          style?: WineStyle;
          country_id: string;
          region_id: string;
          appellation_id: string;
          primary_grape_id: string;
          secondary_grape_id?: string | null;
          description?: string | null;
          sat?: { [key: string]: [string, string] };
          quality_low?: number | null;
          quality_high?: number | null;
          typical_age_low?: number | null;
          typical_age_high?: number | null;
          sort_order?: number;
          created_at?: string;
        };
```

Edit 2. Replace the `wine_archetype_aromas` block (lines 1323–1338 plus the blank line after it):
```ts
      wine_archetype_aromas: {
        Row: {
          archetype_id: string;
          term_id: string;
          kind: "NOSE" | "PALATE";
        };
        Insert: {
          archetype_id: string;
          term_id: string;
          kind?: "NOSE" | "PALATE";
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_archetype_aromas"]["Insert"]
        >;
        Relationships: [];
      };
```
with
```ts
      wine_archetype_aromas: {
        Row: {
          archetype_id: string;
          term_id: string;
          kind: "NOSE" | "PALATE";
          // 20260925120000 (spec D5): picking this exact term earns the bonus.
          signature: boolean;
        };
        Insert: {
          archetype_id: string;
          term_id: string;
          kind?: "NOSE" | "PALATE";
          signature?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_archetype_aromas"]["Insert"]
        >;
        Relationships: [];
      };

      // 20260925120000 (training-room spec §4.3): 0..n type designations per
      // archetype. Read: authenticated; write: curators (as the aroma links).
      wine_archetype_designations: {
        Row: {
          archetype_id: string;
          type_designation_id: string;
        };
        Insert: {
          archetype_id: string;
          type_designation_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_archetype_designations"]["Insert"]
        >;
        Relationships: [];
      };
```

Edit 3. Replace the opening line of `wine_archetype_placements` (line 1340):
```ts
      wine_archetype_placements: {
```
with
```ts
      // 20260925120000 (training-room spec §6.1): one row per training
      // session. SELECT own for authenticated; no client INSERT, UPDATE or
      // DELETE grant: only record_training_attempt writes it. Every *_points
      // column is null when that category did not apply or nothing was
      // revealed; scored_at is set exactly when actual_catalog_wine_id is.
      training_attempts: {
        Row: {
          id: string;
          author_id: string;
          session_key: string;
          note_id: string;
          picked_archetype_id: string | null;
          guessed_vintage_kind: VintageKind | null;
          guessed_vintage_year: number | null;
          guessed_vintage_tawny_years: number | null;
          actual_catalog_wine_id: string | null;
          actual_archetype_id: string | null;
          note_colour_hue: WsetColourHue | null;
          hue_cleared: boolean;
          // The full ranking frozen at the reveal (RankingSnapshot, spec §5.8).
          candidates_snapshot: Json;
          country_points: number | null;
          region_points: number | null;
          appellation_points: number | null;
          primary_grape_points: number | null;
          secondary_grape_points: number | null;
          type_designation_points: number | null;
          vintage_points: number | null;
          total_points: number | null;
          possible_points: number | null;
          scored_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          session_key: string;
          note_id: string;
          picked_archetype_id?: string | null;
          guessed_vintage_kind?: VintageKind | null;
          guessed_vintage_year?: number | null;
          guessed_vintage_tawny_years?: number | null;
          actual_catalog_wine_id?: string | null;
          actual_archetype_id?: string | null;
          note_colour_hue?: WsetColourHue | null;
          hue_cleared?: boolean;
          candidates_snapshot?: Json;
          country_points?: number | null;
          region_points?: number | null;
          appellation_points?: number | null;
          primary_grape_points?: number | null;
          secondary_grape_points?: number | null;
          type_designation_points?: number | null;
          vintage_points?: number | null;
          total_points?: number | null;
          possible_points?: number | null;
          scored_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["training_attempts"]["Insert"]
        >;
        Relationships: [];
      };

      wine_archetype_placements: {
```

Edit 4. Replace the `wset_notes` comment (lines 1366–1367):
```ts
          // revealed (M5's wset_notes_one_identity: exactly one of the two,
          // or neither alongside a BLIND context_kind + tasting_wine_id).
```
with
```ts
          // revealed (M5's wset_notes_one_identity: exactly one of the two,
          // or neither alongside a BLIND context_kind + tasting_wine_id, or
          // neither on a TRAINING note with no glass until the training
          // room's reveal, 20260925120000).
```

Edit 5. Replace the end of `Functions` (lines 2205–2211):
```ts
      attach_catalog_wine_photo: {
        Args: { p_catalog_wine_id: string; p_image_path: string; p_via: string };
        Returns: string;
      };
    };
  };
};
```
with
```ts
      attach_catalog_wine_photo: {
        Args: { p_catalog_wine_id: string; p_image_path: string; p_via: string };
        Returns: string;
      };
      // 20260925120000 (training-room spec §6.2): saves a training session's
      // TRAINING note and its training_attempts row, scoring the pick against
      // the revealed catalog wine in SQL. SECURITY DEFINER; EXECUTE for
      // authenticated only. p_attempt: { attempt_id?, session_key, started_at,
      // picked_archetype_id?, guessed_vintage_kind?, guessed_vintage_year?,
      // guessed_vintage_tawny_years?, actual_catalog_wine_id?,
      // candidates_snapshot }. Returns { attempt_id, note_id, points: {
      // country, region, appellation, primary_grape, secondary_grape,
      // type_designation, vintage }, total, possible, actual_archetype_id,
      // hue_cleared }. Refusals, verbatim: "not signed in" (42501), "a new
      // session takes no note id" (42501), "that session is not yours"
      // (42501), "already revealed" (P0001); "no such wine", "no such typical
      // wine", "a session key is required", "name the wine to reveal" and a
      // malformed argument (22023).
      record_training_attempt: {
        Args: { p_note: Json; p_aromas: Json; p_attempt: Json };
        Returns: Json;
      };
    };
  };
};
```

- [ ] **Step 8: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx tsc --noEmit && npx eslint scripts/training-room.test.mjs src/lib/supabase/database.types.ts && node --check scripts/training-room.test.mjs`
Expected: `tsc` exits 0 with no output; eslint prints nothing; `node --check` prints nothing.

- [ ] **Step 9 (main session only): Dry-run the migration and the DB suite against production, rolled back**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local <scratchpad>/apply-migration.mjs supabase/migrations/20260925120000_training_room.sql --dry`
Expected: `DRY RUN OK: 20260925120000_training_room ran in <n> ms and was rolled back`. Every pre-state and post-state assert ran against live inside that transaction; any `FAILED (rolled back): …` names the assert that refused.

Run: `cd /c/Users/Public/repos/blindtastingapp-training && TRAINING_ROOM_APPLY=supabase/migrations/20260925120000_training_room.sql node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/training-room.test.mjs`
Expected: `# tests 16`, `# pass 16`, `# fail 0`. These tests cover every §10 DB case: the TRAINING constraint branch (OPEN and BLIND without identity still refused, author-only read), a fresh attempt scoring 22/22 with the note forced to TRAINING and `tasted_on` the UTC date, a regional pick scoring 13/18 against a village wine, vintage 2/1/0 for YEAR/NV/TAWNY with a null when nothing was guessed, second grape and designation as null, 0 and full, a null pick scoring all zeros, idempotency on `session_key`, the RUBY-on-WHITE hue clearing (fresh and re-reveal), Reveal now using only the stored pick, vintage and ranking, refusals of another person's `attempt_id` (42501) and of an attempt already revealed (P0001), refusals for anon, for a missing user and for a client note id, the client write and read grants, the maxima pinned to `reveal_wine`, D17's order (appellation, then designation, then pick, then second grape, then sort order, and none for a style not in the pool), the scrub, the cascade on note delete, and the back-fill table.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add supabase/migrations/20260925120000_training_room.sql src/lib/supabase/database.types.ts scripts/training-room.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): archetype identity, training_attempts and record_training_attempt" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Content pipeline: the batch validator, the generator and the batch-1 migration

**Files:**
- Create: `scripts/training/archetype-ladders.mjs`
- Create (test): `src/lib/training/archetype-ladders.test.ts`
- Create: `scripts/training/archetype-batch.mjs`
- Create (test): `scripts/training/archetype-batch.test.mjs`
- Create: `scripts/training/validate-archetype-batch.mjs`
- Create: `scripts/training/gen-archetype-batch-migration.mjs`
- Create (generated by Step 12): `supabase/migrations/20260925130000_archetypes_batch_1.sql`
- Modify: `scripts/training-room.test.mjs` (append one test after the last line, the end of Task 1's back-fill test)
- Modify: `src/lib/supabase/database.types.ts` (the `wine_archetypes.Row.wine_place_id` lines Task 1 wrote, lines 1291–1295 after Task 1)
- Read (never written): `data/training/archetypes-batch-1.json`

**Interfaces:**
- Consumes:
  - Task 1: the columns `wine_archetypes.country_id/region_id/appellation_id/typical_age_low/typical_age_high`, the nullable `wine_place_id`, `wine_archetype_aromas.signature` and `wine_archetype_designations`. The generated SQL checks for these first and refuses with `apply 20260925120000_training_room.sql first`.
  - Tasks 6, 9, 12: every reader of `wine_archetypes.wine_place_id` tolerates null (Step 14 flips the type and runs `tsc` to prove it).
  - Existing: `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`; `INTENSITY_STOPS`, `SWEETNESS_STOPS`, `LEVEL_STOPS`, `ALCOHOL_STOPS`, `FORTIFIED_ALCOHOL_STOPS`, `BODY_STOPS`, `FINISH_STOPS`, `DEVELOPMENT_STOPS`, `APPEARANCE_INTENSITY_STOPS`, `HUES_BY_COLOUR` from `src/lib/wset/vocab.ts`.
- Produces:
  - `scripts/training/archetype-ladders.mjs`: `WINE_COLOURS`, `WINE_STYLES`, `APPEARANCE_INTENSITY`, `INTENSITY`, `DEVELOPMENT`, `SWEETNESS`, `LEVEL`, `BODY`, `FINISH`, `MOUSSE`, `ALCOHOL_STOPS`, `FORTIFIED_ALCOHOL_STOPS`, `HUES_BY_COLOUR`, `APPEARANCE_INTENSITY_SLIDER`, `SWEETNESS_SLIDER`, `MATCHED_SCALES`, `ladderFor(scale, { colour, style })`, `sliderStopsFor(scale, wine)`, `rangeProblems(scale, range, wine): string[]`.
  - `scripts/training/archetype-batch.mjs`: `entrySat(entry)`, `entryAromas(entry)`, `missingRows(batch)`, `batchProblems(batch): { errors: string[]; warnings: string[] }`, `sqlText(v)`, `batchCounts(batch)`, `batchMigrationSql(batch, { file, generatedOn }): string`.
  - `scripts/training/validate-archetype-batch.mjs`: `foldName(name)`, `liveProblems(client, batch)`, `validateBatchFile(path)`, `report(result, path)`. As a CLI it takes `[batch.json]`, defaults to batch 1, and exits 1 on any error.
  - `scripts/training/gen-archetype-batch-migration.mjs`: `generate(jsonPath, outPath, generatedOn?)`. As a CLI it takes `<batch.json> <out.sql>`.
  - `supabase/migrations/20260925130000_archetypes_batch_1.sql` (generated; apply after `20260925120000`).
  - `database.types.ts`: `wine_archetypes.Row.wine_place_id: string | null`.

- [ ] **Step 1: Write the failing ladder parity test.** Create `src/lib/training/archetype-ladders.test.ts`:

```ts
// Pins scripts/training/archetype-ladders.mjs (plain node, used by the batch
// validator and generator) to the TypeScript vocabulary, so the two cannot
// drift (training-room spec §4.4). The full-enum ladders are also checked
// against the live enums by validate-archetype-batch.mjs on every run.
import { describe, expect, it } from "vitest";
import {
  ALCOHOL_STOPS as BATCH_ALCOHOL_STOPS,
  APPEARANCE_INTENSITY,
  APPEARANCE_INTENSITY_SLIDER,
  BODY,
  DEVELOPMENT,
  FINISH,
  FORTIFIED_ALCOHOL_STOPS as BATCH_FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR as BATCH_HUES_BY_COLOUR,
  INTENSITY,
  LEVEL,
  MATCHED_SCALES,
  MOUSSE,
  SWEETNESS,
  SWEETNESS_SLIDER,
  WINE_COLOURS,
  WINE_STYLES,
} from "../../../scripts/training/archetype-ladders.mjs";
import type {
  AppearanceIntensity,
  Mousse,
  Sweetness,
  WineColour,
  WineStyle,
  WsetNoteState,
} from "../wset/types";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "../wset/vocab";

// Every member of each union, in src/lib/wset/types.ts order: `satisfies`
// refuses a misspelt member and the Exhaustive checks refuse a missing one.
const FULL_APPEARANCE = [
  "PALE",
  "MEDIUM_MINUS",
  "MEDIUM",
  "MEDIUM_PLUS",
  "DEEP",
] as const satisfies readonly AppearanceIntensity[];
const FULL_SWEETNESS = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
] as const satisfies readonly Sweetness[];
const FULL_MOUSSE = ["DELICATE", "CREAMY", "AGGRESSIVE"] as const satisfies readonly Mousse[];
const FULL_COLOURS = ["WHITE", "ROSE", "RED", "ORANGE"] as const satisfies readonly WineColour[];
const FULL_STYLES = ["STILL", "SPARKLING", "FORTIFIED", "SWEET"] as const satisfies readonly WineStyle[];
type Exhaustive<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : false;
const exhaustive: [
  Exhaustive<AppearanceIntensity, (typeof FULL_APPEARANCE)[number]>,
  Exhaustive<Sweetness, (typeof FULL_SWEETNESS)[number]>,
  Exhaustive<Mousse, (typeof FULL_MOUSSE)[number]>,
  Exhaustive<WineColour, (typeof FULL_COLOURS)[number]>,
  Exhaustive<WineStyle, (typeof FULL_STYLES)[number]>,
] = [true, true, true, true, true];

describe("archetype-ladders.mjs", () => {
  it("lists every member of the full-enum ladders in type order", () => {
    expect(exhaustive).toEqual([true, true, true, true, true]);
    expect(APPEARANCE_INTENSITY).toEqual([...FULL_APPEARANCE]);
    expect(SWEETNESS).toEqual([...FULL_SWEETNESS]);
    expect(MOUSSE).toEqual([...FULL_MOUSSE]);
    expect(WINE_COLOURS).toEqual([...FULL_COLOURS]);
    expect(WINE_STYLES).toEqual([...FULL_STYLES]);
  });

  it("matches the note's slider stops in vocab.ts", () => {
    expect(INTENSITY).toEqual(INTENSITY_STOPS);
    expect(LEVEL).toEqual(LEVEL_STOPS);
    expect(BODY).toEqual(BODY_STOPS);
    expect(FINISH).toEqual(FINISH_STOPS);
    expect(DEVELOPMENT).toEqual(DEVELOPMENT_STOPS);
    expect(BATCH_ALCOHOL_STOPS).toEqual(ALCOHOL_STOPS);
    expect(BATCH_FORTIFIED_ALCOHOL_STOPS).toEqual(FORTIFIED_ALCOHOL_STOPS);
    expect(APPEARANCE_INTENSITY_SLIDER).toEqual(APPEARANCE_INTENSITY_STOPS);
    expect(SWEETNESS_SLIDER).toEqual(SWEETNESS_STOPS);
    expect(BATCH_HUES_BY_COLOUR).toEqual(HUES_BY_COLOUR);
  });

  it("names only scales that are WsetNoteState keys", () => {
    const keys: (keyof WsetNoteState)[] = [
      "appearanceIntensity",
      "colourHue",
      "noseIntensity",
      "development",
      "sweetness",
      "acidity",
      "tannin",
      "alcohol",
      "body",
      "flavourIntensity",
      "finish",
    ];
    expect(MATCHED_SCALES).toEqual(keys);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/archetype-ladders.test.ts`
Expected: FAIL. Vitest cannot resolve `../../../scripts/training/archetype-ladders.mjs` (`Failed to load url` / `Cannot find module`), so 0 tests run.

- [ ] **Step 3: Write the ladders.** Create `scripts/training/archetype-ladders.mjs`:

```js
// The enum ladders a typical wine's SAT ranges live on (training-room spec
// §4.4), for the batch validator and generator, which run as plain node and
// cannot import src/lib/wset/vocab.ts. src/lib/training/archetype-ladders.test.ts
// pins every list here to the TypeScript source (src/lib/wset/types.ts order,
// src/lib/wset/vocab.ts stops), so the two cannot drift.

export const WINE_COLOURS = ["WHITE", "ROSE", "RED", "ORANGE"];
export const WINE_STYLES = ["STILL", "SPARKLING", "FORTIFIED", "SWEET"];

// Full enum order (low -> high), spec §4.4.
export const APPEARANCE_INTENSITY = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
export const INTENSITY = ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "PRONOUNCED"];
export const DEVELOPMENT = ["YOUTHFUL", "DEVELOPING", "FULLY_DEVELOPED", "TIRED_PAST_BEST"];
export const SWEETNESS = ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"];
export const LEVEL = ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"];
export const BODY = ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "FULL"];
export const FINISH = ["SHORT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "LONG"];
export const MOUSSE = ["DELICATE", "CREAMY", "AGGRESSIVE"];
// Alcohol: three stops on an unfortified wine, five on a fortified one.
export const ALCOHOL_STOPS = ["LOW", "MEDIUM", "HIGH"];
export const FORTIFIED_ALCOHOL_STOPS = ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"];
export const HUES_BY_COLOUR = {
  WHITE: ["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"],
  ROSE: ["PINK", "SALMON", "ORANGE"],
  RED: ["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"],
  ORANGE: ["GOLD", "AMBER", "BROWN"],
};

// What the note's sliders can produce (src/lib/wset/vocab.ts *_STOPS): a range
// must include at least one of these, or no taster can ever land inside it.
export const APPEARANCE_INTENSITY_SLIDER = ["PALE", "MEDIUM", "DEEP"];
export const SWEETNESS_SLIDER = ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"];

// The matched SAT keys (spec §4.4); mousse only on a sparkling wine.
export const MATCHED_SCALES = [
  "appearanceIntensity",
  "colourHue",
  "noseIntensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "alcohol",
  "body",
  "flavourIntensity",
  "finish",
];

// The ladder a scale's range must lie on, for a wine of this colour and style;
// null for a key that is not a matched scale here.
export function ladderFor(scale, { colour, style }) {
  switch (scale) {
    case "appearanceIntensity":
      return APPEARANCE_INTENSITY;
    case "colourHue":
      return HUES_BY_COLOUR[colour] ?? null;
    case "noseIntensity":
    case "flavourIntensity":
      return INTENSITY;
    case "development":
      return DEVELOPMENT;
    case "sweetness":
      return SWEETNESS;
    case "acidity":
    case "tannin":
      return LEVEL;
    case "alcohol":
      return style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
    case "body":
      return BODY;
    case "finish":
      return FINISH;
    case "mousse":
      return style === "SPARKLING" ? MOUSSE : null;
    default:
      return null;
  }
}

// The values the note's slider for this scale can produce.
export function sliderStopsFor(scale, wine) {
  if (scale === "appearanceIntensity") return APPEARANCE_INTENSITY_SLIDER;
  if (scale === "sweetness") return SWEETNESS_SLIDER;
  return ladderFor(scale, wine);
}

// Every problem with one [low, high] range, as sentences; [] when it is sound.
export function rangeProblems(scale, range, wine) {
  const ladder = ladderFor(scale, wine);
  if (!ladder) return [`${scale} is not a scale a ${wine.colour} ${wine.style} typical wine carries`];
  if (!Array.isArray(range) || range.length !== 2 || range.some((v) => typeof v !== "string")) {
    return [`${scale} must be a [low, high] pair of strings`];
  }
  const [lo, hi] = range;
  const problems = [];
  if (!ladder.includes(lo)) problems.push(`${scale} low "${lo}" is not on its ladder (${ladder.join(", ")})`);
  if (!ladder.includes(hi)) problems.push(`${scale} high "${hi}" is not on its ladder (${ladder.join(", ")})`);
  if (problems.length > 0) return problems;
  const from = ladder.indexOf(lo);
  const to = ladder.indexOf(hi);
  if (from > to) return [`${scale} low "${lo}" is above high "${hi}"`];
  const slider = sliderStopsFor(scale, wine);
  if (!ladder.slice(from, to + 1).some((v) => slider.includes(v))) {
    return [`${scale} [${lo}, ${hi}] holds no value the note's slider can produce`];
  }
  return [];
}
```

- [ ] **Step 4: Run the parity test and the type check**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/archetype-ladders.test.ts && npx tsc --noEmit`
Expected: `Tests 3 passed (3)`; `tsc` exits 0.

- [ ] **Step 5: Write the failing pure tests for the batch core.** Create `scripts/training/archetype-batch.test.mjs`:

```js
// Pure tests for the training-room batch checks and SQL (no database):
//   node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { batchCounts, batchMigrationSql, batchProblems, entrySat, sqlText } from "./archetype-batch.mjs";
import { ladderFor, rangeProblems } from "./archetype-ladders.mjs";

const SAT = {
  appearanceIntensity: ["PALE", "MEDIUM"],
  colourHue: ["LEMON", "GOLD"],
  noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
  development: ["YOUTHFUL", "DEVELOPING"],
  sweetness: ["DRY", "DRY"],
  acidity: ["HIGH", "HIGH"],
  tannin: ["LOW", "LOW"],
  alcohol: ["MEDIUM", "MEDIUM"],
  body: ["MEDIUM_MINUS", "MEDIUM"],
  flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
  finish: ["MEDIUM_PLUS", "LONG"],
};
const aromas = (terms) => terms.map(([group, term, signature = false]) => ({ group, term, signature }));
const entry = (over = {}) => ({
  name: "A typical Test d'Asti",
  country: "France",
  region: "Champagne",
  appellation: "Champagne AOC",
  placeCanonicalKey: null,
  colour: "WHITE",
  style: "SPARKLING",
  primaryGrape: "Chardonnay",
  secondaryGrape: "Pinot Noir",
  designations: ["Brut"],
  typicalAge: [2, 10],
  quality: [85, 95],
  sat: { ...SAT },
  mousse: ["CREAMY", "CREAMY"],
  nose: aromas([
    ["Citrus", "lemon"],
    ["Green fruit", "green apple"],
    ["Autolytic", "brioche", true],
    ["Autolytic", "toast"],
  ]),
  palate: aromas([
    ["Citrus", "lemon"],
    ["Green fruit", "green apple"],
    ["Autolytic", "brioche", true],
    ["Autolytic", "biscuit"],
  ]),
  description: "Test only.",
  ...over,
});
const batchOf = (...archetypes) => ({
  batch: 9,
  missingReferenceRows: { regions: [], appellations: [], grapes: [] },
  archetypes,
});

test("a sound entry has no errors and no warnings", () => {
  assert.deepEqual(batchProblems(batchOf(entry())), { errors: [], warnings: [] });
});

test("the committed batch-1 file is sound", () => {
  const batch = JSON.parse(readFileSync("data/training/archetypes-batch-1.json", "utf8"));
  assert.deepEqual(batchProblems(batch).errors, []);
});

test("ranges lie on their ladder and hold a value the slider can produce (spec §4.4)", () => {
  const red = { colour: "RED", style: "STILL" };
  const port = { colour: "RED", style: "FORTIFIED" };
  assert.deepEqual(rangeProblems("tannin", ["MEDIUM_PLUS", "HIGH"], red), []);
  assert.deepEqual(rangeProblems("tannin", ["MEDIUM", "LOUD"], red), [
    'tannin high "LOUD" is not on its ladder (LOW, MEDIUM_MINUS, MEDIUM, MEDIUM_PLUS, HIGH)',
  ]);
  assert.deepEqual(rangeProblems("acidity", ["HIGH", "MEDIUM"], red), ['acidity low "HIGH" is above high "MEDIUM"']);
  assert.deepEqual(rangeProblems("alcohol", ["MEDIUM", "MEDIUM_PLUS"], red), [
    'alcohol high "MEDIUM_PLUS" is not on its ladder (LOW, MEDIUM, HIGH)',
  ]);
  assert.deepEqual(rangeProblems("alcohol", ["MEDIUM_PLUS", "HIGH"], port), []);
  assert.deepEqual(rangeProblems("appearanceIntensity", ["MEDIUM_PLUS", "DEEP"], red), []);
  assert.deepEqual(rangeProblems("appearanceIntensity", ["MEDIUM_MINUS", "MEDIUM_MINUS"], red), [
    "appearanceIntensity [MEDIUM_MINUS, MEDIUM_MINUS] holds no value the note's slider can produce",
  ]);
  assert.deepEqual(rangeProblems("sweetness", ["MEDIUM", "MEDIUM"], red), [
    "sweetness [MEDIUM, MEDIUM] holds no value the note's slider can produce",
  ]);
  assert.deepEqual(rangeProblems("colourHue", ["RUBY", "GARNET"], { colour: "WHITE", style: "STILL" }), [
    'colourHue low "RUBY" is not on its ladder (LEMON_GREEN, LEMON, GOLD, AMBER, BROWN)',
    'colourHue high "GARNET" is not on its ladder (LEMON_GREEN, LEMON, GOLD, AMBER, BROWN)',
  ]);
  assert.deepEqual(rangeProblems("tannin", ["LOW"], red), ["tannin must be a [low, high] pair of strings"]);
  assert.equal(ladderFor("mousse", red), null);
  assert.deepEqual(ladderFor("colourHue", { colour: "ORANGE", style: "STILL" }), ["GOLD", "AMBER", "BROWN"]);
});

test("structural errors name the entry and the problem", () => {
  const cases = [
    [entry({ clarity: ["CLEAR", "CLEAR"] }), 'unknown key "clarity"'],
    [entry({ sat: { ...SAT, clarity: ["CLEAR", "CLEAR"] } }), `"sat.clarity" is not a matched scale`],
    [entry({ secondaryGrape: "Chardonnay" }), "the secondary grape repeats the primary"],
    [entry({ style: "STILL" }), 'only a sparkling wine carries a "mousse" range'],
    [entry({ mousse: undefined }), 'a sparkling wine needs a "mousse" range'],
    [entry({ colour: "PINKISH" }), 'colour "PINKISH" is not a wine_colour'],
    [entry({ quality: [40, 95] }), '"quality" must be [low, high] points, 50 <= low <= high <= 100'],
    [entry({ typicalAge: [10, 2] }), '"typicalAge" must be null or [low, high] whole years, 0 <= low <= high <= 100'],
    [entry({ designations: ["Brut", "Brut"] }), "a designation appears twice"],
    [entry({ placeCanonicalKey: "" }), '"placeCanonicalKey" must be a string or null'],
    [entry({ name: " A typical Test" }), '"name" must be a trimmed, non-empty string'],
    [
      entry({ nose: [...entry().nose, { group: "Citrus", term: "lemon", signature: false }] }),
      'nose lists "lemon" (Citrus) twice',
    ],
    [
      entry({ palate: [{ group: "Citrus", term: "lemon" }, ...entry().palate.slice(1)] }),
      'every "palate" aroma needs a group, a term and a boolean signature',
    ],
  ];
  for (const [e, message] of cases) {
    const { errors } = batchProblems(batchOf(e));
    assert.ok(
      errors.some((x) => x.startsWith("#1 ") && x.includes(message)),
      `${message} not in ${JSON.stringify(errors)}`,
    );
  }
  const twice = batchProblems(batchOf(entry(), entry()));
  assert.ok(twice.errors.includes("#2 A typical Test d'Asti: the name appears twice in this batch"));
  assert.deepEqual(batchProblems({ archetypes: "no" }).errors, ['the batch file needs an "archetypes" array']);
});

test("warnings let a batch through", () => {
  const noTannin = Object.fromEntries(Object.entries(SAT).filter(([k]) => k !== "tannin"));
  const ok = batchProblems(batchOf(entry({ name: "Test Brut", nose: entry().nose.slice(0, 3), sat: noTannin })));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, [
    '#1 Test Brut: the name does not start with "A typical " (spec §4.8)',
    '#1 Test Brut: no "tannin" range: the matcher skips that scale for it',
    "#1 Test Brut: 3 nose terms (the guide asks for 4-6)",
  ]);
});

test("entrySat folds the mousse range in; batchCounts counts every link", () => {
  assert.deepEqual(entrySat(entry()), { ...SAT, mousse: ["CREAMY", "CREAMY"] });
  assert.deepEqual(entrySat(entry({ style: "STILL", mousse: undefined })), SAT);
  assert.deepEqual(batchCounts(batchOf(entry(), entry({ name: "A typical Two", placeCanonicalKey: "france.champagne" }))), {
    archetypes: 2,
    aromas: 16,
    signatures: 4,
    designations: 2,
    placements: 1,
  });
});

test("the migration SQL quotes, guards and counts from the file", () => {
  const sql = batchMigrationSql(batchOf(entry()), { file: "data/training/test.json", generatedOn: "2026-09-25" });
  assert.equal(sqlText("d'Asti"), "'d''Asti'");
  assert.equal(sqlText(null), "null");
  assert.ok(sql.startsWith("-- Training room: typical wines, batch 9 (spec\n"));
  assert.ok(sql.includes("-- 1 archetypes, 8 aroma links (2 signature),\n-- 1 designation links, 0 map placements.\n"));
  assert.ok(sql.includes("-- Reference rows added: none (missingReferenceRows is empty)."));
  assert.ok(sql.includes("(1, 'A typical Test d''Asti', 'France', 'Champagne', 'Champagne AOC', null, 'WHITE'::wine_colour"));
  assert.ok(sql.includes(`'${JSON.stringify(entrySat(entry()))}'::jsonb`));
  assert.ok(sql.includes("('A typical Test d''Asti', 'NOSE', 'Autolytic', 'brioche', true)"));
  assert.ok(sql.includes("('A typical Test d''Asti', 'Brut');"));
  assert.ok(sql.includes("   where not exists (select 1 from public.wine_archetypes a where a.name = b.name)"));
  assert.ok(sql.includes("  if (select count(*) from _batch_archetypes) <> 1\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_aromas) <> 8\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_aromas where signature) <> 2\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_designations) <> 1 then"));
  assert.ok(!/insert into public\.(regions|appellations|grapes)/.test(sql));
  assert.equal(sql, batchMigrationSql(batchOf(entry()), { file: "data/training/test.json", generatedOn: "2026-09-25" }));

  const withRows = batchMigrationSql(
    {
      ...batchOf(entry()),
      missingReferenceRows: {
        regions: [{ country: "France", region: "Test Region" }],
        appellations: [{ country: "France", region: "Test Region", appellation: "Test AOC" }],
        grapes: [{ name: "Test Grape" }],
      },
    },
    { file: "x.json", generatedOn: "2026-09-25" },
  );
  assert.ok(withRows.includes("-- * region France / Test Region\n-- * appellation France / Test Region / Test AOC\n-- * grape Test Grape\n"));
  assert.ok(withRows.includes("insert into public.grapes (name) values ('Test Grape') on conflict (name) do nothing;"));
  assert.ok(withRows.indexOf("insert into public.regions") < withRows.indexOf("insert into public.appellations"));
  assert.ok(withRows.indexOf("insert into public.appellations") < withRows.indexOf("create temp table _batch_archetypes"));
});
```

- [ ] **Step 6: Run them and see them fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/training/archetype-batch.mjs`: `# pass 0`, `# fail 1`.

- [ ] **Step 7: Write the batch core.** Create `scripts/training/archetype-batch.mjs`:

```js
// Pure checks and SQL for a training-room archetype batch file
// (data/training/archetypes-batch-N.json; spec §4.4, §4.7, §4.8, D21). No
// database access here: validate-archetype-batch.mjs resolves the names against
// live, gen-archetype-batch-migration.mjs writes the migration. Tests:
// scripts/training/archetype-batch.test.mjs (node --test, no database).
import { MATCHED_SCALES, WINE_COLOURS, WINE_STYLES, rangeProblems } from "./archetype-ladders.mjs";

const ENTRY_KEYS = new Set([
  "name",
  "country",
  "region",
  "appellation",
  "placeCanonicalKey",
  "colour",
  "style",
  "primaryGrape",
  "secondaryGrape",
  "designations",
  "typicalAge",
  "quality",
  "sat",
  "mousse",
  "nose",
  "palate",
  "description",
]);

const isText = (v) => typeof v === "string" && v.trim() !== "" && v === v.trim();
const isInt = (v) => Number.isInteger(v);
const isPair = (v, ok) => Array.isArray(v) && v.length === 2 && ok(v[0], v[1]);

// The entry's full SAT profile as stored in wine_archetypes.sat: the matched
// scales plus, on a sparkling wine, the top-level "mousse" range.
export function entrySat(entry) {
  return entry.mousse === undefined ? { ...entry.sat } : { ...entry.sat, mousse: entry.mousse };
}

// Every aroma link of an entry, in file order: nose first, then palate.
export function entryAromas(entry) {
  return [
    ...(entry.nose ?? []).map((a) => ({ ...a, kind: "NOSE" })),
    ...(entry.palate ?? []).map((a) => ({ ...a, kind: "PALATE" })),
  ];
}

// The reference rows a batch may add (spec §4.7), always three arrays.
export function missingRows(batch) {
  const m = batch.missingReferenceRows ?? {};
  return { regions: m.regions ?? [], appellations: m.appellations ?? [], grapes: m.grapes ?? [] };
}

// Shape and ladder problems in one batch, before any database lookup.
// errors refuse the batch; warnings are printed and let it through.
export function batchProblems(batch) {
  const errors = [];
  const warnings = [];
  if (!batch || typeof batch !== "object" || !Array.isArray(batch.archetypes)) {
    return { errors: ['the batch file needs an "archetypes" array'], warnings };
  }
  if (!isInt(batch.batch) || batch.batch < 1) errors.push('"batch" must be a positive integer');
  if (batch.archetypes.length === 0) errors.push("the batch has no archetypes");
  const m = batch.missingReferenceRows;
  if (m !== undefined) {
    for (const key of ["regions", "appellations", "grapes"]) {
      if (!Array.isArray(m?.[key])) errors.push(`missingReferenceRows.${key} must be an array`);
    }
    if (Array.isArray(m?.regions) && m.regions.some((r) => !isText(r?.country) || !isText(r?.region))) {
      errors.push("every missingReferenceRows.regions entry needs a country and a region");
    }
    if (
      Array.isArray(m?.appellations) &&
      m.appellations.some((a) => !isText(a?.country) || !isText(a?.region) || !isText(a?.appellation))
    ) {
      errors.push("every missingReferenceRows.appellations entry needs a country, a region and an appellation");
    }
    if (Array.isArray(m?.grapes) && m.grapes.some((g) => !isText(g?.name))) {
      errors.push("every missingReferenceRows.grapes entry needs a name");
    }
  }

  const seen = new Set();
  batch.archetypes.forEach((entry, i) => {
    const at = `#${i + 1} ${entry && isText(entry.name) ? entry.name : "(no name)"}`;
    const err = (msg) => errors.push(`${at}: ${msg}`);
    const warn = (msg) => warnings.push(`${at}: ${msg}`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      err("is not an object");
      return;
    }
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) err(`unknown key "${key}"`);
    for (const key of ["name", "country", "region", "appellation", "primaryGrape", "description"]) {
      if (!isText(entry[key])) err(`"${key}" must be a trimmed, non-empty string`);
    }
    if (isText(entry.name)) {
      if (seen.has(entry.name)) err("the name appears twice in this batch");
      seen.add(entry.name);
      if (!entry.name.startsWith("A typical ")) warn('the name does not start with "A typical " (spec §4.8)');
    }
    if (entry.secondaryGrape !== null && !isText(entry.secondaryGrape)) {
      err('"secondaryGrape" must be a string or null');
    } else if (entry.secondaryGrape !== null && entry.secondaryGrape === entry.primaryGrape) {
      err("the secondary grape repeats the primary");
    }
    if (entry.placeCanonicalKey !== null && !isText(entry.placeCanonicalKey)) {
      err('"placeCanonicalKey" must be a string or null');
    }
    if (!WINE_COLOURS.includes(entry.colour)) err(`colour "${entry.colour}" is not a wine_colour`);
    if (!WINE_STYLES.includes(entry.style)) err(`style "${entry.style}" is not a wine_style`);
    if (!Array.isArray(entry.designations) || entry.designations.some((d) => !isText(d))) {
      err('"designations" must be an array of names');
    } else if (new Set(entry.designations).size !== entry.designations.length) {
      err("a designation appears twice");
    }
    if (
      entry.typicalAge !== null &&
      !isPair(entry.typicalAge, (lo, hi) => isInt(lo) && isInt(hi) && lo >= 0 && hi <= 100 && lo <= hi)
    ) {
      err('"typicalAge" must be null or [low, high] whole years, 0 <= low <= high <= 100');
    }
    if (!isPair(entry.quality, (lo, hi) => isInt(lo) && isInt(hi) && lo >= 50 && hi <= 100 && lo <= hi)) {
      err('"quality" must be [low, high] points, 50 <= low <= high <= 100');
    }

    // SAT ranges (spec §4.4): only the matched scales, each on its ladder with
    // at least one slider value inside; a mousse range exactly when sparkling.
    if (!entry.sat || typeof entry.sat !== "object" || Array.isArray(entry.sat)) {
      err('"sat" must be an object');
    } else if (WINE_COLOURS.includes(entry.colour) && WINE_STYLES.includes(entry.style)) {
      const wine = { colour: entry.colour, style: entry.style };
      for (const [scale, range] of Object.entries(entry.sat)) {
        if (!MATCHED_SCALES.includes(scale)) {
          err(`"sat.${scale}" is not a matched scale (${MATCHED_SCALES.join(", ")})`);
          continue;
        }
        for (const p of rangeProblems(scale, range, wine)) err(p);
      }
      for (const scale of MATCHED_SCALES) {
        if (!(scale in entry.sat)) warn(`no "${scale}" range: the matcher skips that scale for it`);
      }
      if (entry.style === "SPARKLING") {
        if (entry.mousse === undefined) err('a sparkling wine needs a "mousse" range');
        else for (const p of rangeProblems("mousse", entry.mousse, wine)) err(p);
      } else if (entry.mousse !== undefined) {
        err('only a sparkling wine carries a "mousse" range');
      }
    }

    // Aromas (spec §4.8): {group, term, signature}; a term once per kind.
    for (const kind of ["nose", "palate"]) {
      const list = entry[kind];
      if (!Array.isArray(list)) {
        err(`"${kind}" must be an array`);
        continue;
      }
      const terms = new Set();
      for (const a of list) {
        if (!a || !isText(a.group) || !isText(a.term) || typeof a.signature !== "boolean") {
          err(`every "${kind}" aroma needs a group, a term and a boolean signature`);
          continue;
        }
        const key = `${a.group}|${a.term}`;
        if (terms.has(key)) err(`${kind} lists "${a.term}" (${a.group}) twice`);
        terms.add(key);
      }
      if (list.length < 4 || list.length > 6) warn(`${list.length} ${kind} terms (the guide asks for 4-6)`);
    }
    if (Array.isArray(entry.nose) && Array.isArray(entry.palate)) {
      const signatures = new Set(entryAromas(entry).filter((a) => a && a.signature).map((a) => a.term));
      if (signatures.size > 3) warn(`${signatures.size} signature terms (the guide asks for at most 3)`);
    }
  });
  return { errors, warnings };
}

// A SQL string literal (null for null/undefined).
export function sqlText(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replaceAll("'", "''")}'`;
}

function sqlInt(v) {
  if (v === null || v === undefined) return "null";
  if (!Number.isInteger(v)) throw new Error(`not an integer: ${v}`);
  return String(v);
}

// The counts the migration's asserts check, computed from the file.
export function batchCounts(batch) {
  let aromas = 0;
  let signatures = 0;
  let designations = 0;
  let placements = 0;
  for (const e of batch.archetypes) {
    const links = entryAromas(e);
    aromas += links.length;
    signatures += links.filter((a) => a.signature).length;
    designations += e.designations.length;
    if (e.placeCanonicalKey) placements += 1;
  }
  return { archetypes: batch.archetypes.length, aromas, signatures, designations, placements };
}

// The data migration for one validated batch (spec D21, §4.7). Fail-closed:
// every name is resolved again inside the migration, and anything but exactly
// one live row raises. Idempotent on the archetype name: a name already in
// wine_archetypes is skipped with all its links, so a re-run is a no-op.
export function batchMigrationSql(batch, { file, generatedOn }) {
  const counts = batchCounts(batch);
  const missing = missingRows(batch);
  const lines = [];
  const out = (s = "") => lines.push(s);
  const rowsOut = (rows) => rows.forEach((r, i) => out(`  ${r}${i === rows.length - 1 ? ";" : ","}`));

  out(`-- Training room: typical wines, batch ${batch.batch} (spec`);
  out("-- docs/superpowers/specs/2026-09-25-training-room-design.md §4.7, D21).");
  out(`-- GENERATED from ${file} by scripts/training/gen-archetype-batch-migration.mjs`);
  out(`-- on ${generatedOn}. Edit the JSON and regenerate; never edit this file by hand.`);
  out("--");
  out(`-- ${counts.archetypes} archetypes, ${counts.aromas} aroma links (${counts.signatures} signature),`);
  out(`-- ${counts.designations} designation links, ${counts.placements} map placements.`);
  out("-- Every country, region, appellation, grape, designation, aroma term and map");
  out("-- place is resolved by its exact live name inside its parent; anything but");
  out("-- exactly one row raises. A name already in wine_archetypes is skipped with");
  out("-- all its links, so applying this twice is a no-op.");
  out("--");
  const listed = [
    ...missing.regions.map((r) => `region ${r.country} / ${r.region}`),
    ...missing.appellations.map((a) => `appellation ${a.country} / ${a.region} / ${a.appellation}`),
    ...missing.grapes.map((g) => `grape ${g.name}`),
  ];
  if (listed.length === 0) {
    out("-- Reference rows added: none (missingReferenceRows is empty).");
  } else {
    out("-- Reference rows added (the batch file's missingReferenceRows):");
    for (const l of listed) out(`-- * ${l}`);
  }
  out("--");
  out("-- Requires 20260925120000_training_room.sql. No begin/commit: the applier");
  out("-- owns the transaction.");
  out();
  out("set local lock_timeout = '10s';");
  out("-- A second apply inside one transaction (the DB suite's idempotency test)");
  out("-- would otherwise meet the temp tables of the first.");
  out("drop table if exists pg_temp._batch_archetypes, pg_temp._batch_aromas, pg_temp._batch_designations,");
  out("  pg_temp._batch_resolved, pg_temp._batch_new;");
  out();
  out("do $$");
  out("begin");
  out("  if to_regclass('public.wine_archetype_designations') is null");
  out("     or not exists (select 1 from information_schema.columns");
  out("                    where table_schema = 'public' and table_name = 'wine_archetype_aromas'");
  out("                      and column_name = 'signature')");
  out("     or not exists (select 1 from information_schema.columns");
  out("                    where table_schema = 'public' and table_name = 'wine_archetypes'");
  out("                      and column_name = 'appellation_id') then");
  out("    raise exception 'apply 20260925120000_training_room.sql first';");
  out("  end if;");
  out("end $$;");
  out();

  for (const r of missing.regions) {
    out("insert into public.regions (country_id, name)");
    out(`select c.id, ${sqlText(r.region)} from public.countries c where c.name = ${sqlText(r.country)}`);
    out("on conflict (country_id, name) do nothing;");
  }
  for (const a of missing.appellations) {
    out("insert into public.appellations (region_id, name)");
    out(`select r.id, ${sqlText(a.appellation)}`);
    out("  from public.regions r join public.countries c on c.id = r.country_id");
    out(` where c.name = ${sqlText(a.country)} and r.name = ${sqlText(a.region)}`);
    out("on conflict (region_id, name) do nothing;");
  }
  for (const g of missing.grapes) {
    out(`insert into public.grapes (name) values (${sqlText(g.name)}) on conflict (name) do nothing;`);
  }
  if (listed.length > 0) out();

  out("create temp table _batch_archetypes (");
  out("  ord int primary key,");
  out("  name text not null unique,");
  out("  country text not null, region text not null, appellation text not null,");
  out("  place_key text,");
  out("  colour wine_colour not null, style wine_style not null,");
  out("  primary_grape text not null, secondary_grape text,");
  out("  typical_age_low smallint, typical_age_high smallint,");
  out("  quality_low smallint not null, quality_high smallint not null,");
  out("  sat jsonb not null,");
  out("  description text not null");
  out(") on commit drop;");
  out("insert into _batch_archetypes values");
  rowsOut(
    batch.archetypes.map((e, i) => {
      const age = e.typicalAge ?? [null, null];
      return `(${[
        String(i + 1),
        sqlText(e.name),
        sqlText(e.country),
        sqlText(e.region),
        sqlText(e.appellation),
        sqlText(e.placeCanonicalKey),
        `${sqlText(e.colour)}::wine_colour`,
        `${sqlText(e.style)}::wine_style`,
        sqlText(e.primaryGrape),
        sqlText(e.secondaryGrape),
        sqlInt(age[0]),
        sqlInt(age[1]),
        sqlInt(e.quality[0]),
        sqlInt(e.quality[1]),
        `${sqlText(JSON.stringify(entrySat(e)))}::jsonb`,
        sqlText(e.description),
      ].join(", ")})`;
    }),
  );
  out();
  out("create temp table _batch_aromas (");
  out("  name text not null, kind text not null, group_name text not null, term text not null,");
  out("  signature boolean not null,");
  out("  primary key (name, kind, group_name, term)");
  out(") on commit drop;");
  const aromaRows = batch.archetypes.flatMap((e) =>
    entryAromas(e).map(
      (a) => `(${sqlText(e.name)}, ${sqlText(a.kind)}, ${sqlText(a.group)}, ${sqlText(a.term)}, ${a.signature})`,
    ),
  );
  if (aromaRows.length > 0) {
    out("insert into _batch_aromas values");
    rowsOut(aromaRows);
  }
  out();
  out("create temp table _batch_designations (");
  out("  name text not null, designation text not null,");
  out("  primary key (name, designation)");
  out(") on commit drop;");
  const desRows = batch.archetypes.flatMap((e) => e.designations.map((d) => `(${sqlText(e.name)}, ${sqlText(d)})`));
  if (desRows.length > 0) {
    out("insert into _batch_designations values");
    rowsOut(desRows);
  }
  out();
  out("-- Every name, resolved inside its parent: one array per reference, which the");
  out("-- assert below needs to hold exactly one element.");
  out("create temp table _batch_resolved on commit drop as");
  out("select b.ord, b.name,");
  out("       array(select c.id from public.countries c where c.name = b.country) as country_ids,");
  out("       array(select r.id from public.regions r join public.countries c on c.id = r.country_id");
  out("              where c.name = b.country and r.name = b.region) as region_ids,");
  out("       array(select a.id from public.appellations a");
  out("               join public.regions r on r.id = a.region_id");
  out("               join public.countries c on c.id = r.country_id");
  out("              where c.name = b.country and r.name = b.region and a.name = b.appellation) as appellation_ids,");
  out("       array(select g.id from public.grapes g where g.name = b.primary_grape) as primary_grape_ids,");
  out("       case when b.secondary_grape is null then array[null::uuid]");
  out("            else array(select g.id from public.grapes g where g.name = b.secondary_grape) end as secondary_grape_ids,");
  out("       case when b.place_key is null then array[null::uuid]");
  out("            else array(select p.id from public.wine_places p where p.canonical_key = b.place_key) end as place_ids");
  out("  from _batch_archetypes b;");
  out();
  out("do $$");
  out("declare");
  out("  v_text text;");
  out("begin");
  out(`  if (select count(*) from _batch_archetypes) <> ${counts.archetypes}`);
  out(`     or (select count(*) from _batch_aromas) <> ${counts.aromas}`);
  out(`     or (select count(*) from _batch_aromas where signature) <> ${counts.signatures}`);
  out(`     or (select count(*) from _batch_designations) <> ${counts.designations} then`);
  out("    raise exception 'the batch rows did not load in full';");
  out("  end if;");
  out("  select string_agg(format('%s: %s resolves to %s rows', r.name, x.field, x.n), '; ' order by r.ord, x.field)");
  out("    into v_text");
  out("  from _batch_resolved r");
  out("  cross join lateral (values ('country', cardinality(r.country_ids)),");
  out("                             ('region', cardinality(r.region_ids)),");
  out("                             ('appellation', cardinality(r.appellation_ids)),");
  out("                             ('primary grape', cardinality(r.primary_grape_ids)),");
  out("                             ('secondary grape', cardinality(r.secondary_grape_ids)),");
  out("                             ('map place', cardinality(r.place_ids))) as x (field, n)");
  out("  where x.n <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'a batch reference does not resolve to exactly one live row: %', v_text;");
  out("  end if;");
  out("  select string_agg(format('%s: %s (%s) resolves to %s terms', x.name, x.term, x.group_name, x.n), '; ')");
  out("    into v_text");
  out("  from (select a.name, a.term, a.group_name,");
  out("               (select count(*) from public.wset_aroma_terms t");
  out("                 where t.group_name = a.group_name and t.term = a.term) as n");
  out("          from _batch_aromas a) x");
  out("  where x.n <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'an aroma term does not resolve to exactly one live row: %', v_text;");
  out("  end if;");
  out("  select string_agg(format('%s: %s', d.name, d.designation), '; ') into v_text");
  out("  from _batch_designations d");
  out("  where (select count(*) from public.type_designations td");
  out("          where td.name = d.designation and td.is_active) <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'a designation does not resolve to exactly one active row: %', v_text;");
  out("  end if;");
  out("end $$;");
  out();
  out("create temp table _batch_new (id uuid primary key, name text not null unique) on commit drop;");
  out();
  out("with inserted as (");
  out("  insert into public.wine_archetypes (");
  out("    name, wine_place_id, country_id, region_id, appellation_id, colour, style,");
  out("    primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high,");
  out("    typical_age_low, typical_age_high, sort_order");
  out("  )");
  out("  select b.name, r.place_ids[1], r.country_ids[1], r.region_ids[1], r.appellation_ids[1],");
  out("         b.colour, b.style, r.primary_grape_ids[1], r.secondary_grape_ids[1], b.description,");
  out("         b.sat, b.quality_low, b.quality_high, b.typical_age_low, b.typical_age_high,");
  out("         (select coalesce(max(a.sort_order), 0) from public.wine_archetypes a) + b.ord");
  out("    from _batch_archetypes b");
  out("    join _batch_resolved r on r.ord = b.ord");
  out("   where not exists (select 1 from public.wine_archetypes a where a.name = b.name)");
  out("  returning id, name");
  out(")");
  out("insert into _batch_new (id, name) select id, name from inserted;");
  out();
  out("insert into public.wine_archetype_aromas (archetype_id, term_id, kind, signature)");
  out("select n.id, t.id, x.kind, x.signature");
  out("  from _batch_aromas x");
  out("  join _batch_new n on n.name = x.name");
  out("  join public.wset_aroma_terms t on t.group_name = x.group_name and t.term = x.term;");
  out();
  out("insert into public.wine_archetype_designations (archetype_id, type_designation_id)");
  out("select n.id, td.id");
  out("  from _batch_designations d");
  out("  join _batch_new n on n.name = d.name");
  out("  join public.type_designations td on td.name = d.designation and td.is_active;");
  out();
  out("-- An archetype with a map place shows there, like the live ones");
  out("-- (20260829224000's back-fill: its home place, its own sort_order).");
  out("insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)");
  out("select a.id, a.wine_place_id, a.sort_order");
  out("  from _batch_new n");
  out("  join public.wine_archetypes a on a.id = n.id");
  out(" where a.wine_place_id is not null");
  out("on conflict (archetype_id, wine_place_id) do nothing;");
  out();
  out("-- Post-state, same transaction.");
  out("do $$");
  out("declare");
  out("  v_new int;");
  out("  v_text text;");
  out("begin");
  out("  -- Every batch name is in wine_archetypes exactly once.");
  out("  select string_agg(format('%s x%s', b.name, coalesce(x.n, 0)), '; ') into v_text");
  out("  from _batch_archetypes b");
  out("  left join (select a.name, count(*) as n from public.wine_archetypes a group by a.name) x on x.name = b.name");
  out("  where coalesce(x.n, 0) <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'batch archetypes are not each present exactly once: %', v_text;");
  out("  end if;");
  out("  -- The rows THIS run wrote carry every link the file lists.");
  out("  select count(*) into v_new from _batch_new;");
  out("  select string_agg(n.name, '; ') into v_text");
  out("  from _batch_new n");
  out("  join public.wine_archetypes a on a.id = n.id");
  out("  where (select count(*) from public.wine_archetype_aromas l where l.archetype_id = n.id)");
  out("          <> (select count(*) from _batch_aromas x where x.name = n.name)");
  out("     or (select count(*) from public.wine_archetype_aromas l where l.archetype_id = n.id and l.signature)");
  out("          <> (select count(*) from _batch_aromas x where x.name = n.name and x.signature)");
  out("     or (select count(*) from public.wine_archetype_designations l where l.archetype_id = n.id)");
  out("          <> (select count(*) from _batch_designations x where x.name = n.name)");
  out("     or (select count(*) from public.wine_archetype_placements p where p.archetype_id = n.id)");
  out("          <> case when a.wine_place_id is null then 0 else 1 end;");
  out("  if v_text is not null then");
  out("    raise exception 'batch archetypes written without every link: %', v_text;");
  out("  end if;");
  out(`  raise notice 'archetypes batch ${batch.batch}: % new of ${counts.archetypes}; wine_archetypes now %',`);
  out("    v_new, (select count(*) from public.wine_archetypes);");
  out("end $$;");
  return `${lines.join("\n")}\n`;
}
```

- [ ] **Step 8: Run the pure tests**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs`
Expected: `# tests 7`, `# pass 7`, `# fail 0`. The test "the committed batch-1 file is sound" also proves every range in `data/training/archetypes-batch-1.json` lies on its §4.4 ladder.

- [ ] **Step 9: Write the validator.** Create `scripts/training/validate-archetype-batch.mjs`:

```js
// Validates a training-room archetype batch against the LIVE database,
// read-only (spec §4.4, §4.7, D21). Every country, region (inside its
// country), appellation (inside its region), grape, designation (active),
// aroma term (inside its group) and map place key must resolve to exactly one
// live row, unless the file lists it under missingReferenceRows; the live
// enums must still be the ladders scripts/training/archetype-ladders.mjs
// holds. Exits 1 on any error; warnings are printed and let it through.
//
//   node --env-file=.env.local scripts/training/validate-archetype-batch.mjs \
//     data/training/archetypes-batch-1.json
//
// gen-archetype-batch-migration.mjs runs the same check (validateBatchFile)
// and refuses to write a migration unless it passes.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";
import {
  APPEARANCE_INTENSITY,
  BODY,
  DEVELOPMENT,
  FINISH,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY,
  LEVEL,
  MOUSSE,
  SWEETNESS,
  WINE_COLOURS,
  WINE_STYLES,
} from "./archetype-ladders.mjs";
import { batchProblems, entryAromas, missingRows } from "./archetype-batch.mjs";

// Each ladder, as the live enum it must equal (full enum order, spec §4.4).
// Alcohol's full enum is the fortified ladder; every hue a colour allows must
// be a live wset_colour_hue label.
const ENUM_LADDERS = {
  wine_colour: WINE_COLOURS,
  wine_style: WINE_STYLES,
  wset_appearance_intensity: APPEARANCE_INTENSITY,
  wset_intensity: INTENSITY,
  wset_development: DEVELOPMENT,
  wset_sweetness: SWEETNESS,
  wset_level: LEVEL,
  wset_body: BODY,
  wset_finish: FINISH,
  wset_mousse: MOUSSE,
};

const SEP = String.fromCharCode(31); // chr(31) in SQL: Postgres text cannot hold a NUL
const key = (...parts) => parts.join(SEP);

// Accent-, case- and suffix-blind form of an appellation or grape name, used
// only to refuse a "missing" row that already exists under another spelling.
export function foldName(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/ (aoc|aop|doc|docg|doca|do|dop|ava|dac|igt|igp|gi|pdo|pgi)$/u, "");
}

// counts: a Map from key(...) to the number of live rows.
async function countMap(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return new Map(rows.map((r) => [r.k, Number(r.n)]));
}

// Resolves every name the batch uses. Returns { errors, warnings }.
export async function liveProblems(client, batch) {
  const errors = [];
  const warnings = [];
  const entries = batch.archetypes;
  const missing = missingRows(batch);
  const listedRegion = new Set(missing.regions.map((r) => key(r.country, r.region)));
  const listedAppellation = new Set(missing.appellations.map((a) => key(a.country, a.region, a.appellation)));
  const listedGrape = new Set(missing.grapes.map((g) => g.name));

  // 1. The live enums are still the ladders.
  const { rows: enumRows } = await client.query(
    `select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
       from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typnamespace = 'public'::regnamespace and t.typname = any($1::text[])
      group by t.typname`,
    [[...Object.keys(ENUM_LADDERS), "wset_colour_hue"]],
  );
  const live = new Map(enumRows.map((r) => [r.name, r.labels]));
  for (const [name, ladder] of Object.entries(ENUM_LADDERS)) {
    if (JSON.stringify(live.get(name)) !== JSON.stringify(ladder)) {
      errors.push(`live enum ${name} is ${JSON.stringify(live.get(name) ?? null)}, the ladder is ${JSON.stringify(ladder)}`);
    }
  }
  if (JSON.stringify(live.get("wset_level")) !== JSON.stringify(FORTIFIED_ALCOHOL_STOPS)) {
    errors.push("live enum wset_level is not the fortified alcohol ladder");
  }
  const hues = live.get("wset_colour_hue") ?? [];
  for (const [colour, list] of Object.entries(HUES_BY_COLOUR)) {
    const off = list.filter((h) => !hues.includes(h));
    if (off.length > 0) errors.push(`HUES_BY_COLOUR.${colour} holds ${off.join(", ")}, which live wset_colour_hue lacks`);
  }

  // 2. Reference rows, counted by name inside their parent.
  const countries = [...new Set(entries.map((e) => e.country).concat(missing.regions.map((r) => r.country)))];
  const countryN = await countMap(
    client,
    "select c.name as k, count(*) as n from countries c where c.name = any($1::text[]) group by c.name",
    [countries],
  );
  const regionPairs = [...new Map(entries.map((e) => [key(e.country, e.region), [e.country, e.region]])).values()];
  const regionN = await countMap(
    client,
    `select c.name || chr(31) || r.name as k, count(*) as n
       from regions r join countries c on c.id = r.country_id
      where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))
      group by c.name, r.name`,
    [regionPairs.map((p) => p[0]), regionPairs.map((p) => p[1])],
  );
  const appTriples = [
    ...new Map(entries.map((e) => [key(e.country, e.region, e.appellation), [e.country, e.region, e.appellation]])).values(),
  ];
  const appellationN = await countMap(
    client,
    `select c.name || chr(31) || r.name || chr(31) || a.name as k, count(*) as n
       from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
      where (c.name, r.name, a.name) in (select * from unnest($1::text[], $2::text[], $3::text[]))
      group by c.name, r.name, a.name`,
    [appTriples.map((t) => t[0]), appTriples.map((t) => t[1]), appTriples.map((t) => t[2])],
  );
  const grapes = [...new Set(entries.flatMap((e) => [e.primaryGrape, e.secondaryGrape]).filter(Boolean))];
  const grapeN = await countMap(
    client,
    "select g.name as k, count(*) as n from grapes g where g.name = any($1::text[]) group by g.name",
    [grapes],
  );
  const designations = [...new Set(entries.flatMap((e) => e.designations))];
  const designationN = await countMap(
    client,
    `select td.name as k, count(*) as n from type_designations td
      where td.name = any($1::text[]) and td.is_active group by td.name`,
    [designations],
  );
  const termPairs = [...new Map(entries.flatMap(entryAromas).map((a) => [key(a.group, a.term), [a.group, a.term]])).values()];
  const termN = await countMap(
    client,
    `select t.group_name || chr(31) || t.term as k, count(*) as n from wset_aroma_terms t
      where (t.group_name, t.term) in (select * from unnest($1::text[], $2::text[]))
      group by t.group_name, t.term`,
    [termPairs.map((p) => p[0]), termPairs.map((p) => p[1])],
  );
  const placeKeys = [...new Set(entries.map((e) => e.placeCanonicalKey).filter(Boolean))];
  const placeN = await countMap(
    client,
    "select p.canonical_key as k, count(*) as n from wine_places p where p.canonical_key = any($1::text[]) group by p.canonical_key",
    [placeKeys],
  );
  const { rows: liveNames } = await client.query(
    "select distinct a.name from wine_archetypes a where a.name = any($1::text[])",
    [entries.map((e) => e.name)],
  );
  const alreadyLive = new Set(liveNames.map((r) => r.name));

  // 3. The rows listed as missing must really be missing, under any spelling.
  for (const r of missing.regions) {
    if ((countryN.get(r.country) ?? 0) !== 1) errors.push(`missing region ${r.region}: country "${r.country}" is not one live row`);
  }
  const { rows: listedLive } = await client.query(
    `select c.name || chr(31) || r.name as k from regions r join countries c on c.id = r.country_id
      where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))`,
    [missing.regions.map((r) => r.country), missing.regions.map((r) => r.region)],
  );
  for (const row of listedLive) errors.push(`missingReferenceRows lists a region that is live: ${row.k.split(SEP).join(" / ")}`);
  if (missing.appellations.length > 0) {
    const { rows: siblings } = await client.query(
      `select c.name as country, r.name as region, a.name as appellation
         from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
        where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))`,
      [missing.appellations.map((a) => a.country), missing.appellations.map((a) => a.region)],
    );
    for (const a of missing.appellations) {
      const regionKnown = listedRegion.has(key(a.country, a.region)) || regionN.get(key(a.country, a.region)) === 1;
      if (!regionKnown) {
        const { rows } = await client.query(
          "select count(*)::int as n from regions r join countries c on c.id = r.country_id where c.name = $1 and r.name = $2",
          [a.country, a.region],
        );
        if (rows[0].n !== 1) errors.push(`missing appellation ${a.appellation}: region ${a.country} / ${a.region} is not one live row`);
      }
      const clash = siblings.find(
        (s) => s.country === a.country && s.region === a.region && foldName(s.appellation) === foldName(a.appellation),
      );
      if (clash) {
        errors.push(
          `missingReferenceRows lists appellation "${a.appellation}", but ${a.region} already holds "${clash.appellation}"`,
        );
      }
    }
  }
  if (missing.grapes.length > 0) {
    const { rows: allGrapes } = await client.query("select name from grapes");
    for (const g of missing.grapes) {
      const clash = allGrapes.find((x) => foldName(x.name) === foldName(g.name));
      if (clash) errors.push(`missingReferenceRows lists grape "${g.name}", but "${clash.name}" is live`);
    }
  }

  // 4. Every entry's names.
  const one = (map, k, listed) => (listed ? 1 : map.get(k) ?? 0);
  entries.forEach((e, i) => {
    const at = `#${i + 1} ${e.name}`;
    const need = (what, n) => {
      if (n !== 1) errors.push(`${at}: ${what} resolves to ${n} live rows`);
    };
    need(`country "${e.country}"`, countryN.get(e.country) ?? 0);
    const regionListed = listedRegion.has(key(e.country, e.region));
    need(`region "${e.region}" in ${e.country}`, one(regionN, key(e.country, e.region), regionListed));
    need(
      `appellation "${e.appellation}" in ${e.region}`,
      one(appellationN, key(e.country, e.region, e.appellation), listedAppellation.has(key(e.country, e.region, e.appellation))),
    );
    need(`primary grape "${e.primaryGrape}"`, one(grapeN, e.primaryGrape, listedGrape.has(e.primaryGrape)));
    if (e.secondaryGrape) {
      need(`secondary grape "${e.secondaryGrape}"`, one(grapeN, e.secondaryGrape, listedGrape.has(e.secondaryGrape)));
    }
    for (const d of e.designations) need(`designation "${d}" (active)`, designationN.get(d) ?? 0);
    for (const a of entryAromas(e)) need(`aroma term "${a.term}" in ${a.group}`, termN.get(key(a.group, a.term)) ?? 0);
    if (e.placeCanonicalKey) need(`map place "${e.placeCanonicalKey}"`, placeN.get(e.placeCanonicalKey) ?? 0);
    if (alreadyLive.has(e.name)) warnings.push(`${at}: already in wine_archetypes; the migration skips it`);
  });
  return { errors, warnings };
}

// The whole check for one file: shape first, then live (skipped when the
// shape is broken, since the lookups would only repeat the same errors).
export async function validateBatchFile(path) {
  const batch = JSON.parse(readFileSync(path, "utf8"));
  const shape = batchProblems(batch);
  if (shape.errors.length > 0) return { batch, ...shape };
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    await client.query("begin read only");
    const liveResult = await liveProblems(client, batch);
    return {
      batch,
      errors: [...shape.errors, ...liveResult.errors],
      warnings: [...shape.warnings, ...liveResult.warnings],
    };
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

export function report({ batch, errors, warnings }, path) {
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  const n = Array.isArray(batch?.archetypes) ? batch.archetypes.length : 0;
  if (errors.length === 0) console.log(`${path}: ${n} archetypes resolve (${warnings.length} warnings)`);
  else console.error(`${path}: ${errors.length} errors`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? "data/training/archetypes-batch-1.json";
  const result = await validateBatchFile(path);
  report(result, path);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
```

- [ ] **Step 10: Run the validator against live (read-only), on the real file and on a broken copy**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local scripts/training/validate-archetype-batch.mjs data/training/archetypes-batch-1.json; echo "exit $?"`
Expected, with today's file (87 entries; a JSON that has since gained entries prints its own count):
```
data/training/archetypes-batch-1.json: 87 archetypes resolve (0 warnings)
exit 0
```
If it prints `error:` lines, the JSON names something that is not exactly one live row. Fix the JSON (live spellings, suffix included), never the validator.

Then prove it refuses. This writes a broken copy to the OS temp directory, not the repository:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && BROKEN=$(node --input-type=module -e "$(cat <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const b = JSON.parse(readFileSync("data/training/archetypes-batch-1.json", "utf8"));
b.archetypes[0].appellation = "Pauillac";
b.archetypes[1].nose[0].term = "blackcurrants";
b.archetypes[2].designations = ["Grand Cru Classe"];
b.archetypes[3].placeCanonicalKey = "france.nowhere";
b.missingReferenceRows = {
  regions: [],
  appellations: [{ country: "France", region: "Bordeaux", appellation: "Margaux" }],
  grapes: [{ name: "Semillon" }],
};
const out = join(tmpdir(), "archetypes-broken.json");
writeFileSync(out, JSON.stringify(b));
console.log(out);
EOF
)") && node --env-file=.env.local scripts/training/validate-archetype-batch.mjs "$BROKEN"; echo "exit $?"
```
Expected (entries #1–#4 are Pauillac, Saint-Julien, Saint-Estèphe and Pessac-Léognan red in today's file):
```
error: missingReferenceRows lists appellation "Margaux", but Bordeaux already holds "Margaux"
error: missingReferenceRows lists grape "Semillon", but "Semillon" is live
error: #1 A typical Pauillac: appellation "Pauillac" in Bordeaux resolves to 0 live rows
error: #2 A typical Saint-Julien: aroma term "blackcurrants" in Black fruit resolves to 0 live rows
error: #3 A typical Saint-Estèphe: designation "Grand Cru Classe" (active) resolves to 0 live rows
error: #4 A typical Pessac-Léognan red: map place "france.nowhere" resolves to 0 live rows
<tmp>/archetypes-broken.json: 6 errors
exit 1
```

- [ ] **Step 11: Write the generator.** Create `scripts/training/gen-archetype-batch-migration.mjs`:

```js
// Turns a training-room archetype batch file into its data migration (spec
// D21, §4.7). Fail-closed: it runs validate-archetype-batch.mjs's full check
// first (read-only, against live) and writes nothing unless that passes.
//
//   node --env-file=.env.local scripts/training/gen-archetype-batch-migration.mjs \
//     data/training/archetypes-batch-1.json \
//     supabase/migrations/20260925130000_archetypes_batch_1.sql
//
// Re-run it whenever the JSON changes (the file may still gain entries); the
// migration's counts and asserts are computed from the JSON each time.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { batchMigrationSql } from "./archetype-batch.mjs";
import { report, validateBatchFile } from "./validate-archetype-batch.mjs";

export async function generate(jsonPath, outPath, generatedOn = new Date().toISOString().slice(0, 10)) {
  const result = await validateBatchFile(jsonPath);
  report(result, jsonPath);
  if (result.errors.length > 0) {
    throw new Error(`${jsonPath} does not validate; no migration written`);
  }
  const sql = batchMigrationSql(result.batch, { file: jsonPath, generatedOn });
  writeFileSync(outPath, sql);
  return sql;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [jsonPath, outPath] = process.argv.slice(2);
  if (!jsonPath || !outPath) {
    console.error("usage: gen-archetype-batch-migration.mjs <batch.json> <out.sql>");
    process.exit(2);
  }
  try {
    const sql = await generate(jsonPath, outPath);
    console.log(`wrote ${outPath} (${sql.split("\n").length} lines)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 12: Generate the batch-1 migration**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local scripts/training/gen-archetype-batch-migration.mjs data/training/archetypes-batch-1.json supabase/migrations/20260925130000_archetypes_batch_1.sql; echo "exit $?"`
Expected, with today's file:
```
data/training/archetypes-batch-1.json: 87 archetypes resolve (0 warnings)
wrote supabase/migrations/20260925130000_archetypes_batch_1.sql (1199 lines)
exit 0
```
and `head -8 supabase/migrations/20260925130000_archetypes_batch_1.sql` shows:
```
-- Training room: typical wines, batch 1 (spec
-- docs/superpowers/specs/2026-09-25-training-room-design.md §4.7, D21).
-- GENERATED from data/training/archetypes-batch-1.json by scripts/training/gen-archetype-batch-migration.mjs
-- on 2026-09-25. Edit the JSON and regenerate; never edit this file by hand.
--
-- 87 archetypes, 881 aroma links (133 signature),
-- 34 designation links, 69 map placements.
-- Every country, region, appellation, grape, designation, aroma term and map
```
(The date is the day you run it. A JSON that has gained entries changes the counts; the asserts inside follow the JSON.) The generator refuses a file that does not validate. For example, `node --env-file=.env.local scripts/training/gen-archetype-batch-migration.mjs "$BROKEN" /tmp/x.sql; echo "exit $?"` prints the six errors, then `... does not validate; no migration written`, then `exit 1`, and writes no file.

**Whenever `data/training/archetypes-batch-1.json` changes** (the pairs are still being split into separate archetypes), re-run this step and commit the regenerated file with the JSON.

- [ ] **Step 13: Check the generated SQL's own lookups against live (read-only)**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node --env-file=.env.local --input-type=module -e "$(cat <<'EOF'
// Read-only: the generated migration's own resolution queries, run against live.
import { readFileSync } from "node:fs";
import pg from "pg";
import { pgConfig } from "./scripts/wine-map-tiles/lib.mjs";
const sql = readFileSync("supabase/migrations/20260925130000_archetypes_batch_1.sql", "utf8").replace(/\r/g, "");
const values = (start) => {
  const i = sql.indexOf(start) + start.length;
  return sql.slice(i, sql.indexOf(";\n", i));
};
const resolved = sql.slice(
  sql.indexOf("select b.ord, b.name,"),
  sql.indexOf("  from _batch_archetypes b;") + "  from _batch_archetypes b".length,
);
const checks = {
  archetypes: `with _batch_archetypes (ord, name, country, region, appellation, place_key, colour, style,
      primary_grape, secondary_grape, typical_age_low, typical_age_high, quality_low, quality_high, sat, description)
    as (values ${values("insert into _batch_archetypes values\n")}),
    r as (${resolved})
    select count(*) filter (where cardinality(country_ids) = 1 and cardinality(region_ids) = 1
        and cardinality(appellation_ids) = 1 and cardinality(primary_grape_ids) = 1
        and cardinality(secondary_grape_ids) = 1 and cardinality(place_ids) = 1)::int as ok,
      count(*)::int as total from r`,
  aromas: `with a (name, kind, group_name, term, signature) as (values ${values("insert into _batch_aromas values\n")})
    select count(*) filter (where (select count(*) from wset_aroma_terms t
                                    where t.group_name = a.group_name and t.term = a.term) = 1)::int as ok,
      count(*)::int as total from a`,
  designations: `with d (name, designation) as (values ${values("insert into _batch_designations values\n")})
    select count(*) filter (where (select count(*) from type_designations td
                                    where td.name = d.designation and td.is_active) = 1)::int as ok,
      count(*)::int as total from d`,
};
const c = new pg.Client(pgConfig());
await c.connect();
await c.query("begin read only");
try {
  for (const [what, q] of Object.entries(checks)) console.log(what, (await c.query(q)).rows[0]);
} finally {
  await c.query("rollback");
  await c.end();
}
EOF
)"
```
Expected, with today's file:
```
archetypes { ok: 87, total: 87 }
aromas { ok: 881, total: 881 }
designations { ok: 34, total: 34 }
```
(`ok` must equal `total` on every line.)

- [ ] **Step 14: `wine_place_id` becomes nullable in the types.** In `src/lib/supabase/database.types.ts`, replace the lines Task 1 wrote:
```ts
          // Nullable in the database since 20260925120000 (training-room spec
          // D9). Typed `string` until Task 13 of the training-room plan, once
          // Tasks 6, 9 and 12 made every reader tolerate null; no live row is
          // null before batch 1 (20260925130000).
          wine_place_id: string;
```
with
```ts
          // Nullable since 20260925120000 (training-room spec D9): batch 1
          // (20260925130000) adds archetypes the map has no place for.
          wine_place_id: string | null;
```
Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx tsc --noEmit`
Expected: exits 0 with no output. Tasks 6, 9 and 12 already guard the place. An error here names a reader that still assumes a place; guard it the same way (`a.wine_place_id ? … : …`, or filter nulls before `.in(...)`).

- [ ] **Step 15: Add the batch test to the DB suite.** Append this test to the end of `scripts/training-room.test.mjs`, after the back-fill test and one blank line:

```js
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
    const sql = readFileSync(file, "utf8");
    if (!APPLY.some((f) => f.endsWith("20260925130000_archetypes_batch_1.sql"))) await client.query(sql);
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
    const first = await totals();
    await client.query(sql);
    assert.deepEqual(await totals(), first, "a second apply changes nothing");

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
                (select count(*)::int from wine_archetype_placements p where p.archetype_id = a.id) placements,
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
      placements: 1,
      typical_age_low: 8,
      typical_age_high: 30,
      tannin: ["MEDIUM_PLUS", "HIGH"],
    });
    const napa = (
      await client.query(
        `select a.wine_place_id, (select count(*)::int from wine_archetype_placements p where p.archetype_id = a.id) placements
           from wine_archetypes a where a.name = 'A typical Napa Cabernet Sauvignon'`,
      )
    ).rows[0];
    assert.deepEqual(napa, { wine_place_id: null, placements: 0 }, "an archetype without a map place stays off the map");
    const prosecco = (await client.query("select sat -> 'mousse' mousse from wine_archetypes where name = 'A typical Prosecco'"))
      .rows[0];
    assert.deepEqual(prosecco, { mousse: ["CREAMY", "AGGRESSIVE"] });
  });
});
```

- [ ] **Step 16: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/archetype-ladders.test.ts && node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs && npx tsc --noEmit && npx eslint scripts/training/archetype-ladders.mjs scripts/training/archetype-batch.mjs scripts/training/archetype-batch.test.mjs scripts/training/validate-archetype-batch.mjs scripts/training/gen-archetype-batch-migration.mjs src/lib/training/archetype-ladders.test.ts scripts/training-room.test.mjs src/lib/supabase/database.types.ts && node --check scripts/training-room.test.mjs`
Expected: vitest `Tests 3 passed (3)`; node `# pass 7`, `# fail 0`; `tsc` exits 0; eslint prints nothing; `node --check` prints nothing.

- [ ] **Step 17 (main session only): Dry-run both migrations and the DB suite, rolled back**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && TRAINING_ROOM_APPLY=supabase/migrations/20260925120000_training_room.sql,supabase/migrations/20260925130000_archetypes_batch_1.sql node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/training-room.test.mjs`
Expected: `# tests 17`, `# pass 17`, `# fail 0`. The new test re-applies the batch in the same transaction and checks that nothing changes. It also checks that every batch name is present once, that Pauillac's identity, signatures, designation, placement, typical age and tannin match the JSON, that Napa has no place and no placement, and that Prosecco's mousse range was folded into `sat`. (Once 20260925120000 is live, `TRAINING_ROOM_APPLY` needs only the batch file.) Once 20260925120000 is live, the applier's own dry run is `node --env-file=.env.local <scratchpad>/apply-migration.mjs supabase/migrations/20260925130000_archetypes_batch_1.sql --dry`, and it should print `DRY RUN OK: 20260925130000_archetypes_batch_1 ran in <n> ms and was rolled back`.

- [ ] **Step 18: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add scripts/training/archetype-ladders.mjs scripts/training/archetype-batch.mjs scripts/training/archetype-batch.test.mjs scripts/training/validate-archetype-batch.mjs scripts/training/gen-archetype-batch-migration.mjs src/lib/training/archetype-ladders.test.ts supabase/migrations/20260925130000_archetypes_batch_1.sql scripts/training-room.test.mjs src/lib/supabase/database.types.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): archetype batch validator, generator and the batch-1 migration" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
