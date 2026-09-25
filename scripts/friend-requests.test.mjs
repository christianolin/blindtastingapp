// Friend requests DB suite (spec docs/superpowers/specs/2026-09-24-friend-requests-design.md
// §5): the five RPCs of 20260925003000, the recreated accept_platform_invite
// and scrub_deleted_account, and, once 20260925004000 is applied, the
// friendships lockdown and its data move.
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles created inside that transaction (live
// profiles has no foreign key to auth.users since 20260829265003): no real
// person's row decides a result or is written.
//
//   node --env-file=.env.local --test scripts/friend-requests.test.mjs
//
// Dry run before a migration is live: FRIEND_REQUESTS_APPLY lists migration
// files (comma-separated, in order) that each test applies inside its own
// rolled-back transaction first, e.g.
//   FRIEND_REQUESTS_APPLY=supabase/migrations/20260925003000_friend_requests.sql \
//     node --env-file=.env.local --test scripts/friend-requests.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const LOCKDOWN = "20260925004000_friend_requests_lockdown.sql";
const APPLY = (process.env.FRIEND_REQUESTS_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);
const FIVE = [
  "send_friend_request",
  "cancel_friend_request",
  "accept_friend_request",
  "decline_friend_request",
  "remove_friend",
];

const client = new pg.Client(pgConfig());
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb, { holdLockdown = false } = {}) {
  await client.query("begin");
  try {
    for (const file of APPLY) {
      if (holdLockdown && file.endsWith(LOCKDOWN)) continue;
      await client.query(readFileSync(file, "utf8"));
    }
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
       values (gen_random_uuid(), $1, 'friend-requests-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`Friend requests test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

async function call(fn, arg) {
  return (await client.query(`select public.${fn}($1::uuid) as r`, [arg])).rows[0].r;
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

// Owner-role read of everything between a and b.
async function pair(a, b) {
  await asOwner();
  const f = await client.query(
    `select user_id from friendships
      where (user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1)`,
    [a, b],
  );
  const r = await client.query(
    `select requester_id from friend_requests
      where (requester_id = $1 and recipient_id = $2) or (requester_id = $2 and recipient_id = $1)`,
    [a, b],
  );
  return {
    aToB: f.rows.some((x) => x.user_id === a),
    bToA: f.rows.some((x) => x.user_id === b),
    requests: r.rows.map((x) => (x.requester_id === a ? "a->b" : "b->a")).sort(),
  };
}
const FRIENDS = { aToB: true, bToA: true, requests: [] };
const NOTHING = { aToB: false, bToA: false, requests: [] };

test("a request, then its acceptance, writes the pair and clears the request", async () => {
  await withRollback(async () => {
    const [a, b, c] = await freshProfiles(3);
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "requested");
    assert.equal(await call("send_friend_request", b), "requested", "asking twice changes nothing");
    assert.deepEqual(await pair(a, b), { aToB: false, bToA: false, requests: ["a->b"] });

    const seenBy = async (who) => {
      await asUser(who);
      return (
        await client.query(
          "select count(*)::int n from friend_requests where requester_id = $1 and recipient_id = $2",
          [a, b],
        )
      ).rows[0].n;
    };
    assert.equal(await seenBy(a), 1, "the requester reads it");
    assert.equal(await seenBy(b), 1, "the recipient reads it");
    assert.equal(await seenBy(c), 0, "nobody else does");

    await asUser(b);
    await call("accept_friend_request", a);
    assert.deepEqual(await pair(a, b), FRIENDS);
  });
});

test("a decline writes nothing, and the requester may ask again", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(a);
    await call("send_friend_request", b);
    await asUser(b);
    await call("decline_friend_request", a);
    assert.deepEqual(await pair(a, b), NOTHING);
    await asUser(b);
    await call("decline_friend_request", a); // nothing pending: a no-op
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "requested");
  });
});

test("the requester can cancel; cancel, decline and remove are no-ops when nothing is there", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(a);
    await call("send_friend_request", b);
    await call("cancel_friend_request", b);
    assert.deepEqual(await pair(a, b), NOTHING);
    await asUser(a);
    await call("cancel_friend_request", b);
    await call("remove_friend", b);
    await asUser(b);
    await call("decline_friend_request", a);
    assert.deepEqual(await pair(a, b), NOTHING);
  });
});

