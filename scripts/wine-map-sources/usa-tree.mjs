// Pure placement of US AVAs in the map tree (spec docs/superpowers/specs/
// 2026-09-29-usa-wine-map-design.md: D2-D7, D15, D25, §4, §8.3).
//
// No network and no database. The inputs are the measured areas and ratios
// (measure-usa-ava.mjs) and the hand-edited usa-tree-config.json, so the
// committed tree reports can be rebuilt and re-checked offline, and US-2's
// stage script re-asserts the same result before it writes a row.
//
// Legal states. Each AVA carries `legal_states`: the states TTB lists for it
// (data/wine-map/usa-ava-ttb-list.json, legal data), or UC Davis's own list
// for an AVA TTB does not name. A measured land share decides the map state
// and yields a state edge only in a legal state. The Natural Earth 1:50m state
// line is several km off along the Columbia River, so it measures Oregon land
// inside Washington-only AVAs (The Burn of Columbia Valley 38%, Horse Heaven
// Hills 2%); a share in a state TTB does not list is that artifact. It gets no
// edge and no say in the map state, and is listed under
// review.state_list_disagreements (`withheld_states`).
//
// Nesting (owner, 2026-09-29, "Legal record + >=90% inside"): a is within b
// when a measures >= `within` (99.5%) inside b, or when UC Davis's `within`
// names b and a measures >= `withinLegalRecord` (90%) inside it. The second
// arm is the only place UC Davis's text decides anything; `contains` is only
// compared.
import { foldAvaName, placeSlug } from "./usa-ava-lib.mjs";

export const DEFAULT_THRESHOLDS = Object.freeze({
  within: 0.995,
  // Owner decision 2026-09-29 ("Legal record + >=90% inside"): an AVA also
  // nests in a container UC Davis's `within` names when at least this much
  // of it measures inside; a digitizing sliver no longer overrules the law.
  withinLegalRecord: 0.9,
  overlapMin: 0.01,
  stateEdgeMin: 0.005,
  outlineKm2: 5000,
  containmentMin: 0.995,
  landShareReview: 0.5,
  // Review only, never a decision: a pair whose smaller side lies at least
  // this much, but under `within`, inside the other is listed as "almost
  // within" so a digitizing sliver can be told from a real partial overlap.
  nearWithinReview: 0.9,
});
export const COUNTRY_KEY = "united-states";
const COUNTRY_NAME = "United States";
const COUNTRY_SORT = 140;
// [display_tier, min_zoom, label_min_zoom] by the number of AVAs above a place
// on its primary chain (spec §4); every label by z10 (D16).
const DEPTH_ZOOMS = [[2, 6, 6], [3, 6, 7], [4, 7, 9], [5, 8, 10]];
const UMBRELLA_ZOOMS = [2, 5, 5];

const countyKey = (c) => String(c).replace(/\s+county$/i, "").trim().toLowerCase();
const round4 = (n) => Math.round(n * 1e4) / 1e4;

function emptyPlace() {
  return {
    key: null, slug: null, name: null, kind: null, display_tier: null, min_zoom: null,
    label_min_zoom: null, sort_order: null, parent_key: null, parent_basis: null, parent_inside: null, breadcrumb: null,
    is_appellation: false, appellation_system: null, appellation_level: null,
    display: null, navigation_node: false, map_state: null, map_state_source: null,
    ucd_ava_id: null, cfr_section: null, area_km2: null, land_share: null,
    containment_share: null, legal_states: null, legal_source: null, state_shares: null,
  };
}

