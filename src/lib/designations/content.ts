export type PyramidTier = {
  name: string;
  // Short ordinal shown as a marker on the band (the 1855 growths are widely
  // referred to as 1er, 2ème … rather than by their full tier name).
  rank?: string;
  pct?: string;
  count?: string;
  labelling?: string;
  color: string;
  textColor?: string;
};

export type DesignationContent = {
  hero?: { src: string; alt: string };
  // A second, smaller image shown framed beside the intro (an artefact or
  // document, where the hero is atmospheric).
  inset?: { src: string; alt: string; caption?: string };
  intro?: string;
  pyramid?: PyramidTier[];
};

// Keyed by wine_designations.key. Only flagships need entries; other systems
// fall back to their DB `description` and get no hero/pyramid.
export const DESIGNATION_CONTENT: Record<string, DesignationContent> = {
  "medoc-1855": {
    hero: {
      src: "/hero/1stGrowths-bordeaux_legends_grande.webp",
      alt: "The five Médoc first growths",
    },
    intro:
      "The Classification of 1855 was created for the Exposition Universelle in Paris. It ranks the top châteaux of the Médoc into five growths based on reputation and market price at the time.",
    pyramid: [
      { name: "Premier Cru", rank: "1er", color: "#5C1A2B" },
      { name: "Deuxième Cru", rank: "2ème", color: "#7A2A3D" },
      { name: "Troisième Cru", rank: "3ème", color: "#8A3D52" },
      { name: "Quatrième Cru", rank: "4ème", color: "#9A7B4F" },
      { name: "Cinquième Cru", rank: "5ème", color: "#B78E42", textColor: "#2b0f18" },
    ],
  },
  "sauternes-1855": {
    intro:
      "The 1855 ranking also classified the sweet wines of Sauternes and Barsac: one Premier Cru Supérieur (Château d'Yquem), then the Premiers Crus and the Deuxièmes Crus.",
    pyramid: [
      { name: "Premier Cru Supérieur", color: "#5C1A2B" },
      { name: "Premier Cru", color: "#8A3D52" },
      { name: "Deuxième Cru", color: "#B78E42", textColor: "#2b0f18" },
    ],
  },
  "saint-emilion-grand-cru-classe": {
    intro:
      "Saint-Émilion's classification is revised roughly every ten years. It runs from Premier Grand Cru Classé A, to Premier Grand Cru Classé B, to Grand Cru Classé.",
    pyramid: [
      { name: "Premier Grand Cru Classé A", color: "#5C1A2B" },
      { name: "Premier Grand Cru Classé B", color: "#8A3D52" },
      { name: "Grand Cru Classé", color: "#B78E42", textColor: "#2b0f18" },
    ],
  },
  "champagne-echelle-des-crus": {
    intro:
      "Champagne ranks whole villages rather than individual estates. The échelle (\u201cladder\u201d) once set grape prices as a percentage of the going rate: 100% villages were Grand Cru, 90\u201399% Premier Cru. The price scale was abandoned in the 2000s, but the 17 Grand Cru and 42 Premier Cru villages remain, and the terms still appear on labels.",
    pyramid: [
      { name: "Grand Cru", rank: "100%", color: "#5C1A2B" },
      { name: "Premier Cru", rank: "90–99%", color: "#B78E42", textColor: "#2b0f18" },
    ],
  },
  "graves-cru-classe": {
    intro:
      "The Cru Classé de Graves (1959) is a single flat tier — châteaux classified for red wine, white wine, or both. All lie within what is now Pessac-Léognan.",
    pyramid: [{ name: "Cru Classé", color: "#5C1A2B" }],
  },
  "burgundy-grand-cru": {
    intro:
      "Burgundy's Grand Cru vineyards represent the finest expression of the region. 33 sites are recognized for their exceptional terroir and tradition.",
    pyramid: [
      { name: "Grand Cru", pct: "~2% of production", count: "33 AOCs", labelling: "Vineyard + Grand Cru", color: "#5C1A2B" },
      { name: "Premier Cru", pct: "~12% of production", count: "640+ climats", labelling: "Village + Premier Cru + Vineyard", color: "#8A3D52" },
      { name: "Village", pct: "~36% of production", count: "44 AOCs", labelling: "Village name", color: "#9A7B4F" },
      { name: "Regional", pct: "~50% of production", count: "23 AOCs", labelling: "Bourgogne (Burgundy)", color: "#B78E42", textColor: "#2b0f18" },
    ],
  },
};

