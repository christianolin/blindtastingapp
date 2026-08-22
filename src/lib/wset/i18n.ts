// Danish localisation of the WSET tasting sheet. Scope: the sheet and its
// lexicon only (not the wider app). Everything is keyed by the ENGLISH string
// — the enum value for scales, the seeded English `term`/`group_name` for the
// lexicon — so nothing in the database changes and the aroma icons (keyed on
// the English slug) keep working. English is the source of truth; Danish is a
// pure presentation overlay. A missing Danish entry falls back to English, so
// the sheet is never broken by an untranslated string.
//
// Three surfaces live here:
//   1. LABELS_DA      — the enum → word map (mirrors vocab.ts LABELS).
//   2. TERMS_DA/GROUPS_DA — the aroma lexicon (144 terms, 18 clusters).
//   3. UI_DA          — the chrome (headings, buttons, captions, dialogs).
// Plus the quality-band words and the live-note connector words.
import { LABELS } from "./vocab";

export type WsetLang = "en" | "da";

// --- 1. Graded-scale + enum labels ----------------------------------------
// Same keys as vocab.ts LABELS. Shared steps (MEDIUM, MEDIUM_MINUS, …) collapse
// to one entry, exactly as the English map does.
const LABELS_DA: Record<string, string> = {
  // wine_colour / wine_style
  WHITE: "hvid",
  ROSE: "rosé",
  RED: "rød",
  STILL: "stille",
  SPARKLING: "mousserende",
  FORTIFIED: "hedvin",
  // clarity / condition
  CLEAR: "klar",
  HAZY: "uklar",
  CLEAN: "ren",
  UNCLEAN: "uren",
  // shared graded steps
  MEDIUM_MINUS: "medium(-)",
  MEDIUM: "medium",
  MEDIUM_PLUS: "medium(+)",
  // appearance intensity
  PALE: "bleg",
  DEEP: "dyb",
  // nose / flavour intensity
  LIGHT: "let",
  PRONOUNCED: "udtalt",
  // development
  YOUTHFUL: "ungdommelig",
  DEVELOPING: "under udvikling",
  FULLY_DEVELOPED: "fuldt udviklet",
  TIRED_PAST_BEST: "træt / over toppen",
  // sweetness
  DRY: "tør",
  OFF_DRY: "halvtør",
  MEDIUM_DRY: "medium-tør",
  MEDIUM_SWEET: "medium-sød",
  SWEET: "sød",
  LUSCIOUS: "liflig",
  // level (acidity, tannin, alcohol)
  LOW: "lav",
  HIGH: "høj",
  // tannin nature
  RIPE: "moden",
  SOFT: "blød",
  SMOOTH: "glat",
  UNRIPE: "umoden",
  GREEN: "grøn",
  COARSE: "grov",
  STALKY: "stilket",
  CHALKY: "kridtet",
  FINE_GRAINED: "finkornet",
  // body
  FULL: "fyldig",
  // finish
  SHORT: "kort",
  LONG: "lang",
  // mousse
  DELICATE: "delikat",
  CREAMY: "cremet",
  AGGRESSIVE: "aggressiv",
  // colour hue
  LEMON_GREEN: "citrongrøn",
  LEMON: "citrongul",
  GOLD: "guld",
  AMBER: "rav",
  BROWN: "brun",
  PINK: "lyserød",
  SALMON: "laksefarvet",
  ORANGE: "orange",
  PURPLE: "purpur",
  RUBY: "rubinrød",
  GARNET: "granatrød",
  TAWNY: "gyldenbrun",
  // observations
  LEGS_TEARS: "ben / tårer",
  DEPOSIT: "bundfald",
  PETILLANCE: "perlende",
  RIM_VARIATION: "kantvariation",
  TINTS_HIGHLIGHTS: "skær / spil",
  // faults
  OXIDISED: "oxideret",
  OUT_OF_CONDITION: "i dårlig stand",
  CORK_TAINT: "korkfejl",
  OTHER: "andet",
  // price category
  INEXPENSIVE: "billig",
  MID_PRICED: "mellemprisklasse",
  HIGH_PRICED: "dyr",
  PREMIUM: "premium",
  DONT_KNOW: "ved ikke",
  // readiness
  NEEDS_TIME: "skal modne",
  READY_CAN_IMPROVE: "klar — kan udvikle sig",
  READY_WONT_IMPROVE: "klar — udvikler sig ikke",
  TOO_OLD: "for gammel",
  // aroma family
  FRUIT: "frugt",
  FLORAL: "blomster",
  SPICE: "krydderi",
  VEGETAL_OAK: "vegetabilsk & eg",
};

