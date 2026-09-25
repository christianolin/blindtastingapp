// Types shared by the friend server actions and the components that call
// them. They live here, not in src/app/friends/actions.ts: that file is a
// "use server" module, which may export only async functions (CLAUDE.md —
// Next's server-actions loader treats every export of such a module as an
// action).

export type FriendResult = { error: string } | { ok: true };

/** What send_friend_request did: asked; found the other person had already
 *  asked, so you are friends now; or you were friends already. */
export type SendOutcome = "requested" | "accepted" | "friends";

export type SendFriendResult = { error: string } | { ok: true; outcome: SendOutcome };
