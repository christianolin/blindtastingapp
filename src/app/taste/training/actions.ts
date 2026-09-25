"use server";

// The training room's server actions (training-room spec §6.5): thin wrappers
// over record_training_attempt and the history reads. Nothing here writes a
// table directly — no client role can write training_attempts (D14). The
// input is checked again on the server (attemptPayload / revealPayload) and a
// refusal from the RPC comes back verbatim. Types live in the plain module
// src/lib/training/action-types.ts: this file exports only async functions.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type {
  FinishInput,
  FinishResult,
  HistoryCursor,
  HistoryPage,
  TrainingAttemptDetail,
} from "@/lib/training/action-types";
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
