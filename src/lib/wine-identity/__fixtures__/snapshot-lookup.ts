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
  producers: { id: string; name: string; region_id: string | null }[];
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

    // find_producer_by_folded_name (20260912101000): folded equality, ties to the
    // given region first, then to any producer with a region link, then name, id
    // (spec §B.7).
    //
    // KNOWN LIVE DIVERGENCE — this mirror encodes the contract above; the live
    // function currently inverts the first tie-break. Its key is
    // `(p_region_id is not null and p.region_id = p_region_id) desc`, and for a
    // candidate whose `region_id` is NULL that expression evaluates to NULL
    // (`true and null` → null), which DESC sorts NULLS FIRST — so a region-LESS
    // duplicate beats the region-linked row the caller asked for. Verified
    // read-only against the project database: 6 of 44 folded producer-name
    // collision groups mix null and non-null regions, and
    // `find_producer_by_folded_name('Chateau Lascombes', <Bordeaux>)` returns
    // 80f05804-…(region null) instead of 43c67107-…(region Bordeaux).
    //
    // Deliberately NOT mirrored, because mirroring the defect would encode it as
    // the contract and silence the test that proves the intent. The SQL fix is a
    // follow-up migration (`… order by coalesce(p_region_id is not null and
    // p.region_id = p_region_id, false) desc, …`), outside F5's OWNS. Until it
    // lands, production's step 7 ("region from the producer link") can see
    // `regionId: null` and fill nothing, and F6's confident match can anchor on
    // the wrong producer row.
    producerByFoldedName: async (name, regionId) => {
      const wanted = foldName(name);
      if (wanted === "") return null;
      const hit = snapshot.producers
        .filter((p) => foldName(p.name) === wanted)
        .sort((a, b) =>
          Number(regionId !== null && b.region_id === regionId) - Number(regionId !== null && a.region_id === regionId)
          || Number(b.region_id !== null) - Number(a.region_id !== null)
          || a.name.localeCompare(b.name)
          || a.id.localeCompare(b.id))[0];
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
