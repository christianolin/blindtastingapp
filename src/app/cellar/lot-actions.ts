"use server";

// The lot sheet's server actions (CC-D2, spec §4 "Server actions in
// src/app/cellar/lot-actions.ts", §5.5, §5.6; D1, D6).
//
// Every write is the owner's own: the caller is signed in first, and the
// update, the delete and the merge all carry `.eq("owner_id", user.id)` on
// top of RLS, so a lot id belonging to someone else matches no row rather
// than being refused late. `addBottles` delegates to the existing
// `increaseCellarLotQuantity`, which already checks the owner and moves
// `quantity` and `purchased_quantity` together.
//
// This replaces the client-side writes in the retired `edit-lot-form.tsx`:
// validation moved to the server, in `validateLotFields` alone, so there is
// one place to read the rules.
//
// D4: `price_per_bottle` and `currency` are written here because they are the
// owner's own purchase price on their own bottle — the one money field the
// redesign keeps. Nothing reads or derives a valuation, and the catalog
// wine's typical-price column is never touched.

import { revalidatePath } from "next/cache";
import { increaseCellarLotQuantity } from "@/app/cellar/new/actions";
import { getLotSheet } from "@/lib/cellar/lot-sheet";
import type { LotSheetData } from "@/lib/cellar/types";
import { createClient } from "@/lib/supabase/server";

const SIGNED_OUT = "You must be signed in.";

/** A lot id arrives from a URL (`?lot=`), so it is checked before it reaches
 *  PostgREST — a non-UUID makes `uuid = text` fail as an error rather than an
 *  empty result. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A purchase date is a `date` column: the string the sheet sends, no zone. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The four formats the lot form offers; any other integer millilitre count
 *  in a sane range is accepted too, so an imported odd size survives a save. */
const NAMED_SIZES = [375, 750, 1500, 3000];
const MIN_SIZE_ML = 50;
const MAX_SIZE_ML = 20000;

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/** The editable fields of a lot (spec §5.5 "Edit lot switches the sheet body
 *  to the lot fields"). Everything else about a lot is derived or owned by a
 *  consumption. */
export type LotFields = {
  quantity: number;
  bottleSizeMl: number;
  pricePerBottle: number | null;
  currency: string;
  purchasedOn: string | null;
  purchaseSource: string | null;
  drinkFrom: number | null;
  drinkTo: number | null;
  storageLocation: string | null;
  lotNote: string | null;
};

function trimmedOrNull(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function isInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/**
 * Every rule the lot form enforces, in one place (CC-D2's Tests note), so a
 * reviewer reads them together and no caller can skip one.
 *
 * Returns the cleaned fields to write, or the message to show.
 */
function validateLotFields(fields: LotFields): { error: string } | LotFields {
  const quantity = fields.quantity;
  if (!isInteger(quantity) || quantity < 0) {
    // The old form's message, kept verbatim.
    return { error: "Bottles can't be negative." };
  }

  const bottleSizeMl = fields.bottleSizeMl;
  if (
    !isInteger(bottleSizeMl) ||
    (!NAMED_SIZES.includes(bottleSizeMl) &&
      (bottleSizeMl < MIN_SIZE_ML || bottleSizeMl > MAX_SIZE_ML))
  ) {
    return { error: "Pick a bottle size." };
  }

  const price = fields.pricePerBottle;
  if (price != null && (!Number.isFinite(price) || price < 0)) {
    return { error: "A price can't be negative." };
  }

  const currencyRaw = trimmedOrNull(fields.currency) ?? "DKK";
  const currency = currencyRaw.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "A currency is three letters, like DKK." };
  }

  const purchasedOn = trimmedOrNull(fields.purchasedOn);
  if (purchasedOn != null && !DATE.test(purchasedOn)) {
    return { error: "That purchase date isn't a date." };
  }

  const drinkFrom = fields.drinkFrom;
  const drinkTo = fields.drinkTo;
  for (const year of [drinkFrom, drinkTo]) {
    if (year == null) continue;
    if (!isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      return { error: `A drink year is between ${MIN_YEAR} and ${MAX_YEAR}.` };
    }
  }
  if (drinkFrom != null && drinkTo != null && drinkTo < drinkFrom) {
    // The old form's message, kept verbatim.
    return { error: "Drink-to year can't be before drink-from." };
  }

  return {
    quantity,
    bottleSizeMl,
    pricePerBottle: price ?? null,
    currency,
    purchasedOn,
    purchaseSource: trimmedOrNull(fields.purchaseSource),
    drinkFrom: drinkFrom ?? null,
    drinkTo: drinkTo ?? null,
    storageLocation: trimmedOrNull(fields.storageLocation),
    lotNote: trimmedOrNull(fields.lotNote),
  };
}

