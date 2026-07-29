// Single source of the WSET Level 4 SAT vocabulary as TypeScript. Every enum
// below is a string-literal union whose members match the Postgres enum values
// verbatim — see supabase/migrations/20260829193000_cellar_catalog.sql
// (wine_colour, wine_style), 20260829194000_wset_notes.sql (all wset_* scale
// enums) and 20260829195000_wset_aroma_seed.sql (wset_aroma_family). Keep
// these in lockstep with those enums: the DB rejects off-vocabulary values.
import type { VintageKind } from "@/lib/supabase/database.types";

// catalog_wines.colour / catalog_wines.style
export type WineColour = "WHITE" | "ROSE" | "RED";
export type WineStyle = "STILL" | "SPARKLING" | "FORTIFIED";

// wset_notes scale enums (every one nullable on a note until rated)
export type Clarity = "CLEAR" | "HAZY";
export type Condition = "CLEAN" | "UNCLEAN";
export type AppearanceIntensity =
  | "PALE"
  | "MEDIUM_MINUS"
  | "MEDIUM"
  | "MEDIUM_PLUS"
  | "DEEP";
export type Intensity =
  | "LIGHT"
  | "MEDIUM_MINUS"
  | "MEDIUM"
  | "MEDIUM_PLUS"
  | "PRONOUNCED";
export type Development =
  | "YOUTHFUL"
  | "DEVELOPING"
  | "FULLY_DEVELOPED"
  | "TIRED_PAST_BEST";
export type Sweetness =
  | "DRY"
  | "OFF_DRY"
  | "MEDIUM_DRY"
  | "MEDIUM"
  | "MEDIUM_SWEET"
  | "SWEET"
  | "LUSCIOUS";
export type Level = "LOW" | "MEDIUM_MINUS" | "MEDIUM" | "MEDIUM_PLUS" | "HIGH";
// wset_notes.tannin_nature — L4's descriptive tannin line; multi-select,
// optional, never counts toward progress. See 20260829202000_wset_tannin_nature.
export type TanninNature =
  | "RIPE"
  | "SOFT"
  | "SMOOTH"
  | "UNRIPE"
  | "GREEN"
  | "COARSE"
  | "STALKY"
  | "CHALKY"
  | "FINE_GRAINED";
export type Body = "LIGHT" | "MEDIUM_MINUS" | "MEDIUM" | "MEDIUM_PLUS" | "FULL";
export type Finish =
  | "SHORT"
  | "MEDIUM_MINUS"
  | "MEDIUM"
  | "MEDIUM_PLUS"
  | "LONG";
export type Mousse = "DELICATE" | "CREAMY" | "AGGRESSIVE";
export type ColourHue =
  | "LEMON_GREEN"
  | "LEMON"
  | "GOLD"
  | "AMBER"
  | "BROWN"
  | "PINK"
  | "SALMON"
  | "ORANGE"
  | "PURPLE"
  | "RUBY"
  | "GARNET"
  | "TAWNY";
export type Observation =
  | "LEGS_TEARS"
  | "DEPOSIT"
  | "PETILLANCE"
  | "RIM_VARIATION"
  | "TINTS_HIGHLIGHTS";
export type Fault = "OXIDISED" | "OUT_OF_CONDITION" | "CORK_TAINT" | "OTHER";
export type PriceCategory =
  | "INEXPENSIVE"
  | "MID_PRICED"
  | "HIGH_PRICED"
  | "PREMIUM"
  | "DONT_KNOW";
export type Readiness =
  | "NEEDS_TIME"
  | "READY_CAN_IMPROVE"
  | "READY_WONT_IMPROVE"
  | "TOO_OLD";
export type AromaFamily = "FRUIT" | "FLORAL" | "SPICE" | "VEGETAL_OAK" | "OTHER";
// How an aroma arises: PRIMARY (grape & fermentation), SECONDARY (winemaking),
// TERTIARY (ageing). See 20260829198000_wset_aroma_origin.sql.
export type AromaOrigin = "PRIMARY" | "SECONDARY" | "TERTIARY";

// The full editable state of one WSET note. Scalars are null until rated,
// arrays start empty, tasterNotes starts "". Mirrors the wset_notes columns
// plus the note/term join split into nose/palate id lists (wset_note_aromas
// rows carry sensed_on_nose / sensed_on_palate). id is null for an unsaved
// note; tastedOn is an ISO date string (wset_notes.tasted_on).
export type WsetNoteState = {
  id: string | null;
  tastedOn: string;
  clarity: Clarity | null;
  appearanceIntensity: AppearanceIntensity | null;
  colourHue: ColourHue | null;
  observations: Observation[];
  condition: Condition | null;
  faults: Fault[];
  noseIntensity: Intensity | null;
  development: Development | null;
  sweetness: Sweetness | null;
  acidity: Level | null;
  tannin: Level | null;
  tanninNature: TanninNature[];
  alcohol: Level | null;
  body: Body | null;
  mousse: Mousse | null;
  flavourIntensity: Intensity | null;
  finish: Finish | null;
  qualityScore: number | null;
  priceCategory: PriceCategory | null;
  readiness: Readiness | null;
  tasterNotes: string;
  noseTermIds: string[];
  palateTermIds: string[];
};

// A row of catalog_wines plus the joined display names the UI needs (the
// reference tables are looked up by id). Mirrors the migration's column
// nullability: secondary grape, type designation, cuvee, and both vintage
// number columns are optional; the shared reference ids are not.
export type CatalogWine = {
  id: string;
  countryId: string;
  regionId: string;
  appellationId: string;
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
  producerId: string;
  typeDesignationId: string | null;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  colour: WineColour;
  style: WineStyle;
  cuvee: string | null;
  bottleSizeMl: number;
  createdBy: string;
  createdAt: string;
  // Joined display names (null where the underlying id is null).
  countryName: string;
  regionName: string;
  appellationName: string;
  primaryGrapeName: string;
  secondaryGrapeName: string | null;
  producerName: string;
  typeDesignationName: string | null;
};

// One seeded wset_aroma_terms row. sortOrder is the term's 1..89 position on
// the WSET sheet; groupName is the sub-heading ("Citrus", "Ripeness", …).
export type AromaTerm = {
  id: string;
  family: AromaFamily;
  origin: AromaOrigin;
  groupName: string;
  term: string;
  sortOrder: number;
};
