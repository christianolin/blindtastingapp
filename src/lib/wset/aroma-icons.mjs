// Each WSET aroma/flavour term gets its own icon, chosen per-term from whichever
// set has the SIMPLEST, most literal glyph — the pills are ~16px, so a busy
// illustration is unreadable.
//
// Set preference (owner: "Apple iPhone-style looks if possible", "go for simple
// icons", "use many different sources"):
//   fluent-emoji       — Microsoft Fluent 3D. Glossy, rounded, single-subject:
//                        the closest thing to the iOS emoji look. FIRST CHOICE.
//   fluent-emoji-flat  — the flat cut of the same set, where 3D lacks the glyph.
//   icon-park-solid    — clean one-shape solid icons (cherry, pear, candy…).
//   game-icons         — one-colour line icons, vendored PRE-TINTED; last resort
//                        for things no emoji set has (leather, flint, wool, tar).
//
// Rules this table follows:
//   - the icon must be the ACTUAL note, never a look-alike stand-in;
//   - prefer a SINGLE object over a cluster — owner flagged multi-berry glyphs
//     (cranberry/redcurrant) as too busy at pill size;
//   - no two terms may share the same (set, icon, colour) — asserted by the test.
//
// ICON_META maps a slug -> { set, icon, color? }. `color` applies to game-icons
// only (the emoji sets are already multicolour). The slug is the slugified term.

const E = "fluent-emoji"; // 3D, iOS-like
// (fluent-emoji-flat is the flat sibling of E — kept available but unused: the
// 3D set reads better at pill size.)
const P = "icon-park-solid"; // clean solid single shapes
const O = "openmoji"; // simple flat emoji; has a few objects the others lack
const G = "game-icons"; // tinted line icons, last resort

// Tints for the one-colour game-icons entries.
const C = {
  floral: "#C64B8C", violet: "#7A3F9E", green: "#6FA53F", herb: "#4F8A3A",
  sage: "#6E8B4A", citrus: "#E0B21E", amber: "#E0A81E", gold: "#C79A4E",
  red: "#B4283A", crimson: "#9E2536", pinkred: "#D45A6A", darkpurple: "#4A2A5E",
  blue: "#3A5FA0", brown: "#7A5230", darkbrown: "#5A3A26", garnet: "#6B3A2E",
  nut: "#8A5A2E", spice: "#A34327", slate: "#7C7C72", grey: "#8A8A80",
  cream: "#D8B85E", tan: "#C39A54", black: "#2E2A28",
};

