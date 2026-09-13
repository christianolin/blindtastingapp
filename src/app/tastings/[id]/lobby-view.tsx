import { Suspense } from "react";
import { getCurrentUser, getTastingRow, getViewerParticipant, getWineRows } from "@/lib/tasting-request-cache";
import { semiBlindAddRefusal } from "@/lib/flight-glass-rules";
import { TastingScanRegistrar } from "@/components/tasting-scan-registrar";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { SheetFromQuery } from "./sheet-from-query";
import { TastingPageHeader } from "./tasting-page-header";
import { WinesCard, getEditableWineIds } from "./wines-card";
import { ParticipantsCard } from "./participants-card";
import { StartBar } from "./start-bar";
import { SemiBlindList } from "./semi-blind-list";
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

  // SB1's list (BT-S1): SEMI_BLIND only, and only the host's own name is
  // worth a query here — most lobbies are BLIND, so this stays behind the
  // gate rather than joining `profiles` on every render.
  const isSemiBlind = tasting.reveal_mode === "SEMI_BLIND";
  let semiBlindHostName = "";
  if (isSemiBlind) {
    const supabase = await createClient();
    const { data: hostProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", tasting.host_id)
      .maybeSingle();
    semiBlindHostName = hostProfile?.display_name || "The host";
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8",
        // Clears StartBar's phone-pinned bottom bar (LOBBY-26) so the last
        // row of the Wines card stays visible above it.
        isHost ? "pb-28 lg:pb-8" : null,
      )}
    >
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          <WinesCard tastingId={tastingId} />
          {isSemiBlind ? (
            <SemiBlindList
              tastingId={tastingId}
              hostName={semiBlindHostName}
              started={tasting.status !== "DRAFT"}
              viewerIsHost={isHost}
            />
          ) : null}
          {/* Start (spec §3.3 item 7): below the Wines card on laptops, a
              bottom-pinned bar on phones — self-fetches and gates on host,
              so it mounts unconditionally. */}
          <StartBar tastingId={tastingId} />
        </div>
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <ParticipantsCard tastingId={tastingId} />
        </aside>
      </div>
    </div>
  );
}
