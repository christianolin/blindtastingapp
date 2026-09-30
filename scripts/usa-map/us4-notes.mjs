// The US-4 research fact sheet and tree review (spec §15 US-4 "as US-3": the
// tree report is reviewed), rendered from committed files only.
import { readFile } from "node:fs/promises";
import { pct } from "./us3-notes.mjs";
import { US4_STATES } from "./us4-wave.mjs";

const short = (k) => k.replace(/^united-states\./, "");
const shares = (s) => Object.entries(s).sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => `${c} ${pct(v)}`).join(", ");

export async function loadProps() {
  const props = new Map();
  for (const slug of ["washington", "oregon", "new-york"]) {
    const fc = JSON.parse(await readFile(`data/wine-map/usa-${slug}-ava.geojson`, "utf8"));
    for (const f of fc.features) props.set(f.properties.ava_id, f.properties);
  }
  return props;
}

export function factSheetMarkdown({ wave, trees, props }) {
  const L = ["# US-4 fact sheet: the AVAs of Washington, Oregon and New York", "",
    "Rendered by `scripts/usa-map/render-us4-notes.mjs` from the three tree reports, UC Davis's county field and TTB's list. The starting point for the knowledge research (plan Tasks 6–8): every key fact \"Established YYYY (27 CFR 9.N)\" must match this sheet. Areas are the UC Davis digitization's, not a legal figure.", ""];
  const allEdges = Object.values(trees).flatMap((t) => t.edges);
  for (const s of wave.states) {
    const list = wave.places.filter((p) => p.key.startsWith(`${s.key}.`));
    L.push(`## ${s.name} (${list.length} places)`, "",
      "| Key | Name | CFR | Established | Counties | TTB states | Area km² | Parent (basis, inside) | Edges |",
      "|---|---|---|---|---|---|---|---|---|");
    for (const p of list) {
      const u = wave.ucd.find((x) => x.key === p.key);
      const c = wave.parentChecks.find((x) => x.key === p.key);
      const parent = `${short(p.parent_key)}${c ? ` (${c.basis}, ${pct(c.tree_inside)})` : ""}`;
      const edges = allEdges.filter((e) => e.source_key === p.key || e.target_key === p.key)
        .map((e) => `${e.type} ${short(e.source_key === p.key ? e.target_key : e.source_key)}${e.share != null ? ` (${pct(e.share)} of its land)` : ""}${e.ratio != null ? ` ${pct(e.ratio)}` : ""}`)
        .join("; ");
      L.push(`| \`${p.key}\` | ${p.name} | ${u.cfr_section} | ${u.established} | ${(props.get(p.ucd_ava_id)?.county ?? "").split("|").join(", ")} | ${p.legal_states.join(", ")} | ${Math.round(p.area_km2)} | ${parent} | ${edges || "none"} |`);
    }
    L.push("");
  }
  return `${L.join("\n")}\n`;
}

