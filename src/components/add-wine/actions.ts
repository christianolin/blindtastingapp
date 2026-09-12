"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import { catalogWineTitle, fetchCatalogWine } from "@/lib/wset/queries";
import { addCellarLot } from "@/app/cellar/new/actions";
import { addTastingWineFromCellarLot } from "@/app/tastings/[id]/wines/new/actions";
import {
  findOrCreateProducer,
  insertTastingWineFromCatalogRow,
  insertTastingWineFromIdentity,
  syncCatalogWine,
} from "@/app/tastings/[id]/wines/new/tasting-wine-writes";
import { windowContains } from "./row-format";
import type {
  AddResult,
  AddSource,
  ByHandIdentity,
  SearchGroups,
} from "./types";

type Db = Awaited<ReturnType<typeof createClient>>;

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

async function currentUser(supabase: Db) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// One readable label per catalog wine, the same title the cellar and note
// views use (catalogWineTitle over fetchCatalogWine).
async function labelFor(supabase: Db, catalogWineId: string): Promise<string> {
  const wine = await fetchCatalogWine(supabase, catalogWineId);
  return wine ? catalogWineTitle(wine) : "Untitled wine";
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

// Mirrors public.f_search_norm: accents folded, lowercased, everything but
// [a-z0-9] removed (so "Fleur-Pétrus" and "fleur petrus" meet).
const searchNorm = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "");

function queryTokens(query: string): string[] {
  return query.split(/\s+/).map(searchNorm).filter(Boolean);
}

// The catalog wine columns the cellar / tasted rows embed — enough for the
// title, the thumbnail, the blind-pending gate and the match text.
const WINE_EMBED =
  "id, wine_name, image_url, blind_pending, vintage_kind, vintage_year, vintage_tawny_years, " +
  "producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name)";

