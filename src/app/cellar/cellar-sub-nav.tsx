// The three cellar pages share this row (CC-U1; spec §3 "the three cellar
// pages share a sub-nav row"). Server-safe: no hooks, no "use client" — it
// renders identically on every cellar/[id] page without becoming a client
// boundary.
import Link from "next/link";
import { cn } from "@/lib/utils";

const SECTIONS: readonly { key: "bottles" | "history" | "collection"; label: string; href: string }[] = [
  { key: "bottles", label: "Bottles", href: "/cellar" },
  { key: "history", label: "History", href: "/cellar/history" },
  { key: "collection", label: "The collection", href: "/cellar/collection" },
];

export function CellarSubNav({
  current,
}: {
  current: "bottles" | "history" | "collection";
}): React.JSX.Element {
  return (
    <nav aria-label="Cellar sections" className="flex flex-wrap gap-2">
      {SECTIONS.map((section) => {
        const active = section.key === current;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-[9px] border px-3 text-sm font-medium md:pointer-fine:min-h-9",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
