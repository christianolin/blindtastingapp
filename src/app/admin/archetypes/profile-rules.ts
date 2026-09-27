// Pure rules for the /admin/archetypes profile editor (training-room spec §4.4,
// §4.5, D21): which scales a profile edits, the ladder each range must lie on,
// the checks the editor runs before saving and updateArchetype runs again on
// the server, the appellation list with "Just the region", and the aroma and
// designation rows a save writes. Relative runtime imports only, so vitest
// loads it; the ladders are pinned to the matcher's ladderFor by the test.
import { justTheRegionOption } from "../../../components/add-wine/self-named-appellation";
import { foldName } from "../../../lib/wine-identity/fold";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "../../../lib/wset/vocab";
import type { WineColour, WineStyle } from "../../../lib/wset/types";

/** One aroma link; `signature` marks a term that is truly diagnostic (D5). */
export type AromaLink = { termId: string; signature: boolean };

/** What the editor opens on. */
export type ArchetypeProfile = {
  id: string;
  name: string;
  colour: WineColour;
  style: WineStyle;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: { [key: string]: [string, string] };
  nose: AromaLink[];
  palate: AromaLink[];
  countryId: string;
  regionId: string;
  appellationId: string;
  appellationName: string | null;
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
  designationIds: string[];
  typicalAgeLow: number | null;
  typicalAgeHigh: number | null;
  winePlaceId: string | null;
  winePlaceName: string | null;
};

/** What a save sends to updateArchetype. */
export type ArchetypeProfileInput = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: { [key: string]: [string, string] };
  nose: AromaLink[];
  palate: AromaLink[];
  countryId: string;
  regionId: string;
  appellationId: string;
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
  designationIds: string[];
  typicalAgeLow: number | null;
  typicalAgeHigh: number | null;
  winePlaceId: string | null;
};

/** The small reference lists the editor picks from (loadByHandReferences). */
export type EditorReferences = {
  countries: { id: string; name: string }[];
  regions: { id: string; name: string; countryId: string }[];
  grapes: { id: string; name: string }[];
  typeDesignations: { id: string; name: string; category: string | null }[];
};

export type AppellationOption = { id: string; name: string; matchName?: string };

// Full enum order (spec §4.4) where the note's slider offers fewer stops.
const APPEARANCE_LADDER: readonly string[] = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
const SWEETNESS_LADDER: readonly string[] = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
];
const MOUSSE_LADDER: readonly string[] = ["DELICATE", "CREAMY", "AGGRESSIVE"];

/** A scale the editor edits: `ladder` is where a range may lie, `slider` what a note can say. */
export type ScaleSpec = { key: string; label: string; ladder: readonly string[]; slider: readonly string[] };

export function scalesFor(colour: WineColour, style: WineStyle): ScaleSpec[] {
  // A fortified archetype's alcohol is written on the five-stop ladder for the
  // reference sheet only (D19: never a distance).
  const alcohol = style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
  const hues = HUES_BY_COLOUR[colour];
  const scales: ScaleSpec[] = [
    { key: "appearanceIntensity", label: "Appearance intensity", ladder: APPEARANCE_LADDER, slider: APPEARANCE_INTENSITY_STOPS },
    { key: "colourHue", label: "Colour", ladder: hues, slider: hues },
    { key: "noseIntensity", label: "Nose intensity", ladder: INTENSITY_STOPS, slider: INTENSITY_STOPS },
    { key: "development", label: "Development", ladder: DEVELOPMENT_STOPS, slider: DEVELOPMENT_STOPS },
    { key: "sweetness", label: "Sweetness", ladder: SWEETNESS_LADDER, slider: SWEETNESS_STOPS },
    { key: "acidity", label: "Acidity", ladder: LEVEL_STOPS, slider: LEVEL_STOPS },
    { key: "tannin", label: "Tannin", ladder: LEVEL_STOPS, slider: LEVEL_STOPS },
    { key: "alcohol", label: "Alcohol", ladder: alcohol, slider: alcohol },
    { key: "body", label: "Body", ladder: BODY_STOPS, slider: BODY_STOPS },
    { key: "flavourIntensity", label: "Flavour intensity", ladder: INTENSITY_STOPS, slider: INTENSITY_STOPS },
    { key: "finish", label: "Finish", ladder: FINISH_STOPS, slider: FINISH_STOPS },
  ];
  if (style === "SPARKLING") {
    scales.push({ key: "mousse", label: "Mousse", ladder: MOUSSE_LADDER, slider: MOUSSE_LADDER });
  }
  return scales;
}

