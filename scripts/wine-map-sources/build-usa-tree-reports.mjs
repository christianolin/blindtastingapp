// The committed US-0 tree reports (spec 2026-09-29 §5.3, §8.3): keys, parents,
// edges, land and dominance shares per state, and the owner summary. Built
// offline from committed inputs, so usa-tree-reports.test.mjs can prove the
// committed files are exactly what those inputs produce.
//
// Usage: node scripts/wine-map-sources/build-usa-tree-reports.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { sha256hex } from "../wine-map-tiles/lib.mjs";
import { normalizeCfr, splitList, stateCodes } from "./usa-ava-lib.mjs";
import { buildUsaTree, COUNTRY_KEY } from "./usa-tree.mjs";

export const STATE_FILES = { CA: "california", WA: "washington", OR: "oregon", NY: "new-york" };
export const reportPath = (slug) => `data/wine-map/usa-${slug}-tree.json`;
export const SUMMARY_PATH = "data/wine-map/review/usa-us0-tree-summary.md";
const PATHS = {
  measurements: "data/wine-map/usa-measurements.json",
  config: "data/wine-map/usa-tree-config.json",
  diff: "data/wine-map/usa-ava-diff.json",
  ttb: "data/wine-map/usa-ava-ttb-list.json",
  states: "data/wine-map/usa-states-ne50m.geojson",
};

export async function loadInputs() {
  const raw = {};
  for (const [k, p] of Object.entries(PATHS)) raw[k] = await readFile(p);
  const measurements = JSON.parse(raw.measurements.toString("utf8"));
  const config = JSON.parse(raw.config.toString("utf8"));
  const diff = JSON.parse(raw.diff.toString("utf8"));
  const nameToCode = Object.fromEntries(JSON.parse(raw.states.toString("utf8")).features
    .map((f) => [f.properties.name, f.properties.code]));
  const legalName = new Map(diff.matched.map((m) => [m.ucd_id, m.ttb_name]));
  // The legal state list (usa-tree.mjs, "Legal states"): TTB's, by the diff's
  // match; UC Davis's own only for an AVA TTB does not name.
  const ttbStates = new Map(JSON.parse(raw.ttb.toString("utf8")).avas.map((t) => [t.name, t.states]));
  const props = new Map();
  for (const slug of Object.values(STATE_FILES)) {
    const fc = JSON.parse(await readFile(`data/wine-map/usa-${slug}-ava.geojson`, "utf8"));
    for (const f of fc.features) props.set(f.properties.ava_id, f.properties);
  }
  const avas = Object.entries(measurements.avas).map(([id, m]) => {
    const p = props.get(id);
    assert.ok(p, `measured AVA ${id} is in no normalized artifact`);
    const ucdStates = stateCodes(p.state, nameToCode);
    const ttb = legalName.has(id) ? ttbStates.get(legalName.get(id)) : undefined;
    assert.ok(!legalName.has(id) || ttb, `${id}: matched to TTB "${legalName.get(id)}", which the TTB list lacks`);
    return {
      id,
      name: legalName.get(id) ?? p.name,
      area_km2: m.area_km2,
      state_shares: m.state_shares,
      land_share: m.land_share,
      buffered_shares: m.buffered_shares,
      measured_containment: { states: m.containment_states ?? [], share: m.containment_share ?? null },
      legal_states: ttb ? [...ttb].sort() : ucdStates,
      legal_source: ttb ? "ttb" : "ucd",
      counties: splitList(p.county),
      ucd_within: splitList(p.within),
      ucd_contains: splitList(p.contains),
      ucd_states: ucdStates,
      cfr: normalizeCfr(p.cfr_index),
    };
  });
  assert.equal(avas.length, props.size, "every normalized AVA must be measured");
  return {
    avas,
    pairs: measurements.pairs,
    config,
    diff,
    inputs: {
      measurements_sha256: sha256hex(raw.measurements),
      config_sha256: sha256hex(raw.config),
      diff_sha256: sha256hex(raw.diff),
      ttb_list_sha256: sha256hex(raw.ttb),
    },
  };
}

