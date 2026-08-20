// Populate every catalog wine's structured FastCork profile — winery
// description, aroma, tasting notes, food pairing, serving temperature,
// decanting time and ABV — by re-reading its label photo.
//
//   node scripts/backfill-fastcork-profile.mjs --mode dry
//   node scripts/backfill-fastcork-profile.mjs --mode live
//   node scripts/backfill-fastcork-profile.mjs --mode live --force
//
// This is ADDITIVE: the profile columns start empty, so nothing curated is
// overwritten. The legacy free-text `description` is left untouched and stays
// as the fallback the catalog page shows for wines with no profile.
//
// Resumable: a wine that already has a profile is skipped unless --force, so a
// crash or timeout mid-run costs nothing and never double-spends credits.
// One FastCork credit per wine processed. /v1/analyze is image-only (there is
// no text lookup endpoint), so wines with no label photo can't be filled.

import { Client } from "pg";
import fs from "node:fs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const MODE = arg("--mode", "dry");
const LIMIT = Number(arg("--limit", Infinity));
const FORCE = process.argv.includes("--force");

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) process.env[m[1]] ??= m[2];
}
const KEY = process.env.FASTCORK_API_KEY;
if (!KEY) throw new Error("FASTCORK_API_KEY is not set (.env.local).");

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
// Clamp to the CHECK bands in 20260902100000 so one absurd upstream number
// (a 400% ABV, a 200°C serving temp) is dropped rather than aborting the wine.
const band = (v, lo, hi) => (v != null && v >= lo && v <= hi ? v : null);

function profileOf(r) {
  const tMin = band(num(r.serving_temperature_celcius_range?.min_temp), -5, 30);
  const tMax = band(num(r.serving_temperature_celcius_range?.max_temp), -5, 30);
  const ordered = tMin != null && tMax != null && tMin <= tMax;
  const abv = num(r.alc_percentage);
  return {
    winery_description: str(r.winery_description),
    aroma: str(r.aroma),
    tasting_notes: str(r.tasting_notes),
    food_pairing: str(r.food_pairing),
    serving_temp_min_c: ordered ? tMin : null,
    serving_temp_max_c: ordered ? tMax : null,
    decant_minutes: band(num(r.decanting_time_minutes), 0, 1440),
    alcohol_percent: abv != null && abv > 0 && abv < 100 ? abv : null,
  };
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
    return (await res.json()).results?.[0] ?? null;
  }
}

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows: wines } = await c.query(`
  select c.id, c.image_url, c.vintage_year, c.wine_name,
         c.winery_description, c.aroma, c.tasting_notes,
         pr.name as producer, ap.name as appellation
    from catalog_wines c
    left join producers pr on pr.id = c.producer_id
    left join appellations ap on ap.id = c.appellation_id
   where c.merged_into is null and c.image_url is not null
   order by pr.name nulls last, c.wine_name nulls last
`);

const hasProfile = (w) => !!(w.winery_description || w.aroma || w.tasting_notes);
const todo = wines.filter((w) => FORCE || !hasProfile(w)).slice(0, LIMIT);
const label = (w) =>
  [w.producer, w.wine_name, w.appellation, w.vintage_year].filter(Boolean).join(" ");

console.log(
  `${wines.length} wines with a photo · ${wines.filter(hasProfile).length} already have a profile · ${todo.length} to process · mode=${MODE}${FORCE ? " --force" : ""}`,
);

let updated = 0;
let empty = 0;
let failed = 0;

for (const [i, w] of todo.entries()) {
  const tag = `[${i + 1}/${todo.length}] ${label(w)}`;
  try {
    const r = await analyze(w.image_url);
    const p = r ? profileOf(r) : null;
    // Nothing substantive came back — leave the row alone so the legacy
    // description keeps showing rather than replacing it with blanks.
    if (!p || !(p.winery_description || p.aroma || p.tasting_notes)) {
      console.log(`${tag}\n    SKIP (no profile returned)`);
      empty += 1;
      continue;
    }
    if (MODE === "dry") {
      console.log(
        `${tag}\n    aroma: ${(p.aroma ?? "—").slice(0, 70)}\n    palate: ${(p.tasting_notes ?? "—").slice(0, 70)}\n    serve ${p.serving_temp_min_c}-${p.serving_temp_max_c}C · decant ${p.decant_minutes} · abv ${p.alcohol_percent}`,
      );
      continue;
    }
    await c.query(
      `update catalog_wines set
         winery_description = $2, aroma = $3, tasting_notes = $4,
         food_pairing = $5, serving_temp_min_c = $6, serving_temp_max_c = $7,
         decant_minutes = $8, alcohol_percent = $9
       where id = $1`,
      [
        w.id,
        p.winery_description,
        p.aroma,
        p.tasting_notes,
        p.food_pairing,
        p.serving_temp_min_c,
        p.serving_temp_max_c,
        p.decant_minutes,
        p.alcohol_percent,
      ],
    );
    console.log(`${tag}\n    OK`);
    updated += 1;
  } catch (e) {
    console.log(`${tag}\n    FAILED: ${e.message}`);
    failed += 1;
  }
}

console.log(
  `\nDONE mode=${MODE} · updated=${updated} · no-profile=${empty} · failed=${failed}`,
);
await c.end();
