// The ranking grouped by scoring region (training-room region-guess addendum,
// docs/superpowers/specs/2026-09-27-training-room-region-guess.md R1-R3): a
// group is one `regions` row with its typical wines in ranking order, standing
// at its best member's closeness. The matcher is unchanged; this only regroups
// its output. Also the candidate list's view of those groups (top five, Show
// all, the "Unlikely" section) and which group rows are open. Pure, relative
// imports only, so vitest pins it.
import { TRAINING_COPY } from "./copy";
import { PANEL_LIMIT, isBeforeAnswers } from "./panel";
import type { MapPlaceRef, RankedCandidate, RegionGroup } from "./types";

function bucket(g: RegionGroup): number {
  if (g.capped !== null) return 2;
  return g.closeness === null ? 1 : 0;
}

function byPlace(x: RegionGroup, y: RegionGroup): number {
  return (
    x.country.name.localeCompare(y.country.name, "en") ||
    x.region.name.localeCompare(y.region.name, "en") ||
    x.key.localeCompare(y.key)
  );
}

// R2: uncapped groups with a number first (closeness desc), then uncapped
// groups without one, then capped groups (closeness desc, nulls last); ties —
// and the whole un-numbered bucket — by country, then region.
function compareGroups(x: RegionGroup, y: RegionGroup): number {
  const bx = bucket(x);
  const by = bucket(y);
  if (bx !== by) return bx - by;
  if (x.closeness !== y.closeness) {
    if (x.closeness === null) return 1;
    if (y.closeness === null) return -1;
    return y.closeness - x.closeness;
  }
  return byPlace(x, y);
}

/**
 * A group's map region (training-room-map spec RM5): the one most members sit
 * in, ties by key; null when no member is on the map. Live, every placed
 * group's members agree; this only has to be deterministic when they do not.
 */
export function groupMapRegion(members: readonly RankedCandidate[]): MapPlaceRef | null {
  const votes = new Map<string, { ref: MapPlaceRef; n: number }>();
  for (const m of members) {
    const ref = m.candidate.mapRegion;
    if (!ref) continue;
    const v = votes.get(ref.key);
    if (v) v.n += 1;
    else votes.set(ref.key, { ref, n: 1 });
  }
  let best: { ref: MapPlaceRef; n: number } | null = null;
  for (const v of votes.values()) {
    if (!best || v.n > best.n || (v.n === best.n && v.ref.key < best.ref.key)) best = v;
  }
  return best ? { key: best.ref.key, name: best.ref.name } : null;
}

/**
 * rankCandidates' output (spec §5.8 order) as region groups (R1, R2). Members
 * keep the ranking's order, so a group's first uncapped member is its best —
 * the ranking puts every uncapped number before the uncapped nulls and every
 * uncapped wine before a capped one. A group with no uncapped member is capped
 * and stands at its first (best capped) member.
 */
export function groupRanking(ranked: readonly RankedCandidate[]): RegionGroup[] {
  const members = new Map<string, RankedCandidate[]>();
  for (const r of ranked) {
    const list = members.get(r.candidate.region.id);
    if (list) list.push(r);
    else members.set(r.candidate.region.id, [r]);
  }
  const groups: RegionGroup[] = [];
  for (const [key, list] of members) {
    const best = list.find((r) => r.capped === null) ?? list[0];
    groups.push({
      key,
      region: best.candidate.region,
      country: best.candidate.country,
      closeness: best.closeness,
      capped: best.capped,
      best,
      members: list,
      mapRegion: groupMapRegion(list),
    });
  }
  return groups.sort(compareGroups);
}

/** A wine of the ranking by archetype id, wherever its group is; null when none. */
export function findMember(groups: readonly RegionGroup[], id: string): RankedCandidate | null {
  for (const g of groups) {
    const hit = g.members.find((r) => r.candidate.id === id);
    if (hit) return hit;
  }
  return null;
}

export type RegionSection = { key: "likely" | "unlikely"; heading: string | null; groups: RegionGroup[] };
export type RegionPanelView = {
  /** Nothing answered yet that any wine can be measured on, and nothing capped. */
  before: boolean;
  sections: RegionSection[];
  /** Every group, shown or not ("Show all {n} regions"). */
  total: number;
  hidden: number;
  /** The top group's key: it starts expanded (R3). Null for an empty pool. */
  topKey: string | null;
};

/**
 * The laptop column's and the phone sheet's list (R3): the top `limit` groups
 * until Show all, the uncapped ones without a heading, the capped ones after
 * them under "Unlikely from what you've said".
 */
export function regionPanelView(
  groups: readonly RegionGroup[],
  showAll: boolean,
  limit: number = PANEL_LIMIT,
): RegionPanelView {
  const shown = showAll ? [...groups] : groups.slice(0, limit);
  const sections: RegionSection[] = [];
  for (const g of shown) {
    const key = g.capped !== null ? "unlikely" : "likely";
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.groups.push(g);
    else sections.push({ key, heading: key === "unlikely" ? TRAINING_COPY.unlikelyGroup : null, groups: [g] });
  }
  return {
    before: isBeforeAnswers(groups.flatMap((g) => g.members)),
    sections,
    total: groups.length,
    hidden: groups.length - shown.length,
    topKey: groups[0]?.key ?? null,
  };
}

/** The group rows the taster opened or closed by hand, by group key. */
export type ExpandState = Readonly<Record<string, boolean>>;

/** Whether a group row is open: the taster's own choice, else only the top group (R3). */
export function groupExpanded(key: string, topKey: string | null, state: ExpandState): boolean {
  return state[key] ?? key === topKey;
}

/** The state after a tap on a group row: that row flips from what it shows now. */
export function toggleGroup(state: ExpandState, key: string, topKey: string | null): ExpandState {
  return { ...state, [key]: !groupExpanded(key, topKey, state) };
}
