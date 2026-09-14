"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { glassesNeedingNotes } from "@/lib/flight-csv";

// New per-concern "use server" file for the record's footer actions
// (refinement 2; spec §11.3 item 16, Q5): split out of ./actions.ts so this
// track doesn't queue on the lifecycle file.

/**
 * "Save all {n} to my ratings" (Q5): one minimal `wset_notes` row per fully
 * revealed glass this taster has no note on yet — CLOSED only, host or a
 * JOINED participant. `glassesNeedingNotes` (`flight-csv.ts`) is the same
 * pure rule the export route's data loader would use, so a second tap (or a
 * second tab) after everything is already saved inserts nothing rather than
 * erroring. Each note is minimal: `taster_notes` and every WSET scale
 * default their own way (empty string, all-null), `context_kind: "BLIND"`
 * and `tasting_wine_id` mark it as coming from a tasting glass rather than a
 * freestanding note — the archive shows these as Unfinished (R-ledger Q6)
 * until the taster opens one and actually rates it.
 *
 * M5's "wset notes insert" policy is what actually allows this: it accepts
 * an identity-bearing note (`num_nonnulls(catalog_wine_id,
 * unidentified_wine_id) = 1`, which every fully revealed glass's
 * `wine_answers` row already satisfies) from the host or a JOINED
 * participant of that glass's tasting (`can_note_tasting_wine`) — this
 * action does the same read the policy will re-check, only to build the row
 * list and the read-back count, not to bypass it.
 */
export async function saveAllToRatings(
  tastingId: string,
): Promise<{ saved: number; total: number } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to save these to your ratings." };

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, status, scheduled_at, finished_at")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };
  if (tasting.status !== "CLOSED") {
    return { error: "This tasting has not finished yet." };
  }

  const isHost = tasting.host_id === user.id;
  if (!isHost) {
    const { data: participant } = await supabase
      .from("tasting_participants")
      .select("status")
      .eq("tasting_id", tastingId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (participant?.status !== "JOINED") {
      return { error: "Join this tasting to save its wines to your ratings." };
    }
  }

  const { data: wineRows } = await supabase
    .from("wines")
    .select("id, is_revealed")
    .eq("tasting_id", tastingId);
  const revealedWineIds = (wineRows ?? []).filter((w) => w.is_revealed).map((w) => w.id);
  if (revealedWineIds.length === 0) return { saved: 0, total: 0 };

  const [{ data: answerRows }, { data: existingNotes }] = await Promise.all([
    supabase
      .from("wine_answers")
      .select("wine_id, catalog_wine_id, unidentified_wine_id")
      .in("wine_id", revealedWineIds),
    supabase
      .from("wset_notes")
      .select("tasting_wine_id")
      .eq("author_id", user.id)
      .in("tasting_wine_id", revealedWineIds),
  ]);

  const notedWineIds = new Set(
    (existingNotes ?? [])
      .map((n) => n.tasting_wine_id)
      .filter((id): id is string => Boolean(id)),
  );
  const toSave = glassesNeedingNotes(revealedWineIds, notedWineIds);
  if (toSave.length === 0) return { saved: 0, total: revealedWineIds.length };

  const answerByWineId = new Map((answerRows ?? []).map((a) => [a.wine_id, a]));
  // The local date of finished_at, else scheduled_at, else now — there is no
  // viewer clock available to a server action, so this follows the same
  // toISOString().slice(0, 10) convention a brand new note already defaults
  // to (`src/lib/wset/note-state.ts`).
  const tastedOn = (tasting.finished_at ?? tasting.scheduled_at ?? new Date().toISOString()).slice(
    0,
    10,
  );

  const rows = toSave
    .map((wineId) => {
      const answer = answerByWineId.get(wineId);
      if (!answer) return null;
      return {
        author_id: user.id,
        catalog_wine_id: answer.catalog_wine_id,
        unidentified_wine_id: answer.unidentified_wine_id,
        context_kind: "BLIND" as const,
        tasting_wine_id: wineId,
        tasted_on: tastedOn,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (rows.length === 0) return { saved: 0, total: revealedWineIds.length };

  const { error } = await supabase.from("wset_notes").insert(rows);
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/results`);
  revalidatePath("/taste/notes");

  return { saved: rows.length, total: revealedWineIds.length };
}
