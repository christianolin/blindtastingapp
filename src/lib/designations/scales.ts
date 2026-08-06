import type {
  ScaleStep,
  ScaleUnit,
} from "@/app/knowledge/designations/scale-figure";

export type TabFigures = { slug: string; figures: ScaleFigureContent[] };

export type ScaleFigureContent = {
  title: string;
  axisFrom: string;
  axisTo: string;
  steps: ScaleStep[];
  source: string;
  columns?: number;
  /**
   * What the numbers in this figure are measured in. Rendered above the steps.
   * A figure that shows "83–105 °Oe" or "24 months" is unreadable to anyone who
   * does not already know the unit, which defeats the point of a teaching aid.
   */
  units?: ScaleUnit[];
};

// Figures for the library's ordered classifications.
//
// Three kinds of number appear here, and the `source` line always says which:
//   • legally fixed EU-wide (sparkling dosage, German sweetness) — exact;
//   • fixed by one named appellation's rules (Rioja, Port, each DOCG) — exact
//     for that appellation and nowhere else;
//   • indicative (German must weights) — no single figure is correct, because
//     the law delegates the minimums to 13 separate state regulations.
// Never present the second or third kind without its qualifier.

const G_PER_LITRE = {
  symbol: "g/L",
  name: "grams per litre",
  explanation:
    "Grams of residual sugar in one litre of wine. 12 g/L is about a level teaspoon of sugar per glass — detectable, but balanced by acidity.",
};

const MONTHS = {
  symbol: "months",
  name: "minimum ageing time",
  explanation:
    "Counted from a fixed start date set by the appellation (often 1 November or 1 January after harvest), not from the day of pressing. These are minimums: a producer may always age for longer.",
};

const OECHSLE = {
  symbol: "°Oe",
  name: "degrees Oechsle",
  explanation:
    "Must weight — the sugar in the juice at harvest, measured as density. 1 °Oe means one litre of juice weighs 1 g more than a litre of water. More sugar means a riper grape and more potential alcohol; it says nothing about how sweet the finished wine tastes.",
};

const ABV = {
  symbol: "% abv",
  name: "alcohol by volume",
  explanation:
    "The share of the finished wine that is alcohol. Where it appears as a minimum it is a legal threshold the wine must reach to carry the term.",
};

export const SPARKLING_DOSAGE: ScaleFigureContent = {
  title: "Sparkling wine sweetness (dosage)",
  axisFrom: "Bone dry",
  axisTo: "Sweet",
  columns: 4,
  units: [G_PER_LITRE],
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
  units: [G_PER_LITRE],
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
  units: [OECHSLE, ABV],
  steps: [
    {
      name: "Kabinett",
      value: "~67–85 °Oe",
      note: "Light, often the driest in style. Finished wine must reach 7% abv.",
    },
    {
      name: "Spätlese",
      value: "~76–95 °Oe",
      note: "'Late harvest' — riper, more concentrated. 7% abv minimum.",
    },
    {
      name: "Auslese",
      value: "~83–105 °Oe",
      note: "Selected bunches; botrytis may appear. 7% abv minimum.",
    },
    {
      name: "Beerenauslese",
      value: "~110–128 °Oe",
      note: "Individually selected berries, usually botrytised. 5.5% abv minimum.",
    },
    {
      name: "Trockenbeerenauslese",
      value: "~150–154 °Oe",
      note: "Shrivelled botrytised berries; intensely sweet. 5.5% abv minimum.",
    },
    {
      name: "Eiswein",
      value: "= Beerenauslese",
      note: "Picked and pressed frozen. The law fixes its must weight at the region's BA minimum — but without botrytis.",
    },
  ],
  source:
    "The Oechsle figures are INDICATIVE, not statute. German wine law (WeinG §17(3)) sets no must weights: it fixes floors in natural alcohol — Prädikatswein at least 9.5% vol in Zone A (9.0% for Ahr, Mittelrhein, Mosel and Saale-Unstrut), 10.0% in Zone B — and delegates the actual minimums to each of the 13 Anbaugebiete by state regulation, per grape variety, graduated by Prädikat. So a Mosel Kabinett and a Baden Kabinett are genuinely different measurements, and no single number is correct for all of Germany. What IS federally fixed and exact: the finished-wine alcohol minimums above (WeinG §17(1)), and that Eiswein must reach its region's Beerenauslese must weight (WeinG §17(3)(e)).",
};

