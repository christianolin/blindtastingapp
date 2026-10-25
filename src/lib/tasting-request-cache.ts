import { cache } from "react";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REFERENCE_OPTIONS_TAG } from "@/lib/reference-options-tag";
import {
  decodeStartResult,
  startResultCookieName,
  type StartResult,
} from "@/lib/start-result-cookie";

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
// the first caller's promise. Nothing is cached ACROSS requests — with one
// exception, getReferenceOptions below (egress cuts, 2026-10-13).
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

/**
 * The signed-in viewer's own participant row for this tasting (BT-D2), or
 * null when they have none (not a participant, or not signed in). Derived
 * from getParticipantRows rather than its own query, so every view that
 * needs "am I the host / am I JOINED / INVITED / DECLINED" for the router
 * and its own render costs nothing extra beyond the one cached read.
 */
export const getViewerParticipant = cache(async (tastingId: string) => {
  const user = await getCurrentUser();
  if (!user) return null;
  const rows = await getParticipantRows(tastingId);
  return rows.find((p) => p.user_id === user.id) ?? null;
});

/**
 * Every participant's display name (display_name, else email, else
 * "Someone"), keyed by participant id — one profiles read shared by the Wines
 * card and the Start bar's "exactly N each" warning in the same render.
 */
export const getParticipantNames = cache(async (tastingId: string) => {
  const participantRows = await getParticipantRows(tastingId);
  const userIds = participantRows.map((p) => p.user_id);
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return new Map(
    participantRows.map((p) => [
      p.id,
      profileById.get(p.user_id)?.display_name ?? profileById.get(p.user_id)?.email ?? "Someone",
    ]),
  );
});

// `added_by_host` is M6's pinned adder flag, so every view can follow
// is_wine_adder's rule for "whose glass is this" (BT-V3 A-18).
export const getWineRows = cache(async (tastingId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wines")
    .select(
      "id, position, is_revealed, reveal_step, contributor_participant_id, added_by_host, tasting_id",
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

// The three reference lists, shared ACROSS requests and users for at most
// REFERENCE_OPTIONS_TTL_S. Why: every AutoRefresh/RevealSync refresh of a
// running tasting (every 6 s per participant, plus every guess and reveal)
// re-read all ~400 regions, every grape and every country — tens of KB of
// Supabase egress per refresh, per person, the same bytes every time. They are
// readable by every signed-in user (`"reference read" … using (true)`), so one
// copy serves everyone; it is read with the service-role client because a
// cross-request cache cannot carry a user's cookies (every caller of
// getReferenceOptions is a signed-in page). Inline creates (createCountry/
// createRegion/createGrape, wine-identity/server/write.ts's grape insert)
// expire it via invalidateReferenceOptions, so a variety somebody just added
// shows up at once; any other writer is picked up within the TTL. A failed or
// empty read throws, so it is never cached, and getReferenceOptions falls back
// to the old per-request read as the viewer.
export const REFERENCE_OPTIONS_TTL_S = 60;

async function readReferenceOptions(
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>,
): Promise<ReferenceOptions> {
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
}

const readSharedReferenceOptions = unstable_cache(
  async (): Promise<ReferenceOptions> => {
    const options = await readReferenceOptions(createAdminClient());
    if (!options.countries.length || !options.regions.length || !options.grapes.length) {
      throw new Error("reference options read came back empty");
    }
    return options;
  },
  ["tasting-reference-options-v1"],
  { revalidate: REFERENCE_OPTIONS_TTL_S, tags: [REFERENCE_OPTIONS_TAG] },
);

/**
 * The lookup tables the guess form and the host's wine identities both need,
 * fetched once per request instead of twice, from the shared cache above.
 *
 * type_designations is deliberately NOT here: the guess form wants only active
 * ones in sort_order, while the host's identity lookup needs every row so an
 * answer referencing a retired designation still resolves to a name. Caching
 * one query for both would quietly change one of them.
 */
export const getReferenceOptions = cache(async (): Promise<ReferenceOptions> => {
  try {
    return await readSharedReferenceOptions();
  } catch (error) {
    console.error("Reference options: the shared read failed; reading as the viewer", error);
    return readReferenceOptions(await createClient());
  }
});

/**
 * Start's result for the host, from the one-shot cookie `startTasting` leaves
 * when the host started from the lobby (BT-V3 A-08). The codec and its rules
 * live in the pure start-result-cookie.ts; null when there is no cookie or it
 * is malformed.
 */
export const getStartResult = cache(
  async (tastingId: string): Promise<StartResult | null> =>
    decodeStartResult((await cookies()).get(startResultCookieName(tastingId))?.value),
);
