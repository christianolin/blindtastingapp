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
//
// --publish-hidden-notes (rollback-m1.sql only) sets
// blindr.rollback_publishes_hidden_notes = 'yes' for the transaction. Without
// it rollback-m1.sql refuses while any held note, or anyone's Friends or
// Only me notes setting, exists — the old policy would publish those notes.
// Pass it only with the owner's explicit go-ahead, after reading the counts a
// --dry run prints.
import { readFileSync } from "node:fs";
import pg from "pg";

const [, , file, ...flags] = process.argv;
const known = new Set(["--dry", "--publish-hidden-notes"]);
if (!file || flags.some((f) => !known.has(f)) || new Set(flags).size !== flags.length) {
  console.error("usage: run-sql.mjs <file.sql> [--dry] [--publish-hidden-notes]");
  process.exit(2);
}
const normalized = file.replace(/\\/g, "/");
if (!/^scripts\/sharing-defaults\/rollback-m[12]\.sql$/.test(normalized)) {
  console.error("run-sql.mjs only runs scripts/sharing-defaults/rollback-m1.sql or rollback-m2.sql");
  process.exit(2);
}
const dry = flags.includes("--dry");
const publishHiddenNotes = flags.includes("--publish-hidden-notes");
if (publishHiddenNotes && normalized !== "scripts/sharing-defaults/rollback-m1.sql") {
  console.error("--publish-hidden-notes applies to rollback-m1.sql only");
  process.exit(2);
}
const sql = readFileSync(file, "utf8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.on("notice", (n) => console.log("NOTICE:", n.message));
await client.connect();
try {
  await client.query("begin");
  if (publishHiddenNotes) {
    await client.query("select set_config('blindr.rollback_publishes_hidden_notes', 'yes', true)");
  }
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