/** The sheet's own read: the viewer's lot, or null (refinement 21). */
export async function loadLotSheet(lotId: string): Promise<LotSheetData | null> {
  if (!UUID.test(lotId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return getLotSheet(supabase, lotId, user.id);
}

/** Save the Edit lot fields. `null` on success, `{ error }` to show. */
export async function updateLot(
  lotId: string,
  fields: LotFields,
): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SIGNED_OUT };
  if (!UUID.test(lotId)) return { error: "That lot is not in your cellar." };

  const checked = validateLotFields(fields);
  if ("error" in checked) return checked;

  const { error } = await supabase
    .from("cellar_lots")
    .update({
      quantity: checked.quantity,
      bottle_size_ml: checked.bottleSizeMl,
      price_per_bottle: checked.pricePerBottle,
      currency: checked.currency,
      purchased_on: checked.purchasedOn,
      purchase_source: checked.purchaseSource,
      drink_from: checked.drinkFrom,
      drink_to: checked.drinkTo,
      storage_location: checked.storageLocation,
      lot_note: checked.lotNote,
    })
    .eq("id", lotId)
    .eq("owner_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/cellar");
  return null;
}

/** Add bottles to a lot: `quantity` and `purchased_quantity` both +n, through
 *  the existing owner-checked helper. */
export async function addBottles(
  lotId: string,
  n: number,
): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SIGNED_OUT };
  if (!UUID.test(lotId)) return { error: "That lot is not in your cellar." };
  if (!isInteger(n) || n < 1 || n > 999) {
    return { error: "Add between 1 and 999 bottles." };
  }

  try {
    await increaseCellarLotQuantity(lotId, n);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Couldn't add those bottles.",
    };
  }

  revalidatePath("/cellar");
  return null;
}

/** Remove a lot outright (refinement 4 — the sheet's destructive action,
 *  behind the console's inline two-tap, never a `window.confirm`). */
export async function deleteLot(
  lotId: string,
): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SIGNED_OUT };
  if (!UUID.test(lotId)) return { error: "That lot is not in your cellar." };

  const { error } = await supabase
    .from("cellar_lots")
    .delete()
    .eq("id", lotId)
    .eq("owner_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/cellar");
  return null;
}

/**
 * D1 / refinement 3: fold every spelling of a place into one.
 *
 * `from` is the list of exact stored spellings the merge notice offered, so
 * one "Merge them" tap merges them all; `to` is the spelling to keep. The
 * owner's lots only, and `merged` is how many rows actually changed.
 */
export async function mergeStorageLocations(
  from: readonly string[],
  to: string,
): Promise<{ error: string } | { merged: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SIGNED_OUT };

  const target = trimmedOrNull(to);
  if (!target) return { error: "Pick a place to merge into." };
  const sources = from.filter(
    (s): s is string => typeof s === "string" && s.trim() !== "",
  );
  if (sources.length === 0) return { error: "Nothing to merge." };

  const { data, error } = await supabase
    .from("cellar_lots")
    .update({ storage_location: target })
    .eq("owner_id", user.id)
    .in("storage_location", sources)
    .select("id");
  if (error) return { error: error.message };

  revalidatePath("/cellar");
  return { merged: (data ?? []).length };
}

/**
 * The tasting the drink sheet offers as a "what for" chip (spec §5.6): the
 * viewer's own LIVE tasting that is running now, as host or as a JOINED
 * participant, newest first. `null` when there is none.
 */
export async function getLiveTastingName(): Promise<{
  id: string;
  name: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("tasting_participants")
    .select("tasting_id")
    .eq("user_id", user.id)
    .eq("status", "JOINED");
  const joinedIds = (memberships ?? []).map((m) => m.tasting_id);

  const running: Array<{ id: string; name: string; created_at: string }> = [];
  const { data: hosted } = await supabase
    .from("tastings")
    .select("id, name, created_at")
    .eq("status", "IN_PROGRESS")
    .eq("timing_mode", "LIVE")
    .eq("host_id", user.id);
  running.push(...(hosted ?? []));

  if (joinedIds.length > 0) {
    const { data: joined } = await supabase
      .from("tastings")
      .select("id, name, created_at")
      .eq("status", "IN_PROGRESS")
      .eq("timing_mode", "LIVE")
      .in("id", joinedIds);
    running.push(...(joined ?? []));
  }

  // The host's own tasting appears in both reads (the host row is always a
  // JOINED participant), so the newest distinct one wins.
  const byId = new Map<string, { id: string; name: string; created_at: string }>();
  for (const t of running) byId.set(t.id, t);
  const newest = [...byId.values()].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )[0];
  return newest ? { id: newest.id, name: newest.name } : null;
}
