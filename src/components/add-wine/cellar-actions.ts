"use server";

import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import { catalogWineTitle } from "@/lib/wset/queries";
import {
  glassNumbers,
  windowContains,
  type CellarSheet,
  type CellarSheetLot,
} from "./row-format";

type Db = Awaited<ReturnType<typeof createClient>>;

const EMPTY: CellarSheet = { lots: [], totalBottles: 0 };

/**
 * The cellar view's data (7f): my in-stock lots with their drink-window and
 * flight status, plus the bottle total for the header. One RLS-legal read
 * per table — cellar_lots is owner-scoped, and the flight lookup only ever
 * reads the wine_answers rows the caller is entitled to.
 */
export async function listCellarForSheet(tastingId?: string): Promise<CellarSheet> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const [{ data }, flight] = await Promise.all([
    supabase
      .from("cellar_lots")
      .select(
        "id, catalog_wine_id, quantity, storage_location, drink_from, drink_to, " +
          "catalog_wines(wine_name, image_url, vintage_kind, vintage_year, vintage_tawny_years, " +
          "producer:producers(name), appellation:appellations(name))",
      )
      .eq("owner_id", user.id)
      .gt("quantity", 0),
    tastingId ? flightGlasses(supabase, user.id, tastingId) : Promise.resolve(new Map<string, number | null>()),
  ]);

  // The types file carries no relationship metadata, so the join comes back
  // untyped — the same cast listMyCellarLots makes.
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    catalog_wine_id: string;
    quantity: number;
    storage_location: string | null;
    drink_from: number | null;
    drink_to: number | null;
    catalog_wines: Record<string, unknown> | Record<string, unknown>[] | null;
  }>;
  const relName = (rel: unknown): string | null => {
    if (!rel) return null;
    const row = Array.isArray(rel) ? rel[0] : rel;
    return (row as { name?: string } | undefined)?.name ?? null;
  };
  const thisYear = new Date().getUTCFullYear();

  const lots: CellarSheetLot[] = rows
    .map((l) => {
      const cw = (Array.isArray(l.catalog_wines)
        ? l.catalog_wines[0]
        : l.catalog_wines) as Record<string, unknown> | null;
      const title = cw
        ? catalogWineTitle({
            producerName: relName(cw.producer),
            wineName: (cw.wine_name as string | null) ?? null,
            vintageKind: cw.vintage_kind as VintageKind,
            vintageYear: (cw.vintage_year as number | null) ?? null,
            vintageTawnyYears: (cw.vintage_tawny_years as number | null) ?? null,
            appellationName: relName(cw.appellation),
          })
        : "Untitled wine";
      const inFlight = flight.has(l.catalog_wine_id);
      return {
        lotId: l.id,
        catalogWineId: l.catalog_wine_id,
        title,
        imageUrl: (cw?.image_url as string | null) ?? null,
        rack: l.storage_location,
        quantity: l.quantity,
        drinkNow: windowContains(l.drink_from, l.drink_to, thisYear),
        inFlight,
        glass: inFlight ? (flight.get(l.catalog_wine_id) ?? null) : null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    lots,
    totalBottles: lots.reduce((sum, l) => sum + l.quantity, 0),
  };
}

// catalog_wine_id → glass number for every wine already in the flight that
// the caller can read. "In flight" is whatever wine_answers RLS returns
// (host: all; BYO contributor: their own; semi-blind participant: the
// candidate list). The GLASS NUMBER is the secret, though — a semi-blind
// participant may read the candidates but must not learn which glass holds
// which — so it is attached only for the host, the caller's own bottle, or
// a wine that is already revealed. Everything else stays null.
async function flightGlasses(
  supabase: Db,
  userId: string,
  tastingId: string,
): Promise<Map<string, number | null>> {
  const [{ data: tasting }, { data: participants }, { data: wines }] = await Promise.all([
    supabase.from("tastings").select("host_id").eq("id", tastingId).maybeSingle(),
    supabase
      .from("tasting_participants")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("user_id", userId)
      .limit(1),
    supabase
      .from("wines")
      .select("id, position, is_revealed, contributor_participant_id")
      .eq("tasting_id", tastingId),
  ]);
  const list = wines ?? [];
  if (list.length === 0) return new Map();

  const isHost = tasting?.host_id === userId;
  const myParticipantId = participants?.[0]?.id ?? null;
  const glass = glassNumbers(list);
  const safe = new Set(
    list
      .filter(
        (w) =>
          isHost ||
          w.is_revealed ||
          (myParticipantId != null && w.contributor_participant_id === myParticipantId),
      )
      .map((w) => w.id),
  );

  const { data: answers } = await supabase
    .from("wine_answers")
    .select("wine_id, catalog_wine_id")
    .in(
      "wine_id",
      list.map((w) => w.id),
    );

  const out = new Map<string, number | null>();
  for (const a of answers ?? []) {
    if (!a.catalog_wine_id) continue;
    const g = safe.has(a.wine_id) ? (glass.get(a.wine_id) ?? null) : null;
    const prev = out.get(a.catalog_wine_id);
    // The same wine can fill two glasses; keep the lowest known number.
    if (prev === undefined || (g != null && (prev == null || g < prev))) {
      out.set(a.catalog_wine_id, g);
    }
  }
  return out;
}
