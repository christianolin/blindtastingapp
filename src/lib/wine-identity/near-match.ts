// "Already in the catalog?" (owner, 2026-10-03: no more duplicate catalog wines;
// approved proposal items 1-3). Pure: relative imports only, so vitest and the
// client both load it. The server half (`server/near-match.ts`) reads the
// candidates through `catalog_wine_near_matches` and the producer suggestions
// through `similar_producers` (20261003100000), both SECURITY INVOKER and never a
// blind_pending or merged row; this module only decides what the prompt shows.
import { missingWineFields } from "./complete";
import { vintageLabel } from "./describe";
import { foldName } from "./fold";
import type { VintageKind, WineColour, WineIdentityDraft, WineStyle } from "./types";

/** At most this many wines are shown. */
export const NEAR_MATCH_SHOWN = 5;

export type NearMatchCandidate = {
  id: string;
  producerId: string;
  producerName: string;
  wineName: string | null;
  vintage: { kind: VintageKind; year: number | null; tawnyYears: number | null };
  colour: WineColour;
  style: WineStyle;
  countryId: string;
  regionId: string;
  appellationId: string;
  appellationName: string | null;
  primaryGrapeId: string;
  primaryGrapeName: string | null;
  /** 3: the same producer (id, folded name or alias); 2: the read's wine name is
      this producer's name; 1: a similar producer name; 0: the read's producer is
      this wine's name. */
  producerStrength: number;
  /** 0..1, how close the wine names are. */
  nameScore: number;
};

export type ProducerSuggestion = { id: string; name: string; regionName: string | null; inRegion: boolean; wineCount: number };

export type NearMatchRow = {
  candidate: NearMatchCandidate;
  /** "Marc Esteve Vives Nodal 2019" */
  title: string;
  /** "Cava DO · Macabeo" */
  meta: string;
  /** What differs from the bottle in hand: "2019, yours is 2021". */
  differences: string[];
  /** The draft's vintage label when this is the same wine in another vintage,
      so "Add it as 2021" can reuse its producer, name and place; else null. */
  addAsVintage: string | null;
  /** The candidate's vintage label ("2019") when it is not the bottle's own
      vintage, else null. Using such a row says the bottle IS that vintage, so the
      view words its use button that way and never makes it the primary action:
      in a flight it becomes the answer key, in a cellar the lot. */
  otherVintage: string | null;
};

export type NearMatches = { wines: NearMatchRow[]; producers: ProducerSuggestion[] };

const COLOUR_WORD: Record<WineColour, string> = { RED: "red", WHITE: "white", ROSE: "rosé", ORANGE: "orange" };
const STYLE_WORD: Record<WineStyle, string> = { STILL: "still", SPARKLING: "sparkling", SWEET: "sweet", FORTIFIED: "fortified" };

