import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveShell } from "@/components/live-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { cn } from "@/lib/utils";
import { semiBlindAddRefusal } from "@/lib/flight-glass-rules";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getParticipantRows,
  getTastingRow,
  getViewerParticipant,
  getWineRows,
} from "@/lib/tasting-request-cache";
import { makeGlassLabeler } from "@/lib/wine-label";
import { TastingScanRegistrar } from "@/components/tasting-scan-registrar";
import { SheetFromQuery } from "./sheet-from-query";
import { TastingPageHeader } from "./tasting-page-header";
import { WinesCard, getEditableWineIds } from "./wines-card";
import { AddToFlightButton, type FlightDestination } from "./tasting-add-wine-button";
import { PlayExperience } from "./play/play-experience";
import { OpenBoard } from "./open-board";
import { StandingsPanel } from "./standings-panel";
import { respondToInvite } from "./actions";
import { viewerCanSeeStandings } from "./view-route";

// The IN_PROGRESS board (BT-D2, moved without change from page.tsx). Serves
// two of view-route.ts's TastingView values: "running" (blind / semi-blind —
// wrapped in LiveShell, B5) and "open-board" (reveal_mode OPEN — no shell,
// spec §6.3 item 3), because both were already one shared conditional in the
// pre-split page.tsx and an OPEN tasting can be reached by an INVITED viewer
// too (the OPEN-started routing check runs before the INVITED check).
export async function RunningView({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const [user, tasting, wines] = await Promise.all([
    getCurrentUser(),
    getTastingRow(tastingId),
    getWineRows(tastingId),
  ]);
  if (!user || !tasting) return null;

  const isHost = tasting.host_id === user.id;
  const isOpen = tasting.reveal_mode === "OPEN";
  const viewer = await getViewerParticipant(tastingId);
  const myStatus = viewer?.status ?? null;
  // The host or any participant row, whatever its status (upstream 1c6e738) —
  // viewerCanSeeStandings says why this is deliberately not JOINED only.
  const canSeeStandings = viewerCanSeeStandings({ isHost, viewer });
  const wineCount = wines.length;
  const revealedCount = wines.filter((w) => w.is_revealed).length;
  const progressPct = wineCount > 0 ? Math.round((revealedCount / wineCount) * 100) : 0;

  // "Glass N" by list order, or the contributor label in bring-your-own
  // (MISSED-01, B10) — the navigator chips below use it, same as every other
  // guest-facing surface on the running page. Skipped for OPEN (its own
  // OpenBoard never uses it) and an empty flight, so this never runs a
  // participant/profile query it does not need.
  let glassLabel: (w: (typeof wines)[number]) => string = () => "";
  if (!isOpen && wineCount > 0) {
    const participantRows = await getParticipantRows(tastingId);
    const userIds = participantRows.map((p) => p.user_id);
    const supabase = await createClient();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds.length > 0 ? userIds : [""]);
    const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const nameByParticipantId = new Map(
      participantRows.map((p) => [
        p.id,
        profileByUserId.get(p.user_id)?.display_name ??
          profileByUserId.get(p.user_id)?.email ??
          "Someone",
      ]),
    );
    glassLabel = makeGlassLabeler(wines, tasting.wine_source, nameByParticipantId);
  }
  const derivedStatus =
    tasting.status === "CLOSED"
      ? "Completed"
      : wineCount > 0 && revealedCount === wineCount
        ? "All revealed"
        : "In progress";
  // The wine currently in play (first not-yet-revealed) — its chip gets the
  // filled "active" treatment in the navigator.
  const activeChipId = wines.find((w) => !w.is_revealed)?.id ?? null;

  // is_wine_adder's rule: the host for a glass with no contributor,
  // otherwise the contributor's own bottle — whether the Wines card (below)
  // shows at all while running, and so whether the floating Add button
  // above it is still needed (WinesCard carries its own once shown).
  const isAdder = (w: { contributor_participant_id: string | null }) =>
    w.contributor_participant_id
      ? w.contributor_participant_id === viewer?.id
      : isHost;
  const myWineIds = wines.filter(isAdder).map((w) => w.id);
  const showWinesWhileRunning = isHost || myWineIds.length > 0;

  const canAddWine =
    tasting.status !== "CLOSED" &&
    (tasting.wine_source === "HOST_PROVIDES" ? isHost : myStatus === "JOINED") &&
    !semiBlindAddRefusal({
      revealMode: tasting.reveal_mode,
      tastingStatus: tasting.status,
    });
  const flightDestination: FlightDestination = {
    kind: "flight",
    tastingId,
    tastingName: tasting.name,
    revealMode: tasting.reveal_mode,
    wineSource: tasting.wine_source,
    position: wineCount + 1,
  };
  const addWineButton = canAddWine ? (
    <AddToFlightButton destination={flightDestination} />
  ) : null;
  const editableWineIds = await getEditableWineIds(tastingId);

  // reveal_mode OPEN's own started-board routes here too (the OPEN-started
  // check runs before the INVITED check in view-route.ts), so an INVITED
  // viewer needs the same Accept / Decline card the other views give them.
  const inviteCard =
    myStatus === "INVITED" ? (
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">You&apos;re invited</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            The host invited you to this tasting. Accept to take part.
          </p>
          <div className="flex gap-2">
            <form action={respondToInvite}>
              <input type="hidden" name="tasting_id" value={tastingId} />
              <input type="hidden" name="response" value="accept" />
              <Button type="submit">Accept</Button>
            </form>
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
    ) : null;

  const canGuess = myStatus === "JOINED" && wineCount > 0;

  // The host's way into the dark console while a blind / semi-blind tasting
  // runs: reveal glass by glass and watch who has locked in.
  const hostConsoleCard =
    isHost && !isOpen && tasting.status !== "CLOSED" ? (
      <Link
        href={`/tastings/${tastingId}/host`}
        className="flex items-center gap-4 rounded-[13px] bg-primary p-[14px_18px] text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-primary-hover"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="font-heading text-[21px] font-semibold leading-[1.05]">
            Host console
          </span>
          <span className="text-[12.5px] text-primary-foreground/78">
            Reveal glass by glass, watch who has locked in.
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </Link>
    ) : null;

  const content = isOpen ? (
    <div className="flex flex-col gap-4">
      {addWineButton ? <div className="flex justify-end">{addWineButton}</div> : null}
      <OpenBoard tastingId={tastingId} userId={user.id} canRate={myStatus === "JOINED"} />
    </div>
  ) : (
    <>
      {/* Compact progress + wine navigator — replaces the old left rail. */}
      {wineCount > 0 ? (
        <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent px-4 py-3.5">
          <div className="flex flex-wrap gap-2">
            {wines.map((w) => {
              const active = derivedStatus !== "Completed" && w.id === activeChipId;
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
                  {glassLabel(w)}
                </a>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {derivedStatus === "Completed" ? "Completed" : `${revealedCount} of ${wineCount} glasses`}
            </span>
          </div>
        </div>
      ) : null}

      {/* The Wines card (below) carries its own Add button; a
          bring-your-own contributor with no glass here yet keeps this one. */}
      {addWineButton && !showWinesWhileRunning ? (
        <div className="flex justify-end">{addWineButton}</div>
      ) : null}

      {/* Results (~70%) + standings (~30%), or one column when the viewer
          is not entitled to the standings and the rail would be dead space. */}
      <div
        className={
          canSeeStandings
            ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]"
            : "grid gap-6"
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          {hostConsoleCard}
          <WinesCard tastingId={tastingId} />
          {canGuess ? (
            <PlayExperience tastingId={tastingId} embedded />
          ) : (
            <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              Guessing is for people taking part in this tasting.
            </p>
          )}
        </div>
        {/* An outsider must not get a board at all. get_tasting_leaderboard
            withholds the scores from them, but it does so by returning NO
            ROWS, and the panel builds its rows from tasting_participants and
            profiles, which are readable under RLS. Rendering it anyway
            produced a scoreboard that looked live and said everyone was on
            zero — indistinguishable from a tasting where nobody has scored,
            and wrong: the players had points. Withholding the numbers is not
            the same as withholding the board. */}
        {canSeeStandings ? (
          <aside id="standings" className="scroll-mt-24 lg:sticky lg:top-8 lg:self-start">
            {/* Streamed: the standings do their own leaderboard query, and
                gating the revealed category behind it made every reveal feel
                slow for host and participants alike. */}
            <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted/40" />}>
              <StandingsPanel tastingId={tastingId} />
            </Suspense>
          </aside>
        ) : null}
      </div>
    </>
  );

  return (
    <LiveShell active={!isOpen}>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
        <AutoRefresh />
        {/* Registered whenever the viewer may add — adding mid-tasting is
            normal, so the header camera keeps targeting this flight. */}
        {canAddWine ? (
          <TastingScanRegistrar
            tastingId={tastingId}
            tastingName={tasting.name}
            revealMode={tasting.reveal_mode}
            wineSource={tasting.wine_source}
            position={wineCount + 1}
            timingMode={tasting.timing_mode}
            status={tasting.status}
          />
        ) : null}
        {/* Where the legacy add and edit routes land: ?addWine=byhand and
            ?editWine=<wineId> open the sheet once (spec §C.6). */}
        <Suspense fallback={null}>
          <SheetFromQuery
            destination={flightDestination}
            canAddWine={canAddWine}
            editableWineIds={editableWineIds}
          />
        </Suspense>
        <TastingPageHeader tastingId={tastingId} />
        {inviteCard}
        {content}
      </div>
    </LiveShell>
  );
}