type EmbeddedWine = {
  id: string;
  wine_name: string | null;
  image_url: string | null;
  blind_pending: boolean;
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

// Blind-pending rows are placeholders for a hidden tasting wine — never a
// search result (they would leak "someone is pouring X tonight").
function matchingWine(rel: unknown, tokens: string[]): EmbeddedWine | null {
  const w = embeddedWine(rel);
  if (!w || w.blind_pending) return null;
  const text = embeddedSearchText(w);
  return tokens.every((t) => text.includes(t)) ? w : null;
}

export async function searchAddWine(
  query: string,
  opts: { tastingId?: string } = {},
): Promise<SearchGroups> {
  const q = query.trim();
  if (!q) return EMPTY;
  const tokens = queryTokens(q);
  if (tokens.length === 0) return EMPTY;
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return EMPTY;

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
    opts.tastingId ? flightCatalogIds(supabase, opts.tastingId) : Promise.resolve(new Set<string>()),
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
      const w = matchingWine(l.catalog_wines, tokens);
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
  // (the query is ordered newest first, so the first sighting is kept) ---
  const noteRows = (notes.data ?? []) as unknown as Array<{
    catalog_wine_id: string;
    quality_score: number | null;
    tasted_on: string;
    created_at: string;
    catalog_wines: unknown;
  }>;
  const seen = new Set<string>();
  const tasted: SearchGroups["tasted"] = [];
  for (const n of noteRows) {
    if (seen.has(n.catalog_wine_id)) continue;
    const w = matchingWine(n.catalog_wines, tokens);
    if (!w) continue;
    seen.add(n.catalog_wine_id);
    tasted.push({
      catalogWineId: n.catalog_wine_id,
      title: embeddedTitle(w),
      imageUrl: w.image_url,
      myScore: n.quality_score,
      tastedOn: n.tasted_on,
    });
  }

  // --- catalog: the RPC's page, minus blind-pending placeholders ---
  const rows = hits.data ?? [];
  if (rows.length === 0) return { cellar, catalog: [], tasted };
  const ids = rows.map((r) => r.id);
  const [wines, ratings] = await Promise.all([
    supabase
      .from("catalog_wines")
      .select("id, blind_pending, image_url, primary_grape_id")
      .in("id", ids),
    supabase
      .from("catalog_wine_ratings")
      .select("catalog_wine_id, avg_score, note_count")
      .in("catalog_wine_id", ids),
  ]);
  const wineById = new Map((wines.data ?? []).map((w) => [w.id, w]));
  const ratingById = new Map(
    (ratings.data ?? []).map((r) => [r.catalog_wine_id ?? "", r]),
  );
  const grapeIds = Array.from(
    new Set((wines.data ?? []).map((w) => w.primary_grape_id).filter(Boolean)),
  );
  const { data: grapes } = grapeIds.length
    ? await supabase.from("grapes").select("id, name").in("id", grapeIds)
    : { data: [] as { id: string; name: string }[] };
  const grapeName = new Map((grapes ?? []).map((g) => [g.id, g.name]));

  const catalog: SearchGroups["catalog"] = rows
    .filter((r) => wineById.get(r.id)?.blind_pending !== true)
    .map((r) => {
      const w = wineById.get(r.id);
      const rating = ratingById.get(r.id);
      const subtitle =
        [r.appellation, r.region, w ? grapeName.get(w.primary_grape_id) : null]
          .filter(Boolean)
          .join(" · ") || null;
      return {
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
        imageUrl: w?.image_url ?? null,
        avgScore: rating?.avg_score == null ? null : Number(rating.avg_score),
        noteCount: rating?.note_count ?? 0,
        inFlight: flightIds.has(r.id),
      };
    });

  return { cellar, catalog, tasted };
}

// The catalog wines already poured into a tasting. wine_answers is RLS-gated,
// so the host sees every glass and a BYO contributor only their own — either
// way it is exactly the set the caller is allowed to know about.
async function flightCatalogIds(supabase: Db, tastingId: string): Promise<Set<string>> {
  const { data: wines } = await supabase
    .from("wines")
    .select("id")
    .eq("tasting_id", tastingId);
  const wineIds = (wines ?? []).map((w) => w.id);
  if (wineIds.length === 0) return new Set();
  const { data: answers } = await supabase
    .from("wine_answers")
    .select("catalog_wine_id")
    .in("wine_id", wineIds);
  return new Set(
    (answers ?? []).map((a) => a.catalog_wine_id).filter((id): id is string => !!id),
  );
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

// ---------------------------------------------------------------------------
// The three non-redirecting writes. Every one returns; the sheet decides
// whether to stay open (multi mode) or close + router.refresh().
// ---------------------------------------------------------------------------

export async function addToFlight(
  tastingId: string,
  source: AddSource,
): Promise<AddResult> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: "You must be signed in." };

  let wineId: string;
  let position: number;
  let catalogWineId: string;
  let warning: string | undefined;

  if (source.kind === "catalog") {
    const r = await insertTastingWineFromCatalogRow(
      supabase,
      user.id,
      tastingId,
      source.catalogWineId,
    );
    if ("error" in r) return { error: r.error };
    ({ wineId, position } = r);
    catalogWineId = source.catalogWineId;
  } else if (source.kind === "lot") {
    const r = await addTastingWineFromCellarLot(tastingId, source.lotId, {
      consume: source.consume,
    });
    if ("error" in r) return { error: r.error };
    ({ wineId, position, catalogWineId, warning } = r);
  } else {
    const r = await insertTastingWineFromIdentity(
      supabase,
      user.id,
      tastingId,
      source.identity,
    );
    if ("error" in r) return { error: r.error };
    ({ wineId, position, catalogWineId } = r);
  }

  const label = await labelFor(supabase, catalogWineId);
  revalidatePath(`/tastings/${tastingId}`);
  return {
    ok: true,
    added: { catalogWineId, label, destination: "flight", glass: position, wineId },
    warning,
  };
}

export async function addToCellar(
  source: Exclude<AddSource, { kind: "lot" }>,
  lot: {
    quantity: number;
    storageLocation: string | null;
    pricePerBottle: number | null;
    currency: string | null;
  },
): Promise<AddResult> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: "You must be signed in." };
  const quantity = Math.floor(lot.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return { error: "Enter how many bottles you have (at least 1)." };
  }
  const lotFields = {
    quantity,
    bottleSizeMl: 750,
    pricePerBottle: lot.pricePerBottle,
    currency: lot.currency?.trim().toUpperCase() || null,
    storageLocation: lot.storageLocation?.trim() || null,
  };

  let r: { id: string } | { error: string };
  if (source.kind === "catalog") {
    r = await addCellarLot({ catalogWineId: source.catalogWineId, ...lotFields });
  } else {
    const resolved = await resolveIdentity(supabase, source.identity);
    if ("error" in resolved) return resolved;
    const id = resolved.identity;
    r = await addCellarLot({
      countryId: id.countryId,
      regionId: id.regionId,
      appellationId: id.appellationId,
      grapes: blendOf(id),
      producerId: resolved.producerId,
      typeDesignationId: id.typeDesignationId,
      colour: id.colour,
      style: id.style,
      wineName: id.wineName,
      vintageKind: id.vintageKind,
      vintageYear: id.vintageYear,
      vintageTawnyYears: id.vintageTawnyYears,
      imageUrl: id.imageUrl,
      description: id.description,
      ...lotFields,
    });
  }
  if ("error" in r) return { error: r.error };

  let catalogWineId: string | null =
    source.kind === "catalog" ? source.catalogWineId : null;
  if (!catalogWineId) {
    const { data: created } = await supabase
      .from("cellar_lots")
      .select("catalog_wine_id")
      .eq("id", r.id)
      .maybeSingle();
    catalogWineId = created?.catalog_wine_id ?? null;
    if (catalogWineId && source.kind === "identity") {
      // addCellarLot seeds photo/description/blend; the alcohol % is the one
      // by-hand field it does not carry.
      await syncCatalogWine(
        supabase,
        catalogWineId,
        user.id,
        [],
        null,
        null,
        source.identity.alcoholPercent,
      );
    }
  }
  if (!catalogWineId) return { error: "The lot was saved but its wine could not be read back." };

  const label = await labelFor(supabase, catalogWineId);
  revalidatePath("/cellar");
  return { ok: true, added: { catalogWineId, label, destination: "cellar", lotId: r.id } };
}

