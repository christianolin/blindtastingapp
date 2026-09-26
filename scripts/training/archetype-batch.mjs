// Pure checks and SQL for a training-room archetype batch file
// (data/training/archetypes-batch-N.json; spec §4.4, §4.7, §4.8, D21). No
// database access here: validate-archetype-batch.mjs resolves the names against
// live, gen-archetype-batch-migration.mjs writes the migration. Tests:
// scripts/training/archetype-batch.test.mjs (node --test, no database).
import { MATCHED_SCALES, WINE_COLOURS, WINE_STYLES, rangeProblems } from "./archetype-ladders.mjs";

const ENTRY_KEYS = new Set([
  "name",
  "country",
  "region",
  "appellation",
  "placeCanonicalKey",
  "colour",
  "style",
  "primaryGrape",
  "secondaryGrape",
  "designations",
  "typicalAge",
  "quality",
  "sat",
  "mousse",
  "nose",
  "palate",
  "description",
]);

const isText = (v) => typeof v === "string" && v.trim() !== "" && v === v.trim();
const isInt = (v) => Number.isInteger(v);
const isPair = (v, ok) => Array.isArray(v) && v.length === 2 && ok(v[0], v[1]);

// The entry's full SAT profile as stored in wine_archetypes.sat: the matched
// scales plus, on a sparkling wine, the top-level "mousse" range.
export function entrySat(entry) {
  return entry.mousse === undefined ? { ...entry.sat } : { ...entry.sat, mousse: entry.mousse };
}

// Every aroma link of an entry, in file order: nose first, then palate.
export function entryAromas(entry) {
  return [
    ...(entry.nose ?? []).map((a) => ({ ...a, kind: "NOSE" })),
    ...(entry.palate ?? []).map((a) => ({ ...a, kind: "PALATE" })),
  ];
}

// The reference rows a batch may add (spec §4.7), always three arrays.
export function missingRows(batch) {
  const m = batch.missingReferenceRows ?? {};
  return { regions: m.regions ?? [], appellations: m.appellations ?? [], grapes: m.grapes ?? [] };
}

