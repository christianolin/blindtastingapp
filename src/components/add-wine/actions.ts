"use server";

import { revalidatePath } from "next/cache";

import { addCellarLot, increaseCellarLotQuantity } from "@/app/cellar/new/actions";
import { maybeAutoRevealWine } from "@/app/tastings/[id]/play/auto-reveal";
import {
  insertIncompleteGlass,
  insertTastingWineFromCatalogRow,
  insertTastingWineFromIdentity,
  insertTastingWineFromLot,
  insertTastingWineUnidentified,
  loadFlightGlassCore,
  saveFlightGlassCore,
} from "@/app/tastings/[id]/wines/new/tasting-wine-writes";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import { glassSwapRefusal } from "@/lib/flight-glass-rules";
import { readDisplay, vintageLabel } from "@/lib/wine-identity/describe";
import { draftFromCatalogWine, parseStoredDraft } from "@/lib/wine-identity/from-sources";
import {
  pickGrapeSuggestion,
  type CatalogGrapeCount,
  type PlaceGrape,
} from "@/lib/wine-identity/grape-suggestion";
import {
  prepareCompleteWine,
  upsertCatalogWine,
  type WriteRefusal,
} from "@/lib/wine-identity/server/write";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";
import { catalogWineTitle, fetchCatalogWine } from "@/lib/wset/queries";
import { addedVia } from "./added-via";
import { callerKnowsWine, searchShowsCatalogWine } from "./flight-knowledge";
import { windowContains } from "./row-format";
import type {
  AddResult,
  AddSource,
  AddWineDestination,
  AddedWine,
  SearchGroups,
} from "./types";

// The add-wine sheet's server actions (spec §C.1 dispatch, §C.8, §B.8, §B.9).
// Every wine write goes through the one write path (D2): the flight helpers in
// tasting-wine-writes.ts, or prepareCompleteWine + upsertCatalogWine for the
// cellar and the catalog. Nothing here decides whether a wine is complete.
//
// Every export is a server action reachable by a direct POST, so each one
// authenticates the caller itself and checks the shape of what it was sent
// before any write (node_modules/next/dist/docs/01-app/02-guides/data-security.md).

type Db = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids per `in(...)` filter, so a long id list never builds an over-long URL. */
const ID_CHUNK = 100;

/** The catalog fallback of the grape suggestion reads at most this many wines (§B.8). */
const GRAPE_SAMPLE = 500;

const SIGNED_OUT = "You must be signed in.";
const UNTITLED = "Untitled wine";
const NOT_A_FLIGHT = "Choose a tasting to add this wine to.";
const UNKNOWN_SOURCE = "That wine can't be added from here.";
const PLUS_ONE_CELLAR_ONLY = "+1 bottle adds to a lot in your cellar.";
const LOT_FLIGHT_ONLY = "A cellar lot can only be poured into a flight.";
const MALFORMED_DRAFT = "Couldn't read this wine's details. Please try again.";
const CATALOG_WINE_GONE = "That catalog wine no longer exists.";
const LOT_NOT_YOURS = "That lot is not in your cellar.";
const QUANTITY_REQUIRED = "Enter how many bottles you have (at least 1).";
const WINE_NOT_FOUND = "That wine is no longer in the flight.";
const TASTING_NOT_FOUND = "Tasting not found.";
const LOT_EMPTY = "That lot has no bottles left.";
const INTENT_WARNING = "Added — but it won't come out of your cellar.";
const POUR_WARNING = "Added — but the bottle couldn't be taken out of your cellar.";

async function currentUser(supabase: Db) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const SOURCE_KINDS: Record<AddSource["kind"], true> = {
  catalog: true,
  lot: true,
  plusOne: true,
  identity: true,
  unidentified: true,
  incomplete: true,
};

/** A server action receives whatever is posted: only a known source kind goes on. */
function knownSource(source: unknown): source is AddSource {
  if (typeof source !== "object" || source === null) return false;
  const kind = (source as { kind?: unknown }).kind;
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(SOURCE_KINDS, kind);
}

/**
 * A draft from the client, checked field by field before any write. Keys holding
 * `undefined` are dropped first, as JSON drops them, so an unset optional key reads
 * as absent. Null when the payload is not a draft.
 */
function clientDraft(value: unknown): WineIdentityDraft | null {
  try {
    return parseStoredDraft(JSON.parse(JSON.stringify(value ?? null)));
  } catch {
    return null;
  }
}

/** A write refusal as an AddResult, keeping the field keys (D2). */
function refusal(r: WriteRefusal): AddResult {
  return r.missing ? { error: r.error, missing: r.missing } : { error: r.error };
}

// One readable label per catalog wine, the same title the cellar and note
// views use (catalogWineTitle over fetchCatalogWine).
async function labelFor(supabase: Db, catalogWineId: string): Promise<string> {
  const wine = await fetchCatalogWine(supabase, catalogWineId);
  return wine ? catalogWineTitle(wine) : UNTITLED;
}

/** The label of a glass with no catalog wine (incomplete or unidentified): the
    read-display title, "Cigliuti, Barbaresco 2017". Only the adder receives it. */
async function draftLabel(supabase: Db, draft: WineIdentityDraft | null): Promise<string> {
  if (!draft) return UNTITLED;
  let appellation: string | null = null;
  if (draft.appellationId && UUID.test(draft.appellationId)) {
    const { data } = await supabase
      .from("appellations")
      .select("name")
      .eq("id", draft.appellationId)
      .maybeSingle();
    appellation = data?.name ?? null;
  }
  const { title } = readDisplay(draft, {
    producer: null,
    appellation,
    region: null,
    country: null,
    primaryGrape: null,
  });
  return title || UNTITLED;
}

