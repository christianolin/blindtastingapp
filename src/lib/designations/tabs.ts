export type DesignationTabKind =
  | "overview"
  | "burgundy"
  | "bordeaux"
  | "systems"
  | "glossary";

export type DesignationTab = {
  slug: string;
  label: string;
  kind: DesignationTabKind;
  systemKeys?: string[];
  glossaryTerms?: string[];
};

// Static, editable tab config. Order = display order.
// systemKeys -> wine_designations.key; glossaryTerms -> type_designations.name.
// overview/burgundy/champagne carry neither (data comes from queries/config).
export const DESIGNATION_TABS: DesignationTab[] = [
  { slug: "overview", label: "Overview", kind: "overview" },
  { slug: "burgundy", label: "Burgundy", kind: "burgundy" },
  {
    slug: "bordeaux",
    label: "Bordeaux",
    kind: "bordeaux",
    systemKeys: [
      "medoc-1855",
      "sauternes-1855",
      "saint-emilion-grand-cru-classe",
      "graves-cru-classe",
      "cru-bourgeois-medoc",
    ],
    glossaryTerms: [
      "Grand Cru Classé",
      "Premier Grand Cru Classé",
      "Cru Classé de Graves",
      "Cru Bourgeois",
      "Cru Artisan",
      "Cru Exceptionnel",
    ],
  },
  {
    slug: "alsace",
    label: "Alsace",
    kind: "systems",
    systemKeys: ["alsace-grand-cru"],
    glossaryTerms: ["Vendange Tardive", "Sélection de Grains Nobles"],
  },
  {
    slug: "champagne",
    label: "Champagne",
    kind: "systems",
    systemKeys: ["champagne-echelle-des-crus"],
  },
  {
    slug: "germany",
    label: "Germany",
    kind: "glossary",
    glossaryTerms: [
      "Kabinett",
      "Spätlese",
      "Auslese",
      "Beerenauslese (BA)",
      "Trockenbeerenauslese (TBA)",
      "Eiswein",
      "Grosses Gewächs (GG)",
      "Erste Lage",
      "1. Lage",
      "Gutswein",
      "Ortswein",
      "Trocken",
      "Halbtrocken",
      "Feinherb",
    ],
  },
  {
    slug: "austria",
    label: "Austria",
    kind: "glossary",
    glossaryTerms: ["Smaragd", "Federspiel", "Steinfeder"],
  },
  {
    slug: "ageing",
    label: "Ageing",
    kind: "glossary",
    glossaryTerms: [
      "Crianza",
      "Reserva",
      "Gran Reserva",
      "Riserva",
      "Superiore",
      "Novello",
      "Late Bottled Vintage (LBV)",
      "Vintage Port",
      "Colheita",
    ],
  },
  {
    slug: "fortified",
    label: "Fortified",
    kind: "glossary",
    glossaryTerms: [
      "Fino",
      "Manzanilla",
      "Amontillado",
      "Oloroso",
      "Palo Cortado",
      "Pedro Ximénez",
      "Ruby",
      "Tawny",
    ],
  },
  {
    slug: "sparkling",
    label: "Sparkling dosage",
    kind: "glossary",
    glossaryTerms: [
      "Brut Nature",
      "Extra Brut",
      "Brut",
      "Extra Dry",
      "Sec",
      "Demi-Sec",
      "Doux",
    ],
  },
];

// Reverse lookup: which tab hosts a given glossary term (exact match)?
export function glossaryTermTab(name: string): string | null {
  for (const tab of DESIGNATION_TABS) {
    if (tab.glossaryTerms?.includes(name)) return tab.slug;
  }
  return null;
}

// Reverse lookup: which tab hosts a given classification system (by key)?
export function systemTab(key: string): string | null {
  for (const tab of DESIGNATION_TABS) {
    if (tab.systemKeys?.includes(key)) return tab.slug;
  }
  return null;
}

// A classification system and a glossary term can share a name and a page
// ("Cru Classé de Graves": the Graves system and the type designation both
// open the Bordeaux tab). A list of search hits keeps the first of each
// (label, destination) pair, so the top-bar search shows one row, not two.
// Hits with the same label but a different destination all stay.
export function dropRepeatedHits<T extends { label: string }>(
  hits: readonly T[],
  href: (hit: T) => string,
): T[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.label}\u0000${href(h)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
