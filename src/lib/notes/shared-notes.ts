// The reads behind other people's notes (sharing-defaults spec 2026-09-27
// S16, S19, §7.2, §7.3). Every read runs as the viewer, so the "wset notes
// read" policy decides what comes back: the author's setting, the Rule 1
// hold and the pour link, and the reader's own "catalog read". The shaping is
// pure, in ./shared-notes-view.ts. A failed read returns null and the caller
// hides the section: never a claim that someone has no notes.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  NOTES_FETCHED,
  OTHERS_NOTE_SELECT,
  PROFILE_NOTE_SELECT,
  toOthersNoteRows,
  toProfileNoteRows,
  type OthersNoteRow,
  type ProfileNoteRow,
  type RawOthersNote,
  type RawProfileNote,
} from "./shared-notes-view";

type Client = SupabaseClient<Database>;

export type SharedNotesResult<Row> = { rows: Row[]; fetched: number };

/** "Notes from others" on a wine's page: everyone's but the viewer's, newest first, at most 50. */
export async function getOthersNotesForWine(
  supabase: Client,
  wineId: string,
  viewerId: string,
): Promise<SharedNotesResult<OthersNoteRow> | null> {
  const { data, error } = await supabase
    .from("wset_notes")
    .select(OTHERS_NOTE_SELECT)
    .eq("catalog_wine_id", wineId)
    .neq("author_id", viewerId)
    .order("tasted_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTES_FETCHED);
  if (error) {
    console.error("[shared-notes] others' notes read failed", error.code, error.message);
    return null;
  }
  const raws = (data ?? []) as unknown as RawOthersNote[];
  return { rows: toOthersNoteRows(raws, wineId), fetched: raws.length };
}

/** A person's identified notes as the viewer may read them; `own` adds the held tags. */
export async function getProfileNotes(
  supabase: Client,
  profileId: string,
  { own }: { own: boolean },
): Promise<SharedNotesResult<ProfileNoteRow> | null> {
  const { data, error } = await supabase
    .from("wset_notes")
    .select(PROFILE_NOTE_SELECT)
    .eq("author_id", profileId)
    .not("catalog_wine_id", "is", null)
    .order("tasted_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTES_FETCHED);
  if (error) {
    console.error("[shared-notes] profile notes read failed", error.code, error.message);
    return null;
  }
  const raws = (data ?? []) as unknown as RawProfileNote[];
  const held = own ? await getMyHeldNoteIds(supabase, raws.map((r) => r.id)) : new Set<string>();
  return { rows: toProfileNoteRows(raws, held), fetched: raws.length };
}

/** Which of these are the viewer's own notes others cannot read yet (S19).
    Informational only: a failed read tags nothing. */
export async function getMyHeldNoteIds(supabase: Client, noteIds: readonly string[]): Promise<Set<string>> {
  if (noteIds.length === 0) return new Set();
  const { data, error } = await supabase.rpc("wset_my_held_notes", { p_note_ids: [...noteIds] });
  if (error) {
    console.error("[shared-notes] held-notes read failed", error.code, error.message);
    return new Set();
  }
  return new Set(data ?? []);
}
