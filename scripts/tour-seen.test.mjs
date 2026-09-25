// First-run tour DB suite (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
// D1, §3): profiles.tour_seen_at is written by the signed-in person through the
// ten-column client UPDATE grant and "profiles update own" — never on someone
// else's row, never by anon — and the grant did not widen past it. Every test
// runs inside a transaction that is rolled back. Passes only once
// 20260925010000_tour_seen is live; before that four tests fail (the column
// does not exist, the grant is still nine columns) and one passes.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

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
    return await cb();
  } finally {
    await client.query("rollback");
  }
}
async function asUser(id) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}
async function asAnon() {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: "anon" }),
  ]);
  await client.query("set local role anon");
}
// Two profiles that are not deleted: profiles_deleted_guard refuses every
// client write to a deleted one, which would mask what these tests check.
async function twoProfiles() {
  const r = await client.query("select id from profiles where deleted_at is null order by id limit 2");
  assert.equal(r.rowCount, 2, "need 2 live profiles");
  return [r.rows[0].id, r.rows[1].id];
}
// Owner-role (RLS-bypassing) read of one profile's stamp.
async function seenAt(id) {
  await client.query("reset role");
  return (await client.query("select tour_seen_at from profiles where id = $1", [id])).rows[0].tour_seen_at;
}

test("a signed-in person stamps and clears their own tour_seen_at", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const stamped = await client.query(
      "update profiles set tour_seen_at = now() where id = $1 returning tour_seen_at",
      [a],
    );
    assert.equal(stamped.rowCount, 1);
    assert.ok(stamped.rows[0].tour_seen_at instanceof Date, "stamped with a time");
    const cleared = await client.query(
      "update profiles set tour_seen_at = null where id = $1 returning tour_seen_at",
      [a],
    );
    assert.equal(cleared.rowCount, 1);
    assert.equal(cleared.rows[0].tour_seen_at, null, "Show the tour again clears it");
  });
});

test("nobody writes another person's tour_seen_at", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    const before = await seenAt(b);
    await asUser(a);
    const r = await client.query("update profiles set tour_seen_at = now() where id = $1", [b]);
    assert.equal(r.rowCount, 0, '"profiles update own" filters another person\'s row');
    assert.deepEqual(await seenAt(b), before, "their stamp is untouched");
  });
});

test("anon cannot write tour_seen_at", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asAnon();
    await assert.rejects(
      client.query("update profiles set tour_seen_at = now() where id = $1", [a]),
      (e) => e.code === "42501",
      "permission denied: anon holds no UPDATE on profiles",
    );
  });
});

test("the client UPDATE grant is exactly the ten columns", async () => {
  const r = await client.query(
    `select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
              order by a.attname::text collate "C", x.privilege_type collate "C") as acl
       from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped`,
  );
  assert.equal(
    r.rows[0].acl,
    "avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE," +
      "last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE",
  );
});

test("the grant did not widen: role and deleted_at stay unwritable", async () => {
  for (const sql of [
    "update profiles set role = 'ADMIN' where id = $1",
    "update profiles set deleted_at = now() where id = $1",
  ]) {
    await withRollback(async () => {
      const [a] = await twoProfiles();
      await asUser(a);
      await assert.rejects(client.query(sql, [a]), (e) => e.code === "42501", sql);
    });
  }
});
