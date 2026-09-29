// Pure tests for the training-room batch checks and SQL (no database):
//   node --test --test-reporter=tap --test-reporter-destination=stdout scripts/training/archetype-batch.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { batchCounts, batchMigrationSql, batchProblems, entrySat, sqlText } from "./archetype-batch.mjs";
import { ladderFor, rangeProblems } from "./archetype-ladders.mjs";

const SAT = {
  appearanceIntensity: ["PALE", "MEDIUM"],
  colourHue: ["LEMON", "GOLD"],
  noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
  development: ["YOUTHFUL", "DEVELOPING"],
  sweetness: ["DRY", "DRY"],
  acidity: ["HIGH", "HIGH"],
  tannin: ["LOW", "LOW"],
  alcohol: ["MEDIUM", "MEDIUM"],
  body: ["MEDIUM_MINUS", "MEDIUM"],
  flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
  finish: ["MEDIUM_PLUS", "LONG"],
};
const aromas = (terms) => terms.map(([group, term, signature = false]) => ({ group, term, signature }));
const entry = (over = {}) => ({
  name: "A typical Test d'Asti",
  country: "France",
  region: "Champagne",
  appellation: "Champagne AOC",
  placeCanonicalKey: null,
  colour: "WHITE",
  style: "SPARKLING",
  primaryGrape: "Chardonnay",
  secondaryGrape: "Pinot Noir",
  designations: ["Brut"],
  typicalAge: [2, 10],
  quality: [85, 95],
  sat: { ...SAT },
  mousse: ["CREAMY", "CREAMY"],
  nose: aromas([
    ["Citrus", "lemon"],
    ["Green fruit", "green apple"],
    ["Autolytic", "brioche", true],
    ["Autolytic", "toast"],
  ]),
  palate: aromas([
    ["Citrus", "lemon"],
    ["Green fruit", "green apple"],
    ["Autolytic", "brioche", true],
    ["Autolytic", "biscuit"],
  ]),
  description: "Test only.",
  ...over,
});
const batchOf = (...archetypes) => ({
  batch: 9,
  missingReferenceRows: { regions: [], appellations: [], grapes: [] },
  archetypes,
});

test("a sound entry has no errors and no warnings", () => {
  assert.deepEqual(batchProblems(batchOf(entry())), { errors: [], warnings: [] });
});

test("the committed batch-1 file is sound", () => {
  const batch = JSON.parse(readFileSync("data/training/archetypes-batch-1.json", "utf8"));
  assert.deepEqual(batchProblems(batch).errors, []);
});

test("ranges lie on their ladder and hold a value the slider can produce (spec §4.4)", () => {
  const red = { colour: "RED", style: "STILL" };
  const port = { colour: "RED", style: "FORTIFIED" };
  assert.deepEqual(rangeProblems("tannin", ["MEDIUM_PLUS", "HIGH"], red), []);
  assert.deepEqual(rangeProblems("tannin", ["MEDIUM", "LOUD"], red), [
    'tannin high "LOUD" is not on its ladder (LOW, MEDIUM_MINUS, MEDIUM, MEDIUM_PLUS, HIGH)',
  ]);
  assert.deepEqual(rangeProblems("acidity", ["HIGH", "MEDIUM"], red), ['acidity low "HIGH" is above high "MEDIUM"']);
  assert.deepEqual(rangeProblems("alcohol", ["MEDIUM", "MEDIUM_PLUS"], red), [
    'alcohol high "MEDIUM_PLUS" is not on its ladder (LOW, MEDIUM, HIGH)',
  ]);
  assert.deepEqual(rangeProblems("alcohol", ["MEDIUM_PLUS", "HIGH"], port), []);
  assert.deepEqual(rangeProblems("appearanceIntensity", ["MEDIUM_PLUS", "DEEP"], red), []);
  assert.deepEqual(rangeProblems("appearanceIntensity", ["MEDIUM_MINUS", "MEDIUM_MINUS"], red), [
    "appearanceIntensity [MEDIUM_MINUS, MEDIUM_MINUS] holds no value the note's slider can produce",
  ]);
  assert.deepEqual(rangeProblems("sweetness", ["MEDIUM", "MEDIUM"], red), [
    "sweetness [MEDIUM, MEDIUM] holds no value the note's slider can produce",
  ]);
  assert.deepEqual(rangeProblems("colourHue", ["RUBY", "GARNET"], { colour: "WHITE", style: "STILL" }), [
    'colourHue low "RUBY" is not on its ladder (LEMON_GREEN, LEMON, GOLD, AMBER, BROWN)',
    'colourHue high "GARNET" is not on its ladder (LEMON_GREEN, LEMON, GOLD, AMBER, BROWN)',
  ]);
  assert.deepEqual(rangeProblems("tannin", ["LOW"], red), ["tannin must be a [low, high] pair of strings"]);
  assert.equal(ladderFor("mousse", red), null);
  assert.deepEqual(ladderFor("colourHue", { colour: "ORANGE", style: "STILL" }), ["GOLD", "AMBER", "BROWN"]);
});

