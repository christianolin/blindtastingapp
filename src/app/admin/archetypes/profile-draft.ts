// The admin typical-wine editor's working copy (plan
// 2026-09-26-archetype-editor-sheet): one plain object held in one reducer.
// Every rule a field change carries lives here — the answer-key cascade, a new
// colour dropping a hue range off its ladder, a new style going through
// satForStyle — plus what a save sends, the tab order, each tab's count, the
// view and ladders the shared ArchetypeSheet draws, and whether anything
// changed. Pure, relative runtime imports only, so vitest loads it.
import type { ArchetypeView } from "../../../components/wset/archetype-sheet";
import type { ArchetypeScale } from "../../../lib/wset/archetype-scale";
import type { WineColour, WineStyle } from "../../../lib/wset/types";
import { HUES_BY_COLOUR } from "../../../lib/wset/vocab";
import {
  satForStyle,
  scalesFor,
  toggleSignature,
  withTermIds,
  type AromaLink,
  type ArchetypeProfile,
  type ArchetypeProfileInput,
} from "./profile-rules";

/** The editor's tabs, in order: its own Wine tab, then the WSET sheet's four. */
export const EDITOR_SECTIONS = ["wine", "appearance", "nose", "palate", "conclusions"] as const;
export type EditorSection = (typeof EDITOR_SECTIONS)[number];

type Sat = { [key: string]: [string, string] };

export type ArchetypeDraft = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  /** "" = none. */
  description: string;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: Sat;
  nose: AromaLink[];
  palate: AromaLink[];
  countryId: string;
  regionId: string;
  appellationId: string;
  /** The picked appellation's name, for the combobox before a search loads. */
  appellationLabel: string | null;
  primaryGrapeId: string;
  /** "" = none. */
  secondaryGrapeId: string;
  designationIds: string[];
  /** The typical-age inputs as typed: "" = unset. */
  ageLow: string;
  ageHigh: string;
  place: { id: string; name: string } | null;
};

export type DraftAction =
  | { type: "name"; value: string }
  | { type: "colour"; value: WineColour }
  | { type: "style"; value: WineStyle }
  | { type: "description"; value: string }
  | { type: "range"; key: ArchetypeScale; range: [string, string] | null }
  | { type: "quality"; range: [number, number] | null }
  | { type: "aromas"; kind: "nose" | "palate"; ids: string[] }
  | { type: "signature"; kind: "nose" | "palate"; termId: string }
  | { type: "country"; id: string; regions: readonly { id: string; countryId: string }[] }
  | { type: "region"; id: string }
  | { type: "appellation"; id: string; label: string | null }
  | { type: "primaryGrape"; id: string }
  | { type: "secondaryGrape"; id: string }
  | { type: "addDesignation"; id: string }
  | { type: "removeDesignation"; id: string }
  | { type: "age"; end: "low" | "high"; value: string }
  | { type: "place"; place: { id: string; name: string } | null };

export function draftFromProfile(p: ArchetypeProfile): ArchetypeDraft {
  return {
    name: p.name,
    colour: p.colour,
    style: p.style,
    description: p.description ?? "",
    qualityLow: p.qualityLow,
    qualityHigh: p.qualityHigh,
    sat: p.sat ?? {},
    nose: p.nose,
    palate: p.palate,
    countryId: p.countryId,
    regionId: p.regionId,
    appellationId: p.appellationId,
    appellationLabel: p.appellationName,
    primaryGrapeId: p.primaryGrapeId,
    secondaryGrapeId: p.secondaryGrapeId ?? "",
    designationIds: p.designationIds,
    ageLow: p.typicalAgeLow?.toString() ?? "",
    ageHigh: p.typicalAgeHigh?.toString() ?? "",
    place: p.winePlaceId ? { id: p.winePlaceId, name: p.winePlaceName ?? "" } : null,
  };
}

function numberOrNull(s: string): number | null {
  return s.trim() === "" ? null : Number(s);
}

