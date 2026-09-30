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
    // role: absent means PRINCIPAL (a signature grape); ACCESSORY is tagged
    // "accessory" in the panel and ranks after every signature grape in the
    // shortlists. Every place names at least one signature grape.
    if (grapes.length && !grapes.some((g) => (g.role ?? "PRINCIPAL") === "PRINCIPAL")) problems.push(`${k}: no signature (PRINCIPAL) grape`);
    for (const g of grapes) {
      if (g.role !== undefined && !["PRINCIPAL", "ACCESSORY"].includes(g.role)) problems.push(`${k}: bad role ${g.role} for ${g.name}`);
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

/**
 * The migration carries the data file exactly: every article string, each
 * style at its position, each grape with its role, share and note, the
 * per-place counts, and each new grape (re-appliable over a kept row). The
 * rows are matched as the generator (gen-place-profiles-migration.mjs) emits
 * them, so a swapped style or a changed role is stale, not just a new count.
 */
export function migrationIsCurrent(source, sql) {
  const out = [];
  for (const [key, p] of Object.entries(source.places ?? {})) {
    for (const f of ARTICLE_FIELDS) if (p.article?.[f] && !sql.includes(sq(p.article[f]))) out.push(`${key}: article.${f} is not in the migration`);
    for (const fact of p.article?.key_facts ?? []) if (!sql.includes(sq(fact))) out.push(`${key}: a key fact is not in the migration`);
    const tuple = `(${sq(key)}, ${(p.styles ?? []).length}, ${(p.grapes ?? []).length}, 1)`;
    if (!sql.includes(tuple)) out.push(`${key}: expected counts ${tuple} not in the migration`);
    (p.styles ?? []).forEach((s, i) => {
      if (!sql.includes(`select id, '${s}', ${i}, 'PUBLISHED' from public.wine_places where canonical_key = ${sq(key)};`)) {
        out.push(`${key}: style ${s} at ${i} not in the migration`);
      }
    });
    for (const g of p.grapes ?? []) {
      const row = `select p.id, g.id, '${g.role ?? "PRINCIPAL"}', true, ${g.share_pct ?? "null"}, ${sq(g.note ?? null)}, 'PUBLISHED'\n`
        + "  from public.wine_places p, public.grapes g\n"
        + ` where p.canonical_key = ${sq(key)} and g.name = ${sq(g.name)};`;
      if (!sql.includes(row)) out.push(`${key}: grape ${g.name} (${g.role ?? "PRINCIPAL"}) not in the migration`);
    }
  }
  for (const g of source.new_grapes ?? []) {
    const row = `values (${sq(g.name)}, ${sq(g.color)}, ${sq(g.description)}, ${sq(g.skin_color)})\non conflict (name) do nothing;`;
    if (!sql.includes(row)) out.push(`new grape ${g.name}: not in the migration as a re-appliable insert`);
  }
  return out;
}

/**
 * A place's grapes as the details panel lists them: get_wine_place_context
 * orders by role (PRINCIPAL first), then share_pct descending, then name. The
 * data file's own order is not kept (wine_place_grapes has no order column).
 */
export function panelGrapes(grapes) {
  const role = (g) => g.role ?? "PRINCIPAL";
  return [...grapes].sort((a, b) => (role(a) === role(b) ? 0 : role(a) === "PRINCIPAL" ? -1 : 1)
    || (b.share_pct ?? -1) - (a.share_pct ?? -1)
    || a.name.localeCompare(b.name));
}

// src/components/add-wine/by-hand-logic.ts: MAX_REGION_GRAPE_CHIPS.
export const BY_HAND_CHIPS = 5;
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
const ord = (n) => ORD[n - 1] ?? `${n}th`;

/**
 * The shortlist's rank key for each grape of a state (src/lib/grape-shortlist.ts):
 * the grape's PRINCIPAL links under the state (the state and every place
 * beneath it) if it has any, else its ACCESSORY links. Grapes with the same
 * bucket and count tie; the app keeps the database's row order for them.
 */
export function shortlistRanks(source, stateKey) {
  const ranks = new Map();
  for (const [k, p] of Object.entries(source.places)) {
    if (k !== stateKey && !k.startsWith(`${stateKey}.`)) continue;
    for (const g of p.grapes) {
      const r = ranks.get(g.name) ?? { principal: 0, accessory: 0 };
      r[(g.role ?? "PRINCIPAL") === "PRINCIPAL" ? "principal" : "accessory"] += 1;
      ranks.set(g.name, r);
    }
  }
  return new Map([...ranks].map(([name, r]) => [name, r.principal > 0
    ? { bucket: "principal", count: r.principal } : { bucket: "accessory", count: r.accessory }]));
}

/**
 * The two surfaces a state's shortlist feeds (spec §10.3), from an ordered
 * list (the mirror's: ties broken by name) and a rank function (null for the
 * region_grapes fallback, which has no ties). Returns the guess ladder's list,
 * and the by-hand form's chip row for no colour, RED and WHITE: each capped
 * at five after the colour filter (a grape with no colour on file is never
 * filtered out), with the grapes a tie at the cut makes uncertain.
 */
export function shortlistSurfaces(list, colours, rankOf) {
  const same = (a, b) => Boolean(rankOf && rankOf(a) && rankOf(b)
    && rankOf(a).bucket === rankOf(b).bucket && rankOf(a).count === rankOf(b).count);
  const chips = (filter) => {
    const kept = list.filter((g) => filter === null || (colours[g] ?? null) === null || colours[g] === filter);
    const shown = kept.slice(0, BY_HAND_CHIPS);
    const last = shown[shown.length - 1];
    const tiedAtCut = kept.length > BY_HAND_CHIPS && same(last, kept[BY_HAND_CHIPS])
      ? kept.filter((g) => same(g, last)) : [];
    return { shown, tiedAtCut };
  };
  return { ladder: list, none: chips(null), red: chips("RED"), white: chips("WHITE") };
}

/** The state's own first three grapes (its written order) that the shortlist moves down or may drop. */
export function shortlistDemotions(stateGrapes, list, rankOf) {
  const out = [];
  stateGrapes.slice(0, 3).forEach((g, i) => {
    if (!list.includes(g.name)) {
      out.push(`${g.name} (${ord(i + 1)} on the state's own list) is not on the shortlist`);
      return;
    }
    const mine = rankOf(g.name);
    const group = list.filter((x) => rankOf(x).bucket === mine.bucket && rankOf(x).count === mine.count);
    const lo = list.indexOf(group[0]) + 1;
    const hi = lo + group.length - 1;
    const where = lo === hi ? ord(lo) : `${ord(lo)} to ${ord(hi)} (a ${group.length}-way tie)`;
    const notes = [];
    if (lo > i + 1) notes.push(`moves down to ${where}`);
    if (lo > BY_HAND_CHIPS) notes.push("is never among the five by-hand chips when no colour is chosen");
    else if (hi > BY_HAND_CHIPS) notes.push("may miss the five by-hand chips when no colour is chosen");
    if (notes.length) out.push(`${g.name} (${ord(i + 1)} on the state's own list) ${notes.join(", and ")}`);
  });
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
    L.push("", "**Grapes**, as the details panel lists them: the signature grapes first, then the others, which the panel tags \"accessory\"; each group alphabetically.", "");
    for (const g of panelGrapes(p.grapes)) {
      const acc = (g.role ?? "PRINCIPAL") === "ACCESSORY" ? " · accessory" : "";
      const share = g.share_pct != null ? `, ${g.share_pct}% (${g.share_source})` : "";
      L.push(`- ${g.name}${g.note ? ` (${g.note})` : ""}${acc}${share}`);
    }
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
    L.push(`Two surfaces call \`shortlistGrapesForRegion\`: the guess ladder's grape picker, which offers the whole list, and the answer-key form's "Common in {state}" chips, which show at most ${BY_HAND_CHIPS}, filtered to the wine's colour once one is chosen (a grape with no colour on file is always kept). From the promote on, a state's list comes from the map (the state and every place beneath it) instead of \`region_grapes\`: grapes that are a signature grape somewhere come first, ranked by how many of those places list them as one, then the others, ranked the same way. Measured in the rolled-back rehearsal of ${rehearsal.rehearsed_at.slice(0, 10)}, as a signed-in reader.`, "");
    L.push("After a grape, the number of the state's places that list it (\"accessory\" when it is a signature grape nowhere). Grapes with the same number tie: the app keeps the database's row order for them (shown alphabetically here), so any of them may come first, and a tie at the fifth chip means any of the tied grapes may be the one shown.", "");
    const keyOf = new Map(wave.states.map((st) => [st.name, st.key]));
    for (const [state, s] of Object.entries(rehearsal.shortlist)) {
      const key = keyOf.get(state);
      const ranks = shortlistRanks(source, key);
      const rankOf = (g) => ranks.get(g);
      const colours = s.colours ?? {};
      const label = (g) => {
        const r = rankOf(g);
        return r ? `${g} (${r.count}${r.bucket === "accessory" ? ", accessory" : ""})` : g;
      };
      const after = shortlistSurfaces(s.after, colours, rankOf);
      const before = shortlistSurfaces(s.before, colours, null);
      const row = (x) => `${x.shown.join(", ") || "none"}${x.tiedAtCut.length ? `; the last chip is one of ${x.tiedAtCut.join(", ")} (tied)` : ""}`;
      L.push(`### ${state}`, "");
      L.push("| Surface | Before (`region_grapes`) | After (the map) |", "|---|---|---|");
      L.push(`| Guess ladder (the whole list) | ${s.before.join(", ")} | ${s.after.map(label).join(", ")} |`);
      L.push(`| By-hand chips, no colour yet | ${row(before.none)} | ${row(after.none)} |`);
      L.push(`| By-hand chips, red | ${row(before.red)} | ${row(after.red)} |`);
      L.push(`| By-hand chips, white | ${row(before.white)} | ${row(after.white)} |`);
      L.push("");
      const lead = rankOf(s.after[0]);
      const top = s.after.filter((g) => lead && rankOf(g) && rankOf(g).bucket === lead.bucket && rankOf(g).count === lead.count);
      L.push(top.length > 1 ? `Tied at the top (the app may lead with any of these): ${top.join(", ")}.` : `Leads with ${s.after[0]}.`, "");
      const own = source.places[key].grapes;
      const demotions = shortlistDemotions(own, s.after, rankOf);
      L.push(`Against ${state}'s own list (its first three: ${own.slice(0, 3).map((g) => g.name).join(", ")}): ${demotions.length ? `${demotions.join("; ")}.` : "none moves down or drops."}`, "");
    }
  }
  const dots = rehearsal?.archetypes?.dots;
  if (dots?.length) {
    L.push("## Typical wines on the training-room map", "");
    L.push("The archetype links (the sitting's last step) give the three US typical wines a map place. The room's map then draws each wine at its place's label point instead of today's hand-placed point (R2), so a wine linked to a large umbrella AVA lands wherever that AVA's label sits. Measured in the rehearsal; longitude, latitude.", "");
    L.push("| Typical wine | Linked to | Dot today | Dot after the links | Moves |", "|---|---|---|---|---|");
    const pt = (x) => (x && x[0] != null ? `${x[0]}, ${x[1]}` : "none");
    for (const d of dots) {
      L.push(`| ${d.name} | \`${d.home}\` | ${pt(d.before)} | ${pt(d.after)} | ${d.moved_km != null ? `${d.moved_km} km` : "n/a"} |`);
    }
    L.push("");
    const shared = dots.filter((d, i) => dots.some((e, j) => j !== i && d.after && e.after && d.after.join() === e.after.join()));
    if (shared.length) L.push(`Drawn on the same spot after the links: ${shared.map((d) => d.name).join(" and ")}. US-3 moves the two California wines to Napa Valley and Sonoma Coast.`, "");
  }
  return `${L.join("\n")}\n`;
}
