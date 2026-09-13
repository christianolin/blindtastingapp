"use server";

// B6 host pacing: Pause and Skip (spec §7.3 items 2-3; Q1). Every pacing rule
// lives in src/lib/pacing-guards.ts — this file only reads the state that
// rule needs and applies what it decides.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { skipPlan } from "@/lib/pacing-guards";
import type { PointerGlass } from "@/lib/pour-pointer";
import { createClient } from "@/lib/supabase/server";
import type { RevealMode, TastingStatus, TimingMode } from "@/lib/supabase/database.types";

type Client = Awaited<ReturnType<typeof createClient>>;

type PacingResult = { error: string } | null;

type HostTasting = {
  status: TastingStatus;
  timing_mode: TimingMode;
  paused_at: string | null;
  current_wine_id: string | null;
  reveal_mode: RevealMode;
};

// Signs the caller in and confirms they host this tasting, reading everything
// both actions below need in one round trip. Null when they don't host it —
// the caller supplies its own "only the host can …" copy.
async function requireHostTasting(
  supabase: Client,
  tastingId: string,
): Promise<HostTasting | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasting } = await supabase
    .from("tastings")
    .select("host_id, status, timing_mode, paused_at, current_wine_id, reveal_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting || tasting.host_id !== user.id) return null;
  return tasting;
}

// Host-only Pause / Resume toggle. Q1: LIVE tastings only, and only while
// running — belt and braces alongside M7's tastings_pause_follows_status
// trigger, which clears any pause the moment either stops being true.
export async function setTastingPaused(
  tastingId: string,
  paused: boolean,
): Promise<PacingResult> {
  const supabase = await createClient();
  const tasting = await requireHostTasting(supabase, tastingId);
  if (!tasting) return { error: "Only the host can pause this tasting." };
  if (tasting.status !== "IN_PROGRESS") {
    return { error: "The tasting is not running." };
  }
  if (tasting.timing_mode !== "LIVE") {
    return { error: "Pause is for live tastings." };
  }

  const { error } = await supabase
    .from("tastings")
    .update({ paused_at: paused ? new Date().toISOString() : null })
    .eq("id", tastingId);
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/host`);
  return null;
}

// Host-only "Skip to glass N →" (B6). skipPlan holds every pacing rule; this
// only reads the wines in list order plus the pointer and applies whatever
// it decides — a compare-and-set write when there's a target, nothing when
// there's an error or nothing to skip to (double tap = no-op).
export async function skipToGlass(
  tastingId: string,
  fromWineId: string,
): Promise<PacingResult> {
  const supabase = await createClient();
  const tasting = await requireHostTasting(supabase, tastingId);
  if (!tasting) return { error: "Only the host can skip a glass." };

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

  const plan = skipPlan({
    status: tasting.status,
    paused: tasting.paused_at !== null,
    glasses,
    pointer: tasting.current_wine_id,
    fromWineId,
    revealMode: tasting.reveal_mode,
  });
  if (plan === null) return null;
  if ("error" in plan) return plan;

  const write = supabase
    .from("tastings")
    .update({ current_wine_id: plan.targetId })
    .eq("id", tastingId);
  const { error } =
    plan.expectPointer === null
      ? await write.is("current_wine_id", null)
      : await write.eq("current_wine_id", plan.expectPointer);
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/host`);
  return null;
}
