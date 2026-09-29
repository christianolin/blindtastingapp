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