const tally = (list, f) => list.reduce((acc, x) => {
  const k = f(x);
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});

export function buildReports({ tree, diff, inputs }) {
  const stateOfKey = new Map(tree.places.map((p) => [p.key, p.map_state]));
  const stateOfName = new Map(tree.places.filter((p) => p.ucd_ava_id).map((p) => [p.name, p.map_state]));
  const reports = {};
  for (const [code, slug] of Object.entries(STATE_FILES)) {
    const places = tree.places.filter((p) => p.key === COUNTRY_KEY || p.map_state === code);
    const own = places.filter((p) => p.key !== COUNTRY_KEY);
    const keys = new Set(places.map((p) => p.key));
    const edges = tree.edges.filter((e) => stateOfKey.get(e.source_key) === code);
    reports[slug] = {
      _generated_by: "scripts/wine-map-sources/build-usa-tree-reports.mjs",
      _spec: "docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §8.3",
      _inputs: inputs,
      state: code,
      state_key: `${COUNTRY_KEY}.${slug}`,
      thresholds: tree.thresholds,
      counts: {
        places: own.length,
        by_kind: tally(own, (p) => p.kind),
        by_tier: tally(own, (p) => String(p.display_tier)),
        outline: own.filter((p) => p.display === "outline").length,
        edges: tally(edges, (e) => e.type),
      },
      places,
      edges,
      deferred: tree.deferred.filter((d) => d.legal_states.includes(code)),
      deferred_edges: tree.deferred_edges.filter((e) => stateOfName.get(e.source) === code),
      ttb_only_pending: diff.ttb_only.filter((t) => t.states.includes(code)),
      review: Object.fromEntries(Object.entries(tree.review).map(([k, list]) => [k, list.filter((r) => keys.has(r.key))])),
    };
  }
  return reports;
}

