// The test twin of `serverLookup` (spec §G.2): a `RefLookup` over the committed
// reference snapshot, mirroring the real SQL closely enough that a resolver bug
// shows up here instead of in production.
//
// A test helper, not a test file: relative imports only, and it is never
// imported by app code.
import { readFileSync } from "node:fs";
import path from "node:path";
import { foldName } from "../fold";
import { appellationSearchPattern, NATIONAL_TIER_REGION_NAMES, type RefLookup } from "../resolve";

export type ReferenceSnapshot = {
  countries: { id: string; name: string }[];
  regions: { id: string; name: string; country_id: string }[];
  appellations: { id: string; name: string; region_id: string }[];
  none: { country_id: string; region_id: string; appellation_id: string }[];
  /** `has_wines`: a catalog_wines or wine_answers row carries the producer's id —
      the folded lookup's third tie-break (20260914112500). Absent means false, so
      a snapshot exported before the field still loads and resolves as before. */
  producers: { id: string; name: string; region_id: string | null; has_wines?: boolean }[];
  grapes: { id: string; name: string }[];
  type_designations: { id: string; name: string; country_id: string | null }[];
};

const SNAPSHOT_PATH = "src/lib/wine-identity/__fixtures__/reference-snapshot.json";

/** Exported read-only from the database by `.superpowers/export-reference-snapshot.mjs`. */
export function loadReferenceSnapshot(): ReferenceSnapshot {
  return JSON.parse(readFileSync(path.join(process.cwd(), SNAPSHOT_PATH), "utf8")) as ReferenceSnapshot;
}

// `search_appellations` (20260716160000:27-43) matches f_unaccent(name) ILIKE
// f_unaccent(query): accents folded, punctuation and spacing KEPT. Folding both
// sides with foldName would hide the hyphen defect the real RPC has, which is
// exactly what appellationSearchPattern exists to work around (spec §B.5).
const LETTER_MAP: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ł: "l" };
const MAPPED_LETTERS = /[ßæœøđł]/g;
const COMBINING_MARKS = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20f0\ufe20-\ufe2f]/g;

/** SQL `f_unaccent(lower(s))`: the same letter folding as `foldName`, without
    dropping punctuation. */
function unaccentLower(s: string): string {
  return s
    .toLowerCase()
    .replace(MAPPED_LETTERS, (c) => LETTER_MAP[c] ?? c)
    .normalize("NFD")
    .replace(COMBINING_MARKS, "");
}

/** `value ilike pattern`: `%` is any run of characters, `_` is exactly one, and
    case is ignored (both sides are already lowercased). */
function ilike(pattern: string, value: string): boolean {
  const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, "[\\s\\S]*").replace(/_/g, "[\\s\\S]");
  return new RegExp("^" + source + "$", "i").test(value);
}

const APPELLATION_SEARCH_LIMIT = 25;

export function snapshotLookup(snapshot: ReferenceSnapshot): RefLookup {
  const regionById = (id: string | null) => snapshot.regions.find((r) => r.id === id) ?? null;

  return {
    countries: async () => snapshot.countries.map(({ id, name }) => ({ id, name })),

    regionsInCountry: async (countryId) =>
      snapshot.regions.filter((r) => r.country_id === countryId).map(({ id, name }) => ({ id, name })),

    searchAppellations: async (words, regionId) => {
      const pattern = "%" + appellationSearchPattern(words) + "%";
      return snapshot.appellations
        .filter((a) => (regionId === undefined || a.region_id === regionId) && ilike(pattern, unaccentLower(a.name)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, APPELLATION_SEARCH_LIMIT)
        .map(({ id, name }) => ({ id, name }));
    },

    appellationsByIds: async (ids) =>
      ids.flatMap((id) => {
        const appellation = snapshot.appellations.find((a) => a.id === id);
        const region = appellation ? regionById(appellation.region_id) : null;
        return appellation && region
          ? [{ id: appellation.id, name: appellation.name, regionId: region.id, countryId: region.country_id }]
          : [];
      }),

    noGeographicIndication: async (countryId) => {
      for (const tier of NATIONAL_TIER_REGION_NAMES) {
        const region = snapshot.regions.find((r) => r.country_id === countryId && foldName(r.name) === foldName(tier));
        const appellation = region
          ? snapshot.appellations.find((a) => a.region_id === region.id && foldName(a.name) === foldName(tier))
          : undefined;
        if (region && appellation) return { regionId: region.id, appellationId: appellation.id };
      }
      const none = snapshot.none.find((n) => n.country_id === countryId);
      return none ? { regionId: none.region_id, appellationId: none.appellation_id } : null;
    },

    // find_producer_by_folded_name: folded equality (20260912101000), and among
    // folded-equal producers, in order (20260914112500, owner approval 3):
    //   1. the given region;
    //   2. the exact spelling, lower(name) = lower(btrim(query));
    //   3. a producer that holds wines (has_wines; absent means false);
    //   4. any region link;
    //   5. the name, then the id (spec §B.7).
    //
    // The region key is null-safe. 20260912101000's first version sorted
    // `(p_region_id is not null and p.region_id = p_region_id) desc` first; with a
    // region given, a region-less duplicate made that key NULL, which DESC sorts
    // first (6 of 44 folded collision groups). 20260912101530 wraps it in
    // `coalesce(..., false)`, and this mirror keeps that.
    producerByFoldedName: async (name, regionId) => {
      const wanted = foldName(name);
      if (wanted === "") return null;
      // btrim(text) trims spaces only, not tabs or newlines.
      const spelling = name.replace(/^ +| +$/g, "").toLowerCase();
      const keys = (p: (typeof snapshot.producers)[number]): boolean[] => [
        regionId !== null && p.region_id === regionId,
        p.name.toLowerCase() === spelling,
        p.has_wines === true,
        p.region_id !== null,
      ];
      const hit = snapshot.producers
        .filter((p) => foldName(p.name) === wanted)
        .map((p) => ({ p, k: keys(p) }))
        .sort((a, b) =>
          a.k.reduce((order, key, i) => order || Number(b.k[i]) - Number(key), 0)
          || a.p.name.localeCompare(b.p.name)
          || a.p.id.localeCompare(b.p.id))[0]?.p;
      return hit ? { id: hit.id, name: hit.name, regionId: hit.region_id } : null;
    },

    regionById: async (id) => {
      const region = regionById(id);
      return region ? { id: region.id, name: region.name, countryId: region.country_id } : null;
    },

    grapes: async () => snapshot.grapes.map(({ id, name }) => ({ id, name })),

    typeDesignations: async () =>
      snapshot.type_designations.map(({ id, name, country_id }) => ({ id, name, countryId: country_id })),
  };
}