test("asking someone who already asked you makes you friends at once", async () => {
  await withRollback(async () => {
    const [a, b, c] = await freshProfiles(3);
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "requested");
    await asUser(b);
    assert.equal(await call("send_friend_request", a), "accepted");
    assert.deepEqual(await pair(a, b), FRIENDS);

    // Two crossed requests (what two simultaneous taps could leave without the
    // pair lock): one accept clears both directions.
    await asOwner();
    await client.query(
      "insert into friend_requests (requester_id, recipient_id) values ($1, $2), ($2, $1)",
      [b, c],
    );
    await asUser(b);
    await call("accept_friend_request", c);
    assert.deepEqual(await pair(b, c), FRIENDS);
  });
});

test("asking a friend says 'friends'; removing deletes both rows", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(a);
    await call("send_friend_request", b);
    await asUser(b);
    await call("accept_friend_request", a);
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "friends");
    await asUser(b);
    assert.equal(await call("send_friend_request", a), "friends");
    await call("remove_friend", a);
    assert.deepEqual(await pair(a, b), NOTHING);
    await asUser(b);
    await call("remove_friend", a); // already gone: a no-op
    await asUser(a);
    assert.equal(await call("send_friend_request", b), "requested");
  });
});

test("refusals: not signed in, yourself, nothing to accept", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asUser(null);
    for (const fn of FIVE) {
      await expectError(() => call(fn, b), "42501", "not signed in");
    }
    await asUser(a);
    for (const fn of FIVE) {
      await expectError(() => call(fn, a), "22023", "you cannot be your own friend");
      await expectError(() => call(fn, null), "22023", "you cannot be your own friend");
    }
    await expectError(() => call("accept_friend_request", b), "42501", "no request to accept");
  });
});

test("a deleted account can neither be asked nor answered, and no row may name it", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await client.query("update profiles set deleted_at = now() where id = $1", [b]);
    await asUser(a);
    for (const fn of FIVE) {
      await expectError(() => call(fn, b), "42501", "that account has been deleted");
    }
    await asOwner();
    await expectError(
      () => client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [a, b]),
      "42501",
      "that account has been deleted",
    );
    await expectError(
      () => client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [b, a]),
      "42501",
      "that account has been deleted",
    );
    await expectError(
      () => client.query("insert into friendships (user_id, friend_id) values ($1, $2)", [a, b]),
      "42501",
      "that account has been deleted",
    );
  });
});

test("account deletion takes a person's requests with them, both ways", async () => {
  await withRollback(async () => {
    const [a, b, c] = await freshProfiles(3);
    await client.query(
      "insert into friend_requests (requester_id, recipient_id) values ($1, $2), ($2, $3)",
      [a, c, b],
    );
    await client.query("select public.scrub_deleted_account($1)", [c]);
    const left = (
      await client.query(
        "select count(*)::int n from friend_requests where requester_id = $1 or recipient_id = $1",
        [c],
      )
    ).rows[0].n;
    assert.equal(left, 0);
    const deleted = (await client.query("select deleted_at from profiles where id = $1", [c])).rows[0];
    assert.ok(deleted.deleted_at, "the scrub still stamps deleted_at");
  });
});

test("a pending request opens no FRIENDS cellar; accepting does; removing closes it", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await client.query("update profiles set cellar_visibility = 'FRIENDS' where id = $1", [a]);
    const bSeesA = async () => {
      await asUser(b);
      return (await client.query("select public.can_view_cellar($1) as ok", [a])).rows[0].ok;
    };

    await asUser(b);
    await call("send_friend_request", a);
    assert.equal(await bSeesA(), false, "b asked a: nothing opens");
    await asUser(b);
    await call("cancel_friend_request", a);

    await asUser(a);
    await call("send_friend_request", b);
    assert.equal(await bSeesA(), false, "a asked b: nothing opens until b says yes");

    await asUser(b);
    await call("accept_friend_request", a);
    assert.equal(await bSeesA(), true, "friends: the FRIENDS cellar opens");

    await asUser(b);
    await call("remove_friend", a);
    assert.equal(await bSeesA(), false, "removed: it closes again");
  });
});

