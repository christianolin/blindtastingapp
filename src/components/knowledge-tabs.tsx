"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string }[] = [
  { href: "/knowledge/map", label: "Wine Map" },
  { href: "/knowledge/grapes", label: "Grapes" },
  { href: "/knowledge/type-designations", label: "Designations" },
  { href: "/rules", label: "Rules" },
];

// A small spinner shown only while THIS tab's navigation is in flight. It has
// to live inside its own <Link> to read that link's transition status.
function TabSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="size-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50"
    />
  );
}

// Section tabs for Knowledge. These routes are dynamic (auth cookies), so Next
// skips prefetch and a click waits on the server; deriving "active" only from
// the settled pathname felt laggy. We optimistically light the clicked tab
// immediately and show an in-flight spinner, clearing the override in a
// render-phase reset once the path settles (not an effect).
export function KnowledgeTabs() {
  const pathname = usePathname();
  const settled =
    TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
      ?.href ?? null;
  const [clicked, setClicked] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setClicked(null);
  }
  const active = clicked ?? settled;

  return (
    <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          onClick={() => setClicked(t.href)}
          aria-current={active === t.href ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === t.href
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          <TabSpinner />
        </Link>
      ))}
    </div>
  );
}
