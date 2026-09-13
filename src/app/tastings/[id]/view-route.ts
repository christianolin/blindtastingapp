// The running page's router (spec §6.3 item 3; §3 and §4 "the page split";
// refinement 3; ledger B2 "one running page", B5). Pure: type imports only,
// so vitest loads it without the `@/` alias.
//
// page.tsx calls this once per render, with only the tasting row and the
// viewer's own participant row, and renders whichever view it names.

import type {
  ParticipantStatus,
  RevealMode,
  TastingStatus,
} from "@/lib/supabase/database.types";

export type TastingView =
  | "open-board"
  | "finished"
  | "invitation"
  | "guest-lobby"
  | "lobby"
  | "running";

export function routeTastingView(input: {
  revealMode: RevealMode;
  status: TastingStatus;
  viewerStatus: ParticipantStatus | null;
  isHost: boolean;
}): TastingView {
  const { revealMode, status, viewerStatus, isHost } = input;
  const hasStarted = status !== "DRAFT";

  // OPEN (group Taste & Rate) has nothing hidden and no shell (spec §6.3
  // item 3, "OPEN tastings: no shell") — it gets its own board the instant
  // it has started, ahead of every other check, INVITED included (a
  // signed-out preview is a separate surface; a signed-in INVITED viewer of
  // a running OPEN board sees the same board everyone else does).
  if (revealMode === "OPEN" && hasStarted) return "open-board";

  if (status === "CLOSED") return "finished";

  if (viewerStatus === "INVITED" && !isHost) return "invitation";

  if (status === "DRAFT") {
    return viewerStatus === "JOINED" && !isHost ? "guest-lobby" : "lobby";
  }

  // IN_PROGRESS, or the legacy TastingStatus "OPEN" (a tasting's lifecycle
  // status, unrelated to reveal_mode "OPEN" handled above).
  return "running";
}
