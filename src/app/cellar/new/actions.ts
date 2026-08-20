"use server";

import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import { catalogWineTitle } from "@/lib/wset/queries";

export type CellarLotInput = {
  catalogWineId?: string | null;
  // identity (used only when creating a new catalog wine)
  countryId?: string;
  regionId?: string;
  appellationId?: string;
  grapes?: { grapeId: string; percentage: number | null }[];
  producerId?: string;
  typeDesignationId?: string | null;
  colour?: string;
  style?: string;
  wineName?: string | null;
  vintageKind?: "YEAR" | "NV" | "TAWNY";
  vintageYear?: number | null;
  vintageTawnyYears?: number | null;
  imageUrl?: string | null;
  description?: string | null;
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

// Add a lot to the caller's cellar. Reuses the catalog find-or-create via the
// add_cellar_lot RPC: pass catalog_wine_id to attach to an existing wine, or the
// identity fields to resolve/create one. RLS + auth.uid() are enforced in the RPC.
//
// Failures are RETURNED, not thrown: Next redacts the message of any error
// thrown out of a server action in production ("An error occurred in the Server
// Components render…"), which hid the real Postgres reason from the user and
// from us. The database message is genuinely useful here — it names the column
// or constraint that rejected the row.
export async function addCellarLot(
  input: CellarLotInput,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to add a wine." };

  const p: Record<string, unknown> = {
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
  if (input.catalogWineId) {
    p.catalog_wine_id = input.catalogWineId;
  } else {
    p.country_id = input.countryId;
    p.region_id = input.regionId;
    p.appellation_id = input.appellationId;
    p.primary_grape_id = input.grapes?.[0]?.grapeId;
    p.secondary_grape_id = input.grapes?.[1]?.grapeId ?? null;
    p.producer_id = input.producerId;
    p.type_designation_id = input.typeDesignationId ?? null;
    p.colour = input.colour;
    p.style = input.style;
    p.wine_name = input.wineName ?? null;
    p.vintage_kind = input.vintageKind;
    p.vintage_year = input.vintageYear ?? null;
    p.vintage_tawny_years = input.vintageTawnyYears ?? null;
  }

  const { data, error } = await supabase.rpc("add_cellar_lot", { p });
  if (error) {
    // Logged server-side too, so the cause is in the Vercel runtime logs even
    // when the user only reports "it wouldn't save".
    console.error("addCellarLot failed", { error, payload: p });
    return { error: error.message };
  }
  const lotId = data as string;

  // A newly-created catalog wine owned by this user gets its full blend (its
  // trigger recomputes the lead grape as primary) and its bottle photo. An
  // existing/deduped wine (or one created by someone else) is left untouched.
  const hasBlend = !!(input.grapes && input.grapes.length > 0);
  if (!input.catalogWineId && (hasBlend || input.imageUrl || input.description)) {
    const { data: lot } = await supabase
      .from("cellar_lots")
      .select("catalog_wine_id")
      .eq("id", lotId)
      .maybeSingle();
    const catalogWineId = lot?.catalog_wine_id;
    if (catalogWineId) {
      const { data: cw } = await supabase
        .from("catalog_wines")
        .select("created_by")
        .eq("id", catalogWineId)
        .maybeSingle();
      if (cw?.created_by === user.id) {
        const wineFields: { image_url?: string; description?: string } = {};
        if (input.imageUrl) wineFields.image_url = input.imageUrl;
        if (input.description) wineFields.description = input.description;
        if (Object.keys(wineFields).length > 0) {
          await supabase
            .from("catalog_wines")
            .update(wineFields)
            .eq("id", catalogWineId);
        }
        if (hasBlend && input.grapes) {
          await supabase
            .from("catalog_wine_grapes")
            .delete()
            .eq("catalog_wine_id", catalogWineId);
          await supabase.from("catalog_wine_grapes").insert(
            input.grapes.map((g, i) => ({
              catalog_wine_id: catalogWineId,
              grape_id: g.grapeId,
              percentage: g.percentage,
              sort_order: i,
            })),
          );
        }
      }
    }
  }
  return { id: lotId };
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

// Search the shared catalog for the "already added?" picker.
export async function searchCellarCatalog(
  query: string,
): Promise<{ id: string; name: string }[]> {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_catalog_wines", {
    p_query: query,
    p_limit: 20,
  });
  return (
    (data ?? []) as Array<{
      id: string;
      wine_name: string;
      producer: string;
      appellation: string;
      vintage_kind: string;
      vintage_year: number | null;
      vintage_tawny_years: number | null;
    }>
  ).map((w) => {
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
