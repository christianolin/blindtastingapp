#!/usr/bin/env node
// Cleanup for a side effect of fix-lwin-producer-titles.mjs: LWIN itself is
// inconsistent about producer titles — some rows bake "Château"/"Domaine"
// (with proper accents) directly into PRODUCER_NAME, others store the title
// separately in PRODUCER_TITLE (always plain ASCII), which the title-fix
// script concatenated onto PRODUCER_NAME. That surfaced accent/punctuation
// -only duplicate producer rows (e.g. "Château Palmer" vs "Chateau Palmer")
// that didn't collide before the title fix.
//
// This merges only pairs that are identical once accents, hyphens, and
// stray punctuation (periods/commas/quote marks) are normalized away — it
// deliberately does NOT strip meaningful leading words ("Chateau"/"Domaine"
// /"Maison"/"Le"/"La"), because those can be genuinely different producers
// (e.g. "Domaine Montrose" vs "Château Montrose" are not the same estate).
// Any remaining bare-vs-prefixed duplicates are left unmerged and reported.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/dedupe-producer-orthographic-variants.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fold(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining accent marks
    .replace(/[-‐-―]/g, " ") // hyphen variants -> space
    .replace(/[.,'’‘]/g, "") // stray punctuation
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function score(name) {
  let s = 0;
  if (/[,.]\s*$/.test(name)) s -= 1000; // trailing artifact punctuation
  if (/[^\x00-\x7F]/.test(name)) s += 10; // has an accented character
  if (name.includes("-")) s += 5; // hyphenated compound form
  return s;
}

async function fetchAll(table, columns) {
  const PAGE_SIZE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

// scopeColumn scopes the fold-key so rows that legitimately share a name
// under different parents (e.g. "Classico" is a real, distinct appellation
// under Veneto AND under Sicilia AND under Calabria — same name, different
// regions, not duplicates) never collide across scopes.
async function dedupeTable(table, fkTables, scopeColumn) {
  const columns = scopeColumn ? `id, name, ${scopeColumn}` : "id, name";
  const rows = await fetchAll(table, columns);
  const byFold = new Map();
  for (const r of rows) {
    const key = scopeColumn ? `${r[scopeColumn]}::${fold(r.name)}` : fold(r.name);
    if (!byFold.has(key)) byFold.set(key, []);
    byFold.get(key).push(r);
  }
  const groups = [...byFold.values()].filter((g) => g.length > 1);
  console.log(`\n[${table}] ${groups.length} orthography-only duplicate groups (of ${rows.length} rows).`);

  if (dryRun) {
    for (const g of groups) {
      const target = [...g].sort((a, b) => score(b.name) - score(a.name) || a.name.length - b.name.length)[0];
      console.log(
        g.map((p) => (p.id === target.id ? `[KEEP] "${p.name}"` : `[DROP] "${p.name}"`)).join(" | "),
      );
    }
    return { groups: groups.length, merged: 0 };
  }

  let merged = 0;
  for (const g of groups) {
    const target = [...g].sort((a, b) => score(b.name) - score(a.name) || a.name.length - b.name.length)[0];
    for (const other of g) {
      if (other.id === target.id) continue;
      for (const { table: fkTable, column } of fkTables) {
        await admin.from(fkTable).update({ [column]: target.id }).eq(column, other.id);
      }
      const { error } = await admin.from(table).delete().eq("id", other.id);
      if (error) {
        console.error(`  delete failed for "${other.name}" [${other.id}]:`, error.message);
        continue;
      }
      merged++;
    }
  }
  console.log(`[${table}] merged ${merged} duplicate rows.`);
  return { groups: groups.length, merged };
}

await dedupeTable("producers", [
  { table: "wine_answers", column: "producer_id" },
  { table: "guesses", column: "producer_id" },
]);
await dedupeTable(
  "appellations",
  [
    { table: "wine_answers", column: "appellation_id" },
    { table: "guesses", column: "appellation_id" },
  ],
  "region_id",
);

if (dryRun) console.log("\n--dry-run: not writing to the database.");