export function buildUsaTree({ avas, pairs, config }) {
  const t = { ...DEFAULT_THRESHOLDS, ...(config.thresholds ?? {}) };
  const waveStates = config.wave_states;
  const isWaveState = (code) => Object.hasOwn(waveStates, code);
  const stateKey = (code) => `${COUNTRY_KEY}.${waveStates[code].slug}`;

  const byId = new Map();
  for (const a of avas) {
    if (byId.has(a.id)) throw new Error(`duplicate AVA id ${a.id}`);
    byId.set(a.id, a);
  }
  const idByName = new Map(avas.map((a) => [a.name, a.id]));
  const idByFold = new Map(avas.map((a) => [foldAvaName(a.name), a.id]));
  const idForName = (name, what) => {
    const id = idByName.get(name);
    if (!id) throw new Error(`${what}: no AVA named "${name}"`);
    return id;
  };

  // 1. Map state (D6): the largest land share among the AVA's legal states,
  //    unless the owner overrode it.
  const overrides = config.state_overrides ?? {};
  for (const name of Object.keys(overrides)) idForName(name, "state_overrides");
  const legalOf = new Map();
  for (const a of avas) {
    const legal = [...(a.legal_states ?? [])].sort();
    if (legal.length === 0) throw new Error(`${a.name}: no legal state list (TTB or UC Davis)`);
    legalOf.set(a.id, new Set(legal));
  }
  const isLegal = (id, code) => legalOf.get(id).has(code);
  const byShare = (x, y) => y[1] - x[1] || x[0].localeCompare(y[0]);
  const mapState = new Map();
  const stateSource = new Map();
  for (const a of avas) {
    const measured = Object.entries(a.state_shares ?? {}).sort(byShare);
    if (measured.length === 0) throw new Error(`${a.name}: no state share; is it outside every state outline?`);
    const ranked = measured.filter(([code]) => isLegal(a.id, code));
    if (ranked.length === 0) {
      throw new Error(`${a.name}: no measured land in its legal states (${[...legalOf.get(a.id)].join("/")}); measured ${measured.map(([c]) => c).join("/")}`);
    }
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      throw new Error(`${a.name}: ${ranked[0][0]} and ${ranked[1][0]} hold equal shares; add a state_override`);
    }
    const override = Object.hasOwn(overrides, a.name) ? overrides[a.name] : null;
    if (override && !isLegal(a.id, override.state)) {
      throw new Error(`state_overrides[${a.name}]: ${override.state} is not one of its legal states (${[...legalOf.get(a.id)].join("/")})`);
    }
    mapState.set(a.id, override ? override.state : ranked[0][0]);
    stateSource.set(a.id, override ? "override" : "dominant");
  }

  // State containment (§8.2) over the legal states: area(AVA ∩ the legal
  // states' outlines, each buffered 0.05°) / area(AVA ∩ every state outline,
  // buffered). For one legal state that is exactly its buffered share; for
  // several, the measurement's union share, which it took over the states it
  // measured at 0.5% or more, so it counts only when that set is the legal set.
  const containmentOf = (a) => {
    const legal = [...legalOf.get(a.id)].sort();
    const buffered = a.buffered_shares ?? {};
    if (legal.length === 1) return Object.keys(buffered).length === 0 ? null : (buffered[legal[0]] ?? 0);
    const m = a.measured_containment ?? { states: [], share: null };
    if ([...m.states].sort().join(",") !== legal.join(",")) {
      throw new Error(`${a.name}: containment was measured over ${m.states.join("/") || "no states"}, not its legal states ${legal.join("/")}; re-measure (measure-usa-ava.mjs)`);
    }
    return m.share;
  };
  const inWave = (id) => isWaveState(mapState.get(id));

  const resolveToken = (token) => (byId.has(token) ? token : idByFold.get(foldAvaName(token)) ?? null);
  const ucdSaysWithin = (inner, outer) => byId.get(inner).ucd_within.some((token) => resolveToken(token) === outer);
  // "measured" (>= within), "legal_record" (>= withinLegalRecord and UC Davis
  // names the container), or null (not within).
  const nestBasis = (inner, outer, ratio) => {
    if (ratio >= t.within) return "measured";
    if (ratio >= t.withinLegalRecord && ucdSaysWithin(inner, outer)) return "legal_record";
    return null;
  };
  const containBasis = new Map(); // `${inner}>${outer}` -> { basis, ratio }
  const insideRatio = new Map(); // `${inner}>${outer}` -> measured ratio, for every pair

  // 2. Containment and partial overlap (§8.3).
  const containers = new Map(avas.map((a) => [a.id, []]));
  const overlaps = [];
  const nearWithin = [];
  for (const p of pairs) {
    const a = byId.get(p.a);
    const b = byId.get(p.b);
    if (!a || !b) throw new Error(`pair names an unknown AVA: ${p.a} / ${p.b}`);
    insideRatio.set(`${a.id}>${b.id}`, p.a_in_b);
    insideRatio.set(`${b.id}>${a.id}`, p.b_in_a);
    const aBasis = nestBasis(a.id, b.id, p.a_in_b);
    const bBasis = nestBasis(b.id, a.id, p.b_in_a);
    for (const [inner, outer, ratio, basis] of [[a.id, b.id, p.a_in_b, aBasis], [b.id, a.id, p.b_in_a, bBasis]]) {
      if (basis === null && ratio >= t.nearWithinReview) nearWithin.push({ inner, outer, ratio });
    }
    if (aBasis && bBasis) {
      throw new Error(`${a.name} and ${b.name} contain each other (${p.a_in_b}, ${p.b_in_a}); nearly identical outlines need an owner decision`);
    }
    if (aBasis) {
      containers.get(a.id).push(b.id);
      containBasis.set(`${a.id}>${b.id}`, { basis: aBasis, ratio: p.a_in_b });
    } else if (bBasis) {
      containers.get(b.id).push(a.id);
      containBasis.set(`${b.id}>${a.id}`, { basis: bBasis, ratio: p.b_in_a });
    } else {
      const aSmaller = a.area_km2 < b.area_km2 || (a.area_km2 === b.area_km2 && a.name < b.name);
      const ratio = aSmaller ? p.a_in_b : p.b_in_a;
      if (ratio > t.overlapMin) overlaps.push({ source: aSmaller ? a.id : b.id, target: aSmaller ? b.id : a.id, ratio });
    }
  }

  // 3. Primary parent (D7).
  const umbrellaState = new Map();
  for (const [code, names] of Object.entries(config.umbrellas ?? {})) {
    for (const name of names) umbrellaState.set(idForName(name, "umbrellas"), code);
  }
  const navNodes = config.navigation_nodes ?? [];
  for (const n of navNodes) for (const name of n.exclude ?? []) idForName(name, `navigation_nodes[${n.slug}].exclude`);
  const navOf = (a, state) => navNodes.find((n) => n.state === state && n.member_rule === "counties"
    && !(n.exclude ?? []).includes(a.name)
    && a.counties.length > 0
    && a.counties.every((c) => n.counties.map(countyKey).includes(countyKey(c))));
  const parentOverrides = config.parent_overrides ?? {};
  const byArea = (x, y) => byId.get(x).area_km2 - byId.get(y).area_km2 || byId.get(x).name.localeCompare(byId.get(y).name);
  const primary = new Map();
  for (const a of avas) {
    if (!inWave(a.id)) continue;
    const state = mapState.get(a.id);
    const sameState = containers.get(a.id).filter((id) => mapState.get(id) === state).sort(byArea);
    let parent;
    if (Object.hasOwn(parentOverrides, a.name)) {
      const target = parentOverrides[a.name];
      const node = navNodes.find((n) => n.state === state && n.slug === target);
      parent = node ? { type: "nav", node } : { type: "ava", id: idForName(target, `parent_overrides[${a.name}]`) };
    } else if (sameState.length > 0) {
      parent = { type: "ava", id: sameState[0] };
    } else {
      const node = umbrellaState.has(a.id) ? undefined : navOf(a, state);
      parent = node ? { type: "nav", node } : { type: "state" };
    }
    if (umbrellaState.has(a.id)) {
      if (umbrellaState.get(a.id) !== state) throw new Error(`umbrella ${a.name} is keyed under ${state}, not ${umbrellaState.get(a.id)}`);
      if (parent.type !== "state") throw new Error(`umbrella ${a.name} sits inside another AVA or node; it cannot be a SUBREGION under the state`);
    }
    primary.set(a.id, parent);
  }
  for (const id of umbrellaState.keys()) {
    if (!inWave(id)) throw new Error(`umbrella ${byId.get(id).name} is not keyed under a wave state`);
  }

  // 4. Keys, depth and the primary chain, parents first.
  const resolved = new Map();
  const visiting = new Set();
  const resolve = (id) => {
    if (resolved.has(id)) return resolved.get(id);
    if (visiting.has(id)) throw new Error(`containment cycle at ${byId.get(id).name}`);
    visiting.add(id);
    const p = primary.get(id);
    let parentKey;
    let depth;
    let chain;
    if (p.type === "ava") {
      const up = resolve(p.id);
      parentKey = up.key;
      depth = up.depth + 1;
      chain = [...up.chain, p.id];
    } else if (p.type === "nav") {
      parentKey = `${stateKey(p.node.state)}.${p.node.slug}`;
      depth = 0;
      chain = [];
    } else {
      parentKey = stateKey(mapState.get(id));
      depth = 0;
      chain = [];
    }
    const slug = placeSlug(byId.get(id).name);
    const r = { key: `${parentKey}.${slug}`, slug, parentKey, depth, chain };
    visiting.delete(id);
    resolved.set(id, r);
    return r;
  };

  // 5. Places.
  const places = [{
    ...emptyPlace(), key: COUNTRY_KEY, slug: COUNTRY_KEY, name: COUNTRY_NAME, kind: "COUNTRY",
    display_tier: 0, min_zoom: 1.5, label_min_zoom: 2,
  }];
  // The states draw from z1.5 (fill and label), not z4 like other countries'
  // regions: the "United States" chip frames California to New York, which a
  // 375 px phone fits at about z1.9 (tile zoom 1), and D26 promises the four
  // state washes there, and a tap on one to drill in. Tiles take floor(zoom),
  // so 1.5 puts them in the z1 tiles of the world archive.
  for (const [code, s] of Object.entries(waveStates)) {
    places.push({
      ...emptyPlace(), key: stateKey(code), slug: s.slug, name: s.name, kind: "REGION",
      display_tier: 1, min_zoom: 1.5, label_min_zoom: 1.5, parent_key: COUNTRY_KEY, map_state: code,
    });
  }
  for (const n of navNodes) {
    places.push({
      ...emptyPlace(), key: `${stateKey(n.state)}.${n.slug}`, slug: n.slug, name: n.name, kind: "SUBREGION",
      display_tier: 2, min_zoom: 5, label_min_zoom: 5, parent_key: stateKey(n.state),
      display: "outline", navigation_node: true, map_state: n.state,
    });
  }
  // How a place sits in its primary parent AVA: the containment basis, or
  // "override" when parent_overrides put it under an AVA that does not contain
  // it by either arm (its measured ratio, or null when the pair was never
  // measured). Null when the parent is a state or a navigation node.
  const parentFit = (id) => {
    const parent = primary.get(id);
    if (parent.type !== "ava") return { basis: null, inside: null };
    const k = `${id}>${parent.id}`;
    const cb = containBasis.get(k);
    return cb ? { basis: cb.basis, inside: cb.ratio } : { basis: "override", inside: insideRatio.get(k) ?? null };
  };
  for (const a of avas) {
    if (!inWave(a.id)) continue;
    const r = resolve(a.id);
    const fit = parentFit(a.id);
    const umbrella = umbrellaState.has(a.id);
    const [tier, minZoom, labelZoom] = umbrella ? UMBRELLA_ZOOMS : DEPTH_ZOOMS[Math.min(r.depth, DEPTH_ZOOMS.length - 1)];
    places.push({
      ...emptyPlace(), key: r.key, slug: r.slug, name: a.name,
      kind: umbrella ? "SUBREGION" : "APPELLATION",
      display_tier: tier, min_zoom: minZoom, label_min_zoom: labelZoom, parent_key: r.parentKey,
      parent_basis: fit.basis, parent_inside: fit.inside,
      is_appellation: true, appellation_system: "AVA",
      appellation_level: primary.get(a.id).type === "ava" ? "subregional" : "regional",
      display: a.area_km2 >= t.outlineKm2 ? "outline" : null,
      map_state: mapState.get(a.id), map_state_source: stateSource.get(a.id),
      ucd_ava_id: a.id, cfr_section: a.cfr ?? null, area_km2: a.area_km2,
      land_share: a.land_share ?? null, containment_share: containmentOf(a),
      legal_states: [...legalOf.get(a.id)].sort(), legal_source: a.legal_source ?? null, state_shares: a.state_shares,
    });
  }

  // 6. Integrity.
  const byKey = new Map();
  for (const p of places) {
    if (byKey.has(p.key)) throw new Error(`duplicate key ${p.key} (${byKey.get(p.key).name} / ${p.name})`);
    byKey.set(p.key, p);
  }
  for (const p of places) {
    if (p.parent_key === null) continue;
    const parent = byKey.get(p.parent_key);
    if (!parent) throw new Error(`${p.key}: parent ${p.parent_key} is not a place`);
    if (p.display_tier < parent.display_tier) throw new Error(`${p.key}: tier ${p.display_tier} is above its parent's ${parent.display_tier}`);
    if (p.label_min_zoom > 10) throw new Error(`${p.key}: label_min_zoom ${p.label_min_zoom} > 10 (D16)`);
  }
  for (const n of navNodes) {
    const k = `${stateKey(n.state)}.${n.slug}`;
    if (!places.some((p) => p.parent_key === k)) throw new Error(`navigation node ${n.name} has no member`);
  }

  // 7. Sort order, breadcrumbs, tree order.
  const children = new Map();
  for (const p of places) {
    if (p.parent_key === null) continue;
    if (!children.has(p.parent_key)) children.set(p.parent_key, []);
    children.get(p.parent_key).push(p);
  }
  const collator = new Intl.Collator("en");
  for (const list of children.values()) {
    list.sort((x, y) => collator.compare(x.name, y.name) || x.key.localeCompare(y.key));
    list.forEach((p, i) => { p.sort_order = (i + 1) * 10; });
  }
  byKey.get(COUNTRY_KEY).sort_order = COUNTRY_SORT;
  const ordered = [];
  const walk = (p, trail) => {
    p.breadcrumb = [...trail, p.name].join(" › ");
    ordered.push(p);
    for (const c of children.get(p.key) ?? []) walk(c, [...trail, p.name]);
  };
  walk(byKey.get(COUNTRY_KEY), []);
  if (ordered.length !== places.length) throw new Error("some places are not reachable from the country");

  // 8. Edges (D7, §8.3).
  const keyOf = (id) => resolved.get(id).key;
  const nameOf = (id) => byId.get(id).name;
  const edges = [];
  const deferredEdges = [];
  for (const a of avas) {
    if (!inWave(a.id)) continue;
    const onChain = new Set(resolved.get(a.id).chain);
    for (const c of containers.get(a.id)) {
      if (onChain.has(c)) continue;
      const cb = containBasis.get(`${a.id}>${c}`);
      const extra = cb.basis === "legal_record" ? { basis: "within_legal_record", ratio: round4(cb.ratio) } : { basis: "within" };
      if (inWave(c)) edges.push({ type: "ALTERNATE_PARENT", source_key: keyOf(a.id), target_key: keyOf(c), ...extra });
      else deferredEdges.push({ type: "ALTERNATE_PARENT", source: a.name, target: nameOf(c), reason: `${nameOf(c)} is keyed under ${mapState.get(c)}, outside wave 1` });
    }
    for (const [code, share] of Object.entries(a.state_shares)) {
      if (code === mapState.get(a.id) || share < t.stateEdgeMin || !isLegal(a.id, code)) continue;
      if (isWaveState(code)) edges.push({ type: "ALTERNATE_PARENT", source_key: keyOf(a.id), target_key: stateKey(code), basis: "state_share", share: round4(share) });
      else deferredEdges.push({ type: "ALTERNATE_PARENT", source: a.name, target: code, share: round4(share), reason: `${code} is not a wave-1 state` });
    }
  }
  const ancestorOverlaps = [];
  for (const o of overlaps) {
    if (inWave(o.source) && inWave(o.target)) {
      const onChain = resolved.get(o.source).chain.includes(o.target) || resolved.get(o.target).chain.includes(o.source);
      if (onChain) {
        const [inner, outer] = resolved.get(o.source).chain.includes(o.target) ? [o.source, o.target] : [o.target, o.source];
        ancestorOverlaps.push({ key: keyOf(inner), name: nameOf(inner), ancestor: nameOf(outer), ancestor_key: keyOf(outer), ratio: round4(o.ratio) });
        continue;
      }
      edges.push({ type: "OVERLAPS", source_key: keyOf(o.source), target_key: keyOf(o.target), basis: "partial_overlap", ratio: round4(o.ratio) });
    } else {
      deferredEdges.push({ type: "OVERLAPS", source: nameOf(o.source), target: nameOf(o.target), ratio: round4(o.ratio), reason: "one side is outside wave 1" });
    }
  }
  edges.sort((x, y) => x.type.localeCompare(y.type) || x.source_key.localeCompare(y.source_key) || x.target_key.localeCompare(y.target_key));
  deferredEdges.sort((x, y) => x.type.localeCompare(y.type) || x.source.localeCompare(y.source) || String(x.target).localeCompare(String(y.target)));

  // 9. Deferred AVAs and the review lists.
  const deferred = avas.filter((a) => !inWave(a.id))
    .map((a) => ({ ucd_ava_id: a.id, name: a.name, map_state: mapState.get(a.id), legal_states: [...legalOf.get(a.id)].sort(), state_shares: a.state_shares, reason: `dominant state ${mapState.get(a.id)} is outside wave 1` }))
    .sort((x, y) => x.name.localeCompare(y.name));
  const withinDisagreements = [];
  const stateListDisagreements = [];
  for (const a of avas) {
    if (!inWave(a.id)) continue;
    const computed = new Set(containers.get(a.id));
    const said = a.ucd_within.map((token) => [token, resolveToken(token)]);
    const saidIds = new Set(said.map(([, id]) => id).filter(Boolean));
    const entry = {
      key: keyOf(a.id),
      name: a.name,
      ucd_within_not_computed: [...saidIds].filter((id) => !computed.has(id)).map(nameOf).sort(),
      computed_not_in_ucd_within: [...computed].filter((id) => !saidIds.has(id)).map(nameOf).sort(),
      ucd_contains_not_computed: a.ucd_contains.map(resolveToken)
        .filter((id) => id !== null && !containers.get(id).includes(a.id)).map(nameOf).sort(),
      unresolved_tokens: [...said.filter(([, id]) => id === null).map(([token]) => token),
        ...a.ucd_contains.filter((token) => resolveToken(token) === null)].sort(),
    };
    if (entry.ucd_within_not_computed.length || entry.computed_not_in_ucd_within.length
      || entry.ucd_contains_not_computed.length || entry.unresolved_tokens.length) withinDisagreements.push(entry);
    const legal = [...legalOf.get(a.id)].sort();
    const ucd = [...a.ucd_states].sort();
    const measured = Object.entries(a.state_shares).filter(([, s]) => s >= t.stateEdgeMin).map(([c]) => c).sort();
    const withheld = Object.entries(a.state_shares).filter(([c]) => !isLegal(a.id, c)).sort(byShare)
      .map(([state, share]) => ({ state, share }));
    const measuredDominant = Object.entries(a.state_shares).sort(byShare)[0][0];
    if (measured.join(",") !== legal.join(",") || ucd.join(",") !== legal.join(",") || withheld.length > 0) {
      stateListDisagreements.push({
        key: keyOf(a.id), name: a.name, legal_states: legal, legal_source: a.legal_source ?? null,
        ucd_states: ucd, measured_states: measured, withheld_states: withheld,
        measured_dominant: measuredDominant, map_state: mapState.get(a.id),
      });
    }
  }
  const avaPlaces = ordered.filter((p) => p.ucd_ava_id !== null);
  const review = {
    within_disagreements: withinDisagreements.sort((x, y) => x.key.localeCompare(y.key)),
    low_land_share: avaPlaces.filter((p) => p.land_share !== null && p.land_share < t.landShareReview)
      .map((p) => ({ key: p.key, land_share: p.land_share })),
    low_containment: avaPlaces.filter((p) => p.containment_share !== null && p.containment_share < t.containmentMin)
      .map((p) => ({ key: p.key, containment_share: p.containment_share })),
    state_list_disagreements: stateListDisagreements.sort((x, y) => x.key.localeCompare(y.key)),
    // Placed as NOT within (the ratio is under `within`), so no parent or
    // ALTERNATE_PARENT edge came from it; an OVERLAPS edge did. A container
    // already on the place's primary chain (an ancestor reached another way)
    // is left out: nothing about the placement would change.
    near_within: nearWithin
      .filter(({ inner, outer }) => inWave(inner) && !resolved.get(inner).chain.includes(outer))
      .map(({ inner, outer, ratio }) => ({
        key: keyOf(inner),
        name: nameOf(inner),
        container: nameOf(outer),
        container_key: inWave(outer) ? keyOf(outer) : null,
        ratio: round4(ratio),
        ucd_says_within: byId.get(inner).ucd_within.some((token) => resolveToken(token) === outer),
      }))
      .sort((x, y) => x.key.localeCompare(y.key) || x.container.localeCompare(y.container)),
    ancestor_overlaps: ancestorOverlaps.sort((x, y) => x.key.localeCompare(y.key)),
    legal_record_nests: [...containBasis.entries()]
      .filter(([k, v]) => v.basis === "legal_record" && inWave(k.split(">")[0]))
      .map(([k, v]) => {
        const [inner, outer] = k.split(">");
        const p = primary.get(inner);
        return {
          key: keyOf(inner), name: nameOf(inner), container: nameOf(outer),
          container_key: inWave(outer) ? keyOf(outer) : null, ratio: round4(v.ratio),
          primary: p.type === "ava" && p.id === outer,
        };
      })
      .sort((x, y) => x.key.localeCompare(y.key) || x.container.localeCompare(y.container)),
  };
  return { places: ordered, edges, deferred, deferred_edges: deferredEdges, review, thresholds: t };
}
