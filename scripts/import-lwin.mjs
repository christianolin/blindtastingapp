#!/usr/bin/env node
// One-off/reusable import of Liv-ex's LWIN wine database into our
// countries/regions/appellations/producers reference tables.
//
// Usage:
//   SUPABASE_DB_URL="<pooler connection string>" node scripts/import-lwin.mjs <path-to-LWINdatabase.xlsx> [--dry-run]
//
// LWIN's own structure (COUNTRY > REGION > SUB_REGION > SITE > PARCEL) is
// finer than our single "appellation" level, and per-row producer/appellation
// spelling has real variance (hyphen vs space, mostly) — see CLAUDE.md
// "LWIN import" section for the reasoning behind every decision below before
// changing this script.
import xlsx from "xlsx";
import pg from "pg";

const [, , xlsxPathArg, ...rest] = process.argv;
const dryRun = rest.includes("--dry-run");

if (!xlsxPathArg) {
  console.error(
    "Usage: SUPABASE_DB_URL=... node scripts/import-lwin.mjs <path-to-LWINdatabase.xlsx> [--dry-run]",
  );
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!dryRun && !connectionString) {
  console.error("Set SUPABASE_DB_URL to the Supabase pooler connection string.");
  process.exit(1);
}

// LWIN uses English region names for a handful of regions we'd already
// seeded under their native-language name (matches the app's French/Italian
// wine-label branding). Scoped by country to avoid unrelated collisions.
const REGION_SYNONYMS = {
  "France:Burgundy": "Bourgogne",
  "France:Rhone": "Rhône",
  "Italy:Piedmont": "Piemonte",
  "Italy:Tuscany": "Toscana",
  "Italy:Sicily": "Sicilia",
  "Portugal:Dao": "Dão",
  "Spain:Catalunya": "Catalonia",
};

function resolveRegionName(country, rawRegion) {
  return REGION_SYNONYMS[`${country}:${rawRegion}`] ?? rawRegion;
}

// Canonicalizes hyphen vs space and whitespace only — does NOT strip
// accents or collapse spaces entirely, so "Lagrange" stays distinct from
// "La Grange" (likely different real producers) while "Coche-Dury" and
// "Coche Dury" correctly merge (same producer, punctuation difference).
function safeKey(s) {
  return s
    .trim()
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Dedupes a list of raw spellings by safeKey, keeping whichever original
// spelling occurs most often in the data (ties keep the first one seen).
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

async function batchInsert(client, table, columns, rows, conflictCols, batchSize = 500) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((row) => {
      const placeholderForRow = row.map((_, colIdx) => {
        values.push(row[colIdx]);
        return `$${values.length}`;
      });
      return `(${placeholderForRow.join(",")})`;
    });
    const sql = `insert into ${table} (${columns.join(",")}) values ${placeholders.join(",")} on conflict (${conflictCols}) do nothing`;
    await client.query(sql, values);
  }
}

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
console.log(`${liveRows.length} usable Live rows (STATUS=Live, has country+region)`);

const countryNames = new Set();
for (const r of liveRows) countryNames.add(r.COUNTRY.trim());

const regionsByCountry = new Map();
for (const r of liveRows) {
  const country = r.COUNTRY.trim();
  const region = resolveRegionName(country, r.REGION.trim());
  if (!regionsByCountry.has(country)) regionsByCountry.set(country, new Set());
  regionsByCountry.get(country).add(region);
}

const appellationRawByRegionKey = new Map();
for (const r of liveRows) {
  const site = r.SITE && r.SITE !== "NA" ? r.SITE.trim() : null;
  const subRegion = r.SUB_REGION && r.SUB_REGION !== "NA" ? r.SUB_REGION.trim() : null;
  const candidate = site || subRegion;
  if (!candidate) continue;
  const country = r.COUNTRY.trim();
  const region = resolveRegionName(country, r.REGION.trim());
  const key = `${country}|${region}`;
  if (!appellationRawByRegionKey.has(key)) appellationRawByRegionKey.set(key, []);
  appellationRawByRegionKey.get(key).push(candidate);
}
const appellationCanonicalByRegionKey = new Map();
let totalAppellations = 0;
for (const [key, rawList] of appellationRawByRegionKey) {
  const names = new Set(dedupeBySafeKey(rawList).values());
  appellationCanonicalByRegionKey.set(key, names);
  totalAppellations += names.size;
}

