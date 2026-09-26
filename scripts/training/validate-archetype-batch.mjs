// Validates a training-room archetype batch against the LIVE database,
// read-only (spec §4.4, §4.7, D21). Every country, region (inside its
// country), appellation (inside its region), grape, designation (active),
// aroma term (inside its group) and map place key must resolve to exactly one
// live row, unless the file lists it under missingReferenceRows; the live
// enums must still be the ladders scripts/training/archetype-ladders.mjs
// holds. Exits 1 on any error; warnings are printed and let it through.
//
//   node --env-file=.env.local scripts/training/validate-archetype-batch.mjs \
//     data/training/archetypes-batch-1.json
//
// gen-archetype-batch-migration.mjs runs the same check (validateBatchFile)
// and refuses to write a migration unless it passes.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";
import {
  APPEARANCE_INTENSITY,
  BODY,
  DEVELOPMENT,
  FINISH,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY,
  LEVEL,
  MOUSSE,
  SWEETNESS,
  WINE_COLOURS,
  WINE_STYLES,
} from "./archetype-ladders.mjs";
import { batchProblems, entryAromas, missingRows } from "./archetype-batch.mjs";

// Each ladder, as the live enum it must equal (full enum order, spec §4.4).
// Alcohol's full enum is the fortified ladder; every hue a colour allows must
// be a live wset_colour_hue label.
const ENUM_LADDERS = {
  wine_colour: WINE_COLOURS,
  wine_style: WINE_STYLES,
  wset_appearance_intensity: APPEARANCE_INTENSITY,
  wset_intensity: INTENSITY,
  wset_development: DEVELOPMENT,
  wset_sweetness: SWEETNESS,
  wset_level: LEVEL,
  wset_body: BODY,
  wset_finish: FINISH,
  wset_mousse: MOUSSE,
};

const SEP = String.fromCharCode(31); // chr(31) in SQL: Postgres text cannot hold a NUL
const key = (...parts) => parts.join(SEP);

// Accent-, case- and suffix-blind form of an appellation or grape name, used
// only to refuse a "missing" row that already exists under another spelling.
export function foldName(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/ (aoc|aop|doc|docg|doca|do|dop|ava|dac|igt|igp|gi|pdo|pgi)$/u, "");
}

// counts: a Map from key(...) to the number of live rows.
async function countMap(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return new Map(rows.map((r) => [r.k, Number(r.n)]));
}

