"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { timePhase } from "@/lib/reveal-timing";
import { PAUSED_REFUSAL, stepRevealApplies } from "@/lib/console-copy";
import { revealStepRefusal } from "@/lib/pacing-guards";
import type { PointerGlass } from "@/lib/pour-pointer";
import { revealRefusal } from "@/lib/wine-identity/incomplete";
import { listIncompleteGlasses } from "@/lib/wine-identity/server/incomplete-glasses";

export type RevealActionState = { error: string } | null;

type Client = Awaited<ReturnType<typeof createClient>>;

async function tastingIdForWine(supabase: Client, wineId: string) {
  const { data } = await supabase
    .from("wines")
    .select("tasting_id")
    .eq("id", wineId)
    .maybeSingle();
  return data?.tasting_id ?? null;
}

// The database error text raised by M7's wines_refuse_reveal_while_paused
// when a pause commits between this action's own check and the RPC call
// (BT-SQL7; plan refinement 25).
function mapPausedError(message: string): string {
  return message === "The tasting is paused" ? PAUSED_REFUSAL : message;
}

// Q1 + Q8: paused refuses every reveal; guided LIVE blind accepts a step
// reveal only on the glass the pour pointer is currently on
// (`revealStepRefusal`, BT-P3's `currentGlass`) — never the lowest unrevealed
// glass, so a Skip that moved the pointer is honoured.
async function pacingRefusal(
  supabase: Client,
  tastingId: string,
  wineId: string,
): Promise<string | null> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("reveal_mode, timing_mode, sequential_guessing, paused_at, current_wine_id")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return null;
  const { data: wines } = await supabase
    .from("wines")
    .select("id, is_revealed, reveal_step")
    .eq("tasting_id", tastingId)
    .order("position");
  const glasses: PointerGlass[] = (wines ?? []).map((w) => ({
    id: w.id,
    isRevealed: w.is_revealed,
    revealStep: w.reveal_step,
  }));
  return revealStepRefusal({
    guided: stepRevealApplies({
      revealMode: tasting.reveal_mode,
      timingMode: tasting.timing_mode,
      sequentialGuessing: tasting.sequential_guessing,
    }),
    paused: tasting.paused_at !== null,
    glasses,
    pointer: tasting.current_wine_id,
    wineId,
  });
}

// An incomplete glass (no answer key yet) is never revealed (spec §C.8):
// "Finish glass 3's details before revealing". listIncompleteGlasses throws on
// an RPC error so a failed read never passes for "every glass is complete"; the
// failure refuses here too, returned inline rather than thrown into the error
// boundary.
async function incompleteGlassError(
  supabase: Client,
  tastingId: string,
  wineId: string,
): Promise<string | null> {
  try {
    return revealRefusal(await listIncompleteGlasses(supabase, tastingId), wineId);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
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
  const refusal = await pacingRefusal(supabase, tastingId, wineId);
  if (refusal) return { error: refusal };
  const incomplete = await timePhase("action: tasting_incomplete_glasses rpc", () =>
    incompleteGlassError(supabase, tastingId, wineId),
  );
  if (incomplete) return { error: incomplete };
  // Supabase's builder is a thenable, not a Promise, so it needs the async
  // wrapper for timePhase's signature.
  const { error } = await timePhase("action: reveal_next_category rpc", async () =>
    supabase.rpc("reveal_next_category", {
      p_wine_id: wineId,
      p_expected_step: expectedStep,
    }),
  );
  if (error) return { error: mapPausedError(error.message) };
  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return null;
}

// Skip to the full answer (reuses reveal_wine; the wines trigger squares up
// reveal_step so reveal_next_category can't advance afterwards). A CLOSED
// tasting is refused with the sentence revealWine uses (entry-2); reveal_wine
// also refuses it itself since 20260912092000, but with a raw RPC message.
export async function revealFull(
  _prev: RevealActionState,
  formData: FormData,
): Promise<RevealActionState> {
  const wineId = String(formData.get("wine_id") ?? "");
  const supabase = await createClient();
  const tastingId = await tastingIdForWine(supabase, wineId);
  if (!tastingId) return { error: "Wine not found." };
  const { data: tasting } = await supabase
    .from("tastings")
    .select("status, paused_at")
    .eq("id", tastingId)
    .maybeSingle();
  if (tasting?.status === "CLOSED") {
    return { error: "This tasting is finished — reveals are closed." };
  }
  // Q1: no reveal while the host has paused. revealFull isn't glass-specific
  // like revealStepRefusal — a pause is enough, whichever glass this is.
  if (tasting?.paused_at) {
    return { error: PAUSED_REFUSAL };
  }
  const incomplete = await incompleteGlassError(supabase, tastingId, wineId);
  if (incomplete) return { error: incomplete };
  const { error } = await supabase.rpc("reveal_wine", { p_wine_id: wineId });
  if (error) return { error: mapPausedError(error.message) };
  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return null;
}
