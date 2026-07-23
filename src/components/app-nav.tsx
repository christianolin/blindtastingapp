"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string; match: string[] };

// The app's top-level navigation: flat links, no dropdowns and no nav pages
// (owner UX brief 2026-07-23). Each destination uses in-page tabs for its
// subsections. Profile isn't a link here — it's the avatar chip in AppHeader.
export const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Tastings", match: ["/dashboard", "/tastings"] },
  {
    href: "/knowledge/map",
    label: "Knowledge",
    match: ["/knowledge", "/rules"],
  },
  { href: "/people", label: "Friends", match: ["/people", "/friends"] },
];

// A link is active when the current path is one of its section roots or sits
// underneath one — so /tastings/[id] keeps "Tastings" lit and /rules keeps
// "Knowledge" lit.
export function isNavActive(pathname: string, link: NavLink) {
  return link.match.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

// Desktop flat nav (the header hides it below md; MobileNav renders the same
// links in the drawer). These routes are dynamic (auth cookies), so Next skips
// prefetch and a click waits on the server; we optimistically light the
// clicked link immediately and drop the override once the path settles (a
// render-phase reset, not an effect, to stay clear of set-state-in-effect).
export function AppNav() {
  const pathname = usePathname();
  const [clicked, setClicked] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setClicked(null);
  }

  return (
    <>
      {NAV_LINKS.map((link) => {
        const active = clicked
          ? clicked === link.href
          : isNavActive(pathname, link);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setClicked(link.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "transition-colors hover:text-foreground",
              active ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