// Shape and ladder problems in one batch, before any database lookup.
// errors refuse the batch; warnings are printed and let it through.
export function batchProblems(batch) {
  const errors = [];
  const warnings = [];
  if (!batch || typeof batch !== "object" || !Array.isArray(batch.archetypes)) {
    return { errors: ['the batch file needs an "archetypes" array'], warnings };
  }
  if (!isInt(batch.batch) || batch.batch < 1) errors.push('"batch" must be a positive integer');
  if (batch.archetypes.length === 0) errors.push("the batch has no archetypes");
  const m = batch.missingReferenceRows;
  if (m !== undefined) {
    for (const key of ["regions", "appellations", "grapes"]) {
      if (!Array.isArray(m?.[key])) errors.push(`missingReferenceRows.${key} must be an array`);
    }
    if (Array.isArray(m?.regions) && m.regions.some((r) => !isText(r?.country) || !isText(r?.region))) {
      errors.push("every missingReferenceRows.regions entry needs a country and a region");
    }
    if (
      Array.isArray(m?.appellations) &&
      m.appellations.some((a) => !isText(a?.country) || !isText(a?.region) || !isText(a?.appellation))
    ) {
      errors.push("every missingReferenceRows.appellations entry needs a country, a region and an appellation");
    }
    if (Array.isArray(m?.grapes) && m.grapes.some((g) => !isText(g?.name))) {
      errors.push("every missingReferenceRows.grapes entry needs a name");
    }
  }

  const seen = new Set();
  batch.archetypes.forEach((entry, i) => {
    const at = `#${i + 1} ${entry && isText(entry.name) ? entry.name : "(no name)"}`;
    const err = (msg) => errors.push(`${at}: ${msg}`);
    const warn = (msg) => warnings.push(`${at}: ${msg}`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      err("is not an object");
      return;
    }
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) err(`unknown key "${key}"`);
    for (const key of ["name", "country", "region", "appellation", "primaryGrape", "description"]) {
      if (!isText(entry[key])) err(`"${key}" must be a trimmed, non-empty string`);
    }
    if (isText(entry.name)) {
      if (seen.has(entry.name)) err("the name appears twice in this batch");
      seen.add(entry.name);
      if (!entry.name.startsWith("A typical ")) warn('the name does not start with "A typical " (spec §4.8)');
    }
    if (entry.secondaryGrape !== null && !isText(entry.secondaryGrape)) {
      err('"secondaryGrape" must be a string or null');
    } else if (entry.secondaryGrape !== null && entry.secondaryGrape === entry.primaryGrape) {
      err("the secondary grape repeats the primary");
    }
    if (entry.placeCanonicalKey !== null && !isText(entry.placeCanonicalKey)) {
      err('"placeCanonicalKey" must be a string or null');
    }
    if (!WINE_COLOURS.includes(entry.colour)) err(`colour "${entry.colour}" is not a wine_colour`);
    if (!WINE_STYLES.includes(entry.style)) err(`style "${entry.style}" is not a wine_style`);
    if (!Array.isArray(entry.designations) || entry.designations.some((d) => !isText(d))) {
      err('"designations" must be an array of names');
    } else if (new Set(entry.designations).size !== entry.designations.length) {
      err("a designation appears twice");
    }
    if (
      entry.typicalAge !== null &&
      !isPair(entry.typicalAge, (lo, hi) => isInt(lo) && isInt(hi) && lo >= 0 && hi <= 100 && lo <= hi)
    ) {
      err('"typicalAge" must be null or [low, high] whole years, 0 <= low <= high <= 100');
    }
    if (!isPair(entry.quality, (lo, hi) => isInt(lo) && isInt(hi) && lo >= 50 && hi <= 100 && lo <= hi)) {
      err('"quality" must be [low, high] points, 50 <= low <= high <= 100');
    }

    // SAT ranges (spec §4.4): only the matched scales, each on its ladder with
    // at least one slider value inside; a mousse range exactly when sparkling.
    if (!entry.sat || typeof entry.sat !== "object" || Array.isArray(entry.sat)) {
      err('"sat" must be an object');
    } else if (WINE_COLOURS.includes(entry.colour) && WINE_STYLES.includes(entry.style)) {
      const wine = { colour: entry.colour, style: entry.style };
      for (const [scale, range] of Object.entries(entry.sat)) {
        if (!MATCHED_SCALES.includes(scale)) {
          err(`"sat.${scale}" is not a matched scale (${MATCHED_SCALES.join(", ")})`);
          continue;
        }
        for (const p of rangeProblems(scale, range, wine)) err(p);
      }
      for (const scale of MATCHED_SCALES) {
        if (!(scale in entry.sat)) warn(`no "${scale}" range: the matcher skips that scale for it`);
      }
      if (entry.style === "SPARKLING") {
        if (entry.mousse === undefined) err('a sparkling wine needs a "mousse" range');
        else for (const p of rangeProblems("mousse", entry.mousse, wine)) err(p);
      } else if (entry.mousse !== undefined) {
        err('only a sparkling wine carries a "mousse" range');
      }
    }

    // Aromas (spec §4.8): {group, term, signature}; a term once per kind.
    for (const kind of ["nose", "palate"]) {
      const list = entry[kind];
      if (!Array.isArray(list)) {
        err(`"${kind}" must be an array`);
        continue;
      }
      const terms = new Set();
      for (const a of list) {
        if (!a || !isText(a.group) || !isText(a.term) || typeof a.signature !== "boolean") {
          err(`every "${kind}" aroma needs a group, a term and a boolean signature`);
          continue;
        }
        const key = `${a.group}|${a.term}`;
        if (terms.has(key)) err(`${kind} lists "${a.term}" (${a.group}) twice`);
        terms.add(key);
      }
      if (list.length < 4 || list.length > 6) warn(`${list.length} ${kind} terms (the guide asks for 4-6)`);
    }
    if (Array.isArray(entry.nose) && Array.isArray(entry.palate)) {
      const signatures = new Set(entryAromas(entry).filter((a) => a && a.signature).map((a) => a.term));
      if (signatures.size > 3) warn(`${signatures.size} signature terms (the guide asks for at most 3)`);
    }
  });
  return { errors, warnings };
}