const LABELS_BY_LANG: Record<WsetLang, Record<string, string>> = {
  en: LABELS,
  da: LABELS_DA,
};

/** The enum→word map for a language (leaf controls take this as `labels`). */
export function labelsFor(lang: WsetLang): Record<string, string> {
  return LABELS_BY_LANG[lang];
}

// --- 2. The aroma/flavour lexicon -----------------------------------------
// Keyed by the lowercased English term (the DB value the components receive).
// Cross-cluster repeats (raisin, cinnamon, almond, cheese, toast, caramel…)
// intentionally collapse to one Danish word.
const TERMS_DA: Record<string, string> = {
  // floral
  blossom: "blomst", acacia: "akacie", elderflower: "hyldeblomst",
  honeysuckle: "kaprifolie", jasmine: "jasmin", chamomile: "kamille",
  geranium: "geranie", rose: "rose", violet: "violet",
  // green fruit
  apple: "æble", pear: "pære", gooseberry: "stikkelsbær", grape: "drue",
  quince: "kvæde",
  // citrus
  grapefruit: "grapefrugt", lemon: "citron", lime: "lime", orange: "appelsin",
  "lemon peel": "citronskal", "orange peel": "appelsinskal",
  // stone
  peach: "fersken", apricot: "abrikos", nectarine: "nektarin",
  // tropical
  banana: "banan", lychee: "litchi", mango: "mango", melon: "melon",
  "passion fruit": "passionsfrugt", pineapple: "ananas",
  // red fruit
  redcurrant: "ribs", cranberry: "tranebær", raspberry: "hindbær",
  strawberry: "jordbær", "red cherry": "rød kirsebær", "red plum": "rød blomme",
  // black fruit
  blackcurrant: "solbær", blackberry: "brombær", blueberry: "blåbær",
  "black cherry": "sort kirsebær", "black plum": "sort blomme",
  bramble: "brombærkrat",
  // herbaceous
  "green bell pepper": "grøn peberfrugt", grass: "græs",
  "tomato leaf": "tomatblad", asparagus: "asparges",
  "blackcurrant leaf": "solbærblad",
  // herbal
  eucalyptus: "eukalyptus", mint: "mynte", fennel: "fennikel", dill: "dild",
  "dried herbs": "tørrede krydderurter", medicinal: "medicinsk",
  lavender: "lavendel",
  // spice
  "black pepper": "sort peber", "white pepper": "hvid peber",
  liquorice: "lakrids", cinnamon: "kanel",
  // fruit ripeness
  "unripe fruit": "umoden frugt", "ripe fruit": "moden frugt",
  "dried fruit": "tørret frugt", "cooked fruit": "kogt frugt",
  jammy: "marmeladeagtig",
  // other
  simple: "enkel", "wet stones": "våde sten", flint: "flint", candy: "slik",
  "wet wool": "våd uld", minerality: "mineralitet", saltiness: "saltethed",
  // yeast
  biscuit: "kiks", "graham cracker": "grahamskiks", bread: "brød",
  toast: "ristet brød", pastry: "bagværk", brioche: "brioche",
  "bread dough": "brøddej", cheese: "ost", yogurt: "yoghurt",
  acetaldehyde: "acetaldehyd",
  // malolactic
  butter: "smør", cream: "fløde",
  // oak
  vanilla: "vanilje", cloves: "nelliker", nutmeg: "muskatnød",
  coconut: "kokos", butterscotch: "flødekaramel", cedar: "ceder",
  "charred wood": "forkullet træ", smoke: "røg", chocolate: "chokolade",
  coffee: "kaffe", resinous: "harpiksagtig",
  // red-wine tertiary
  prune: "sveske", raisin: "rosin", fig: "figen", "cooked plum": "kogt blomme",
  "cooked cherry": "kogt kirsebær", "cooked red plum": "kogt rød blomme",
  "dried blackberry": "tørret brombær", "dried cranberry": "tørret tranebær",
  "cooked blackberry": "kogt brombær", kirsch: "kirsch", leather: "læder",
  earth: "jord", mushroom: "svamp", meat: "kød", game: "vildt",
  tobacco: "tobak", "wet leaves": "våde blade", "forest floor": "skovbund",
  vegetal: "vegetabilsk", savoury: "umami", farmyard: "stald", tar: "tjære",
  caramel: "karamel",
  // white-wine tertiary
  "dried apricot": "tørret abrikos", sultana: "sultana",
  "orange marmalade": "appelsinmarmelade", petrol: "petroleum",
  kerosene: "kerosen", ginger: "ingefær", almond: "mandel",
  hazelnut: "hasselnød", honey: "honning", nutty: "nøddeagtig", hay: "hø",
  "dried apple": "tørret æble", "dried banana": "tørret banan",
  // deliberately oxidised
  marzipan: "marcipan", walnut: "valnød", toffee: "toffee",
};

