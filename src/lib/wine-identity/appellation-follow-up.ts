// The scan's one follow-up lookup for a missing appellation (owner fix C,
// 2026-09-19; spec docs/superpowers/specs/2026-09-19-scan-region-appellation.md
// §6.2, §6.6): the gate that decides whether a read may buy it, the pick that
// keeps only an answer from our own list, and the orchestration readLabelPhoto
// runs between the resolver and the missing-fields/match steps. Pure: relative
// imports only; the billed call and the record are injected (`call`, `keep`).
//
// Nothing here is auto-added: a looked-up appellation lands in the draft marked
// `lookup`, and the confirm screen still shows every field for the user to check.
import {
  APPELLATION_LOOKUP_LIST_CAP,
  type AppellationLookupFacts,
  type AppellationLookupOutcome,
} from "../label-scan/appellation-lookup-schema";
import { labelLookupRow, type LabelLookupRow } from "../label-scan/guards";
import type { LabelRead } from "../label-scan/label-read-schema";
import { foldName } from "./fold";
import { regionNamedOnLabel, type RefLookup } from "./resolve";
import type { WineIdentityDraft } from "./types";

export type AppellationLookupRequest = {
  regionId: string;
  rows: { id: string; name: string }[]; // appellationsInRegion order (name, id)
  facts: AppellationLookupFacts;
};

/**
 * The gate (spec §6.2): the one request to make, or null — no call, no cost —
 * unless every one of these holds:
 * 1. the read is a wine label and not a no-geographic-indication wine;
 * 2. the resolver left the appellation missing (steps 4, 7.5 and 7.6 found nothing);
 * 3. the draft has a region and a country;
 * 4. the region is ours or the label's, never a bare guess (D4): it came from the
 *    producer's region link or from other vintages, or it is the read's own and
 *    the label prints it. An unprinted guess the existing producer's link agrees
 *    with counts as the link's: resolver step 7 marks it `producer-region`, so our
 *    data confirming a guess never costs the lookup that contradicting it earns. A
 *    lookup scoped to a region nothing but the model named can only confirm the
 *    guess — the Tridente read's Castilla-La Mancha, with no producer link, would
 *    come back complete-looking and wrong, the case owner approval 3 existed to
 *    prevent;
 * 5. there is something to look up: a producer or a wine name;
 * 6. the region holds between 1 and APPELLATION_LOOKUP_LIST_CAP appellations —
 *    past the cap, no call.
 */
export async function appellationLookupRequest(
  read: LabelRead,
  draft: WineIdentityDraft,
  lookup: RefLookup,
): Promise<AppellationLookupRequest | null> {
  if (!read.isWineLabel || read.noGeographicIndication) return null;
  if (draft.appellationId) return null;
  if (!draft.regionId || !draft.countryId) return null;
  if (draft.producer === null && foldName(read.wineName ?? "") === "") return null;

  const source = draft.provenance.region;
  if (source !== "producer-region" && source !== "catalog-sibling" && source !== "label") return null;
  const region = await lookup.regionById(draft.regionId);
  if (region === null || region.countryId !== draft.countryId) return null;
  const country = (await lookup.countries()).find((row) => row.id === draft.countryId) ?? null;
  if (country === null) return null;
  if (source === "label" && !regionNamedOnLabel(read.rawText, read.region, region.name, country.name)) return null;

  const rows = await lookup.appellationsInRegion(draft.regionId);
  if (rows.length < 1 || rows.length > APPELLATION_LOOKUP_LIST_CAP) return null;

  return {
    regionId: draft.regionId,
    rows: rows.map(({ id, name }) => ({ id, name })),
    facts: {
      producer: draft.producer?.name ?? null,
      wineName: read.wineName,
      grapes: draft.blend.map((row) => row.grape.name),
      colour: read.colour,
      style: read.vintageKind === "TAWNY" ? "FORTIFIED" : read.style,
      country: country.name,
      region: region.name,
      labelText: read.rawText,
      appellations: rows.map((row) => row.name),
    },
  };
}

/** The one list row whose folded name equals the answer's, or null: for an empty
    fold, for no match, and for two or more matches. No suffix stripping and no
    fuzzy match — an answer that is not one of our own names is discarded. */
export function pickListedAppellation<R extends { id: string; name: string }>(
  answer: string,
  rows: readonly R[],
): R | null {
  const key = foldName(answer);
  if (key === "") return null;
  const matches = rows.filter((row) => foldName(row.name) === key);
  return matches.length === 1 ? matches[0] : null;
}

/** The draft with the looked-up appellation, marked `lookup`. Region and country
    stay as they are: the row came from the draft region's own list. */
export function applyAppellationLookup(draft: WineIdentityDraft, row: { id: string }): WineIdentityDraft {
  return { ...draft, appellationId: row.id, provenance: { ...draft.provenance, appellation: "lookup" } };
}

/**
 * The follow-up, end to end: the gate, the one call, the pick, the record. A read
 * that was not kept (`readId` null) is never looked up, since its follow-up could
 * not be recorded. Every billed outcome is kept through `keep` (a failed record is
 * swallowed: the answer still counts). Any other failure — the gate's reads, the
 * call — leaves the draft exactly as the resolver made it and is handed back as
 * `failure` for the caller to log: the scan never fails because the follow-up did.
 */
export async function followUpAppellation(input: {
  read: LabelRead;
  draft: WineIdentityDraft;
  lookup: RefLookup;
  readId: string | null;
  call: (facts: AppellationLookupFacts) => Promise<AppellationLookupOutcome>;
  keep: (row: LabelLookupRow & { label_read_id: string }) => Promise<void>;
}): Promise<{ draft: WineIdentityDraft; failure: unknown }> {
  try {
    const readId = input.readId;
    if (readId === null) return { draft: input.draft, failure: null };
    const request = await appellationLookupRequest(input.read, input.draft, input.lookup);
    if (request === null) return { draft: input.draft, failure: null };
    const outcome = await input.call(request.facts);
    const picked = outcome.ok && outcome.answer !== null ? pickListedAppellation(outcome.answer, request.rows) : null;
    const row = labelLookupRow(outcome, request, picked);
    if (row !== null) {
      await Promise.resolve()
        .then(() => input.keep({ label_read_id: readId, ...row }))
        .catch(() => undefined);
    }
    return { draft: picked ? applyAppellationLookup(input.draft, picked) : input.draft, failure: null };
  } catch (failure) {
    return { draft: input.draft, failure };
  }
}
