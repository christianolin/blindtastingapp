// US-3 knowledge (spec §10, §18): validateUsaProfiles plus the stricter US-3
// rule (plan 2026-09-30 decision 12), the wave-order helper, and the review
// file renderer (one part per at most 40 places, §18).
import { CA_KEY } from "./us3-wave.mjs";
import {
  BY_HAND_CHIPS, panelGrapes, shortlistDemotions, shortlistRanks, shortlistSurfaces, STYLE_LABELS, validateUsaProfiles,
} from "./usa-knowledge.mjs";

export const ESTABLISHED = /^Established (\d{4}) \(27 CFR (9\.\d+)\)$/;
export const LEGAL_SOURCE = /(ecfr\.gov|law\.cornell\.edu\/cfr|federalregister\.gov|govinfo\.gov|regulations\.gov)/;
const MAX_DESCRIPTION = 700;
const MAX_GRAPES = 8;
const MAX_PRINCIPAL = 3;

export function validateUs3Profiles(source, wave) {
  const problems = validateUsaProfiles(source, wave);
  if (source?._provenance?.wave !== wave.name) problems.push(`_provenance.wave must be ${wave.name}`);
  const ucd = new Map(wave.ucd.map((u) => [u.key, u]));
  const seen = new Map();
  for (const place of wave.places) {
    const p = source?.places?.[place.key];
    if (!p) continue;
    const k = place.key;
    const a = p.article ?? {};
    const u = ucd.get(k);
    const est = (a.key_facts ?? []).map((f) => ESTABLISHED.exec(f)).filter(Boolean);
    if (est.length !== 1) problems.push(`${k}: exactly one key fact "Established YYYY (27 CFR 9.N)"`);
    else if (est[0][1] !== u.established.slice(0, 4) || est[0][2] !== u.cfr_section) {
      problems.push(`${k}: "${est[0][0]}" disagrees with TTB (${u.established.slice(0, 4)}, 27 CFR ${u.cfr_section})`);
    }
    if ((a.description ?? "").length > MAX_DESCRIPTION) problems.push(`${k}: description over ${MAX_DESCRIPTION} characters`);
    const grapes = p.grapes ?? [];
    if (grapes.length > MAX_GRAPES) problems.push(`${k}: more than ${MAX_GRAPES} grapes`);
    if (grapes.filter((g) => (g.role ?? "PRINCIPAL") === "PRINCIPAL").length > MAX_PRINCIPAL) {
      problems.push(`${k}: more than ${MAX_PRINCIPAL} signature grapes`);
    }
    const sources = p.sources ?? [];
    if (sources.length < 2) problems.push(`${k}: at least two sources`);
    if (!sources.some((s) => LEGAL_SOURCE.test(s.url ?? ""))) problems.push(`${k}: no CFR or Federal Register source`);
    for (const f of ["description", "climate", "soils"]) {
      const t = (a[f] ?? "").trim();
      if (!t) continue;
      if (seen.has(t)) problems.push(`${k}: article.${f} repeats ${seen.get(t)}`);
      else seen.set(t, `${k} ${f}`);
    }
  }
  return problems;
}

/** The same file with its places in wave order; places not in the wave go last (the validator names them). */
export function sortToWaveOrder(source, wave) {
  const order = wave.places.map((p) => p.key);
  const keys = Object.keys(source.places);
  const sorted = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
  return { ...source, places: Object.fromEntries(sorted.map((k) => [k, source.places[k]])) };
}

export const mergeSources = (...sources) => ({ places: Object.assign({}, ...sources.map((s) => s.places)) });

export function us3ReviewMarkdown({ source, wave, keys, part, parts, allSource, rehearsal }) {
  const L = [];
  const approved = source._provenance?.status === "APPROVED";
  L.push(`# United States, US-3 ${wave.batch} batch, part ${part} of ${parts}: knowledge`, "");
  L.push(approved
    ? "**Status: APPROVED under the owner's waiver of 2026-09-30** (\"no need for my review\"). This file is the readable record of what the knowledge migration applies; the copy is provisional until the main session's live check."
    : "**Status: DRAFT, provisional copy.** Nothing here is live.", "");
  L.push(`Places in this part: ${keys.length} of ${wave.places.length}. Sources are listed under each place; figures appear only where a source publishes them.`, "");
  for (const key of keys) {
    const place = wave.places.find((p) => p.key === key);
    const p = source.places[key];
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
  if (part !== parts) return `${L.join("\n")}\n`;
  const s = rehearsal?.shortlist?.California;
  if (s) {
    L.push("## Grape shortlist change for California (spec §10.3)", "");
    L.push(`Measured in the rolled-back rehearsal of ${rehearsal.rehearsed_at.slice(0, 10)}, as a signed-in reader. "Before" is the live list before this batch; "after" includes it. After a grape: the number of California places that list it as a signature grape ("accessory" when it is one nowhere). The by-hand form shows at most ${BY_HAND_CHIPS} chips.`, "");
    const ranks = shortlistRanks(allSource, CA_KEY);
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
    const own = allSource.places[CA_KEY].grapes;
    const d = shortlistDemotions(own, s.after, rankOf);
    L.push(`Against California's own list (its first three: ${own.slice(0, 3).map((g) => g.name).join(", ")}): ${d.length ? `${d.join("; ")}.` : "none moves down or drops."}`, "");
  }
  if (rehearsal?.nearby) {
    L.push("## Nearby chips (spec §8.7)", "", "The details panel's five nearby chips for these places, as a signed-in reader, after the promote. Containers and overlapping AVAs score distance 0; the main session accepts or defers (§20).", "");
    for (const [key, list] of Object.entries(rehearsal.nearby)) L.push(`- \`${key}\`: ${list.join(", ") || "none"}`);
    L.push("");
  }
  const dots = rehearsal?.archetypes?.dots;
  if (dots?.length) {
    L.push("## Typical wines on the training-room map", "", "| Typical wine | Linked to | Dot before | Dot after | Moves |", "|---|---|---|---|---|");
    const pt = (x) => (x && x[0] != null ? `${x[0]}, ${x[1]}` : "none");
    for (const x of dots) L.push(`| ${x.name} | \`${x.home}\` | ${pt(x.before)} | ${pt(x.after)} | ${x.moved_km != null ? `${x.moved_km} km` : "n/a"} |`);
    L.push("");
  }
  return `${L.join("\n")}\n`;
}
