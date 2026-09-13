"use server";

import { withoutBlindPending } from "@/lib/catalog-visibility";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import { emptyDraft } from "@/lib/wine-identity/complete";
import { parseStoredDraft } from "@/lib/wine-identity/from-sources";
import {
  prepareCompleteWine,
  upsertCatalogWine,
  type WriteRefusal,
} from "@/lib/wine-identity/server/write";
import type { WineIdentityDraft } from "@/lib/wine-identity/types";
import { catalogWineTitle } from "@/lib/wset/queries";

export type CellarLotInput = {
  /** Attach the lot to this existing catalog wine. */
  catalogWineId?: string | null;
  /** Otherwise the wine, found or created in the catalog first through the one
      write path (D2). A pending producer or grape name travels in it. */
  draft?: WineIdentityDraft | null;
  // lot
  quantity: number;
  bottleSizeMl: number;
  pricePerBottle?: number | null;
  currency?: string | null;
  purchasedOn?: string | null;
  purchaseSource?: string | null;
  drinkFrom?: number | null;
  drinkTo?: number | null;
  storageLocation?: string | null;
  lotNote?: string | null;
};

// Add a lot to the caller's cellar (spec §B.9 "Cellar page lot create"). Pass
// `catalogWineId` to attach to an existing wine. Otherwise the draft goes
// through `prepareCompleteWine` and `upsertCatalogWine` first, which link an
// identity already in the catalog or create it, and fill its photo, description
// and blend only on a row the caller created and only where empty. The
// add_cellar_lot RPC then receives the catalog wine id only. RLS + auth.uid()
// are enforced in the RPC.
//
// Failures are RETURNED, not thrown: Next redacts the message of any error
// thrown out of a server action in production ("An error occurred in the Server
// Components render…"), which hid the real Postgres reason from the user and
// from us. The database message is genuinely useful here — it names the column
// or constraint that rejected the row. A refusal for an incomplete wine names
// its fields ("This wine needs a vintage.") and carries `missing`.
export async function addCellarLot(
  input: CellarLotInput,
): Promise<{ id: string } | WriteRefusal> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be signed in to add a wine." };

    let catalogWineId = input.catalogWineId || null;
    if (!catalogWineId) {
      // A malformed payload counts as a draft with every field missing.
      const draft = parseStoredDraft(input.draft) ?? emptyDraft();
      const prepared = await prepareCompleteWine(supabase, draft);
      if ("error" in prepared) return prepared;
      const upserted = await upsertCatalogWine(supabase, user.id, prepared.wine);
      if ("error" in upserted) return upserted;
      catalogWineId = upserted.catalogWineId;
    }

    const p = {
      catalog_wine_id: catalogWineId,
      quantity: input.quantity,
      bottle_size_ml: input.bottleSizeMl,
      price_per_bottle: input.pricePerBottle ?? null,
      currency: input.currency ?? null,
      purchased_on: input.purchasedOn ?? null,
      purchase_source: input.purchaseSource ?? null,
      drink_from: input.drinkFrom ?? null,
      drink_to: input.drinkTo ?? null,
      storage_location: input.storageLocation ?? null,
      lot_note: input.lotNote ?? null,
    };
    const { data, error } = await supabase.rpc("add_cellar_lot", { p });
    if (error || !data) {
      // Logged server-side too, so the cause is in the Vercel runtime logs even
      // when the user only reports "it wouldn't save".
      console.error("addCellarLot failed", { error, payload: p });
      return { error: error?.message ?? "Couldn't save this wine. Please try again." };
    }
    return { id: data };
  } catch (error) {
    console.error("addCellarLot failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { error: "Couldn't save this wine. Please try again." };
  }
}

// The caller's lots (quantity > 0) for a catalog wine, so the add form can warn
// before silently creating a duplicate lot.
export async function findMyCellarLotsForWine(catalogWineId: string): Promise<
  {
    id: string;
    quantity: number;
    bottleSizeMl: number;
    storageLocation: string | null;
    createdAt: string;
  }[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !catalogWineId) return [];
  const { data } = await supabase
    .from("cellar_lots")
    .select("id, quantity, bottle_size_ml, storage_location, created_at")
    .eq("owner_id", user.id)
    .eq("catalog_wine_id", catalogWineId)
    .gt("quantity", 0)
    .order("created_at", { ascending: false });
  return (data ?? []).map((l) => ({
    id: l.id,
    quantity: l.quantity,
    bottleSizeMl: l.bottle_size_ml,
    storageLocation: l.storage_location,
    createdAt: l.created_at,
  }));
}

