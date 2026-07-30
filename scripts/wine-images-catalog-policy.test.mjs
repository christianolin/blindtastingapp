// wine-images catalog storage policy — migration 20260829250000.
//
// The wine-images bucket's original write policies were tasting-only: they cast
// the first path segment to uuid and checked is_tasting_host/participant. The
// catalog wine hub uploads under `catalog/...`, so casting the literal "catalog"
// to uuid threw and every catalog upload failed. This suite proves the
// CASE-guarded replacement: catalog prefix allowed, uuid (tasting) folders still
// gated, and a non-uuid folder is a clean RLS denial (no uuid-cast throw).
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());

async function withRollback(callback) {
  await client.query("begin");
  try {
    return await callback();
  } finally {
    await client.query("rollback");
  }
}

// RLS probes need the authenticated role + a JWT sub so auth.uid() resolves
// (is_tasting_host/participant read it). Both are transaction-local.
async function actAsAuthenticated(userId) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId }),
  ]);
  await client.query("set local role authenticated");
}

let profileId = null;
async function aProfile() {
  if (profileId) return profileId;
  const r = await client.query("select id from profiles order by id limit 1");
  assert.equal(r.rowCount, 1, "need at least one profile");
  profileId = r.rows[0].id;
  return profileId;
}

const INSERT_OBJECT =
  "insert into storage.objects (bucket_id, name, owner) values ('wine-images', $1, $2) returning id";

before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

test("the three CASE-guarded wine-image write policies exist", async () => {
  const r = await client.query(
    `select policyname, cmd from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'wine image write%'
     order by policyname`,
  );
  assert.deepEqual(
    r.rows.map((x) => [x.policyname, x.cmd]),
    [
      ["wine image write delete", "DELETE"],
      ["wine image write insert", "INSERT"],
      ["wine image write update", "UPDATE"],
    ],
  );
});

test("catalog-prefixed upload is allowed for authenticated", async () => {
  const uid = await aProfile();
  await withRollback(async () => {
    await actAsAuthenticated(uid);
    const inserted = await client.query(INSERT_OBJECT, [
      `catalog/${randomUUID()}/probe.jpg`,
      uid,
    ]);
    assert.equal(inserted.rowCount, 1);
  });
});

test("a uuid folder that is not the caller's tasting is denied", async () => {
  const uid = await aProfile();
  await withRollback(async () => {
    await actAsAuthenticated(uid);
    await assert.rejects(
      client.query(INSERT_OBJECT, [`${randomUUID()}/probe.jpg`, uid]),
      (error) => {
        assert.equal(error.code, "42501");
        assert.match(error.message, /row-level security/);
        return true;
      },
    );
  });
});

test("a non-uuid, non-catalog folder is a clean denial (no uuid-cast throw)", async () => {
  const uid = await aProfile();
  await withRollback(async () => {
    await actAsAuthenticated(uid);
    await assert.rejects(
      client.query(INSERT_OBJECT, ["scratch/probe.jpg", uid]),
      (error) => {
        assert.equal(error.code, "42501");
        return true;
      },
    );
  });
});