/** What a save sends to updateArchetype (validateProfile checks it first). */
export function draftToInput(d: ArchetypeDraft): ArchetypeProfileInput {
  return {
    name: d.name.trim(),
    colour: d.colour,
    style: d.style,
    description: d.description.trim() || null,
    qualityLow: d.qualityLow,
    qualityHigh: d.qualityHigh,
    sat: d.sat,
    nose: d.nose,
    palate: d.palate,
    countryId: d.countryId,
    regionId: d.regionId,
    appellationId: d.appellationId,
    primaryGrapeId: d.primaryGrapeId,
    secondaryGrapeId: d.secondaryGrapeId || null,
    designationIds: d.designationIds,
    typicalAgeLow: numberOrNull(d.ageLow),
    typicalAgeHigh: numberOrNull(d.ageHigh),
    winePlaceId: d.place?.id ?? null,
  };
}

/** The ranges after a colour change, as the old editor's changeColour did it:
    a hue range whose low bound is not a hue of the new colour goes. The same
    object back when nothing goes. */
export function satForColour(sat: Sat, colour: WineColour): Sat {
  const hue = sat.colourHue;
  if (hue && !(HUES_BY_COLOUR[colour] as string[]).includes(hue[0])) {
    const next = { ...sat };
    delete next.colourHue;
    return next;
  }
  return sat;
}

export function applyDraft(d: ArchetypeDraft, a: DraftAction): ArchetypeDraft {
  switch (a.type) {
    case "name":
      return { ...d, name: a.value };
    case "colour":
      return { ...d, colour: a.value, sat: satForColour(d.sat, a.value) };
    case "style":
      // A new style drops what it cannot hold: an alcohol range off its
      // ladder, mousse off sparkling.
      return { ...d, style: a.value, sat: satForStyle(d.sat, d.colour, a.value) };
    case "description":
      return { ...d, description: a.value };
    case "range": {
      if (a.range) return { ...d, sat: { ...d.sat, [a.key]: a.range } };
      if (!(a.key in d.sat)) return d;
      const sat = { ...d.sat };
      delete sat[a.key];
      return { ...d, sat };
    }
    case "quality":
      return a.range
        ? { ...d, qualityLow: a.range[0], qualityHigh: a.range[1] }
        : { ...d, qualityLow: null, qualityHigh: null };
    case "aromas":
      return a.kind === "nose"
        ? { ...d, nose: withTermIds(d.nose, a.ids) }
        : { ...d, palate: withTermIds(d.palate, a.ids) };
    case "signature":
      return a.kind === "nose"
        ? { ...d, nose: toggleSignature(d.nose, a.termId) }
        : { ...d, palate: toggleSignature(d.palate, a.termId) };
    case "country": {
      // The answer-key cascade: a region of another country goes, and its
      // appellation with it.
      const keep = a.regions.find((r) => r.id === d.regionId)?.countryId === a.id;
      return keep
        ? { ...d, countryId: a.id }
        : { ...d, countryId: a.id, regionId: "", appellationId: "", appellationLabel: null };
    }
    case "region":
      // A new region drops the appellation; the same one picked again keeps it.
      if (a.id === d.regionId) return d;
      return { ...d, regionId: a.id, appellationId: "", appellationLabel: null };
    case "appellation":
      return { ...d, appellationId: a.id, appellationLabel: a.label };
    case "primaryGrape":
      return { ...d, primaryGrapeId: a.id };
    case "secondaryGrape":
      return { ...d, secondaryGrapeId: a.id };
    case "addDesignation":
      return !a.id || d.designationIds.includes(a.id) ? d : { ...d, designationIds: [...d.designationIds, a.id] };
    case "removeDesignation":
      return { ...d, designationIds: d.designationIds.filter((x) => x !== a.id) };
    case "age":
      return a.end === "low" ? { ...d, ageLow: a.value } : { ...d, ageHigh: a.value };
    case "place":
      return { ...d, place: a.place };
  }
}

const byText = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