export const WACHAU_CATEGORIES: ScaleFigureContent = {
  title: "Wachau categories — ripeness and weight",
  axisFrom: "Lightest",
  axisTo: "Fullest",
  columns: 3,
  units: [ABV],
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

// --- Ageing, split by country ------------------------------------------------
//
// These used to be one combined figure, which put "Reserva" (Rioja) next to
// "Riserva" (Chianti) next to "Colheita" (Port) and implied they belong to one
// scale. They do not: each country's terms are set by its own rules, mean
// different things, and are only comparable within a country.

export const SPAIN_AGEING: ScaleFigureContent = {
  title: "Spain — Rioja ageing terms",
  axisFrom: "Shortest",
  axisTo: "Longest",
  columns: 4,
  units: [MONTHS],
  steps: [
    {
      name: "Genérico",
      value: "no minimum",
      note: "Young wine, kept fresh and fruity. Sometimes labelled 'joven'.",
    },
    {
      name: "Crianza",
      value: "24 months",
      note: "Red: at least 12 in a 225 L oak barrel. White and rosé: at least 6 in barrel.",
    },
    {
      name: "Reserva",
      value: "36 months",
      note: "Red: at least 12 in oak and 6 in bottle. White and rosé: 24 months total, 6 in barrel.",
    },
    {
      name: "Gran Reserva",
      value: "60 months",
      note: "Red: at least 24 in oak and 24 in bottle. White and rosé: 48 months total, 6 in barrel.",
    },
  ],
  source:
    "Set by the Consejo Regulador of DOCa Rioja and exact for Rioja only. Other Spanish DOs use the same words with their own minimums — a Ribera del Duero Reserva is not a Rioja Reserva. Rioja's sparkling wines run on a separate ladder: Espumoso 15 months on lees, Reserva 24, Gran Añada 36.",
};

export const ITALY_AGEING: ScaleFigureContent = {
  title: "Italy — ageing terms, by appellation",
  axisFrom: "Shortest",
  axisTo: "Longest",
  columns: 4,
  units: [MONTHS],
  steps: [
    {
      name: "Chianti Classico Annata",
      value: "12 months",
      note: "The base wine of the zone, released the autumn after harvest.",
    },
    {
      name: "Chianti Classico Riserva",
      value: "24 months",
      note: "Including at least 3 months in bottle.",
    },
    {
      name: "Barbaresco",
      value: "26 months",
      note: "Including at least 9 in wood. Riserva: 50 months.",
    },
    {
      name: "Chianti Classico Gran Selezione",
      value: "30 months",
      note: "The top tier since 2014; estate fruit only.",
    },
    {
      name: "Barolo",
      value: "38 months",
      note: "Including at least 18 in wood. Riserva: 62 months.",
    },
    {
      name: "Brunello di Montalcino",
      value: "60 months",
      note: "Including at least 24 in oak. Riserva: 72 months.",
    },
  ],
  source:
    "There is no national Italian meaning for 'Riserva' — each DOC and DOCG sets its own minimum in its disciplinare, so the term is only informative once you know the appellation. A Chianti Classico Riserva (24 months) and a Barolo Riserva (62 months) share a word and nothing else. Figures are the current disciplinare minimums; treat them as textbook reference rather than a legal citation.",
};

export const PORTUGAL_AGEING: ScaleFigureContent = {
  title: "Portugal — Port categories",
  axisFrom: "Bottled young",
  axisTo: "Long cask ageing",
  columns: 4,
  units: [MONTHS],
  steps: [
    {
      name: "Ruby Reserve",
      value: "no fixed term",
      note: "A blend selected for quality, bottled young to keep its fruit.",
    },
    {
      name: "Vintage",
      value: "bottled 2–3 years after harvest",
      note: "A single declared year. It spends little time in cask — the ageing then happens in bottle, for decades.",
    },
    {
      name: "Crusted",
      value: "3 years in bottle",
      note: "A blend of years, unfiltered, so it throws a deposit — the 'crust'.",
    },
    {
      name: "Late Bottled Vintage",
      value: "4–6 years in wood",
      note: "A single year aged in cask until it is ready to drink on release.",
    },
    {
      name: "Colheita",
      value: "7 years in cask",
      note: "A single-year tawny. Unlike Vintage, it ages in wood, not bottle.",
    },
    {
      name: "Tawny with an Indication of Age",
      value: "10 / 20 / 30 / 40 years",
      note: "A blend whose average age matches the stated figure; it is not the age of the youngest wine.",
    },
  ],
  source:
    "Categories and minimums per the Instituto dos Vinhos do Douro e Porto (IVDP). The key distinction is where the wine aged: Ruby-style Ports (Vintage, LBV, Crusted) mature in bottle and keep their fruit; Tawny-style Ports (Colheita, aged Tawnies) mature in cask, in contact with air, and turn nutty and amber.",
};

// Which figures lead which library tab. A tab's glossary definitions still
// follow underneath — the figure gives the shape, the list gives the detail.
export const TAB_FIGURES: Record<string, ScaleFigureContent[]> = {
  sparkling: [SPARKLING_DOSAGE],
  germany: [PRADIKAT, GERMAN_SWEETNESS],
  austria: [WACHAU_CATEGORIES],
  ageing: [SPAIN_AGEING, ITALY_AGEING, PORTUGAL_AGEING],
  fortified: [FORTIFIED_STYLES],
};
