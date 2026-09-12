// Recover the Italian comune-union membership lists from the committed
// dissolved geometry, and write them to a committed, auditable file.
//
// Why this is needed: every Italian comune-union boundary records the note
// "ISTAT comuni per disciplinare", but the configs that actually held those
// comune lists lived in .tiles-build/, which is git-ignored. They are gone.
// The claim was therefore unauditable from the repo — you could not check
// which comuni a DOC was built from, only look at the resulting shape. That
// is exactly the weakness that let bad membership hide in Spain and Portugal.
//
// The geometry can be inverted. Each footprint is a union of whole ISTAT
// comuni, so a comune is a member if essentially all of it lies inside the
// footprint. Recovery is not guesswork: each committed footprint records the
// comuni_count it was built from, and this script asserts the recovered list
// matches that count exactly. Any footprint that does not reconcile is
// reported and written out as unresolved rather than silently accepted.
//
// Output: data/wine-map/italy-doc-membership.json — the membership as it
// actually stands today, ready to be checked against the MASAF disciplinari.
// Recovering it does NOT verify it; it makes verification possible.
//
// Usage: node scripts/wine-map-sources/recover-italy-comuni.mjs
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const COMUNI = ".tiles-build/sicily/it-comuni.geojson";
const OUT = "data/wine-map/italy-doc-membership.json";
// A comune counts as a member when this much of its area is inside the
// footprint. Well above any sliver produced by 5dp rounding of a shared
// border, well below a genuine whole-comune inclusion.
const INSIDE = 0.9;

const REGIONS = {
  abruzzo: "Abruzzo", basilicata: "Basilicata", calabria: "Calabria",
  campania: "Campania", "emilia-romagna": "Emilia-Romagna",
  friuli: "Friuli-Venezia Giulia", lazio: "Lazio", liguria: "Liguria",
  lombardia: "Lombardia", marche: "Marche", molise: "Molise", puglia: "Puglia",
  sardegna: "Sardegna", sicily: "Sicilia", trentino: "Trentino-Alto Adige/Südtirol",
  umbria: "Umbria", "valle-d-aosta": "Valle d'Aosta/Vallée d'Aoste",
};

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const client = new pg.Client({
  connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const comuni = JSON.parse(await readFile(COMUNI, "utf8"));
const byRegion = new Map();
for (const f of comuni.features) {
  const r = f.properties.reg_name;
  if (!byRegion.has(r)) byRegion.set(r, []);
  byRegion.get(r).push(f);
}

const out = {
  _readme: {
    purpose:
      "Recovered comune membership for every Italian comune-union footprint. The build configs that held these lists were never committed (.tiles-build is git-ignored), so this file reconstructs them from the committed dissolved geometry and makes the 'per disciplinare' provenance claim checkable.",
    how_recovered:
      "For each footprint in data/wine-map/<region>-comuni-dissolved.geojson, every ISTAT comune of that region whose area lies >=90% inside the footprint is a member. Each footprint records the comuni_count it was originally built from; recovery asserts the recovered list matches it exactly, and reports any that do not.",
    important:
      "RECOVERY IS NOT VERIFICATION. This records what the map currently claims, not what the disciplinare says. Checking these lists against the MASAF disciplinari is separate work, and is the Italian equivalent of the Spanish pliego audit that found four wrong DOs.",
    geometry_source:
      "ISTAT comuni via openpolis/geojson-italy (CC BY 4.0), pinned at .tiles-build/sicily/it-comuni.geojson",
  },
  generated_at: new Date().toISOString().slice(0, 10),
  footprints: {},
};

let reconciled = 0;
const problems = [];

for (const [slug, regName] of Object.entries(REGIONS)) {
  const file = `data/wine-map/${slug}-comuni-dissolved.geojson`;
  let fc;
  try {
    fc = JSON.parse(await readFile(file, "utf8"));
  } catch {
    problems.push(`${slug}: no dissolved artifact`);
    continue;
  }
  const pool = byRegion.get(regName) ?? [];
  if (!pool.length) { problems.push(`${slug}: no ISTAT comuni for region "${regName}"`); continue; }

  for (const feat of fc.features) {
    const name = feat.properties.name;
    const expected = feat.properties.comuni_count ?? null;
    const { rows } = await client.query(
      `with fp as (
         select extensions.ST_MakeValid(extensions.ST_SetSRID(
           extensions.ST_GeomFromGeoJSON($1), 4326)) g
       )
       select c->'properties'->>'name' as comune,
              c->'properties'->>'com_istat_code' as istat
       from fp, jsonb_array_elements($2::jsonb) c
       where extensions.ST_Area(extensions.ST_Intersection(
               extensions.ST_MakeValid(extensions.ST_SetSRID(
                 extensions.ST_GeomFromGeoJSON(c->'geometry'), 4326)), fp.g))
             / nullif(extensions.ST_Area(extensions.ST_MakeValid(
                 extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(c->'geometry'), 4326))), 0)
             >= ${INSIDE}
       order by 1`,
      [JSON.stringify(feat.geometry), JSON.stringify(pool)],
    );
    const members = rows.map((r) => ({ istat: r.istat, name: r.comune }));
    const ok = expected === null || members.length === expected;
    if (ok) reconciled++;
    else problems.push(`${slug}/${name}: recovered ${members.length}, artifact says ${expected}`);
    out.footprints[`${slug}/${name}`] = {
      region: regName,
      recovered_count: members.length,
      artifact_count: expected,
      reconciles: ok,
      comuni: members,
    };
    console.log(`${ok ? "ok  " : "MISM"} ${slug}/${name}: ${members.length}${expected !== null ? `/${expected}` : ""}`);
  }
}

await client.end();
await writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nWROTE ${OUT}: ${Object.keys(out.footprints).length} footprints, ${reconciled} reconcile.`);
if (problems.length) {
  console.log(`${problems.length} did NOT reconcile:`);
  problems.forEach((p) => console.log(`  ${p}`));
}
