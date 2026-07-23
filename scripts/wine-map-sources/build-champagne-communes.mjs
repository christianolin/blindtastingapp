// Build the reviewed Champagne-AOC commune artifact from INAO's official
// "Aires géographiques des AOC/AOP" open dataset (data.gouv.fr, Licence
// Ouverte). Champagne has no parcels in the IGN AOC-VITICOLES layer used for
// every other French region, so its footprint is the dissolve of its member
// COMMUNES — and this INAO file is the authoritative commune↔appellation
// membership list. Re-derivable: fetch → filter aire == "Champagne" → write.
//
// Usage: node scripts/wine-map-sources/build-champagne-communes.mjs
import { writeFile } from "node:fs/promises";

const RESOURCE_URL =
  "https://static.data.gouv.fr/resources/aires-geographiques-des-aoc-aop/20251009-122320/2025-10-09-comagri-communes-aires-ao.csv";
const DATASET_SLUG = "aires-geographiques-des-aoc-aop";
const AIRE = "Champagne";
const OUT = "data/wine-map/champagne-communes.json";

// Minimal semicolon-CSV parser that respects double-quoted fields (the
// "Aire géographique" column is quoted and can contain commas).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const res = await fetch(RESOURCE_URL);
if (!res.ok) throw new Error(`fetch ${RESOURCE_URL} -> ${res.status}`);
const bytes = new Uint8Array(await res.arrayBuffer());
// The file is not UTF-8 (French accents render as replacement chars); INAO
// exports are Windows-1252. Decode UTF-8 first, fall back on any U+FFFD.
let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
if (text.includes("\uFFFD")) {
  text = new TextDecoder("windows-1252").decode(bytes);
}

const rows = parseCsv(text);
const header = rows[0].map((h) => h.trim());
const iCI = header.indexOf("CI");
const iDept = header.indexOf("Département");
const iCommune = header.indexOf("Commune");
const iAire = header.findIndex((h) => h.replace(/"/g, "").trim() === "Aire géographique");
if (iCI < 0 || iAire < 0 || iCommune < 0 || iDept < 0) {
  throw new Error(`unexpected header: ${header.join("|")}`);
}

const seen = new Set();
const communes = [];
for (const r of rows.slice(1)) {
  if (r[iAire] !== AIRE) continue;
  const insee = (r[iCI] ?? "").trim();
  if (!/^[0-9AB]{5}$/i.test(insee) || seen.has(insee)) continue;
  seen.add(insee);
  communes.push({
    insee,
    name: (r[iCommune] ?? "").trim(),
    department: (r[iDept] ?? "").trim(),
  });
}
communes.sort((a, b) => a.insee.localeCompare(b.insee));

const byDept = {};
for (const c of communes) byDept[c.department] = (byDept[c.department] ?? 0) + 1;

const artifact = {
  aire_geographique: AIRE,
  provenance: {
    authority: "INAO (Institut national de l'origine et de la qualité)",
    dataset: "Aires géographiques des AOC/AOP",
    dataset_slug: DATASET_SLUG,
    resource_url: RESOURCE_URL,
    licence: "Licence Ouverte / Open Licence (fr-lo)",
    retrieved_at: "2026-07-23",
    note: "Champagne AOC is absent from the IGN AOC-VITICOLES:aire_parcellaire layer (0 parcels); its footprint is derived from member communes. INSEE codes (CI) filtered where Aire géographique == 'Champagne'.",
  },
  commune_count: communes.length,
  department_breakdown: byDept,
  communes,
};

await writeFile(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`WROTE ${OUT} communes=${communes.length}`);
console.log("BY-DEPARTMENT", JSON.stringify(byDept));