// Add bottles to an existing lot (increase on-hand + purchased together so the
// consumed = purchased - quantity stat stays consistent).
export async function increaseCellarLotQuantity(
  lotId: string,
  addQuantity: number,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  const add = Math.floor(addQuantity);
  if (!Number.isFinite(add) || add < 1) {
    throw new Error("Enter at least one bottle to add.");
  }
  const { data: lot } = await supabase
    .from("cellar_lots")
    .select("quantity, purchased_quantity, owner_id")
    .eq("id", lotId)
    .maybeSingle();
  if (!lot || lot.owner_id !== user.id) {
    throw new Error("That lot is not in your cellar.");
  }
  const { error } = await supabase
    .from("cellar_lots")
    .update({
      quantity: lot.quantity + add,
      purchased_quantity: lot.purchased_quantity + add,
    })
    .eq("id", lotId);
  if (error) throw new Error(error.message);
  return { id: lotId };
}

// Search the shared catalog for the "already added?" picker. A wine hidden in
// an unrevealed flight is never offered (spec §B.6; scan-2).
export async function searchCellarCatalog(
  query: string,
): Promise<{ id: string; name: string }[]> {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_catalog_wines", {
    p_query: query,
    p_limit: 20,
  });
  const rows = (data ?? []).map((w) => {
    const vintage =
      w.vintage_kind === "YEAR"
        ? w.vintage_year
          ? String(w.vintage_year)
          : ""
        : w.vintage_kind === "TAWNY"
          ? w.vintage_tawny_years
            ? `${w.vintage_tawny_years}yo`
            : "Tawny"
          : "NV";
    const name = [w.producer, w.wine_name, w.appellation, vintage]
      .filter(Boolean)
      .join(" ");
    return { id: w.id, name: name || "Untitled wine" };
  });
  return withoutBlindPending(supabase, rows);
}

export type CellarLotOption = {
  lotId: string;
  catalogWineId: string;
  label: string;
  bottleSizeMl: number;
  storageLocation: string | null;
  quantity: number;
  /** The catalog wine's bottle photo, so pickers can show the label. */
  imageUrl: string | null;
};

// The caller's in-stock lots (quantity > 0) with a readable wine label — feeds
// the "add from my cellar" pickers in tastings and Taste & Rate.
export async function listMyCellarLots(): Promise<CellarLotOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("cellar_lots")
    .select(
      "id, catalog_wine_id, bottle_size_ml, quantity, storage_location, " +
        "catalog_wines(wine_name, image_url, vintage_kind, vintage_year, vintage_tawny_years, " +
        "producer:producers(name), appellation:appellations(name))",
    )
    .eq("owner_id", user.id)
    .gt("quantity", 0);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    catalog_wine_id: string;
    bottle_size_ml: number;
    quantity: number;
    storage_location: string | null;
    catalog_wines: Record<string, unknown> | Record<string, unknown>[] | null;
  }>;
  const relName = (rel: unknown): string | null => {
    if (!rel) return null;
    const row = Array.isArray(rel) ? rel[0] : rel;
    return (row as { name?: string } | undefined)?.name ?? null;
  };
  return rows
    .map((l) => {
      const cw = (Array.isArray(l.catalog_wines)
        ? l.catalog_wines[0]
        : l.catalog_wines) as Record<string, unknown> | null;
      const label = cw
        ? catalogWineTitle({
            producerName: relName(cw.producer),
            wineName: (cw.wine_name as string | null) ?? null,
            vintageKind: cw.vintage_kind as VintageKind,
            vintageYear: (cw.vintage_year as number | null) ?? null,
            vintageTawnyYears: (cw.vintage_tawny_years as number | null) ?? null,
            appellationName: relName(cw.appellation),
          })
        : "Untitled wine";
      return {
        lotId: l.id,
        catalogWineId: l.catalog_wine_id,
        label,
        bottleSizeMl: l.bottle_size_ml,
        storageLocation: l.storage_location,
        quantity: l.quantity,
        imageUrl: (cw?.image_url as string | null) ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
