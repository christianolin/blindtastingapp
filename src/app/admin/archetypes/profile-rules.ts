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
  designationIds: string[];
  typicalAgeLow: number | null;
  typicalAgeHigh: number | null;
  winePlaceId: string | null;
};

/** The small reference lists the editor picks from (loadByHandReferences). */
export type EditorReferences = {
  countries: { id: string; name: string }[];
  regions: { id: string; name: string; countryId: string }[];
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

function pairOk(lo: number | null, hi: number | null, min: number, max: number): boolean {
  if (lo === null && hi === null) return true;
  if (lo === null || hi === null) return false;
  return Number.isInteger(lo) && Number.isInteger(hi) && lo >= min && hi <= max && lo <= hi;
}

/** The first problem with a profile, in words, or null. Keys the editor does
    not show (clarity; mousse off sparkling) are left alone and survive a save. */
export function validateProfile(p: ArchetypeProfileInput): string | null {
  if (typeof p.name !== "string" || p.name.trim() === "") return "Give it a name.";
  if (!isId(p.countryId) || !isId(p.regionId) || !isId(p.appellationId)) {
    return "Pick a country, region and appellation.";
  }
  if (!pairOk(p.qualityLow, p.qualityHigh, 50, 100)) return "Quality runs from 50 to 100, low to high.";
  if (!pairOk(p.typicalAgeLow, p.typicalAgeHigh, 0, 100)) {
    return "Typical age takes two whole numbers of years, low to high.";
  }
  for (const s of scalesFor(p.colour, p.style)) {
    const range = p.sat[s.key];
    if (range !== undefined && !rangeFits(s, range)) return `${s.label}: pick a range on its own scale.`;
  }
  if (!Array.isArray(p.nose) || !Array.isArray(p.palate) || !Array.isArray(p.designationIds)) {
    return "Something in the profile is malformed.";
  }
  if (p.winePlaceId !== null && !isId(p.winePlaceId)) return "That map place is not valid.";
  return null;
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
