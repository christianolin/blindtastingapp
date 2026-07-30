"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_LINKS, isNavActive, type NavLink } from "./nav-links";

// Desktop flat nav (the header hides it below md; MobileNav renders the same
// links in the drawer). These routes are dynamic (auth cookies), so Next skips
// prefetch and a click waits on the server; we optimistically light the clicked
// link immediately and drop the override once the path settles (a render-phase
// reset, not an effect, to stay clear of set-state-in-effect).
export function AppNav({ links = NAV_LINKS }: { links?: NavLink[] }) {
  const pathname = usePathname();
  const [clicked, setClicked] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setClicked(null);
  }

  return (
    <>
      {links.map((link) => {
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