const GROUPS_DA: Record<string, string> = {
  Floral: "Blomster",
  "Green fruit": "Grøn frugt",
  "Citrus fruit": "Citrusfrugt",
  "Stone fruit": "Stenfrugt",
  "Tropical fruit": "Tropisk frugt",
  "Red fruit": "Rød frugt",
  "Black fruit": "Sort frugt",
  Herbaceous: "Grønne noter",
  Herbal: "Krydderurter",
  Spice: "Krydderi",
  "Fruit ripeness": "Frugtmodenhed",
  Other: "Andet",
  Yeast: "Gær",
  Malolactic: "Malolaktisk",
  Oak: "Eg",
  "Red wine": "Rødvin",
  "White wine": "Hvidvin",
  "Deliberately oxidised": "Bevidst oxideret",
};

/** An aroma term in the chosen language (English term stays the identity). */
export function translateTerm(term: string, lang: WsetLang): string {
  if (lang === "en") return term;
  return TERMS_DA[term.toLowerCase()] ?? term;
}

/** A cluster/group heading in the chosen language. */
export function translateGroup(group: string, lang: WsetLang): string {
  if (lang === "en") return group;
  return GROUPS_DA[group] ?? group;
}

// --- 3. Chrome (headings, buttons, captions, dialogs) ----------------------
// English is the fallback, so a missing Danish key still renders. `{n}` /
// `{done}` / `{total}` / `{term}` placeholders are filled by `t(key, vars)`.
type UiDict = Record<string, string>;

