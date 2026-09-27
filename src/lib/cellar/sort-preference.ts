// The cellar list's saved sort (spec docs/superpowers/specs/2026-09-27-cellar-sort-memory.md
// C3, C5, C6): one `user_preferences` row per person, owner-only. The server
// pages read the VIEWER's own row with `readCellarSort` and hand it to
// `resolveCellarSort` (./cellar-rows); `saveCellarSort` (a "use server" action)
// writes it with `writeCellarSort`.
//
// Why update-then-insert and not a PostgREST upsert: the client may UPDATE
// cellar_sort only (C3), and a PostgREST upsert's ON CONFLICT DO UPDATE SET
// lists every payload column, the conflict column included, so `.upsert({
// user_id, cellar_sort }, { onConflict: "user_id" })` would be refused for
// want of UPDATE on user_id (the same trap 20260912093000_guesses_client_columns
// documents). The result is the same upsert, in two statements at most.
//
// Both helpers take the caller's Supabase client, so they run under the
// viewer's RLS. Otherwise pure: type-only imports apart from ./cellar-rows, so
// vitest loads it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CellarSortPreference, Database } from "../supabase/database.types";
import { isSortKey } from "./cellar-rows";
import type { SaveCellarSortResult } from "./types";

export const CELLAR_SORT_INVALID = "That is not a cellar sort.";
const NOT_SAVED = "The cellar sort was not saved.";

/** The viewer's saved sort, or null when there is none — and on any error
 *  (a missing table, a failed request): a lost preference never breaks the
 *  page, the list just opens on newest added. */
export async function readCellarSort(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CellarSortPreference | null> {
  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("cellar_sort")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data.cellar_sort;
  } catch {
    return null;
  }
}

/** Saves `sort` on the viewer's own row: update it; when there is no row yet,
 *  insert one; when a second tab inserted it in between (unique key, 23505),
 *  update again. An unknown key is refused before any write. */
export async function writeCellarSort(
  supabase: SupabaseClient<Database>,
  userId: string,
  sort: unknown,
): Promise<SaveCellarSortResult> {
  if (!isSortKey(sort)) return { error: CELLAR_SORT_INVALID };
  const update = () =>
    supabase
      .from("user_preferences")
      .update({ cellar_sort: sort })
      .eq("user_id", userId)
      .select("user_id");
  try {
    const first = await update();
    if (first.error) return { error: first.error.message };
    if (first.data.length > 0) return { ok: true };

    const inserted = await supabase
      .from("user_preferences")
      .insert({ user_id: userId, cellar_sort: sort });
    if (!inserted.error) return { ok: true };
    if (inserted.error.code !== "23505") return { error: inserted.error.message };

    const retry = await update();
    if (retry.error) return { error: retry.error.message };
    return retry.data.length > 0 ? { ok: true } : { error: NOT_SAVED };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