// A draft in one canonical form, holding only what a save sends: range keys,
// aromas (by term) and designations sorted — none of their orders is stored —
// so clearing a range and setting it back, or removing an aroma or a
// designation and adding it again, reads as no change. The display-only names
// (the appellation's label, the map place's name) are left out: re-picking the
// same appellation or place may carry a differently spelled label, and
// neither name is saved.
function canonical(d: ArchetypeDraft): string {
  const sat = Object.fromEntries(Object.entries(d.sat).sort(([x], [y]) => byText(x, y)));
  const nose = [...d.nose].sort((x, y) => byText(x.termId, y.termId));
  const palate = [...d.palate].sort((x, y) => byText(x.termId, y.termId));
  const designationIds = [...d.designationIds].sort(byText);
  return JSON.stringify({
    ...d,
    appellationLabel: null,
    place: d.place ? d.place.id : null,
    sat,
    nose,
    palate,
    designationIds,
  });
}

/** Whether the draft differs from what was last saved (or opened). */
export function isDirty(draft: ArchetypeDraft, baseline: ArchetypeDraft): boolean {
  return canonical(draft) !== canonical(baseline);
}

/** The scales the editor edits and the ladder each is edited on: scalesFor's,
    so the editor offers exactly what validateProfile accepts and the matcher
    reads (alcohol by style, mousse on sparkling only). */
export function editorLadders(colour: WineColour, style: WineStyle): Partial<Record<ArchetypeScale, readonly string[]>> {
  const ladders: Partial<Record<ArchetypeScale, readonly string[]>> = {};
  for (const s of scalesFor(colour, style)) ladders[s.key as ArchetypeScale] = s.ladder;
  return ladders;
}

/** What the shared ArchetypeSheet draws: the draft's colour, style, ranges and quality. */
export function draftView(d: ArchetypeDraft): ArchetypeView {
  return {
    name: d.name,
    colour: d.colour,
    style: d.style,
    placeName: null,
    lineage: "",
    grapes: "",
    description: d.description.trim() || null,
    qualityLow: d.qualityLow,
    qualityHigh: d.qualityHigh,
    sat: d.sat,
    aromas: [],
    flavours: [],
  };
}

const SECTION_SCALES: Record<"appearance" | "nose" | "palate", readonly ArchetypeScale[]> = {
  appearance: ["appearanceIntensity", "colourHue"],
  nose: ["noseIntensity", "development"],
  palate: ["sweetness", "acidity", "tannin", "mousse", "alcohol", "body", "flavourIntensity", "finish"],
};

export type EditorProgress = {
  /** [set, total] per tab. */
  sections: Record<EditorSection, [number, number]>;
  done: number;
  total: number;
};

/** Each tab's count, as the note sheet counts its sections: Wine counts what a
    save needs (name, country, region, appellation, primary grape); a WSET
    section counts its ranges set of those edited, plus one for "any aroma" on
    Nose and Palate; Conclusions counts the quality range. */
export function archetypeProgress(d: ArchetypeDraft): EditorProgress {
  const edited = new Set(scalesFor(d.colour, d.style).map((s) => s.key));
  const count = (keys: readonly ArchetypeScale[]): [number, number] => {
    const shown = keys.filter((k) => edited.has(k));
    return [shown.filter((k) => d.sat[k] !== undefined).length, shown.length];
  };
  const [appearanceDone, appearanceTotal] = count(SECTION_SCALES.appearance);
  const [noseDone, noseTotal] = count(SECTION_SCALES.nose);
  const [palateDone, palateTotal] = count(SECTION_SCALES.palate);
  const wine = [d.name.trim(), d.countryId, d.regionId, d.appellationId, d.primaryGrapeId];
  const sections: Record<EditorSection, [number, number]> = {
    wine: [wine.filter((v) => v !== "").length, wine.length],
    appearance: [appearanceDone, appearanceTotal],
    nose: [noseDone + (d.nose.length > 0 ? 1 : 0), noseTotal + 1],
    palate: [palateDone + (d.palate.length > 0 ? 1 : 0), palateTotal + 1],
    conclusions: [d.qualityLow !== null && d.qualityHigh !== null ? 1 : 0, 1],
  };
  let done = 0;
  let total = 0;
  for (const id of EDITOR_SECTIONS) {
    done += sections[id][0];
    total += sections[id][1];
  }
  return { sections, done, total };
}
