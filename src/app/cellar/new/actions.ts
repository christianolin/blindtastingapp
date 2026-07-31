"use server";

import { createClient } from "@/lib/supabase/server";

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
export async function addCellarLot(input: CellarLotInput): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to add a wine.");

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
  if (error) throw new Error(error.message);
  const lotId = data as string;

  // Persist the full blend on a newly-created catalog wine — its trigger then
  // recomputes the lead grape as primary. Only a wine this user owns is touched
  // (an existing/deduped wine keeps its own blend).
  if (!input.catalogWineId && input.grapes && input.grapes.length > 0) {
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