/** Grape names by id, in chunks. Throws on a database error. */
async function grapeNames(supabase: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const names = new Map<string, string>();
  for (let from = 0; from < unique.length; from += ID_CHUNK) {
    const { data, error } = await supabase
      .from("grapes")
      .select("id, name")
      .in("id", unique.slice(from, from + ID_CHUNK));
    if (error) throw new Error(`grape names failed: ${error.message}`);
    for (const grape of data ?? []) names.set(grape.id, grape.name);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Search: one call, three groups (cellar → catalog → tasted).
//
// The catalog group is the `search_catalog_wines` RPC's top 20. The cellar
// and tasted groups are NOT derived from that hit set: the RPC orders by
// producer name, not relevance, and caps at 50, so intersecting my lots with
// its page silently dropped my own "Vietti Barolo" from a catalog with more
// than 20 Barolos. Instead my lots and my notes are read whole (both
// owner-scoped) and matched here with the RPC's own rule — every whitespace
// token of the query, normalised like `f_search_norm`, must be a substring of
// the wine's normalised producer · name · appellation · region · country ·
// vintage text — so the three groups still agree on what "matches".
// ---------------------------------------------------------------------------

const EMPTY: SearchGroups = { cellar: [], catalog: [], tasted: [] };

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// Mirrors public.f_search_norm: accents folded, lowercased, everything but
// [a-z0-9] removed (so "Fleur-Pétrus" and "fleur petrus" meet).
const searchNorm = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "");

function queryTokens(query: string): string[] {
  return query.split(/\s+/).map(searchNorm).filter(Boolean);
}

// The catalog wine columns the cellar / tasted rows embed — enough for the
// title, the thumbnail, the blind-pending gate and the match text.
const WINE_EMBED =
  "id, wine_name, image_url, blind_pending, created_by, vintage_kind, vintage_year, vintage_tawny_years, " +
  "producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name)";

type EmbeddedWine = {
  id: string;
  wine_name: string | null;
  image_url: string | null;
  blind_pending: boolean;
  created_by: string | null;
  vintage_kind: VintageKind;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  producer: unknown;
  appellation: unknown;
  region: unknown;
  country: unknown;
};

// The types file carries no relationship metadata, so an embed comes back
// untyped (object or one-element array) — the same cast listCellarForSheet
// makes.
function embeddedWine(rel: unknown): EmbeddedWine | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return (row as EmbeddedWine | undefined) ?? null;
}

function relName(rel: unknown): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return (row as { name?: string } | undefined)?.name ?? null;
}

function embeddedTitle(w: EmbeddedWine): string {
  return catalogWineTitle({
    producerName: relName(w.producer),
    wineName: w.wine_name,
    vintageKind: w.vintage_kind,
    vintageYear: w.vintage_year,
    vintageTawnyYears: w.vintage_tawny_years,
    appellationName: relName(w.appellation),
  });
}

