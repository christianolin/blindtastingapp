import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Per-request deduplication for the tasting page's shared reads.
//
// The tasting route renders three server components that each fetched the same
// things independently: page.tsx, the PlayExperience embedded inside it, and
// StandingsPanel. Between them the signed-in user, the tasting row, the
// participant list and the four reference tables were each fetched two or
// three times per render — and every reveal re-renders the whole route, so a
// host advancing one category paid for all of it. Measured against production:
// one pass of that shared set is ~420ms of sequential round trips, and it ran
// roughly twice.
//
// React's cache() memoises per request, so the second and third callers get
// the first caller's promise. Nothing is cached ACROSS requests, which is
// deliberate: countries, regions, appellations, producers and grapes can all
// be created inline from the wine forms (see wine-identity-fields.tsx), and a
// cross-request cache would hide a variety somebody just added. Cutting the
// duplication is most of the win and carries none of that risk.
//
// Each getter selects a superset of the columns its callers need, so one
// cached row can serve all of them.

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getTastingRow = cache(async (tastingId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tastings")
    .select("*")
    .eq("id", tastingId)
    .maybeSingle();
  return data;
});

export const getParticipantRows = cache(async (tastingId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasting_participants")
    .select("id, user_id, status, tasting_id")
    .eq("tasting_id", tastingId);
  return data ?? [];
});

export const getWineRows = cache(async (tastingId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wines")
    .select(
      "id, position, is_revealed, reveal_step, contributor_participant_id, tasting_id",
    )
    .eq("tasting_id", tastingId)
    .order("position");
  return data ?? [];
});

export type ReferenceOptions = {
  countries: { id: string; name: string }[];
  regions: { id: string; name: string; country_id: string }[];
  grapes: { id: string; name: string }[];
};

/**
 * The lookup tables the guess form and the host's wine identities both need,
 * fetched once per request instead of twice.
 *
 * type_designations is deliberately NOT here: the guess form wants only active
 * ones in sort_order, while the host's identity lookup needs every row so an
 * answer referencing a retired designation still resolves to a name. Caching
 * one query for both would quietly change one of them.
 */
export const getReferenceOptions = cache(async (): Promise<ReferenceOptions> => {
  const supabase = await createClient();
  const [countries, regions, grapes] = await Promise.all([
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("regions").select("id, name, country_id").order("name"),
    supabase.from("grapes").select("id, name").order("name"),
  ]);
  return {
    countries: countries.data ?? [],
    regions: regions.data ?? [],
    grapes: grapes.data ?? [],
  };
});
