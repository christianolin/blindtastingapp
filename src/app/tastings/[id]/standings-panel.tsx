import Link from "next/link";
import { Crown, Scale, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// Rank marks in the app's own palette — bordeaux for the winner, a gilt tint
// for the rest of the podium. (This used to be metallic gold/silver/bronze
// gradients, which put a cool grey-blue on an otherwise warm parchment page.)
function rankBadgeClass(rank: number, completed: boolean) {
  if (!completed || rank > 2) return "bg-muted text-muted-foreground";
  if (rank === 0) return "bg-primary text-primary-foreground";
  return "bg-gold/20 text-gold-deep ring-1 ring-gold/40";
}

/**
 * Participants + leaderboard merged into one right-rail panel. Joined
 * competitors are ranked by score (scores only count revealed wines, so it's
 * spoiler-safe mid-tasting); everyone else in the room — the organizer of an
 * organizer-selects tasting, plus invited/declined people — is listed beneath
 * so no one disappears. Self-contained (fetches its own data).
 */
export async function StandingsPanel({ tastingId }: { tastingId: string }) {
  const supabase = await createClient();
  const [leaderboard, { data: userData }, { data: tasting }] =
    await Promise.all([
      getTastingLeaderboard(tastingId),
      supabase.auth.getUser(),
      supabase
        .from("tastings")
        .select("reveal_mode, wine_source, host_id, status")
        .eq("id", tastingId)
        .maybeSingle(),
    ]);
  const user = userData.user;

  const { data: participants } = await supabase
    .from("tasting_participants")
    .select("id, user_id, status")
    .eq("tasting_id", tastingId);
  const userIds = (participants ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const statusByParticipantId = new Map(
    (participants ?? []).map((p) => [p.id, p.status]),
  );

  const isSemiBlind = tasting?.reveal_mode === "SEMI_BLIND";
  const hostProvides = tasting?.wine_source === "HOST_PROVIDES";
  const hostId = tasting?.host_id ?? null;

  // Competitors: joined guessers, ranked by score. In organizer-selects
  // tastings the organizer sets the answers and doesn't guess, so they aren't
  // a competitor.
  const competitors = leaderboard.filter((r) => {
    if (statusByParticipantId.get(r.participantId) !== "JOINED") return false;
    if (hostProvides && r.userId === hostId) return false;
    return true;
  });
  const maxTotal = Math.max(1, ...competitors.map((r) => r.total));

  // Crown/medals only once the tasting is finished — during play the ranking
  // is provisional, so rank numbers carry it (no premature winner).
  const completed = tasting?.status === "CLOSED";

  // The organizer of an organizer-selects tasting sets the answers and doesn't
  // compete — a lighter HOST utility line, not a ranked row.
  const organizer =
    hostProvides && hostId
      ? ((participants ?? []).find((p) => p.user_id === hostId) ?? null)
      : null;
  // Not yet in: invited or declined people (joined competitors are ranked).
  const waiting = (participants ?? []).filter((p) => p.status !== "JOINED");

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="border-b border-border/70 py-3.5">
        <CardTitle className="flex items-center gap-2 font-heading text-lg font-medium">
          <Trophy className="size-4 text-gold-deep" strokeWidth={2} />
          Standings
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {competitors.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No competitors yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-1">
            {competitors.map((row, i) => {
              const isMe = row.userId === user?.id;
              const pct = Math.max(4, Math.round((row.total / maxTotal) * 100));
              return (
                <li
                  key={row.participantId}
                  className={cn(
                    "animate-rise-in rounded-lg px-2 py-2 transition-colors",
                    isMe && "bg-primary/8 ring-1 ring-primary/20",
                  )}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full font-heading text-sm font-semibold lining-nums",
                        rankBadgeClass(i, completed),
                      )}
                    >
                      {completed && i === 0 ? (
                        <Crown className="size-3.5" strokeWidth={2.5} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    {row.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.avatarUrl}
                        alt=""
                        className="size-7 shrink-0 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                        {row.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {row.name}
                      {isMe ? (
                        <span className="ml-1 text-xs font-normal text-primary">
                          (you)
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-heading text-lg font-semibold lining-nums tabular-nums">
                      {isSemiBlind
                        ? `${row.total}/${row.totalWines}`
                        : row.total}
                      <span className="ml-0.5 font-sans text-[0.65rem] font-medium text-muted-foreground">
                        pts
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 ml-9.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {isSemiBlind ? "Matched" : "Wine"} {row.winesScored}/
                      {row.totalWines}
                    </span>
                    {row.lastRoundPoints !== null ? (
                      <span
                        className={cn(
                          "font-medium",
                          row.lastRoundPoints > 0
                            ? "text-[#3f5b42]"
                            : "text-muted-foreground",
                        )}
                      >
                        {isSemiBlind
                          ? row.lastRoundPoints > 0
                            ? "✓ last round"
                            : "✗ last round"
                          : `${row.lastRoundPoints > 0 ? "+" : ""}${row.lastRoundPoints} last round`}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 ml-9.5 h-1 overflow-hidden rounded-full bg-border/60">
                    <div
                      className={cn(
                        "animate-fill-bar h-full rounded-full",
                        isMe ? "bg-primary" : "bg-gold-deep/70",
                      )}
                      style={{
                        width: `${pct}%`,
                        animationDelay: `${i * 60 + 150}ms`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {organizer || waiting.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3">
            {organizer
              ? (() => {
                  const profile = profileByUserId.get(organizer.user_id);
                  const name = profile?.display_name ?? "Someone";
                  return (
                    <div>
                      <p className="mb-1 px-2 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                        Host
                      </p>
                      <div className="flex items-center gap-2.5 px-2">
                        {profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profile.avatar_url}
                            alt=""
                            className="size-7 shrink-0 rounded-full object-cover ring-1 ring-border"
                          />
                        ) : (
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                            {name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {name}
                        </span>
                      </div>
                    </div>
                  );
                })()
              : null}
            {waiting.length > 0 ? (
              <div>
                <p className="mb-1 px-2 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  Not yet joined
                </p>
                <ul className="flex flex-col gap-0.5">
                  {waiting.map((p) => {
                    const profile = profileByUserId.get(p.user_id);
                    const name = profile?.display_name ?? "Someone";
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-2.5 px-2 py-1"
                      >
                        {profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profile.avatar_url}
                            alt=""
                            className="size-6 shrink-0 rounded-full object-cover opacity-70 ring-1 ring-border"
                          />
                        ) : (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium opacity-70">
                            {name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                          {name}
                        </span>
                        <Badge variant="outline">
                          {p.status === "DECLINED" ? "Declined" : "Invited"}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Scale className="size-3.5" />
            {isSemiBlind ? "Semi-blind scoring" : "Danish Championship scoring"}
          </span>
          <Link
            href="/rules"
            className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            Learn more
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
