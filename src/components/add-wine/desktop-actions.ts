"use server";

import { createClient } from "@/lib/supabase/server";
import { cellarSummary, type CellarSummary } from "./desktop-format";

const EMPTY: CellarSummary = { bottles: 0, readyToDrink: 0 };

/**
 * The 7h "From my cellar" tile: bottles in stock and how many are in an open
 * drink window this year. One owner-scoped read of cellar_lots (RLS already
 * limits the table to the caller's own lots) — `listMyCellarLots` carries no
 * drink window, so this reads the three columns it needs directly.
 */
export async function getCellarSummary(): Promise<CellarSummary> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;
  const { data } = await supabase
    .from("cellar_lots")
    .select("quantity, drink_from, drink_to")
    .eq("owner_id", user.id)
    .gt("quantity", 0);
  return cellarSummary(data ?? [], new Date().getUTCFullYear());
}
