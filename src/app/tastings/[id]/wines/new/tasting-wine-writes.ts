import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  RevealMode,
  TastingStatus,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import { semiBlindAddRefusal } from "@/lib/flight-glass-rules";
import { emptyDraft, missingWineFields, normaliseDraft } from "@/lib/wine-identity/complete";
import {
  draftFromAnswerKey,
  parseStoredDraft,
  type AnswerKeySource,
} from "@/lib/wine-identity/from-sources";
import {
  prepareCompleteWine,
  prepareUnidentifiedWine,
  upsertCatalogWine,
  type ResolvedUnidentifiedWine,
  type ResolvedWine,
  type WriteRefusal,
} from "@/lib/wine-identity/server/write";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";

// The flight's write helpers (spec §B.9, §C.7, §C.8, §D.4 #1): every add to a
// tasting, every glass loaded for Edit, and every glass saved from Edit.
//
// Deliberately NOT a "use server" file: every export of one of those is
// registered as a server action reachable by a direct POST, whether or not
// anything imports it (node_modules/next/dist/docs/01-app/02-guides/
// data-security.md, "Built-in Server Actions Security features"). These
// helpers trust a caller-supplied Supabase client and user id instead of
// resolving auth themselves, so they must only ever be reachable through an
// action that has already authenticated the caller (./actions.ts and
// components/add-wine/actions.ts). `server-only` keeps the module (and its
// trusted signatures) out of every client bundle.
//
// Nothing here decides whether a wine is complete (D2): the identity paths go
// through the one write path in src/lib/wine-identity/server/write.ts, and an
// incomplete glass is a glass with no answer key yet (D7).

type Db = SupabaseClient<Database>;

/** How a glass was added (spec §E.3): the `wines.added_via` column type. */
export type AddedViaDb = NonNullable<Database["public"]["Tables"]["wines"]["Row"]["added_via"]>;

export type ReferenceOption = { id: string; name: string };

type TastingAdder = {
  tasting: {
    id: string;
    name: string;
    status: TastingStatus;
    revealMode: RevealMode;
    wineSource: WineSourceMode;
  };
  contributorParticipantId: string | null;
};

type WineAnswerInsert = Database["public"]["Tables"]["wine_answers"]["Insert"];
type WineAnswerRow = Database["public"]["Tables"]["wine_answers"]["Row"];
/** An answer key's identity columns, without the glass and its one identity link. */
type AnswerIdentity = Omit<WineAnswerInsert, "wine_id" | "catalog_wine_id" | "unidentified_wine_id">;
type UnidentifiedInsert = Database["public"]["Tables"]["catalog_wines_unidentified"]["Insert"];

