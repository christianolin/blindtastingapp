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
    <div className="flex flex-col gap-5">
      {/* Underlined tabs — deliberately distinct from the Knowledge section's
          pill/segmented control so the two navigation styles don't blur. */}
      <div className="flex gap-6 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => select(t.key)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-0.5 pb-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {counts[t.key] > 0 ? (
                <span
                  className={cn(
                    "flex min-w-5 items-center justify-center rounded-full px-1 text-[0.7rem] tabular-nums",
                    isActive
                      ? "bg-primary/12 text-primary"
                      : t.key === "invited"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts[t.key]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div>{panels[active]}</div>
    </div>
  );
}
