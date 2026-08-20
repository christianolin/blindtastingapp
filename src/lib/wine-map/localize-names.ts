// Curated local -> English display names for the wine map's "English names"
// toggle. Only names with a genuine English exonym are listed; everything else
// (all appellations, and native names like Bordeaux, Champagne, Rioja, Veneto,
// Navarra, Castilla y León, Trentino-Alto-Adige) falls through UNCHANGED — we
// keep the native form where there is no natural English name. Keyed by the
// exact wine_places.name string, so the one dictionary drives the map label (a
// MapLibre `match` on the "name" tile property), the explorer tree, the legend
// and the details heading alike. No DB or tile change is involved.
export const LOCAL_TO_ENGLISH: Record<string, string> = {
  // Countries
  Italia: "Italy",
  // German wine regions keep their native names in English (Mosel, Pfalz,
  // Rheinhessen are used untranslated in the trade), so only the country needs
  // an exonym.
  Deutschland: "Germany",
  España: "Spain",
  // Italy regions
  Toscana: "Tuscany",
  Piemonte: "Piedmont",
  Sicilia: "Sicily",
  Lombardia: "Lombardy",
  Sardegna: "Sardinia",
  Puglia: "Apulia",
  // Spain comunidades
  Cataluña: "Catalonia",
  Andalucía: "Andalusia",
  Aragón: "Aragon",
  "Comunidad Valenciana": "Valencia",
  "Región de Murcia": "Murcia",
  "País Vasco": "Basque Country",
  "Illes Balears": "Balearic Islands",
  "Comunidad de Madrid": "Madrid",
  "Principado de Asturias": "Asturias",
  // France regions + subregions with a common English form (Côte de Beaune,
  // Côtes du Rhône, Châteauneuf-du-Pape etc. stay French — that IS their English
  // usage).
  Bourgogne: "Burgundy",
  Corse: "Corsica",
  "Vallée du Rhône": "Rhône Valley",
  "Rhône septentrional": "Northern Rhône",
  "Rhône méridional": "Southern Rhône",
  "Vallée de la Loire": "Loire Valley",
  "Sud-Ouest": "South West France",
  Gascogne: "Gascony",
  Pyrénées: "Pyrenees",
};

export function englishName(name: string): string {
  return LOCAL_TO_ENGLISH[name] ?? name;
}

// MapLibre expression for the label layer's `text-field` in English mode: match
// the "name" tile property against the dictionary, falling through to the local
// name for anything not listed.
export function englishTextFieldExpression(): unknown {
  return [
    "match",
    ["get", "name"],
    ...Object.entries(LOCAL_TO_ENGLISH).flat(),
    ["get", "name"],
  ];
}
