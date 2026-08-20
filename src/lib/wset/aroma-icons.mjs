// Each WSET aroma/flavour term gets its own tinted game-icons glyph, so every pill
// shows a distinct, colourful, representative icon (a yellow lemon, red cherries,
// a brown leather, purple plum). game-icons.net is a single consistent CC-BY 3.0
// set; each icon is a one-colour SVG we vendor pre-tinted (via the Iconify API) so
// the look stays uniform. Pure data + one function — no React, no DB.
//
// Uniqueness is on the (icon, colour) PAIR, not the glyph alone: several visually
// identical fruits (red vs black vs cooked cherry) reuse one glyph in different
// shades, which is how they stay both representative AND non-duplicate. The test
// asserts no two distinct terms share the same (icon, colour), and that every slug
// has a vendored SVG.
//
// ICON_META maps a slug -> { icon: game-icons name, color: hex }. The slug is the
// slugified term, so the same term appearing in several families shares one icon.

const C = {
  floral: "#C64B8C", green: "#6FA53F", lime: "#8FBF3A", citrus: "#E0B21E",
  peach: "#E0894A", amber: "#E0A81E", gold: "#C79A4E", red: "#B4283A",
  pinkred: "#D45A6A", crimson: "#9E2536", darkpurple: "#4A2A5E", violet: "#7A3F9E",
  blue: "#3A5FA0", brown: "#7A5230", darkbrown: "#5A3A26", garnet: "#6B3A2E",
  herb: "#4F8A3A", sage: "#6E8B4A", spice: "#A34327", slate: "#7C7C72",
  tan: "#C39A54", cream: "#D8B85E", oak: "#7A5230", white: "#B0782E",
  nut: "#8A5A2E", grey: "#8A8A80",
};

