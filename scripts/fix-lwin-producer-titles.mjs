#!/usr/bin/env node
// One-off correction for the initial LWIN import: PRODUCER_NAME alone drops
// the "Chateau"/"Domaine"/etc. prefix, which LWIN stores separately in
// PRODUCER_TITLE. This renames existing producer rows in place (same id, so
// any wine_answers/guesses FK references stay valid) rather than
// delete+reinsert.
//
// Usage:
//   SUPABASE_DB_URL="<pooler connection string>" node scripts/fix-lwin-producer-titles.mjs <path-to-LWINdatabase.xlsx> [--dry-run]
import xlsx from "xlsx";
import pg from "pg";

const [, , xlsxPathArg, ...rest] = process.argv;
const dryRun = rest.includes("--dry-run");

if (!xlsxPathArg) {
  console.error(
    "Usage: SUPABASE_DB_URL=... node scripts/fix-lwin-producer-titles.mjs <path-to-LWINdatabase.xlsx> [--dry-run]",
  );
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("Set SUPABASE_DB_URL to the Supabase pooler connection string.");
  process.exit(1);
}

function safeKey(s) {
  return s
    .trim()
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function dedupeBySafeKey(rawValues) {
  const countsByKey = new Map();
  for (const raw of rawValues) {
    const key = safeKey(raw);
    if (!countsByKey.has(key)) countsByKey.set(key, new Map());
    const spellingCounts = countsByKey.get(key);
    spellingCounts.set(raw, (spellingCounts.get(raw) ?? 0) + 1);
  }
  const canonicalByKey = new Map();
  for (const [key, spellingCounts] of countsByKey) {
    let best = null;
    let bestCount = -1;
    for (const [spelling, count] of spellingCounts) {
      if (count > bestCount) {
        best = spelling;
        bestCount = count;
      }
    }
    canonicalByKey.set(key, best);
  }
  return canonicalByKey;
}

console.log("Reading workbook...");
const wb = xlsx.readFile(xlsxPathArg, { cellDates: false });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

// Rebuild the OLD (title-less, what's currently in the DB from the first
// import) and NEW (title-prefixed, correct) canonical producer names side by
// side, keyed by the same safeKey grouping so old->new is a clean 1:1 map.
const oldRaw = [];
const newRaw = [];
const oldToNewSameRow = new Map(); // old raw spelling -> new raw spelling (per row, before dedup)

for (const r of rows) {
  if (r.STATUS !== "Live") continue;
  if (!r.PRODUCER_NAME || r.PRODUCER_NAME === "NA") continue;
  if (!r.REGION || r.REGION === "NA" || !r.COUNTRY || r.COUNTRY === "NA") continue;

  const oldName = r.PRODUCER_NAME.trim();
  const title = r.PRODUCER_TITLE && r.PRODUCER_TITLE !== "NA" ? r.PRODUCER_TITLE.trim() : null;
  const newName = title ? `${title} ${oldName}` : oldName;

  oldRaw.push(oldName);
  newRaw.push(newName);
  if (!oldToNewSameRow.has(oldName)) oldToNewSameRow.set(oldName, new Map());
  const m = oldToNewSameRow.get(oldName);
  m.set(newName, (m.get(newName) ?? 0) + 1);
}

const oldCanonicalByKey = dedupeBySafeKey(oldRaw);

// For each OLD canonical name (what's actually in the DB right now from the
// first import), look up the NEW (titled) spellings that the SAME raw old
// name mapped to per-row, and take whichever occurred most often. This is a
// direct per-row correlation, not a second independent dedup pass — the old
// and new name spaces have different safeKey groupings (the title prefix
// changes the key), so cross-referencing dedup keys between them doesn't work.
const renameMap = new Map(); // oldCanonical -> newCanonical
for (const [, oldCanonical] of oldCanonicalByKey) {
  const newSpellingCounts = oldToNewSameRow.get(oldCanonical);
  if (!newSpellingCounts) continue;
  let best = null;
  let bestCount = -1;
  for (const [newSpelling, count] of newSpellingCounts) {
    if (count > bestCount) {
      best = newSpelling;
      bestCount = count;
    }
  }
  if (best && best !== oldCanonical) {
    renameMap.set(oldCanonical, best);
  }
}

console.log(`Computed ${renameMap.size} producer renames (of ${oldCanonicalByKey.size} total).`);
console.log("Sample:");
let shown = 0;
for (const [oldName, newName] of renameMap) {
  console.log(`  "${oldName}" -> "${newName}"`);
  if (++shown >= 15) break;
}

if (dryRun) {
  console.log("\n--dry-run: not writing to the database.");
  process.exit(0);
}

const { Client } = pg;
const client = new Client({ connectionString });
await client.connect();

let renamed = 0;
let merged = 0;
let skipped = 0;

try {
  for (const [oldName, newName] of renameMap) {
    const { rows: existing } = await client.query(
      `select id from producers where name = $1`,
      [oldName],
    );
    if (existing.length === 0) {
      skipped++;
      continue;
    }
    const oldId = existing[0].id;

    const { rows: targetRows } = await client.query(
      `select id from producers where name = $1`,
      [newName],
    );

    if (targetRows.length > 0) {
      // Target name already exists as a different row (rare) — reassign any
      // FK references from the old row onto the existing one, then drop it.
      const targetId = targetRows[0].id;
      await client.query(`update wine_answers set producer_id = $1 where producer_id = $2`, [
        targetId,
        oldId,
      ]);
      await client.query(`update guesses set producer_id = $1 where producer_id = $2`, [
        targetId,
        oldId,
      ]);
      await client.query(`delete from producers where id = $1`, [oldId]);
      merged++;
    } else {
      await client.query(`update producers set name = $1 where id = $2`, [newName, oldId]);
      renamed++;
    }
  }
  console.log(`\nRenamed ${renamed}, merged ${merged}, skipped ${skipped} (not found).`);
} finally {
  await client.end();
}
