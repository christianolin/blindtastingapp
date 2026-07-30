// WSET vocabulary presentation layer: enum value -> lowercase WSET label, the
// ordered stops per graded scale, the hues + swatch hex per wine colour, and
// the per-section "N of M rated" progress rule. Pure data plus one pure
// function — no React, no DB. Labels use canonical WSET wording (e.g. HAZY
// renders "hazy", not the prototype's "dull").
import type {
  AppearanceIntensity,
  Body,
  ColourHue,
  Development,
  Finish,
  Intensity,
  Level,
  Sweetness,
  TanninNature,
  WineColour,
  WineStyle,
  WsetNoteState,
} from "@/lib/wset/types";

// Every enum value -> its lowercase WSET label. Members shared across scales
// (MEDIUM, MEDIUM_MINUS, MEDIUM_PLUS, LIGHT, OTHER, BROWN) collapse to a single
// entry — every scale that uses them renders the same word.
export const LABELS: Record<string, string> = {
  // wine_colour / wine_style
  WHITE: "white",
  ROSE: "rosé",
  RED: "red",
  STILL: "still",
  SPARKLING: "sparkling",
  FORTIFIED: "fortified",
  // wset_clarity / wset_condition
  CLEAR: "clear",
  HAZY: "hazy",
  CLEAN: "clean",
  UNCLEAN: "unclean",
  // shared graded-scale steps
  MEDIUM_MINUS: "medium(-)",
  MEDIUM: "medium",
  MEDIUM_PLUS: "medium(+)",
  // wset_appearance_intensity
  PALE: "pale",
  DEEP: "deep",
  // wset_intensity (nose + flavour)
  LIGHT: "light",
  PRONOUNCED: "pronounced",
  // wset_development
  YOUTHFUL: "youthful",
  DEVELOPING: "developing",
  FULLY_DEVELOPED: "fully developed",
  TIRED_PAST_BEST: "tired / past best",
  // wset_sweetness
  DRY: "dry",
  OFF_DRY: "off-dry",
  MEDIUM_DRY: "medium-dry",
  MEDIUM_SWEET: "medium-sweet",
  SWEET: "sweet",
  LUSCIOUS: "luscious",
  // wset_level (acidity, tannin, alcohol)
  LOW: "low",
  HIGH: "high",
  // wset_tannin_nature (L4 descriptive tannin line)
  RIPE: "ripe",
  SOFT: "soft",
  SMOOTH: "smooth",
  UNRIPE: "unripe",
  GREEN: "green",
  COARSE: "coarse",
  STALKY: "stalky",
  CHALKY: "chalky",
  FINE_GRAINED: "fine-grained",
  // wset_body
  FULL: "full",
  // wset_finish
  SHORT: "short",
  LONG: "long",
  // wset_mousse
  DELICATE: "delicate",
  CREAMY: "creamy",
  AGGRESSIVE: "aggressive",
  // wset_colour_hue
  LEMON_GREEN: "lemon-green",
  LEMON: "lemon",
  GOLD: "gold",
  AMBER: "amber",
  BROWN: "brown",
  PINK: "pink",
  SALMON: "salmon",
  ORANGE: "orange",
  PURPLE: "purple",
  RUBY: "ruby",
  GARNET: "garnet",
  TAWNY: "tawny",
  // wset_observation
  LEGS_TEARS: "legs / tears",
  DEPOSIT: "deposit",
  PETILLANCE: "pétillance",
  RIM_VARIATION: "rim variation",
  TINTS_HIGHLIGHTS: "tints / highlights",
  // wset_fault (OTHER shared with wset_aroma_family below)
  OXIDISED: "oxidised",
  OUT_OF_CONDITION: "out of condition",
  CORK_TAINT: "cork taint",
  OTHER: "other",
  // wset_price_category
  INEXPENSIVE: "inexpensive",
  MID_PRICED: "mid-priced",
  HIGH_PRICED: "high-priced",
  PREMIUM: "premium",
  DONT_KNOW: "don't know",
  // wset_readiness
  NEEDS_TIME: "needs time to develop",
  READY_CAN_IMPROVE: "ready — can improve",
  READY_WONT_IMPROVE: "ready — won't improve",
  TOO_OLD: "too old",
  // wset_aroma_family
  FRUIT: "fruit",
  FLORAL: "floral",
  SPICE: "spice",
  VEGETAL_OAK: "vegetal & oak",
};

