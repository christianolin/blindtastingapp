"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RevealActionState = { error: string } | null;

async function tastingIdForWine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  wineId: string,
) {
  const { data } = await supabase
    .from("wines")
    .select("tasting_id")
    .eq("id", wineId)
    .maybeSingle();
  return data?.tasting_id ?? null;
}

// Guided progressive reveal: advance the shared reveal one category. The RPC
// derives host/owner-ship and guards CLOSED itself; expected_step gives
// compare-and-set so a double tap can't skip two.
export async function revealNextCategory(
  _prev: RevealActionState,
  formData: FormData,
): Promise<RevealActionState> {
  const wineId = String(formData.get("wine_id") ?? "");
  const expectedStep = Number(formData.get("expected_step") ?? 0);
  const supabase = await createClient();
  const tastingId = await tastingIdForWine(supabase, wineId);
  if (!tastingId) return { error: "Wine not found." };
  const { error } = await supabase.rpc("reveal_next_category", {
    p_wine_id: wineId,
    p_expected_step: expectedStep,
  });
  if (error) return { error: error.message };
  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return null;
}

// Skip to the full answer (reuses reveal_wine; the wines trigger squares up
// reveal_step so reveal_next_category can't advance afterwards).
export async function revealFull(
  _prev: RevealActionState,
  formData: FormData,
): Promise<RevealActionState> {
  const wineId = String(formData.get("wine_id") ?? "");
  const supabase = await createClient();
  const tastingId = await tastingIdForWine(supabase, wineId);
  if (!tastingId) return { error: "Wine not found." };
  const { error } = await supabase.rpc("reveal_wine", { p_wine_id: wineId });
  if (error) return { error: error.message };
  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return null;
}
