import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCurrentUser, getTastingRow, getViewerParticipant, getWineRows } from "@/lib/tasting-request-cache";
import { getTastingResult } from "@/lib/tasting-result";
import { TastingPageHeader } from "./tasting-page-header";
import { WinesCard } from "./wines-card";
import { PlayExperience } from "./play/play-experience";
import { StandingsPanel } from "./standings-panel";
import { ClosedSurface } from "./result/closed-surface";
import { ResultView } from "./result/result-view";
import { respondToInvite } from "./actions";
import { viewerCanSeeStandings } from "./view-route";

// The CLOSED board (BT-D2, moved without change from page.tsx): the same
// content a running tasting shows, since CLOSED was never distinguished
// from IN_PROGRESS before this split — `derivedStatus` already reads
// "Completed". An INVITED viewer gets T4's "This tasting has finished" card
// instead (entry-6) — CLOSED routes here ahead of the INVITED check in
// view-route.ts, so this view (not invitation-view.tsx) is the one that
// must show it.
//
// BT-R2: the board below is wrapped in `ClosedSurface`, which shows the dark
// result (S12) until the viewer dismisses it, then this same board again —
// BT-R3 is the one that swaps that "then" for the parchment record. The
// header renders outside `ClosedSurface` on purpose (spec §6.3 item 3): its
// "unknown" (SSR) render shows nothing, so a static header above it is what
// a reload shows first, never a flash of the dark result.
export async function FinishedView({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const [user, tasting] = await Promise.all([getCurrentUser(), getTastingRow(tastingId)]);
  if (!user || !tasting) return null;

  const viewer = await getViewerParticipant(tastingId);
  const myStatus = viewer?.status ?? null;

  if (myStatus === "INVITED") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
        <TastingPageHeader tastingId={tastingId} />
        <Card className="border-border bg-muted/40">
          <CardHeader>
            <CardTitle className="text-base">You&apos;re invited</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              This tasting has finished. Decline to clear it from your
              invites.
            </p>
            <div className="flex gap-2">
              <form action={respondToInvite}>
                <input type="hidden" name="tasting_id" value={tastingId} />
                <input type="hidden" name="response" value="decline" />
                <Button type="submit" variant="outline">
                  Decline
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const wines = await getWineRows(tastingId);
  const wineCount = wines.length;
  const canGuess = myStatus === "JOINED" && wineCount > 0;
  // The same gate as running-view.tsx (upstream 1c6e738): the host or any
  // participant row, whatever its status — viewerCanSeeStandings says why.
  const isHost = tasting.host_id === user.id;
  const canSeeStandings = viewerCanSeeStandings({ isHost, viewer });
  // Every glass is revealed by definition of CLOSED (reveal_wine refuses a
  // CLOSED tasting), so the navigator never shows an "active" chip here.
  const activeChipId: string | null = null;
  const result = await getTastingResult(tastingId);

  const board = (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      {wineCount > 0 ? (
        <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent px-4 py-3.5">
          <div className="flex flex-wrap gap-2">
            {wines.map((w, i) => {
              const active = w.id === activeChipId;
              return (
                <a
                  key={w.id}
                  href={`#wine-${w.id}`}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : w.is_revealed
                        ? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
                        : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      active
                        ? "bg-primary-foreground"
                        : w.is_revealed
                          ? "bg-primary"
                          : "bg-muted-foreground/40",
                    )}
                  />
                  Wine {i + 1}
                </a>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: "100%" }} />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              Completed
            </span>
          </div>
        </div>
      ) : null}

      {/* Results + standings, or one column when the viewer is not entitled
          to the standings and the rail would be dead space. */}
      <div
        className={
          canSeeStandings
            ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]"
            : "grid gap-6"
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          <WinesCard tastingId={tastingId} />
          {canGuess ? (
            <PlayExperience tastingId={tastingId} embedded />
          ) : (
            <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              Guessing is for people taking part in this tasting.
            </p>
          )}
        </div>
        {/* An outsider must not get a board at all: get_tasting_leaderboard
            withholds their scores by returning NO ROWS, but the panel builds
            its rows from tasting_participants and profiles, which are
            readable under RLS — so it would show a live-looking board with
            everyone on zero, and the players had points. Withholding the
            numbers is not the same as withholding the board. */}
        {canSeeStandings ? (
          <aside id="standings" className="scroll-mt-24 lg:sticky lg:top-8 lg:self-start">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted/40" />}>
              <StandingsPanel tastingId={tastingId} />
            </Suspense>
          </aside>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 pt-6 sm:px-8 sm:pt-8">
        <TastingPageHeader tastingId={tastingId} />
      </div>
      <ClosedSurface
        tastingId={tastingId}
        result={result ? <ResultView data={result} /> : null}
      >
        {board}
      </ClosedSurface>
    </div>
  );
}
