import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";

export async function LeaderboardSidebar({ tastingId }: { tastingId: string }) {
  const leaderboard = await getTastingLeaderboard(tastingId);

  return (
    <Card className="sticky top-8">
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">No participants yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {leaderboard.map((row, i) => (
              <li
                key={row.participantId}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="shrink-0 font-medium">{row.total}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
