import type { ScaleStep } from "@/app/knowledge/designations/scale-figure";

export type TabFigures = { slug: string; figures: ScaleFigureContent[] };

export type ScaleFigureContent = {
  title: string;
  axisFrom: string;
  axisTo: string;
  steps: ScaleStep[];
  source: string;
  columns?: number;
};

// Figures for the library's ordered classifications.
//
// Two kinds of number appear here, and the `source` line always says which:
//   • legally fixed EU-wide (sparkling dosage, German sweetness) — exact;
//   • region-dependent (Prädikat must weights, ageing minimums) — quoted for
//     ONE named region/appellation, because there is no single correct figure.
// Never present the second kind without its qualifier.

export const SPARKLING_DOSAGE: ScaleFigureContent = {
  title: "Sparkling wine sweetness (dosage)",
  axisFrom: "Bone dry",
  axisTo: "Sweet",
  columns: 4,
  steps: [
    {
      name: "Brut Nature",
      value: "0–3 g/L",
      note: "No dosage added. Also labelled Brut Zéro or Pas Dosé.",
    },
    { name: "Extra Brut", value: "0–6 g/L", note: "Bracingly dry." },
    {
      name: "Brut",
      value: "0–12 g/L",
      note: "By far the most common style for Champagne.",
    },
    {
      name: "Extra Dry",
      value: "12–17 g/L",
      note: "Confusingly, sweeter than Brut.",
    },
    { name: "Sec", value: "17–32 g/L", note: "Off-dry. 'Dry' in name only." },
    { name: "Demi-Sec", value: "32–50 g/L", note: "Clearly sweet; dessert styles." },
    { name: "Doux", value: "50+ g/L", note: "Rare today; the historic style." },
  ],
  source:
    "Residual sugar limits fixed EU-wide by Regulation (EU) 2019/33, Annex III. Neighbouring categories overlap by design.",
};

export const GERMAN_SWEETNESS: ScaleFigureContent = {
  title: "German dryness on the label",
  axisFrom: "Dry",
  axisTo: "Off-dry",
  columns: 3,
  steps: [
    {
      name: "Trocken",
      value: "≤ 9 g/L",
      note: "Dry: up to 4 g/L, or up to 9 g/L when acidity is within 2 g/L of the sugar.",
    },
    {
      name: "Halbtrocken",
      value: "≤ 18 g/L",
      note: "Off-dry, with acidity keeping it in balance.",
    },
    {
      name: "Feinherb",
      value: "no legal limit",
      note: "A traditional term, not a legal one — roughly halbtrocken, at the producer's discretion.",
    },
  ],
  source:
    "Trocken and halbtrocken limits are set by EU labelling rules; feinherb is customary and legally undefined.",
};

export const PRADIKAT: ScaleFigureContent = {
  title: "Prädikat — ripeness at harvest",
  axisFrom: "Least ripe",
  axisTo: "Most ripe",
  columns: 6,
  steps: [
    { name: "Kabinett", value: "70–82 °Oe", note: "Light, often the driest in style." },
    { name: "Spätlese", value: "76–90 °Oe", note: "'Late harvest' — riper, more concentrated." },
    { name: "Auslese", value: "83–100 °Oe", note: "Selected bunches; botrytis may appear." },
    { name: "Beerenauslese", value: "110–128 °Oe", note: "Individually selected berries, usually botrytised." },
    { name: "Trockenbeerenauslese", value: "150–154 °Oe", note: "Shrivelled botrytised berries; intensely sweet." },
    { name: "Eiswein", value: "110–128 °Oe", note: "Picked and pressed frozen; BA must weight, without botrytis." },
  ],
  source:
    "Minimum must weights are set per region and grape — the ranges above span Germany's 13 Anbaugebiete (lowest: Mosel; highest: Baden). A Mosel Kabinett and a Baden Kabinett are not the same measurement.",
};

