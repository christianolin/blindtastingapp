// Danish localisation of the WSET tasting sheet. Scope: the sheet, its
// lexicon, and the chrome of the Taste pages built around it (All tastings,
// Tasting notes) — not the wider app. Everything is keyed by the ENGLISH string
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
  MID_PRICED: "mellemklasse",
  HIGH_PRICED: "dyr",
  PREMIUM: "premium",
  DONT_KNOW: "ved ikke",
  // readiness
  NEEDS_TIME: "skal have tid",
  READY_CAN_IMPROVE: "drik nu, kan gemmes",
  READY_WONT_IMPROVE: "drik nu",
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
  tasting_note: "Tasting note",
  // A note on a hidden glass (blind-tasting B8; plan refinement — spec §9.3
  // item 2). Kept private to its author until the glass is revealed.
  hidden_note_hint:
    "Only you can read this until the glass is revealed. Then it attaches to the wine.",
  assessed_of: "{done} of {total} assessed",
  assessed_short: "{done} of {total}",
  // the desktop footer sets the count in Cormorant, then this tail
  of_total_assessed: "of {total} assessed",
  of: "of",
  assessed: "assessed",
  nothing_required: "Nothing is required. Save whenever.",
  discard: "Discard",
  close: "Close",
  more_actions: "More actions",
  delete_note: "Delete note",
  // footer
  save_note: "Save note",
  saving: "Saving…",
  saved: "Saved ✓",
  retry_save: "Retry save",
  next_section: "Next: {section} →",
  next_section_short: "{section} →",
  prev_section: "← {section}",
  footer_wset: "Follows the WSET Level 4 Systematic Approach to Tasting Wine.",
  // row labels + subs
  clarity: "Clarity",
  intensity: "Intensity",
  colour: "Colour",
  colour_readonly: "read-only — the wine's own colour, from the catalog",
  colour_readonly_sentence: "Read-only — the wine's own colour, from the catalog.",
  other_observations: "Other observations",
  optional: "optional",
  optional_not_counted: "optional · not counted in the {total}",
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
  score: "Score",
  why_100: "Why 100 points?",
  price_category: "Price bracket",
  readiness: "Readiness",
  tasters_notes: "Your own words",
  own_words_sub: "optional · the part you will actually reread",
  notes_placeholder: "Structure, blind guesses, what you ate with it…",
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
  clear_short: "Clear",
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
  // All tastings (/taste; Taste & Rate ledger R5)
  all_tastings: "All tastings",
  start_a_tasting: "Start a tasting",
  start: "Start",
  taste_blind: "Taste Blind",
  taste_and_rate: "Taste & Rate",
  training_room: "Training Room",
  soon: "Soon",
  loading_tastings: "Pouring your tastings…",
  tastings_one: "1 tasting",
  tastings_many: "{n} tastings",
  finished_count: "{n} finished",
  glasses_guessed_one: "1 glass guessed",
  glasses_guessed_many: "{n} glasses guessed",
  waiting_on_you_one: "Waiting on you · 1 invitation",
  waiting_on_you_many: "Waiting on you · {n} invitations",
  waiting_on_you_short: "Waiting on you · {n}",
  invitations_close: "These close when the tasting ends",
  accept: "Accept",
  decline: "Decline",
  date_to_be_set: "date to be set",
  filter_hosting: "Hosting",
  filter_attending: "Attending",
  filter_finished: "Finished",
  empty_all: "No tastings here yet.",
  empty_all_invited: "Nothing else yet — your invitations are above.",
  empty_hosting: "You're not hosting any tastings yet.",
  empty_attending: "You haven't joined anyone else's tasting yet.",
  empty_finished: "No finished tastings yet.",
  no_tastings_yet: "No tastings yet",
  no_tastings_hint: "Start your first tasting with the button above.",
  you_are_hosting: "You are hosting",
  host_is_hosting: "{host} is hosting",
  hosting: "Hosting",
  hosted_by: "Hosted by {host}",
  glass_n_of_m_so_far: "glass {n} of {m} so far",
  glass_n_of_m: "glass {n} of {m}",
  k_of_n_guessed: "{k} of {n} guessed",
  n_tasting: "{n} tasting",
  no_glasses_yet_mid: "no glasses yet",
  back_to_the_table: "Back to the table",
  back: "Back",
  continue_guessing: "Continue guessing",
  continue: "Continue",
  open_the_tasting: "Open the tasting",
  open: "Open",
  you_hosted: "you hosted",
  host_hosted: "{host} hosted",
  you: "you",
  tasters_one: "1 taster",
  tasters_many: "{n} tasters",
  you_hosted_cap: "You hosted",
  n_pts: "{n} pts",
  k_of_n_matched: "{k} of {n} matched",
  k_of_n: "{k} of {n}",
  someone: "Someone",
  // shared by All tastings and Tasting notes
  filter_all: "All",
  newest_first: "Newest first",
  show_n_more: "Show {n} more",
  // Tasting notes (/taste/notes; Taste & Rate ledger R4)
  tasting_notes: "Tasting notes",
  taste_and_rate_a_wine: "Taste & rate a wine",
  new_note_short: "+ Note",
  notes_one: "1 note",
  notes_many: "{n} notes",
  complete_one: "1 complete",
  complete_many: "{n} complete",
  average_score: "average {avg}",
  since_when: "since {when}",
  no_notes_line: "No notes yet",
  search_notes_label: "Search your notes",
  search_notes_placeholder: "Search your notes — wine, grape, aroma, even a phrase you wrote",
  search_notes_placeholder_short: "Search wine, grape, aroma…",
  clear_search: "Clear search",
  notes_filters_label: "Filter notes",
  filter_complete: "Complete",
  filter_unfinished: "Unfinished",
  filter_from_tastings: "From tastings",
  section_done: "section done",
  not_finished: "not finished",
  section_state: "{section} {state}",
  from_a_tasting: "from a tasting",
  glass_n: "Glass {n}",
  untitled_wine: "Untitled wine",
  open_note_on: "Open the note on {wine}",
  not_scored: "not scored",
  score_points: "{n} points",
  no_notes_title: "No tasting notes yet",
  no_notes_hint: "Every note you write lives here. Start with Taste & rate a wine.",
  no_notes_match: "No notes match “{q}”.",
  empty_complete: "No complete notes yet.",
  empty_unfinished: "Every note here is complete.",
  empty_from_tastings: "No notes from tastings yet.",
  loading_notes: "Gathering your notes…",
};

