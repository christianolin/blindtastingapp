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

// Default district (waves 5a/5b); later waves carry their own in the config.
const CDN = { key: "france.bourgogne.cote-de-nuits", parent: "france.bourgogne", name: "Côte de Nuits" };

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
  "3d1": {
    migration: "supabase/migrations/20260810090000_cote_de_beaune.sql",
    targetsFile: "cote-de-beaune-targets.json",
    district: { key: "france.bourgogne.cote-de-beaune", parent: "france.bourgogne", name: "Côte de Beaune" },
    insertDistrict: true,
    sortBase: 53,
    expectedSubtree: null,
    villages: [
      { name: "Ladoix", climats: false },
      { name: "Aloxe-Corton", climats: false },
      { name: "Pernand-Vergelesses", climats: false },
      { name: "Savigny-lès-Beaune", climats: false },
      { name: "Chorey-lès-Beaune", climats: false },
      { name: "Beaune", climats: false },
      { name: "Pommard", climats: false },
      { name: "Volnay", climats: false },
      { name: "Monthélie", climats: false },
      { name: "Auxey-Duresses", climats: false },
      { name: "Saint-Romain", climats: false },
      { name: "Meursault", climats: false },
      { name: "Puligny-Montrachet", climats: false },
      { name: "Chassagne-Montrachet", climats: false },
      { name: "Saint-Aubin", climats: false },
      { name: "Santenay", climats: false },
      { name: "Maranges", climats: false },
    ],
  },
  "3d2-chablis": {
    // 20260811090000 is taken by wine_knowledge_content_v2 — versions are a
    // global sequence, so Chablis sits at 10:00.
    migration: "supabase/migrations/20260811100000_chablis.sql",
    targetsFile: "chablis-targets.json",
    district: { key: "france.bourgogne.chablis", parent: "france.bourgogne", name: "Chablis" },
    insertDistrict: true,
    sortBase: 94,
    expectedSubtree: null,
    villages: [
      { name: "Chablis", climats: false },
      { name: "Petit Chablis", climats: false },
    ],
  },
  "3d2-auxerrois": {
    migration: "supabase/migrations/20260811093000_grand_auxerrois.sql",
    targetsFile: "grand-auxerrois-targets.json",
    district: { key: "france.bourgogne.grand-auxerrois", parent: "france.bourgogne", name: "Grand Auxerrois" },
    insertDistrict: true,
    sortBase: 100,
    expectedSubtree: null,
    villages: [
      { name: "Irancy", climats: false },
      { name: "Saint-Bris", climats: false },
      { name: "Vézelay", climats: false },
    ],
  },
  "3d3-chalonnaise": {
    migration: "supabase/migrations/20260812090000_cote_chalonnaise.sql",
    targetsFile: "cote-chalonnaise-targets.json",
    district: { key: "france.bourgogne.cote-chalonnaise", parent: "france.bourgogne", name: "Côte Chalonnaise" },
    insertDistrict: true,
    sortBase: 105,
    expectedSubtree: null,
    villages: [
      { name: "Bouzeron", climats: false },
      { name: "Rully", climats: false },
      { name: "Mercurey", climats: false },
      { name: "Givry", climats: false },
      { name: "Montagny", climats: false },
    ],
  },
  "3d3-maconnais": {
    migration: "supabase/migrations/20260812093000_maconnais.sql",
    targetsFile: "maconnais-targets.json",
    district: { key: "france.bourgogne.maconnais", parent: "france.bourgogne", name: "Mâconnais" },
    insertDistrict: true,
    sortBase: 115,
    expectedSubtree: null,
    villages: [
      { name: "Mâcon", climats: false },
      { name: "Viré-Clessé", climats: false },
      { name: "Pouilly-Fuissé", climats: false },
      { name: "Pouilly-Vinzelles", climats: false },
      { name: "Pouilly-Loché", climats: false },
      { name: "Saint-Véran", climats: false },
    ],
  },
};
const waveName = process.argv[2] ?? "5b";
const wave = WAVES[waveName];
assert.ok(wave, `unknown wave ${waveName}`);
const district = wave.district ?? CDN;
const districtSlug = slugify(district.name);

const places = [];
const targets = [];
let sort = wave.sortBase;

if (wave.insertDistrict) {
  // Districts reveal at z7: a region-fit camera lands around z7, so z8 would
  // leave the district invisible after clicking its region.
  places.push({
    parent: district.parent, kind: "SUBREGION", key: district.key, name: district.name,
    slug: districtSlug, tier: 2, zoom: 7, isApp: false, system: null, level: null, sort: sort++,
  });
}

for (const village of wave.villages) {
  assert.ok(village.name in membership, `village denom missing: ${village.name}`);
  const vSlug = slugify(village.name);
  const vKey = `${district.key}.${vSlug}`;
  places.push({
    parent: district.key, kind: "APPELLATION", key: vKey, name: village.name,
    slug: vSlug, tier: 3, zoom: 10, isApp: true, system: "AOC/AOP",
    level: "communal", sort: sort++,
  });
  targets.push({ slug: `${vSlug}-village`, key: vKey, members: [village.name], ...PRESETS.village });

  for (const gc of grandCrus.filter((g) => g.district === districtSlug && g.village === vSlug)) {
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

const expectedSubtree =
  wave.expectedSubtree ?? (wave.insertDistrict ? places.length : 24 + places.length);

const lines = [
  `-- Burgundy wave ${waveName}: ${district.name} places as DRAFT. Boundaries are`,
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
  `   where canonical_key like '${district.key}%';`,
  `  if v_count <> ${expectedSubtree} then`,
  `    raise exception 'expected ${expectedSubtree} ${slugify(district.name)} places, got %', v_count;`,
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
