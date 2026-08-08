"use server";

import { createClient } from "@/lib/supabase/server";
import { isContributor } from "@/lib/auth/roles";

// The estimated price is wine-level shared data (it values every cellar that
// holds the wine), so correcting it is a curator action — enforced here, not
// just hidden in the UI. The catalog audit trigger records the change.
export async function updateWineEstimatedPrice(
  wineId: string,
  price: number | null,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  if (!(await isContributor(supabase, user.id))) {
    throw new Error("Only contributors and admins can edit the estimated price.");
  }
  if (price != null && (!Number.isFinite(price) || price < 0 || price > 1_000_000)) {
    throw new Error("Enter a price in DKK (or clear the field).");
  }
  const { error } = await supabase
    .from("catalog_wines")
    .update({ estimated_price: price })
    .eq("id", wineId);
  if (error) throw new Error(error.message);
}
