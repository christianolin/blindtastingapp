import { Suspense } from "react";
import { getCurrentUser, getTastingRow, getViewerParticipant, getWineRows } from "@/lib/tasting-request-cache";
import { semiBlindAddRefusal } from "@/lib/flight-glass-rules";
import { TastingScanRegistrar } from "@/components/tasting-scan-registrar";
import { SheetFromQuery } from "./sheet-from-query";
import { HostControls } from "./host-controls";
import { TastingPageHeader } from "./tasting-page-header";
import { WinesCard, getEditableWineIds } from "./wines-card";
import { ParticipantsCard } from "./participants-card";
import type { FlightDestination } from "./tasting-add-wine-button";

// The DRAFT lobby (BT-D2, moved without change from page.tsx): the host's
// view, and the read-only fallback for anyone else who reaches a DRAFT
// tasting without being a JOINED non-host (a DECLINED viewer, or a signed-in
// non-participant reading a public tasting) — the JOINED guest's own DRAFT
// layout is guest-lobby.tsx; the INVITED card is invitation-view.tsx.
export async function LobbyView({
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
  const viewer = await getViewerParticipant(tastingId);
  const myStatus = viewer?.status ?? null;
  const wineCount = wines.length;

  // Who may add (spec §C.5 A1; scan-7, sources-5, entry-2): nobody once the
  // tasting is CLOSED; otherwise the host of a host-provides tasting, or a
  // JOINED participant in bring-your-own; and never once a semi-blind
  // flight is fixed at Start (Q7) — it gates the registered header camera
  // and the legacy `?addWine=byhand` query.
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
  const editableWineIds = await getEditableWineIds(tastingId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      {/* Registered whenever the viewer may add: adding before Start is
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

      {/* Start sits at a slot the draft and running trees share, never
          inside one branch. startTasting revalidates this page, so the
          lobby re-renders into the running board in the same commit that
          delivers its { success, warning } (spec §C.7, amendment 2). */}
      {isHost ? (
        <HostControls
          tastingId={tastingId}
          status={tasting.status}
          // All three, so Start can decide where it lands (reveal-5): only
          // a LIVE blind host-provides host goes to the console.
          timingMode={tasting.timing_mode}
          revealMode={tasting.reveal_mode}
          wineSource={tasting.wine_source}
          surface="start"
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          <WinesCard tastingId={tastingId} />
        </div>
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <ParticipantsCard tastingId={tastingId} />
        </aside>
      </div>
    </div>
  );
}
