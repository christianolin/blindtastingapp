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