// The same searchable text the RPC builds (minus the grape names — those
// are a separate join and the RPC treats them as an additive extra).
function embeddedSearchText(w: EmbeddedWine): string {
  return searchNorm(
    [
      relName(w.producer),
      w.wine_name,
      relName(w.appellation),
      relName(w.region),
      relName(w.country),
      w.vintage_year == null ? null : String(w.vintage_year),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

// Blind-pending rows are a flight's hidden wines — never a search result for
// anyone but their creator (they would leak "someone is pouring X tonight"),
// who reads the row already and may need to add it again
// (searchShowsCatalogWine, spec 2026-09-19-rule1-older-leaks D16).
function shownTo(w: { blind_pending: boolean; created_by: string | null }, userId: string): boolean {
  return searchShowsCatalogWine({ blindPending: w.blind_pending, createdBy: w.created_by }, userId);
}

function matchingWine(rel: unknown, tokens: string[], userId: string): EmbeddedWine | null {
  const w = embeddedWine(rel);
  if (!w || !shownTo(w, userId)) return null;
  const text = embeddedSearchText(w);
  return tokens.every((t) => text.includes(t)) ? w : null;
}

type CatalogIdentityRow = {
  id: string;
  blind_pending: boolean;
  created_by: string | null;
  image_url: string | null;
  primary_grape_id: string;
  producer_id: string;
  wine_name: string | null;
  appellation_id: string;
  vintage_kind: VintageKind;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
};

/** The columns behind every catalog and tasted row (spec §C.1): the RPC returns
    names only. A failed chunk is logged and its rows read as absent, so the search
    drops them rather than show a row it could not check for `blind_pending`. */
async function catalogIdentities(supabase: Db, ids: readonly string[]): Promise<Map<string, CatalogIdentityRow>> {
  const out = new Map<string, CatalogIdentityRow>();
  for (let from = 0; from < ids.length; from += ID_CHUNK) {
    const { data, error } = await supabase
      .from("catalog_wines")
      .select(
        "id, blind_pending, created_by, image_url, primary_grape_id, producer_id, wine_name, appellation_id, " +
          "vintage_kind, vintage_year, vintage_tawny_years",
      )
      .in("id", ids.slice(from, from + ID_CHUNK));
    if (error) {
      console.error("add-wine search: catalog identity read failed", { message: error.message });
      continue;
    }
    for (const row of (data ?? []) as unknown as CatalogIdentityRow[]) out.set(row.id, row);
  }
  return out;
}

/** D1's row-meta fields for a catalog wine (spec §C.1). */
function identityFields(w: CatalogIdentityRow) {
  return {
    producerId: w.producer_id,
    wineName: w.wine_name,
    appellationId: w.appellation_id,
    vintageLabel: vintageLabel({
      kind: w.vintage_kind,
      year: w.vintage_year,
      tawnyYears: w.vintage_tawny_years,
      read: false,
    }),
  };
}

export async function searchAddWine(
  query: string,
  opts: { tastingId?: string } = {},
): Promise<SearchGroups> {
  const q = typeof query === "string" ? query.trim() : "";
  if (!q) return EMPTY;
  const tokens = queryTokens(q);
  if (tokens.length === 0) return EMPTY;
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return EMPTY;
  const tastingId = typeof opts?.tastingId === "string" ? opts.tastingId : null;

  const [hits, lots, notes, flightIds] = await Promise.all([
    supabase.rpc("search_catalog_wines", { p_query: q, p_limit: 20 }),
    supabase
      .from("cellar_lots")
      .select(
        `id, catalog_wine_id, quantity, storage_location, drink_from, drink_to, catalog_wines(${WINE_EMBED})`,
      )
      .eq("owner_id", user.id)
      .gt("quantity", 0),
    supabase
      .from("wset_notes")
      .select(`catalog_wine_id, quality_score, tasted_on, created_at, catalog_wines(${WINE_EMBED})`)
      .eq("author_id", user.id)
      .order("tasted_on", { ascending: false })
      .order("created_at", { ascending: false }),
    tastingId ? flightCatalogIds(supabase, user.id, tastingId) : Promise.resolve(new Set<string>()),
  ]);
  const thisYear = new Date().getUTCFullYear();

  // --- cellar: my in-stock lots whose wine matches ---
  const lotRows = (lots.data ?? []) as unknown as Array<{
    id: string;
    catalog_wine_id: string;
    quantity: number;
    storage_location: string | null;
    drink_from: number | null;
    drink_to: number | null;
    catalog_wines: unknown;
  }>;
  const cellar: SearchGroups["cellar"] = lotRows
    .flatMap((l) => {
      const w = matchingWine(l.catalog_wines, tokens, user.id);
      if (!w) return [];
      return [
        {
          lotId: l.id,
          catalogWineId: l.catalog_wine_id,
          title: embeddedTitle(w),
          imageUrl: w.image_url,
          rack: l.storage_location,
          quantity: l.quantity,
          drinkNow: windowContains(l.drink_from, l.drink_to, thisYear),
          inFlight: flightIds.has(l.catalog_wine_id),
        },
      ];
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  // --- tasted: one row per wine I have a note for — the newest note wins
  // (the query is ordered newest first, so the first sighting is kept). These
  // rows reach beyond the RPC's page, so each carries its own in-flight flag
  // (sources-8). ---
  const noteRows = (notes.data ?? []) as unknown as Array<{
    catalog_wine_id: string;
    quality_score: number | null;
    tasted_on: string;
    created_at: string;
    catalog_wines: unknown;
  }>;
  const seen = new Set<string>();
  const tastedHits: { catalogWineId: string; title: string; imageUrl: string | null; myScore: number | null; tastedOn: string }[] = [];
  for (const n of noteRows) {
    if (seen.has(n.catalog_wine_id)) continue;
    const w = matchingWine(n.catalog_wines, tokens, user.id);
    if (!w) continue;
    seen.add(n.catalog_wine_id);
    tastedHits.push({
      catalogWineId: n.catalog_wine_id,
      title: embeddedTitle(w),
      imageUrl: w.image_url,
      myScore: n.quality_score,
      tastedOn: n.tasted_on,
    });
  }

  // --- one catalog_wines read fills every catalog and tasted row ---
  const rows = hits.data ?? [];
  const hitIds = rows.map((r) => r.id);
  const ids = [...new Set([...hitIds, ...tastedHits.map((t) => t.catalogWineId)])];
  if (ids.length === 0) return { cellar, catalog: [], tasted: [] };

  const [identities, ratings] = await Promise.all([
    catalogIdentities(supabase, ids),
    hitIds.length > 0
      ? supabase
          .from("catalog_wine_ratings")
          .select("catalog_wine_id, avg_score, note_count")
          .in("catalog_wine_id", hitIds)
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);

  const tasted: SearchGroups["tasted"] = tastedHits.flatMap((t) => {
    const w = identities.get(t.catalogWineId);
    if (!w || !shownTo(w, user.id)) return [];
    return [{ ...t, ...identityFields(w), inFlight: flightIds.has(t.catalogWineId) }];
  });

  // --- catalog: the RPC's page, minus hidden wines the caller did not create ---
  const ratingById = new Map(ratings.map((r) => [r.catalog_wine_id ?? "", r]));
  const visibleHits = rows.filter((r) => {
    const w = identities.get(r.id);
    return w !== undefined && shownTo(w, user.id);
  });
  const grapeName = await grapeNames(
    supabase,
    visibleHits.map((r) => identities.get(r.id)?.primary_grape_id ?? "").filter(Boolean),
  ).catch((error: unknown) => {
    console.error("add-wine search: grape names failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return new Map<string, string>();
  });

  const catalog: SearchGroups["catalog"] = visibleHits.flatMap((r) => {
    const w = identities.get(r.id);
    if (!w) return [];
    const rating = ratingById.get(r.id);
    const subtitle =
      [r.appellation, r.region, grapeName.get(w.primary_grape_id)].filter(Boolean).join(" · ") || null;
    return [
      {
        catalogWineId: r.id,
        title: catalogWineTitle({
          producerName: r.producer || null,
          wineName: r.wine_name || null,
          vintageKind: r.vintage_kind as VintageKind,
          vintageYear: r.vintage_year,
          vintageTawnyYears: r.vintage_tawny_years,
          appellationName: r.appellation || null,
        }),
        subtitle,
        imageUrl: w.image_url,
        avgScore: rating?.avg_score == null ? null : Number(rating.avg_score),
        noteCount: rating?.note_count ?? 0,
        inFlight: flightIds.has(r.id),
        ...identityFields(w),
      },
    ];
  });

  return { cellar, catalog, tasted };
}

/**
 * The catalog wines already poured into a tasting that the caller already knows
 * (spec §C.9, D10; sources-3, create-3): the host of a host-provides tasting, the
 * glass's contributor, or anyone once it is revealed. wine_answers RLS alone would
 * also hand a semi-blind participant every candidate, so the rule is applied here.
 * Fails closed: a failed read marks nothing.
 */
async function flightCatalogIds(supabase: Db, userId: string, tastingId: string): Promise<Set<string>> {
  if (!UUID.test(tastingId)) return new Set();
  const [{ data: tasting }, { data: wines }] = await Promise.all([
    supabase.from("tastings").select("host_id, wine_source").eq("id", tastingId).maybeSingle(),
    supabase
      .from("wines")
      .select("id, is_revealed, contributor_participant_id")
      .eq("tasting_id", tastingId),
  ]);
  if (!tasting || !wines || wines.length === 0) return new Set();

  const contributorIds = [
    ...new Set(wines.flatMap((w) => (w.contributor_participant_id ? [w.contributor_participant_id] : []))),
  ];
  const contributorUser = new Map<string, string>();
  if (contributorIds.length > 0) {
    const { data: participants } = await supabase
      .from("tasting_participants")
      .select("id, user_id")
      .in("id", contributorIds);
    for (const p of participants ?? []) contributorUser.set(p.id, p.user_id);
  }

  const knownIds = wines
    .filter((w) =>
      callerKnowsWine(
        {
          hostId: tasting.host_id,
          wineSource: tasting.wine_source,
          isRevealed: w.is_revealed,
          contributorUserId: w.contributor_participant_id
            ? (contributorUser.get(w.contributor_participant_id) ?? null)
            : null,
        },
        userId,
      ),
    )
    .map((w) => w.id);
  if (knownIds.length === 0) return new Set();

  const { data: answers } = await supabase
    .from("wine_answers")
    .select("catalog_wine_id")
    .in("wine_id", knownIds);
  return new Set((answers ?? []).flatMap((a) => (a.catalog_wine_id ? [a.catalog_wine_id] : [])));
}

// ---------------------------------------------------------------------------
// By hand: the producer's home region — the one thing the form takes from a
// producer. Owner decision, 2026-09-12: a producer makes wines from many
// appellations and many grapes, so nothing about a new wine's appellation or
// grape follows from its producer, that producer's other catalog wines, or
// its region's most common grape. Never add an appellation or grape here.
// ---------------------------------------------------------------------------

export type ProducerHomeRegion = {
  countryId: string;
  countryName: string;
  regionId: string;
  regionName: string;
};

/**
 * The producer's home region (`producers.region_id`) and that region's
 * country. Null when the producer has none — the ~5% genuinely multi-region
 * producers are left without one on purpose — or a row is missing.
 */
export async function producerHomeRegion(
  producerId: string,
): Promise<ProducerHomeRegion | null> {
  if (!producerId) return null;
  const supabase = await createClient();
  const { data: producer } = await supabase
    .from("producers")
    .select("region_id")
    .eq("id", producerId)
    .maybeSingle();
  if (!producer?.region_id) return null;

  const { data: region } = await supabase
    .from("regions")
    .select("id, name, country_id")
    .eq("id", producer.region_id)
    .maybeSingle();
  if (!region) return null;
  const { data: country } = await supabase
    .from("countries")
    .select("id, name")
    .eq("id", region.country_id)
    .maybeSingle();
  if (!country) return null;

  return {
    countryId: country.id,
    countryName: country.name,
    regionId: region.id,
    regionName: region.name,
  };
}

/**
 * The grape suggestion for an appellation (spec §B.8, D8). The place's PRINCIPAL,
 * permitted `wine_place_grapes` decide first (RLS limits them to PUBLISHED rows on
 * VERIFIED places); only when they do not, the primary grapes of up to 500 live
 * catalog wines of the appellation are counted. `pickGrapeSuggestion` decides.
 * The form offers the result as a chip; it is never selected automatically.
 */
export async function suggestGrapeForAppellation(
  appellationId: string,
): Promise<{ grape: { id: string; name: string }; source: "place" | "catalog" } | null> {
  if (typeof appellationId !== "string" || !UUID.test(appellationId)) return null;
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return null;

  try {
    const placeGrapes = await principalPlaceGrapes(supabase, appellationId);
    // With no catalog counts, pickGrapeSuggestion answers from the place alone.
    const suggestion =
      pickGrapeSuggestion(placeGrapes, []) ??
      pickGrapeSuggestion(placeGrapes, await catalogGrapeCounts(supabase, appellationId));
    return suggestion && suggestion.grape.name !== "" ? suggestion : null;
  } catch (error) {
    console.error("suggestGrapeForAppellation failed", {
      appellationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function principalPlaceGrapes(supabase: Db, appellationId: string): Promise<PlaceGrape[]> {
  const { data: appellation, error } = await supabase
    .from("appellations")
    .select("wine_place_id")
    .eq("id", appellationId)
    .maybeSingle();
  if (error) throw new Error(`appellation read failed: ${error.message}`);
  if (!appellation?.wine_place_id) return [];

  const { data: rows, error: rowsError } = await supabase
    .from("wine_place_grapes")
    .select("grape_id, share_pct")
    .eq("wine_place_id", appellation.wine_place_id)
    .eq("role", "PRINCIPAL")
    .eq("permitted", true);
  if (rowsError) throw new Error(`place grapes read failed: ${rowsError.message}`);
  const list = rows ?? [];
  if (list.length === 0) return [];

  const names = await grapeNames(supabase, list.map((row) => row.grape_id));
  return list.map((row) => ({
    grapeId: row.grape_id,
    name: names.get(row.grape_id) ?? "",
    sharePct: row.share_pct === null ? null : Number(row.share_pct),
  }));
}

async function catalogGrapeCounts(supabase: Db, appellationId: string): Promise<CatalogGrapeCount[]> {
  const { data, error } = await supabase
    .from("catalog_wines")
    .select("primary_grape_id")
    .eq("appellation_id", appellationId)
    .eq("blind_pending", false)
    // `merged_into` is not in the hand-written types, so the untyped filter.
    .filter("merged_into", "is", null)
    .limit(GRAPE_SAMPLE);
  if (error) throw new Error(`catalog grape counts failed: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.primary_grape_id, (counts.get(row.primary_grape_id) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const names = await grapeNames(supabase, [...counts.keys()]);
  return [...counts].map(([grapeId, count]) => ({ grapeId, name: names.get(grapeId) ?? "", count }));
}

/**
 * A live catalog wine as a draft (spec §C.5 A3): "By hand" from a matched read.
 * Its producer name and full blend come along; a wine with no blend rows falls
 * back to its primary and secondary grape. Null when the wine does not exist, was
 * merged away, or a read fails.
 */
export async function loadCatalogWineDraft(catalogWineId: string): Promise<WineIdentityDraft | null> {
  if (typeof catalogWineId !== "string" || !UUID.test(catalogWineId)) return null;
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return null;

  try {
    const { data: wine, error } = await supabase
      .from("catalog_wines")
      .select(
        "id, producer_id, wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, style, " +
          "country_id, region_id, appellation_id, type_designation_id, alcohol_percent, description, " +
          "image_url, primary_grape_id, secondary_grape_id",
      )
      .eq("id", catalogWineId)
      // `merged_into` is not in the hand-written types, so the untyped filter.
      .filter("merged_into", "is", null)
      .maybeSingle();
    if (error) throw new Error(`catalog wine read failed: ${error.message}`);
    if (!wine) return null;
    const w = wine as unknown as {
      id: string; producer_id: string; wine_name: string | null;
      vintage_kind: VintageKind; vintage_year: number | null; vintage_tawny_years: number | null;
      colour: Parameters<typeof draftFromCatalogWine>[0]["colour"];
      style: Parameters<typeof draftFromCatalogWine>[0]["style"];
      country_id: string; region_id: string; appellation_id: string; type_designation_id: string | null;
      alcohol_percent: number | string | null; description: string | null; image_url: string | null;
      primary_grape_id: string; secondary_grape_id: string | null;
    };

    const [producer, blend] = await Promise.all([
      supabase.from("producers").select("id, name").eq("id", w.producer_id).maybeSingle(),
      supabase
        .from("catalog_wine_grapes")
        .select("grape_id, percentage")
        .eq("catalog_wine_id", catalogWineId)
        .order("sort_order"),
    ]);
    if (producer.error) throw new Error(`producer read failed: ${producer.error.message}`);
    if (blend.error) throw new Error(`blend read failed: ${blend.error.message}`);

    const blendRows = (blend.data ?? []).length > 0
      ? (blend.data ?? []).map((row) => ({
          grapeId: row.grape_id,
          percentage: row.percentage === null ? null : Number(row.percentage),
        }))
      : [w.primary_grape_id, w.secondary_grape_id]
          .filter((id): id is string => id !== null)
          .map((grapeId) => ({ grapeId, percentage: null }));
    const names = await grapeNames(supabase, blendRows.map((row) => row.grapeId));

    return draftFromCatalogWine({
      id: w.id,
      producer: { id: w.producer_id, name: producer.data?.name ?? "" },
      wineName: w.wine_name,
      vintageKind: w.vintage_kind,
      vintageYear: w.vintage_year,
      vintageTawnyYears: w.vintage_tawny_years,
      colour: w.colour,
      style: w.style,
      countryId: w.country_id,
      regionId: w.region_id,
      appellationId: w.appellation_id,
      typeDesignationId: w.type_designation_id,
      alcohol: w.alcohol_percent === null ? null : Number(w.alcohol_percent),
      description: w.description,
      imageUrl: w.image_url,
      grapes: blendRows.map((row) => ({
        id: row.grapeId,
        name: names.get(row.grapeId) ?? "",
        percentage: row.percentage,
      })),
    });
  } catch (error) {
    console.error("loadCatalogWineDraft failed", {
      catalogWineId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// The three sheet writes (spec §C.1 dispatch). Every one returns; the sheet
// decides whether to stay open (multi mode, a laptop) or close.
// ---------------------------------------------------------------------------

/**
 * A glass for a flight, dispatched by source kind (spec §C.1), with
 * `addedVia(source)` recorded on the glass:
 * catalog → insertTastingWineFromCatalogRow; lot → insertTastingWineFromLot (its
 * warning passes through); identity → insertTastingWineFromIdentity; unidentified →
 * insertTastingWineUnidentified; incomplete → insertIncompleteGlass (D7). A plusOne
 * is a cellar-only increment and is refused. Every helper runs resolveTastingAdder
 * first (CLOSED tastings, joined contributors, the host).
 */
export async function addToFlight(
  destination: Extract<AddWineDestination, { kind: "flight" }>,
  source: AddSource,
): Promise<AddResult> {
  if (destination?.kind !== "flight" || typeof destination.tastingId !== "string") {
    return { error: NOT_A_FLIGHT };
  }
  if (!knownSource(source)) return { error: UNKNOWN_SOURCE };
  if (source.kind === "plusOne") return { error: PLUS_ONE_CELLAR_ONLY };
  const via = addedVia(source);
  if (via === null) return { error: UNKNOWN_SOURCE };

  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: SIGNED_OUT };
  const { tastingId } = destination;

  let glass: { wineId: string; position: number };
  let catalogWineId: string | null = null;
  let labelDraft: WineIdentityDraft | null = null;
  let incomplete: { missing: WineFieldKey[] } | null = null;
  let warning: string | undefined;

  switch (source.kind) {
    case "catalog": {
      const r = await insertTastingWineFromCatalogRow(supabase, user.id, tastingId, source.catalogWineId, via);
      if ("error" in r) return { error: r.error };
      glass = r;
      catalogWineId = source.catalogWineId;
      break;
    }
    case "lot": {
      const r = await insertTastingWineFromLot(supabase, user.id, tastingId, source.lotId, source.consume === true);
      if ("error" in r) return { error: r.error };
      glass = r;
      catalogWineId = r.catalogWineId;
      warning = r.warning;
      break;
    }
    case "identity": {
      const draft = clientDraft(source.draft);
      if (!draft) return { error: MALFORMED_DRAFT };
      const r = await insertTastingWineFromIdentity(supabase, user.id, tastingId, draft, via);
      if ("error" in r) return refusal(r);
      glass = r;
      catalogWineId = r.catalogWineId;
      break;
    }
    case "unidentified": {
      const draft = clientDraft(source.draft);
      if (!draft) return { error: MALFORMED_DRAFT };
      const r = await insertTastingWineUnidentified(supabase, user.id, tastingId, draft);
      if ("error" in r) return refusal(r);
      glass = r;
      labelDraft = draft;
      break;
    }
    case "incomplete": {
      const draft = clientDraft(source.draft);
      if (!draft) return { error: MALFORMED_DRAFT };
      const r = await insertIncompleteGlass(
        supabase,
        user.id,
        tastingId,
        draft,
        source.via === "scan" ? "scan" : "byhand",
      );
      if ("error" in r) return { error: r.error };
      glass = r;
      labelDraft = draft;
      incomplete = { missing: r.missing };
      break;
    }
    default:
      return { error: UNKNOWN_SOURCE };
  }

  const label = catalogWineId ? await labelFor(supabase, catalogWineId) : await draftLabel(supabase, labelDraft);
  revalidatePath(`/tastings/${tastingId}`);
  const added: AddedWine = {
    label,
    destination: "flight",
    catalogWineId,
    glass: glass.position,
    wineId: glass.wineId,
  };
  if (incomplete) added.incomplete = incomplete;
  return warning ? { ok: true, added, warning } : { ok: true, added };
}

type LotFields = {
  quantity: number;
  bottleSizeMl: number;
  pricePerBottle: number | null;
  currency: string | null;
  storageLocation: string | null;
};

/** The lot step's fields as addCellarLot takes them. An unparseable price is
    dropped, as the lot step always did; the quantity must be at least 1. */
function lotFields(lot: unknown): LotFields | { error: string } {
  if (typeof lot !== "object" || lot === null) return { error: QUANTITY_REQUIRED };
  const { quantity, rack, price, currency } = lot as Record<string, unknown>;
  const count = typeof quantity === "number" ? Math.floor(quantity) : Number.NaN;
  if (!Number.isFinite(count) || count < 1) return { error: QUANTITY_REQUIRED };
  const priceValue = typeof price === "string" ? Number.parseFloat(price.replace(",", ".")) : Number.NaN;
  return {
    quantity: count,
    bottleSizeMl: 750,
    pricePerBottle: Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : null,
    currency: typeof currency === "string" ? currency.trim().toUpperCase() || null : null,
    storageLocation: typeof rack === "string" ? rack.trim() || null : null,
  };
}

/**
 * Into the caller's cellar (spec §B.9 "Cellar add from an identity", D9):
 * catalog → a lot on that wine; identity → prepareCompleteWine + upsertCatalogWine,
 * then a lot with the catalog id only; plusOne → one more bottle on that lot, no
 * lot fields. A lot source is a flight pour and is refused here.
 */
export async function addToCellar(
  source: AddSource,
  lot: { quantity: number; rack: string; price: string; currency: string } | null,
): Promise<AddResult> {
  if (!knownSource(source)) return { error: UNKNOWN_SOURCE };
  if (source.kind === "lot") return { error: LOT_FLIGHT_ONLY };
  if (source.kind !== "catalog" && source.kind !== "identity" && source.kind !== "plusOne") {
    return { error: UNKNOWN_SOURCE };
  }

  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: SIGNED_OUT };

  if (source.kind === "plusOne") {
    if (!UUID.test(source.lotId)) return { error: LOT_NOT_YOURS };
    try {
      await increaseCellarLotQuantity(source.lotId, 1);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Couldn't add the bottle." };
    }
    const { data: lotRow } = await supabase
      .from("cellar_lots")
      .select("catalog_wine_id")
      .eq("id", source.lotId)
      .maybeSingle();
    const catalogWineId = lotRow?.catalog_wine_id ?? null;
    const label = catalogWineId ? await labelFor(supabase, catalogWineId) : UNTITLED;
    revalidatePath("/cellar");
    return { ok: true, added: { label, destination: "cellar", catalogWineId, lotId: source.lotId } };
  }

  const fields = lotFields(lot);
  if ("error" in fields) return fields;

  let catalogWineId: string;
  if (source.kind === "catalog") {
    if (!UUID.test(source.catalogWineId)) return { error: CATALOG_WINE_GONE };
    catalogWineId = source.catalogWineId;
  } else {
    const draft = clientDraft(source.draft);
    if (!draft) return { error: MALFORMED_DRAFT };
    const prepared = await prepareCompleteWine(supabase, draft);
    if ("error" in prepared) return refusal(prepared);
    const upserted = await upsertCatalogWine(supabase, user.id, prepared.wine);
    if ("error" in upserted) return refusal(upserted);
    catalogWineId = upserted.catalogWineId;
  }

  const created = await addCellarLot({ catalogWineId, ...fields });
  if ("error" in created) return refusal(created);
  const label = await labelFor(supabase, catalogWineId);
  revalidatePath("/cellar");
  return { ok: true, added: { label, destination: "cellar", catalogWineId, lotId: created.id } };
}

/**
 * Into the catalog (spec §B.9, D3): identity → prepareCompleteWine +
 * upsertCatalogWine, with `written` true only when a new row was created; a
 * catalog source only confirms the wine (`written: false`). Anything else is
 * refused. A note pick from an identity comes through here too.
 */
export async function addToCatalog(source: AddSource): Promise<AddResult> {
  if (!knownSource(source)) return { error: UNKNOWN_SOURCE };
  if (source.kind !== "catalog" && source.kind !== "identity") return { error: UNKNOWN_SOURCE };

  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: SIGNED_OUT };

  if (source.kind === "catalog") {
    if (!UUID.test(source.catalogWineId)) return { error: CATALOG_WINE_GONE };
    const wine = await fetchCatalogWine(supabase, source.catalogWineId);
    if (!wine) return { error: CATALOG_WINE_GONE };
    return {
      ok: true,
      added: {
        label: catalogWineTitle(wine),
        destination: "catalog",
        catalogWineId: source.catalogWineId,
        written: false,
      },
    };
  }

  const draft = clientDraft(source.draft);
  if (!draft) return { error: MALFORMED_DRAFT };
  const prepared = await prepareCompleteWine(supabase, draft);
  if ("error" in prepared) return refusal(prepared);
  const upserted = await upsertCatalogWine(supabase, user.id, prepared.wine);
  if ("error" in upserted) return refusal(upserted);

  const label = await labelFor(supabase, upserted.catalogWineId);
  revalidatePath("/catalog");
  return {
    ok: true,
    added: { label, destination: "catalog", catalogWineId: upserted.catalogWineId, written: upserted.written },
  };
}

// ---------------------------------------------------------------------------
// Edit a flight glass (spec §C.8, D7): load it into the by-hand form, save it back
// ---------------------------------------------------------------------------

/** A glass loaded for Edit or for finishing, adder only (`is_wine_adder`). */
export async function loadFlightGlassForEdit(
  wineId: string,
): Promise<
  | { draft: WineIdentityDraft; incomplete: boolean; unidentified: boolean; glass: number; canEdit: boolean }
  | { error: string }
> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: SIGNED_OUT };
  return loadFlightGlassCore(supabase, typeof wineId === "string" ? wineId : "");
}

/**
 * A glass saved from Edit, finished, or left for later again (spec §C.8), behind
 * the core's adder and edit guards. Finishing an incomplete glass in a running
 * ASYNC tasting runs the auto-reveal check it skipped while the glass was
 * incomplete.
 */
export async function saveFlightGlass(input: {
  wineId: string;
  draft: WineIdentityDraft;
  unidentified: boolean;
  leaveForLater: boolean;
}): Promise<AddResult> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: SIGNED_OUT };

  const wineId = typeof input?.wineId === "string" ? input.wineId : "";
  const draft = clientDraft(input?.draft);
  if (!draft) return { error: MALFORMED_DRAFT };
  const saved = await saveFlightGlassCore(supabase, user.id, {
    wineId,
    draft,
    unidentified: input.unidentified === true,
    leaveForLater: input.leaveForLater === true,
  });
  if ("error" in saved) return refusal(saved);

  const label = saved.catalogWineId
    ? await labelFor(supabase, saved.catalogWineId)
    : await draftLabel(supabase, draft);
  const added: AddedWine = { label, destination: "flight", catalogWineId: saved.catalogWineId, wineId };
  if (saved.incomplete) added.incomplete = saved.incomplete;

  const { data: wine } = await supabase
    .from("wines")
    .select("tasting_id, position")
    .eq("id", wineId)
    .maybeSingle();
  if (!wine) return { ok: true, added };

  const [{ count }, { data: tasting }] = await Promise.all([
    supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .eq("tasting_id", wine.tasting_id)
      .lte("position", wine.position),
    supabase.from("tastings").select("status, timing_mode").eq("id", wine.tasting_id).maybeSingle(),
  ]);
  added.glass = count ?? wine.position;

  const running = tasting?.status === "IN_PROGRESS" || tasting?.status === "OPEN";
  if (saved.finishedIncomplete && running && tasting?.timing_mode === "ASYNC") {
    try {
      await maybeAutoRevealWine(supabase, wineId);
    } catch (error) {
      console.warn("auto-reveal after finishing a glass failed", {
        wineId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  revalidatePath(`/tastings/${wine.tasting_id}`);
  return { ok: true, added };
}

// ---------------------------------------------------------------------------
// Swap a flight glass's answer key (spec §3.3 item 11, BT-L3): re-point an
// existing glass at a new wine, through the by-hand sheet's normal sources.
// Position and every `guesses` row stay; only the identity, `added_via` and
// (for a cellar lot) the pour intent change.
// ---------------------------------------------------------------------------

/**
 * Re-points `wineId`'s answer key at `source` (spec §3.3 item 11):
 * 1. re-check `glassSwapRefusal` — the adder through `is_wine_adder`, a
 *    semi-blind glass after Start refuses;
 * 2. resolve `source` to a draft (`identity`/`unidentified` carry one
 *    already; `catalog`/`lot` load the wine's own through
 *    `loadCatalogWineDraft`);
 * 3. `saveFlightGlassCore` on the existing wine id — the one write path
 *    (`prepareCompleteWine` + `upsertCatalogWine`, or `prepareUnidentifiedWine`);
 * 4. `set_flight_glass_added_via` — a contributor holds no UPDATE on `wines`;
 * 5. delete the old `wine_pour_intents` row; for a lot source record a new
 *    intent and, when the tasting is running, pour it at once, exactly as
 *    F10's lot add does (D11).
 */
export async function swapFlightGlass(
  tastingId: string,
  wineId: string,
  source: AddSource,
): Promise<AddResult> {
  if (!knownSource(source)) return { error: UNKNOWN_SOURCE };
  if (source.kind === "plusOne" || source.kind === "incomplete") return { error: UNKNOWN_SOURCE };
  const via = addedVia(source);
  if (via === null) return { error: UNKNOWN_SOURCE };

  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: SIGNED_OUT };

  const { data: wine } = await supabase
    .from("wines")
    .select("id, is_revealed, reveal_step")
    .eq("id", wineId)
    .eq("tasting_id", tastingId)
    .maybeSingle();
  if (!wine) return { error: WINE_NOT_FOUND };

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, status, reveal_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: TASTING_NOT_FOUND };

  const { data: isAdder } = await supabase.rpc("is_wine_adder", { p_wine_id: wineId });
  const refused = glassSwapRefusal({
    tastingStatus: tasting.status,
    revealMode: tasting.reveal_mode,
    isRevealed: wine.is_revealed,
    revealStep: wine.reveal_step,
    viewerIsAdder: isAdder === true,
    viewerIsHost: tasting.host_id === user.id,
    laterGlassSeen: false,
  });
  if (refused) return { error: refused };

  let draft: WineIdentityDraft | null;
  let unidentified = false;
  let lotId: string | null = null;
  let consume = false;

  switch (source.kind) {
    case "identity":
      draft = clientDraft(source.draft);
      if (!draft) return { error: MALFORMED_DRAFT };
      break;
    case "unidentified":
      draft = clientDraft(source.draft);
      if (!draft) return { error: MALFORMED_DRAFT };
      unidentified = true;
      break;
    case "catalog":
      if (!UUID.test(source.catalogWineId)) return { error: CATALOG_WINE_GONE };
      draft = await loadCatalogWineDraft(source.catalogWineId);
      if (!draft) return { error: CATALOG_WINE_GONE };
      break;
    case "lot": {
      if (!UUID.test(source.lotId)) return { error: LOT_NOT_YOURS };
      const { data: lot } = await supabase
        .from("cellar_lots")
        .select("id, owner_id, catalog_wine_id, quantity")
        .eq("id", source.lotId)
        .maybeSingle();
      if (!lot || lot.owner_id !== user.id) return { error: LOT_NOT_YOURS };
      if (lot.quantity < 1) return { error: LOT_EMPTY };
      draft = await loadCatalogWineDraft(lot.catalog_wine_id);
      if (!draft) return { error: CATALOG_WINE_GONE };
      lotId = lot.id;
      consume = source.consume === true;
      break;
    }
    default:
      return { error: UNKNOWN_SOURCE };
  }

  const saved = await saveFlightGlassCore(supabase, user.id, {
    wineId,
    draft,
    unidentified,
    leaveForLater: false,
  });
  if ("error" in saved) return refusal(saved);

  const { error: viaError } = await supabase.rpc("set_flight_glass_added_via", {
    p_wine_id: wineId,
    p_added_via: via,
  });
  if (viaError) return { error: viaError.message };

  await supabase.from("wine_pour_intents").delete().eq("wine_id", wineId);
  let warning: string | undefined;
  if (lotId !== null) {
    const { error: intentError } = await supabase.from("wine_pour_intents").insert({
      wine_id: wineId,
      owner_id: user.id,
      cellar_lot_id: lotId,
      consume_on_start: tasting.status === "DRAFT" && consume,
    });
    if (intentError) {
      console.error("wine_pour_intents insert failed", { wineId, message: intentError.message });
      warning = consume ? INTENT_WARNING : undefined;
    } else if (consume && (tasting.status === "IN_PROGRESS" || tasting.status === "OPEN")) {
      const { error: pourError } = await supabase.rpc("pour_cellar_lot_into_glass", { p_wine_id: wineId });
      if (pourError) {
        console.error("pour_cellar_lot_into_glass failed", { wineId, message: pourError.message });
        warning = POUR_WARNING;
      }
    }
  }

  const label = saved.catalogWineId
    ? await labelFor(supabase, saved.catalogWineId)
    : await draftLabel(supabase, draft);
  revalidatePath(`/tastings/${tastingId}`);
  const added: AddedWine = { label, destination: "flight", catalogWineId: saved.catalogWineId, wineId };
  return warning ? { ok: true, added, warning } : { ok: true, added };
}
