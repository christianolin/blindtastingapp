// Runs one versionless rollback file (a US one, scripts/usa-map/usa_us2_*.sql, or
// an fp-1 footprint pass one, scripts/wine-map-sources/footprints/*.sql) against
// the LIVE database in a single transaction, and records NOTHING in
// supabase_migrations.schema_migrations (spec 2026-09-29 §16, §25).
//
// Why not the migration applier: it records the file's 14-digit version when
// it applies it and refuses any version already recorded. A rollback may be
// needed twice (the promote fails, the unstage runs, the team re-sits, the
// promote fails again), and a recorded rollback version would be a
// remote-only history row with no file under supabase/migrations. So the
// rollback files carry no version, and this runner never writes history. Each
// file asserts its own pre-state, so a run in the wrong state refuses and
// rolls back.
//
// usage (from the repository root, the main session only, at the sitting):
//   node --env-file=.env.local scripts/usa-map/apply-rollback.mjs <file> --check
//     pre-flight only, no connection
//   node --env-file=.env.local scripts/usa-map/apply-rollback.mjs <file> --dry
//     the whole file inside BEGIN ... ROLLBACK against live; nothing is kept
//   node --env-file=.env.local scripts/usa-map/apply-rollback.mjs <file>
//     apply and commit
// NOTICEs (the neighbour-refresh line) are printed.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";

/**
 * The versionless rollback files this runner may apply, never a migration and never
 * a versioned file: the US ones, and the fp-1 footprint pass's (rendered by
 * footprint-pass.mjs --render-sql / --render-reject).
 */
export const ROLLBACK_FILE_PATTERNS = Object.freeze([
  /^scripts\/usa-map\/usa_us\d+_[a-z_]+\.sql$/,
  /^scripts\/wine-map-sources\/footprints\/footprints_[a-z0-9_-]+_(?:unstage|revert|reject_\d{8}t\d{6}z)\.sql$/,
]);

export function rollbackRefusal(file) {
  const rel = path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/");
  if (!ROLLBACK_FILE_PATTERNS.some((re) => re.test(rel))) {
    return `REFUSED: ${rel} is not a rollback file (scripts/usa-map/usa_us<n>_<name>.sql, or scripts/wine-map-sources/footprints/footprints_<wave>_{unstage,revert,reject_<release>}.sql)`;
  }
  return null;
}

/** Parses argv; throws on anything but <file> [--check | --dry]. */
export function rollbackArgs(argv) {
  const [file, flag, ...rest] = argv;
  if (!file || rest.length) throw new Error("usage: apply-rollback.mjs <file.sql> [--check | --dry]");
  if (flag !== undefined && flag !== "--check" && flag !== "--dry") {
    throw new Error(`REFUSED: unknown flag ${flag} (use --check or --dry, or no flag to apply)`);
  }
  return { file, mode: flag === "--check" ? "check" : flag === "--dry" ? "dry" : "apply" };
}

async function main() {
  let args;
  try {
    args = rollbackArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const refusal = rollbackRefusal(args.file);
  if (refusal) { console.error(refusal); process.exit(2); }
  const sql = await readFile(args.file, "utf8");
  const tx = topLevelTransactionStatements(sql);
  if (tx.length) {
    console.error(`REFUSED: ${args.file} has top-level transaction statements; this runner owns the transaction:`);
    for (const { line, statement } of tx) console.error(`  line ${line}: ${statement}`);
    process.exit(2);
  }
  if (args.mode === "check") { console.log(`PREFLIGHT OK: ${args.file}`); return; }

  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  c.on("notice", (n) => console.log(`NOTICE: ${n.message}`));
  await c.connect();
  const t0 = Date.now();
  try {
    await c.query("begin");
    await c.query(sql);
    if (args.mode === "dry") {
      await c.query("rollback");
      console.log(`DRY RUN OK: ${args.file} ran in ${Date.now() - t0} ms and was rolled back`);
    } else {
      await c.query("commit");
      console.log(`APPLIED: ${args.file} in ${Date.now() - t0} ms (no history row: re-appliable)`);
    }
  } catch (e) {
    try { await c.query("rollback"); } catch { /* the connection may be gone */ }
    console.error("FAILED (rolled back):", e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
