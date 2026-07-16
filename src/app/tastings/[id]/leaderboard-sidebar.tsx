import { Crown, Medal, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const RANK_STYLES = [
  { badge: "bg-gradient-to-br from-[#e8c777] to-[#b78e42] text-[#3a2508] ring-2 ring-[#f0d896]", bar: "from-[#c3a25b] to-[#e8c777]" },
  { badge: "bg-gradient-to-br from-[#e4e7ec] to-[#a9b0bb] text-[#33383f] ring-2 ring-[#f1f3f5]", bar: "from-[#9aa1ab] to-[#d4d8dd]" },
  { badge: "bg-gradient-to-br from-[#d99a66] to-[#9c5f34] text-[#2e1a0c] ring-2 ring-[#e8b98c]", bar: "from-[#9c5f34] to-[#d99a66]" },
];

export async function LeaderboardSidebar({ tastingId }: { tastingId: string }) {
  const [leaderboard, supabase] = await Promise.all([
    getTastingLeaderboard(tastingId),
    createClient(),
  ]);
  const [{ data: { user } }, { data: tasting }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("tastings").select("reveal_mode").eq("id", tastingId).maybeSingle(),
  ]);
  const isSemiBlind = tasting?.reveal_mode === "SEMI_BLIND";

  const maxTotal = Math.max(1, ...leaderboard.map((r) => r.total));

  return (
    <Card className="sticky top-8 overflow-hidden py-0">
      <CardHeader className="border-b border-border/70 bg-gradient-to-br from-primary/8 to-transparent py-4">
        <CardTitle className="flex items-center gap-2 font-heading text-xl">
          <Trophy className="size-5 text-gold-deep" strokeWidth={2} />
          Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {leaderboard.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No participants yet.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {leaderboard.map((row, i) => {
              const isMe = row.userId === user?.id;
              const rankStyle = RANK_STYLES[i];
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
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        rankStyle ? rankStyle.badge : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i === 0 ? <Crown className="size-3.5" strokeWidth={2.5} /> : i < 3 ? <Medal className="size-3.5" strokeWidth={2.5} /> : i + 1}
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
                      {isMe ? <span className="ml-1 text-xs font-normal text-primary">(you)</span> : null}
                    </span>
                    <span className="shrink-0 font-heading text-lg font-semibold tabular-nums">
                      {isSemiBlind ? `${row.total}/${row.totalWines}` : row.total}
                    </span>
                  </div>
                  <div className="ml-9.5 mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {isSemiBlind ? "Matched" : "Wine"} {row.winesScored}/{row.totalWines}
                    </span>
                    {row.lastRoundPoints !== null ? (
                      <span
                        className={cn(
                          "font-medium",
                          row.lastRoundPoints > 0 ? "text-[#3f5b42]" : "text-muted-foreground",
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
                  <div className="mt-1.5 ml-9.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "animate-fill-bar h-full rounded-full bg-gradient-to-r",
                        rankStyle ? rankStyle.bar : "from-gold-deep to-gold",
                      )}
                      style={{ width: `${pct}%`, animationDelay: `${i * 60 + 150}ms` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
