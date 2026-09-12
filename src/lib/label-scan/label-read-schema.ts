// The label reader's structured-output schema and the coercion that normalises
// whatever comes back (spec §A.3). Pure: it imports only zod and the folding
// helper, by relative path, so vitest, the server and the fixture switch can all
// load it.
import { z } from "zod";
import { foldName } from "../wine-identity/fold";

export const LABEL_READ_PROMPT =
  "Read this wine bottle label, photographed for a cellar app, and fill in the record. " +
  "Fill every field from the label where printed, and from well-established knowledge of the wine, " +
  "producer or appellation where not. Null means 'genuinely unknown', never 'lazy'. " +
  "You are compiling reference data for a wine enthusiast's cellar, not writing marketing. " +
  "Give every name as it is officially used in the wine's own country.";

export const LabelReadSchema = z.object({
  // §2.1 row 10
  isWineLabel: z.boolean().describe(
    "True when the photo shows a wine bottle label, front or back. False for anything else; " +
      "then leave every other field null or empty and set confidence to low.",
  ),
  // (pre), extended with the title word
  producer: z.string().nullable().describe(
    "Winery / producer name as printed, including a title word that is part of the name " +
      "(Château, Domaine, Weingut, Tenuta…), or null.",
  ),
  // (pre)
  wineName: z.string().nullable().describe(
    "The cuvée / special bottling name — not the producer, not the appellation — or null.",
  ),
  // (pre) plus D1's official-name instruction
  appellation: z.string().nullable().describe(
    "The wine's geographic denomination under its official name as used in the wine's own country, " +
      "with its designation — AOC/AOP, DOC/DOCG, DO/DOCa, IGT/IGP, PDO/PGI, AVA, etc. " +
      '("Barbaresco DOCG", "Saint-Émilion Grand Cru AOC", "Rioja DOCa"). ' +
      'A regional PGI counts: a label printing "PUGLIA — Indicazione Geografica Protetta" IS the appellation "Puglia IGT". ' +
      "Italian labels print the EU term (IGP/DOP) for what wine lists still call IGT/DOC/DOCG — " +
      'return the traditional form ("Puglia IGT", not "Puglia IGP"). ' +
      "Keep Grand Cru / Premier Cru when it is part of the official name. " +
      'Repeat the name even when it equals the region ("Bourgogne AOC"). ' +
      "Null when noGeographicIndication is true, or when you genuinely cannot tell.",
  ),
  // D1
  noGeographicIndication: z.boolean().describe(
    "True ONLY when the wine legally carries no geographic indication: Vin de France, Vino d'Italia, " +
      "Deutscher Wein, Vino de España, a plain table wine. Appellation is then null. " +
      "False otherwise — including when the appellation simply could not be read.",
  ),
  // (pre)
  region: z.string().nullable().describe(
    "The wine region — infer it from the appellation or producer even when not printed " +
      "(Amarone della Valpolicella → Veneto), or null.",
  ),
  // (pre), "in English" added
  country: z.string().nullable().describe("The country, in English — infer it too (→ Italy), or null."),
  // (pre)
  designation: z.string().nullable().describe(
    "The label's legal quality, ageing or style term, in its canonical form: " +
      '"Gran Reserva", "Reserva", "Crianza", "Riserva", "Gran Selezione", "Kabinett", "Spätlese", "Auslese", ' +
      '"Grosses Gewächs", "Grand Cru", "Premier Cru", "Brut", "Brut Nature", "Extra Dry", "Vintage", "LBV", ' +
      '"Colheita", "Fino", "Amontillado", "VORS"… Return the term itself, not a sentence. ' +
      "Null when the label carries none. Do NOT put grape names or fantasy names here.",
  ),
  // (pre), tawny example added
  vintageKind: z.enum(["YEAR", "NV", "TAWNY"]).describe(
    '"YEAR" if a vintage year is shown, "NV" for non-vintage, "TAWNY" for an "X years" tawny ("20 Years Old").',
  ),
  // (pre)
  vintageYear: z.number().int().nullable().describe("The 4-digit vintage year, or null."),
  // D1
  vintageTawnyYears: z.number().int().nullable().describe(
    "For TAWNY only: the stated age in years (10, 20, 30, 40). Null otherwise.",
  ),
  // pre-FastCork derived this in coerce(); now asked for, and still checked in coerceLabelRead
  vintageRead: z.boolean().describe(
    "True only when the vintage year, the NV statement or the tawny age is actually visible in this photo. " +
      "False when you inferred it or could not find it — most still wines carry a vintage somewhere, " +
      "often only on the back label.",
  ),
  // (pre)
  colour: z.enum(["WHITE", "ROSE", "RED", "ORANGE"]).nullable().describe("Null if unclear."),
  // (pre)
  style: z.enum(["STILL", "SPARKLING", "SWEET", "FORTIFIED"]).nullable().describe(
    '"STILL" for normal reds/whites including Amarone; "SPARKLING" for Champagne, Prosecco, Cava…; ' +
      '"SWEET" for dessert / late-harvest (Sauternes, Tokaji); "FORTIFIED" for Port, Sherry, Madeira, VDN — ' +
      "Port is FORTIFIED, not SWEET. Null if unclear.",
  ),
  // (pre)
  grapes: z
    .array(z.object({ name: z.string(), percentage: z.number().nullable() }))
    .describe(
      "ALL major grapes in the blend, not just the primary. Canonical international variety names — " +
        "never a local synonym, clone or translation, no parenthetical qualifiers " +
        '("Sangiovese" not "Brunello"/"Prugnolo Gentile"; "Grenache" not "Garnacha"/"Cannonau"; ' +
        '"Syrah" not "Shiraz"; "Pinot Noir" not "Pinot Nero"/"Spätburgunder"). ' +
        "Percentages from the label; else the proportions well-known for this wine or appellation; else null.",
    ),
  // §2.1 row 10
  alcoholPercent: z.number().nullable().describe(
    "Alcohol by volume exactly as printed on the label (13.5), or null. Never inferred.",
  ),
  // (pre)
  description: z.string().nullable().describe(
    "2-4 sentences of REFERENCE NOTES for a wine enthusiast's cellar — the register of an encyclopedia entry, " +
      "not a shop shelf-talker. Include only verifiable facts you are confident of: terroir and soils, " +
      "the appellation's production rules as they apply to this wine (ageing minimums, yields, permitted varieties), " +
      "élevage (vessel, months), production scale, the estate's founding or ownership where notable, stated neutrally. " +
      "FORBIDDEN: describing the bottle, label or packaging; praise and promotional adjectives " +
      "(legendary, prestigious, stunning, exceptional, iconic, renowned) unless part of an official classification's name; " +
      "food pairings; 'perfect for' anything; every form of sales tone. " +
      "A wine about which little is known gets a SHORT description — two dry sentences beat four glowing ones. " +
      "Facts you cannot stand behind are omitted, not hedged. " +
      "Null when you cannot say anything factual beyond what other fields already carry.",
  ),
  // (pre)
  confidence: z.enum(["high", "medium", "low"]).describe("How clearly the label could be read."),
  // (pre), shortened to bound output tokens
  rawText: z.string().describe(
    "The label's text verbatim, at most about 500 characters. " +
      "If the image is not a wine label, say so briefly here.",
  ),
});

