// US knowledge (spec 2026-09-29 §10, §18): the rules place-profiles-usa.json
// must meet before its migration is generated, and the owner-review file. The
// US rule is stricter than gen-place-profiles-migration.mjs's: all six article
// fields, and grapes AND styles on every place (§8.4 step 3).
import { sq } from "../wine-map-sources/gen-place-profiles-sql.mjs";

export const ARTICLE_FIELDS = ["description", "climate", "soils", "grape_varieties", "wine_styles"];
export const STYLE_LABELS = Object.freeze({
  RED: "Red", WHITE: "White", ROSE: "Rosé", SPARKLING: "Sparkling", SWEET: "Sweet", FORTIFIED: "Fortified",
});
// §18 copy rules: plain English, no praise words, never "official boundary".
export const HYPE = /\b(stunning|world[- ]class|iconic|legendary|breathtaking|spectacular|superb|exceptional|famed|prestigious|finest|greatest|renowned|premier|unrivall?ed|unparalleled|best)\b/i;
export const BOUNDARY_CLAIM = /\b(official|legal) (boundary|boundaries|outline|outlines|border)\b/i;

const firstSentence = (s) => (s.match(/^.*?[.!?](\s|$)/) ?? [s])[0];

export function validateUsaProfiles(source, wave) {
  const problems = [];
  const places = source?.places ?? {};
  const want = wave.places.map((p) => p.key);
  for (const k of want) if (!places[k]) problems.push(`missing: ${k}`);
  for (const k of Object.keys(places)) if (!want.includes(k)) problems.push(`not in the wave: ${k}`);
  const order = Object.keys(places).filter((k) => want.includes(k));
  if (order.join() !== want.filter((k) => places[k]).join()) problems.push("places are not in wave order");
  if (!["DRAFT", "APPROVED"].includes(source?._provenance?.status)) problems.push("_provenance.status must be DRAFT or APPROVED");
  const approval = source?._provenance?.owner_approval;
  if (approval !== null && !(approval?.answer && /^\d{4}-\d{2}-\d{2}$/.test(approval?.date ?? ""))) {
    problems.push("_provenance.owner_approval must be null or {answer, date}");
  }
  for (const g of source?.new_grapes ?? []) {
    if (!g.name || !["RED", "WHITE"].includes(g.color) || !g.description || g.description.length < 40) {
      problems.push(`new grape ${g.name}: name, color RED/WHITE and a 40+ character description`);
    }
  }
  for (const place of wave.places) {
    const p = places[place.key];
    if (!p) continue;
    const k = place.key;
    const a = p.article ?? {};
    for (const f of ARTICLE_FIELDS) {
      if (typeof a[f] !== "string" || a[f].trim().length < 40) problems.push(`${k}: article.${f} missing or under 40 characters`);
    }
    if (!Array.isArray(a.key_facts) || a.key_facts.length < 3 || a.key_facts.length > 6) problems.push(`${k}: 3-6 key facts`);
    for (const f of a.key_facts ?? []) if (typeof f !== "string" || f.length < 10 || f.length > 200) problems.push(`${k}: a key fact must be 10-200 characters`);
    const styles = p.styles ?? [];
    if (styles.length === 0) problems.push(`${k}: at least one style`);
    for (const s of styles) if (!STYLE_LABELS[s]) problems.push(`${k}: bad style ${s}`);
    if (new Set(styles).size !== styles.length) problems.push(`${k}: duplicate style`);
    const grapes = p.grapes ?? [];
    if (grapes.length === 0) problems.push(`${k}: at least one grape`);
    if (new Set(grapes.map((g) => g.name)).size !== grapes.length) problems.push(`${k}: duplicate grape`);
    for (const g of grapes) {
      if (g.share_pct != null && !g.share_source) problems.push(`${k}: share_pct for ${g.name} needs share_source`);
    }
    if (!Array.isArray(p.sources) || p.sources.length === 0) problems.push(`${k}: at least one source`);
    for (const s of p.sources ?? []) if (!s.title || !/^https:\/\//.test(s.url ?? "")) problems.push(`${k}: a source needs a title and an https url`);
    const texts = [...ARTICLE_FIELDS.map((f) => a[f] ?? ""), ...(a.key_facts ?? []), ...grapes.map((g) => g.note ?? "")];
    for (const t of texts) {
      const hype = t.match(HYPE);
      if (hype) problems.push(`${k}: hype word "${hype[0]}"`);
      if (BOUNDARY_CLAIM.test(t)) problems.push(`${k}: boundary claim ("${t.match(BOUNDARY_CLAIM)[0]}")`);
    }
    if (place.navigation_node) {
      const first = firstSentence(a.description ?? "");
      if (!/not an AVA/i.test(first) || !/grouping/i.test(first)) {
        problems.push(`${k}: the first sentence must say it is a grouping on this map, not an AVA`);
      }
    }
  }
  return problems;
}

/** Every article string and every place's grape/style count must be in the migration. */
export function migrationIsCurrent(source, sql) {
  const out = [];
  for (const [key, p] of Object.entries(source.places ?? {})) {
    for (const f of ARTICLE_FIELDS) if (p.article?.[f] && !sql.includes(sq(p.article[f]))) out.push(`${key}: article.${f} is not in the migration`);
    for (const fact of p.article?.key_facts ?? []) if (!sql.includes(sq(fact))) out.push(`${key}: a key fact is not in the migration`);
    const tuple = `(${sq(key)}, ${(p.styles ?? []).length}, ${(p.grapes ?? []).length}, 1)`;
    if (!sql.includes(tuple)) out.push(`${key}: expected counts ${tuple} not in the migration`);
    for (const g of p.grapes ?? []) if (!sql.includes(`where p.canonical_key = ${sq(key)} and g.name = ${sq(g.name)};`)) out.push(`${key}: grape ${g.name} not in the migration`);
  }
  for (const g of source.new_grapes ?? []) if (!sql.includes(sq(g.description))) out.push(`new grape ${g.name}: description not in the migration`);
  return out;
}

export function reviewMarkdown({ source, wave, rehearsal }) {
  const L = [];
  L.push("# United States, wave US-2: knowledge for the owner's review", "");
  L.push("**Status: DRAFT, provisional copy.** Nothing here is live. The places are DRAFT until the US-2 promote, and this text applies only after your OK (spec D19).", "");
  L.push("Reply **OK**, or quote a section heading and give the line-level correction. Corrections go into `data/wine-map/place-profiles-usa.json`, and the knowledge migration is regenerated from it.", "");
  L.push(`Places: ${wave.places.length}. Sources are listed under each place; figures appear only where a source publishes them.`, "");
  if ((source._owner_questions ?? []).length) {
    L.push("## Questions for you", "");
    for (const q of source._owner_questions) L.push(`- ${q}`);
    L.push("");
  }
  for (const place of wave.places) {
    const p = source.places[place.key];
    const a = p.article;
    const role = place.navigation_node ? "a grouping on this map, not an AVA" : place.is_appellation ? "AVA" : place.kind.toLowerCase();
    L.push(`## ${place.breadcrumb}`, "");
    L.push(`Name: **${place.name}** · key \`${place.key}\` · ${role}`, "");
    L.push(`**Description.** ${a.description}`, "");
    L.push(`**Climate.** ${a.climate}`, "");
    L.push(`**Soils.** ${a.soils}`, "");
    L.push(`**Grape varieties (text).** ${a.grape_varieties}`, "");
    L.push(`**Wine styles (text).** ${a.wine_styles}`, "");
    L.push("**Key facts**", "");
    for (const f of a.key_facts) L.push(`- ${f}`);
    L.push("", "**Grapes, in order**", "");
    p.grapes.forEach((g, i) => L.push(`${i + 1}. ${g.name}${g.note ? ` (${g.note})` : ""}${g.share_pct != null ? `, ${g.share_pct}% (${g.share_source})` : ""}`));
    L.push("", `**Styles:** ${p.styles.map((s) => STYLE_LABELS[s]).join(", ")}`, "");
    L.push("**Sources**", "");
    for (const s of p.sources) L.push(`- ${s.title}: ${s.url}`);
    L.push("");
  }
  if ((source.new_grapes ?? []).length) {
    L.push("## New grapes for the catalog", "");
    for (const g of source.new_grapes) L.push(`- **${g.name}** (${g.color.toLowerCase()}; skin ${g.skin_color ?? "n/a"}): ${g.description}`);
    L.push("");
  }
  if (rehearsal?.shortlist) {
    L.push("## Grape shortlist change (spec §10.3)", "");
    L.push(`The guess ladder and the answer-key form both call \`shortlistGrapesForRegion\`. From the promote on, a state's list comes from the map (the state plus every place beneath it, most-linked first) instead of \`region_grapes\`. Measured in the rolled-back rehearsal of ${rehearsal.rehearsed_at.slice(0, 10)}, as a signed-in reader. The number after a grape is how many of the state's places (the state and the areas beneath it) list it. Grapes with the same number tie: the app keeps the database's row order for them, and they are shown alphabetically here, so the app may put any of them first.`, "");
    L.push("| State | Before (`region_grapes`) | After (the map) |", "|---|---|---|");
    const keyOf = new Map(wave.states.map((st) => [st.name, st.key]));
    const ties = [];
    for (const [state, s] of Object.entries(rehearsal.shortlist)) {
      const key = keyOf.get(state);
      const count = (g) => Object.entries(source.places)
        .filter(([k, p]) => (k === key || k.startsWith(`${key}.`)) && p.grapes.some((x) => x.name === g)).length;
      L.push(`| ${state} | ${s.before.join(", ")} | ${s.after.map((g) => `${g} (${count(g)})`).join(", ")} |`);
      const top = s.after.filter((g) => count(g) === count(s.after[0]));
      if (top.length > 1) ties.push(`${state}: ${top.join(", ")} (${count(s.after[0])} each)`);
    }
    L.push("");
    if (ties.length) L.push(`**Tied at the top** (the app may lead with any of these): ${ties.join("; ")}.`, "");
  }
  return `${L.join("\n")}\n`;
}
