// user_preferences DB suite (spec docs/superpowers/specs/2026-09-27-cellar-sort-memory.md
// C3, C4, §3): a person's own saved cellar sort. Owner-only RLS (read, insert
// and update their own row; no delete), the check constraint on the five sort
// keys, the exact client grants (anon nothing; authenticated SELECT,
// INSERT (user_id, cellar_sort), UPDATE (cellar_sort)), the account-deletion
// trigger that removes a person's row when their profile's deleted_at is set,
// and the insert guard that refuses a row for a deleted profile afterwards.
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles created inside that transaction: no real
// person's row decides a result or is written.
//
//   node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout \
//     scripts/user-preferences.test.mjs
//
// Dry run before the migration is live: USER_PREFERENCES_APPLY lists migration
// files (comma-separated, in order) that each test applies inside its own
// rolled-back transaction first, e.g.
//   USER_PREFERENCES_APPLY=supabase/migrations/20260927110000_user_preferences.sql \
//     node --env-file=.env.local --test scripts/user-preferences.test.mjs
// Without it, and before 20260927110000 is live, every test fails (the table
// does not exist).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const APPLY = (process.env.USER_PREFERENCES_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);
const TABLE = "public.user_preferences";
const DROP_FN = "public.drop_deleted_profile_preferences()";
const GUARD_FN = "public.user_preferences_guard()";
const DELETED = /this account has been deleted/;
const SORT_KEYS = ["bottles", "name", "added", "yours", "community"];

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
async function asUser(id) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}
async function asAnon() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
  await client.query("set local role anon");
}

// Throwaway people that exist only inside the current transaction.
async function freshProfiles(n) {
  await asOwner();
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'user-preferences-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`User preferences test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

// Runs `fn` inside a savepoint that is always rolled back, and checks it failed
// with `code` (and, when given, a message matching `message`).
async function expectError(fn, code, what, message) {
  await client.query("savepoint expect_error");
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await client.query("rollback to savepoint expect_error");
  assert.ok(error, `${what}: expected SQLSTATE ${code}, but it succeeded`);
  assert.equal(error.code, code, `${what}: ${error.message}`);
  if (message) assert.match(error.message, message, what);
}

// Owner-role (RLS-bypassing) read of one person's saved sort; undefined = no row.
async function savedSort(id) {
  await asOwner();
  const r = await client.query("select cellar_sort from user_preferences where user_id = $1", [id]);
  return r.rowCount === 0 ? undefined : r.rows[0].cellar_sort;
}

test("a person inserts, updates and reads back their own row, every sort key", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    await asUser(a);
    const ins = await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [a]);
    assert.equal(ins.rowCount, 1);
    for (const key of SORT_KEYS) {
      const up = await client.query(
        "update user_preferences set cellar_sort = $2 where user_id = $1 returning user_id",
        [a, key],
      );
      assert.equal(up.rowCount, 1, key);
      const read = await client.query("select user_id, cellar_sort from user_preferences");
      assert.deepEqual(read.rows, [{ user_id: a, cellar_sort: key }], "reads exactly their own row");
    }
  });
});

test("saveCellarSort's statements: update (0 rows) then insert the first time, update after", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    await asUser(a);
    const first = await client.query(
      "update user_preferences set cellar_sort = 'community' where user_id = $1 returning user_id",
      [a],
    );
    assert.equal(first.rowCount, 0, "no row yet");
    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'community')", [a]);
    await expectError(
      () => client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [a]),
      "23505",
      "a second insert (another tab) hits the primary key, and the action updates again",
    );
    const again = await client.query(
      "update user_preferences set cellar_sort = 'name' where user_id = $1 returning user_id",
      [a],
    );
    assert.equal(again.rowCount, 1);
    assert.equal(await savedSort(a), "name");
  });
});

test("the PostgREST upsert shape is refused: its DO UPDATE SET names user_id, which no client updates", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    await asUser(a);
    await expectError(
      () =>
        client.query(
          `insert into user_preferences (user_id, cellar_sort) values ($1, 'name')
           on conflict (user_id) do update set user_id = excluded.user_id, cellar_sort = excluded.cellar_sort`,
          [a],
        ),
      "42501",
      "UPDATE is granted on cellar_sort only",
    );
  });
});

