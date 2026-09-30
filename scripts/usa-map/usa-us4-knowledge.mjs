// US-4 knowledge (spec §10, §18): US-3's rule (validateUs3Profiles) plus the
// new-grape allow-list (plan decision 8), the signature-grape lead check
// (§10.3, decision 9), and one review file per state (each well under §18's 40
// places).
import {
  BY_HAND_CHIPS, panelGrapes, shortlistDemotions, shortlistRanks, shortlistSurfaces, STYLE_LABELS,
} from "./usa-knowledge.mjs";
import { validateUs3Profiles } from "./usa-us3-knowledge.mjs";

// Hybrids a listed source names as a place's grape. Never a labrusca: spec
// §10.1 lists Concord "only if the owner wants a labrusca listed".
export const US4_NEW_GRAPES = Object.freeze(["Baco Noir", "Frontenac", "La Crescent", "Marquette", "Seyval Blanc", "Vidal Blanc"]);
const LABRUSCA = /^(concord|niagara|catawba|delaware|diamond|isabella)$/i;
// §10.3: the state's shortlist still leads with its signature grape (§25 grape roles).
export const SIGNATURE_LEADS = Object.freeze({
  "united-states.washington": Object.freeze({ grape: "Cabernet Sauvignon", alone: false }),
  "united-states.oregon": Object.freeze({ grape: "Pinot Noir", alone: true }),
  "united-states.new-york": Object.freeze({ grape: "Riesling", alone: true }),
});