// LWIN sometimes bakes the title ("Chateau"/"Domaine"/"Maison"/...) directly
// into PRODUCER_NAME and sometimes stores it separately in PRODUCER_TITLE —
// concatenate it here so every producer gets its full name on first import
// (see scripts/fix-lwin-producer-titles.mjs, which corrected this after the
// fact for an import that predated this fix).
const producerRaw = [];
for (const r of liveRows) {
  if (!r.PRODUCER_NAME || r.PRODUCER_NAME === "NA") continue;
  const title = r.PRODUCER_TITLE && r.PRODUCER_TITLE !== "NA" ? r.PRODUCER_TITLE.trim() : null;
  const name = title ? `${title} ${r.PRODUCER_NAME.trim()}` : r.PRODUCER_NAME.trim();
  producerRaw.push(name);
}
const producerNames = new Set(dedupeBySafeKey(producerRaw).values());

const totalRegions = [...regionsByCountry.values()].reduce((a, s) => a + s.size, 0);

console.log("\n=== Summary ===");
console.log("Countries:", countryNames.size);
console.log("Regions:", totalRegions);
console.log("Appellations:", totalAppellations, `(across ${appellationCanonicalByRegionKey.size} region groups)`);
console.log("Producers:", producerNames.size, `(deduped from ${producerRaw.length} raw mentions)`);

if (dryRun) {
  console.log("\n--dry-run: not writing to the database.");
  process.exit(0);
}

const { Client } = pg;
const client = new Client({ connectionString });
await client.connect();

try {
  console.log("\nFixing known pre-existing naming mismatches...");
  await client.query(`update countries set name = 'United States' where name = 'USA'`);
  await client.query(
    `update regions set name = 'Languedoc' where name = 'Languedoc-Roussillon'`,
  );

  console.log("Inserting countries...");
  await batchInsert(
    client,
    "countries",
    ["name"],
    [...countryNames].map((n) => [n]),
    "name",
  );

  const countryIdByName = new Map();
  {
    const { rows: countryRows } = await client.query(`select id, name from countries`);
    for (const row of countryRows) countryIdByName.set(row.name, row.id);
  }

  const regionRows = [];
  for (const [country, regionSet] of regionsByCountry) {
    const countryId = countryIdByName.get(country);
    if (!countryId) continue;
    for (const region of regionSet) regionRows.push([countryId, region]);
  }
  console.log(`Inserting ${regionRows.length} regions...`);
  await batchInsert(client, "regions", ["country_id", "name"], regionRows, "country_id, name");

  const regionIdByCountryRegion = new Map();
  {
    const { rows: regionRowsFromDb } = await client.query(
      `select r.id, c.name as country_name, r.name as region_name from regions r join countries c on c.id = r.country_id`,
    );
    for (const row of regionRowsFromDb) {
      regionIdByCountryRegion.set(`${row.country_name}|${row.region_name}`, row.id);
    }
  }

  const appellationRows = [];
  for (const [key, nameSet] of appellationCanonicalByRegionKey) {
    const regionId = regionIdByCountryRegion.get(key);
    if (!regionId) continue;
    for (const name of nameSet) appellationRows.push([regionId, name]);
  }
  console.log(`Inserting ${appellationRows.length} appellations...`);
  await batchInsert(
    client,
    "appellations",
    ["region_id", "name"],
    appellationRows,
    "region_id, name",
  );

  console.log(`Inserting ${producerNames.size} producers...`);
  await batchInsert(
    client,
    "producers",
    ["name"],
    [...producerNames].map((n) => [n]),
    "name",
  );

  console.log("Adding fallback self-named appellations for any region left with none...");
  const { rowCount: fallbackCount } = await client.query(`
    insert into appellations (region_id, name)
    select r.id, r.name
    from regions r
    where not exists (select 1 from appellations a where a.region_id = r.id)
    on conflict (region_id, name) do nothing
  `);
  console.log(`Added ${fallbackCount} fallback appellations.`);

  console.log("\nDone.");
} finally {
  await client.end();
}