test("structural errors name the entry and the problem", () => {
  const cases = [
    [entry({ clarity: ["CLEAR", "CLEAR"] }), 'unknown key "clarity"'],
    [entry({ sat: { ...SAT, clarity: ["CLEAR", "CLEAR"] } }), `"sat.clarity" is not a matched scale`],
    [entry({ secondaryGrape: "Chardonnay" }), "the secondary grape repeats the primary"],
    [entry({ style: "STILL" }), 'only a sparkling wine carries a "mousse" range'],
    [entry({ mousse: undefined }), 'a sparkling wine needs a "mousse" range'],
    [entry({ colour: "PINKISH" }), 'colour "PINKISH" is not a wine_colour'],
    [entry({ quality: [40, 95] }), '"quality" must be [low, high] points, 50 <= low <= high <= 100'],
    [entry({ typicalAge: [10, 2] }), '"typicalAge" must be null or [low, high] whole years, 0 <= low <= high <= 100'],
    [entry({ designations: ["Brut", "Brut"] }), "a designation appears twice"],
    [entry({ placeCanonicalKey: "" }), '"placeCanonicalKey" must be a string or null'],
    [entry({ name: " A typical Test" }), '"name" must be a trimmed, non-empty string'],
    [
      entry({ nose: [...entry().nose, { group: "Citrus", term: "lemon", signature: false }] }),
      'nose lists "lemon" (Citrus) twice',
    ],
    [
      entry({ palate: [{ group: "Citrus", term: "lemon" }, ...entry().palate.slice(1)] }),
      'every "palate" aroma needs a group, a term and a boolean signature',
    ],
  ];
  for (const [e, message] of cases) {
    const { errors } = batchProblems(batchOf(e));
    assert.ok(
      errors.some((x) => x.startsWith("#1 ") && x.includes(message)),
      `${message} not in ${JSON.stringify(errors)}`,
    );
  }
  const twice = batchProblems(batchOf(entry(), entry()));
  assert.ok(twice.errors.includes("#2 A typical Test d'Asti: the name appears twice in this batch"));
  assert.deepEqual(batchProblems({ archetypes: "no" }).errors, ['the batch file needs an "archetypes" array']);
});

test("warnings let a batch through", () => {
  const noTannin = Object.fromEntries(Object.entries(SAT).filter(([k]) => k !== "tannin"));
  const ok = batchProblems(batchOf(entry({ name: "Test Brut", nose: entry().nose.slice(0, 3), sat: noTannin })));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, [
    '#1 Test Brut: the name does not start with "A typical " (spec §4.8)',
    '#1 Test Brut: no "tannin" range: the matcher skips that scale for it',
    "#1 Test Brut: 3 nose terms (the guide asks for 4-6)",
  ]);
});

test("entrySat folds the mousse range in; batchCounts counts every link", () => {
  assert.deepEqual(entrySat(entry()), { ...SAT, mousse: ["CREAMY", "CREAMY"] });
  assert.deepEqual(entrySat(entry({ style: "STILL", mousse: undefined })), SAT);
  assert.deepEqual(batchCounts(batchOf(entry(), entry({ name: "A typical Two", placeCanonicalKey: "france.champagne" }))), {
    archetypes: 2,
    aromas: 16,
    signatures: 4,
    designations: 2,
    placements: 1,
  });
});

