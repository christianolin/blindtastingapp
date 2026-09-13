// The invitation's data (BT-G1, spec §4.3 item 1; ledger B3, B12): everything
// the phone invitation (S5), the laptop Overview card (S5b) and the signed-in
// `/j/[code]` invitation (BT-G3, which already has its own reduced fetch)
// need about one tasting from the viewer's side. Read under the viewer's own
// RLS — a DECLINED guest or a stranger simply gets null back, the same as a
// tasting that does not exist.
//
// A server-only module, not a "use server" one (Next dispatches every Server
// Action as its own POST entry point, so a loader only the server needs stays
// unexported from that surface — see taste-archive-data.ts for the fuller
// rationale). Never reads the answer-key table: rule 1 never applies here (an
// invitation only ever states the flight's size and the scoring rules, never
// a wine).
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getTastingPlace } from "@/app/tastings/new/place";
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { getCurrentUser, getTastingRow } from "@/lib/tasting-request-cache";
import { flowWord, type FlowWord } from "@/lib/tasting-eyebrow";
import type {
  ParticipantStatus,
  RevealMode,
  TastingStatus,
  TimingMode,
} from "@/lib/supabase/database.types";

export type InvitationData = {
  tastingId: string;
  name: string;
  imageUrl: string | null;
  scheduledAt: string | null;
  place: string | null;
  revealMode: RevealMode;
  timingMode: TimingMode;
  flow: FlowWord;
  /** Wines so far — never a planned count; the host may pour more. */
  glassCount: number;
  host: {
    id: string;
    name: string;
    avatarUrl: string | null;
    hostedCount: number;
    /** null with no scored guesses yet (getBulkProfileSummaries). */
    averagePoints: number | null;
  };
  /** JOINED display names, the viewer and the host excluded, earliest joined first. */
  joinedNames: string[];
  invitedCount: number;
  status: TastingStatus;
  viewerStatus: ParticipantStatus | "HOST";
};

const NO_NAME = "Someone";

/**
 * One tasting's invitation data as the signed-in viewer may see it: null when
 * there is no such tasting, nobody is signed in, or the viewer is neither the
 * host nor a participant of it (so there is no `viewerStatus` to report).
 */
export async function getInvitation(tastingId: string): Promise<InvitationData | null> {
  const supabase = await createClient();
  const [user, tasting] = await Promise.all([getCurrentUser(), getTastingRow(tastingId)]);
  if (!user || !tasting) return null;

  const isHost = tasting.host_id === user.id;

  const { data: participantRows } = await supabase
    .from("tasting_participants")
    .select("user_id, status, joined_at")
    .eq("tasting_id", tastingId)
    .order("joined_at", { ascending: true, nullsFirst: false });
  const participants = participantRows ?? [];

  const viewerRow = participants.find((p) => p.user_id === user.id) ?? null;
  if (!isHost && !viewerRow) return null;
  const viewerStatus: ParticipantStatus | "HOST" = isHost ? "HOST" : viewerRow!.status;

  const invitedCount = participants.filter((p) => p.status === "INVITED").length;
  // Already earliest-joined-first from the query's own order.
  const joinedUserIds = participants
    .filter((p) => p.status === "JOINED" && p.user_id !== user.id && p.user_id !== tasting.host_id)
    .map((p) => p.user_id);

  const profileIds = [...new Set([tasting.host_id, ...joinedUserIds])];
  const { data: profileRows } =
    profileIds.length > 0
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", profileIds)
      : { data: [] as { id: string; display_name: string; avatar_url: string | null }[] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const [{ count: glassCount }, { data: hostedCount }, hostSummaries, place] = await Promise.all([
    supabase.from("wines").select("id", { count: "exact", head: true }).eq("tasting_id", tastingId),
    supabase.rpc("host_tastings_count", { p_user_id: tasting.host_id }),
    getBulkProfileSummaries([tasting.host_id]),
    getTastingPlace(supabase, tastingId),
  ]);
  const hostSummary = hostSummaries.get(tasting.host_id);
  const hostProfile = profileById.get(tasting.host_id);

  return {
    tastingId,
    name: tasting.name,
    imageUrl: tasting.image_url,
    scheduledAt: tasting.scheduled_at,
    place,
    revealMode: tasting.reveal_mode,
    timingMode: tasting.timing_mode,
    flow: flowWord({
      revealMode: tasting.reveal_mode,
      timingMode: tasting.timing_mode,
      sequentialGuessing: tasting.sequential_guessing,
    }),
    glassCount: glassCount ?? 0,
    host: {
      id: tasting.host_id,
      name: hostProfile?.display_name ?? NO_NAME,
      avatarUrl: hostProfile?.avatar_url ?? null,
      hostedCount: hostedCount ?? 0,
      averagePoints: hostSummary && hostSummary.winesGuessed > 0 ? hostSummary.averagePoints : null,
    },
    joinedNames: joinedUserIds.map((id) => profileById.get(id)?.display_name ?? NO_NAME),
    invitedCount,
    status: tasting.status,
    viewerStatus,
  };
}

/**
 * The viewer's soonest pending invitation, for the Overview card (S5b): the
 * same order the "Invited" band already lists in (taste-archive-math's
 * `invitationsOf` — soonest schedule first, unscheduled ones after it, newest
 * created first among those) — re-applied here to a lighter two-column read
 * so this card costs nothing beyond it. An invitation to a CLOSED tasting is
 * never offered (Q6: invitations close at CLOSED, not at Start). Null when
 * signed out or with nothing pending.
 */
export async function getOverviewInvitation(): Promise<InvitationData | null> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: invitedRows } = await supabase
    .from("tasting_participants")
    .select("tasting_id")
    .eq("user_id", user.id)
    .eq("status", "INVITED");
  const tastingIds = (invitedRows ?? []).map((p) => p.tasting_id);
  if (tastingIds.length === 0) return null;

  const { data: tastingRows } = await supabase
    .from("tastings")
    .select("id, scheduled_at, created_at, status")
    .in("id", tastingIds)
    .neq("status", "CLOSED");
  if (!tastingRows || tastingRows.length === 0) return null;

  const [soonest] = [...tastingRows].sort((a, b) => {
    if (a.scheduled_at && b.scheduled_at) return a.scheduled_at.localeCompare(b.scheduled_at);
    if (a.scheduled_at) return -1;
    if (b.scheduled_at) return 1;
    return b.created_at.localeCompare(a.created_at);
  });

  return getInvitation(soonest.id);
}