/** On the scale's ladder, low to high, and holding a value the note's slider can produce (§4.4). */
export function rangeFits(scale: ScaleSpec, range: readonly [string, string]): boolean {
  const lo = scale.ladder.indexOf(range[0]);
  const hi = scale.ladder.indexOf(range[1]);
  if (lo < 0 || hi < 0 || lo > hi) return false;
  return scale.ladder.slice(lo, hi + 1).some((v) => scale.slider.includes(v));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** The colours and styles a profile may take — the editor's two selects. */
export const PROFILE_COLOURS: readonly WineColour[] = ["WHITE", "ORANGE", "ROSE", "RED"];
export const PROFILE_STYLES: readonly WineStyle[] = ["STILL", "SPARKLING", "SWEET", "FORTIFIED"];

const MALFORMED = "Something in the profile is malformed.";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isRange(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string";
}

function isAromaLinks(v: unknown): v is AromaLink[] {
  return (
    Array.isArray(v) &&
    v.every((l) => isPlainObject(l) && typeof l.termId === "string" && typeof l.signature === "boolean")
  );
}

function pairOk(lo: number | null, hi: number | null, min: number, max: number): boolean {
  if (lo === null && hi === null) return true;
  if (lo === null || hi === null) return false;
  return Number.isInteger(lo) && Number.isInteger(hi) && lo >= min && hi <= max && lo <= hi;
}

/** The first problem with a profile, in words, or null. Keys the editor does
    not show (clarity; mousse off sparkling) are left alone and survive a save,
    but every range must still be a pair of words. It runs on the server's
    untrusted input too, so the shapes are checked before anything is indexed:
    it answers, never throws. */
export function validateProfile(p: ArchetypeProfileInput): string | null {
  if (!isPlainObject(p)) return MALFORMED;
  if (typeof p.name !== "string" || p.name.trim() === "") return "Give it a name.";
  if (!PROFILE_COLOURS.includes(p.colour) || !PROFILE_STYLES.includes(p.style)) return MALFORMED;
  if (p.description !== null && typeof p.description !== "string") return MALFORMED;
  if (!isId(p.countryId) || !isId(p.regionId) || !isId(p.appellationId)) {
    return "Pick a country, region and appellation.";
  }
  if (!isId(p.primaryGrapeId)) return "Pick a primary grape.";
  if (p.secondaryGrapeId !== null && !isId(p.secondaryGrapeId)) return MALFORMED;
  if (p.secondaryGrapeId === p.primaryGrapeId) return "The second grape must differ from the primary grape.";
  if (!pairOk(p.qualityLow, p.qualityHigh, 50, 100)) return "Quality runs from 50 to 100, low to high.";
  if (!pairOk(p.typicalAgeLow, p.typicalAgeHigh, 0, 100)) {
    return "Typical age takes two whole numbers of years, low to high.";
  }
  if (!isPlainObject(p.sat) || !Object.values(p.sat).every(isRange)) return MALFORMED;
  for (const s of scalesFor(p.colour, p.style)) {
    const range = p.sat[s.key];
    if (range !== undefined && !rangeFits(s, range)) return `${s.label}: pick a range on its own scale.`;
  }
  if (
    !isAromaLinks(p.nose) ||
    !isAromaLinks(p.palate) ||
    !Array.isArray(p.designationIds) ||
    !p.designationIds.every(isId)
  ) {
    return MALFORMED;
  }
  if (p.winePlaceId !== null && !isId(p.winePlaceId)) return "That map place is not valid.";
  return null;
}

/** The profile's ranges after a style change (as changeColour tidies the
    hue): an alcohol range off the new style's ladder goes, and so does mousse
    when the style is not sparkling. The same object back when nothing goes. */
export function satForStyle(
  sat: { [key: string]: [string, string] },
  colour: WineColour,
  style: WineStyle,
): { [key: string]: [string, string] } {
  const drop: string[] = [];
  const alcohol = scalesFor(colour, style).find((s) => s.key === "alcohol");
  if (sat.alcohol !== undefined && alcohol && !(isRange(sat.alcohol) && rangeFits(alcohol, sat.alcohol))) {
    drop.push("alcohol");
  }
  if (style !== "SPARKLING" && sat.mousse !== undefined) drop.push("mousse");
  if (drop.length === 0) return sat;
  const next = { ...sat };
  for (const key of drop) delete next[key];
  return next;
}

/** The answer-key forms' wording for a region's own appellation. */
export const JUST_THE_REGION = "Just the region";

/** A region's appellations with its self-named row first as "Just the region · …". */
export function appellationOptions(
  regionName: string,
  list: readonly { id: string; name: string }[],
): AppellationOption[] {
  const self = justTheRegionOption({ id: "", name: regionName }, list);
  return [
    ...(self ? [{ id: self.id, name: `${JUST_THE_REGION} · ${self.name}`, matchName: self.name }] : []),
    ...list.filter((a) => a.id !== self?.id).map((a) => ({ id: a.id, name: a.name })),
  ];
}

/** Whether a region's appellation read may be kept for the editor's later
    searches. Every region holds at least its self-named appellation, so an
    empty list is a failed read (listAppellationsForRegions answers [] when its
    first page fails) and is read again next time. A later page that fails
    returns the rows before it and cannot be told apart here. */
export function appellationListCacheable(list: readonly unknown[]): boolean {
  return list.length > 0;
}

export const APPELLATION_RESULTS_MAX = 50;

export function filterAppellationOptions(
  options: readonly AppellationOption[],
  query: string,
): AppellationOption[] {
  const key = foldName(query);
  const hits =
    key === ""
      ? options
      : options.filter(
          (o) =>
            foldName(o.name).includes(key) ||
            (o.matchName !== undefined && foldName(o.matchName).includes(key)),
        );
  return hits.slice(0, APPELLATION_RESULTS_MAX);
}

/** The aroma picker's new id list, each id keeping the signature it had. */
export function withTermIds(links: readonly AromaLink[], ids: readonly string[]): AromaLink[] {
  return ids.map((id) => links.find((l) => l.termId === id) ?? { termId: id, signature: false });
}

export function toggleSignature(links: readonly AromaLink[], termId: string): AromaLink[] {
  return links.map((l) => (l.termId === termId ? { ...l, signature: !l.signature } : l));
}

/** wine_archetype_aromas rows: one per (term, kind), the first link's signature winning. */
export function aromaRows(
  archetypeId: string,
  nose: readonly AromaLink[],
  palate: readonly AromaLink[],
): { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean }[] {
  const rows: { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean }[] = [];
  const seen = new Set<string>();
  for (const [kind, links] of [
    ["NOSE", nose],
    ["PALATE", palate],
  ] as const) {
    for (const link of links) {
      const key = `${kind}:${link.termId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ archetype_id: archetypeId, term_id: link.termId, kind, signature: link.signature === true });
    }
  }
  return rows;
}

export function designationRows(
  archetypeId: string,
  ids: readonly string[],
): { archetype_id: string; type_designation_id: string }[] {
  return [...new Set(ids)].map((id) => ({ archetype_id: archetypeId, type_designation_id: id }));
}