// A short standing explainer at the top of every tab, keyed by tab slug.
//
// The single most confusing thing about French classification is that the
// systems classify DIFFERENT KINDS OF THING under the same vocabulary: Bordeaux
// ranks producers, Burgundy and Alsace rank land, Champagne ranks whole
// villages. "Grand Cru" therefore means three unrelated things depending on
// where you are, and a reader who does not know that will mis-read every label.
// Each intro below says plainly what its system classifies before anything else.
export const TAB_INTRO: Record<string, string> = {
  burgundy:
    "Burgundy classifies LAND, not producers. Every plot is ranked in its own right, and the rank stays with the vineyard no matter who owns or makes it — which is why dozens of growers can each bottle the same Grand Cru. The ladder runs Regional → Village → Premier Cru → Grand Cru, narrowing from a whole region to a single named plot. A Premier Cru is a named climat within a village and is labelled village-first (Chambolle-Musigny 1er Cru Les Amoureuses); a Grand Cru has outgrown its village and is an appellation on its own, labelled by the vineyard name alone (Musigny). Ownership is fragmented by inheritance law, so quality within one Grand Cru varies enormously by producer.",
  bordeaux:
    "Bordeaux classifies PRODUCERS — châteaux — not vineyards. A château's rank belongs to the estate and its brand, so it travels with the name: if the estate buys neighbouring land, that land is generally sold under the classified label too. This is the opposite of Burgundy, where the rank is fixed to the ground. The 1855 Médoc ranking was drawn up from broker price lists for the Paris Exposition and has changed only once since; Saint-Émilion by contrast re-ranks roughly every decade, and estates are promoted and demoted. The appellation (Pauillac, Margaux) tells you where the wine is from; the classification tells you the estate's historic standing within it.",
  alsace:
    "Alsace classifies SITES. Each of the 51 Grands Crus is a delimited parcel of land that is its own AOC, with its own rules on grape, yield and ripeness — closer to Burgundy than to Bordeaux, since the rank belongs to the ground rather than the grower. There is no Premier Cru tier: a wine is either from a Grand Cru site or it is not. Each cru lies within one or more communes (villages), and the commune is shown here because labels and merchants use it to place the cru. Crus are usually labelled with the grape as well as the site, which is unusual in France.",
  champagne:
    "Champagne classifies WHOLE VILLAGES, not vineyards or producers. Under the Échelle des Crus — the 'ladder of growths' — each of the 300-odd villages was rated as a percentage, and that percentage set the price growers were paid for their grapes: 100% villages were Grand Cru, 90–99% Premier Cru. Because it rates a whole commune, every vineyard inside a Grand Cru village carries the rating, good plot or bad. The price scale was abandoned in the 2000s and the ratings no longer fix what anyone is paid, but the 17 Grand Cru and 42 Premier Cru villages are unchanged and the terms still appear on labels. Most Champagne is blended across many villages, so a single-village bottling is a deliberate statement.",
  germany:
    "Germany classifies RIPENESS AT HARVEST, not land or producers — the one major system on this page that measures the fruit rather than ranking a place. The Prädikat ladder records how much sugar the grapes held when picked, from Kabinett up to Trockenbeerenauslese. Crucially, ripeness is not sweetness: a Spätlese can be fermented bone dry, so the label also carries a separate dryness term (trocken, halbtrocken). A parallel vineyard classification does exist — the VDP growers' association ranks sites as Grosse Lage and Erste Lage, with Grosses Gewächs for dry wines from the top sites — but that is an association's private scheme, not German wine law.",
  austria:
    "Austria's national system classifies by region and style, but the Wachau runs its own ladder, and it is the one you meet on labels. Steinfeder, Federspiel and Smaragd sort dry wines by ripeness and body, measured in alcohol. It is not Austrian wine law at all: it is the Codex of Vinea Wachau, a growers' association, and the terms may be used only in the Wachau — a producer twenty kilometres downstream cannot use them. All three are dry. Elsewhere in Austria, look instead for DAC, which ties a region's name to a defined style.",
  ageing:
    "These terms classify TIME — how long a wine was held before release, and in what vessel. They are the most misread words on a wine label, because the same word carries different legal force in each country and often in each appellation. 'Reserva' in Rioja is a specific, enforceable minimum; 'Riserva' in Italy means whatever that individual DOCG's rules say, so a Chianti Classico Riserva and a Barolo Riserva are nearly three years apart. Elsewhere — much of the New World — 'Reserve' has no legal meaning whatsoever and is purely marketing. The tables below are therefore split by country, and each figure names the appellation it applies to.",
  fortified:
    "Fortified wines are classified by HOW THEY WERE AGED, not by where they grew or how ripe the fruit was. Sherry's styles turn on one question: did the wine mature under flor, the living yeast veil that seals it from air, or in contact with air? That single fork produces everything from pale, bracing Fino to dark, nutty Oloroso. Port splits the same way — Ruby styles mature in bottle and keep their fruit, Tawny styles mature in cask and go amber and nutty. Both are fortified with grape spirit, but the timing differs: for Port it happens mid-fermentation, which is what leaves the wine sweet.",
  sparkling:
    "Sparkling wine is classified by SWEETNESS — specifically by dosage, the small amount of sugar added after disgorgement to balance the wine's acidity. The scale is fixed EU-wide, so unlike most terms on this page these mean the same thing everywhere from Champagne to Cava to Prosecco. The one trap is the naming: Extra Dry is sweeter than Brut, not drier, a survival from the nineteenth century when Champagne was sweetened far more heavily and 'dry' was relative. Adjacent categories overlap by design, so a producer near a boundary can choose either term.",
};

