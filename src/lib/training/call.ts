// Your call's rules (training-room region-guess addendum R5, R7): the region
// options, the grape chips a region offers, how a tap changes the pick, and the
// pick the attempt stores. Pure, relative imports only, so vitest pins it.
import { foldName } from "../wine-identity/fold";
import { shortName } from "./copy";
import { CALL_LIMIT, CALL_SEARCH_LIMIT } from "./panel";
import type { CallPick, Named, RankedCandidate, RegionGroup, TrainingCandidate } from "./types";

/** Nothing picked: a fresh session, and "It's not in the list". */
export const NO_CALL: CallPick = { pickedArchetypeId: null, pickedRegionId: null, pickedGrapeId: null };

/**
 * Step 1's regions (R5): the top five groups (plus the picked one when it sits
 * further down), or — with a query — every group whose region or country, or
 * one of whose typical wines or appellations, contains it, accents and
 * punctuation folded, in ranking order.
 */
export function regionCallOptions(
  groups: readonly RegionGroup[],
  query: string,
  pickedRegionId: string | null,
): RegionGroup[] {
  const key = foldName(query);
  if (key !== "") {
    return groups
      .filter((g) =>
        [
          g.region.name,
          g.country.name,
          ...g.members.flatMap((m) => [shortName(m.candidate.name), m.candidate.appellation.name]),
        ].some((n) => foldName(n).includes(key)),
      )
      .slice(0, CALL_SEARCH_LIMIT);
  }
  const top = groups.slice(0, CALL_LIMIT);
  if (pickedRegionId && !top.some((g) => g.key === pickedRegionId)) {
    const picked = groups.find((g) => g.key === pickedRegionId);
    if (picked) return [...top, picked];
  }
  return top;
}

/**
 * Step 3's chips (R5): the grapes the region's typical wines name, primary and
 * secondary, once each — most named first, then most often primary, then by
 * name.
 */
export function regionGrapeChoices(members: readonly RankedCandidate[]): Named[] {
  const tally = new Map<string, { grape: Named; count: number; primary: number }>();
  const add = (grape: Named, primary: boolean) => {
    const t = tally.get(grape.id) ?? { grape, count: 0, primary: 0 };
    t.count += 1;
    if (primary) t.primary += 1;
    tally.set(grape.id, t);
  };
  for (const m of members) {
    add(m.candidate.primaryGrape, true);
    if (m.candidate.secondaryGrape) add(m.candidate.secondaryGrape, false);
  }
  return [...tally.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.primary - a.primary ||
        a.grape.name.localeCompare(b.grape.name, "en") ||
        a.grape.id.localeCompare(b.grape.id),
    )
    .map((t) => ({ id: t.grape.id, name: t.grape.name }));
}

/** The chips on screen: the region's grapes, plus a grape picked through
    "Other grape…" that is not among them (so the pick stays visible). */
export function grapeChips(
  choices: readonly Named[],
  pickedGrapeId: string | null,
  grapes: readonly Named[],
): Named[] {
  if (!pickedGrapeId || choices.some((c) => c.id === pickedGrapeId)) return [...choices];
  const extra = grapes.find((g) => g.id === pickedGrapeId);
  return extra ? [...choices, extra] : [...choices];
}

/** A region tap: the same region changes nothing; another clears the deeper
    choice and the grape (R5). */
export function chooseRegion(pick: CallPick, regionId: string): CallPick {
  if (pick.pickedRegionId === regionId) return pick;
  return { pickedArchetypeId: null, pickedRegionId: regionId, pickedGrapeId: null };
}

/** "Just the region" (null) or one of the region's typical wines. The grape is
    kept: it is hidden while a wine is chosen and never sent with one. */
export function chooseDeeper(pick: CallPick, archetypeId: string | null): CallPick {
  return { ...pick, pickedArchetypeId: archetypeId };
}

/** A grape chip or "Other grape…" pick (null: none). Only with a region. */
export function chooseGrape(pick: CallPick, grapeId: string | null): CallPick {
  return pick.pickedRegionId === null ? pick : { ...pick, pickedGrapeId: grapeId };
}

/**
 * A stored pick made consistent with today's pool (a draft from before the
 * region step, or one whose rows left the pool): a typical wine names its own
 * region; a wine no longer in the pool is dropped; a region no wine of the pool
 * is in is dropped with its grape; a grape never stands without a region.
 * Given the grapes the page loaded, a grape no longer among them (merged away
 * since the draft was saved) is dropped too, rather than sent for the RPC to
 * refuse with nothing on screen to undo.
 */
export function normalizeCall(
  pick: CallPick,
  pool: readonly TrainingCandidate[],
  knownGrapeIds?: readonly string[],
): CallPick {
  const wine = pick.pickedArchetypeId ? pool.find((c) => c.id === pick.pickedArchetypeId) : undefined;
  const regionId = wine ? wine.region.id : pick.pickedRegionId;
  const regionKnown = regionId !== null && pool.some((c) => c.region.id === regionId);
  const grapeKnown =
    pick.pickedGrapeId !== null && (knownGrapeIds === undefined || knownGrapeIds.includes(pick.pickedGrapeId));
  return {
    pickedArchetypeId: wine ? wine.id : null,
    pickedRegionId: regionKnown ? regionId : null,
    pickedGrapeId: regionKnown && grapeKnown ? pick.pickedGrapeId : null,
  };
}

/**
 * The pick the attempt stores (R7's checks): a typical wine alone, or a region
 * with an optional grape, or nothing.
 */
export function callPayload(pick: CallPick): CallPick {
  if (pick.pickedArchetypeId !== null) {
    return { pickedArchetypeId: pick.pickedArchetypeId, pickedRegionId: null, pickedGrapeId: null };
  }
  if (pick.pickedRegionId === null) return NO_CALL;
  return { pickedArchetypeId: null, pickedRegionId: pick.pickedRegionId, pickedGrapeId: pick.pickedGrapeId };
}
