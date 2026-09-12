// The read resolver (spec §B.5): one label read plus a reference lookup becomes
// one `WineIdentityDraft`. Pure — relative imports only, no Supabase and nothing
// server-side, so vitest, the server adapter and the client all load it.
//
// The rules it exists to hold (RC3, RC4, RC5, RC10, scan-3):
// - nothing is ever guessed: a miss leaves the field null and the draft partial;
// - an appellation is set only when exactly one reference row agrees — there is
//   no first-hit fallback, and no falling back to a region's self-named row;
// - a producer link may fill the region, never the appellation and never a grape.
import { canonicalGrapeName } from "../label-scan/grape-canonical";
import type { LabelRead } from "../label-scan/label-read-schema";
import { canonicalCountryName, canonicalRegionName } from "../label-scan/region-canonical";
import { emptyDraft, normaliseDraft } from "./complete";
import { DESIGNATION_SUFFIXES, foldName, foldWords, isTitleOnly, normaliseCru, stripDesignationSuffix } from "./fold";
import type { BlendRow, FieldProvenance, ProvenanceKey, RefChoice, WineIdentityDraft } from "./types";

export interface RefLookup {
  countries(): Promise<{ id: string; name: string }[]>;                                // small table
  regionsInCountry(countryId: string): Promise<{ id: string; name: string }[]>;
  /** search_appellations RPC (20260716160000:27-43): f_unaccent(name) ilike '%' || f_unaccent(p_query) || '%',
      ordered by name, limit 25. `words` is foldWords form; the adapter sends appellationSearchPattern(words). */
  searchAppellations(words: string, regionId?: string): Promise<{ id: string; name: string }[]>;
  appellationsByIds(ids: string[]): Promise<{ id: string; name: string; regionId: string; countryId: string }[]>;
  /** the country's no-geographic-indication region and its same-named appellation: a national-tier region
      named in NATIONAL_TIER_REGION_NAMES when the country has one (France: "Vin de France", 20260829212000),
      otherwise the per-country "None" pair (20260829263700) */
  noGeographicIndication(countryId: string): Promise<{ regionId: string; appellationId: string } | null>;
  /** find_producer_by_folded_name (E.2) */
  producerByFoldedName(name: string, regionId: string | null): Promise<{ id: string; name: string; regionId: string | null } | null>;
  regionById(id: string): Promise<{ id: string; name: string; countryId: string } | null>;
  grapes(): Promise<{ id: string; name: string }[]>;                                   // small table
  typeDesignations(): Promise<{ id: string; name: string; countryId: string | null }[]>; // ~50 rows, is_active
}

/** Regions that ARE a country's no-geographic-indication tier, and so are what
    real catalog rows carry instead of the per-country "None" pair. Only names
    that exist as regions today (spec §B.5). */
export const NATIONAL_TIER_REGION_NAMES: readonly string[] = ["Vin de France"];

/** The search_appellations limit. Exactly this many rows means the list may be
    truncated, which is the only reason to retry inside a region. */
const APPELLATION_SEARCH_LIMIT = 25;

/** The only qualifier ever stripped, once, from the end of a base name. */
const CRU_QUALIFIERS: readonly string[] = ["grand cru", "premier cru"];

/** Tie-breaks only: the same denomination written the EU way or the national way. */
const SUFFIX_EQUIVALENTS: readonly (readonly string[])[] = [
  ["aoc", "aop"],
  ["igt", "igp"],
  ["doc", "dop"],
];

/**
 * The words joined with `%`: "saint emilion grand cru" → "saint%emilion%grand%cru".
 * `search_appellations` folds accents but keeps punctuation and does not escape
 * `%`, so each `%` matches whatever the stored name really has there — a hyphen,
 * an apostrophe or a space. A plain folded query would miss every hyphenated name.
 */
export function appellationSearchPattern(words: string): string {
  return foldWords(words).split(" ").filter((w) => w !== "").join("%");
}

/** The trailing designation word of a `foldWords` name, or null. Mirrors
    `stripDesignationSuffix`, which never strips a lone word. */
function designationSuffix(words: string): string | null {
  const cut = words.lastIndexOf(" ");
  if (cut < 0) return null;
  const last = words.slice(cut + 1);
  return DESIGNATION_SUFFIXES.includes(last) ? last : null;
}

function suffixEquivalent(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return a === b || SUFFIX_EQUIVALENTS.some((set) => set.includes(a) && set.includes(b));
}

/** `base` minus one trailing "grand cru" / "premier cru", or null when there is
    none (or nothing would be left). */
function withoutCruQualifier(base: string): string | null {
  for (const qualifier of CRU_QUALIFIERS) {
    if (base.endsWith(" " + qualifier)) return base.slice(0, base.length - qualifier.length - 1);
  }
  return null;
}

