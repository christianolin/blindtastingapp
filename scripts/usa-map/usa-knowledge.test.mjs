import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { loadTrees, us2Wave } from "./us2-wave.mjs";
import {
  migrationIsCurrent, panelGrapes, releasedSource, reviewMarkdown, shortlistDemotions, shortlistRanks, shortlistSurfaces,
  US2_CORRECTIONS, validateUsaProfiles,
} from "./usa-knowledge.mjs";
import { mergeSources } from "./usa-us3-knowledge.mjs";
import { signatureLeadProblems } from "./usa-us4-knowledge.mjs";

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
  // The applied release is never edited: the data file differs from it by the
  // recorded post-release corrections and nothing else.
  assert.deepEqual(migrationIsCurrent(releasedSource(source, US2_CORRECTIONS), sql.replace(/\r\n/g, "\n")), []);
  assert.deepEqual(migrationIsCurrent(source, sql.replace(/\r\n/g, "\n")),
    US2_CORRECTIONS.map((c) => `${c.key}: grape ${c.grape} (${c.to}) not in the migration`));
  assert.deepEqual(topLevelTransactionStatements(sql), []);
});

test("post-release corrections: each is listed once, carried by the data file, and put back exactly", async () => {
  const source = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
  assert.deepEqual(US2_CORRECTIONS.map((c) => [c.key, c.grape, c.from, c.to]),
    [["united-states.new-york.long-island", "Chardonnay", "ACCESSORY", "PRINCIPAL"]]);
  assert.equal(new Set(US2_CORRECTIONS.map((c) => `${c.key}|${c.grape}`)).size, US2_CORRECTIONS.length);
  const released = releasedSource(source, US2_CORRECTIONS);
  const li = (s) => s.places["united-states.new-york.long-island"].grapes;
  assert.deepEqual(li(released).find((g) => g.name === "Chardonnay"), { name: "Chardonnay", role: "ACCESSORY" });
  assert.deepEqual(li(source).find((g) => g.name === "Chardonnay"), { name: "Chardonnay" }, "the data file carries the correction");
  assert.deepEqual(li(source).filter((g) => (g.role ?? "PRINCIPAL") === "PRINCIPAL").map((g) => g.name),
    ["Merlot", "Chardonnay", "Cabernet Franc"], "the Long Island sheet's first three, in its order");
  // Only the listed value moves: everything else in the copy equals the data file.
  const back = structuredClone(released);
  delete li(back).find((g) => g.name === "Chardonnay").role;
  assert.deepEqual(back, source);
  assert.notEqual(released, source, "a copy, never the caller's object");
  // A stale or malformed entry fails loudly instead of silencing the check.
  const stale = structuredClone(source);
  li(stale).find((g) => g.name === "Chardonnay").role = "ACCESSORY";
  assert.throws(() => releasedSource(stale, US2_CORRECTIONS), /has ACCESSORY, not the corrected PRINCIPAL/);
  assert.throws(() => releasedSource(source, [{ ...US2_CORRECTIONS[0], grape: "Riesling" }]), /lists no such grape/);
  assert.throws(() => releasedSource(source, [{ ...US2_CORRECTIONS[0], from: "PRINCIPAL" }]), /two different roles/);
});

test("post-release corrections: each is its own migration, after the release, changing exactly that row", async () => {
  for (const c of US2_CORRECTIONS) {
    const sql = (await readFile(c.migration, "utf8")).replace(/\r\n/g, "\n");
    const version = c.migration.match(/^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/)?.[1];
    assert.ok(version && version > "20260930094747", `${c.migration}: a migration after the US-2 knowledge`);
    assert.deepEqual(topLevelTransactionStatements(sql), [], c.migration);
    assert.ok(sql.includes(`canonical_key = '${c.key}'`), `${c.migration}: resolves the place by key`);
    assert.ok(sql.includes(`where name = '${c.grape}'`), `${c.migration}: resolves the grape by exact name`);
    assert.equal((sql.match(/\bupdate public\.wine_place_grapes\b/g) ?? []).length, 1, `${c.migration}: one update`);
    assert.match(sql, new RegExp(`set role = '${c.to}'\\n\\s+where id = v_link and role = '${c.from}';`), `${c.migration}: ${c.from} -> ${c.to}`);
    assert.match(sql, new RegExp(`if v_role <> '${c.from}' then`), `${c.migration}: refuses unless ${c.from} before`);
    assert.match(sql, /if v_rows <> 1 then/, `${c.migration}: exactly one row changed`);
    assert.ok(!/\b(insert into|delete from)\b/i.test(sql), `${c.migration}: no insert or delete`);
    assert.ok(!/\bupdate public\.(?!wine_place_grapes\b)/.test(sql), `${c.migration}: no other table updated`);
    assert.ok(!/refresh_wine_place_neighbours/.test(sql), `${c.migration}: no catalogue write, so no refresh`);
  }
});

