import { LeaderboardSidebar } from "./leaderboard-sidebar";

// Wraps every /tastings/[id]/* page (lobby, wine entry, play, results) with a
// persistent leaderboard on the right. Hidden below lg — on a phone it would
// just eat space better spent on the guess form, so mobile only sees the
// leaderboard via the results page.
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
    </div>
  );
}
