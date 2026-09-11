// Data contracts for the Your numbers page (/profile/numbers). Defined apart
// from the fetcher so the page and getYourNumbers can be built independently.
import type { DistributionItem } from "@/lib/overview-types";

export type NumbersRange = "all" | "year" | "90d";
export const NUMBERS_RANGES: NumbersRange[] = ["all", "year", "90d"];

export function parseNumbersRange(raw: string | undefined): NumbersRange {
  return NUMBERS_RANGES.includes(raw as NumbersRange)
    ? (raw as NumbersRange)
    : "all";
}

export type AccuracyRow = { label: string; correct: number; applicable: number };
export type PointsPerTasting = {
  tastingId: string;
  name: string;
  points: number;
  scoredAt: string;
};
export type CountRow = { label: string; count: number };

export type NumbersTastings = {
  played: number;
  glasses: number;
  averagePoints: number;
  /** Country, Region, Appellation, Grape, Vintage ±1, Producer — in this order. */
  accuracy: AccuracyRow[];
  /** Oldest → newest, at most 8. */
  recent: PointsPerTasting[];
  best: { points: number; name: string } | null;
  /** Null when fewer than 4 tastings. */
  trend: { delta: number; over: number } | null;
  placements: { first: number; second: number; third: number; lower: number };
  /** At most 4, each backed by at least 2 wines. */
  bestRegions: { label: string; avgPoints: number; wines: number }[];
};

export type NumbersRatings = {
  winesRated: number;
  notes: number;
  averageScore: number | null;
  /** "<80", "80–84", "85–89", "90–94", "95+". */
  scoreBuckets: CountRow[];
  byType: DistributionItem[];
  byCountry: DistributionItem[];
  /** At most 4. */
  topGrapes: CountRow[];
  /** 8 calendar months oldest → newest, label = short month ("Feb"). */
  perMonth: CountRow[];
  thisMonth: { count: number; isBest: boolean };
  longestStreakWeeks: number;
};

export type NumbersCellar = {
  bottles: number;
  producers: number;
  countries: number;
  byCountry: DistributionItem[];
  byType: DistributionItem[];
  redsByGrape: DistributionItem[];
  /** "≤2010", "2011–14", "2015–17", "2018–20", "2021+". */
  vintageBuckets: CountRow[];
  oldest: { title: string; year: number } | null;
  medianVintage: number | null;
  /** 6 calendar months oldest → newest. */
  movements: { label: string; added: number; drunk: number }[];
  addedInRange: number;
  openedInRange: number;
};

export type YourNumbers = {
  range: NumbersRange;
  userId: string;
  displayName: string;
  /** profiles.created_at, ISO. */
  since: string;
  tastings: NumbersTastings;
  ratings: NumbersRatings;
  cellar: NumbersCellar;
};
