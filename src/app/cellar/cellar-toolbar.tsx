"use client";

import { List, LayoutGrid, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  clearFilter,
  EMPTY_FILTERS,
  filterChips,
  filterCount,
  GROUP_LABELS,
  GROUP_ORDER,
  SORT_LABELS,
  SORT_ORDER,
  type FilterOptions,
} from "@/lib/cellar/cellar-rows";
import type { CellarView, FilterState, GroupKey, SortKey } from "@/lib/cellar/types";
import { cn } from "@/lib/utils";

export type ToolbarProps = {
  search: string;
  onSearch: (q: string) => void;
  placeholder: string;
  group: GroupKey;
  onGroup: (g: GroupKey) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  filters: FilterState;
  onFilters: (f: FilterState) => void;
  options: FilterOptions;
  view: CellarView;
  onView: (v: CellarView) => void;
};

// The four filter fields the popover renders, in the order the mock draws
// them; "vintage" is the one that only shows on phones (the dimension strip
// drops its own vintage tile there instead — spec §5.1).
const FILTER_FIELDS: readonly {
  key: keyof FilterState;
  label: string;
  phoneOnly?: boolean;
}[] = [
  { key: "country", label: "Country" },
  { key: "region", label: "Region" },
  { key: "colour", label: "Colour" },
  { key: "grape", label: "Grape" },
  { key: "vintage", label: "Vintage", phoneOnly: true },
];

const selectCls =
  "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground md:pointer-fine:h-9";

export function CellarToolbar({
  search,
  onSearch,
  placeholder,
  group,
  onGroup,
  sort,
  onSort,
  filters,
  onFilters,
  options,
  view,
  onView,
}: ToolbarProps): React.JSX.Element {
  const activeFilterCount = filterCount(filters);
  const chips = filterChips(filters);

  function setFilterValue(key: keyof FilterState, raw: string) {
    const value = raw === "" ? null : raw;
    // Changing country clears the now-mismatched region, the same cascade
    // rule the answer-key and guess forms use elsewhere in the app.
    if (key === "country") {
      onFilters({ ...filters, country: value, region: null });
      return;
    }
    onFilters({ ...filters, [key]: value } as FilterState);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search bottles"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="min-h-11 w-full pl-9 md:pointer-fine:min-h-9"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground max-md:hidden">Group</span>
          <select
            aria-label="Group"
            value={group}
            onChange={(e) => onGroup(e.target.value as GroupKey)}
            className={selectCls}
          >
            {GROUP_ORDER.map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground max-md:hidden">Sort</span>
          <select
            aria-label="Sort"
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
            className={selectCls}
          >
            {SORT_ORDER.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="min-h-11 gap-1.5 md:pointer-fine:min-h-9"
              />
            }
          >
            Filter
            {activeFilterCount > 0 ? (
              <Badge aria-label={`${activeFilterCount} filters set`}>
                {activeFilterCount}
              </Badge>
            ) : null}
          </PopoverTrigger>
          <PopoverContent className="flex w-72 flex-col gap-3 p-3">
            {FILTER_FIELDS.map((field) => (
              <label
                key={field.key}
                className={cn(
                  "flex flex-col gap-1 text-sm",
                  field.phoneOnly ? "md:hidden" : null,
                )}
              >
                <span className="text-muted-foreground">{field.label}</span>
                <select
                  value={filters[field.key] ?? ""}
                  onChange={(e) => setFilterValue(field.key, e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Any</option>
                  {options[field.key].map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} · {opt.count}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => onView("list")}
            className={cn(
              "inline-flex size-11 items-center justify-center transition-colors md:pointer-fine:size-9",
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <List className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Bottle view"
            aria-pressed={view === "grid"}
            onClick={() => onView("grid")}
            className={cn(
              "inline-flex size-11 items-center justify-center border-l border-border transition-colors md:pointer-fine:size-9",
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <LayoutGrid className="size-4" />
          </button>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-label={`Remove ${chip.label}`}
              onClick={() => onFilters(clearFilter(filters, chip.key))}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm md:pointer-fine:min-h-8"
            >
              {chip.label}
              <X aria-hidden className="size-3.5" />
            </button>
          ))}
          {/* (plan copy) */}
          <Button variant="ghost" size="sm" onClick={() => onFilters(EMPTY_FILTERS)}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
