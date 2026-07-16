import { LeaderboardSidebar } from "./leaderboard-sidebar";
import { MobileLeaderboard } from "@/components/mobile-leaderboard";

// Wraps every /tastings/[id]/* page (lobby, wine entry, play, results) with a
// persistent leaderboard on the right (lg+). Below lg it would eat space
// better spent on the guess form, so on a phone the same leaderboard is
// reachable through a floating button + drawer instead (MobileLeaderboard).
export default async function TastingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex w-full flex-1 items-start">
      <div className="min-w-0 flex-1">{children}</div>
      <aside className="hidden w-72 shrink-0 p-8 pl-0 lg:block">
        <LeaderboardSidebar tastingId={id} />
      </aside>
      <MobileLeaderboard>
        <LeaderboardSidebar tastingId={id} />
      </MobileLeaderboard>
    </div>
  );
}
