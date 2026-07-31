"use client";

import { useRouter } from "next/navigation";
import { ArrowDownUp } from "lucide-react";

const OPTIONS = [
  { value: "active", label: "Recently active" },
  { value: "name", label: "Name (A\u2013Z)" },
  { value: "joined", label: "Recently joined" },
];

// Client sort control for the People directory. Navigates to /community with
// the chosen sort (preserving the current search), resetting to page 1. Uses
// only useRouter so no Suspense boundary is needed.
export function PeopleSort({ value, q }: { value: string; q?: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <ArrowDownUp className="size-3.5" />
      <span className="hidden sm:inline">Sort by</span>
      <select
        value={value}
        onChange={(e) => {
          const sp = new URLSearchParams();
          if (q) sp.set("q", q);
          sp.set("sort", e.target.value);
          router.push(`/community?${sp.toString()}`);
        }}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
