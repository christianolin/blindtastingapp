"use client";

import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type TabKey = "invited" | "hosting" | "attending" | "history";

const TAB_KEYS: TabKey[] = ["invited", "hosting", "attending", "history"];

/**
 * Client tab switcher for the dashboard's tasting buckets. The panels are
 * server-rendered card lists passed in as nodes; this only owns which one is
 * visible.
 *
 * The active tab is URL-addressable (`/dashboard?tab=history`), matching the
 * Knowledge section tabs: a refresh or shared link lands on the same tab and
 * browser back/forward move between tabs. Active is derived from the URL via
 * `useSearchParams`; clicking pushes a new history entry with
 * `window.history.pushState`, which the Next router keeps in sync with
 * `useSearchParams` without a server round-trip, so switching stays instant.
 * Defaults to "Invited" when there are pending invites (so they're seen
 * first), otherwise "Hosting".
 */
export function TastingsTabs({
  counts,
  invited,
  hosting,
  attending,
  history,
}: {
  counts: Record<TabKey, number>;
  invited: React.ReactNode;
  hosting: React.ReactNode;
  attending: React.ReactNode;
  history: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const fallback: TabKey = counts.invited > 0 ? "invited" : "hosting";
  const urlTab = searchParams.get("tab");
  const active: TabKey = TAB_KEYS.includes(urlTab as TabKey)
    ? (urlTab as TabKey)
    : fallback;

  const select = (key: TabKey) => {
    // Keep the default tab as a clean `/dashboard` URL; others carry `?tab=`.
    const url = key === fallback ? "/dashboard" : `/dashboard?tab=${key}`;
    window.history.pushState(null, "", url);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "invited", label: "Invited" },
    { key: "hosting", label: "Hosting" },
    { key: "attending", label: "Attending" },
    { key: "history", label: "History" },
  ];

  const panels: Record<TabKey, React.ReactNode> = {
    invited,
    hosting,
    attending,
    history,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => select(t.key)}
            aria-current={active === t.key ? "page" : undefined}
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
