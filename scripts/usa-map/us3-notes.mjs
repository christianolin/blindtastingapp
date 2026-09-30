// The US-3 research fact sheet and tree review (spec §15 US-3 "the tree
// report is reviewed"), rendered from committed files only.
export const pct = (r) => `${(Number(r) * 100).toFixed(2)}%`;
const short = (k) => k.replace(/^united-states\.california\./, "");

export function factSheetMarkdown({ waves, tree, props }) {
  const L = ["# US-3 fact sheet: California's AVAs", "",
    "Rendered by `scripts/usa-map/render-us3-notes.mjs` from the California tree report, UC Davis's county field and TTB's list. The starting point for the knowledge research (plan Tasks 6–14): every key fact \"Established YYYY (27 CFR 9.N)\" must match this sheet. Areas are the UC Davis digitization's, not a legal figure.", ""];
  for (const [label, w] of [["Core batch", waves.core], ["Rest batch", waves.rest]]) {
    L.push(`## ${label} (${w.places.length} places)`, "",
      "| Key | Name | CFR | Established | Counties | Area km² | Parent (basis, inside) | Edges |", "|---|---|---|---|---|---|---|---|");
    for (const p of w.places) {
      const u = w.ucd.find((x) => x.key === p.key);
      const c = w.parentChecks.find((x) => x.key === p.key);
      const parent = `${short(p.parent_key)}${c ? ` (${c.basis}, ${pct(c.tree_inside)})` : ""}`;
      const edges = tree.edges.filter((e) => e.source_key === p.key || e.target_key === p.key)
        .map((e) => `${e.type} ${short(e.source_key === p.key ? e.target_key : e.source_key)}${e.ratio != null ? ` ${pct(e.ratio)}` : ""}`).join("; ");
      L.push(`| \`${p.key}\` | ${p.name} | ${u.cfr_section} | ${u.established} | ${(props.get(p.ucd_ava_id)?.county ?? "").split("|").join(", ")} | ${Math.round(p.area_km2)} | ${parent} | ${edges || "none"} |`);
    }
    L.push("");
  }
  return `${L.join("\n")}\n`;
}

export function treeReviewMarkdown({ waves, tree }) {
  const byName = new Map(tree.places.map((p) => [p.name, p]));
  const L = ["# US-3 tree review: what the promotes lock", "",
    "Rendered by `scripts/usa-map/render-us3-notes.mjs` from `data/wine-map/usa-california-tree.json`. Keys lock at each batch's promote (spec §8.3). The tree decides (spec D7): a place nests in an AVA only when ≥ 99.5% of it measures inside, or ≥ 90% when UC Davis's `within` names that AVA. Each case below is where UC Davis names a container the tree does not nest the place in; it gets an `OVERLAPS` edge instead when more than 1% overlaps. Changing one needs a `parent_overrides` or `legal_exclusions` entry in `usa-tree-config.json` and re-committed tree reports before that batch's catalog renders.", ""];
  for (const [label, w] of [["Core batch", waves.core], ["Rest batch", waves.rest]]) {
    const keys = new Set(w.places.map((p) => p.key));
    L.push(`## ${label} (${w.places.length} places)`, "");
    L.push("### Containers UC Davis names that the tree does not nest in", "");
    for (const d of tree.review.within_disagreements.filter((x) => keys.has(x.key) && x.ucd_within_not_computed.length)) {
      for (const name of d.ucd_within_not_computed) {
        const target = byName.get(name);
        const e = target && tree.edges.find((x) => x.source_key === d.key && x.target_key === target.key);
        const excluded = (tree.review.legal_exclusions ?? []).find((x) => x.key === d.key && x.excluded_from === name);
        const what = !target ? "no California place of that name"
          : excluded ? `the CFR says it is not within (\`legal_exclusions\`; ${pct(excluded.ratio)} measured inside), no edge`
            : e ? `${e.type}${e.ratio != null ? `, ${pct(e.ratio)} inside` : ""}` : "under 1% overlap, no edge";
        L.push(`- ${d.name} (\`${short(d.key)}\`, keyed under ${short(tree.places.find((p) => p.key === d.key).parent_key)}): UC Davis says within ${name}; ${what}.`);
      }
    }
    L.push("", "### Nested by the legal record (90% to 99.5% inside)", "");
    for (const c of w.parentChecks.filter((x) => x.basis === "legal_record")) L.push(`- \`${short(c.key)}\` in \`${short(c.parent_key)}\`: ${pct(c.tree_inside)} inside.`);
    const exclusions = (tree.review.legal_exclusions ?? []).filter((x) => keys.has(x.key));
    const overrides = w.parentChecks.filter((x) => x.basis === "override");
    if (exclusions.length || overrides.length) {
      L.push("", "### The legal record over the outlines (`usa-tree-config.json`)", "");
      for (const x of exclusions) L.push(`- \`${short(x.key)}\` is not within \`${short(x.excluded_from_key ?? x.excluded_from)}\` although ${pct(x.ratio)} of it measures inside: ${x.rule}`);
      for (const c of overrides) {
        const o = (tree.review.parent_overrides ?? []).find((x) => x.key === c.key);
        L.push(`- \`${short(c.key)}\` in \`${short(c.parent_key)}\` by \`parent_overrides\` (${pct(c.tree_inside)} measured inside; the stage and the promote check it at ≥ ${pct(c.min)}): ${o?.rule ?? "no rule recorded"}`);
      }
    }
    L.push("", "### Edges this batch stores", "", "| Type | Source | Target | Ratio |", "|---|---|---|---|");
    for (const e of w.edges) L.push(`| ${e.type} | \`${short(e.source_key)}\` | \`${short(e.target_key)}\` | ${e.ratio != null ? pct(e.ratio) : e.basis} |`);
    L.push("");
    const omissions = tree.review.within_disagreements.filter((x) => keys.has(x.key) && (x.computed_not_in_ucd_within.length || x.unresolved_tokens.length));
    if (omissions.length) {
      L.push("### Where the tree nests more than UC Davis's text says (information only)", "");
      for (const d of omissions) {
        const parts = [];
        if (d.computed_not_in_ucd_within.length) parts.push(`measured inside ${d.computed_not_in_ucd_within.join(", ")}`);
        if (d.unresolved_tokens.length) parts.push(`UC Davis text not matched: ${d.unresolved_tokens.join(", ")}`);
        L.push(`- ${d.name}: ${parts.join("; ")}.`);
      }
      L.push("");
    }
  }
  return `${L.join("\n")}\n`;
}
