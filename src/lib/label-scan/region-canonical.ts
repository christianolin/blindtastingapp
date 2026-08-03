// Scanned labels name countries/regions in English, but the catalog stores
// canonical, often local-language spellings (Burgundy -> Bourgogne, Piedmont
// -> Piemonte, USA -> United States). These maps bridge the genuinely different
// words; accent-only differences (Rhône, Dão) are handled by the caller's
// accent-folding. Region synonyms are scoped by canonical country so same-named
// regions across countries (French "Moselle" vs German "Mosel") don't collide.

const COUNTRY_SYNONYMS: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  america: "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  britain: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  czechia: "Czech Republic",
  macedonia: "North Macedonia",
  italia: "Italy",
  espana: "Spain",
  deutschland: "Germany",
  osterreich: "Austria",
  suisse: "Switzerland",
  schweiz: "Switzerland",
  svizzera: "Switzerland",
  hellas: "Greece",
};

// Keys are lowercased; values are the exact catalog region name.
const REGION_SYNONYMS: Record<string, Record<string, string>> = {
  France: { burgundy: "Bourgogne", corse: "Corsica", savoy: "Savoie", bretagne: "Brittany", normandie: "Normandy", "languedoc-roussillon": "Languedoc", "south west": "Sud Ouest", "south west france": "Sud Ouest", "rhone valley": "Rhône", "rhône valley": "Rhône", "loire valley": "Loire" },
  Italy: { piedmont: "Piemonte", tuscany: "Toscana", sicily: "Sicilia", lombardy: "Lombardia", apulia: "Puglia", sardegna: "Sardinia", latium: "Lazio", "aosta valley": "Valle d'Aosta", "south tyrol": "Trentino Alto Adige", "alto adige": "Trentino Alto Adige", "trentino-alto adige": "Trentino Alto Adige", marches: "Marche", abruzzi: "Abruzzo", "emilia-romagna": "Emilia Romagna", "friuli-venezia giulia": "Friuli Venezia Giulia" },
  Spain: { catalunya: "Catalonia", cataluna: "Catalonia", andalusia: "Andalucia", "basque country": "Pais Vasco", navarre: "Navarra", "castile and leon": "Castilla y Leon", "castile-la mancha": "Castilla La Mancha", "castilla-la mancha": "Castilla La Mancha" },
  Germany: { moselle: "Mosel", palatinate: "Pfalz", franconia: "Franken", saxony: "Sachsen", "rhenish hesse": "Rheinhessen", "middle rhine": "Mittelrhein" },
  Portugal: { lisbon: "Lisboa", "setubal peninsula": "Peninsula de Setubal" },
  Austria: { "lower austria": "Niederosterreich", styria: "Steiermark", vienna: "Wien" },
  Greece: { attica: "Attiki" },
  Hungary: { tokay: "Tokaj" },
  Switzerland: { geneva: "Geneve", grisons: "Graubunden" },
  Croatia: { dalmatia: "Dalmacija", slavonia: "Slavonija" },
  Romania: { transylvania: "Transilvania" },
};

// Map a scanned country name onto the catalog's canonical spelling.
export function canonicalCountryName(country: string): string {
  return COUNTRY_SYNONYMS[country.trim().toLowerCase()] ?? country.trim();
}

// Map a scanned region name onto the catalog's canonical spelling. When the
// country is known the lookup is scoped to it (the caller keeps the raw name as
// a fallback); otherwise every country's map is searched.
export function canonicalRegionName(region: string, country?: string): string {
  const key = region.trim().toLowerCase();
  if (country) return REGION_SYNONYMS[country]?.[key] ?? region.trim();
  for (const map of Object.values(REGION_SYNONYMS)) {
    if (map[key]) return map[key];
  }
  return region.trim();
}