export type LabelRead = z.infer<typeof LabelReadSchema>;

// The allowed values come from the schema itself, so the two can never drift.
const VINTAGE_KINDS = LabelReadSchema.shape.vintageKind.options;
const COLOURS = LabelReadSchema.shape.colour.unwrap().options;
const STYLES = LabelReadSchema.shape.style.unwrap().options;
const CONFIDENCES = LabelReadSchema.shape.confidence.options;

/** Transport bounds only (rule 3): no label carries a year outside them. Which
    years make a complete vintage is decided by `missingWineFields` alone. */
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;
const TAWNY_MIN = 1;
const TAWNY_MAX = 100;
const RAW_TEXT_MAX = 2000;

/** Rule 1: trimmed, and a blank string is null. */
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function capRawText(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length <= RAW_TEXT_MAX) return t;
  const cut = t.slice(0, RAW_TEXT_MAX);
  // Never end on half a surrogate pair: Postgres jsonb rejects a lone surrogate,
  // and this text is stored in label_reads.read.
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

function integerIn(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

/** Rule 8: a value outside the schema's list is unknown, never a throw. */
function oneOf<T extends string>(options: readonly T[], v: unknown): T | null {
  const s = text(v);
  return s !== null && (options as readonly string[]).includes(s) ? (s as T) : null;
}

/** Rule 7: in (0, 100) after rounding to one decimal, matching numeric(4,1) and
    catalog_wines_alcohol_percent_ck (99.96 would be stored as 100.0). */
function alcohol(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const rounded = Math.round(v * 10) / 10;
  return rounded > 0 && rounded < 100 ? rounded : null;
}

/** Rule 6: trimmed names, blanks dropped, a percentage only in (0, 100], and
    folded duplicates dropped with the first one kept. */
function grapeList(v: unknown): LabelRead["grapes"] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const grapes: LabelRead["grapes"] = [];
  for (const entry of v) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name: rawName, percentage: rawPercentage } = entry as Record<string, unknown>;
    const name = text(rawName);
    if (name === null) continue;
    const key = foldName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const percentage =
      typeof rawPercentage === "number" && Number.isFinite(rawPercentage) && rawPercentage > 0 && rawPercentage <= 100
        ? rawPercentage
        : null;
    grapes.push({ name, percentage });
  }
  return grapes;
}

