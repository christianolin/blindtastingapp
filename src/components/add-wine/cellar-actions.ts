"use server";

import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import { catalogWineTitle } from "@/lib/wset/queries";
import { callerKnowsWine } from "./flight-knowledge";
import {
  glassNumbers,
  windowContains,
  type CellarSheet,
  type CellarSheetLot,
} from "./row-format";

type Db = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY: CellarSheet = { lots: [], totalBottles: 0 };

/**
 * The cellar view's data (A6): my in-stock lots with their drink-window and
 * flight status, plus the bottle total for the header. One RLS-legal read
 * per table — cellar_lots is owner-scoped. A lot is "in flight", with its glass
 * number, only when the caller already knows that glass (spec §C.9).
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
    typeof tastingId === "string" && tastingId
      ? flightGlasses(supabase, user.id, tastingId)
      : Promise.resolve(new Map<string, number>()),
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
      const glass = flight.get(l.catalog_wine_id) ?? null;
      return {
        lotId: l.id,
        catalogWineId: l.catalog_wine_id,
        title,
        imageUrl: (cw?.image_url as string | null) ?? null,
        rack: l.storage_location,
        quantity: l.quantity,
        drinkNow: windowContains(l.drink_from, l.drink_to, thisYear),
        inFlight: glass !== null,
        glass,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    lots,
    totalBottles: lots.reduce((sum, l) => sum + l.quantity, 0),
  };
}

/**
 * catalog_wine_id → the lowest glass number it fills, for the glasses the caller
 * already knows (spec §C.9, D10; sources-3, create-3): the host of a host-provides
 * tasting, the glass's contributor, or anyone once it is revealed. wine_answers
 * RLS alone would also hand a semi-blind participant every candidate and a
 * contributor nothing but their own, so the rule decides both the marker and the
 * number here. Glass numbers follow the whole flight's list order. Fails closed:
 * a failed read marks nothing.
 */
async function flightGlasses(
  supabase: Db,
  userId: string,
  tastingId: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!UUID.test(tastingId)) return out;

  const [{ data: tasting }, { data: wines }] = await Promise.all([
    supabase.from("tastings").select("host_id, wine_source").eq("id", tastingId).maybeSingle(),
    supabase
      .from("wines")
      .select("id, position, is_revealed, contributor_participant_id")
      .eq("tasting_id", tastingId),
  ]);
  if (!tasting || !wines || wines.length === 0) return out;

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

  const known = wines.filter((w) =>
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
  );
  if (known.length === 0) return out;

  const glass = glassNumbers(wines);
  const { data: answers } = await supabase
    .from("wine_answers")
    .select("wine_id, catalog_wine_id")
    .in(
      "wine_id",
      known.map((w) => w.id),
    );
  for (const a of answers ?? []) {
    const number = glass.get(a.wine_id);
    if (!a.catalog_wine_id || number === undefined) continue;
    // The same wine can fill two glasses; keep the lowest number.
    const prev = out.get(a.catalog_wine_id);
    if (prev === undefined || number < prev) out.set(a.catalog_wine_id, number);
  }
  return out;
}

/**
 * How many bottles of a catalog wine the caller holds, for the E1 chooser's cellar
 * subtitle ("{n} bottle(s) · rack {R} · pick a rack after"). The rack is the one
 * holding most of those bottles (the newest lot breaks a tie); null when no lot
 * names a rack. Null when the caller holds none.
 */
export async function ownedBottlesFor(
  catalogWineId: string,
): Promise<{ bottles: number; rack: string | null } | null> {
  if (typeof catalogWineId !== "string" || !UUID.test(catalogWineId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("cellar_lots")
    .select("quantity, storage_location")
    .eq("owner_id", user.id)
    .eq("catalog_wine_id", catalogWineId)
    .gt("quantity", 0)
    .order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return null;

  const perRack = new Map<string, number>();
  for (const lot of data) {
    const rack = lot.storage_location?.trim();
    if (rack) perRack.set(rack, (perRack.get(rack) ?? 0) + lot.quantity);
  }
  let rack: string | null = null;
  for (const [name, count] of perRack) {
    // Insertion order is newest lot first, so a strict > keeps the newest on a tie.
    if (rack === null || count > (perRack.get(rack) ?? 0)) rack = name;
  }
  return { bottles: data.reduce((sum, lot) => sum + lot.quantity, 0), rack };
}
