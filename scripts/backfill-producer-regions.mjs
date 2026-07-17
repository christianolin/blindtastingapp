#!/usr/bin/env node
// One-off backfill for producers.region_id (added in
// 20260720090000_producer_region_scoping.sql). The original import
// (import-lwin.mjs) deduped producers purely by name, discarding each raw
// row's country/region -- so this re-reads the same LWIN source file and
// re-derives, per producer, which region its raw mentions came from.
//
// A producer's raw mentions are NOT always a single region (see CLAUDE.md
// "Producer region scoping" for the analysis): ~92% are single-region,
// ~3% have a strongly dominant region (>=80% of mentions), and ~5% are
// genuinely split across regions (real multi-region brands, or rare
// same-name collisions across different countries/estates). Only the first
// two groups get a region_id written; the rest are left NULL on purpose --
// search_producers() always includes NULL-region producers regardless of
// the query's region filter, so leaving one NULL just means "never
// filtered", not "invisible".
//
// Usage:
//   PGPASS=... node scripts/backfill-producer-regions.mjs <path-to-LWINdatabase.xlsx> [--dry-run]
import xlsx from "xlsx";
import pg from "pg";

const [, , xlsxPathArg, ...rest] = process.argv;
const dryRun = rest.includes("--dry-run");

if (!xlsxPathArg) {
  console.error(
    "Usage: PGPASS=... node scripts/backfill-producer-regions.mjs <path-to-LWINdatabase.xlsx> [--dry-run]",
  );
  process.exit(1);
}

const password = process.env.PGPASS;
if (!dryRun && !password) {
  console.error("Set PGPASS to the Supabase pooler connection password.");
  process.exit(1);
}

// Same corrections import-lwin.mjs applies post-insert -- the raw LWIN
// source still says "USA" / "Languedoc-Roussillon", but the live countries/
// regions tables were renamed after the original import.
const COUNTRY_RENAMES = { USA: "United States" };
const REGION_RENAMES = { "Languedoc-Roussillon": "Languedoc" };

// Same synonym table as import-lwin.mjs, scoped by country.
const REGION_SYNONYMS = {
  "France:Burgundy": "Bourgogne",
  "France:Rhone": "Rhône",
  "Italy:Piedmont": "Piemonte",
  "Italy:Tuscany": "Toscana",
  "Italy:Sicily": "Sicilia",
  "Portugal:Dao": "Dão",
  "Spain:Catalunya": "Catalonia",
};

function resolveCountryName(country) {
  return COUNTRY_RENAMES[country] ?? country;
}

function resolveRegionName(country, rawRegion) {
  const synonym = REGION_SYNONYMS[`${country}:${rawRegion}`] ?? rawRegion;
  return REGION_RENAMES[synonym] ?? synonym;
}

// Identical to import-lwin.mjs's safeKey/dedupeBySafeKey so the same raw
// spellings collapse onto the same canonical producer name already stored
// in the database.
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

const STRONG_MAJORITY_THRESHOLD = 0.8;

console.log("Reading workbook (this can take a minute for a 200k-row file)...");
const wb = xlsx.readFile(xlsxPathArg, { cellDates: false });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
console.log(`Read ${rows.length} rows`);

const liveRows = rows.filter(
  (r) =>
    r.STATUS === "Live" &&
    r.COUNTRY &&
    r.COUNTRY !== "NA" &&
    r.REGION &&
    r.REGION !== "NA",
);
console.log(`${liveRows.length} usable Live rows`);

const producerRaw = [];
for (const r of liveRows) {
  if (!r.PRODUCER_NAME || r.PRODUCER_NAME === "NA") continue;
  const title = r.PRODUCER_TITLE && r.PRODUCER_TITLE !== "NA" ? r.PRODUCER_TITLE.trim() : null;
  const name = title ? `${title} ${r.PRODUCER_NAME.trim()}` : r.PRODUCER_NAME.trim();
  const country = resolveCountryName(r.COUNTRY.trim());
  const region = resolveRegionName(r.COUNTRY.trim(), r.REGION.trim());
  producerRaw.push({ name, country, region });
}
const canonicalByKey = dedupeBySafeKey(producerRaw.map((p) => p.name));

// safeKey -> Map<"country|region", count>
const regionCountsByKey = new Map();
for (const p of producerRaw) {
  const key = safeKey(p.name);
  if (!regionCountsByKey.has(key)) regionCountsByKey.set(key, new Map());
  const m = regionCountsByKey.get(key);
  const rk = `${p.country}|${p.region}`;
  m.set(rk, (m.get(rk) ?? 0) + 1);
}

const assignments = []; // { producerName, country, region }
let singleRegionCount = 0;
let strongMajorityCount = 0;
let ambiguousCount = 0;

for (const [key, regionCounts] of regionCountsByKey) {
  const producerName = canonicalByKey.get(key);
  const total = [...regionCounts.values()].reduce((a, b) => a + b, 0);
  const entries = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 1) {
    singleRegionCount++;
  } else if (entries[0][1] / total >= STRONG_MAJORITY_THRESHOLD) {
    strongMajorityCount++;
  } else {
    ambiguousCount++;
    continue;
  }
  const [country, region] = entries[0][0].split("|");
  assignments.push({ producerName, country, region });
}

console.log("\n=== Summary ===");
console.log("Distinct producers:", regionCountsByKey.size);
console.log("Single region -> assigned:", singleRegionCount);
console.log("Strong majority (>=80%) -> assigned:", strongMajorityCount);
console.log("Ambiguous (<80%) -> left NULL:", ambiguousCount);
console.log("Total to assign:", assignments.length);

if (dryRun) {
  console.log("\n--dry-run: not writing to the database.");
  process.exit(0);
}

const client = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: 6543,
  user: "postgres.eqzwmkpeysqiihuojmuj",
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  console.log("\nLoading region ids from the database...");
  const { rows: regionRows } = await client.query(
    `select r.id, c.name as country_name, r.name as region_name from regions r join countries c on c.id = r.country_id`,
  );
  const regionIdByCountryRegion = new Map();
  for (const row of regionRows) {
    regionIdByCountryRegion.set(`${row.country_name}|${row.region_name}`, row.id);
  }

  let updated = 0;
  let skippedNoRegion = 0;
  const BATCH_SIZE = 500;
  for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
    const batch = assignments.slice(i, i + BATCH_SIZE);
    for (const a of batch) {
      const regionId = regionIdByCountryRegion.get(`${a.country}|${a.region}`);
      if (!regionId) {
        skippedNoRegion++;
        continue;
      }
      const { rowCount } = await client.query(
        `update producers set region_id = $1 where name = $2 and region_id is null`,
        [regionId, a.producerName],
      );
      updated += rowCount;
    }
    console.log(`Processed ${Math.min(i + BATCH_SIZE, assignments.length)}/${assignments.length}...`);
  }

  console.log("\n=== Done ===");
  console.log("Producers updated:", updated);
  console.log("Skipped (region not found in DB):", skippedNoRegion);

  const { rows: countRows } = await client.query(
    `select count(*) filter (where region_id is not null) as linked, count(*) as total from producers`,
  );
  console.log(`producers.region_id set on ${countRows[0].linked} of ${countRows[0].total} total rows.`);
} finally {
  await client.end();
}
