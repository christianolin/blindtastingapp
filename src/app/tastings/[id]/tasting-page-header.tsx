import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getParticipantRows,
  getTastingRow,
  getWineRows,
} from "@/lib/tasting-request-cache";
import type { UnrevealedGlass } from "@/lib/tasting-lifecycle-copy";
import { HostControlsMenu } from "./host-controls-menu";

// The thumbnail, name, description, badges, the /rules link and the host's
// settings cogwheel (BT-D2, moved without change from page.tsx). Every view
// renders this at its own top — it loads its own data through the shared
// per-request cache, so rendering it from five different views costs one
// round trip's worth of reads, not five.
export async function TastingPageHeader({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const supabase = await createClient();
  const [user, tasting, participantRows, wines] = await Promise.all([
    getCurrentUser(),
    getTastingRow(tastingId),
    getParticipantRows(tastingId),
    getWineRows(tastingId),
  ]);
  if (!user || !tasting) return null;

  const isHost = tasting.host_id === user.id;
  const hasStarted = tasting.status !== "DRAFT";
  const isOpen = tasting.reveal_mode === "OPEN";
  const wineCount = wines.length;
  const participantCount = participantRows.length;
  const revealedCount = wines.filter((w) => w.is_revealed).length;

  // Derived session state — "All revealed" and "Completed" are real phases,
  // not "In progress" sitting at 100% (owner: status must reflect actual
  // state).
  const derivedStatus =
    tasting.status === "CLOSED"
      ? "Completed"
      : tasting.status === "IN_PROGRESS"
        ? wineCount > 0 && revealedCount === wineCount
          ? "All revealed"
          : "In progress"
        : "Not started";

  // Glasses whose answers ending the tasting would leave hidden (reveal-4).
  // Numbered by list order, not the stored position, like every other glass
  // number in the app; a glass part-way through a step reveal is "half".
  const unrevealedGlasses: UnrevealedGlass[] = [];
  wines.forEach((w, i) => {
    if (!w.is_revealed) {
      unrevealedGlasses.push({
        glass: i + 1,
        state: w.reveal_step > 0 ? "half" : "hidden",
      });
    }
  });

  // Friends for the host's "invite more people" picker (only fetched for the
  // host, and only needed while the tasting is still in draft). OPEN
  // tastings have nothing to protect, so the host can invite after the
  // tasting has started too — not only while it's a draft.
  let friends: { id: string; display_name: string; email: string }[] = [];
  if (isHost && (!hasStarted || isOpen)) {
    const { data: friendRows } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);
    const friendIds = (friendRows ?? []).map((f) => f.friend_id);
    const { data: friendProfiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", friendIds.length > 0 ? friendIds : [""])
      .order("display_name");
    friends = friendProfiles ?? [];
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        {tasting.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tasting.image_url}
            alt=""
            className="size-16 shrink-0 rounded-xl border border-border object-cover sm:size-20"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {tasting.name}
          </h1>
          {tasting.description ? (
            <p className="mt-1.5 text-muted-foreground">
              {tasting.description}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Badge variant={hasStarted ? "default" : "outline"}>
              {derivedStatus}
            </Badge>
            <span className="text-muted-foreground">
              {wineCount} {wineCount === 1 ? "wine" : "wines"} ·{" "}
              {participantCount}{" "}
              {participantCount === 1 ? "participant" : "participants"}
              {tasting.scheduled_at ? (
                <>
                  {" · "}
                  <LocalDateTime iso={tasting.scheduled_at} />
                </>
              ) : null}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasting.timing_mode === "LIVE" ? "Live session" : "Self-paced"} ·{" "}
            {tasting.wine_source === "HOST_PROVIDES"
              ? "Host-selected wines"
              : "Everyone brings wines"}{" "}
            ·{" "}
            <Link
              href="/rules"
              className="text-primary transition-colors hover:text-primary/80"
            >
              {tasting.reveal_mode === "SEMI_BLIND"
                ? "Semi-blind scoring"
                : "Danish Championship scoring"}
            </Link>
          </p>
        </div>
      </div>
      {isHost ? (
        <div className="shrink-0">
          <HostControlsMenu
            tastingId={tastingId}
            status={tasting.status}
            scheduledAt={tasting.scheduled_at}
            friends={friends}
            sequentialGuessing={tasting.sequential_guessing}
            // Guided pacing is LIVE-only (create-1, play-1, reveal-2): a
            // self-paced tasting has no shared "current glass" to gate on.
            showSequentialToggle={
              tasting.reveal_mode === "BLIND" && tasting.timing_mode === "LIVE"
            }
            leaderboardReveal={tasting.leaderboard_reveal}
            // The standings setting only bites on a guided LIVE blind
            // tasting, where attributes are revealed one at a time
            // (create-8).
            showLeaderboardToggle={
              tasting.reveal_mode === "BLIND" &&
              tasting.timing_mode === "LIVE" &&
              tasting.sequential_guessing
            }
            invitesStayOpen={isOpen}
            unrevealedGlasses={unrevealedGlasses}
          />
        </div>
      ) : null}
    </div>
  );
}
