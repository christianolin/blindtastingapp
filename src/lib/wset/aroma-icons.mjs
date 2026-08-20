// Each WSET aroma/flavour term gets its own icon, picked per-term from the set
// that has the BEST, most literal, most legible glyph for it:
//
//   fluent-emoji-flat  — bold flat multicolour emoji. First choice: it reads at
//                        15px and is the literal thing (a lemon, a cinnamon-less
//                        but real bread, cheese, mushroom, deer...).
//   game-icons         — one-colour line icons, vendored PRE-TINTED. Used only
//                        where no emoji exists (leather, flint, wool, oak, tar,
//                        peppercorns, cinnamon...); we pick the simplest glyph.
//
// Rules this table follows (from owner review):
//   - the icon must be the ACTUAL note, never a stand-in ("quince tree" for
//     quince is not acceptable);
//   - prefer simple silhouettes — busy, detailed glyphs are unreadable at 15px;
//   - no two terms may share the same (set, icon, colour) — asserted by the test.
//
// ICON_META maps a slug -> { set, icon, color? }. `color` applies to game-icons
// only (emoji are already multicolour). The slug is the slugified term.

const F = "fluent-emoji-flat";
const G = "game-icons";

// Tints for the one-colour game-icons entries.
const C = {
  floral: "#C64B8C", violet: "#7A3F9E", green: "#6FA53F", herb: "#4F8A3A",
  sage: "#6E8B4A", citrus: "#E0B21E", amber: "#E0A81E", gold: "#C79A4E",
  red: "#B4283A", crimson: "#9E2536", pinkred: "#D45A6A", darkpurple: "#4A2A5E",
  blue: "#3A5FA0", brown: "#7A5230", darkbrown: "#5A3A26", garnet: "#6B3A2E",
  nut: "#8A5A2E", spice: "#A34327", slate: "#7C7C72", grey: "#8A8A80",
  cream: "#D8B85E", tan: "#C39A54", black: "#2E2A28", oak: "#7A5230",
};