export const WACHAU_CATEGORIES: ScaleFigureContent = {
  title: "Wachau categories — ripeness and weight",
  axisFrom: "Lightest",
  axisTo: "Fullest",
  columns: 3,
  steps: [
    {
      name: "Steinfeder",
      value: "max 11.5% abv",
      note: "Light and aromatic, for drinking young. Named after a grass of the terraces.",
    },
    {
      name: "Federspiel",
      value: "11.5–12.5% abv",
      note: "Classic dry style from riper fruit, picked in the main harvest.",
    },
    {
      name: "Smaragd",
      value: "min 12.5% abv",
      note: "The ripest, latest-picked wines. Named after the emerald lizards of the terraces.",
    },
  ],
  source:
    "Defined by the Vinea Wachau growers' association (its Codex Wachau), not by Austrian wine law — the terms are used only in the Wachau.",
};

export const FORTIFIED_STYLES: ScaleFigureContent = {
  title: "Sherry styles — how the wine was aged",
  axisFrom: "Pale, biological",
  axisTo: "Dark, oxidative",
  columns: 6,
  steps: [
    {
      name: "Manzanilla",
      note: "Fino made in Sanlúcar de Barrameda, where the cooler, damper air feeds a thicker flor.",
    },
    {
      name: "Fino",
      note: "Aged entirely under flor — the yeast veil that shields the wine from air. Pale and dry.",
    },
    {
      name: "Amontillado",
      note: "Starts under flor, finishes exposed to air once the flor dies. Amber, nutty.",
    },
    {
      name: "Palo Cortado",
      note: "The rare in-between: the delicacy of an amontillado with the body of an oloroso.",
    },
    {
      name: "Oloroso",
      note: "Fortified above the level flor tolerates, so it oxidises from the start. Dark, dry.",
    },
    {
      name: "Pedro Ximénez",
      note: "Sun-dried PX grapes; intensely sweet and near-black. The only sweet style here.",
    },
  ],
  source:
    "Ordered by ageing method rather than a measured value: sherry styles are defined by whether the wine aged under flor or in contact with air, not by a sugar or alcohol threshold.",
};

export const AGEING_MINIMUMS: ScaleFigureContent = {
  title: "Ageing terms — minimum requirements",
  axisFrom: "Shortest",
  axisTo: "Longest",
  columns: 4,
  steps: [
    {
      name: "Crianza (Rioja, red)",
      value: "24 months",
      note: "At least 12 in oak.",
    },
    {
      name: "Reserva (Rioja, red)",
      value: "36 months",
      note: "At least 12 in oak, 6 in bottle.",
    },
    {
      name: "Gran Reserva (Rioja, red)",
      value: "60 months",
      note: "At least 24 in oak, 24 in bottle.",
    },
    {
      name: "Riserva (Chianti Classico)",
      value: "24 months",
      note: "Italian 'Riserva' minimums are set per DOC — this is one of them.",
    },
    {
      name: "Late Bottled Vintage",
      value: "4–6 years",
      note: "Port from a single year, aged in cask before bottling.",
    },
    {
      name: "Vintage Port",
      value: "2 years in cask",
      note: "Declared years only; the ageing then happens in bottle.",
    },
    {
      name: "Colheita",
      value: "7 years",
      note: "Single-year tawny, aged in cask before bottling.",
    },
  ],
  source:
    "Ageing minimums are set by each appellation, not by the word alone: 'Reserva' in Rioja is not 'Riserva' in Chianti. Each figure above names the appellation it applies to.",
};

// Which figures lead which library tab. A tab's glossary definitions still
// follow underneath — the figure gives the shape, the list gives the detail.
export const TAB_FIGURES: Record<string, ScaleFigureContent[]> = {
  sparkling: [SPARKLING_DOSAGE],
  germany: [PRADIKAT, GERMAN_SWEETNESS],
  austria: [WACHAU_CATEGORIES],
  ageing: [AGEING_MINIMUMS],
  fortified: [FORTIFIED_STYLES],
};