const UI_EN: UiDict = {
  // section titles
  appearance: "Appearance",
  nose: "Nose",
  palate: "Palate",
  conclusions: "Conclusions",
  conclusion_short: "Conclusion",
  taster: "Taster",
  // header
  assessed_of: "{done} of {total} assessed",
  of: "of",
  assessed: "assessed",
  discard: "Discard",
  close: "Close",
  save_note: "Save note",
  saving: "Saving…",
  saved: "Saved ✓",
  retry_save: "Retry save",
  save: "Save",
  retry: "Retry",
  more_actions: "More actions",
  discard_changes: "Discard changes",
  delete_note: "Delete note",
  footer_wset: "Follows the WSET Level 4 Systematic Approach to Tasting Wine.",
  // row labels + subs
  clarity: "Clarity",
  intensity: "Intensity",
  colour: "Colour",
  other_observations: "Other observations",
  optional: "optional",
  condition: "Condition",
  fault: "Fault",
  whats_wrong: "what's wrong",
  development: "Development",
  aroma_characteristics: "Aroma characteristics",
  select_all: "select all that apply",
  sweetness: "Sweetness",
  acidity: "Acidity",
  tannin: "Tannin",
  tannin_nature: "Tannin nature",
  alcohol: "Alcohol",
  body: "Body",
  mousse: "Mousse",
  required_sparkling: "required — sparkling",
  flavour_intensity: "Flavour intensity",
  flavour_characteristics: "Flavour characteristics",
  taste_not_smell: "what you taste, not just smell",
  finish: "Finish",
  point_score: "Point Score",
  hundred_scale: "100-point scale",
  price_category: "Price category",
  readiness: "Readiness",
  tasters_notes: "Taster's notes",
  free_text: "free text",
  notes_placeholder: "Anything else — structure, blind guesses, food pairings…",
  // discard / delete dialogs
  discard_q: "Discard this tasting note?",
  discard_body: "Your changes haven't been saved and will be lost.",
  keep_editing: "Keep editing",
  delete_q: "Delete this tasting note?",
  delete_body:
    "The note and its aroma selections are removed for good. This can't be undone.",
  keep_note: "Keep note",
  delete: "Delete",
  deleting: "Deleting…",
  delete_error: "Couldn't delete the note. Please try again.",
  // aroma picker
  origin_primary: "Primary",
  origin_secondary: "Secondary",
  origin_tertiary: "Tertiary",
  cap_primary: "grape & terroir",
  cap_secondary: "winemaking",
  cap_tertiary: "ageing",
  add: "+ Add",
  done: "Done",
  selected: "Selected",
  clear: "clear",
  n_selected: "{n} selected",
  copy_from_nose: "Copy from nose",
  remove: "Remove {term}",
  oxidative: "Oxidative",
  sub_dried_cooked_fruit: "Dried & cooked fruit",
  sub_earth_forest: "Earth & forest",
  sub_savoury_smoke: "Savoury & smoke",
  sub_dried_fruit: "Dried fruit",
  sub_nut_spice_toast: "Nut, spice & toast",
  sub_petrol_honey_earth: "Petrol, honey & earth",
  // live note
  tasting_note_live: "Tasting note · live",
  note_empty: "Slide and select — your note writes itself.",
  // archetype (read-only) sheet
  typical: "typical",
  varies: "Varies",
  typical_profile: "typical profile",
  in_a_nutshell: "In a nutshell",
  typical_range: "typical range",
  quality: "Quality",
  sparkling: "sparkling",
  loading_profile: "Loading profile…",
  profile_error: "Couldn't load this profile right now.",
  // wine colours (capitalised, for the segmented control)
  colour_white: "White",
  colour_orange: "Orange",
  colour_rose: "Rosé",
  colour_red: "Red",
  // quality slider explanation
  quality_help:
    "We've swapped WSET's word scale (faulty → outstanding) for the classic 100-point score used by critics like Parker: 50 is the floor, ~85+ is good-to-excellent, 95+ is exceptional. The bar is weighted — 50–84 is compressed to the left; 85–92, where most good wines land, gets the widest stretch; 95+ sits at the rarefied right edge.",
};

const UI_DA: UiDict = {
  appearance: "Udseende",
  nose: "Duft",
  palate: "Smag",
  conclusions: "Konklusion",
  conclusion_short: "Konklusion",
  taster: "Smager",
  assessed_of: "{done} af {total} vurderet",
  discard: "Kassér",
  close: "Luk",
  save_note: "Gem note",
  saving: "Gemmer…",
  saved: "Gemt ✓",
  retry_save: "Prøv igen",
  save: "Gem",
  retry: "Igen",
  more_actions: "Flere handlinger",
  discard_changes: "Kassér ændringer",
  delete_note: "Slet note",
  footer_wset: "Følger WSET Level 4 Systematic Approach to Tasting Wine.",
  clarity: "Klarhed",
  intensity: "Intensitet",
  colour: "Farve",
  other_observations: "Andre observationer",
  optional: "valgfri",
  condition: "Tilstand",
  fault: "Fejl",
  whats_wrong: "hvad er galt",
  development: "Udvikling",
  aroma_characteristics: "Aromaer",
  select_all: "vælg alle der passer",
  sweetness: "Sødme",
  acidity: "Syre",
  tannin: "Tannin",
  tannin_nature: "Tanninkarakter",
  alcohol: "Alkohol",
  body: "Fylde",
  mousse: "Mousse",
  required_sparkling: "påkrævet — mousserende",
  flavour_intensity: "Smagsintensitet",
  flavour_characteristics: "Smagsindtryk",
  taste_not_smell: "hvad du smager, ikke kun dufter",
  finish: "Eftersmag",
  point_score: "Pointscore",
  hundred_scale: "100-pointsskala",
  price_category: "Priskategori",
  readiness: "Drikkemodenhed",
  tasters_notes: "Smagerens noter",
  free_text: "fri tekst",
  notes_placeholder: "Andet — struktur, blinde gæt, madparringer…",
  discard_q: "Kassér denne smagsnote?",
  discard_body: "Dine ændringer er ikke gemt og vil gå tabt.",
  keep_editing: "Fortsæt redigering",
  delete_q: "Slet denne smagsnote?",
  delete_body:
    "Noten og dens aromavalg fjernes permanent. Dette kan ikke fortrydes.",
  keep_note: "Behold note",
  delete: "Slet",
  deleting: "Sletter…",
  delete_error: "Kunne ikke slette noten. Prøv igen.",
  origin_primary: "Primær",
  origin_secondary: "Sekundær",
  origin_tertiary: "Tertiær",
  cap_primary: "drue & terroir",
  cap_secondary: "vinfremstilling",
  cap_tertiary: "lagring",
  add: "+ Tilføj",
  done: "Færdig",
  selected: "Valgt",
  clear: "ryd",
  n_selected: "{n} valgt",
  copy_from_nose: "Kopiér fra duft",
  remove: "Fjern {term}",
  oxidative: "Oxidativ",
  sub_dried_cooked_fruit: "Tørret & kogt frugt",
  sub_earth_forest: "Jord & skov",
  sub_savoury_smoke: "Umami & røg",
  sub_dried_fruit: "Tørret frugt",
  sub_nut_spice_toast: "Nød, krydderi & ristet",
  sub_petrol_honey_earth: "Petroleum, honning & jord",
  tasting_note_live: "Smagsnote · live",
  note_empty: "Skub og vælg — din note skriver sig selv.",
  typical: "typisk",
  varies: "Varierer",
  typical_profile: "typisk profil",
  in_a_nutshell: "Kort fortalt",
  typical_range: "typisk interval",
  quality: "Kvalitet",
  sparkling: "mousserende",
  loading_profile: "Indlæser profil…",
  profile_error: "Kunne ikke indlæse denne profil lige nu.",
  colour_white: "Hvid",
  colour_orange: "Orange",
  colour_rose: "Rosé",
  colour_red: "Rød",
  quality_help:
    "Vi har byttet WSET's ordskala (fejlbehæftet → fremragende) ud med den klassiske 100-pointsscore, som kritikere som Parker bruger: 50 er bunden, ~85+ er god-til-fremragende, 95+ er exceptionel. Skalaen er vægtet — 50–84 er presset sammen til venstre; 85–92, hvor de fleste gode vine lander, får den bredeste plads; 95+ sidder yderst til højre.",
};