export function validateUs4Profiles(source, wave) {
  const problems = validateUs3Profiles(source, wave);
  const used = new Set(Object.values(source?.places ?? {}).flatMap((p) => (p.grapes ?? []).map((g) => g.name)));
  for (const g of source?.new_grapes ?? []) {
    if (LABRUSCA.test(g.name)) problems.push(`new grape ${g.name}: a labrusca needs the owner's say (spec §10.1)`);
    else if (!US4_NEW_GRAPES.includes(g.name)) problems.push(`new grape ${g.name}: not on the US-4 allow-list`);
    if (!used.has(g.name)) problems.push(`new grape ${g.name}: no place lists it`);
    if (!g.skin_color) problems.push(`new grape ${g.name}: skin_color`);
    if (!(g.sources ?? []).some((s) => /^https:\/\//.test(s.url ?? ""))) problems.push(`new grape ${g.name}: at least one https source`);
  }
  return problems;
}

/** The grapes tied at the top of a state's shortlist: signature (PRINCIPAL) links first, most-linked first. */
export function shortlistTop(source, stateKey) {
  const ranks = [...shortlistRanks(source, stateKey)].sort(([a, x], [b, y]) =>
    (x.bucket === y.bucket ? y.count - x.count : x.bucket === "principal" ? -1 : 1) || a.localeCompare(b));
  if (!ranks.length) return [];
  const [, lead] = ranks[0];
  return ranks.filter(([, r]) => r.bucket === lead.bucket && r.count === lead.count).map(([g]) => g);
}

export function signatureLeadProblems(source) {
  const out = [];
  for (const [key, want] of Object.entries(SIGNATURE_LEADS)) {
    const top = shortlistTop(source, key);
    if (!top.includes(want.grape)) out.push(`${key}: the shortlist leads with ${top.join(", ") || "nothing"}, not ${want.grape}`);
    else if (want.alone && top.length > 1) out.push(`${key}: ${want.grape} ties at the top with ${top.filter((g) => g !== want.grape).join(", ")}`);
  }
  return out;
}

export function us4ReviewMarkdown({ source, wave, state, allSource, rehearsal }) {
  const places = wave.places.filter((p) => p.key.startsWith(`${state.key}.`));
  const approved = source._provenance?.status === "APPROVED";
  const L = [`# United States, US-4, ${state.name}: knowledge`, ""];
  L.push(approved
    ? "**Status: APPROVED under the owner's waiver of 2026-09-30** (\"no need for my review\"). This file is the readable record of what the knowledge migration applies; the copy is provisional until the main session's live check."
    : "**Status: DRAFT, provisional copy.** Nothing here is live.", "");
  L.push(`Places: ${places.length} of the wave's ${wave.places.length}. Sources are listed under each place; figures appear only where a source publishes them.`, "");
  for (const place of places) {
    const p = source.places[place.key];
    const a = p.article;
    L.push(`## ${place.breadcrumb}`, "");
    L.push(`Name: **${place.name}** · key \`${place.key}\` · AVA`, "");
    L.push(`**Description.** ${a.description}`, "", `**Climate.** ${a.climate}`, "", `**Soils.** ${a.soils}`, "");
    L.push(`**Grape varieties (text).** ${a.grape_varieties}`, "", `**Wine styles (text).** ${a.wine_styles}`, "");
    L.push("**Key facts**", "");
    for (const f of a.key_facts) L.push(`- ${f}`);
    L.push("", "**Grapes**, as the details panel lists them (signature grapes first, then the ones it tags \"accessory\"; each group alphabetically):", "");
    for (const g of panelGrapes(p.grapes)) {
      L.push(`- ${g.name}${g.note ? ` (${g.note})` : ""}${(g.role ?? "PRINCIPAL") === "ACCESSORY" ? " · accessory" : ""}`);
    }
    L.push("", `**Styles:** ${p.styles.map((s) => STYLE_LABELS[s]).join(", ")}`, "", "**Sources**", "");
    for (const s of p.sources) L.push(`- ${s.title}: ${s.url}`);
    L.push("");
  }
  const named = new Set(places.flatMap((pl) => source.places[pl.key].grapes.map((g) => g.name)));
  const fresh = (source.new_grapes ?? []).filter((g) => named.has(g.name));
  if (fresh.length) {
    L.push("## New grapes for the catalog", "", "The knowledge migration adds them to the shared grape list; from then on every grape picker offers them (CLAUDE.md, F9).", "");
    for (const g of fresh) L.push(`- **${g.name}** (${g.color.toLowerCase()}; skin ${g.skin_color}): ${g.description}`);
    L.push("");
  }
  const s = rehearsal?.shortlist?.[state.name];
  if (s) {
    L.push(`## Grape shortlist change for ${state.name} (spec §10.3)`, "");
    L.push(`Measured in the rolled-back rehearsal of ${rehearsal.rehearsed_at.slice(0, 10)}, as a signed-in reader. "Before" is the live list before US-4; "after" includes it. After a grape: the number of ${state.name} places that list it as a signature grape ("accessory" when it is one nowhere). The by-hand form shows at most ${BY_HAND_CHIPS} chips.`, "");
    const ranks = shortlistRanks(allSource, state.key);
    const rankOf = (g) => ranks.get(g);
    const label = (g) => { const r = rankOf(g); return r ? `${g} (${r.count}${r.bucket === "accessory" ? ", accessory" : ""})` : g; };
    const after = shortlistSurfaces(s.after, s.colours ?? {}, rankOf);
    const before = shortlistSurfaces(s.before, s.colours ?? {}, null);
    const row = (x) => `${x.shown.join(", ") || "none"}${x.tiedAtCut.length ? `; the last chip is one of ${x.tiedAtCut.join(", ")} (tied)` : ""}`;
    L.push("| Surface | Before | After |", "|---|---|---|");
    L.push(`| Guess ladder (the whole list) | ${s.before.join(", ")} | ${s.after.map(label).join(", ")} |`);
    L.push(`| By-hand chips, no colour yet | ${row(before.none)} | ${row(after.none)} |`);
    L.push(`| By-hand chips, red | ${row(before.red)} | ${row(after.red)} |`);
    L.push(`| By-hand chips, white | ${row(before.white)} | ${row(after.white)} |`, "");
    const own = allSource.places[state.key].grapes;
    const d = shortlistDemotions(own, s.after, rankOf);
    L.push(`Against ${state.name}'s own list (its first three: ${own.slice(0, 3).map((g) => g.name).join(", ")}): ${d.length ? `${d.join("; ")}.` : "none moves down or drops."}`, "");
  }
  const near = Object.entries(rehearsal?.nearby ?? {}).filter(([k]) => k.startsWith(`${state.key}.`));
  if (near.length) {
    L.push("## Nearby chips (spec §8.7)", "", "The details panel's five nearby chips for these places, as a signed-in reader, after the promote. Containers and overlapping AVAs score distance 0; the main session accepts or defers (§20).", "");
    for (const [key, list] of near) L.push(`- \`${key}\`: ${list.join(", ") || "none"}`);
    L.push("");
  }
  const w = rehearsal?.archetypes;
  if (w && w.home?.startsWith(`${state.key}.`)) {
    L.push("## Typical wine", "", `${w.name} stays at home on \`${w.home}\`, placed on ${w.placements.map((k) => `\`${k}\``).join(" and ")}: spec §14.2 names no change for it in US-4.`, "");
  }
  return `${L.join("\n")}\n`;
}