test("nobody reads, inserts, updates or takes over another person's row", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asOwner();
    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [b]);

    await asUser(a);
    assert.equal((await client.query("select * from user_preferences")).rowCount, 0, "b's row is invisible to a");
    assert.equal(
      (await client.query("select * from user_preferences where user_id = $1", [b])).rowCount,
      0,
      "even by id",
    );
    const up = await client.query("update user_preferences set cellar_sort = 'bottles' where user_id = $1", [b]);
    assert.equal(up.rowCount, 0, '"read own"/"update own" filter b\'s row');
    await expectError(
      () => client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'added')", [b]),
      "42501",
      "insert for someone else: WITH CHECK (user_id = auth.uid())",
    );

    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'added')", [a]);
    await expectError(
      () => client.query("update user_preferences set user_id = $2 where user_id = $1", [a, b]),
      "42501",
      "moving one's own row onto another person: no UPDATE on user_id",
    );
    assert.equal(await savedSort(b), "name", "b's row is untouched");
    assert.equal(await savedSort(a), "added");
  });
});

test("no client DELETE, not even of one's own row", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    await asUser(a);
    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [a]);
    await expectError(
      () => client.query("delete from user_preferences where user_id = $1", [a]),
      "42501",
      "no DELETE grant",
    );
    assert.equal(await savedSort(a), "name");
  });
});

test("the check constraint refuses anything but the five sort keys", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    await asUser(a);
    for (const bad of ["price", "Added", "ADDED", " added", "", "newest"]) {
      await expectError(
        () => client.query("insert into user_preferences (user_id, cellar_sort) values ($1, $2)", [a, bad]),
        "23514",
        `insert ${JSON.stringify(bad)}`,
      );
    }
    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'yours')", [a]);
    await expectError(
      () => client.query("update user_preferences set cellar_sort = 'price' where user_id = $1", [a]),
      "23514",
      "update to an unknown key",
    );
    assert.equal(await savedSort(a), "yours");
  });
});

test("anon holds no privilege at all", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    await asOwner();
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const r = await client.query("select has_table_privilege('anon', $1, $2) as held", [TABLE, priv]);
      assert.equal(r.rows[0].held, false, `anon ${priv}`);
    }
    for (const priv of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
      const r = await client.query("select has_any_column_privilege('anon', $1, $2) as held", [TABLE, priv]);
      assert.equal(r.rows[0].held, false, `anon column ${priv}`);
    }
    const publicAcl = await client.query(
      `select count(*)::int n from information_schema.table_privileges
        where table_schema = 'public' and table_name = 'user_preferences' and grantee in ('anon', 'PUBLIC')`,
    );
    assert.equal(publicAcl.rows[0].n, 0, "information_schema lists nothing for anon or PUBLIC");

    await asAnon();
    await expectError(() => client.query("select * from user_preferences"), "42501", "anon select");
    await expectError(
      () => client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [a]),
      "42501",
      "anon insert",
    );
  });
});

test("authenticated holds exactly SELECT, INSERT (user_id, cellar_sort) and UPDATE (cellar_sort)", async () => {
  await withRollback(async () => {
    await asOwner();
    const table = await client.query(
      `select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") as privs
         from pg_class c, aclexplode(c.relacl) a
        where c.oid = $1::regclass and a.grantee = 'authenticated'::regrole`,
      [TABLE],
    );
    assert.equal(table.rows[0].privs, "SELECT", "table level");
    const columns = await client.query(
      `select string_agg(format('%s:%s:%s', t.attname, pg_get_userbyid(a.grantee), a.privilege_type), ','
                         order by t.attnum, a.privilege_type collate "C") as privs
         from pg_attribute t, aclexplode(t.attacl) a
        where t.attrelid = $1::regclass and t.attnum > 0 and not t.attisdropped`,
      [TABLE],
    );
    assert.equal(
      columns.rows[0].privs,
      "user_id:authenticated:INSERT,cellar_sort:authenticated:INSERT,cellar_sort:authenticated:UPDATE",
      "column level: nothing else, for no other role",
    );
    const checks = await client.query(
      `select has_table_privilege('authenticated', $1, 'SELECT') as sel,
              has_table_privilege('authenticated', $1, 'INSERT') as ins_table,
              has_table_privilege('authenticated', $1, 'UPDATE') as upd_table,
              has_table_privilege('authenticated', $1, 'DELETE') as del,
              has_table_privilege('authenticated', $1, 'TRUNCATE') as trunc,
              has_column_privilege('authenticated', $1, 'user_id', 'INSERT') as ins_user,
              has_column_privilege('authenticated', $1, 'cellar_sort', 'INSERT') as ins_sort,
              has_column_privilege('authenticated', $1, 'cellar_sort', 'UPDATE') as upd_sort,
              has_column_privilege('authenticated', $1, 'user_id', 'UPDATE') as upd_user`,
      [TABLE],
    );
    assert.deepEqual(checks.rows[0], {
      sel: true,
      ins_table: false,
      upd_table: false,
      del: false,
      trunc: false,
      ins_user: true,
      ins_sort: true,
      upd_sort: true,
      upd_user: false,
    });
  });
});

