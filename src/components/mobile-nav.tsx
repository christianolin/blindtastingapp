"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions";

export type NavLink = { href: string; label: string };

/**
 * Hamburger + slide-in drawer for the app nav on phones (the desktop nav in
 * AppHeader is hidden below md). Dependency-free overlay + panel so it never
 * fights base-ui's Dialog positioning; closes on link tap, backdrop tap, or
 * the X. `notifications` is an optional slot the header drops the invite bell
 * into so pending invites are reachable on mobile too.
 */
export function MobileNav({
  userId,
  displayName,
  avatarUrl,
  links,
  notifications,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  links: NavLink[];
  notifications?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="flex items-center gap-1 md:hidden">
      {notifications}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu />
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Close menu"
            className="animate-in fade-in absolute inset-0 bg-black/40 duration-150"
            onClick={close}
          />
          <div className="animate-in slide-in-from-right absolute top-0 right-0 flex h-full w-64 flex-col gap-1 bg-background p-4 shadow-xl duration-200">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-heading text-lg font-semibold">Menu</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={close}
              >
                <X />
              </Button>
            </div>

            <Link
              href={`/u/${userId}`}
              onClick={close}
              className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-7 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate">{displayName}</span>
            </Link>

            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                className="rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                {l.label}
              </Link>
            ))}

            <form action={signOut} className="mt-2">
              <Button variant="outline" type="submit" className="w-full">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
