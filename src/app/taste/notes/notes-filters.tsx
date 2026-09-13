"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { makeT } from "@/lib/wset/i18n";
import { NOTES_LANG, NOTE_FILTERS, type NoteFilter } from "./notes-search";

const t = makeT(NOTES_LANG);

const LABEL: Record<NoteFilter, string> = {
  all: t("filter_all"),
  complete: t("filter_complete"),
  unfinished: t("filter_unfinished"),
  from_tastings: t("filter_from_tastings"),
};

/**
 * The page-level search under the title (T7): wine, grape, aroma or a phrase
 * you wrote. Controlled, so a router.refresh after editing a note keeps what
 * was typed. The placeholder is drawn over the field because it differs by
 * width (the long line on desktop, the short one on phones), which a native
 * placeholder cannot do; the input carries its own label. 16px text on phones
 * keeps iOS from zooming in on focus.
 */
export function NotesSearchField({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="flex items-center gap-[9px] rounded-[10px] border border-border bg-card pl-[13px] transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="relative min-w-0 flex-1">
        {query === "" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-base whitespace-nowrap text-muted-foreground md:text-[13.5px]"
          >
            <span className="truncate max-md:hidden">{t("search_notes_placeholder")}</span>
            <span className="truncate md:hidden">{t("search_notes_placeholder_short")}</span>
          </span>
        ) : null}
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label={t("search_notes_label")}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="relative h-11 w-full min-w-0 bg-transparent text-base text-foreground outline-none md:h-[42px] md:text-[13.5px] [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
      {query !== "" ? (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          aria-label={t("clear_search")}
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:text-foreground md:size-[42px]"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : (
        <span className="w-[13px] shrink-0" aria-hidden />
      )}
    </div>
  );
}

/**
 * All · Complete · Unfinished · From tastings, each with its count over the
 * notes the search matches. One chip is active at a time, but the sets
 * overlap (a complete note written at a tasting is under three chips). On
 * phones the row scrolls sideways edge to edge and an invisible ::after pad
 * stretches each 30px chip to a 46px tap target inside the scroller's padding.
 */
export function NotesFilterChips({
  active,
  counts,
  onSelect,
}: {
  active: NoteFilter;
  counts: Record<NoteFilter, number>;
  onSelect: (filter: NoteFilter) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        role="group"
        aria-label={t("notes_filters_label")}
        className="no-scrollbar -mx-[14px] -my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-[14px] py-2 md:mx-0 md:my-0 md:flex-wrap md:gap-2 md:overflow-visible md:px-0 md:py-0"
      >
        {NOTE_FILTERS.map((filter) => {
          const isActive = filter === active;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(filter)}
              className={cn(
                "relative flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold whitespace-nowrap transition-colors max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2 max-md:after:content-[''] md:h-[33px] md:px-[14px] md:text-[12.5px]",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-gold",
              )}
            >
              {LABEL[filter]}
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  isActive ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {counts[filter]}
              </span>
            </button>
          );
        })}
      </div>
      <span className="shrink-0 text-[12px] text-muted-foreground max-md:hidden">
        {t("newest_first")}
      </span>
    </div>
  );
}