test("setting a profile's deleted_at removes that person's row, and only theirs", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asOwner();
    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name'), ($2, 'bottles')", [a, b]);
    await client.query("update profiles set deleted_at = now() where id = $1", [a]);
    assert.equal(await savedSort(a), undefined, "a's row is gone");
    assert.equal(await savedSort(b), "bottles", "b's row stays");
  });
});

test("the account-deletion scrub removes the row too (it stamps deleted_at)", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    await asUser(a);
    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'community')", [a]);
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [a]);
    assert.equal(await savedSort(a), undefined);
    await asUser(a);
    await expectError(
      () => client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [a]),
      "42501",
      "a token issued before the scrub cannot write a row back",
      DELETED,
    );
    assert.equal(await savedSort(a), undefined);
  });
});

test("no row for a deleted profile: the insert guard refuses it, whoever writes it", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asOwner();
    await client.query("update profiles set deleted_at = now() where id = $1", [a]);
    // The profile row is kept (so the foreign key is satisfied), and an access
    // token issued before the deletion still names a until it expires.
    await asUser(a);
    await expectError(
      () => client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [a]),
      "42501",
      "a leftover token inserts for the deleted profile",
      DELETED,
    );
    await asOwner();
    await expectError(
      () => client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [a]),
      "42501",
      "the owner inserts for the deleted profile",
      DELETED,
    );
    assert.equal(await savedSort(a), undefined, "no row was written");

    // A live profile is untouched by the guard.
    await asUser(b);
    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'bottles')", [b]);
    assert.equal(await savedSort(b), "bottles");
  });
});

test("the insert guard is the table's only trigger, BEFORE INSERT, and its function is owner-only", async () => {
  await withRollback(async () => {
    await asOwner();
    const trig = await client.query(
      `select t.tgname, t.tgtype, t.tgenabled, t.tgfoid = to_regprocedure($2) as calls_guard,
              regexp_replace(pg_get_triggerdef(t.oid), '\\mpublic\\.', '', 'g') as def
         from pg_trigger t
        where t.tgrelid = $1::regclass and not t.tgisinternal`,
      [TABLE, GUARD_FN],
    );
    assert.deepEqual(trig.rows, [
      {
        tgname: "user_preferences_guard",
        tgtype: 7,
        tgenabled: "O",
        calls_guard: true,
        def: "CREATE TRIGGER user_preferences_guard BEFORE INSERT ON user_preferences FOR EACH ROW EXECUTE FUNCTION user_preferences_guard()",
      },
    ]);
    const fn = await client.query(
      `select p.prosecdef, p.proconfig,
              (select string_agg(case when a.grantee = 0 then 'PUBLIC'
                                      when a.grantee = p.proowner then 'OWNER'
                                      else pg_get_userbyid(a.grantee)::text end, ',')
                 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') as execute_holders,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
         from pg_proc p where p.oid = to_regprocedure($1)`,
      [GUARD_FN],
    );
    assert.equal(fn.rowCount, 1, `${GUARD_FN} exists`);
    assert.deepEqual(fn.rows[0], {
      prosecdef: true,
      proconfig: ["search_path=public"],
      execute_holders: "OWNER",
      anon: false,
      authenticated: false,
      service_role: false,
    });
  });
});

test("an update of a profile that is not a deletion leaves the row alone", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    await asOwner();
    await client.query("insert into user_preferences (user_id, cellar_sort) values ($1, 'name')", [a]);
    await client.query("update profiles set display_name = 'Renamed' where id = $1", [a]);
    await client.query("update profiles set deleted_at = null where id = $1", [a]);
    assert.equal(await savedSort(a), "name");
  });
});