export const CRU_BOURGEOIS = {
  title: "Cru Bourgeois du Médoc",
  body:
    "A separate Médoc classification sitting below the 1855 growths, re-ranked on a rolling basis (currently every five years) — so its roster changes too often to fix here. Since 2020 it has three levels, from the top: Cru Bourgeois Exceptionnel, Cru Bourgeois Supérieur, and Cru Bourgeois, awarded on quality and production standards rather than 1855's historic hierarchy.",
};

export const OVERVIEW_INTRO =
  "Wine designations describe where, how and by what rules a wine is made. They help us understand quality, style and origin — from broad regions to very specific vineyards.";

export const WHY_CARDS: { title: string; body: string }[] = [
  { title: "Indicate origin", body: "They show where the grapes come from and how the area is defined." },
  { title: "Set standards", body: "Rules for grape varieties, yields, winemaking and aging ensure consistency and quality." },
  { title: "Create hierarchy", body: "From country to region to vineyard, each level adds more specificity." },
  { title: "Reflect tradition", body: "Many designations are rooted in history and local knowledge." },
];

export const VARIATION_INTRO =
  "Wine is one of the world's most diverse drinks. Differences in climate, soils, grape varieties and winemaking traditions create an incredible range of styles.";

export const VARIATION_CARDS: { title: string; body: string }[] = [
  { title: "Country to country", body: "Climate and culture shape the overall style." },
  { title: "Region to region", body: "Terroir and tradition create distinct expressions." },
  { title: "Village to village", body: "Even small areas can have unique character." },
  { title: "Vineyard to vineyard", body: "The best wines often come from single vineyards." },
];

export const BLIND_TASTING_NOTE =
  "For blind tasting, understanding designations helps you place a wine in the right context and make more accurate, confident guesses.";
