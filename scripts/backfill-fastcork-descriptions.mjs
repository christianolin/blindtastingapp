// Re-read every catalog wine's label with FastCork and refresh ONLY its
// description. Names, appellations, grapes, vintages and prices are never
// touched — the catalog's identity fields stay exactly as curated.
//
//   node scripts/backfill-fastcork-descriptions.mjs --mode dry   # show a diff
//   node scripts/backfill-fastcork-descriptions.mjs --mode live  # write
//   node scripts/backfill-fastcork-descriptions.mjs --mode revert
//
// Safety and cost:
//   - Every existing description is written to data/backfills/<file>.json
//     BEFORE anything is updated, so `--mode revert` restores them exactly.
//   - Resumable: a wine already recorded in the backup file is skipped, so a
//     crash or timeout mid-run costs nothing and never double-spends credits.
//   - One FastCork credit per wine, so a full run costs (wines with a photo)
//     credits. Wines with no label photo are skipped — /v1/analyze is
//     image-only, there is no text lookup endpoint.
//
// The description is composed exactly as the live scan path does
// (src/lib/label-scan/extract.ts buildDescription): winery blurb, then aroma,
// then tasting notes. Kept in sync by hand — this is a one-off maintenance
// tool, not part of the request path.

import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

const MODE = (() => {
  const i = process.argv.indexOf("--mode");
  return i >= 0 ? process.argv[i + 1] : "dry";
})();
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();
// Only fill wines that have NO description. The safe, purely-additive subset:
// nothing curated is ever replaced.
const EMPTY_ONLY = process.argv.includes("--empty-only");

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) process.env[m[1]] ??= m[2];
}

const KEY = process.env.FASTCORK_API_KEY;
if (!KEY) throw new Error("FASTCORK_API_KEY is not set (.env.local).");

const BACKUP_DIR = path.join("data", "backfills");
const BACKUP_FILE = path.join(BACKUP_DIR, "catalog-descriptions-backup.json");

function loadBackup() {
  if (!fs.existsSync(BACKUP_FILE)) return {};
  return JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
}
function saveBackup(obj) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(obj, null, 2) + "\n");
}

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Mirrors buildDescription() in src/lib/label-scan/extract.ts.
function buildDescription(r) {
  const parts = [str(r.winery_description), str(r.aroma), str(r.tasting_notes)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return parts || null;
}

async function analyze(imageUrl) {
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`image fetch ${img.status}`);
  const bytes = await img.arrayBuffer();
  const type = img.headers.get("content-type") ?? "image/jpeg";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), "label.jpg");
  form.append("lang", "en");

  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch("https://fastcork.com/v1/analyze", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt === 1) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (res.status === 402) throw new Error("FastCork account is out of credits");
    if (!res.ok) throw new Error(`FastCork ${res.status}`);
    const data = await res.json();
    return data.results?.[0] ?? null;
  }
}

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const label = (w) =>
  [w.producer, w.wine_name, w.appellation, w.vintage_year].filter(Boolean).join(" ");

if (MODE === "revert") {
  const backup = loadBackup();
  const ids = Object.keys(backup);
  if (ids.length === 0) throw new Error("No backup file to revert from.");
  let n = 0;
  for (const id of ids) {
    await c.query("update catalog_wines set description = $2 where id = $1", [
      id,
      backup[id].old_description,
    ]);
    n += 1;
  }
  console.log(`REVERTED ${n} descriptions from ${BACKUP_FILE}`);
  await c.end();
  process.exit(0);
}

const { rows: wines } = await c.query(`
  select c.id, c.description, c.image_url, c.vintage_year,
         pr.name as producer, c.wine_name, ap.name as appellation
    from catalog_wines c
    left join producers pr on pr.id = c.producer_id
    left join appellations ap on ap.id = c.appellation_id
   where c.merged_into is null
     and c.image_url is not null
   order by pr.name nulls last, c.wine_name nulls last
`);

const backup = loadBackup();
const todo = wines
  .filter((w) => !backup[w.id])
  .filter((w) => !EMPTY_ONLY || !w.description || !w.description.trim())
  .slice(0, LIMIT);

console.log(
  `${wines.length} wines with a photo · ${Object.keys(backup).length} already done · ${todo.length} to process · mode=${MODE}`,
);

let updated = 0;
let unchanged = 0;
let failed = 0;

for (const [i, w] of todo.entries()) {
  const tag = `[${i + 1}/${todo.length}] ${label(w)}`;
  try {
    const r = await analyze(w.image_url);
    const next = r ? buildDescription(r) : null;
    if (!next) {
      // FastCork said nothing substantive — keep what's there rather than
      // blanking a description that already reads well.
      console.log(`${tag}\n    SKIP (FastCork returned no prose)`);
      unchanged += 1;
      continue;
    }
    if (MODE === "dry") {
      console.log(`${tag}\n    OLD: ${(w.description ?? "—").slice(0, 110)}`);
      console.log(`    NEW: ${next.slice(0, 110)}`);
      unchanged += 1;
      continue;
    }
    backup[w.id] = {
      label: label(w),
      old_description: w.description,
      new_description: next,
      at: new Date().toISOString(),
    };
    saveBackup(backup); // written BEFORE the update, and after each wine
    await c.query("update catalog_wines set description = $2 where id = $1", [
      w.id,
      next,
    ]);
    console.log(`${tag}\n    UPDATED (${next.length} chars)`);
    updated += 1;
  } catch (e) {
    console.log(`${tag}\n    FAILED: ${e.message}`);
    failed += 1;
  }
}

console.log(
  `\nDONE mode=${MODE} · updated=${updated} · skipped=${unchanged} · failed=${failed}`,
);
if (MODE === "live") console.log(`Backup: ${BACKUP_FILE} (revert with --mode revert)`);
await c.end();