test("the migration SQL quotes, guards and counts from the file", () => {
  const sql = batchMigrationSql(batchOf(entry()), { file: "data/training/test.json", generatedOn: "2026-09-25" });
  assert.equal(sqlText("d'Asti"), "'d''Asti'");
  assert.equal(sqlText(null), "null");
  assert.ok(sql.startsWith("-- Training room: typical wines, batch 9 (spec\n"));
  assert.ok(sql.includes("-- 1 archetypes, 8 aroma links (2 signature),\n-- 1 designation links, 0 map placements.\n"));
  assert.ok(sql.includes("-- Reference rows added: none (missingReferenceRows is empty)."));
  assert.ok(sql.includes("(1, 'A typical Test d''Asti', 'France', 'Champagne', 'Champagne AOC', null, 'WHITE'::wine_colour"));
  assert.ok(sql.includes(`'${JSON.stringify(entrySat(entry()))}'::jsonb`));
  assert.ok(sql.includes("('A typical Test d''Asti', 'NOSE', 'Autolytic', 'brioche', true)"));
  assert.ok(sql.includes("('A typical Test d''Asti', 'Brut');"));
  assert.ok(sql.includes("   where not exists (select 1 from public.wine_archetypes a where a.name = b.name)"));
  assert.ok(sql.includes("  if (select count(*) from _batch_archetypes) <> 1\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_aromas) <> 8\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_aromas where signature) <> 2\n"));
  assert.ok(sql.includes("     or (select count(*) from _batch_designations) <> 1 then"));
  assert.ok(!/insert into public\.(regions|appellations|grapes)/.test(sql));
  assert.equal(sql, batchMigrationSql(batchOf(entry()), { file: "data/training/test.json", generatedOn: "2026-09-25" }));

  const withRows = batchMigrationSql(
    {
      ...batchOf(entry()),
      missingReferenceRows: {
        regions: [{ country: "France", region: "Test Region" }],
        appellations: [{ country: "France", region: "Test Region", appellation: "Test AOC" }],
        grapes: [{ name: "Test Grape" }],
      },
    },
    { file: "x.json", generatedOn: "2026-09-25" },
  );
  assert.ok(withRows.includes("-- * region France / Test Region\n-- * appellation France / Test Region / Test AOC\n-- * grape Test Grape\n"));
  assert.ok(withRows.includes("insert into public.grapes (name) values ('Test Grape') on conflict (name) do nothing;"));
  assert.ok(withRows.indexOf("insert into public.regions") < withRows.indexOf("insert into public.appellations"));
  assert.ok(withRows.indexOf("insert into public.appellations") < withRows.indexOf("create temp table _batch_archetypes"));
});

test("the migration SQL also places each new archetype at its REGION ancestor (training-room-map RM9a)", () => {
  const sql = batchMigrationSql(batchOf(entry({ placeCanonicalKey: "france.bordeaux.haut-medoc.margaux" })), {
    file: "data/training/test.json",
    generatedOn: "2026-09-29",
  });
  assert.ok(sql.includes("  pg_temp._batch_resolved, pg_temp._batch_new, pg_temp._batch_region;\n"));
  assert.ok(sql.includes("create temp table _batch_region on commit drop as\n"));
  // The same REGION walk as training_archetype_places: nearest kind = 'REGION', self included.
  assert.ok(sql.includes("    select id, canonical_key, depth from chain where kind = 'REGION' order by depth limit 1\n"));
  // Not when the home IS the region, and never under france.bourgogne (its curated representatives).
  assert.ok(sql.includes(" where r.depth > 0 and r.canonical_key <> 'france.bourgogne';\n"));
  assert.ok(sql.includes("select archetype_id, place_id, sort_order from _batch_region\n"));
  // The home placement first, then the region's, both before the post-state asserts.
  const home = sql.indexOf("select a.id, a.wine_place_id, a.sort_order");
  const region = sql.indexOf("select archetype_id, place_id, sort_order from _batch_region");
  const post = sql.indexOf("-- Post-state, same transaction.");
  assert.ok(home > 0 && home < region && region < post);
  // The post-state counts the region placement, and still requires the home one.
  assert.ok(sql.includes("                  else 1 + (select count(*) from _batch_region r where r.archetype_id = n.id) end\n"));
  assert.ok(sql.includes("where p.archetype_id = n.id and p.wine_place_id = a.wine_place_id));\n"));
});