type AppellationRow = { id: string; name: string; regionId: string; countryId: string };
/** `agreed` is step 4.3's verdict — did any reference row's own name fold to the
    same base — and nothing later. Step 4.7 earns its retry only on "none agree",
    so a set that agreed and was then emptied by the country (4.4) or region (4.5)
    filter must NOT retry: the cru-stripped base would find a different, wrongly
    placed row and the resolver would hand back a guess (RC4). */
type AppellationAttempt = { row: AppellationRow | null; agreed: boolean };

async function attemptAppellation(
  base: string,
  readSuffix: string | null,
  lookup: RefLookup,
  countryId: string | null,
  regionCandidateId: string | null,
): Promise<AppellationAttempt> {
  // 4.2 — the region-scoped retry fires only on a possibly truncated list.
  let hits = await lookup.searchAppellations(base);
  if (hits.length === APPELLATION_SEARCH_LIMIT && regionCandidateId !== null) {
    hits = await lookup.searchAppellations(base, regionCandidateId);
  }
  if (hits.length === 0) return { row: null, agreed: false };

  // 4.3 — keep only the rows whose own name folds to the same base.
  const rows = await lookup.appellationsByIds(hits.map((hit) => hit.id));
  const target = foldName(base);
  const agreeing = rows.filter((row) => foldName(stripDesignationSuffix(normaliseCru(row.name))) === target);
  const agreed = agreeing.length > 0;
  if (!agreed) return { row: null, agreed };

  // 4.4 — then by country, 4.5 by the region candidate, 4.6 by an equivalent suffix.
  // Either filter may empty the set; that is a "no pick", never a reason to retry.
  let left = countryId === null ? agreeing : agreeing.filter((row) => row.countryId === countryId);
  if (left.length === 0) return { row: null, agreed };
  if (left.length > 1 && regionCandidateId !== null) {
    left = left.filter((row) => row.regionId === regionCandidateId);
  }
  if (left.length > 1 && readSuffix !== null) {
    const preferred = left.filter((row) => suffixEquivalent(designationSuffix(normaliseCru(row.name)), readSuffix));
    if (preferred.length > 0) left = preferred;
  }
  // 4.8 / 4.9 — exactly one row, or nothing. Never a first hit.
  return { row: left.length === 1 ? left[0] : null, agreed };
}

async function resolveAppellation(
  appellation: string,
  lookup: RefLookup,
  countryId: string | null,
  regionCandidateId: string | null,
): Promise<AppellationRow | null> {
  const query = normaliseCru(appellation);
  const readSuffix = designationSuffix(query);
  const base = stripDesignationSuffix(query);
  if (base === "") return null;

  const first = await attemptAppellation(base, readSuffix, lookup, countryId, regionCandidateId);
  if (first.row !== null || first.agreed) return first.row;

  // 4.7 — the one retry: drop a trailing Grand Cru / Premier Cru, once.
  const retryBase = withoutCruQualifier(base);
  if (retryBase === null || retryBase === "") return null;
  return (await attemptAppellation(retryBase, readSuffix, lookup, countryId, regionCandidateId)).row;
}

async function resolveBlend(read: LabelRead, lookup: RefLookup): Promise<BlendRow[]> {
  if (read.grapes.length === 0) return [];
  const grapes = await lookup.grapes();
  return read.grapes.map(({ name, percentage }) => {
    const canonical = canonicalGrapeName(name);
    const folded = foldName(canonical);
    const hit = folded === "" ? undefined : grapes.find((grape) => foldName(grape.name) === folded);
    const grape: RefChoice = hit ? { kind: "existing", id: hit.id, name: hit.name } : { kind: "pending", name: canonical };
    return { grape, percentage };
  });
}

async function resolveDesignation(
  designation: string,
  lookup: RefLookup,
  countryId: string | null,
): Promise<string | null> {
  const wanted = foldName(designation);
  if (wanted === "") return null;
  const matches = (await lookup.typeDesignations()).filter((row) => foldName(row.name) === wanted);
  // Spec §B.5 step 8: the draft's country first, then a designation with no
  // country, "otherwise leave it null". There is deliberately no fall back to the
  // first remaining row: a designation scoped to another country is a read the
  // resolver could not place, and this module never guesses. The user still picks
  // it by hand on the confirm screen, and the field is not a completeness field.
  const preferred =
    (countryId !== null ? matches.find((row) => row.countryId === countryId) : undefined)
    ?? matches.find((row) => row.countryId === null);
  return preferred?.id ?? null;
}

/**
 * Resolve one label read into a draft. Every field the read could not anchor to
 * a reference row stays null, so `missingWineFields` can name it.
 */