export const ICON_META = {
  // ---- FLORAL ----
  blossom: { set: E, icon: "cherry-blossom" },
  acacia: { set: E, icon: "sunflower" },
  elderflower: { set: E, icon: "white-flower" },
  honeysuckle: { set: E, icon: "hibiscus" },
  jasmine: { set: E, icon: "blossom" },
  chamomile: { set: G, icon: "daisy", color: C.gold },
  geranium: { set: E, icon: "tulip" },
  rose: { set: E, icon: "rose" },
  violet: { set: E, icon: "wilted-flower" },
  // ---- GREEN FRUIT ----
  apple: { set: E, icon: "green-apple" },
  pear: { set: E, icon: "pear" },
  gooseberry: { set: E, icon: "kiwi-fruit" },
  grape: { set: E, icon: "grapes" },
  "pear-drop": { set: P, icon: "candy" },
  quince: { set: P, icon: "pear", color: undefined }, // no quince glyph anywhere; pome silhouette
  // ---- CITRUS ----
  lemon: { set: E, icon: "lemon" },
  "lemon-peel": { set: G, icon: "cut-lemon", color: C.citrus },
  lime: { set: G, icon: "lemon", color: "#7FBF3A" },
  grapefruit: { set: P, icon: "orange-one", color: undefined },
  orange: { set: E, icon: "tangerine" },
  "orange-peel": { set: G, icon: "orange-slice", color: "#E68A2E" },
  // ---- STONE ----
  peach: { set: E, icon: "peach" },
  apricot: { set: P, icon: "peach" },
  nectarine: { set: G, icon: "peach", color: C.red },
  // ---- TROPICAL ----
  banana: { set: E, icon: "banana" },
  lychee: { set: G, icon: "cherry", color: C.pinkred },
  mango: { set: E, icon: "mango" },
  melon: { set: E, icon: "melon" },
  "passion-fruit": { set: G, icon: "kiwi-fruit", color: C.violet },
  pineapple: { set: E, icon: "pineapple" },
  // ---- RED FRUIT (single-object glyphs, no clusters) ----
  redcurrant: { set: G, icon: "berry-bush", color: C.red },
  cranberry: { set: E, icon: "olive" },
  raspberry: { set: G, icon: "raspberry", color: C.pinkred },
  strawberry: { set: E, icon: "strawberry" },
  "red-cherry": { set: P, icon: "cherry" },
  "red-plum": { set: G, icon: "plum", color: C.red },
  // ---- BLACK FRUIT ----
  blackcurrant: { set: G, icon: "blackcurrant", color: C.darkpurple },
  blackberry: { set: G, icon: "raspberry", color: C.darkpurple },
  blueberry: { set: E, icon: "blueberries" },
  "black-cherry": { set: G, icon: "cherry", color: "#3A2140" },
  "black-plum": { set: G, icon: "plum", color: C.darkpurple },
  bramble: { set: G, icon: "thorny-vine", color: C.darkpurple },
  // ---- HERBACEOUS ----
  "green-bell-pepper": { set: E, icon: "bell-pepper" },
  grass: { set: G, icon: "high-grass", color: C.herb },
  "tomato-leaf": { set: E, icon: "tomato" },
  asparagus: { set: G, icon: "asparagus", color: C.herb },
  "blackcurrant-leaf": { set: G, icon: "vine-leaf", color: C.herb },
  // ---- HERBAL ----
  eucalyptus: { set: E, icon: "leaf-fluttering-in-wind" },
  mint: { set: E, icon: "herb" },
  fennel: { set: G, icon: "sprout", color: C.sage },
  dill: { set: G, icon: "seedling", color: C.sage },
  "dried-herbs": { set: G, icon: "herbs-bundle", color: C.sage },
  medicinal: { set: E, icon: "pill" },
  lavender: { set: G, icon: "spoted-flower", color: C.violet },
  // ---- SPICE ----
  "black-pepper": { set: O, icon: "pepper-mill" },
  "white-pepper": { set: O, icon: "salt-mill" },
  liquorice: { set: G, icon: "wrapped-sweet", color: C.black },
  cinnamon: { set: G, icon: "wood-stick", color: C.spice },
  // ---- FRUIT RIPENESS ----
  "unripe-fruit": { set: G, icon: "shiny-apple", color: C.green },
  "ripe-fruit": { set: E, icon: "red-apple" },
  "dried-fruit": { set: G, icon: "grain-bundle", color: C.darkbrown },
  "cooked-fruit": { set: E, icon: "pot-of-food" },
  jammy: { set: E, icon: "jar" },
  // ---- OTHER ----
  simple: { set: E, icon: "wine-glass" },
  "wet-stones": { set: E, icon: "rock" },
  flint: { set: G, icon: "flint-spark", color: C.slate },
  candy: { set: E, icon: "candy" },
  "wet-wool": { set: G, icon: "wool", color: C.grey },
  // ---- YEAST ----
  biscuit: { set: E, icon: "cookie" },
  "graham-cracker": { set: G, icon: "bread-slice", color: C.tan },
  bread: { set: E, icon: "bread" },
  toast: { set: G, icon: "butter-toast", color: "#B07A3A" },
  pastry: { set: E, icon: "croissant" },
  brioche: { set: E, icon: "cupcake" },
  "bread-dough": { set: G, icon: "flour", color: C.cream },
  cheese: { set: E, icon: "cheese-wedge" },
  yogurt: { set: P, icon: "milk-one" },
  acetaldehyde: { set: G, icon: "round-bottom-flask", color: C.green },
  // ---- MALOLACTIC ----
  butter: { set: E, icon: "butter" },
  cream: { set: P, icon: "milk" },
  // ---- OAK ----
  vanilla: { set: G, icon: "vanilla-flower", color: "#D8C89A" },
  cloves: { set: G, icon: "clover", color: C.brown },
  nutmeg: { set: E, icon: "chestnut" },
  coconut: { set: E, icon: "coconut" },
  butterscotch: { set: G, icon: "jelly-beans", color: C.gold },
  cedar: { set: E, icon: "evergreen-tree" },
  "charred-wood": { set: G, icon: "burning-embers", color: "#3A2A24" },
  smoke: { set: G, icon: "smoke-bomb", color: C.grey },
  chocolate: { set: E, icon: "chocolate-bar" },
  coffee: { set: E, icon: "hot-beverage" },
  resinous: { set: E, icon: "wood" },
  // ---- WHITE WINE (tertiary) ----
  "dried-apricot": { set: G, icon: "peach", color: C.nut },
  sultana: { set: G, icon: "grapes", color: C.nut },
  raisin: { set: G, icon: "grapes", color: C.garnet },
  "orange-marmalade": { set: G, icon: "honey-jar", color: "#C9702E" },
  petrol: { set: E, icon: "fuel-pump" },
  kerosene: { set: G, icon: "jerrycan", color: "#5A6A6A" },
  ginger: { set: E, icon: "ginger-root" },
  almond: { set: G, icon: "almond", color: C.nut },
  hazelnut: { set: E, icon: "peanuts" },
  honey: { set: E, icon: "honey-pot" },
  caramel: { set: G, icon: "honey-jar", color: C.amber },
  nutty: { set: G, icon: "peanut", color: C.nut },
  hay: { set: G, icon: "wheat", color: C.gold },
  "dried-apple": { set: G, icon: "shiny-apple", color: C.nut },
  "dried-banana": { set: G, icon: "banana", color: C.nut },
  // ---- RED WINE (tertiary) ----
  prune: { set: G, icon: "plum", color: C.darkbrown },
  fig: { set: G, icon: "fruiting", color: C.garnet },
  "cooked-plum": { set: G, icon: "cooking-pot", color: "#6E3A5E" },
  "cooked-cherry": { set: G, icon: "cherry", color: C.darkbrown },
  "cooked-red-plum": { set: G, icon: "saucepan", color: C.garnet },
  "dried-blackberry": { set: G, icon: "berries-bowl", color: C.darkbrown },
  "dried-cranberry": { set: G, icon: "berry-bush", color: C.darkbrown },
  "cooked-blackberry": { set: G, icon: "jelly", color: C.darkpurple },
  kirsch: { set: G, icon: "brandy-bottle", color: C.red },
  leather: { set: G, icon: "leather-vest", color: C.brown },
  earth: { set: G, icon: "stone-block", color: C.darkbrown },
  mushroom: { set: E, icon: "brown-mushroom" },
  meat: { set: E, icon: "cut-of-meat" },
  game: { set: E, icon: "deer" },
  tobacco: { set: G, icon: "smoking-pipe", color: C.brown },
  "wet-leaves": { set: E, icon: "fallen-leaf" },
  "forest-floor": { set: E, icon: "deciduous-tree" },
  vegetal: { set: E, icon: "broccoli" },
  savoury: { set: G, icon: "salt-shaker", color: C.grey },
  farmyard: { set: G, icon: "barn", color: C.brown },
  tar: { set: G, icon: "coal-pile", color: "#2A2A2A" },
  // ---- DELIBERATELY OXIDISED ----
  marzipan: { set: G, icon: "almond", color: C.tan },
  walnut: { set: G, icon: "acorn", color: C.darkbrown },
  toffee: { set: G, icon: "sugar-cane", color: C.nut },
  // ---- default ----
  wine: { set: G, icon: "wine-glass", color: C.garnet },
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

// A term's icon slug: its own glyph, else a neutral wine glass. The optional
// second argument (the term's family) is accepted for call-site symmetry but
// deliberately unused — the icon comes solely from the term.
/**
 * @param {string} term
 * @param {string} [_family] unused; kept so callers may pass the family
 * @returns {string}
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function iconForTerm(term, _family) {
  const slug = slugForTerm(term);
  return ICON_META[slug] ? slug : "wine";
}
