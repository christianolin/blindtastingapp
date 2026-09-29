// Pure core of US-1, the United States scoring-reference clean-up (spec
// docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §6). No network, no
// database: build-us1-spec.mjs reads live (read-only) and hands the rows here.
// It refuses whatever the migration would refuse, so a bad state is caught
// before any SQL is rendered.
import { foldAvaName } from "../wine-map-sources/usa-ava-lib.mjs";
import { REF_SORT } from "./us1-queries.mjs";

export const US1_VERSION = "20260929214747";
export const US1_REVERT_VERSION = "20260929224747";
export const FORWARD_PATH = `supabase/migrations/${US1_VERSION}_usa_reference_cleanup.sql`;
export const REVERT_PATH = `scripts/usa-reference/${US1_REVERT_VERSION}_usa_reference_cleanup_revert.sql`;
export const SPEC_PATH = "data/usa-reference/us1-spec.json";
export const PREIMAGE_PATH = `data/usa-reference/preimage-${US1_VERSION}.json`;
export const PRODUCER_STATES_PATH = "data/usa-reference/us1-producer-states.json";
export const ANCHOR_ID = "ef4ebc71-aadf-4792-abae-300698f7b09f";
const STATE_REGION = { WA: "Washington", OR: "Oregon" };

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const sortBy = (keys) => (x, y) => keys.reduce((acc, k) => acc || cmp(String(x[k]), String(y[k])), 0);

export function applyToReferences(references, { merges, moves }) {
  const merged = new Map(merges.map((m) => [m.loser_id, m]));
  const moved = new Map(moves.map((m) => [m.id, m]));
  const out = {};
  for (const [table, rows] of Object.entries(references)) {
    out[table] = rows.map((row) => {
      if (!("appellation_id" in row)) return row;
      const m = merged.get(row.appellation_id);
      if (m) {
        if (table === "guesses") throw new Error(`STOP (§6.3): guess ${row.id} names ${m.loser_name}, which merges; guesses never move`);
        return { ...row, appellation_id: m.kept_id, region_id: m.kept_region_id };
      }
      const mv = moved.get(row.appellation_id);
      if (mv) {
        if (table === "guesses") throw new Error(`STOP (§6.3): guess ${row.id} names a row that moves state; guesses never move`);
        return { ...row, region_id: mv.to_region_id };
      }
      return row;
    }).sort(sortBy(REF_SORT[table]));
  }
  return out;
}

