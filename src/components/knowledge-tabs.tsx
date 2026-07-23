"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string }[] = [
  { href: "/knowledge/map", label: "Wine Map" },
  { href: "/knowledge/grapes", label: "Grapes" },
  { href: "/knowledge/type-designations", label: "Designations" },
  { href: "/rules", label: "Rules" },
];

// Section tabs for Knowledge. The flat top nav sends you into the section; you
// switch subsections here instead of navigating back out to an index page.
export function KnowledgeTabs() {
  const pathname = usePathname();
  return (
    <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
