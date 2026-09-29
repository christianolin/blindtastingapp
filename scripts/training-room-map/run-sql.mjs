// Runs one training-room-map rollback file against the LIVE database in a
// single transaction (spec docs/superpowers/specs/2026-09-29-training-room-map-design.md
// §4.5). Unlike the migration applier it writes no schema_migrations row: each
// rollback file removes its migration's history row by name. Main session
// only, with the owner's go-ahead; always --dry first.
//
//   node --env-file=.env.local scripts/training-room-map/run-sql.mjs scripts/training-room-map/rollback-r1b.sql --dry
//   node --env-file=.env.local scripts/training-room-map/run-sql.mjs scripts/training-room-map/rollback-r1b.sql
//
// --dry runs the whole file inside BEGIN ... ROLLBACK: every statement and
// every same-transaction assert executes, nothing is kept.
import { readFileSync } from "node:fs";
import pg from "pg";

const [, , file, ...flags] = process.argv;
if (!file || flags.some((f) => f !== "--dry") || flags.length > 1) {
  console.error("usage: run-sql.mjs <file.sql> [--dry]");
  process.exit(2);
}
const normalized = file.replace(/\\/g, "/");
if (!/^scripts\/training-room-map\/rollback-r(1a|1b|2)\.sql$/.test(normalized)) {
  console.error("run-sql.mjs only runs scripts/training-room-map/rollback-r1a.sql, rollback-r1b.sql or rollback-r2.sql");
  process.exit(2);
}
const dry = flags.includes("--dry");
const sql = readFileSync(file, "utf8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.on("notice", (n) => console.log("NOTICE:", n.message));
await client.connect();
try {
  await client.query("begin");
  const t0 = Date.now();
  await client.query(sql);
  if (dry) {
    await client.query("rollback");
    console.log(`DRY RUN OK: ${file} ran in ${Date.now() - t0} ms and was rolled back`);
  } else {
    await client.query("commit");
    console.log(`APPLIED: ${file} in ${Date.now() - t0} ms`);
  }
} catch (e) {
  try {
    await client.query("rollback");
  } catch {
    // the connection is gone; nothing was committed
  }
  console.error("FAILED (rolled back):", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