function capitalised(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function candidateVintage(c: NearMatchCandidate): string {
  return vintageLabel({ ...c.vintage, read: true });
}

function sameVintage(draft: WineIdentityDraft, c: NearMatchCandidate): boolean {
  const v = draft.vintage;
  if (v.kind !== c.vintage.kind) return false;
  if (v.kind === "YEAR") return v.year === c.vintage.year;
  if (v.kind === "TAWNY") return v.tawnyYears === c.vintage.tawnyYears;
  return true;
}

/**
 * Whether two wine names are one name the way `catalog_wine_identity_match`
 * (20261003100000) decides it: equal once lowercased and space-trimmed (the
 * exact half), or equal once folded (accents, case, punctuation) — but the
 * folded half only for a name that folds to something. `foldName` keeps only
 * [a-z0-9], so a non-Latin name ("贺兰晴雪", "Κτήμα") folds to "", the same as a
 * wine with no name; without the guard it would be "the same" as any nameless
 * wine and any other non-Latin name.
 */
export function namesMatch(a: string | null, b: string | null): boolean {
  const exact = (name: string | null) => (name ?? "").replace(/^ +| +$/g, "").toLowerCase();
  if (exact(a) === exact(b)) return true;
  const folded = foldName(a ?? "");
  return folded !== "" && folded === foldName(b ?? "");
}

function sameName(draft: WineIdentityDraft, c: NearMatchCandidate): boolean {
  return namesMatch(draft.wineName, c.wineName);
}

/** The candidate `find_or_create_catalog_wine` would link to on its own (its
    folded identity lookup): the same existing producer, a name equal once folded,
    the same appellation, colour and vintage. Then there is nothing to ask. */
export function isSameIdentity(draft: WineIdentityDraft, c: NearMatchCandidate): boolean {
  return draft.producer?.kind === "existing"
    && draft.producer.id === c.producerId
    && sameName(draft, c)
    && draft.appellationId === c.appellationId
    && draft.colour === c.colour
    && sameVintage(draft, c);
}

/** What the server reads candidates with, or null when there is no producer to anchor them. */
export function nearMatchQuery(draft: WineIdentityDraft): {
  producerId: string | null; producerName: string; regionId: string | null; wineName: string | null;
} | null {
  const producer = draft.producer;
  if (producer === null || producer.name.trim() === "") return null;
  return {
    producerId: producer.kind === "existing" ? producer.id : null,
    producerName: producer.name,
    regionId: draft.regionId,
    wineName: draft.wineName,
  };
}

/** The check runs only before an add that would write a complete identity, and
    only once: a reviewed add ("Add as a new wine", a pick from the prompt) goes on. */
export function shouldAskNearMatch(source: { kind: string; draft?: WineIdentityDraft }, reviewed: boolean): boolean {
  if (reviewed || source.kind !== "identity" || !source.draft) return false;
  return missingWineFields(source.draft).length === 0;
}

function differences(draft: WineIdentityDraft, c: NearMatchCandidate): string[] {
  const out: string[] = [];
  if (!sameVintage(draft, c)) {
    const mine = vintageLabel(draft.vintage);
    out.push(mine ? `${candidateVintage(c)}, yours is ${mine}` : candidateVintage(c));
  }
  if (draft.colour !== null && draft.colour !== c.colour) {
    out.push(`${capitalised(COLOUR_WORD[c.colour])}, yours is ${COLOUR_WORD[draft.colour]}`);
  }
  if (draft.style !== null && draft.style !== c.style) {
    out.push(`${capitalised(STYLE_WORD[c.style])}, yours is ${STYLE_WORD[draft.style]}`);
  }
  const grape = draft.blend[0]?.grape ?? null;
  const grapeDiffers = grape !== null && (grape.kind === "existing" ? grape.id !== c.primaryGrapeId : foldName(grape.name) !== foldName(c.primaryGrapeName ?? ""));
  if (grapeDiffers && c.primaryGrapeName) out.push(`${c.primaryGrapeName}, yours is ${grape!.name}`);
  return out;
}

function rank(draft: WineIdentityDraft, c: NearMatchCandidate): number[] {
  return [
    c.producerStrength,
    c.nameScore,
    sameVintage(draft, c) ? 1 : 0,
    draft.colour === c.colour ? 1 : 0,
  ];
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}

/**
 * The same wine, whatever its vintage: "Add it as 2021" may join the bottle to
 * it. The same producer (id, folded name or alias) with the same name; or a
 * similar producer name (strength 1-2: a typo'd or mis-resolved producer such
 * as "Mas Esteve Vinyes" for Marc Esteve Vives) with the same name that is a real
 * name — not a nameless wine — so the bottle can move to the right producer.
 */
function isSameWine(draft: WineIdentityDraft, c: NearMatchCandidate): boolean {
  if (!sameName(draft, c)) return false;
  if (c.producerStrength >= 3) return true;
  return c.producerStrength >= 1 && foldName(c.wineName ?? "").length >= 4;
}

/**
 * The rows "Already in the catalog?" shows, best first, or null when there is
 * nothing to ask: no candidate at all, or one that is this very wine (the add
 * links to it without asking). Vintage, grape, colour and style never drop a
 * candidate — they are shown as what differs.
 */
export function nearMatchRows(draft: WineIdentityDraft, candidates: readonly NearMatchCandidate[]): NearMatchRow[] | null {
  if (candidates.length === 0) return null;
  if (candidates.some((c) => isSameIdentity(draft, c))) return null;
  const draftVintage = vintageLabel(draft.vintage);
  return [...candidates]
    .sort((a, b) => compareRank(rank(draft, a), rank(draft, b)) || a.id.localeCompare(b.id))
    .slice(0, NEAR_MATCH_SHOWN)
    .map((c) => {
      const vintageDiffers = !sameVintage(draft, c);
      return {
        candidate: c,
        title: [c.producerName, c.wineName?.trim() || null, candidateVintage(c)].filter(Boolean).join(" "),
        meta: [c.appellationName, c.primaryGrapeName].filter(Boolean).join(" · "),
        differences: differences(draft, c),
        addAsVintage: isSameWine(draft, c) && vintageDiffers && draftVintage !== "" ? draftVintage : null,
        otherVintage: vintageDiffers ? candidateVintage(c) : null,
      };
    });
}

/** "Add it as 2021": the matched wine's producer, name, place, colour and style,
    with the bottle's own vintage — so the new vintage joins the same wine. */
export function draftForCandidateVintage(draft: WineIdentityDraft, c: NearMatchCandidate): WineIdentityDraft {
  return {
    ...draft,
    producer: { kind: "existing", id: c.producerId, name: c.producerName },
    wineName: c.wineName,
    colour: c.colour,
    style: c.style,
    countryId: c.countryId,
    regionId: c.regionId,
    appellationId: c.appellationId,
    provenance: {
      ...draft.provenance,
      producer: "catalog-match",
      wineName: "catalog-match",
      country: "catalog-match",
      region: "catalog-match",
      appellation: "catalog-match",
    },
  };
}

/**
 * What a flight glass's save is about to make, as one comparable key: the
 * columns `find_or_create_catalog_wine` matches on, the name folded the way
 * `namesMatch` compares it. An Edit whose key is unchanged since the glass was
 * opened (a description, a photo) is not asked "Already in the catalog?" again;
 * one that changes what the wine is, or finishes an incomplete glass, is.
 */
export function identityKey(draft: WineIdentityDraft): string {
  const producer = draft.producer === null
    ? ""
    : draft.producer.kind === "existing" ? `id:${draft.producer.id}` : `new:${foldName(draft.producer.name)}`;
  const name = draft.wineName ?? "";
  const folded = foldName(name);
  const v = draft.vintage;
  return JSON.stringify([
    producer,
    folded !== "" ? folded : name.replace(/^ +| +$/g, "").toLowerCase(),
    draft.appellationId,
    draft.colour,
    v.kind,
    v.kind === "YEAR" ? v.year : null,
    v.kind === "TAWNY" ? v.tawnyYears : null,
  ]);
}

/** "Did you mean Marc Esteve Vives?": the existing producer in place of a new name. */
export function draftWithProducer(draft: WineIdentityDraft, producer: { id: string; name: string }): WineIdentityDraft {
  return { ...draft, producer: { kind: "existing", id: producer.id, name: producer.name } };
}
