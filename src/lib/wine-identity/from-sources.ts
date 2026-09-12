// Drafts built from stored rows (spec §B.1, §C.8; D7, D13): a catalog wine (By
// hand from a matched read), a flight glass's answer key (Edit on a complete
// glass) and a stored `wine_identity_drafts.draft` (Edit on an incomplete
// glass). Pure: relative imports only.
import { emptyDraft, normaliseDraft } from "./complete";
import type {
  BlendRow, FieldProvenance, ProvenanceKey, RefChoice, VintageKind, WineColour, WineIdentityDraft, WineStyle,
} from "./types";

export type CatalogWineSource = {
  id: string; producer: { id: string; name: string }; wineName: string | null;
  vintageKind: VintageKind; vintageYear: number | null; vintageTawnyYears: number | null;
  colour: WineColour; style: WineStyle; countryId: string; regionId: string; appellationId: string;
  typeDesignationId: string | null; alcohol: number | null; description: string | null; imageUrl: string | null;
  grapes: { id: string; name: string; percentage: number | null }[];
};
export type AnswerKeySource = {
  countryId: string; regionId: string; appellationId: string | null;
  producer: { id: string; name: string } | null; typeDesignationId: string | null;
  vintageKind: VintageKind | null; vintageYear: number | null; vintageTawnyYears: number | null;
  imageUrl: string | null;
  primaryGrape: { id: string; name: string }; secondaryGrape: { id: string; name: string } | null;
  catalog: Pick<CatalogWineSource, "wineName" | "colour" | "style" | "description" | "alcohol" | "grapes"> | null;
};

function existing(ref: { id: string; name: string }): RefChoice {
  return { kind: "existing", id: ref.id, name: ref.name };
}

// Blend rows in the order given; normaliseDraft then applies orderedBlend.
function blendFrom(grapes: readonly { id: string; name: string; percentage: number | null }[]): BlendRow[] {
  return grapes.map((g) => ({ grape: existing(g), percentage: g.percentage }));
}

function filled(s: string | null): boolean {
  return typeof s === "string" && s.trim() !== "";
}

// Normalises the draft, then marks every field that holds a value with `source`.
function stamped(draft: WineIdentityDraft, source: FieldProvenance): WineIdentityDraft {
  const d = normaliseDraft(draft);
  const present: Record<ProvenanceKey, boolean> = {
    producer: d.producer !== null,
    wineName: d.wineName !== null,
    vintage: d.vintage.kind !== null,
    colour: d.colour !== null,
    style: d.style !== null,
    country: filled(d.countryId),
    region: filled(d.regionId),
    appellation: filled(d.appellationId),
    primaryGrape: d.blend.length > 0,
    blend: d.blend.length > 0,
    typeDesignation: filled(d.typeDesignationId),
    alcohol: d.alcohol !== null,
    description: d.description !== null,
    imageUrl: filled(d.imageUrl),
  };
  const provenance: WineIdentityDraft["provenance"] = {};
  for (const key of Object.keys(present) as ProvenanceKey[]) {
    if (present[key]) provenance[key] = source;
  }
  return { ...d, provenance };
}

/** A catalog wine as a draft, provenance "catalog-match" on every present field.
    A vintage from a stored row was not read: `read` is false. */
export function draftFromCatalogWine(w: CatalogWineSource): WineIdentityDraft {
  return stamped({
    producer: existing(w.producer),
    wineName: w.wineName,
    vintage: { kind: w.vintageKind, year: w.vintageYear, tawnyYears: w.vintageTawnyYears, read: false },
    colour: w.colour,
    style: w.style,
    countryId: w.countryId,
    regionId: w.regionId,
    appellationId: w.appellationId,
    blend: blendFrom(w.grapes),
    typeDesignationId: w.typeDesignationId,
    alcohol: w.alcohol,
    description: w.description,
    imageUrl: w.imageUrl,
    provenance: {},
  }, "catalog-match");
}

/** A flight glass's answer key (plus its catalog wine, when linked) as a draft,
    provenance "manual". The blend is the catalog wine's grapes when it has any,
    otherwise the answer key's primary and secondary grape. `read` is false. */
export function draftFromAnswerKey(k: AnswerKeySource): WineIdentityDraft {
  const answerKeyGrapes = [k.primaryGrape, k.secondaryGrape].filter((g): g is { id: string; name: string } => g !== null);
  const grapes = k.catalog && k.catalog.grapes.length > 0 ? k.catalog.grapes : answerKeyGrapes.map((g) => ({ ...g, percentage: null }));
  return stamped({
    producer: k.producer ? existing(k.producer) : null,
    wineName: k.catalog?.wineName ?? null,
    vintage: { kind: k.vintageKind, year: k.vintageYear, tawnyYears: k.vintageTawnyYears, read: false },
    colour: k.catalog?.colour ?? null,
    style: k.catalog?.style ?? null,
    countryId: k.countryId,
    regionId: k.regionId,
    appellationId: k.appellationId,
    blend: blendFrom(grapes),
    typeDesignationId: k.typeDesignationId,
    alcohol: k.catalog?.alcohol ?? null,
    description: k.catalog?.description ?? null,
    imageUrl: k.imageUrl,
    provenance: {},
  }, "manual");
}

