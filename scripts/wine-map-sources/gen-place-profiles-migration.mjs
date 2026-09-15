// Turn data/wine-map/place-profiles.json into a migration.
//
// Why a generator and not a hand-written migration. Every grape row needs a
// grape_id, and the join that finds it is by name. A name that does not resolve
// -- a synonym, an accent, a variety the catalog simply does not carry -- does
// not fail: the insert's join matches nothing and the row is silently skipped,
// leaving a place with three grapes where the data said four. The same is true
// of a canonical_key with a typo. So the names are resolved HERE, against the
// live catalog, and nothing is emitted unless every one of them resolved.
//
// The generated migration then re-checks the counts it was built from, so an
// insert that silently does less than it should still fails at apply time.
//
// Usage:
//   node scripts/wine-map-sources/gen-place-profiles-migration.mjs           (check only)
//   node scripts/wine-map-sources/gen-place-profiles-migration.mjs --write
//        --version <YYYYMMDDHHMMSS> --name <migration_name>
//
// Re-runnable. Content already live is skipped, so the data file describes every
// place this project has profiled and each run emits only what is still missing.
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const REPO = "C:/Users/Birchenz/blindtastingapp";
const SOURCE = "data/wine-map/place-profiles.json";
const WRITE = process.argv.includes("--write");
// The data file is the source of truth for ALL place content, including the
// part already applied. So a later run has to emit only what is not live yet,
// or it would try to insert the lot a second time -- and the version/name move
// with each batch. Both are arguments rather than constants for that reason.
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const VERSION = arg("--version", "20260915110000");
const NAME = arg("--name", "place_profiles_iberia");

const STYLE_KINDS = new Set(["RED", "WHITE", "ROSE", "SPARKLING", "SWEET", "FORTIFIED"]);
const sq = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);

