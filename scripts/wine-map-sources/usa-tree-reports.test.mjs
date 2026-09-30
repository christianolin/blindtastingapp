import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha256hex } from "../wine-map-tiles/lib.mjs";
import { buildReports, loadInputs, reportPath, STATE_FILES, SUMMARY_PATH, summaryMarkdown } from "./build-usa-tree-reports.mjs";
import { buildUsaTree } from "./usa-tree.mjs";

const lf = (s) => s.replace(/\r\n/g, "\n");

test("the committed reports are exactly what the committed inputs build", async () => {
  const inputs = await loadInputs();
  const tree = buildUsaTree({ avas: inputs.avas, pairs: inputs.pairs, config: inputs.config });
  const reports = buildReports({ tree, diff: inputs.diff, inputs: inputs.inputs });
  for (const [slug, report] of Object.entries(reports)) {
    assert.equal(lf(await readFile(reportPath(slug), "utf8")), `${JSON.stringify(report, null, 2)}\n`, slug);
  }
  assert.equal(lf(await readFile(SUMMARY_PATH, "utf8")), summaryMarkdown(tree, reports));
});

test("the measurement was taken on the committed artifacts", async () => {
  const m = JSON.parse(await readFile("data/wine-map/usa-measurements.json", "utf8"));
  for (const [path, sha] of Object.entries(m._inputs)) {
    assert.equal(sha256hex(await readFile(path)), sha, `${path} changed since it was measured`);
  }
});

test("US-0 acceptance: every AVA's map state, land share and parent; the named breadcrumbs", async () => {
  const all = [];
  for (const slug of Object.values(STATE_FILES)) {
    const report = JSON.parse(await readFile(reportPath(slug), "utf8"));
    for (const p of report.places.filter((x) => x.ucd_ava_id)) {
      assert.ok(p.map_state && typeof p.land_share === "number" && p.parent_key, p.key);
      all.push(p);
    }
  }
  const byName = (n) => all.find((p) => p.name === n);
  const rocks = byName("The Rocks District of Milton-Freewater");
  assert.ok(rocks && rocks.map_state === "OR" && rocks.key.startsWith("united-states.oregon."), "Rocks District under Oregon");
  const gorge = byName("Columbia Gorge");
  assert.ok(gorge && gorge.map_state === "OR" && gorge.map_state_source === "override", "Columbia Gorge = Oregon (owner)");
  assert.ok(byName("Walla Walla Valley")?.breadcrumb, "Walla Walla Valley has a breadcrumb");
});

test("state edges only to a state TTB lists: no Oregon parent for Washington-only AVAs", async () => {
  const ttb = new Map(JSON.parse(await readFile("data/wine-map/usa-ava-ttb-list.json", "utf8")).avas.map((t) => [t.name, t.states]));
  for (const slug of Object.values(STATE_FILES)) {
    const report = JSON.parse(await readFile(reportPath(slug), "utf8"));
    const byKey = new Map(report.places.map((p) => [p.key, p]));
    for (const e of report.edges.filter((x) => x.basis === "state_share")) {
      const p = byKey.get(e.source_key);
      const target = Object.entries(STATE_FILES).find(([, s]) => e.target_key === `united-states.${s}`)[0];
      assert.ok(ttb.get(p.name).includes(target), `${p.name} -> ${target}: not a TTB state`);
    }
    for (const p of report.places.filter((x) => x.ucd_ava_id)) {
      assert.ok(ttb.get(p.name)?.includes(p.map_state), `${p.name}: map state ${p.map_state} is not a TTB state`);
    }
  }
  const wa = JSON.parse(await readFile(reportPath("washington"), "utf8"));
  const oregonParents = wa.edges.filter((e) => e.target_key === "united-states.oregon").map((e) => e.source_key.split(".").at(-1)).sort();
  assert.deepEqual(oregonParents, ["columbia-valley", "walla-walla-valley"]);
});

