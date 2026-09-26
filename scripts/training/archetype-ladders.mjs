// The enum ladders a typical wine's SAT ranges live on (training-room spec
// §4.4), for the batch validator and generator, which run as plain node and
// cannot import src/lib/wset/vocab.ts. src/lib/training/archetype-ladders.test.ts
// pins every list here to the TypeScript source (src/lib/wset/types.ts order,
// src/lib/wset/vocab.ts stops), so the two cannot drift.

export const WINE_COLOURS = ["WHITE", "ROSE", "RED", "ORANGE"];
export const WINE_STYLES = ["STILL", "SPARKLING", "FORTIFIED", "SWEET"];

// Full enum order (low -> high), spec §4.4.
export const APPEARANCE_INTENSITY = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
export const INTENSITY = ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "PRONOUNCED"];
export const DEVELOPMENT = ["YOUTHFUL", "DEVELOPING", "FULLY_DEVELOPED", "TIRED_PAST_BEST"];
export const SWEETNESS = ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"];
export const LEVEL = ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"];
export const BODY = ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "FULL"];
export const FINISH = ["SHORT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "LONG"];
export const MOUSSE = ["DELICATE", "CREAMY", "AGGRESSIVE"];
// Alcohol: three stops on an unfortified wine, five on a fortified one.
export const ALCOHOL_STOPS = ["LOW", "MEDIUM", "HIGH"];
export const FORTIFIED_ALCOHOL_STOPS = ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"];
export const HUES_BY_COLOUR = {
  WHITE: ["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"],
  ROSE: ["PINK", "SALMON", "ORANGE"],
  RED: ["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"],
  ORANGE: ["GOLD", "AMBER", "BROWN"],
};

// What the note's sliders can produce (src/lib/wset/vocab.ts *_STOPS): a range
// must include at least one of these, or no taster can ever land inside it.
export const APPEARANCE_INTENSITY_SLIDER = ["PALE", "MEDIUM", "DEEP"];
export const SWEETNESS_SLIDER = ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"];

// The matched SAT keys (spec §4.4); mousse only on a sparkling wine.
export const MATCHED_SCALES = [
  "appearanceIntensity",
  "colourHue",
  "noseIntensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "alcohol",
  "body",
  "flavourIntensity",
  "finish",
];

// The ladder a scale's range must lie on, for a wine of this colour and style;
// null for a key that is not a matched scale here.
export function ladderFor(scale, { colour, style }) {
  switch (scale) {
    case "appearanceIntensity":
      return APPEARANCE_INTENSITY;
    case "colourHue":
      return HUES_BY_COLOUR[colour] ?? null;
    case "noseIntensity":
    case "flavourIntensity":
      return INTENSITY;
    case "development":
      return DEVELOPMENT;
    case "sweetness":
      return SWEETNESS;
    case "acidity":
    case "tannin":
      return LEVEL;
    case "alcohol":
      return style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
    case "body":
      return BODY;
    case "finish":
      return FINISH;
    case "mousse":
      return style === "SPARKLING" ? MOUSSE : null;
    default:
      return null;
  }
}

// The values the note's slider for this scale can produce.
export function sliderStopsFor(scale, wine) {
  if (scale === "appearanceIntensity") return APPEARANCE_INTENSITY_SLIDER;
  if (scale === "sweetness") return SWEETNESS_SLIDER;
  return ladderFor(scale, wine);
}

// Every problem with one [low, high] range, as sentences; [] when it is sound.
export function rangeProblems(scale, range, wine) {
  const ladder = ladderFor(scale, wine);
  if (!ladder) return [`${scale} is not a scale a ${wine.colour} ${wine.style} typical wine carries`];
  if (!Array.isArray(range) || range.length !== 2 || range.some((v) => typeof v !== "string")) {
    return [`${scale} must be a [low, high] pair of strings`];
  }
  const [lo, hi] = range;
  const problems = [];
  if (!ladder.includes(lo)) problems.push(`${scale} low "${lo}" is not on its ladder (${ladder.join(", ")})`);
  if (!ladder.includes(hi)) problems.push(`${scale} high "${hi}" is not on its ladder (${ladder.join(", ")})`);
  if (problems.length > 0) return problems;
  const from = ladder.indexOf(lo);
  const to = ladder.indexOf(hi);
  if (from > to) return [`${scale} low "${lo}" is above high "${hi}"`];
  const slider = sliderStopsFor(scale, wine);
  if (!ladder.slice(from, to + 1).some((v) => slider.includes(v))) {
    return [`${scale} [${lo}, ${hi}] holds no value the note's slider can produce`];
  }
  return [];
}
