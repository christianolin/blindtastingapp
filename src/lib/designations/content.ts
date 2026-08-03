export type DesignationContent = {
  hero?: { src: string; alt: string };
  intro?: string;
  hierarchy?: { tier: string; label: string; count?: string; note?: string }[];
};

// Keyed by wine_designations.key. Only flagships need entries; other systems
// fall back to their DB `description` and get no hero/pyramid.
export const DESIGNATION_CONTENT: Record<string, DesignationContent> = {
  "medoc-1855": {
    hero: { src: "/designations/medoc-1855.jpg", alt: "A château in the Médoc" },
    intro:
      "The Classification of 1855 was created for the Exposition Universelle in Paris. It ranks the top châteaux of the Médoc into five growths based on reputation and market price at the time.",
  },
  "burgundy-grand-cru": {
    hero: {
      src: "/designations/burgundy-grand-cru.jpg",
      alt: "Grand Cru vineyards in Burgundy",
    },
    intro:
      "Burgundy's Grand Cru vineyards represent the finest expression of the region. 33 sites are recognized for their exceptional terroir and tradition.",
    hierarchy: [
      { tier: "grand-cru", label: "Grand Cru", count: "33 vineyards" },
      { tier: "premier-cru", label: "Premier Cru", count: "~640 vineyards" },
      { tier: "village", label: "Village / Communal", count: "44 appellations" },
      { tier: "regional", label: "Regional", count: "23 appellations" },
      { tier: "bourgogne", label: "Bourgogne", note: "Regional blend" },
    ],
  },
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