const allReports = async () => Promise.all(Object.values(STATE_FILES).map(async (s) => JSON.parse(await readFile(reportPath(s), "utf8"))));

test("owner 2026-09-29: the 25 legal-record pairs nest; nothing is left almost-within", async () => {
  const reports = await allReports();
  const nests = reports.flatMap((r) => r.review.legal_record_nests);
  assert.equal(nests.length, 25);
  assert.deepEqual(reports.flatMap((r) => r.review.near_within), []);
  const places = reports.flatMap((r) => r.places);
  const keyOf = (n) => places.find((p) => p.name === n)?.key;
  assert.equal(keyOf("Sta. Rita Hills"), "united-states.california.central-coast.santa-ynez-valley.sta-rita-hills");
  assert.equal(keyOf("Creston District"), "united-states.california.central-coast.paso-robles.creston-district");
  assert.equal(keyOf("McMinnville"), "united-states.oregon.willamette-valley.mcminnville");
  assert.equal(keyOf("Suisun Valley"), "united-states.california.north-coast.suisun-valley");
  assert.equal(keyOf("San Francisco Bay"), "united-states.california.central-coast.san-francisco-bay");
  assert.equal(keyOf("Santa Clara Valley"), "united-states.california.central-coast.san-francisco-bay.santa-clara-valley");
  assert.equal(keyOf("Lake Chelan"), "united-states.washington.columbia-valley.lake-chelan");
  assert.equal(keyOf("Elkton Oregon"), "united-states.oregon.southern-oregon.umpqua-valley.elkton-oregon");
  for (const p of places.filter((x) => x.parent_basis === "legal_record")) {
    assert.ok(p.parent_inside >= 0.9 && p.parent_inside < 0.995, `${p.key} ${p.parent_inside}`);
  }
  for (const p of places.filter((x) => x.parent_basis === "measured")) assert.ok(p.parent_inside >= 0.995, p.key);
  assert.equal(places.filter((x) => x.parent_basis === "legal_record").length, 21);
});

test("owner 2026-09-29: Central Valley holds 11 members; Tehachapi Mountains and Squaw Valley-Miramonte sit under California", async () => {
  const ca = JSON.parse(await readFile(reportPath("california"), "utf8"));
  const members = ca.places.filter((p) => p.parent_key === "united-states.california.central-valley").map((p) => p.name).sort();
  assert.deepEqual(members, ["Capay Valley", "Clarksburg", "Diablo Grande", "Dunnigan Hills", "Lodi", "Madera",
    "Paulsell Valley", "River Junction", "Salado Creek", "Tracy Hills", "Winters Highlands"]);
  for (const n of ["Tehachapi Mountains", "Squaw Valley-Miramonte"]) {
    assert.equal(ca.places.find((p) => p.name === n).parent_key, "united-states.california", n);
  }
});

test("no OVERLAPS edge joins a place to its own ancestor; Contra Costa's, Candy Mountain's and Red Hill's are listed for review", async () => {
  const reports = await allReports();
  for (const r of reports) {
    const byKey = new Map(r.places.map((p) => [p.key, p]));
    const ancestors = (k) => { const out = []; let p = byKey.get(k); while (p?.parent_key) { out.push(p.parent_key); p = byKey.get(p.parent_key); } return out; };
    for (const e of r.edges.filter((x) => x.type === "OVERLAPS")) {
      assert.ok(!ancestors(e.source_key).includes(e.target_key) && !ancestors(e.target_key).includes(e.source_key), `${e.source_key} ~ ${e.target_key}`);
    }
  }
  assert.deepEqual(reports.flatMap((r) => r.review.ancestor_overlaps).map((x) => [x.name, x.ancestor, x.ratio]),
    [["Contra Costa", "Central Coast", 0.3367], ["Contra Costa", "San Francisco Bay", 0.3363],
      ["Candy Mountain", "Yakima Valley", 0.8931], ["Red Hill Douglas County, Oregon", "Southern Oregon", 0.6775]]);
});

