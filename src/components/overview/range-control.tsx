"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import type { NumbersRange } from "@/lib/your-numbers-types";

const ITEMS: { key: NumbersRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "year", label: "This year" },
  { key: "90d", label: "90 days" },
];

/**
 * The Your numbers range switch. The chosen range lives in the URL
 * (`?range=year|90d`, all-time is the bare path) so it survives reload; the
 * server component refetches the three sections on navigation.
 */
export function RangeControl({ value }: { value: NumbersRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const select = (key: NumbersRange) => {
    if (key === value) return;
    startTransition(() => {
      router.replace(key === "all" ? pathname : `${pathname}?range=${key}`);
    });
  };

  return (
    <div
      role="tablist"
      aria-label="Range"
      className={cn(
        "flex gap-[3px] rounded-[9px] bg-muted p-[3px] transition-opacity",
        pending && "opacity-70",
      )}
    >
      {ITEMS.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => select(it.key)}
            className={cn(
              "rounded-[7px] px-3.5 py-[7px] text-[12.5px] transition-colors max-md:min-h-11 max-md:flex-1 max-md:py-2",
              active
                ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(42,33,30,.08)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