export function treeReviewMarkdown({ wave, trees }) {
  const places = Object.values(trees).flatMap((t) => t.places);
  const byKey = new Map(places.map((p) => [p.key, p]));
  const reviews = US4_STATES.map((s) => trees[s.code].review);
  const listOrNone = (lines) => (lines.length ? lines : ["- none"]);
  const L = ["# US-4 tree review: what the promote locks", "",
    "Rendered by `scripts/usa-map/render-us4-notes.mjs` from the Washington, Oregon and New York tree reports. Keys lock at the promote (spec §8.3). An AVA is keyed under its map state, the legal (TTB) state holding most of its land, unless the owner overrode it (D6); it nests in an AVA of the same state when ≥ 99.5% of it measures inside, or ≥ 90% when UC Davis's `within` names that AVA, or by a `parent_overrides` entry citing the legal record (D7, spec §26). Changing any placement needs a config entry and re-committed tree reports before the catalog renders.", ""];

  L.push("## Cross-state AVAs (TTB lists more than one state)", "",
    "| AVA | Keyed | TTB states | Measured land shares | State edges | Wave |", "|---|---|---|---|---|---|");
  for (const c of wave.crossState) {
    const p = byKey.get(c.key);
    L.push(`| ${p.name} | \`${short(p.key)}\` (${p.map_state_source}) | ${p.legal_states.join(", ")} | ${shares(p.state_shares)} | ${c.state_edges.map((k) => short(k)).join(", ") || "none"} | ${wave.priorKeys.includes(p.key) ? "US-2" : "US-4"} |`);
  }

  L.push("", "## Edges this wave stores", "", "| Type | Source | Target | Basis | Figure |", "|---|---|---|---|---|");
  for (const e of wave.edges) {
    const figure = e.share != null ? `${pct(e.share)} of its land` : e.ratio != null ? pct(e.ratio) : "wholly inside";
    L.push(`| ${e.type} | \`${short(e.source_key)}\` | \`${short(e.target_key)}\` | ${e.basis} | ${figure} |`);
  }

  L.push("", "## The legal record over the outlines (usa-tree-config.json)", "");
  L.push(...listOrNone([
    ...reviews.flatMap((r) => r.parent_overrides).map((o) => `- ${o.name} keyed under \`${short(o.parent_key)}\` (override, ${pct(o.parent_inside)} measured inside): ${o.rule}`),
    ...reviews.flatMap((r) => r.legal_exclusions).map((x) => `- ${x.name} and ${x.excluded_from}: no containment and no edge (legal exclusion, ${pct(x.ratio)} measured inside): ${x.rule}`),
  ]));

  L.push("", "## Nested by the legal record (90% to 99.5% inside)", "");
  L.push(...listOrNone(wave.parentChecks.filter((c) => c.basis === "legal_record")
    .map((c) => `- \`${short(c.key)}\` in \`${short(c.parent_key)}\`: ${pct(c.tree_inside)} inside.`)));

  L.push("", "## Overlaps with a place's own ancestor (no edge stored)", "");
  L.push(...listOrNone(reviews.flatMap((r) => r.ancestor_overlaps).map((r) => `- ${r.name} in ${r.ancestor}: ${pct(r.ratio)} measured inside.`)));

  L.push("", "## State shares that are map artifacts (withheld: no edge, no say in the map state)", "",
    "The Natural Earth 1:50m state line runs several km off the Columbia River, so it measures Oregon land inside Washington-only AVAs. The promote's containment check buffers the state outlines by 0.05° and passes them.", "");
  L.push(...listOrNone(reviews.flatMap((r) => r.state_list_disagreements)
    .filter((r) => r.withheld_states.some((w) => w.share >= 0.005))
    .map((r) => `- ${r.name}: ${r.withheld_states.map((w) => `${w.state} ${pct(w.share)}`).join(", ")} (TTB lists ${r.legal_states.join(", ")}).`)));

  L.push("", "## Not in this wave", "");
  L.push(...listOrNone([
    ...US4_STATES.flatMap((s) => trees[s.code].deferred ?? []).map((d) => `- ${d.name}: ${d.reason} (${shares(d.state_shares)}).`),
    ...US4_STATES.flatMap((s) => trees[s.code].ttb_only_pending ?? [])
      .map((t) => `- ${t.name} (${t.states.join(", ")}; 27 CFR ${t.cfr}; established ${t.established}): no UC Davis outline yet (US-5).`),
  ]));

  const notes = reviews.flatMap((r) => r.within_disagreements);
  L.push("", "## UC Davis text the tree does not follow (information only)", "");
  L.push(...listOrNone(notes.map((d) => {
    const parts = [];
    if (d.ucd_within_not_computed.length) parts.push(`UC Davis says within ${d.ucd_within_not_computed.join(", ")}`);
    if (d.computed_not_in_ucd_within.length) parts.push(`measured inside ${d.computed_not_in_ucd_within.join(", ")}`);
    if (d.ucd_contains_not_computed.length) parts.push(`UC Davis says it contains ${d.ucd_contains_not_computed.join(", ")}`);
    return `- ${d.name} (\`${short(d.key)}\`): ${parts.join("; ")}.`;
  })));
  return `${L.join("\n")}\n`;
}
