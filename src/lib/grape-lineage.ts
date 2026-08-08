// Grape parentage for the lineage view. Compiled from DNA-parentage research —
// principally Robinson, Harding & Vouillamoz, "Wine Grapes" (2012), the
// standard reference, plus the parentage studies it collects. Every edge
// carries a confidence so the UI can be honest about what's established versus
// uncertain, and unknown parentage is stated, not hidden.
//
// PROVENANCE NOTE: "confirmed" means the parentage is DNA-established and
// well-documented in the literature; "probable" means one parent is known or
// the finding is contested; "unknown" means parentage is genuinely unrecorded,
// not merely absent from our data. The Pinot × Gouais Blanc siblings and the
// Syrah = Dureza × Mondeuse Blanche edges were cross-checked against Wikipedia's
// cited summaries of the UC Davis / Wine Grapes findings (2026); the remaining
// edges are compiled from Wine Grapes and should be spot-checked before citing.
// Parents may name grapes outside the tasting list (e.g. Gouais Blanc); those
// render as external ancestor nodes with no profile page.

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
  { grape: "Chenin Blanc", parents: ["Savagnin"], confidence: "probable", note: "likely a Savagnin offspring" },

  // --- Rhône / south ------------------------------------------------------
  { grape: "Syrah", parents: ["Dureza", "Mondeuse Blanche"], confidence: "confirmed", note: "DNA parentage, Bowers 1998" },
  { grape: "Viognier", parents: [], confidence: "unknown", note: "close to Mondeuse Blanche; parents unrecorded" },

  // --- Italy --------------------------------------------------------------
  { grape: "Sangiovese", parents: ["Ciliegiolo", "Calabrese Montenuovo"], confidence: "confirmed" },
  { grape: "Nebbiolo", parents: [], confidence: "unknown", note: "ancient; parentage unrecorded" },
  { grape: "Zinfandel", parents: [], confidence: "unknown", note: "= Primitivo = Tribidrag, an old Croatian variety" },
  { grape: "Barbera", parents: [], confidence: "unknown", note: "ancient Piedmontese; parentage unrecorded" },
  { grape: "Dolcetto", parents: [], confidence: "unknown" },
  { grape: "Aglianico", parents: [], confidence: "unknown", note: "ancient southern Italian" },

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
  { grape: "Mondeuse", parents: [], confidence: "unknown", note: "Savoie; relative of Syrah's parent Mondeuse Blanche" },
  { grape: "Trousseau", parents: [], confidence: "unknown", note: "Jura; sibling relationships to Savagnin" },
  { grape: "Poulsard", parents: [], confidence: "unknown", note: "Jura founder" },
];

// Each grape must appear once, and a synonym/mutation must not also carry its
// own parentage row — both would render contradictory nodes. Fail loudly in
// development rather than ship a confusing tree.
if (process.env.NODE_ENV !== "production") {
  const seen = new Set<string>();
  for (const p of GRAPE_PARENTAGE) {
    if (seen.has(p.grape)) {
      throw new Error(`grape-lineage: duplicate entry for "${p.grape}"`);
    }
    seen.add(p.grape);
    if (GRAPE_SYNONYMS[p.grape] || GRAPE_MUTATIONS[p.grape]) {
      throw new Error(
        `grape-lineage: "${p.grape}" is a synonym/mutation and can't have its own parentage`,
      );
    }
  }
}
