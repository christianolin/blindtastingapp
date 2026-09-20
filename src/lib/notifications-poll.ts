// How often the header bell asks the server for pending invitations.
//
// Measured on production (2026-09-20): the bell was the single biggest piece
// of background chatter in the app — one server action every 15s on EVERY
// page, each costing 575-2,773ms of server time, for a viewer who almost
// always has nothing pending. An invitation is rare and never urgent to the
// second, so the fast cadence is only worth paying while something is
// actually pending (where the count should drop promptly once it is handled
// elsewhere). With nothing pending the bell falls back to a slow tick; the
// component also re-checks on focus and on becoming visible, which is what
// makes the slow cadence safe — returning to the tab is the moment a new
// invitation actually needs to appear.
//
// Same shape as the active-tasting banner's pollIntervalMs, deliberately: one
// rule, one test, no cadence logic inline in a component.

/** With something pending: keep it responsive. */
export const INVITE_POLL_ACTIVE_MS = 15_000;
/** With nothing pending: a quiet heartbeat, backed by the focus re-check. */
export const INVITE_POLL_IDLE_MS = 90_000;

export function invitePollIntervalMs(pending: readonly unknown[]): number {
  return pending.length > 0 ? INVITE_POLL_ACTIVE_MS : INVITE_POLL_IDLE_MS;
}
