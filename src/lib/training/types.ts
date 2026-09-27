// The training room's shared types (spec 2026-09-25-training-room-design.md
// §7.1; plan Interface Contracts). A plain module — no "use server", no React,
// no runtime code — so the server page, the server actions, the pure matcher
// and the client room can all import it. Relative type imports only: vitest
// has no `@/` alias (the imports are erased anyway, but the repo's pure modules
// keep them relative so nobody has to check).
import type { WineColour, WineStyle, WsetNoteState } from "../wset/types";

/** A SAT range on a scale's ladder: [low, high] enum values (spec §4.4). */
export type Range = [string, string];

export type Named = { id: string; name: string };

/** One archetype as the room sees it (spec §4.6): the scoring identity as
    reference FKs with their display names, the SAT ranges and the aromas. */
export type TrainingCandidate = {
  id: string;
  name: string;
  description: string | null;
  colour: WineColour;
  style: WineStyle;
  country: Named;
  region: Named;
  appellation: Named & { isRegional: boolean };
  primaryGrape: Named;
  secondaryGrape: Named | null;
  designations: Named[];
  typicalAge: [number, number] | null;
  sat: Record<string, Range | undefined>;
  aromas: {
    termId: string;
    term: string;
    group: string;
    kind: "NOSE" | "PALATE";
    signature: boolean;
  }[];
  placeCanonicalKey: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
};

/** Facts the form states beside the SAT scales (D19). null = not answered. */
export type MatchExtras = { bubbles: boolean | null; fortified: boolean | null };

export type CapReason = "colour" | "bubbles" | "fortified";

export type RankedCandidate = {
  candidate: TrainingCandidate;
  /** 0..100; null when nothing answered applies to this candidate. */
  closeness: number | null;
  capped: CapReason | null;
  /** Spec §5.7; null before anything answered applies. */
  explanation: string | null;
  /** The exact signature terms the taster picked (every hit, in the
      candidate's aroma order; only the first two earn the bonus). */
  signatureHits: string[];
};

/** One region of the ranking (region-guess addendum R1, R2): its typical wines
    in ranking order, and its standing — the best uncapped member's closeness,
    or, when every member is capped, the best capped one's (`capped` is then
    that member's reason, null otherwise). `key` is the region id. */
export type RegionGroup = {
  key: string;
  region: Named;
  country: Named;
  closeness: number | null;
  capped: CapReason | null;
  best: RankedCandidate;
  members: RankedCandidate[];
};

/** What Your call has picked (addendum R5): a region, optionally a grape, or a
    typical wine of that region. The device draft carries the same three fields. */
export type CallPick = {
  pickedArchetypeId: string | null;
  pickedRegionId: string | null;
  pickedGrapeId: string | null;
};

/** The whole ranking, frozen into the attempt at reveal (spec §5.8). */
export type RankingSnapshot = {
  archetypeId: string;
  name: string;
  closeness: number | null;
  rank: number;
  capped: CapReason | null;
}[];

/** wset_aroma_terms by term id → its term and group_name (spec §5.1). */
export type AromaLexicon = Record<string, { term: string; group: string }>;

export type VintageGuess =
  | { kind: "YEAR"; year: number }
  | { kind: "NV" }
  | { kind: "TAWNY"; years: number }
  | null;

/** An unfinished session, kept on the device only (D13). */
export type TrainingDraft = {
  userId: string;
  sessionKey: string;
  startedAt: string;
  note: WsetNoteState;
  extras: MatchExtras;
  pickedArchetypeId: string | null;
  vintage: VintageGuess;
};

export type PointCategory =
  | "country"
  | "region"
  | "appellation"
  | "primaryGrape"
  | "secondaryGrape"
  | "typeDesignation"
  | "vintage";

/** One row of Your sessions (spec §3.6). */
export type AttemptRow = {
  id: string;
  createdAt: string;
  picked: Named | null;
  vintage: VintageGuess;
  actual: { catalogWineId: string; label: string | null; lineage: string | null } | null;
  actualArchetype: Named | null;
  hueCleared: boolean;
  noteColourHue: string | null;
  points: Record<PointCategory, number | null>;
  total: number | null;
  possible: number | null;
  snapshot: RankingSnapshot;
};
