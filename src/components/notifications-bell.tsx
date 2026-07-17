"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPendingInvites, type InviteNotification } from "@/lib/notifications";

export type { InviteNotification };

const POLL_MS = 15000;

/**
 * Bell in the app header showing pending tasting invitations. Polls
 * getPendingInvites directly (not router.refresh()) every 15s while the tab
 * is visible, so a new invite shows up on its own instead of only after a
 * manual page reload — and without re-rendering the whole page the way a
 * full refresh would. The count badge is always rendered (fixed size) so it
 * never shifts layout; the dropdown lists each invite with a link into the
 * tasting lobby where you accept or decline.
 */
export function NotificationsBell({
  invites: initialInvites,
}: {
  invites: InviteNotification[];
}) {
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState(initialInvites);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      getPendingInvites()
        .then(setInvites)
        .catch(() => {
          // A transient failure just means the bell doesn't update this tick.
        });
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const count = invites.length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${count ? ` (${count} pending)` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative"
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
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-popover p-2 shadow-lg">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Invitations
            </p>
            {count === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No pending invitations.
              </p>
            ) : (
              <ul className="flex flex-col">
                {invites.map((inv) => (
                  <li key={inv.tastingId}>
                    <Link
                      href={`/tastings/${inv.tastingId}`}
                      onClick={() => setOpen(false)}
                      className="flex flex-col gap-0.5 rounded-lg px-2 py-2 hover:bg-muted"
                    >
                      <span className="text-sm font-medium">
                        {inv.tastingName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Invited by {inv.hostName} — tap to respond
                      </span>
                    </Link>
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
