// SCRATCH — dry-run/live migration applier with the repo's discipline:
// version-collision guard + record in schema_migrations; the migration file
// self-asserts via its own raise-exception guards (same transaction). dry =
// rollback, live = commit. Deleted before commit.
//   node scripts/scratch-apply.mjs --file <path.sql> --mode dry|live
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const arg = (n) => {
  const i = process.argv.indexOf("--" + n);
  return i < 0 ? null : process.argv[i + 1];
};
const file = arg("file");
const mode = arg("mode") ?? "dry";
assert.ok(file, "--file required");
assert.ok(["dry", "live"].includes(mode), "--mode dry|live");
const m = /^(\d+)_(.+)\.sql$/.exec(basename(file));
assert.ok(m, "bad migration filename " + file);
const version = m[1];
const name = m[2];
const sql = await readFile(file, "utf8");

const client = new pg.Client({
  ...pgConfig(),
  port: Number(process.env.DB_PORT ?? 5432),
});
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 600000");
  const exists = await client.query(
    "select 1 from supabase_migrations.schema_migrations where version = $1",
    [version],
  );
  assert.equal(exists.rowCount, 0, "version " + version + " already recorded");
  await client.query(sql);
  await client.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
    [version, name, [sql]],
  );
  if (mode === "live") {
    await client.query("commit");
    console.log("LIVE-APPLIED " + version + " " + name);
  } else {
    await client.query("rollback");
    console.log("DRY-OK " + version + " " + name);
  }
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("FAILED " + version + ": " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
