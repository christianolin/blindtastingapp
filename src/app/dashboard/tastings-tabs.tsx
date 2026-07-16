"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type TabKey = "invited" | "hosting" | "attending";

/**
 * Client tab switcher for the dashboard's three tasting buckets. The panels
 * themselves are server-rendered card lists passed in as nodes; this only
 * owns which one is visible. Defaults to "Invited" when there are pending
 * invites (so they're seen first), otherwise "Hosting".
 */
export function TastingsTabs({
  counts,
  invited,
  hosting,
  attending,
}: {
  counts: Record<TabKey, number>;
  invited: React.ReactNode;
  hosting: React.ReactNode;
  attending: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>(
    counts.invited > 0 ? "invited" : "hosting",
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: "invited", label: "Invited" },
    { key: "hosting", label: "Hosting" },
    { key: "attending", label: "Attending" },
  ];

  const panels: Record<TabKey, React.ReactNode> = {
    invited,
    hosting,
    attending,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {counts[t.key] > 0 ? (
              <span
                className={cn(
                  "flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs",
                  t.key === "invited" && active !== t.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted-foreground/15",
                )}
              >
                {counts[t.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div>{panels[active]}</div>
    </div>
  );
}
