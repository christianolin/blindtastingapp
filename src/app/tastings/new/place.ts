// A tasting's private place (spec §13.3 items 2–3; ledger B12; owner default Q2).
// The place lives in `tasting_places` (M2), never on `tastings`: a tasting row
// goes public once one of its wines is revealed, and a place can be a home
// address. RLS lets the host and JOINED and INVITED participants read it, and
// only the host write it.
//
// Every place read and write goes through the two helpers below. They take the
// caller's Supabase client, so a read runs under the viewer's RLS (null for
// anyone who may not see the place) and a write under the host policies.
// Otherwise pure: type-only imports and no server-only, so vitest loads it and a
// client form may import the row copy.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** The most characters a place keeps (M2: `char_length(place) between 1 and 200`). */
export const PLACE_MAX = 200;
export const PLACE_TOO_LONG = "Keep the place under 200 characters.";
export const PLACE_LABEL = "Where?";
export const PLACE_PLACEHOLDER = "a place or an address";

/** Trimmed, every run of whitespace one space; empty → `{ place: null }` (clear
 *  it); more than `PLACE_MAX` characters → the refusal. Characters are counted as
 *  code points, the way Postgres `char_length` counts them, so the database check
 *  never refuses what this accepts. */
export function normalisePlace(input: string): { place: string | null } | { error: string } {
  const place = input.replace(/\s+/g, " ").trim();
  if (place === "") return { place: null };
  if (Array.from(place).length > PLACE_MAX) return { error: PLACE_TOO_LONG };
  return { place };
}

/** Writes a tasting's place. The refusal comes back before any write; an empty
 *  place deletes the row; otherwise the normalised text is upserted on
 *  `tasting_id`. RLS refuses anyone but the host (a non-host's delete matches no
 *  row), so callers gate on the host as they already do for setup. */
export async function setTastingPlace(
  supabase: SupabaseClient<Database>,
  tastingId: string,
  input: string,
): Promise<{ ok: true } | { error: string }> {
  const normalised = normalisePlace(input);
  if ("error" in normalised) return normalised;
  const { error } =
    normalised.place === null
      ? await supabase.from("tasting_places").delete().eq("tasting_id", tastingId)
      : await supabase
          .from("tasting_places")
          .upsert({ tasting_id: tastingId, place: normalised.place }, { onConflict: "tasting_id" });
  if (error) return { error: error.message };
  return { ok: true };
}

/** A tasting's place as the viewer may see it: null when there is none, when RLS
 *  hides it (DECLINED, strangers, anyone reading a revealed tasting) or when the
 *  read fails — a missing place never breaks a page. */
export async function getTastingPlace(
  supabase: SupabaseClient<Database>,
  tastingId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tasting_places")
    .select("place")
    .eq("tasting_id", tastingId)
    .maybeSingle();
  if (error || !data) return null;
  return data.place;
}