const UI_BY_LANG: Record<WsetLang, UiDict> = { en: UI_EN, da: UI_DA };

/** A chrome-string translator bound to one language, with `{var}` filling. */
export function makeT(lang: WsetLang) {
  const dict = UI_BY_LANG[lang];
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = dict[key] ?? UI_EN[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(`{${k}}`, String(v));
      }
    }
    return s;
  };
}

// --- 4. Quality band words -------------------------------------------------
// Mirrors quality-curve.mjs qualityBand thresholds, but per-language.
const BANDS_DA: Record<string, string> = {
  Extraordinary: "Enestående",
  Outstanding: "Fremragende",
  "Very good": "Meget god",
  "Above average": "Over gennemsnittet",
  Average: "Gennemsnitlig",
  "Below average": "Under gennemsnittet",
  Unacceptable: "Uacceptabel",
};

/** Translate an English quality-band word (from quality-curve) to `lang`. */
export function translateBand(englishBand: string, lang: WsetLang): string {
  return lang === "en" ? englishBand : BANDS_DA[englishBand] ?? englishBand;
}

// --- 5. Live-note connector words -----------------------------------------
// composeLiveNote stitches prose from these small joining words; passing them
// in keeps that pure module free of any language table.
export type NoteConnectors = {
  intensity: string;
  acidity: string;
  tannin: string;
  alcohol: string;
  body: string;
  flavour: string;
  finish: string;
  mousse: string;
  aromas: string;
  points: string;
};

const NOTE_CONNECTORS: Record<WsetLang, NoteConnectors> = {
  en: {
    intensity: "intensity", acidity: "acidity", tannin: "tannin",
    alcohol: "alcohol", body: "body", flavour: "flavour", finish: "finish",
    mousse: "mousse", aromas: "Aromas", points: "points",
  },
  da: {
    intensity: "intensitet", acidity: "syre", tannin: "tannin",
    alcohol: "alkohol", body: "fylde", flavour: "smag", finish: "eftersmag",
    mousse: "mousse", aromas: "Aromaer", points: "point",
  },
};

export function noteConnectors(lang: WsetLang): NoteConnectors {
  return NOTE_CONNECTORS[lang];
}