test("an invite link settles a pending request either way and makes the pair", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    const code = (
      await client.query("insert into platform_invites (inviter_id) values ($1) returning code", [a])
    ).rows[0].code;
    await client.query(
      "insert into friend_requests (requester_id, recipient_id) values ($1, $2), ($2, $1)",
      [a, b],
    );
    await asUser(b);
    const inviter = (await client.query("select public.accept_platform_invite($1) as id", [code])).rows[0].id;
    assert.equal(inviter, a);
    assert.deepEqual(await pair(a, b), FRIENDS);
  });
});

test("only authenticated runs the RPCs, and no client writes friend_requests", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asOwner();
    for (const fn of FIVE) {
      const sig = `public.${fn}(uuid)`;
      const r = await client.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('service_role', $1, 'EXECUTE') as service,
                has_function_privilege('authenticated', $1, 'EXECUTE') as authed,
                exists (select 1 from pg_proc p, aclexplode(p.proacl) x
                         where p.oid = to_regprocedure($1) and x.grantee = 0) as public`,
        [sig],
      );
      assert.deepEqual(r.rows[0], { anon: false, service: false, authed: true, public: false }, sig);
    }

    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await client.query("set local role anon");
    await expectError(() => call("send_friend_request", b), "42501");

    await asUser(a);
    await expectError(
      () => client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [a, b]),
      "42501",
    );
    await expectError(() => client.query("delete from friend_requests where requester_id = $1", [a]), "42501");
    await expectError(
      () => client.query("update friend_requests set created_at = now() where requester_id = $1", [a]),
      "42501",
    );
  });
});

test("after 20260925004000 no client writes friendships, and every row has its pair", async (t) => {
  await withRollback(async () => {
    await asOwner();
    const open = (
      await client.query("select has_table_privilege('authenticated', 'public.friendships', 'INSERT') as open")
    ).rows[0].open;
    if (open) {
      t.skip("20260925004000 is not applied here");
      return;
    }
    const [a, b] = await freshProfiles(2);
    await asUser(a);
    await expectError(
      () => client.query("insert into friendships (user_id, friend_id) values ($1, $2)", [a, b]),
      "42501",
    );
    await expectError(() => client.query("delete from friendships where user_id = $1", [a]), "42501");
    await asOwner();
    const orphans = (
      await client.query(
        `select count(*)::int n from friendships f
          where not exists (select 1 from friendships r where r.user_id = f.friend_id and r.friend_id = f.user_id)`,
      )
    ).rows[0].n;
    assert.equal(orphans, 0);
  });
});

test("20260925004000 turns one-way rows into requests and keeps pairs", async (t) => {
  const lockdown = APPLY.find((f) => f.endsWith(LOCKDOWN));
  if (!lockdown) {
    t.skip("runs only in a dry run whose FRIEND_REQUESTS_APPLY ends with 20260925004000");
    return;
  }
  await withRollback(
    async () => {
      const [a, b, c, d] = await freshProfiles(4);
      // a -> b one-way, as a legacy "Add friend" left it.
      await client.query(
        "insert into friendships (user_id, friend_id, created_at) values ($1, $2, '2026-01-02T03:04:05Z')",
        [a, b],
      );
      // a and c are a pair.
      await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [a, c]);
      // d -> a one-way, and a already asked d back through the new app.
      await client.query("insert into friendships (user_id, friend_id) values ($1, $2)", [d, a]);
      await client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [a, d]);

      await client.query(readFileSync(lockdown, "utf8"));

      assert.deepEqual(await pair(a, b), { aToB: false, bToA: false, requests: ["a->b"] });
      const moved = (
        await client.query(
          "select created_at from friend_requests where requester_id = $1 and recipient_id = $2",
          [a, b],
        )
      ).rows[0];
      assert.equal(moved.created_at.toISOString(), "2026-01-02T03:04:05.000Z", "the add date carries over");
      assert.deepEqual(await pair(a, c), FRIENDS, "a pair stays a pair");
      assert.deepEqual(await pair(a, d), { aToB: false, bToA: false, requests: ["a->b", "b->a"] });

      await asUser(d);
      await call("accept_friend_request", a);
      assert.deepEqual(await pair(a, d), FRIENDS, "one accept settles both crossed requests");
    },
    { holdLockdown: true },
  );
});
