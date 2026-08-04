export type PyramidTier = {
  name: string;
  pct?: string;
  count?: string;
  labelling?: string;
  color: string;
  textColor?: string;
};

export type DesignationContent = {
  hero?: { src: string; alt: string };
  intro?: string;
  pyramid?: PyramidTier[];
};

// Keyed by wine_designations.key. Only flagships need entries; other systems
// fall back to their DB `description` and get no hero/pyramid.
export const DESIGNATION_CONTENT: Record<string, DesignationContent> = {
  "medoc-1855": {
    hero: { src: "/designations/medoc-1855.jpg", alt: "A château in the Médoc" },
    intro:
      "The Classification of 1855 was created for the Exposition Universelle in Paris. It ranks the top châteaux of the Médoc into five growths based on reputation and market price at the time.",
    pyramid: [
      { name: "Premier Cru", color: "#5C1A2B" },
      { name: "Deuxième Cru", color: "#7A2A3D" },
      { name: "Troisième Cru", color: "#8A3D52" },
      { name: "Quatrième Cru", color: "#9A7B4F" },
      { name: "Cinquième Cru", color: "#B78E42", textColor: "#2b0f18" },
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
  "graves-cru-classe": {
    intro:
      "The Cru Classé de Graves (1959) is a single flat tier — châteaux classified for red wine, white wine, or both. All lie within what is now Pessac-Léognan.",
    pyramid: [{ name: "Cru Classé", color: "#5C1A2B" }],
  },
  "burgundy-grand-cru": {
    hero: {
      src: "/designations/burgundy-grand-cru.jpg",
      alt: "Grand Cru vineyards in Burgundy",
    },
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
