// Maps each WSET aroma/flavour term to a vendored Twemoji SVG slug, so every
// term pill can show a small colour icon (a yellow lemon beside "lemon"). Pure
// data + one function — no React, no DB. Keyed by the exact seeded
// wset_aroma_terms.term strings. Terms without a clear emoji fall back to a
// per-family cue, and an unknown family to a neutral wine glass, so no pill is
// ever bare (guaranteed by aroma-icons.test.mjs). Authored as .mjs (allowJs) so
// the Node test can import it natively — no TS type-stripping flag needed in CI.
//
// ICON_CODEPOINT is the single source of truth for which SVGs exist: it maps a
// slug to its jdecked-Twemoji hex codepoint. The vendor script fetches exactly
// these, and the test asserts every slug iconForTerm can return is present.

/** @type {Record<string, string>} */
export const ICON_CODEPOINT = {
  lemon: "1f34b",
  orange: "1f34a",
  "green-apple": "1f34f",
  pear: "1f350",
  grapes: "1f347",
  candy: "1f36c",
  peach: "1f351",
  banana: "1f34c",
  mango: "1f96d",
  melon: "1f348",
  pineapple: "1f34d",
  strawberry: "1f353",
  cherries: "1f352",
  blueberries: "1fad0",
  "bell-pepper": "1fad1",
  herb: "1f33f",
  pill: "1f48a",
  bread: "1f35e",
  cheese: "1f9c0",
  milk: "1f95b",
  butter: "1f9c8",
  coconut: "1f965",
  chocolate: "1f36b",
  coffee: "2615",
  dash: "1f4a8",
  wood: "1fab5",
  honey: "1f36f",
  chestnut: "1f330",
  mushroom: "1f344",
  meat: "1f356",
  "fuel-pump": "26fd",
  "fallen-leaf": "1f342",
  "hot-pepper": "1f336",
  custard: "1f36e",
  blossom: "1f338",
  rose: "1f339",
  rock: "1faa8",
  wine: "1f377",
};

// group_name -> fallback slug (used for any term not in TERM_ICON).
/** @type {Record<string, string>} */
export const FAMILY_ICON = {
  Floral: "blossom",
  "Green fruit": "green-apple",
  "Citrus fruit": "lemon",
  "Stone fruit": "peach",
  "Tropical fruit": "pineapple",
  "Red fruit": "cherries",
  "Black fruit": "blueberries",
  Herbaceous: "herb",
  Herbal: "herb",
  Spice: "hot-pepper",
  "Fruit ripeness": "grapes",
  Other: "rock",
  Yeast: "bread",
  Malolactic: "butter",
  Oak: "wood",
  "Red wine": "fallen-leaf",
  "White wine": "fallen-leaf",
  "Deliberately oxidised": "chestnut",
};

// term string -> slug. Only terms with a clear, recognizable emoji; everything
// else intentionally falls to the family cue.
/** @type {Record<string, string>} */
export const TERM_ICON = {
  // Citrus
  lemon: "lemon",
  "lemon peel": "lemon",
  lime: "lemon",
  grapefruit: "orange",
  orange: "orange",
  "orange peel": "orange",
  "orange marmalade": "orange",
  // Green / pome
  apple: "green-apple",
  "dried apple": "green-apple",
  gooseberry: "green-apple",
  quince: "green-apple",
  pear: "pear",
  // Grape-derived / dried
  grape: "grapes",
  raisin: "grapes",
  sultana: "grapes",
  prune: "grapes",
  fig: "grapes",
  "dried fruit": "grapes",
  "cooked fruit": "grapes",
  "ripe fruit": "grapes",
  jammy: "grapes",
  // Candy / confection
  "pear drop": "candy",
  candy: "candy",
  liquorice: "candy",
  // Stone
  peach: "peach",
  apricot: "peach",
  "dried apricot": "peach",
  nectarine: "peach",
  // Tropical
  banana: "banana",
  "dried banana": "banana",
  mango: "mango",
  melon: "melon",
  pineapple: "pineapple",
  "passion fruit": "pineapple",
  lychee: "pineapple",
  // Red fruit
  strawberry: "strawberry",
  "red cherry": "cherries",
  "black cherry": "cherries",
  "cooked cherry": "cherries",
  "cooked red plum": "cherries",
  "red plum": "cherries",
  redcurrant: "cherries",
  cranberry: "cherries",
  "dried cranberry": "cherries",
  raspberry: "cherries",
  // Black fruit
  blueberry: "blueberries",
  blackberry: "blueberries",
  "dried blackberry": "blueberries",
  "cooked blackberry": "blueberries",
  blackcurrant: "blueberries",
  "black plum": "blueberries",
  "cooked plum": "blueberries",
  bramble: "blueberries",
  // Herbaceous / herbal
  "green bell pepper": "bell-pepper",
  grass: "herb",
  mint: "herb",
  eucalyptus: "herb",
  hay: "herb",
  // Floral
  blossom: "blossom",
  acacia: "blossom",
  elderflower: "blossom",
  honeysuckle: "blossom",
  jasmine: "blossom",
  chamomile: "blossom",
  geranium: "blossom",
  lavender: "blossom",
  violet: "blossom",
  rose: "rose",
  // Medicinal
  medicinal: "pill",
  // Yeast / dairy
  biscuit: "bread",
  "graham cracker": "bread",
  bread: "bread",
  toast: "bread",
  pastry: "bread",
  brioche: "bread",
  "bread dough": "bread",
  cheese: "cheese",
  yogurt: "milk",
  butter: "butter",
  cream: "milk",
  // Oak / roast
  coconut: "coconut",
  chocolate: "chocolate",
  coffee: "coffee",
  smoke: "dash",
  honey: "honey",
  almond: "chestnut",
  marzipan: "chestnut",
  hazelnut: "chestnut",
  walnut: "chestnut",
  // Tertiary savoury
  mushroom: "mushroom",
  meat: "meat",
  game: "meat",
  petrol: "fuel-pump",
  kerosene: "fuel-pump",
  earth: "fallen-leaf",
  "forest floor": "fallen-leaf",
  "wet leaves": "fallen-leaf",
  caramel: "custard",
  butterscotch: "custard",
  toffee: "custard",
};

// A term's icon slug: its own emoji, else its family's cue, else a neutral glass.
/**
 * @param {string} term
 * @param {string} family
 * @returns {string}
 */
export function iconForTerm(term, family) {
  return TERM_ICON[term] ?? FAMILY_ICON[family] ?? "wine";
}
