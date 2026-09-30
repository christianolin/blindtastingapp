// Renders the US-4 SQL (catalog, promote, rollbacks) from the US-4 wave
// (us4-wave.mjs). The committed files must equal this render
// (us4-sql.test.mjs). No file contains begin/commit/rollback: the applier, or
// apply-rollback.mjs, owns the transaction (spec D24). Every check and write is
// scoped to Washington, Oregon and New York; nothing here names California.
//
// Usage: node scripts/usa-map/render-us4-sql.mjs
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { REFRESH_BLOCK, sq } from "./render-us2-sql.mjs";
import { depthOf, loadTrees } from "./us2-wave.mjs";
import { loadTtb } from "./us3-wave.mjs";
import { SCOPE_KEYS, us4Wave } from "./us4-wave.mjs";

const num = (n) => String(Number(n));
const bool = (b) => (b ? "true" : "false");
const countBy = (list, f) => list.reduce((acc, x) => ({ ...acc, [f(x)]: (acc[f(x)] ?? 0) + 1 }), {});
const valuesOf = (obj) => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, n]) => `(${sq(k)}, ${n})`).join(", ");
export const SCOPE_WHERE = (alias) => `(${SCOPE_KEYS.map((k) => `${alias}.canonical_key = '${k}' or ${alias}.canonical_key like '${k}.%'`).join(" or ")})`;
const PLAN = "docs/superpowers/plans/2026-09-30-usa-wine-map-us4.md";

export async function loadUs4Wave() {
  return us4Wave(await loadTrees(), await loadTtb());
}

export function catalogSql(wave) {
  const tag = "US-4 catalog";
  const rows = wave.places.map((p) => `  (${[
    sq(p.key), sq(p.slug), sq(p.name), sq(p.kind), p.display_tier, num(p.min_zoom), num(p.label_min_zoom),
    bool(p.is_appellation), sq(p.appellation_system), sq(p.appellation_level), p.sort_order,
    sq(p.parent_key), depthOf(p.key),
  ].join(", ")})`).join(",\n");
  const prior = wave.prior.verified.map((k) => `  (${sq(k)})`).join(",\n");
  const depths = [...new Set(wave.places.map((p) => depthOf(p.key)))].sort((a, b) => a - b);
  const perKind = valuesOf(countBy(wave.places, (p) => p.kind));
  const perTier = valuesOf(countBy(wave.places, (p) => String(p.display_tier)));
  const perParent = valuesOf(countBy(wave.places, (p) => p.parent_key));
  const insertAt = (depth) => `insert into public.wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.key, v.name, v.kind::public.wine_place_kind, v.tier, v.min_zoom, v.label_min_zoom,
       v.is_app, v.system, v.level, 'DRAFT', v.sort_order, p.id
  from _us4_catalog v
  join public.wine_places p on p.canonical_key = v.parent_key
 where v.depth = ${depth}
 order by v.sort_order, v.key;
`;
  return `-- USA on the wine map, phase US-4: the catalogue (spec
-- docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.1, §15 US-4;
-- plan ${PLAN} Task 4).
--
-- Inserts the ${wave.places.length} AVAs of Washington, Oregon and New York DRAFT (APPELLATION,
-- AVA, tiers and zooms per §4), keyed exactly as
-- data/wine-map/usa-{washington,oregon,new-york}-tree.json: one place per
-- cross-state AVA, under its map state (D6). Rendered by
-- scripts/usa-map/render-us4-sql.mjs; us4-sql.test.mjs proves this file equals
-- that render. Do not hand-edit.
--
-- Needs the US-2 places of the three states VERIFIED (the US-2 promote is live).
-- DRAFT places are invisible to the app and to the tiles export. Boundaries
-- are staged by stage-usa-ava.mjs --wave us4 and flip in ${wave.versions.promote}.
-- Ends with the checked neighbour refresh (CLAUDE.md standing rule).
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '10s';
set local statement_timeout = '20min';

drop table if exists pg_temp._us4_catalog, pg_temp._us4_prior;
create temp table _us4_catalog (
  key text primary key, slug text not null, name text not null, kind text not null,
  tier smallint not null, min_zoom real not null, label_min_zoom real not null,
  is_app boolean not null, system text, level text, sort_order int not null,
  parent_key text not null, depth int not null
) on commit drop;
insert into _us4_catalog values
${rows};
create temp table _us4_prior (key text primary key) on commit drop;
insert into _us4_prior values
${prior};

do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us4_catalog v join public.wine_places p on p.canonical_key = v.key;
  if v_text is not null then raise exception '${tag}: its places already exist: %', v_text; end if;
  select string_agg(e.key, ', ' order by e.key) into v_text
    from _us4_prior e left join public.wine_places p on p.canonical_key = e.key
   where p.id is null or p.publication_status <> 'VERIFIED';
  if v_text is not null then
    raise exception '${tag}: an earlier wave is missing or not VERIFIED (apply it first): %', v_text;
  end if;
end $$;

${depths.map(insertAt).join("\n")}
do $$
declare v_text text;
begin
  select string_agg(v.key, ', ' order by v.key) into v_text
    from _us4_catalog v
    left join public.wine_places p on p.canonical_key = v.key
    left join public.wine_places pp on pp.id = p.primary_parent_id
   where p.id is null
      or p.kind::text <> v.kind or p.name <> v.name or p.slug <> v.slug
      or p.display_tier <> v.tier or p.min_zoom <> v.min_zoom or p.label_min_zoom <> v.label_min_zoom
      or p.is_appellation <> v.is_app
      or p.appellation_system is distinct from v.system
      or p.appellation_level is distinct from v.level
      or p.sort_order <> v.sort_order
      or p.publication_status <> 'DRAFT'
      or pp.canonical_key is distinct from v.parent_key;
  if v_text is not null then raise exception '${tag}: rows differ from the tree reports: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.kind, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perKind}) e(kind, n)
    left join (select p.kind::text kind, count(*)::int n from public.wine_places p
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.kind = e.kind
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: kind counts off: %', v_text; end if;

  select string_agg(format('tier %s=%s (expected %s)', e.tier, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perTier}) e(tier, n)
    left join (select p.display_tier::text tier, count(*)::int n from public.wine_places p
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.tier = e.tier
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: tier counts off: %', v_text; end if;

  select string_agg(format('%s=%s (expected %s)', e.parent, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values ${perParent}) e(parent, n)
    left join (select pp.canonical_key parent, count(*)::int n
                 from public.wine_places p join public.wine_places pp on pp.id = p.primary_parent_id
                 join _us4_catalog v on v.key = p.canonical_key group by 1) x on x.parent = e.parent
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then raise exception '${tag}: children per parent off: %', v_text; end if;
end $$;

${REFRESH_BLOCK(tag)}`;
}

// (Tasks 11 and 12 insert promoteSql and the rollback renderers here.)

/** Every rendered file, path -> text. */
export function renderAll(wave) {
  return {
    [wave.files.catalog]: catalogSql(wave),
  };
}

async function main() {
  const wave = await loadUs4Wave();
  for (const [path, text] of Object.entries(renderAll(wave))) {
    await writeFile(path, text);
    console.log(`wrote ${path}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