test("US-3 review fixes 2026-09-30: the legal record over the outlines (Comptche, Contra Costa)", async () => {
  const reports = await allReports();
  const ca = reports.find((r) => r.state === "CA");
  const p = (n) => ca.places.find((x) => x.name === n);
  // 27 CFR 9.292: Comptche is not within North Coast, although the outline covers it.
  assert.equal(p("Comptche").key, "united-states.california.comptche");
  assert.deepEqual(ca.review.legal_exclusions.map((x) => [x.name, x.excluded_from, x.ratio]), [["Comptche", "North Coast", 1]]);
  assert.deepEqual(ca.edges.filter((e) => [e.source_key, e.target_key].includes(p("Comptche").key)), []);
  // T.D. TTB-191: San Francisco Bay and Central Coast were expanded to take in Contra Costa.
  assert.equal(p("Contra Costa").key, "united-states.california.central-coast.san-francisco-bay.contra-costa");
  assert.deepEqual(ca.review.parent_overrides.map((x) => [x.name, x.parent_key, x.parent_basis, x.parent_inside]),
    [["Contra Costa", "united-states.california.central-coast.san-francisco-bay", "override", 0.336329]]);
  assert.deepEqual(reports.filter((r) => !["CA", "WA"].includes(r.state)).flatMap((r) => [...r.review.legal_exclusions, ...r.review.parent_overrides]), []);
});

test("counts per state after the owner's decisions", async () => {
  const got = Object.fromEntries((await allReports()).map((r) => [r.state, [r.counts.places, r.counts.edges.ALTERNATE_PARENT ?? 0, r.counts.edges.OVERLAPS ?? 0, r.counts.outline]]));
  assert.deepEqual(got, { CA: [156, 2, 25, 6], WA: [19, 2, 0, 2], OR: [21, 3, 0, 2], NY: [11, 0, 0, 2] });
});

test("US-4 plan 2026-09-30: the legal record over the outlines (Candy Mountain in Yakima Valley, not overlapping Goose Gap)", async () => {
  const wa = (await allReports()).find((r) => r.state === "WA");
  const p = (n) => wa.places.find((x) => x.name === n);
  const yv = "united-states.washington.columbia-valley.yakima-valley";
  // T.D. TTB-163: Candy Mountain "will remain part of both the established Columbia Valley AVA and the Yakima Valley AVA".
  assert.equal(p("Candy Mountain").key, `${yv}.candy-mountain`);
  assert.deepEqual([p("Candy Mountain").display_tier, p("Candy Mountain").min_zoom, p("Candy Mountain").label_min_zoom], [4, 7, 9]);
  assert.deepEqual(wa.review.parent_overrides.map((x) => [x.name, x.parent_key, x.parent_basis, x.parent_inside]),
    [["Candy Mountain", yv, "override", 0.893096]]);
  assert.match(wa.review.parent_overrides[0].rule, /T.D. TTB-163/);
  // FR 2021-14047: Goose Gap "does not overlap any other existing or proposed AVA".
  assert.deepEqual(wa.review.legal_exclusions.map((x) => [x.name, x.excluded_from, x.ratio]), [["Candy Mountain", "Goose Gap", 0.0134]]);
  assert.deepEqual(wa.edges.filter((e) => e.type === "OVERLAPS"), []);
  assert.deepEqual(wa.edges.map((e) => [e.source_key.split(".").at(-1), e.target_key]).sort(),
    [["columbia-valley", "united-states.oregon"], ["walla-walla-valley", "united-states.oregon"]]);
});

test("US-4 plan 2026-09-30: the rebuild moved nothing in California", async () => {
  const ca = (await allReports()).find((r) => r.state === "CA");
  assert.deepEqual([ca.places.length, ca.edges.length], [157, 27]);
  assert.equal(ca.places.find((x) => x.name === "Contra Costa").key, "united-states.california.central-coast.san-francisco-bay.contra-costa");
});
