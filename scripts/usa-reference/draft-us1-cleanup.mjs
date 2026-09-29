// READ-ONLY draft of the US-1 scoring-reference cleanup (spec 2026-09-29 §6.2),
// the owner-facing copy list (§18, US-0 row) and a pre-image draft (§6.4).
// Nothing here writes live: one `begin read only` transaction, rolled back.
// US-1 turns this draft into its migration after the owner's OK, and
// regenerates the pre-image on the apply day under that migration's version.
//
// Usage: node scripts/usa-reference/draft-us1-cleanup.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { foldAvaName } from "../wine-map-sources/usa-ava-lib.mjs";

const OUT_DIR = "data/usa-reference";
const WAVE = { CA: "California", WA: "Washington", OR: "Oregon", NY: "New York" };
const ANCHOR_ID = "ef4ebc71-aadf-4792-abae-300698f7b09f"; // California › California AVA
const STATE_SUFFIX = ["California", "Oregon", "Washington", "Texas", "Virginia", "Pennsylvania"];
const COUNTIES = ["Amador", "Calaveras", "Contra Costa", "El Dorado", "Lake", "Marin", "Mendocino", "Monterey",
  "Napa", "San Benito", "San Luis Obispo", "Santa Barbara", "Santa Cruz", "Sonoma", "Yolo"];
const MERGES = [
  { loser: { region: "California", name: "Santa Benito County AVA" }, kept: { region: "California", name: "San Benito County AVA" }, why: "a typo of San Benito County" },
  { loser: { region: "California", name: "SLO Coast AVA" }, kept: { region: "California", name: "San Luis Obispo Coast AVA" }, why: "TTB's legal name is San Luis Obispo Coast" },
  { loser: { region: "California", name: "Sonoma" }, kept: { region: "California", name: "Sonoma County AVA" }, why: "the same county, unsuffixed" },
  { loser: { region: "Washington", name: "Walla Walla Valley", id: "c27f9b10-8b46-4e71-a590-a3184d883d0b" },
    kept: { region: "Walla Walla Valley", name: "Walla Walla Valley AVA", id: "be3fd8ac-0b9e-4055-a6b6-e937dac8ed0f" }, why: "one row per AVA" },
];
const LEGAL = [
  { region: "California", old: "Oak Knoll District AVA", new: "Oak Knoll District of Napa Valley AVA" },
  { region: "California", old: "Moon Mountain District AVA", new: "Moon Mountain District Sonoma County AVA" },
  // The spec wrote "Mt. Pisgah, …" but takes the string from UC Davis's name
  // field, which is "Mount Pisgah, Polk County, Oregon", as is 27 CFR 9.284's
  // heading (TTB's list page alone writes "Mt."). With "Mt." step 8 would also
  // add a second, "Mount Pisgah" row as a missing AVA.
  { region: "Oregon", old: "Mt. Pisgah Polk County Oregon AVA", new: "Mount Pisgah, Polk County, Oregon AVA" },
  { region: "Oregon", old: "Red Hill Douglas County Oregon AVA", new: "Red Hill Douglas County, Oregon AVA" },
  { region: "New York", old: "The Hamptons (Long Island) AVA", new: "The Hamptons, Long Island AVA" },
];
const CROSS = [
  { ava: "Columbia Valley", rows: { OR: "30a8e06f-c9a7-4e5d-ae43-819f8048fe54", WA: "52b4e94c-44ce-435f-a68d-5bf1c13050dd" } },
  { ava: "The Rocks District of Milton-Freewater", rows: { OR: "c1c1d9d0-aa74-44ab-97b5-bd31a067fa0f", WA: "41694564-7601-454a-a28b-220962248568" } },
];
const WALLA_WALLA_KEPT = "be3fd8ac-0b9e-4055-a6b6-e937dac8ed0f";
const LAKE_ERIE = "1f1d7c05-e522-4df4-8c84-78d0693fdffa";
const GORGE = { kept: "c367f0ce-84c1-4f16-a228-aba53fda736e", losers: ["46451c0f-3bb2-42c4-8d30-c5ac3ea86461", "254e0e57-4b21-4172-9568-8a8bbeaa3fee"] };
const PSEUDO = { "Walla Walla Valley": "2368600a-1fbd-4a50-b521-aba384b54722", "Columbia Gorge": "127ce314-1088-4962-b44f-255be4554df2" };