export function buildUs1Spec({ draft, producerStates, mapStates, live, ttbNames, existingSpec = null, newId }) {
  if (draft.flags.length) throw new Error(`the draft has flags: ${draft.flags.join("; ")}`);
  const s = draft.steps;
  const regionById = new Map(live.regions.map((r) => [r.id, r]));
  const regionIdByName = new Map(live.regions.map((r) => [r.name, r.id]));
  const appById = new Map(live.appellations.map((a) => [a.id, a]));
  const suffixed = live.appellations.filter((a) => a.name.endsWith(" AVA")).length;
  if (live.regions.length !== draft.counts.regions || live.appellations.length !== draft.counts.appellations || suffixed !== draft.counts.ava_suffixed) {
    throw new Error(`live moved since the draft: ${live.regions.length}/${live.appellations.length}/${suffixed} vs ${draft.counts.regions}/${draft.counts.appellations}/${draft.counts.ava_suffixed}; re-run draft-us1-cleanup.mjs`);
  }
  for (const x of [...live.regions, ...live.appellations]) {
    if (x.map_status !== "PENDING" || x.wine_place_id !== null) throw new Error(`${x.name} is ${x.map_status}/${x.wine_place_id}; every US row must stay PENDING and unlinked (D13)`);
  }
  const need = (id, what) => {
    const a = appById.get(id);
    if (!a) throw new Error(`${what}: appellation ${id} is not live`);
    return a;
  };
  const regionName = (id) => regionById.get(id).name;

  // Map states must agree with the regenerated tree reports.
  const checkState = (ava, code) => {
    if (mapStates[ava] !== code) throw new Error(`${ava}: the tree keys it under ${mapStates[ava]}, the draft under ${code}`);
  };

  // 1. Moves.
  const moves = s["5_cross_state"].filter((x) => x.move).map((x) => {
    checkState(x.ava, x.map_state);
    const a = need(x.move, `move ${x.ava}`);
    return { id: a.id, name: a.name, from_region: regionName(a.region_id), from_region_id: a.region_id, to_region: x.to_region, to_region_id: x.to_region_id };
  });
  const regionAfterMove = (a) => moves.find((m) => m.id === a.id)?.to_region_id ?? a.region_id;

  // 2. Merges: step 3, then the cross-state rows, then Columbia Gorge.
  const mergePairs = [
    ...s["3_merges"].map((m) => [m.loser.id, m.kept.id, m.why]),
    ...s["5_cross_state"].filter((x) => x.kept).flatMap((x) => { checkState(x.ava, x.map_state); return x.losers.map((l) => [l, x.kept, `one row per AVA, under ${x.map_state}`]); }),
  ];
  checkState(s["6_columbia_gorge"].ava, s["6_columbia_gorge"].map_state);
  mergePairs.push(...s["6_columbia_gorge"].losers.map((l) => [l, s["6_columbia_gorge"].kept, "one row per AVA, under OR (owner: Oregon)"]));
  const merges = mergePairs.map(([loserId, keptId, why]) => {
    const loser = need(loserId, "merge loser");
    const kept = need(keptId, "merge kept");
    const keptRegion = regionAfterMove(kept);
    return {
      loser_id: loser.id, loser_name: loser.name, loser_region: regionName(loser.region_id), loser_region_id: loser.region_id,
      kept_id: kept.id, kept_name: kept.name, kept_region: regionName(keptRegion), kept_region_id: keptRegion,
      cross_region: loser.region_id !== keptRegion, why,
    };
  });

  // 3. Renames.
  const renames = [["1_state_suffix", s["1_state_suffix"]], ["2_county_suffix", s["2_county_suffix"]], ["4_legal_names", s["4_legal_names"]]]
    .flatMap(([step, list]) => list.map((r) => {
      const a = need(r.id, `rename ${r.old}`);
      if (a.name !== r.old) throw new Error(`rename: ${r.id} is "${a.name}", not "${r.old}"`);
      return { step, id: a.id, region: regionName(a.region_id), region_id: a.region_id, old: r.old, new: r.new };
    }));

  // 4. Pseudo-regions and the producer research.
  const research = new Map(producerStates.producers.map((p) => [p.id, p]));
  const pseudoIds = new Set();
  const pseudo_regions = Object.entries(s["7_pseudo_regions"]).map(([name, v]) => {
    pseudoIds.add(v.region_id);
    const into = name === "Columbia Gorge" ? "OR" : mapStates[name];
    if (!STATE_REGION[into]) throw new Error(`${name}: grapes have no wave state to join (${into})`);
    const onRegion = live.producers.filter((p) => p.region_id === v.region_id);
    return {
      id: v.region_id, name,
      grapes_into_region: STATE_REGION[into], grapes_into_region_id: regionIdByName.get(STATE_REGION[into]),
      producers: onRegion.map((p) => {
        const r = research.get(p.id);
        if (!r) throw new Error(`producer states must cover exactly the pseudo-regions' producers: ${p.name} (${p.id}) is missing`);
        if (!["WA", "OR", null].includes(r.state)) throw new Error(`${p.name}: state must be WA, OR or null, not ${r.state}`);
        return { id: p.id, name: p.name, state: r.state, to_region_id: r.state ? regionIdByName.get(STATE_REGION[r.state]) : null };
      }).sort(sortBy(["id"])),
    };
  });
  const covered = new Set(pseudo_regions.flatMap((p) => p.producers.map((x) => x.id)));
  for (const id of research.keys()) if (!covered.has(id)) throw new Error(`producer states must cover exactly the pseudo-regions' producers: ${id} is not on one`);

  // 5. STOP rules (§6.2 step 6, §6.3).
  const crossIds = new Set([...moves.map((m) => m.id), ...merges.filter((m) => m.cross_region).map((m) => m.loser_id)]);
  for (const table of ["catalog_wines", "wine_answers"]) {
    for (const row of live.references[table]) {
      if (crossIds.has(row.appellation_id)) throw new Error(`STOP for the owner (§6.2 step 6): ${table} ${row.id ?? row.wine_id} names ${appById.get(row.appellation_id).name}, which changes state`);
    }
  }
  for (const [table, rows] of Object.entries(live.references)) {
    for (const row of rows) {
      const rid = row.region_id ?? row.picked_region_id;
      if (pseudoIds.has(rid)) throw new Error(`${table} still names pseudo-region ${regionName(rid)}`);
    }
  }
  const postReferences = applyToReferences(live.references, { merges, moves });

  // 6. New rows (ids stable across rebuilds).
  const oldIds = new Map((existingSpec?.new_rows ?? []).map((r) => [`${r.region}|${r.name}`, r.id]));
  const new_rows = s["8_missing_avas"].map((x) => ({
    id: oldIds.get(`${x.region}|${x.name}`) ?? newId(), name: x.name, region: x.region, region_id: regionIdByName.get(x.region), cfr: x.cfr,
  }));

  // 7. The post-state appellations.
  const loserIds = new Set(merges.map((m) => m.loser_id));
  const renamed = new Map(renames.map((r) => [r.id, r.new]));
  const post = live.appellations.filter((a) => !loserIds.has(a.id))
    .map((a) => ({ id: a.id, name: renamed.get(a.id) ?? a.name, region_id: regionAfterMove(a) }))
    .concat(new_rows.map((r) => ({ id: r.id, name: r.name, region_id: r.region_id })));
  const seen = new Set();
  for (const a of post) {
    const k = `${a.region_id}|${a.name}`;
    if (seen.has(k)) throw new Error(`duplicate (region, name) after US-1: ${regionName(a.region_id)} › ${a.name}`);
    seen.add(k);
    if (pseudoIds.has(a.region_id)) throw new Error(`${a.name} is still on pseudo-region ${regionName(a.region_id)}`);
  }
  const ttb = new Set(ttbNames.map(foldAvaName));
  for (const a of post) if (a.name.endsWith(" AVA") && !ttb.has(foldAvaName(a.name))) throw new Error(`not a TTB legal name: ${a.name}`);
  const postRegionIds = live.regions.map((r) => r.id).filter((id) => !pseudoIds.has(id)).sort(cmp);
  // Regions with no appellation are left out, as the SQL's jsonb_object_agg leaves them out.
  const per_region = Object.fromEntries(postRegionIds.map((id) => [id, post.filter((a) => a.region_id === id).length]).filter(([, count]) => count > 0));

  const pushGrapes = new Map(pseudo_regions.map((p) => [p.id, p.grapes_into_region_id]));
  const grapeKey = (g) => `${g.region_id}|${g.grape_id}`;
  const keptGrapes = live.region_grapes.filter((g) => !pseudoIds.has(g.region_id));
  const have = new Set(keptGrapes.map(grapeKey));
  const postGrapes = [...keptGrapes];
  for (const g of live.region_grapes.filter((x) => pseudoIds.has(x.region_id))) {
    const moved = { ...g, region_id: pushGrapes.get(g.region_id) };
    if (!have.has(grapeKey(moved))) { postGrapes.push(moved); have.add(grapeKey(moved)); }
  }

  const rows = [...new Map([...renames.map((r) => r.id), ...merges.flatMap((m) => [m.loser_id, m.kept_id]), ...moves.map((m) => m.id)]
    .map((id) => [id, appById.get(id)])).values()].map((a) => ({ id: a.id, region_id: a.region_id, name: a.name })).sort(sortBy(["id"]));
  const spec = {
    _note: "US-1 (spec §6). Built by scripts/usa-reference/build-us1-spec.mjs from the approved draft, the producer research and a read-only live read. Rendered into the migration by render-us1-sql.mjs.",
    version: US1_VERSION, revert_version: US1_REVERT_VERSION, anchor_id: ANCHOR_ID, country_id: live.country_id,
    fk_catalogue: [...live.fk_catalogue].sort(sortBy(["ref", "table", "column"])),
    pre: {
      region_ids: live.regions.map((r) => r.id).sort(cmp), appellation_count: live.appellations.length, ava_suffixed: suffixed,
      rows, references: live.references, region_grapes: [...live.region_grapes].sort(sortBy(["region_id", "grape_id"])),
    },
    moves, merges, renames, pseudo_regions, new_rows,
    post: {
      region_ids: postRegionIds, appellation_count: post.length, ava_suffixed: post.filter((a) => a.name.endsWith(" AVA")).length,
      per_region, ava_names: post.filter((a) => a.name.endsWith(" AVA")).map((a) => a.name).sort(cmp),
      references: postReferences,
      producers: pseudo_regions.flatMap((p) => p.producers.map((x) => ({ id: x.id, region_id: x.to_region_id }))).sort(sortBy(["id"])),
      region_grapes: postGrapes.sort(sortBy(["region_id", "grape_id"])),
    },
  };
  const preimage = {
    _note: "US-1 pre-image (spec §6.4): ids and FK columns only, no content. The revert restores exactly this.",
    version: US1_VERSION,
    regions: live.regions.map(({ id, name, country_id }) => ({ id, name, country_id })).sort(sortBy(["id"])),
    appellations: live.appellations.map(({ id, name, region_id }) => ({ id, name, region_id })).sort(sortBy(["id"])),
    producers: live.producers.map(({ id, region_id }) => ({ id, region_id })).sort(sortBy(["id"])),
    region_grapes: spec.pre.region_grapes,
    references: live.references,
  };
  return { spec, preimage };
}