// ---------------------------------------------------------------------------
// parseStoredDraft

const INVALID = Symbol("invalid");
type Parsed<T> = T | typeof INVALID;

// Records, not arrays, so the compiler checks each list against its union both ways.
const VINTAGE_KINDS: Record<VintageKind, true> = { YEAR: true, NV: true, TAWNY: true };
const COLOURS: Record<WineColour, true> = { RED: true, WHITE: true, ROSE: true, ORANGE: true };
const STYLES: Record<WineStyle, true> = { STILL: true, SPARKLING: true, SWEET: true, FORTIFIED: true };
const PROVENANCES: Record<FieldProvenance, true> = {
  label: true, "catalog-match": true, "producer-region": true, "appellation-suggestion": true, manual: true, none: true,
};
const PROVENANCE_KEYS: Record<ProvenanceKey, true> = {
  producer: true, vintage: true, colour: true, style: true, country: true, region: true, appellation: true,
  primaryGrape: true, wineName: true, blend: true, typeDesignation: true, alcohol: true, description: true, imageUrl: true,
};

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isKey<K extends string>(set: Record<K, true>, v: unknown): v is K {
  return typeof v === "string" && hasOwn(set, v);
}

function nullableEnum<K extends string>(set: Record<K, true>) {
  return (v: unknown): Parsed<K | null> => (v === null ? null : isKey(set, v) ? v : INVALID);
}

function nullableText(v: unknown): Parsed<string | null> {
  return v === null || typeof v === "string" ? v : INVALID;
}

function nullableNumber(v: unknown): Parsed<number | null> {
  return v === null || (typeof v === "number" && Number.isFinite(v)) ? v : INVALID;
}

function ref(v: unknown): Parsed<RefChoice> {
  if (!isRecord(v) || typeof v.name !== "string") return INVALID;
  if (v.kind === "pending") return { kind: "pending", name: v.name };
  if (v.kind === "existing" && typeof v.id === "string" && v.id.trim() !== "") {
    return { kind: "existing", id: v.id, name: v.name };
  }
  return INVALID;
}

function nullableRef(v: unknown): Parsed<RefChoice | null> {
  return v === null ? null : ref(v);
}

function vintage(v: unknown): Parsed<WineIdentityDraft["vintage"]> {
  if (!isRecord(v) || typeof v.read !== "boolean") return INVALID;
  const kind = nullableEnum(VINTAGE_KINDS)(v.kind);
  const year = nullableNumber(v.year);
  const tawnyYears = nullableNumber(v.tawnyYears);
  if (kind === INVALID || year === INVALID || tawnyYears === INVALID) return INVALID;
  return { kind, year, tawnyYears, read: v.read };
}

function blend(v: unknown): Parsed<BlendRow[]> {
  if (!Array.isArray(v)) return INVALID;
  const rows: BlendRow[] = [];
  for (const row of v) {
    if (!isRecord(row)) return INVALID;
    const grape = ref(row.grape);
    const percentage = nullableNumber(row.percentage);
    if (grape === INVALID || percentage === INVALID) return INVALID;
    rows.push({ grape, percentage });
  }
  return rows;
}

// Unknown keys are ignored, as unknown draft keys are; a known key must carry a
// known provenance.
function provenance(v: unknown): Parsed<WineIdentityDraft["provenance"]> {
  if (!isRecord(v)) return INVALID;
  const out: WineIdentityDraft["provenance"] = {};
  for (const [key, value] of Object.entries(v)) {
    if (!isKey(PROVENANCE_KEYS, key)) continue;
    if (!isKey(PROVENANCES, value)) return INVALID;
    out[key] = value;
  }
  return out;
}

type ParsedDraft = { [K in keyof WineIdentityDraft]: Parsed<WineIdentityDraft[K]> };

/**
 * A stored `wine_identity_drafts.draft` value, validated field by field. A
 * field that is present with the wrong shape makes the whole value null, and
 * the caller treats null as a draft with every field missing. A top-level field
 * that is absent takes the empty draft's value. Nothing is normalised: stored
 * drafts were normalised when written.
 */
export function parseStoredDraft(json: unknown): WineIdentityDraft | null {
  if (!isRecord(json)) return null;
  const empty = emptyDraft();
  const field = <K extends keyof WineIdentityDraft>(key: K, parse: (v: unknown) => Parsed<WineIdentityDraft[K]>) =>
    (hasOwn(json, key) ? parse(json[key]) : empty[key]);
  const parsed: ParsedDraft = {
    producer: field("producer", nullableRef),
    wineName: field("wineName", nullableText),
    vintage: field("vintage", vintage),
    colour: field("colour", nullableEnum(COLOURS)),
    style: field("style", nullableEnum(STYLES)),
    countryId: field("countryId", nullableText),
    regionId: field("regionId", nullableText),
    appellationId: field("appellationId", nullableText),
    blend: field("blend", blend),
    typeDesignationId: field("typeDesignationId", nullableText),
    alcohol: field("alcohol", nullableNumber),
    description: field("description", nullableText),
    imageUrl: field("imageUrl", nullableText),
    provenance: field("provenance", provenance),
  };
  return Object.values(parsed).includes(INVALID) ? null : (parsed as WineIdentityDraft);
}
