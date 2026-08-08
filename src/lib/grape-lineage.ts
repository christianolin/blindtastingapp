// Grape parentage for the lineage view. Compiled from DNA-parentage research —
// principally Robinson, Harding & Vouillamoz, "Wine Grapes" (2012), the
// standard reference, plus the parentage studies it collects. Every edge
// carries a confidence so the UI can be honest about what's established versus
// uncertain, and unknown parentage is stated, not hidden.
//
// PROVENANCE NOTE: these facts are compiled knowledge, not yet verified edge by
// edge against the primary papers — treat "confirmed" as "well-established in
// the literature" and spot-check before citing. Parents may name grapes that
// aren't in the tasting list (e.g. Gouais Blanc); those render as external
// ancestor nodes with no profile page.

export type Confidence = "confirmed" | "probable" | "unknown";

export type Parentage = {
  /** Child grape name — matches the grapes table name where one exists. */
  grape: string;
  /** Up to two parents. Empty = parentage unknown/unrecorded. */
  parents: string[];
  confidence: Confidence;
  /** One-line basis, shown on the node. */
  note?: string;
};

// Synonyms: the same variety under different names. Shown as an identity, never
// as a parent/child edge. Keyed child → canonical.
export const GRAPE_SYNONYMS: Record<string, string> = {
  Garnacha: "Grenache",
  Primitivo: "Zinfandel",
  "Tinta Roriz": "Tempranillo",
  Nielluccio: "Sangiovese",
  Silvaner: "Sylvaner",
  "Corvina Veronese": "Corvina",
};

// Colour/aromatic mutations of a single variety — a clone, not a cross.
export const GRAPE_MUTATIONS: Record<string, string> = {
  "Pinot Gris": "Pinot Noir",
  "Pinot Blanc": "Pinot Noir",
  "Pinot Meunier": "Pinot Noir",
  "Grenache Blanc": "Grenache",
  "Grenache Gris": "Grenache",
  Gewürztraminer: "Savagnin",
};

export const GRAPE_PARENTAGE: Parentage[] = [
  // --- The Pinot × Gouais Blanc siblings (Bowers/Meredith 1999) -----------
  { grape: "Chardonnay", parents: ["Pinot Noir", "Gouais Blanc"], confidence: "confirmed", note: "Pinot × Gouais Blanc" },
  { grape: "Aligoté", parents: ["Pinot Noir", "Gouais Blanc"], confidence: "confirmed", note: "Pinot × Gouais Blanc" },
  { grape: "Gamay", parents: ["Pinot Noir", "Gouais Blanc"], confidence: "confirmed", note: "Pinot × Gouais Blanc" },
  { grape: "Melon de Bourgogne", parents: ["Pinot Noir", "Gouais Blanc"], confidence: "confirmed", note: "Pinot × Gouais Blanc" },
  { grape: "Romorantin", parents: ["Pinot Noir", "Gouais Blanc"], confidence: "confirmed", note: "Pinot × Gouais Blanc" },

  // --- The Cabernet Franc family ------------------------------------------
  { grape: "Cabernet Sauvignon", parents: ["Cabernet Franc", "Sauvignon Blanc"], confidence: "confirmed", note: "DNA parentage, Meredith 1997" },
  { grape: "Merlot", parents: ["Cabernet Franc", "Magdeleine Noire des Charentes"], confidence: "confirmed" },
  { grape: "Carmenère", parents: ["Cabernet Franc", "Gros Cabernet"], confidence: "confirmed" },
  { grape: "Malbec", parents: ["Prunelard", "Magdeleine Noire des Charentes"], confidence: "confirmed", note: "half-sibling of Merlot" },

  // --- The Savagnin (Traminer) family -------------------------------------
  { grape: "Sylvaner", parents: ["Savagnin", "Österreichisch Weiss"], confidence: "confirmed" },
  { grape: "Grüner Veltliner", parents: ["Savagnin", "St Georgen"], confidence: "confirmed" },
  { grape: "Petit Manseng", parents: [], confidence: "unknown" },
  { grape: "Gros Manseng", parents: [], confidence: "unknown" },

  // --- Rhône / south ------------------------------------------------------
  { grape: "Syrah", parents: ["Dureza", "Mondeuse Blanche"], confidence: "confirmed", note: "DNA parentage, Bowers 1998" },
  { grape: "Viognier", parents: [], confidence: "unknown", note: "close to Mondeuse Blanche; parents unrecorded" },

  // --- Italy --------------------------------------------------------------
  { grape: "Sangiovese", parents: ["Ciliegiolo", "Calabrese Montenuovo"], confidence: "confirmed" },
  { grape: "Nebbiolo", parents: [], confidence: "unknown", note: "ancient; parentage unrecorded" },
  { grape: "Primitivo", parents: [], confidence: "unknown", note: "= Zinfandel = Tribidrag (Croatia)" },

  // --- Iberia -------------------------------------------------------------
  { grape: "Tempranillo", parents: ["Albillo Mayor", "Benedicto"], confidence: "confirmed", note: "DNA parentage, 2012" },
  { grape: "Grenache", parents: [], confidence: "unknown", note: "ancient Spanish (Garnacha)" },
  { grape: "Touriga Nacional", parents: [], confidence: "unknown" },

  // --- Riesling: one parent known -----------------------------------------
  { grape: "Riesling", parents: ["Gouais Blanc"], confidence: "probable", note: "one parent Gouais Blanc; the other a Traminer × wild-vine cross" },

  // --- Ancient / founder varieties with no recorded parents ---------------
  { grape: "Pinot Noir", parents: [], confidence: "unknown", note: "ancient founder; parent of much of Burgundy" },
  { grape: "Savagnin", parents: [], confidence: "unknown", note: "ancient founder (Traminer)" },
  { grape: "Sauvignon Blanc", parents: [], confidence: "unknown", note: "likely a Savagnin relative; unrecorded" },
  { grape: "Cabernet Franc", parents: [], confidence: "unknown", note: "old Basque/Bordeaux founder" },
  { grape: "Chenin Blanc", parents: [], confidence: "unknown", note: "likely a Savagnin offspring; unrecorded" },
];
