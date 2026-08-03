"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CellarBottlesTable, type BottleRow } from "./cellar-bottles-table";
import { MyNotesList, type NoteRow } from "./my-notes-list";
import { HistoryList, type HistoryRow } from "./history-list";
import { StatsPanel } from "./stats-panel";
import type { CellarStats } from "./stats";

const TABS = [
  { slug: "bottles", label: "Bottles" },
  { slug: "notes", label: "My notes" },
  { slug: "history", label: "History" },
  { slug: "stats", label: "Stats" },
];

// Cellar sections as instant client tabs (no navigation), styled like the
// Library tab bar. All four datasets are loaded once by the page, so switching
// is instant.
export function CellarTabs({
  bottles,
  notes,
  history,
  stats,
  currency,
  initialTab,
}: {
  bottles: BottleRow[];
  notes: NoteRow[];
  history: HistoryRow[];
  stats: CellarStats | null;
  currency: string;
  initialTab?: string;
}) {
  const valid = TABS.some((t) => t.slug === initialTab)
    ? (initialTab as string)
    : "bottles";
  const [active, setActive] = useState(valid);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (active === "bottles") params.delete("tab");
    else params.set("tab", active);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }, [active]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => setActive(t.slug)}
            aria-current={t.slug === active ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              t.slug === active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "bottles" ? (
        <CellarBottlesTable rows={bottles} currency={currency} />
      ) : active === "notes" ? (
        <MyNotesList notes={notes} />
      ) : active === "history" ? (
        <HistoryList rows={history} />
      ) : stats ? (
        <StatsPanel stats={stats} />
      ) : null}
    </div>
  );
}