// Ordered stops per graded scale, low → high, as rendered left → right on the
// snapping sliders. A slider stores its value as an index into one of these.
export const APPEARANCE_INTENSITY_STOPS: AppearanceIntensity[] = [
  "PALE",
  "MEDIUM",
  "DEEP",
];
export const INTENSITY_STOPS: Intensity[] = [
  "LIGHT",
  "MEDIUM_MINUS",
  "MEDIUM",
  "MEDIUM_PLUS",
  "PRONOUNCED",
];
export const SWEETNESS_STOPS: Sweetness[] = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
];
export const LEVEL_STOPS: Level[] = [
  "LOW",
  "MEDIUM_MINUS",
  "MEDIUM",
  "MEDIUM_PLUS",
  "HIGH",
];
// Alcohol (WSET SAT): unfortified wines use low / medium / high; fortified
// wines use the full 5-point scale.
export const ALCOHOL_STOPS: Level[] = ["LOW", "MEDIUM", "HIGH"];
export const FORTIFIED_ALCOHOL_STOPS: Level[] = [
  "LOW",
  "MEDIUM_MINUS",
  "MEDIUM",
  "MEDIUM_PLUS",
  "HIGH",
];
export const BODY_STOPS: Body[] = [
  "LIGHT",
  "MEDIUM_MINUS",
  "MEDIUM",
  "MEDIUM_PLUS",
  "FULL",
];
export const FINISH_STOPS: Finish[] = [
  "SHORT",
  "MEDIUM_MINUS",
  "MEDIUM",
  "MEDIUM_PLUS",
  "LONG",
];
export const DEVELOPMENT_STOPS: Development[] = [
  "YOUTHFUL",
  "DEVELOPING",
  "FULLY_DEVELOPED",
  "TIRED_PAST_BEST",
];

// wset_notes.tannin_nature options — multi-select pills under the Tannin row.
// Descriptive (WSET's "e.g." line), so it never counts toward progress.
export const TANNIN_NATURE: TanninNature[] = [
  "RIPE",
  "SOFT",
  "SMOOTH",
  "UNRIPE",
  "GREEN",
  "COARSE",
  "STALKY",
  "CHALKY",
  "FINE_GRAINED",
];

// The hues valid for each wine colour, ordered light → dark for the colour
// slider gradient. Matches the DB trigger wset_notes_check_hue exactly: BROWN
// is shared by WHITE and RED (an over-aged white vs a browning red).
export const HUES_BY_COLOUR: Record<WineColour, ColourHue[]> = {
  WHITE: ["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"],
  ROSE: ["PINK", "SALMON", "ORANGE"],
  RED: ["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"],
  ORANGE: ["GOLD", "AMBER", "BROWN"],
};

// Swatch hex per hue, from the handoff colour-slider stops. Keyed by colour
// first because BROWN differs by context — muted olive-brown on a white
// (#8F6236), a darker brown on a red (#6E4826) — which a flat hue→hex map
// cannot hold. Consume as HUE_HEX[colour][hue] alongside HUES_BY_COLOUR.
export const HUE_HEX: Record<WineColour, Partial<Record<ColourHue, string>>> = {
  WHITE: {
    LEMON_GREEN: "#E6E39B",
    LEMON: "#F0DF7E",
    GOLD: "#DDB855",
    AMBER: "#C08B3E",
    BROWN: "#8F6236",
  },
  ROSE: {
    PINK: "#F2B3BF",
    SALMON: "#EF9D7F",
    ORANGE: "#E58A4E",
  },
  RED: {
    PURPLE: "#4E1348",
    RUBY: "#8E1F3B",
    GARNET: "#833024",
    TAWNY: "#9A5A2C",
    BROWN: "#6E4826",
  },
  ORANGE: {
    GOLD: "#DDB855",
    AMBER: "#C08B3E",
    BROWN: "#8F6236",
  },
};