const env = Object.fromEntries(
  (await readFile(`${REPO}/.env.local`, "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const source = JSON.parse(await readFile(`${REPO}/${SOURCE}`, "utf8"));
const places = source.places;
const newGrapes = source.new_grapes ?? [];

const client = new pg.Client({
  connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const problems = [];

// 1. Every canonical_key exists, and is a place the Details panel can show.
const keys = Object.keys(places);
const { rows: found } = await client.query(
  `select canonical_key, kind::text kind from wine_places where canonical_key = any($1::text[])`, [keys]);
const kindOf = new Map(found.map((r) => [r.canonical_key, r.kind]));
for (const k of keys) if (!kindOf.has(k)) problems.push(`no such place: ${k}`);

// 2. Every grape name resolves, counting the ones this migration itself adds.
const wanted = [...new Set(
  Object.values(places).flatMap((p) => (p.grapes ?? []).map((g) => g.name)))];
const { rows: gRows } = await client.query(
  `select id, name from grapes where name = any($1::text[])`, [wanted]);
const haveGrape = new Set(gRows.map((r) => r.name));
const adding = new Set(newGrapes.map((g) => g.name));
for (const n of wanted) {
  if (!haveGrape.has(n) && !adding.has(n)) problems.push(`grape not in the catalog: ${n}`);
}
// A variety an earlier batch already added is skipped, not an error: the data
// file keeps describing it so the catalog addition stays documented in one place.
const grapesToAdd = [];
for (const g of newGrapes) {
  const { rows } = await client.query(`select 1 from grapes where name = $1`, [g.name]);
  if (!rows.length) grapesToAdd.push(g);
}

// 3. Styles are valid enum members, and no place is listed with nothing to say.
for (const [key, p] of Object.entries(places)) {
  for (const s of p.styles ?? []) if (!STYLE_KINDS.has(s)) problems.push(`${key}: bad style ${s}`);
  if (new Set(p.styles ?? []).size !== (p.styles ?? []).length) problems.push(`${key}: duplicate style`);
  const names = (p.grapes ?? []).map((g) => g.name);
  if (new Set(names).size !== names.length) problems.push(`${key}: duplicate grape`);
  // A share is a published figure or it is nothing; and the shares given for one
  // place must not add up to more than the place has.
  const shares = (p.grapes ?? []).map((g) => g.share_pct).filter((v) => v != null);
  for (const v of shares) {
    if (typeof v !== "number" || v <= 0 || v > 100) problems.push(`${key}: share_pct ${v} out of range`);
  }
  if (shares.reduce((a, b) => a + b, 0) > 100) problems.push(`${key}: share_pct sums over 100`);
  if (!p.styles?.length && !p.grapes?.length && !p.article) problems.push(`${key}: nothing to write`);
  if (p.article) {
    const a = p.article;
    for (const f of ["description", "climate", "soils"]) {
      if (!a[f] || a[f].trim().length < 40) problems.push(`${key}: article.${f} missing or too short`);
    }
    if (!Array.isArray(a.key_facts) || a.key_facts.length < 3) problems.push(`${key}: needs 3+ key facts`);
  }
}

// 4. Don't silently overwrite content someone already wrote.
const { rows: existing } = await client.query(
  `select p.canonical_key,
          (select count(*)::int from wine_place_grapes g where g.wine_place_id = p.id) grapes,
          (select count(*)::int from wine_place_styles s where s.wine_place_id = p.id) styles,
          (select count(*)::int from wine_place_articles a where a.wine_place_id = p.id) article
     from wine_places p where p.canonical_key = any($1::text[])`, [keys]);
// Anything already live is dropped from this batch rather than treated as a
// conflict. Re-inserting it would duplicate the rows, and refusing outright
// would mean the data file could never describe more than one migration's
// worth of content.
// Each of the three parts is dropped on its own, so a place that is half done
// -- styles live, grapes not -- still gets the missing half.
const skipped = [];
for (const r of existing) {
  const p = places[r.canonical_key];
  if (r.styles > 0) delete p.styles;
  if (r.grapes > 0) delete p.grapes;
  if (r.article > 0) delete p.article;
  if (!p.styles && !p.grapes && !p.article) {
    skipped.push(r.canonical_key);
    delete places[r.canonical_key];
  }
}

await client.end();

if (problems.length) {
  console.error(`REFUSED — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

const nStyles = Object.values(places).reduce((a, p) => a + (p.styles?.length ?? 0), 0);
const nGrapes = Object.values(places).reduce((a, p) => a + (p.grapes?.length ?? 0), 0);
const nArticles = Object.values(places).filter((p) => p.article).length;
const remaining = Object.keys(places);
const byCountry = {};
for (const k of remaining) {
  const c = k.split(".")[0];
  byCountry[c] = (byCountry[c] ?? 0) + 1;
}
if (skipped.length) console.log(`${skipped.length} places already live, skipped`);
console.log(`${remaining.length} places to write (${Object.entries(byCountry).map(([c, n]) => `${c} ${n}`).join(", ")})`);
if (!remaining.length && !grapesToAdd.length) { console.log("nothing left to do"); process.exit(0); }
console.log(`  ${nStyles} style rows, ${nGrapes} grape rows, ${nArticles} articles, ${grapesToAdd.length} new grapes`);
if (!WRITE) { console.log("\nnothing written (pass --write)"); process.exit(0); }

const lines = [];
lines.push(`-- Details-panel content for the places that had none.`);
lines.push(`--`);
lines.push(`-- Generated by scripts/wine-map-sources/gen-place-profiles-migration.mjs from`);
lines.push(`-- ${SOURCE}. Do not hand-edit: the generator resolves every grape name and`);
lines.push(`-- canonical_key against the live catalog and refuses to emit anything if one of`);
lines.push(`-- them does not resolve. That check is the point of it. A grape name the`);
lines.push(`-- catalog does not carry does not raise on insert -- the join simply matches`);
lines.push(`-- nothing and the row vanishes, leaving a place quietly short of a variety.`);
lines.push(`--`);
lines.push(`-- ${remaining.length} places: ${Object.entries(byCountry).map(([c, n]) => `${c} ${n}`).join(", ")}.`);
lines.push(`-- ${nStyles} style rows, ${nGrapes} grape rows, ${nArticles} Bereich articles,`);
lines.push(`-- ${grapesToAdd.length} varieties added to the grape catalog.`);
lines.push(`--`);
lines.push(`-- Convention follows the existing region rows (germany.mosel, italy.piemonte):`);
lines.push(`-- role PRINCIPAL, permitted true, share_pct null. Planting percentages are not`);
lines.push(`-- invented -- france.champagne carries them because they are published.`);
lines.push(`--`);
lines.push(`-- NO TILE RUN. scripts/wine-map-tiles/export.mjs reads wine_places and`);
lines.push(`-- wine_place_boundaries only; grapes, styles and articles are served by`);
lines.push(`-- get_wine_place_context at request time. Nothing here changes a tile.`);
lines.push(``);
lines.push(`begin;`);
lines.push(``);

if (grapesToAdd.length) {
  lines.push(`-- Varieties the content needs that the catalog did not carry.`);
  for (const g of grapesToAdd) {
    lines.push(`insert into public.grapes (name, color, description, skin_color)`);
    lines.push(`values (${sq(g.name)}, ${sq(g.color)}, ${sq(g.description)}, ${sq(g.skin_color)});`);
  }
  lines.push(``);
}

for (const [key, p] of Object.entries(places)) {
  lines.push(`-- ${key}`);
  if (p.article) {
    const a = p.article;
    const facts = a.key_facts.map((f) => sq(f)).join(", ");
    lines.push(`insert into public.wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)`);
    lines.push(`select id, ${sq(a.description)}, ${sq(a.climate)}, ${sq(a.soils)}, array[${facts}]::text[], 'PUBLISHED'`);
    lines.push(`  from public.wine_places where canonical_key = ${sq(key)};`);
  }
  (p.styles ?? []).forEach((s, i) => {
    lines.push(`insert into public.wine_place_styles (wine_place_id, style, sort_order, editorial_status)`);
    lines.push(`select id, '${s}', ${i}, 'PUBLISHED' from public.wine_places where canonical_key = ${sq(key)};`);
  });
  for (const g of p.grapes ?? []) {
    lines.push(`insert into public.wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)`);
    lines.push(`select p.id, g.id, 'PRINCIPAL', true, ${g.share_pct ?? "null"}, ${sq(g.note ?? null)}, 'PUBLISHED'`);
    lines.push(`  from public.wine_places p, public.grapes g`);
    lines.push(` where p.canonical_key = ${sq(key)} and g.name = ${sq(g.name)};`);
  }
  lines.push(``);
}

// The counts this file was generated from, re-checked after the inserts.
//
// Expected is what the place ALREADY held plus what this migration adds. A
// place given only styles usually already has grapes -- italy.friuli has five
// -- so asserting the inserted count alone would fail on correct data.
const had = new Map(existing.map((r) => [r.canonical_key, r]));
const expect = Object.entries(places).map(([k, p]) => {
  const e = had.get(k) ?? { styles: 0, grapes: 0, article: 0 };
  return `(${sq(k)}, ${e.styles + (p.styles?.length ?? 0)}, `
    + `${e.grapes + (p.grapes?.length ?? 0)}, ${Math.max(e.article, p.article ? 1 : 0)})`;
}).join(",\n    ");
lines.push(`do $$`);
lines.push(`declare r record; n int;`);
lines.push(`begin`);
lines.push(`  -- Every row the data asked for is present. A grape name that failed to`);
lines.push(`  -- resolve would show up here as a short count rather than as silence.`);
lines.push(`  for r in`);
lines.push(`    select * from (values`);
lines.push(`    ${expect}`);
lines.push(`    ) as t(key, want_styles, want_grapes, want_article)`);
lines.push(`  loop`);
lines.push(`    select count(*) into n from public.wine_place_styles s`);
lines.push(`      join public.wine_places p on p.id = s.wine_place_id where p.canonical_key = r.key;`);
lines.push(`    if n <> r.want_styles then`);
lines.push(`      raise exception '%: % style rows, expected %', r.key, n, r.want_styles;`);
lines.push(`    end if;`);
lines.push(`    select count(*) into n from public.wine_place_grapes g`);
lines.push(`      join public.wine_places p on p.id = g.wine_place_id where p.canonical_key = r.key;`);
lines.push(`    if n <> r.want_grapes then`);
lines.push(`      raise exception '%: % grape rows, expected % — a grape name did not resolve', r.key, n, r.want_grapes;`);
lines.push(`    end if;`);
lines.push(`    select count(*) into n from public.wine_place_articles a`);
lines.push(`      join public.wine_places p on p.id = a.wine_place_id where p.canonical_key = r.key;`);
lines.push(`    if n < r.want_article then`);
lines.push(`      raise exception '%: no article', r.key;`);
lines.push(`    end if;`);
lines.push(`  end loop;`);
lines.push(``);
// Coverage is asserted over every country the data file profiles, not only the
// ones in this batch. Each migration therefore re-checks the batches before it:
// if an earlier one were ever rolled back or partly lost, the next apply says so.
const countries = [...new Set(keys.map((k) => k.split(".")[0]))].sort();
const likeAny = countries.map((c) => `p.canonical_key like '${c}.%'`).join(" or ");
lines.push(`  -- No region or subregion in ${countries.join(", ")} is left without wine styles.`);
lines.push(`  select count(*) into n from public.wine_places p`);
lines.push(`   where p.kind in ('REGION','SUBREGION')`);
lines.push(`     and (${likeAny})`);
lines.push(`     and not exists (select 1 from public.wine_place_styles s where s.wine_place_id = p.id);`);
lines.push(`  if n <> 0 then raise exception '% places still have no wine styles', n; end if;`);
lines.push(``);
lines.push(`  -- Country level too: germany and spain always had rows and the other three`);
lines.push(`  -- did not, which was an inconsistency with no reason behind it.`);
lines.push(`  select count(*) into n from public.wine_places p`);
lines.push(`   where p.kind = 'COUNTRY' and (${likeAny.replace(/\.%/g, "")})`);
lines.push(`     and not exists (select 1 from public.wine_place_styles s where s.wine_place_id = p.id);`);
lines.push(`  if n <> 0 then raise exception '% countries still have no wine styles', n; end if;`);
lines.push(``);
lines.push(`  -- ...or without an article.`);
lines.push(`  select count(*) into n from public.wine_places p`);
lines.push(`   where p.kind in ('REGION','SUBREGION')`);
lines.push(`     and (${likeAny})`);
lines.push(`     and not exists (select 1 from public.wine_place_articles a where a.wine_place_id = p.id);`);
lines.push(`  if n <> 0 then raise exception '% places still have no article', n; end if;`);
lines.push(`end $$;`);
lines.push(``);
lines.push(`commit;`);

const path = `${REPO}/supabase/migrations/${VERSION}_${NAME}.sql`;
await writeFile(path, lines.join("\n") + "\n");
console.log(`\nwrote ${path}`);