const reports = await Promise.all(["california", "washington", "oregon", "new-york"]
  .map(async (s) => JSON.parse(await readFile(`data/wine-map/usa-${s}-tree.json`, "utf8"))));
const placeByName = new Map(reports.flatMap((r) => r.places.filter((p) => p.ucd_ava_id)).map((p) => [p.name, p]));
const deferredByName = new Map(reports.flatMap((r) => r.deferred).map((d) => [d.name, d]));
const mapStateOf = (name) => placeByName.get(name)?.map_state ?? deferredByName.get(name)?.map_state ?? null;
const ttb = JSON.parse(await readFile("data/wine-map/usa-ava-ttb-list.json", "utf8")).avas;
const diff = JSON.parse(await readFile("data/wine-map/usa-ava-diff.json", "utf8"));

const result = await withReadOnly(async (c) => {
  const rows = (await c.query(`
    select a.id, a.name, a.region_id, r.name as region, a.map_status, a.wine_place_id
      from appellations a join regions r on r.id = a.region_id join countries co on co.id = r.country_id
     where co.name = 'United States' order by r.name, a.name`)).rows;
  const regions = (await c.query(`
    select r.id, r.name from regions r join countries co on co.id = r.country_id
     where co.name = 'United States' order by r.name`)).rows;
  const flags = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const find = (region, name) => rows.find((r) => r.region === region && r.name === name) ?? null;
  const need = (region, name, id) => {
    const row = id ? byId.get(id) ?? null : find(region, name);
    if (!row) { flags.push(`missing: ${region} › ${name}${id ? ` (${id})` : ""}`); return null; }
    if (row.region !== region || row.name !== name) flags.push(`${row.id} is now ${row.region} › ${row.name}, expected ${region} › ${name}`);
    return row;
  };
  const regionIdOf = (name) => regions.find((r) => r.name === name)?.id ?? null;

  if (!byId.has(ANCHOR_ID)) flags.push(`the live anchor ${ANCHOR_ID} (California AVA) is absent`);
  const suffixed = rows.filter((r) => r.name.endsWith(" AVA")).length;
  if (regions.length !== 28 || rows.length !== 240 || suffixed !== 210) {
    flags.push(`counts moved since the spec: ${regions.length} regions (28), ${rows.length} appellations (240), ${suffixed} ending " AVA" (210)`);
  }

  const step1 = STATE_SUFFIX.map((s) => [need(s, `${s} AVA`), s]).filter(([row]) => row)
    .map(([row, name]) => ({ id: row.id, region: row.region, old: row.name, new: name }));
  const step2 = COUNTIES.map((cty) => [need("California", `${cty} County AVA`), `${cty} County`]).filter(([row]) => row)
    .map(([row, name]) => ({ id: row.id, region: row.region, old: row.name, new: name }));
  const step3 = [];
  for (const m of MERGES) {
    const loser = need(m.loser.region, m.loser.name, m.loser.id);
    const kept = m.kept.id ? byId.get(m.kept.id) ?? null : find(m.kept.region, m.kept.name);
    if (!loser) continue;
    if (!kept) {
      flags.push(`merge target ${m.kept.region} › ${m.kept.name} is missing: US-1 renames ${m.loser.name} instead`);
      step3.push({ loser: { id: loser.id, region: loser.region, name: loser.name }, kept: null, rename_to: m.kept.name, why: m.why });
    } else {
      step3.push({ loser: { id: loser.id, region: loser.region, name: loser.name }, kept: { id: kept.id, region: kept.region, name: kept.name }, why: m.why });
    }
  }
  const legalFolds = new Set(diff.matched.map((m) => foldAvaName(m.ttb_name)));
  const step4 = LEGAL.map((l) => [need(l.region, l.old), l]).filter(([row]) => row).map(([row, l]) => {
    if (!legalFolds.has(foldAvaName(l.new))) flags.push(`${l.new} does not fold-match a TTB legal name`);
    return { id: row.id, region: row.region, old: row.name, new: l.new };
  });
  const step5 = [];
  for (const x of CROSS) {
    const state = mapStateOf(x.ava);
    for (const id of Object.values(x.rows)) if (!byId.has(id)) flags.push(`missing cross-state row ${id} (${x.ava})`);
    if (!Object.hasOwn(x.rows, state)) { flags.push(`${x.ava}: map state ${state} has no row to keep`); continue; }
    step5.push({ ava: x.ava, map_state: state, kept: x.rows[state], losers: Object.values(x.rows).filter((id) => id !== x.rows[state]) });
  }
  const wwvState = mapStateOf("Walla Walla Valley");
  step5.push({ ava: "Walla Walla Valley", map_state: wwvState, move: WALLA_WALLA_KEPT, to_region: WAVE[wwvState] ?? null, to_region_id: regionIdOf(WAVE[wwvState]) });
  const erieState = mapStateOf("Lake Erie");
  step5.push(erieState === "NY"
    ? { ava: "Lake Erie", map_state: erieState, move: LAKE_ERIE, to_region: "New York", to_region_id: regionIdOf("New York") }
    : { ava: "Lake Erie", map_state: erieState, action: "left for Ohio's wave (not moved)" });
  for (const ava of ["Snake River Valley", "Lewis-Clark Valley"]) {
    step5.push({ ava, map_state: mapStateOf(ava), action: "kept until Idaho's wave decides it" });
  }
  const step6 = {
    ava: "Columbia Gorge",
    map_state: mapStateOf("Columbia Gorge"),
    owner_answer: "Oregon (2026-09-29): a state_override applied to map and scoring alike (§6.2 step 6, option a)",
    kept: GORGE.kept,
    losers: GORGE.losers,
  };
  for (const id of [GORGE.kept, ...GORGE.losers]) if (!byId.has(id)) flags.push(`missing Columbia Gorge row ${id}`);
  const step7 = {};
  for (const [name, regionId] of Object.entries(PSEUDO)) {
    if (!regions.some((r) => r.id === regionId)) flags.push(`pseudo-region ${name} (${regionId}) is missing`);
    step7[name] = {
      region_id: regionId,
      producers: (await c.query("select id, name from producers where region_id = $1 order by name", [regionId])).rows
        .map((p) => ({ ...p, state: null, status: "winery state to be researched in US-1 (§6.2 step 7)" })),
      region_grapes: (await c.query(
        "select rg.grape_id, g.name, rg.role from region_grapes rg join grapes g on g.id = rg.grape_id where rg.region_id = $1 order by g.name",
        [regionId])).rows,
    };
  }
  const planned = new Set([...rows.map((r) => foldAvaName(r.name)), ...step4.map((x) => foldAvaName(x.new))]);
  const step8 = [];
  for (const t of ttb.filter((x) => x.states.some((s) => WAVE[s]))) {
    if (planned.has(foldAvaName(t.name))) continue;
    const waveStates = t.states.filter((s) => WAVE[s]);
    const state = mapStateOf(t.name) ?? (waveStates.length === 1 ? waveStates[0] : null);
    if (!state) { flags.push(`${t.name}: no single wave state to add it under`); continue; }
    if (!WAVE[state]) continue; // dominant state outside wave 1: waits for that wave
    step8.push({ name: `${t.name} AVA`, region: WAVE[state], cfr: t.cfr_section });
  }

  const mergedAway = new Set([...step3.filter((m) => m.kept).map((m) => m.loser.id),
    ...step5.flatMap((x) => x.losers ?? []), ...GORGE.losers]);
  const moved = new Set(step5.filter((x) => x.move).map((x) => x.move));
  const renamedTo = new Map([...step1, ...step2, ...step4].map((x) => [x.id, x.new]));
  const ttbFolds = new Set(ttb.map((x) => foldAvaName(x.name)));
  const scopeRegions = new Set([...Object.values(WAVE), ...Object.keys(PSEUDO)]);
  const unmatched = rows
    .filter((r) => scopeRegions.has(r.region) && !mergedAway.has(r.id))
    .map((r) => ({ id: r.id, region: r.region, name: r.name, planned: renamedTo.get(r.id) ?? r.name }))
    .filter((r) => r.planned.endsWith(" AVA") && !ttbFolds.has(foldAvaName(r.planned)));
  for (const r of rows) {
    if (scopeRegions.has(r.region) && (r.map_status !== "PENDING" || r.wine_place_id !== null)) {
      flags.push(`${r.region} › ${r.name} is ${r.map_status}/${r.wine_place_id ?? "unlinked"}; every US row must stay PENDING and unlinked (D13)`);
    }
  }

  const touched = [...new Set([...step1, ...step2, ...step4].map((x) => x.id)
    .concat(step3.flatMap((m) => [m.loser.id, m.kept?.id].filter(Boolean)))
    .concat([...mergedAway, ...moved, GORGE.kept]))].sort();
  const refs = (await c.query(`
    select x.id::text as id,
      (select count(*) from catalog_wines w where w.appellation_id = x.id)::int as catalog_wines,
      (select count(*) from catalog_wines_unidentified w where w.appellation_id = x.id)::int as catalog_wines_unidentified,
      (select count(*) from wine_answers w where w.appellation_id = x.id)::int as wine_answers,
      (select count(*) from guesses g where g.appellation_id = x.id)::int as guesses,
      (select count(*) from wine_archetypes w where w.appellation_id = x.id)::int as wine_archetypes
      from unnest($1::uuid[]) as x(id) order by 1`, [touched])).rows
    .map((r) => ({ ...r, name: byId.get(r.id)?.name ?? null, region: byId.get(r.id)?.region ?? null }));
  const changing = new Set([...mergedAway, ...moved]);
  for (const r of refs) {
    if (changing.has(r.id) && r.guesses > 0) flags.push(`STOP (§6.3): ${r.region} › ${r.name} has ${r.guesses} guesses and would merge or move`);
  }

  const ap = [...changing].sort();
  const rg = Object.values(PSEUDO).sort();
  const q = async (sql, params) => (await c.query(sql, params)).rows;
  const preimage = {
    _note: "Draft pre-image (spec §6.4): ids and FK columns only, no content. US-1 regenerates it on the apply day as preimage-<version>.json.",
    read_at: new Date().toISOString(),
    touched_appellations: touched.map((id) => byId.get(id)).filter(Boolean).map(({ id, name, region_id }) => ({ id, name, region_id })),
    touched_regions: regions.filter((r) => rg.includes(r.id)),
    references: {
      catalog_wines: await q("select id, region_id, appellation_id from catalog_wines where appellation_id = any($1::uuid[]) or region_id = any($2::uuid[]) order by id", [ap, rg]),
      catalog_wines_unidentified: await q("select id, region_id, appellation_id from catalog_wines_unidentified where appellation_id = any($1::uuid[]) or region_id = any($2::uuid[]) order by id", [ap, rg]),
      wine_answers: await q("select wine_id, region_id, appellation_id from wine_answers where appellation_id = any($1::uuid[]) or region_id = any($2::uuid[]) order by wine_id", [ap, rg]),
      guesses: await q("select id, region_id, appellation_id from guesses where appellation_id = any($1::uuid[]) or region_id = any($2::uuid[]) order by id", [ap, rg]),
      wine_archetypes: await q("select id, region_id, appellation_id from wine_archetypes where appellation_id = any($1::uuid[]) or region_id = any($2::uuid[]) order by id", [ap, rg]),
      label_lookups: await q("select id, region_id, appellation_id from label_lookups where appellation_id = any($1::uuid[]) or region_id = any($2::uuid[]) order by id", [ap, rg]),
      appellations: await q("select id, region_id from appellations where region_id = any($1::uuid[]) order by id", [rg]),
      producers: await q("select id, region_id from producers where region_id = any($1::uuid[]) order by id", [rg]),
      region_grapes: await q("select region_id, grape_id, role from region_grapes where region_id = any($1::uuid[]) order by region_id, grape_id", [rg]),
      profile_favourite_regions: await q("select profile_id, region_id from profile_favourite_regions where region_id = any($1::uuid[]) order by profile_id", [rg]),
      training_attempts: await q("select id, picked_region_id from training_attempts where picked_region_id = any($1::uuid[]) order by id", [rg]),
      type_designations: await q("select id, region_id from type_designations where region_id = any($1::uuid[]) order by id", [rg]),
      wine_identity_drafts: await q("select wine_id from wine_identity_drafts where draft->>'appellationId' = any($1::text[]) or draft->>'regionId' = any($2::text[]) order by wine_id", [ap, rg]),
    },
  };
  return {
    draft: {
      _note: "DRAFT for the owner (spec §6.2). Read-only; nothing has changed. US-1 builds its migration from this after the owner's OK.",
      read_at: new Date().toISOString(),
      counts: { regions: regions.length, appellations: rows.length, ava_suffixed: suffixed },
      steps: {
        "1_state_suffix": step1, "2_county_suffix": step2, "3_merges": step3, "4_legal_names": step4,
        "5_cross_state": step5, "6_columbia_gorge": step6, "7_pseudo_regions": step7, "8_missing_avas": step8,
      },
      unmatched_ava_rows: unmatched,
      references: refs,
      flags,
    },
    preimage,
  };
});

