"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";

// Auto-reveals a wine once every participant who's supposed to guess it has
// submitted, so an ASYNC host doesn't have to babysit "has everyone
// answered?". LIVE tastings are NEVER auto-revealed — the host paces the
// reveal manually with the Reveal button. Skips silently on any lookup
// failure; a missed auto-reveal just means the host reveals manually.
async function maybeAutoRevealWine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  wineId: string,
) {
  const { data: wine } = await supabase
    .from("wines")
    .select("tasting_id, is_revealed, contributor_participant_id")
    .eq("id", wineId)
    .maybeSingle();
  if (!wine || wine.is_revealed) return;

  const { data: tasting } = await supabase
    .from("tastings")
    .select("timing_mode")
    .eq("id", wine.tasting_id)
    .maybeSingle();
  if (!tasting || tasting.timing_mode !== "ASYNC") return;

  const { count: eligibleCount } = await supabase
    .from("tasting_participants")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", wine.tasting_id)
    .eq("status", "JOINED")
    .neq(
      "id",
      wine.contributor_participant_id ?? "00000000-0000-0000-0000-000000000000",
    );

  if (!eligibleCount || eligibleCount <= 0) return;

  const { count: guessCount } = await supabase
    .from("guesses")
    .select("id", { count: "exact", head: true })
    .eq("wine_id", wineId);

  if ((guessCount ?? 0) >= eligibleCount) {
    await supabase.rpc("reveal_wine", { p_wine_id: wineId });
  }
}

export type GuessFormState = { error: string } | { success: true } | null;

// Resolves the caller's participant row and enforces that they may guess:
// they must be a JOINED participant and the tasting must have started (host
// pressed Start → status left 'DRAFT'). Returns the participant id or an
// error message.
async function resolveGuesser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tastingId: string,
  userId: string,
): Promise<{ participantId: string } | { error: string }> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("status")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };
  if (tasting.status === "DRAFT") {
    return { error: "The host hasn't started this tasting yet." };
  }

  const { data: participant } = await supabase
    .from("tasting_participants")
    .select("id, status")
    .eq("tasting_id", tastingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!participant) {
    return { error: "You're not a participant in this tasting." };
  }
  if (participant.status !== "JOINED") {
    return { error: "Accept your invitation before guessing." };
  }
  return { participantId: participant.id };
}

export async function submitGuess(
  _prevState: GuessFormState,
  formData: FormData,
): Promise<GuessFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tastingId = String(formData.get("tasting_id") ?? "");
  const wineId = String(formData.get("wine_id") ?? "");

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };
  const participant = { id: guesser.participantId };

  // "One wine at a time" pacing: only the current (lowest-position unrevealed)
  // wine may be guessed.
  const { data: seqTasting } = await supabase
    .from("tastings")
    .select("sequential_guessing, reveal_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (seqTasting?.sequential_guessing && seqTasting.reveal_mode === "BLIND") {
    const { data: current } = await supabase
      .from("wines")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("is_revealed", false)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (current && current.id !== wineId) {
      return { error: "Guess the wines in order — earlier wines come first." };
    }
  }

  const get = (name: string) => String(formData.get(name) ?? "") || null;
  const vintageKind = (get("vintage_kind") as VintageKind | null) ?? null;
  const vintageYearRaw = get("vintage_year");
  const vintageTawnyYearsRaw = get("vintage_tawny_years");

  const payload = {
    wine_id: wineId,
    participant_id: participant.id,
    country_id: get("country_id"),
    region_id: get("region_id"),
    appellation_id: get("appellation_id"),
    primary_grape_id: get("primary_grape_id"),
    secondary_grape_id: get("secondary_grape_id"),
    producer_id: get("producer_id"),
    type_designation_id: get("type_designation_id"),
    vintage_kind: vintageKind,
    vintage_year: vintageKind === "YEAR" && vintageYearRaw ? parseInt(vintageYearRaw, 10) : null,
    vintage_tawny_years:
      vintageKind === "TAWNY" && vintageTawnyYearsRaw
        ? parseInt(vintageTawnyYearsRaw, 10)
        : null,
  };

  const { data: existing } = await supabase
    .from("guesses")
    .select("id, scored_at")
    .eq("wine_id", wineId)
    .eq("participant_id", participant.id)
    .maybeSingle();

  // Once a guess has been scored (immediate-reveal async, or a revealed wine)
  // it's locked — you've already seen the answer, no re-guessing.
  if (existing?.scored_at) {
    return { error: "This guess is locked — it's already been scored." };
  }

  const { error } = existing
    ? await supabase.from("guesses").update(payload).eq("id", existing.id)
    : await supabase.from("guesses").insert(payload);

  if (error) {
    return { error: error.message };
  }

  // Immediate-reveal async: score this guess now so the guesser sees their
  // result right away (no-op for every other mode). Then the usual auto-reveal
  // fires once everyone has guessed.
  await supabase.rpc("score_own_guess", { p_wine_id: wineId });
  await maybeAutoRevealWine(supabase, wineId);

  revalidatePath(`/tastings/${tastingId}/play`);
  revalidatePath(`/tastings/${tastingId}/results`);
  return { success: true };
}

// Semi-blind matching is submitted as one batch (every still-hidden glass
// paired to a candidate at once), not per-glass — see match-guess-form.tsx
// for why partial submission doesn't make sense here.
export async function submitAllMatchGuesses(
  _prevState: GuessFormState,
  formData: FormData,
): Promise<GuessFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tastingId = String(formData.get("tasting_id") ?? "");
  let guessesByWineId: Record<string, string>;
  try {
    guessesByWineId = JSON.parse(String(formData.get("guesses") ?? "{}"));
  } catch {
    return { error: "Malformed submission." };
  }

  const wineIds = Object.keys(guessesByWineId);
  if (wineIds.length === 0) {
    return { error: "No glasses to match." };
  }
  if (wineIds.some((id) => !guessesByWineId[id])) {
    return { error: "Match every glass before submitting." };
  }

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };
  const participant = { id: guesser.participantId };

  const { data: existingGuesses } = await supabase
    .from("guesses")
    .select("id, wine_id, scored_at")
    .eq("participant_id", participant.id)
    .in("wine_id", wineIds);
  const existingByWineId = new Map(
    (existingGuesses ?? []).map((g) => [g.wine_id, g]),
  );

  for (const wineId of wineIds) {
    const existing = existingByWineId.get(wineId);
    // Skip glasses whose match is already locked in (scored).
    if (existing?.scored_at) continue;
    const payload = {
      wine_id: wineId,
      participant_id: participant.id,
      guessed_wine_id: guessesByWineId[wineId],
    };
    const { error } = existing
      ? await supabase.from("guesses").update(payload).eq("id", existing.id)
      : await supabase.from("guesses").insert(payload);
    if (error) {
      return { error: error.message };
    }
  }

  for (const wineId of wineIds) {
    await supabase.rpc("score_own_guess", { p_wine_id: wineId });
    await maybeAutoRevealWine(supabase, wineId);
  }

  revalidatePath(`/tastings/${tastingId}/play`);
  revalidatePath(`/tastings/${tastingId}/results`);
  return { success: true };
}

export type RevealFormState = { error: string } | null;

export async function revealWine(
  _prevState: RevealFormState,
  formData: FormData,
): Promise<RevealFormState> {
  const tastingId = String(formData.get("tasting_id") ?? "");
  const wineId = String(formData.get("wine_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reveal_wine", { p_wine_id: wineId });
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/tastings/${tastingId}/play`);
  revalidatePath(`/tastings/${tastingId}/results`);
  return null;
}