// A SQL string literal (null for null/undefined).
export function sqlText(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replaceAll("'", "''")}'`;
}

function sqlInt(v) {
  if (v === null || v === undefined) return "null";
  if (!Number.isInteger(v)) throw new Error(`not an integer: ${v}`);
  return String(v);
}

// The counts the migration's asserts check, computed from the file.
export function batchCounts(batch) {
  let aromas = 0;
  let signatures = 0;
  let designations = 0;
  let placements = 0;
  for (const e of batch.archetypes) {
    const links = entryAromas(e);
    aromas += links.length;
    signatures += links.filter((a) => a.signature).length;
    designations += e.designations.length;
    if (e.placeCanonicalKey) placements += 1;
  }
  return { archetypes: batch.archetypes.length, aromas, signatures, designations, placements };
}

// The data migration for one validated batch (spec D21, §4.7). Fail-closed:
// every name is resolved again inside the migration, and anything but exactly
// one live row raises. Idempotent on the archetype name: a name already in
// wine_archetypes is skipped with all its links, so a re-run is a no-op.
export function batchMigrationSql(batch, { file, generatedOn }) {
  const counts = batchCounts(batch);
  const missing = missingRows(batch);
  const lines = [];
  const out = (s = "") => lines.push(s);
  const rowsOut = (rows) => rows.forEach((r, i) => out(`  ${r}${i === rows.length - 1 ? ";" : ","}`));

  out(`-- Training room: typical wines, batch ${batch.batch} (spec`);
  out("-- docs/superpowers/specs/2026-09-25-training-room-design.md §4.7, D21).");
  out(`-- GENERATED from ${file} by scripts/training/gen-archetype-batch-migration.mjs`);
  out(`-- on ${generatedOn}. Edit the JSON and regenerate; never edit this file by hand.`);
  out("--");
  out(`-- ${counts.archetypes} archetypes, ${counts.aromas} aroma links (${counts.signatures} signature),`);
  out(`-- ${counts.designations} designation links, ${counts.placements} map placements.`);
  out("-- Every country, region, appellation, grape, designation, aroma term and map");
  out("-- place is resolved by its exact live name inside its parent; anything but");
  out("-- exactly one row raises. A name already in wine_archetypes is skipped with");
  out("-- all its links, so applying this twice is a no-op.");
  out("--");
  const listed = [
    ...missing.regions.map((r) => `region ${r.country} / ${r.region}`),
    ...missing.appellations.map((a) => `appellation ${a.country} / ${a.region} / ${a.appellation}`),
    ...missing.grapes.map((g) => `grape ${g.name}`),
  ];
  if (listed.length === 0) {
    out("-- Reference rows added: none (missingReferenceRows is empty).");
  } else {
    out("-- Reference rows added (the batch file's missingReferenceRows):");
    for (const l of listed) out(`-- * ${l}`);
  }
  out("--");
  out("-- Requires 20260925120000_training_room.sql. No begin/commit: the applier");
  out("-- owns the transaction.");
  out();
  out("set local lock_timeout = '10s';");
  out("-- A second apply inside one transaction (the DB suite's idempotency test)");
  out("-- would otherwise meet the temp tables of the first.");
  out("drop table if exists pg_temp._batch_archetypes, pg_temp._batch_aromas, pg_temp._batch_designations,");
  out("  pg_temp._batch_resolved, pg_temp._batch_new;");
  out();
  out("do $$");
  out("begin");
  out("  if to_regclass('public.wine_archetype_designations') is null");
  out("     or not exists (select 1 from information_schema.columns");
  out("                    where table_schema = 'public' and table_name = 'wine_archetype_aromas'");
  out("                      and column_name = 'signature')");
  out("     or not exists (select 1 from information_schema.columns");
  out("                    where table_schema = 'public' and table_name = 'wine_archetypes'");
  out("                      and column_name = 'appellation_id') then");
  out("    raise exception 'apply 20260925120000_training_room.sql first';");
  out("  end if;");
  out("end $$;");
  out();

  for (const r of missing.regions) {
    out("insert into public.regions (country_id, name)");
    out(`select c.id, ${sqlText(r.region)} from public.countries c where c.name = ${sqlText(r.country)}`);
    out("on conflict (country_id, name) do nothing;");
  }
  for (const a of missing.appellations) {
    out("insert into public.appellations (region_id, name)");
    out(`select r.id, ${sqlText(a.appellation)}`);
    out("  from public.regions r join public.countries c on c.id = r.country_id");
    out(` where c.name = ${sqlText(a.country)} and r.name = ${sqlText(a.region)}`);
    out("on conflict (region_id, name) do nothing;");
  }
  for (const g of missing.grapes) {
    out(`insert into public.grapes (name) values (${sqlText(g.name)}) on conflict (name) do nothing;`);
  }
  if (listed.length > 0) out();

  out("create temp table _batch_archetypes (");
  out("  ord int primary key,");
  out("  name text not null unique,");
  out("  country text not null, region text not null, appellation text not null,");
  out("  place_key text,");
  out("  colour wine_colour not null, style wine_style not null,");
  out("  primary_grape text not null, secondary_grape text,");
  out("  typical_age_low smallint, typical_age_high smallint,");
  out("  quality_low smallint not null, quality_high smallint not null,");
  out("  sat jsonb not null,");
  out("  description text not null");
  out(") on commit drop;");
  out("insert into _batch_archetypes values");
  rowsOut(
    batch.archetypes.map((e, i) => {
      const age = e.typicalAge ?? [null, null];
      return `(${[
        String(i + 1),
        sqlText(e.name),
        sqlText(e.country),
        sqlText(e.region),
        sqlText(e.appellation),
        sqlText(e.placeCanonicalKey),
        `${sqlText(e.colour)}::wine_colour`,
        `${sqlText(e.style)}::wine_style`,
        sqlText(e.primaryGrape),
        sqlText(e.secondaryGrape),
        sqlInt(age[0]),
        sqlInt(age[1]),
        sqlInt(e.quality[0]),
        sqlInt(e.quality[1]),
        `${sqlText(JSON.stringify(entrySat(e)))}::jsonb`,
        sqlText(e.description),
      ].join(", ")})`;
    }),
  );
  out();
  out("create temp table _batch_aromas (");
  out("  name text not null, kind text not null, group_name text not null, term text not null,");
  out("  signature boolean not null,");
  out("  primary key (name, kind, group_name, term)");
  out(") on commit drop;");
  const aromaRows = batch.archetypes.flatMap((e) =>
    entryAromas(e).map(
      (a) => `(${sqlText(e.name)}, ${sqlText(a.kind)}, ${sqlText(a.group)}, ${sqlText(a.term)}, ${a.signature})`,
    ),
  );
  if (aromaRows.length > 0) {
    out("insert into _batch_aromas values");
    rowsOut(aromaRows);
  }
  out();
  out("create temp table _batch_designations (");
  out("  name text not null, designation text not null,");
  out("  primary key (name, designation)");
  out(") on commit drop;");
  const desRows = batch.archetypes.flatMap((e) => e.designations.map((d) => `(${sqlText(e.name)}, ${sqlText(d)})`));
  if (desRows.length > 0) {
    out("insert into _batch_designations values");
    rowsOut(desRows);
  }
  out();
  out("-- Every name, resolved inside its parent: one array per reference, which the");
  out("-- assert below needs to hold exactly one element.");
  out("create temp table _batch_resolved on commit drop as");
  out("select b.ord, b.name,");
  out("       array(select c.id from public.countries c where c.name = b.country) as country_ids,");
  out("       array(select r.id from public.regions r join public.countries c on c.id = r.country_id");
  out("              where c.name = b.country and r.name = b.region) as region_ids,");
  out("       array(select a.id from public.appellations a");
  out("               join public.regions r on r.id = a.region_id");
  out("               join public.countries c on c.id = r.country_id");
  out("              where c.name = b.country and r.name = b.region and a.name = b.appellation) as appellation_ids,");
  out("       array(select g.id from public.grapes g where g.name = b.primary_grape) as primary_grape_ids,");
  out("       case when b.secondary_grape is null then array[null::uuid]");
  out("            else array(select g.id from public.grapes g where g.name = b.secondary_grape) end as secondary_grape_ids,");
  out("       case when b.place_key is null then array[null::uuid]");
  out("            else array(select p.id from public.wine_places p where p.canonical_key = b.place_key) end as place_ids");
  out("  from _batch_archetypes b;");
  out();
  out("do $$");
  out("declare");
  out("  v_text text;");
  out("begin");
  out(`  if (select count(*) from _batch_archetypes) <> ${counts.archetypes}`);
  out(`     or (select count(*) from _batch_aromas) <> ${counts.aromas}`);
  out(`     or (select count(*) from _batch_aromas where signature) <> ${counts.signatures}`);
  out(`     or (select count(*) from _batch_designations) <> ${counts.designations} then`);
  out("    raise exception 'the batch rows did not load in full';");
  out("  end if;");
  out("  select string_agg(format('%s: %s resolves to %s rows', r.name, x.field, x.n), '; ' order by r.ord, x.field)");
  out("    into v_text");
  out("  from _batch_resolved r");
  out("  cross join lateral (values ('country', cardinality(r.country_ids)),");
  out("                             ('region', cardinality(r.region_ids)),");
  out("                             ('appellation', cardinality(r.appellation_ids)),");
  out("                             ('primary grape', cardinality(r.primary_grape_ids)),");
  out("                             ('secondary grape', cardinality(r.secondary_grape_ids)),");
  out("                             ('map place', cardinality(r.place_ids))) as x (field, n)");
  out("  where x.n <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'a batch reference does not resolve to exactly one live row: %', v_text;");
  out("  end if;");
  out("  select string_agg(format('%s: %s (%s) resolves to %s terms', x.name, x.term, x.group_name, x.n), '; ')");
  out("    into v_text");
  out("  from (select a.name, a.term, a.group_name,");
  out("               (select count(*) from public.wset_aroma_terms t");
  out("                 where t.group_name = a.group_name and t.term = a.term) as n");
  out("          from _batch_aromas a) x");
  out("  where x.n <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'an aroma term does not resolve to exactly one live row: %', v_text;");
  out("  end if;");
  out("  select string_agg(format('%s: %s', d.name, d.designation), '; ') into v_text");
  out("  from _batch_designations d");
  out("  where (select count(*) from public.type_designations td");
  out("          where td.name = d.designation and td.is_active) <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'a designation does not resolve to exactly one active row: %', v_text;");
  out("  end if;");
  out("end $$;");
  out();
  out("create temp table _batch_new (id uuid primary key, name text not null unique) on commit drop;");
  out();
  out("with inserted as (");
  out("  insert into public.wine_archetypes (");
  out("    name, wine_place_id, country_id, region_id, appellation_id, colour, style,");
  out("    primary_grape_id, secondary_grape_id, description, sat, quality_low, quality_high,");
  out("    typical_age_low, typical_age_high, sort_order");
  out("  )");
  out("  select b.name, r.place_ids[1], r.country_ids[1], r.region_ids[1], r.appellation_ids[1],");
  out("         b.colour, b.style, r.primary_grape_ids[1], r.secondary_grape_ids[1], b.description,");
  out("         b.sat, b.quality_low, b.quality_high, b.typical_age_low, b.typical_age_high,");
  out("         (select coalesce(max(a.sort_order), 0) from public.wine_archetypes a) + b.ord");
  out("    from _batch_archetypes b");
  out("    join _batch_resolved r on r.ord = b.ord");
  out("   where not exists (select 1 from public.wine_archetypes a where a.name = b.name)");
  out("  returning id, name");
  out(")");
  out("insert into _batch_new (id, name) select id, name from inserted;");
  out();
  out("insert into public.wine_archetype_aromas (archetype_id, term_id, kind, signature)");
  out("select n.id, t.id, x.kind, x.signature");
  out("  from _batch_aromas x");
  out("  join _batch_new n on n.name = x.name");
  out("  join public.wset_aroma_terms t on t.group_name = x.group_name and t.term = x.term;");
  out();
  out("insert into public.wine_archetype_designations (archetype_id, type_designation_id)");
  out("select n.id, td.id");
  out("  from _batch_designations d");
  out("  join _batch_new n on n.name = d.name");
  out("  join public.type_designations td on td.name = d.designation and td.is_active;");
  out();
  out("-- An archetype with a map place shows there, like the live ones");
  out("-- (20260829224000's back-fill: its home place, its own sort_order).");
  out("insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)");
  out("select a.id, a.wine_place_id, a.sort_order");
  out("  from _batch_new n");
  out("  join public.wine_archetypes a on a.id = n.id");
  out(" where a.wine_place_id is not null");
  out("on conflict (archetype_id, wine_place_id) do nothing;");
  out();
  out("-- Post-state, same transaction.");
  out("do $$");
  out("declare");
  out("  v_new int;");
  out("  v_text text;");
  out("begin");
  out("  -- Every batch name is in wine_archetypes exactly once.");
  out("  select string_agg(format('%s x%s', b.name, coalesce(x.n, 0)), '; ') into v_text");
  out("  from _batch_archetypes b");
  out("  left join (select a.name, count(*) as n from public.wine_archetypes a group by a.name) x on x.name = b.name");
  out("  where coalesce(x.n, 0) <> 1;");
  out("  if v_text is not null then");
  out("    raise exception 'batch archetypes are not each present exactly once: %', v_text;");
  out("  end if;");
  out("  -- The rows THIS run wrote carry every link the file lists.");
  out("  select count(*) into v_new from _batch_new;");
  out("  select string_agg(n.name, '; ') into v_text");
  out("  from _batch_new n");
  out("  join public.wine_archetypes a on a.id = n.id");
  out("  where (select count(*) from public.wine_archetype_aromas l where l.archetype_id = n.id)");
  out("          <> (select count(*) from _batch_aromas x where x.name = n.name)");
  out("     or (select count(*) from public.wine_archetype_aromas l where l.archetype_id = n.id and l.signature)");
  out("          <> (select count(*) from _batch_aromas x where x.name = n.name and x.signature)");
  out("     or (select count(*) from public.wine_archetype_designations l where l.archetype_id = n.id)");
  out("          <> (select count(*) from _batch_designations x where x.name = n.name)");
  out("     or (select count(*) from public.wine_archetype_placements p where p.archetype_id = n.id)");
  out("          <> case when a.wine_place_id is null then 0 else 1 end;");
  out("  if v_text is not null then");
  out("    raise exception 'batch archetypes written without every link: %', v_text;");
  out("  end if;");
  out(`  raise notice 'archetypes batch ${batch.batch}: % new of ${counts.archetypes}; wine_archetypes now %',`);
  out("    v_new, (select count(*) from public.wine_archetypes);");
  out("end $$;");
  return `${lines.join("\n")}\n`;
}