const UI_DA: UiDict = {
  appearance: "Udseende",
  nose: "Duft",
  palate: "Smag",
  conclusions: "Konklusion",
  conclusion_short: "Konklusion",
  taster: "Smager",
  tasting_note: "Smagsnote",
  hidden_note_hint:
    "Kun du kan læse den, indtil glasset afsløres. Så knyttes den til vinen.",
  assessed_of: "{done} af {total} vurderet",
  assessed_short: "{done} af {total}",
  of_total_assessed: "af {total} vurderet",
  of: "af",
  assessed: "vurderet",
  nothing_required: "Intet er påkrævet. Gem når du vil.",
  discard: "Kassér",
  close: "Luk",
  more_actions: "Flere handlinger",
  delete_note: "Slet note",
  save_note: "Gem note",
  saving: "Gemmer…",
  saved: "Gemt ✓",
  retry_save: "Prøv igen",
  next_section: "Næste: {section} →",
  next_section_short: "{section} →",
  prev_section: "← {section}",
  footer_wset: "Følger WSET Level 4 Systematic Approach to Tasting Wine.",
  clarity: "Klarhed",
  intensity: "Intensitet",
  colour: "Farve",
  colour_readonly: "låst — vinens egen farve, fra kataloget",
  colour_readonly_sentence: "Låst — vinens egen farve, fra kataloget.",
  other_observations: "Andre observationer",
  optional: "valgfri",
  optional_not_counted: "valgfri · tæller ikke med i de {total}",
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
  score: "Point",
  why_100: "Hvorfor 100 point?",
  price_category: "Prisleje",
  readiness: "Drikkemodenhed",
  tasters_notes: "Dine egne ord",
  own_words_sub: "valgfri · den del, du faktisk læser igen",
  notes_placeholder: "Struktur, blinde gæt, hvad du spiste til…",
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
  clear_short: "Ryd",
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
  // All tastings (/taste)
  all_tastings: "Alle smagninger",
  start_a_tasting: "Start en smagning",
  start: "Start",
  taste_blind: "Smag blindt",
  taste_and_rate: "Smag og bedøm",
  training_room: "Træningsrum",
  soon: "Snart",
  loading_tastings: "Skænker op til dine smagninger…",
  tastings_one: "1 smagning",
  tastings_many: "{n} smagninger",
  finished_count: "{n} afsluttet",
  glasses_guessed_one: "1 glas gættet",
  glasses_guessed_many: "{n} glas gættet",
  waiting_on_you_one: "Venter på dig · 1 invitation",
  waiting_on_you_many: "Venter på dig · {n} invitationer",
  waiting_on_you_short: "Venter på dig · {n}",
  invitations_close: "De lukker, når smagningen slutter",
  accept: "Accepter",
  decline: "Afslå",
  date_to_be_set: "dato følger",
  filter_hosting: "Vært",
  filter_attending: "Deltager i",
  filter_finished: "Afsluttet",
  empty_all: "Ingen smagninger her endnu.",
  empty_all_invited: "Intet andet endnu — dine invitationer står ovenfor.",
  empty_hosting: "Du er ikke vært for nogen smagninger endnu.",
  empty_attending: "Du har ikke deltaget i andres smagninger endnu.",
  empty_finished: "Ingen afsluttede smagninger endnu.",
  no_tastings_yet: "Ingen smagninger endnu",
  no_tastings_hint: "Start din første smagning med knappen ovenfor.",
  you_are_hosting: "Du er vært",
  host_is_hosting: "{host} er vært",
  hosting: "Vært",
  hosted_by: "Vært: {host}",
  glass_n_of_m_so_far: "glas {n} af {m} indtil videre",
  glass_n_of_m: "glas {n} af {m}",
  k_of_n_guessed: "{k} af {n} gættet",
  n_tasting: "{n} smager med",
  no_glasses_yet_mid: "ingen glas endnu",
  back_to_the_table: "Tilbage til bordet",
  back: "Tilbage",
  continue_guessing: "Gæt videre",
  continue: "Videre",
  open_the_tasting: "Åbn smagningen",
  open: "Åbn",
  you_hosted: "du var vært",
  host_hosted: "{host} var vært",
  you: "dig",
  tasters_one: "1 smager",
  tasters_many: "{n} smagere",
  you_hosted_cap: "Du var vært",
  n_pts: "{n} point",
  k_of_n_matched: "{k} af {n} matchet",
  k_of_n: "{k} af {n}",
  someone: "Nogen",
  // shared by All tastings and Tasting notes
  filter_all: "Alle",
  newest_first: "Nyeste først",
  show_n_more: "Vis {n} flere",
  // Tasting notes (/taste/notes)
  tasting_notes: "Smagsnoter",
  taste_and_rate_a_wine: "Smag og bedøm en vin",
  new_note_short: "+ Note",
  notes_one: "1 note",
  notes_many: "{n} noter",
  complete_one: "1 færdig",
  complete_many: "{n} færdige",
  average_score: "gennemsnit {avg}",
  since_when: "siden {when}",
  no_notes_line: "Ingen noter endnu",
  search_notes_label: "Søg i dine noter",
  search_notes_placeholder: "Søg i dine noter — vin, drue, aroma, selv en sætning, du skrev",
  search_notes_placeholder_short: "Søg vin, drue, aroma…",
  clear_search: "Ryd søgningen",
  notes_filters_label: "Filtrér noter",
  filter_complete: "Færdige",
  filter_unfinished: "Ufærdige",
  filter_from_tastings: "Fra smagninger",
  section_done: "afsnit færdigt",
  not_finished: "ikke færdigt",
  section_state: "{section}: {state}",
  from_a_tasting: "fra en smagning",
  glass_n: "Glas {n}",
  untitled_wine: "Unavngiven vin",
  open_note_on: "Åbn noten om {wine}",
  not_scored: "ingen point",
  score_points: "{n} point",
  no_notes_title: "Ingen smagsnoter endnu",
  no_notes_hint: "Alle noter, du skriver, samles her. Start med Smag og bedøm en vin.",
  no_notes_match: "Ingen noter matcher “{q}”.",
  empty_complete: "Ingen færdige noter endnu.",
  empty_unfinished: "Alle noter her er færdige.",
  empty_from_tastings: "Ingen noter fra smagninger endnu.",
  loading_notes: "Samler dine noter…",
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

/**
 * A language's whole chrome table, read-only, for the dictionary parity tests
 * (every key in both languages, none empty). Pages translate through makeT.
 */
export function uiStrings(lang: WsetLang): Readonly<Record<string, string>> {
  return UI_BY_LANG[lang];
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
