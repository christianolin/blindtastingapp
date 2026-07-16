"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";

// Auto-reveals a wine once every participant who's supposed to guess it has
// submitted — so the host doesn't have to babysit "has everyone answered?"
// during live play. Skips silently on any lookup failure; a missed
// auto-reveal just means the host reveals manually, same as before this
// existed.
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

  const { data: participant } = await supabase
    .from("tasting_participants")
    .select("id")
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!participant) {
    return { error: "You're not a participant in this tasting." };
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
    .select("id")
    .eq("wine_id", wineId)
    .eq("participant_id", participant.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("guesses").update(payload).eq("id", existing.id)
    : await supabase.from("guesses").insert(payload);

  if (error) {
    return { error: error.message };
  }

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

  const { data: participant } = await supabase
    .from("tasting_participants")
    .select("id")
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!participant) {
    return { error: "You're not a participant in this tasting." };
  }

  const { data: existingGuesses } = await supabase
    .from("guesses")
    .select("id, wine_id")
    .eq("participant_id", participant.id)
    .in("wine_id", wineIds);
  const existingIdByWineId = new Map(
    (existingGuesses ?? []).map((g) => [g.wine_id, g.id]),
  );

  for (const wineId of wineIds) {
    const payload = {
      wine_id: wineId,
      participant_id: participant.id,
      guessed_wine_id: guessesByWineId[wineId],
    };
    const existingId = existingIdByWineId.get(wineId);
    const { error } = existingId
      ? await supabase.from("guesses").update(payload).eq("id", existingId)
      : await supabase.from("guesses").insert(payload);
    if (error) {
      return { error: error.message };
    }
  }

  for (const wineId of wineIds) {
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
