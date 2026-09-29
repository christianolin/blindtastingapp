import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { diffAvaLists } from "./usa-ava-diff.mjs";

const TTB = [
  { name: "Napa Valley", states: ["CA"], cfr_section: "9.23", established: "1981-02-27" },
  { name: "San Luis Obispo Coast", states: ["CA"], cfr_section: "9.279", established: "2022-02-04" },
  { name: "Columbia Hills", states: ["WA"], cfr_section: "9.300", established: "2026-05-01" },
  { name: "Columbia Valley", states: ["OR", "WA"], cfr_section: "9.74", established: "1984-12-13" },
  { name: "Texas High Plains", states: ["TX"], cfr_section: "9.144", established: "1993-03-01" },
  { name: "Seneca Lake", states: ["NY"], cfr_section: null, established: "2003-08-11" },
];
const UCD = [
  { ava_id: "napa_valley", name: "Napa Valley", cfr_index: "9.23", state: "CA" },
  { ava_id: "slo_coast", name: "SLO Coast", cfr_index: "9.279", state: "CA" },
  { ava_id: "columbia_valley", name: "Columbia Valley", cfr_index: "9.74", state: "OR|WA" },
  { ava_id: "old_ava", name: "Old Name", cfr_index: "9.999", state: "CA" },
  { ava_id: "seneca_lake", name: "Seneca Lake", cfr_index: "9.180", state: "NY" },
];

test("matched by CFR and name, renamed by CFR, matched by name alone, TTB-only and UC-Davis-only", () => {
  const d = diffAvaLists({ ttb: TTB, ucd: UCD, explanations: { old_ava: "Revoked 2020 (85 FR 1234)" } });
  assert.deepEqual(d.matched.map(({ ucd_id, how }) => [ucd_id, how]).sort(), [
    ["columbia_valley", "name+cfr"], ["napa_valley", "name+cfr"], ["seneca_lake", "name"], ["slo_coast", "cfr"],
  ]);
  assert.deepEqual(d.renamed.map(({ ttb_name, ucd_name }) => [ttb_name, ucd_name]), [["San Luis Obispo Coast", "SLO Coast"]]);
  assert.deepEqual(d.ttb_only.map(({ name }) => name), ["Columbia Hills"]);
  assert.deepEqual(d.ucd_only.map(({ ucd_id, explanation }) => [ucd_id, explanation]), [["old_ava", "Revoked 2020 (85 FR 1234)"]]);
  assert.deepEqual(d.unexplained, []);
});

test("an unexplained UC-Davis-only AVA is reported", () => {
  const d = diffAvaLists({ ttb: TTB, ucd: UCD });
  assert.deepEqual(d.unexplained.map(({ ucd_id }) => ucd_id), ["old_ava"]);
});

test("TTB rows outside the four states are out of scope; a cross-state row counts once", () => {
  const d = diffAvaLists({ ttb: TTB, ucd: UCD, explanations: { old_ava: "x" } });
  const names = [...d.matched.map((m) => m.ttb_name), ...d.ttb_only.map((t) => t.name)];
  assert.ok(!names.includes("Texas High Plains"));
  assert.equal(names.filter((n) => n === "Columbia Valley").length, 1);
});

test("the committed TTB list is well formed", () => {
  const list = JSON.parse(readFileSync("data/wine-map/usa-ava-ttb-list.json", "utf8"));
  assert.equal(list.total, list.avas.length);
  const folds = new Set();
  for (const a of list.avas) {
    assert.ok(a.name && !/\sAVA$/.test(a.name), a.name);
    assert.ok(a.states.length > 0 && a.states.every((s) => /^[A-Z]{2}$/.test(s)), a.name);
    assert.ok(a.cfr_section === null || /^9\.\d+$/.test(a.cfr_section), a.name);
    const fold = a.name.toLowerCase();
    assert.ok(!folds.has(fold), `duplicate ${a.name}`);
    folds.add(fold);
  }
  const perState = (s) => list.avas.filter((a) => a.states.includes(s)).length;
  console.log(`TTB per state: CA ${perState("CA")}, OR ${perState("OR")}, WA ${perState("WA")}, NY ${perState("NY")}`);
});
