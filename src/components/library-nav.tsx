"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Overarching Library nav shown on every reading section so you can always move
// between them (and back). Designations carries its own instant sub-tabs below
// this bar. (Top-level switches are still route navigations for now; folding the
// whole Library into one instant-tab shell is a follow-up.)
const LIBRARY_TABS: { href: string; label: string; root: string }[] = [
  { href: "/knowledge/designations", label: "Designations", root: "/knowledge/designations" },
  { href: "/knowledge/grapes", label: "Grapes", root: "/knowledge/grapes" },
  { href: "/knowledge/archetypes", label: "Typical wines", root: "/knowledge/archetypes" },
  { href: "/rules", label: "Rules", root: "/rules" },
];

export function LibraryNav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2">
      {LIBRARY_TABS.map((t) => {
        const active = pathname === t.root || pathname.startsWith(`${t.root}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
