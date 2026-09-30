import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeSources } from "./usa-us3-knowledge.mjs";
import { shortlistTop, signatureLeadProblems, us4ReviewMarkdown, validateUs4Profiles } from "./usa-us4-knowledge.mjs";
import { renderReview, reviewPath } from "./render-usa-us4-review.mjs";
import { loadWave } from "./waves.mjs";

const wave = await loadWave("us4");
const long = (s) => `${s}: a plain factual sentence long enough to pass the floor.`;
const entry = (key, i) => {
  const u = wave.ucd.find((x) => x.key === key);
  return {
    article: {
      description: long(`Description ${i}`), climate: long(`Climate ${i}`), soils: long(`Soils ${i}`),
      grape_varieties: long("Grapes"), wine_styles: long("Styles"),
      key_facts: [`Established ${u.established.slice(0, 4)} (27 CFR ${u.cfr_section})`, "Fact two here", "Fact three here"],
    },
    styles: ["RED"],
    grapes: [{ name: "Pinot Noir" }],
    sources: [
      { title: `27 CFR ${u.cfr_section}`, url: `https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9/subpart-C/section-${u.cfr_section}` },
      { title: "TTB, established AVAs", url: "https://www.ttb.gov/wine/established-avas" },
    ],
  };
};
const valid = () => ({
  _provenance: { wave: "us4", status: "DRAFT", owner_approval: null },
  new_grapes: [],
  places: Object.fromEntries(wave.places.map((p, i) => [p.key, entry(p.key, i)])),
});
const CANDY = "united-states.washington.columbia-valley.yakima-valley.candy-mountain";
const CHAMPLAIN = "united-states.new-york.champlain-valley-of-new-york";
const grape = (name, color) => ({
  name, color, skin_color: color === "RED" ? "blue-black" : "green", description: long(`${name} is a hybrid grape`),
  sources: [{ title: `${name}, VIVC`, url: "https://www.vivc.de/" }],
});

test("a complete file validates", () => {
  assert.deepEqual(validateUs4Profiles(valid(), wave), []);
});

test("Review Focus 4: the Established fact is TTB's (Candy Mountain: 2020, 27 CFR 9.272)", () => {
  const s = valid();
  s.places[CANDY].article.key_facts[0] = "Established 2021 (27 CFR 9.272)";
  assert.match(validateUs4Profiles(s, wave).join("\n"), /candy-mountain: "Established 2021 \(27 CFR 9\.272\)" disagrees with TTB \(2020, 27 CFR 9\.272\)/);
});

test("Review Focus 4: new grapes are allow-listed hybrids, each used and sourced; never a labrusca", () => {
  const s = valid();
  s.places[CHAMPLAIN].grapes = [{ name: "Marquette" }, { name: "Concord", role: "ACCESSORY" },
    { name: "Chambourcin", role: "ACCESSORY" }, { name: "Frontenac", role: "ACCESSORY" }];
  s.new_grapes = [grape("Marquette", "RED"), grape("Concord", "RED"), grape("Chambourcin", "RED"), grape("La Crescent", "WHITE"),
    { ...grape("Frontenac", "RED"), sources: [] }];
  const out = validateUs4Profiles(s, wave).join("\n");
  assert.match(out, /new grape Concord: a labrusca needs the owner's say/);
  assert.match(out, /new grape Chambourcin: not on the US-4 allow-list/);
  assert.match(out, /new grape La Crescent: no place lists it/);
  assert.match(out, /new grape Frontenac: at least one https source/);
  assert.doesNotMatch(out, /new grape Marquette/);
});

test("Review Focus 5: each state's signature grape leads its shortlist", () => {
  const src = { places: {
    "united-states.oregon": { grapes: [{ name: "Pinot Noir" }] },
    "united-states.oregon.a": { grapes: [{ name: "Pinot Noir" }, { name: "Syrah", role: "ACCESSORY" }] },
    "united-states.washington": { grapes: [{ name: "Cabernet Sauvignon" }, { name: "Merlot" }] },
    "united-states.new-york": { grapes: [{ name: "Riesling" }] },
    "united-states.new-york.a": { grapes: [{ name: "Marquette" }] },
  } };
  assert.deepEqual(shortlistTop(src, "united-states.washington"), ["Cabernet Sauvignon", "Merlot"]);
  assert.deepEqual(signatureLeadProblems(src), ["united-states.new-york: Riesling ties at the top with Marquette"]);
  src.places["united-states.new-york.b"] = { grapes: [{ name: "Riesling" }] };
  assert.deepEqual(signatureLeadProblems(src), []);
  for (const k of ["b", "c", "d"]) src.places[`united-states.oregon.${k}`] = { grapes: [{ name: "Syrah" }] };
  assert.match(signatureLeadProblems(src).join("\n"), /united-states\.oregon: the shortlist leads with Syrah, not Pinot Noir/);
});

test("a state's review file: one section per place of that state, its new grapes, no shortlist without a rehearsal", () => {
  const s = valid();
  s.places[CHAMPLAIN].grapes = [{ name: "Marquette" }];
  s.new_grapes = [grape("Marquette", "RED")];
  const ny = wave.states.find((x) => x.code === "NY");
  const md = us4ReviewMarkdown({ source: s, wave, state: ny, allSource: s, rehearsal: null });
  assert.equal((md.match(/^## United States › New York › /gm) ?? []).length, 8);
  assert.match(md, /## New grapes for the catalog[\s\S]*\*\*Marquette\*\* \(red; skin blue-black\)/);
  assert.ok(!md.includes("## Grape shortlist change"));
});

test("the committed US-4 knowledge file: the places written so far meet the rule; an approved file is complete", async (t) => {
  const source = JSON.parse(await readFile(wave.knowledgeSource, "utf8"));
  const written = { ...wave, places: wave.places.filter((p) => source.places[p.key]) };
  if (!written.places.length) { t.skip("no place written yet"); return; }
  assert.deepEqual(validateUs4Profiles(source, written), []);
  if (source._provenance.status === "APPROVED") {
    assert.equal(Object.keys(source.places).length, wave.places.length, "an approved file holds every place");
    assert.match(source._provenance.owner_approval.answer, /no need for my review/);
    const us2 = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
    assert.deepEqual(signatureLeadProblems(mergeSources(us2, source)), [], "Review Focus 5 on the committed data");
  }
});

test("the committed review files are the render (once written)", async (t) => {
  // Before the knowledge is written there is nothing to render (renderReview
  // reads every place of the wave), so skip until the files are committed.
  for (const state of wave.states) {
    try { await readFile(reviewPath(state), "utf8"); } catch { t.skip(`${reviewPath(state)} not rendered yet`); return; }
  }
  for (const [path, text] of await renderReview()) {
    assert.equal((await readFile(path, "utf8")).replace(/\r\n/g, "\n"), text, path);
  }
});