export async function resolveLabelRead(
  read: LabelRead,
  lookup: RefLookup,
  opts: { imageUrl: string | null },
): Promise<WineIdentityDraft> {
  const draft: WineIdentityDraft = emptyDraft();
  const provenance: Partial<Record<ProvenanceKey, FieldProvenance>> = {};

  // 1. Country — folded equality only. Never guessed.
  let country: { id: string; name: string } | null = null;
  if (read.country !== null) {
    const wanted = foldName(canonicalCountryName(read.country));
    country = (await lookup.countries()).find((row) => foldName(row.name) === wanted) ?? null;
    if (country !== null) {
      draft.countryId = country.id;
      provenance.country = "label";
    }
  }

  if (read.noGeographicIndication) {
    // 2. No geographic indication: the country's national tier, else its None pair.
    //    Steps 3-5 are skipped. With no country, both stay null.
    if (country !== null) {
      const pair = await lookup.noGeographicIndication(country.id);
      if (pair !== null) {
        draft.regionId = pair.regionId;
        draft.appellationId = pair.appellationId;
        provenance.region = "label";
        provenance.appellation = "label";
      }
    }
  } else {
    // 3. Region candidate — a candidate only, not a value yet.
    let regionCandidateId: string | null = null;
    if (country !== null && read.region !== null) {
      const wanted = foldName(canonicalRegionName(read.region, country.name));
      regionCandidateId =
        (await lookup.regionsInCountry(country.id)).find((row) => foldName(row.name) === wanted)?.id ?? null;
    }

    // 4. Appellation — exactly one agreeing row, or nothing.
    if (read.appellation !== null) {
      const row = await resolveAppellation(read.appellation, lookup, draft.countryId, regionCandidateId);
      if (row !== null) {
        draft.appellationId = row.id;
        draft.regionId = row.regionId;
        draft.countryId = row.countryId;
        provenance.appellation = "label";
        provenance.region = "label";
        provenance.country = "label";
      }
    }

    // 5. Region from the read. A region-level read never becomes the region's
    //    self-named appellation.
    if (draft.regionId === null && regionCandidateId !== null) {
      draft.regionId = regionCandidateId;
      provenance.region = "label";
    }
  }

  // 6. Producer — an existing row when one folds equal, otherwise pending. A
  //    bare title word ("Domaine") never looks anything up.
  if (read.producer !== null) {
    const hit = isTitleOnly(read.producer)
      ? null
      : await lookup.producerByFoldedName(read.producer, draft.regionId);
    draft.producer = hit !== null
      ? { kind: "existing", id: hit.id, name: hit.name }
      : { kind: "pending", name: read.producer };
    provenance.producer = "label";

    // 7. Region from the producer's region link — only when the region is still
    //    empty and the link's country is consistent. Never the appellation, and
    //    never a grape (owner rule, RC10).
    if (draft.regionId === null && hit !== null && hit.regionId !== null) {
      const linked = await lookup.regionById(hit.regionId);
      if (linked !== null && (draft.countryId === null || draft.countryId === linked.countryId)) {
        draft.regionId = linked.id;
        provenance.region = "producer-region";
        if (draft.countryId === null) {
          draft.countryId = linked.countryId;
          provenance.country = "producer-region";
        }
      }
    }
  }

  // 8. Designation — the draft's country first, then a designation with no country.
  if (read.designation !== null) {
    draft.typeDesignationId = await resolveDesignation(read.designation, lookup, draft.countryId);
    if (draft.typeDesignationId !== null) provenance.typeDesignation = "label";
  }

  // 9. Grapes — canonical name, then folded equality; percentages kept.
  draft.blend = await resolveBlend(read, lookup);
  if (draft.blend.length > 0) provenance.blend = "label";

  // 10. Vintage — only a vintage actually read off the label counts.
  draft.vintage = read.vintageRead
    ? { kind: read.vintageKind, year: read.vintageYear, tawnyYears: read.vintageTawnyYears, read: true }
    : { kind: null, year: null, tawnyYears: null, read: false };
  if (read.vintageRead) provenance.vintage = "label";

  // 11. The rest comes straight from the read.
  draft.colour = read.colour;
  if (draft.colour !== null) provenance.colour = "label";
  draft.style = read.style;
  if (draft.style !== null) provenance.style = "label";
  draft.wineName = read.wineName;
  if (draft.wineName !== null) provenance.wineName = "label";
  draft.alcohol = read.alcoholPercent;
  if (draft.alcohol !== null) provenance.alcohol = "label";
  draft.description = read.description;
  if (draft.description !== null) provenance.description = "label";
  draft.imageUrl = opts.imageUrl;
  if (draft.imageUrl !== null) provenance.imageUrl = "label";

  draft.provenance = provenance;
  // 12. TAWNY becomes FORTIFIED, the blend is ordered and deduped.
  return normaliseDraft(draft);
}
