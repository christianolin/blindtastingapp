// Generator for the Côte de Nuits import (Phase 3C). Derives the place tree
// from the committed INAO vocabulary + curated grand-cru list, asserts every
// denomination resolves, and emits (1) a catalog migration and (2) the
// fetch/build target list for the requested wave:
//   5a — Vosne-Romanée vertical slice (committed as 20260805090000)
//   5b — the remaining seven villages, their grands crus, and 1er-cru
//        groups where INAO defines one (individual climats follow in 3D).
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("../../", import.meta.url);
const membership = JSON.parse(
  await readFile(new URL("data/wine-map/inao-denomination-membership.json", ROOT), "utf8"),
).membership;
const grandCrus = JSON.parse(
  await readFile(new URL("data/wine-map/burgundy-grand-crus.json", ROOT), "utf8"),
).grand_crus;

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const esc = (s) => s.replace(/'/g, "''");

// Fine generalization presets (owner directive: edges should track the real
// parcel edges closely; per-region shards keep the byte cost local).
const PRESETS = {
  village: { presimplify: 0.00005, tolerance: 0.0001, minShare: 0.05, minPartShare: 0, closing: 0.002 },
  group: { presimplify: 0.00005, tolerance: 0.0001, minShare: 0.05, minPartShare: 0, closing: 0.002 },
  cru: { presimplify: 0.000015, tolerance: 0.00003, minShare: 0, minPartShare: 0, closing: 0.0008 },
};

const DISTRICT = { key: "france.bourgogne.cote-de-nuits", parent: "france.bourgogne", name: "Côte de Nuits" };

// Villages in geographic north-to-south order.
const WAVES = {
  "5a": {
    migration: "supabase/migrations/20260805090000_cote_de_nuits.sql",
    targetsFile: "cote-de-nuits-targets.json",
    insertDistrict: true,
    sortBase: 0,
    expectedSubtree: 24,
    villages: [{ name: "Vosne-Romanée", climats: true }],
  },
  "5b": {
    migration: "supabase/migrations/20260807090000_cote_de_nuits_villages.sql",
    targetsFile: "cote-de-nuits-5b-targets.json",
    insertDistrict: false,
    sortBase: 24,
    expectedSubtree: null, // computed: 24 existing + new places
    villages: [
      { name: "Marsannay", climats: false },
      { name: "Fixin", climats: false },
      { name: "Gevrey-Chambertin", climats: false },
      { name: "Morey-Saint-Denis", climats: false },
      { name: "Chambolle-Musigny", climats: false },
      { name: "Vougeot", climats: false },
      { name: "Nuits-Saint-Georges", climats: false },
    ],
  },
};
const waveName = process.argv[2] ?? "5b";
const wave = WAVES[waveName];
assert.ok(wave, `unknown wave ${waveName}`);

const places = [];
const targets = [];
let sort = wave.sortBase;

if (wave.insertDistrict) {
  // Districts reveal at z7: a region-fit camera lands around z7, so z8 would
  // leave the district invisible after clicking its region.
  places.push({
    parent: DISTRICT.parent, kind: "SUBREGION", key: DISTRICT.key, name: DISTRICT.name,
    slug: "cote-de-nuits", tier: 2, zoom: 7, isApp: false, system: null, level: null, sort: sort++,
  });
}

for (const village of wave.villages) {
  assert.ok(village.name in membership, `village denom missing: ${village.name}`);
  const vSlug = slugify(village.name);
  const vKey = `${DISTRICT.key}.${vSlug}`;
  places.push({
    parent: DISTRICT.key, kind: "APPELLATION", key: vKey, name: village.name,
    slug: vSlug, tier: 3, zoom: 10, isApp: true, system: "AOC/AOP",
    level: "communal", sort: sort++,
  });
  targets.push({ slug: `${vSlug}-village`, key: vKey, members: [village.name], ...PRESETS.village });

  for (const gc of grandCrus.filter((g) => g.village === vSlug)) {
    assert.ok(gc.denom in membership, `grand cru denom missing: ${gc.denom}`);
    const gKey = `${vKey}.${slugify(gc.name)}`;
    places.push({
      parent: vKey, kind: "APPELLATION", key: gKey, name: gc.name, slug: slugify(gc.name),
      tier: 4, zoom: 13, isApp: true, system: "AOC/AOP", level: "grand_cru", sort: sort++,
    });
    targets.push({ slug: `${vSlug}-gc-${slugify(gc.name)}`, key: gKey, members: [gc.denom], ...PRESETS.cru });
  }

  // 1er-cru group only where INAO defines the aggregate (Marsannay has none).
  const groupDenom = `${village.name} premier cru`;
  if (groupDenom in membership) {
    const grpKey = `${vKey}.premier-cru`;
    places.push({
      parent: vKey, kind: "SITE", key: grpKey, name: `${village.name} 1er Cru`, slug: "premier-cru",
      tier: 4, zoom: 12, isApp: true, system: "AOC/AOP", level: "premier_cru", sort: sort++,
    });
    targets.push({ slug: `${vSlug}-1er`, key: grpKey, members: [groupDenom], ...PRESETS.group });

    if (village.climats) {
      const climats = Object.keys(membership)
        .filter((k) => k.startsWith(`${groupDenom} `))
        .sort();
      for (const denom of climats) {
        const climatName = denom.slice(groupDenom.length + 1);
        const cKey = `${grpKey}.${slugify(climatName)}`;
        places.push({
          parent: grpKey, kind: "SITE", key: cKey, name: climatName, slug: slugify(climatName),
          tier: 5, zoom: 14, isApp: true, system: "AOC/AOP", level: "premier_cru", sort: sort++,
        });
        targets.push({
          slug: `${vSlug}-1er-${slugify(climatName)}`, key: cKey, members: [denom], ...PRESETS.cru,
        });
      }
    }
  } else {
    console.log(`note: no INAO 1er-cru aggregate for ${village.name} — group skipped`);
  }
}

const expectedSubtree = wave.expectedSubtree ?? 24 + places.length;

const lines = [
  `-- Phase 3C wave ${waveName}: Côte de Nuits places as DRAFT. Boundaries are`,
  "-- staged separately by build-boundary.mjs; a flip migration marks them",
  "-- VERIFIED once the owner approves the shapes.",
  "-- Generated by scripts/wine-map-sources/generate-cote-de-nuits.mjs.",
  "",
];
for (const p of places) {
  lines.push(
    "insert into wine_places (primary_parent_id, kind, canonical_key, name, slug,",
    "  display_tier, min_zoom, label_min_zoom, publication_status, sort_order,",
    "  is_appellation, appellation_system, appellation_level)",
    "values (",
    `  (select id from wine_places where canonical_key = '${esc(p.parent)}'),`,
    `  '${p.kind}', '${esc(p.key)}', '${esc(p.name)}', '${esc(p.slug)}',`,
    `  ${p.tier}, ${p.zoom}, ${p.zoom}, 'DRAFT', ${p.sort},`,
    `  ${p.isApp}, ${p.system ? `'${p.system}'` : "null"}, ${p.level ? `'${p.level}'` : "null"}`,
    ");",
    "",
  );
}
lines.push(
  "do $$",
  "declare v_count int;",
  "begin",
  "  select count(*) into v_count from wine_places",
  "   where canonical_key like 'france.bourgogne.cote-de-nuits%';",
  `  if v_count <> ${expectedSubtree} then`,
  `    raise exception 'expected ${expectedSubtree} Cote de Nuits places, got %', v_count;`,
  "  end if;",
  "end $$;",
  "",
);

await writeFile(new URL(wave.migration, ROOT), lines.join("\n"));

const workDir = path.resolve(".tiles-build", "sources");
await mkdir(workDir, { recursive: true });
await writeFile(
  path.join(workDir, wave.targetsFile),
  `${JSON.stringify(targets, null, 2)}\n`,
);

const byKind = {};
for (const p of places) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
console.log(
  `GENERATED wave ${waveName}: ${places.length} places (${JSON.stringify(byKind)}), ${targets.length} targets, subtree guard ${expectedSubtree}.`,
);