// Resolves every name the batch uses. Returns { errors, warnings }.
export async function liveProblems(client, batch) {
  const errors = [];
  const warnings = [];
  const entries = batch.archetypes;
  const missing = missingRows(batch);
  const listedRegion = new Set(missing.regions.map((r) => key(r.country, r.region)));
  const listedAppellation = new Set(missing.appellations.map((a) => key(a.country, a.region, a.appellation)));
  const listedGrape = new Set(missing.grapes.map((g) => g.name));

  // 1. The live enums are still the ladders.
  const { rows: enumRows } = await client.query(
    `select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
       from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typnamespace = 'public'::regnamespace and t.typname = any($1::text[])
      group by t.typname`,
    [[...Object.keys(ENUM_LADDERS), "wset_colour_hue"]],
  );
  const live = new Map(enumRows.map((r) => [r.name, r.labels]));
  for (const [name, ladder] of Object.entries(ENUM_LADDERS)) {
    if (JSON.stringify(live.get(name)) !== JSON.stringify(ladder)) {
      errors.push(`live enum ${name} is ${JSON.stringify(live.get(name) ?? null)}, the ladder is ${JSON.stringify(ladder)}`);
    }
  }
  if (JSON.stringify(live.get("wset_level")) !== JSON.stringify(FORTIFIED_ALCOHOL_STOPS)) {
    errors.push("live enum wset_level is not the fortified alcohol ladder");
  }
  const hues = live.get("wset_colour_hue") ?? [];
  for (const [colour, list] of Object.entries(HUES_BY_COLOUR)) {
    const off = list.filter((h) => !hues.includes(h));
    if (off.length > 0) errors.push(`HUES_BY_COLOUR.${colour} holds ${off.join(", ")}, which live wset_colour_hue lacks`);
  }

  // 2. Reference rows, counted by name inside their parent.
  const countries = [...new Set(entries.map((e) => e.country).concat(missing.regions.map((r) => r.country)))];
  const countryN = await countMap(
    client,
    "select c.name as k, count(*) as n from countries c where c.name = any($1::text[]) group by c.name",
    [countries],
  );
  const regionPairs = [...new Map(entries.map((e) => [key(e.country, e.region), [e.country, e.region]])).values()];
  const regionN = await countMap(
    client,
    `select c.name || chr(31) || r.name as k, count(*) as n
       from regions r join countries c on c.id = r.country_id
      where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))
      group by c.name, r.name`,
    [regionPairs.map((p) => p[0]), regionPairs.map((p) => p[1])],
  );
  const appTriples = [
    ...new Map(entries.map((e) => [key(e.country, e.region, e.appellation), [e.country, e.region, e.appellation]])).values(),
  ];
  const appellationN = await countMap(
    client,
    `select c.name || chr(31) || r.name || chr(31) || a.name as k, count(*) as n
       from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
      where (c.name, r.name, a.name) in (select * from unnest($1::text[], $2::text[], $3::text[]))
      group by c.name, r.name, a.name`,
    [appTriples.map((t) => t[0]), appTriples.map((t) => t[1]), appTriples.map((t) => t[2])],
  );
  const grapes = [...new Set(entries.flatMap((e) => [e.primaryGrape, e.secondaryGrape]).filter(Boolean))];
  const grapeN = await countMap(
    client,
    "select g.name as k, count(*) as n from grapes g where g.name = any($1::text[]) group by g.name",
    [grapes],
  );
  const designations = [...new Set(entries.flatMap((e) => e.designations))];
  const designationN = await countMap(
    client,
    `select td.name as k, count(*) as n from type_designations td
      where td.name = any($1::text[]) and td.is_active group by td.name`,
    [designations],
  );
  const termPairs = [...new Map(entries.flatMap(entryAromas).map((a) => [key(a.group, a.term), [a.group, a.term]])).values()];
  const termN = await countMap(
    client,
    `select t.group_name || chr(31) || t.term as k, count(*) as n from wset_aroma_terms t
      where (t.group_name, t.term) in (select * from unnest($1::text[], $2::text[]))
      group by t.group_name, t.term`,
    [termPairs.map((p) => p[0]), termPairs.map((p) => p[1])],
  );
  const placeKeys = [...new Set(entries.map((e) => e.placeCanonicalKey).filter(Boolean))];
  const placeN = await countMap(
    client,
    "select p.canonical_key as k, count(*) as n from wine_places p where p.canonical_key = any($1::text[]) group by p.canonical_key",
    [placeKeys],
  );
  const { rows: liveNames } = await client.query(
    "select distinct a.name from wine_archetypes a where a.name = any($1::text[])",
    [entries.map((e) => e.name)],
  );
  const alreadyLive = new Set(liveNames.map((r) => r.name));

  // 3. The rows listed as missing must really be missing, under any spelling.
  for (const r of missing.regions) {
    if ((countryN.get(r.country) ?? 0) !== 1) errors.push(`missing region ${r.region}: country "${r.country}" is not one live row`);
  }
  const { rows: listedLive } = await client.query(
    `select c.name || chr(31) || r.name as k from regions r join countries c on c.id = r.country_id
      where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))`,
    [missing.regions.map((r) => r.country), missing.regions.map((r) => r.region)],
  );
  for (const row of listedLive) errors.push(`missingReferenceRows lists a region that is live: ${row.k.split(SEP).join(" / ")}`);
  if (missing.appellations.length > 0) {
    const { rows: siblings } = await client.query(
      `select c.name as country, r.name as region, a.name as appellation
         from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
        where (c.name, r.name) in (select * from unnest($1::text[], $2::text[]))`,
      [missing.appellations.map((a) => a.country), missing.appellations.map((a) => a.region)],
    );
    for (const a of missing.appellations) {
      const regionKnown = listedRegion.has(key(a.country, a.region)) || regionN.get(key(a.country, a.region)) === 1;
      if (!regionKnown) {
        const { rows } = await client.query(
          "select count(*)::int as n from regions r join countries c on c.id = r.country_id where c.name = $1 and r.name = $2",
          [a.country, a.region],
        );
        if (rows[0].n !== 1) errors.push(`missing appellation ${a.appellation}: region ${a.country} / ${a.region} is not one live row`);
      }
      const clash = siblings.find(
        (s) => s.country === a.country && s.region === a.region && foldName(s.appellation) === foldName(a.appellation),
      );
      if (clash) {
        errors.push(
          `missingReferenceRows lists appellation "${a.appellation}", but ${a.region} already holds "${clash.appellation}"`,
        );
      }
    }
  }
  if (missing.grapes.length > 0) {
    const { rows: allGrapes } = await client.query("select name from grapes");
    for (const g of missing.grapes) {
      const clash = allGrapes.find((x) => foldName(x.name) === foldName(g.name));
      if (clash) errors.push(`missingReferenceRows lists grape "${g.name}", but "${clash.name}" is live`);
    }
  }

  // 4. Every entry's names.
  const one = (map, k, listed) => (listed ? 1 : map.get(k) ?? 0);
  entries.forEach((e, i) => {
    const at = `#${i + 1} ${e.name}`;
    const need = (what, n) => {
      if (n !== 1) errors.push(`${at}: ${what} resolves to ${n} live rows`);
    };
    need(`country "${e.country}"`, countryN.get(e.country) ?? 0);
    const regionListed = listedRegion.has(key(e.country, e.region));
    need(`region "${e.region}" in ${e.country}`, one(regionN, key(e.country, e.region), regionListed));
    need(
      `appellation "${e.appellation}" in ${e.region}`,
      one(appellationN, key(e.country, e.region, e.appellation), listedAppellation.has(key(e.country, e.region, e.appellation))),
    );
    need(`primary grape "${e.primaryGrape}"`, one(grapeN, e.primaryGrape, listedGrape.has(e.primaryGrape)));
    if (e.secondaryGrape) {
      need(`secondary grape "${e.secondaryGrape}"`, one(grapeN, e.secondaryGrape, listedGrape.has(e.secondaryGrape)));
    }
    for (const d of e.designations) need(`designation "${d}" (active)`, designationN.get(d) ?? 0);
    for (const a of entryAromas(e)) need(`aroma term "${a.term}" in ${a.group}`, termN.get(key(a.group, a.term)) ?? 0);
    if (e.placeCanonicalKey) need(`map place "${e.placeCanonicalKey}"`, placeN.get(e.placeCanonicalKey) ?? 0);
    if (alreadyLive.has(e.name)) warnings.push(`${at}: already in wine_archetypes; the migration skips it`);
  });
  return { errors, warnings };
}

// The whole check for one file: shape first, then live (skipped when the
// shape is broken, since the lookups would only repeat the same errors).
export async function validateBatchFile(path) {
  const batch = JSON.parse(readFileSync(path, "utf8"));
  const shape = batchProblems(batch);
  if (shape.errors.length > 0) return { batch, ...shape };
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    await client.query("begin read only");
    const liveResult = await liveProblems(client, batch);
    return {
      batch,
      errors: [...shape.errors, ...liveResult.errors],
      warnings: [...shape.warnings, ...liveResult.warnings],
    };
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

export function report({ batch, errors, warnings }, path) {
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  const n = Array.isArray(batch?.archetypes) ? batch.archetypes.length : 0;
  if (errors.length === 0) console.log(`${path}: ${n} archetypes resolve (${warnings.length} warnings)`);
  else console.error(`${path}: ${errors.length} errors`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? "data/training/archetypes-batch-1.json";
  const result = await validateBatchFile(path);
  report(result, path);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
