#!/usr/bin/env node
// Appends the real-world geographic designation (AOP, DOCG, DOC, IGT, AVA,
// etc.) to the end of an appellation's name where LWIN records one — e.g.
// "Barolo" -> "Barolo DOCG", "Napa Valley" -> "Napa Valley AVA", and the
// region-level fallback appellations too ("Bordeaux" -> "Bordeaux AOP").
//
// LWIN's DESIGNATION column is per-wine-row, not per-appellation, but for a
// given (country, region, sub_region/site) group it's almost always a single
// consistent value (388 of 3542 groups had ANY disagreement, and even those
// were dominated 100:1+ by one value) — so this takes the most common
// (mode) designation per group, the same "most common spelling wins" idea
// already used for name dedup elsewhere in this import.
//
// Deliberately uses an ALLOWLIST, not every DESIGNATION value LWIN has:
// German quality tiers (Qualitatswein, Pradikatswein, Landwein, Wein) and
// below-appellation/table-wine markers (VdF "Vin de France", VdT/VT "vino da
// tavola") are NOT geographic designations — appending them to a place name
// would be actively wrong, not just unhelpful. A handful of obscure 2-3
// letter codes with low counts and no confident identification (AOG, AOR,
// VC, DOK, DOT, IPR) are also excluded — under-labeling is a much smaller
// harm than mislabeling.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/add-appellation-designations.mjs <path-to-LWINdatabase.xlsx> [--dry-run]
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

const [, , xlsxPathArg, ...rest] = process.argv;
const dryRun = rest.includes("--dry-run");

