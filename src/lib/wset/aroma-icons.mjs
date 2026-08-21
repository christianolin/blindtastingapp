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
//   - it must SURVIVE the cream pill (#FBF5E7): a cream or near-white tint is
//     invisible there, so pale notes take a saturated stand-in colour;
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
  // Acacia reads as honey-gold; a full-colour flower-head survives the pill far
  // better than the pale gold line-art it replaced (invisible on cream).
  acacia: { set: E, icon: "rosette" },
  // Elder's flower is a green-stemmed umbel of tiny florets. The white-flower
  // emoji was near-white on a cream pill; this keeps the plant and the contrast.
  elderflower: { set: G, icon: "elderberry", color: "#A8B03A" },
  honeysuckle: { set: E, icon: "hibiscus" },
  jasmine: { set: E, icon: "blossom" },
  // Chamomile IS a daisy — the glyph was right, the cream tint was not.
  chamomile: { set: G, icon: "daisy", color: "#D9A82E" },
  geranium: { set: E, icon: "tulip" },
  rose: { set: E, icon: "rose" },
  violet: { set: G, icon: "spoted-flower", color: "#7B4FA8" },
  // ---- GREEN FRUIT ----
  apple: { set: E, icon: "green-apple" },
  pear: { set: E, icon: "pear" },
  // Owner disliked the leafy berry-bush (busy cluster). A single green orchard
  // fruit with a leaf reads cleaner at pill size; no set has a literal gooseberry.
  gooseberry: { set: G, icon: "plum", color: "#8FBF3A" },
  grape: { set: E, icon: "grapes" },
  quince: { set: P, icon: "pear", color: "#E3BE33" }, // no quince glyph anywhere; pome silhouette
  // ---- CITRUS ----
  lemon: { set: E, icon: "lemon" },
  "lemon-peel": { set: G, icon: "cut-lemon", color: C.citrus },
  lime: { set: G, icon: "lemon", color: "#7FBF3A" },
  grapefruit: { set: P, icon: "orange-one", color: "#EF6A5A" },
  orange: { set: E, icon: "tangerine" },
  "orange-peel": { set: G, icon: "orange-slice", color: "#E68A2E" },
  // ---- STONE ----
  peach: { set: E, icon: "peach" },
  apricot: { set: P, icon: "peach", color: "#E8A33A" },
  nectarine: { set: G, icon: "peach", color: "#E0553A" },
  // ---- TROPICAL ----
  banana: { set: E, icon: "banana" },
  // No set has a lychee. A small round red fruit with a bumpy, split skin is
  // the next-closest thing, and it survives the pill where the pale berry
  // cluster it replaced did not.
  lychee: { set: O, icon: "pomegranate" },
  mango: { set: E, icon: "mango" },
  melon: { set: E, icon: "melon" },
  // Halved fruit showing its seed cavity — the passion fruit's defining look.
  // Nothing renders it better; the tint is deepened for contrast on cream.
  "passion-fruit": { set: G, icon: "kiwi-fruit", color: "#7A2E6B" },
  pineapple: { set: E, icon: "pineapple" },
  // ---- RED FRUIT (single-object glyphs, no clusters) ----
  redcurrant: { set: G, icon: "berry-bush", color: C.red },
  cranberry: { set: G, icon: "raspberry", color: "#C42A3A" },
  raspberry: { set: G, icon: "raspberry", color: C.pinkred },
  strawberry: { set: E, icon: "strawberry" },
  "red-cherry": { set: P, icon: "cherry", color: "#C42A3A" },
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
  dill: { set: G, icon: "fern", color: "#5E8A3A" }, // feathery frond, not a pot plant
  "dried-herbs": { set: G, icon: "herbs-bundle", color: C.sage },
  medicinal: { set: E, icon: "pill" },
  lavender: { set: G, icon: "dandelion-flower", color: "#9B7BC4" },
  // ---- SPICE ----
  "black-pepper": { set: O, icon: "pepper-mill" },
  "white-pepper": { set: O, icon: "salt-mill" },
  liquorice: { set: G, icon: "wrapped-sweet", color: C.black },
  cinnamon: { set: G, icon: "wood-stick", color: "#9C5A2B" },
  // ---- FRUIT RIPENESS ----
  "unripe-fruit": { set: G, icon: "shiny-apple", color: C.green },
  "ripe-fruit": { set: E, icon: "red-apple" },
  "dried-fruit": { set: G, icon: "fruit-bowl", color: "#8A5A2E" }, // was a wheat sheaf
  "cooked-fruit": { set: E, icon: "pie" }, // baked fruit, not a savoury stew pot
  jammy: { set: O, icon: "jar-with-red-content" }, // jam IN the jar, not an empty one
  // ---- OTHER ----
  simple: { set: E, icon: "wine-glass" },
  "wet-stones": { set: E, icon: "rock" },
  flint: { set: G, icon: "flint-spark", color: C.slate },
  candy: { set: E, icon: "candy" },
  "wet-wool": { set: G, icon: "wool", color: C.grey },
  // Coastal whites: the two notes the WSET lexicon leaves out. Minerality gets
  // a crystal cluster (distinct from wet stones' rounded pebble and flint's
  // spark); saltiness gets the salt shaker itself.
  minerality: { set: G, icon: "minerals", color: "#5E7E9E" },
  saltiness: { set: E, icon: "salt" },
  // ---- YEAST ----
  biscuit: { set: E, icon: "cookie" },
  "graham-cracker": { set: G, icon: "bread-slice", color: "#C98A4A" },
  bread: { set: E, icon: "bread" },
  toast: { set: G, icon: "butter-toast", color: "#B07A3A" },
  pastry: { set: E, icon: "croissant" },
  // A round, domed, scored bun — the shape brioche is baked in. (The burger
  // emoji has the right bun but comes with a beef patty attached.)
  brioche: { set: O, icon: "boule-bread" },
  // Dough proving in a bowl. A flour sack is an ingredient, not the dough, and
  // its cream tint was invisible on the cream pill.
  "bread-dough": { set: G, icon: "bubbling-bowl", color: "#C9A046" },
  cheese: { set: E, icon: "cheese-wedge" },
  yogurt: { set: E, icon: "bowl-with-spoon" }, // eaten from a bowl; the carton read as milk
  acetaldehyde: { set: G, icon: "round-bottom-flask", color: C.green },
  // ---- MALOLACTIC ----
  butter: { set: E, icon: "butter" },
  cream: { set: P, icon: "milk", color: "#D9C88A" }, // was near-white on cream
  // ---- OAK ----
  vanilla: { set: G, icon: "vanilla-flower", color: "#E6D9A8" },
  cloves: { set: G, icon: "clover-spiked", color: "#5C3A1E" },
  nutmeg: { set: E, icon: "chestnut" },
  coconut: { set: E, icon: "coconut" },
  butterscotch: { set: G, icon: "jelly-beans", color: C.gold },
  cedar: { set: E, icon: "evergreen-tree" },
  // Burnt logs, in the red-brown of a toasted stave — the old embers glyph was
  // so near-black it read as a smudge.
  "charred-wood": { set: G, icon: "campfire", color: "#8A4A2E" },
  // A solid puff. The smoke-bomb's thin curls disappeared at pill size, and its
  // pale grey had almost no contrast against cream.
  smoke: { set: G, icon: "steam", color: "#5F5F58" },
  chocolate: { set: E, icon: "chocolate-bar" },
  coffee: { set: E, icon: "hot-beverage" },
  // Sticky pine sap oozing — resin, not a cut plank. The plain log read as
  // plain "wood/oak"; a whole conifer would just be a second cedar tree.
  resinous: { set: G, icon: "dripping-goo", color: "#B5782A" },
  // ---- WHITE WINE (tertiary) ----
  "dried-apricot": { set: G, icon: "peach", color: "#C97A3A" },
  sultana: { set: G, icon: "grapes", color: "#C79A4E" },
  raisin: { set: G, icon: "grapes", color: "#5A3A2E" },
  "orange-marmalade": { set: G, icon: "honey-jar", color: "#E07A2E" },
  petrol: { set: E, icon: "fuel-pump" },
  kerosene: { set: G, icon: "jerrycan", color: "#5A6A6A" },
  ginger: { set: E, icon: "ginger-root" },
  almond: { set: G, icon: "almond", color: "#C9A46A" },
  hazelnut: { set: E, icon: "peanuts" },
  honey: { set: E, icon: "honey-pot" },
  caramel: { set: G, icon: "honey-jar", color: C.amber },
  nutty: { set: G, icon: "peanut", color: "#B58248" },
  hay: { set: G, icon: "wheat", color: C.gold },
  "dried-apple": { set: G, icon: "shiny-apple", color: "#C9A46A" },
  "dried-banana": { set: G, icon: "banana", color: "#C9A44A" },
  // ---- RED WINE (tertiary) ----
  prune: { set: G, icon: "plum", color: "#4A2A38" },
  fig: { set: G, icon: "fruiting", color: "#6E3560" },
  "cooked-plum": { set: G, icon: "cooking-pot", color: "#7A3A6E" },
  "cooked-cherry": { set: G, icon: "cherry", color: "#8A2A2E" },
  "cooked-red-plum": { set: G, icon: "saucepan", color: "#A33A3A" },
  "dried-blackberry": { set: G, icon: "berries-bowl", color: "#4A2A44" },
  "dried-cranberry": { set: G, icon: "berry-bush", color: "#8A2A32" },
  "cooked-blackberry": { set: G, icon: "jelly", color: C.darkpurple },
  kirsch: { set: G, icon: "brandy-bottle", color: C.red },
  leather: { set: G, icon: "leather-vest", color: "#8A5A32" },
  earth: { set: G, icon: "stone-block", color: "#6B4A32" },
  mushroom: { set: E, icon: "brown-mushroom" },
  meat: { set: E, icon: "cut-of-meat" },
  game: { set: E, icon: "deer" },
  tobacco: { set: G, icon: "smoking-pipe", color: "#6B4A2E" },
  "wet-leaves": { set: E, icon: "fallen-leaf" },
  "forest-floor": { set: E, icon: "deciduous-tree" },
  vegetal: { set: E, icon: "broccoli" },
  // A steaming broth bowl says umami. The salt shaker moved to `saltiness`,
  // where it is literal — two shakers in one lexicon would just be confusing.
  savoury: { set: E, icon: "steaming-bowl" },
  farmyard: { set: G, icon: "barn", color: "#9C3A2E" },
  tar: { set: G, icon: "coal-pile", color: "#2A2A2A" },
  // ---- DELIBERATELY OXIDISED ----
  // Marzipan is almond CONFECTION, not the raw nut — so a sweet, in a warm
  // marzipan gold. The old pale-almond glyph was near-invisible on cream and a
  // twin of the `almond` term; cake evokes it (kransekage, cake-covering).
  marzipan: { set: G, icon: "cake-slice", color: "#C9A24E" },
  walnut: { set: G, icon: "acorn", color: "#7A5230" },
  // A wrapped sweet in toffee brown. Sugar cane is the raw crop, which is not
  // what "toffee" smells of. (Freed by pear drop leaving the lexicon.)
  toffee: { set: P, icon: "candy", color: "#B5722E" },
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