export function summaryMarkdown(tree, reports) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const shares = (s) => Object.entries(s).map(([c, v]) => `${c} ${pct(v)}`).join(", ");
  const listOrNone = (lines) => (lines.length ? lines : ["- none"]);
  const L = [];
  L.push("# USA on the map: US-0 tree summary", "");
  L.push("Generated by `scripts/wine-map-sources/build-usa-tree-reports.mjs` from the committed measurements. Do not hand-edit. Keys lock at each wave's promote, so this is the moment to disagree with a placement.", "");
  L.push("## Places per state", "", "| State | Places | Umbrellas and nodes | Outline-only | ALTERNATE_PARENT | OVERLAPS |", "|---|---:|---|---:|---:|---:|");
  for (const r of Object.values(reports)) {
    const subs = r.places.filter((p) => p.kind === "SUBREGION").map((p) => p.name).join(", ");
    L.push(`| ${r.state} | ${r.counts.places} | ${subs} | ${r.counts.outline} | ${r.counts.edges.ALTERNATE_PARENT ?? 0} | ${r.counts.edges.OVERLAPS ?? 0} |`);
  }
  L.push("", "## Breadcrumbs to accept before the keys lock", "");
  for (const name of ["Walla Walla Valley", "The Rocks District of Milton-Freewater", "Columbia Gorge"]) {
    const p = tree.places.find((x) => x.name === name);
    L.push(p
      ? `- **${name}**: ${p.breadcrumb} (\`${p.key}\`; map state ${p.map_state}, ${p.map_state_source}; land shares ${shares(p.state_shares)})`
      : `- **${name}**: not placed in wave 1 (see "Deferred")`);
  }
  L.push("", "## Cross-state AVAs", "", "An AVA is cross-state when TTB lists more than one state for it. Only those states get a state edge or a say in the map state.", "");
  L.push("| AVA | Map state | TTB states | Measured land shares | State edges |", "|---|---|---|---|---|");
  for (const p of tree.places.filter((x) => x.legal_states && x.legal_states.length > 1)) {
    const legalShares = Object.fromEntries(p.legal_states.map((c) => [c, p.state_shares[c] ?? 0]));
    const stateEdges = tree.edges.filter((e) => e.source_key === p.key && e.basis === "state_share")
      .map((e) => e.target_key.split(".")[1]).join(", ") || "none (under 0.5%)";
    L.push(`| ${p.name} | ${p.map_state} (${p.map_state_source}) | ${p.legal_states.join(", ")} | ${shares(legalShares)} | ${stateEdges} |`);
  }
  L.push("", "## State shares that are map artifacts (no edge, no say in the map state)", "");
  L.push("The Natural Earth 1:50m state line is coarse: along the Columbia River it sits several km off the river, so it measures Oregon land inside AVAs that TTB and UC Davis both place in Washington alone. A share in a state TTB does not list is that artifact. It is withheld: no ALTERNATE_PARENT edge, and it is left out when the map state is picked.", "");
  const artifacts = tree.review.state_list_disagreements.filter((r) => r.withheld_states.length > 0);
  if (artifacts.length === 0) L.push("- none");
  else {
    L.push("| AVA | TTB states | Map state | Withheld measured shares | Would have been a state edge |", "|---|---|---|---|---|");
    for (const r of artifacts) {
      const edgeLike = r.withheld_states.filter((w) => w.share >= tree.thresholds.stateEdgeMin).map((w) => w.state).join(", ") || "no (under 0.5%)";
      L.push(`| ${r.name} | ${r.legal_states.join(", ")} | ${r.map_state} | ${r.withheld_states.map((w) => `${w.state} ${pct(w.share)}`).join(", ")} | ${edgeLike} |`);
    }
  }
  L.push("", "## Central Valley (a grouping on this map, not an AVA)", "");
  L.push(...listOrNone(tree.places.filter((x) => x.parent_key === "united-states.california.central-valley").map((p) => `- ${p.name}`)));
  L.push("", "## Outline-only places (5,000 km² or more, plus Central Valley)", "");
  L.push(...listOrNone(tree.places.filter((x) => x.display === "outline")
    .map((p) => `- ${p.name}${p.area_km2 === null ? " (grouping)" : `: ${Math.round(p.area_km2).toLocaleString("en-US")} km²`}`)));
  L.push("", "## Deferred to a later state's wave", "");
  L.push(...listOrNone(tree.deferred.map((d) => `- ${d.name}: ${d.reason} (${shares(d.state_shares)})`)));
  L.push("", "## TTB AVAs with no UC Davis outline yet (US-5)", "");
  const pending = [...new Map(Object.values(reports).flatMap((r) => r.ttb_only_pending).map((t) => [t.name, t])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  L.push(...listOrNone(pending.map((t) => `- ${t.name} (${t.states.join(", ")}; 27 CFR ${t.cfr ?? "section unknown"})`)));
  L.push("", `## Nested by the legal record (UC Davis "within" and at least ${pct(tree.thresholds.withinLegalRecord)} inside)`, "");
  L.push("Owner decision 2026-09-29 (\"Legal record + >=90% inside\"): an AVA nests in a container UC Davis's `within` names when at least 90% of it measures inside, so a digitizing sliver no longer overrules the law. \"Primary\" means the container is the place's parent; otherwise it is a higher ancestor or an ALTERNATE_PARENT.", "");
  if (tree.review.legal_record_nests.length === 0) L.push("- none");
  else {
    L.push("| AVA | Now at | Container | Measured inside | Primary |", "|---|---|---|---:|---|");
    for (const r of tree.review.legal_record_nests) {
      L.push(`| ${r.name} | \`${r.key}\` | ${r.container} | ${(r.ratio * 100).toFixed(2)}% | ${r.primary ? "yes" : "no"} |`);
    }
  }
  L.push("", `## Almost within (${pct(tree.thresholds.nearWithinReview)} to ${pct(tree.thresholds.within)}), UC Davis silent: placed as NOT within`, "");
  L.push("A pair here got an OVERLAPS edge, not a parent: UC Davis's `within` does not name the container, so the legal-record rule does not apply.", "");
  if (tree.review.near_within.length === 0) L.push("- none");
  else {
    L.push("| AVA | Placed at | Container | Measured inside |", "|---|---|---|---:|");
    for (const r of tree.review.near_within) L.push(`| ${r.name} | \`${r.key}\` | ${r.container} | ${(r.ratio * 100).toFixed(2)}% |`);
  }
  L.push("", "## The legal record over the outlines (usa-tree-config.json)", "");
  L.push("A `legal_exclusions` pair is one the CFR says does not nest although the outlines do: no parent, no ALTERNATE_PARENT and no OVERLAPS edge. A `parent_overrides` place is keyed under the named AVA whatever the outlines measure (basis `override`). Keys lock at each wave's promote.", "");
  L.push(...listOrNone([
    ...tree.review.legal_exclusions.map((r) => `- ${r.name} is not within ${r.excluded_from} (${(r.ratio * 100).toFixed(2)}% measured inside; keyed \`${r.key}\`): ${r.rule}`),
    ...tree.review.parent_overrides.map((r) => `- ${r.name} keyed under \`${r.parent_key}\` (${r.parent_inside === null ? "never measured" : `${(r.parent_inside * 100).toFixed(2)}% measured inside`}): ${r.rule ?? "no rule recorded"}`),
  ]));
  L.push("", "## Overlaps with a place's own ancestor (no edge stored)", "");
  L.push("The tree already nests the place under this ancestor (through a smaller AVA, or by a `parent_overrides` entry), so an OVERLAPS edge would contradict it. Listed so the digitizing gap is visible.", "");
  L.push(...listOrNone(tree.review.ancestor_overlaps.map((r) => `- ${r.name} in ${r.ancestor}: ${(r.ratio * 100).toFixed(2)}% measured inside (\`${r.key}\`)`)));
  L.push("", "## For review", "");
  L.push(`- Land share under ${pct(tree.thresholds.landShareReview)}: ${tree.review.low_land_share.map((r) => `${r.key} ${pct(r.land_share)}`).join("; ") || "none"}`);
  L.push(`- State containment under ${pct(tree.thresholds.containmentMin)} (spec §8.2: the threshold is fixed only after these numbers are seen): ${tree.review.low_containment.map((r) => `${r.key} ${pct(r.containment_share)}`).join("; ") || "none"}`);
  L.push(`- UC Davis \`within\`/\`contains\` disagreements: ${tree.review.within_disagreements.length} (listed in each state's report; \`within\` decides only with at least ${pct(tree.thresholds.withinLegalRecord)} measured inside)`);
  L.push(`- Map state where the largest measured share lies outside the legal states (would have been keyed wrongly without the TTB gate): ${tree.review.state_list_disagreements.filter((r) => r.measured_dominant !== r.map_state && !r.legal_states.includes(r.measured_dominant)).map((r) => `${r.name} (measured ${r.measured_dominant}, keyed ${r.map_state})`).join("; ") || "none"}`);
  L.push(`- UC Davis state lists that disagree with TTB's: ${tree.review.state_list_disagreements.filter((r) => r.ucd_states.join(",") !== r.legal_states.join(",")).map((r) => `${r.name} (UC Davis ${r.ucd_states.join("/")}, TTB ${r.legal_states.join("/")})`).join("; ") || "none"}`);
  L.push(`- AVAs whose legal states come from UC Davis because TTB does not name them: ${tree.places.filter((p) => p.legal_source === "ucd").map((p) => p.name).join("; ") || "none"}`);
  return `${L.join("\n")}\n`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const inputs = await loadInputs();
  const tree = buildUsaTree({ avas: inputs.avas, pairs: inputs.pairs, config: inputs.config });
  const reports = buildReports({ tree, diff: inputs.diff, inputs: inputs.inputs });
  for (const [slug, report] of Object.entries(reports)) {
    await writeFile(reportPath(slug), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${reportPath(slug)}: ${report.counts.places} places, ${JSON.stringify(report.counts.edges)}, ${report.deferred.length} deferred`);
  }
  await mkdir("data/wine-map/review", { recursive: true });
  await writeFile(SUMMARY_PATH, summaryMarkdown(tree, reports));
  console.log(`${SUMMARY_PATH} written`);
}