if (!xlsxPathArg) {
  console.error(
    "Usage: node scripts/add-appellation-designations.mjs <path-to-LWINdatabase.xlsx> [--dry-run]",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Same region-name reconciliation as import-lwin.mjs — must match exactly
// so appellation groups resolve to the same regions already in the DB.
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

function safeKey(s) {
  return s
    .trim()
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Accent/punctuation-insensitive fold, matching
// scripts/dedupe-producer-orthographic-variants.mjs — used to match against
// appellations whose spelling changed after import (accent dedup pass).
function fold(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-‐-―]/g, " ")
    .replace(/[.,'’‘]/g, "")
    .replace(/\s+/g, " ")
    .trim()
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

function pickMode(counts) {
  let best = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// Real geographic designations only — see file header for what's excluded
// and why.
const DESIGNATION_ALLOWLIST = new Set([
  "AOP",
  "AOC",
  "DOCG",
  "DOC",
  "IGT",
  "DO",
  "DOCa",
  "AVA",
  "IGP",
  "PDO",
  "PGI",
  "GI",
  "WO",
  "VQA",
  "DAC",
  "VR",
  "IPR",
  "BGB",
  "BOB",
]);

console.log("Reading workbook (this can take a minute for a 200k-row file)...");
const wb = xlsx.readFile(xlsxPathArg, { cellDates: false });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
console.log(`Read ${rows.length} rows`);

const liveRows = rows.filter(
  (r) => r.STATUS === "Live" && r.COUNTRY && r.COUNTRY !== "NA" && r.REGION && r.REGION !== "NA",
);

// Two kinds of group: specific site/sub_region appellations, and
// region-level (both NA) — mirrors import-lwin.mjs's own candidate logic.
const specificRaw = new Map(); // "country|region" -> raw candidate strings (for re-deriving the canonical name)
const specificDesignationVotes = new Map(); // "country|region|safeKey(candidate)" -> Map<designation, count>
const regionLevelDesignationVotes = new Map(); // "country|region" -> Map<designation, count>

for (const r of liveRows) {
  const country = r.COUNTRY.trim();
  const region = resolveRegionName(country, r.REGION.trim());
  const regionKey = `${country}|${region}`;
  const site = r.SITE && r.SITE !== "NA" ? r.SITE.trim() : null;
  const subRegion = r.SUB_REGION && r.SUB_REGION !== "NA" ? r.SUB_REGION.trim() : null;
  const candidate = site || subRegion;
  const designation = r.DESIGNATION && r.DESIGNATION !== "NA" ? r.DESIGNATION.trim() : null;

  if (candidate) {
    if (!specificRaw.has(regionKey)) specificRaw.set(regionKey, []);
    specificRaw.get(regionKey).push(candidate);

    if (designation) {
      const voteKey = `${regionKey}|${safeKey(candidate)}`;
      if (!specificDesignationVotes.has(voteKey)) specificDesignationVotes.set(voteKey, new Map());
      const m = specificDesignationVotes.get(voteKey);
      m.set(designation, (m.get(designation) ?? 0) + 1);
    }
  } else if (designation) {
    if (!regionLevelDesignationVotes.has(regionKey)) regionLevelDesignationVotes.set(regionKey, new Map());
    const m = regionLevelDesignationVotes.get(regionKey);
    m.set(designation, (m.get(designation) ?? 0) + 1);
  }
}

// Re-derive the canonical appellation name per region exactly like
// import-lwin.mjs did, so we can look up the designation votes keyed the
// same way and know what name is actually in the DB.
const canonicalNameByRegionKeyAndSafeKey = new Map(); // "country|region" -> Map<safeKey, canonicalName>
for (const [regionKey, rawList] of specificRaw) {
  const canonicalByKey = dedupeBySafeKey(rawList);
  canonicalNameByRegionKeyAndSafeKey.set(regionKey, canonicalByKey);
}

// Build the final planned name for every (region, appellation) — specific
// and region-level.
const plannedByRegionKeyAndName = new Map(); // "country|region" -> Map<currentCanonicalName, designation>
for (const [regionKey, canonicalByKey] of canonicalNameByRegionKeyAndSafeKey) {
  const planned = new Map();
  for (const [sk, canonicalName] of canonicalByKey) {
    const votes = specificDesignationVotes.get(`${regionKey}|${sk}`);
    if (!votes) continue;
    const mode = pickMode(votes);
    if (mode && DESIGNATION_ALLOWLIST.has(mode)) planned.set(canonicalName, mode);
  }
  plannedByRegionKeyAndName.set(regionKey, planned);
}
for (const [regionKey, votes] of regionLevelDesignationVotes) {
  const mode = pickMode(votes);
  if (!mode || !DESIGNATION_ALLOWLIST.has(mode)) continue;
  const region = regionKey.split("|").slice(1).join("|");
  if (!plannedByRegionKeyAndName.has(regionKey)) plannedByRegionKeyAndName.set(regionKey, new Map());
  plannedByRegionKeyAndName.get(regionKey).set(region, mode);
}

// Fetch current DB state: regions (with country name) and all appellations.
const { data: regionRows } = await admin
  .from("regions")
  .select("id, name, countries(name)");
const regionIdByKey = new Map(
  (regionRows ?? []).map((r) => [`${r.countries.name}|${r.name}`, r.id]),
);

let allAppellations = [];
for (let from = 0; ; from += 1000) {
  const { data } = await admin
    .from("appellations")
    .select("id, name, region_id")
    .order("id")
    .range(from, from + 999);
  allAppellations = allAppellations.concat(data);
  if (data.length < 1000) break;
}
const appellationsByRegionId = new Map();
for (const a of allAppellations) {
  if (!appellationsByRegionId.has(a.region_id)) appellationsByRegionId.set(a.region_id, []);
  appellationsByRegionId.get(a.region_id).push(a);
}

const updates = []; // { id, oldName, newName }
let skippedNoRegion = 0;
let skippedNoMatch = 0;
let skippedAlreadySuffixed = 0;
let skippedCollision = 0;

for (const [regionKey, planned] of plannedByRegionKeyAndName) {
  const regionId = regionIdByKey.get(regionKey);
  if (!regionId) {
    skippedNoRegion += planned.size;
    continue;
  }
  const candidates = appellationsByRegionId.get(regionId) ?? [];
  const byFold = new Map(candidates.map((a) => [fold(a.name), a]));
  const existingNames = new Set(candidates.map((a) => a.name));

  for (const [computedName, designation] of planned) {
    const match = byFold.get(fold(computedName));
    if (!match) {
      skippedNoMatch++;
      continue;
    }
    if (match.name.endsWith(designation)) {
      skippedAlreadySuffixed++;
      continue;
    }
    const newName = `${match.name} ${designation}`;
    if (existingNames.has(newName)) {
      skippedCollision++;
      continue;
    }
    updates.push({ id: match.id, oldName: match.name, newName });
  }
}

console.log(`\nPlanned updates: ${updates.length}`);
console.log(`Skipped (region not found in DB): ${skippedNoRegion}`);
console.log(`Skipped (no matching appellation row): ${skippedNoMatch}`);
console.log(`Skipped (already suffixed): ${skippedAlreadySuffixed}`);
console.log(`Skipped (name collision with existing row): ${skippedCollision}`);

const byDesignation = new Map();
for (const u of updates) {
  const suffix = u.newName.slice(u.oldName.length + 1);
  if (!byDesignation.has(suffix)) byDesignation.set(suffix, []);
  byDesignation.get(suffix).push(u);
}
console.log("\nBy designation:");
for (const [suffix, list] of [...byDesignation.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${suffix}: ${list.length}`);
}
console.log("\nSample per designation:");
for (const [suffix, list] of byDesignation) {
  console.log(` ${suffix}:`);
  for (const u of list.slice(0, 3)) console.log(`   "${u.oldName}" -> "${u.newName}"`);
}

if (dryRun) {
  console.log("\n--dry-run: not writing to the database.");
  process.exit(0);
}

let applied = 0;
for (const u of updates) {
  const { error } = await admin.from("appellations").update({ name: u.newName }).eq("id", u.id);
  if (error) {
    console.error(`  update failed for "${u.oldName}":`, error.message);
    continue;
  }
  applied++;
}
console.log(`\nApplied ${applied} updates.`);
