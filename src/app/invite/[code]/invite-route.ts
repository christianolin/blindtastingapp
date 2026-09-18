// /invite/[code] — the landing page's pure router (spec §5; D19). Pure: type
// imports only, so vitest loads it without the `@/` alias.
//
// page.tsx calls this once per render, with the preview RPC's state and the
// viewer's own auth facts, and renders whichever view it names.

import type { InviteState } from "@/lib/invites/copy";

export type InviteView =
  | "unknown"
  | "expired"
  | "exhausted"
  | "own-link"
  | "join"
  | "add-friend";

export function inviteView(input: {
  state: InviteState;
  signedIn: boolean;
  isInviter: boolean;
}): InviteView {
  const { state, signedIn, isInviter } = input;
  // The state wins over everything else — an expired or used-up link reads
  // the same whether or not the viewer happens to be its own inviter.
  if (state !== "ok") return state;
  if (!signedIn) return "join"; // isInviter is meaningless signed out (D19)
  return isInviter ? "own-link" : "add-friend";
}
