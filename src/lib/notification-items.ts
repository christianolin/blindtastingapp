// The header bell's items and their pure list rules (friend-requests spec
// §3.6). A plain module on purpose: src/lib/notifications.ts is "use server"
// and may export only async functions, so the types the bell and AppHeader
// share live here. No imports: vitest loads it directly.

export type TastingInviteNotification = {
  kind: "tasting";
  tastingId: string;
  tastingName: string;
  hostName: string;
};

export type FriendRequestNotification = {
  kind: "friend";
  requesterId: string;
  requesterName: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type PendingNotification = TastingInviteNotification | FriendRequestNotification;

/** Tasting invitations first, in the order given; then friend requests,
 *  newest first (ties by requester id, so the order never flickers). */
export function mergeNotifications(
  tastings: readonly TastingInviteNotification[],
  friends: readonly FriendRequestNotification[],
): PendingNotification[] {
  const newestFirst = [...friends].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      (a.requesterId < b.requesterId ? -1 : a.requesterId > b.requesterId ? 1 : 0),
  );
  return [...tastings, ...newestFirst];
}

export function friendRequestLine(name: string): string {
  return `${name} wants to be friends`;
}

export function notificationKey(n: PendingNotification): string {
  return n.kind === "tasting" ? `tasting-${n.tastingId}` : `friend-${n.requesterId}`;
}

export function withoutFriendRequest(
  list: readonly PendingNotification[],
  requesterId: string,
): PendingNotification[] {
  return list.filter((n) => !(n.kind === "friend" && n.requesterId === requesterId));
}

/** How long a request answered in the bell stays hidden from poll results: a
 *  poll that left before the answer landed must not bring the row back. */
export const SETTLED_HIDE_MS = 60_000;

/** A poll's list minus the friend requests answered here in the last
 *  SETTLED_HIDE_MS (`settled` maps requester id → when it was answered). */
export function visibleNotifications(
  list: readonly PendingNotification[],
  settled: ReadonlyMap<string, number>,
  nowMs: number,
): PendingNotification[] {
  return list.filter((n) => {
    if (n.kind !== "friend") return true;
    const at = settled.get(n.requesterId);
    return at === undefined || nowMs - at >= SETTLED_HIDE_MS;
  });
}
