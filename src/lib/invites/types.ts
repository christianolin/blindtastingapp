// Types shared by the invite server actions and the inviter's dialog. They
// live here, not in `src/app/invite/actions.ts`, because that file is a
// `"use server"` module: Next's server-actions loader re-exports every
// export of such a module as an action, and a type-only re-export there
// (`export type { SendResult }`) became a runtime `SendResult is not defined`
// the moment the page's actions bundle was evaluated.
export type { SendResult } from "@/lib/email/sender";

export type CreatedInvite = { code: string; url: string; expiresAt: string; maxUses: number };