function copyList(d) {
  const s = d.steps;
  const L = ["# US-1 copy list (draft) for the owner", "",
    "Provisional. Nothing has changed yet: this is what US-1 would change in the guess ladder, the add-wine form and past records, for your OK. Generated read-only by `scripts/usa-reference/draft-us1-cleanup.mjs`.", ""];
  const section = (title, lines) => { L.push(`## ${title}`, "", ...(lines.length ? lines : ["- none"]), ""); };
  section("States lose a false \" AVA\"", s["1_state_suffix"].map((x) => `- ${x.old} → ${x.new}`));
  section("Counties lose a false \" AVA\"", s["2_county_suffix"].map((x) => `- ${x.old} → ${x.new}`));
  section("Merged (the first row disappears; its wines point at the second)", s["3_merges"].map((m) =>
    m.kept ? `- ${m.loser.region} › ${m.loser.name} → ${m.kept.region} › ${m.kept.name} (${m.why})` : `- ${m.loser.name} → renamed ${m.rename_to} (${m.why})`));
  section("Corrected to the legal name", s["4_legal_names"].map((x) => `- ${x.old} → ${x.new}`));
  section("Cross-state AVAs: one row, under the state the map keys it", s["5_cross_state"].map((x) =>
    x.kept ? `- ${x.ava}: kept under ${x.map_state}; ${x.losers.length} other row(s) merge into it`
      : x.move ? `- ${x.ava}: moves to ${x.to_region}` : `- ${x.ava}: ${x.action}`));
  section("Columbia Gorge", [`- You answered "Oregon". All three rows become one, under Oregon, so the Phelps Creek wine and its record keep reading Oregon.`]);
  section("Retired regions", Object.entries(s["7_pseudo_regions"]).map(([name, v]) =>
    `- "${name}" stops being a region; its ${v.producers.length} producer(s) are re-linked by each winery's own state (researched in US-1), and its ${v.region_grapes.length} grape row(s) join that state's.`));
  section("New AVA rows", s["8_missing_avas"].map((x) => `- ${x.name} (${x.region})`));
  section("For review", [...d.unmatched_ava_rows.map((r) => `- Unmatched after the plan: ${r.region} › ${r.name} → ${r.planned}`), ...d.flags.map((f) => `- ${f}`)]);
  section("Other new copy on the map (provisional)", [
    "- Attribution: \"AVA outlines: American Viticultural Areas Digitizing Project, UC Davis Library et al. (CC0) — a generalized digitization of 27 CFR Part 9, not TTB's legal boundary\"",
    "- Attribution (US-5): \"AVA outlines: TTB AVA Map Explorer (public domain) — generalized, not the legal boundary\"",
    "- Labels: United States (the chip), California, Washington, Oregon, New York",
  ]);
  return `${L.join("\n")}\n`;
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(`${OUT_DIR}/us1-cleanup-draft.json`, `${JSON.stringify(result.draft, null, 2)}\n`);
await writeFile(`${OUT_DIR}/us1-copy-list.md`, copyList(result.draft));
await writeFile(`${OUT_DIR}/preimage-draft.json`, `${JSON.stringify(result.preimage, null, 2)}\n`);
console.log(`steps: ${Object.entries(result.draft.steps).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : Object.keys(v).length}`).join(" ")}`);
console.log(`flags: ${result.draft.flags.length}`);
for (const f of result.draft.flags) console.log(`  FLAG ${f}`);

