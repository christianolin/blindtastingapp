// Every bottle that has left the owner's cellar (CC-D3, spec §4 "history.ts",
// §5.7; D8).
//
// History is an owner-only surface: `cellar_consumptions` has no read policy
// beyond the owner, so nothing here can reach a read-only cellar even if a
// caller passed someone else's id. `wine_pour_intents` is owner-only too, and
// is read with an explicit `owner_id` filter on top of that.
//
// D8: the tasting a bottle was poured at is an exact link — the consumption's
// own pour intent names the glass, the glass names the tasting. The occasion
// text is carried through to the row untouched and never matched against a
// tasting name.
//
// Nothing about money is selected or derived here (spec §5.7 "No money").
//
// Takes the Supabase client as a parameter (the `place.ts` pattern): no `next`
// import, not server-bound, so a page or an action can call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { chunk } from "./bottles";
import { unwrapEmbed, wineFrom, type Rel } from "./embed";
import { lotTitle } from "./format";
import type { ConsumptionReason, HistoryRow, VintageKind } from "./types";

/** PostgREST puts a `.in(...)` list in the query string; 200 ids a request
 *  keeps every one of them well under the URL length a proxy will accept. */
const ID_CHUNK = 200;

/** Refinement 19: one PostgREST page of consumptions, a stated cap. */
const HISTORY_LIMIT = 1000;

/** Only what a history row needs to name and show its wine: the title parts
 *  and the bottle photo. The rest of a `BottleWine` is null (the row renders
 *  no origin line). */
type HistoryCatalogEmbed = {
  wine_name: string | null;
  vintage_kind: VintageKind;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  image_url: string | null;
  producer: Rel;
  appellation: Rel;
};

type ConsumptionEmbedRow = {
  id: string;
  lot_id: string | null;
  catalog_wine_id: string;
  quantity: number;
  reason: ConsumptionReason;
  consumed_on: string;
  occasion: string | null;
  wset_note_id: string | null;
  created_at: string;
  catalog_wines: HistoryCatalogEmbed | HistoryCatalogEmbed[] | null;
};

const CONSUMPTION_SELECT =
  "id, lot_id, catalog_wine_id, quantity, reason, consumed_on, occasion, wset_note_id, created_at, " +
  "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, image_url, " +
  "producer:producers(name), appellation:appellations(name))";

/**
 * D8: consumption id → the tasting its bottle was poured at.
 *
 * Three hops, each RLS-legal for the owner: their own pour intents, the
 * glasses those intents name (the owner added them, so `"wines read"` admits
 * them as host or participant — a glass since deleted simply drops out), and
 * those glasses' tastings. Never matched on `occasion` text.
 */
export async function tastingLinksFor(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  consumptionIds: readonly string[],
): Promise<Map<string, { id: string; name: string }>> {
  const links = new Map<string, { id: string; name: string }>();
  if (consumptionIds.length === 0) return links;

  // consumption id → glass id.
  const glassByConsumption = new Map<string, string>();
  for (const ids of chunk(consumptionIds, ID_CHUNK)) {
    const { data } = await supabase
      .from("wine_pour_intents")
      .select("wine_id, cellar_consumption_id")
      .eq("owner_id", ownerId)
      .in("cellar_consumption_id", ids);
    for (const i of (data ?? []) as unknown as Array<{
      wine_id: string;
      cellar_consumption_id: string | null;
    }>) {
      if (!i.cellar_consumption_id) continue;
      glassByConsumption.set(i.cellar_consumption_id, i.wine_id);
    }
  }
  if (glassByConsumption.size === 0) return links;

  // glass id → tasting id.
  const glassIds = [
    ...new Set([...glassByConsumption].map(([, glassId]) => glassId)),
  ];
  const tastingByGlass = new Map<string, string>();
  for (const ids of chunk(glassIds, ID_CHUNK)) {
    const { data } = await supabase
      .from("wines")
      .select("id, tasting_id")
      .in("id", ids);
    for (const w of (data ?? []) as unknown as Array<{
      id: string;
      tasting_id: string;
    }>) {
      tastingByGlass.set(w.id, w.tasting_id);
    }
  }
  if (tastingByGlass.size === 0) return links;

  // tasting id → name.
  const tastingIds = [
    ...new Set([...tastingByGlass].map(([, tastingId]) => tastingId)),
  ];
  const names = new Map<string, string>();
  for (const ids of chunk(tastingIds, ID_CHUNK)) {
    const { data } = await supabase
      .from("tastings")
      .select("id, name")
      .in("id", ids);
    for (const t of (data ?? []) as unknown as Array<{
      id: string;
      name: string;
    }>) {
      names.set(t.id, t.name);
    }
  }

  for (const [consumptionId, glassId] of glassByConsumption) {
    const tastingId = tastingByGlass.get(glassId);
    if (!tastingId) continue;
    const name = names.get(tastingId);
    if (name == null) continue;
    links.set(consumptionId, { id: tastingId, name });
  }
  return links;
}

/** The owner's consumptions, newest first, with their titles, note scores and
 *  tasting links (D8). At most `HISTORY_LIMIT` rows (refinement 19). */
export async function getCellarHistory(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<HistoryRow[]> {
  const { data: consData } = await supabase
    .from("cellar_consumptions")
    .select(CONSUMPTION_SELECT)
    .eq("owner_id", ownerId)
    .order("consumed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const rows = (consData ?? []) as unknown as ConsumptionEmbedRow[];
  if (rows.length === 0) return [];

  // The scores on the notes those bottles were written up in — the owner's own
  // notes, so they read under `"wset_notes read"` as the author.
  const noteIds = [
    ...new Set(
      rows.map((r) => r.wset_note_id).filter((id): id is string => !!id),
    ),
  ];
  const scores = new Map<string, number | null>();
  for (const ids of chunk(noteIds, ID_CHUNK)) {
    const { data } = await supabase
      .from("wset_notes")
      .select("id, quality_score")
      .in("id", ids);
    for (const n of (data ?? []) as unknown as Array<{
      id: string;
      quality_score: number | null;
    }>) {
      scores.set(n.id, n.quality_score);
    }
  }

  const tastings = await tastingLinksFor(
    supabase,
    ownerId,
    rows.map((r) => r.id),
  );

  return rows.map((r) => {
    const c = unwrapEmbed(r.catalog_wines);
    // The history row only needs the title and the photo, so every other
    // field is null.
    const wine = wineFrom(
      r.catalog_wine_id,
      c && {
        wine_name: c.wine_name,
        vintage_kind: c.vintage_kind,
        vintage_year: c.vintage_year,
        vintage_tawny_years: c.vintage_tawny_years,
        colour: null,
        style: null,
        image_url: c.image_url,
        producer: c.producer,
        appellation: c.appellation,
        region: null,
        country: null,
        primary_grape: null,
        type_designation: null,
      },
    );
    return {
      id: r.id,
      lotId: r.lot_id,
      catalogWineId: r.catalog_wine_id,
      title: lotTitle(wine),
      reason: r.reason,
      quantity: r.quantity,
      consumedOn: r.consumed_on,
      createdAt: r.created_at,
      occasion: r.occasion,
      note: r.wset_note_id
        ? { id: r.wset_note_id, score: scores.get(r.wset_note_id) ?? null }
        : null,
      tasting: tastings.get(r.id) ?? null,
      imageUrl: wine.imageUrl,
    };
  });
}