/** Normalises a read from the model, a stored `label_reads.read` or a fixture
    (spec §A.3 rules 1–8). Each field is read on its own with `typeof` checks
    rather than `LabelReadSchema.parse`, so one bad value degrades to null or a
    default instead of failing the whole read. This matters in practice:
    `zodOutputFormat` sends the enums and the integer bounds to the API as
    description text, not as constraints. */
export function coerceLabelRead(raw: unknown): LabelRead {
  const r: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const vintageYear = integerIn(r.vintageYear, YEAR_MIN, YEAR_MAX);
  const vintageKind = oneOf(VINTAGE_KINDS, r.vintageKind) ?? (vintageYear !== null ? "YEAR" : "NV");
  const vintageTawnyYears = vintageKind === "TAWNY" ? integerIn(r.vintageTawnyYears, TAWNY_MIN, TAWNY_MAX) : null;
  // Rule 4: an empty YEAR or TAWNY shape never counts as read.
  const vintageShapeFilled =
    vintageKind === "YEAR" ? vintageYear !== null : vintageKind === "TAWNY" ? vintageTawnyYears !== null : true;
  const noGeographicIndication = r.noGeographicIndication === true;

  const read: LabelRead = {
    isWineLabel: true,
    producer: text(r.producer),
    wineName: text(r.wineName),
    // Rule 5
    appellation: noGeographicIndication ? null : text(r.appellation),
    noGeographicIndication,
    region: text(r.region),
    country: text(r.country),
    designation: text(r.designation),
    vintageKind,
    vintageYear,
    vintageTawnyYears,
    vintageRead: r.vintageRead === true && vintageShapeFilled,
    colour: oneOf(COLOURS, r.colour),
    style: oneOf(STYLES, r.style),
    grapes: grapeList(r.grapes),
    alcoholPercent: alcohol(r.alcoholPercent),
    description: text(r.description),
    confidence: oneOf(CONFIDENCES, r.confidence) ?? "low",
    rawText: capRawText(r.rawText),
  };
  if (r.isWineLabel === true) return read;

  // Rule 2: anything not affirmatively a wine label carries no identity.
  return {
    ...read,
    isWineLabel: false,
    producer: null,
    wineName: null,
    appellation: null,
    noGeographicIndication: false,
    region: null,
    country: null,
    designation: null,
    vintageYear: null,
    vintageTawnyYears: null,
    vintageRead: false,
    colour: null,
    style: null,
    grapes: [],
    alcoholPercent: null,
    description: null,
    confidence: "low",
  };
}