test("the trigger fires only when deleted_at goes from null to set, and its function is owner-only", async () => {
  await withRollback(async () => {
    await asOwner();
    const trig = await client.query(
      `select t.tgtype, t.tgenabled,
              regexp_replace(pg_get_triggerdef(t.oid), '\\mpublic\\.', '', 'g') as def
         from pg_trigger t
        where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_drop_preferences'`,
    );
    assert.equal(trig.rowCount, 1, "profiles_deleted_drop_preferences exists");
    assert.equal(trig.rows[0].tgtype, 17, "AFTER UPDATE, FOR EACH ROW");
    assert.equal(trig.rows[0].tgenabled, "O");
    assert.equal(
      trig.rows[0].def,
      "CREATE TRIGGER profiles_deleted_drop_preferences AFTER UPDATE OF deleted_at ON profiles " +
        "FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) " +
        "EXECUTE FUNCTION drop_deleted_profile_preferences()",
    );
    const fn = await client.query(
      `select p.prosecdef, p.proconfig,
              (select string_agg(case when a.grantee = 0 then 'PUBLIC'
                                      when a.grantee = p.proowner then 'OWNER'
                                      else pg_get_userbyid(a.grantee)::text end, ',')
                 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') as execute_holders,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
         from pg_proc p where p.oid = to_regprocedure($1)`,
      [DROP_FN],
    );
    assert.equal(fn.rowCount, 1, `${DROP_FN} exists`);
    assert.deepEqual(fn.rows[0], {
      prosecdef: true,
      proconfig: ["search_path=public"],
      execute_holders: "OWNER",
      anon: false,
      authenticated: false,
      service_role: false,
    });
  });
});

test("RLS is enabled and not forced; exactly the three policies", async () => {
  await withRollback(async () => {
    await asOwner();
    const rls = await client.query(
      "select relrowsecurity, relforcerowsecurity from pg_class where oid = $1::regclass",
      [TABLE],
    );
    assert.deepEqual(rls.rows[0], { relrowsecurity: true, relforcerowsecurity: false });
    const policies = await client.query(
      `select policyname, permissive, roles::text as roles, cmd, qual, with_check
         from pg_policies where schemaname = 'public' and tablename = 'user_preferences'
        order by policyname collate "C"`,
    );
    assert.deepEqual(policies.rows, [
      {
        policyname: "user preferences insert own",
        permissive: "PERMISSIVE",
        roles: "{authenticated}",
        cmd: "INSERT",
        qual: null,
        with_check: "(user_id = auth.uid())",
      },
      {
        policyname: "user preferences read own",
        permissive: "PERMISSIVE",
        roles: "{authenticated}",
        cmd: "SELECT",
        qual: "(user_id = auth.uid())",
        with_check: null,
      },
      {
        policyname: "user preferences update own",
        permissive: "PERMISSIVE",
        roles: "{authenticated}",
        cmd: "UPDATE",
        qual: "(user_id = auth.uid())",
        with_check: "(user_id = auth.uid())",
      },
    ]);
  });
});

test("the table is spec C3's: two columns, the key, the cascade and the check", async () => {
  await withRollback(async () => {
    await asOwner();
    const cols = await client.query(
      `select a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull, a.atthasdef
         from pg_attribute a where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
        order by a.attnum`,
      [TABLE],
    );
    assert.deepEqual(cols.rows, [
      { attname: "user_id", type: "uuid", attnotnull: true, atthasdef: false },
      { attname: "cellar_sort", type: "text", attnotnull: false, atthasdef: false },
    ]);
    const cons = await client.query(
      `select k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\\mpublic\\.', '', 'g') as def
         from pg_constraint k where k.conrelid = $1::regclass order by k.conname collate "C"`,
      [TABLE],
    );
    assert.deepEqual(cons.rows, [
      {
        conname: "user_preferences_cellar_sort_check",
        def:
          "CHECK ((cellar_sort = ANY (ARRAY['bottles'::text, 'name'::text, 'added'::text, 'yours'::text, 'community'::text])))",
      },
      { conname: "user_preferences_pkey", def: "PRIMARY KEY (user_id)" },
      {
        conname: "user_preferences_user_id_fkey",
        def: "FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE",
      },
    ]);
  });
});
