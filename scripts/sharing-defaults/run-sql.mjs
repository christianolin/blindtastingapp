// Runs one sharing-defaults rollback file against the LIVE database in a
// single transaction (spec docs/superpowers/specs/2026-09-27-sharing-defaults-design.md
// §10.3). Unlike the migration applier it writes no schema_migrations row:
// each rollback file deletes the history row of the migration it undoes.
// Main session only, with the owner's go-ahead; always --dry first.
//
//   node --env-file=.env.local scripts/sharing-defaults/run-sql.mjs scripts/sharing-defaults/rollback-m2.sql --dry
//   node --env-file=.env.local scripts/sharing-defaults/run-sql.mjs scripts/sharing-defaults/rollback-m2.sql
//
// --dry runs the whole file inside BEGIN ... ROLLBACK: every statement and
// every same-transaction assert executes, nothing is kept.
import { readFileSync } from "node:fs";
import pg from "pg";

const [, , file, flag] = process.argv;
if (!file || (flag !== undefined && flag !== "--dry")) {
  console.error("usage: run-sql.mjs <file.sql> [--dry]");
  process.exit(2);
}
if (!/^scripts\/sharing-defaults\/rollback-m[12]\.sql$/.test(file.replace(/\\/g, "/"))) {
  console.error("run-sql.mjs only runs scripts/sharing-defaults/rollback-m1.sql or rollback-m2.sql");
  process.exit(2);
}
const dry = flag === "--dry";
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
