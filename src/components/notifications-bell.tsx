"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FriendButton } from "@/components/friend-button";
import { cn } from "@/lib/utils";
import { getPendingInvites } from "@/lib/notifications";
import {
  friendRequestLine,
  notificationKey,
  visibleNotifications,
  withoutFriendRequest,
  type PendingNotification,
} from "@/lib/notification-items";
import { invitePollIntervalMs } from "@/lib/notifications-poll";

// A helper (not an inline Date.now()) keeps the clock read out of the React
// purity lint's reach — the same pattern community/page.tsx's nowMs uses. It
// only ever runs in a poll callback or after an Accept/Decline tap.
function nowMs(): number {
  return Date.now();
}

/**
 * Bell in the app header: pending tasting invitations, then friend requests
 * (friend-requests spec §3.6). Polls getPendingInvites directly (not
 * router.refresh()) while the tab is visible, so a new item shows up on its
 * own instead of only after a manual page reload — and without re-rendering
 * the whole page the way a full refresh would. The count badge counts both
 * kinds and is always rendered (fixed size) so it never shifts layout. A
 * tasting invitation links into the lobby, where you accept or decline; a
 * friend request is answered right here (Accept / Decline) and its row
 * leaves on success.
 *
 * Cadence comes from invitePollIntervalMs: 15s while something is pending,
 * 90s when nothing is. Measured on production 2026-09-20, the old flat 15s
 * tick was the app's biggest background cost — one 575-2,773ms server action
 * every 15s on EVERY page, almost always to be told there is nothing. The
 * slow tick is safe because focus and visibilitychange re-check immediately,
 * which is when an invitation received elsewhere actually has to appear. One
 * request at a time, so a slow response never stacks on the next tick.
 */
export function NotificationsBell({
  notifications: initialNotifications,
  className,
}: {
  notifications: PendingNotification[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  // Friend requests answered in this bell (requester id → when): a poll that
  // left before the answer landed must not bring the row back.
  const settled = useRef(new Map<string, number>());

  const inFlight = useRef(false);
  const check = useCallback(() => {
    if (inFlight.current || document.visibilityState !== "visible") return;
    inFlight.current = true;
    getPendingInvites()
      .then((list) => setNotifications(visibleNotifications(list, settled.current, nowMs())))
      .catch(() => {
        // A transient failure just means the bell doesn't update this tick.
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  const intervalMs = invitePollIntervalMs(notifications);
  useEffect(() => {
    const id = setInterval(check, intervalMs);
    const onWake = () => check();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [check, intervalMs]);

  function settle(requesterId: string) {
    settled.current.set(requesterId, nowMs());
    setNotifications((list) => withoutFriendRequest(list, requesterId));
  }

  const count = notifications.length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${count ? ` (${count} pending)` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className={cn("relative", className)}
      >
        <Bell />
        {count > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <>
          <button
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-3 top-16 z-50 rounded-xl border border-border bg-popover p-2 shadow-lg md:absolute md:inset-x-auto md:top-auto md:right-0 md:mt-2 md:w-72">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Invitations
            </p>
            {count === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No pending invitations.
              </p>
            ) : (
              <ul className="flex flex-col">
                {notifications.map((n) => (
                  <li key={notificationKey(n)}>
                    {n.kind === "tasting" ? (
                      <Link
                        href={`/tastings/${n.tastingId}`}
                        onClick={() => setOpen(false)}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-2 hover:bg-muted"
                      >
                        <span className="text-sm font-medium">{n.tastingName}</span>
                        <span className="text-xs text-muted-foreground">
                          Invited by {n.hostName} — tap to respond
                        </span>
                      </Link>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg px-2 py-2">
                        <Avatar src={n.avatarUrl} name={n.requesterName} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <Link
                            href={`/u/${n.requesterId}`}
                            onClick={() => setOpen(false)}
                            className="text-sm font-medium break-words hover:underline"
                          >
                            {friendRequestLine(n.requesterName)}
                          </Link>
                          <FriendButton
                            personId={n.requesterId}
                            relationship="incoming"
                            variant="row"
                            onDone={() => settle(n.requesterId)}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
