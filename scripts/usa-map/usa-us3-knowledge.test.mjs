import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reviewChunks } from "./us3-wave.mjs";
import { mergeSources, sortToWaveOrder, us3ReviewMarkdown, validateUs3Profiles } from "./usa-us3-knowledge.mjs";
import { loadWave } from "./waves.mjs";
import { renderReview, reviewPath } from "./render-usa-us3-review.mjs";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { migrationIsCurrent } from "./usa-knowledge.mjs";

const waves = { core: await loadWave("us3-core"), rest: await loadWave("us3-rest") };
const long = (s) => `${s}: a plain factual sentence long enough to pass the floor.`;
const entry = (w, key, i) => {
  const u = w.ucd.find((x) => x.key === key);
  return {
    article: {
      description: long(`Description ${i}`), climate: long(`Climate ${i}`), soils: long(`Soils ${i}`),
      grape_varieties: long("Grapes"), wine_styles: long("Styles"),
      key_facts: [`Established ${u.established.slice(0, 4)} (27 CFR ${u.cfr_section})`, "Fact two here", "Fact three here"],
    },
    styles: ["RED"],
    grapes: [{ name: "Cabernet Sauvignon" }],
    sources: [
      { title: `27 CFR ${u.cfr_section}`, url: `https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9/subpart-C/section-${u.cfr_section}` },
      { title: "TTB, established AVAs", url: "https://www.ttb.gov/wine/established-avas" },
    ],
  };
};
const valid = (w) => ({
  _provenance: { wave: w.name, status: "DRAFT", owner_approval: null },
  new_grapes: [],
  places: Object.fromEntries(w.places.map((p, i) => [p.key, entry(w, p.key, i)])),
});
const OAK = "united-states.california.north-coast.napa-valley.oakville";
const RUT = "united-states.california.north-coast.napa-valley.rutherford";

test("complete files validate", () => {
  assert.deepEqual(validateUs3Profiles(valid(waves.core), waves.core), []);
  assert.deepEqual(validateUs3Profiles(valid(waves.rest), waves.rest), []);
});

test("Review Focus 4: the Established fact must be TTB's year and CFR section, exactly once", () => {
  const s = valid(waves.core);
  s.places[OAK].article.key_facts[0] = "Established 1994 (27 CFR 9.134)";
  assert.match(validateUs3Profiles(s, waves.core).join("\n"), /oakville: "Established 1994 \(27 CFR 9\.134\)" disagrees with TTB \(1993, 27 CFR 9\.134\)/);
  s.places[OAK].article.key_facts[0] = "First planted in the 1870s";
  assert.match(validateUs3Profiles(s, waves.core).join("\n"), /oakville: exactly one key fact "Established YYYY/);
});

test("Review Focus 4: no text copied between places", () => {
  const s = valid(waves.core);
  s.places[RUT].article.climate = s.places[OAK].article.climate;
  assert.match(validateUs3Profiles(s, waves.core).join("\n"), /rutherford: article\.climate repeats .*oakville climate/);
});

test("limits: description, grapes, signature grapes, sources, the wave name", () => {
  const s = valid(waves.core);
  const p = s.places[OAK];
  p.article.description = "x".repeat(701);
  p.grapes = ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot", "Malbec", "Zinfandel", "Syrah", "Chardonnay", "Sauvignon Blanc"].map((name) => ({ name }));
  s.places[RUT].sources = [{ title: "Winery page", url: "https://example.org/rutherford" }];
  s._provenance.wave = "us3-rest";
  const out = validateUs3Profiles(s, waves.core).join("\n");
  assert.match(out, /oakville: description over 700 characters/);
  assert.match(out, /oakville: more than 8 grapes/);
  assert.match(out, /oakville: more than 3 signature grapes/);
  assert.match(out, /rutherford: at least two sources/);
  assert.match(out, /rutherford: no CFR or Federal Register source/);
  assert.match(out, /_provenance\.wave must be us3-core/);
});

test("sortToWaveOrder restores wave order and keeps the top-level fields first", () => {
  const s = valid(waves.core);
  const reversed = { ...s, places: Object.fromEntries(Object.entries(s.places).reverse()) };
  const sorted = sortToWaveOrder(reversed, waves.core);
  assert.deepEqual(Object.keys(sorted.places), waves.core.places.map((p) => p.key));
  assert.deepEqual(Object.keys(sorted), ["_provenance", "new_grapes", "places"]);
});

test("mergeSources joins places", () => {
  assert.equal(Object.keys(mergeSources(valid(waves.core), valid(waves.rest)).places).length, 150);
});

test("a review part: one section per place, the shortlist only in the last part", () => {
  const s = valid(waves.core);
  const chunks = reviewChunks(waves.core.places);
  const md = us3ReviewMarkdown({ source: s, wave: waves.core, keys: chunks[0].map((p) => p.key), part: 1, parts: 3, allSource: s, rehearsal: null });
  assert.equal((md.match(/^## United States › /gm) ?? []).length, 29);
  assert.ok(!md.includes("## Grape shortlist change"));
});


for (const batch of ["core", "rest"]) {
  test(`the committed ${batch} knowledge file: the places written so far meet the US-3 rule`, async (t) => {
    const w = waves[batch];
    const source = JSON.parse(await readFile(w.knowledgeSource, "utf8"));
    const written = { ...w, places: w.places.filter((p) => source.places[p.key]) };
    if (!written.places.length) { t.skip("no place written yet"); return; }
    assert.deepEqual(validateUs3Profiles(source, written), []);
    if (source._provenance.status === "APPROVED") {
      assert.equal(Object.keys(source.places).length, w.places.length, "an approved file holds every place");
      assert.match(source._provenance.owner_approval.answer, /no need for my review/);
    }
  });
}

for (const batch of ["core", "rest"]) {
  test(`the committed ${batch} review files are the render (once written)`, async (t) => {
    try { await readFile(reviewPath(batch, 1)); } catch { t.skip("not rendered yet"); return; }
    const parts = await renderReview(batch);
    for (const [path, text] of parts) {
      let committed;
      try { committed = (await readFile(path, "utf8")).replace(/\r\n/g, "\n"); } catch { t.skip(`${path} not rendered yet`); return; }
      assert.equal(committed, text, path);
    }
  });
}

for (const batch of ["core", "rest"]) {
  test(`Review Focus 4: the ${batch} knowledge migration carries the data file exactly`, async () => {
    const w = waves[batch];
    const source = JSON.parse(await readFile(w.knowledgeSource, "utf8"));
    const sql = (await readFile(w.files.knowledge, "utf8")).replace(/\r\n/g, "\n");
    assert.deepEqual(migrationIsCurrent(source, sql), []);
    assert.deepEqual(topLevelTransactionStatements(sql), []);
    assert.equal((sql.match(/^insert into public\.wine_place_articles /gm) ?? []).length, w.places.length);
  });
}