test("post-release corrections keep each state's signature lead (Riesling alone in New York)", async () => {
  const us2 = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
  const us4 = JSON.parse(await readFile("data/wine-map/place-profiles-usa-us4.json", "utf8"));
  const NY = "united-states.new-york";
  const now = shortlistRanks(mergeSources(us2, us4), NY);
  const before = shortlistRanks(mergeSources(releasedSource(us2, US2_CORRECTIONS), us4), NY);
  assert.deepEqual(now.get("Riesling"), { bucket: "principal", count: 5 });
  assert.deepEqual(now.get("Chardonnay"), { bucket: "principal", count: 4 });
  assert.deepEqual(before.get("Chardonnay"), { bucket: "principal", count: 3 });
  assert.deepEqual(signatureLeadProblems(mergeSources(us2, us4)), []);
});

test("the committed review file is the render of the data file and the rehearsal", async () => {
  const source = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
  const rehearsal = JSON.parse(await readFile("data/wine-map/review/usa-us2-rehearsal.json", "utf8"));
  const md = (await readFile("data/wine-map/review/usa-us2-knowledge.md", "utf8")).replace(/\r\n/g, "\n");
  assert.equal(md, reviewMarkdown({ source, wave, rehearsal, corrections: US2_CORRECTIONS }));
  assert.match(md, /## Corrected after release\n[\s\S]*\*\*United States › New York › Long Island\*\*: Chardonnay, ACCESSORY → PRINCIPAL/);
  assert.ok(md.indexOf("## Corrected after release") < md.indexOf("## United States"), "the corrections come before the places");
  assert.match(md, /## Grape shortlist change/);
  assert.ok(md.indexOf("## Questions for you") < md.indexOf("## United States"), "the questions come first");
  assert.ok(md.indexOf("## Grape shortlist change") > md.lastIndexOf("## United States"), "the shortlist table comes last");
  assert.ok(wave.places.length <= 40, "§18: at most 40 places per review file");
});

// Review round (2026-09-30).

test("roles: PRINCIPAL or ACCESSORY, and at least one signature grape per place", () => {
  const s = valid();
  s.places["united-states.oregon"].grapes = [{ name: "Pinot Noir", role: "ACCESSORY" }];
  s.places["united-states.washington"].grapes = [{ name: "Merlot", role: "MINOR" }];
  const p = validateUsaProfiles(s, wave).join("\n");
  assert.match(p, /united-states.oregon: no signature \(PRINCIPAL\) grape/);
  assert.match(p, /united-states.washington: bad role MINOR for Merlot/);
});

test("migrationIsCurrent catches a swapped style, a changed role and a non-re-appliable new grape", async () => {
  const source = releasedSource(JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8")), US2_CORRECTIONS);
  const sql = (await readFile("supabase/migrations/20260930094747_usa_us2_knowledge.sql", "utf8")).replace(/\r\n/g, "\n");
  assert.deepEqual(migrationIsCurrent(source, sql), []);
  const swapped = structuredClone(source);
  const li = swapped.places["united-states.new-york.long-island"];
  [li.styles[0], li.styles[1]] = [li.styles[1], li.styles[0]];
  assert.match(migrationIsCurrent(swapped, sql).join("\n"), /long-island: style WHITE at 0 not in the migration/);
  const replaced = structuredClone(source);
  replaced.places["united-states.new-york.long-island"].styles[3] = "FORTIFIED";
  assert.match(migrationIsCurrent(replaced, sql).join("\n"), /long-island: style FORTIFIED at 3/);
  const role = structuredClone(source);
  role.places["united-states.new-york.finger-lakes"].grapes.find((g) => g.name === "Chardonnay").role = "PRINCIPAL";
  assert.match(migrationIsCurrent(role, sql).join("\n"), /finger-lakes: grape Chardonnay \(PRINCIPAL\) not in the migration/);
  assert.match(migrationIsCurrent(source, sql.replace("\non conflict (name) do nothing;", ";")).join("\n"),
    /new grape Petite Sirah: not in the migration as a re-appliable insert/);
});

test("the panel order: signature grapes first, then accessory, each alphabetical", () => {
  assert.deepEqual(panelGrapes([
    { name: "Riesling" }, { name: "Merlot", role: "ACCESSORY" }, { name: "Chardonnay" }, { name: "Blaufränkisch", role: "ACCESSORY" },
  ]).map((g) => g.name), ["Chardonnay", "Riesling", "Blaufränkisch", "Merlot"]);
});

test("the by-hand chips: five after the colour filter, a tie at the cut named, unknown colours kept", () => {
  const ranks = new Map([["A", 3], ["B", 2], ["C", 1], ["D", 1], ["E", 1], ["F", 1], ["W", 1]]
    .map(([g, n]) => [g, { bucket: "principal", count: n }]));
  const colours = { A: "RED", B: "WHITE", C: "RED", D: "RED", E: "RED", F: "RED", W: "WHITE" };
  const s = shortlistSurfaces(["A", "B", "C", "D", "E", "F", "W"], colours, (g) => ranks.get(g));
  assert.deepEqual(s.none.shown, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(s.none.tiedAtCut, ["C", "D", "E", "F", "W"]);
  assert.deepEqual(s.white.shown, ["B", "W"]);
  assert.deepEqual(s.white.tiedAtCut, []);
  assert.deepEqual(s.red.shown, ["A", "C", "D", "E", "F"]);
  assert.deepEqual(shortlistSurfaces(["A", "X"], { A: "WHITE" }, null).red.shown, ["X"], "no colour on file: kept");
});

test("demotions: the state's own first three, where the shortlist puts them", () => {
  const ranks = new Map([["Chardonnay", 3], ["Cabernet Franc", 3], ["Riesling", 2], ["Merlot", 1]]
    .map(([g, n]) => [g, { bucket: "principal", count: n }]));
  const out = shortlistDemotions([{ name: "Riesling" }, { name: "Chardonnay" }, { name: "Pinot Noir" }],
    ["Cabernet Franc", "Chardonnay", "Riesling", "Merlot"], (g) => ranks.get(g));
  assert.deepEqual(out, [
    "Riesling (1st on the state's own list) moves down to 3rd",
    "Pinot Noir (3rd on the state's own list) is not on the shortlist",
  ]);
});

test("the review file: the signature split, both shortlist surfaces per state, and the room's dots", async () => {
  const md = (await readFile("data/wine-map/review/usa-us2-knowledge.md", "utf8")).replace(/\r\n/g, "\n");
  assert.ok(!md.includes("Grapes, in order"), "no order the app never shows");
  assert.match(md, /\*\*Grapes\*\*, as the details panel lists them/);
  for (const state of ["California", "Washington", "Oregon", "New York"]) {
    const at = md.indexOf(`### ${state}\n`);
    assert.ok(at > 0, state);
    const block = md.slice(at, md.indexOf("\n### ", at + 1) > 0 ? md.indexOf("\n### ", at + 1) : md.indexOf("\n## ", at));
    for (const row of ["Guess ladder (the whole list)", "By-hand chips, no colour yet", "By-hand chips, red", "By-hand chips, white", `Against ${state}'s own list`]) {
      assert.ok(block.includes(row), `${state}: ${row}`);
    }
  }
  assert.match(md, /## Typical wines on the training-room map/);
});
