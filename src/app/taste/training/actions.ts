"use server";

// The training room's server actions (training-room spec §6.5): thin wrappers
// over record_training_attempt and the history reads. No client role can
// write training_attempts (D14); the one direct write here is deleting a
// session's own tasting note, under "wset notes delete" (author only), which
// takes the attempt with it (training_attempts.note_id … on delete cascade).
// The input is checked again on the server (attemptPayload / revealPayload)
// and a refusal from the RPC comes back verbatim. Types live in the plain module
// src/lib/training/action-types.ts: this file exports only async functions.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type {
  DeleteSessionResult,
  FinishInput,
  FinishResult,
  HistoryCursor,
  HistoryPage,
  TrainingAttemptDetail,
} from "@/lib/training/action-types";
import { TRAINING_COPY } from "@/lib/training/copy";
import {
  SAVE_REFUSED,
  attemptPayload,
  finishResultFromRpc,
  isHistoryCursor,
  isUuid,
  revealPayload,
} from "@/lib/training/attempt-payload";
import { readTrainingAttemptDetail, readTrainingHistory } from "@/lib/training/pool";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

// The room's history and the notes archive (a revealed training note appears there).
function refresh() {
  revalidatePath("/taste/training");
  revalidatePath("/taste/notes");
}

export async function finishTrainingSession(input: FinishInput): Promise<FinishResult> {
  const session = await signedIn();
  if (!session) return { error: SAVE_REFUSED };
  const payload = attemptPayload(input);
  if ("error" in payload) return payload;
  const { data, error } = await session.supabase.rpc("record_training_attempt", {
    p_note: input.note as unknown as Json,
    p_aromas: input.aromas as unknown as Json,
    p_attempt: payload.attempt as unknown as Json,
  });
  if (error) return { error: error.message };
  refresh();
  return finishResultFromRpc(data as unknown);
}

export async function revealTrainingAttempt(
  attemptId: string,
  catalogWineId: string,
): Promise<FinishResult> {
  const session = await signedIn();
  if (!session) return { error: SAVE_REFUSED };
  const payload = revealPayload(attemptId, catalogWineId);
  if ("error" in payload) return payload;
  // A re-reveal ignores p_note and p_aromas entirely (spec §6.2 step 3).
  const { data, error } = await session.supabase.rpc("record_training_attempt", {
    p_note: {} as unknown as Json,
    p_aromas: [] as unknown as Json,
    p_attempt: payload.attempt as unknown as Json,
  });
  if (error) return { error: error.message };
  refresh();
  return finishResultFromRpc(data as unknown);
}

export async function loadMoreTrainingHistory(cursor: HistoryCursor): Promise<HistoryPage> {
  const session = await signedIn();
  if (!session || !isHistoryCursor(cursor)) return { rows: [], nextCursor: null };
  return readTrainingHistory(session.supabase, session.userId, cursor);
}

export async function loadTrainingAttempt(attemptId: string): Promise<TrainingAttemptDetail | null> {
  const session = await signedIn();
  if (!session || !isUuid(attemptId)) return null;
  return readTrainingAttemptDetail(session.supabase, session.userId, attemptId);
}

/**
 * Deletes one of your own sessions (owner, 2026-09-27): its tasting note goes,
 * and the attempt goes with it through the note_id cascade. Revealed or not.
 * A database refusal the taster can act on (42501, e.g. a Rule 1 guard) comes
 * back verbatim; anything else reads "Not deleted. Try again."
 */
export async function deleteTrainingSession(attemptId: string): Promise<DeleteSessionResult> {
  const session = await signedIn();
  if (!session || !isUuid(attemptId)) return { error: TRAINING_COPY.deleteSessionFailed };
  const { data: attempt, error: readError } = await session.supabase
    .from("training_attempts")
    .select("note_id")
    .eq("id", attemptId)
    .eq("author_id", session.userId)
    .maybeSingle();
  if (readError || !attempt) return { error: TRAINING_COPY.deleteSessionFailed };
  const { data: gone, error } = await session.supabase
    .from("wset_notes")
    .delete()
    .eq("id", attempt.note_id)
    .eq("author_id", session.userId)
    .select("id");
  if (error) return { error: error.code === "42501" ? error.message : TRAINING_COPY.deleteSessionFailed };
  if (!gone || gone.length === 0) return { error: TRAINING_COPY.deleteSessionFailed };
  refresh();
  return { ok: true };
}
