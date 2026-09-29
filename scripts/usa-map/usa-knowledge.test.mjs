import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { loadTrees, us2Wave } from "./us2-wave.mjs";
import { validateUsaProfiles, reviewMarkdown, migrationIsCurrent } from "./usa-knowledge.mjs";

const wave = us2Wave(await loadTrees());
const long = (s) => `${s} — a plain factual sentence long enough to pass the floor.`;
const valid = () => ({
  _provenance: { wave: "us2", status: "DRAFT", owner_approval: null },
  _owner_questions: [],
  new_grapes: [],
  places: Object.fromEntries(wave.places.map((p) => [p.key, {
    article: {
      description: p.navigation_node
        ? "Central Valley is a grouping on this map, not an AVA. " + long("It gathers eleven valley-floor AVAs")
        : long(p.name),
      climate: long("Climate"), soils: long("Soils"), grape_varieties: long("Grapes"), wine_styles: long("Styles"),
      key_facts: ["Fact one here", "Fact two here", "Fact three here"],
    },
    styles: ["RED"],
    grapes: [{ name: "Cabernet Sauvignon" }],
    sources: [{ title: "27 CFR Part 9", url: "https://www.ecfr.gov/current/title-27/part-9" }],
  }])),
});

test("a complete file validates", () => assert.deepEqual(validateUsaProfiles(valid(), wave), []));

test("every wave place, in wave order, and nothing else", () => {
  const s = valid();
  delete s.places["united-states.oregon"];
  s.places["united-states.texas"] = s.places["united-states"];
  const p = validateUsaProfiles(s, wave);
  assert.ok(p.some((x) => /missing: united-states.oregon/.test(x)));
  assert.ok(p.some((x) => /not in the wave: united-states.texas/.test(x)));
});

test("all six article fields, 3-6 facts, grapes and styles and sources on every place", () => {
  const s = valid();
  s.places["united-states"].article.wine_styles = "short";
  s.places["united-states.california"].article.key_facts = ["one", "two"];
  s.places["united-states.oregon"].grapes = [];
  s.places["united-states.new-york"].styles = ["RED", "RED"];
  s.places["united-states.washington"].sources = [];
  const p = validateUsaProfiles(s, wave).join("\n");
  assert.match(p, /united-states: article.wine_styles missing or under 40/);
  assert.match(p, /united-states.california: 3-6 key facts/);
  assert.match(p, /united-states.oregon: at least one grape/);
  assert.match(p, /united-states.new-york: duplicate style/);
  assert.match(p, /united-states.washington: at least one source/);
});

test("copy rules: no hype, no boundary claims, no unsourced share", () => {
  const s = valid();
  s.places["united-states.california.north-coast"].article.description = long("A world-class region");
  s.places["united-states.oregon.willamette-valley"].article.soils = long("The official boundary follows");
  s.places["united-states.washington"].grapes = [{ name: "Merlot", share_pct: 20 }];
  const p = validateUsaProfiles(s, wave).join("\n");
  assert.match(p, /north-coast: hype word "world-class"/);
  assert.match(p, /willamette-valley: boundary claim/);
  assert.match(p, /united-states.washington: share_pct for Merlot needs share_source/);
});

test("Central Valley's first sentence says it is a grouping, not an AVA (D25)", () => {
  const s = valid();
  s.places["united-states.california.central-valley"].article.description = long("The Central Valley AVA is large");
  assert.match(validateUsaProfiles(s, wave).join("\n"), /central-valley: the first sentence must say it is a grouping on this map, not an AVA/);
});

test("the review file has one section per place in wave order, and the answer instructions", () => {
  const md = reviewMarkdown({ source: valid(), wave, rehearsal: null });
  const heads = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads.slice(0, 16), wave.places.map((p) => p.breadcrumb));
  assert.match(md, /Reply \*\*OK\*\*/);
  assert.match(md, /Status: DRAFT, provisional copy/);
});

test("migrationIsCurrent flags text the migration does not carry", () => {
  const s = valid();
  const sql = "insert … 'Old text' …";
  assert.ok(migrationIsCurrent(s, sql).length > 0);
});

test("the committed US knowledge file meets the US rule", async () => {
  const source = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
  assert.deepEqual(validateUsaProfiles(source, wave), []);
  assert.deepEqual(source.new_grapes.map((g) => g.name), ["Petite Sirah"]);
});

test("the knowledge migration is current with the data file (Review Focus 3)", async () => {
  const source = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
  const sql = await readFile("supabase/migrations/20260930094747_usa_us2_knowledge.sql", "utf8");
  assert.deepEqual(migrationIsCurrent(source, sql.replace(/\r\n/g, "\n")), []);
  assert.deepEqual(topLevelTransactionStatements(sql), []);
});
