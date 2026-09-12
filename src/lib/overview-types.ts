// Data contracts for the Overview page (/overview). Defined apart from the
// fetcher so the page components and getOverviewData can be built and reviewed
// independently. Every field is computed from RLS-readable rows or an existing
// SECURITY DEFINER RPC — no new migrations.

import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";

export type DistributionItem = { label: string; count: number };

export type LiveBanner = {
  kind: "live";
  tastingId: string;
  name: string;
  hosting: boolean;
  hostName: string;
  revealMode: RevealMode;
  /** Rides along for the add-wine sheet's flight destination (7i hint). */
  wineSource: WineSourceMode;
  /** 1-based index of the wine in play (the first not-fully-revealed wine). */
  wineIndex: number;
  wineCount: number;
  /** "guessing open" | "{category} revealed" | "all revealed" | "" (OPEN). */
  stage: string;
  /** Null when the viewer is not a competitor (host of a host-provides tasting)
      or the tasting is OPEN. `matchedOf` is set for semi-blind tastings. */
  standing: {
    rank: number;
    competitors: number;
    points: number;
    matchedOf?: number;
  } | null;
  peopleCount: number;
};

export type NextUpBanner = {
  kind: "next";
  tastingId: string;
  name: string;
  hosting: boolean;
  hostName: string;
  scheduledAt: string | null;
  /** The flight's slots (padded to 6 for a host-provides flight). `note` is
      a muted suffix after a filled label — "set" for a host-provides wine;
      bring-your-own slots carry the contributor's name and no note. */
  slots: { label: string; filled: boolean; note?: string }[];
  canAddWine: boolean;
  nextWinePosition: number;
  /** The add-wine sheet's flight destination needs both — "Add wine N" opens
      the sheet, not the legacy page. */
  revealMode: RevealMode;
  wineSource: WineSourceMode;
};

export type EmptyBanner = { kind: "none" };

export type OverviewBanner = LiveBanner | NextUpBanner | EmptyBanner;

export type TastingRow =
  | {
      kind: "invite";
      tastingId: string;
      name: string;
      hostName: string;
      scheduledAt: string | null;
    }
  | {
      kind: "hosting";
      tastingId: string;
      name: string;
      scheduledAt: string | null;
      detail: string;
    }
  | { kind: "self-paced"; tastingId: string; name: string; detail: string }
  | {
      kind: "finished";
      tastingId: string;
      name: string;
      finishedAt: string;
      placement: { rank: number; points: number } | null;
    };

export type OverviewTastings = {
  tastings: number;
  averagePoints: number;
  /** Null until at least one region guess has been scored. */
  regionHitPct: number | null;
  /** At most 5, ordered invite → hosting → self-paced → finished. */
  rows: TastingRow[];
};

export type RatingRow = {
  noteId: string;
  catalogWineId: string;
  title: string;
  imageUrl: string | null;
  tastedOn: string;
  contextKind: "OPEN" | "BLIND" | "TRAINING";
  score: number | null;
};

export type OverviewRatings = {
  winesRated: number;
  averageScore: number | null;
  notes: number;
  /** At most 5, newest first. */
  rows: RatingRow[];
};

export type CellarTile = {
  lotId: string;
  catalogWineId: string;
  title: string;
  imageUrl: string | null;
};

export type CellarRecent = {
  lotId: string;
  catalogWineId: string;
  title: string;
  location: string | null;
  quantity: number;
};

export type OverviewCellar = {
  bottles: number;
  producers: number;
  countries: number;
  /** At most 4, newest first. */
  tiles: CellarTile[];
  /** bottles − Σ quantity of the tiles' lots (the "+N" tile). */
  remainingBottles: number;
  /** At most 4 entries including "Other". */
  byCountry: DistributionItem[];
  /** At most 4 entries including "Other". */
  byType: DistributionItem[];
  /** At most 3, newest first. */
  recent: CellarRecent[];
};

export type OverviewData = {
  banner: OverviewBanner;
  tastings: OverviewTastings;
  ratings: OverviewRatings;
  cellar: OverviewCellar;
};