// --- Aroma colour filtering ------------------------------------------------
// Which wine colours a cluster is plausibly relevant to, so the picker can hide
// options that never apply (a red hiding citrus/stone/tropical whites; a white
// hiding red/black fruit). ROSE / ORANGE (and unknown) show everything — they
// are legitimate crossovers. Floral is per-term. Guidance, easily tweaked.
const CLUSTER_AFFINITY: Record<string, "WHITE" | "RED" | "BOTH"> = {
  "Green fruit": "WHITE",
  "Citrus fruit": "WHITE",
  "Stone fruit": "WHITE",
  "Tropical fruit": "WHITE",
  "Red fruit": "RED",
  "Black fruit": "RED",
  "Red wine": "RED",
  "White wine": "WHITE",
};

function aromaAffinity(groupName: string, term: string): "WHITE" | "RED" | "BOTH" {
  if (groupName === "Floral") {
    const t = term.toLowerCase();
    if (t === "violet") return "RED";
    if (t === "rose") return "BOTH";
    return "WHITE";
  }
  return CLUSTER_AFFINITY[groupName] ?? "BOTH";
}

// Whether an aroma term should show for a wine of the given colour.
export function aromaVisibleFor(
  colour: WineColour | null | undefined,
  groupName: string,
  term: string,
): boolean {
  if (colour !== "RED" && colour !== "WHITE") return true;
  const a = aromaAffinity(groupName, term);
  return a === "BOTH" || a === colour;
}

// Per-section "N of M rated" progress, driving the handoff's done/total
// counters. Required fields come from the spec's Validation section:
// Appearance (3) = clarity + appearance intensity + colour hue; Nose (4) =
// condition + nose intensity + development + at least one nose term; Palate
// (8) = sweetness, acidity, tannin, alcohol, body, flavour intensity, finish
// and at least one palate term, plus mousse for SPARKLING wines (9);
// Conclusions (3) = quality score + price category + readiness. Observations,
// faults and the free-text taster notes deliberately never count.
export type SectionProgress = {
  appearance: [number, number];
  nose: [number, number];
  palate: [number, number];
  conclusions: [number, number];
};

export function sectionProgress(
  state: WsetNoteState,
  style: WineStyle,
): SectionProgress {
  const set = (value: unknown): boolean => value !== null && value !== undefined;
  const countTrue = (...flags: boolean[]): number => flags.filter(Boolean).length;
  const sparkling = style === "SPARKLING";

  const appearance = countTrue(
    set(state.clarity),
    set(state.appearanceIntensity),
    set(state.colourHue),
  );

  const nose = countTrue(
    set(state.condition),
    set(state.noseIntensity),
    set(state.development),
    state.noseTermIds.length > 0,
  );

  const palate = countTrue(
    set(state.sweetness),
    set(state.acidity),
    set(state.tannin),
    set(state.alcohol),
    set(state.body),
    set(state.flavourIntensity),
    set(state.finish),
    state.palateTermIds.length > 0,
    ...(sparkling ? [set(state.mousse)] : []),
  );

  const conclusions = countTrue(
    set(state.qualityScore),
    set(state.priceCategory),
    set(state.readiness),
  );

  return {
    appearance: [appearance, 3],
    nose: [nose, 4],
    palate: [palate, sparkling ? 9 : 8],
    conclusions: [conclusions, 3],
  };
}