export async function addToCatalog(
  source: Exclude<AddSource, { kind: "lot" }>,
): Promise<AddResult> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: "You must be signed in." };

  if (source.kind === "catalog") {
    const label = await labelFor(supabase, source.catalogWineId);
    return {
      ok: true,
      added: { catalogWineId: source.catalogWineId, label, destination: "catalog" },
    };
  }

  const resolved = await resolveIdentity(supabase, source.identity);
  if ("error" in resolved) return resolved;
  const id = resolved.identity;
  // The same payload keys addWine builds — one identity rule for every path.
  const { data: catalogWineId, error } = await supabase.rpc(
    "find_or_create_catalog_wine",
    {
      p: {
        country_id: id.countryId,
        region_id: id.regionId,
        appellation_id: id.appellationId,
        primary_grape_id: id.primaryGrapeId,
        secondary_grape_id: id.secondaryGrapeId,
        producer_id: resolved.producerId,
        type_designation_id: id.typeDesignationId,
        vintage_kind: id.vintageKind,
        vintage_year: id.vintageYear,
        vintage_tawny_years: id.vintageTawnyYears,
        wine_name: id.wineName ?? "",
        colour: id.colour,
        style: id.style,
      },
    },
  );
  if (error || !catalogWineId) {
    return { error: error?.message ?? "Could not add the wine to the catalog." };
  }
  // Photo / description / blend / alcohol only land on a row this user
  // created (syncCatalogWine's created_by rule) — a deduped hit is untouched.
  await syncCatalogWine(
    supabase,
    catalogWineId,
    user.id,
    blendOf(id),
    id.imageUrl,
    id.description,
    id.alcoholPercent,
  );
  const label = await labelFor(supabase, catalogWineId);
  revalidatePath("/catalog");
  return { ok: true, added: { catalogWineId, label, destination: "catalog" } };
}

function blendOf(id: ByHandIdentity): { grapeId: string; percentage: number | null }[] {
  const blend = [{ grapeId: id.primaryGrapeId, percentage: null }];
  if (id.secondaryGrapeId) blend.push({ grapeId: id.secondaryGrapeId, percentage: null });
  return blend;
}

// Validate the write floor and create a pending producer on save (never at
// scan time) — the same copy the tasting path uses. The identity handed back
// is normalised per vintage kind (year only for YEAR, tawny years only for
// TAWNY), as insertTastingWineFromIdentity does, so a leftover value from a
// switched kind never reaches the catalog_wines_vintage_shape check.
async function resolveIdentity(
  supabase: Db,
  identity: ByHandIdentity,
): Promise<{ error: string } | { identity: ByHandIdentity; producerId: string }> {
  const producerName = identity.producerName.trim();
  if (
    !identity.countryId || !identity.regionId || !identity.appellationId ||
    !identity.primaryGrapeId || (!identity.producerId && !producerName) ||
    !identity.colour || !identity.style
  ) {
    return {
      error:
        "Country, region, appellation, grape, producer, colour and style are required.",
    };
  }
  if (identity.vintageKind === "YEAR" && !Number.isFinite(identity.vintageYear ?? Number.NaN)) {
    return { error: "Enter a vintage year." };
  }
  if (
    identity.vintageKind === "TAWNY" &&
    !Number.isFinite(identity.vintageTawnyYears ?? Number.NaN)
  ) {
    return { error: "Choose the tawny age statement." };
  }
  const normalized: ByHandIdentity = {
    ...identity,
    vintageYear: identity.vintageKind === "YEAR" ? identity.vintageYear : null,
    vintageTawnyYears:
      identity.vintageKind === "TAWNY" ? identity.vintageTawnyYears : null,
  };
  let producerId = identity.producerId;
  if (!producerId) {
    try {
      producerId = (await findOrCreateProducer(supabase, identity.regionId, producerName)).id;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not create the producer." };
    }
  }
  return { identity: normalized, producerId };
}