export const ICON_META = {
  // ---- FLORAL (real flowers) ----
  blossom: { set: F, icon: "cherry-blossom" },
  acacia: { set: F, icon: "sunflower" },
  elderflower: { set: F, icon: "white-flower" },
  honeysuckle: { set: F, icon: "hibiscus" },
  jasmine: { set: F, icon: "blossom" },
  chamomile: { set: G, icon: "daisy", color: C.gold },
  geranium: { set: F, icon: "tulip" },
  rose: { set: F, icon: "rose" },
  violet: { set: F, icon: "wilted-flower" },
  // ---- GREEN FRUIT ----
  apple: { set: F, icon: "green-apple" },
  pear: { set: F, icon: "pear" },
  gooseberry: { set: F, icon: "kiwi-fruit" },
  grape: { set: F, icon: "grapes" },
  "pear-drop": { set: F, icon: "candy" },
  // Quince has no icon in any set — use the pear silhouette in quince-gold
  // (quince IS a pome, pear-shaped), rather than an unrelated stand-in.
  quince: { set: G, icon: "pear", color: C.gold },
  // ---- CITRUS ----
  lemon: { set: F, icon: "lemon" },
  "lemon-peel": { set: G, icon: "cut-lemon", color: C.citrus },
  lime: { set: G, icon: "lemon", color: "#7FBF3A" },
  grapefruit: { set: G, icon: "orange", color: C.pinkred },
  orange: { set: F, icon: "tangerine" },
  "orange-peel": { set: G, icon: "orange-slice", color: "#E68A2E" },
  // ---- STONE ----
  peach: { set: F, icon: "peach" },
  apricot: { set: G, icon: "peach", color: C.amber },
  nectarine: { set: G, icon: "peach", color: C.red },
  // ---- TROPICAL ----
  banana: { set: F, icon: "banana" },
  lychee: { set: G, icon: "cherry", color: C.pinkred },
  mango: { set: F, icon: "mango" },
  melon: { set: F, icon: "melon" },
  "passion-fruit": { set: G, icon: "kiwi-fruit", color: C.violet },
  pineapple: { set: F, icon: "pineapple" },
  // ---- RED FRUIT ----
  redcurrant: { set: G, icon: "elderberry", color: C.red },
  cranberry: { set: G, icon: "berry-bush", color: C.crimson },
  raspberry: { set: G, icon: "raspberry", color: C.pinkred },
  strawberry: { set: F, icon: "strawberry" },
  "red-cherry": { set: F, icon: "cherries" },
  "red-plum": { set: G, icon: "plum", color: C.red },
  // ---- BLACK FRUIT ----
  blackcurrant: { set: G, icon: "blackcurrant", color: C.darkpurple },
  blackberry: { set: G, icon: "berry-bush", color: C.darkpurple },
  blueberry: { set: F, icon: "blueberries" },
  "black-cherry": { set: G, icon: "cherry", color: "#3A2140" },
  "black-plum": { set: G, icon: "plum", color: C.darkpurple },
  bramble: { set: G, icon: "vine-leaf", color: C.darkpurple },
  // ---- HERBACEOUS ----
  "green-bell-pepper": { set: F, icon: "bell-pepper" },
  grass: { set: F, icon: "leafy-green" },
  "tomato-leaf": { set: F, icon: "tomato" },
  asparagus: { set: G, icon: "asparagus", color: C.herb },
  "blackcurrant-leaf": { set: G, icon: "vine-leaf", color: C.herb },
  // ---- HERBAL ----
  eucalyptus: { set: F, icon: "leaf-fluttering-in-wind" },
  mint: { set: F, icon: "herb" },
  fennel: { set: G, icon: "sprout", color: C.sage },
  dill: { set: G, icon: "seedling", color: C.sage },
  "dried-herbs": { set: G, icon: "herbs-bundle", color: C.sage },
  medicinal: { set: F, icon: "pill" },
  lavender: { set: G, icon: "spoted-flower", color: C.violet },
  // ---- SPICE ----
  "black-pepper": { set: G, icon: "powder", color: C.black },
  "white-pepper": { set: G, icon: "salt-shaker", color: "#B8A88A" },
  liquorice: { set: G, icon: "candy-canes", color: C.black },
  cinnamon: { set: G, icon: "incense", color: C.spice },
  // ---- FRUIT RIPENESS ----
  "unripe-fruit": { set: G, icon: "shiny-apple", color: C.green },
  "ripe-fruit": { set: F, icon: "red-apple" },
  "dried-fruit": { set: G, icon: "grain-bundle", color: C.darkbrown },
  "cooked-fruit": { set: F, icon: "pot-of-food" },
  jammy: { set: F, icon: "jar" },
  // ---- OTHER ----
  simple: { set: F, icon: "wine-glass" },
  "wet-stones": { set: G, icon: "stone-pile", color: C.slate },
  flint: { set: F, icon: "rock" },
  candy: { set: F, icon: "lollipop" },
  "wet-wool": { set: G, icon: "wool", color: C.grey },
  // ---- YEAST ----
  biscuit: { set: F, icon: "cookie" },
  "graham-cracker": { set: G, icon: "bread-slice", color: C.tan },
  bread: { set: F, icon: "bread" },
  toast: { set: G, icon: "butter-toast", color: "#B07A3A" },
  pastry: { set: F, icon: "croissant" },
  brioche: { set: F, icon: "cupcake" },
  "bread-dough": { set: G, icon: "dough-roller", color: C.cream },
  cheese: { set: F, icon: "cheese-wedge" },
  yogurt: { set: F, icon: "glass-of-milk" },
  acetaldehyde: { set: G, icon: "round-bottom-flask", color: C.green },
  // ---- MALOLACTIC ----
  butter: { set: F, icon: "butter" },
  cream: { set: G, icon: "milk-carton", color: "#E8E0C8" },
  // ---- OAK ----
  vanilla: { set: G, icon: "vanilla-flower", color: "#D8C89A" },
  cloves: { set: G, icon: "clover-spiked", color: C.brown },
  nutmeg: { set: F, icon: "chestnut" },
  coconut: { set: F, icon: "coconut" },
  butterscotch: { set: G, icon: "jelly-beans", color: C.gold },
  cedar: { set: F, icon: "evergreen-tree" },
  "charred-wood": { set: G, icon: "burning-embers", color: "#3A2A24" },
  smoke: { set: G, icon: "smoke-bomb", color: C.grey },
  chocolate: { set: F, icon: "chocolate-bar" },
  coffee: { set: F, icon: "hot-beverage" },
  resinous: { set: F, icon: "wood" },
  // ---- WHITE WINE (tertiary) ----
  "dried-apricot": { set: G, icon: "peach", color: C.nut },
  sultana: { set: G, icon: "grapes", color: C.nut },
  raisin: { set: G, icon: "grapes", color: C.garnet },
  "orange-marmalade": { set: G, icon: "honey-jar", color: "#C9702E" },
  petrol: { set: F, icon: "fuel-pump" },
  kerosene: { set: G, icon: "jerrycan", color: "#5A6A6A" },
  ginger: { set: F, icon: "ginger-root" },
  almond: { set: G, icon: "almond", color: C.nut },
  hazelnut: { set: F, icon: "peanuts" },
  honey: { set: F, icon: "honey-pot" },
  caramel: { set: G, icon: "honey-jar", color: C.amber },
  nutty: { set: G, icon: "peanut", color: C.nut },
  hay: { set: G, icon: "wheat", color: C.gold },
  "dried-apple": { set: G, icon: "shiny-apple", color: C.nut },
  "dried-banana": { set: G, icon: "banana", color: C.nut },
  // ---- RED WINE (tertiary) ----
  prune: { set: G, icon: "plum", color: C.darkbrown },
  fig: { set: G, icon: "fruiting", color: C.garnet },
  "cooked-plum": { set: G, icon: "cooking-pot", color: C.darkpurple },
  "cooked-cherry": { set: G, icon: "cherry", color: C.darkbrown },
  "cooked-red-plum": { set: G, icon: "saucepan", color: C.garnet },
  "dried-blackberry": { set: G, icon: "berry-bush", color: C.darkbrown },
  "dried-cranberry": { set: G, icon: "elderberry", color: C.darkbrown },
  "cooked-blackberry": { set: G, icon: "jelly", color: C.darkpurple },
  kirsch: { set: G, icon: "brandy-bottle", color: C.red },
  leather: { set: G, icon: "leather-boot", color: C.brown },
  earth: { set: G, icon: "stone-block", color: C.darkbrown },
  mushroom: { set: F, icon: "brown-mushroom" },
  meat: { set: F, icon: "cut-of-meat" },
  game: { set: F, icon: "deer" },
  tobacco: { set: G, icon: "smoking-pipe", color: C.brown },
  "wet-leaves": { set: F, icon: "fallen-leaf" },
  "forest-floor": { set: F, icon: "deciduous-tree" },
  vegetal: { set: F, icon: "broccoli" },
  savoury: { set: F, icon: "salt" },
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