type InsertedGlass = { wineId: string; position: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TASTING_NOT_FOUND = "Tasting not found.";
const TASTING_CLOSED = "This tasting is finished — reopen it to add wines.";
const JOIN_TO_ADD = "Join the tasting to add a wine.";
const HOST_ONLY = "Only the host can add wines to this tasting.";
const NOT_ADDER = "Only the person who added this glass can edit it.";
const ALREADY_REVEALED = "This wine has already been revealed.";
const WINE_NOT_FOUND = "Wine not found.";
const CATALOG_WINE_GONE = "That catalog wine no longer exists.";
const LOT_NOT_YOURS = "That lot is not in your cellar.";
const LOT_EMPTY = "That lot has no bottles left.";
const OPEN_TASTING_INCOMPLETE =
  "Finish this wine's details first — an open tasting shows every glass as soon as it is added.";
const ALREADY_COMPLETE = "This wine is complete — add it instead of leaving it for later.";
const INTENT_WARNING = "Added — but it won't come out of your cellar.";
const POUR_WARNING = "Added — but the bottle couldn't be taken out of your cellar.";
const UNIDENTIFIED_REASON = "Added as an unidentified bottle during a tasting.";

// Two lookups + an insert, kept simple and type-safe by taking the already
// -built find/create queries as closures rather than a dynamic table name
// (Supabase's typed client can't take a table name as a plain string).
export async function findOrCreate(
  find: () => PromiseLike<{ data: ReferenceOption | null }>,
  create: () => PromiseLike<{
    data: ReferenceOption | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<ReferenceOption> {
  const { data: existing } = await find();
  if (existing) return existing;

  const { data: created, error } = await create();
  if (!error && created) return created;

  // Unique-constraint race: someone else inserted the same row between our
  // check and our insert. Re-select rather than surface a spurious error.
  if (error?.code === "23505") {
    const { data: retried } = await find();
    if (retried) return retried;
  }

  throw new Error(error?.message ?? "Could not create entry.");
}

/**
 * A producer through `find_or_create_producer` (spec §B.7): a name that folds
 * equal to an existing producer reuses it (byhand-1, scan-3), and a new one takes
 * `regionId` as its region link. Throws on a database error.
 */
export async function findOrCreateProducer(
  supabase: Db,
  regionId: string | null,
  name: string,
): Promise<ReferenceOption> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const { data: id, error } = await supabase.rpc("find_or_create_producer", {
    p_name: trimmed,
    p_region_id: regionId,
  });
  if (error || !id) throw new Error(error?.message ?? "Could not create the producer.");
  const { data, error: readError } = await supabase
    .from("producers")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (readError || !data) throw new Error(readError?.message ?? "Could not read the producer back.");
  return data;
}

// ---------------------------------------------------------------------------
// Who may add a glass
// ---------------------------------------------------------------------------

/**
 * The one permission check every insert helper runs first (spec §D.4 #1; D13;
 * scan-7, sources-5, entry-2):
 * - a CLOSED tasting refuses every add;
 * - a semi-blind flight is fixed once the tasting starts — no add (Q7,
 *   flight-glass-rules.ts's semiBlindAddRefusal): a new glass would join the
 *   candidate list guests already see in the same refresh;
 * - bring-your-own needs the caller's JOINED participant row, which becomes the
 *   glass's contributor (any number of bottles per person, including none);
 * - host-provides needs the host.
 */
export async function resolveTastingAdder(
  supabase: Db,
  userId: string,
  tastingId: string,
): Promise<TastingAdder | { error: string }> {
  if (!UUID.test(tastingId)) return { error: TASTING_NOT_FOUND };
  const { data: tasting, error } = await supabase
    .from("tastings")
    .select("id, name, status, reveal_mode, wine_source, host_id")
    .eq("id", tastingId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!tasting) return { error: TASTING_NOT_FOUND };
  if (tasting.status === "CLOSED") return { error: TASTING_CLOSED };
  const semiBlindRefusal = semiBlindAddRefusal({
    revealMode: tasting.reveal_mode,
    tastingStatus: tasting.status,
  });
  if (semiBlindRefusal) return { error: semiBlindRefusal };

  let contributorParticipantId: string | null = null;
  if (tasting.wine_source === "PARTICIPANT_CONTRIBUTED") {
    const { data: participant, error: participantError } = await supabase
      .from("tasting_participants")
      .select("id, status")
      .eq("tasting_id", tastingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (participantError) return { error: participantError.message };
    if (!participant || participant.status !== "JOINED") return { error: JOIN_TO_ADD };
    contributorParticipantId = participant.id;
  } else if (tasting.host_id !== userId) {
    return { error: HOST_ONLY };
  }

  return {
    tasting: {
      id: tasting.id,
      name: tasting.name,
      status: tasting.status,
      revealMode: tasting.reveal_mode,
      wineSource: tasting.wine_source,
    },
    contributorParticipantId,
  };
}

// ---------------------------------------------------------------------------
// Glass inserts
// ---------------------------------------------------------------------------

/** The `wines` row at the next position. removeWine closes the gap a removal
    leaves, so count + 1 never collides on the (tasting_id, position) key. */
async function insertGlassRow(
  supabase: Db,
  adder: TastingAdder,
  addedVia: AddedViaDb,
): Promise<InsertedGlass | { error: string }> {
  const { count, error: countError } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", adder.tasting.id);
  if (countError) return { error: countError.message };
  const position = (count ?? 0) + 1;

  const { data: wine, error } = await supabase
    .from("wines")
    .insert({
      tasting_id: adder.tasting.id,
      position,
      contributor_participant_id: adder.contributorParticipantId,
      // OPEN (group Taste & Rate) hides nothing — glasses are visible and
      // scoreable the moment they're added, with no reveal step.
      is_revealed: adder.tasting.revealMode === "OPEN",
      added_via: addedVia,
    })
    .select("id")
    .single();
  if (error || !wine) return { error: error?.message ?? "Could not add the wine." };
  return { wineId: wine.id, position };
}

/**
 * Undo a glass whose later insert failed. Only the host may delete `wines`
 * (init_schema.sql:392-393), so nothing relies on a delete RLS would silently
 * skip: a contributor's glass stays, and reads as an incomplete glass with every
 * field missing until they finish it with Edit (spec §B.9, §C.8).
 */
async function removeGlassIfHost(
  supabase: Db,
  userId: string,
  tastingId: string,
  wineId: string,
): Promise<void> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("host_id")
    .eq("id", tastingId)
    .maybeSingle();
  if (tasting?.host_id !== userId) return;
  const { error } = await supabase.from("wines").delete().eq("id", wineId);
  if (error) console.error("removing a half-added glass failed", { wineId, message: error.message });
}

/**
 * A glass and its answer key, for a caller that has already passed
 * `resolveTastingAdder`: the `wines` row with `added_via` and the contributor,
 * then the protected `wine_answers` row. It takes the resolved adder rather than
 * resolving again, so the guard runs once and before any catalog write.
 */
async function insertTastingWineCore(
  supabase: Db,
  userId: string,
  adder: TastingAdder,
  answer: Omit<WineAnswerInsert, "wine_id">,
  addedVia: AddedViaDb,
): Promise<InsertedGlass | { error: string }> {
  const glass = await insertGlassRow(supabase, adder, addedVia);
  if ("error" in glass) return glass;

  const { error } = await supabase.from("wine_answers").insert({ ...answer, wine_id: glass.wineId });
  if (error) {
    await removeGlassIfHost(supabase, userId, adder.tasting.id, glass.wineId);
    return { error: error.message };
  }
  return glass;
}

function answerIdentity(wine: ResolvedWine | ResolvedUnidentifiedWine): AnswerIdentity {
  return {
    country_id: wine.countryId,
    region_id: wine.regionId,
    appellation_id: wine.appellationId,
    primary_grape_id: wine.primaryGrapeId,
    secondary_grape_id: wine.secondaryGrapeId,
    producer_id: wine.producerId,
    type_designation_id: wine.typeDesignationId,
    vintage_kind: wine.vintage.kind,
    vintage_year: wine.vintage.year,
    vintage_tawny_years: wine.vintage.tawnyYears,
    image_url: wine.imageUrl,
  };
}

function unidentifiedColumns(
  wine: ResolvedUnidentifiedWine,
): Omit<UnidentifiedInsert, "created_by" | "reason"> {
  return {
    country_id: wine.countryId,
    region_id: wine.regionId,
    appellation_id: wine.appellationId,
    primary_grape_id: wine.primaryGrapeId,
    secondary_grape_id: wine.secondaryGrapeId,
    producer_id: wine.producerId,
    type_designation_id: wine.typeDesignationId,
    vintage_kind: wine.vintage.kind,
    vintage_year: wine.vintage.year,
    vintage_tawny_years: wine.vintage.tawnyYears,
    colour: wine.colour,
    style: wine.style,
    wine_name: wine.wineName,
  };
}

/** A live (not merged-away) catalog wine as a glass. The catalog photo rides
    along so the reveal shows the label, as a hand-entered answer's photo does. */
async function insertGlassFromCatalogWine(
  supabase: Db,
  userId: string,
  adder: TastingAdder,
  catalogWineId: string,
  addedVia: AddedViaDb,
): Promise<InsertedGlass | { error: string }> {
  if (!UUID.test(catalogWineId)) return { error: CATALOG_WINE_GONE };
  const { data: cw, error } = await supabase
    .from("catalog_wines")
    .select(
      "country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, image_url",
    )
    .eq("id", catalogWineId)
    // `merged_into` exists (20260829203000_catalog_curation) but not in the
    // hand-written database.types.ts, so it goes through the untyped filter.
    .filter("merged_into", "is", null)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!cw) return { error: CATALOG_WINE_GONE };

  return insertTastingWineCore(
    supabase,
    userId,
    adder,
    {
      country_id: cw.country_id,
      region_id: cw.region_id,
      appellation_id: cw.appellation_id,
      primary_grape_id: cw.primary_grape_id,
      secondary_grape_id: cw.secondary_grape_id,
      producer_id: cw.producer_id,
      type_designation_id: cw.type_designation_id,
      vintage_kind: cw.vintage_kind,
      vintage_year: cw.vintage_year,
      vintage_tawny_years: cw.vintage_tawny_years,
      image_url: cw.image_url,
      catalog_wine_id: catalogWineId,
    },
    addedVia,
  );
}

/** A catalog wine as a glass (spec §C.1 `catalog`). */
export async function insertTastingWineFromCatalogRow(
  supabase: Db,
  userId: string,
  tastingId: string,
  catalogWineId: string,
  addedVia: AddedViaDb,
): Promise<InsertedGlass | { error: string }> {
  const adder = await resolveTastingAdder(supabase, userId, tastingId);
  if ("error" in adder) return adder;
  return insertGlassFromCatalogWine(supabase, userId, adder, catalogWineId, addedVia);
}

/**
 * A complete identity as a glass (spec §B.9 "Flight add from an identity"):
 * `prepareCompleteWine` → `upsertCatalogWine`, then the answer key with the
 * resolved ids. A refusal names the missing fields (D2).
 */
export async function insertTastingWineFromIdentity(
  supabase: Db,
  userId: string,
  tastingId: string,
  draft: WineIdentityDraft,
  addedVia: AddedViaDb,
): Promise<{ wineId: string; position: number; catalogWineId: string } | WriteRefusal> {
  const adder = await resolveTastingAdder(supabase, userId, tastingId);
  if ("error" in adder) return adder;

  const prepared = await prepareCompleteWine(supabase, draft);
  if ("error" in prepared) return prepared;
  const catalog = await upsertCatalogWine(supabase, userId, prepared.wine);
  if ("error" in catalog) return catalog;

  const glass = await insertTastingWineCore(
    supabase,
    userId,
    adder,
    { ...answerIdentity(prepared.wine), catalog_wine_id: catalog.catalogWineId },
    addedVia,
  );
  if ("error" in glass) return glass;
  return { ...glass, catalogWineId: catalog.catalogWineId };
}

/**
 * One of the caller's cellar lots as a glass (spec §C.7, D11). Nothing about the
 * lot goes on `wines`, which every host and participant reads: the pour intent
 * is the caller's own `wine_pour_intents` row, one INSERT its RLS allows the
 * adder (never an update of `wines`, which matches 0 rows for a contributor).
 * - DRAFT: the intent records `consume`, and Start pours it.
 * - Running (IN_PROGRESS or OPEN) with `consume`: the bottle is poured now.
 * A failed intent or pour keeps the glass and returns a warning.
 */
export async function insertTastingWineFromLot(
  supabase: Db,
  userId: string,
  tastingId: string,
  lotId: string,
  consume: boolean,
): Promise<{ wineId: string; position: number; catalogWineId: string; warning?: string } | { error: string }> {
  const adder = await resolveTastingAdder(supabase, userId, tastingId);
  if ("error" in adder) return adder;

  if (!UUID.test(lotId)) return { error: LOT_NOT_YOURS };
  const { data: lot, error: lotError } = await supabase
    .from("cellar_lots")
    .select("id, owner_id, catalog_wine_id, quantity")
    .eq("id", lotId)
    .maybeSingle();
  if (lotError) return { error: lotError.message };
  if (!lot || lot.owner_id !== userId) return { error: LOT_NOT_YOURS };
  if (lot.quantity < 1) return { error: LOT_EMPTY };

  const glass = await insertGlassFromCatalogWine(supabase, userId, adder, lot.catalog_wine_id, "CELLAR");
  if ("error" in glass) return glass;
  const added = { ...glass, catalogWineId: lot.catalog_wine_id };

  const { status } = adder.tasting;
  const { error: intentError } = await supabase.from("wine_pour_intents").insert({
    wine_id: glass.wineId,
    owner_id: userId,
    cellar_lot_id: lot.id,
    consume_on_start: status === "DRAFT" && consume,
  });
  if (intentError) {
    console.error("wine_pour_intents insert failed", { wineId: glass.wineId, message: intentError.message });
    // Without an intent nothing can be poured, now or at Start. The warning is
    // only true when the bottle was meant to come out.
    return consume ? { ...added, warning: INTENT_WARNING } : added;
  }

  if (consume && (status === "IN_PROGRESS" || status === "OPEN")) {
    const { error: pourError } = await supabase.rpc("pour_cellar_lot_into_glass", {
      p_wine_id: glass.wineId,
    });
    if (pourError) {
      console.error("pour_cellar_lot_into_glass failed", { wineId: glass.wineId, message: pourError.message });
      return { ...added, warning: POUR_WARNING };
    }
  }
  return added;
}

/**
 * The flight-only "I can't identify this bottle" glass (spec §B.9; byhand-7):
 * `prepareUnidentifiedWine`, then the `wines` row, the `catalog_wines_unidentified`
 * row and the answer, in that order. `catalog_wines_unidentified` has no delete
 * policy, so a failed answer leaves that row behind; only the glass is undone,
 * and only for the host.
 */
export async function insertTastingWineUnidentified(
  supabase: Db,
  userId: string,
  tastingId: string,
  draft: WineIdentityDraft,
): Promise<InsertedGlass | WriteRefusal> {
  const adder = await resolveTastingAdder(supabase, userId, tastingId);
  if ("error" in adder) return adder;

  const prepared = await prepareUnidentifiedWine(supabase, draft);
  if ("error" in prepared) return prepared;
  const wine = prepared.wine;

  const glass = await insertGlassRow(supabase, adder, "BY_HAND");
  if ("error" in glass) return glass;

  const { data: unidentified, error: unidentifiedError } = await supabase
    .from("catalog_wines_unidentified")
    .insert({ ...unidentifiedColumns(wine), reason: UNIDENTIFIED_REASON, created_by: userId })
    .select("id")
    .single();
  if (unidentifiedError || !unidentified) {
    await removeGlassIfHost(supabase, userId, tastingId, glass.wineId);
    return { error: unidentifiedError?.message ?? "Could not save the unidentified wine." };
  }

  const { error: answerError } = await supabase.from("wine_answers").insert({
    ...answerIdentity(wine),
    wine_id: glass.wineId,
    unidentified_wine_id: unidentified.id,
  });
  if (answerError) {
    await removeGlassIfHost(supabase, userId, tastingId, glass.wineId);
    return { error: answerError.message };
  }
  return glass;
}

/**
 * A glass added before its details are complete (spec §C.8 steps 1–6; D7): a
 * `wines` row plus the adder's `wine_identity_drafts` row, and nothing else — no
 * catalog row, no answer key, no `blind_pending`. Refused for an OPEN tasting,
 * whose glasses are inserted revealed and so could never be finished.
 */
export async function insertIncompleteGlass(
  supabase: Db,
  userId: string,
  tastingId: string,
  draft: WineIdentityDraft,
  via: "scan" | "byhand",
): Promise<{ wineId: string; position: number; missing: WineFieldKey[] } | { error: string }> {
  const adder = await resolveTastingAdder(supabase, userId, tastingId);
  if ("error" in adder) return adder;
  if (adder.tasting.revealMode === "OPEN") return { error: OPEN_TASTING_INCOMPLETE };

  const missing = missingWineFields(draft);
  if (missing.length === 0) return { error: ALREADY_COMPLETE };

  const glass = await insertGlassRow(supabase, adder, via === "scan" ? "SCAN" : "BY_HAND");
  if ("error" in glass) return glass;

  const { error: draftError } = await supabase.from("wine_identity_drafts").insert({
    wine_id: glass.wineId,
    owner_id: userId,
    draft: normaliseDraft(draft),
    missing,
  });
  if (draftError) {
    await removeGlassIfHost(supabase, userId, tastingId, glass.wineId);
    return { error: draftError.message };
  }
  return { ...glass, missing };
}

// ---------------------------------------------------------------------------
// Loading and saving a glass (Edit)
// ---------------------------------------------------------------------------

type GlassState = {
  tastingId: string;
  position: number;
  isRevealed: boolean;
  revealStep: number;
  status: TastingStatus;
  /** null while the glass is incomplete (D7). */
  answer: WineAnswerRow | null;
};

/** null when the caller added this glass (`is_wine_adder`), else the refusal. */
async function adderRefusal(supabase: Db, wineId: string): Promise<{ error: string } | null> {
  if (!UUID.test(wineId)) return { error: NOT_ADDER };
  const { data, error } = await supabase.rpc("is_wine_adder", { p_wine_id: wineId });
  if (error) return { error: error.message };
  return data === true ? null : { error: NOT_ADDER };
}

async function loadGlassState(supabase: Db, wineId: string): Promise<GlassState | { error: string }> {
  const { data: wine, error } = await supabase
    .from("wines")
    .select("tasting_id, position, is_revealed, reveal_step")
    .eq("id", wineId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!wine) return { error: WINE_NOT_FOUND };

  const { data: tasting, error: tastingError } = await supabase
    .from("tastings")
    .select("status")
    .eq("id", wine.tasting_id)
    .maybeSingle();
  if (tastingError) return { error: tastingError.message };
  if (!tasting) return { error: TASTING_NOT_FOUND };

  const { data: answer, error: answerError } = await supabase
    .from("wine_answers")
    .select("*")
    .eq("wine_id", wineId)
    .maybeSingle();
  if (answerError) return { error: answerError.message };

  return {
    tastingId: wine.tasting_id,
    position: wine.position,
    isRevealed: wine.is_revealed,
    revealStep: wine.reveal_step,
    status: tasting.status,
    answer,
  };
}

/**
 * The edit guard (spec §C.8 as amended by plan amendment 7). Never on a CLOSED
 * tasting or a revealed glass. A complete glass stays editable, in DRAFT or while
 * running, until its first reveal step; an incomplete glass is never step-revealed.
 */
function editRefusal(state: GlassState): string | null {
  if (state.status === "CLOSED") return TASTING_CLOSED;
  if (state.isRevealed) return ALREADY_REVEALED;
  if (state.answer !== null && state.revealStep !== 0) return ALREADY_REVEALED;
  return null;
}

/** numeric columns can arrive as strings through PostgREST. */
function toNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

type CatalogWineDetails = {
  wine_name: string | null;
  colour: NonNullable<AnswerKeySource["catalog"]>["colour"];
  style: NonNullable<AnswerKeySource["catalog"]>["style"];
  description: string | null;
  alcohol_percent: number | null;
};

/** A complete glass's answer key as a draft: the answer key, plus its catalog
    wine's name, colour, style, description, alcohol and blend, or its
    unidentified row's name, colour and style. */
async function draftFromStoredAnswer(
  supabase: Db,
  answer: WineAnswerRow,
): Promise<WineIdentityDraft | { error: string }> {
  let catalogWine: CatalogWineDetails | null = null;
  let blendRows: { grape_id: string; percentage: number | null }[] = [];
  if (answer.catalog_wine_id) {
    const { data, error } = await supabase
      .from("catalog_wines")
      .select("wine_name, colour, style, description, alcohol_percent")
      .eq("id", answer.catalog_wine_id)
      .maybeSingle();
    if (error) return { error: error.message };
    catalogWine = data;
    const { data: rows, error: blendError } = await supabase
      .from("catalog_wine_grapes")
      .select("grape_id, percentage")
      .eq("catalog_wine_id", answer.catalog_wine_id)
      .order("sort_order");
    if (blendError) return { error: blendError.message };
    blendRows = rows ?? [];
  }

  const grapeIds = [
    ...new Set(
      [answer.primary_grape_id, answer.secondary_grape_id, ...blendRows.map((row) => row.grape_id)]
        .filter((id): id is string => id !== null),
    ),
  ];
  const { data: grapes, error: grapesError } = await supabase
    .from("grapes")
    .select("id, name")
    .in("id", grapeIds);
  if (grapesError) return { error: grapesError.message };
  const grapeNames = new Map((grapes ?? []).map((grape) => [grape.id, grape.name]));
  const named = (id: string) => ({ id, name: grapeNames.get(id) ?? "" });

  let producer: { id: string; name: string } | null = null;
  if (answer.producer_id) {
    const { data, error } = await supabase
      .from("producers")
      .select("id, name")
      .eq("id", answer.producer_id)
      .maybeSingle();
    if (error) return { error: error.message };
    producer = data ?? { id: answer.producer_id, name: "" };
  }

  const draft = draftFromAnswerKey({
    countryId: answer.country_id,
    regionId: answer.region_id,
    appellationId: answer.appellation_id,
    producer,
    typeDesignationId: answer.type_designation_id,
    vintageKind: answer.vintage_kind,
    vintageYear: answer.vintage_year,
    vintageTawnyYears: answer.vintage_tawny_years,
    imageUrl: answer.image_url,
    primaryGrape: named(answer.primary_grape_id),
    secondaryGrape: answer.secondary_grape_id ? named(answer.secondary_grape_id) : null,
    catalog: catalogWine
      ? {
          wineName: catalogWine.wine_name,
          colour: catalogWine.colour,
          style: catalogWine.style,
          description: catalogWine.description,
          alcohol: toNumber(catalogWine.alcohol_percent),
          grapes: blendRows.map((row) => ({ ...named(row.grape_id), percentage: toNumber(row.percentage) })),
        }
      : null,
  });
  if (!answer.unidentified_wine_id) return draft;

  const { data: unidentified, error: unidentifiedError } = await supabase
    .from("catalog_wines_unidentified")
    .select("wine_name, colour, style")
    .eq("id", answer.unidentified_wine_id)
    .maybeSingle();
  if (unidentifiedError) return { error: unidentifiedError.message };
  if (!unidentified) return draft;

  const withDetails = normaliseDraft({
    ...draft,
    wineName: unidentified.wine_name,
    colour: unidentified.colour,
    style: unidentified.style,
  });
  const provenance = { ...withDetails.provenance };
  if (withDetails.wineName !== null) provenance.wineName = "manual";
  if (withDetails.colour !== null) provenance.colour = "manual";
  if (withDetails.style !== null) provenance.style = "manual";
  return { ...withDetails, provenance };
}

/**
 * A glass loaded for Edit (spec §C.8 "loading a glass to edit"), adder only. A
 * complete glass's draft comes from its answer key; an incomplete glass's from
 * its stored draft, where a missing or malformed row gives every field missing.
 * `glass` is the list-order number; `canEdit` applies the edit guard.
 */
export async function loadFlightGlassCore(
  supabase: Db,
  wineId: string,
): Promise<
  | { draft: WineIdentityDraft; incomplete: boolean; unidentified: boolean; glass: number; canEdit: boolean }
  | { error: string }
> {
  const refused = await adderRefusal(supabase, wineId);
  if (refused) return refused;
  const state = await loadGlassState(supabase, wineId);
  if ("error" in state) return state;

  const { count, error: countError } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", state.tastingId)
    .lte("position", state.position);
  if (countError) return { error: countError.message };
  const glass = count ?? state.position;
  const canEdit = editRefusal(state) === null;

  if (state.answer === null) {
    const { data: row, error } = await supabase
      .from("wine_identity_drafts")
      .select("draft")
      .eq("wine_id", wineId)
      .maybeSingle();
    if (error) return { error: error.message };
    return { draft: parseStoredDraft(row?.draft) ?? emptyDraft(), incomplete: true, unidentified: false, glass, canEdit };
  }

  const draft = await draftFromStoredAnswer(supabase, state.answer);
  if ("error" in draft) return draft;
  return { draft, incomplete: false, unidentified: state.answer.unidentified_wine_id !== null, glass, canEdit };
}

/** Insert the answer key, or update the existing one in one statement. */
async function writeAnswer(
  supabase: Db,
  wineId: string,
  exists: boolean,
  columns: Omit<WineAnswerInsert, "wine_id">,
): Promise<WriteRefusal | null> {
  if (!exists) {
    const { error } = await supabase.from("wine_answers").insert({ ...columns, wine_id: wineId });
    return error ? { error: error.message } : null;
  }
  const { data, error } = await supabase
    .from("wine_answers")
    .update(columns)
    .eq("wine_id", wineId)
    .select("wine_id");
  if (error) return { error: error.message };
  return data && data.length > 0 ? null : { error: NOT_ADDER };
}

/** The glass's `catalog_wines_unidentified` row id: its current row updated when
    the caller may update it (creator or curator), otherwise a new row. */
async function saveUnidentifiedRow(
  supabase: Db,
  userId: string,
  currentId: string | null,
  wine: ResolvedUnidentifiedWine,
): Promise<{ id: string } | WriteRefusal> {
  const columns = unidentifiedColumns(wine);
  if (currentId) {
    const { data, error } = await supabase
      .from("catalog_wines_unidentified")
      .update(columns)
      .eq("id", currentId)
      .select("id");
    if (error) return { error: error.message };
    if (data && data.length > 0) return { id: currentId };
  }
  const { data, error } = await supabase
    .from("catalog_wines_unidentified")
    .insert({ ...columns, reason: UNIDENTIFIED_REASON, created_by: userId })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not save the unidentified wine." };
  return { id: data.id };
}

/**
 * A glass saved from Edit (spec §C.8 "saving a glass"), adder only, behind the
 * edit guard.
 * - `leaveForLater` on an incomplete glass stores the draft with its recomputed
 *   `missing`; a draft that is now complete falls through to the full save.
 * - The full save runs the one write path, then writes the answer key with
 *   exactly one identity link in the same statement (`wine_answers_one_identity`).
 *   Inserting the answer key deletes the draft (the E.3 trigger).
 */
export async function saveFlightGlassCore(
  supabase: Db,
  userId: string,
  input: { wineId: string; draft: WineIdentityDraft; unidentified: boolean; leaveForLater: boolean },
): Promise<
  | {
      ok: true;
      wineId: string;
      catalogWineId: string | null;
      incomplete?: { missing: WineFieldKey[] };
      finishedIncomplete: boolean;
    }
  | WriteRefusal
> {
  const { wineId, draft, unidentified, leaveForLater } = input;
  const refused = await adderRefusal(supabase, wineId);
  if (refused) return refused;
  const state = await loadGlassState(supabase, wineId);
  if ("error" in state) return state;
  const guard = editRefusal(state);
  if (guard) return { error: guard };

  const wasIncomplete = state.answer === null;
  if (wasIncomplete && leaveForLater) {
    const missing = missingWineFields(draft, { unidentified });
    if (missing.length > 0) {
      const stored = { draft: normaliseDraft(draft), missing, updated_at: new Date().toISOString() };
      const { data: updated, error } = await supabase
        .from("wine_identity_drafts")
        .update(stored)
        .eq("wine_id", wineId)
        .eq("owner_id", userId)
        .select("wine_id");
      if (error) return { error: error.message };
      if (!updated || updated.length === 0) {
        // No draft row yet (a failed second write, spec §C.8): write it now.
        const { error: insertError } = await supabase
          .from("wine_identity_drafts")
          .insert({ ...stored, wine_id: wineId, owner_id: userId });
        if (insertError) return { error: insertError.message };
      }
      return { ok: true, wineId, catalogWineId: null, incomplete: { missing }, finishedIncomplete: false };
    }
  }

  if (unidentified) {
    const prepared = await prepareUnidentifiedWine(supabase, draft);
    if ("error" in prepared) return prepared;
    const row = await saveUnidentifiedRow(supabase, userId, state.answer?.unidentified_wine_id ?? null, prepared.wine);
    if ("error" in row) return row;
    const refusal = await writeAnswer(supabase, wineId, !wasIncomplete, {
      ...answerIdentity(prepared.wine),
      unidentified_wine_id: row.id,
      catalog_wine_id: null,
    });
    if (refusal) return refusal;
    return { ok: true, wineId, catalogWineId: null, finishedIncomplete: wasIncomplete };
  }

  const prepared = await prepareCompleteWine(supabase, draft);
  if ("error" in prepared) return prepared;
  const catalog = await upsertCatalogWine(supabase, userId, prepared.wine);
  if ("error" in catalog) return catalog;
  const refusal = await writeAnswer(supabase, wineId, !wasIncomplete, {
    ...answerIdentity(prepared.wine),
    catalog_wine_id: catalog.catalogWineId,
    unidentified_wine_id: null,
  });
  if (refusal) return refusal;
  return { ok: true, wineId, catalogWineId: catalog.catalogWineId, finishedIncomplete: wasIncomplete };
}