export const ICON_META = {
  // FLORAL
  blossom: { icon: "flowers", color: C.floral },
  acacia: { icon: "dandelion-flower", color: C.gold },
  elderflower: { icon: "cotton-flower", color: "#E8D9B0" },
  honeysuckle: { icon: "vine-flower", color: C.floral },
  jasmine: { icon: "jasmine", color: "#E8D9B0" },
  chamomile: { icon: "daisy", color: C.gold },
  geranium: { icon: "twirly-flower", color: C.pinkred },
  rose: { icon: "rose", color: C.red },
  violet: { icon: "lotus-flower", color: C.violet },
  // GREEN FRUIT
  apple: { icon: "shiny-apple", color: C.green },
  pear: { icon: "pear", color: C.lime },
  gooseberry: { icon: "kiwi-fruit", color: C.green },
  grape: { icon: "grapes", color: C.lime },
  "pear-drop": { icon: "spiral-lollipop", color: C.green },
  quince: { icon: "fruit-tree", color: C.gold },
  // CITRUS
  lemon: { icon: "lemon", color: C.citrus },
  "lemon-peel": { icon: "cut-lemon", color: C.citrus },
  lime: { icon: "lemon", color: C.lime },
  grapefruit: { icon: "orange", color: C.pinkred },
  orange: { icon: "orange", color: "#E68A2E" },
  "orange-peel": { icon: "orange-slice", color: "#E68A2E" },
  // STONE
  peach: { icon: "peach", color: C.peach },
  apricot: { icon: "peach", color: C.amber },
  nectarine: { icon: "peach", color: C.red },
  // TROPICAL
  banana: { icon: "banana", color: C.citrus },
  lychee: { icon: "cherry", color: C.pinkred },
  mango: { icon: "banana-bunch", color: C.amber },
  melon: { icon: "watermelon", color: C.green },
  "passion-fruit": { icon: "kiwi-fruit", color: C.violet },
  pineapple: { icon: "pineapple", color: C.gold },
  // RED FRUIT
  redcurrant: { icon: "elderberry", color: C.red },
  cranberry: { icon: "berry-bush", color: C.crimson },
  raspberry: { icon: "raspberry", color: C.pinkred },
  strawberry: { icon: "strawberry", color: C.red },
  "red-cherry": { icon: "cherry", color: C.red },
  "red-plum": { icon: "plum", color: C.red },
  // BLACK FRUIT
  blackcurrant: { icon: "blackcurrant", color: C.darkpurple },
  blackberry: { icon: "berry-bush", color: C.darkpurple },
  blueberry: { icon: "elderberry", color: C.blue },
  "black-cherry": { icon: "cherry", color: "#3A2140" },
  "black-plum": { icon: "plum", color: C.darkpurple },
  bramble: { icon: "vine-leaf", color: C.darkpurple },
  // HERBACEOUS
  "green-bell-pepper": { icon: "bell-pepper", color: C.herb },
  grass: { icon: "high-grass", color: C.herb },
  "tomato-leaf": { icon: "linden-leaf", color: C.herb },
  asparagus: { icon: "asparagus", color: C.herb },
  "blackcurrant-leaf": { icon: "vine-leaf", color: C.herb },
  // HERBAL
  eucalyptus: { icon: "ginkgo-leaf", color: C.sage },
  mint: { icon: "herbs-bundle", color: C.herb },
  fennel: { icon: "sprout", color: C.sage },
  dill: { icon: "seedling", color: C.sage },
  "dried-herbs": { icon: "teapot-leaves", color: C.sage },
  medicinal: { icon: "medicine-pills", color: C.grey },
  lavender: { icon: "spoted-flower", color: C.violet },
  // SPICE
  "black-pepper": { icon: "hot-spices", color: "#3A2E28" },
  "white-pepper": { icon: "cool-spices", color: "#C8B58A" },
  liquorice: { icon: "candy-canes", color: "#2E2A28" },
  cinnamon: { icon: "incense", color: C.spice },
  // FRUIT RIPENESS
  "unripe-fruit": { icon: "sprout", color: C.green },
  "ripe-fruit": { icon: "fruit-bowl", color: C.red },
  "dried-fruit": { icon: "grain-bundle", color: C.brown },
  "cooked-fruit": { icon: "cooking-pot", color: C.red },
  jammy: { icon: "jelly", color: C.red },
  // OTHER
  simple: { icon: "wine-glass", color: C.slate },
  "wet-stones": { icon: "stone-pile", color: C.slate },
  flint: { icon: "flint-spark", color: C.slate },
  candy: { icon: "jelly-beans", color: C.pinkred },
  "wet-wool": { icon: "wool", color: C.grey },
  // YEAST
  biscuit: { icon: "cookie", color: C.tan },
  "graham-cracker": { icon: "bread-slice", color: C.tan },
  bread: { icon: "bread", color: C.tan },
  toast: { icon: "butter-toast", color: C.brown },
  pastry: { icon: "croissant", color: C.gold },
  brioche: { icon: "cupcake", color: C.tan },
  "bread-dough": { icon: "dough-roller", color: C.cream },
  cheese: { icon: "cheese-wedge", color: C.cream },
  yogurt: { icon: "jug", color: "#E8E0C8" },
  acetaldehyde: { icon: "round-bottom-flask", color: C.green },
  // MALOLACTIC
  butter: { icon: "butter", color: C.cream },
  cream: { icon: "milk-carton", color: "#E8E0C8" },
  // OAK
  vanilla: { icon: "vanilla-flower", color: "#D8C89A" },
  cloves: { icon: "clover", color: C.brown },
  nutmeg: { icon: "acorn", color: C.brown },
  coconut: { icon: "coconuts", color: "#8A6A48" },
  butterscotch: { icon: "ice-cream-scoop", color: C.gold },
  cedar: { icon: "pine-tree", color: C.oak },
  "charred-wood": { icon: "campfire", color: "#3A2A24" },
  smoke: { icon: "dust-cloud", color: C.grey },
  chocolate: { icon: "chocolate-bar", color: "#4A2E1E" },
  coffee: { icon: "coffee-beans", color: "#4A2E1E" },
  resinous: { icon: "log", color: C.oak },
  // WHITE WINE (tertiary)
  "dried-apricot": { icon: "peach", color: C.nut },
  sultana: { icon: "grapes", color: C.nut },
  raisin: { icon: "grapes", color: C.garnet },
  "orange-marmalade": { icon: "orange", color: "#C9702E" },
  petrol: { icon: "oil-drum", color: C.slate },
  kerosene: { icon: "jerrycan", color: "#5A6A6A" },
  ginger: { icon: "gingerbread-man", color: C.tan },
  almond: { icon: "almond", color: C.nut },
  hazelnut: { icon: "peanut", color: C.nut },
  honey: { icon: "honey-jar", color: C.amber },
  caramel: { icon: "honeypot", color: C.white },
  nutty: { icon: "pestle-mortar", color: C.nut },
  hay: { icon: "round-straw-bale", color: C.gold },
  "dried-apple": { icon: "shiny-apple", color: C.nut },
  "dried-banana": { icon: "banana", color: C.nut },
  // RED WINE (tertiary)
  prune: { icon: "plum", color: C.darkbrown },
  fig: { icon: "fruiting", color: C.garnet },
  "cooked-plum": { icon: "cauldron", color: C.darkpurple },
  "cooked-cherry": { icon: "cherry", color: C.darkbrown },
  "cooked-red-plum": { icon: "saucepan", color: C.garnet },
  "dried-blackberry": { icon: "berry-bush", color: C.darkbrown },
  "dried-cranberry": { icon: "elderberry", color: C.darkbrown },
  "cooked-blackberry": { icon: "jelly", color: C.darkpurple },
  kirsch: { icon: "brandy-bottle", color: C.red },
  leather: { icon: "leather-boot", color: C.brown },
  earth: { icon: "stone-block", color: C.darkbrown },
  mushroom: { icon: "mushroom", color: C.brown },
  meat: { icon: "meat", color: C.red },
  game: { icon: "deer", color: C.brown },
  tobacco: { icon: "smoking-pipe", color: C.brown },
  "wet-leaves": { icon: "falling-leaf", color: C.brown },
  "forest-floor": { icon: "forest", color: "#4A5A2E" },
  vegetal: { icon: "broccoli", color: C.herb },
  savoury: { icon: "salt-shaker", color: C.brown },
  farmyard: { icon: "barn", color: C.brown },
  tar: { icon: "thrown-charcoal", color: "#2A2A2A" },
  // DELIBERATELY OXIDISED
  marzipan: { icon: "mortar", color: C.tan },
  walnut: { icon: "acorn", color: C.darkbrown },
  toffee: { icon: "sugar-cane", color: C.nut },
  // default
  wine: { icon: "wine-glass", color: C.garnet },
};

/** Slugify a term to its ICON_META key (lowercase, non-alphanumerics -> dashes). */
export function slugForTerm(term) {
  return String(term)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A term's icon slug: its own tinted glyph, else a neutral wine glass. (The
// second arg is accepted and ignored — callers pass the family for API symmetry
// with the old per-family fallback; the icon+colour now come solely from the term.)
/**
 * @param {string} term
 * @returns {string}
 */
export function iconForTerm(term) {
  const slug = slugForTerm(term);
  return ICON_META[slug] ? slug : "wine";
}
