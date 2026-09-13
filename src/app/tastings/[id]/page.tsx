import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getTastingRow, getViewerParticipant } from "@/lib/tasting-request-cache";
import { routeTastingView } from "./view-route";
import { LobbyView } from "./lobby-view";
import { InvitationView } from "./invitation-view";
import { GuestLobby } from "./guest-lobby";
import { RunningView } from "./running-view";
import { FinishedView } from "./finished-view";

// The tasting route's router (BT-D2, spec §6.3 item 3; refinement 3). Loads
// only the tasting row and the viewer's own participant row, then hands off
// to whichever view is routed — every view loads the rest of its own data
// through the shared per-request cache (src/lib/tasting-request-cache.ts).
export default async function TastingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const tasting = await getTastingRow(id);
  if (!tasting) {
    notFound();
  }

  const viewer = await getViewerParticipant(id);
  const view = routeTastingView({
    revealMode: tasting.reveal_mode,
    status: tasting.status,
    viewerStatus: viewer?.status ?? null,
    isHost: tasting.host_id === user.id,
  });

  switch (view) {
    case "open-board":
    case "running":
      return <RunningView tastingId={id} />;
    case "finished":
      return <FinishedView tastingId={id} />;
    case "invitation":
      return <InvitationView tastingId={id} />;
    case "guest-lobby":
      return <GuestLobby tastingId={id} />;
    case "lobby":
      return <LobbyView tastingId={id} />;
  }
}
