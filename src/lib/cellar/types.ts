// Shared contracts for the cellar and catalog redesign (CC-P0). No runtime
// code beyond COLOUR_ORDER: every later task can `import type` this file
// without pulling anything into vitest's module graph.

export type WineColour = "WHITE" | "ROSE" | "RED" | "ORANGE";
export type WineStyle = "STILL" | "SPARKLING" | "FORTIFIED" | "SWEET";
export type VintageKind = "YEAR" | "NV" | "TAWNY";
export type ConsumptionReason = "DRANK" | "GIFTED" | "LOST" | "OTHER";

export const COLOUR_ORDER: readonly WineColour[] = [
  "RED",
  "WHITE",
  "ROSE",
  "ORANGE",
];

export type BottleWine = {
  catalogWineId: string;
  /** catalogWineTitle — the search haystack and the note modals' title. */
  title: string;
  producer: string | null;
  wineName: string | null;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  primaryGrape: string | null;
  colour: WineColour | null;
  style: WineStyle | null;
  /** type_designations.name — "Riserva", "Grosses Gewächs". */
  designation: string | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  imageUrl: string | null;
};

export type BottleLot = {
  id: string;
  quantity: number;
  purchasedQuantity: number;
  bottleSizeMl: number;
  storageLocation: string | null;
  /** date (YYYY-MM-DD) or null */
  purchasedOn: string | null;
  purchaseSource: string | null;
  pricePerBottle: number | null;
  currency: string;
  drinkFrom: number | null;
  drinkTo: number | null;
  lotNote: string | null;
  /** timestamptz ISO */
  createdAt: string;
};

export type CommunityRating = { avg: number | null; count: number };
/** D3: the viewer's most recent scored note on the wine. */
export type YourScore = { noteId: string; score: number; tastedOn: string };

export type BottleRow = {
  lot: BottleLot;
  wine: BottleWine;
  community: CommunityRating;
  yours: YourScore | null;
  /** D9: this lot's bottles committed to a flight and not yet poured. */
  inFlight: number;
};

export type GroupKey =
  | "none"
  | "where"
  | "country"
  | "region"
  | "appellation"
  | "producer"
  | "grape"
  | "vintage"
  | "colour";
export type Dimension =
  | "countries"
  | "regions"
  | "producers"
  | "grapes"
  | "vintages";
export type SortKey = "bottles" | "name" | "added" | "yours" | "community";
export type FilterState = {
  country: string | null;
  region: string | null;
  colour: WineColour | null;
  grape: string | null;
  /** the vintage label ("2016", "NV") — a phone-only filter (spec §5.1) */
  vintage: string | null;
};
export type CellarView = "list" | "grid";

export type HistoryRow = {
  id: string;
  lotId: string | null;
  catalogWineId: string;
  /** lotTitle: "{producer}, {wine} {vintage}" */
  title: string;
  reason: ConsumptionReason;
  quantity: number;
  /** date */
  consumedOn: string;
  createdAt: string;
  occasion: string | null;
  note: { id: string; score: number | null } | null;
  /** D8: from wine_pour_intents.cellar_consumption_id → wines.tasting_id */
  tasting: { id: string; name: string } | null;
};
export type HistoryFilter = "all" | "drank" | "gifted" | "tasting" | "noNote";

export type LotConsumption = Pick<
  HistoryRow,
  "id" | "consumedOn" | "reason" | "quantity" | "occasion" | "note" | "tasting"
>;
export type RatingSpread = {
  avg: number | null;
  count: number;
  highest: number | null;
  lowest: number | null;
  byFriends: number;
};
export type LotSheetData = {
  row: BottleRow;
  yours: {
    noteId: string;
    score: number;
    band: string;
    tastedOn: string;
    assessed: { done: number; total: number };
  } | null;
  community: RatingSpread;
  history: LotConsumption[];
};

export type Bar = { label: string; value: number };
export type CollectionStats = {
  bottles: number;
  wines: number;
  tasted: number;
  toGo: number;
  yourAverage: number | null;
  communityAverage: number | null;
  best: { score: number; title: string } | null;
  countries: number;
  regions: number;
  producers: number;
  grapes: number;
  years: number;
  byRegion: Bar[];
  byProducer: Bar[];
  byGrape: Bar[];
  byColour: Bar[];
  byDecade: Bar[];
};
